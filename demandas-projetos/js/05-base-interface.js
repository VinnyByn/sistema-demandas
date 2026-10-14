/**
 * Modelo do checklist, durações, avisos (toast), diálogos e abas.
 * Só declarações (funções e constantes); o que roda ao abrir a página fica em app.js.
 */
/** Status de cada atividade do checklist. `done` continua gravado (card, cronograma, dashboard). */
const CHECKLIST_STATUS = [
  ["afazer", "A fazer"],
  ["andamento", "Em andamento"],
  ["concluida", "Concluída"],
];

function normalizeChecklistStatus(it) {
  const s = String(it?.status || "").trim();
  if (CHECKLIST_STATUS_LABEL[s]) return s;
  return it?.done === true ? "concluida" : "afazer";
}

function normalizeChecklistItem(it) {
  if (!it || typeof it !== "object") return null;
  const name = String(it.name || it.etapa || "").trim();
  if (!name) return null;
  const status = normalizeChecklistStatus(it);
  return {
    id: it.id || uid(),
    name,
    descricao: String(it.descricao || it.desc || "").trim(),
    who: String(it.who || it.responsavel || "").trim(),
    dateInicio: String(it.dateInicio || it.inicio || "").trim(),
    date: String(it.date || it.dateFim || "").trim(),
    // Data real em que a atividade foi concluída (para comparar com o término previsto).
    dateConclusao: status === "concluida" ? isoDatePart(it.dateConclusao || "") || "" : "",
    // Nova data de término quando o prazo passou; `date` continua sendo o término original.
    dateNova: isoDatePart(it.dateNova || "") || "",
    // Atividade que precisa terminar antes desta começar (id no mesmo checklist).
    dependeDe: String(it.dependeDe || "").trim(),
    // Coluna para onde o projeto vai quando esta atividade for concluída ("" = não mover).
    moverPara: String(it.moverPara || "").trim(),
    status,
    done: status === "concluida",
  };
}

function normalizeChecklist(list) {
  if (!Array.isArray(list)) return [];
  const items = list.map(normalizeChecklistItem).filter(Boolean);
  const ids = new Set(items.map((x) => x.id));
  for (const it of items) {
    if (it.dependeDe && (it.dependeDe === it.id || !ids.has(it.dependeDe))) it.dependeDe = "";
  }
  return items;
}

/** Anexos do projeto (arquivos no Firebase Storage). */
function normalizeAnexos(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((a) => a && typeof a === "object" && a.path && a.nome)
    .map((a) => ({
      id: String(a.id || uid()),
      nome: String(a.nome),
      tipo: String(a.tipo || ""),
      tamanho: Number(a.tamanho) || 0,
      path: String(a.path),
      url: String(a.url || ""),
      enviadoPor: String(a.enviadoPor || ""),
      enviadoEm: String(a.enviadoEm || ""),
    }));
}

