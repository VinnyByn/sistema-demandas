/**
 * Modal do projeto: campos, selects e sincronização do formulário.
 * Só declarações (funções e constantes); o que roda ao abrir a página fica em app.js.
 */
let demandaModalClosingFromApi = false;

function setDemandaModalScrollLock(locked) {
  const html = document.documentElement;
  const body = document.body;
  if (locked) {
    if (body.dataset.demandaScrollLock === "1") return;
    const snap = snapshotPageScroll();
    body.dataset.demandaScrollLock = "1";
    body.dataset.demandaScrollY = String(snap.y);
    body.dataset.demandaScrollX = String(snap.x);
    body.style.position = "fixed";
    body.style.top = `-${snap.y}px`;
    body.style.left = `-${snap.x}px`;
    body.style.right = "0";
    body.style.width = "100%";
    html.classList.add("demanda-modal-open");
    return;
  }
  if (body.dataset.demandaScrollLock !== "1") {
    html.classList.remove("demanda-modal-open");
    return;
  }
  const y = Number(body.dataset.demandaScrollY || 0);
  const x = Number(body.dataset.demandaScrollX || 0);
  body.style.position = "";
  body.style.top = "";
  body.style.left = "";
  body.style.right = "";
  body.style.width = "";
  delete body.dataset.demandaScrollLock;
  delete body.dataset.demandaScrollY;
  delete body.dataset.demandaScrollX;
  html.classList.remove("demanda-modal-open");
  window.scrollTo(x, y);
}

function snapshotPageScroll() {
  const locked = document.body.dataset.demandaScrollLock === "1";
  const boards = [...document.querySelectorAll(".board")].map((board) => ({
    id: board.id || "",
    left: board.scrollLeft || 0,
    top: board.scrollTop || 0,
    cols: [...board.querySelectorAll(".column")].map((col) => ({
      status: col.dataset.status || "",
      top: col.querySelector(".column__body")?.scrollTop || 0,
    })),
  }));
  return {
    x: locked
      ? Number(document.body.dataset.demandaScrollX || 0)
      : window.scrollX || document.documentElement.scrollLeft || 0,
    y: locked
      ? Number(document.body.dataset.demandaScrollY || 0)
      : window.scrollY || document.documentElement.scrollTop || 0,
    boards,
  };
}

function restorePageScroll(snap) {
  if (!snap) return;
  const apply = () => {
    window.scrollTo(snap.x, snap.y);
    for (const b of snap.boards) {
      const board = b.id ? document.getElementById(b.id) : null;
      if (!board) continue;
      board.scrollLeft = b.left;
      board.scrollTop = b.top;
      for (const c of b.cols) {
        const sel = c.status ? `.column[data-status="${CSS.escape(c.status)}"] .column__body` : ".column__body";
        const body = board.querySelector(sel);
        if (body) body.scrollTop = c.top;
      }
    }
  };
  apply();
  requestAnimationFrame(() => {
    apply();
    requestAnimationFrame(apply);
  });
}

function initDemandaModalScrollLock() {
  if (!modalDemanda) return;
  modalDemanda.addEventListener("close", () => {
    if (demandaModalClosingFromApi) return;
    const scrollSnap = snapshotPageScroll();
    const id = editingDemandaOpenId;
    stopPresenceHeartbeat();
    if (id) releaseDemandaEditing(id);
    editingDemandaOpenId = null;
    editingDemandaBaselineUpdatedAt = "";
    hideDemandaModalAlerts();
    setDemandaModalScrollLock(false);
    if (panels.esteira && !panels.esteira.hidden) renderBoard();
    restorePageScroll(scrollSnap);
    restoreDashGeoListaIfNeeded();
  });
  const findScrollableAncestor = (start, root) => {
    let n = start instanceof Element ? start : start?.parentElement;
    while (n) {
      const style = n instanceof Element ? getComputedStyle(n) : null;
      if (style) {
        const oy = style.overflowY;
        if ((oy === "auto" || oy === "scroll" || oy === "overlay") && n.scrollHeight > n.clientHeight + 1) {
          return n;
        }
      }
      if (n === root) break;
      n = n.parentElement;
    }
    return null;
  };
  const canScrollY = (el, deltaY) => {
    if (deltaY < 0) return el.scrollTop > 0;
    return el.scrollTop + el.clientHeight < el.scrollHeight - 1;
  };
  const blockScrollBehind = (e) => {
    const openDlg = document.querySelector("dialog[open]");
    if (!openDlg) return;
    if (openDlg.contains(e.target)) {
      if (e.type === "wheel") {
        const scrollEl = findScrollableAncestor(e.target, openDlg);
        if (scrollEl && canScrollY(scrollEl, e.deltaY)) return;
        e.preventDefault();
      }
      return;
    }
    e.preventDefault();
  };
  document.addEventListener("wheel", blockScrollBehind, { passive: false, capture: true });
  document.addEventListener("touchmove", blockScrollBehind, { passive: false, capture: true });
}

