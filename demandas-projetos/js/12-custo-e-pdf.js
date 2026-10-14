/**
 * Levantamento de custo, leitura do PDF, portas e lançamento.
 * Só declarações (funções e constantes); o que roda ao abrir a página fica em app.js.
 */
function normalizePdfLevantamento(v) {
  if (!v || typeof v !== "object") return null;
  const name = String(v.name || "").trim();
  if (!name) return null;
  const dataUrl = typeof v.dataUrl === "string" ? v.dataUrl : "";
  return {
    id: v.id || uid(),
    name,
    dataUrl: dataUrl.length > 0 && dataUrl.length < 900000 ? dataUrl : "",
    uploadedAt: v.uploadedAt || "",
  };
}

function formatBr() {
  return window.DemandasFormatBr || {};
}

function parseNumBrInput(raw) {
  const fn = formatBr().parseNumberBr;
  if (!fn) {
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : "";
  }
  return fn(raw);
}

function setCustoInputVal(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  if (val === "" || val == null) {
    el.value = "";
    return;
  }
  if (el.classList.contains("input-br-percent")) {
    el.value = formatBr().formatPercentBr ? formatBr().formatPercentBr(val) : val;
  } else if (el.classList.contains("input-br-money")) {
    el.value = formatBr().formatMoneyBr ? formatBr().formatMoneyBr(val) : val;
  } else if (el.classList.contains("input-br-int")) {
    el.value = formatBr().formatIntegerBr ? formatBr().formatIntegerBr(val) : val;
  } else {
    el.value = val;
  }
}

function formatInputBrOnBlur(el) {
  if (!el) return;
  const raw = el.value;
  if (raw.trim() === "") {
    el.value = "";
    return;
  }
  const n = parseNumBrInput(raw);
  if (n === "") {
    el.value = "";
    return;
  }
  if (el.classList.contains("input-br-percent")) {
    el.value = formatBr().formatPercentBr(n);
  } else if (el.classList.contains("input-br-money")) {
    el.value = formatBr().formatMoneyBr(n);
  } else if (el.classList.contains("input-br-int")) {
    el.value = formatBr().formatIntegerBr(n);
  }
}

function bindCustoNumberFormatting() {
  const onBlur = (e) => formatInputBrOnBlur(e.target);
  document.querySelectorAll(".input-br-money, .input-br-int").forEach((el) => {
    if (el.readOnly) return;
    el.addEventListener("blur", onBlur);
  });
  document.querySelectorAll(".lancamento-metragem").forEach((el) => {
    el.removeEventListener("blur", onBlur);
    el.addEventListener("blur", onBlur);
  });
}

function applyCustoToForm(custoRaw) {
  const c = normalizeCusto(custoRaw);
  document.getElementById("demTemLevantamento").value = c.temLevantamento ? "sim" : "nao";
  setCustoInputVal("custoValorProjeto", c.valorProjeto);
  document.getElementById("demTemPortas").value = c.temPortas ? "sim" : "nao";
  setCustoInputVal("custoQtdCasas", c.qtdCasas);
  setCustoInputVal("custoQtdPortasAtual", c.qtdPortasAtual);
  setCustoInputVal("custoQtdNovasPortas", c.qtdNovasPortas);
  setCustoInputVal("custoValorPorPortaNova", c.valorPorPortaNova);
  document.getElementById("demTemLancamento").value = c.temLancamento ? "sim" : "nao";
  editingLancamentoCabos = JSON.parse(JSON.stringify(c.lancamento?.cabos || []));
  const selExec = document.getElementById("custoExecucao");
  if (selExec) selExec.value = normalizeExecucaoCusto(c.execucao);
  const elCustoReg = document.getElementById("custoExecucaoRegional");
  const elCustoTer = document.getElementById("custoExecucaoTerceirizada");
  if (elCustoReg) setCustoInputVal("custoExecucaoRegional", c.custoRegional === "" ? "" : c.custoRegional);
  if (elCustoTer) setCustoInputVal("custoExecucaoTerceirizada", c.custoTerceirizada === "" ? "" : c.custoTerceirizada);
  toggleExecucaoCustoFields();
  toggleCustoFields();
  if (c.temLevantamento) {
    recalcCustoValores();
    recalcPenetracaoPortas();
    recalcValorPorPortaNova();
    renderLancamentoCabos();
  } else {
    editingLancamentoCabos = [];
    for (const id of [
      "custoValorProjeto",
      "custoValor5",
      "custoValorFinal",
      "custoQtdCasas",
      "custoQtdPortasAtual",
      "custoQtdNovasPortas",
      "custoPenetracaoAtual",
      "custoNovaPenetracao",
      "custoValorPorPortaNova",
      "custoTotalMetragem",
      "custoExecucaoRegional",
      "custoExecucaoTerceirizada",
    ]) {
      const el = document.getElementById(id);
      if (el) el.value = "";
    }
    const list = document.getElementById("lancamentoCabosList");
    if (list) list.innerHTML = "";
    togglePortasFields();
    toggleLancamentoFields();
  }
}

