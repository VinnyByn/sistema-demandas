/**
 * Filtros da esteira, busca, formatação de nomes, valores e badges.
 * Só declarações (funções e constantes); o que roda ao abrir a página fica em app.js.
 */
/** Filtro rápido da esteira (chips do resumo): atrasados, vencendo, sem projetista, parados. */
let esteiraFiltroRapido = "";

const ESTEIRA_FILTROS_IDS = ["filterProjetista", "filterTipo", "filterRegional", "filterCidade"];

function esteiraFiltrosAtivosCount() {
  let n = ESTEIRA_FILTROS_IDS.filter((id) => document.getElementById(id)?.value).length;
  if ((document.getElementById("filterBusca")?.value || "").trim()) n++;
  if (esteiraFiltroRapido) n++;
  return n;
}

function syncEsteiraFiltrosUi() {
  ESTEIRA_FILTROS_IDS.forEach((id) => {
    const sel = document.getElementById(id);
    sel?.closest(".filtro-chip")?.classList.toggle("is-ativo", Boolean(sel.value));
  });
  const busca = document.getElementById("filterBusca");
  busca?.closest(".esteira-busca")?.classList.toggle("is-ativo", Boolean((busca.value || "").trim()));
  const n = esteiraFiltrosAtivosCount();
  const btn = document.getElementById("btnLimparFiltros");
  if (btn) {
    btn.hidden = n === 0;
    btn.textContent = n > 1 ? `✕ Limpar filtros (${n})` : "✕ Limpar filtro";
  }
  const modo = document.getElementById("filterEsteiraModo")?.value || ESTEIRA_MODO_ATIVOS;
  document.querySelectorAll("#esteiraModoSeg [data-modo]").forEach((b) => {
    const on = b.dataset.modo === modo;
    b.classList.toggle("is-active", on);
    b.setAttribute("aria-checked", on ? "true" : "false");
  });
}

function limparFiltrosEsteira() {
  ESTEIRA_FILTROS_IDS.forEach((id) => {
    const sel = document.getElementById(id);
    if (sel) sel.value = "";
  });
  fillFilterCidadeSelect("");
  const busca = document.getElementById("filterBusca");
  if (busca) busca.value = "";
  esteiraFiltroRapido = "";
  renderBoard();
}

function demandaPrazoProximo(d) {
  if (isDemandaEncerrada(d) || isAtrasoAtivo(d) || !d.dataFimPrevista) return false;
  const restam = diasEntreDatasISO(todayISODate(), d.dataFimPrevista);
  return restam != null && restam >= 0 && restam <= 3;
}

function demandaParadaNaColuna(d) {
  if (isDemandaEncerrada(d) || !normalizeResponsavel(d.responsavel)) return false;
  return diasAcimaDaMeta(d) != null;
}

const ESTEIRA_FILTROS_RAPIDOS = {
  atrasados: { label: "atrasado(s)", tom: "bad", test: (d) => isAtrasoAtivo(d) },
  vencendo: { label: "vence(m) em até 3 dias", tom: "warn", test: demandaPrazoProximo },
  sem_projetista: { label: "sem projetista", tom: "bad", test: (d) => !normalizeResponsavel(d.responsavel) },
  parados: {
    get label() {
      return "acima da meta da etapa";
    },
    tom: "coluna",
    test: demandaParadaNaColuna,
  },
};

function normalizeBuscaText(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
}

function readEsteiraFilters() {
  const selVal = document.getElementById("filterTipo")?.value || "";
  const base = {
    projetista: document.getElementById("filterProjetista")?.value || "",
    regional: document.getElementById("filterRegional")?.value || "",
    cidade: document.getElementById("filterCidade")?.value || "",
    busca: normalizeBuscaText(document.getElementById("filterBusca")?.value || ""),
  };
  if (esteiraFiltroRapido && ESTEIRA_FILTROS_RAPIDOS[esteiraFiltroRapido]) base.rapido = esteiraFiltroRapido;
  if (activeEsteiraCanal === LINHA_ESTEIRA_B2B) {
    return { ...base, produto: selVal };
  }
  return { ...base, tipo: selVal };
}