function migrateDemanda(d) {
  if (!d || typeof d !== "object") return d;
  // Já normalizada nesta sessão — evita reprocessar custo/histórico em todo card.
  if (d.__isMigrated) return d;
  const linha = inferLinhaEsteira(d);
  const cfg = getEsteiraConfig(linha);
  let status = mapStatusParaLinha(d.status || "", linha);
  if (!cfg.statusLabel[status]) status = cfg.inboxStatus;
  const motivosItens = normalizeMotivosAtrasoItens(d);
  const base = {
    id: d.id || uid(),
    titulo: d.titulo || "Sem título",
    descricao: d.descricao || "",
    comentarios: normalizeComentarios(d.comentarios),
    cidade: normalizeCidadeCadastro(d.cidade),
    cidadesExtra: normalizeCidadesExtra(d.cidadesExtra, d.cidade),
    dataChegada: d.dataChegada || "",
    dataFimPrevista: d.dataFimPrevista || "",
    dataFimAtualizada: d.dataFimAtualizada || "",
    dataTermino: d.dataTermino || "",
    statusAtual: d.statusAtual || "",
    motivosAtrasoItens: motivosItens,
    motivosAtraso: formatMotivosAtrasoTexto(motivosItens),
    valorProjetoRealizado: parseCustoMoney(d.valorProjetoRealizado),
    solicitante: d.solicitante || "",
    setorSolicitanteB2b: normalizeTipo(d.tipo) === "B2B" ? normalizeSetorSolicitanteB2b(d.setorSolicitanteB2b) : "",
    responsavel: normalizeResponsavel(d.responsavel),
    projetistasExtra: normalizeProjetistasExtra(d.projetistasExtra, d.responsavel),
    tipo: normalizeTipo(d.tipo),
    produtoB2b: normalizeTipo(d.tipo) === "B2B" ? normalizeProdutoB2b(d.produtoB2b) : "",
    segmentoB2c: normalizeTipo(d.tipo) === "B2C" ? normalizeSegmentoB2c(d.segmentoB2c) : "",
    linhaEsteira: linha,
    status,
    ordemEsteira: (() => {
      const n = Number(d.ordemEsteira);
      return Number.isFinite(n) ? n : "";
    })(),
    custo: normalizeCusto(d.custo),
    pdfLevantamento: normalizePdfLevantamento(d.pdfLevantamento),
    imagens: Array.isArray(d.imagens) ? d.imagens : [],
    historicoStatus: normalizeHistoricoStatus(d.historicoStatus),
    checklist: normalizeChecklist(d.checklist),
    historicoEdicoes: normalizeHistoricoEdicoes(d.historicoEdicoes),
    historicoAlertas: normalizeHistoricoAlertas(d.historicoAlertas),
    chamadoOcomon: String(d.chamadoOcomon || "").trim(),
    osAniel: String(d.osAniel || "").trim(),
    clickupTaskId: String(d.clickupTaskId || d.clickup?.taskId || "").trim(),
    clickup: normalizeClickup(d.clickup || d),
    createdAt: d.createdAt || new Date().toISOString(),
    updatedAt: d.updatedAt || new Date().toISOString(),
  };
  base.anexos = normalizeAnexos(d.anexos);
  // Lixeira / arquivo: excluído vai para a lixeira (recuperável); arquivado sai da esteira.
  if (d.excluidoEm) {
    base.excluidoEm = String(d.excluidoEm);
    base.excluidoPor = String(d.excluidoPor || "");
  }
  if (d.arquivadoEm) {
    base.arquivadoEm = String(d.arquivadoEm);
    base.arquivadoPor = String(d.arquivadoPor || "");
  }
  const snooze = normalizeAlertaSnooze(d.alertaSnooze);
  if (snooze) base.alertaSnooze = snooze;
  if (!base.clickup) delete base.clickup;
  if (!base.clickupTaskId) delete base.clickupTaskId;
  if (!base.historicoStatus.length) {
    const t = base.createdAt;
    base.historicoStatus = [{ status: base.status, inicio: t, fim: "", observacao: "" }];
  } else {
    const last = base.historicoStatus[base.historicoStatus.length - 1];
    if (last && last.status !== base.status) {
      base.historicoStatus = statusHistoryPush({ historicoStatus: base.historicoStatus.slice(0, -1) }, base.status, last.inicio);
    }
    if (!base.historicoStatus[base.historicoStatus.length - 1].fim && base.historicoStatus[base.historicoStatus.length - 1].status !== base.status) {
      /* noop */
    }
  }
  const eb = normalizeEditingBy(d.editingBy);
  if (eb) base.editingBy = eb;
  base.__isMigrated = true;
  return base;
}

function formatDur(ms) {
  if (ms == null || Number.isNaN(ms)) return "—";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h || d) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(" ");
}

function msToChartDays(ms) {
  return Math.round((ms / 86400000) * 10) / 10;
}

