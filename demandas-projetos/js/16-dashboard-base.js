/**
 * Dashboard: blocos, gráficos, KPIs, tipos e B2C.
 * Só declarações (funções e constantes); o que roda ao abrir a página fica em app.js.
 */
/* ---------- Dashboard ---------- */
const dashCharts = {};
const DASH_BLOCKS_STORAGE_KEY = "demandasDashBlocks_v1";
let dashBlocksInited = false;

function loadDashBlocksState() {
  try {
    const raw = localStorage.getItem(DASH_BLOCKS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveDashBlocksState(state) {
  try {
    localStorage.setItem(DASH_BLOCKS_STORAGE_KEY, JSON.stringify(state));
  } catch (_) {}
}

function isDashBlockVisible(blockId) {
  const block = document.querySelector(`.dash-block[data-dash-block="${blockId}"]`);
  return block && !block.classList.contains("is-collapsed");
}

function setDashBlockVisible(blockId, visible, state) {
  const block = document.querySelector(`.dash-block[data-dash-block="${blockId}"]`);
  if (!block) return;
  block.classList.toggle("is-collapsed", !visible);
  const btn = block.querySelector(".dash-block__toggle");
  if (btn) btn.setAttribute("aria-expanded", visible ? "true" : "false");
  state[blockId] = visible;
}

function setDashSubBlockVisible(subId, visible, state) {
  const block = document.querySelector(`.dash-sub-block[data-dash-sub-block="${subId}"]`);
  if (!block) return;
  block.classList.toggle("is-collapsed", !visible);
  const btn = block.querySelector(".dash-sub-block__toggle");
  if (btn) btn.setAttribute("aria-expanded", visible ? "true" : "false");
  state[subId] = visible;
}

function resizeDashSubBlockCharts(block) {
  block?.querySelectorAll("canvas[id]").forEach((canvas) => {
    dashCharts[canvas.id]?.resize();
  });
}

function initDashChartTables(state) {
  document.querySelectorAll(".dash-chart-table[data-dash-chart-table]").forEach((wrap) => {
    const id = wrap.dataset.dashChartTable;
    const btn = wrap.querySelector(".dash-chart-table__toggle");
    if (!btn) return;
    const visible = state[id] === true;
    wrap.classList.toggle("is-collapsed", !visible);
    btn.setAttribute("aria-expanded", visible ? "true" : "false");
    btn.addEventListener("click", () => {
      const nowVisible = wrap.classList.toggle("is-collapsed") === false;
      btn.setAttribute("aria-expanded", nowVisible ? "true" : "false");
      state[id] = nowVisible;
      saveDashBlocksState(state);
    });
  });
}

function initDashSubBlocks(state) {
  document.querySelectorAll(".dash-sub-block[data-dash-sub-block]").forEach((block) => {
    const id = block.dataset.dashSubBlock;
    const visible =
      block.dataset.defaultCollapsed === "true" ? state[id] === true : state[id] !== false;
    setDashSubBlockVisible(id, visible, state);
    const btn = block.querySelector(".dash-sub-block__toggle");
    btn?.addEventListener("click", () => {
      const nowVisible = block.classList.toggle("is-collapsed") === false;
      btn.setAttribute("aria-expanded", nowVisible ? "true" : "false");
      state[id] = nowVisible;
      saveDashBlocksState(state);
      if (nowVisible) {
        resizeDashSubBlockCharts(block);
        if (panels.dashboard && !panels.dashboard.hidden) renderDashboard();
      }
    });
  });
}

function initDashBlocks() {
  if (dashBlocksInited) return;
  dashBlocksInited = true;
  const state = loadDashBlocksState();
  document.querySelectorAll(".dash-block[data-dash-block]").forEach((block) => {
    const id = block.dataset.dashBlock;
    const visible = state[id] !== false;
    setDashBlockVisible(id, visible, state);
    const btn = block.querySelector(".dash-block__toggle");
    btn?.addEventListener("click", () => {
      const nowVisible = block.classList.toggle("is-collapsed") === false;
      btn.setAttribute("aria-expanded", nowVisible ? "true" : "false");
      state[id] = nowVisible;
      saveDashBlocksState(state);
      if (
        id === "cidades" ||
        id === "tempo" ||
        id === "indicadores-b2c" ||
        id === "indicadores-b2b" ||
        id === "projetistas"
      ) {
        if (nowVisible && panels.dashboard && !panels.dashboard.hidden) renderDashboard();
      }
    });
  });
  initDashSubBlocks(state);
  initDashChartTables(state);
  saveDashBlocksState(state);
  const todos = (visivel) => {
    document.querySelectorAll(".dash-block[data-dash-block]").forEach((block) => {
      setDashBlockVisible(block.dataset.dashBlock, visivel, state);
    });
    saveDashBlocksState(state);
    if (visivel && panels.dashboard && !panels.dashboard.hidden) renderDashboard();
  };
  document.getElementById("btnDashExpandirTudo")?.addEventListener("click", () => todos(true));
  document.getElementById("btnDashRecolherTudo")?.addEventListener("click", () => {
    todos(false);
    document.getElementById("panelDashboard")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function destroyDashboardCharts() {
  Object.keys(dashCharts).forEach((k) => {
    dashCharts[k]?.destroy();
    delete dashCharts[k];
  });
}

function numDash(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function formatBRL(n) {
  return numDash(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatMetros(n) {
  return `${numDash(n).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m`;
}

/** Valor final (+5%) do levantamento — campo «Valor final (R$)». */
function demandaValorFinal(d) {
  const c = normalizeCusto(d.custo);
  const vf = parseCustoMoney(c.valorFinal);
  if (vf !== "") return vf;
  const vp = parseCustoMoney(c.valorProjeto);
  if (vp !== "") return Math.round(vp * 1.05 * 100) / 100;
  return 0;
}

function demandaTemValorFinalDash(d) {
  return demandaValorFinal(d) > 0;
}

function demandaValorBaseLevantamento(d) {
  const c = normalizeCusto(d.custo);
  if (!c.temLevantamento) return 0;
  return numDash(c.valorProjeto);
}

function demandaValorRealizado(d) {
  const dm = migrateDemanda(d);
  return numDash(dm.valorProjetoRealizado);
}

/** Fases pós-aprovação na esteira operacional (legado — gráficos). */
const STATUS_OPERACIONAL_APROVADO_EXEC = ["materiais", "execucao", "execucao_terceirizada", "configuracao_op", "transmissao_infra_op", "documentacao_op"];

function isStatusAteDocumentacao(status) {
  return STATUS_ATE_DOCUMENTACAO_SET.has(status);
}

function demandasAteDocumentacao(list = demandasDashOperacionalList()) {
  return list.filter((d) => isStatusAteDocumentacao(migrateDemanda(d).status));
}

/** Colunas da esteira operacional — base dos modos de valor no dashboard. */
const STATUS_OPERACIONAL_VALOR_CONCLUIDO = ["conclusao"];
const STATUS_OPERACIONAL_VALOR_EXECUCAO = ["execucao", "execucao_terceirizada"];
const STATUS_OPERACIONAL_VALOR_APROVACAO = ["aprovacao"];

/** Colunas da esteira B2B — mesma lógica de valor. */
const STATUS_B2B_VALOR_CONCLUIDO = [...STATUS_B2B_CONCLUIDOS];
const STATUS_B2B_VALOR_EXECUCAO = [...STATUS_B2B_EXECUCAO];
const STATUS_B2B_VALOR_APROVACAO = ["aprovacao_bp"];

const DASH_VALOR_MODOS = {
  geral: {
    label: "Valor total geral",
    hint: "Conclusão + execução + aprovação — soma do campo Valor final (R$) de cada projeto.",
  },
  aprovacao: {
    label: "Valor em aprovação",
    hint: "Coluna Aprovação — soma do campo Valor final (R$) do levantamento.",
  },
  execucao: {
    label: "Valor em execução",
    hint: "Execução Regional ou Terceirizada — soma do campo Valor final (R$) do levantamento.",
  },
  concluido: {
    label: "Valor concluído",
    hint: "Base = coluna Conclusão da esteira. Conta todos os projetos nessa coluna; valor = soma do Valor final (R$) do levantamento.",
  },
};

/** Base padrão do seletor no topo do dashboard. */
const DASH_VALOR_MODO_PADRAO = "geral";

/** Base fixa do bloco Resumo dos concluídos: projetos na coluna Conclusão. */
const DASH_BASE_CONCLUSAO = "concluido";

function demandaGrupoValorDash(dm) {
  if (!dm) return null;
  const st = dm.status;
  if (st === "reprovado" || st === "pausado") return null;

  if (dm.linhaEsteira === LINHA_ESTEIRA_B2B) {
    if (STATUS_B2B_VALOR_CONCLUIDO.includes(st)) return "concluido";
    if (STATUS_B2B_VALOR_EXECUCAO.includes(st)) return "execucao";
    if (STATUS_B2B_VALOR_APROVACAO.includes(st)) return "aprovacao";
    return null;
  }

  if (STATUS_OPERACIONAL_VALOR_CONCLUIDO.includes(st)) return "concluido";
  if (STATUS_OPERACIONAL_VALOR_EXECUCAO.includes(st)) return "execucao";
  if (STATUS_OPERACIONAL_VALOR_APROVACAO.includes(st)) return "aprovacao";
  return null;
}

function getDashValorModo() {
  const v = document.getElementById("filterDashValorModo")?.value || DASH_VALOR_MODO_PADRAO;
  return DASH_VALOR_MODOS[v] ? v : DASH_VALOR_MODO_PADRAO;
}

function demandaIncluiModoDash(d, mode) {
  const grupo = demandaGrupoValorDash(migrateDemanda(d));
  if (!grupo) return false;
  if (mode === "geral") return true;
  return grupo === mode;
}

function demandaIncluiValorDash(d, mode) {
  return demandaIncluiModoDash(d, mode) && demandaTemValorFinalDash(d);
}

function demandaValorDashPorModo(d, mode) {
  if (!demandaIncluiValorDash(d, mode)) return 0;
  return demandaValorFinal(d);
}

function demandaPortasDashPorModo(d, mode = getDashValorModo()) {
  if (!demandaIncluiModoDash(d, mode)) return 0;
  return demandaPortasNovas(d);
}

function demandaMetragemDashPorModo(d, mode = getDashValorModo()) {
  if (!demandaIncluiModoDash(d, mode)) return 0;
  return demandaMetragemLancamento(d);
}

function labelValorDashModo(mode = getDashValorModo()) {
  return DASH_VALOR_MODOS[mode]?.label || "Valor";
}

function sumValorDashboard(list, mode = getDashValorModo()) {
  return list.reduce((s, d) => s + demandaValorDashPorModo(d, mode), 0);
}

function sumPortasDashboard(list, mode = getDashValorModo()) {
  return list.reduce((s, d) => s + demandaPortasDashPorModo(d, mode), 0);
}

function sumMetragemDashboard(list, mode = getDashValorModo()) {
  return list.reduce((s, d) => s + demandaMetragemDashPorModo(d, mode), 0);
}

/** Projetos incluídos na base de indicadores selecionada (concluído, execução, aprovação ou geral). */
function filterDemandasModoDash(list, mode = getDashValorModo()) {
  return list.filter((d) => demandaIncluiModoDash(d, mode));
}

function calcResumoIndicadoresDashboard(list = demandasDashOperacionalList()) {
  const resumo = {};
  for (const mode of Object.keys(DASH_VALOR_MODOS)) {
    let valor = 0;
    let portas = 0;
    let metragem = 0;
    let n = 0;
    list.forEach((d) => {
      if (!demandaIncluiModoDash(d, mode)) return;
      n += 1;
      valor += demandaValorDashPorModo(d, mode);
      portas += demandaPortasDashPorModo(d, mode);
      metragem += demandaMetragemDashPorModo(d, mode);
    });
    resumo[mode] = { valor, portas, metragem, n };
  }
  return resumo;
}

/** Valor "vazio" (zero, traço) — mostrado em cinza, não como alerta. */
function kpiValorVazio(value) {
  const t = String(value ?? "").replace(/\s+/g, " ").trim();
  if (t.includes(" · ")) return t.split(" · ").every((p) => kpiValorVazio(p));
  if (!t || t === "—" || t === "-") return true;
  return /^(R\$ )?0([.,]0+)?( ?(m|%))?$/.test(t);
}

/** "R$ 1.197.523,95 · 61,4%" → valor principal + complemento menor (que pode ir para a linha de baixo). */
function kpiValorHtml(value) {
  if (typeof value !== "string" || value.includes("<") || !value.includes(" · ")) return value;
  const [principal, ...resto] = value.split(" · ");
  return `${principal}<span class="kpi__value-extra">${resto.join(" · ")}</span>`;
}

function kpiCard(label, value, tone, sub) {
  const subHtml = sub ? `<div class="kpi__sub">${sub}</div>` : "";
  // "ok" = valor normal (cor do texto); "warn" num valor zerado = vazio; "bad" = problema real.
  const tom = tone === "warn" && kpiValorVazio(value) ? "vazio" : tone;
  return (
    `<div class="kpi kpi--${tom}"><div class="kpi__label">${label}</div>` +
    `<div class="kpi__value" title="${escapeHtml(String(value ?? ""))}">${kpiValorHtml(value)}</div>${subHtml}</div>`
  );
}

function renderDashValoresFinanceirosKpis(list = demandasDashOperacionalList()) {
  const el = document.getElementById("dashValoresFinanceirosKpis");
  if (!el) return;
  const r = calcResumoIndicadoresDashboard(list);
  const fases = [
    { k: "aprovacao", label: "Em aprovação", cor: "#eda100", ...r.aprovacao },
    { k: "execucao", label: "Em execução", cor: "#3987e5", ...r.execucao },
    { k: "concluido", label: "Concluído", cor: "#22c55e", ...r.concluido },
  ];
  const total = fases.reduce((s2, f) => s2 + f.valor, 0);
  const pct = (v) => (total > 0 ? (v / total) * 100 : 0);
  el.innerHTML =
    `<div class="kpi-grid kpi-grid--3">` +
    fases
      .map(
        (f) =>
          `<div class="kpi kpi--fase ${f.valor ? "kpi--ok" : "kpi--vazio"}" style="--fase:${f.cor}">` +
          `<div class="kpi__label"><i class="kpi__dot" aria-hidden="true"></i>${f.label}</div>` +
          `<div class="kpi__value" title="${escapeHtml(formatBRL(f.valor))}">${formatBRL(f.valor)}</div>` +
          `<div class="kpi__sub">${f.n} projeto(s) · ${formatPct(Math.round(pct(f.valor) * 10) / 10)} do valor</div></div>`,
      )
      .join("") +
    `</div>` +
    (total > 0
      ? `<div class="dash-fases-barra" role="img" aria-label="${escapeHtml(
          fases.map((f) => `${f.label}: ${formatPct(Math.round(pct(f.valor) * 10) / 10)}`).join(", "),
        )}">` +
        fases
          .filter((f) => f.valor > 0)
          .map(
            (f) =>
              `<span style="--fase:${f.cor};flex-grow:${f.valor}" title="${escapeHtml(
                `${f.label}: ${formatBRL(f.valor)}`,
              )}"></span>`,
          )
          .join("") +
        `</div><p class="muted small dash-fases-total">Total: <strong>${formatBRL(total)}</strong> em ${
          fases.reduce((s2, f) => s2 + f.n, 0)
        } projeto(s)</p>`
      : "");
}

/** Totais da coluna Conclusão — base dos Indicadores Gerais (inclui médias). */
function renderKpiGeralBaseConclusao(list = demandasDashOperacionalList()) {
  const el = document.getElementById("kpiGeralBaseConclusao");
  if (!el) return;
  const mode = DASH_BASE_CONCLUSAO;
  const valor = sumValorDashboard(list, mode);
  const portas = sumPortasDashboard(list, mode);
  const metragem = sumMetragemDashboard(list, mode);
  const m = calcMediasIndicadoresGeral(list, mode);
  const g = countDemandas(list);
  const naEsteira = demandasAteDocumentacao(list).length;
  const modoTopo = getDashValorModo();
  const r = calcResumoIndicadoresDashboard(list)[modoTopo] || { valor: 0, n: 0 };
  el.innerHTML =
    kpiCard("Total de projetos", m.totalCadastro, m.totalCadastro ? "ok" : "warn", `${naEsteira} na esteira`) +
    kpiCard(
      "Concluídos",
      m.n,
      m.n ? "ok" : "warn",
      `${formatPct(m.pctConclusao)} do total · ${formatBRL(valor)}`,
    ) +
    kpiCard("Em atraso", g.atraso, g.atraso ? "bad" : "ok", "Prazo previsto vencido") +
    kpiCard(labelValorDashModo(modoTopo), formatBRL(r.valor), r.valor ? "ok" : "warn", `${r.n} projeto(s)`) +
    kpiCard(
      "Portas novas",
      formatQtd(portas),
      portas ? "ok" : "warn",
      metragem ? `Concluídos · ${formatMetros(metragem)} de lançamento` : "Concluídos",
    ) +
    kpiCard(
      "Média por projeto",
      m.mediaGastos != null ? formatBRL(m.mediaGastos) : "—",
      m.mediaGastos != null && m.mediaGastos > 0 ? "ok" : "warn",
      "Gasto médio dos concluídos",
    );
}

function isDemandaConcluidaComparavel(d) {
  return isStatusConcluidoDemanda(migrateDemanda(d));
}

/** Compara valor final do levantamento (+5%) com o valor realizado na conclusão. */
function analiseProjetadoExecutado(d) {
  const c = normalizeCusto(d.custo);
  const projetado = numDash(c.valorFinal);
  const base = numDash(c.valorProjeto);
  const realizado = demandaValorRealizado(d);
  if (!c.temLevantamento || !projetado || !realizado) return null;

  const diff = Math.round((realizado - projetado) * 100) / 100;
  const desvioBasePct = base > 0 ? Math.round(((realizado - base) / base) * 10000) / 100 : null;
  const desvioProjetadoPct =
    projetado > 0 ? Math.round(((realizado - projetado) / projetado) * 10000) / 100 : null;
  const dentro = realizado <= projetado;

  return {
    base,
    projetado,
    realizado,
    diff,
    desvioBasePct,
    desvioProjetadoPct,
    dentro,
  };
}

function demandaMetragemLancamento(d) {
  const c = normalizeCusto(d.custo);
  if (!c.temLancamento) return 0;
  return numDash(c.lancamento?.totalMetragem);
}

function labelCidade(cidade) {
  const t = String(cidade || "").trim();
  return t || "Não informada";
}

function labelRegionalDemanda(d) {
  const reg = findRegionalForCidade(d?.cidade);
  return reg || "Não informada";
}

function regionalFromCidadeLabel(cidadeLabel) {
  if (cidadeLabel === "Não informada") return "Não informada";
  return findRegionalForCidade(cidadeLabel) || "Não informada";
}

function truncateChartLabel(text, max = 20) {
  const s = String(text || "");
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

const DASH_REGIONAL_CHART_IDS = [
  "chartCidRankSit",
  "chartCidRankGastos",
  "chartCidRankPortas",
  "chartCidSit",
  "chartCidTipoMix",
  "chartCidFase",
  "chartCidCitySit",
  "chartCidCityGastos",
  "chartCidCityPortas",
];

function destroyDashRegionalCharts() {
  DASH_REGIONAL_CHART_IDS.forEach((id) => {
    if (dashCharts[id]) {
      dashCharts[id].destroy();
      delete dashCharts[id];
    }
  });
}

/* ---------- Dashboard: padrão visual dos gráficos (aplicado a todos) ---------- */
/** Cor única de série (magnitude), conforme o tema. */
function dashSerieCor() {
  return document.documentElement.getAttribute("data-theme") === "light" ? "#2a78d6" : "#3987e5";
}

/** R$ compacto para eixos: R$ 1,2 mi · R$ 350 mil · R$ 900. */
function formatBRLCompact(n) {
  const v = numDash(n);
  const abs = Math.abs(v);
  const fmt = (x, d) => x.toLocaleString("pt-BR", { maximumFractionDigits: d });
  if (abs >= 1e6) return `R$ ${fmt(v / 1e6, abs >= 1e7 ? 0 : 1)} mi`;
  if (abs >= 1e3) return `R$ ${fmt(v / 1e3, 0)} mil`;
  return `R$ ${fmt(v, 0)}`;
}

function dashChartTooltipTema() {
  const light = document.documentElement.getAttribute("data-theme") === "light";
  return light
    ? { backgroundColor: "#ffffff", titleColor: "#0f172a", bodyColor: "#334155", borderColor: "#d5dee9" }
    : { backgroundColor: "#0f1620", titleColor: "#e8edf5", bodyColor: "#cbd5e1", borderColor: "#2a3544" };
}

/**
 * Ajusta qualquer configuração de gráfico do dashboard: barras finas e arredondadas,
 * eixos discretos, R$ compacto nos eixos, contagens sem casas decimais, legenda e tooltip padronizados.
 */
function ajustarDashChartConfig(cfg) {
  const opts = (cfg.options = cfg.options || {});
  // Barras verticais com nomes longos (cidades, regionais, pessoas) viram horizontais:
  // o nome fica legível sem inclinar e a lista cresce para baixo.
  if (cfg.type === "bar" && opts.indexAxis !== "y") {
    const labels = cfg.data?.labels || [];
    const longo = labels.some((l) => String(l).length > 12);
    if (longo && labels.length >= 2 && opts.scales?.x && opts.scales?.y) {
      opts.indexAxis = "y";
      const { x, y } = opts.scales;
      opts.scales = { ...opts.scales, x: y, y: { ...x, grid: { display: false } } };
      cfg.__autoHorizontal = labels.length;
    }
  }
  const scales = opts.scales || {};
  const empilhado = Object.values(scales).some((sc) => sc && sc.stacked);
  for (const sc of Object.values(scales)) {
    if (!sc || typeof sc !== "object") continue;
    sc.border = { display: false, ...(sc.border || {}) };
    sc.grid = { drawTicks: false, ...(sc.grid || {}) };
    const ticks = (sc.ticks = sc.ticks || {});
    ticks.padding = ticks.padding ?? 6;
    if (sc.beginAtZero || sc.type === "linear") {
      // Eixo de valor: inteiros, poucas marcações e sem inclinar o texto.
      ticks.precision = ticks.precision ?? 0;
      if (ticks.stepSize === 1) delete ticks.stepSize;
      ticks.maxTicksLimit = ticks.maxTicksLimit ?? 6;
      ticks.maxRotation = 0;
    }
    if (typeof ticks.callback === "function") {
      const orig = ticks.callback;
      ticks.callback = function (value, index, all) {
        const out = orig.call(this, value, index, all);
        // Valores em R$ no eixo viram formato compacto (o tooltip mantém o valor completo).
        if (typeof out === "string" && /^-?R\$/.test(out.trim()) && typeof value === "number") {
          return formatBRLCompact(value);
        }
        return out;
      };
    }
  }
  if (cfg.type === "bar") {
    for (const ds of cfg.data?.datasets || []) {
      ds.maxBarThickness = ds.maxBarThickness ?? 26;
      ds.categoryPercentage = ds.categoryPercentage ?? 0.72;
      ds.barPercentage = ds.barPercentage ?? 0.9;
      if (!empilhado) {
        ds.borderRadius = ds.borderRadius ?? 4;
        ds.borderSkipped = ds.borderSkipped ?? "start";
      }
    }
  }
  const plugins = (opts.plugins = opts.plugins || {});
  if (plugins.legend && plugins.legend.display !== false) {
    plugins.legend.labels = {
      usePointStyle: true,
      pointStyle: "rectRounded",
      boxWidth: 10,
      boxHeight: 10,
      padding: 14,
      ...(plugins.legend.labels || {}),
    };
  }
  plugins.tooltip = {
    padding: 10,
    cornerRadius: 8,
    borderWidth: 1,
    boxPadding: 4,
    usePointStyle: true,
    titleFont: { weight: "700" },
    ...dashChartTooltipTema(),
    ...(plugins.tooltip || {}),
  };
  return cfg;
}

function criarDashChart(el, cfg) {
  aplicarPadroesChartJs();
  ajustarDashChartConfig(cfg);
  const wrap = el.closest?.(".chart-wrap");
  if (wrap) {
    const horizontal = cfg.options?.indexAxis === "y";
    const n = cfg.data?.labels?.length || 0;
    if (cfg.__autoHorizontal || (horizontal && n)) {
      // Altura acompanha o número de linhas (+ legenda e eixo).
      const series = (cfg.data?.datasets || []).length;
      const legenda = series > 1 ? 24 * Math.ceil(series / 4) : 0;
      wrap.style.height = `${Math.max(200, n * 30 + 48 + legenda)}px`;
      wrap.classList.add("chart-wrap--auto");
    }
  }
  return new Chart(el, cfg);
}

/** Padrões globais do Chart.js (fonte do app, cores neutras). */
function aplicarPadroesChartJs() {
  if (typeof Chart === "undefined" || aplicarPadroesChartJs.feito) return;
  aplicarPadroesChartJs.feito = true;
  Chart.defaults.font.family = '"DM Sans", system-ui, sans-serif';
  Chart.defaults.font.size = 11;
  Chart.defaults.animation.duration = 450;
}

function dashChartDatasetTotal(ctx) {
  return (ctx?.dataset?.data || []).reduce((s, n) => s + numDash(n), 0);
}

function dashChartPctSuffix(ctx) {
  const pct = pctShare(ctx.raw, dashChartDatasetTotal(ctx));
  return pct == null ? "" : ` · ${formatPctShare(pct)}`;
}

function dashChartBarInteractOptions(options = {}) {
  if (!options.onBarClick) return {};
  return {
    onClick: (_evt, els, chart) => {
      if (!els.length) return;
      const i = els[0].index;
      options.onBarClick(chart.data.labels[i], i);
    },
    onHover: (evt, els) => {
      const canvas = evt.chart?.canvas;
      if (canvas) canvas.style.cursor = els.length ? "pointer" : "default";
    },
  };
}

function dashChartBarScales(options, { valueTicks, categoryTicks }) {
  const horizontal = Boolean(options.horizontal);
  const valueScale = {
    beginAtZero: true,
    ticks: valueTicks,
    grid: { color: chartInk().grid },
  };
  const categoryScale = {
    ticks: categoryTicks,
    grid: horizontal ? { display: false } : { color: chartInk().grid },
  };
  return horizontal
    ? { indexAxis: "y", scales: { x: valueScale, y: categoryScale } }
    : { scales: { x: categoryScale, y: valueScale } };
}

function makeDashChartMoneyBar(canvasId, labels, data, color = dashSerieCor(), options = {}) {
  if (typeof Chart === "undefined") return;
  const el = document.getElementById(canvasId);
  if (!el) return;
  if (dashCharts[canvasId]) {
    dashCharts[canvasId].destroy();
    delete dashCharts[canvasId];
  }
  if (!labels.length) return;
  const bg = Array.isArray(color) ? color : color;
  const datasetLabel = options.datasetLabel || "Investimento (R$)";
  dashCharts[canvasId] = criarDashChart(el, {
    type: "bar",
    data: {
      labels,
      datasets: [{ label: datasetLabel, data, backgroundColor: bg, borderWidth: 0 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      ...dashChartBarInteractOptions(options),
      ...dashChartBarScales(options, {
        valueTicks: { color: chartInk().tick, callback: (v) => formatBRL(v) },
        categoryTicks: { color: chartInk().tick, maxRotation: 45, minRotation: 0, font: { size: 10 } },
      }),
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => formatBRL(ctx.raw) + (options.showPct ? dashChartPctSuffix(ctx) : ""),
          },
        },
      },
    },
  });
}

function makeDashChartMetricBar(canvasId, labels, data, options = {}) {
  if (typeof Chart === "undefined") return;
  const el = document.getElementById(canvasId);
  if (!el) return;
  if (dashCharts[canvasId]) {
    dashCharts[canvasId].destroy();
    delete dashCharts[canvasId];
  }
  if (!labels.length) return;
  const formatValue = options.formatValue || ((v) => String(v));
  const bg = options.colors || options.color || dashSerieCor();
  dashCharts[canvasId] = criarDashChart(el, {
    type: "bar",
    data: {
      labels,
      datasets: [{ label: options.datasetLabel || "", data, backgroundColor: bg, borderWidth: 0 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      ...dashChartBarInteractOptions(options),
      ...dashChartBarScales(options, {
        valueTicks: {
          color: chartInk().tick,
          stepSize: options.stepSize,
          callback: options.yFormat || ((v) => formatValue(v)),
        },
        categoryTicks: { color: chartInk().tick, font: { size: 11 } },
      }),
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const base = `${options.datasetLabel || ""}: ${formatValue(ctx.raw)}`.trim();
              return base + (options.showPct ? dashChartPctSuffix(ctx) : "");
            },
          },
        },
      },
    },
  });
}

function renderDashTipoPorGrupo(
  canvasId,
  tableId,
  demandas,
  groupRows,
  keyFn,
  rowHeader = "Cidade",
  topN = 12,
  tipos = tiposOperacionalDash(),
  onBarClick,
) {
  const topRows = groupRows.slice(0, topN);
  const groupKeys = topRows.map((r) => r.cidade);
  const matrix = Object.fromEntries(groupKeys.map((k) => [k, Object.fromEntries(tipos.map((t) => [t, 0]))]));
  demandas.forEach((d) => {
    const key = keyFn(d);
    if (!matrix[key]) return;
    const t = normalizeTipo(d.tipo);
    if (matrix[key][t] !== undefined) matrix[key][t] += 1;
  });
  const activeTipos = tipos.filter((tipo) => groupKeys.some((k) => (matrix[k]?.[tipo] || 0) > 0));
  const datasets = activeTipos
    .map((tipo) => ({
      label: tipo,
      data: groupKeys.map((k) => matrix[k][tipo] || 0),
      backgroundColor: tipoChartCor(tipo),
      borderWidth: 0,
    }))
    .filter((ds) => ds.data.some((n) => n > 0));
  makeDashChartProjetistaStacked(
    canvasId,
    groupKeys.map((k) => truncateChartLabel(k, 22)),
    datasets,
    { stepSize: 1, onBarClick: onBarClick ? (_label, i) => onBarClick(groupKeys[i], i) : undefined },
  );
  if (tableId) {
    renderDashGrupoMatrixTable(
      tableId,
      rowHeader,
      groupKeys,
      activeTipos.length ? activeTipos : tipos,
      (t) => t,
      matrix,
      "Nenhum projeto neste agrupamento.",
      {
        geoListKind: rowHeader === "Regional" ? "regional" : rowHeader === "Cidade" ? "cidade" : "",
      },
    );
  }
}

function renderDashTipoValorPorGrupo(
  canvasId,
  tableId,
  demandas,
  groupRows,
  keyFn,
  rowHeader,
  {
    valueFn,
    sortValueFn,
    topN = 12,
    tipos = tiposOperacionalDash(),
    chartOpts = {},
    tableOpts = {},
    emptyMsg = "Nenhum dado neste agrupamento.",
  } = {},
) {
  const sortVal = sortValueFn || ((r) => r.valor);
  const topRows = [...groupRows]
    .sort((a, b) => numDash(sortVal(b)) - numDash(sortVal(a)) || b.projetos - a.projetos)
    .slice(0, topN);
  const groupKeys = topRows.map((r) => r.cidade);
  const matrix = Object.fromEntries(groupKeys.map((k) => [k, Object.fromEntries(tipos.map((t) => [t, 0]))]));
  demandas.forEach((d) => {
    const key = keyFn(d);
    if (!matrix[key]) return;
    const t = normalizeTipo(d.tipo);
    if (matrix[key][t] !== undefined) matrix[key][t] += numDash(valueFn(d));
  });
  const activeTipos = tipos.filter((tipo) => groupKeys.some((k) => (matrix[k]?.[tipo] || 0) > 0));
  const datasets = activeTipos
    .map((tipo) => ({
      label: tipo,
      data: groupKeys.map((k) => matrix[k][tipo] || 0),
      backgroundColor: tipoChartCor(tipo),
      borderWidth: 0,
    }))
    .filter((ds) => ds.data.some((n) => n > 0));
  const userClick = chartOpts.onBarClick;
  const maxLabel = chartOpts.truncateLabel ?? 22;
  makeDashChartProjetistaStacked(
    canvasId,
    groupKeys.map((k) => truncateChartLabel(k, maxLabel)),
    datasets,
    {
      ...chartOpts,
      onBarClick: userClick ? (_label, i) => userClick(groupKeys[i], i) : undefined,
    },
  );
  if (tableId) {
    renderDashGrupoMatrixTable(
      tableId,
      rowHeader,
      groupKeys,
      activeTipos.length ? activeTipos : tipos,
      (t) => t,
      matrix,
      emptyMsg,
      {
        geoListKind: rowHeader === "Regional" ? "regional" : rowHeader === "Cidade" ? "cidade" : "",
        ...tableOpts,
      },
    );
  }
}

const B2C_SEGMENTO_SEM = "Sem segmento";

function segmentoB2cBucket(d) {
  return normalizeSegmentoB2c(d.segmentoB2c) || B2C_SEGMENTO_SEM;
}

function buildSegmentoB2cMatrix(demandas, rowKeys, keyFn) {
  const matrix = Object.fromEntries(
    rowKeys.map((k) => [
      k,
      Object.fromEntries([...SEGMENTOS_B2C, B2C_SEGMENTO_SEM].map((s) => [s, 0])),
    ]),
  );
  demandas.forEach((d) => {
    const seg = segmentoB2cBucket(d);
    for (const key of [...new Set(resolveGeoKeys(d, keyFn))]) {
      if (!matrix[key] || matrix[key][seg] === undefined) continue;
      matrix[key][seg] += 1;
    }
  });
  return matrix;
}

function buildSegmentoB2cValueMatrix(demandas, rowKeys, keyFn, valueFn) {
  const matrix = Object.fromEntries(
    rowKeys.map((k) => [
      k,
      Object.fromEntries([...SEGMENTOS_B2C, B2C_SEGMENTO_SEM].map((s) => [s, 0])),
    ]),
  );
  demandas.forEach((d) => {
    const seg = segmentoB2cBucket(d);
    const val = numDash(valueFn(d));
    for (const key of [...new Set(resolveGeoKeys(d, keyFn))]) {
      if (!matrix[key] || matrix[key][seg] === undefined) continue;
      matrix[key][seg] += val;
    }
  });
  return matrix;
}

function activeSegmentoB2cCols(matrix, rowKeys) {
  const cols = [...SEGMENTOS_B2C];
  if (rowKeys.some((k) => (matrix[k]?.[B2C_SEGMENTO_SEM] || 0) > 0)) cols.push(B2C_SEGMENTO_SEM);
  return cols;
}

function activeSegmentoB2cValueCols(matrix, rowKeys) {
  const cols = activeSegmentoB2cCols(matrix, rowKeys);
  return cols.filter((seg) => rowKeys.some((k) => (matrix[k]?.[seg] || 0) > 0));
}

function renderDashSegmentoB2cValorPorGrupo(
  canvasId,
  tableId,
  tableRowHeader,
  demandas,
  groupRows,
  keyFn,
  valueFn,
  tableOpts,
  chartOpts,
  topN = 12,
  sortValueFn,
) {
  const sortVal = sortValueFn || ((r) => r.valor);
  const topRows = [...groupRows]
    .sort((a, b) => numDash(sortVal(b)) - numDash(sortVal(a)) || b.projetos - a.projetos)
    .slice(0, topN);
  const rowKeys = topRows.map((r) => r.cidade);
  const matrix = buildSegmentoB2cValueMatrix(demandas, rowKeys, keyFn, valueFn);
  const segmentos = activeSegmentoB2cValueCols(matrix, rowKeys);
  const datasets = segmentos
    .map((seg) => ({
      label: seg,
      data: rowKeys.map((k) => matrix[k][seg] || 0),
      backgroundColor: segmentoB2cCor(seg),
      // 2px de respiro na cor da superfície entre os segmentos empilhados
      borderColor: dashSuperficieCor(),
      borderWidth: { left: 1, right: 1, top: 0, bottom: 0 },
      borderSkipped: false,
    }))
    .filter((ds) => ds.data.some((n) => n > 0));
  makeDashChartProjetistaStacked(
    canvasId,
    rowKeys.map((k) => truncateChartLabel(k, 22)),
    datasets,
    chartOpts,
  );
  renderDashGrupoMatrixTable(
    tableId,
    tableRowHeader,
    rowKeys,
    segmentos,
    (k) => k,
    matrix,
    "Nenhum dado B2C neste agrupamento.",
    tableOpts,
  );
}

function renderDashSegmentoB2cInvestPorGrupo(
  canvasId,
  tableId,
  tableRowHeader,
  demandas,
  groupRows,
  keyFn,
  topN = 12,
) {
  renderDashSegmentoB2cValorPorGrupo(
    canvasId,
    tableId,
    tableRowHeader,
    demandas,
    groupRows,
    keyFn,
    (d) => demandaValorDashPorModo(d, getDashValorModo()),
    {
      formatCell: (n) => (n > 0 ? formatBRL(n) : "—"),
      formatTotal: (n) => (n > 0 ? formatBRL(n) : "—"),
    },
    {
      formatValue: (n) => formatBRL(n),
      yFormat: (v) => formatBRL(v),
    },
    topN,
  );
}

function renderDashSegmentoB2cPortasPorGrupo(
  canvasId,
  tableId,
  tableRowHeader,
  demandas,
  groupRows,
  keyFn,
  topN = 12,
) {
  renderDashSegmentoB2cValorPorGrupo(
    canvasId,
    tableId,
    tableRowHeader,
    demandas,
    groupRows,
    keyFn,
    (d) => demandaPortasDashPorModo(d, getDashValorModo()),
    {
      formatCell: (n) => (n > 0 ? formatQtd(n) : "—"),
      formatTotal: (n) => (n > 0 ? formatQtd(n) : "—"),
    },
    {
      formatValue: (n) => formatQtd(n),
      stepSize: 1,
    },
    topN,
    (r) => r.portasNovas,
  );
}

function renderDashSegmentoB2cPorGrupo(canvasId, tableId, tableRowHeader, demandas, groupRows, keyFn, topN = 12) {
  const topRows = groupRows.slice(0, topN);
  const rowKeys = topRows.map((r) => r.cidade);
  const matrix = buildSegmentoB2cMatrix(demandas, rowKeys, keyFn);
  const segmentos = activeSegmentoB2cCols(matrix, rowKeys);
  const datasets = segmentos
    .map((seg) => ({
      label: seg,
      data: rowKeys.map((k) => matrix[k][seg] || 0),
      backgroundColor: segmentoB2cCor(seg),
      // 2px de respiro na cor da superfície entre os segmentos empilhados
      borderColor: dashSuperficieCor(),
      borderWidth: { left: 1, right: 1, top: 0, bottom: 0 },
      borderSkipped: false,
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
    segmentos,
    (k) => k,
    matrix,
    "Nenhum projeto B2C neste agrupamento.",
  );
}

const B2C_GEO_CHART_IDS = ["chartB2cGeo"];

const B2C_SEGMENTO_CHART_IDS = [];

function destroyDashB2cSegmentoCharts() {
  B2C_SEGMENTO_CHART_IDS.forEach((id) => {
    if (dashCharts[id]) {
      dashCharts[id].destroy();
      delete dashCharts[id];
    }
  });
}

function destroyDashB2cExtraCharts() {
  destroyDashB2cSegmentoCharts();
  B2C_GEO_CHART_IDS.forEach((id) => {
    if (dashCharts[id]) {
      dashCharts[id].destroy();
      delete dashCharts[id];
    }
  });
  ["tableB2cGeo"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = "";
  });
}

function renderB2cGeoMetricTable(tableId, rowHeader, rows, opts) {
  const el = document.getElementById(tableId);
  if (!el) return;
  const valueFn = opts.valueFn;
  const formatValue = opts.formatValue || ((v) => String(v));
  const totalFn = opts.totalFn || ((list) => list.reduce((s, r) => s + numDash(valueFn(r)), 0));
  const total = totalFn(rows);
  const showPctShare = opts.showPctShare !== false;
  if (!rows.length) {
    el.innerHTML = '<p class="muted small">Sem dados neste agrupamento.</p>';
    return;
  }
  const sorted = [...rows].sort(
    (a, b) => numDash(valueFn(b)) - numDash(valueFn(a)) || a.cidade.localeCompare(b.cidade, "pt-BR"),
  );
  let body = "";
  for (const r of sorted) {
    const v = valueFn(r);
    const share = showPctShare ? pctShare(v, total) : null;
    const nameCell = opts.geoListKind
      ? `<td><button type="button" class="dash-geo-link" data-dash-geo-list data-dash-geo-kind="${escapeHtml(opts.geoListKind)}" data-dash-geo-key="${escapeHtml(r.cidade)}" title="Ver projetos">${escapeHtml(r.cidade)}</button></td>`
      : `<td>${escapeHtml(r.cidade)}</td>`;
    body +=
      "<tr>" +
      nameCell +
      '<td class="dash-pj-matrix__num">' +
      formatValue(v) +
      "</td>" +
      (showPctShare ? `<td class="dash-pj-matrix__num">${formatPctShare(share)}</td>` : "") +
      (typeof opts.extraCell === "function" ? opts.extraCell(r) : "") +
      "</tr>";
  }
  const extraHead = opts.extraHead || "";
  const pctHead = showPctShare ? "<th>% do total</th>" : "";
  const totalLabel =
    typeof opts.formatTotal === "function" ? opts.formatTotal(total, rows) : formatValue(total);
  const extraFoot =
    typeof opts.extraFoot === "function" ? opts.extraFoot(rows) : opts.extraFoot || "";
  el.innerHTML =
    `<table class="dash-table dash-table--pj-matrix"><thead><tr><th>${escapeHtml(rowHeader)}</th><th>${escapeHtml(opts.valueHeader || "Valor")}</th>${pctHead}${extraHead}</tr></thead><tbody>` +
    body +
    `</tbody><tfoot><tr><td><strong>Total</strong></td><td class="dash-pj-matrix__num"><strong>${totalLabel}</strong></td>` +
    (showPctShare ? `<td class="dash-pj-matrix__num"><strong>${total > 0 ? "100%" : "—"}</strong></td>` : "") +
    extraFoot +
    "</tr></tfoot></table>";
}

function renderB2cGeoMetricPanel(canvasId, tableId, rowHeader, rows, opts) {
  const topN = opts.topN ?? 12;
  const valueFn = opts.valueFn;
  const sorted = [...rows]
    .filter((r) => numDash(valueFn(r)) > 0 || opts.includeZeros)
    .sort((a, b) => numDash(valueFn(b)) - numDash(valueFn(a)) || a.cidade.localeCompare(b.cidade, "pt-BR"));
  const chartRows = sorted.slice(0, topN);
  const labels = chartRows.map((r) => truncateChartLabel(r.cidade, 22));
  const data = chartRows.map((r) => numDash(valueFn(r)));
  const color = opts.color || "#6366f1";

  if (opts.chartKind === "money") {
    makeDashChartMoneyBar(canvasId, labels, data, color, { datasetLabel: opts.datasetLabel });
  } else {
    makeDashChartMetricBar(canvasId, labels, data, {
      colors: color,
      datasetLabel: opts.datasetLabel || "",
      formatValue: opts.formatValue || ((v) => String(v)),
      stepSize: opts.stepSize,
      yFormat: opts.yFormat,
    });
  }

  renderB2cGeoMetricTable(tableId, rowHeader, rows, opts);
}

function renderGeoMetricDetalhamento(
  ids,
  rowsCidade,
  rowsRegional,
  rowsCidadePct,
  rowsRegionalPct,
  { enableGeoList = false } = {},
) {
  const pctCidade = rowsCidadePct || rowsCidade;
  const pctRegional = rowsRegionalPct || rowsRegional;
  const cidadeKind = enableGeoList ? "cidade" : "";
  const regionalKind = enableGeoList ? "regional" : "";
  const gastoOpts = {
    valueFn: (r) => r.valor,
    formatValue: (v) => (v > 0 ? formatBRL(v) : "—"),
    formatTotal: (v) => (v > 0 ? formatBRL(v) : "—"),
    valueHeader: "Gastos",
    datasetLabel: "Gastos",
    chartKind: "money",
    color: "#22c55e",
  };
  renderB2cGeoMetricPanel(ids.gastoCidade[0], ids.gastoCidade[1], "Cidade", rowsCidade, {
    ...gastoOpts,
    topN: 12,
    geoListKind: cidadeKind,
  });
  renderB2cGeoMetricPanel(ids.gastoRegional[0], ids.gastoRegional[1], "Regional", rowsRegional, {
    ...gastoOpts,
    topN: Math.max(rowsRegional.length, 1),
    geoListKind: regionalKind,
  });

  const portasOpts = {
    valueFn: (r) => r.portasNovas,
    formatValue: (v) => (v > 0 ? formatQtd(v) : "—"),
    valueHeader: "Portas",
    datasetLabel: "Portas",
    color: "#0ea5e9",
    stepSize: 1,
  };
  renderB2cGeoMetricPanel(ids.portasCidade[0], ids.portasCidade[1], "Cidade", rowsCidade, {
    ...portasOpts,
    topN: 12,
    geoListKind: cidadeKind,
  });
  renderB2cGeoMetricPanel(ids.portasRegional[0], ids.portasRegional[1], "Regional", rowsRegional, {
    ...portasOpts,
    topN: Math.max(rowsRegional.length, 1),
    geoListKind: regionalKind,
  });

  const projetosOpts = {
    valueFn: (r) => r.projetos,
    formatValue: (v) => formatQtd(v),
    valueHeader: "Projetos",
    datasetLabel: "Projetos",
    color: "#6366f1",
    stepSize: 1,
  };
  renderB2cGeoMetricPanel(ids.projetosCidade[0], ids.projetosCidade[1], "Cidade", rowsCidade, {
    ...projetosOpts,
    topN: 12,
    geoListKind: cidadeKind,
  });
  renderB2cGeoMetricPanel(ids.projetosRegional[0], ids.projetosRegional[1], "Regional", rowsRegional, {
    ...projetosOpts,
    topN: Math.max(rowsRegional.length, 1),
    geoListKind: regionalKind,
  });

  const pctOpts = {
    valueFn: (r) => statsCidadePctConclusao(r) ?? 0,
    formatValue: (v) => formatPct(v),
    showPctShare: false,
    valueHeader: "% conclusão",
    datasetLabel: "% conclusão",
    color: "#f59e0b",
    includeZeros: true,
    yFormat: (v) => `${v}%`,
    extraHead: "<th>Concluídas</th><th>Total</th>",
    extraCell: (r) =>
      `<td class="dash-pj-matrix__num">${r.concluidas}</td><td class="dash-pj-matrix__num">${r.projetos}</td>`,
    formatTotal: (_t, list) => {
      const p = list.reduce((s, r) => s + r.projetos, 0);
      const c = list.reduce((s, r) => s + r.concluidas, 0);
      return p > 0 ? formatPct(Math.round((c / p) * 10000) / 100) : "—";
    },
    extraFoot: (list) => {
      const p = list.reduce((s, r) => s + r.projetos, 0);
      const c = list.reduce((s, r) => s + r.concluidas, 0);
      return `<td class="dash-pj-matrix__num"><strong>${c}</strong></td><td class="dash-pj-matrix__num"><strong>${p}</strong></td>`;
    },
  };
  renderB2cGeoMetricPanel(ids.pctCidade[0], ids.pctCidade[1], "Cidade", pctCidade, {
    ...pctOpts,
    topN: 12,
    geoListKind: cidadeKind,
  });
  renderB2cGeoMetricPanel(ids.pctRegional[0], ids.pctRegional[1], "Regional", pctRegional, {
    ...pctOpts,
    topN: Math.max(pctRegional.length, 1),
    geoListKind: regionalKind,
  });
}

function buildB2cMetricasPorSegmento(list, { includeEmptyCore = true } = {}) {
  const mode = getDashValorModo();
  const segmentos = [...SEGMENTOS_B2C, B2C_SEGMENTO_SEM];
  const rows = Object.fromEntries(
    segmentos.map((s) => [s, { segmento: s, projetos: 0, investimento: 0, portas: 0, metragem: 0 }]),
  );
  list.forEach((d) => {
    const seg = segmentoB2cBucket(d);
    const row = rows[seg];
    if (!row) return;
    row.projetos += 1;
    row.investimento += demandaValorDashPorModo(d, mode);
    row.portas += demandaPortasDashPorModo(d, mode);
    row.metragem += demandaMetragemDashPorModo(d, mode);
  });
  return segmentos
    .map((s) => rows[s])
    .filter((r) => {
      if (SEGMENTOS_B2C.includes(r.segmento) && includeEmptyCore) return true;
      return r.projetos > 0 || r.investimento > 0 || r.portas > 0 || r.metragem > 0;
    });
}

function pctShare(part, total) {
  if (!(total > 0)) return null;
  return Math.round((Number(part) / total) * 1000) / 10;
}

function withB2cSegmentoPcts(rows) {
  const totais = rows.reduce(
    (acc, r) => {
      acc.projetos += r.projetos;
      acc.investimento += r.investimento;
      acc.portas += r.portas;
      acc.metragem += r.metragem;
      return acc;
    },
    { projetos: 0, investimento: 0, portas: 0, metragem: 0 },
  );
  const enriched = rows.map((r) => ({
    ...r,
    pctProjetos: pctShare(r.projetos, totais.projetos),
    pctInvestimento: pctShare(r.investimento, totais.investimento),
    pctPortas: pctShare(r.portas, totais.portas),
    pctMetragem: pctShare(r.metragem, totais.metragem),
  }));
  return { rows: enriched, totais };
}

function formatPctShare(pct) {
  return pct == null ? "—" : formatPct(pct);
}

function demandaPortasNovas(d) {
  const c = normalizeCusto(d.custo);
  if (!c.temPortas) return 0;
  return numDash(c.qtdNovasPortas);
}

function formatQtd(n) {
  const v = numDash(n);
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function formatPct(n, digits = 1) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return `${Number(n).toLocaleString("pt-BR", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  })}%`;
}

function formatMediaNum(n, digits = 1) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return Number(n).toLocaleString("pt-BR", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}

function avgNums(list) {
  if (!list.length) return null;
  return list.reduce((s, n) => s + n, 0) / list.length;
}

/** Médias e totais — por padrão sobre a coluna Conclusão. */
function calcMediasIndicadoresGeral(list, mode = DASH_BASE_CONCLUSAO) {
  const g = countDemandas(list);
  const filtered = filterDemandasModoDash(list, mode);
  const n = filtered.length;
  const pctConclusao = g.total > 0 ? Math.round((n / g.total) * 10000) / 100 : null;

  let valorTotal = 0;
  let portasTotal = 0;
  let metragemTotal = 0;
  const valorPorPortaProjeto = [];

  for (const d of filtered) {
    const p = demandaPortasDashPorModo(d, mode);
    const m = demandaMetragemDashPorModo(d, mode);
    const v = demandaValorDashPorModo(d, mode);
    valorTotal += v;
    portasTotal += p;
    metragemTotal += m;
    if (p > 0) valorPorPortaProjeto.push(v / p);
  }

  const media = (total) => (n > 0 ? total / n : null);

  return {
    n,
    totalCadastro: g.total,
    concluidas: n,
    valorTotal,
    portasTotal,
    metragemTotal,
    pctConclusao,
    mediaGastos: media(valorTotal),
    mediaPortas: media(portasTotal),
    mediaValorPorPorta: avgNums(valorPorPortaProjeto),
    mediaLancamento: media(metragemTotal),
  };
}

function kpiMediasIndicadoresHtml(m, { includePortas = true } = {}) {
  let html =
    kpiCard("% de conclusão", formatPct(m.pctConclusao), m.pctConclusao != null ? "ok" : "warn") +
    kpiCard(
      "Média de gastos / projeto",
      m.mediaGastos != null ? formatBRL(m.mediaGastos) : "—",
      m.mediaGastos != null && m.mediaGastos > 0 ? "ok" : "warn",
    );
  if (includePortas) {
    html +=
      kpiCard(
        "Média de portas / projeto",
        formatMediaNum(m.mediaPortas, 1),
        m.mediaPortas != null && m.mediaPortas > 0 ? "ok" : "warn",
      ) +
      kpiCard(
        "Média valor/porta / projeto",
        m.mediaValorPorPorta != null ? formatBRL(m.mediaValorPorPorta) : "—",
        m.mediaValorPorPorta != null ? "ok" : "warn",
      );
  }
  html += kpiCard(
    "Média de lançamento / projeto",
    m.mediaLancamento != null ? formatMetros(m.mediaLancamento) : "—",
    m.mediaLancamento != null && m.mediaLancamento > 0 ? "ok" : "warn",
  );
  return html;
}

/** Tipo aberto na visão individual de "Por tipo" ("" = visão geral). */
let dashTipoSelecionado = "";

const TIPOS_SEM_PORTAS = ["SWAP", "Backbone", "Licenciamento", "Mapeamento"];

function dashTipoCor(tipo) {
  return tipoChartCor(tipo);
}

/** Lista de barras horizontais (uma série, cor do tipo) com rótulo, barra e valor. */
function dashTipoBarrasHtml(itens, cor, total) {
  if (!itens.length) return `<p class="muted small">Sem dados.</p>`;
  const max = Math.max(...itens.map((it) => it.n), 1);
  return (
    `<ul class="dash-tipo-barras" style="--tipo:${cor}">` +
    itens
      .map((it) => {
        const pct = total ? Math.round((it.n / total) * 1000) / 10 : 0;
        return (
          `<li class="dash-tipo-barras__item" title="${escapeHtml(`${it.label}: ${it.n} projeto(s) · ${formatPct(pct)}`)}">` +
          `<span class="dash-tipo-barras__rotulo">${escapeHtml(it.label)}</span>` +
          `<span class="dash-tipo-barras__trilho"><span class="dash-tipo-barras__barra" style="width:${((it.n / max) * 100).toFixed(1)}%"></span></span>` +
          `<span class="dash-tipo-barras__valor">${it.n}<small>${formatPct(pct)}</small></span>` +
          `</li>`
        );
      })
      .join("") +
    `</ul>`
  );
}

function renderKpiGeralPorTipoDetalhe(tipo, doTipo, list) {
  const cor = dashTipoCor(tipo);
  const g = countDemandas(doTipo);
  const r = calcResumoIndicadoresDashboard(doTipo);
  const m = calcMediasIndicadoresGeral(doTipo, DASH_BASE_CONCLUSAO);
  const rTodos = calcResumoIndicadoresDashboard(list);
  const pctConcl = g.total ? Math.round((r.concluido.n / g.total) * 1000) / 10 : 0;
  const pctProjetos = list.length ? Math.round((g.total / list.length) * 1000) / 10 : 0;
  const pctValor = rTodos.concluido.valor ? Math.round((r.concluido.valor / rTodos.concluido.valor) * 1000) / 10 : 0;
  const atrasados = doTipo.filter(isAtrasoAtivo).length;
  const showPortas = !TIPOS_SEM_PORTAS.includes(tipo);
  const fase = (x) => (x.n ? `${x.n} · ${formatBRL(x.valor)}` : "—");

  const tiles = [
    kpiCard("Projetos", String(g.total), "ok", `${formatPct(pctProjetos)} de todos os projetos`),
    kpiCard(
      "Na conclusão",
      `${r.concluido.n} · ${formatPct(pctConcl)}`,
      "ok",
      `<span class="dash-tipo-progresso" style="--pct:${pctConcl}%;--tipo:${cor}" aria-hidden="true"></span>`,
    ),
    kpiCard("Valor concluído", r.concluido.valor ? formatBRL(r.concluido.valor) : "—", "ok", r.concluido.valor ? `${formatPct(pctValor)} do valor concluído total` : ""),
    kpiCard("Em execução", fase(r.execucao), "ok", "quantidade · valor final"),
    kpiCard("Em aprovação", fase(r.aprovacao), "ok", "quantidade · valor final"),
    kpiCard("Média por projeto", m.mediaGastos > 0 ? formatBRL(m.mediaGastos) : "—", "ok", "concluídos"),
    showPortas ? kpiCard("Portas novas", m.portasTotal ? formatQtd(m.portasTotal) : "—", "ok", "concluídos") : "",
    kpiCard("Metragem", m.metragemTotal ? formatMetros(m.metragemTotal) : "—", "ok", "concluídos"),
    kpiCard("Em atraso", String(atrasados), atrasados ? "bad" : "ok", atrasados ? "prazo previsto vencido" : "nenhum projeto atrasado"),
  ].join("");

  const cfg = getEsteiraConfig(LINHA_ESTEIRA_OPERACIONAL);
  const etapas = [...cfg.statusOrder, ...(cfg.statusExtra || [])]
    .map(([k, label]) => ({ label, n: doTipo.filter((d) => migrateDemanda(d).status === k).length }))
    .filter((it) => it.n > 0);
  const porPj = new Map();
  for (const d of doTipo) {
    const nome = normalizeResponsavel(d.responsavel) || "Não atribuído";
    porPj.set(nome, (porPj.get(nome) || 0) + 1);
  }
  const projetistas = [...porPj]
    .map(([label, n]) => ({ label, n }))
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, "pt-BR"));

  return (
    `<div class="dash-tipo-det" style="--tipo:${cor}">` +
    `<div class="dash-tipo-det__head">` +
    `<button type="button" class="btn btn--ghost btn--sm" data-dash-tipo="">← Visão geral</button>` +
    `<h4 class="dash-tipo-det__titulo"><i aria-hidden="true"></i>${escapeHtml(tipo)}</h4>` +
    `<span class="muted small">${g.total} projeto(s) · ${formatPct(pctProjetos)} do total</span>` +
    `</div>` +
    (g.total
      ? `<div class="kpi-grid kpi-grid--6 dash-tipo-det__kpis">${tiles}</div>` +
        `<div class="dash-tipo-det__cols">` +
        `<section><h5 class="dash-tipo-det__sub">Por etapa da esteira</h5>${dashTipoBarrasHtml(etapas, cor, g.total)}</section>` +
        `<section><h5 class="dash-tipo-det__sub">Por projetista</h5>${dashTipoBarrasHtml(projetistas, cor, g.total)}</section>` +
        `</div>`
      : `<p class="muted">Nenhum projeto deste tipo no período/filtros atuais.</p>`) +
    `</div>`
  );
}

function renderKpiGeralPorTipo(list = demandasDashOperacionalList()) {
  const el = document.getElementById("kpiGeralPorTipo");
  if (!el) return;
  const cel = (txt, vazio = false, extra = "") =>
    `<td class="num${vazio ? " is-vazio" : ""}${extra}">${txt}</td>`;
  const linha = (nome, cor, doTipo, { showPortas = true, total = false } = {}) => {
    const g = countDemandas(doTipo);
    const r = calcResumoIndicadoresDashboard(doTipo);
    const m = calcMediasIndicadoresGeral(doTipo, DASH_BASE_CONCLUSAO);
    const pct = g.total ? (r.concluido.n / g.total) * 100 : 0;
    const nTxt = (n, v) =>
      n ? `<span class="dash-tipos__n">${n}</span> ${formatBRL(v)}` : "—";
    const nomeHtml = total
      ? `<span class="dash-tipos__nome">${escapeHtml(nome)}</span>`
      : `<button type="button" class="dash-tipos__nome dash-tipos__abrir" data-dash-tipo="${escapeHtml(nome)}" title="Ver indicadores de ${escapeHtml(nome)}">` +
        `<i style="background:${cor}" aria-hidden="true"></i>${escapeHtml(nome)}<span class="dash-tipos__seta" aria-hidden="true">›</span></button>`;
    return (
      `<tr class="${total ? "dash-tipos__total" : ""}">` +
      `<th scope="row">${nomeHtml}</th>` +
      cel(String(g.total), !g.total) +
      `<td class="num"><span class="dash-tipos__pct"><span class="dash-tipos__pct-bar" style="--pct:${pct.toFixed(1)}%"></span>` +
      `${r.concluido.n} · ${formatPct(Math.round(pct * 10) / 10)}</span></td>` +
      cel(r.concluido.valor ? formatBRL(r.concluido.valor) : "—", !r.concluido.valor) +
      cel(nTxt(r.execucao.n, r.execucao.valor), !r.execucao.n) +
      cel(nTxt(r.aprovacao.n, r.aprovacao.valor), !r.aprovacao.n) +
      cel(m.mediaGastos != null && m.mediaGastos > 0 ? formatBRL(m.mediaGastos) : "—", !(m.mediaGastos > 0)) +
      cel(showPortas ? (m.portasTotal ? formatQtd(m.portasTotal) : "—") : "n/a", !showPortas || !m.portasTotal) +
      cel(m.metragemTotal ? formatMetros(m.metragemTotal) : "—", !m.metragemTotal) +
      `</tr>`
    );
  };
  const tipos = tiposFiltroEsteiraProjetos();
  const rows = tipos
    .map((tipo) => {
      const doTipo = list.filter((d) => normalizeTipo(d.tipo) === tipo);
      return { tipo, doTipo, n: doTipo.length };
    })
    .sort((a, b) => b.n - a.n || a.tipo.localeCompare(b.tipo, "pt-BR"));
  if (dashTipoSelecionado && !tipos.includes(dashTipoSelecionado)) dashTipoSelecionado = "";

  const nav =
    `<div class="dash-tipos-nav" role="tablist" aria-label="Escolher tipo">` +
    `<button type="button" role="tab" class="dash-tipos-nav__btn${dashTipoSelecionado ? "" : " is-active"}" data-dash-tipo="" aria-selected="${!dashTipoSelecionado}">Visão geral</button>` +
    rows
      .map(
        ({ tipo, n }) =>
          `<button type="button" role="tab" class="dash-tipos-nav__btn${dashTipoSelecionado === tipo ? " is-active" : ""}${n ? "" : " is-vazio"}" data-dash-tipo="${escapeHtml(tipo)}" aria-selected="${dashTipoSelecionado === tipo}">` +
          `<i style="background:${dashTipoCor(tipo)}" aria-hidden="true"></i>${escapeHtml(tipo)} <b>${n}</b></button>`,
      )
      .join("") +
    `</div>`;

  let corpo;
  if (dashTipoSelecionado) {
    const sel = rows.find((r) => r.tipo === dashTipoSelecionado);
    corpo = renderKpiGeralPorTipoDetalhe(dashTipoSelecionado, sel?.doTipo || [], list);
  } else {
    corpo =
      `<div class="dashboard-table-wrap dash-tipos-wrap"><table class="dash-table dash-tipos" aria-label="Indicadores por tipo de projeto">` +
      `<thead><tr><th scope="col">Tipo</th><th scope="col" class="num">Projetos</th>` +
      `<th scope="col" class="num">Na conclusão</th><th scope="col" class="num">Valor concluído</th>` +
      `<th scope="col" class="num">Em execução</th><th scope="col" class="num">Em aprovação</th>` +
      `<th scope="col" class="num">Média / projeto</th><th scope="col" class="num">Portas novas</th>` +
      `<th scope="col" class="num">Metragem</th></tr></thead><tbody>` +
      rows
        .map(({ tipo, doTipo }) => linha(tipo, dashTipoCor(tipo), doTipo, { showPortas: !TIPOS_SEM_PORTAS.includes(tipo) }))
        .join("") +
      `</tbody><tfoot>${linha("Total", "", list, { total: true })}</tfoot></table></div>` +
      `<p class="muted small dash-tipos__nota">Clique no nome de um tipo para ver os indicadores só dele. Valores, portas, metragem e média consideram a coluna <strong>Conclusão</strong>; em execução e em aprovação mostram quantidade e valor final.</p>`;
  }
  el.innerHTML = nav + corpo;
  el.querySelectorAll("[data-dash-tipo]").forEach((btn) => {
    btn.addEventListener("click", () => {
      dashTipoSelecionado = btn.dataset.dashTipo;
      renderKpiGeralPorTipo(list);
      el.querySelector(dashTipoSelecionado ? ".dash-tipo-det__head button" : `.dash-tipos-nav__btn.is-active`)?.focus({ preventScroll: true });
    });
  });
}

function labelSolicitante(raw) {
  const s = String(raw || "").trim();
  return s || "(Sem solicitante)";
}

function isDemandaAberta(d) {
  const dm = migrateDemanda(d);
  if (dm.linhaEsteira === LINHA_ESTEIRA_B2B) return !STATUS_B2B_CONCLUIDOS.has(dm.status);
  return !["conclusao", "reprovado"].includes(dm.status);
}

const TIPOS_SOLICITANTE_ABERTAS = [...TIPOS_DEMANDA, TIPO_DIARIA_LEGADO];

function emptyStatsSolicitante(nome) {
  return {
    nome,
    abertas: 0,
    abertasPorTipo: Object.fromEntries(TIPOS_SOLICITANTE_ABERTAS.map((t) => [t, 0])),
    fechadas: 0,
    fechadasAtraso: 0,
    reprovadas: 0,
    total: 0,
  };
}

function tiposComAbertas(abertasPorTipo) {
  const seen = new Set();
  const out = [];
  for (const t of TIPOS_SOLICITANTE_ABERTAS) {
    if ((abertasPorTipo[t] || 0) > 0) {
      out.push(t);
      seen.add(t);
    }
  }
  for (const t of Object.keys(abertasPorTipo).sort((a, b) => a.localeCompare(b, "pt-BR"))) {
    if (!seen.has(t) && abertasPorTipo[t] > 0) out.push(t);
  }
  return out;
}

function mergeAbertasPorTipo(rows) {
  const merged = {};
  for (const r of rows) {
    for (const [t, n] of Object.entries(r.abertasPorTipo)) {
      if (n > 0) merged[t] = (merged[t] || 0) + n;
    }
  }
  return merged;
}

function buildStatsPorSolicitante(demandas) {
  const map = new Map();
  for (const d of demandas) {
    const dm = migrateDemanda(d);
    const key = labelSolicitante(dm.solicitante);
    if (!map.has(key)) map.set(key, emptyStatsSolicitante(key));
    const row = map.get(key);
    row.total += 1;
    if (isDemandaAberta(dm)) {
      row.abertas += 1;
      const tipo = normalizeTipo(dm.tipo);
      if (row.abertasPorTipo[tipo] !== undefined) row.abertasPorTipo[tipo] += 1;
      else row.abertasPorTipo[tipo] = (row.abertasPorTipo[tipo] || 0) + 1;
    } else if (isStatusConcluidoDemanda(dm)) {
      row.fechadas += 1;
      if (demandaEntregaAtraso(dm)) row.fechadasAtraso += 1;
    } else if (dm.status === "reprovado") {
      row.reprovadas += 1;
    }
  }
  return [...map.values()].sort(
    (a, b) => b.abertas - a.abertas || b.total - a.total || a.nome.localeCompare(b.nome, "pt-BR"),
  );
}

function formatTiposAbertasHtml(abertasPorTipo) {
  const parts = tiposComAbertas(abertasPorTipo).map((t) => {
    const n = abertasPorTipo[t];
    return `<span class="badge ${tipoBadgeClass(t)} dash-sol-tipo">${escapeHtml(t)} (${n})</span>`;
  });
  return parts.length ? `<div class="dash-sol-tipos">${parts.join("")}</div>` : '<span class="muted">—</span>';
}

function makeDashChartSolicitantes(canvasId, labels, abertas, fechadas, fechadasAtraso) {
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
        { label: "Abertas", data: abertas, backgroundColor: "#3b82f6", borderWidth: 0 },
        { label: "Fechadas", data: fechadas, backgroundColor: "#22c55e", borderWidth: 0 },
        { label: "Fechadas c/ atraso", data: fechadasAtraso, backgroundColor: "#ef4444", borderWidth: 0 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: true, labels: { color: chartInk().label, boxWidth: 12 } } },
      scales: {
        x: { ticks: { color: chartInk().tick, maxRotation: 45, minRotation: 0, font: { size: 10 } }, grid: { color: chartInk().grid } },
        y: { beginAtZero: true, ticks: { color: chartInk().tick, stepSize: 1 }, grid: { color: chartInk().grid } },
      },
    },
  });
}

function renderDashSolicitantes() {
  const kpiEl = document.getElementById("dashSolicitantesKpis");
  const tableWrap = document.getElementById("dashSolicitantesTable");
  const countEl = document.getElementById("dashSolicitantesCount");
  if (!tableWrap) return;

  const todas = demandasDashOperacionalList();
  const rows = buildStatsPorSolicitante(todas);

  if (!todas.length) {
    if (kpiEl) kpiEl.innerHTML = "";
    if (countEl) countEl.textContent = "";
    tableWrap.innerHTML = '<p class="muted">Nenhum projeto cadastrado.</p>';
    return;
  }

  const totais = rows.reduce(
    (acc, r) => {
      acc.abertas += r.abertas;
      acc.fechadas += r.fechadas;
      acc.fechadasAtraso += r.fechadasAtraso;
      acc.reprovadas += r.reprovadas;
      return acc;
    },
    { abertas: 0, fechadas: 0, fechadasAtraso: 0, reprovadas: 0 },
  );

  if (kpiEl) {
    kpiEl.innerHTML =
      kpiCard("Solicitantes", rows.length, "ok") +
      kpiCard("Abertas (total)", totais.abertas, totais.abertas ? "ok" : "warn") +
      kpiCard("Fechadas", totais.fechadas, "ok") +
      kpiCard("Fechadas c/ atraso", totais.fechadasAtraso, totais.fechadasAtraso ? "bad" : "ok");
  }

  if (countEl) {
    countEl.textContent = `${rows.length} solicitante(s) · ${todas.length} projeto(s) cadastrado(s).`;
  }

  const top = rows.slice(0, 12);
  const chartLabels = top.map((r) => {
    const n = r.nome;
    return n.length > 22 ? n.slice(0, 22) + "…" : n;
  });
  makeDashChartSolicitantes(
    "chartSolicitantes",
    chartLabels,
    top.map((r) => r.abertas),
    top.map((r) => r.fechadas),
    top.map((r) => r.fechadasAtraso),
  );

  let body = "";
  for (const r of rows) {
    body +=
      "<tr><td><strong>" +
      escapeHtml(r.nome) +
      '</strong></td><td class="dash-sol-num">' +
      r.abertas +
      "</td><td>" +
      formatTiposAbertasHtml(r.abertasPorTipo) +
      '</td><td class="dash-sol-num">' +
      r.fechadas +
      '</td><td class="dash-sol-num' +
      (r.fechadasAtraso ? " dash-sol-num--bad" : "") +
      '">' +
      r.fechadasAtraso +
      "</td><td class=\"dash-sol-num muted\">" +
      (r.reprovadas || "—") +
      "</td><td class=\"dash-sol-num\">" +
      r.total +
      "</td></tr>";
  }
  body +=
    '<tr class="dash-cf-total-row"><td><strong>Total</strong></td><td>' +
    totais.abertas +
    "</td><td>" +
    formatTiposAbertasHtml(mergeAbertasPorTipo(rows)) +
    "</td><td>" +
    totais.fechadas +
    "</td><td>" +
    totais.fechadasAtraso +
    "</td><td>" +
    (totais.reprovadas || "—") +
    "</td><td>" +
    todas.length +
    "</td></tr>";

  tableWrap.innerHTML =
    '<table class="dash-table dash-table--solicitantes"><thead><tr><th>Solicitante</th><th>Abertas</th><th>Tipos (abertas)</th><th>Fechadas</th><th>Fechadas c/ atraso</th><th>Reprovadas</th><th>Total</th></tr></thead><tbody>' +
    body +
    "</tbody></table>";
}

function makeDashChartProjetadoExecutado(dentro, acima) {
  makeDashChart(
    "chartProjetadoExecutado",
    "doughnut",
    ["Dentro do orçamento", "Acima do projetado"],
    [dentro, acima],
    { colors: ["#22c55e", "#ef4444"] },
  );
}

function filterDashProjetadoExecutadoRows(rows) {
  const resp = document.getElementById("filterDashPeResp")?.value || "";
  const sit = document.getElementById("filterDashPeSituacao")?.value || "";
  return rows.filter((r) => {
    if (resp && !matchFilterProjetista(r.d, resp)) return false;
    if (sit === "dentro" && !r.dentro) return false;
    if (sit === "acima" && r.dentro) return false;
    return true;
  });
}

function renderProjetadoExecutadoResumo(rows, kpiEl) {
  const dentro = rows.filter((r) => r.dentro).length;
  const acima = rows.length - dentro;
  const pctAderencia = rows.length ? Math.round((dentro / rows.length) * 100) : 0;
  const estouroTotal = rows.filter((r) => !r.dentro).reduce((s, r) => s + Math.max(0, r.diff), 0);
  const economiaTotal = rows.filter((r) => r.dentro).reduce((s, r) => s + Math.max(0, -r.diff), 0);

  if (kpiEl) {
    kpiEl.innerHTML =
      kpiCard("Comparáveis", rows.length, rows.length ? "ok" : "warn") +
      kpiCard("Dentro do orçamento", dentro, dentro === rows.length && rows.length ? "ok" : "warn") +
      kpiCard("Acima do projetado", acima, acima ? "bad" : "ok") +
      kpiCard("Aderência", rows.length ? `${pctAderencia}%` : "—", pctAderencia >= 80 ? "ok" : pctAderencia >= 50 ? "warn" : "bad") +
      kpiCard("Economia (dentro)", formatBRL(economiaTotal), economiaTotal ? "ok" : "warn") +
      kpiCard("Estouro (acima)", formatBRL(estouroTotal), estouroTotal ? "bad" : "ok");
  }

  if (rows.length) {
    makeDashChartProjetadoExecutado(dentro, acima);
  } else if (dashCharts.chartProjetadoExecutado) {
    dashCharts.chartProjetadoExecutado.destroy();
    delete dashCharts.chartProjetadoExecutado;
  }
}

function projetadoExecutadoBadgeHtml(dentro, desvioProjetadoPct) {
  if (dentro) {
    const economia =
      desvioProjetadoPct != null && desvioProjetadoPct < 0
        ? ` (${Math.abs(desvioProjetadoPct)}% abaixo)`
        : "";
    return `<span class="dash-pe-badge dash-pe-badge--ok">Dentro do orçamento${economia}</span>`;
  }
  const estouro = desvioProjetadoPct != null && desvioProjetadoPct > 0 ? ` (+${desvioProjetadoPct}%)` : "";
  return `<span class="dash-pe-badge dash-pe-badge--bad">Acima do projetado${estouro}</span>`;
}

function renderDashProjetadoExecutado() {
  const kpiEl = document.getElementById("dashProjetadoExecutadoKpis");
  const tableWrap = document.getElementById("dashProjetadoExecutadoTable");
  const countEl = document.getElementById("dashProjetadoExecutadoCount");
  if (!tableWrap) return;

  const todas = demandasDashOperacionalList();
  const concluidas = todas.filter((d) => isDemandaConcluidaComparavel(d));
  const comLevantamento = concluidas.filter((d) => normalizeCusto(d.custo).temLevantamento);
  const rowsAll = comLevantamento
    .map((d) => {
      const a = analiseProjetadoExecutado(d);
      return a ? { d, ...a } : null;
    })
    .filter(Boolean);
  const semRealizado = comLevantamento.length - rowsAll.length;
  const respFiltro = document.getElementById("filterDashPeResp")?.value ?? "";
  const sitFiltro = document.getElementById("filterDashPeSituacao")?.value || "";
  const aguardandoProjetista = respFiltro === "";
  const filtroAtivo = (!!respFiltro && respFiltro !== FILTER_PROJETISTA_TODOS) || !!sitFiltro;

  if (!todas.length) {
    if (kpiEl) kpiEl.innerHTML = "";
    if (countEl) countEl.textContent = "";
    tableWrap.innerHTML = "<p class=\"muted\">Nenhum projeto cadastrado.</p>";
    return;
  }

  renderProjetadoExecutadoResumo(rowsAll, kpiEl);

  if (aguardandoProjetista) {
    if (countEl) {
      let msg = "";
      if (!rowsAll.length && comLevantamento.length) {
        msg = `${comLevantamento.length} concluído(s) com levantamento — informe o valor realizado na conclusão para comparar.`;
      } else if (rowsAll.length) {
        msg = `Gráficos com todos os ${rowsAll.length} projeto(s) comparáveis (visão geral).`;
        if (semRealizado) msg += ` ${semRealizado} concluído(s) sem valor realizado informado.`;
        msg += " Selecione um projetista para exibir a lista abaixo.";
      } else {
        msg = "Nenhum projeto concluído com levantamento para comparar.";
      }
      countEl.textContent = msg;
    }
    tableWrap.innerHTML =
      '<p class="muted dash-pe-hint">Selecione um projetista ou «Todos os projetistas» no filtro acima para exibir a lista.</p>';
    return;
  }

  const rows = filterDashProjetadoExecutadoRows(rowsAll);

  if (countEl) {
    let msg = "";
    if (!rowsAll.length && comLevantamento.length) {
      msg = `${comLevantamento.length} concluído(s) com levantamento — informe o valor realizado na conclusão para comparar.`;
    } else if (filtroAtivo) {
      msg = `Lista: ${rows.length} de ${rowsAll.length} projeto(s) comparáveis`;
      if (semRealizado) msg += ` · ${semRealizado} sem valor realizado`;
    } else {
      msg = `Lista: ${rows.length} de ${rowsAll.length} projeto(s) concluído(s) com valor projetado e realizado.`;
      if (semRealizado) msg += ` ${semRealizado} concluído(s) sem valor realizado informado.`;
    }
    if (filtroAtivo && !rows.length && rowsAll.length) {
      msg += " — nenhum resultado com os filtros atuais.";
    }
    countEl.textContent = msg;
  }

  if (!rows.length) {
    tableWrap.innerHTML = filtroAtivo
      ? "<p class=\"muted\">Nenhum projeto corresponde aos filtros. Ajuste projetista ou situação.</p>"
      : "<p class=\"muted\">Nenhum projeto com os dois valores para comparar.</p>";
    return;
  }

  const sortedTable = [...rows].sort((a, b) => {
    if (a.dentro !== b.dentro) return a.dentro ? 1 : -1;
    return (b.desvioProjetadoPct || 0) - (a.desvioProjetadoPct || 0);
  });

  let body = "";
  for (const r of sortedTable) {
    const dm = migrateDemanda(r.d);
    const desvioCls = r.dentro ? "dash-pe-num--ok" : "dash-pe-num--bad";
    const desvioTxt =
      r.desvioProjetadoPct != null
        ? `${r.desvioProjetadoPct > 0 ? "+" : ""}${r.desvioProjetadoPct}%`
        : "—";
    body +=
      "<tr><td><strong>" +
      escapeHtml(r.d.titulo || "—") +
      "</strong></td><td>" +
      escapeHtml(formatCidadesDemanda(r.d)) +
      "</td><td>" +
      escapeHtml(formatProjetistasDemanda(dm) || "—") +
      '</td><td class="dash-pe-num">' +
      formatBRL(r.base) +
      '</td><td class="dash-pe-num">' +
      formatBRL(r.projetado) +
      '</td><td class="dash-pe-num">' +
      formatBRL(r.realizado) +
      '</td><td class="dash-pe-num ' +
      desvioCls +
      '">' +
      desvioTxt +
      "</td><td>" +
      projetadoExecutadoBadgeHtml(r.dentro, r.desvioProjetadoPct) +
      "</td></tr>";
  }

  tableWrap.innerHTML =
    '<table class="dash-table dash-table--projetado-exec"><thead><tr><th>Projeto</th><th>Cidade</th><th>Projetista</th><th>Valor projeto</th><th>Projetado (+5%)</th><th>Realizado</th><th>Desvio vs projetado</th><th>Situação</th></tr></thead><tbody>' +
    body +
    "</tbody></table>";
}