function demandaMatchesEsteiraFilters(d, f) {
  if (f.rapido && !ESTEIRA_FILTROS_RAPIDOS[f.rapido]?.test(d)) return false;
  if (f.produto) {
    if (normalizeProdutoB2b(d.produtoB2b) !== f.produto) return false;
  } else if (f.tipo && normalizeTipo(d.tipo) !== f.tipo) return false;
  if (f.projetista) {
    if (f.projetista === "__none__") {
      if (normalizeResponsavel(d.responsavel) !== "") return false;
    } else if (!demandaTemProjetista(d, f.projetista)) return false;
  }
  if (f.regional && !demandaTemRegional(d, f.regional)) return false;
  if (f.cidade && !demandaTemCidade(d, f.cidade)) return false;
  if (f.busca) {
    const blob = normalizeBuscaText(
      [
        d.titulo,
        formatCidadesDemanda(d),
        ...demandaRegionaisLabels(d),
        d.solicitante,
        formatProjetistasDemanda(d) || d.responsavel,
        d.descricao,
        d.statusAtual,
        d.chamadoOcomon,
        d.osAniel,
        d.tipo,
        d.produtoB2b,
        d.segmentoB2c,
      ]
        .filter(Boolean)
        .join(" "),
    );
    if (!blob.includes(f.busca)) return false;
  }
  return true;
}

function normalizeResponsavel(v, linha) {
  const s = String(v || "").trim();
  if (!s) return "";
  const cache = projetistasCacheAtual().normalizados;
  const chave = `${linha || ""}|${s}`;
  if (cache.has(chave)) return cache.get(chave);
  const r = calcNormalizeResponsavel(s, linha);
  cache.set(chave, r);
  return r;
}

function calcNormalizeResponsavel(s, linha) {
  const list = linha ? projetistasForLinha(linha) : allProjetistasNomes();
  if (list.includes(s)) return s;
  const slug = projetistaSlug(s);
  const byLen = [...list].sort((a, b) => b.length - a.length);
  for (const p of byLen) {
    if (projetistaSlug(p) === slug) return p;
  }
  for (const p of byLen) {
    if (slug.includes(projetistaSlug(p))) return p;
  }
  if (slug === "joao") return "João";
  return "";
}

function labelProjetista(v) {
  const n = normalizeResponsavel(v);
  return n || "Não atribuído";
}

function normalizeProjetistasExtra(list, responsavelPrincipal) {
  const main = normalizeResponsavel(responsavelPrincipal);
  const mainSlug = projetistaSlug(main);
  const raw = Array.isArray(list)
    ? list
    : typeof list === "string" && list.trim()
      ? list.split(/[;,]/)
      : [];
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const n = normalizeResponsavel(item);
    if (!n) continue;
    const key = projetistaSlug(n);
    if (mainSlug && key === mainSlug) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
}

function sameProjetistasExtra(a, b, responsavelPrincipal) {
  const x = normalizeProjetistasExtra(a, responsavelPrincipal);
  const y = normalizeProjetistasExtra(b, responsavelPrincipal);
  if (x.length !== y.length) return false;
  const set = new Set(x.map((n) => projetistaSlug(n)));
  return y.every((n) => set.has(projetistaSlug(n)));
}

function demandaProjetistasList(d) {
  const main = normalizeResponsavel(d?.responsavel);
  const extras = normalizeProjetistasExtra(d?.projetistasExtra, main);
  return main ? [main, ...extras] : extras;
}

function demandaTemProjetista(d, nome) {
  const alvo = normalizeResponsavel(nome) || String(nome || "").trim();
  if (!alvo) return false;
  const slug = projetistaSlug(alvo);
  return demandaProjetistasList(d).some((n) => n === alvo || projetistaSlug(n) === slug);
}

function formatProjetistasDemanda(d) {
  return demandaProjetistasList(d).join(" · ");
}