function demandaTempoPorFase(d, cfg = DASH_TEMPO_CFG_OP) {
  const dm = migrateDemanda(d);
  const linha = cfg.linhaEsteira || LINHA_ESTEIRA_OPERACIONAL;
  const statusAtual = resolveStatusKey(dm.status, linha);
  const map = {};

  for (const seg of dm.historicoStatus || []) {
    const statusKey = resolveStatusKey(seg.status, linha);
    if (cfg.isStatusExcluded(statusKey)) continue;

    /** Card em Aprovação BP: segmento aberto (stand-by) não entra no SLA — evita inflar Comercial. */
    if (linha === LINHA_ESTEIRA_B2B && !seg.fim && statusAtual === "aprovacao_bp") {
      continue;
    }

    const ms = timelineSegmentMs(seg);
    if (!ms) continue;
    map[statusKey] = (map[statusKey] || 0) + ms;
  }
  return map;
}

function aggregateTempoEsteira(rows, cfg = DASH_TEMPO_CFG_OP) {
  const setores = cfg.setores || SETORES_ESTEIRA;
  const byFase = {};
  const bySetor = Object.fromEntries(setores.map((s) => [s, 0]));
  const bySetorCount = Object.fromEntries(setores.map((s) => [s, 0]));
  const byFaseCount = {};

  for (const { d } of rows) {
    const porFase = demandaTempoPorFase(d, cfg);
    const touched = new Set();
    const setorMs = Object.fromEntries(setores.map((s) => [s, 0]));
    for (const [status, ms] of Object.entries(porFase)) {
      byFase[status] = (byFase[status] || 0) + ms;
      const setor = cfg.setorForStatus(status);
      if (setor) {
        bySetor[setor] += ms;
        setorMs[setor] += ms;
      }
      touched.add(status);
    }
    for (const s of touched) byFaseCount[s] = (byFaseCount[s] || 0) + 1;
    for (const s of setores) {
      if (setorMs[s] > 0) bySetorCount[s] += 1;
    }
  }

  const totalMs = Object.values(byFase).reduce((a, b) => a + b, 0);
  return { byFase, bySetor, bySetorCount, byFaseCount, totalMs, n: rows.length };
}

function timelineSegmentMs(seg) {
  const start = Date.parse(seg.inicio);
  if (!Number.isFinite(start)) return 0;
  const endRaw = seg.fim ? Date.parse(seg.fim) : Date.now();
  if (!Number.isFinite(endRaw)) return 0;
  const ms = Math.max(0, endRaw - start);
  const maxMs = 86400000 * 365 * 15;
  return ms > maxMs ? 0 : ms;
}

function getOpenDialog() {
  const list = document.querySelectorAll("dialog[open]");
  return list.length ? list[list.length - 1] : null;
}

/** `<dialog showModal>` fica acima de `position:fixed` — o toast entra no modal aberto. */
function syncToastHost() {
  if (!toastEl) return;
  const dlg = getOpenDialog();
  if (dlg) {
    const inner = dlg.querySelector(".modal__inner") || dlg;
    if (toastEl.parentElement !== inner) {
      inner.insertBefore(toastEl, inner.firstChild);
    }
    toastEl.classList.add("toast--in-modal");
  } else {
    if (toastEl.parentElement !== document.body) {
      document.body.appendChild(toastEl);
    }
    toastEl.classList.remove("toast--in-modal");
  }
}

function initToastDialogHosts() {
  document.querySelectorAll("dialog").forEach((dlg) => {
    dlg.addEventListener("close", syncToastHost);
  });
}

function toast(msg) {
  if (!toastEl) return;
  syncToastHost();
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { toastEl.hidden = true; }, 2600);
}

let confirmDialogResolve = null;

