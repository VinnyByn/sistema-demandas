/**
 * Dashboard: cidades/regionais e projetistas.
 * Só declarações (funções e constantes); o que roda ao abrir a página fica em app.js.
 */
function emptyStatsCidade(cidade) {
  return {
    cidade,
    projetos: 0,
    concluidas: 0,
    valor: 0,
    portasNovas: 0,
    metragem: 0,
    comCusto: 0,
    comPortas: 0,
    comLancamento: 0,
  };
}

function accumulateDemandaStatsCidade(row, d, mode = getDashValorModo()) {
  row.projetos += 1;
  if (isStatusConcluidoDemanda(migrateDemanda(d))) row.concluidas += 1;
  const c = normalizeCusto(d.custo);
  if (demandaTemValorFinalDash(d)) {
    row.comCusto += 1;
    row.valor += demandaValorDashPorModo(d, mode);
  }
  if (c.temPortas) {
    row.comPortas += 1;
    row.portasNovas += demandaPortasDashPorModo(d, mode);
  }
  if (c.temLancamento) {
    row.comLancamento += 1;
    row.metragem += demandaMetragemDashPorModo(d, mode);
  }
}

function statsCidadePctConclusao(row) {
  if (!(row.projetos > 0)) return null;
  return Math.round((row.concluidas / row.projetos) * 10000) / 100;
}

function buildStatsPorGrupo(demandas, keyFn) {
  const map = new Map();
  for (const d of demandas) {
    for (const key of [...new Set(resolveGeoKeys(d, keyFn))]) {
      if (!map.has(key)) map.set(key, emptyStatsCidade(key));
      accumulateDemandaStatsCidade(map.get(key), d);
    }
  }
  return [...map.values()].sort((a, b) => b.projetos - a.projetos || a.cidade.localeCompare(b.cidade, "pt-BR"));
}

function buildStatsPorCidade(demandas) {
  return buildStatsPorGrupo(demandas, demandaCidadesLabels);
}

function buildStatsPorRegional(demandas) {
  return buildStatsPorGrupo(demandas, demandaRegionaisLabels);
}

function collectRegionaisFromDemandas(demandas) {
  const set = new Set();
  for (const d of demandas) {
    for (const r of demandaRegionaisLabels(d)) set.add(r);
  }
  return [...set].sort((a, b) => {
    if (a === "Não informada") return 1;
    if (b === "Não informada") return -1;
    return a.localeCompare(b, "pt-BR");
  });
}