function normalizeTipo(v) {
  const t = String(v || "").trim();
  const tl = t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (tl === "diaria") return TIPO_DIARIA_LEGADO;
  if (tl === "mapeamento") return "Mapeamento";
  if (tl === "migracao") return "Migração";
  if (TIPOS_DEMANDA.includes(t)) return t;
  const found = TIPOS_DEMANDA.find((x) => x.toLowerCase() === t.toLowerCase());
  if (found) return found;
  return "B2C";
}

function syncDemTipoSelect(tipo) {
  const sel = document.getElementById("demTipo");
  if (!sel) return;
  sel.querySelectorAll("option[data-legado-diaria]").forEach((o) => o.remove());
  const t = normalizeTipo(tipo);
  if (t === TIPO_DIARIA_LEGADO) {
    const opt = document.createElement("option");
    opt.value = TIPO_DIARIA_LEGADO;
    opt.textContent = TIPO_DIARIA_LEGADO;
    opt.dataset.legadoDiaria = "1";
    sel.appendChild(opt);
  }
  sel.value = t;
  syncDemCamposPorTipo();
}

function tipoCardClass(tipo) {
  const map = {
    B2C: "card--b2c",
    B2B: "card--b2b",
    SWAP: "card--swap",
    Backbone: "card--bb",
    Licenciamento: "card--licenciamento",
    Mapeamento: "card--mapeamento",
    "Migração": "card--migracao",
    "Diária": "card--diaria",
  };
  return map[normalizeTipo(tipo)] || "card--b2c";
}

function tipoBadgeClass(tipo) {
  const map = {
    B2C: "badge--b2c",
    B2B: "badge--b2b",
    SWAP: "badge--swap",
    Backbone: "badge--bb",
    Licenciamento: "badge--licenciamento",
    Mapeamento: "badge--mapeamento",
    "Migração": "badge--migracao",
    "Diária": "badge--diaria",
  };
  return map[normalizeTipo(tipo)] || "badge--b2c";
}

function statusBadgeClass(status) {
  const map = {
    novo: "badge--st-novo",
    analise: "badge--st-analise",
    vistoria: "badge--st-vistoria",
    custo: "badge--st-custo",
    revisao: "badge--st-revisao",
    aprovacao: "badge--st-aprovacao",
    materiais: "badge--st-materiais",
    execucao: "badge--st-execucao",
    execucao_terceirizada: "badge--st-execucao-terceirizada",
    configuracao_op: "badge--st-configuracao",
    transmissao_infra_op: "badge--st-transmissao-infra",
    documentacao_op: "badge--st-documentacao",
    conclusao: "badge--st-conclusao",
    pausado: "badge--st-pausado",
    reprovado: "badge--st-reprovado",
    pre_vendas: "badge--st-novo",
    analise_kmz: "badge--st-analise",
    aprovacao_bp: "badge--st-aprovacao",
    projeto_final: "badge--st-conclusao",
    estoque: "badge--st-materiais",
    configuracao: "badge--st-execucao",
    documentacao: "badge--st-documentacao",
  };
  return map[status] || "badge--st-novo";
}

function demandasDashboardList() {
  return filterDemandasPeriodoDash(state.demandas.map(migrateDemanda));
}

/** Período do filtro superior do dashboard (data de chegada). Vazio = todo o período. */
function getDashPeriodoFiltro() {
  let inicio = String(document.getElementById("filterDashDataInicio")?.value || "").trim();
  let fim = String(document.getElementById("filterDashDataFim")?.value || "").trim();
  if (inicio && fim && inicio > fim) {
    const tmp = inicio;
    inicio = fim;
    fim = tmp;
  }
  return { inicio, fim };
}

function demandaDataChegadaDash(d) {
  const dm = migrateDemanda(d);
  return isoDatePart(dm.dataChegada) || isoDatePart(dm.createdAt) || "";
}

function demandaNoPeriodoDash(d, periodo = getDashPeriodoFiltro()) {
  const { inicio, fim } = periodo || {};
  if (!inicio && !fim) return true;
  const data = demandaDataChegadaDash(d);
  if (!data) return false;
  if (inicio && data < inicio) return false;
  if (fim && data > fim) return false;
  return true;
}

