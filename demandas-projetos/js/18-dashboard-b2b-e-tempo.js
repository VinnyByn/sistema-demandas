/**
 * Dashboard: B2B, tempo por etapa e períodos.
 * Só declarações (funções e constantes); o que roda ao abrir a página fica em app.js.
 */
function produtoB2bCor(prod) {
  const par = PRODUTO_B2B_CORES[prod];
  if (!par) return "#94a3b8";
  return document.documentElement.getAttribute("data-theme") === "light" ? par[0] : par[1];
}

function produtoB2bBucket(d) {
  const dm = migrateDemanda(d);
  return normalizeProdutoB2b(dm.produtoB2b) || B2B_PRODUTO_SEM;
}

function buildProdutoB2bMatrix(demandas, rowKeys, keyFn) {
  const cols = [...PRODUTOS_B2B, B2B_PRODUTO_SEM];
  const matrix = Object.fromEntries(
    rowKeys.map((k) => [k, Object.fromEntries(cols.map((p) => [p, 0]))]),
  );
  demandas.forEach((d) => {
    const prod = produtoB2bBucket(d);
    for (const key of [...new Set(resolveGeoKeys(d, keyFn))]) {
      if (!matrix[key] || matrix[key][prod] === undefined) continue;
      matrix[key][prod] += 1;
    }
  });
  return matrix;
}

function activeProdutoB2bCols(matrix, rowKeys) {
  const cols = [...PRODUTOS_B2B];
  if (rowKeys.some((k) => (matrix[k]?.[B2B_PRODUTO_SEM] || 0) > 0)) cols.push(B2B_PRODUTO_SEM);
  return cols.filter((p) => rowKeys.some((k) => (matrix[k]?.[p] || 0) > 0));
}

function renderDashProdutoB2bPorGrupo(canvasId, tableId, tableRowHeader, demandas, groupRows, keyFn, topN = 12) {
  const topRows = groupRows.slice(0, topN);
  const rowKeys = topRows.map((r) => r.cidade);
  const matrix = buildProdutoB2bMatrix(demandas, rowKeys, keyFn);
  const produtos = activeProdutoB2bCols(matrix, rowKeys);
  const datasets = produtos
    .map((prod) => ({
      label: prod,
      data: rowKeys.map((k) => matrix[k][prod] || 0),
      backgroundColor: produtoB2bCor(prod),
      borderWidth: 0,
    }))
    .filter((ds) => ds.data.some((n) => n > 0));
  makeDashChartProjetistaStacked(
    canvasId,
    rowKeys.map((k) => truncateChartLabel(k, 22)),
    datasets,
    { stepSize: 1 },
  );
  renderDashGrupoMatrixTable(
    tableId,
    tableRowHeader,
    rowKeys,
    produtos,
    (k) => k,
    matrix,
    "Nenhum projeto B2B neste agrupamento.",
  );
}

const DASH_B2B_REGIONAL_CHART_IDS = [
  "chartB2bProjetosCidade",
  "chartB2bProjetosRegional",
  "chartB2bProdutoCidade",
  "chartB2bProdutoRegional",
];

const DASH_B2B_COMERCIAL_CHART_IDS = ["chartB2bSolicitanteQtd", "chartB2bSolicitanteValor"];

function destroyDashB2bComercialCharts() {
  DASH_B2B_COMERCIAL_CHART_IDS.forEach((id) => {
    if (dashCharts[id]) {
      dashCharts[id].destroy();
      delete dashCharts[id];
    }
  });
  const tableEl = document.getElementById("dashB2bSolicitanteCidadeTable");
  if (tableEl) tableEl.innerHTML = "";
}

function statsSolicitanteB2bComercial(list = demandasB2bDashboardList(), mode = getDashValorModo()) {
  const byLabel = Object.fromEntries(
    SOLICITANTES_B2B_COMERCIAL.map((label) => [label, { label, n: 0, valor: 0 }]),
  );
  list.forEach((d) => {
    const key = resolveSolicitanteB2bComercial(d);
    if (!key) return;
    if (demandaIncluiModoDash(d, mode)) byLabel[key].n += 1;
    byLabel[key].valor += demandaValorDashPorModo(d, mode);
  });
  return SOLICITANTES_B2B_COMERCIAL.map((label) => byLabel[label]);
}

function scheduleDashChartsResize(ids) {
  requestAnimationFrame(() => {
    ids.forEach((id) => dashCharts[id]?.resize());
  });
}

function topCidadesSolicitanteB2b(demandas, topN = 10) {
  const counts = new Map();
  demandas.forEach((d) => {
    for (const c of demandaCidadesLabels(d)) {
      counts.set(c, (counts.get(c) || 0) + 1);
    }
  });
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"))
    .slice(0, topN)
    .map(([cidade]) => cidade);
}

function buildSolicitanteB2bCidadeMatrix(demandas, cidades) {
  const matrix = Object.fromEntries(
    SOLICITANTES_B2B_COMERCIAL.map((s) => [s, Object.fromEntries(cidades.map((c) => [c, 0]))]),
  );
  demandas.forEach((d) => {
    const sol = resolveSolicitanteB2bComercial(d);
    if (!sol || !matrix[sol]) return;
    for (const cid of demandaCidadesLabels(d)) {
      if (matrix[sol][cid] === undefined) continue;
      matrix[sol][cid] += 1;
    }
  });
  return matrix;
}

function renderDashSolicitanteB2bCharts(list = demandasB2bDashboardList()) {
  destroyDashB2bComercialCharts();
  if (!list.length) return;

  const mode = getDashValorModo();
  const rows = statsSolicitanteB2bComercial(list, mode);
  const labels = SOLICITANTES_B2B_COMERCIAL;
  // Série única por gráfico: uma cor só (o nome do solicitante já está no eixo).
  const colors = labels.map(() => dashSerieCor());
  const temProjetos = rows.some((r) => r.n > 0);
  const temValor = rows.some((r) => r.valor > 0);

  if (!temProjetos && !temValor) return;

  if (temProjetos) {
    makeDashChartMetricBar(
      "chartB2bSolicitanteQtd",
      labels,
      rows.map((r) => r.n),
      { colors, datasetLabel: "Projetos", stepSize: 1 },
    );
  }

  makeDashChartMoneyBar(
    "chartB2bSolicitanteValor",
    labels,
    rows.map((r) => r.valor),
    colors,
    { datasetLabel: labelValorDashModo(mode) },
  );
  scheduleDashChartsResize(["chartB2bSolicitanteQtd", "chartB2bSolicitanteValor"]);

  const listModo = list.filter((d) => demandaIncluiModoDash(d, mode));
  const baseCidades = listModo.length ? listModo : list;
  const cidades = topCidadesSolicitanteB2b(baseCidades, 10);
  if (!cidades.length) return;

  const matrix = buildSolicitanteB2bCidadeMatrix(baseCidades, cidades);
  const activeSol = labels.filter((s) => cidades.some((c) => (matrix[s][c] || 0) > 0));
  if (!activeSol.length) return;

  // Cidades × solicitante: com até 10 cidades, cores empilhadas não se distinguem —
  // a tabela com intensidade (mapa de calor) mostra o cruzamento com clareza.

  const tableMatrix = Object.fromEntries(activeSol.map((s) => [s, Object.fromEntries(cidades.map((c) => [c, matrix[s][c] || 0]))]));
  renderDashGrupoMatrixTable(
    "dashB2bSolicitanteCidadeTable",
    "Solicitante",
    activeSol,
    cidades,
    (k) => k,
    tableMatrix,
    "Nenhum projeto B2B com solicitante comercial nestas cidades.",
  );
}

function destroyDashB2bRegionalCharts() {
  DASH_B2B_REGIONAL_CHART_IDS.forEach((id) => {
    if (dashCharts[id]) {
      dashCharts[id].destroy();
      delete dashCharts[id];
    }
  });
  ["dashB2bProdutoCidadeTable", "dashB2bProdutoRegionalTable"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = "";
  });
}

function countByValoresLista(list, valores, normalizer) {
  const counts = Object.fromEntries(valores.map((v) => [v, 0]));
  list.forEach((d) => {
    const key = normalizer(d);
    if (key && counts[key] !== undefined) counts[key] += 1;
  });
  return valores.map((label) => ({ label, n: counts[label] || 0 })).filter((x) => x.n > 0);
}

function countBySegmentoB2c(list = demandasB2cDashboardList()) {
  return countByValoresLista(list, SEGMENTOS_B2C, (d) => normalizeSegmentoB2c(d.segmentoB2c));
}

