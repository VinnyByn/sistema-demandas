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
  // "Ciente" vale só para o aviso que existia quando foi clicado: um aviso mais novo volta a aparecer.
  return a && (!a.cienteEm || (a.em && a.em > a.cienteEm)) ? a : null;
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
  syncAsanaAvisoBanner();
}

/** Avisos do Asana já vistos nesta aba (os que existiam ao abrir não viram notificação na tela). */
const avisosAsanaVistos = new Set();
let avisosAsanaIniciados = false;
let webhooksAsanaConferidos = false;

function chaveAvisoAsana(d, a) {
  return `${d.id}\0${a.tipo}\0${a.em}`;
}

/** Chegou aviso novo do Asana (concluída, em andamento, excluída): mostra na hora, além do sino. */
function notificarAvisosAsanaNovos() {
  const novos = [];
  for (const d of state.demandas || []) {
    const a = avisoAsanaPendente(d);
    if (!a) continue;
    const k = chaveAvisoAsana(d, a);
    if (avisosAsanaVistos.has(k)) continue;
    avisosAsanaVistos.add(k);
    if (avisosAsanaIniciados) novos.push({ d, a });
  }
  if (!webhooksAsanaConferidos && (state.demandas || []).some((d) => d.asanaTaskId)) {
    // Uma vez por abertura, assim que os projetos chegam: a função também confere/atualiza os webhooks do Asana.
    webhooksAsanaConferidos = true;
    void carregarProjetosAsana();
  }
  // Só começa a notificar depois que os dados da nuvem chegaram (os avisos antigos não viram notificação).
  if ((state.demandas || []).length) avisosAsanaIniciados = true;
  if (!novos.length) return;
  const { d, a } = novos[novos.length - 1];
  const tipo = ASANA_AVISO_TIPOS[a.tipo];
  const extra = novos.length > 1 ? ` (+${novos.length - 1} aviso${novos.length > 2 ? "s" : ""})` : "";
  toastComAcao(`${tipo.ico} ${tipo.curta}: «${d.titulo || "Projeto"}»${extra}`, "Abrir", () => openDemandaModal(d.id));
}

/** Faixa no topo do projeto aberto com o último aviso do Asana ainda não marcado como ciente. */
function syncAsanaAvisoBanner() {
  const banner = document.getElementById("demAsanaAvisoBanner");
  const txt = document.getElementById("demAsanaAvisoTexto");
  const btn = document.getElementById("btnDemAsanaCiente");
  if (!banner || !txt) return;
  const id = editingDemandaOpenId;
  const d = id ? state.demandas.find((x) => x.id === id) : null;
  const a = avisoAsanaPendente(d);
  banner.hidden = !a;
  if (!a) return;
  const tipo = ASANA_AVISO_TIPOS[a.tipo];
  banner.classList.toggle("demanda-alert--ok", a.tipo !== "excluida");
  banner.classList.toggle("demanda-alert--conflict", a.tipo === "excluida");
  txt.textContent = `${tipo.ico} ${a.texto || tipo.curta}`;
  if (btn) btn.hidden = isReadOnlyUser();
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

/* ---------- Anexos: vão direto para a tarefa no Asana (não ficam guardados no sistema) ---------- */
const ASANA_ANEXO_MAX_BYTES = 10 * 1024 * 1024;
const ASANA_ANEXOS_MAX_TOTAL = 25 * 1024 * 1024;
const ASANA_ANEXOS_MAX_QTD = 10;
let asanaEnvioArquivos = [];

function formatTamanhoArquivo(b) {
  return b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
}

/** Junta arquivos à lista, recusando os grandes demais. Devolve a lista nova. */
function juntarArquivosAsana(lista, novos) {
  const out = [...lista];
  for (const f of novos) {
    if (out.length >= ASANA_ANEXOS_MAX_QTD) {
      toast(`Até ${ASANA_ANEXOS_MAX_QTD} arquivos por vez.`);
      break;
    }
    if (f.size > ASANA_ANEXO_MAX_BYTES) {
      toast(`«${f.name}» passa de 10 MB — anexe direto no Asana.`);
      continue;
    }
    if (out.reduce((s, x) => s + x.size, 0) + f.size > ASANA_ANEXOS_MAX_TOTAL) {
      toast("Os anexos passam de 25 MB juntos — envie o restante depois, pelo 📎 Anexar ao Asana.");
      break;
    }
    if (!out.some((x) => x.name === f.name && x.size === f.size)) out.push(f);
  }
  return out;
}

function renderAsanaEnvioArquivos() {
  const ul = document.getElementById("asanaEnvioArquivosLista");
  if (!ul) return;
  ul.innerHTML = asanaEnvioArquivos
    .map(
      (f, i) =>
        `<li><span class="asana-anexos__nome" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</span>` +
        `<small>${formatTamanhoArquivo(f.size)}</small>` +
        `<button type="button" class="icon-btn" data-anexo-remover="${i}" aria-label="Remover ${escapeHtml(f.name)}">×</button></li>`,
    )
    .join("");
}

function lerArquivoBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || "").replace(/^data:[^,]*,/, ""));
    r.onerror = () => reject(r.error || new Error("Não foi possível ler o arquivo."));
    r.readAsDataURL(file);
  });
}