function filterDemandasPeriodoDash(list, periodo = getDashPeriodoFiltro()) {
  const { inicio, fim } = periodo || {};
  if (!inicio && !fim) return list;
  return list.filter((d) => demandaNoPeriodoDash(d, periodo));
}

function labelDashPeriodoFiltro() {
  const { inicio, fim } = getDashPeriodoFiltro();
  if (!inicio && !fim) return "Todo o período (data de chegada)";
  if (inicio && fim) return `Chegada de ${formatDataISO(inicio)} a ${formatDataISO(fim)}`;
  if (inicio) return `Chegada a partir de ${formatDataISO(inicio)}`;
  return `Chegada até ${formatDataISO(fim)}`;
}

function updateDashPeriodoHint() {
  const hintEl = document.getElementById("dashValoresFinanceirosHint");
  if (!hintEl) return;
  const modo = getDashValorModo();
  const baseHint = DASH_VALOR_MODOS[modo]?.hint || "";
  hintEl.textContent = `${baseHint} · Filtro: ${labelDashPeriodoFiltro()}.`;
}

/** Projetos da esteira B2B (tipo B2B). */
function isDemandaB2b(d) {
  return inferLinhaEsteira(d) === LINHA_ESTEIRA_B2B;
}

/** Demandas da esteira operacional (exclui tipo B2B) — base do dashboard geral. */
function demandasEsteiraOperacionalList() {
  return demandasDashboardList().filter((d) => !isDemandaB2b(d));
}

function demandasDashOperacionalList() {
  return demandasEsteiraOperacionalList();
}

function demandasB2bDashboardList() {
  return demandasDashboardList().filter(isDemandaB2b);
}

function demandasB2cDashboardList() {
  return demandasDashOperacionalList().filter((d) => normalizeTipo(d.tipo) === "B2C");
}

function normalizeDiaria(d) {
  const resp = normalizeResponsavel(d?.responsavel) || PROJETISTA_PADRAO;
  return {
    id: d?.id || uid(),
    titulo: String(d?.titulo || "").trim(),
    descricao: String(d?.descricao || "").trim(),
    responsavel: PROJETISTAS.includes(resp) ? resp : PROJETISTA_PADRAO,
    updatedAt: d?.updatedAt || "",
  };
}

const TIPOS_CABO = ["FO-06", "FO-12", "FO-24", "FO-36", "FO-48", "FO-72", "FO-144", "Figura 8", "Drop"];
const CUSTO_EXECUCAO_NAO_APLICA = "Não se aplica";
const CUSTO_EXECUCAO_OPCOES = [
  CUSTO_EXECUCAO_NAO_APLICA,
  "Regional",
  "Terceirizada",
  "Regional + Terceirizada",
];

function normalizeExecucaoCusto(v) {
  const s = String(v || "").trim();
  const lower = s.toLowerCase();
  if (lower === "nao se aplica" || lower === "não se aplica" || lower === "nao" || s === CUSTO_EXECUCAO_NAO_APLICA) {
    return CUSTO_EXECUCAO_NAO_APLICA;
  }
  if (
    lower === "regional + terceirizada" ||
    lower === "regional e terceirizada" ||
    (lower.includes("regional") && lower.includes("terceirizada"))
  ) {
    return "Regional + Terceirizada";
  }
  if (s === "Regiona" || lower === "regional") return "Regional";
  if (lower === "terceirizada") return "Terceirizada";
  return CUSTO_EXECUCAO_OPCOES.includes(s) ? s : CUSTO_EXECUCAO_NAO_APLICA;
}

const emptyPortasCusto = () => ({
  qtdCasas: "",
  qtdPortasAtual: "",
  qtdNovasPortas: "",
  penetracaoAtual: "",
  novaPenetracao: "",
  valorPorPortaNova: "",
});

const emptyLancamentoCusto = () => ({
  cabos: [],
  totalMetragem: "",
});