function countB2bIndicadores(list = demandasB2bDashboardList()) {
  let comValor = 0;
  let atraso = 0;
  let aguardandoBp = 0;
  let aprovados = 0;
  let execucaoRegional = 0;
  let execucaoTerceirizada = 0;
  let pausados = 0;
  let concluido = 0;
  let valorTotal = 0;
  for (const raw of list) {
    const d = migrateDemanda(raw);
    const st = d.status;
    if (st === "aprovacao_bp") aguardandoBp += 1;
    else if (STATUS_B2B_APROVADOS.includes(st)) aprovados += 1;
    else if (STATUS_B2B_EXECUCAO_REGIONAL.includes(st)) execucaoRegional += 1;
    else if (STATUS_B2B_EXECUCAO_TERCEIRIZADA.includes(st)) execucaoTerceirizada += 1;
    else if (st === "pausado") pausados += 1;
    else if (STATUS_B2B_CONCLUIDOS.has(st)) concluido += 1;
    const v = demandaValorDashPorModo(raw, getDashValorModo());
    valorTotal += v;
    if (v > 0) comValor += 1;
    if (isAtrasoAtivo(raw)) atraso += 1;
  }
  return {
    total: list.length,
    aguardandoBp,
    aprovados,
    execucaoRegional,
    execucaoTerceirizada,
    pausados,
    concluido,
    valorTotal,
    ticketMedio: comValor ? valorTotal / comValor : null,
    atraso,
  };
}

/** Funil da esteira B2B: quantos projetos em cada etapa, na ordem do fluxo. */
function funilEsteiraB2b(list) {
  const conta = Object.fromEntries(STATUS_ORDER_B2B.map(([k]) => [k, 0]));
  list.forEach((d) => {
    const st = migrateDemanda(d).status;
    if (conta[st] !== undefined) conta[st] += 1;
  });
  return STATUS_ORDER_B2B.map(([k, label]) => ({ k, label, n: conta[k] }));
}

function renderDashB2bProdutoEFunil(list, listModo) {
  const mode = getDashValorModo();
  const porProduto = PRODUTOS_B2B.map((p) => {
    const doProd = list.filter((d) => normalizeProdutoB2b(d.produtoB2b) === p);
    return {
      p,
      n: doProd.length,
      valor: doProd.reduce((s, d) => s + demandaValorDashPorModo(d, mode), 0),
    };
  })
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n || b.valor - a.valor);
  if (porProduto.length) {
    makeDashChartMetricBar(
      "chartB2bProduto",
      porProduto.map((r) => r.p),
      porProduto.map((r) => r.n),
      {
        horizontal: true,
        colors: porProduto.map((r) => produtoB2bCor(r.p)),
        datasetLabel: "Projetos",
        showPct: true,
      },
    );
    const chart = dashCharts.chartB2bProduto;
    if (chart) {
      // Tooltip também mostra o valor do produto.
      chart.options.plugins.tooltip.callbacks.afterLabel = (ctx) =>
        `${labelValorDashModo(mode)}: ${formatBRL(porProduto[ctx.dataIndex]?.valor || 0)}`;
      chart.update("none");
    }
  } else {
    dashCharts.chartB2bProduto?.destroy();
    delete dashCharts.chartB2bProduto;
  }
  const funil = funilEsteiraB2b(list);
  if (funil.some((r) => r.n > 0)) {
    makeDashChartMetricBar(
      "chartB2bStatus",
      funil.map((r) => r.label),
      funil.map((r) => r.n),
      {
        horizontal: true,
        colors: funil.map((r) => (r.k === "pausado" ? "#94a3b8" : dashSerieCor())),
        datasetLabel: "Projetos",
        showPct: true,
      },
    );
  } else {
    dashCharts.chartB2bStatus?.destroy();
    delete dashCharts.chartB2bStatus;
  }
}

function makeDashChartChegadasFin(labels, chegadas, finalizacoes) {
  const canvasId = "chartChegadasFin";
  if (typeof Chart === "undefined") return;
  const el = document.getElementById(canvasId);
  if (!el) return;
  if (dashCharts[canvasId]) {
    dashCharts[canvasId].destroy();
    delete dashCharts[canvasId];
  }
  dashCharts[canvasId] = criarDashChart(el, {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "Chegadas", data: chegadas, backgroundColor: "#3b82f6", borderWidth: 0 },
        { label: "Finalizações", data: finalizacoes, backgroundColor: "#22c55e", borderWidth: 0 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: true, labels: { color: chartInk().label, boxWidth: 12 } } },
      scales: {
        x: { ticks: { color: chartInk().tick }, grid: { color: chartInk().grid } },
        y: { beginAtZero: true, ticks: { color: chartInk().tick, stepSize: 1 }, grid: { color: chartInk().grid } },
      },
    },
  });
}

function makeDashChart(canvasId, type, labels, data, options = {}) {
  if (typeof Chart === "undefined") return;
  const el = document.getElementById(canvasId);
  if (!el) return;
  if (dashCharts[canvasId]) {
    dashCharts[canvasId].destroy();
    delete dashCharts[canvasId];
  }
  if (!labels.length) return;
  const palette = ["#6366f1", "#14b8a6", "#f59e0b", "#ef4444", "#a855f7", "#0ea5e9", "#22c55e", "#94a3b8"];
  const color = options.color || palette[0];
  const bg =
    options.colors ||
    (type === "doughnut" ? palette.slice(0, labels.length) : color);
  const formatValue = options.formatValue || ((v) => String(v));
  dashCharts[canvasId] = criarDashChart(el, {
    type,
    data: {
      labels,
      datasets: [{ label: options.datasetLabel || "", data, backgroundColor: bg, borderWidth: type === "doughnut" ? 1 : 0 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      ...dashChartBarInteractOptions(options),
      plugins: {
        legend: { display: type === "doughnut", labels: { color: chartInk().label, boxWidth: 12 } },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const base = `${ctx.label}: ${formatValue(ctx.raw)}`;
              return base + (options.showPct ? dashChartPctSuffix(ctx) : "");
            },
          },
        },
        ...(options.plugins || {}),
      },
      scales: type === "bar" ? { x: { ticks: { color: chartInk().tick }, grid: { color: chartInk().grid } }, y: { beginAtZero: true, ticks: { color: chartInk().tick }, grid: { color: chartInk().grid } } } : undefined,
    },
  });
}


function destroyDashTempoCharts(cfg = DASH_TEMPO_CFG_OP) {
  cfg.chartIds.forEach((id) => {
    if (dashCharts[id]) {
      dashCharts[id].destroy();
      delete dashCharts[id];
    }
  });
}

function destroyDashChartTempoSetorResumo(cfg = DASH_TEMPO_CFG_OP) {
  if (dashCharts[cfg.resumoChartId]) {
    dashCharts[cfg.resumoChartId].destroy();
    delete dashCharts[cfg.resumoChartId];
  }
}

function buildTempoSetorResumoItems(bySetor, setores = SETORES_ESTEIRA, bySetorCount = null) {
  const totalSetor = setores.reduce((s, k) => s + (bySetor[k] || 0), 0);
  const itemsAll = setores.map((setor) => {
    const ms = bySetor[setor] || 0;
    const n = bySetorCount?.[setor] || 0;
    return {
      setor,
      ms,
      pct: totalSetor ? Math.round((ms / totalSetor) * 1000) / 10 : 0,
      days: msToChartDays(ms),
      avgDays: n ? msToChartDays(ms / n) : 0,
      avgCount: n,
    };
  });
  const itemsChart = itemsAll.filter((it) => it.ms > 0).sort((a, b) => b.avgDays - a.avgDays);
  return { itemsAll, itemsChart, totalSetor };
}

/** Resumo por etapa (coluna da esteira): tempo acumulado, % do total e média de dias. */
function buildTempoFaseResumoItems(agg, cfg = DASH_TEMPO_CFG_OP) {
  const fases = cfg.fasesOrder || [];
  const totalMs = agg.totalMs || 0;
  const byFase = agg.byFase || {};
  const byFaseCount = agg.byFaseCount || {};
  const linha = cfg.linhaEsteira || LINHA_ESTEIRA_OPERACIONAL;
  return fases.map((status) => {
    const ms = byFase[status] || 0;
    const n = byFaseCount[status] || 0;
    return {
      status,
      label: labelStatus(status, linha),
      setor: cfg.setorForStatus(status),
      ms,
      pct: totalMs ? Math.round((ms / totalMs) * 1000) / 10 : 0,
      avgDays: n ? msToChartDays(ms / n) : 0,
      avgCount: n,
    };
  });
}

