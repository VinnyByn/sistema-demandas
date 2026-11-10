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

/* ---------- Período: atalhos e comparação com o período anterior ---------- */

function isoDeData(dt) {
  const p = (n) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

/** Datas de início e fim de cada atalho («mes», «90», «ano»), sempre até hoje. */
function periodoDoAtalho(atalho, hoje = new Date()) {
  const fim = isoDeData(hoje);
  if (atalho === "mes") return { inicio: isoDeData(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), fim };
  if (atalho === "90") return { inicio: isoDeData(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 89)), fim };
  if (atalho === "ano") return { inicio: isoDeData(new Date(hoje.getFullYear(), 0, 1)), fim };
  return { inicio: "", fim: "" };
}

function syncDashPeriodosUi() {
  const { inicio, fim } = getDashPeriodoFiltro();
  document.querySelectorAll("[data-dash-periodo]").forEach((b) => {
    const p = periodoDoAtalho(b.dataset.dashPeriodo);
    const on = p.inicio === inicio && p.fim === fim;
    b.classList.toggle("is-active", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

function initDashPeriodos() {
  document.querySelectorAll("[data-dash-periodo]").forEach((b) => {
    if (b.id === "btnDashPeriodoLimpar") return; // já limpa e redesenha em app.js
    b.addEventListener("click", () => {
      const { inicio, fim } = periodoDoAtalho(b.dataset.dashPeriodo);
      const ini = document.getElementById("filterDashDataInicio");
      const f = document.getElementById("filterDashDataFim");
      if (ini) ini.value = inicio;
      if (f) f.value = fim;
      renderDashboard();
    });
  });
}

/** Mesmo número de dias logo antes do período escolhido (só com início e fim definidos). */
function periodoAnteriorDash(periodo = getDashPeriodoFiltro()) {
  const { inicio, fim } = periodo;
  if (!inicio || !fim) return null;
  const a = new Date(`${inicio}T12:00:00`);
  const b = new Date(`${fim}T12:00:00`);
  const dias = Math.round((b - a) / 86400000) + 1;
  const fimAnt = new Date(a);
  fimAnt.setDate(fimAnt.getDate() - 1);
  const iniAnt = new Date(fimAnt);
  iniAnt.setDate(iniAnt.getDate() - (dias - 1));
  return { inicio: isoDeData(iniAnt), fim: isoDeData(fimAnt), dias };
}

/** «▲ 4 vs. período anterior»: verde quando melhora, vermelho quando piora (`maiorEhPior` para atraso). */
function deltaPeriodoHtml(atual, anterior, { maiorEhPior = false, moeda = false } = {}) {
  if (anterior == null) return "";
  const diff = atual - anterior;
  const fmt = (v) => (moeda ? formatBRLCompact(Math.abs(v)) : formatQtd(Math.abs(v)));
  if (!diff) return `<span class="kpi__delta kpi__delta--igual" title="Igual ao período anterior">= período anterior</span>`;
  const sobe = diff > 0;
  const bom = maiorEhPior ? !sobe : sobe;
  return (
    `<span class="kpi__delta kpi__delta--${bom ? "bom" : "ruim"}" title="Período anterior: ${escapeHtml(moeda ? formatBRL(anterior) : formatQtd(anterior))}">` +
    `${sobe ? "▲" : "▼"} ${fmt(diff)} vs. período anterior</span>`
  );
}

/** Nome curto de cada bloco na barra de navegação do topo. */
const DASH_NAV_ROTULOS = {
  "kpi-geral": "Geral",
  tempo: "Tempo",
  projetistas: "Projetistas",
  cidades: "Regionais",
  "indicadores-b2c": "B2C",
  "indicadores-b2b": "B2B",
};

/** Barra fixa com um atalho por bloco: abre o bloco (se recolhido) e rola até ele. */
function initDashNav(state) {
  const nav = document.getElementById("dashNav");
  if (!nav) return;
  const blocos = [...document.querySelectorAll(".dash-block[data-dash-block]")];
  nav.innerHTML = blocos
    .map((b) => {
      const id = b.dataset.dashBlock;
      const titulo = b.querySelector(".dash-block__toggle > span")?.textContent.trim() || id;
      return `<button type="button" class="dash-nav__item" data-dash-ir="${escapeHtml(id)}" title="${escapeHtml(titulo)}">${escapeHtml(DASH_NAV_ROTULOS[id] || titulo)}</button>`;
    })
    .join("");
  const topbar = document.querySelector(".topbar");
  const ajustarTopo = () => document.documentElement.style.setProperty("--dash-nav-top", `${topbar?.offsetHeight || 0}px`);
  ajustarTopo();
  window.addEventListener("resize", ajustarTopo);
  nav.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-dash-ir]");
    if (!btn) return;
    const id = btn.dataset.dashIr;
    const bloco = document.querySelector(`.dash-block[data-dash-block="${id}"]`);
    if (!bloco) return;
    if (bloco.classList.contains("is-collapsed")) bloco.querySelector(".dash-block__toggle")?.click();
    bloco.scrollIntoView({ behavior: "smooth", block: "start" });
    bloco.querySelector(".dash-block__toggle")?.focus({ preventScroll: true });
  });
  // Marca o bloco que está na tela.
  if (typeof IntersectionObserver === "function") {
    const visiveis = new Map();
    const marcar = () => {
      let atual = "";
      let menorTopo = Infinity;
      for (const [id, topo] of visiveis) if (topo < menorTopo) [atual, menorTopo] = [id, topo];
      nav.querySelectorAll("[data-dash-ir]").forEach((b) => {
        const on = b.dataset.dashIr === atual;
        b.classList.toggle("is-active", on);
        if (on) b.setAttribute("aria-current", "true");
        else b.removeAttribute("aria-current");
      });
    };
    const obs = new IntersectionObserver(
      (entradas) => {
        for (const en of entradas) {
          const id = en.target.dataset.dashBlock;
          if (en.isIntersecting) visiveis.set(id, Math.abs(en.boundingClientRect.top));
          else visiveis.delete(id);
        }
        marcar();
      },
      { rootMargin: "-120px 0px -55% 0px" },
    );
    blocos.forEach((b) => obs.observe(b));
  }
  void state;
}

/** Os textos longos de explicação dos blocos viram um «ⓘ Como ler este bloco» que abre ao clicar. */
function recolherDicasDosBlocos() {
  document.querySelectorAll("#panelDashboard p.dash-block__hint:not([id])").forEach((p) => {
    if (p.closest(".dash-info")) return;
    const det = document.createElement("details");
    det.className = "dash-info";
    det.innerHTML = '<summary><span class="dash-info__ico" aria-hidden="true">i</span>Como ler este bloco</summary>';
    p.replaceWith(det);
    p.classList.remove("dash-block__hint");
    det.appendChild(p);
  });
}

function initDashBlocks() {
  if (dashBlocksInited) return;
  dashBlocksInited = true;
  observarKpiGrids();
  recolherDicasDosBlocos();
  initDashPeriodos();
  document.getElementById("panelDashboard")?.addEventListener("click", (e) => {
    const card = e.target.closest("[data-dash-relatorio]");
    if (card) abrirRelatorioDoDashboard(card.dataset.dashRelatorio, card.dataset.dashEsteira);
  });
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
  initDashNav(state);
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

/**
 * Cartão de indicador. Com `opts.relatorio` (e `opts.esteira`), vira botão que abre o Relatório
 * já filtrado com aqueles projetos (ver `abrirRelatorioDoDashboard`).
 */
function kpiCard(label, value, tone, sub, opts) {
  const subHtml = sub ? `<div class="kpi__sub">${sub}</div>` : "";
  // "ok" = valor normal (cor do texto); "warn" num valor zerado = vazio; "bad" = problema real.
  const tom = tone === "warn" && kpiValorVazio(value) ? "vazio" : tone;
  const corpo =
    `<div class="kpi__label">${label}</div>` +
    `<div class="kpi__value" title="${escapeHtml(String(value ?? ""))}">${kpiValorHtml(value)}</div>${subHtml}`;
  if (opts?.relatorio && !kpiValorVazio(value) && typeof abrirRelatorioDoDashboard === "function") {
    const rotulo = String(label).replace(/<[^>]+>/g, "");
    return (
      `<button type="button" class="kpi kpi--${tom} kpi--link" data-dash-relatorio="${escapeHtml(opts.relatorio)}" ` +
      `data-dash-esteira="${escapeHtml(opts.esteira || "operacional")}" title="Ver a lista: ${escapeHtml(rotulo)}">` +
      `${corpo}<span class="kpi__ver" aria-hidden="true">Ver lista ›</span></button>`
    );
  }
  return `<div class="kpi kpi--${tom}">${corpo}</div>`;
}

/**
 * Grade de cartões sem «buraco»: calcula quantas colunas cabem, divide os cartões em linhas
 * equilibradas (6 → 6, 9 → 5 + 4, 7 → 4 + 3) e a última linha estica para fechar a largura.
 */
const KPI_LARGURA_MIN = 168;
function equilibrarKpiGrids(root = document.getElementById("panelDashboard")) {
  root?.querySelectorAll(".kpi-grid").forEach((grid) => {
    const n = grid.children.length;
    const largura = grid.clientWidth;
    if (!n || !largura) return;
    const cabem = Math.max(1, Math.floor((largura + 12) / (KPI_LARGURA_MIN + 12)));
    const linhas = Math.ceil(n / cabem);
    const cols = Math.ceil(n / linhas);
    if (grid.style.getPropertyValue("--kpi-cols") !== String(cols)) grid.style.setProperty("--kpi-cols", String(cols));
    grid.classList.add("is-equilibrado");
  });
}

let dashKpiObservador = null;
function observarKpiGrids() {
  const painel = document.getElementById("panelDashboard");
  if (!painel || dashKpiObservador) return;
  let agendado = 0;
  const agendar = () => {
    cancelAnimationFrame(agendado);
    agendado = requestAnimationFrame(() => equilibrarKpiGrids(painel));
  };
  dashKpiObservador = new MutationObserver(agendar);
  dashKpiObservador.observe(painel, { childList: true, subtree: true });
  if (typeof ResizeObserver === "function") new ResizeObserver(agendar).observe(painel);
  agendar();
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
  // Com um período escolhido, compara com o mesmo número de dias logo antes.
  const ant = periodoAnteriorDash();
  let antDados = null;
  if (ant) {
    const listAnt = filterDemandasPeriodoDash(
      state.demandas.map(migrateDemanda).filter((d) => !isDemandaB2b(d)),
      ant,
    );
    antDados = {
      total: listAnt.length,
      concluidos: calcMediasIndicadoresGeral(listAnt, mode).n,
      atraso: countDemandas(listAnt).atraso,
      valor: (calcResumoIndicadoresDashboard(listAnt)[modoTopo] || { valor: 0 }).valor,
    };
  }
  const comDelta = (sub, atual, chave, opcoes) =>
    antDados ? `${sub}<br>${deltaPeriodoHtml(atual, antDados[chave], opcoes)}` : sub;
  el.innerHTML =
    kpiCard(
      "Total de projetos",
      m.totalCadastro,
      m.totalCadastro ? "ok" : "warn",
      comDelta(`${naEsteira} na esteira`, m.totalCadastro, "total"),
      { relatorio: "todos" },
    ) +
    kpiCard(
      "Concluídos",
      m.n,
      m.n ? "ok" : "warn",
      comDelta(`${formatPct(m.pctConclusao)} do total · ${formatBRL(valor)}`, m.n, "concluidos"),
      { relatorio: "concluido" },
    ) +
    kpiCard(
      "Em atraso",
      g.atraso,
      g.atraso ? "bad" : "ok",
      comDelta("Prazo previsto vencido", g.atraso, "atraso", { maiorEhPior: true }),
      { relatorio: "atrasado" },
    ) +
    kpiCard(
      labelValorDashModo(modoTopo),
      formatBRL(r.valor),
      r.valor ? "ok" : "warn",
      comDelta(`${r.n} projeto(s)`, r.valor, "valor", { moeda: true }),
    ) +
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

function demandaMetragemLancamento(d) {
  const c = normalizeCusto(d.custo);
  if (!c.temLancamento) return 0;
  return numDash(c.lancamento?.totalMetragem);
}

function labelCidade(cidade) {
  const t = String(cidade || "").trim();
  return t || "Não informada";
}

function regionalFromCidadeLabel(cidadeLabel) {
  if (cidadeLabel === "Não informada") return "Não informada";
  return findRegionalForCidade(cidadeLabel) || "Não informada";
}

/** «Regional Sul de Minas» → «Sul de Minas»: nos gráficos o prefixo só ocupa espaço e corta o nome. */
function semPrefixoRegional(text) {
  return typeof text === "string" ? text.replace(/^Regional\s+(?=\S)/, "") : text;
}

function truncateChartLabel(text, max = 20) {
  const s = semPrefixoRegional(String(text || ""));
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
/**
 * Cores da situação — fixas em todo o dashboard: ativas no azul de série, concluídas em verde,
 * pausadas em âmbar e reprovadas em vermelho. Tipos, segmentos e produtos nunca usam verde, vermelho ou âmbar.
 */
const SITUACAO_CORES = { concluidas: "#22c55e", pausadas: "#f59e0b", reprovadas: "#ef4444" };
function situacaoCor(chave) {
  return chave === "ativas" ? dashSerieCor() : SITUACAO_CORES[chave] || "#94a3b8";
}

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
  if (Array.isArray(cfg.data?.labels)) cfg.data.labels = cfg.data.labels.map(semPrefixoRegional);
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
      options.onBarClick(chart.data.labels[i], i, els[0].datasetIndex, chart);
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

/**
 * Clique em «Onde está o B2C»: cada célula da tabela (e cada barra do gráfico) abre os projetos daquele
 * segmento naquela regional/cidade. `slice` diz a métrica (valor, portas) para filtrar a lista.
 */
function b2cGeoCliqueOpts(tableRowHeader, slice) {
  const nivel = tableRowHeader === "Cidade" ? "cidade" : "regional";
  const attrs = (rowKey, seg) =>
    `data-dash-geo-list data-dash-geo-kind="segmento" data-dash-geo-key="${escapeHtml(seg || "")}" ` +
    `data-dash-geo-slice="${escapeHtml(slice || "")}" data-dash-geo-nivel="${nivel}" data-dash-geo-nome="${escapeHtml(rowKey || "")}"`;
  const abrir = (rowKey, seg) =>
    openDashGeoProjetosLista("segmento", seg || "", slice || "", undefined, { geoNivel: nivel, geoNome: rowKey || "" });
  return { attrs, abrir };
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
  const clique = b2cGeoCliqueOpts(tableRowHeader, tableOpts?.slice);
  makeDashChartProjetistaStacked(
    canvasId,
    rowKeys.map((k) => truncateChartLabel(k, 22)),
    datasets,
    { ...chartOpts, onBarClick: (_l, i, ds) => clique.abrir(rowKeys[i], datasets[ds]?.label) },
  );
  renderDashGrupoMatrixTable(
    tableId,
    tableRowHeader,
    rowKeys,
    segmentos,
    (k) => k,
    matrix,
    "Nenhum dado B2C neste agrupamento.",
    { ...tableOpts, celulaAttrs: clique.attrs },
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
      slice: "valor",
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
      slice: "portas",
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
  const clique = b2cGeoCliqueOpts(tableRowHeader, "");
  makeDashChartProjetistaStacked(
    canvasId,
    rowKeys.map((k) => truncateChartLabel(k, 22)),
    datasets,
    { stepSize: 1, onBarClick: (_l, i, ds) => clique.abrir(rowKeys[i], datasets[ds]?.label) },
  );
  renderDashGrupoMatrixTable(
    tableId,
    tableRowHeader,
    rowKeys,
    segmentos,
    (k) => k,
    matrix,
    "Nenhum projeto B2C neste agrupamento.",
    { celulaAttrs: clique.attrs },
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
  // Tipos sem nenhum projeto saem da lista e da tabela (citados numa linha abaixo).
  const tiposVazios = rows.filter((r) => !r.n && r.tipo !== dashTipoSelecionado).map((r) => r.tipo);
  const rowsComDados = rows.filter((r) => r.n || r.tipo === dashTipoSelecionado);

  const nav =
    `<div class="dash-tipos-nav" role="tablist" aria-label="Escolher tipo">` +
    `<button type="button" role="tab" class="dash-tipos-nav__btn${dashTipoSelecionado ? "" : " is-active"}" data-dash-tipo="" aria-selected="${!dashTipoSelecionado}">Visão geral</button>` +
    rowsComDados
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
      rowsComDados
        .map(({ tipo, doTipo }) => linha(tipo, dashTipoCor(tipo), doTipo, { showPortas: !TIPOS_SEM_PORTAS.includes(tipo) }))
        .join("") +
      `</tbody><tfoot>${linha("Total", "", list, { total: true })}</tfoot></table></div>` +
      (tiposVazios.length ? `<p class="muted small dash-tipos__nota">Sem projetos: ${escapeHtml(tiposVazios.join(", "))}.</p>` : "") +
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

const TIPOS_SOLICITANTE_ABERTAS = [...TIPOS_DEMANDA, TIPO_DIARIA_LEGADO];