const emptyExecucaoCustos = () => ({
  custoRegional: "",
  custoTerceirizada: "",
});

const emptyCusto = () => ({
  temLevantamento: false,
  temPortas: false,
  temLancamento: false,
  valorProjeto: "",
  valor5: "",
  valorFinal: "",
  ...emptyPortasCusto(),
  lancamento: emptyLancamentoCusto(),
  execucao: CUSTO_EXECUCAO_NAO_APLICA,
  ...emptyExecucaoCustos(),
});

function parseCustoMoney(v) {
  if (v === "" || v == null) return "";
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : "";
}

function normalizeExecucaoCustos(custo, execucao) {
  const ex = normalizeExecucaoCusto(execucao);
  if (ex === CUSTO_EXECUCAO_NAO_APLICA) {
    return { custoRegional: "", custoTerceirizada: "" };
  }
  let custoRegional = parseCustoMoney(custo?.custoRegional);
  let custoTerceirizada = parseCustoMoney(custo?.custoTerceirizada);
  if (ex === "Terceirizada") custoRegional = "";
  else if (ex === "Regional") custoTerceirizada = "";
  return { custoRegional, custoTerceirizada };
}

function inferTemLevantamento(custo) {
  if (!custo || typeof custo !== "object") return false;
  const keys = ["valorProjeto", "valor5", "valorFinal"];
  const hasValores = keys.some((k) => custo[k] !== "" && custo[k] != null);
  if (typeof custo.temLevantamento === "boolean") return custo.temLevantamento || hasValores;
  return hasValores;
}

function inferTemLancamento(custo) {
  if (!custo || typeof custo !== "object") return false;
  if (typeof custo.temLancamento === "boolean") return custo.temLancamento;
  if (Array.isArray(custo.lancamento?.cabos) && custo.lancamento.cabos.length > 0) return true;
  if (custo.totalLancamento !== "" && custo.totalLancamento != null) return true;
  return false;
}

function sumMetragemCabos(cabos) {
  let total = 0;
  let has = false;
  for (const c of cabos || []) {
    const m = Number(c.metragem);
    if (Number.isFinite(m) && m > 0) {
      total += m;
      has = true;
    }
  }
  return has ? Math.round(total * 100) / 100 : "";
}

function normalizeLancamento(lancamento) {
  const cabos = (Array.isArray(lancamento?.cabos) ? lancamento.cabos : [])
    .map((c) => {
      const metragem = c.metragem === "" || c.metragem == null ? "" : Number(c.metragem);
      return {
        id: c.id || uid(),
        tipo: TIPOS_CABO.includes(c.tipo) ? c.tipo : TIPOS_CABO[0],
        metragem: Number.isFinite(metragem) ? metragem : "",
      };
    })
    .filter((c) => c.tipo);
  return { cabos, totalMetragem: sumMetragemCabos(cabos) };
}

function inferTemPortas(custo) {
  if (!custo || typeof custo !== "object") return false;
  if (typeof custo.temPortas === "boolean") return custo.temPortas;
  const keys = ["qtdCasas", "qtdPortasAtual", "qtdNovasPortas", "penetracaoAtual", "novaPenetracao", "portas"];
  return keys.some((k) => custo[k] !== "" && custo[k] != null);
}

function calcValorPorPortaNova(valorFinal, qtdNovasPortas) {
  if (valorFinal === "" || valorFinal == null || !qtdNovasPortas) return "";
  const total = Number(valorFinal);
  const qtd = Number(qtdNovasPortas);
  if (!Number.isFinite(total) || !Number.isFinite(qtd) || qtd <= 0) return "";
  return Math.round((total / qtd) * 100) / 100;
}

/** Taxa de penetração (%) = portas ÷ casas × 100 */
function calcTaxaPenetracao(portas, casas) {
  const p = portas === "" || portas == null ? NaN : Number(portas);
  const c = casas === "" || casas == null ? NaN : Number(casas);
  if (!Number.isFinite(p) || !Number.isFinite(c) || c <= 0) return "";
  return Math.round((p / c) * 10000) / 100;
}