/** Zera custo e volta padrão (sem levantamento, execução «Não se aplica»). */
function resetCustoFormAfterPdfRemove() {
  applyCustoToForm(emptyCusto());
  pdfCustoAppliedInSession = false;
}

/** Itens revisáveis do PDF (um por linha da revisão), na ordem em que aparecem. */
function pdfItensRevisao(parsed) {
  const v = parsed?.values || {};
  const ev = parsed?.evidencias || {};
  const tem = (k) => v[k] !== "" && v[k] != null;
  const itens = [];
  const add = (chave, rotulo, valorTxt, trecho) => itens.push({ chave, rotulo, valorTxt, trecho: trecho || "" });
  if (tem("valorProjeto")) add("valorProjeto", "Valor do projeto (CAPEX)", `R$ ${pdfPreviewValor("valorProjeto", v.valorProjeto)}`, ev.valorProjeto);
  if (tem("qtdNovasPortas")) add("qtdNovasPortas", "Portas estimadas (novas)", pdfPreviewValor("qtdNovasPortas", v.qtdNovasPortas), ev.qtdNovasPortas);
  if (tem("qtdCasas")) add("qtdCasas", "Casas (HP)", pdfPreviewValor("qtdCasas", v.qtdCasas), ev.qtdCasas);
  if (tem("qtdPortasAtual")) add("qtdPortasAtual", "Portas existentes (HC)", pdfPreviewValor("qtdPortasAtual", v.qtdPortasAtual), ev.qtdPortasAtual);
  if (v.execucao) {
    const custos = [
      tem("custoRegional") ? `Regional R$ ${pdfPreviewValor("custoRegional", v.custoRegional)}` : "",
      tem("custoTerceirizada") ? `Terceirizada R$ ${pdfPreviewValor("custoTerceirizada", v.custoTerceirizada)}` : "",
    ].filter(Boolean);
    add("execucao", "Execução", [v.execucao, ...custos].join(" · "), ev.execucao);
  }
  for (const c of parsed?.cabos || []) {
    add(`cabo:${c.tipo}`, `Cabo ${c.tipo}`, `${pdfPreviewValor("qtdCasas", c.metragem)} m`, ev.cabos?.[c.tipo]);
  }
  return itens;
}

/** Campos que o PDF padrão costuma ter mas não foram encontrados (para preencher à mão). */
function pdfCamposNaoEncontrados(parsed) {
  const v = parsed?.values || {};
  const falta = [];
  if (v.valorProjeto === "" || v.valorProjeto == null) falta.push("Valor do projeto (CAPEX)");
  if (v.qtdNovasPortas === "" || v.qtdNovasPortas == null) falta.push("Portas estimadas");
  if (v.qtdCasas === "" || v.qtdCasas == null) falta.push("Casas (HP)");
  if (v.qtdPortasAtual === "" || v.qtdPortasAtual == null) falta.push("Portas existentes (HC)");
  if (!v.execucao) falta.push("Execução (mão de obra)");
  if (!parsed?.cabos?.length) falta.push("Cabos do lançamento");
  return falta;
}