/** Tabela «Resumo por etapa» — tempo acumulado, % e média de dias. */
function renderDashTempoSetorMap(rows = [], cfg = DASH_TEMPO_CFG_OP) {
  const tbody = document.getElementById(cfg.ids.mapBody);
  if (!tbody) return;
  if (!rows.length) {
    tbody.innerHTML =
      '<tr><td colspan="5" class="muted small">' + escapeHtml(cfg.emptyEsteiraMsg) + "</td></tr>";
    return;
  }
  const agg = aggregateTempoEsteira(rows, cfg);
  const items = buildTempoFaseResumoItems(agg, cfg);
  let html = "";
  for (const it of items) {
    html +=
      "<tr><td><strong>" +
      escapeHtml(it.label) +
      "</strong></td><td>" +
      (it.setor ? setorBadgeHtml(it.setor) : '<span class="dash-setor dash-setor--outros">—</span>') +
      "</td><td class=\"dash-pj-matrix__num\">" +
      (it.ms ? formatDur(it.ms) : "—") +
      "</td><td class=\"dash-pj-matrix__num\">" +
      (it.ms ? it.pct + "%" : "—") +
      "</td><td class=\"dash-pj-matrix__num\">" +
      (it.avgCount ? it.avgDays + " d" : "—") +
      "</td></tr>";
  }
  tbody.innerHTML = html;
}

function makeDashChartTempoSetorResumo(items, cfg = DASH_TEMPO_CFG_OP) {
  if (typeof Chart === "undefined") return;
  const el = document.getElementById(cfg.resumoChartId);
  if (!el) return;
  destroyDashChartTempoSetorResumo(cfg);
  if (!items.length) return;

  const labels = items.map((it) => it.setor);
  const colors = items.map((it) => setorColorFor(it.setor, cfg));

  dashCharts[cfg.resumoChartId] = criarDashChart(el, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Média de dias",
          data: items.map((it) => it.avgDays),
          backgroundColor: colors,
          borderWidth: 0,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const it = items[ctx.dataIndex];
              return [
                `Média: ${it.avgDays} dia(s)`,
                `${it.avgCount} projeto(s)`,
                `Total: ${formatDur(it.ms)}`,
              ];
            },
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          title: { display: true, text: "Média de dias", color: chartInk().tick, font: { size: 11 } },
          ticks: { color: chartInk().tick },
          grid: { color: chartInk().grid },
        },
        y: { ticks: { color: chartInk().label, font: { size: 11 } }, grid: { display: false } },
      },
    },
  });
}

/** Resumo ao lado do mapa de etapas (sempre visível). */
function renderDashTempoSetorResumo(rows, cfg = DASH_TEMPO_CFG_OP) {
  const tableEl = document.getElementById(cfg.ids.resumoTable);
  const hintEl = document.getElementById(cfg.ids.resumoHint);
  if (!tableEl) return;

  if (!rows.length) {
    tableEl.innerHTML = `<p class="muted small">${cfg.emptyEsteiraMsg}</p>`;
    destroyDashChartTempoSetorResumo(cfg);
    if (hintEl) hintEl.textContent = "Sem dados para resumir.";
    return;
  }

  const agg = aggregateTempoEsteira(rows, cfg);
  const { itemsAll, itemsChart } = buildTempoSetorResumoItems(agg.bySetor, cfg.setores, agg.bySetorCount);
  const filtroAtivo = dashTempoFiltroAtivo(cfg);
  const resp = document.getElementById(cfg.ids.filterResp)?.value || "";

  if (hintEl) {
    let hint = filtroAtivo
      ? `${rows.length} projeto(s) no filtro atual.`
      : `Visão geral — ${rows.length} projeto(s) na ${cfg.esteiraLabel}.`;
    if (resp === FILTER_PROJETISTA_TODOS) hint += " Todos os projetistas.";
    else if (filtroAtivo && resp) hint += ` Projetista: ${resp}.`;
    else if (!filtroAtivo) hint += " Aplique filtros abaixo para refinar os gráficos detalhados.";
    hintEl.textContent = hint;
  }

  let body = "";
  for (const it of itemsAll) {
    body +=
      "<tr><td>" +
      setorBadgeHtml(it.setor) +
      "</td><td><strong>" +
      (it.ms ? formatDur(it.ms) : "—") +
      "</strong></td><td>" +
      (it.ms ? it.pct + "%" : "—") +
      "</td><td>" +
      (it.avgCount ? it.avgDays + " d" : "—") +
      "</td></tr>";
  }
  tableEl.innerHTML =
    '<table class="dash-table dash-table--setor-resumo"><thead><tr><th>Setor</th><th>Tempo acumulado</th><th>% do total</th><th>Média de dias</th></tr></thead><tbody>' +
    body +
    "</tbody></table>";

  if (itemsChart.length) makeDashChartTempoSetorResumo(itemsChart, cfg);
  else destroyDashChartTempoSetorResumo(cfg);
}

function chartTooltipDur(ctx, msArr) {
  const i = ctx.dataIndex;
  const ms = msArr?.[i];
  if (ms == null) return `${ctx.dataset.label || ""}: ${ctx.formattedValue} dia(s)`;
  return `${ctx.label}: ${formatDur(ms)} (${msToChartDays(ms)} d)`;
}

function makeDashChartTempoFase(canvasId, faseKeys, msPerFase, cfg = DASH_TEMPO_CFG_OP) {
  if (typeof Chart === "undefined") return;
  const el = document.getElementById(canvasId);
  if (!el) return;
  if (dashCharts[canvasId]) {
    dashCharts[canvasId].destroy();
    delete dashCharts[canvasId];
  }
  const labels = faseKeys.map((k) => labelStatus(k, cfg.linhaEsteira || LINHA_ESTEIRA_OPERACIONAL));
  const colors = faseKeys.map((k) => setorColorFor(cfg.setorForStatus(k), cfg));
  const dataDays = msPerFase.map(msToChartDays);
  dashCharts[canvasId] = criarDashChart(el, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Tempo médio",
          data: dataDays,
          backgroundColor: colors,
          borderWidth: 0,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: (ctx) => chartTooltipDur(ctx, msPerFase) },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          title: { display: true, text: "Dias (média)", color: chartInk().tick, font: { size: 11 } },
          ticks: { color: chartInk().tick },
          grid: { color: chartInk().grid },
        },
        y: { ticks: { color: chartInk().label, font: { size: 11 } }, grid: { display: false } },
      },
    },
  });
}

function makeDashChartTempoSetor(canvasId, setores, msPerSetor, cfg = DASH_TEMPO_CFG_OP) {
  if (typeof Chart === "undefined") return;
  const el = document.getElementById(canvasId);
  if (!el) return;
  if (dashCharts[canvasId]) {
    dashCharts[canvasId].destroy();
    delete dashCharts[canvasId];
  }
  const colors = setores.map((s) => setorColorFor(s, cfg));
  dashCharts[canvasId] = criarDashChart(el, {
    type: "doughnut",
    data: {
      labels: setores,
      datasets: [
        {
          data: msPerSetor.map(msToChartDays),
          backgroundColor: colors,
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { color: chartInk().label, boxWidth: 12 } },
        tooltip: {
          callbacks: { label: (ctx) => chartTooltipDur(ctx, msPerSetor) },
        },
      },
    },
  });
}

function makeDashChartTempoSetorStack(canvasId, projectLabels, setorSeries, msMatrix, setores = SETORES_ESTEIRA, cfg = DASH_TEMPO_CFG_OP) {
  if (typeof Chart === "undefined") return;
  const el = document.getElementById(canvasId);
  if (!el) return;
  if (dashCharts[canvasId]) {
    dashCharts[canvasId].destroy();
    delete dashCharts[canvasId];
  }
  const datasets = setores.map((setor, si) => ({
    label: setor,
    data: setorSeries[setor],
    backgroundColor: setorColorFor(setor, cfg),
    borderWidth: 0,
    _msRow: msMatrix[si],
  }));
  dashCharts[canvasId] = criarDashChart(el, {
    type: "bar",
    data: { labels: projectLabels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, labels: { color: chartInk().label, boxWidth: 12 } },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const ms = ctx.dataset._msRow?.[ctx.dataIndex] || 0;
              if (!ms) return null;
              return `${ctx.dataset.label}: ${formatDur(ms)}`;
            },
          },
        },
      },
      scales: {
        x: {
          stacked: true,
          ticks: { color: chartInk().tick, maxRotation: 45, minRotation: 0, font: { size: 10 } },
          grid: { color: chartInk().grid },
        },
        y: {
          stacked: true,
          beginAtZero: true,
          title: { display: true, text: "Dias", color: chartInk().tick, font: { size: 11 } },
          ticks: { color: chartInk().tick },
          grid: { color: chartInk().grid },
        },
      },
    },
  });
}