function recalcPenetracaoPortas() {
  const elAtual = document.getElementById("custoPenetracaoAtual");
  const elNova = document.getElementById("custoNovaPenetracao");
  if (!elAtual || !elNova || document.getElementById("demTemPortas")?.value !== "sim") return;

  const num = (id) => {
    const v = document.getElementById(id)?.value;
    if (v === "" || v == null) return "";
    const n = parseNumBrInput(v);
    return n === "" ? "" : n;
  };

  const casas = num("custoQtdCasas");
  const existentes = num("custoQtdPortasAtual");
  const novas = num("custoQtdNovasPortas");

  const taxaAtual =
    casas !== "" && existentes !== "" ? calcTaxaPenetracao(existentes, casas) : "";
  elAtual.value = taxaAtual === "" ? "" : formatBr().formatPercentBr?.(taxaAtual) ?? `${taxaAtual}%`;

  if (casas !== "" && existentes !== "") {
    const totalPortas = Number(existentes) + (novas !== "" ? Number(novas) : 0);
    const taxaNova = calcTaxaPenetracao(totalPortas, casas);
    elNova.value = taxaNova === "" ? "" : formatBr().formatPercentBr?.(taxaNova) ?? `${taxaNova}%`;
  } else {
    elNova.value = "";
  }
}

function normalizeCusto(custo) {
  const raw = { ...emptyCusto(), ...(custo || {}) };
  if (raw.qtdCasas === "" && raw.portas !== "" && raw.portas != null) raw.qtdCasas = raw.portas;
  delete raw.portas;

  const execucao = normalizeExecucaoCusto(raw.execucao);
  const execucaoCustos = normalizeExecucaoCustos(raw, execucao);
  raw.temLevantamento = inferTemLevantamento(raw);
  if (!raw.temLevantamento) return { ...emptyCusto(), execucao, ...execucaoCustos };

  const valorProjeto = parseCustoMoney(raw.valorProjeto);
  const valorFinalSalvo = parseCustoMoney(raw.valorFinal);
  if (valorProjeto !== "") {
    const cinco = Math.round(valorProjeto * 0.05 * 100) / 100;
    raw.valor5 = cinco;
    raw.valorFinal = Math.round((valorProjeto + cinco) * 100) / 100;
  } else if (valorFinalSalvo !== "") {
    raw.valorFinal = valorFinalSalvo;
    raw.valor5 = parseCustoMoney(raw.valor5);
    raw.valorProjeto = parseCustoMoney(raw.valorProjeto);
  } else {
    raw.valorProjeto = "";
    raw.valor5 = "";
    raw.valorFinal = "";
  }

  raw.temPortas = inferTemPortas(raw);
  if (!raw.temPortas) Object.assign(raw, emptyPortasCusto());
  else {
    raw.penetracaoAtual = calcTaxaPenetracao(raw.qtdPortasAtual, raw.qtdCasas);
    const portasTotais =
      (raw.qtdPortasAtual === "" ? 0 : Number(raw.qtdPortasAtual)) +
      (raw.qtdNovasPortas === "" ? 0 : Number(raw.qtdNovasPortas));
    raw.novaPenetracao = calcTaxaPenetracao(portasTotais, raw.qtdCasas);
    raw.valorPorPortaNova = calcValorPorPortaNova(raw.valorFinal, raw.qtdNovasPortas);
  }

  raw.temLancamento = inferTemLancamento(raw);
  if (!raw.temLancamento) raw.lancamento = emptyLancamentoCusto();
  else raw.lancamento = normalizeLancamento(raw.lancamento);
  delete raw.totalLancamento;

  raw.execucao = execucao;
  Object.assign(raw, execucaoCustos);
  return raw;
}

const defaultState = () => ({
  demandas: [],
  diarias: [],
  deletedDiariaIds: [],
  projetistas: Object.fromEntries(
    allProjetistasNomes().map((nome) => [nome, { texto: "", demandaId: "", desde: "", updatedAt: "" }]),
  ),
});