function fillStatusSelect(linha = editingLinhaEsteira) {
  if (!demStatusSel) return;
  const cfg = getEsteiraConfig(linha);
  demStatusSel.innerHTML = "";
  for (const [k, lab] of [...cfg.statusOrder, ...cfg.statusExtra]) {
    const o = document.createElement("option");
    o.value = k;
    o.textContent = lab;
    demStatusSel.appendChild(o);
  }
}

function fillSelectOptions(sel, options, preserveValue) {
  if (!sel) return;
  const cur = preserveValue !== false ? sel.value : "";
  sel.innerHTML = "";
  for (const o of options) {
    const opt = document.createElement("option");
    opt.value = o.value;
    opt.textContent = o.label;
    sel.appendChild(opt);
  }
  if (cur && [...sel.options].some((opt) => opt.value === cur)) sel.value = cur;
}

function dashProjetistaFilterOptions() {
  return [
    { value: "", label: "Selecione…" },
    { value: FILTER_PROJETISTA_TODOS, label: "Todos os projetistas" },
    ...allProjetistasNomes().map((n) => ({ value: n, label: n })),
    { value: "__none__", label: "Não atribuído" },
  ];
}

function fillDashProjetistaFilterSelects() {
  const opts = dashProjetistaFilterOptions();
  for (const id of [
    "filterDashCfResp",
    "filterDashTempoResp",
    "filterDashTempoB2bResp",
    "filterDashPeResp",
  ]) {
    fillSelectOptions(document.getElementById(id), opts);
  }
}

function initProjetistaSelects() {
  fillDemResponsavelSelect(LINHA_ESTEIRA_OPERACIONAL);
  fillFilterDashProjetistaResumo();
  fillDashProjetistaFilterSelects();
}

function diariaRespClass(resp) {
  const map = {
    Matheus: "matheus",
    Vinicius: "vinicius",
    "João": "joao",
    Daniel: "daniel",
    Alberto: "alberto",
    Rafael: "rafael",
  };
  return map[resp] || "outros";
}

function readValorProjetoRealizadoFromForm() {
  const v = document.getElementById("demValorProjetoRealizado")?.value;
  const n = parseFloat(v);
  return v === "" || Number.isNaN(n) ? "" : parseCustoMoney(n);
}

function syncDemConclusaoFields() {
  const concluido = isStatusConcluidoNoFormulario(demStatusSel?.value, editingLinhaEsteira);
  const inpTermino = document.getElementById("demDataTermino");
  if (inpTermino) {
    inpTermino.disabled = !concluido;
    if (concluido && !inpTermino.value) inpTermino.value = todayISODate();
  }
}

