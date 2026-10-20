/**
 * Integração com o Asana (envio à Operação e comentários nos dois sentidos).
 * Só declarações (funções e constantes); o que roda ao abrir a página fica em app.js.
 */

/** Projetos do Asana em que a demanda pode entrar (os nomes reais vêm da função asanaProjetos). */
const ASANA_PROJETOS_PADRAO = [
  { gid: "1211582012771845", nome: "Projeto do Asana 1" },
  { gid: "1219543786224599", nome: "Projeto do Asana 2" },
];
const ASANA_PROJETO_ULTIMO_KEY = "demandas-asana-projeto";
let asanaProjetosCache = null;

/** Comentários apagados com o projeto aberto — não voltam quando chega a cópia da nuvem. */
const comentariosApagadosNoModal = new Set();

function asanaFuncao(nome) {
  if (typeof firebase === "undefined" || !firebase.functions) return null;
  return firebase.app().functions("us-central1").httpsCallable(nome);
}

function normalizeAsana(a) {
  if (!a || typeof a !== "object") return null;
  const taskId = String(a.taskId || "").trim();
  const url = String(a.url || "").trim();
  if (!taskId && !url) return null;
  return {
    taskId,
    url,
    projetoGid: String(a.projetoGid || "").trim(),
    projetoNome: String(a.projetoNome || "").trim(),
    createdAt: a.createdAt || "",
    createdBy: String(a.createdBy || "").trim(),
    instrucoes: String(a.instrucoes || "").trim(),
    ...(a.substituidaEm ? { substituidaEm: String(a.substituidaEm) } : {}),
    ...(a.excluidaNoAsanaEm ? { excluidaNoAsanaEm: String(a.excluidaNoAsanaEm) } : {}),
    ...(a.concluidaEm ? { concluidaEm: String(a.concluidaEm) } : {}),
    ...(a.secao ? { secao: String(a.secao) } : {}),
  };
}

/** Último aviso vindo do Asana (moveu para andamento, concluiu, excluiu); some do painel com "Ciente". */
const ASANA_AVISO_TIPOS = {
  andamento: { curta: "Em andamento no Asana", tom: "coluna", ico: "▶" },
  concluida: { curta: "Concluída no Asana", tom: "ok", ico: "✓" },
  excluida: { curta: "Excluída no Asana", tom: "bad", ico: "✕" },
};

function normalizeAsanaAviso(a) {
  if (!a || typeof a !== "object" || !ASANA_AVISO_TIPOS[a.tipo]) return null;
  return {
    tipo: a.tipo,
    texto: String(a.texto || "").trim(),
    taskId: String(a.taskId || ""),
    em: String(a.em || ""),
    chave: String(a.chave || ""),
    ...(a.cienteEm ? { cienteEm: String(a.cienteEm) } : {}),
  };
}

function avisoAsanaPendente(d) {
  const a = normalizeAsanaAviso(d?.asanaAviso);
  return a && !a.cienteEm ? a : null;
}

function marcarAvisoAsanaCiente(id) {
  if (!requireWriteAccess()) return;
  const idx = state.demandas.findIndex((x) => x.id === id);
  const aviso = idx >= 0 ? avisoAsanaPendente(state.demandas[idx]) : null;
  if (!aviso) return;
  const now = new Date().toISOString();
  beginOwnDemandaWrite(id);
  const dem = migrateDemanda({ ...state.demandas[idx], asanaAviso: { ...aviso, cienteEm: now }, updatedAt: now });
  state.demandas[idx] = dem;
  noteOwnDemandaWrite(id, now);
  saveState({ demanda: dem });
  renderBoard();
}

function demandaTemAsana(demId) {
  const d = demId ? state.demandas.find((x) => x.id === demId) : null;
  return !!String(d?.asanaTaskId || normalizeAsana(d?.asana)?.taskId || "").trim();
}