const MESES_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function parsePeriodoFromDate(raw) {
  if (!raw) return null;
  const m = String(raw).match(/^(\d{4})-(\d{2})/);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]) };
}

function demandaPeriodo(d) {
  return parsePeriodoFromDate(d.dataChegada || (d.createdAt || "").slice(0, 10));
}

/** Data em que o projeto entrou em Conclusão / Projeto Final (histórico ou atualização). */
function demandaDataConclusao(d) {
  const dm = migrateDemanda(d);
  if (!isStatusConcluidoDemanda(dm)) return "";
  const hist = dm.historicoStatus || [];
  const seg = hist.find((s) => s.status === dm.status);
  if (seg?.inicio) return seg.inicio.slice(0, 10);
  if (seg?.fim) return seg.fim.slice(0, 10);
  return (dm.updatedAt || "").slice(0, 10);
}

function demandaConclusaoPeriodo(d) {
  return parsePeriodoFromDate(demandaDataConclusao(d));
}

function demandaTerminoPeriodo(d) {
  return parsePeriodoFromDate(demandaDataTermino(d));
}

function formatDataISO(raw) {
  if (!raw) return "—";
  const parts = raw.split("-");
  if (parts.length < 3) return raw;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function collectAnosChegadaConclusao(demandas) {
  const years = new Set();
  demandas.forEach((d) => {
    const pc = demandaPeriodo(d);
    const pf = demandaConclusaoPeriodo(d);
    if (pc) years.add(pc.year);
    if (pf) years.add(pf.year);
  });
  return [...years].sort((a, b) => b - a);
}

function emptyMesesMap() {
  const m = {};
  for (let i = 1; i <= 12; i++) m[i] = { chegadas: 0, finalizacoes: 0 };
  return m;
}

function buildResumoAno(demandas, ano) {
  const meses = emptyMesesMap();
  let totalChegadas = 0;
  let totalFinalizacoes = 0;
  for (const d of demandas) {
    const pc = demandaPeriodo(d);
    if (pc && pc.year === ano) {
      meses[pc.month].chegadas += 1;
      totalChegadas += 1;
    }
    const pf = demandaConclusaoPeriodo(d);
    if (pf && pf.year === ano) {
      meses[pf.month].finalizacoes += 1;
      totalFinalizacoes += 1;
    }
  }
  return { meses, totalChegadas, totalFinalizacoes };
}

function projetosNoPeriodo(demandas, ano, mes) {
  const out = [];
  for (const d of demandas) {
    const pc = demandaPeriodo(d);
    const pf = demandaConclusaoPeriodo(d);
    const chegou = pc && pc.year === ano && (!mes || pc.month === mes);
    const finalizou = pf && pf.year === ano && (!mes || pf.month === mes);
    if (chegou || finalizou) {
      out.push({
        d,
        chegou: !!chegou,
        finalizou: !!finalizou,
        dataChegada: d.dataChegada || "",
        dataConclusao: demandaDataConclusao(d),
      });
    }
  }
  return out.sort((a, b) => {
    const ka = periodoSortKey(a.d);
    const kb = periodoSortKey(b.d);
    if (ka !== kb) return kb.localeCompare(ka);
    return a.d.titulo.localeCompare(b.d.titulo);
  });
}

function populateDashCfFilters() {
  const selAno = document.getElementById("filterDashCfAno");
  const selMes = document.getElementById("filterDashCfMes");
  if (!selAno) return;

  const todas = demandasDashOperacionalList();
  const years = collectAnosChegadaConclusao(todas);
  const savedAno = selAno.value;
  const savedMes = selMes?.value || "";

  const yOpts =
    years.length > 0
      ? years.map((y) => `<option value="${y}">${y}</option>`).join("")
      : `<option value="${new Date().getFullYear()}">${new Date().getFullYear()}</option>`;
  selAno.innerHTML = yOpts;

  const pick =
    savedAno && years.some((y) => String(y) === savedAno)
      ? savedAno
      : String(years[0] || new Date().getFullYear());
  selAno.value = pick;

  if (selMes) {
    const mesOpts =
      '<option value="">Todos os meses</option>' +
      MESES_PT.map((lab, i) => {
        const v = String(i + 1).padStart(2, "0");
        return `<option value="${v}">${lab}</option>`;
      }).join("");
    selMes.innerHTML = mesOpts;
    if (savedMes) selMes.value = savedMes;
  }
}

function renderDashChegadasFinalizacoes() {
  populateDashCfFilters();
  const selAno = document.getElementById("filterDashCfAno");
  const selMes = document.getElementById("filterDashCfMes");
  const kpiEl = document.getElementById("dashCfKpis");
  const resumoWrap = document.getElementById("dashCfResumoTable");
  const resumoCount = document.getElementById("dashCfResumoCount");
  if (!selAno || !kpiEl || !resumoWrap) return;

  const ano = Number(selAno.value) || new Date().getFullYear();
  const mesVal = selMes?.value || "";
  const mes = mesVal ? Number(mesVal) : null;
  const todas = demandasDashOperacionalList();
  const { meses, totalChegadas, totalFinalizacoes } = buildResumoAno(todas, ano);

  const emAndamento = todas.filter((d) => {
    const pc = demandaPeriodo(d);
    return pc && pc.year === ano && d.status !== "conclusao" && d.status !== "reprovado";
  }).length;

  if (mes) {
    kpiEl.innerHTML =
      kpiCard("Chegadas no mês", meses[mes].chegadas, "ok") +
      kpiCard("Finalizações no mês", meses[mes].finalizacoes, "ok") +
      kpiCard(
        "Taxa no mês",
        meses[mes].chegadas ? Math.round((meses[mes].finalizacoes / meses[mes].chegadas) * 100) + "%" : "—",
        "ok",
      );
  } else {
    kpiEl.innerHTML =
      kpiCard("Chegadas no ano", totalChegadas, "ok") +
      kpiCard("Finalizações no ano", totalFinalizacoes, "ok") +
      kpiCard("Ativas (chegaram no ano)", emAndamento, emAndamento ? "warn" : "ok") +
      kpiCard(
        "Taxa conclusão no ano",
        totalChegadas ? Math.round((totalFinalizacoes / totalChegadas) * 100) + "%" : "—",
        "ok",
      );
  }

  const labels = [];
  const dataCheg = [];
  const dataFin = [];
  let body = "";
  for (let m = 1; m <= 12; m++) {
    const lab = MESES_PT[m - 1];
    labels.push(lab.slice(0, 3));
    dataCheg.push(meses[m].chegadas);
    dataFin.push(meses[m].finalizacoes);
    if (!mes || mes === m) {
      body +=
        "<tr><td>" +
        escapeHtml(lab + " / " + ano) +
        "</td><td>" +
        meses[m].chegadas +
        "</td><td>" +
        meses[m].finalizacoes +
        "</td></tr>";
    }
  }
  body +=
    '<tr class="dash-cf-total-row"><td>Total ' +
    ano +
    "</td><td>" +
    totalChegadas +
    "</td><td>" +
    totalFinalizacoes +
    "</td></tr>";

  if (resumoCount) {
    resumoCount.textContent = mes
      ? `Resumo de ${MESES_PT[mes - 1]} de ${ano}.`
      : `Resumo mensal de ${ano} (${totalChegadas} chegadas, ${totalFinalizacoes} finalizações).`;
  }
  resumoWrap.innerHTML =
    '<table class="dash-table"><thead><tr><th>Período</th><th>Chegadas</th><th>Finalizações</th></tr></thead><tbody>' +
    body +
    "</tbody></table>";

  makeDashChartChegadasFin(labels, dataCheg, dataFin);

  renderDashCfDetalheTable();
}

function initDashCfDetalheFilters() {
  const sel = document.getElementById("filterDashCfStatus");
  if (!sel || sel.dataset.ready) return;
  for (const [k, lab] of [...STATUS_ORDER, ...STATUS_EXTRA]) {
    const o = document.createElement("option");
    o.value = k;
    o.textContent = lab;
    sel.appendChild(o);
  }
  sel.dataset.ready = "1";
}

function dashCfDetalheFiltroAtivo() {
  const busca = (document.getElementById("filterDashCfBusca")?.value || "").trim();
  const resp = document.getElementById("filterDashCfResp")?.value || "";
  const status = document.getElementById("filterDashCfStatus")?.value || "";
  const evento = document.getElementById("filterDashCfEvento")?.value || "";
  const mes = document.getElementById("filterDashCfMes")?.value || "";
  return !!(busca || resp || status || evento || mes);
}

function filterDashCfDetalheRows(rows) {
  const busca = (document.getElementById("filterDashCfBusca")?.value || "").trim().toLowerCase();
  const resp = document.getElementById("filterDashCfResp")?.value || "";
  const status = document.getElementById("filterDashCfStatus")?.value || "";
  const evento = document.getElementById("filterDashCfEvento")?.value || "";

  return rows.filter((row) => {
    if (busca) {
      const hay = `${row.d.titulo} ${formatCidadesDemanda(row.d)} ${row.d.solicitante || ""}`.toLowerCase();
      if (!hay.includes(busca)) return false;
    }
    if (!matchFilterProjetista(row.d, resp)) return false;
    if (status && row.d.status !== status) return false;
    if (evento === "chegada" && !row.chegou) return false;
    if (evento === "conclusao" && !row.finalizou) return false;
    return true;
  });
}

function renderDashCfDetalheTable() {
  const detWrap = document.getElementById("dashCfDetalheTable");
  const detCount = document.getElementById("dashCfDetalheCount");
  if (!detWrap) return;
  initDashCfDetalheFilters();

  const selAno = document.getElementById("filterDashCfAno");
  if (!selAno?.value) {
    if (detCount) detCount.textContent = "";
    detWrap.innerHTML = '<p class="muted">Selecione o ano no filtro acima.</p>';
    return;
  }

  const ano = Number(selAno.value);
  const mesVal = document.getElementById("filterDashCfMes")?.value || "";
  const mes = mesVal ? Number(mesVal) : null;
  const todas = demandasDashOperacionalList();
  const candidatos = projetosNoPeriodo(todas, ano, mes);

  if (!dashCfDetalheFiltroAtivo()) {
    if (detCount) {
      detCount.textContent = `${candidatos.length} projeto(s) no ano${mes ? `/${MESES_PT[mes - 1]}` : ""} — aplique um filtro para listar.`;
    }
    detWrap.innerHTML =
      '<p class="muted dash-tempo-hint">Use <strong>busca</strong>, <strong>mês</strong>, <strong>projetista</strong>, <strong>status</strong> ou <strong>evento</strong> para carregar a tabela.</p>';
    return;
  }

  const detalhes = filterDashCfDetalheRows(candidatos);
  if (detCount) {
    detCount.textContent = `Exibindo ${detalhes.length} de ${candidatos.length} projeto(s) com os filtros aplicados.`;
  }
  if (!detalhes.length) {
    detWrap.innerHTML = '<p class="muted">Nenhum projeto encontrado com os filtros atuais.</p>';
    return;
  }
  let detBody = "";
  for (const row of detalhes) {
    const tags =
      (row.chegou ? '<span class="dash-cf-badge dash-cf-badge--chegada">Chegada</span>' : "") +
      (row.finalizou ? '<span class="dash-cf-badge dash-cf-badge--fim">Conclusão</span>' : "");
    detBody +=
      "<tr><td>" +
      escapeHtml(row.d.titulo) +
      "</td><td>" +
      tags +
      "</td><td>" +
      formatDataISO(row.dataChegada) +
      "</td><td>" +
      formatDataISO(row.dataConclusao) +
      "</td><td>" +
      escapeHtml(formatProjetistasDemanda(row.d) || labelProjetista(row.d.responsavel)) +
      "</td><td>" +
      escapeHtml(STATUS_LABEL[row.d.status] || row.d.status) +
      "</td></tr>";
  }
  detWrap.innerHTML =
    '<table class="dash-table"><thead><tr><th>Projeto</th><th>No período</th><th>Data chegada</th><th>Data conclusão</th><th>Projetista</th><th>Status</th></tr></thead><tbody>' +
    detBody +
    "</tbody></table>";
}

function periodoSortKey(d) {
  const p = demandaPeriodo(d);
  if (!p) return "0000-00";
  return `${p.year}-${String(p.month).padStart(2, "0")}`;
}

function labelPeriodoGrupo(d) {
  const p = demandaPeriodo(d);
  if (!p) return "Sem data de chegada";
  return `${MESES_PT[p.month - 1] || p.month} de ${p.year}`;
}

function formatDataChegada(d) {
  const raw = d.dataChegada || "";
  if (!raw) return "—";
  const parts = raw.split("-");
  if (parts.length < 3) return raw;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function initDashTempoFilters(cfg = DASH_TEMPO_CFG_OP) {
  const sel = document.getElementById(cfg.ids.filterStatus);
  if (!sel) return;
  const saved = sel.value;
  sel.innerHTML = '<option value="">Selecione…</option>';
  for (const k of cfg.filtroStatusOpcoes) {
    const o = document.createElement("option");
    o.value = k;
    o.textContent = labelStatus(k, cfg.linhaEsteira || LINHA_ESTEIRA_OPERACIONAL);
    sel.appendChild(o);
  }
  if (saved === "novo" || saved === "pre_vendas") sel.value = "";
  if (saved && [...sel.options].some((o) => o.value === saved)) sel.value = saved;
  sel.dataset.ready = "1";
}

function populateDashTempoAnoMes(cfg = DASH_TEMPO_CFG_OP) {
  const selAno = document.getElementById(cfg.ids.filterAno);
  const selMes = document.getElementById(cfg.ids.filterMes);
  if (!selAno) return;
  const savedAno = selAno.value;
  const savedMes = selMes?.value || "";
  const years = new Set();
  cfg.listFn().forEach((d) => {
    const p = demandaPeriodo(d);
    if (p) years.add(p.year);
  });
  const sorted = [...years].sort((a, b) => b - a);
  selAno.innerHTML =
    '<option value="">Selecione…</option>' +
    sorted.map((y) => `<option value="${y}">${y}</option>`).join("");
  if (savedAno && sorted.some((y) => String(y) === savedAno)) selAno.value = savedAno;

  if (selMes) {
    selMes.innerHTML =
      '<option value="">Selecione…</option>' +
      MESES_PT.map((lab, i) => {
        const v = String(i + 1).padStart(2, "0");
        return `<option value="${v}">${lab}</option>`;
      }).join("");
    if (savedMes) selMes.value = savedMes;
  }
}

function dashTempoFiltroAtivo(cfg = DASH_TEMPO_CFG_OP) {
  const busca = (document.getElementById(cfg.ids.filterBusca)?.value || "").trim();
  const resp = document.getElementById(cfg.ids.filterResp)?.value || "";
  const status = document.getElementById(cfg.ids.filterStatus)?.value || "";
  const ano = document.getElementById(cfg.ids.filterAno)?.value || "";
  const mes = document.getElementById(cfg.ids.filterMes)?.value || "";
  return !!(busca || resp || status || ano || mes);
}

function filterDashTempoRows(rows, cfg = DASH_TEMPO_CFG_OP) {
  const busca = (document.getElementById(cfg.ids.filterBusca)?.value || "").trim().toLowerCase();
  const resp = document.getElementById(cfg.ids.filterResp)?.value || "";
  const status = document.getElementById(cfg.ids.filterStatus)?.value || "";
  const ano = document.getElementById(cfg.ids.filterAno)?.value || "";
  const mes = document.getElementById(cfg.ids.filterMes)?.value || "";
  return rows.filter(({ d }) => {
    if (busca) {
      const hay = `${d.titulo} ${formatCidadesDemanda(d)} ${d.solicitante || ""}`.toLowerCase();
      if (!hay.includes(busca)) return false;
    }
    if (!matchFilterProjetista(d, resp)) return false;
    if (status && d.status !== status) return false;
    const p = demandaPeriodo(d);
    if (ano && (!p || p.year !== Number(ano))) return false;
    if (mes && (!p || p.month !== Number(mes))) return false;
    return true;
  });
}

function renderDashTempoAnalytics(rows, cfg = DASH_TEMPO_CFG_OP) {
  const chartsWrap = document.getElementById(cfg.ids.chartsWrap);
  const kpiEl = document.getElementById(cfg.ids.kpis);
  if (!chartsWrap) return;

  destroyDashTempoCharts(cfg);

  if (!rows.length) {
    chartsWrap.hidden = true;
    if (kpiEl) kpiEl.innerHTML = "";
    return;
  }

  const agg = aggregateTempoEsteira(rows, cfg);
  chartsWrap.hidden = false;

  const faseOrder = cfg.fasesOrder.filter((k) => agg.byFase[k] > 0);
  const faseAvgMs = faseOrder.map((k) => {
    const n = agg.byFaseCount[k] || 1;
    return agg.byFase[k] / n;
  });
  if (faseOrder.length) makeDashChartTempoFase(cfg.ids.chartFase, faseOrder, faseAvgMs, cfg);

  const setores = cfg.setores || SETORES_ESTEIRA;
  const setoresComDados = setores.filter((s) => agg.bySetor[s] > 0);
  if (setoresComDados.length) {
    makeDashChartTempoSetor(
      cfg.ids.chartSetor,
      setoresComDados,
      setoresComDados.map((s) => agg.bySetor[s]),
      cfg,
    );
  }

  const topN = 10;
  const sorted = [...rows].sort((a, b) => b.ms - a.ms).slice(0, topN);
  const labels = sorted.map(({ d }) => {
    const t = (d.titulo || "—").trim();
    return t.length > 28 ? t.slice(0, 28) + "…" : t;
  });
  const setorSeries = Object.fromEntries(setores.map((s) => [s, []]));
  const msMatrix = setores.map(() => []);
  for (const { d } of sorted) {
    const porFase = demandaTempoPorFase(d, cfg);
    setores.forEach((setor, si) => {
      let ms = 0;
      for (const [status, segMs] of Object.entries(porFase)) {
        if (cfg.setorForStatus(status) === setor) ms += segMs;
      }
      setorSeries[setor].push(msToChartDays(ms));
      msMatrix[si].push(ms);
    });
  }
  if (labels.length) makeDashChartTempoSetorStack(cfg.ids.chartStack, labels, setorSeries, msMatrix, setores, cfg);

  const mediaTotal = agg.n ? agg.totalMs / agg.n : 0;
  const setorLider = setores.reduce(
    (best, s) => (agg.bySetor[s] > (agg.bySetor[best] || 0) ? s : best),
    setores[0],
  );
  if (kpiEl) {
    kpiEl.innerHTML =
      kpiCard("Projetos no filtro", agg.n, "ok") +
      kpiCard("Tempo médio total", formatDur(mediaTotal), "ok") +
      kpiCard("Setor com mais tempo", agg.bySetor[setorLider] ? setorLider : "—", "warn") +
      kpiCard("Tempo no setor líder", formatDur(agg.bySetor[setorLider] || 0), "ok");
  }
}

function renderDashTempoPanel(cfg) {
  const countEl = document.getElementById(cfg.ids.count);
  fillDashProjetistaFilterSelects();
  initDashTempoFilters(cfg);
  populateDashTempoAnoMes(cfg);

  const allRows = cfg.listFn().map((d) => ({ d }));
  const rowsResumo = dashTempoFiltroAtivo(cfg) ? filterDashTempoRows(allRows, cfg) : allRows;
  renderDashTempoSetorMap(rowsResumo, cfg);
  renderDashTempoSetorResumo(rowsResumo, cfg);

  if (!allRows.length) {
    if (countEl) countEl.textContent = "Nenhuma demanda na esteira.";
    destroyDashTempoCharts(cfg);
    renderDashTempoAnalytics([], cfg);
    return;
  }

  if (!dashTempoFiltroAtivo(cfg)) {
    if (countEl) {
      countEl.textContent = `${allRows.length} projeto(s) cadastrado(s) — resumo ao lado atualizado; aplique um filtro para os gráficos detalhados.`;
    }
    destroyDashTempoCharts(cfg);
    renderDashTempoAnalytics([], cfg);
    return;
  }

  const rows = filterDashTempoRows(allRows, cfg);
  renderDashTempoSetorMap(rows, cfg);
  renderDashTempoSetorResumo(rows, cfg);
  renderDashTempoAnalytics(rows, cfg);
  if (countEl) {
    const resp = document.getElementById(cfg.ids.filterResp)?.value || "";
    const visao =
      resp === FILTER_PROJETISTA_TODOS ? " — visão geral (todos os projetistas)" : "";
    countEl.textContent = rows.length
      ? `Gráficos com ${rows.length} de ${allRows.length} projeto(s) no filtro${visao}.`
      : "Nenhum projeto encontrado com os filtros atuais.";
  }
}

function renderDashTempoTable() {
  renderDashTempoPanel(DASH_TEMPO_CFG_OP);
}

function renderDashTempoB2bTable() {
  renderDashTempoPanel(DASH_TEMPO_CFG_B2B);
}

function renderDashboard() {
  // Chart.js só é baixado na primeira vez que o dashboard abre; ao chegar, redesenha com os gráficos.
  if (typeof Chart === "undefined" && typeof window.carregarChartJs === "function") {
    window
      .carregarChartJs()
      .then(() => {
        if (panels.dashboard && !panels.dashboard.hidden) renderDashboard();
      })
      .catch((e) => console.warn("Gráficos indisponíveis:", e));
  }
  initDashBlocks();
  destroyDashboardCharts();
  const todas = demandasDashOperacionalList();
  const g = countDemandas(todas);
  const naEsteira = demandasAteDocumentacao(todas);
  const semDirEsteira = naEsteira.filter((d) => normalizeResponsavel(d.responsavel) === "").length;

  renderKpiGeralBaseConclusao(todas);

  document.getElementById("kpiGeral").innerHTML =
    kpiCard("Não atribuídas", semDirEsteira, semDirEsteira ? "warn" : "ok", "Na esteira sem projetista") +
    kpiCard("Pausados", g.pausadas, g.pausadas ? "warn" : "ok") +
    kpiCard("Reprovados", g.reprovadas, g.reprovadas ? "warn" : "ok");

  renderDashValoresFinanceirosKpis(todas);
  renderKpiGeralPorTipo(todas);
  renderKpiProjetistas(demandasDashOperacionalList());

  if (isDashBlockVisible("cidades")) renderDashCidades();
  if (isDashBlockVisible("tempo")) renderDashTempoTable();
  if (isDashBlockVisible("indicadores-b2c")) renderDashIndicadoresB2c();
  if (isDashBlockVisible("indicadores-b2b")) renderDashIndicadoresB2b();
  renderDashBlocosResumo(todas, g);
}

/** Resumo curto no título de cada bloco — continua visível com o bloco recolhido. */
function renderDashBlocosResumo(todas, g) {
  const set = (id, txt) => {
    const btn = document.querySelector(`.dash-block[data-dash-block="${id}"] .dash-block__toggle`);
    if (!btn) return;
    let span = btn.querySelector(".dash-block__resumo");
    if (!span) {
      span = document.createElement("span");
      span.className = "dash-block__resumo";
      btn.insertBefore(span, btn.querySelector(".dash-block__chevron"));
    }
    span.textContent = txt;
  };
  const modo = getDashValorModo();
  const valorDe = (list) => list.reduce((s2, d) => s2 + demandaValorDashPorModo(d, modo), 0);
  set(
    "kpi-geral",
    `${todas.length} projetos · ${g.atraso} em atraso · ${formatBRLCompact(valorDe(todas))}`,
  );
  const naEsteira = demandasAteDocumentacao(todas);
  set("tempo", `${naEsteira.length} projeto(s) na esteira`);
  const pjs = new Set(todas.map((d) => normalizeResponsavel(d.responsavel)).filter(Boolean));
  set("projetistas", `${pjs.size} projetista(s)`);
  const regs = buildStatsPorRegional(todas).length;
  const cids = buildStatsPorCidade(todas).length;
  set("cidades", `${regs} regional(is) · ${cids} cidade(s)`);
  const b2c = demandasB2cDashboardList();
  set("indicadores-b2c", `${b2c.length} projeto(s) · ${formatBRLCompact(valorDe(b2c))}`);
  const b2b = demandasB2bDashboardList();
  set("indicadores-b2b", `${b2b.length} projeto(s) · ${formatBRLCompact(valorDe(b2b))}`);
}

function countByStatusForList(list, linha = LINHA_ESTEIRA_OPERACIONAL) {
  const cfg = getEsteiraConfig(linha);
  const counts = {};
  for (const [k, lab] of [...cfg.statusOrder, ...cfg.statusExtra]) counts[k] = { label: lab, n: 0 };
  list.forEach((d) => {
    if (counts[d.status]) counts[d.status].n += 1;
  });
  return Object.values(counts).filter((v) => v.n > 0);
}

/** Estado do gráfico "Onde está o B2C". */
let dashB2cGeoMetrica = "gastos";
let dashB2cGeoNivel = "regional";

function dashB2cBarraShare(pct, cor) {
  const w = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  return (
    `<span class="dash-b2c-share" aria-hidden="true"><span style="width:${w}%;background:${cor}"></span></span>` +
    `<span class="dash-b2c-share__pct">${formatPctShare(pct)}</span>`
  );
}

function renderDashB2cResumo(list, listModo) {
  const el = document.getElementById("dashB2cResumo");
  if (!el) return;
  const g = countDemandas(list);
  const atrasados = list.filter(isAtrasoAtivo).length;
  const semPj = list.filter((d) => normalizeResponsavel(d.responsavel) === "").length;
  const rowsRegional = buildStatsPorRegional(list);
  const rowsCidade = buildStatsPorCidade(list);
  const valor = sumValorDashboard(listModo);
  const portas = sumPortasDashboard(listModo);
  const metragem = sumMetragemDashboard(listModo);
  const base = labelValorDashModo();
  el.innerHTML =
    `<div class="dash-b2c-resumo">` +
    `<section class="dash-b2c-resumo__grupo">` +
    `<h4 class="dash-b2c-resumo__titulo">Andamento <span>todos os ${list.length} projeto(s) B2C</span></h4>` +
    `<div class="kpi-grid dash-b2c-resumo__kpis">` +
    kpiCard("Projetos B2C", String(g.total), "ok", `${g.ativas} ativo(s) · ${g.concluidas} concluído(s)${g.pausadas ? ` · ${g.pausadas} pausado(s)` : ""}`) +
    kpiCard("Em atraso", String(atrasados), atrasados ? "bad" : "ok", atrasados ? "prazo previsto vencido" : "nenhum atrasado") +
    kpiCard("Sem projetista", String(semPj), semPj ? "warn" : "ok", semPj ? "aguardando atribuição" : "todos atribuídos") +
    kpiCard("Cobertura", `${rowsCidade.length} cidade(s)`, "ok", `em ${rowsRegional.length} regional(is)`) +
    `</div></section>` +
    `<section class="dash-b2c-resumo__grupo">` +
    `<h4 class="dash-b2c-resumo__titulo">Resultado <span>base: ${escapeHtml(base)} · ${listModo.length} projeto(s)</span></h4>` +
    `<div class="kpi-grid dash-b2c-resumo__kpis">` +
    kpiCard("Gastos", valor ? formatBRL(valor) : "—", valor ? "ok" : "warn") +
    kpiCard("Portas novas", portas ? formatQtd(portas) : "—", portas ? "ok" : "warn") +
    kpiCard("Metragem", metragem ? formatMetros(metragem) : "—", metragem ? "ok" : "warn") +
    kpiCard("R$ por porta", portas && valor ? formatBRL(valor / portas) : "—", portas && valor ? "ok" : "warn", "gastos ÷ portas novas") +
    `</div></section>` +
    `</div>`;
}

function renderDashB2cSegmentos(listModo) {
  const el = document.getElementById("dashB2cSegmentos");
  if (!el) return;
  const { rows, totais } = withB2cSegmentoPcts(buildB2cMetricasPorSegmento(listModo));
  if (!listModo.length) {
    el.innerHTML = `<p class="muted small">Nenhum B2C na base de indicadores selecionada no topo (${escapeHtml(labelValorDashModo())}).</p>`;
    return;
  }
  const celula = (valorTxt, pct, cor, vazio) =>
    `<td class="num${vazio ? " is-vazio" : ""}"><span class="dash-b2c-cel"><span class="dash-b2c-cel__valor">${valorTxt}</span>` +
    `<span class="dash-b2c-cel__share">${dashB2cBarraShare(pct, cor)}</span></span></td>`;
  const rporta = (r) => (r.portas > 0 && r.investimento > 0 ? formatBRL(r.investimento / r.portas) : "—");
  const body = rows
    .map((r) => {
      const cor = segmentoB2cCor(r.segmento);
      return (
        `<tr>` +
        `<th scope="row"><button type="button" class="dash-tipos__nome dash-tipos__abrir" data-b2c-seg="${escapeHtml(r.segmento)}" title="Ver projetos ${escapeHtml(r.segmento)}">` +
        `<i style="background:${cor}" aria-hidden="true"></i>${escapeHtml(r.segmento)}<span class="dash-tipos__seta" aria-hidden="true">›</span></button></th>` +
        celula(String(r.projetos), r.pctProjetos, cor, !r.projetos) +
        celula(r.investimento > 0 ? formatBRL(r.investimento) : "—", r.pctInvestimento, cor, !r.investimento) +
        celula(r.portas > 0 ? formatQtd(r.portas) : "—", r.pctPortas, cor, !r.portas) +
        celula(r.metragem > 0 ? formatMetros(r.metragem) : "—", r.pctMetragem, cor, !r.metragem) +
        `<td class="num${r.portas > 0 && r.investimento > 0 ? "" : " is-vazio"}">${rporta(r)}</td>` +
        `</tr>`
      );
    })
    .join("");
  el.innerHTML =
    `<div class="dashboard-table-wrap dash-tipos-wrap"><table class="dash-table dash-tipos dash-b2c-seg" aria-label="Indicadores B2C por segmento">` +
    `<thead><tr><th scope="col">Segmento</th><th scope="col" class="num">Projetos</th><th scope="col" class="num">Gastos</th>` +
    `<th scope="col" class="num">Portas novas</th><th scope="col" class="num">Metragem</th><th scope="col" class="num">R$ por porta</th></tr></thead>` +
    `<tbody>${body}</tbody>` +
    `<tfoot><tr><th scope="row">Total</th><td class="num">${totais.projetos}</td>` +
    `<td class="num">${totais.investimento > 0 ? formatBRL(totais.investimento) : "—"}</td>` +
    `<td class="num">${totais.portas > 0 ? formatQtd(totais.portas) : "—"}</td>` +
    `<td class="num">${totais.metragem > 0 ? formatMetros(totais.metragem) : "—"}</td>` +
    `<td class="num">${totais.portas > 0 && totais.investimento > 0 ? formatBRL(totais.investimento / totais.portas) : "—"}</td></tr></tfoot>` +
    `</table></div>` +
    `<p class="muted small dash-tipos__nota">Base: <strong>${escapeHtml(labelValorDashModo())}</strong> (escolhida no topo). A barra mostra a participação do segmento em cada coluna. Clique no segmento para ver os projetos.</p>`;
  el.querySelectorAll("[data-b2c-seg]").forEach((btn) => {
    btn.addEventListener("click", () => openDashGeoProjetosLista("segmento", btn.dataset.b2cSeg));
  });
}

function renderDashB2cGeo(listModo) {
  const sub = document.getElementById("dashB2cGeoSub");
  const wrap = document.querySelector(".dash-b2c-geo__chart");
  [["dashB2cGeoMetrica", dashB2cGeoMetrica], ["dashB2cGeoNivel", dashB2cGeoNivel]].forEach(([id, atual]) => {
    document.querySelectorAll(`#${id} [data-valor]`).forEach((b) => {
      const on = b.dataset.valor === atual;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-checked", on ? "true" : "false");
    });
  });
  const porCidade = dashB2cGeoNivel === "cidade";
  const rows = porCidade ? buildStatsPorCidade(listModo) : buildStatsPorRegional(listModo);
  const keyFn = porCidade ? demandaCidadesLabels : demandaRegionaisLabels;
  const topN = porCidade ? 12 : Math.max(rows.length, 1);
  const nomeMetrica = { gastos: "Gastos", portas: "Portas novas", projetos: "Projetos" }[dashB2cGeoMetrica];
  if (sub) {
    sub.textContent =
      `${nomeMetrica} ${porCidade ? "por cidade (até 12 maiores)" : "por regional"}, divididos por segmento · base: ${labelValorDashModo()}.`;
  }
  const nLinhas = Math.min(rows.length, topN);
  if (wrap) wrap.style.height = `${Math.max(180, nLinhas * 34 + 70)}px`;
  if (dashB2cGeoMetrica === "gastos") {
    renderDashSegmentoB2cInvestPorGrupo("chartB2cGeo", "tableB2cGeo", porCidade ? "Cidade" : "Regional", listModo, rows, keyFn, topN);
  } else if (dashB2cGeoMetrica === "portas") {
    renderDashSegmentoB2cPortasPorGrupo("chartB2cGeo", "tableB2cGeo", porCidade ? "Cidade" : "Regional", listModo, rows, keyFn, topN);
  } else {
    renderDashSegmentoB2cPorGrupo(
      "chartB2cGeo",
      "tableB2cGeo",
      porCidade ? "Cidade" : "Regional",
      listModo,
      [...rows].sort((a, b) => b.projetos - a.projetos || a.cidade.localeCompare(b.cidade, "pt-BR")),
      keyFn,
      topN,
    );
  }
}

function initDashB2cGeoControles() {
  [["dashB2cGeoMetrica", (v) => (dashB2cGeoMetrica = v)], ["dashB2cGeoNivel", (v) => (dashB2cGeoNivel = v)]].forEach(([id, set]) => {
    document.getElementById(id)?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-valor]");
      if (!btn) return;
      set(btn.dataset.valor);
      renderDashB2cGeo(filterDemandasModoDash(demandasB2cDashboardList()));
    });
  });
}