function initConfirmDialog() {
  const dlg = document.getElementById("modalConfirm");
  const btnOk = document.getElementById("confirmDialogOk");
  const btnCancel = document.getElementById("confirmDialogCancel");
  if (!dlg || !btnOk || !btnCancel) return;

  const finish = (ok) => {
    if (!confirmDialogResolve) return;
    const resolve = confirmDialogResolve;
    confirmDialogResolve = null;
    dlg.close();
    resolve(ok);
  };

  btnOk.addEventListener("click", () => finish(true));
  btnCancel.addEventListener("click", () => finish(false));
  dlg.addEventListener("cancel", (e) => {
    e.preventDefault();
    finish(false);
  });
  dlg.addEventListener("close", () => {
    if (confirmDialogResolve) finish(false);
  });
}

/**
 * Diálogo de confirmação no estilo do sistema (substitui window.confirm).
 * @returns {Promise<boolean>}
 */
function confirmDialog({
  title = "Confirmar",
  message = "",
  hint = "",
  details = null,
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  variant = "danger",
} = {}) {
  const dlg = document.getElementById("modalConfirm");
  const titleEl = document.getElementById("confirmDialogTitle");
  const msgEl = document.getElementById("confirmDialogMessage");
  const hintEl = document.getElementById("confirmDialogHint");
  const detailsEl = document.getElementById("confirmDialogDetails");
  const btnOk = document.getElementById("confirmDialogOk");
  const btnCancel = document.getElementById("confirmDialogCancel");
  if (!dlg || !titleEl || !btnOk || !btnCancel) {
    return Promise.resolve(window.confirm([title, message].filter(Boolean).join("\n\n")));
  }

  dlg.classList.remove("confirm-dialog--danger", "confirm-dialog--warn", "confirm-dialog--default");
  dlg.classList.add(
    variant === "warn" ? "confirm-dialog--warn" : variant === "default" ? "confirm-dialog--default" : "confirm-dialog--danger",
  );

  titleEl.textContent = title;
  if (msgEl) {
    msgEl.textContent = message;
    msgEl.hidden = !message;
  }
  if (hintEl) {
    hintEl.textContent = hint;
    hintEl.hidden = !hint;
  }
  if (detailsEl) {
    const rows = Array.isArray(details) ? details.filter((d) => d && d.label) : [];
    if (rows.length) {
      detailsEl.innerHTML = rows
        .map(
          (d) =>
            "<div><dt>" +
            escapeHtml(d.label) +
            "</dt><dd>" +
            escapeHtml(String(d.value ?? "—")) +
            "</dd></div>",
        )
        .join("");
      detailsEl.hidden = false;
    } else {
      detailsEl.innerHTML = "";
      detailsEl.hidden = true;
    }
  }
  btnOk.textContent = confirmText;
  btnCancel.textContent = cancelText || "Cancelar";
  btnCancel.hidden = !cancelText;
  btnOk.className = variant === "default" ? "btn btn--primary" : "btn btn--danger";

  return new Promise((resolve) => {
    confirmDialogResolve = resolve;
    dlg.showModal();
    requestAnimationFrame(() => btnOk.focus());
  });
}

function usuariosModalAberto() {
  return document.getElementById("panelUsuarios")?.open === true;
}

function openUsuariosModal() {
  if (!isAdminUser()) {
    toast("Apenas administrador acessa Usuarios");
    return;
  }
  const dlg = document.getElementById("panelUsuarios");
  if (!dlg) return;
  if (!dlg.open) dlg.showModal();
  renderUsuariosPanel();
}

function switchMainTab(tab) {
  if (tab === "diarias" || tab === "projetistas" || tab === "usuarios") tab = "esteira";
  updateTopbarTitle(tab);
  document.querySelectorAll(".tabs__btn[data-tab]").forEach((b) => {
    const on = b.dataset.tab === tab;
    b.classList.toggle("is-active", on);
    if (on) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  Object.entries(panels).forEach(([k, el]) => {
    if (!el) return;
    const on = k === tab;
    el.classList.toggle("is-visible", on);
    el.hidden = !on;
  });
  if (tab === "dashboard") renderDashboard();
  if (tab === "esteira") renderBoard();
  if (isMobileShell()) setMobileSidebarOpen(false);
}