/** Caixa "Enviar ao Asana" do novo comentário: só aparece em projeto com tarefa no Asana. */
function syncComentarioAsanaBox() {
  const box = document.getElementById("demComentarioAsanaBox");
  if (!box) return;
  const id = (document.getElementById("demId")?.value || "").trim();
  box.hidden = !demandaTemAsana(id) || isReadOnlyUser();
}

/** Comentário escrito agora: marcado para o Asana? (só faz sentido com tarefa no Asana). */
function comentarioNovoParaAsana(demId) {
  if (!demandaTemAsana(demId)) return undefined;
  return document.getElementById("demComentarioAsana")?.checked !== false;
}

async function carregarProjetosAsana() {
  if (asanaProjetosCache) return asanaProjetosCache;
  const call = asanaFuncao("asanaProjetos");
  if (!call) return ASANA_PROJETOS_PADRAO;
  try {
    const res = await call({});
    const lista = Array.isArray(res?.data?.projetos) ? res.data.projetos : [];
    const ok = ASANA_PROJETOS_PADRAO.map((p) => ({ ...p, ...(lista.find((x) => x.gid === p.gid) || {}) }));
    asanaProjetosCache = ok;
    return ok;
  } catch (_) {
    return ASANA_PROJETOS_PADRAO;
  }
}

function renderAsanaProjetosOpcoes(lista) {
  const box = document.getElementById("asanaEnvioProjetosLista");
  if (!box) return;
  const marcado = box.querySelector("input:checked")?.value || lerUltimoProjetoAsana();
  box.innerHTML = lista
    .map(
      (p) =>
        `<label class="asana-projeto"><input type="radio" name="asanaEnvioProjeto" value="${escapeHtml(p.gid)}"${
          p.gid === marcado ? " checked" : ""
        } /><span>${escapeHtml(p.nome)}</span></label>`,
    )
    .join("");
}

function lerUltimoProjetoAsana() {
  try {
    return localStorage.getItem(ASANA_PROJETO_ULTIMO_KEY) || "";
  } catch (_) {
    return "";
  }
}

let asanaEnvioResolve = null;

function initAsanaEnvioDialog() {
  const dlg = document.getElementById("modalAsanaEnvio");
  const ta = document.getElementById("asanaEnvioTexto");
  const btnOk = document.getElementById("asanaEnvioOk");
  const btnCancel = document.getElementById("asanaEnvioCancel");
  const btnClose = document.getElementById("asanaEnvioClose");
  if (!dlg || !ta || !btnOk || !btnCancel) return;

  const finish = (value) => {
    if (!asanaEnvioResolve) return;
    const resolve = asanaEnvioResolve;
    asanaEnvioResolve = null;
    dlg.close();
    resolve(value);
  };

  btnOk.addEventListener("click", () => {
    const projetoGid = dlg.querySelector('input[name="asanaEnvioProjeto"]:checked')?.value || "";
    if (!projetoGid) {
      toast("Escolha em qual projeto do Asana a demanda vai entrar.");
      dlg.querySelector('input[name="asanaEnvioProjeto"]')?.focus();
      return;
    }
    const texto = ta.value.trim();
    if (!texto) {
      toast("Informe as instruções do que deverá ser feito.");
      ta.focus();
      return;
    }
    try {
      localStorage.setItem(ASANA_PROJETO_ULTIMO_KEY, projetoGid);
    } catch (_) {}
    finish({ instrucoes: texto, projetoGid });
  });
  btnCancel.addEventListener("click", () => finish(null));
  btnClose?.addEventListener("click", () => finish(null));
  dlg.addEventListener("cancel", (e) => {
    e.preventDefault();
    finish(null);
  });
  dlg.addEventListener("close", () => {
    if (asanaEnvioResolve) finish(null);
  });
}