/** Envia os arquivos um por vez para a tarefa atual da demanda no Asana. */
async function anexarArquivosAsana(id, arquivos) {
  const lista = [...(arquivos || [])];
  if (!lista.length) return { ok: 0, falhas: 0 };
  const call = asanaFuncao("asanaAnexar");
  if (!call) {
    toast("Recarregue a página (Ctrl+F5) para carregar o Asana.");
    return { ok: 0, falhas: lista.length };
  }
  let ok = 0;
  const falhas = [];
  for (const [i, f] of lista.entries()) {
    toast(`Anexando no Asana ${i + 1}/${lista.length}: ${f.name}…`);
    try {
      const base64 = await lerArquivoBase64(f);
      const res = await call({ demandaId: id, nome: f.name, tipo: f.type || "", base64, autor: getLoggedInComentarioAutor() });
      aplicarRespostaAsanaLocal(id, null, res?.data?.comentario);
      ok += 1;
    } catch (err) {
      falhas.push(`${f.name}: ${formatCallableError(err, "falhou")}`);
    }
  }
  toast(
    falhas.length
      ? `${ok} anexo(s) enviados. Não foi: ${falhas.join(" · ")}`
      : `${ok} anexo(s) enviados ao Asana`,
  );
  return { ok, falhas: falhas.length };
}

function initAsanaAnexos() {
  const input = document.getElementById("asanaEnvioArquivos");
  const box = document.getElementById("asanaEnvioAnexos");
  const ul = document.getElementById("asanaEnvioArquivosLista");
  input?.addEventListener("change", () => {
    asanaEnvioArquivos = juntarArquivosAsana(asanaEnvioArquivos, input.files || []);
    input.value = "";
    renderAsanaEnvioArquivos();
  });
  box?.addEventListener("dragover", (e) => {
    e.preventDefault();
    box.classList.add("is-arrastando");
  });
  box?.addEventListener("dragleave", () => box.classList.remove("is-arrastando"));
  box?.addEventListener("drop", (e) => {
    e.preventDefault();
    box.classList.remove("is-arrastando");
    asanaEnvioArquivos = juntarArquivosAsana(asanaEnvioArquivos, e.dataTransfer?.files || []);
    renderAsanaEnvioArquivos();
  });
  ul?.addEventListener("click", (e) => {
    const btn = e.target instanceof Element ? e.target.closest("[data-anexo-remover]") : null;
    if (!btn) return;
    asanaEnvioArquivos = asanaEnvioArquivos.filter((_, i) => i !== Number(btn.dataset.anexoRemover));
    renderAsanaEnvioArquivos();
  });
  // Projeto já enviado: anexar depois, sem abrir nova ordem.
  const avulso = document.getElementById("asanaAnexarInput");
  document.getElementById("btnAnexarAsana")?.addEventListener("click", () => avulso?.click());
  avulso?.addEventListener("change", async () => {
    const id = (document.getElementById("demId")?.value || "").trim();
    const arquivos = juntarArquivosAsana([], avulso.files || []);
    avulso.value = "";
    if (!id || !arquivos.length || !requireWriteAccess()) return;
    const btn = document.getElementById("btnAnexarAsana");
    if (btn) btn.disabled = true;
    try {
      await anexarArquivosAsana(id, arquivos);
    } finally {
      if (btn) btn.disabled = false;
    }
  });
}

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
    finish({ instrucoes: texto, projetoGid, arquivos: [...asanaEnvioArquivos] });
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
  asanaEnvioArquivos = [];
  renderAsanaEnvioArquivos();
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
  const dem = { ...state.demandas[idx], ...(patch || {}) };
  if (patch && patch.asana === null) {
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
    if (envio.arquivos?.length) await anexarArquivosAsana(id, envio.arquivos);
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
    aplicarRespostaAsanaLocal(id, { asana: null }, res?.data?.comentario);
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
  const d = state.demandas.find((x) => x.id === id);
  if (normalizeAsana(d?.asana) && !normalizeAsana(d.asana).concluidaEm) {
    toast("A ordem atual ainda está aberta no Asana — a nova ordem libera quando ela for concluída.");
    return;
  }
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
  syncAsanaAvisoBanner();
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
  const btnAnexar = document.getElementById("btnAnexarAsana");
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
  if (btnAnexar) btnAnexar.hidden = true;
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
    // Só uma ordem aberta por vez: o botão só aparece depois que a atual for concluída no Asana
    // (excluída lá, a ordem já se encerra e volta o "Enviar à Operação").
    if (btnNova && !readOnly && as.concluidaEm) {
      btnNova.hidden = false;
      btnNova.disabled = false;
    }
    if (btnAnexar && !readOnly) btnAnexar.hidden = false;
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