function renderDashIndicadoresB2c() {
  const list = demandasB2cDashboardList();
  const listModo = filterDemandasModoDash(list);
  if (!list.length) {
    destroyDashB2cExtraCharts();
    const r = document.getElementById("dashB2cResumo");
    if (r) r.innerHTML = '<p class="muted small">Nenhum projeto tipo B2C na Esteira Projetos.</p>';
    const sg = document.getElementById("dashB2cSegmentos");
    if (sg) sg.innerHTML = "";
    return;
  }
  renderDashB2cResumo(list, listModo);
  renderDashB2cSegmentos(listModo);
  if (!listModo.length) {
    destroyDashB2cExtraCharts();
    const sub = document.getElementById("dashB2cGeoSub");
    if (sub) sub.textContent = "Nenhum B2C na base de indicadores selecionada no topo.";
    return;
  }
  renderDashB2cGeo(listModo);
}

function collectAnosDemandasB2b(demandas = demandasB2bDashboardList()) {
  const years = new Set();
  demandas.forEach((d) => {
    const p = demandaPeriodo(d);
    if (p) years.add(p.year);
  });
  if (!years.size) years.add(new Date().getFullYear());
  return [...years].sort((a, b) => b - a);
}

function populateDashB2bFilters() {
  const selAno = document.getElementById("filterDashB2bAno");
  const selMes = document.getElementById("filterDashB2bMes");
  if (!selAno) return;

  const todas = demandasB2bDashboardList();
  const savedAno = selAno.value;
  const savedMes = selMes?.value || "";
  const years = collectAnosDemandasB2b(todas);

  selAno.innerHTML =
    '<option value="">Todos os anos</option>' +
    years.map((y) => `<option value="${y}">${y}</option>`).join("");
  if (savedAno && [...selAno.options].some((o) => o.value === savedAno)) selAno.value = savedAno;

  if (selMes) {
    selMes.innerHTML =
      '<option value="">Todos os meses</option>' +
      MESES_PT.map((lab, i) => {
        const v = String(i + 1).padStart(2, "0");
        return `<option value="${v}">${lab}</option>`;
      }).join("");
    if (savedMes && [...selMes.options].some((o) => o.value === savedMes)) selMes.value = savedMes;
  }
}