function collectCidadesFromDemandas(demandas, regionalFilter) {
  const set = new Set();
  for (const d of demandas) {
    for (const c of demandaCidadesLabels(d)) {
      if (regionalFilter && regionalFromCidadeLabel(c) !== regionalFilter) continue;
      set.add(c);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function populateDashCidadesFilters(demandas) {
  const selReg = document.getElementById("filterDashCidadesRegional");
  const selCid = document.getElementById("filterDashCidadesCidade");
  if (!selReg || !selCid) return;

  const savedReg = selReg.value;
  const savedCid = selCid.value;

  const regionais = collectRegionaisFromDemandas(demandas);
  fillSelectOptions(
    selReg,
    [{ value: "", label: "Todas as regionais" }, ...regionais.map((r) => ({ value: r, label: r }))],
    false,
  );
  if (savedReg && [...selReg.options].some((o) => o.value === savedReg)) selReg.value = savedReg;

  const cidades = collectCidadesFromDemandas(demandas, selReg.value);
  fillSelectOptions(
    selCid,
    [{ value: "", label: "Todas as cidades" }, ...cidades.map((c) => ({ value: c, label: c }))],
    false,
  );
  if (savedCid && [...selCid.options].some((o) => o.value === savedCid)) selCid.value = savedCid;
  else selCid.value = "";
}

function filterDemandasDashCidades(demandas) {
  const regional = document.getElementById("filterDashCidadesRegional")?.value || "";
  const cidade = document.getElementById("filterDashCidadesCidade")?.value || "";
  if (!regional && !cidade) return demandas;
  return demandas.filter((d) => {
    if (regional && !demandaTemRegional(d, regional)) return false;
    if (cidade && !demandaTemCidade(d, cidade)) return false;
    return true;
  });
}

function dashCidadesFiltroAtivo() {
  const regional = document.getElementById("filterDashCidadesRegional")?.value || "";
  const cidade = document.getElementById("filterDashCidadesCidade")?.value || "";
  return !!(regional || cidade);
}

function filterDemandasPjSlice(list, slice) {
  const s = String(slice || "").trim();
  if (!s || s === "total") return list;
  const mode = getDashValorModo();
  if (s === "ativas") return list.filter((d) => isDemandaAtivaCount(d));
  if (s === "concluidas") return list.filter((d) => isDemandaConcluidaCount(d));
  if (s === "pausadas") return list.filter((d) => d.status === "pausado");
  if (s === "reprovadas") {
    return list.filter((d) => {
      const dm = migrateDemanda(d);
      if (inferLinhaEsteira(dm) === LINHA_ESTEIRA_B2B) return false;
      return dm.status === "reprovado";
    });
  }
  if (s === "atraso") return list.filter(isAtraso);
  if (s === "valor") return list.filter((d) => demandaValorDashPorModo(d, mode) > 0);
  if (s === "portas") return list.filter((d) => demandaPortasDashPorModo(d, mode) > 0);
  if (s === "metragem") return list.filter((d) => demandaMetragemDashPorModo(d, mode) > 0);
  if (s.startsWith("tipo:")) {
    const tipo = s.slice(5);
    return list.filter((d) => normalizeTipo(d.tipo) === tipo);
  }
  if (s.startsWith("fase:")) {
    const fase = s.slice(5);
    return list.filter((d) => migrateDemanda(d).status === fase);
  }
  return list;
}

function labelDashGeoSlice(slice) {
  const s = String(slice || "").trim();
  if (!s || s === "total") return "";
  if (s === "ativas") return "Ativas";
  if (s === "concluidas") return "Concluídas";
  if (s === "pausadas") return "Pausadas";
  if (s === "reprovadas") return "Reprovadas";
  if (s === "atraso") return "Em atraso";
  if (s === "valor") return labelValorDashModo();
  if (s === "portas") return "Portas novas";
  if (s === "metragem") return "Metragem";
  if (s.startsWith("tipo:")) return s.slice(5);
  if (s.startsWith("fase:")) {
    const key = s.slice(5);
    return STATUS_LABEL[key] || key;
  }
  return "";
}

function listDemandasDashGeo(kind, key, slice) {
  const alvo = String(key || "");
  if (kind === "segmento") {
    return filterDemandasModoDash(demandasB2cDashboardList()).filter((d) => segmentoB2cBucket(d) === alvo);
  }
  if (kind === "projetista") {
    return filterDemandasPjSlice(demandasDoProjetista(alvo, demandasDashOperacionalList()), slice);
  }
  const list = demandasDashOperacionalList();
  const geo =
    kind === "regional"
      ? list.filter((d) => demandaTemRegional(d, alvo))
      : list.filter((d) => demandaTemCidade(d, alvo));
  return filterDemandasPjSlice(geo, slice);
}

let dashGeoListaCtx = null;
let dashGeoListaReturnOnClose = false;

function sliceToDashGeoFiltros(slice) {
  const s = String(slice || "").trim();
  const filtros = { situacao: "", tipo: "", fase: "", metrica: "" };
  if (["ativas", "concluidas", "pausadas", "reprovadas", "atraso"].includes(s)) filtros.situacao = s;
  else if (["valor", "portas", "metragem"].includes(s)) filtros.metrica = s;
  else if (s.startsWith("tipo:")) filtros.tipo = s.slice(5);
  else if (s.startsWith("fase:")) filtros.fase = s.slice(5);
  return filtros;
}

function dashGeoFiltrosFromDom() {
  return {
    situacao: document.getElementById("filterDashGeoSit")?.value || "",
    tipo: document.getElementById("filterDashGeoTipo")?.value || "",
    fase: document.getElementById("filterDashGeoFase")?.value || "",
    metrica: document.getElementById("filterDashGeoMetrica")?.value || "",
  };
}

function syncDashGeoFiltrosDom(filtros = {}) {
  const sit = document.getElementById("filterDashGeoSit");
  const tipo = document.getElementById("filterDashGeoTipo");
  const fase = document.getElementById("filterDashGeoFase");
  const met = document.getElementById("filterDashGeoMetrica");
  if (sit) sit.value = filtros.situacao || "";
  if (tipo && [...tipo.options].some((o) => o.value === (filtros.tipo || ""))) tipo.value = filtros.tipo || "";
  if (fase && [...fase.options].some((o) => o.value === (filtros.fase || ""))) fase.value = filtros.fase || "";
  if (met) met.value = filtros.metrica || "";
}

function applyDashGeoFiltros(list, filtros = {}) {
  let out = list;
  if (filtros.situacao) out = filterDemandasPjSlice(out, filtros.situacao);
  if (filtros.tipo) out = out.filter((d) => normalizeTipo(d.tipo) === filtros.tipo);
  if (filtros.fase) out = out.filter((d) => migrateDemanda(d).status === filtros.fase);
  if (filtros.metrica) out = filterDemandasPjSlice(out, filtros.metrica);
  return out;
}

function labelDashGeoFiltrosAtivos(filtros = {}) {
  const parts = [];
  if (filtros.situacao) parts.push(labelDashGeoSlice(filtros.situacao));
  if (filtros.tipo) parts.push(filtros.tipo);
  if (filtros.fase) parts.push(STATUS_LABEL[filtros.fase] || filtros.fase);
  if (filtros.metrica) parts.push(labelDashGeoSlice(filtros.metrica));
  return parts.filter(Boolean);
}

function fillDashGeoFiltrosOptions(list) {
  const tipoSel = document.getElementById("filterDashGeoTipo");
  const faseSel = document.getElementById("filterDashGeoFase");
  const tipos = [...new Set(list.map((d) => normalizeTipo(d.tipo)).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
  const fases = [...STATUS_ORDER, ...STATUS_EXTRA]
    .map(([k, lab]) => ({ k, lab, n: list.filter((d) => migrateDemanda(d).status === k).length }))
    .filter((it) => it.n > 0);
  if (tipoSel) {
    fillSelectOptions(tipoSel, [{ value: "", label: "Todos" }, ...tipos.map((t) => ({ value: t, label: t }))]);
  }
  if (faseSel) {
    fillSelectOptions(faseSel, [{ value: "", label: "Todas" }, ...fases.map((it) => ({ value: it.k, label: it.lab }))]);
  }
}

function renderDashGeoProjetosTable() {
  const titleEl = document.getElementById("modalDashGeoProjetosTitle");
  const subEl = document.getElementById("modalDashGeoProjetosSub");
  const tableEl = document.getElementById("modalDashGeoProjetosTable");
  const ctx = dashGeoListaCtx;
  if (!tableEl || !ctx) return;

  const filtros = dashGeoFiltrosFromDom();
  ctx.filtros = filtros;
  const full = ctx.list || [];
  const list = applyDashGeoFiltros(full, filtros).sort((a, b) =>
    String(a.titulo || "").localeCompare(String(b.titulo || ""), "pt-BR"),
  );

  const kind = ctx.kind;
  const kindLabel =
    kind === "regional" ? "Regional" : kind === "segmento" ? "Segmento" : kind === "projetista" ? "Projetista" : "Cidade";
  const filtroLabels = labelDashGeoFiltrosAtivos(filtros);
  if (titleEl) {
    titleEl.textContent = filtroLabels.length
      ? `Projetos — ${kindLabel}: ${ctx.key} · ${filtroLabels.join(" · ")}`
      : `Projetos — ${kindLabel}: ${ctx.key}`;
  }
  if (subEl) {
    const periodo = labelDashPeriodoFiltro();
    const origem = kind === "segmento" ? "B2C" : "Esteira Projetos (sem B2B)";
    const qtd = filtroLabels.length ? `${list.length} de ${full.length}` : String(list.length);
    subEl.textContent = `${qtd} projeto(s) · ${origem} · ${periodo}`;
  }

  if (!list.length) {
    tableEl.innerHTML = '<p class="muted small">Nenhum projeto neste agrupamento com os filtros atuais.</p>';
    return;
  }

  let body = "";
  for (const d of list) {
    const dm = migrateDemanda(d);
    body +=
      "<tr>" +
      `<td><button type="button" class="dash-geo-link" data-dash-geo-open-demanda="${escapeHtml(dm.id)}">${escapeHtml(dm.titulo || "(Sem título)")}</button></td>` +
      `<td>${escapeHtml(normalizeTipo(dm.tipo) || "—")}</td>` +
      `<td>${escapeHtml(labelStatus(dm.status, dm.linhaEsteira) || dm.status || "—")}</td>` +
      `<td>${escapeHtml(formatProjetistasDemanda(dm) || labelProjetista(dm.responsavel))}</td>` +
      `<td>${escapeHtml(formatCidadesDemanda(dm))}</td>` +
      `<td>${escapeHtml(formatDataISO(demandaDataChegadaDash(dm)) || "—")}</td>` +
      "</tr>";
  }
  tableEl.innerHTML =
    '<table class="dash-table"><thead><tr>' +
    "<th>Projeto</th><th>Tipo</th><th>Status</th><th>Projetista</th><th>Cidade</th><th>Chegada</th>" +
    "</tr></thead><tbody>" +
    body +
    "</tbody></table>";
}

function restoreDashGeoListaIfNeeded() {
  if (!dashGeoListaReturnOnClose || !dashGeoListaCtx) return;
  const ctx = dashGeoListaCtx;
  dashGeoListaReturnOnClose = false;
  const snap = snapshotPageScroll();
  requestAnimationFrame(() => {
    openDashGeoProjetosLista(ctx.kind, ctx.key, ctx.slice, ctx.filtros);
    restorePageScroll(snap);
  });
}

function openDashGeoProjetosLista(kind, key, slice, filtrosPreset) {
  const dlg = document.getElementById("modalDashGeoProjetos");
  const tableEl = document.getElementById("modalDashGeoProjetosTable");
  if (!dlg || !tableEl) return;

  const full = listDemandasDashGeo(kind, key, "").sort((a, b) =>
    String(a.titulo || "").localeCompare(String(b.titulo || ""), "pt-BR"),
  );
  const filtros = filtrosPreset && typeof filtrosPreset === "object" ? { ...filtrosPreset } : sliceToDashGeoFiltros(slice);
  dashGeoListaCtx = {
    kind: String(kind || ""),
    key: String(key || ""),
    slice: String(slice || ""),
    list: full,
    filtros,
  };
  dashGeoListaReturnOnClose = false;
  fillDashGeoFiltrosOptions(full);
  syncDashGeoFiltrosDom(filtros);
  renderDashGeoProjetosTable();

  if (typeof dlg.showModal === "function" && !dlg.open) dlg.showModal();
}

function initDashGeoProjetosLista() {
  if (initDashGeoProjetosLista._done) return;
  initDashGeoProjetosLista._done = true;
  const dlg = document.getElementById("modalDashGeoProjetos");
  const close = () => {
    dashGeoListaReturnOnClose = false;
    dashGeoListaCtx = null;
    dlg?.close();
  };
  document.getElementById("modalDashGeoProjetosClose")?.addEventListener("click", close);
  document.getElementById("modalDashGeoProjetosOk")?.addEventListener("click", close);
  dlg?.addEventListener("close", () => {
    if (!dashGeoListaReturnOnClose) dashGeoListaCtx = null;
  });
  ["filterDashGeoSit", "filterDashGeoTipo", "filterDashGeoFase", "filterDashGeoMetrica"].forEach((id) => {
    document.getElementById(id)?.addEventListener("change", () => {
      if (dashGeoListaCtx) renderDashGeoProjetosTable();
    });
  });
  document.addEventListener("click", (e) => {
    const openDem = e.target.closest?.("[data-dash-geo-open-demanda]");
    if (openDem) {
      const id = openDem.getAttribute("data-dash-geo-open-demanda");
      if (id) {
        dashGeoListaReturnOnClose = true;
        dlg?.close();
        openDemandaModal(id);
      }
      return;
    }
    const btn = e.target.closest?.("[data-dash-geo-list]");
    if (!btn || !btn.closest("#panelDashboard")) return;
    openDashGeoProjetosLista(
      btn.getAttribute("data-dash-geo-kind"),
      btn.getAttribute("data-dash-geo-key"),
      btn.getAttribute("data-dash-geo-slice"),
    );
  });
}

let dashCidadesDrillRegional = "";

const DASH_CIDADES_DRILL_CHART_IDS = [
  "chartCidSit",
  "chartCidTipoMix",
  "chartCidFase",
  "chartCidCitySit",
  "chartCidCityGastos",
  "chartCidCityPortas",
];
const DASH_CIDADES_RANK_CHART_IDS = ["chartCidRankSit", "chartCidRankGastos", "chartCidRankPortas"];

function statsGeoGrupo(list) {
  const mode = getDashValorModo();
  let valorTotal = 0;
  let metragemTotal = 0;
  let portasNovasTotal = 0;
  for (const d of list) {
    valorTotal += demandaValorDashPorModo(d, mode);
    metragemTotal += demandaMetragemDashPorModo(d, mode);
    portasNovasTotal += demandaPortasDashPorModo(d, mode);
  }
  return { ...countDemandas(list), valorTotal, metragemTotal, portasNovasTotal, list };
}

function buildStatsGeoPorGrupo(demandas, keyFn) {
  const map = new Map();
  for (const d of demandas) {
    for (const key of [...new Set(resolveGeoKeys(d, keyFn))]) {
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(d);
    }
  }
  return [...map.entries()]
    .map(([nome, list]) => ({ nome, ...statsGeoGrupo(list) }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, "pt-BR"));
}

function hideDashCidadesDrill() {
  const drillEl = document.getElementById("dashCidadesDrill");
  if (drillEl) drillEl.hidden = true;
  const kpis = document.getElementById("dashCidadesDrillKpis");
  if (kpis) kpis.innerHTML = "";
  const titleEl = document.getElementById("dashCidadesDrillTitle");
  if (titleEl) titleEl.textContent = "Detalhe da regional";
  const hintEl = document.getElementById("dashCidadesDrillHint");
  if (hintEl) hintEl.textContent = "";
  DASH_CIDADES_DRILL_CHART_IDS.forEach((id) => {
    if (dashCharts[id]) {
      dashCharts[id].destroy();
      delete dashCharts[id];
    }
  });
}

function setDashCidadesDrillRegional(regional, { syncSelect = true } = {}) {
  dashCidadesDrillRegional = String(regional || "").trim();
  if (syncSelect) {
    const sel = document.getElementById("filterDashCidadesRegional");
    if (sel) sel.value = dashCidadesDrillRegional;
    const selCid = document.getElementById("filterDashCidadesCidade");
    if (selCid && !dashCidadesDrillRegional) selCid.value = "";
  }
  renderDashCidades();
  if (!dashCidadesDrillRegional) return;
  requestAnimationFrame(() => {
    document.getElementById("dashCidadesDrill")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
}

function initDashCidadesDrill() {
  if (initDashCidadesDrill._done) return;
  initDashCidadesDrill._done = true;
  document.getElementById("btnDashCidadesDrillFechar")?.addEventListener("click", () => {
    setDashCidadesDrillRegional("");
  });
  document.getElementById("btnDashCidadesVerProjetos")?.addEventListener("click", () => {
    if (dashCidadesDrillRegional) openDashGeoProjetosLista("regional", dashCidadesDrillRegional, "total");
  });
}

function renderDashGeoRankCharts(prefix, rows, onPick, activeNome) {
  if (!rows.length) return;
  const sitId = `${prefix}Sit`;
  const gasId = `${prefix}Gastos`;
  const porId = `${prefix}Portas`;
  // Série única: uma cor só — o nome já está no eixo.
  const colors = (list) => list.map(() => dashSerieCor());
  setDashPjChartWrapHeight(sitId, rows.length);
  setDashPjChartWrapHeight(gasId, rows.length);
  setDashPjChartWrapHeight(porId, rows.length);
  const ordered = [...rows].sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, "pt-BR"));
  makeDashChartProjetistaStacked(
    sitId,
    ordered.map((r) => truncateChartLabel(r.nome, 18)),
    [
      { label: "Ativas", data: ordered.map((r) => r.ativas), backgroundColor: "#6366f1", borderWidth: 0 },
      { label: "Concluídas", data: ordered.map((r) => r.concluidas), backgroundColor: "#22c55e", borderWidth: 0 },
      { label: "Pausadas", data: ordered.map((r) => r.pausadas), backgroundColor: "#f59e0b", borderWidth: 0 },
      { label: "Reprovadas", data: ordered.map((r) => r.reprovadas), backgroundColor: "#ef4444", borderWidth: 0 },
    ].filter((ds) => ds.data.some((n) => n > 0)),
    { horizontal: true, showPct: true, onBarClick: (_l, i) => onPick(ordered[i]?.nome) },
  );
  const gastosRows = [...ordered].sort((a, b) => b.valorTotal - a.valorTotal || a.nome.localeCompare(b.nome, "pt-BR"));
  makeDashChartMoneyBar(
    gasId,
    gastosRows.map((r) => truncateChartLabel(r.nome, 18)),
    gastosRows.map((r) => r.valorTotal),
    colors(gastosRows),
    {
      horizontal: true,
      showPct: true,
      datasetLabel: labelValorDashModo(),
      onBarClick: (_l, i) => onPick(gastosRows[i]?.nome),
    },
  );
  const portasRows = [...ordered].sort(
    (a, b) => b.portasNovasTotal - a.portasNovasTotal || a.nome.localeCompare(b.nome, "pt-BR"),
  );
  makeDashChartMetricBar(
    porId,
    portasRows.map((r) => truncateChartLabel(r.nome, 18)),
    portasRows.map((r) => r.portasNovasTotal),
    {
      colors: colors(portasRows),
      datasetLabel: "Portas novas",
      formatValue: formatQtd,
      horizontal: true,
      showPct: true,
      onBarClick: (_l, i) => onPick(portasRows[i]?.nome),
    },
  );
}

function renderDashGeoDetailCharts(list, kind, key) {
  const s = statsGeoGrupo(list);
  const sitItems = [
    { label: "Ativas", n: s.ativas, color: "#6366f1" },
    { label: "Pausadas", n: s.pausadas, color: "#f59e0b" },
    { label: "Concluídas", n: s.concluidas, color: "#22c55e" },
    { label: "Reprovadas", n: s.reprovadas, color: "#ef4444" },
  ].filter((it) => it.n > 0);
  makeDashChart(
    "chartCidSit",
    "doughnut",
    sitItems.map((it) => it.label),
    sitItems.map((it) => it.n),
    {
      colors: sitItems.map((it) => it.color),
      showPct: true,
      onBarClick: (label) => {
        const sitSlice =
          label === "Ativas"
            ? "ativas"
            : label === "Pausadas"
              ? "pausadas"
              : label === "Concluídas"
                ? "concluidas"
                : label === "Reprovadas"
                  ? "reprovadas"
                  : "total";
        openDashGeoProjetosLista(kind, key, sitSlice);
      },
    },
  );

  const tipos = tiposOperacionalDash()
    .map((tipo) => ({
      tipo,
      n: list.filter((d) => normalizeTipo(d.tipo) === tipo).length,
      color: tipoChartCor(tipo),
    }))
    .filter((it) => it.n > 0)
    .sort((a, b) => b.n - a.n);
  setDashPjChartWrapHeight("chartCidTipoMix", tipos.length, 180, 32);
  makeDashChartMetricBar(
    "chartCidTipoMix",
    tipos.map((it) => it.tipo),
    tipos.map((it) => it.n),
    {
      colors: tipos.map((it) => it.color),
      datasetLabel: "Projetos",
      formatValue: (v) => String(v),
      horizontal: true,
      showPct: true,
      onBarClick: (_l, i) => openDashGeoProjetosLista(kind, key, `tipo:${tipos[i]?.tipo || ""}`),
    },
  );

  const faseItems = [...STATUS_ORDER, ...STATUS_EXTRA]
    .map(([status, label]) => ({
      key: status,
      label,
      n: list.filter((d) => migrateDemanda(d).status === status).length,
      color: STATUS_CHART_COLORS[status] || "#94a3b8",
    }))
    .filter((it) => it.n > 0);
  setDashPjChartWrapHeight("chartCidFase", faseItems.length, 220, 26);
  makeDashChartMetricBar(
    "chartCidFase",
    faseItems.map((it) => truncateChartLabel(it.label, 22)),
    faseItems.map((it) => it.n),
    {
      colors: faseItems.map((it) => it.color),
      datasetLabel: "Projetos",
      formatValue: (v) => String(v),
      horizontal: true,
      showPct: true,
      onBarClick: (_l, i) => openDashGeoProjetosLista(kind, key, `fase:${faseItems[i]?.key || ""}`),
    },
  );
  return s;
}

function renderDashCidades() {
  const kpiEl = document.getElementById("dashCidadesKpis");
  const countEl = document.getElementById("dashCidadesCount");
  const rankEl = document.getElementById("dashCidadesRankCharts");

  const todasBase = demandasDashOperacionalList();
  populateDashCidadesFilters(todasBase);
  const filtroReg = document.getElementById("filterDashCidadesRegional")?.value || "";
  if (filtroReg) dashCidadesDrillRegional = filtroReg;

  const rowsRegional = buildStatsGeoPorGrupo(todasBase, demandaRegionaisLabels);
  const rowsCidadeAll = buildStatsGeoPorGrupo(todasBase, demandaCidadesLabels);
  const tot = statsGeoGrupo(todasBase);

  if (!todasBase.length) {
    destroyDashRegionalCharts();
    hideDashCidadesDrill();
    if (kpiEl) kpiEl.innerHTML = "";
    if (rankEl) rankEl.hidden = true;
    if (countEl) countEl.textContent = "Nenhum projeto cadastrado.";
    return;
  }

  if (kpiEl) {
    kpiEl.innerHTML =
      kpiCard("Regionais", rowsRegional.length, "ok") +
      kpiCard("Cidades", rowsCidadeAll.length, "ok") +
      kpiCard("Projetos", tot.total, tot.total ? "ok" : "warn") +
      kpiCard("Em atraso", tot.atraso, tot.atraso ? "bad" : "ok") +
      kpiCard(labelValorDashModo(), formatBRL(tot.valorTotal), tot.valorTotal ? "ok" : "warn") +
      kpiCard("Portas novas", formatQtd(tot.portasNovasTotal), tot.portasNovasTotal ? "ok" : "warn");
  }
  if (countEl) {
    countEl.textContent = `${rowsRegional.length} regional(is) · ${rowsCidadeAll.length} cidade(s) · ${tot.total} projeto(s) · Esteira Projetos (sem B2B) · ${labelDashPeriodoFiltro()}.`;
  }

  if (!rowsRegional.length) {
    DASH_CIDADES_RANK_CHART_IDS.forEach((id) => {
      if (dashCharts[id]) {
        dashCharts[id].destroy();
        delete dashCharts[id];
      }
    });
    if (rankEl) rankEl.hidden = true;
    hideDashCidadesDrill();
    return;
  }

  if (rankEl) rankEl.hidden = false;
  renderDashGeoRankCharts("chartCidRank", rowsRegional, (nome) => setDashCidadesDrillRegional(nome), dashCidadesDrillRegional);

  const nomesValidos = new Set(rowsRegional.map((r) => r.nome));
  if (dashCidadesDrillRegional && !nomesValidos.has(dashCidadesDrillRegional)) {
    dashCidadesDrillRegional = "";
  }
  if (!dashCidadesDrillRegional) {
    hideDashCidadesDrill();
    return;
  }

  const listReg = todasBase.filter((d) => demandaTemRegional(d, dashCidadesDrillRegional));
  const s = statsGeoGrupo(listReg);
  const drillEl = document.getElementById("dashCidadesDrill");
  const titleEl = document.getElementById("dashCidadesDrillTitle");
  const hintEl = document.getElementById("dashCidadesDrillHint");
  const kpisEl = document.getElementById("dashCidadesDrillKpis");
  if (drillEl) drillEl.hidden = false;
  if (titleEl) titleEl.textContent = dashCidadesDrillRegional;
  if (hintEl) {
    hintEl.textContent = `${s.total} projeto(s) nesta regional · ${labelDashPeriodoFiltro()}. Clique em cada número para ver os projetos correspondentes.`;
  }
  if (kpisEl) {
    const geoAttrs = `data-dash-geo-list data-dash-geo-kind="regional" data-dash-geo-key="${escapeHtml(dashCidadesDrillRegional)}"`;
    const kpiBtn = (label, value, tone, slice) =>
      `<button type="button" class="kpi kpi--${tone} kpi--click" ${geoAttrs} data-dash-geo-slice="${escapeHtml(slice)}" title="Ver ${escapeHtml(label)}">` +
      `<div class="kpi__label">${label}</div><div class="kpi__value">${value}</div></button>`;
    kpisEl.innerHTML =
      kpiBtn("Total", s.total, "ok", "total") +
      kpiBtn("Ativas", s.ativas, "ok", "ativas") +
      kpiBtn("Concluídas", s.concluidas, "ok", "concluidas") +
      kpiBtn("Em atraso", s.atraso, s.atraso ? "bad" : "ok", "atraso") +
      kpiBtn(labelValorDashModo(), formatBRL(s.valorTotal), s.valorTotal ? "ok" : "warn", "valor") +
      kpiBtn("Portas novas", formatQtd(s.portasNovasTotal), s.portasNovasTotal ? "ok" : "warn", "portas") +
      kpiBtn("Metragem", formatMetros(s.metragemTotal), s.metragemTotal ? "ok" : "warn", "metragem");
  }

  renderDashGeoDetailCharts(listReg, "regional", dashCidadesDrillRegional);

  const rowsCidade = buildStatsGeoPorGrupo(listReg, (d) =>
    demandaCidadesLabels(d).filter((c) => regionalFromCidadeLabel(c) === dashCidadesDrillRegional),
  );
  const cityCharts = document.getElementById("dashCidadesCityCharts");
  const cityHead = document.getElementById("dashCidadesCityHead");
  if (!rowsCidade.length) {
    ["chartCidCitySit", "chartCidCityGastos", "chartCidCityPortas"].forEach((id) => {
      if (dashCharts[id]) {
        dashCharts[id].destroy();
        delete dashCharts[id];
      }
    });
    if (cityCharts) cityCharts.hidden = true;
    if (cityHead) cityHead.hidden = true;
    return;
  }
  if (cityCharts) cityCharts.hidden = false;
  if (cityHead) cityHead.hidden = false;
  renderDashGeoRankCharts("chartCidCity", rowsCidade, (cidade) => openDashGeoProjetosLista("cidade", cidade, "total"));
}

function demandaTempoTotalMs(d) {
  return Object.values(demandaTempoPorFase(d)).reduce((acc, ms) => acc + ms, 0);
}

function demandasDoProjetista(nome, baseList = demandasDashOperacionalList()) {
  const alvo = String(nome || "").trim();
  if (!alvo) return [];
  return baseList.filter((d) => demandaTemProjetista(d, alvo));
}

function statsProjetista(nome, baseList = demandasDashOperacionalList()) {
  const list = demandasDoProjetista(nome, baseList);
  let valorTotal = 0;
  let metragemTotal = 0;
  let portasNovasTotal = 0;
  let comCusto = 0;
  let comLancamento = 0;
  const mode = getDashValorModo();
  for (const d of list) {
    valorTotal += demandaValorDashPorModo(d, mode);
    metragemTotal += demandaMetragemDashPorModo(d, mode);
    portasNovasTotal += demandaPortasDashPorModo(d, mode);
    const c = normalizeCusto(d.custo);
    if (c.temLevantamento) comCusto += 1;
    if (c.temLancamento) comLancamento += 1;
  }
  return { ...countDemandas(list), valorTotal, metragemTotal, portasNovasTotal, comCusto, comLancamento, list };
}

let dashPjDrillNome = "";

const DASH_PJ_RANK_CHART_IDS = ["chartPjRankSituacao", "chartPjRankGastos", "chartPjRankPortas"];
const DASH_PJ_DRILL_CHART_IDS = ["chartPjSituacao", "chartPjTipo", "chartPjFase"];

function destroyDashPjCharts(ids) {
  ids.forEach((id) => {
    if (dashCharts[id]) {
      dashCharts[id].destroy();
      delete dashCharts[id];
    }
  });
}

function setDashPjChartWrapHeight(canvasId, n, min = 220, per = 28) {
  const wrap = document.getElementById(canvasId)?.closest(".chart-wrap");
  if (wrap) wrap.style.height = `${Math.max(min, n * per + 24)}px`;
}

function hideDashPjDrill() {
  const drillEl = document.getElementById("dashPjDrill");
  if (drillEl) drillEl.hidden = true;
  const kpis = document.getElementById("dashPjDrillKpis");
  if (kpis) kpis.innerHTML = "";
  const titleEl = document.getElementById("dashPjDrillTitle");
  if (titleEl) titleEl.textContent = "Detalhe do projetista";
  const hintEl = document.getElementById("dashPjDrillHint");
  if (hintEl) hintEl.textContent = "";
  destroyDashPjCharts(DASH_PJ_DRILL_CHART_IDS);
}

function setDashPjDrill(nome, { syncSelect = true } = {}) {
  dashPjDrillNome = String(nome || "").trim();
  if (syncSelect) {
    const sel = document.getElementById("filterDashProjetistaResumo");
    if (sel) {
      sel.value = dashPjDrillNome || FILTER_PROJETISTA_TODOS;
    }
  }
  renderKpiProjetistas();
  if (!dashPjDrillNome) return;
  requestAnimationFrame(() => {
    document.getElementById("dashPjDrill")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
}

function initDashPjDrill() {
  if (initDashPjDrill._done) return;
  initDashPjDrill._done = true;
  document.getElementById("btnDashPjDrillFechar")?.addEventListener("click", () => {
    setDashPjDrill("");
  });
  document.getElementById("btnDashPjVerProjetos")?.addEventListener("click", () => {
    if (dashPjDrillNome) openDashGeoProjetosLista("projetista", dashPjDrillNome, "total");
  });
  document.getElementById("dashPjDrill")?.addEventListener("click", (e) => {
    const btn = e.target.closest?.("[data-dash-pj-slice]");
    if (!btn) return;
    e.preventDefault();
    const nome = btn.getAttribute("data-dash-pj-nome") || dashPjDrillNome;
    if (nome) openDashGeoProjetosLista("projetista", nome, btn.getAttribute("data-dash-pj-slice") || "total");
  });
}

function buildStatsPorProjetista(baseList = demandasDashOperacionalList()) {
  return allProjetistasNomes()
    .map((nome) => ({ nome, ...statsProjetista(nome, baseList) }))
    .filter((row) => row.total > 0);
}

function rankPjBarColors(rows) {
  return rows.map(() => dashSerieCor());
}

function renderDashPjRankCharts(rows) {
  const rankEl = document.getElementById("dashPjRankCharts");
  if (!rows.length) {
    destroyDashPjCharts(DASH_PJ_RANK_CHART_IDS);
    if (rankEl) rankEl.hidden = true;
    return;
  }
  if (rankEl) rankEl.hidden = false;
  const ordered = [...rows].sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, "pt-BR"));
  const labels = ordered.map((r) => truncateChartLabel(r.nome, 18));
  const openDrill = (_label, i) => setDashPjDrill(ordered[i]?.nome);
  setDashPjChartWrapHeight("chartPjRankSituacao", ordered.length);
  setDashPjChartWrapHeight("chartPjRankGastos", ordered.length);
  setDashPjChartWrapHeight("chartPjRankPortas", ordered.length);

  makeDashChartProjetistaStacked(
    "chartPjRankSituacao",
    labels,
    [
      { label: "Ativas", data: ordered.map((r) => r.ativas), backgroundColor: "#6366f1", borderWidth: 0 },
      { label: "Concluídas", data: ordered.map((r) => r.concluidas), backgroundColor: "#22c55e", borderWidth: 0 },
      { label: "Pausadas", data: ordered.map((r) => r.pausadas), backgroundColor: "#f59e0b", borderWidth: 0 },
      { label: "Reprovadas", data: ordered.map((r) => r.reprovadas), backgroundColor: "#ef4444", borderWidth: 0 },
    ].filter((ds) => ds.data.some((n) => n > 0)),
    { horizontal: true, showPct: true, onBarClick: openDrill },
  );

  const gastosRows = [...ordered].sort((a, b) => b.valorTotal - a.valorTotal || a.nome.localeCompare(b.nome, "pt-BR"));
  makeDashChartMoneyBar(
    "chartPjRankGastos",
    gastosRows.map((r) => truncateChartLabel(r.nome, 18)),
    gastosRows.map((r) => r.valorTotal),
    rankPjBarColors(gastosRows),
    {
      horizontal: true,
      showPct: true,
      datasetLabel: labelValorDashModo(),
      onBarClick: (_l, i) => setDashPjDrill(gastosRows[i]?.nome),
    },
  );

  const portasRows = [...ordered].sort((a, b) => b.portasNovasTotal - a.portasNovasTotal || a.nome.localeCompare(b.nome, "pt-BR"));
  makeDashChartMetricBar(
    "chartPjRankPortas",
    portasRows.map((r) => truncateChartLabel(r.nome, 18)),
    portasRows.map((r) => r.portasNovasTotal),
    {
      colors: rankPjBarColors(portasRows),
      datasetLabel: "Portas novas",
      formatValue: formatQtd,
      horizontal: true,
      showPct: true,
      onBarClick: (_l, i) => setDashPjDrill(portasRows[i]?.nome),
    },
  );
}

function renderDashPjDrill(nome, baseList) {
  const drillEl = document.getElementById("dashPjDrill");
  const kpisEl = document.getElementById("dashPjDrillKpis");
  const titleEl = document.getElementById("dashPjDrillTitle");
  const hintEl = document.getElementById("dashPjDrillHint");
  if (!drillEl || !nome) {
    hideDashPjDrill();
    return;
  }
  const s = statsProjetista(nome, baseList);
  const list = s.list || [];
  const valorModoLabel = labelValorDashModo();
  const periodo = labelDashPeriodoFiltro();
  drillEl.hidden = false;
  if (titleEl) titleEl.textContent = nome;
  if (hintEl) {
    hintEl.textContent = `${s.total} projeto(s) · Esteira Projetos (sem B2B) · ${periodo}. Clique em cada número para ver os projetos correspondentes.`;
  }
  if (kpisEl) {
    const kpiBtn = (label, value, tone, slice) =>
      `<button type="button" class="kpi kpi--${tone} kpi--click" data-dash-pj-nome="${escapeHtml(nome)}" data-dash-pj-slice="${escapeHtml(slice)}" title="Ver ${escapeHtml(label)}">` +
      `<div class="kpi__label">${label}</div><div class="kpi__value">${value}</div></button>`;
    kpisEl.innerHTML =
      kpiBtn("Total", s.total, "ok", "total") +
      kpiBtn("Ativas", s.ativas, "ok", "ativas") +
      kpiBtn("Concluídas", s.concluidas, "ok", "concluidas") +
      kpiBtn("Em atraso", s.atraso, s.atraso ? "bad" : "ok", "atraso") +
      kpiBtn(valorModoLabel, formatBRL(s.valorTotal), s.valorTotal ? "ok" : "warn", "valor") +
      kpiBtn("Portas novas", formatQtd(s.portasNovasTotal), s.portasNovasTotal ? "ok" : "warn", "portas") +
      kpiBtn("Metragem", formatMetros(s.metragemTotal), s.metragemTotal ? "ok" : "warn", "metragem");
  }

  const sitItems = [
    { label: "Ativas", n: s.ativas, color: "#6366f1" },
    { label: "Pausadas", n: s.pausadas, color: "#f59e0b" },
    { label: "Concluídas", n: s.concluidas, color: "#22c55e" },
    { label: "Reprovadas", n: s.reprovadas, color: "#ef4444" },
  ].filter((it) => it.n > 0);
  makeDashChart(
    "chartPjSituacao",
    "doughnut",
    sitItems.map((it) => it.label),
    sitItems.map((it) => it.n),
    {
      colors: sitItems.map((it) => it.color),
      showPct: true,
      onBarClick: (label) => {
        const sitSlice =
          label === "Ativas"
            ? "ativas"
            : label === "Pausadas"
              ? "pausadas"
              : label === "Concluídas"
                ? "concluidas"
                : label === "Reprovadas"
                  ? "reprovadas"
                  : "total";
        openDashGeoProjetosLista("projetista", nome, sitSlice);
      },
    },
  );

  const tipos = tiposOperacionalDash()
    .map((tipo) => ({
      tipo,
      n: list.filter((d) => normalizeTipo(d.tipo) === tipo).length,
      color: tipoChartCor(tipo),
    }))
    .filter((it) => it.n > 0)
    .sort((a, b) => b.n - a.n);
  setDashPjChartWrapHeight("chartPjTipo", tipos.length, 180, 32);
  makeDashChartMetricBar(
    "chartPjTipo",
    tipos.map((it) => it.tipo),
    tipos.map((it) => it.n),
    {
      colors: tipos.map((it) => it.color),
      datasetLabel: "Projetos",
      formatValue: (v) => String(v),
      horizontal: true,
      showPct: true,
      onBarClick: (_l, i) => openDashGeoProjetosLista("projetista", nome, `tipo:${tipos[i]?.tipo || ""}`),
    },
  );

  const faseItems = [...STATUS_ORDER, ...STATUS_EXTRA]
    .map(([key, label]) => ({
      key,
      label,
      n: list.filter((d) => migrateDemanda(d).status === key).length,
      color: STATUS_CHART_COLORS[key] || "#94a3b8",
    }))
    .filter((it) => it.n > 0);
  setDashPjChartWrapHeight("chartPjFase", faseItems.length, 220, 26);
  makeDashChartMetricBar(
    "chartPjFase",
    faseItems.map((it) => truncateChartLabel(it.label, 22)),
    faseItems.map((it) => it.n),
    {
      colors: faseItems.map((it) => it.color),
      datasetLabel: "Projetos",
      formatValue: (v) => String(v),
      horizontal: true,
      showPct: true,
      onBarClick: (_l, i) => openDashGeoProjetosLista("projetista", nome, `fase:${faseItems[i]?.key || ""}`),
    },
  );
}

function renderKpiProjetistas(baseList = demandasDashOperacionalList()) {
  const wrap = document.getElementById("kpiProjetistas");
  const hint = document.getElementById("kpiProjetistasHint");
  if (!wrap) return;
  fillFilterDashProjetistaResumo();
  const filtro = document.getElementById("filterDashProjetistaResumo")?.value || FILTER_PROJETISTA_TODOS;
  if (filtro && filtro !== FILTER_PROJETISTA_TODOS) dashPjDrillNome = filtro;

  const rows = buildStatsPorProjetista(baseList);
  const valorModoLabel = labelValorDashModo();
  const seenPj = new Set();
  const uniquePj = [];
  for (const r of rows) {
    for (const d of r.list || []) {
      if (seenPj.has(d.id)) continue;
      seenPj.add(d.id);
      uniquePj.push(d);
    }
  }
  const totCounts = countDemandas(uniquePj);
  const modePj = getDashValorModo();
  let valorUnique = 0;
  let portasUnique = 0;
  for (const d of uniquePj) {
    valorUnique += demandaValorDashPorModo(d, modePj);
    portasUnique += demandaPortasDashPorModo(d, modePj);
  }
  const tot = {
    projetos: totCounts.total,
    atraso: totCounts.atraso,
    valor: valorUnique,
    portas: portasUnique,
  };

  if (!rows.length) {
    wrap.innerHTML = "";
    if (hint) {
      hint.hidden = false;
      hint.textContent = "Nenhum projetista com projeto na Esteira Projetos para a base de indicadores atual.";
    }
    destroyDashPjCharts(DASH_PJ_RANK_CHART_IDS);
    const rankEl = document.getElementById("dashPjRankCharts");
    if (rankEl) rankEl.hidden = true;
    hideDashPjDrill();
    return;
  }

  if (hint) hint.hidden = true;
  wrap.innerHTML =
    kpiCard("Projetistas", rows.length, "ok") +
    kpiCard("Projetos", tot.projetos, tot.projetos ? "ok" : "warn") +
    kpiCard("Em atraso", tot.atraso, tot.atraso ? "bad" : "ok") +
    kpiCard(valorModoLabel, formatBRL(tot.valor), tot.valor ? "ok" : "warn") +
    kpiCard("Portas novas", formatQtd(tot.portas), tot.portas ? "ok" : "warn");

  renderDashPjRankCharts(rows);

  const nomesValidos = new Set(rows.map((r) => r.nome));
  if (dashPjDrillNome && !nomesValidos.has(dashPjDrillNome)) {
    dashPjDrillNome = "";
  }
  if (dashPjDrillNome) renderDashPjDrill(dashPjDrillNome, baseList);
  else hideDashPjDrill();
}

function countTiposDoProjetista(nome, baseList = demandasDashOperacionalList()) {
  const list = demandasDoProjetista(nome, baseList);
  const tipos = tiposFiltroEsteiraProjetos();
  const counts = Object.fromEntries(tipos.map((t) => [t, 0]));
  list.forEach((d) => {
    const t = normalizeTipo(d.tipo);
    if (counts[t] !== undefined) counts[t] += 1;
  });
  return { list, tipos, counts, total: list.length };
}

function openDashPjTipos(nome) {
  const dlg = document.getElementById("modalDashPjTipos");
  const titleEl = document.getElementById("modalDashPjTiposTitle");
  const subEl = document.getElementById("modalDashPjTiposSub");
  const bodyEl = document.getElementById("modalDashPjTiposBody");
  if (!dlg || !bodyEl) return;
  const { tipos, counts, total } = countTiposDoProjetista(nome);
  if (titleEl) titleEl.textContent = `Projetos por tipo — ${nome}`;
  if (subEl) {
    subEl.textContent = `${total} projeto(s) cadastrado(s) · Esteira Projetos (sem B2B) · ${labelDashPeriodoFiltro()}`;
  }
  bodyEl.innerHTML =
    `<div class="kpi-grid">` +
    tipos
      .map((t) => {
        const n = counts[t] || 0;
        return kpiCard(t, n, n ? "ok" : "warn");
      })
      .join("") +
    kpiCard("Total", total, total ? "ok" : "warn") +
    `</div>`;
  if (typeof dlg.showModal === "function" && !dlg.open) dlg.showModal();
}

function initDashPjTipos() {
  if (initDashPjTipos._done) return;
  initDashPjTipos._done = true;
  const dlg = document.getElementById("modalDashPjTipos");
  const close = () => dlg?.close();
  document.getElementById("modalDashPjTiposClose")?.addEventListener("click", close);
  document.getElementById("modalDashPjTiposOk")?.addEventListener("click", close);
  document.addEventListener("click", (e) => {
    const btn = e.target.closest?.("[data-dash-pj-tipos]");
    if (!btn || !btn.closest("#kpiProjetistas")) return;
    openDashPjTipos(btn.getAttribute("data-dash-pj-tipos"));
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const btn = e.target.closest?.("[data-dash-pj-tipos]");
    if (!btn || !btn.closest("#kpiProjetistas")) return;
    e.preventDefault();
    openDashPjTipos(btn.getAttribute("data-dash-pj-tipos"));
  });
}

function isDemandaConcluidaCount(d, linha) {
  if (linha === LINHA_ESTEIRA_B2B) return STATUS_B2B_CONCLUIDOS.has(d.status);
  if (linha === LINHA_ESTEIRA_OPERACIONAL) return d.status === "conclusao";
  return isStatusConcluidoDemanda(migrateDemanda(d));
}

function isDemandaAtivaCount(d, linha) {
  return !isDemandaConcluidaCount(d, linha) && d.status !== "reprovado" && d.status !== "pausado";
}

function countDemandas(list, linha) {
  const pausadas = list.filter((d) => d.status === "pausado");
  const ativas = list.filter((d) => isDemandaAtivaCount(d, linha));
  const concl = list.filter((d) => isDemandaConcluidaCount(d, linha));
  const rep =
    linha === LINHA_ESTEIRA_B2B
      ? []
      : list.filter((d) => {
          const dm = migrateDemanda(d);
          if (inferLinhaEsteira(dm) === LINHA_ESTEIRA_B2B) return false;
          return dm.status === "reprovado";
        });
  const atraso = list.filter(isAtraso);
  return {
    total: list.length,
    ativas: ativas.length,
    pausadas: pausadas.length,
    concluidas: concl.length,
    reprovadas: rep.length,
    atraso: atraso.length,
  };
}

function countByStatus(baseList = demandasDashOperacionalList()) {
  const counts = {};
  for (const [k, lab] of [...STATUS_ORDER, ...STATUS_EXTRA]) counts[k] = { key: k, label: lab, n: 0 };
  baseList.forEach((d) => {
    const st = migrateDemanda(d).status;
    if (counts[st]) counts[st].n += 1;
  });
  return Object.values(counts).filter((v) => v.n > 0);
}

/**
 * Cores dos tipos de projeto — paleta categórica validada (daltonismo e tema claro/escuro), em ordem fixa:
 * [claro, escuro]. Antes Migração e Licenciamento tinham verdes quase idênticos.
 */
const TIPO_CHART_CORES = {
  B2C: ["#2a78d6", "#3987e5"],
  Backbone: ["#eb6834", "#d95926"],
  Licenciamento: ["#1baf7a", "#199e70"],
  SWAP: ["#eda100", "#c98500"],
  Mapeamento: ["#e87ba4", "#d55181"],
  "Migração": ["#008300", "#008300"],
  B2B: ["#4a3aa7", "#9085e9"],
  "Diária": ["#e34948", "#e66767"],
};

function tipoChartCor(tipo) {
  const par = TIPO_CHART_CORES[tipo];
  if (!par) return "#94a3b8";
  return document.documentElement.getAttribute("data-theme") === "light" ? par[0] : par[1];
}
const STATUS_CHART_COLORS = {
  novo: "#6366f1",
  analise: "#14b8a6",
  vistoria: "#06b6d4",
  custo: "#84cc16",
  revisao: "#a855f7",
  aprovacao: "#f59e0b",
  materiais: "#f97316",
  execucao: "#ef4444",
  execucao_terceirizada: "#ec4899",
  configuracao_op: "#0ea5e9",
  transmissao_infra_op: "#eab308",
  documentacao_op: "#22c55e",
  conclusao: "#8b5cf6",
  pausado: "#64748b",
  reprovado: "#dc2626",
};

function tiposOperacionalDash() {
  return TIPOS_DEMANDA.filter((t) => t !== "B2B");
}

function dashStatusKeysOperacional() {
  return [...STATUS_ORDER.map(([k]) => k), ...STATUS_EXTRA.map(([k]) => k)];
}

function buildProjetistaCountMatrix(baseList, colKeys, valueFromDemanda) {
  const matrix = {};
  for (const nome of PROJETISTAS) {
    matrix[nome] = Object.fromEntries(colKeys.map((k) => [k, 0]));
  }
  baseList.forEach((d) => {
    const col = valueFromDemanda(d);
    if (!col) return;
    for (const pj of demandaProjetistasList(d)) {
      if (!PROJETISTAS.includes(pj) || matrix[pj][col] === undefined) continue;
      matrix[pj][col] += 1;
    }
  });
  return matrix;
}

function activeMatrixColumns(matrix, colKeys) {
  return colKeys.filter((k) => PROJETISTAS.some((nome) => (matrix[nome]?.[k] || 0) > 0));
}

function renderDashGrupoMatrixTable(containerId, rowHeader, rowKeys, colKeys, colLabel, matrix, emptyMsg, opts = {}) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!colKeys.length || !rowKeys.length) {
    el.innerHTML = `<p class="muted small">${escapeHtml(emptyMsg || "Nenhum dado para exibir.")}</p>`;
    return;
  }
  const fmtCell = opts.formatCell || ((n) => (n ? String(n) : "—"));
  const fmtTotal = opts.formatTotal || fmtCell;
  // Intensidade do fundo proporcional ao valor (lê-se a tabela como um mapa de calor).
  let maxCell = 0;
  for (const rk of rowKeys) for (const ck of colKeys) maxCell = Math.max(maxCell, numDash(matrix[rk]?.[ck]));
  const heat = (n) =>
    n > 0 && maxCell > 0 ? ` style="--heat:${(0.12 + (n / maxCell) * 0.5).toFixed(2)}"` : "";
  const colTotals = Object.fromEntries(colKeys.map((k) => [k, 0]));
  let body = "";
  let grandTotal = 0;
  for (const rowKey of rowKeys) {
    const row = matrix[rowKey] || {};
    let rowTotal = 0;
    const nameCell = opts.geoListKind
      ? `<td><button type="button" class="dash-geo-link" data-dash-geo-list data-dash-geo-kind="${escapeHtml(opts.geoListKind)}" data-dash-geo-key="${escapeHtml(rowKey)}" title="Ver projetos">${escapeHtml(rowKey)}</button></td>`
      : `<td>${escapeHtml(rowKey)}</td>`;
    body += `<tr>${nameCell}`;
    colKeys.forEach((k) => {
      const n = row[k] || 0;
      rowTotal += n;
      colTotals[k] += n;
      body += `<td class="dash-pj-matrix__num${n > 0 ? " is-heat" : ""}"${heat(n)}>${fmtCell(n)}</td>`;
    });
    grandTotal += rowTotal;
    body += `<td class="dash-pj-matrix__num dash-pj-matrix__total"><strong>${fmtTotal(rowTotal)}</strong></td></tr>`;
  }
  let foot = "";
  colKeys.forEach((k) => {
    foot += `<td class="dash-pj-matrix__num"><strong>${fmtTotal(colTotals[k])}</strong></td>`;
  });
  el.innerHTML =
    `<table class="dash-table dash-table--pj-matrix"><thead><tr><th>${escapeHtml(rowHeader)}</th>${colKeys
      .map((k) => `<th>${escapeHtml(colLabel(k))}</th>`)
      .join("")}<th>Total</th></tr></thead><tbody>${body}</tbody><tfoot><tr><td><strong>Total</strong></td>${foot}<td class="dash-pj-matrix__num"><strong>${fmtTotal(grandTotal)}</strong></td></tr></tfoot></table>`;
}

function renderDashProjetistaMatrixTable(containerId, colKeys, colLabel, matrix) {
  renderDashGrupoMatrixTable(
    containerId,
    "Projetista",
    PROJETISTAS,
    colKeys,
    colLabel,
    matrix,
    "Nenhuma demanda atribuída aos projetistas.",
  );
}

function makeDashChartProjetistaStacked(canvasId, labels, datasets, chartOpts = {}) {
  if (typeof Chart === "undefined") return;
  const el = document.getElementById(canvasId);
  if (!el) return;
  if (dashCharts[canvasId]) {
    dashCharts[canvasId].destroy();
    delete dashCharts[canvasId];
  }
  if (!datasets.length || !labels.length) return;
  const formatValue = chartOpts.formatValue || ((n) => String(n));
  const horizontal = Boolean(chartOpts.horizontal);
  const valueTicks = {
    color: chartInk().tick,
    stepSize: chartOpts.stepSize,
    callback: chartOpts.yFormat || ((v) => formatValue(v)),
  };
  const categoryTicks = {
    color: chartInk().tick,
    font: { size: 11 },
    maxRotation: horizontal ? 0 : 45,
    minRotation: 0,
  };
  const scales = horizontal
    ? {
        x: { stacked: true, beginAtZero: true, ticks: valueTicks, grid: { color: chartInk().grid } },
        y: { stacked: true, ticks: categoryTicks, grid: { display: false } },
      }
    : {
        x: { stacked: true, ticks: categoryTicks, grid: { color: chartInk().grid } },
        y: { stacked: true, beginAtZero: true, ticks: valueTicks, grid: { color: chartInk().grid } },
      };
  dashCharts[canvasId] = criarDashChart(el, {
    type: "bar",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: horizontal ? "y" : "x",
      ...dashChartBarInteractOptions(chartOpts),
      plugins: {
        legend: { display: true, labels: { color: chartInk().label, boxWidth: 12, font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const n = ctx.raw;
              if (!n) return null;
              const stackTotal = (ctx.chart.data.datasets || []).reduce(
                (s, ds) => s + numDash(ds.data?.[ctx.dataIndex]),
                0,
              );
              const pct = pctShare(n, stackTotal);
              const pctTxt = chartOpts.showPct && pct != null ? ` · ${formatPctShare(pct)}` : "";
              return `${ctx.dataset.label}: ${formatValue(n)}${pctTxt}`;
            },
          },
        },
      },
      scales,
    },
  });
}

function renderDashProjetistaTipoStatusCharts(baseList) {
  const tipos = tiposOperacionalDash();
  const tipoMatrix = buildProjetistaCountMatrix(baseList, tipos, (d) => normalizeTipo(d.tipo));
  const tipoDatasets = tipos
    .filter((tipo) => PROJETISTAS.some((nome) => (tipoMatrix[nome]?.[tipo] || 0) > 0))
    .map((tipo) => ({
      label: tipo,
      data: PROJETISTAS.map((nome) => tipoMatrix[nome]?.[tipo] || 0),
      backgroundColor: tipoChartCor(tipo),
      borderWidth: 0,
    }));
  makeDashChartProjetistaStacked("chartProjetistaTipo", PROJETISTAS, tipoDatasets);
  renderDashProjetistaMatrixTable("dashProjetistaTipoTable", tipos, (k) => k, tipoMatrix);

  const statusKeysAll = dashStatusKeysOperacional();
  const statusMatrix = buildProjetistaCountMatrix(baseList, statusKeysAll, (d) => migrateDemanda(d).status);
  const statusKeys = activeMatrixColumns(statusMatrix, statusKeysAll);
  const statusDatasets = statusKeys.map((status) => ({
    label: STATUS_LABEL[status] || status,
    data: PROJETISTAS.map((nome) => statusMatrix[nome]?.[status] || 0),
    backgroundColor: STATUS_CHART_COLORS[status] || "#94a3b8",
    borderWidth: 0,
  }));
  makeDashChartProjetistaStacked("chartProjetistaStatus", PROJETISTAS, statusDatasets);
  renderDashProjetistaMatrixTable(
    "dashProjetistaStatusTable",
    statusKeys,
    (k) => STATUS_LABEL[k] || k,
    statusMatrix,
  );
}

function countByTipo(baseList = demandasDashOperacionalList()) {
  const counts = Object.fromEntries(TIPOS_DEMANDA.map((t) => [t, 0]));
  baseList.forEach((d) => {
    const t = normalizeTipo(d.tipo);
    if (counts[t] !== undefined) counts[t] += 1;
  });
  return TIPOS_DEMANDA.filter((tipo) => tipo !== "B2B")
    .map((tipo) => ({ label: tipo, n: counts[tipo] || 0 }))
    .filter((x) => x.n > 0);
}

/** Tipos exibidos nos gráficos de quantidade e valor (Esteira Projetos, sem B2B). */
const TIPOS_GRAFICO_ESTEIRA = ["B2C", "Backbone", "SWAP", "Licenciamento", "Mapeamento", "Migração"];

function statsTipoGraficoEsteira(
  baseListQtd = demandasDashOperacionalList(),
  baseListValor = baseListQtd,
  mode = getDashValorModo(),
) {
  const counts = Object.fromEntries(TIPOS_GRAFICO_ESTEIRA.map((t) => [t, 0]));
  const valores = Object.fromEntries(TIPOS_GRAFICO_ESTEIRA.map((t) => [t, 0]));
  baseListQtd.forEach((d) => {
    const t = normalizeTipo(d.tipo);
    if (!TIPOS_GRAFICO_ESTEIRA.includes(t)) return;
    counts[t] += 1;
  });
  baseListValor.forEach((d) => {
    const t = normalizeTipo(d.tipo);
    if (!TIPOS_GRAFICO_ESTEIRA.includes(t)) return;
    valores[t] += demandaValorDashPorModo(d, mode);
  });
  return TIPOS_GRAFICO_ESTEIRA.map((tipo) => ({
    label: tipo,
    n: counts[tipo],
    valor: valores[tipo],
  }));
}

function renderDashTipoProjetosCharts(baseListQtd = demandasDashOperacionalList(), baseListValor = null) {
  const mode = getDashValorModo();
  const listValor = baseListValor ?? filterDemandasModoDash(baseListQtd, mode);
  const rows = statsTipoGraficoEsteira(baseListQtd, listValor, mode);
  const labels = rows.map((r) => r.label);
  const colors = labels.map((l) => tipoChartCor(l));

  makeDashChartMetricBar(
    "chartTipoQtd",
    labels,
    rows.map((r) => r.n),
    { colors, datasetLabel: "Projetos", stepSize: 1 },
  );

  const modoLabel = DASH_VALOR_MODOS[mode]?.label || "Valor";
  makeDashChartMoneyBar(
    "chartTipoValor",
    labels,
    rows.map((r) => r.valor),
    colors,
  );
  if (dashCharts.chartTipoValor) {
    dashCharts.chartTipoValor.data.datasets[0].label = modoLabel;
    dashCharts.chartTipoValor.update();
  }

}

/** Cores dos segmentos B2C — 3 primeiros slots da paleta categórica validada ([claro, escuro]). */
const SEGMENTO_B2C_CORES = {
  MDU: ["#2a78d6", "#3987e5"],
  TCR: ["#eb6834", "#d95926"],
  TCT: ["#1baf7a", "#199e70"],
};

function dashSuperficieCor() {
  return getComputedStyle(document.documentElement).getPropertyValue("--surface").trim() || "#151b24";
}

function segmentoB2cCor(seg) {
  const par = SEGMENTO_B2C_CORES[seg];
  if (!par) return "#8b95a5";
  return document.documentElement.getAttribute("data-theme") === "light" ? par[0] : par[1];
}

const B2B_PRODUTO_SEM = "Sem produto";

/** Paleta categórica validada (daltonismo, claro/escuro): 8 slots em ordem fixa — [claro, escuro]. */
const PALETA_CATEGORICA = [
  ["#2a78d6", "#3987e5"],
  ["#eb6834", "#d95926"],
  ["#1baf7a", "#199e70"],
  ["#eda100", "#c98500"],
  ["#e87ba4", "#d55181"],
  ["#008300", "#008300"],
  ["#4a3aa7", "#9085e9"],
  ["#e34948", "#e66767"],
];