/** Seleção da revisão: começa marcando só o que tem trecho do PDF que comprove o valor. */
let pdfSelecao = new Set();

function iniciarSelecaoPdf(parsed) {
  pdfSelecao = new Set(pdfItensRevisao(parsed).filter((it) => it.trecho).map((it) => it.chave));
}

function applyPdfCustoToForm(parsed, selecao = pdfSelecao) {
  if (!parsed) return;
  const v = parsed.values || {};
  const sel = (k) => selecao.has(k);
  const cabosSel = (parsed.cabos || []).filter((c) => sel(`cabo:${c.tipo}`));
  const portasSel = ["qtdNovasPortas", "qtdCasas", "qtdPortasAtual"].filter(sel);
  if (!sel("valorProjeto") && !sel("execucao") && !portasSel.length && !cabosSel.length) {
    toast("Marque ao menos um campo para aplicar");
    return;
  }
  // Só os campos marcados são alterados; o resto do formulário fica como está.
  document.getElementById("demTemLevantamento").value = "sim";
  toggleCustoFields();
  if (sel("valorProjeto")) {
    setCustoInputVal("custoValorProjeto", v.valorProjeto);
    recalcCustoValores();
  }
  if (sel("execucao") && v.execucao) {
    const selExec = document.getElementById("custoExecucao");
    if (selExec) selExec.value = normalizeExecucaoCusto(v.execucao);
    setCustoInputVal("custoExecucaoRegional", v.custoRegional);
    setCustoInputVal("custoExecucaoTerceirizada", v.custoTerceirizada);
    toggleExecucaoCustoFields();
  }
  if (portasSel.length) {
    document.getElementById("demTemPortas").value = "sim";
    togglePortasFields();
    const ids = { qtdCasas: "custoQtdCasas", qtdPortasAtual: "custoQtdPortasAtual", qtdNovasPortas: "custoQtdNovasPortas" };
    for (const k of portasSel) setCustoInputVal(ids[k], v[k]);
    recalcPenetracaoPortas();
    recalcValorPorPortaNova();
  }
  if (cabosSel.length) {
    document.getElementById("demTemLancamento").value = "sim";
    editingLancamentoCabos = cabosSel.map((c) => ({ id: uid(), tipo: c.tipo, metragem: c.metragem }));
    toggleLancamentoFields();
    renderLancamentoCabos();
    recalcTotalMetragem();
  }
  pdfCustoAppliedInSession = true;
  const n = (sel("valorProjeto") ? 1 : 0) + (sel("execucao") ? 1 : 0) + portasSel.length + cabosSel.length;
  toast(`${n} campo(s) do PDF aplicado(s) — confira e salve o projeto`);
}

function pdfPreviewValor(k, val) {
  if (k.startsWith("penetracao") || k === "novaPenetracao") {
    return formatBr().formatPercentBr ? formatBr().formatPercentBr(val) : String(val);
  }
  if (k.startsWith("valor") || k.startsWith("custo")) {
    return formatBr().formatMoneyBr ? formatBr().formatMoneyBr(val) : String(val);
  }
  if (k.startsWith("qtd") || k === "totalMetragem") {
    return formatBr().formatIntegerBr ? formatBr().formatIntegerBr(val) : String(val);
  }
  return String(val);
}

function setPdfPickLabel(text) {
  const label = document.getElementById("demPdfPickLabel");
  if (label) label.textContent = text;
}

