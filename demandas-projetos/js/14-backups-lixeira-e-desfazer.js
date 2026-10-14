/**
 * Backups na nuvem, lixeira, arquivo e Desfazer.
 * Só declarações (funções e constantes); o que roda ao abrir a página fica em app.js.
 */
/* ---------- Firebase Storage (usado pelos backups) ---------- */
function storageDisponivel() {
  return typeof firebase !== "undefined" && typeof firebase.storage === "function" && persistenceApi?.mode === "firebase";
}

function formatTamanhoArquivo(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0).replace(".", ",")} MB`;
}

function mensagemErroStorage(e) {
  const code = String(e?.code || "");
  if (code === "storage/unauthorized") return "Sem permissão no Storage — publique as regras (storage.rules) no Firebase";
  if (code === "storage/canceled") return "Envio cancelado";
  if (code === "storage/quota-exceeded") return "Cota do Storage esgotada";
  if (code === "storage/retry-limit-exceeded") return "Conexão instável — tente de novo";
  if (code === "storage/object-not-found") return "Arquivo não encontrado no Storage";
  if (/bucket|project-not-found|unknown|no-default-bucket/.test(code)) return "O Firebase Storage não está ativado neste projeto";
  return e?.message ? `Falha no Storage: ${e.message}` : "Falha no Storage";
}

/* ---------- Backups automáticos na nuvem (Cloud Functions + Storage) ---------- */
function backupNomeAmigavel(nome) {
  const m = String(nome).match(/demandas-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})/);
  if (!m) return nome.replace(/^backups\//, "");
  // O nome usa o horário UTC; mostra no horário local.
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00Z`);
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

async function renderBackupsModal() {
  const lista = document.getElementById("backupsLista");
  const ultimo = document.getElementById("backupsUltimo");
  if (!lista || !ultimo) return;
  if (!storageDisponivel()) {
    ultimo.innerHTML = `<p class="muted small">Disponível só com o Firebase conectado.</p>`;
    lista.innerHTML = "";
    return;
  }
  ultimo.innerHTML = `<p class="muted small">Carregando…</p>`;
  lista.innerHTML = "";
  try {
    const info = (await firebase.firestore().doc("demandasSistema/backups").get()).data()?.ultimo;
    ultimo.innerHTML = info
      ? `<span class="backups-ultimo__ico" aria-hidden="true">✓</span><div><strong>Último backup: ${escapeHtml(
          new Date(info.geradoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }),
        )}</strong><span class="muted small">${escapeHtml(String(info.totalDemandas))} projeto(s) · ${escapeHtml(
          formatTamanhoArquivo(info.bytes),
        )} · ${info.motivo === "manual" ? `manual (${escapeHtml(info.autor || "—")})` : "automático"}</span></div>`
      : `<span class="backups-ultimo__ico is-pendente" aria-hidden="true">!</span><div><strong>Nenhum backup registrado ainda</strong><span class="muted small">Publique as funções (backupDiario e backupAgora) ou clique em Fazer backup agora.</span></div>`;
  } catch (e) {
    ultimo.innerHTML = `<p class="muted small">Não foi possível ler a situação do backup (${escapeHtml(e?.code || e?.message || "erro")}).</p>`;
  }
  try {
    const res = await firebase.storage().ref("backups").listAll();
    const itens = res.items.slice().sort((a, b) => b.name.localeCompare(a.name));
    lista.innerHTML = itens.length
      ? itens
          .map(
            (it) =>
              `<li class="anexo"><span class="anexo__ico" aria-hidden="true">🗄</span><span class="anexo__txt"><strong>${escapeHtml(
                backupNomeAmigavel(it.fullPath),
              )}</strong><small>${/manual/.test(it.name) ? "Manual" : "Automático"} · ${escapeHtml(it.name)}</small></span>` +
              `<button type="button" class="anexo__acao" data-backup-baixar="${escapeHtml(it.fullPath)}" title="Baixar" aria-label="Baixar backup">⬇</button></li>`,
          )
          .join("")
      : `<li class="anexos__vazio">Nenhum arquivo de backup no Storage ainda.</li>`;
  } catch (e) {
    lista.innerHTML = `<li class="anexos__vazio">${escapeHtml(mensagemErroStorage(e))}</li>`;
  }
}