/** Pergunta as instruções e o projeto do Asana. Resolve com { instrucoes, projetoGid } ou null. */
function promptAsanaEnvio(titulo, { novaOrdem = false } = {}) {
  const tituloEl = document.getElementById("asanaEnvioTitulo");
  const okEl = document.getElementById("asanaEnvioOk");
  if (tituloEl) tituloEl.textContent = novaOrdem ? "Nova ordem para a Operação" : "Enviar à Operação";
  if (okEl) okEl.textContent = novaOrdem ? "Abrir nova ordem" : "Criar no Asana";
  const dlg = document.getElementById("modalAsanaEnvio");
  const ta = document.getElementById("asanaEnvioTexto");
  const proj = document.getElementById("asanaEnvioProjeto");
  if (!dlg || !ta) return Promise.resolve(null);
  if (proj) {
    const t = String(titulo || "").trim();
    proj.textContent = t ? `Projeto: ${t}` : "";
    proj.hidden = !t;
  }
  ta.value = "";
  renderAsanaProjetosOpcoes(asanaProjetosCache || ASANA_PROJETOS_PADRAO);
  void carregarProjetosAsana().then((lista) => {
    if (dlg.open) renderAsanaProjetosOpcoes(lista);
  });
  return new Promise((resolve) => {
    asanaEnvioResolve = resolve;
    dlg.showModal();
    requestAnimationFrame(() => ta.focus());
  });
}

/** Aplica no estado local o que o servidor gravou (vínculo + comentário), sem regravar a demanda. */
function aplicarRespostaAsanaLocal(id, patch, comentario) {
  const idx = state.demandas.findIndex((x) => x.id === id);
  if (idx < 0) return;
  const dem = { ...state.demandas[idx], ...patch };
  if (!patch.asana) {
    delete dem.asana;
    delete dem.asanaTaskId;
  }
  const cmt = normalizeComentario(comentario);
  if (cmt && !normalizeComentarios(dem.comentarios).some((c) => c.id === cmt.id)) {
    dem.comentarios = [cmt, ...normalizeComentarios(dem.comentarios)];
    if (editingDemandaOpenId === id && !editingComentarios.some((c) => c.id === cmt.id)) {
      editingComentarios = [cmt, ...normalizeComentarios(editingComentarios)];
      renderComentariosList();
    }
  }
  state.demandas[idx] = migrateDemanda(dem);
  renderBoard();
}

async function enviarDemandaAsana(id, btn, envio, { novaOrdem = false } = {}) {
  if (!requireWriteAccess()) return;
  const texto = String(envio?.instrucoes || "").trim();
  if (!texto) {
    toast("Informe as instruções do que deverá ser feito.");
    return;
  }
  const call = asanaFuncao("createAsanaOperacao");
  if (!call) {
    toast("Recarregue a página (Ctrl+F5) para carregar o Asana.");
    return;
  }
  const prev = btn?.textContent || "Enviar à Operação";
  beginOwnDemandaWrite(id);
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Enviando…";
  }
  try {
    const res = await call({ demandaId: id, instrucoes: texto, projetoGid: envio.projetoGid, novaOrdem });
    const data = res?.data || {};
    if (!data.url) {
      toast("O Asana não retornou o link da tarefa");
      return;
    }
    const asana = normalizeAsana(data);
    const patch = { asana, asanaTaskId: asana.taskId };
    const atual = state.demandas.find((x) => x.id === id);
    const antes = normalizeAsana(atual?.asana);
    if (novaOrdem && antes && antes.taskId !== asana.taskId) {
      patch.asanaAnteriores = [...(atual.asanaAnteriores || []), { ...antes, substituidaEm: new Date().toISOString() }];
    }
    aplicarRespostaAsanaLocal(id, patch, data.comentario);
    setAsanaUiOverride(id, asana);
    toast(
      data.already
        ? "Já existe no Asana"
        : `${novaOrdem ? "Nova ordem aberta" : "Demanda criada"} no Asana${asana.projetoNome ? ` (${asana.projetoNome})` : ""}`,
    );
  } catch (err) {
    toast(formatCallableError(err, "Não foi possível criar no Asana"));
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = prev;
    }
    syncDemAsanaUi();
  }
}

