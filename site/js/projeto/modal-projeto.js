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

/* ---------- Segmento B2C: caixinhas (dá para marcar mais de um) e divisão do valor e das portas ---------- */
/** Divisão digitada (% por segmento), separada para valor e portas; sobrevive a desmarcar e marcar de novo. */
let demDivisaoSegmentosDigitada = { valor: {}, portas: {} };
const DIVISAO_ROTULOS = { valor: "Valor", portas: "Portas" };

function initDemSegmentoB2cSelect() {
  const box = document.getElementById("demSegmentosB2c");
  if (!box || box.dataset.inited === "1") return;
  box.dataset.inited = "1";
  box.innerHTML = SEGMENTOS_B2C.map(
    (s) =>
      `<label class="seg-b2c__op"><input type="checkbox" value="${escapeHtml(s)}" data-seg-b2c />` +
      `<span>${escapeHtml(s)}</span></label>`,
  ).join("");
  box.addEventListener("change", () => {
    renderDemDivisaoSegmentos();
    syncDemPlanejamentoTctField();
  });
  document.getElementById("demDivisaoSegmentosCampos")?.addEventListener("input", (e) => {
    const inp = e.target.closest("[data-div-seg]");
    if (!inp) return;
    const tipo = inp.dataset.divTipo;
    const v = Number(String(inp.value).replace(",", "."));
    demDivisaoSegmentosDigitada[tipo][inp.dataset.divSeg] = v;
    // Com dois segmentos, o outro da mesma linha completa os 100% sozinho.
    const outros = [...document.querySelectorAll(`#demDivisaoSegmentosCampos [data-div-tipo="${tipo}"]`)].filter((x) => x !== inp);
    if (outros.length === 1 && Number.isFinite(v) && v >= 0 && v <= 100) {
      const resto = Math.round((100 - v) * 10) / 10;
      outros[0].value = String(resto);
      demDivisaoSegmentosDigitada[tipo][outros[0].dataset.divSeg] = resto;
    }
    syncDemDivisaoSoma();
  });
  // A prévia «≈ R$ … / ≈ … portas» acompanha o custo enquanto ele é preenchido.
  document.getElementById("formDemanda")?.addEventListener("input", (e) => {
    if (!e.target.closest("#demDivisaoSegmentos")) syncDemDivisaoSoma();
  });
}

/** Segmentos marcados, na ordem de SEGMENTOS_B2C. */
function lerSegmentosB2cDoForm() {
  return [...document.querySelectorAll("#demSegmentosB2c [data-seg-b2c]:checked")].map((i) => i.value);
}

/** { valor: { TCR: 50, … }, portas: { TCR: 70, … } } como está nos campos. */
function lerDivisaoSegmentosDoForm() {
  const out = { valor: {}, portas: {} };
  document.querySelectorAll("#demDivisaoSegmentosCampos [data-div-seg]").forEach((i) => {
    out[i.dataset.divTipo][i.dataset.divSeg] = Number(String(i.value).replace(",", "."));
  });
  return out;
}

function definirSegmentosB2cNoForm(segs, divisao) {
  initDemSegmentoB2cSelect();
  const set = new Set(segs || []);
  document.querySelectorAll("#demSegmentosB2c [data-seg-b2c]").forEach((i) => (i.checked = set.has(i.value)));
  demDivisaoSegmentosDigitada = {
    valor: { ...divisaoSegmentosBruta(divisao, "valor") },
    portas: { ...divisaoSegmentosBruta(divisao, "portas") },
  };
  renderDemDivisaoSegmentos();
}

/** Partes iguais em % (a primeira fica com o resto: 34/33/33). */
function divisaoIgual(segs) {
  const base = Math.floor(1000 / segs.length) / 10;
  const out = Object.fromEntries(segs.map((s) => [s, base]));
  out[segs[0]] = Math.round((100 - base * (segs.length - 1)) * 10) / 10;
  return out;
}