function abrirBackupsModal() {
  if (!isAdminUser()) {
    toast("Apenas administrador acessa os backups");
    return;
  }
  const dlg = document.getElementById("modalBackups");
  if (!dlg) return;
  if (!dlg.open) dlg.showModal();
  void renderBackupsModal();
}

async function fazerBackupAgora() {
  const btn = document.getElementById("btnBackupAgora");
  if (typeof firebase === "undefined" || !firebase.functions) {
    toast("Recarregue a página (Ctrl+F5) para carregar as funções.");
    return;
  }
  const prev = btn?.textContent || "Fazer backup agora";
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Gerando…";
  }
  try {
    const res = await firebase.app().functions("us-central1").httpsCallable("backupAgora")({});
    toast(`Backup gerado · ${res?.data?.totalDemandas ?? "?"} projeto(s)`);
    await renderBackupsModal();
  } catch (e) {
    console.warn("backupAgora:", e);
    toast(
      e?.code === "functions/not-found"
        ? "A função de backup ainda não foi publicada (firebase deploy --only functions)"
        : e?.message || "Falha ao gerar o backup",
    );
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = prev;
    }
  }
}

function initBackupsModal() {
  document.getElementById("btnBackupsNuvem")?.addEventListener("click", () => {
    setExportMenuOpen(false);
    abrirBackupsModal();
  });
  const fechar = () => document.getElementById("modalBackups")?.close();
  document.getElementById("modalBackupsClose")?.addEventListener("click", fechar);
  document.getElementById("btnFecharBackups")?.addEventListener("click", fechar);
  document.getElementById("btnBackupAgora")?.addEventListener("click", () => void fazerBackupAgora());
  document.getElementById("backupsLista")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-backup-baixar]");
    if (!btn) return;
    try {
      const url = await firebase.storage().ref(btn.dataset.backupBaixar).getDownloadURL();
      window.open(url, "_blank", "noopener");
    } catch (err) {
      toast(mensagemErroStorage(err));
    }
  });
}

/* ---------- Lixeira e arquivo ---------- */
function demandaAutorAcao() {
  return getLoggedInComentarioAutor() || getCurrentUserEmail() || "Equipe";
}

/** Move projetos para a lixeira (recuperável): saem da esteira, do dashboard e dos alertas. */
function moverDemandasParaLixeira(ids, { silencioso = false } = {}) {
  if (!requireWriteAccess("deleteDemanda")) return 0;
  const agora = new Date().toISOString();
  const autor = demandaAutorAcao();
  let n = 0;
  for (const id of ids) {
    const d = state.demandas.find((x) => x.id === id);
    if (!d) continue;
    d.excluidoEm = agora;
    d.excluidoPor = autor;
    d.updatedAt = agora;
    delete d.editingBy;
    state.demandas = state.demandas.filter((x) => x.id !== id);
    state.lixeira = [...(state.lixeira || []).filter((x) => x.id !== id), d];
    saveState({ demanda: migrateDemanda(d) });
    n++;
  }
  if (n) {
    refreshAllViews();
    renderLixeiraModal();
    if (!silencioso) {
      oferecerDesfazer(n === 1 ? "Projeto movido para a lixeira" : `${n} projetos movidos para a lixeira`, () =>
        restaurarDaLixeira(ids),
      );
    }
  }
  return n;
}