function renderPdfLevantamentoPreview() {
  const wrap = document.getElementById("demPdfPreview");
  if (!wrap) return;

  if (!editingPdfLevantamento) {
    wrap.hidden = true;
    wrap.innerHTML = "";
    setPdfPickLabel("Escolher PDF");
    return;
  }
  setPdfPickLabel("Trocar PDF");

  wrap.hidden = false;
  const parsed = lastPdfParseResult;
  const itens = parsed ? pdfItensRevisao(parsed) : [];
  const faltando = parsed ? pdfCamposNaoEncontrados(parsed) : [];
  const warns = (parsed?.warnings || [])
    .map((w) => `<p class="pdf-custo-preview__warn">${escapeHtml(w)}</p>`)
    .join("");
  const canApply = itens.length > 0;
  const revisao = itens.length
    ? `<p class="pdf-rev__intro">Confira o que foi lido. <strong>Só os campos marcados serão aplicados</strong> — desmarque o que estiver errado.</p>` +
      `<ul class="pdf-rev">${itens
        .map(
          (it) =>
            `<li class="pdf-rev__item${it.trecho ? "" : " is-sem-trecho"}">` +
            `<label class="pdf-rev__linha"><input type="checkbox" data-pdf-sel="${escapeHtml(it.chave)}"${pdfSelecao.has(it.chave) ? " checked" : ""} />` +
            `<span class="pdf-rev__rotulo">${escapeHtml(it.rotulo)}</span><strong class="pdf-rev__valor">${escapeHtml(it.valorTxt)}</strong></label>` +
            (it.trecho
              ? `<q class="pdf-rev__trecho" title="Trecho do PDF">${escapeHtml(it.trecho)}</q>`
              : `<span class="pdf-rev__alerta">⚠ Não localizei a linha do PDF com este valor — confira antes de marcar.</span>`) +
            `</li>`,
        )
        .join("")}</ul>`
    : parsed
      ? `<p class="muted small">Nenhum campo reconhecido no PDF.</p>`
      : "";
  const faltandoHtml = faltando.length
    ? `<p class="pdf-rev__faltando"><strong>Não encontrados no PDF</strong> (preencha à mão se houver): ${escapeHtml(faltando.join(" · "))}</p>`
    : "";

  const pdfLink = editingPdfLevantamento.dataUrl
    ? `<a class="btn btn--ghost btn--sm" href="${editingPdfLevantamento.dataUrl}" download="${escapeHtml(editingPdfLevantamento.name)}" target="_blank" rel="noopener">Abrir PDF</a>`
    : `<span class="muted small">(arquivo salvo sem cópia local — envie de novo para reler)</span>`;

  wrap.innerHTML =
    `<div class="pdf-custo-preview__file">` +
    `<span class="pdf-custo-preview__name">${escapeHtml(editingPdfLevantamento.name)}</span>` +
    pdfLink +
    `<button type="button" class="btn btn--ghost btn--sm" id="btnPdfRemove">Remover PDF</button>` +
    `</div>` +
    warns +
    revisao +
    faltandoHtml +
    (canApply
      ? `<button type="button" class="btn btn--primary btn--sm" id="btnPdfApply">Aplicar ${pdfSelecao.size} campo(s) marcado(s)</button>`
      : "");

  wrap.querySelectorAll("[data-pdf-sel]").forEach((cb) => {
    cb.addEventListener("change", () => {
      if (cb.checked) pdfSelecao.add(cb.dataset.pdfSel);
      else pdfSelecao.delete(cb.dataset.pdfSel);
      const btn = document.getElementById("btnPdfApply");
      if (btn) {
        btn.textContent = `Aplicar ${pdfSelecao.size} campo(s) marcado(s)`;
        btn.disabled = pdfSelecao.size === 0;
      }
    });
  });

  document.getElementById("btnPdfRemove")?.addEventListener("click", () => {
    editingPdfLevantamento = null;
    lastPdfParseResult = null;
    const inp = document.getElementById("demPdfInput");
    if (inp) inp.value = "";
    resetCustoFormAfterPdfRemove();
    renderPdfLevantamentoPreview();
    toast("PDF removido — campos de custo zerados (padrão: Não se aplica)");
  });
  document.getElementById("btnPdfApply")?.addEventListener("click", () => {
    applyPdfCustoToForm(lastPdfParseResult, pdfSelecao);
  });
}