async function cancelarDemandaAsana(id) {
  if (!requireWriteAccess()) return;
  const call = asanaFuncao("cancelAsanaOperacao");
  if (!call) {
    toast("Recarregue a página (Ctrl+F5) para carregar o Asana.");
    return;
  }
  const ok = await confirmDialog({
    title: "Cancelar envio à Operação?",
    message: "A tarefa será excluída no Asana. A demanda continua neste sistema e poderá ser enviada de novo.",
    confirmText: "Excluir no Asana",
    cancelText: "Voltar",
    variant: "danger",
  });
  if (!ok) return;
  const btn = document.getElementById("btnCancelarAsana");
  const prev = btn?.textContent || "Cancelar envio";
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Cancelando…";
  }
  beginOwnDemandaWrite(id);
  try {
    const res = await call({ demandaId: id });
    aplicarRespostaAsanaLocal(id, {}, res?.data?.comentario);
    setAsanaUiOverride(id, null);
    toast("Envio cancelado no Asana");
  } catch (err) {
    toast(formatCallableError(err, "Não foi possível cancelar no Asana"));
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = prev;
    }
    syncDemAsanaUi();
  }
}

function setAsanaUiOverride(id, asana) {
  asanaUiOverride = id ? { id, asana: asana || null } : null;
  ownAsanaSyncId = id || "";
  syncDemAsanaUi();
  syncDemandaModalAlerts();
}

/** Abre outra ordem (ex.: a anterior já foi fechada no Asana e precisa de retrabalho). */
async function abrirNovaOrdemAsana(id) {
  if (!requireWriteAccess()) return;
  const ok = await confirmDialog({
    title: "Abrir nova ordem no Asana?",
    message:
      "A tarefa atual continua no Asana e fica no histórico como ordem anterior. A nova vira a principal: os próximos comentários vão para ela.",
    confirmText: "Continuar",
    cancelText: "Voltar",
  });
  if (!ok) return;
  const titulo = (document.getElementById("demTitulo")?.value || "").trim();
  const envio = await promptAsanaEnvio(titulo, { novaOrdem: true });
  if (!envio) return;
  await enviarDemandaAsana(id, document.getElementById("btnNovaOrdemAsana"), envio, { novaOrdem: true });
}

function syncDemAsanaUi() {
  atualizarCampoAsana();
  syncComentarioAsanaBox();
  // A seção "Referências" em modo leitura mostra o mesmo estado (link ou botão de envio).
  if (editingDemandaOpenId) agendarSyncDemNavegacao();
}

function atualizarCampoAsana() {
  const hint = document.getElementById("demAsanaHint");
  const btn = document.getElementById("btnEnviarAsana");
  const link = document.getElementById("demAsanaLink");
  const btnCancel = document.getElementById("btnCancelarAsana");
  const btnNova = document.getElementById("btnNovaOrdemAsana");
  const anterioresEl = document.getElementById("demAsanaAnteriores");
  if (!hint || !btn || !link) return;
  const id = (document.getElementById("demId")?.value || "").trim();
  const d = id ? state.demandas.find((x) => x.id === id) : null;
  let as = normalizeAsana(d?.asana);
  if (asanaUiOverride && asanaUiOverride.id === id) {
    as = asanaUiOverride.asana ? normalizeAsana(asanaUiOverride.asana) : null;
  }
  const readOnly = isReadOnlyUser();

  hint.hidden = true;
  hint.textContent = "";
  btn.hidden = true;
  btn.disabled = true;
  link.hidden = true;
  link.removeAttribute("href");
  if (btnCancel) {
    btnCancel.hidden = true;
    btnCancel.disabled = true;
  }
  if (btnNova) btnNova.hidden = true;
  if (anterioresEl) {
    const ant = (d?.asanaAnteriores || []).map(normalizeAsana).filter((a) => a?.url);
    anterioresEl.hidden = !ant.length;
    anterioresEl.innerHTML = ant.length
      ? `Ordens anteriores: ${ant
          .map((a, i) => `<a href="${escapeHtml(a.url)}" target="_blank" rel="noopener noreferrer">${i + 1}ª${a.projetoNome ? ` (${escapeHtml(a.projetoNome)})` : ""}</a>`)
          .join(" · ")}`
      : "";
  }

  if (as?.url) {
    hint.hidden = false;
    const situacao = as.concluidaEm ? "concluída" : as.secao ? `coluna «${as.secao}»` : "";
    hint.textContent = `Tarefa criada no Asana${as.projetoNome ? ` · ${as.projetoNome}` : ""}${situacao ? ` · ${situacao}` : ""} · comentários sincronizados`;
    link.hidden = false;
    link.href = as.url;
    if (btnCancel && !readOnly) {
      btnCancel.hidden = false;
      btnCancel.disabled = false;
    }
    if (btnNova && !readOnly) {
      btnNova.hidden = false;
      btnNova.disabled = false;
    }
    return;
  }
  if (!id) {
    hint.hidden = false;
    hint.textContent = "Salve a demanda para enviar ao Asana.";
    return;
  }
  if (readOnly) {
    hint.hidden = false;
    hint.textContent = "Ainda não enviada ao Asana.";
    return;
  }
  btn.hidden = false;
  btn.disabled = false;
  btn.textContent = "Enviar à Operação";
}