function renderDemDivisaoSegmentos() {
  const box = document.getElementById("demDivisaoSegmentos");
  const campos = document.getElementById("demDivisaoSegmentosCampos");
  if (!box || !campos) return;
  const segs = lerSegmentosB2cDoForm();
  const multi = segs.length > 1;
  box.hidden = !multi;
  if (!multi) {
    campos.innerHTML = "";
    syncDemDivisaoSoma();
    return;
  }
  campos.style.setProperty("--n", String(segs.length));
  const cabecalho =
    `<span class="seg-divisao__th" aria-hidden="true"></span>` +
    segs.map((s) => `<span class="seg-divisao__th"><span class="badge badge--segmento-b2c">${escapeHtml(s)}</span></span>`).join("") +
    `<span class="seg-divisao__th seg-divisao__th--total">Total</span>`;
  const linhas = DIVISAO_SEGMENTOS_TIPOS.map((tipo) => {
    // Se a divisão guardada não fecha 100% para os segmentos marcados agora, começa em partes iguais.
    const guardada = demDivisaoSegmentosDigitada[tipo];
    const soma = segs.reduce((t, s) => t + (Number.isFinite(Number(guardada[s])) ? Number(guardada[s]) : NaN), 0);
    if (!Number.isFinite(soma) || Math.abs(soma - 100) > 0.5) Object.assign(guardada, divisaoIgual(segs));
    return (
      `<span class="seg-divisao__rot">${DIVISAO_ROTULOS[tipo]}</span>` +
      segs
        .map(
          (s) =>
            `<label class="seg-divisao__celula">` +
            `<span class="seg-divisao__entrada"><input type="number" min="0" max="100" step="0.1" inputmode="decimal" data-div-seg="${escapeHtml(s)}" data-div-tipo="${tipo}" ` +
            `value="${escapeHtml(String(guardada[s] ?? ""))}" aria-label="${DIVISAO_ROTULOS[tipo]}: parte do ${escapeHtml(s)} em %" /><span aria-hidden="true">%</span></span>` +
            `<small class="seg-divisao__previa" data-previa-seg="${escapeHtml(s)}" data-previa-tipo="${tipo}"></small></label>`,
        )
        .join("") +
      `<span class="seg-divisao__soma" data-soma-tipo="${tipo}" aria-live="polite"></span>`
    );
  }).join("");
  campos.innerHTML = cabecalho + linhas;
  syncDemDivisaoSoma();
}

/** Total de cada linha (precisa somar 100%) e a prévia de quanto cada % representa. */
function syncDemDivisaoSoma() {
  const div = lerDivisaoSegmentosDoForm();
  let custo = null;
  try {
    custo = readCustoFromForm();
  } catch (_) {}
  const totalValor = custo ? Number(demandaValorFinal({ custo })) || 0 : 0;
  const totalPortas = custo ? Number(demandaPortasNovas({ custo })) || 0 : 0;
  for (const tipo of DIVISAO_SEGMENTOS_TIPOS) {
    const el = document.querySelector(`#demDivisaoSegmentosCampos [data-soma-tipo="${tipo}"]`);
    if (!el) continue;
    const vals = Object.values(div[tipo]);
    const soma = Math.round(vals.reduce((t, n) => t + (Number.isFinite(n) ? n : 0), 0) * 10) / 10;
    const ok = Math.abs(soma - 100) <= 0.5;
    const dif = Math.round((100 - soma) * 10) / 10;
    el.textContent = ok
      ? "✓ 100%"
      : `${String(soma).replace(".", ",")}% · ${dif > 0 ? "faltam" : "sobram"} ${String(Math.abs(dif)).replace(".", ",")}%`;
    el.classList.toggle("is-bad", !ok);
  }
  document.querySelectorAll("#demDivisaoSegmentosCampos [data-previa-seg]").forEach((el) => {
    const pct = Number(div[el.dataset.previaTipo]?.[el.dataset.previaSeg]) || 0;
    if (el.dataset.previaTipo === "valor") el.textContent = totalValor > 0 ? `≈ ${formatBRL((totalValor * pct) / 100)}` : "";
    else el.textContent = totalPortas > 0 ? `≈ ${Math.round((totalPortas * pct) / 100)} portas` : "";
  });
}

function syncDemSegmentoB2cField() {
  initDemSegmentoB2cSelect();
  const field = document.getElementById("fieldDemSegmentoB2c");
  if (!field) return;
  const isB2c = normalizeTipo(document.getElementById("demTipo")?.value) === "B2C";
  field.hidden = !isB2c;
  field.classList.toggle("is-hidden", !isB2c);
  document.querySelectorAll("#demSegmentosB2c [data-seg-b2c]").forEach((i) => {
    i.disabled = !isB2c;
    if (!isB2c) i.checked = false;
  });
  if (!isB2c) renderDemDivisaoSegmentos();
}

function initDemPlanejamentoTctSelect() {
  const sel = document.getElementById("demPlanejamentoTct");
  if (!sel || sel.dataset.inited === "1") return;
  sel.dataset.inited = "1";
  sel.innerHTML =
    '<option value="">Selecione…</option>' +
    Object.entries(PLANEJAMENTO_TCT.opcoes).map(([v, l]) => `<option value="${escapeHtml(v)}">${escapeHtml(l)}</option>`).join("");
  const rotulo = document.getElementById("labelDemPlanejamentoTct");
  if (rotulo) rotulo.textContent = PLANEJAMENTO_TCT.rotulo;
}

/** Só aparece (e é obrigatório) em projeto B2C do segmento TCT. */
function syncDemPlanejamentoTctField() {
  initDemPlanejamentoTctSelect();
  const field = document.getElementById("fieldDemPlanejamentoTct");
  const sel = document.getElementById("demPlanejamentoTct");
  if (!field || !sel) return;
  const tct = demandaEhTct({ tipo: document.getElementById("demTipo")?.value, segmentosB2c: lerSegmentosB2cDoForm() });
  field.hidden = !tct;
  field.classList.toggle("is-hidden", !tct);
  sel.required = tct;
  sel.disabled = !tct;
}

function syncDemCamposPorTipo() {
  syncDemProdutoB2bField();
  syncDemSegmentoB2cField();
  syncDemPlanejamentoTctField();
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