async function handleDemPdfUpload(file) {
  const api = window.DemandasPdfCusto;
  if (!api) {
    toast("Módulo de PDF não carregou. Recarregue com Ctrl+F5.");
    return;
  }
  if (file.size > 12 * 1024 * 1024) {
    toast("PDF muito grande (máx. 12 MB)");
    return;
  }
  const preview = document.getElementById("demPdfPreview");
  if (preview) {
    preview.hidden = false;
    preview.innerHTML = '<p class="muted small">Lendo PDF…</p>';
  }
  try {
    const extracted = await api.extractTextFromPdfFile(file);
    lastPdfParseResult = api.parseCustoText(extracted);
    iniciarSelecaoPdf(lastPdfParseResult);
    const dataUrl = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
    editingPdfLevantamento = {
      id: uid(),
      name: file.name,
      dataUrl: String(dataUrl).length < 900000 ? dataUrl : "",
      uploadedAt: new Date().toISOString(),
    };
    renderPdfLevantamentoPreview();
    const itens = pdfItensRevisao(lastPdfParseResult);
    const semTrecho = itens.filter((it) => !it.trecho).length;
    toast(
      itens.length
        ? `${itens.length} campo(s) lido(s) do PDF${semTrecho ? ` · ${semTrecho} para conferir` : ""} — revise e clique em Aplicar`
        : "Nenhum campo reconhecido no PDF — preencha à mão",
    );
  } catch (e) {
    console.error(e);
    lastPdfParseResult = null;
    editingPdfLevantamento = null;
    renderPdfLevantamentoPreview();
    toast(e.message || "Não foi possível ler o PDF");
  }
}

function clearPortasCustoForm() {
  const sel = document.getElementById("demTemPortas");
  if (sel) sel.value = "nao";
  for (const id of [
    "custoQtdCasas",
    "custoQtdPortasAtual",
    "custoQtdNovasPortas",
    "custoPenetracaoAtual",
    "custoNovaPenetracao",
    "custoValorPorPortaNova",
  ]) {
    const el = document.getElementById(id);
    if (el) el.value = "";
  }
  togglePortasFields();
}

function togglePortasFields() {
  const tem = document.getElementById("demTemPortas").value === "sim";
  const det = document.getElementById("portasDetalhes");
  if (det) det.classList.toggle("is-hidden", !tem);
  if (tem) recalcPenetracaoPortas();
}

function toggleLancamentoFields() {
  const tem = document.getElementById("demTemLancamento").value === "sim";
  const det = document.getElementById("lancamentoDetalhes");
  if (det) det.classList.toggle("is-hidden", !tem);
  if (tem && !editingLancamentoCabos.length) {
    editingLancamentoCabos = [{ id: uid(), tipo: TIPOS_CABO[0], metragem: "" }];
    renderLancamentoCabos();
  }
}

function toggleExecucaoCustoFields() {
  const execucao = readCustoExecucaoFromForm();
  const naoAplica = execucao === CUSTO_EXECUCAO_NAO_APLICA;
  const showRegional = !naoAplica && (execucao === "Regional" || execucao === "Regional + Terceirizada");
  const showTerceirizada = !naoAplica && (execucao === "Terceirizada" || execucao === "Regional + Terceirizada");
  const wrapReg = document.getElementById("execucaoCustoRegionalWrap");
  const wrapTer = document.getElementById("execucaoCustoTerceirizadaWrap");
  const det = document.getElementById("execucaoCustosDetalhes");
  if (det) {
    det.classList.toggle("is-hidden", naoAplica);
    det.hidden = naoAplica;
    det.classList.toggle("execucao-custos--duplo", showRegional && showTerceirizada);
  }
  if (wrapReg) {
    wrapReg.classList.toggle("is-hidden", !showRegional);
    wrapReg.hidden = !showRegional;
  }
  if (wrapTer) {
    wrapTer.classList.toggle("is-hidden", !showTerceirizada);
    wrapTer.hidden = !showTerceirizada;
  }
}

function toggleCustoFields() {
  const tem = document.getElementById("demTemLevantamento").value === "sim";
  const det = document.getElementById("custoDetalhes");
  if (det) det.classList.toggle("is-hidden", !tem);
  toggleExecucaoCustoFields();
  togglePortasFields();
  toggleLancamentoFields();
}