/* ---------- Comentários: sistema ⇄ Asana ---------- */

/** Publica (ou edita/apaga) no Asana um comentário digitado aqui. Não bloqueia a tela. */
async function sincronizarComentarioAsana(demId, acao, c) {
  if (!demId || !c || c.origem) return; // comentários vindos do Asana/integração não voltam para lá
  if (c.paraAsana !== true) return; // marcado como "só no sistema" (ou escrito antes do envio)
  const d = state.demandas.find((x) => x.id === demId);
  if (!String(d?.asanaTaskId || normalizeAsana(d?.asana)?.taskId || "").trim()) return;
  const call = asanaFuncao("asanaComentario");
  if (!call) return;
  try {
    await call({ demandaId: demId, acao, comentarioId: c.id, texto: acao === "apagar" ? "" : c.texto, autor: c.autor });
  } catch (err) {
    toast(formatCallableError(err, "Comentário salvo aqui, mas não chegou ao Asana"));
  }
}

/**
 * Junta à lista do projeto aberto os comentários gravados pelo servidor (vindos do Asana ou da
 * integração). A nuvem manda nesses; os escritos aqui continuam como estão.
 */
function mesclarComentariosDoServidor(locais, remotos) {
  const doServidor = normalizeComentarios(remotos).filter((c) => c.origem && !comentariosApagadosNoModal.has(c.id));
  const idsServidor = new Set(doServidor.map((c) => c.id));
  const recentes = Date.now() - 2 * 60 * 1000;
  const out = normalizeComentarios(locais).filter(
    // Um comentário da integração que ainda não chegou da nuvem (acabou de ser criado) fica.
    (c) => !c.origem || idsServidor.has(c.id) || Date.parse(c.createdAt || 0) > recentes,
  );
  const ids = new Set(out.map((c) => c.id));
  return out.map((c) => (c.origem && idsServidor.has(c.id) ? doServidor.find((x) => x.id === c.id) : c)).concat(
    doServidor.filter((c) => !ids.has(c.id)),
  );
}

function assinaturaComentarios(lista) {
  return (lista || []).map((c) => `${c.id}\0${c.texto}`).sort().join("\n");
}

/** Chegou cópia nova da nuvem: mostra no projeto aberto os comentários que vieram do Asana. */
function syncComentariosServidorNoModal() {
  const id = editingDemandaOpenId;
  if (!id) return;
  const dem = state.demandas.find((x) => x.id === id);
  if (!dem) return;
  const mesclados = mesclarComentariosDoServidor(editingComentarios, dem.comentarios);
  if (assinaturaComentarios(mesclados) === assinaturaComentarios(editingComentarios)) return;
  editingComentarios = mesclados;
  if (!comentarioEditandoId) renderComentariosList();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