function restaurarDaLixeira(ids, { desfazivel = false } = {}) {
  if (!requireWriteAccess()) return 0;
  const agora = new Date().toISOString();
  let n = 0;
  for (const id of ids) {
    const d = (state.lixeira || []).find((x) => x.id === id);
    if (!d) continue;
    delete d.excluidoEm;
    delete d.excluidoPor;
    d.updatedAt = agora;
    state.lixeira = state.lixeira.filter((x) => x.id !== id);
    const restaurada = migrateDemanda({ ...d, __isMigrated: false });
    state.demandas = [...state.demandas.filter((x) => x.id !== id), restaurada];
    saveState({ demanda: { ...restaurada, excluidoEm: firebaseCampoApagar(), excluidoPor: firebaseCampoApagar() } });
    n++;
  }
  if (n) {
    refreshAllViews();
    renderLixeiraModal();
    const msg = n === 1 ? "Projeto restaurado" : `${n} projetos restaurados`;
    if (desfazivel) {
      oferecerDesfazer(msg, () => {
        moverDemandasParaLixeira(ids, { silencioso: true });
        toast("Restauração desfeita — voltou para a lixeira");
      });
    } else {
      toast(msg);
    }
  }
  return n;
}

/** Valor que apaga um campo no Firestore (ou some na cópia local). */
function firebaseCampoApagar() {
  return typeof firebase !== "undefined" && firebase.firestore?.FieldValue ? firebase.firestore.FieldValue.delete() : undefined;
}

async function excluirDefinitivamente(ids) {
  if (!isAdminUser()) {
    toast("Só administradores podem excluir de vez");
    return 0;
  }
  let n = 0;
  for (const id of ids) {
    const d = (state.lixeira || []).find((x) => x.id === id);
    if (!d) continue;
    state.lixeira = state.lixeira.filter((x) => x.id !== id);
    markDemandaPendingDelete(id);
    saveState({ deleteDemandaId: id });
    n++;
  }
  if (n) {
    renderLixeiraModal();
    toast(n === 1 ? "Projeto excluído de vez" : `${n} projetos excluídos de vez`);
  }
  return n;
}

function arquivarDemandas(ids, arquivar = true, { desfazivel = true } = {}) {
  if (!requireWriteAccess()) return 0;
  const agora = new Date().toISOString();
  const autor = demandaAutorAcao();
  let n = 0;
  for (const id of ids) {
    const d = state.demandas.find((x) => x.id === id);
    if (!d || Boolean(d.arquivadoEm) === arquivar) continue;
    if (arquivar) {
      d.arquivadoEm = agora;
      d.arquivadoPor = autor;
    } else {
      delete d.arquivadoEm;
      delete d.arquivadoPor;
    }
    d.updatedAt = agora;
    const payload = migrateDemanda({ ...d, __isMigrated: false });
    Object.assign(d, payload);
    saveState({
      demanda: arquivar ? payload : { ...payload, arquivadoEm: firebaseCampoApagar(), arquivadoPor: firebaseCampoApagar() },
    });
    n++;
  }
  if (n) {
    refreshAllViews();
    renderLixeiraModal();
    const msg = arquivar
      ? n === 1
        ? "Projeto arquivado"
        : `${n} projetos arquivados`
      : n === 1
        ? "Projeto desarquivado — voltou para a esteira"
        : `${n} projetos desarquivados`;
    if (desfazivel) oferecerDesfazer(msg, () => arquivarDemandas(ids, !arquivar, { desfazivel: false }));
    else toast(arquivar ? "Arquivamento desfeito" : "Projeto(s) de volta ao arquivo");
  }
  return n;
}

/* ---------- Desfazer (botão no aviso e Ctrl+Z) ---------- */
const DESFAZER_MAX = 20;
/** Últimas ações desfazíveis, da mais antiga para a mais recente. */
const pilhaDesfazer = [];