function syncLancamentoCabosFromDom() {
  editingLancamentoCabos = readLancamentoCabosFromDom();
}

function readLancamentoCabosFromDom() {
  const rows = [];
  document.querySelectorAll("#lancamentoCabosList .lancamento-row").forEach((row) => {
    const tipo = row.querySelector(".lancamento-tipo")?.value;
    const raw = row.querySelector(".lancamento-metragem")?.value;
    const parsed = raw === "" ? "" : parseNumBrInput(raw);
    const metragem = parsed === "" ? "" : Number(parsed);
    rows.push({
      id: row.dataset.id || uid(),
      tipo: TIPOS_CABO.includes(tipo) ? tipo : TIPOS_CABO[0],
      metragem: Number.isFinite(metragem) ? metragem : "",
    });
  });
  return rows;
}

function recalcTotalMetragem() {
  const el = document.getElementById("custoTotalMetragem");
  if (!el) return;
  const total = sumMetragemCabos(readLancamentoCabosFromDom());
  el.value = total === "" ? "" : formatBr().formatIntegerBr?.(total) ?? total;
}

function renderLancamentoCabos() {
  const list = document.getElementById("lancamentoCabosList");
  if (!list) return;
  if (document.getElementById("demTemLancamento")?.value === "sim" && editingLancamentoCabos.length === 0) {
    editingLancamentoCabos = [{ id: uid(), tipo: TIPOS_CABO[0], metragem: "" }];
  }
  list.innerHTML = "";
  const opts = TIPOS_CABO.map((t) => `<option value="${t}">${t}</option>`).join("");

  editingLancamentoCabos.forEach((cabo, idx) => {
    const row = document.createElement("div");
    row.className = "lancamento-row";
    row.dataset.id = cabo.id;
    row.innerHTML = `
      <label class="field field--compact">
        <span>Tipo do cabo</span>
        <select class="lancamento-tipo">${opts}</select>
      </label>
      <label class="field field--compact">
        <span>Metragem (m)</span>
        <input type="text" inputmode="decimal" class="lancamento-metragem input-br-int" placeholder="0" autocomplete="off" />
      </label>
      <button type="button" class="icon-btn lancamento-remove" aria-label="Remover cabo">×</button>
    `;
    row.querySelector(".lancamento-tipo").value = TIPOS_CABO.includes(cabo.tipo) ? cabo.tipo : TIPOS_CABO[0];
    const elMet = row.querySelector(".lancamento-metragem");
    elMet.value =
      cabo.metragem === "" ? "" : formatBr().formatIntegerBr?.(cabo.metragem) ?? cabo.metragem;
    elMet.addEventListener("blur", () => formatInputBrOnBlur(elMet));

    row.querySelector(".lancamento-tipo").addEventListener("change", () => {
      syncLancamentoCabosFromDom();
    });
    row.querySelector(".lancamento-metragem").addEventListener("input", recalcTotalMetragem);
    row.querySelector(".lancamento-remove").addEventListener("click", () => {
      syncLancamentoCabosFromDom();
      editingLancamentoCabos = editingLancamentoCabos.filter((c) => c.id !== cabo.id);
      renderLancamentoCabos();
    });
    list.appendChild(row);
  });

  recalcTotalMetragem();
  bindCustoNumberFormatting();
}

function roundMoney(n) {
  return Math.round(n * 100) / 100;
}

function parseMoneyInput(id) {
  const el = document.getElementById(id);
  if (!el || el.value.trim() === "") return null;
  const n = parseNumBrInput(el.value);
  return n === "" ? null : n;
}

/** Recalcula 5% e valor final a partir do valor do projeto (não digitáveis). */
function recalcCustoValores() {
  const el5 = document.getElementById("custoValor5");
  const elFinal = document.getElementById("custoValorFinal");
  const projeto = parseMoneyInput("custoValorProjeto");

  if (projeto != null) {
    const cinco = roundMoney(projeto * 0.05);
    if (el5) el5.value = formatBr().formatMoneyBr?.(cinco) ?? cinco;
    if (elFinal) elFinal.value = formatBr().formatMoneyBr?.(roundMoney(projeto + cinco)) ?? "";
  } else {
    if (el5) el5.value = "";
    if (elFinal) elFinal.value = "";
  }
  recalcValorPorPortaNova();
}