function dashB2bPeriodoFiltroAtivo() {
  const ano = document.getElementById("filterDashB2bAno")?.value || "";
  const mes = document.getElementById("filterDashB2bMes")?.value || "";
  return !!(ano || mes);
}

function filterDemandasDashB2bPeriodo(list) {
  const ano = document.getElementById("filterDashB2bAno")?.value || "";
  const mes = document.getElementById("filterDashB2bMes")?.value || "";
  if (!ano && !mes) return list;
  return list.filter((d) => {
    const p = demandaPeriodo(d);
    if (!p) return false;
    if (ano && p.year !== Number(ano)) return false;
    if (mes && p.month !== Number(mes)) return false;
    return true;
  });
}

function labelDashB2bPeriodoFiltro() {
  const ano = document.getElementById("filterDashB2bAno")?.value || "";
  const mes = document.getElementById("filterDashB2bMes")?.value || "";
  if (!ano && !mes) return "";
  if (ano && mes) return `${MESES_PT[Number(mes) - 1] || mes}/${ano}`;
  if (ano) return String(ano);
  return MESES_PT[Number(mes) - 1] || mes;
}

function renderDashIndicadoresB2b() {
  populateDashB2bFilters();
  const listBase = demandasB2bDashboardList();
  const list = filterDemandasDashB2bPeriodo(listBase);
  const listModo = filterDemandasModoDash(list);
  const b = countB2bIndicadores(list);
  const rowsCidade = buildStatsPorCidade(listModo);
  const rowsRegional = buildStatsPorRegional(listModo);

  const kpiEl = document.getElementById("kpiB2b");
  if (kpiEl) {
    const emExecucao = b.execucaoRegional + b.execucaoTerceirizada;
    kpiEl.innerHTML =
      kpiCard("Total de projetos", b.total, "ok", `${rowsRegional.length} regional(is) · ${rowsCidade.length} cidade(s)`) +
      kpiCard(labelValorDashModo(), formatBRL(b.valorTotal), b.valorTotal ? "ok" : "warn") +
      kpiCard(
        "Ticket médio",
        b.ticketMedio != null ? formatBRL(b.ticketMedio) : "—",
        b.ticketMedio != null ? "ok" : "warn",
        "Valor ÷ projetos com valor",
      ) +
      kpiCard("Aguardando BP", b.aguardandoBp, b.aguardandoBp ? "warn" : "ok", "Parados na aprovação") +
      kpiCard("Aprovados", b.aprovados, b.aprovados ? "ok" : "warn", "Projeto final e estoque") +
      kpiCard(
        "Em execução",
        emExecucao,
        emExecucao ? "ok" : "warn",
        `${b.execucaoRegional} regional · ${b.execucaoTerceirizada} terceirizada`,
      ) +
      kpiCard("Concluídos", b.concluido, b.concluido ? "ok" : "warn") +
      kpiCard("Em atraso", b.atraso, b.atraso ? "bad" : "ok") +
      kpiCard("Pausados", b.pausados, b.pausados ? "warn" : "ok");
  }

  const countEl = document.getElementById("dashB2bCount");
  if (countEl) {
    const totalOp = demandasDashOperacionalList().length;
    const totalGeral = demandasDashboardList().length;
    const periodo = labelDashB2bPeriodoFiltro();
    if (!listBase.length) {
      countEl.textContent = "Nenhum projeto na esteira B2B cadastrado.";
    } else if (!list.length) {
      countEl.textContent = periodo
        ? `Nenhum projeto B2B com chegada em ${periodo}.`
        : "Nenhum projeto B2B no filtro de período.";
    } else {
      const sufixoPeriodo = periodo ? ` · chegada: ${periodo}` : "";
      countEl.textContent =
        `${list.length} projeto(s) B2B${sufixoPeriodo} · ${rowsRegional.length} regional(is) · ${rowsCidade.length} cidade(s) · ${totalOp} Esteira Projetos · ${totalGeral} no sistema.`;
    }
  }

  if (!listBase.length) {
    destroyDashB2bRegionalCharts();
    destroyDashB2bComercialCharts();
    dashCharts.chartB2bProduto?.destroy();
    delete dashCharts.chartB2bProduto;
    dashCharts.chartB2bStatus?.destroy();
    delete dashCharts.chartB2bStatus;
    renderDashTempoB2bTable();
    return;
  }

  if (!list.length) {
    destroyDashB2bRegionalCharts();
    destroyDashB2bComercialCharts();
    dashCharts.chartB2bProduto?.destroy();
    delete dashCharts.chartB2bProduto;
    dashCharts.chartB2bStatus?.destroy();
    delete dashCharts.chartB2bStatus;
    renderDashTempoB2bTable();
    return;
  }

  if (!listModo.length) {
    destroyDashB2bRegionalCharts();
    dashCharts.chartB2bProduto?.destroy();
    delete dashCharts.chartB2bProduto;
    dashCharts.chartB2bStatus?.destroy();
    delete dashCharts.chartB2bStatus;
    renderDashSolicitanteB2bCharts(list);
    renderDashTempoB2bTable();
    return;
  }

  renderDashB2bProdutoEFunil(list, listModo);

  const topCidades = rowsCidade.slice(0, 12);
  makeDashChart(
    "chartB2bProjetosCidade",
    "bar",
    topCidades.map((r) => truncateChartLabel(r.cidade, 22)),
    topCidades.map((r) => r.projetos),
    { color: dashSerieCor(), datasetLabel: "Projetos" },
  );

  makeDashChart(
    "chartB2bProjetosRegional",
    "bar",
    rowsRegional.map((r) => truncateChartLabel(r.cidade, 22)),
    rowsRegional.map((r) => r.projetos),
    { color: dashSerieCor(), datasetLabel: "Projetos" },
  );

  renderDashProdutoB2bPorGrupo(
    "chartB2bProdutoCidade",
    "dashB2bProdutoCidadeTable",
    "Cidade",
    listModo,
    rowsCidade,
    demandaCidadesLabels,
  );
  renderDashProdutoB2bPorGrupo(
    "chartB2bProdutoRegional",
    "dashB2bProdutoRegionalTable",
    "Regional",
    listModo,
    rowsRegional,
    demandaRegionaisLabels,
    rowsRegional.length,
  );

  renderDashSolicitanteB2bCharts(list);

  dashCharts.chartB2bProjetista?.destroy();
  delete dashCharts.chartB2bProjetista;
  dashCharts.chartB2bValor?.destroy();
  delete dashCharts.chartB2bValor;

  renderDashTempoB2bTable();
}