function initDemProdutoB2bSelect() {
  const sel = document.getElementById("demProdutoB2b");
  if (!sel || sel.dataset.inited === "1") return;
  sel.dataset.inited = "1";
  sel.innerHTML =
    '<option value="">Selecione o produto…</option>' +
    PRODUTOS_B2B.map((p) => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join("");
}

function syncDemProdutoB2bField() {
  const field = document.getElementById("fieldDemProdutoB2b");
  const sel = document.getElementById("demProdutoB2b");
  const labelTipo = document.getElementById("labelDemTipo");
  const labelProduto = document.getElementById("labelDemProduto");
  if (!field || !sel) return;
  const isB2b = normalizeTipo(document.getElementById("demTipo")?.value) === "B2B";
  field.hidden = !isB2b;
  field.classList.toggle("is-hidden", !isB2b);
  sel.required = isB2b;
  sel.disabled = !isB2b;
  if (!isB2b) sel.value = "";
  labelTipo?.classList.toggle("field-label--required", !isB2b);
  labelProduto?.classList.toggle("field-label--required", isB2b);
}

function initDemSegmentoB2cSelect() {
  const sel = document.getElementById("demSegmentoB2c");
  if (!sel || sel.dataset.inited === "1") return;
  sel.dataset.inited = "1";
  sel.innerHTML =
    '<option value="">Selecione o segmento…</option>' +
    SEGMENTOS_B2C.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");
}

function syncDemSegmentoB2cField() {
  const field = document.getElementById("fieldDemSegmentoB2c");
  const sel = document.getElementById("demSegmentoB2c");
  if (!field || !sel) return;
  const isB2c = normalizeTipo(document.getElementById("demTipo")?.value) === "B2C";
  field.hidden = !isB2c;
  field.classList.toggle("is-hidden", !isB2c);
  sel.required = isB2c;
  sel.disabled = !isB2c;
  if (!isB2c) sel.value = "";
}

function syncDemCamposPorTipo() {
  syncDemProdutoB2bField();
  syncDemSegmentoB2cField();
  syncDemSolicitanteField();
}

function initDemSetorSolicitanteB2bSelect() {
  const sel = document.getElementById("demSetorSolicitanteB2b");
  if (!sel || sel.dataset.inited === "1") return;
  sel.dataset.inited = "1";
  sel.innerHTML = SETORES_SOLICITANTE_B2B.map(
    (s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`,
  ).join("");
}

function initDemSolicitanteB2bSelect() {
  const sel = document.getElementById("demSolicitanteB2b");
  if (!sel || sel.dataset.inited === "1") return;
  sel.dataset.inited = "1";
  sel.innerHTML =
    '<option value="">Selecione o solicitante…</option>' +
    SOLICITANTES_B2B_COMERCIAL.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");
}

function readSolicitanteFromForm() {
  const isB2b = normalizeTipo(document.getElementById("demTipo")?.value) === "B2B";
  if (isB2b) return document.getElementById("demSolicitanteB2b")?.value.trim() || "";
  return document.getElementById("demSolicitante")?.value.trim() || "";
}

function readSetorSolicitanteB2bFromForm() {
  const isB2b = normalizeTipo(document.getElementById("demTipo")?.value) === "B2B";
  if (!isB2b) return "";
  return document.getElementById("demSetorSolicitanteB2b")?.value || SETORES_SOLICITANTE_B2B[0];
}

function syncDemSolicitanteField() {
  const fieldSetor = document.getElementById("fieldDemSetorSolicitanteB2b");
  const selSetor = document.getElementById("demSetorSolicitanteB2b");
  const fieldSel = document.getElementById("fieldDemSolicitanteB2b");
  const selSol = document.getElementById("demSolicitanteB2b");
  const fieldText = document.getElementById("fieldDemSolicitanteText");
  const inpText = document.getElementById("demSolicitante");
  if (!fieldSetor || !fieldSel || !fieldText || !inpText) return;
  const isB2b = normalizeTipo(document.getElementById("demTipo")?.value) === "B2B";
  fieldSetor.hidden = !isB2b;
  fieldSetor.classList.toggle("is-hidden", !isB2b);
  fieldSel.hidden = !isB2b;
  fieldSel.classList.toggle("is-hidden", !isB2b);
  fieldText.hidden = isB2b;
  fieldText.classList.toggle("is-hidden", isB2b);
  if (selSetor) {
    selSetor.required = isB2b;
    selSetor.disabled = !isB2b;
    if (isB2b && !selSetor.value) selSetor.value = SETORES_SOLICITANTE_B2B[0];
  }
  if (selSol) {
    selSol.required = isB2b;
    selSol.disabled = !isB2b;
    if (!isB2b) selSol.value = "";
  }
  inpText.required = false;
  inpText.disabled = isB2b;
  if (isB2b) inpText.value = "";
}

function syncDemandaLinhaFromTipo() {
  const tipo = normalizeTipo(document.getElementById("demTipo")?.value);
  editingLinhaEsteira = inferLinhaEsteira({ tipo });
  fillDemResponsavelSelect(editingLinhaEsteira);
  const prevSt = demStatusSel?.value || "";
  fillStatusSelect(editingLinhaEsteira);
  if (demStatusSel) {
    demStatusSel.value = mapStatusParaLinha(prevSt, editingLinhaEsteira);
  }
  syncDemCamposPorTipo();
  syncDemConclusaoFields();
  syncMotivosAtrasoField();
  syncDiasAbertoResumo();
}

let editingImages = [];
let editingPdfLevantamento = null;
let lastPdfParseResult = null;
/** Custo ao abrir o modal — restaurado ao remover PDF após aplicar dados. */
let editingCustoBaseline = null;
let pdfCustoAppliedInSession = false;
let editingLancamentoCabos = [];
let editingComentarios = [];
let editingChecklist = [];
let editingChecklistItemId = "";

function checklistNextLabel(items) {
  const pending = items.find((it) => !it.done);
  if (!items.length) return "Nenhuma atividade ainda";
  return pending ? `Próximo: ${pending.name}` : "Checklist das tarefas do projeto completo";
}

function renderChecklistDots(el, items) {
  if (!el) return;
  el.innerHTML = items
    .map((it) => `<span class="card__checklist-dot${it.done ? " is-on" : ""}"></span>`)
    .join("");
}

function createChecklistField({ id, label, type = "text", value = "", maxLength, placeholder, multiline = false }) {
  const wrap = document.createElement("label");
  wrap.className = "field" + (multiline ? " field--span" : "");
  const span = document.createElement("span");
  span.textContent = label;
  const input = document.createElement(multiline ? "textarea" : "input");
  input.id = id;
  if (!multiline) input.type = type;
  else input.rows = 2;
  input.value = value || "";
  input.autocomplete = "off";
  if (maxLength) input.maxLength = maxLength;
  if (placeholder) input.placeholder = placeholder;
  wrap.append(span, input);
  return { wrap, input };
}