function recalcValorPorPortaNova() {
  const el = document.getElementById("custoValorPorPortaNova");
  if (!el || document.getElementById("demTemPortas").value !== "sim") return;
  const valorFinal = parseMoneyInput("custoValorFinal");
  const novas = parseNumBrInput(document.getElementById("custoQtdNovasPortas")?.value ?? "");
  const qtd = novas !== "" ? Number(novas) : null;
  if (valorFinal != null && qtd != null && qtd > 0) {
    const vpp = calcValorPorPortaNova(valorFinal, qtd);
    el.value = vpp === "" ? "" : formatBr().formatMoneyBr?.(vpp) ?? vpp;
  } else {
    el.value = "";
  }
}

function readCustoExecucaoFromForm() {
  return normalizeExecucaoCusto(document.getElementById("custoExecucao")?.value);
}

function readExecucaoCustosFromForm() {
  const num = (id) => {
    const v = document.getElementById(id)?.value;
    if (v === "" || v == null) return "";
    const n = parseNumBrInput(v);
    return n === "" ? "" : n;
  };
  return normalizeExecucaoCustos(
    {
      custoRegional: num("custoExecucaoRegional"),
      custoTerceirizada: num("custoExecucaoTerceirizada"),
    },
    readCustoExecucaoFromForm(),
  );
}

function readCustoFromForm() {
  const execucao = readCustoExecucaoFromForm();
  const execucaoCustos = readExecucaoCustosFromForm();
  const tem = document.getElementById("demTemLevantamento").value === "sim";
  if (!tem) return { ...emptyCusto(), execucao, ...execucaoCustos };
  const num = (id) => {
    const v = document.getElementById(id)?.value;
    if (v === "" || v == null) return "";
    const n = parseNumBrInput(v);
    return n === "" ? "" : n;
  };
  const valorProjeto = num("custoValorProjeto");
  const valor5 = valorProjeto !== "" ? roundMoney(valorProjeto * 0.05) : "";
  const valorFinal = valorProjeto !== "" ? roundMoney(valorProjeto * 1.05) : "";

  const temPortas = document.getElementById("demTemPortas").value === "sim";
  const qtdCasas = temPortas ? num("custoQtdCasas") : "";
  const qtdPortasAtual = temPortas ? num("custoQtdPortasAtual") : "";
  const qtdNovasPortas = temPortas ? num("custoQtdNovasPortas") : "";
  const penetracaoAtual = temPortas ? calcTaxaPenetracao(qtdPortasAtual, qtdCasas) : "";
  const portasTotais =
    temPortas && qtdPortasAtual !== ""
      ? Number(qtdPortasAtual) + (qtdNovasPortas !== "" ? Number(qtdNovasPortas) : 0)
      : "";
  const novaPenetracao = temPortas ? calcTaxaPenetracao(portasTotais, qtdCasas) : "";
  const valorPorPortaNova = temPortas ? calcValorPorPortaNova(valorFinal, qtdNovasPortas) : "";

  const temLancamento = document.getElementById("demTemLancamento").value === "sim";
  syncLancamentoCabosFromDom();
  const lancamento = temLancamento
    ? normalizeLancamento({ cabos: editingLancamentoCabos })
    : emptyLancamentoCusto();

  return {
    temLevantamento: true,
    temPortas,
    temLancamento,
    valorProjeto,
    valor5,
    valorFinal,
    ...(temPortas
      ? {
          qtdCasas,
          qtdPortasAtual,
          qtdNovasPortas,
          penetracaoAtual,
          novaPenetracao,
          valorPorPortaNova,
        }
      : emptyPortasCusto()),
    lancamento,
    execucao,
    ...execucaoCustos,
  };
}