/** Mostra o aviso com "Desfazer" e guarda a ação para o Ctrl+Z. */
function oferecerDesfazer(msg, desfazer) {
  const entrada = { msg, desfazer, feito: false };
  pilhaDesfazer.push(entrada);
  if (pilhaDesfazer.length > DESFAZER_MAX) pilhaDesfazer.shift();
  toastComAcao(msg, "Desfazer", () => executarDesfazer(entrada));
}

function executarDesfazer(entrada) {
  if (!entrada || entrada.feito) return;
  entrada.feito = true;
  const i = pilhaDesfazer.indexOf(entrada);
  if (i >= 0) pilhaDesfazer.splice(i, 1);
  entrada.desfazer();
}

function desfazerUltimaAcao() {
  const entrada = [...pilhaDesfazer].reverse().find((x) => !x.feito);
  if (!entrada) {
    toast("Nada para desfazer");
    return;
  }
  executarDesfazer(entrada);
}

/** Cópia dos projetos antes de uma ação. `antes: null` = projeto novo (desfazer manda para a lixeira). */
function fotografarDemandas(ids) {
  return [...new Set(ids)].map((id) => {
    const d = state.demandas.find((x) => x.id === id);
    return { id, antes: d ? JSON.parse(JSON.stringify(d)) : null };
  });
}

/** Volta os projetos para a cópia tirada antes da ação (campos novos são apagados também na nuvem). */
function restaurarFotos(fotos, msg = "Ação desfeita") {
  if (!requireWriteAccess()) return;
  const agora = new Date().toISOString();
  const internos = new Set(["editingBy", "editingAt", "__isMigrated"]);
  const novos = [];
  for (const { id, antes } of fotos) {
    const atual = state.demandas.find((x) => x.id === id);
    if (!antes) {
      if (atual) novos.push(id);
      continue;
    }
    if (!atual) continue; // saiu da esteira depois (lixeira/exclusão): não recria
    const volta = { ...JSON.parse(JSON.stringify(antes)), updatedAt: agora };
    delete volta.__isMigrated;
    const apagar = {};
    for (const k of Object.keys(atual)) {
      if (k in volta || internos.has(k)) continue;
      delete atual[k];
      const v = firebaseCampoApagar();
      if (v !== undefined) apagar[k] = v;
    }
    Object.assign(atual, volta);
    noteOwnDemandaWrite(id, agora);
    saveState({ demanda: { ...migrateDemanda(atual), ...apagar } });
  }
  if (novos.length) moverDemandasParaLixeira(novos, { silencioso: true });
  refreshAllViews();
  toast(msg);
}

function initDesfazerAtalho() {
  document.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || String(e.key).toLowerCase() !== "z") return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return; // desfazer do próprio campo
    if (document.querySelector("dialog[open]")) return;
    e.preventDefault();
    desfazerUltimaAcao();
  });
}

/** Toast com um botão de ação (ex.: Desfazer) — fica 6 s na tela. */
function toastComAcao(msg, rotulo, acao) {
  toast(msg);
  if (!toastEl || typeof acao !== "function") return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "toast__acao";
  btn.textContent = rotulo;
  if (rotulo === "Desfazer") btn.title = "Desfazer (Ctrl+Z)";
  btn.addEventListener("click", () => {
    btn.remove();
    toastEl.hidden = true;
    acao();
  });
  toastEl.appendChild(btn);
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { toastEl.hidden = true; }, 6000);
}

let lixeiraAba = "arquivados";

function abrirLixeiraModal(aba) {
  const dlg = document.getElementById("modalLixeira");
  if (!dlg) return;
  if (aba) lixeiraAba = aba;
  const busca = document.getElementById("lixeiraBusca");
  if (busca) busca.value = "";
  renderLixeiraModal();
  if (!dlg.open) dlg.showModal();
}

function renderLixeiraModal() {
  const dlg = document.getElementById("modalLixeira");
  if (!dlg) return;
  const arquivados = state.demandas.filter((d) => d.arquivadoEm);
  const lixeira = state.lixeira || [];
  const nArq = document.getElementById("lixeiraNArq");
  const nLix = document.getElementById("lixeiraNLix");
  if (nArq) nArq.textContent = String(arquivados.length);
  if (nLix) nLix.textContent = String(lixeira.length);
  document.querySelectorAll("#lixeiraAbas [data-aba]").forEach((b) => {
    const on = b.dataset.aba === lixeiraAba;
    b.classList.toggle("is-active", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  });
  const ro = isReadOnlyUser();
  const admin = isAdminUser();
  const esvaziar = document.getElementById("btnEsvaziarLixeira");
  if (esvaziar) esvaziar.hidden = !(lixeiraAba === "lixeira" && admin && lixeira.length);
  const dica = document.getElementById("lixeiraDica");
  if (dica) {
    dica.textContent =
      lixeiraAba === "arquivados"
        ? "Projetos arquivados saem da esteira e dos alertas, mas continuam nos indicadores do dashboard."
        : "Projetos na lixeira não aparecem em lugar nenhum até serem restaurados." + (admin ? " Só administradores excluem de vez." : "");
  }
  const termo = normalizeBuscaText(document.getElementById("lixeiraBusca")?.value || "");
  const lista = (lixeiraAba === "arquivados" ? arquivados : lixeira)
    .filter((d) => !termo || normalizeBuscaText([d.titulo, formatCidadesDemanda(d), d.tipo, d.produtoB2b, d.solicitante].join(" ")).includes(termo))
    .sort((a, b) => String(b.arquivadoEm || b.excluidoEm).localeCompare(String(a.arquivadoEm || a.excluidoEm)));
  const el = document.getElementById("lixeiraLista");
  if (!el) return;
  if (!lista.length) {
    el.innerHTML = `<p class="lixeira-vazio">${termo ? "Nada encontrado." : lixeiraAba === "arquivados" ? "Nenhum projeto arquivado." : "A lixeira está vazia."}</p>`;
    return;
  }
  el.innerHTML = lista
    .map((d) => {
      const quando = d.arquivadoEm || d.excluidoEm;
      const quem = d.arquivadoPor || d.excluidoPor;
      const dias = diasEntreDatasISO(String(quando).slice(0, 10), todayISODate());
      const acoes =
        lixeiraAba === "arquivados"
          ? `<button type="button" class="btn btn--ghost btn--sm" data-lx-abrir="${escapeHtml(d.id)}">Abrir</button>` +
            (ro ? "" : `<button type="button" class="btn btn--ghost btn--sm" data-lx-desarquivar="${escapeHtml(d.id)}">Desarquivar</button>`)
          : (ro ? "" : `<button type="button" class="btn btn--ghost btn--sm" data-lx-restaurar="${escapeHtml(d.id)}">Restaurar</button>`) +
            (admin ? `<button type="button" class="btn btn--ghost btn--sm btn--danger-ghost" data-lx-apagar="${escapeHtml(d.id)}">Excluir de vez</button>` : "");
      return (
        `<div class="lixeira-item">` +
        `<div class="lixeira-item__info"><strong>${escapeHtml(d.titulo)}</strong>` +
        `<span class="muted small"><span class="badge ${tipoBadgeClass(d.tipo)}">${escapeHtml(d.tipo)}</span> ${escapeHtml(labelStatus(d.status, d.linhaEsteira))}` +
        `${formatCidadesDemanda(d) ? ` · ${escapeHtml(formatCidadesDemanda(d))}` : ""}</span>` +
        `<span class="muted small">${lixeiraAba === "arquivados" ? "Arquivado" : "Excluído"} ${dias === 0 ? "hoje" : `há ${dias} dia(s)`}` +
        `${quem ? ` por ${escapeHtml(quem)}` : ""} · ${escapeHtml(formatDataCurta(String(quando).slice(0, 10)))}</span></div>` +
        `<div class="lixeira-item__acoes">${acoes}</div></div>`
      );
    })
    .join("");
}

function initLixeiraModal() {
  const dlg = document.getElementById("modalLixeira");
  if (!dlg) return;
  document.getElementById("btnLixeiraArquivo")?.addEventListener("click", () => abrirLixeiraModal());
  document.getElementById("modalLixeiraClose")?.addEventListener("click", () => dlg.close());
  document.getElementById("btnFecharLixeira")?.addEventListener("click", () => dlg.close());
  document.getElementById("lixeiraAbas")?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-aba]");
    if (!b) return;
    lixeiraAba = b.dataset.aba;
    renderLixeiraModal();
  });
  document.getElementById("lixeiraBusca")?.addEventListener("input", renderLixeiraModal);
  document.getElementById("lixeiraLista")?.addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.lxAbrir) {
      dlg.close();
      openDemandaModal(b.dataset.lxAbrir);
    } else if (b.dataset.lxDesarquivar) {
      arquivarDemandas([b.dataset.lxDesarquivar], false);
    } else if (b.dataset.lxRestaurar) {
      restaurarDaLixeira([b.dataset.lxRestaurar], { desfazivel: true });
    } else if (b.dataset.lxApagar) {
      const d = (state.lixeira || []).find((x) => x.id === b.dataset.lxApagar);
      const ok = await confirmDialog({
        title: "Excluir de vez?",
        message: `«${d?.titulo || "Projeto"}» será apagado permanentemente. Não dá para desfazer.`,
        confirmText: "Excluir de vez",
        variant: "danger",
      });
      if (ok) await excluirDefinitivamente([b.dataset.lxApagar]);
    }
  });
  document.getElementById("btnEsvaziarLixeira")?.addEventListener("click", async () => {
    const ids = (state.lixeira || []).map((d) => d.id);
    if (!ids.length) return;
    const ok = await confirmDialog({
      title: "Esvaziar a lixeira?",
      message: `${ids.length} projeto(s) serão apagados permanentemente. Não dá para desfazer.`,
      confirmText: "Esvaziar lixeira",
      variant: "danger",
    });
    if (ok) await excluirDefinitivamente(ids);
  });
  // Arquivar/desarquivar pelo menu "…" do projeto
  document.getElementById("btnArquivarDemanda")?.addEventListener("click", () => {
    const id = (document.getElementById("demId")?.value || "").trim();
    setDemandaFootMenuOpen(false);
    if (!id) {
      toast("Salve o projeto antes de arquivar");
      return;
    }
    if (demandaTemAlteracoes()) {
      toast("Salve as alterações antes de arquivar");
      return;
    }
    const d = state.demandas.find((x) => x.id === id);
    if (!d) return;
    const arquivar = !d.arquivadoEm;
    closeDemandaModal();
    arquivarDemandas([id], arquivar);
  });
  document.getElementById("btnDesarquivarBanner")?.addEventListener("click", () => {
    const id = (document.getElementById("demId")?.value || "").trim();
    if (!id) return;
    arquivarDemandas([id], false);
    syncDemandaArquivadoUi(id);
  });
}

/** Faixa "Projeto arquivado" e texto do item do menu conforme o projeto aberto. */
function syncDemandaArquivadoUi(id) {
  const d = id ? state.demandas.find((x) => x.id === id) : null;
  const banner = document.getElementById("demArquivadoBanner");
  const txt = document.getElementById("demArquivadoTxt");
  const menuTxt = document.getElementById("btnArquivarDemandaTxt");
  const arq = Boolean(d?.arquivadoEm);
  if (banner) banner.hidden = !arq;
  if (txt && arq) txt.textContent = `Arquivado em ${formatDataCurta(d.arquivadoEm.slice(0, 10))}${d.arquivadoPor ? ` por ${d.arquivadoPor}` : ""}`;
  if (menuTxt) menuTxt.textContent = arq ? "Desarquivar projeto" : "Arquivar projeto";
}
