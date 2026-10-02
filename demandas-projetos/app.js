const STORAGE_KEY = "demandasProjetos_v1";
const APP_PUBLIC_URL = "https://demproj-fdeac.web.app";

const STATUS_ORDER = [
  ["novo", "Projetos novos"],
  ["analise", "Análise geral / desenho"],
  ["vistoria", "Vistoria"],
  ["custo", "Levantamento de custo"],
  ["revisao", "Revisão"],
  ["aprovacao", "Aprovação"],
  ["materiais", "Materiais"],
  ["execucao", "Execução Regional"],
  ["execucao_terceirizada", "Execução Terceirizada"],
  ["configuracao_op", "IP e Serviços"],
  ["transmissao_infra_op", "Transmissão e Infra"],
  ["documentacao_op", "Documentação"],
  ["conclusao", "Conclusão"],
];

const STATUS_EXTRA = [
  ["pausado", "Pausado"],
  ["reprovado", "Reprovado"],
];

const STATUS_LABEL = Object.fromEntries([...STATUS_ORDER, ...STATUS_EXTRA]);

/** Esteira B2B — fluxo comercial distinto. */
const LINHA_ESTEIRA_OPERACIONAL = "operacional";
const LINHA_ESTEIRA_B2B = "b2b";

const STATUS_ORDER_B2B = [
  ["pre_vendas", "Pré-Vendas"],
  ["analise_kmz", "Análise Geral / KMZ"],
  ["vistoria", "Vistoria"],
  ["custo", "Levantamento de Custo"],
  ["aprovacao_bp", "Aprovação BP"],
  ["projeto_final", "Projeto Final"],
  ["estoque", "Estoque"],
  ["configuracao", "Execução Regional"],
  ["execucao_terceirizada", "Execução Terceirizada"],
  ["documentacao", "Documentação / As-Builts"],
  ["pausado", "Pausados"],
];

const STATUS_LABEL_B2B = Object.fromEntries(STATUS_ORDER_B2B);

/** B2B: projeto concluído (esteira e indicadores). */
const STATUS_B2B_CONCLUIDOS = new Set(["projeto_final", "documentacao"]);

/** Pós-aprovação BP — estoque e projeto final (dashboard: Aprovados). */
const STATUS_B2B_APROVADOS = ["estoque", "projeto_final"];

/** Execução na esteira B2B — regional (configuração) e terceirizada. */
const STATUS_B2B_EXECUCAO_REGIONAL = ["configuracao"];
const STATUS_B2B_EXECUCAO_TERCEIRIZADA = ["execucao_terceirizada"];
const STATUS_B2B_EXECUCAO = [...STATUS_B2B_EXECUCAO_REGIONAL, ...STATUS_B2B_EXECUCAO_TERCEIRIZADA];

const MAP_STATUS_OPERACIONAL_PARA_B2B = {
  novo: "pre_vendas",
  analise: "analise_kmz",
  vistoria: "vistoria",
  custo: "custo",
  revisao: "aprovacao_bp",
  aprovacao: "aprovacao_bp",
  materiais: "estoque",
  execucao: "configuracao",
  execucao_terceirizada: "execucao_terceirizada",
  configuracao_op: "configuracao",
  transmissao_infra_op: "documentacao",
  documentacao_op: "documentacao",
  conclusao: "projeto_final",
  pausado: "pausado",
  reprovado: "pausado",
};

function buildEsteiraConfig(statusOrder, statusExtra, inboxStatus) {
  return {
    statusOrder,
    statusExtra,
    statusLabel: Object.fromEntries([...statusOrder, ...statusExtra]),
    inboxStatus,
  };
}

const ESTEIRA_CONFIG = {
  [LINHA_ESTEIRA_OPERACIONAL]: buildEsteiraConfig(STATUS_ORDER, STATUS_EXTRA, "novo"),
  [LINHA_ESTEIRA_B2B]: buildEsteiraConfig(STATUS_ORDER_B2B, [], "pre_vendas"),
};

function getEsteiraConfig(linha = activeEsteiraCanal) {
  return ESTEIRA_CONFIG[normalizeLinhaEsteira(linha)] || ESTEIRA_CONFIG[LINHA_ESTEIRA_OPERACIONAL];
}

function normalizeLinhaEsteira(v) {
  return v === LINHA_ESTEIRA_B2B ? LINHA_ESTEIRA_B2B : LINHA_ESTEIRA_OPERACIONAL;
}

function inferLinhaEsteira(d) {
  return normalizeTipo(d?.tipo) === "B2B" ? LINHA_ESTEIRA_B2B : LINHA_ESTEIRA_OPERACIONAL;
}

function mapStatusParaLinha(status, linha) {
  const cfg = getEsteiraConfig(linha);
  if (cfg.statusLabel[status]) return status;
  if (linha === LINHA_ESTEIRA_B2B && MAP_STATUS_OPERACIONAL_PARA_B2B[status]) {
    return MAP_STATUS_OPERACIONAL_PARA_B2B[status];
  }
  return cfg.inboxStatus;
}

function stripAccentsLower(text) {
  return String(text || "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

/** Resolve chave canônica a partir de slug ou rótulo exibido (ex.: «execução» → execucao). */
function resolveStatusKey(status, linha = activeEsteiraCanal) {
  const s = String(status || "").trim();
  if (!s) return s;
  const cfg = getEsteiraConfig(linha);
  if (cfg.statusLabel[s]) return s;
  if (linha === LINHA_ESTEIRA_B2B && MAP_STATUS_OPERACIONAL_PARA_B2B[s]) {
    return MAP_STATUS_OPERACIONAL_PARA_B2B[s];
  }
  const slug = stripAccentsLower(s);
  for (const [k] of [...cfg.statusOrder, ...(cfg.statusExtra || [])]) {
    if (k === s || stripAccentsLower(k) === slug) return k;
    const lab = cfg.statusLabel[k];
    if (lab && stripAccentsLower(lab) === slug) return k;
  }
  for (const [k, lab] of [...STATUS_ORDER, ...STATUS_EXTRA]) {
    if (k === s || stripAccentsLower(k) === slug) return k;
    if (stripAccentsLower(lab) === slug) return k;
  }
  for (const [k, lab] of STATUS_ORDER_B2B) {
    if (k === s || stripAccentsLower(k) === slug) return k;
    if (stripAccentsLower(lab) === slug) return k;
  }
  if (normalizeLinhaEsteira(linha) === LINHA_ESTEIRA_OPERACIONAL) {
    if (slug === "configuracao") return "configuracao_op";
    if (slug === "transmissao e infra") return "transmissao_infra_op";
  }
  return s;
}

function capitalizeStatusLabel(text) {
  const s = String(text || "").trim();
  if (!s) return "—";
  return s.charAt(0).toLocaleUpperCase("pt-BR") + s.slice(1);
}

function labelStatus(status, linha = activeEsteiraCanal) {
  const s = String(status || "").trim();
  if (!s) return "—";
  const key = resolveStatusKey(s, linha);
  const cfg = getEsteiraConfig(linha);
  if (cfg.statusLabel[key]) return cfg.statusLabel[key];
  if (STATUS_LABEL[key]) return STATUS_LABEL[key];
  return capitalizeStatusLabel(s);
}

function statusConcluidoKey(linha = activeEsteiraCanal) {
  return linha === LINHA_ESTEIRA_B2B ? "projeto_final" : "conclusao";
}

function isStatusConcluidoDemanda(dm) {
  if (!dm) return false;
  const linha = inferLinhaEsteira(dm);
  if (linha === LINHA_ESTEIRA_B2B) return STATUS_B2B_CONCLUIDOS.has(dm.status);
  return dm.status === "conclusao";
}

function isStatusConcluidoNoFormulario(status, linha = editingLinhaEsteira) {
  if (normalizeLinhaEsteira(linha) === LINHA_ESTEIRA_B2B) return STATUS_B2B_CONCLUIDOS.has(status);
  return status === "conclusao";
}

let activeEsteiraCanal = LINHA_ESTEIRA_OPERACIONAL;

/** Colunas da esteira: ativos (padrão) | finalizados | todos */
const ESTEIRA_MODO_ATIVOS = "ativos";
const ESTEIRA_MODO_FINALIZADOS = "finalizados";
const ESTEIRA_MODO_TODOS = "todos";
let esteiraModoColunas = ESTEIRA_MODO_ATIVOS;

function statusFinalizadosKeys(linha = activeEsteiraCanal) {
  if (normalizeLinhaEsteira(linha) === LINHA_ESTEIRA_B2B) return ["projeto_final"];
  return ["conclusao", "reprovado"];
}

function readEsteiraModoColunas() {
  const v = document.getElementById("filterEsteiraModo")?.value || ESTEIRA_MODO_ATIVOS;
  if (v === ESTEIRA_MODO_FINALIZADOS || v === ESTEIRA_MODO_TODOS) return v;
  return ESTEIRA_MODO_ATIVOS;
}

function visibleEsteiraStatusKeys(linha = activeEsteiraCanal) {
  const cfg = getEsteiraConfig(linha);
  const all = [...cfg.statusOrder.map(([k]) => k), ...(cfg.statusExtra || []).map(([k]) => k)];
  const finals = new Set(statusFinalizadosKeys(linha));
  const modo = esteiraModoColunas;
  if (modo === ESTEIRA_MODO_FINALIZADOS) return all.filter((k) => finals.has(k));
  if (modo === ESTEIRA_MODO_TODOS) return all;
  return all.filter((k) => !finals.has(k));
}

function updateEsteiraModoHints() {
  const modo = esteiraModoColunas;
  const op = document.getElementById("esteiraSubOperacional");
  const b2b = document.getElementById("esteiraSubB2b");
  if (op) {
    if (modo === ESTEIRA_MODO_FINALIZADOS) {
      op.innerHTML =
        "Somente <strong>Conclusão</strong> e <strong>Reprovado</strong>. Use a busca acima para achar um projeto.";
    } else if (modo === ESTEIRA_MODO_TODOS) {
      op.innerHTML = "Todas as colunas visíveis, inclusive finalizados.";
    } else {
      op.innerHTML =
        "Demandas em andamento. Novas demandas sem projetista entram na primeira coluna com o selo <strong>Não atribuído</strong>.";
    }
  }
  if (b2b) {
    if (modo === ESTEIRA_MODO_FINALIZADOS) {
      b2b.innerHTML =
        "Somente <strong>Projeto Final</strong>. Use a busca acima para achar um projeto.";
    } else if (modo === ESTEIRA_MODO_TODOS) {
      b2b.innerHTML = "Todas as colunas B2B visíveis, inclusive Projeto Final.";
    } else {
      b2b.innerHTML =
        "Fluxo comercial em andamento. Projetos sem projetista entram na primeira coluna com o selo <strong>Não atribuído</strong>.";
    }
  }
  const sel = document.getElementById("filterEsteiraModo");
  if (sel) {
    const optFin = [...sel.options].find((o) => o.value === ESTEIRA_MODO_FINALIZADOS);
    if (optFin) {
      optFin.textContent =
        activeEsteiraCanal === LINHA_ESTEIRA_B2B
          ? "Finalizados (Projeto Final)"
          : "Finalizados (Conclusão / Reprovado)";
    }
  }
}
let editingLinhaEsteira = LINHA_ESTEIRA_OPERACIONAL;

/** Declarados no topo — o login roda antes do restante do script terminar. */
let appBootstrapped = false;
let bootstrapPromise = null;
let handleAuthPromise = null;
let persistenceApi = null;
let persistenceReady = false;
let pendingCloudPatch = null;

/** Setor responsável por cada coluna da esteira (dashboard — tempo). */
const SETORES_ESTEIRA = ["Projetos", "Operação", "Diretoria", "CD", "IP e Serviços", "Transmissão e Infra", "Terceirizada"];
const STATUS_SETOR = {
  novo: "Projetos",
  analise: "Projetos",
  vistoria: "Operação",
  custo: "Projetos",
  revisao: "Projetos",
  aprovacao: "Diretoria",
  materiais: "CD",
  execucao: "Operação",
  execucao_terceirizada: "Terceirizada",
  configuracao_op: "IP e Serviços",
  transmissao_infra_op: "Transmissão e Infra",
  documentacao_op: "Projetos",
};
const SETOR_COLORS = {
  Projetos: "#6366f1",
  Operação: "#14b8a6",
  Diretoria: "#f59e0b",
  CD: "#a855f7",
  "IP e Serviços": "#0ea5e9",
  "Transmissão e Infra": "#eab308",
  Terceirizada: "#ec4899",
  Comercial: "#f59e0b",
  "Engenharia/Noc": "#0ea5e9",
  Engenharia: "#0ea5e9",
  Outros: "#94a3b8",
};

/** Setores da esteira B2B (dashboard — tempo por setor). */
const SETORES_ESTEIRA_B2B = ["Comercial", "Projetos", "Operação", "CD", "Engenharia/Noc", "Terceirizada"];
const STATUS_SETOR_B2B = {
  pre_vendas: "Comercial",
  analise_kmz: "Projetos",
  vistoria: "Operação",
  custo: "Projetos",
  aprovacao_bp: "Comercial", // cadastro / timeline — tempo SLA B2B exclui esta etapa (stand-by)
  projeto_final: "Projetos",
  estoque: "CD",
  configuracao: "Operação",
  execucao_terceirizada: "Terceirizada",
  documentacao: "Projetos",
};
const SETOR_COLORS_B2B = {
  Comercial: "#f59e0b",
  Projetos: "#6366f1",
  Operação: "#14b8a6",
  CD: "#a855f7",
  "Engenharia/Noc": "#0ea5e9",
  Terceirizada: "#ec4899",
  Outros: "#94a3b8",
};

/** Não entram no dashboard de tempo (só etapas operacionais da esteira). */
const TEMPO_STATUS_EXCLUIDOS = new Set(["conclusao", "pausado", "reprovado"]);
const TEMPO_FASES_ORDER = STATUS_ORDER.map(([k]) => k).filter((k) => !TEMPO_STATUS_EXCLUIDOS.has(k));
/** Sem "Projetos novos" no filtro de status do dashboard Tempo por setor. */
const TEMPO_FILTRO_STATUS_OPCOES = TEMPO_FASES_ORDER.filter((k) => k !== "novo");

function isTempoStatusExcluded(status) {
  return TEMPO_STATUS_EXCLUIDOS.has(status);
}

function setorForStatus(status) {
  return STATUS_SETOR[status] || null;
}

/** B2B: pausado e Aprovação BP (stand-by externo) não entram no tempo por setor / SLA. */
const TEMPO_STATUS_EXCLUIDOS_B2B = new Set(["pausado", "aprovacao_bp"]);
const TEMPO_FASES_ORDER_B2B = STATUS_ORDER_B2B.map(([k]) => k).filter((k) => !TEMPO_STATUS_EXCLUIDOS_B2B.has(k));
const TEMPO_FILTRO_STATUS_OPCOES_B2B = TEMPO_FASES_ORDER_B2B.filter((k) => k !== "pre_vendas");

function isTempoStatusExcludedB2b(status) {
  const key = normalizeTempoStatusB2b(status);
  return TEMPO_STATUS_EXCLUIDOS_B2B.has(key);
}

/** Converte status do histórico (incl. legado operacional) para chave B2B. */
function normalizeTempoStatusB2b(status) {
  return resolveStatusKey(status, LINHA_ESTEIRA_B2B);
}

function normalizeTempoStatusOp(status) {
  return resolveStatusKey(status, LINHA_ESTEIRA_OPERACIONAL);
}

/** Setor no dashboard de tempo B2B — Aprovação BP não entra em nenhum setor (SLA). */
function setorForStatusTempoB2b(status) {
  const key = resolveStatusKey(status, LINHA_ESTEIRA_B2B);
  if (TEMPO_STATUS_EXCLUIDOS_B2B.has(key)) return null;
  return STATUS_SETOR_B2B[key] || null;
}

function setorForStatusDemanda(status, linha = editingLinhaEsteira) {
  if (normalizeLinhaEsteira(linha) === LINHA_ESTEIRA_B2B) {
    const key = resolveStatusKey(status, LINHA_ESTEIRA_B2B);
    return STATUS_SETOR_B2B[key] || null;
  }
  return setorForStatus(status);
}

function isTempoStatusExcludedDemanda(status, linha = editingLinhaEsteira) {
  if (normalizeLinhaEsteira(linha) === LINHA_ESTEIRA_B2B) {
    return isTempoStatusExcludedB2b(status);
  }
  return isTempoStatusExcluded(status);
}

function setorColorFor(setor, cfg = DASH_TEMPO_CFG_OP) {
  return (cfg.setorColors || SETOR_COLORS)[setor] || SETOR_COLORS.Outros;
}

const TEMPO_CHART_IDS = ["chartTempoFase", "chartTempoSetor", "chartTempoSetorStack"];
const TEMPO_RESUMO_SETOR_CHART_ID = "chartTempoSetorResumo";
const TEMPO_CHART_IDS_B2B = ["chartTempoB2bFase", "chartTempoB2bSetor", "chartTempoB2bSetorStack"];
const TEMPO_RESUMO_SETOR_CHART_ID_B2B = "chartTempoB2bSetorResumo";

const DASH_TEMPO_CFG_OP = {
  linhaEsteira: LINHA_ESTEIRA_OPERACIONAL,
  statusOrder: STATUS_ORDER,
  statusLabel: STATUS_LABEL,
  isStatusExcluded: isTempoStatusExcluded,
  setorForStatus,
  normalizeTempoStatus: normalizeTempoStatusOp,
  setores: SETORES_ESTEIRA,
  setorColors: SETOR_COLORS,
  fasesOrder: TEMPO_FASES_ORDER,
  filtroStatusOpcoes: TEMPO_FILTRO_STATUS_OPCOES,
  listFn: demandasEsteiraOperacionalList,
  emptyEsteiraMsg: "Nenhum projeto na esteira operacional.",
  esteiraLabel: "esteira operacional",
  chartIds: TEMPO_CHART_IDS,
  resumoChartId: TEMPO_RESUMO_SETOR_CHART_ID,
  ids: {
    mapBody: "dashTempoSetorMapBody",
    resumoHint: "dashTempoResumoHint",
    resumoTable: "dashTempoSetorResumoTable",
    count: "dashTempoCount",
    chartsWrap: "dashTempoCharts",
    kpis: "dashTempoKpis",
    filterBusca: "filterDashTempoBusca",
    filterResp: "filterDashTempoResp",
    filterStatus: "filterDashTempoStatus",
    filterAno: "filterDashTempoAno",
    filterMes: "filterDashTempoMes",
    chartFase: "chartTempoFase",
    chartSetor: "chartTempoSetor",
    chartStack: "chartTempoSetorStack",
  },
};

const DASH_TEMPO_CFG_B2B = {
  linhaEsteira: LINHA_ESTEIRA_B2B,
  statusOrder: STATUS_ORDER_B2B,
  statusLabel: STATUS_LABEL_B2B,
  isStatusExcluded: isTempoStatusExcludedB2b,
  setorForStatus: setorForStatusTempoB2b,
  normalizeTempoStatus: normalizeTempoStatusB2b,
  setores: SETORES_ESTEIRA_B2B,
  setorColors: SETOR_COLORS_B2B,
  fasesOrder: TEMPO_FASES_ORDER_B2B,
  filtroStatusOpcoes: TEMPO_FILTRO_STATUS_OPCOES_B2B,
  listFn: demandasB2bDashboardList,
  emptyEsteiraMsg: "Nenhum projeto na esteira B2B.",
  esteiraLabel: "esteira B2B",
  chartIds: TEMPO_CHART_IDS_B2B,
  resumoChartId: TEMPO_RESUMO_SETOR_CHART_ID_B2B,
  ids: {
    mapBody: "dashTempoB2bSetorMapBody",
    resumoHint: "dashTempoB2bResumoHint",
    resumoTable: "dashTempoB2bSetorResumoTable",
    count: "dashTempoB2bCount",
    chartsWrap: "dashTempoB2bCharts",
    kpis: "dashTempoB2bKpis",
    filterBusca: "filterDashTempoB2bBusca",
    filterResp: "filterDashTempoB2bResp",
    filterStatus: "filterDashTempoB2bStatus",
    filterAno: "filterDashTempoB2bAno",
    filterMes: "filterDashTempoB2bMes",
    chartFase: "chartTempoB2bFase",
    chartSetor: "chartTempoB2bSetor",
    chartStack: "chartTempoB2bSetorStack",
  },
};

function setorBadgeHtml(setor) {
  if (!setor) return "";
  const cls =
    setor === "Projetos"
      ? "dash-setor--projetos"
      : setor === "Operação"
        ? "dash-setor--operacao"
        : setor === "Diretoria"
          ? "dash-setor--diretoria"
          : setor === "CD"
            ? "dash-setor--cd"
            : setor === "Engenharia"
              ? "dash-setor--engenharia"
              : setor === "IP e Serviços"
                ? "dash-setor--ip-servicos"
                : setor === "Transmissão e Infra"
                  ? "dash-setor--transmissao-infra"
                  : setor === "Comercial"
                    ? "dash-setor--comercial"
                    : setor === "Engenharia/Noc"
                      ? "dash-setor--eng-noc"
                      : setor === "Terceirizada"
                        ? "dash-setor--terceirizada"
                        : "dash-setor--outros";
  return `<span class="dash-setor ${cls}">${escapeHtml(setor)}</span>`;
}

/** Contadores de atenção de uma coluna (atrasados, vencendo, parados). */
function columnIndicadores(list = []) {
  const ind = { atrasados: 0, vencendo: 0, parados: 0 };
  for (const d of list) {
    if (isAtrasoAtivo(d)) ind.atrasados++;
    else if (demandaPrazoProximo(d)) ind.vencendo++;
    if (demandaParadaNaColuna(d)) ind.parados++;
  }
  return ind;
}

function columnHeadHtml(status, linha, count, list = null) {
  const title = escapeHtml(labelStatus(status, linha));
  const setor = setorForStatusDemanda(status, linha);
  const setorHtml = setor ? `<span class="column__setor">${setorBadgeHtml(setor)}</span>` : "";
  let indHtml = "";
  if (list && list.length) {
    const ind = columnIndicadores(list);
    indHtml =
      (ind.atrasados ? `<span class="column__ind column__ind--bad" title="${ind.atrasados} atrasado(s)">${ind.atrasados} atrasado${ind.atrasados > 1 ? "s" : ""}</span>` : "") +
      (ind.vencendo ? `<span class="column__ind column__ind--warn" title="${ind.vencendo} vence(m) em até 3 dias">${ind.vencendo} vencendo</span>` : "") +
      (ind.parados ? `<span class="column__ind column__ind--coluna" title="${ind.parados} parado(s) há ${ALERTA_DIAS_MESMA_COLUNA}+ dias nesta coluna">${ind.parados} parado${ind.parados > 1 ? "s" : ""}</span>` : "");
  }
  return (
    `<div class="column__head">` +
    `<div class="column__head-top"><div class="column__title" title="${title}">${title}</div>` +
    `<span class="column__count${count ? "" : " is-zero"}" title="${count} projeto(s)">${count}</span></div>` +
    `<div class="column__head-meta">${setorHtml}${indHtml ? `<span class="column__inds">${indHtml}</span>` : ""}</div>` +
    `</div>`
  );
}

function columnVazioHtml() {
  const filtrado = esteiraFiltrosAtivosCount() > 0;
  return (
    `<div class="column__vazio">` +
    `<span>${filtrado ? "Nenhum projeto com estes filtros" : "Nenhum projeto"}</span>` +
    (isReadOnlyUser() ? "" : `<small>Arraste um card para cá</small>`) +
    `</div>`
  );
}

function sortProjetistasNomes(list) {
  return [...list].sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
}

/** Esteira operacional — ordem alfabética (pt-BR). Usado em filtros/dashboard da linha. */
const PROJETISTAS = sortProjetistasNomes(["Vinicius", "Matheus", "João", "Daniel"]);
const PROJETISTA_PADRAO = "Vinicius";
/** Esteira B2B. */
const PROJETISTAS_B2B = sortProjetistasNomes(["Alberto", "Rafael"]);
const PROJETISTA_PADRAO_B2B = "Alberto";

function emailLocalNameParts(email) {
  const local = String(email || "").split("@")[0] || "";
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => {
      const slug = projetistaSlug(part);
      if (slug === "joao") return "João";
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    });
}

/**
 * Cache das listas de projetistas derivadas dos papéis. Recalcula só quando os papéis mudam
 * (DemandasRoles.getVersion) — antes era refeito a cada normalizeResponsavel, milhares de vezes por tela.
 */
const projetistasCache = { version: -1, rows: new Map(), todos: null, normalizados: new Map() };

function projetistasCacheAtual() {
  const v = typeof DemandasRoles !== "undefined" && DemandasRoles.getVersion ? DemandasRoles.getVersion() : 0;
  if (projetistasCache.version !== v) {
    projetistasCache.version = v;
    projetistasCache.rows.clear();
    projetistasCache.todos = null;
    projetistasCache.normalizados.clear();
  }
  return projetistasCache;
}

/** Nomes exibíveis a partir dos e-mails com papel projetista/admin (homônimos → nome completo). */
function projetistaEmailRowsFromRoles({ includeDisabled = false } = {}) {
  const cache = projetistasCacheAtual();
  const chave = includeDisabled ? "todos" : "ativos";
  if (!cache.rows.has(chave)) cache.rows.set(chave, calcProjetistaEmailRows(includeDisabled));
  return cache.rows.get(chave);
}

function calcProjetistaEmailRows(includeDisabled) {
  const map =
    typeof DemandasRoles !== "undefined"
      ? DemandasRoles.getRolesMap()
      : { ...(window.DEMANDAS_ROLES_SEED || {}) };
  const roleOf = (r) =>
    typeof DemandasRoles !== "undefined"
      ? DemandasRoles.normalizeRole(r)
      : String(r || "")
          .trim()
          .toLowerCase();
  const emails = Object.keys(map)
    .filter((e) => {
      if (!includeDisabled && typeof DemandasRoles !== "undefined" && DemandasRoles.isDisabled?.(e)) {
        return false;
      }
      const r = roleOf(map[e]);
      return r === "projetista" || r === "admin";
    })
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
  const firstCounts = Object.create(null);
  return emails.map((email) => {
    const parts = emailLocalNameParts(email);
    const first = parts[0] || email;
    firstCounts[first] = (firstCounts[first] || 0) + 1;
    return { email, parts, first, firstCounts };
  }).map((row) => ({
    email: row.email,
    parts: row.parts,
    first: row.first,
    label: firstCounts[row.first] > 1 ? row.parts.join(" ") : row.first,
  }));
}

function projetistaLabelsFromRoles() {
  return sortProjetistasNomes(projetistaEmailRowsFromRoles().map((r) => r.label));
}

function projetistaLabelForEmail(email) {
  const e = String(email || "")
    .trim()
    .toLowerCase();
  if (!e) return "";
  const row = projetistaEmailRowsFromRoles({ includeDisabled: true }).find((r) => r.email === e);
  if (row) return row.label;
  const parts = emailLocalNameParts(e);
  return parts.length > 1 ? parts.join(" ") : parts[0] || "";
}

function demandasAssignedToEmail(email) {
  const label = projetistaLabelForEmail(email);
  if (!label) return [];
  return (state.demandas || []).filter((d) => demandaTemProjetista(d, label));
}

function allProjetistasNomes() {
  const cache = projetistasCacheAtual();
  if (!cache.todos) {
    cache.todos = Object.freeze(
      sortProjetistasNomes([...new Set([...projetistaLabelsFromRoles(), ...PROJETISTAS, ...PROJETISTAS_B2B])]),
    );
  }
  return cache.todos;
}

function projetistasForLinha(linha = activeEsteiraCanal) {
  return linha === LINHA_ESTEIRA_B2B ? PROJETISTAS_B2B : PROJETISTAS;
}
/** Valor do select: visão geral sem filtrar por projetista. */
const FILTER_PROJETISTA_TODOS = "__all__";

function projetistaSlug(nome) {
  return String(nome || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function matchFilterProjetista(d, resp) {
  if (!resp || resp === FILTER_PROJETISTA_TODOS) return true;
  if (resp === "__none__") return !normalizeResponsavel(d.responsavel);
  return demandaTemProjetista(d, resp);
}
const TIPOS_DEMANDA = ["B2C", "B2B", "SWAP", "Backbone", "Licenciamento", "Mapeamento", "Migração"];

/** Tipos no filtro da Esteira Projetos (sem B2B — fluxo na aba Esteira B2B). */
function tiposFiltroEsteiraProjetos() {
  return TIPOS_DEMANDA.filter((t) => t !== "B2B");
}
const TIPO_DIARIA_LEGADO = "Diária";

/** Produtos da linha B2B (ordem alfabética pt-BR). */
const PRODUTOS_B2B = sortProjetistasNomes([
  "Evento IP",
  "IP Dedicado",
  "IP Trânsito",
  "Lan to Lan",
  "Projeto Especial",
  "Transporte PTT",
  "Wireless",
]);

function normalizeProdutoB2b(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  return PRODUTOS_B2B.includes(s) ? s : "";
}

/** Setor e solicitantes comerciais B2B (ordem alfabética pt-BR). */
const SETORES_SOLICITANTE_B2B = ["Comercial"];
const SOLICITANTES_B2B_COMERCIAL = sortProjetistasNomes([
  "Christopher Kurt",
  "Igor Barreto",
  "Igor Raposo",
  "Lorrany Rodrigues",
  "Michel Dias",
  "Pedro Cardoso",
  "Thiago Miranda",
]);
const SOLICITANTE_B2B_SEM = "Sem solicitante";
const SOLICITANTE_B2B_OUTROS = "Outros";

function normalizeSetorSolicitanteB2b(v) {
  const s = String(v || "").trim();
  if (!s) return SETORES_SOLICITANTE_B2B[0];
  return SETORES_SOLICITANTE_B2B.includes(s) ? s : SETORES_SOLICITANTE_B2B[0];
}

function normalizeSolicitanteB2b(v) {
  const s = String(v || "").trim();
  if (!s) return SOLICITANTE_B2B_SEM;
  const match = SOLICITANTES_B2B_COMERCIAL.find((n) => n.toLowerCase() === s.toLowerCase());
  return match || SOLICITANTE_B2B_OUTROS;
}

function solicitanteB2bBucket(d) {
  return normalizeSolicitanteB2b(migrateDemanda(d).solicitante);
}

/** Nome do solicitante comercial cadastrado na demanda, ou null. */
function resolveSolicitanteB2bComercial(d) {
  const sol = String(migrateDemanda(d).solicitante || "").trim();
  if (!sol) return null;
  return SOLICITANTES_B2B_COMERCIAL.find((n) => n.toLowerCase() === sol.toLowerCase()) || null;
}

/** Segmento da linha B2C (ordem alfabética pt-BR). */
const SEGMENTOS_B2C = sortProjetistasNomes(["MDU", "TCR", "TCT"]);

function normalizeSegmentoB2c(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  return SEGMENTOS_B2C.includes(s) ? s : "";
}

/** Regionais e cidades (ordem alfabética por regional e por cidade). */
const REGIONAIS_CIDADES = {
  "Regional Centro Oeste": [
    "Belo Horizonte - BHE",
    "Betim - BET",
    "Carmo do Cajuru - CCU",
    "Contagem - CEM",
    "Divinópolis - DVL",
    "Igarapé - IRP",
    "Itaúna - IAN",
    "Juatuba - JUAU",
    "Mateus Leme - MAL",
    "Pará de Minas - PRS",
    "Santo Antônio dos Campos - SADC",
    "São Sebastião do Oeste - SWO",
  ],
  "Regional Norte de Minas": ["Montes Claros - MCL", "Paracatu - PTU", "Unaí - UNI"],
  "Regional São Paulo": [
    "Campos do Jordão - CPJ",
    "Guaratinguetá - GTA",
    "Lorena - LNA",
    "Pindamonhangaba - PBA",
    "São José dos Campos - SJC",
    "Taubaté - TTE",
    "Tremembé - TMB",
  ],
  "Regional Sul de Minas": [
    "Itajubá - IJA",
    "Lavras - LAV",
    "Passos - PSO",
    "Piranguinho - PGH",
    "Piranguçu - PYU",
    "Poços de Caldas - PCS",
    "Pouso Alegre - PSA",
    "Santa Rita do Sapucaí - SRS",
    "São José do Alegre - SLK",
    "Três Corações - TCS",
    "Varginha - VGA",
  ],
};

const REGIONAIS_ORDER = Object.keys(REGIONAIS_CIDADES).sort((a, b) => a.localeCompare(b, "pt-BR"));

function regionalSelectLabel(reg) {
  const s = String(reg || "").trim();
  return s.replace(/^Regional\s+/i, "").trim() || s;
}

const REGIONAL_CHART_COLORS = {
  "Regional Centro Oeste": "#f59e0b",
  "Regional Norte de Minas": "#22c55e",
  "Regional São Paulo": "#a855f7",
  "Regional Sul de Minas": "#06b6d4",
  "Não informada": "#94a3b8",
};

const GEO_CHART_PALETTE = [
  "#6366f1",
  "#22c55e",
  "#06b6d4",
  "#f59e0b",
  "#a855f7",
  "#ef4444",
  "#14b8a6",
  "#eab308",
  "#ec4899",
  "#0ea5e9",
  "#84cc16",
  "#f97316",
  "#8b5cf6",
  "#10b981",
  "#3b82f6",
  "#d946ef",
  "#f43f5e",
  "#65a30d",
  "#0284c7",
  "#c026d3",
];

function colorForGeoNome(nome) {
  const key = String(nome || "").trim();
  if (REGIONAL_CHART_COLORS[key]) return REGIONAL_CHART_COLORS[key];
  const idx = TODAS_CIDADES_LISTA.findIndex((c) => c.toLowerCase() === key.toLowerCase());
  if (idx >= 0) return GEO_CHART_PALETTE[idx % GEO_CHART_PALETTE.length];
  const pjIdx = allProjetistasNomes().findIndex((n) => projetistaSlug(n) === projetistaSlug(key));
  if (pjIdx >= 0) return GEO_CHART_PALETTE[pjIdx % GEO_CHART_PALETTE.length];
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return GEO_CHART_PALETTE[hash % GEO_CHART_PALETTE.length];
}

function colorsForGeoNomes(nomes) {
  const map = new Map();
  const taken = new Set();
  for (const nome of nomes) {
    if (map.has(nome)) continue;
    let color = colorForGeoNome(nome);
    if (taken.has(color)) {
      color = GEO_CHART_PALETTE.find((c) => !taken.has(c)) || color;
    }
    taken.add(color);
    map.set(nome, color);
  }
  return nomes.map((n) => map.get(n));
}

const TODAS_CIDADES_LISTA = REGIONAIS_ORDER.flatMap((reg) => REGIONAIS_CIDADES[reg]);

function findRegionalForCidade(cidade) {
  const t = String(cidade || "").trim();
  if (!t) return "";
  for (const reg of REGIONAIS_ORDER) {
    const hit = REGIONAIS_CIDADES[reg].find((c) => c.toLowerCase() === t.toLowerCase());
    if (hit) return reg;
  }
  return "";
}

function normalizeCidadeCadastro(cidade) {
  const t = String(cidade || "").trim();
  if (!t) return "";
  const hit = TODAS_CIDADES_LISTA.find((c) => c.toLowerCase() === t.toLowerCase());
  return hit || t;
}

function normalizeCidadesExtra(list, cidadePrincipal) {
  const main = normalizeCidadeCadastro(cidadePrincipal).toLowerCase();
  const raw = Array.isArray(list)
    ? list
    : typeof list === "string" && list.trim()
      ? list.split(/[;,]/)
      : [];
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const c = normalizeCidadeCadastro(item);
    if (!c) continue;
    const key = c.toLowerCase();
    if (main && key === main) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

function sameCidadesExtra(a, b, cidadePrincipal) {
  const x = normalizeCidadesExtra(a, cidadePrincipal);
  const y = normalizeCidadesExtra(b, cidadePrincipal);
  if (x.length !== y.length) return false;
  const set = new Set(x.map((c) => c.toLowerCase()));
  return y.every((c) => set.has(c.toLowerCase()));
}

function demandaCidadesList(d) {
  const main = normalizeCidadeCadastro(d?.cidade);
  const extras = normalizeCidadesExtra(d?.cidadesExtra, main);
  return main ? [main, ...extras] : extras;
}

function demandaCidadesLabels(d) {
  const list = demandaCidadesList(d);
  return list.length ? list.map(labelCidade) : [labelCidade("")];
}

function demandaRegionaisLabels(d) {
  const seen = new Set();
  const out = [];
  for (const c of demandaCidadesList(d)) {
    const reg = findRegionalForCidade(c) || "Não informada";
    if (seen.has(reg)) continue;
    seen.add(reg);
    out.push(reg);
  }
  return out.length ? out : ["Não informada"];
}

function demandaTemCidade(d, cidadeLabel) {
  const alvo = labelCidade(cidadeLabel);
  return demandaCidadesLabels(d).includes(alvo);
}

function demandaTemRegional(d, regional) {
  return demandaRegionaisLabels(d).includes(regional);
}

function resolveGeoKeys(d, keyFn) {
  if (typeof keyFn !== "function") return [];
  const raw = keyFn(d);
  if (Array.isArray(raw)) return raw.filter((k) => k != null && String(k) !== "");
  if (raw == null || raw === "") return [];
  return [raw];
}

function formatCidadesDemanda(d) {
  return demandaCidadesLabels(d).join(" · ");
}

let editingCidadesExtra = [];
let editingProjetistasExtra = [];

function fillDemRegionalSelect() {
  const sel = document.getElementById("demRegional");
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">Selecione a regional…</option>';
  for (const reg of REGIONAIS_ORDER) {
    const o = document.createElement("option");
    o.value = reg;
    o.textContent = regionalSelectLabel(reg);
    sel.appendChild(o);
  }
  if (cur && [...sel.options].some((o) => o.value === cur)) sel.value = cur;
}

function fillDemCidadeSelect(regional, selectedCidade = "") {
  const sel = document.getElementById("demCidade");
  if (!sel) return;
  const norm = normalizeCidadeCadastro(selectedCidade);
  const reg = regional || findRegionalForCidade(norm);
  sel.innerHTML = "";
  if (!reg || !REGIONAIS_CIDADES[reg]) {
    const legacyOnly = norm && !findRegionalForCidade(norm);
    if (legacyOnly) {
      sel.disabled = false;
      const oHint = document.createElement("option");
      oHint.value = "";
      oHint.textContent = "Selecione a regional para atualizar…";
      sel.appendChild(oHint);
      const oLeg = document.createElement("option");
      oLeg.value = norm;
      oLeg.textContent = `${norm} (cadastro antigo)`;
      oLeg.selected = true;
      sel.appendChild(oLeg);
      return;
    }
    sel.disabled = true;
    const o = document.createElement("option");
    o.value = "";
    o.textContent = "Selecione a regional primeiro…";
    sel.appendChild(o);
    return;
  }
  sel.disabled = false;
  const o0 = document.createElement("option");
  o0.value = "";
  o0.textContent = "Selecione a cidade…";
  sel.appendChild(o0);
  const cities = [...REGIONAIS_CIDADES[reg]];
  let legacy = norm;
  if (legacy && !cities.some((c) => c.toLowerCase() === legacy.toLowerCase())) {
    const oLeg = document.createElement("option");
    oLeg.value = legacy;
    oLeg.textContent = `${legacy} (cadastro antigo)`;
    sel.appendChild(oLeg);
  }
  for (const c of cities) {
    const o = document.createElement("option");
    o.value = c;
    o.textContent = c;
    sel.appendChild(o);
  }
  if (norm) {
    const match = [...sel.options].find((o) => o.value && o.value.toLowerCase() === norm.toLowerCase());
    sel.value = match ? match.value : legacy && [...sel.options].some((o) => o.value === legacy) ? legacy : "";
  } else {
    sel.value = "";
  }
}

function setDemCidadeUi(cidade) {
  const norm = normalizeCidadeCadastro(cidade);
  const reg = findRegionalForCidade(norm);
  const selReg = document.getElementById("demRegional");
  if (selReg) selReg.value = reg || "";
  fillDemCidadeSelect(reg || selReg?.value || "", norm || cidade);
}

function readCidadeFromForm() {
  return normalizeCidadeCadastro(document.getElementById("demCidade")?.value || "");
}

function readCidadesExtraFromForm() {
  return normalizeCidadesExtra(editingCidadesExtra, readCidadeFromForm());
}

function fillDemExtraRegionalSelect() {
  const sel = document.getElementById("demExtraRegional");
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">Regional…</option>';
  for (const reg of REGIONAIS_ORDER) {
    const o = document.createElement("option");
    o.value = reg;
    o.textContent = regionalSelectLabel(reg);
    sel.appendChild(o);
  }
  if (cur && [...sel.options].some((o) => o.value === cur)) sel.value = cur;
}

function fillDemExtraCidadeSelect(regional, selectedCidade = "") {
  const sel = document.getElementById("demExtraCidade");
  if (!sel) return;
  const principal = readCidadeFromForm().toLowerCase();
  const taken = new Set(normalizeCidadesExtra(editingCidadesExtra, readCidadeFromForm()).map((c) => c.toLowerCase()));
  sel.innerHTML = "";
  if (!regional || !REGIONAIS_CIDADES[regional]) {
    sel.disabled = true;
    const o = document.createElement("option");
    o.value = "";
    o.textContent = "Selecione a regional…";
    sel.appendChild(o);
    return;
  }
  sel.disabled = false;
  const o0 = document.createElement("option");
  o0.value = "";
  o0.textContent = "Cidade extra…";
  sel.appendChild(o0);
  for (const c of REGIONAIS_CIDADES[regional]) {
    if (c.toLowerCase() === principal || taken.has(c.toLowerCase())) continue;
    const o = document.createElement("option");
    o.value = c;
    o.textContent = c;
    sel.appendChild(o);
  }
  const norm = normalizeCidadeCadastro(selectedCidade);
  if (norm && [...sel.options].some((o) => o.value === norm)) sel.value = norm;
}

function renderCidadesExtraList() {
  const host = document.getElementById("demCidadesExtraList");
  if (!host) return;
  editingCidadesExtra = normalizeCidadesExtra(editingCidadesExtra, readCidadeFromForm());
  if (!editingCidadesExtra.length) {
    host.innerHTML = "";
  } else {
    host.innerHTML = editingCidadesExtra
      .map((cidade, i) => {
        const reg = findRegionalForCidade(cidade);
        const tag = reg ? `${cidade} · ${reg}` : cidade;
        return (
          `<span class="cidade-extra-chip" data-idx="${i}">` +
          `<span>${escapeHtml(tag)}</span>` +
          `<button type="button" class="cidade-extra-chip__rm" data-remove-extra="${i}" aria-label="Remover ${escapeHtml(cidade)}">×</button>` +
          `</span>`
        );
      })
      .join("");
    host.querySelectorAll("[data-remove-extra]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const i = Number(btn.getAttribute("data-remove-extra"));
        if (!Number.isInteger(i)) return;
        editingCidadesExtra = editingCidadesExtra.filter((_, idx) => idx !== i);
        renderCidadesExtraList();
      });
    });
  }
  fillDemExtraCidadeSelect(document.getElementById("demExtraRegional")?.value || "");
}

function addCidadeExtraFromPicker() {
  const cidade = normalizeCidadeCadastro(document.getElementById("demExtraCidade")?.value || "");
  if (!cidade) {
    toast("Selecione a cidade extra");
    return;
  }
  editingCidadesExtra = normalizeCidadesExtra([...editingCidadesExtra, cidade], readCidadeFromForm());
  const selCid = document.getElementById("demExtraCidade");
  if (selCid) selCid.value = "";
  renderCidadesExtraList();
}

function initDemCidadeSelects() {
  fillDemRegionalSelect();
  fillDemCidadeSelect("");
  fillDemExtraRegionalSelect();
  fillDemExtraCidadeSelect("");
  document.getElementById("demRegional")?.addEventListener("change", () => {
    const reg = document.getElementById("demRegional")?.value || "";
    fillDemCidadeSelect(reg, "");
    renderCidadesExtraList();
  });
  document.getElementById("demCidade")?.addEventListener("change", () => {
    renderCidadesExtraList();
  });
  document.getElementById("demExtraRegional")?.addEventListener("change", () => {
    fillDemExtraCidadeSelect(document.getElementById("demExtraRegional")?.value || "");
  });
  document.getElementById("btnAddCidadeExtra")?.addEventListener("click", addCidadeExtraFromPicker);
}

function cidadesLegadasNoSistema() {
  const set = new Set();
  for (const d of state.demandas || []) {
    for (const c of demandaCidadesList(d)) {
      if (!TODAS_CIDADES_LISTA.some((x) => x.toLowerCase() === c.toLowerCase())) set.add(c);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function fillFilterRegionalSelect() {
  const sel = document.getElementById("filterRegional");
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">Todas</option>';
  for (const reg of REGIONAIS_ORDER) {
    const o = document.createElement("option");
    o.value = reg;
    o.textContent = reg;
    sel.appendChild(o);
  }
  if (cur && [...sel.options].some((o) => o.value === cur)) sel.value = cur;
}

function fillFilterCidadeSelect(regional = "") {
  const sel = document.getElementById("filterCidade");
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">Todas</option>';
  const cities = regional
    ? [...(REGIONAIS_CIDADES[regional] || [])]
    : [...TODAS_CIDADES_LISTA];
  const legacies = cidadesLegadasNoSistema();
  for (const c of cities) {
    const o = document.createElement("option");
    o.value = c;
    o.textContent = c;
    sel.appendChild(o);
  }
  if (!regional && legacies.length) {
    const og = document.createElement("optgroup");
    og.label = "Outras (cadastro antigo)";
    for (const c of legacies) {
      const o = document.createElement("option");
      o.value = c;
      o.textContent = c;
      og.appendChild(o);
    }
    sel.appendChild(og);
  }
  if (cur && [...sel.options].some((o) => o.value === cur)) sel.value = cur;
  else if (cur && legacies.includes(cur)) sel.value = cur;
}

function fillFilterProjetistaSelect(linha = activeEsteiraCanal) {
  const sel = document.getElementById("filterProjetista");
  if (!sel) return;
  const cur = sel.value;
  const lista = sortProjetistasNomes([
    ...new Set([...projetistasForLinha(linha), ...projetistaLabelsFromRoles()]),
  ]);
  sel.innerHTML =
    '<option value="">Todos</option>' +
    '<option value="__none__">Não atribuído</option>' +
    lista.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("");
  if (cur && [...sel.options].some((o) => o.value === cur)) sel.value = cur;
  else if (cur && cur !== "__none__") sel.value = "";
}

function fillDemResponsavelSelect(_linha = editingLinhaEsteira) {
  const lista = projetistaLabelsFromRoles();
  const cur = document.getElementById("demResponsavel")?.value || "";
  fillSelectOptions(document.getElementById("demResponsavel"), [
    { value: "", label: "Não atribuído" },
    ...lista.map((n) => ({ value: n, label: n })),
  ]);
  const sel = document.getElementById("demResponsavel");
  if (sel && cur && [...sel.options].some((o) => o.value === cur)) sel.value = cur;
  fillDemExtraProjetistaSelect();
}

function readProjetistasExtraFromForm() {
  return normalizeProjetistasExtra(editingProjetistasExtra, document.getElementById("demResponsavel")?.value || "");
}

function fillDemExtraProjetistaSelect() {
  const sel = document.getElementById("demExtraProjetista");
  if (!sel) return;
  const principal = normalizeResponsavel(document.getElementById("demResponsavel")?.value || "");
  const taken = new Set(readProjetistasExtraFromForm().map((n) => projetistaSlug(n)));
  const lista = projetistaLabelsFromRoles().filter((n) => {
    const key = projetistaSlug(n);
    if (principal && key === projetistaSlug(principal)) return false;
    return !taken.has(key);
  });
  fillSelectOptions(sel, [
    { value: "", label: "Projetista extra…" },
    ...lista.map((n) => ({ value: n, label: n })),
  ]);
}

function renderProjetistasExtraList() {
  const host = document.getElementById("demProjetistasExtraList");
  if (!host) return;
  editingProjetistasExtra = readProjetistasExtraFromForm();
  if (!editingProjetistasExtra.length) {
    host.innerHTML = "";
  } else {
    host.innerHTML = editingProjetistasExtra
      .map((nome, i) => (
        `<span class="cidade-extra-chip" data-idx="${i}">` +
        `<span>${escapeHtml(nome)}</span>` +
        `<button type="button" class="cidade-extra-chip__rm" data-remove-pj-extra="${i}" aria-label="Remover ${escapeHtml(nome)}">×</button>` +
        `</span>`
      ))
      .join("");
    host.querySelectorAll("[data-remove-pj-extra]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const i = Number(btn.getAttribute("data-remove-pj-extra"));
        if (!Number.isInteger(i)) return;
        editingProjetistasExtra = editingProjetistasExtra.filter((_, idx) => idx !== i);
        renderProjetistasExtraList();
      });
    });
  }
  fillDemExtraProjetistaSelect();
}

function addProjetistaExtraFromPicker() {
  const nome = normalizeResponsavel(document.getElementById("demExtraProjetista")?.value || "");
  if (!nome) {
    toast("Selecione o projetista extra");
    return;
  }
  editingProjetistasExtra = normalizeProjetistasExtra(
    [...editingProjetistasExtra, nome],
    document.getElementById("demResponsavel")?.value || "",
  );
  renderProjetistasExtraList();
}

function initDemProjetistasExtra() {
  fillDemExtraProjetistaSelect();
  document.getElementById("demResponsavel")?.addEventListener("change", () => {
    renderProjetistasExtraList();
  });
  document.getElementById("btnAddProjetistaExtra")?.addEventListener("click", addProjetistaExtraFromPicker);
}

function fillFilterDashProjetistaResumo() {
  const sel = document.getElementById("filterDashProjetistaResumo");
  if (!sel) return;
  const cur = sel.value;
  const lista = allProjetistasNomes();
  fillSelectOptions(sel, [
    { value: FILTER_PROJETISTA_TODOS, label: "Todos os projetistas" },
    ...lista.map((n) => ({ value: n, label: n })),
  ]);
  if (cur && [...sel.options].some((o) => o.value === cur)) sel.value = cur;
  else sel.value = FILTER_PROJETISTA_TODOS;
}

function refreshProjetistaAssignmentLists() {
  fillDemResponsavelSelect();
  fillFilterProjetistaSelect(activeEsteiraCanal);
  fillFilterDashProjetistaResumo();
  fillDashProjetistaFilterSelects();
}

function fillFilterTipoSelect() {
  const sel = document.getElementById("filterTipo");
  if (!sel) return;
  const cur = sel.value;
  const tipos = tiposFiltroEsteiraProjetos();
  sel.innerHTML = '<option value="">Todos</option>';
  for (const t of tipos) {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    sel.appendChild(opt);
  }
  if (cur && tipos.includes(cur)) sel.value = cur;
  else sel.value = "";
}

function fillFilterProdutoSelect() {
  const sel = document.getElementById("filterTipo");
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">Todos</option>';
  for (const p of PRODUTOS_B2B) {
    const opt = document.createElement("option");
    opt.value = p;
    opt.textContent = p;
    sel.appendChild(opt);
  }
  if (cur && PRODUTOS_B2B.includes(cur)) sel.value = cur;
  else sel.value = "";
}

/** Esteira Projetos: filtro Tipo; Esteira B2B: filtro Produto (mesmo select). */
function syncEsteiraFiltroTipoProduto(linha = activeEsteiraCanal) {
  const label = document.getElementById("filterTipoLabel");
  if (label) label.textContent = linha === LINHA_ESTEIRA_B2B ? "Produto" : "Tipo";
  if (linha === LINHA_ESTEIRA_B2B) fillFilterProdutoSelect();
  else fillFilterTipoSelect();
}

function initEsteiraFilters() {
  fillFilterProjetistaSelect();
  syncEsteiraFiltroTipoProduto();
  fillFilterRegionalSelect();
  fillFilterCidadeSelect(document.getElementById("filterRegional")?.value || "");
  esteiraModoColunas = readEsteiraModoColunas();
  updateEsteiraModoHints();
  document.getElementById("filterEsteiraModo")?.addEventListener("change", () => {
    esteiraModoColunas = readEsteiraModoColunas();
    updateEsteiraModoHints();
    renderBoard();
  });
  document.getElementById("filterRegional")?.addEventListener("change", () => {
    const reg = document.getElementById("filterRegional")?.value || "";
    fillFilterCidadeSelect(reg);
    renderBoard();
  });
  ["filterProjetista", "filterTipo", "filterCidade"].forEach((id) => {
    document.getElementById(id)?.addEventListener("change", renderBoard);
  });
  const inpBusca = document.getElementById("filterBusca");
  if (inpBusca) {
    let buscaTimer = null;
    const trigger = () => {
      if (buscaTimer) clearTimeout(buscaTimer);
      buscaTimer = setTimeout(() => {
        buscaTimer = null;
        renderBoard();
      }, 180);
    };
    inpBusca.addEventListener("input", trigger);
    inpBusca.addEventListener("search", trigger);
    inpBusca.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && inpBusca.value) {
        e.preventDefault();
        inpBusca.value = "";
        renderBoard();
      }
    });
  }
  document.getElementById("esteiraModoSeg")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-modo]");
    const sel = document.getElementById("filterEsteiraModo");
    if (!btn || !sel || sel.value === btn.dataset.modo) return;
    sel.value = btn.dataset.modo;
    sel.dispatchEvent(new Event("change"));
  });
  document.getElementById("btnLimparFiltros")?.addEventListener("click", limparFiltrosEsteira);
  document.getElementById("esteiraStatusLine")?.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-rapido]");
    if (!chip) return;
    esteiraFiltroRapido = esteiraFiltroRapido === chip.dataset.rapido ? "" : chip.dataset.rapido;
    renderBoard();
  });
  // "/" foca a busca (fora de campos e modais).
  document.addEventListener("keydown", (e) => {
    if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
    const alvo = e.target;
    if (alvo instanceof Element && alvo.closest("input, textarea, select, [contenteditable='true']")) return;
    if (document.querySelector("dialog[open]")) return;
    const panel = document.getElementById("panelEsteira");
    if (!inpBusca || !panel?.classList.contains("is-visible")) return;
    e.preventDefault();
    inpBusca.focus();
    inpBusca.select();
  });
}

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
  const dias = diasNaColunaAtual(d);
  return dias != null && dias >= ALERTA_DIAS_MESMA_COLUNA;
}

const ESTEIRA_FILTROS_RAPIDOS = {
  atrasados: { label: "atrasado(s)", tom: "bad", test: (d) => isAtrasoAtivo(d) },
  vencendo: { label: "vence(m) em até 3 dias", tom: "warn", test: demandaPrazoProximo },
  sem_projetista: { label: "sem projetista", tom: "bad", test: (d) => !normalizeResponsavel(d.responsavel) },
  parados: {
    get label() {
      return `parado(s) há ${ALERTA_DIAS_MESMA_COLUNA}+ dias na coluna`;
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

function mergeLoadedState(data) {
  if (!data || typeof data !== "object") return defaultState();
  return {
    ...defaultState(),
    ...data,
    projetistas: { ...defaultState().projetistas, ...(data.projetistas || {}) },
    pendingDeleteDemandaIds: Array.isArray(data.pendingDeleteDemandaIds)
      ? [...data.pendingDeleteDemandaIds]
      : [],
    deletedDemandaIds: Array.isArray(data.deletedDemandaIds) ? [...data.deletedDemandaIds] : [],
    deletedDiariaIds: Array.isArray(data.deletedDiariaIds) ? [...data.deletedDiariaIds] : [],
  };
}

function demandaDeleteTombstones() {
  return new Set([...(state.pendingDeleteDemandaIds || []), ...(state.deletedDemandaIds || [])]);
}

function diariaDeleteTombstones() {
  return new Set(state.deletedDiariaIds || []);
}

function applyLoadedState(data) {
  state = mergeLoadedState(data);
  const tombstones = demandaDeleteTombstones();
  const diariaTombstones = diariaDeleteTombstones();
  state.demandas = (state.demandas || []).filter((d) => !tombstones.has(d.id)).map(migrateDemanda);
  state.diarias = (state.diarias || [])
    .filter((d) => !diariaTombstones.has(d.id))
    .map(normalizeDiaria);
}

function markDemandaPendingDelete(id) {
  if (!id) return;
  if (!Array.isArray(state.pendingDeleteDemandaIds)) state.pendingDeleteDemandaIds = [];
  if (!state.pendingDeleteDemandaIds.includes(id)) state.pendingDeleteDemandaIds.push(id);
  if (!Array.isArray(state.deletedDemandaIds)) state.deletedDemandaIds = [];
  if (!state.deletedDemandaIds.includes(id)) state.deletedDemandaIds.push(id);
  state.demandas = state.demandas.filter((x) => x.id !== id);
}

function applyCloudPatch(patch) {
  if (!persistenceReady || !persistenceApi) {
    pendingCloudPatch = { ...(pendingCloudPatch || {}), ...patch };
    return;
  }
  if (patch.deleteDemandaId && persistenceApi.deleteDemanda) {
    const deleteId = patch.deleteDemandaId;
    void persistenceApi.deleteDemanda(deleteId).catch((e) => {
      console.warn("Excluir demanda na nuvem:", e);
      state.pendingDeleteDemandaIds = (state.pendingDeleteDemandaIds || []).filter((x) => x !== deleteId);
      state.deletedDemandaIds = (state.deletedDemandaIds || []).filter((x) => x !== deleteId);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (_) {}
      toast(e?.message || "Não foi possível excluir a demanda na nuvem");
      refreshAllViews();
    });
  }
  if (patch.demanda && persistenceApi.upsertDemanda) {
    void persistenceApi.upsertDemanda(patch.demanda).catch((e) => {
      console.warn("Salvar demanda na nuvem:", e);
      toast(e?.message || "Não foi possível salvar a demanda na nuvem");
    });
  }
  if (patch.presence?.id && persistenceApi.patchDemandaPresence) {
    void persistenceApi.patchDemandaPresence(patch.presence.id, patch.presence.editingBy).catch((e) => {
      console.warn("Presença na nuvem:", e);
    });
  }
  if (patch.meta && persistenceApi.persistMeta) {
    void persistenceApi.persistMeta({
      diarias: state.diarias,
      projetistas: state.projetistas,
      deletedDiariaIds: state.deletedDiariaIds || [],
    }).catch((e) => {
      console.warn("Salvar meta na nuvem:", e);
      toast(e?.message || "Não foi possível sincronizar diárias/projetistas na nuvem");
    });
  }
  if (patch.importFull && persistenceApi.importFullState) {
    void persistenceApi.importFullState(state);
  }
}

function saveState(patch = {}) {
  try {
    // Cópia local sem flag interna de migração
    const toSave = {
      ...state,
      demandas: (state.demandas || []).map((d) => {
        if (!d || !d.__isMigrated) return d;
        const { __isMigrated, ...rest } = d;
        return rest;
      }),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch (e) {
    console.warn("Falha ao salvar cópia local:", e);
  }
  applyCloudPatch(patch);
}

function flushPendingCloudSave() {
  if (!pendingCloudPatch || !persistenceApi) return;
  const patch = pendingCloudPatch;
  pendingCloudPatch = null;
  applyCloudPatch(patch);
}

function setSyncStatus(status) {
  const el = document.getElementById("syncBadge");
  if (!el) return;
  const labels = {
    connecting: "Conectando…",
    saving: "Salvando…",
    synced: "Sincronizado (nuvem)",
    error: "Erro — não sincroniza",
    local: "Somente neste navegador",
    waiting: "Carregando dados…",
    empty: "Nenhuma demanda na nuvem",
  };
  if (location.protocol === "file:" && status === "local") {
    window.__demandasSyncHint =
      window.__demandasSyncHint || "Abra " + APP_PUBLIC_URL;
  }
  let text = labels[status] || status;
  if ((status === "local" || status === "error") && window.__demandasSyncHint) {
    text = labels[status] + " — " + window.__demandasSyncHint;
  }
  el.textContent = text;
  el.title = text;
  el.dataset.status = status;
  el.hidden = false;
}

window.setSyncStatus = setSyncStatus;

window.addEventListener("demandas-sync-error", (e) => {
  toast(e.detail?.message || "Erro ao sincronizar com a nuvem");
});

let refreshViewsTimer = null;
let lastDemandasContentFp = "";
let lastDemandasPresenceFp = "";

function demandasContentFingerprint(demandas) {
  return (demandas || [])
    .map((d) =>
      [
        d.id,
        d.updatedAt || "",
        d.status || "",
        d.responsavel || "",
        Array.isArray(d.projetistasExtra) ? d.projetistasExtra.join(",") : "",
        d.ordemEsteira ?? "",
        d.titulo || "",
        d.dataChegada || "",
      ].join("\0"),
    )
    .join("\n");
}

function demandasPresenceFingerprint(demandas) {
  return (demandas || [])
    .map((d) => {
      const eb = d.editingBy || {};
      return [d.id, eb.email || "", eb.since || ""].join("\0");
    })
    .join("\n");
}

function refreshPresenceBadgesOnly() {
  const boardRoots = [
    document.getElementById("boardEsteira"),
    document.getElementById("boardEsteiraB2b"),
  ].filter(Boolean);
  const byId = Object.fromEntries((state.demandas || []).map((d) => [d.id, d]));
  for (const root of boardRoots) {
    root.querySelectorAll(".card[data-id]").forEach((el) => {
      const d = byId[el.dataset.id];
      const eb = d ? normalizeEditingBy(d.editingBy) : null;
      el.classList.toggle("card--being-edited", !!eb);
      const slot = el.querySelector(".card__editing-by");
      if (!eb) {
        if (slot) slot.remove();
        return;
      }
      const html = cardEditingByHtml(d);
      if (!html) {
        if (slot) slot.remove();
        return;
      }
      if (slot) {
        slot.outerHTML = html;
      } else {
        const head = el.querySelector(".card__head") || el;
        head.insertAdjacentHTML("beforeend", html);
      }
    });
  }
  syncDemandaModalAlerts();
}

function refreshAllViews() {
  fillFilterCidadeSelect(document.getElementById("filterRegional")?.value || "");
  if (panels.esteira && !panels.esteira.hidden) renderBoard();
  updateEsteiraStatusLine();
  if (panels.dashboard && !panels.dashboard.hidden) renderDashboard();
  if (usuariosModalAberto()) renderUsuariosPanel();
  applyRoleUi({ light: true });
  syncDemandaModalAlerts();
  syncDemClickupUi();
}

/** Agrupa snapshots do Firestore para não recriar a UI várias vezes seguidas. */
function scheduleRefreshAllViews() {
  if (refreshViewsTimer) return;
  refreshViewsTimer = setTimeout(() => {
    refreshViewsTimer = null;
    refreshAllViews();
  }, 180);
}

function handleRemoteData(data) {
  const incoming = data?.demandas || [];
  const contentFp = demandasContentFingerprint(incoming);
  const presenceFp = demandasPresenceFingerprint(incoming);
  const contentSame = contentFp === lastDemandasContentFp && state.demandas?.length > 0;
  const presenceSame = presenceFp === lastDemandasPresenceFp;

  if (contentSame && presenceSame) return;

  // Só presença mudou: atualiza badges sem remigrar/remontar a esteira.
  if (contentSame && !presenceSame) {
    const byId = Object.fromEntries(incoming.map((d) => [d.id, d]));
    for (const d of state.demandas || []) {
      const rem = byId[d.id];
      if (!rem) continue;
      const eb = normalizeEditingBy(rem.editingBy);
      if (eb) d.editingBy = eb;
      else {
        delete d.editingBy;
        delete d.editingAt;
      }
    }
    lastDemandasPresenceFp = presenceFp;
    refreshPresenceBadgesOnly();
    return;
  }

  lastDemandasContentFp = contentFp;
  lastDemandasPresenceFp = presenceFp;
  applyLoadedState(data);
  scheduleRefreshAllViews();
}

function uid() {
  return crypto.randomUUID();
}

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

function parseDate(d) {
  if (!d) return null;
  const t = Date.parse(d + "T12:00:00");
  return Number.isNaN(t) ? null : t;
}

function addDaysISO(isoDate, days) {
  const t = parseDate(isoDate);
  if (t == null) return "";
  const n = Number(days);
  if (!Number.isFinite(n)) return "";
  const d = new Date(t);
  d.setDate(d.getDate() + n);
  const pad = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isoDatePart(iso) {
  const s = String(iso || "").trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

/** Data real de término (campo do formulário ou histórico ao concluir). */
function demandaDataTermino(d) {
  const dm = migrateDemanda(d);
  if (dm.dataTermino) return dm.dataTermino;
  if (isStatusConcluidoDemanda(dm)) return demandaDataConclusao(dm);
  return "";
}

function isDemandaEncerrada(dm) {
  const linha = inferLinhaEsteira(dm);
  if (linha === LINHA_ESTEIRA_B2B) return STATUS_B2B_CONCLUIDOS.has(dm.status);
  return ["conclusao", "reprovado"].includes(dm.status);
}

function isAtraso(d) {
  const dm = migrateDemanda(d);
  const prev = parseDate(dm.dataFimPrevista);
  if (!prev) return false;
  if (dm.linhaEsteira !== LINHA_ESTEIRA_B2B && dm.status === "reprovado") return false;
  if (isDemandaEncerrada(dm)) {
    const term = parseDate(demandaDataTermino(dm));
    return term != null && term > prev;
  }
  const hoje = parseDate(todayISODate());
  return hoje > prev;
}

/** Em atraso e ainda em andamento (obrigatório registrar motivos). */
function isAtrasoAtivo(d) {
  const dm = migrateDemanda(d);
  if (isDemandaEncerrada(dm)) return false;
  return isAtraso(dm);
}

function demandaPreviewFromForm() {
  return migrateDemanda({
    status: document.getElementById("demStatus")?.value || "novo",
    tipo: document.getElementById("demTipo")?.value || "",
    linhaEsteira: editingLinhaEsteira,
    dataChegada: document.getElementById("demDataChegada")?.value || "",
    dataFimPrevista: document.getElementById("demDataFimPrevista")?.value || "",
    dataTermino: document.getElementById("demDataTermino")?.value || "",
  });
}

function normalizeMotivoAtrasoDias(v) {
  if (v === "" || v == null) return "";
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return "";
  return Math.round(n);
}

function normalizeMotivosAtrasoItens(d) {
  if (Array.isArray(d?.motivosAtrasoItens)) {
    return d.motivosAtrasoItens
      .map((item) => ({
        motivo: String(item?.motivo || "").trim(),
        dias: normalizeMotivoAtrasoDias(item?.dias),
      }))
      .filter((item) => item.motivo || item.dias !== "");
  }
  const legado = String(d?.motivosAtraso || "").trim();
  if (legado) return [{ motivo: legado.slice(0, 500), dias: "" }];
  return [];
}

function formatMotivosAtrasoTexto(itens) {
  const list = normalizeMotivosAtrasoItens({ motivosAtrasoItens: itens });
  if (!list.length) return "";
  return list
    .map((item, i) => {
      const n = i + 1;
      const dias =
        item.dias === "" ? "" : ` (${item.dias === 1 ? "1 dia" : `${item.dias} dias`})`;
      return `Motivo ${n}: ${item.motivo}${dias}`;
    })
    .join(" · ");
}

function motivosAtrasoItensPreenchidos(itens) {
  return normalizeMotivosAtrasoItens({ motivosAtrasoItens: itens }).some((item) => item.motivo);
}

function sameMotivosAtrasoItens(a, b) {
  const na = normalizeMotivosAtrasoItens({ motivosAtrasoItens: a });
  const nb = normalizeMotivosAtrasoItens({ motivosAtrasoItens: b });
  return JSON.stringify(na) === JSON.stringify(nb);
}

function readMotivosAtrasoFromDom(opts = {}) {
  const forSave = opts.forSave === true;
  const root = document.getElementById("motivosAtrasoLista");
  if (!root) return forSave ? [] : [{ motivo: "", dias: "" }];
  const rows = [...root.querySelectorAll(".motivo-atraso-row")];
  const items = rows.map((row) => ({
    motivo: (row.querySelector(".motivo-atraso-texto")?.value || "").trim(),
    dias: normalizeMotivoAtrasoDias(row.querySelector(".motivo-atraso-dias")?.value),
  }));
  if (forSave) {
    return items.filter((item) => item.motivo || item.dias !== "");
  }
  return items.length ? items : [{ motivo: "", dias: "" }];
}

function mapMotivosAtrasoItensParaUi(itens) {
  if (!Array.isArray(itens) || !itens.length) return [{ motivo: "", dias: "" }];
  return itens.map((item) => ({
    motivo: String(item?.motivo || "").trim(),
    dias: normalizeMotivoAtrasoDias(item?.dias),
  }));
}

function renderMotivosAtrasoLista(itens) {
  const root = document.getElementById("motivosAtrasoLista");
  if (!root) return;
  const rows = mapMotivosAtrasoItensParaUi(itens);
  root.innerHTML = "";
  rows.forEach((item, i) => {
    const row = document.createElement("div");
    row.className = "motivo-atraso-row";
    row.innerHTML =
      `<label class="field field--grow">` +
      `<span>Motivo ${i + 1}</span>` +
      `<input type="text" class="motivo-atraso-texto" maxlength="500" placeholder="Descreva o motivo do atraso…" value="${escapeHtml(item.motivo)}" />` +
      `</label>` +
      `<label class="field field--dias">` +
      `<span>Dias</span>` +
      `<input type="number" class="motivo-atraso-dias" min="0" max="9999" step="1" placeholder="0" value="${item.dias === "" ? "" : String(item.dias)}" />` +
      `</label>` +
      `<button type="button" class="motivo-atraso-remove" aria-label="Remover motivo ${i + 1}" title="Remover motivo"${rows.length <= 1 ? " disabled" : ""}>×</button>`;
    root.appendChild(row);
  });
  refreshMotivosAtrasoRemoveButtons();
}

function refreshMotivosAtrasoRemoveButtons() {
  const root = document.getElementById("motivosAtrasoLista");
  if (!root) return;
  const btns = [...root.querySelectorAll(".motivo-atraso-remove")];
  btns.forEach((btn) => {
    btn.disabled = btns.length <= 1;
  });
}

function addMotivoAtrasoRow() {
  const lista = document.getElementById("motivosAtrasoLista");
  if (!lista) return;
  const current = readMotivosAtrasoFromDom();
  current.push({ motivo: "", dias: "" });
  renderMotivosAtrasoLista(current);
  const inputs = lista.querySelectorAll(".motivo-atraso-texto");
  inputs[inputs.length - 1]?.focus();
}

function bindMotivosAtrasoUi() {
  const form = document.getElementById("formDemanda");
  if (!form || form.dataset.motivosBound === "1") return;
  form.dataset.motivosBound = "1";

  form.addEventListener("click", (e) => {
    if (e.target.closest("#btnAddMotivoAtraso")) {
      e.preventDefault();
      e.stopPropagation();
      addMotivoAtrasoRow();
      return;
    }
    const btn = e.target.closest(".motivo-atraso-remove");
    if (!btn || btn.disabled) return;
    const root = document.getElementById("motivosAtrasoLista");
    const row = btn.closest(".motivo-atraso-row");
    if (!root || !row) return;
    e.preventDefault();
    row.remove();
    if (!root.querySelector(".motivo-atraso-row")) {
      renderMotivosAtrasoLista([]);
    } else {
      renumberMotivosAtrasoRows();
      refreshMotivosAtrasoRemoveButtons();
    }
  });
}

function renumberMotivosAtrasoRows() {
  const root = document.getElementById("motivosAtrasoLista");
  if (!root) return;
  root.querySelectorAll(".motivo-atraso-row").forEach((row, i) => {
    const label = row.querySelector(".field--grow > span");
    if (label) label.textContent = `Motivo ${i + 1}`;
    const btn = row.querySelector(".motivo-atraso-remove");
    if (btn) {
      btn.setAttribute("aria-label", `Remover motivo ${i + 1}`);
      btn.title = "Remover motivo";
    }
  });
}

function syncMotivosAtrasoField() {
  const fs = document.getElementById("fieldsetMotivosAtraso");
  const hint = document.getElementById("motivosAtrasoHint");
  const diasEl = document.getElementById("demAtrasoDiasResumo");
  if (!fs) return;
  const d = demandaPreviewFromForm();
  const show = isAtraso(d);
  const ativo = isAtrasoAtivo(d);
  fs.hidden = !show;
  if (hint) {
    hint.textContent = ativo
      ? "O prazo previsto já passou. Registre cada motivo e quantos dias ele representa."
      : "Projeto concluído após o prazo. Registre os motivos do atraso para histórico.";
  }
  if (diasEl) {
    const dias = demandaDiasAtraso(d);
    if (show && dias > 0) {
      diasEl.hidden = false;
      diasEl.innerHTML = `<strong>Atraso:</strong> ${escapeHtml(formatDiasAtrasoLabel(dias))}`;
    } else {
      diasEl.hidden = true;
      diasEl.textContent = "";
    }
  }
  if (show) {
    const root = document.getElementById("motivosAtrasoLista");
    if (root && !root.querySelector(".motivo-atraso-row")) {
      renderMotivosAtrasoLista([]);
    }
  }
}

/** Dias entre duas datas ISO (b − a); zero se inválido. */
function diasEntreDatasISO(isoA, isoB) {
  const a = parseDate(isoA);
  const b = parseDate(isoB);
  if (a == null || b == null) return 0;
  return Math.max(0, Math.round((b - a) / 86400000));
}

/** Projeto em Conclusão com prazo e término preenchidos; null se não comparável. */
function demandaEntregaComparavel(d) {
  const dm = migrateDemanda(d);
  if (!isStatusConcluidoDemanda(dm)) return null;
  const prev = dm.dataFimPrevista;
  if (!prev) return null;
  const fim = demandaDataTermino(dm);
  if (!fim) return null;
  const prevMs = parseDate(prev);
  const fimMs = parseDate(fim);
  if (prevMs == null || fimMs == null) return null;
  const atrasou = fimMs > prevMs;
  return {
    d: dm,
    dataPrevista: prev,
    dataTermino: fim,
    diasAtraso: atrasou ? diasEntreDatasISO(prev, fim) : 0,
    atrasou,
  };
}

/** Projeto concluído após o prazo previsto; null se não aplicável. */
function demandaEntregaAtraso(d) {
  const row = demandaEntregaComparavel(d);
  return row?.atrasou ? row : null;
}

/** Dias de atraso em relação ao prazo previsto (andamento ou concluído). */
function demandaDiasAtraso(d) {
  const dm = migrateDemanda(d);
  if (!isAtraso(dm)) return 0;
  const prev = dm.dataFimPrevista;
  if (!prev) return 0;
  if (isDemandaEncerrada(dm)) {
    const fim = demandaDataTermino(dm);
    return fim ? diasEntreDatasISO(prev, fim) : 0;
  }
  return diasEntreDatasISO(prev, todayISODate());
}

function formatDiasAtrasoLabel(n) {
  const dias = Math.max(0, Number(n) || 0);
  return dias === 1 ? "1 dia" : `${dias} dias`;
}

function demandaInicioContagemAberto(d) {
  const dm = migrateDemanda(d);
  return dm.dataChegada || (dm.createdAt || "").slice(0, 10);
}

/** Dias desde a chegada; congela na conclusão ou na reprovação. */
function demandaDataFimContagemAberto(d) {
  const dm = migrateDemanda(d);
  if (isStatusConcluidoDemanda(dm)) {
    return demandaDataTermino(dm) || demandaDataConclusao(dm) || "";
  }
  if (dm.status === "reprovado") {
    const hist = Array.isArray(dm.historicoStatus) ? dm.historicoStatus : [];
    const seg = [...hist].reverse().find((s) => s.status === "reprovado") || hist[hist.length - 1];
    if (seg?.inicio) return isoDatePart(seg.inicio);
    if (seg?.fim) return isoDatePart(seg.fim);
    return isoDatePart(dm.updatedAt) || isoDatePart(dm.createdAt);
  }
  return "";
}

function demandaDiasAberto(d) {
  const dm = migrateDemanda(d);
  const inicio = demandaInicioContagemAberto(dm);
  if (!inicio) return 0;
  const fim = demandaDataFimContagemAberto(dm);
  if (fim) return diasEntreDatasISO(inicio, fim);
  return diasEntreDatasISO(inicio, todayISODate());
}

function formatDiasAbertoLabel(n) {
  return formatDiasAtrasoLabel(n);
}

function syncDiasAbertoResumo() {
  const el = document.getElementById("demDiasAbertoResumo");
  if (!el) return;
  const d = demandaPreviewFromForm();
  const dias = demandaDiasAberto(d);
  const concluido = isStatusConcluidoDemanda(d);
  const reprovado = d.status === "reprovado";
  const inicio = demandaInicioContagemAberto(d);
  if (!inicio) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  const sufixo = reprovado
    ? " (congelado na reprovação)"
    : concluido
      ? " (congelado na conclusão)"
      : " — atualiza a cada dia";
  el.innerHTML =
    `<strong>Dias aberto:</strong> ${escapeHtml(formatDiasAbertoLabel(dias))}` +
    `<span class="muted small">${escapeHtml(sufixo)}</span>`;
}

function statusHistoryPush(demanda, newStatus, now = new Date().toISOString()) {
  const hist = Array.isArray(demanda.historicoStatus) ? [...demanda.historicoStatus] : [];
  const last = hist[hist.length - 1];
  if (last && !last.fim) last.fim = now;
  if (!last || last.status !== newStatus) hist.push({ status: newStatus, inicio: now, fim: "", observacao: "" });
  return hist;
}

function normalizeHistoricoStatus(hist) {
  if (!Array.isArray(hist)) return [];
  return hist.map((seg) => ({
    status: seg.status,
    inicio: seg.inicio || "",
    fim: seg.fim || "",
    observacao: typeof seg.observacao === "string" ? seg.observacao : "",
  }));
}

/** Converte ISO → valor de `<input type="datetime-local">`. */
function isoToDatetimeLocal(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
    if (!m) return "";
    return `${m[1]}-${m[2]}-${m[3]}T${m[4] || "00"}:${m[5] || "00"}`;
  }
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function datetimeLocalToIso(val) {
  const s = String(val || "").trim();
  if (!s) return "";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

function validateHistoricoStatus(hist, statusAtual, linha = editingLinhaEsteira) {
  const h = normalizeHistoricoStatus(hist);
  if (!h.length) return null;
  for (let i = 0; i < h.length; i++) {
    const seg = h[i];
    const lab = labelStatus(seg.status, linha);
    if (!seg.inicio) return `Informe a data de início em "${lab}".`;
    const start = Date.parse(seg.inicio);
    if (Number.isNaN(start)) return `Data de início inválida em "${lab}".`;
    const isLast = i === h.length - 1;
    const faseAberta = isLast && seg.status === statusAtual && !seg.fim;
    if (!seg.fim && !faseAberta) {
      return `Informe a data de fim em "${lab}" (ou deixe em branco só na fase atual em andamento).`;
    }
    if (seg.fim) {
      const end = Date.parse(seg.fim);
      if (Number.isNaN(end)) return `Data de fim inválida em "${lab}".`;
      if (end < start) return `Em "${lab}", a data de fim não pode ser anterior ao início.`;
    }
  }
  return null;
}

/** Nome de conta salvo pelo administrador; senão o do login ou o do e-mail. */
function normalizeAccountDisplayName(name) {
  if (typeof DemandasRoles !== "undefined" && DemandasRoles.normalizeDisplayName) {
    return DemandasRoles.normalizeDisplayName(name);
  }
  return String(name || "").replace(/\s+/g, " ").trim();
}

function accountNameFromEmail(email) {
  const e = String(email || "").trim();
  if (!e) return "";
  const local = e.split("@")[0] || e;
  const label = local.replace(/[._-]+/g, " ").trim();
  if (!label) return e;
  return label.replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function accountDisplayNameForEmail(email) {
  const e = String(email || "")
    .trim()
    .toLowerCase();
  if (!e) return "";
  const stored =
    typeof DemandasRoles !== "undefined" && DemandasRoles.displayNameForEmail
      ? DemandasRoles.displayNameForEmail(e)
      : "";
  if (stored) return stored;
  const user = typeof DemandasAuth !== "undefined" ? DemandasAuth.currentUser?.() : null;
  if (user && String(user.email || "").trim().toLowerCase() === e) {
    const authName = String(user.displayName || "").trim();
    if (authName) return authName;
  }
  return accountNameFromEmail(email);
}

/** Nome exibido nos comentários — usuário logado, não o projetista da demanda. */
function getLoggedInComentarioAutor() {
  const user = typeof DemandasAuth !== "undefined" ? DemandasAuth.currentUser() : null;
  if (!user) return "Equipe";
  const name = accountDisplayNameForEmail(user.email);
  return name || "Equipe";
}

const PRESENCE_TTL_MS = 3 * 60 * 1000;
const PRESENCE_HEARTBEAT_MS = 90 * 1000;

function getCurrentUserEmail() {
  const user = typeof DemandasAuth !== "undefined" ? DemandasAuth.currentUser?.() : null;
  return String(user?.email || "")
    .trim()
    .toLowerCase();
}

function currentRoleInfo() {
  if (typeof DemandasRoles === "undefined") {
    return {
      email: getCurrentUserEmail(),
      role: "projetista",
      label: "Projetista",
      isAdmin: false,
      isReadOnly: false,
    };
  }
  return DemandasRoles.resolve(DemandasAuth?.currentUser?.() || { email: getCurrentUserEmail() });
}

function canRole(action) {
  if (typeof DemandasRoles === "undefined") return true;
  return DemandasRoles.can(action);
}

function isReadOnlyUser() {
  return !!currentRoleInfo().isReadOnly;
}

function isAdminUser() {
  return !!currentRoleInfo().isAdmin;
}

function requireWriteAccess(action = "write") {
  if (canRole(action)) return true;
  const info = currentRoleInfo();
  toast(
    info.isBlocked
      ? "Seu acesso foi removido do sistema"
      : info.isDisabled
        ? "Sua conta está desabilitada"
        : "Seu perfil (Visibilidade) é somente leitura",
  );
  return false;
}

function clearEditingPresenceForEmail(email) {
  const e = String(email || "")
    .trim()
    .toLowerCase();
  if (!e) return;
  for (const d of state.demandas || []) {
    const eb = normalizeEditingBy(d.editingBy);
    if (eb?.email === e) setDemandaEditingBy(d.id, null);
  }
}

async function enforceAccessOrSignOut() {
  const info = currentRoleInfo();
  if (!info?.email || !info.isBlocked) return false;
  const msg =
    "Seu acesso foi removido do sistema. Peça ao administrador para adicionar seu e-mail na lista de usuários.";
  try {
    if (typeof DemandasAuth?.signOut === "function") await DemandasAuth.signOut();
  } catch (_) {}
  showLoginScreen();
  showLoginError(msg);
  toast(msg);
  return true;
}

function applyRoleUi(opts = {}) {
  const info = currentRoleInfo();
  const appRoot = document.getElementById("appRoot");
  const roleEl = document.getElementById("authUserRole");
  const tabUsers = document.getElementById("btnMenuUsuarios");
  if (appRoot) {
    appRoot.classList.toggle("app--readonly", info.isReadOnly || info.isBlocked);
    appRoot.classList.toggle("app--admin", !!info.isAdmin);
  }
  if (roleEl) {
    if (info.email) {
      roleEl.hidden = false;
      roleEl.textContent = info.label;
      roleEl.dataset.role = info.role;
    } else {
      roleEl.hidden = true;
    }
  }
  if (tabUsers) tabUsers.hidden = !info.isAdmin;
  if (!info.isAdmin && usuariosModalAberto()) {
    document.getElementById("panelUsuarios")?.close();
  }
  const exportMenu = document.getElementById("exportMenu");
  const importMenu = document.getElementById("importMenu");
  if (exportMenu) exportMenu.hidden = !info.isAdmin;
  if (importMenu) importMenu.hidden = !info.isAdmin;
  if (!info.isAdmin) {
    setExportMenuOpen(false);
    setImportMenuOpen(false);
  }
  updateUserMenuAvatar(info.email);
  if (!opts.light) fillContaScreen();
  // Evita recriar selects e painel de usuários a cada sync da esteira.
  if (!opts.light) {
    refreshProjetistaAssignmentLists();
    if (info.isAdmin && usuariosModalAberto()) renderUsuariosPanel();
  }
}

function userInitialsFromEmail(email) {
  const nome = accountDisplayNameForEmail(email);
  if (nome && !nome.includes("@")) {
    const parts = nome.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    if (parts[0]) return parts[0].slice(0, 2).toUpperCase();
  }
  const local = String(email || "").split("@")[0].trim();
  const parts = local.split(/[.\-_]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (local.slice(0, 2) || "?").toUpperCase();
}

function updateUserMenuAvatar(email) {
  const el = document.getElementById("userMenuAvatar");
  const initials = userInitialsFromEmail(email);
  if (el) el.textContent = initials;
  const btn = document.getElementById("btnUserMenu");
  if (btn) btn.title = email ? `${email} — Minha conta` : "Minha conta";
}

function currentTheme() {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

function chartInk() {
  const light = document.documentElement.getAttribute("data-theme") === "light";
  return light
    ? { tick: "#475569", label: "#1e293b", grid: "rgba(15, 23, 42, 0.08)" }
    : { tick: "#94a3b8", label: "#cbd5e1", grid: "rgba(148, 163, 184, 0.12)" };
}

function applyTheme(theme) {
  const t = theme === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", t);
  try {
    localStorage.setItem("demandas-theme", t);
  } catch (_) {}
  const toggle = document.getElementById("themeToggle");
  if (toggle) toggle.checked = t === "light";
  const dash = document.getElementById("panelDashboard");
  if (dash && !dash.hidden && typeof renderDashboard === "function") renderDashboard();
}

function isMobileShell() {
  return window.matchMedia("(max-width: 720px)").matches;
}

function applySidebarCollapsed(collapsed) {
  const app = document.getElementById("appRoot");
  const btn = document.getElementById("btnSidebarToggle");
  app?.classList.toggle("app--sidebar-collapsed", !!collapsed);
  if (btn) {
    btn.setAttribute("aria-pressed", collapsed ? "true" : "false");
    const tip = collapsed ? "Expandir menu" : "Recolher menu";
    btn.dataset.tip = tip;
    btn.setAttribute("aria-label", tip);
  }
  try {
    localStorage.setItem("demandas-sidebar-collapsed", collapsed ? "1" : "0");
  } catch (_) {}
}

function setMobileSidebarOpen(open) {
  const app = document.getElementById("appRoot");
  const backdrop = document.getElementById("sidebarBackdrop");
  app?.classList.toggle("is-sidebar-open", !!open);
  if (backdrop) backdrop.hidden = !open;
}

function setUserMenuOpen(open) {
  setDropdownMenuOpen("userMenuPanel", "btnUserMenu", open);
  document.getElementById("btnUserMenu")?.classList.toggle("is-active", !!open);
}

function fillContaScreen() {
  const info = currentRoleInfo();
  const nome = getLoggedInComentarioAutor();
  const primeiro = nome.split(" ")[0] || nome;
  const initials = userInitialsFromEmail(info.email);
  const emailEl = document.getElementById("userDadosEmail");
  const papelEl = document.getElementById("userDadosPapel");
  const regionalEl = document.getElementById("userDadosRegional");
  const emailTxt = info.email || "—";
  if (emailEl) emailEl.textContent = emailTxt;
  if (papelEl) papelEl.textContent = info.label || "—";
  const regional =
    typeof DemandasRoles !== "undefined" && DemandasRoles.regionalForEmail
      ? DemandasRoles.regionalForEmail(info.email)
      : "";
  if (regionalEl) regionalEl.textContent = regional || "Todas";
  const navNome = document.getElementById("contaNavNome");
  const perfilNome = document.getElementById("contaPerfilNome");
  const nomeCampo = document.getElementById("contaPerfilNomeCampo");
  const navSub = document.getElementById("contaNavSub");
  if (navNome) navNome.textContent = primeiro;
  if (perfilNome) perfilNome.textContent = nome;
  if (nomeCampo) nomeCampo.textContent = nome;
  if (navSub) navSub.textContent = `${info.label || "Conta"} · configurações da conta`;
  ["contaNavAvatar", "contaPerfilAvatar"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = initials;
  });
  const situacao = document.getElementById("contaSituacao");
  if (situacao) {
    situacao.classList.remove("is-warn", "is-off");
    if (info.isBlocked) {
      situacao.textContent = "Sem acesso";
      situacao.classList.add("is-off");
    } else if (info.isDisabled) {
      situacao.textContent = "Desabilitado";
      situacao.classList.add("is-off");
    } else if (info.isReadOnly) {
      situacao.textContent = "Somente leitura";
      situacao.classList.add("is-warn");
    } else {
      situacao.textContent = "Ativo";
    }
  }
  const toggle = document.getElementById("themeToggle");
  if (toggle) toggle.checked = currentTheme() === "light";
  const segEmail = document.getElementById("userSegurancaEmail");
  if (segEmail) segEmail.textContent = info.email || "—";
}

function syncTrocarSenhaForm() {
  const atual = document.getElementById("userSenhaAtual")?.value || "";
  const nova = document.getElementById("userSenhaNova")?.value || "";
  const nova2 = document.getElementById("userSenhaNova2")?.value || "";
  const hint = document.getElementById("userSenhaHint");
  const btn = document.getElementById("btnTrocarSenha");
  let msg = "Use ao menos 6 caracteres.";
  let state = "";
  if (nova && nova.length < 6) {
    msg = "A nova senha precisa de ao menos 6 caracteres.";
    state = "is-bad";
  } else if (nova && atual && nova === atual) {
    msg = "A nova senha precisa ser diferente da atual.";
    state = "is-bad";
  } else if (nova2 && nova !== nova2) {
    msg = "A confirmação não confere.";
    state = "is-bad";
  } else if (nova.length >= 6 && nova === nova2 && atual && nova !== atual) {
    msg = "Pronto para salvar.";
    state = "is-ok";
  }
  if (hint) {
    hint.textContent = msg;
    hint.classList.toggle("is-bad", state === "is-bad");
    hint.classList.toggle("is-ok", state === "is-ok");
  }
  if (btn && btn.dataset.busy !== "1") btn.disabled = state !== "is-ok";
}

function showContaPane(pane) {
  const titles = { perfil: "Perfil", seguranca: "Senha" };
  const next = titles[pane] ? pane : "perfil";
  document.querySelectorAll("[data-conta-pane]").forEach((btn) => {
    const on = btn.dataset.contaPane === next;
    btn.classList.toggle("is-active", on);
    if (on) btn.setAttribute("aria-current", "page");
    else btn.removeAttribute("aria-current");
  });
  document.querySelectorAll("[data-conta-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.contaPanel !== next;
  });
  const title = document.getElementById("contaPaneTitulo");
  if (title) title.textContent = titles[next];
}

function initShellUi() {
  try {
    applyTheme(localStorage.getItem("demandas-theme") === "light" ? "light" : currentTheme());
    applySidebarCollapsed(localStorage.getItem("demandas-sidebar-collapsed") === "1");
  } catch (_) {
    applyTheme(currentTheme());
  }
  document.getElementById("themeToggle")?.addEventListener("change", (e) => {
    applyTheme(e.target.checked ? "light" : "dark");
  });
  document.getElementById("btnSidebarToggle")?.addEventListener("click", () => {
    const app = document.getElementById("appRoot");
    applySidebarCollapsed(!app?.classList.contains("app--sidebar-collapsed"));
  });
  document.getElementById("btnSidebarOpen")?.addEventListener("click", () => setMobileSidebarOpen(true));
  document.getElementById("sidebarBackdrop")?.addEventListener("click", () => setMobileSidebarOpen(false));
  document.getElementById("btnUserMenu")?.addEventListener("click", (e) => {
    e.stopPropagation();
    setImportMenuOpen(false);
    setExportMenuOpen(false);
    setEsteiraTabMenuOpen(false);
    const panel = document.getElementById("userMenuPanel");
    setUserMenuOpen(panel?.hidden !== false);
  });
  document.querySelectorAll("[data-user-modal]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setUserMenuOpen(false);
      fillContaScreen();
      if (btn.dataset.userModal === "modalUserConta") showContaPane("perfil");
      document.getElementById(btn.dataset.userModal)?.showModal();
    });
  });
  document.querySelectorAll("[data-conta-pane]").forEach((btn) => {
    btn.addEventListener("click", () => showContaPane(btn.dataset.contaPane));
  });
  document.getElementById("btnMenuUsuarios")?.addEventListener("click", () => {
    setUserMenuOpen(false);
    openUsuariosModal();
  });
  document.querySelectorAll("[data-close-user-modal]").forEach((btn) => {
    btn.addEventListener("click", () => btn.closest("dialog")?.close());
  });
  document.querySelectorAll("[data-seg-eye]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = document.getElementById(btn.dataset.segEye);
      if (!input) return;
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.setAttribute("aria-label", show ? "Ocultar senha" : "Mostrar senha");
    });
  });
  ["userSenhaAtual", "userSenhaNova", "userSenhaNova2"].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", syncTrocarSenhaForm);
  });
  document.getElementById("formTrocarSenha")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = document.getElementById("userSenhaError");
    const ok = document.getElementById("userSenhaOk");
    const atual = document.getElementById("userSenhaAtual")?.value || "";
    const nova = document.getElementById("userSenhaNova")?.value || "";
    const nova2 = document.getElementById("userSenhaNova2")?.value || "";
    if (err) { err.hidden = true; err.textContent = ""; }
    if (ok) ok.hidden = true;
    if (nova.length < 6) {
      if (err) { err.hidden = false; err.textContent = "A nova senha precisa de ao menos 6 caracteres."; }
      return;
    }
    if (nova === atual) {
      if (err) { err.hidden = false; err.textContent = "A nova senha precisa ser diferente da atual."; }
      return;
    }
    if (nova !== nova2) {
      if (err) { err.hidden = false; err.textContent = "A confirmação não confere com a nova senha."; }
      return;
    }
    if (typeof DemandasAuth?.updatePassword !== "function") {
      if (err) { err.hidden = false; err.textContent = "Troca de senha indisponível. Recarregue a página."; }
      return;
    }
    const btn = document.getElementById("btnTrocarSenha");
    if (btn) {
      btn.disabled = true;
      btn.dataset.busy = "1";
      btn.textContent = "Salvando…";
    }
    try {
      await DemandasAuth.updatePassword(atual, nova);
      document.getElementById("formTrocarSenha")?.reset();
      document.querySelectorAll(".seg-input input").forEach((input) => {
        input.type = "password";
      });
      if (ok) {
        ok.hidden = false;
        ok.textContent = "Senha atualizada.";
      }
    } catch (ex) {
      if (err) {
        err.hidden = false;
        err.textContent = ex?.message || "Não foi possível trocar a senha.";
      }
    } finally {
      if (btn) {
        btn.dataset.busy = "";
        btn.textContent = "Salvar nova senha";
      }
      syncTrocarSenhaForm();
    }
  });
  document.getElementById("btnUserResetEmail")?.addEventListener("click", async () => {
    const email = currentRoleInfo().email || getCurrentUserEmail();
    const err = document.getElementById("userResetError");
    const ok = document.getElementById("userResetOk");
    if (err) { err.hidden = true; err.textContent = ""; }
    if (ok) ok.hidden = true;
    if (!email || typeof DemandasAuth?.sendPasswordReset !== "function") {
      if (err) { err.hidden = false; err.textContent = "Não foi possível enviar o e-mail."; }
      return;
    }
    const btn = document.getElementById("btnUserResetEmail");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Enviando…";
    }
    try {
      await DemandasAuth.sendPasswordReset(email);
      if (ok) {
        ok.hidden = false;
        ok.textContent = `Enviamos um link para ${email}.`;
      }
    } catch (ex) {
      if (err) {
        err.hidden = false;
        err.textContent = ex?.message || "Não foi possível enviar o e-mail.";
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Enviar link";
      }
    }
  });
}

function normalizeEditingBy(v) {
  if (!v || typeof v !== "object") return null;
  const email = String(v.email || "")
    .trim()
    .toLowerCase();
  if (!email) return null;
  const since = v.since || "";
  const t = Date.parse(since);
  if (!Number.isFinite(t) || Date.now() - t > PRESENCE_TTL_MS) return null;
  const autor = String(v.autor || email).trim() || email;
  return { email, autor, since };
}

function buildEditingPresence() {
  const email = getCurrentUserEmail();
  if (!email) return null;
  return {
    email,
    autor: getLoggedInComentarioAutor(),
    since: new Date().toISOString(),
  };
}

function setDemandaEditingBy(id, editingBy) {
  if (!id) return;
  const idx = state.demandas.findIndex((x) => x.id === id);
  if (idx < 0) return;
  const next = { ...state.demandas[idx] };
  delete next.__isMigrated;
  if (editingBy) next.editingBy = editingBy;
  else {
    delete next.editingBy;
    delete next.editingAt;
  }
  state.demandas[idx] = migrateDemanda(next);
  applyCloudPatch({ presence: { id, editingBy: editingBy || null } });
  // Não recria a esteira inteira a cada heartbeat de presença.
  refreshPresenceBadgesOnly();
}

let editingDemandaOpenId = null;
let editingDemandaBaselineUpdatedAt = "";
let ownClickupSyncId = "";
let ownWriteGraceUntil = 0;
let clickupUiOverride = null;
const ownUpdatedAtWrites = new Set();

function beginOwnDemandaWrite(id) {
  if (!id) return;
  ownClickupSyncId = id;
  ownWriteGraceUntil = Date.now() + 20000;
  const conflict = document.getElementById("demConflictBanner");
  if (conflict && editingDemandaOpenId === id) conflict.hidden = true;
}

function isInOwnWriteGrace(id) {
  return !!(id && ownClickupSyncId === id && Date.now() < ownWriteGraceUntil);
}

function noteOwnDemandaWrite(id, updatedAt) {
  if (!id || !updatedAt) return;
  ownUpdatedAtWrites.add(`${id}\0${updatedAt}`);
  beginOwnDemandaWrite(id);
  if (editingDemandaOpenId === id) editingDemandaBaselineUpdatedAt = updatedAt;
}
let presenceHeartbeatTimer = null;

function stopPresenceHeartbeat() {
  if (presenceHeartbeatTimer) {
    clearInterval(presenceHeartbeatTimer);
    presenceHeartbeatTimer = null;
  }
}

function startPresenceHeartbeat(id) {
  stopPresenceHeartbeat();
  if (!id) return;
  presenceHeartbeatTimer = setInterval(() => {
    if (!modalDemanda?.open || editingDemandaOpenId !== id) return;
    const p = buildEditingPresence();
    if (p) setDemandaEditingBy(id, p);
  }, PRESENCE_HEARTBEAT_MS);
}

function releaseDemandaEditing(id) {
  if (!id) return;
  const dem = state.demandas.find((x) => x.id === id);
  if (!dem) {
    if (editingDemandaOpenId === id) {
      applyCloudPatch({ presence: { id, editingBy: null } });
    }
    return;
  }
  if (!dem.editingBy && editingDemandaOpenId !== id) return;
  const me = getCurrentUserEmail();
  const editorEmail = dem?.editingBy?.email ? String(dem.editingBy.email).toLowerCase() : "";
  if (!editorEmail || !me || editorEmail === me || editingDemandaOpenId === id) {
    setDemandaEditingBy(id, null);
  }
}

function hideDemandaModalAlerts() {
  const conflict = document.getElementById("demConflictBanner");
  const presence = document.getElementById("demPresenceBanner");
  const selfBanner = document.getElementById("demSelfEditingBanner");
  const clickupRetorno = document.getElementById("demClickupRetornoBanner");
  if (conflict) conflict.hidden = true;
  if (presence) presence.hidden = true;
  if (selfBanner) selfBanner.hidden = true;
  if (clickupRetorno) clickupRetorno.hidden = true;
}

function absorbOwnDemandaRemoteUpdate(dem) {
  if (!dem?.id) return false;
  const remoteUpdated = dem.updatedAt || "";
  const ownTs = !!(remoteUpdated && ownUpdatedAtWrites.has(`${dem.id}\0${remoteUpdated}`));
  if (!ownTs && !isInOwnWriteGrace(dem.id)) return false;
  if (remoteUpdated) {
    editingDemandaBaselineUpdatedAt = remoteUpdated;
    ownUpdatedAtWrites.add(`${dem.id}\0${remoteUpdated}`);
  }
  return true;
}

function syncDemandaModalAlerts() {
  const id = editingDemandaOpenId;
  const conflict = document.getElementById("demConflictBanner");
  const presence = document.getElementById("demPresenceBanner");
  const presenceText = document.getElementById("demPresenceBannerText");
  const selfBanner = document.getElementById("demSelfEditingBanner");
  if (!id || !modalDemanda?.open) {
    hideDemandaModalAlerts();
    if (selfBanner) selfBanner.hidden = true;
    return;
  }
  const dem = state.demandas.find((x) => x.id === id);
  if (!dem) return;

  if (selfBanner) {
    const mine = normalizeEditingBy(dem.editingBy);
    const me = getCurrentUserEmail();
    selfBanner.hidden = !(mine && me && mine.email === me);
  }

  const remoteUpdated = dem.updatedAt || "";
  const ownUpdate = absorbOwnDemandaRemoteUpdate(dem);
  if (
    conflict &&
    !ownUpdate &&
    editingDemandaBaselineUpdatedAt &&
    remoteUpdated &&
    remoteUpdated !== editingDemandaBaselineUpdatedAt
  ) {
    conflict.hidden = false;
  } else if (conflict) {
    conflict.hidden = true;
  }

  const other = normalizeEditingBy(dem.editingBy);
  const me = getCurrentUserEmail();
  if (presence && presenceText) {
    if (other && other.email !== me) {
      presence.hidden = false;
      presenceText.textContent = `${other.autor} está editando este projeto agora.`;
    } else {
      presence.hidden = true;
    }
  }

  const clickupRetorno = document.getElementById("demClickupRetornoBanner");
  const btnCiente = document.getElementById("btnDemClickupCiente");
  if (clickupRetorno) {
    const pendente = clickupRetornoPendente(dem);
    clickupRetorno.hidden = !pendente;
    if (btnCiente) {
      btnCiente.hidden = !pendente || isReadOnlyUser();
      btnCiente.disabled = !pendente || isReadOnlyUser();
    }
  }
}

/* ---------- Modal: alterações não salvas, fechar com confirmação, atalhos ---------- */
/** Ids de campos que não fazem parte do projeto (rascunhos de comentário, novas atividades, seletores de "adicionar"). */
const DEM_CAMPOS_FORA_DO_SNAPSHOT = new Set([
  "demComentarioNovo",
  "demChecklistEtapa",
  "demChecklistWho",
  "demChecklistDateInicio",
  "demChecklistDate",
  "demChecklistDesc",
  "demChecklistStatus",
  "demExtraProjetista",
  "demExtraRegional",
  "demExtraCidade",
  "demPdfInput",
]);
let demSnapshotInicial = "";

function demFormSnapshot() {
  const form = document.getElementById("formDemanda");
  if (!form) return "";
  const campos = [];
  form.querySelectorAll("input, select, textarea").forEach((el) => {
    if (el.type === "file" || el.type === "button") return;
    if (el.id && DEM_CAMPOS_FORA_DO_SNAPSHOT.has(el.id)) return;
    if (el.closest(".checklist-item__edit")) return;
    campos.push(el.type === "checkbox" ? String(el.checked) : el.value);
  });
  let timeline = [];
  try {
    timeline = readTimelineHistoricoFromDom();
  } catch (_) {}
  return JSON.stringify({
    campos,
    checklist: normalizeChecklist(editingChecklist),
    cidades: editingCidadesExtra,
    projetistas: editingProjetistasExtra,
    cabos: editingLancamentoCabos,
    pdf: editingPdfLevantamento?.name || "",
    timeline,
  });
}

function marcarDemandaLimpa() {
  demSnapshotInicial = demFormSnapshot();
  syncDemandaSujaUi();
}

function demandaTemAlteracoes() {
  if (!modalDemanda?.open || isReadOnlyUser()) return false;
  return demSnapshotInicial !== "" && demFormSnapshot() !== demSnapshotInicial;
}

function syncDemandaSujaUi() {
  const aviso = document.getElementById("demSujoAviso");
  const sujo = demandaTemAlteracoes();
  if (aviso) aviso.hidden = !sujo;
  modalDemanda?.classList.toggle("is-sujo", sujo);
}

/** Fechar pelo usuário (Fechar, ×, Esc): confirma se houver alterações não salvas. */
async function fecharDemandaComConfirmacao() {
  if (demandaTemAlteracoes()) {
    const ok = await confirmDialog({
      title: "Descartar alterações?",
      message: "Há alterações neste projeto que ainda não foram salvas.",
      confirmText: "Descartar",
      cancelText: "Continuar editando",
      variant: "warn",
    });
    if (!ok) return;
  }
  closeDemandaModal();
}

function closeDemandaModal() {
  const id = editingDemandaOpenId;
  const scrollSnap = snapshotPageScroll();
  stopPresenceHeartbeat();
  if (id) releaseDemandaEditing(id);
  editingDemandaOpenId = null;
  editingDemandaBaselineUpdatedAt = "";
  clickupUiOverride = null;
  ownClickupSyncId = "";
  ownWriteGraceUntil = 0;
  editingCustoBaseline = null;
  pdfCustoAppliedInSession = false;
  hideDemandaModalAlerts();
  if (typeof setDemandaFootMenuOpen === "function") setDemandaFootMenuOpen(false);
  demandaModalClosingFromApi = true;
  modalDemanda?.close();
  demandaModalClosingFromApi = false;
  setDemandaModalScrollLock(false);
  if (panels.esteira && !panels.esteira.hidden) renderBoard();
  restorePageScroll(scrollSnap);
  restoreDashGeoListaIfNeeded();
}

function cardEditingByHtml(d) {
  const eb = normalizeEditingBy(d.editingBy);
  const me = getCurrentUserEmail();
  if (!eb) return "";
  if (me && eb.email === me) {
    return `<p class="card__editing-by card__editing-by--self" title="Você está com este projeto aberto">✎ Você está editando</p>`;
  }
  return `<p class="card__editing-by" title="Edição em andamento">✎ ${escapeHtml(eb.autor)} editando…</p>`;
}

function normalizeComentario(c) {
  const texto = String(c?.texto || "").trim();
  if (!texto) return null;
  const autor = String(c?.autor || "").trim() || "Equipe";
  return {
    id: c?.id || uid(),
    texto,
    autor,
    createdAt: c?.createdAt || new Date().toISOString(),
  };
}

function normalizeComentarios(list) {
  if (!Array.isArray(list)) return [];
  return list.map(normalizeComentario).filter(Boolean);
}

const HISTORICO_EDICAO_LIMITE = 200;

const HISTORICO_EDICAO_CAMPOS = [
  { campo: "titulo", label: "Nome do projeto" },
  { campo: "status", label: "Status (esteira)", format: (v) => labelStatus(v) || v || "—" },
  { campo: "statusAtual", label: "Status atual" },
  { campo: "responsavel", label: "Projetista responsável", format: (v) => v || "Não atribuído" },
  {
    campo: "projetistasExtra",
    label: "Projetistas extras",
    format: (v) => {
      const list = normalizeProjetistasExtra(v, "");
      return list.length ? list.join(" · ") : "—";
    },
  },
  { campo: "tipo", label: "Tipo" },
  { campo: "produtoB2b", label: "Produto B2B", format: (v) => v || "—" },
  { campo: "segmentoB2c", label: "Segmento B2C", format: (v) => v || "—" },
  { campo: "cidade", label: "Cidade", format: (v) => v || "—" },
  {
    campo: "cidadesExtra",
    label: "Cidades extras",
    format: (v) => {
      const list = normalizeCidadesExtra(v, "");
      return list.length ? list.join(" · ") : "—";
    },
  },
  { campo: "solicitante", label: "Solicitante", format: (v) => v || "—" },
  { campo: "setorSolicitanteB2b", label: "Setor solicitante (B2B)", format: (v) => v || "—" },
  { campo: "dataChegada", label: "Data de chegada", format: formatDataCurta },
  { campo: "dataFimPrevista", label: "Previsão de término", format: formatDataCurta },
  { campo: "dataFimAtualizada", label: "Finalização atualizada", format: formatDataCurta },
  { campo: "dataTermino", label: "Data real de término", format: formatDataCurta },
  { campo: "motivosAtrasoItens", label: "Motivos do atraso", format: (v) => formatMotivosAtrasoTexto(v) || "—" },
  { campo: "valorProjetoRealizado", label: "Valor realizado", format: (v) => (v === "" || v == null ? "—" : formatBRL(v)) },
  { campo: "descricao", label: "Descrição", format: shortText },
  { campo: "chamadoOcomon", label: "Chamado Ocomon", format: (v) => v || "—" },
  { campo: "osAniel", label: "Nº O.S. Aniel", format: (v) => v || "—" },
  { campo: "clickup", label: "ClickUp", format: (v) => (v && v.url) || "—" },
  {
    campo: "checklist",
    label: "Checklist das tarefas do projeto",
    format: (v) => {
      const items = normalizeChecklist(v);
      if (!items.length) return "—";
      const d = items.filter((it) => it.done).length;
      const names = items.map((it) => it.name).join(" → ");
      return `${d}/${items.length} · ${names}`;
    },
  },
];

function shortText(v) {
  const s = String(v ?? "").trim();
  if (!s) return "—";
  return s.length > 80 ? s.slice(0, 77) + "…" : s;
}

function formatDataCurta(v) {
  if (!v) return "—";
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return v;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function normalizeHistoricoEdicaoEntry(e) {
  if (!e || typeof e !== "object") return null;
  const tipo = e.tipo === "criacao" ? "criacao" : "edicao";
  const at = e.at || "";
  if (!at) return null;
  const by = {
    email: String(e.by?.email || "").trim().toLowerCase(),
    autor: String(e.by?.autor || "").trim() || "Equipe",
  };
  const alteracoes = Array.isArray(e.alteracoes)
    ? e.alteracoes
        .map((a) => ({
          campo: String(a?.campo || ""),
          label: String(a?.label || a?.campo || ""),
          de: a?.de ?? "",
          para: a?.para ?? "",
        }))
        .filter((a) => a.campo)
    : [];
  return {
    id: e.id || uid(),
    tipo,
    at,
    by,
    alteracoes,
    nota: typeof e.nota === "string" ? e.nota : "",
  };
}

function normalizeHistoricoEdicoes(list) {
  if (!Array.isArray(list)) return [];
  return list.map(normalizeHistoricoEdicaoEntry).filter(Boolean);
}

const HISTORICO_ALERTAS_LIMITE = 80;
const ALERTA_KIND_SEM_ATRIB = "sem_atribuicao";
const ALERTA_KIND_COLUNA = "coluna";
const ALERTA_KIND_CLICKUP_RETORNO = "clickup_retorno";
const ALERTA_DIAS_MESMA_COLUNA = 6;
const ALERTA_SNOOZE_DIAS_PADRAO = 4;

function normalizeAlertaSnooze(s) {
  if (!s || typeof s !== "object") return null;
  const kind = s.kind === ALERTA_KIND_SEM_ATRIB ? ALERTA_KIND_SEM_ATRIB : ALERTA_KIND_COLUNA;
  const until = isoDatePart(s.until);
  if (!until) return null;
  const dias = Math.max(1, Math.min(30, Number(s.dias) || 1));
  return {
    kind,
    status: String(s.status || ""),
    until,
    dias,
    at: s.at || "",
    autor: String(s.autor || "").trim() || "Equipe",
    email: String(s.email || "").trim().toLowerCase(),
    texto: String(s.texto || "").trim(),
  };
}

function clickupRetornoPendente(d) {
  const cu = normalizeClickup(d?.clickup);
  return !!(cu?.completedAt && !cu.retornoCienteAt);
}

function marcarClickupRetornoCiente(id) {
  if (!requireWriteAccess()) return;
  const idx = state.demandas.findIndex((x) => x.id === id);
  if (idx < 0) return;
  const prev = normalizeClickup(state.demandas[idx].clickup);
  if (!prev?.completedAt || prev.retornoCienteAt) return;
  const now = new Date().toISOString();
  beginOwnDemandaWrite(id);
  const clickup = { ...prev, retornoCienteAt: now };
  const dem = migrateDemanda({ ...state.demandas[idx], clickup, updatedAt: now });
  state.demandas[idx] = dem;
  noteOwnDemandaWrite(id, now);
  if (clickupUiOverride?.id === id) clickupUiOverride = { id, clickup };
  saveState({ demanda: dem });
  renderBoard();
  if (editingDemandaOpenId === id) {
    syncDemClickupUi();
    syncDemandaModalAlerts();
  }
}

function normalizeClickup(c) {
  if (!c || typeof c !== "object") return null;
  const taskId = String(c.taskId || c.clickupTaskId || "").trim();
  const url = String(c.url || "").trim();
  if (!taskId && !url) return null;
  return {
    taskId,
    url,
    status: String(c.status || "").trim(),
    listId: String(c.listId || "").trim(),
    createdAt: c.createdAt || "",
    createdBy: String(c.createdBy || "").trim(),
    completedAt: c.completedAt || "",
    retornoCienteAt: c.retornoCienteAt || "",
    instrucoes: String(c.instrucoes || "").trim(),
  };
}

function normalizeHistoricoAlertaEntry(e) {
  if (!e || typeof e !== "object") return null;
  const texto = String(e.texto || "").trim();
  const at = e.at || e.createdAt || "";
  if (!texto || !at) return null;
  const kind = e.kind === ALERTA_KIND_SEM_ATRIB ? ALERTA_KIND_SEM_ATRIB : ALERTA_KIND_COLUNA;
  return {
    id: e.id || uid(),
    at,
    autor: String(e.autor || "").trim() || "Equipe",
    email: String(e.email || "").trim().toLowerCase(),
    texto,
    dias: Math.max(1, Math.min(30, Number(e.dias) || 1)),
    until: isoDatePart(e.until),
    kind,
    status: String(e.status || ""),
    ocultoNoComentario: !!e.ocultoNoComentario,
  };
}

function normalizeHistoricoAlertas(list) {
  if (!Array.isArray(list)) return [];
  const out = list.map(normalizeHistoricoAlertaEntry).filter(Boolean);
  if (out.length > HISTORICO_ALERTAS_LIMITE) return out.slice(out.length - HISTORICO_ALERTAS_LIMITE);
  return out;
}

function comentarioTextoFromHistoricoAlerta(e) {
  const texto = String(e?.texto || "").trim();
  if (!texto) return "";
  const dias = e.dias ? `Adiado por ${e.dias} dia(s)` : "Alerta adiado";
  const untilTxt = e.until ? ` — volta em ${formatDataISO(e.until)} se a fase não mudar.` : ".";
  return `${texto}\n\n${dias}${untilTxt}`;
}

function mergeHistoricoAlertasIntoComentarios(d) {
  const comments = normalizeComentarios(d?.comentarios);
  const hist = normalizeHistoricoAlertas(d?.historicoAlertas);
  if (!hist.length) return comments;
  for (const e of hist) {
    if (e.ocultoNoComentario) continue;
    const origem = String(e.texto || "").trim();
    if (!origem) continue;
    const already = comments.some((c) => String(c.texto || "").includes(origem));
    if (already) continue;
    const cmt = normalizeComentario({
      texto: comentarioTextoFromHistoricoAlerta(e),
      autor: e.autor,
      createdAt: e.at,
    });
    if (cmt) comments.push(cmt);
  }
  comments.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  return comments;
}

function syncHistoricoAlertasOcultos(hist, comments) {
  const cmts = normalizeComentarios(comments);
  return normalizeHistoricoAlertas(hist).map((e) => {
    const origem = String(e.texto || "").trim();
    if (!origem) return e;
    const still = cmts.some((c) => String(c.texto || "").includes(origem));
    return { ...e, ocultoNoComentario: !still };
  });
}

function buildEditorPresenceForLog() {
  return {
    email: getCurrentUserEmail() || "",
    autor: getLoggedInComentarioAutor(),
  };
}

function diffEditTracked(prev, next) {
  const out = [];
  for (const def of HISTORICO_EDICAO_CAMPOS) {
    const a = prev?.[def.campo];
    const b = next?.[def.campo];
    if (def.campo === "motivosAtrasoItens") {
      if (sameMotivosAtrasoItens(a, b)) continue;
    } else if (def.campo === "checklist") {
      if (sameChecklist(a, b)) continue;
    } else if (def.campo === "cidadesExtra") {
      if (sameCidadesExtra(a, b, next?.cidade || prev?.cidade)) continue;
    } else if (def.campo === "projetistasExtra") {
      if (sameProjetistasExtra(a, b, next?.responsavel || prev?.responsavel)) continue;
    } else if (sameTrackedValue(a, b)) {
      continue;
    }
    const fmt = def.format || ((v) => (v === "" || v == null ? "—" : String(v)));
    out.push({ campo: def.campo, label: def.label, de: fmt(a), para: fmt(b) });
  }
  const cmtPrev = Array.isArray(prev?.comentarios) ? prev.comentarios.length : 0;
  const cmtNext = Array.isArray(next?.comentarios) ? next.comentarios.length : 0;
  if (cmtNext > cmtPrev) {
    const delta = cmtNext - cmtPrev;
    out.push({ campo: "comentarios", label: "Comentários", de: `${cmtPrev}`, para: `${cmtNext} (+${delta})` });
  } else if (cmtNext < cmtPrev) {
    out.push({ campo: "comentarios", label: "Comentários", de: `${cmtPrev}`, para: `${cmtNext}` });
  }
  const histPrev = Array.isArray(prev?.historicoStatus) ? prev.historicoStatus : [];
  const histNext = Array.isArray(next?.historicoStatus) ? next.historicoStatus : [];
  if (!sameTimeline(histPrev, histNext)) {
    out.push({
      campo: "historicoStatus",
      label: "Tempo na esteira",
      de: `${histPrev.length} fase(s)`,
      para: `${histNext.length} fase(s)`,
    });
  }
  const custoPrev = JSON.stringify(prev?.custo || null);
  const custoNext = JSON.stringify(next?.custo || null);
  if (custoPrev !== custoNext) {
    out.push({ campo: "custo", label: "Levantamento de custo", de: "—", para: "atualizado" });
  }
  const pdfPrev = prev?.pdfLevantamento?.id || "";
  const pdfNext = next?.pdfLevantamento?.id || "";
  if (pdfPrev !== pdfNext) {
    out.push({
      campo: "pdfLevantamento",
      label: "PDF de levantamento",
      de: pdfPrev ? "Anexado" : "—",
      para: pdfNext ? next.pdfLevantamento?.name || "Anexado" : "—",
    });
  }
  return out;
}

function sameTrackedValue(a, b) {
  const norm = (v) => (v === undefined || v === null ? "" : String(v));
  return norm(a) === norm(b);
}

function sameChecklist(a, b) {
  const x = normalizeChecklist(a);
  const y = normalizeChecklist(b);
  if (x.length !== y.length) return false;
  for (let i = 0; i < x.length; i++) {
    if (x[i].id !== y[i].id) return false;
    if (x[i].name !== y[i].name) return false;
    if (x[i].descricao !== y[i].descricao) return false;
    if (x[i].who !== y[i].who) return false;
    if (x[i].dateInicio !== y[i].dateInicio) return false;
    if (x[i].date !== y[i].date) return false;
    if (x[i].done !== y[i].done) return false;
    if (x[i].status !== y[i].status) return false;
  }
  return true;
}

function sameTimeline(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] || {};
    const y = b[i] || {};
    if (x.status !== y.status) return false;
    if ((x.inicio || "") !== (y.inicio || "")) return false;
    if ((x.fim || "") !== (y.fim || "")) return false;
    if ((x.observacao || "") !== (y.observacao || "")) return false;
  }
  return true;
}

function appendHistoricoEdicao(target, entry) {
  if (!target || !entry) return target;
  const list = Array.isArray(target.historicoEdicoes) ? [...target.historicoEdicoes] : [];
  list.push(entry);
  if (list.length > HISTORICO_EDICAO_LIMITE) list.splice(0, list.length - HISTORICO_EDICAO_LIMITE);
  target.historicoEdicoes = list;
  return target;
}

function registrarCriacaoNoHistoricoEdicao(payload) {
  const entry = normalizeHistoricoEdicaoEntry({
    id: uid(),
    tipo: "criacao",
    at: payload.updatedAt || new Date().toISOString(),
    by: buildEditorPresenceForLog(),
    nota: "Demanda criada",
  });
  appendHistoricoEdicao(payload, entry);
}

function registrarEdicaoNoHistoricoEdicao(prev, next) {
  const alt = diffEditTracked(prev, next);
  if (!alt.length) return false;
  const entry = normalizeHistoricoEdicaoEntry({
    id: uid(),
    tipo: "edicao",
    at: next.updatedAt || new Date().toISOString(),
    by: buildEditorPresenceForLog(),
    alteracoes: alt,
  });
  appendHistoricoEdicao(next, entry);
  return true;
}

function formatComentarioData(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function formatComentarioRelativo(iso) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return min + " min";
  const h = Math.floor(min / 60);
  if (h < 24) return h + " h";
  const d = Math.floor(h / 24);
  if (d === 1) return "ontem";
  if (d < 7) return d + " dias";
  return formatComentarioData(iso);
}

function comentarioGrupoDia(iso) {
  const d = new Date(iso);
  const hoje = new Date();
  if (d.toDateString() === hoje.toDateString()) return "Hoje";
  const ontem = new Date(hoje);
  ontem.setDate(ontem.getDate() - 1);
  if (d.toDateString() === ontem.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function comentarioIniciais(autor) {
  const a = String(autor || "?").trim();
  const parts = a.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return a.slice(0, 2).toUpperCase();
}

function comentarioAvatarClass(autor) {
  const n = projetistaSlug(autor);
  if (n.includes("matheus")) return "comment-avatar--matheus";
  if (n.includes("vinicius")) return "comment-avatar--vinicius";
  if (n.includes("joao")) return "comment-avatar--joao";
  if (n.includes("daniel")) return "comment-avatar--daniel";
  if (n.includes("alberto")) return "comment-avatar--alberto";
  if (n.includes("rafael")) return "comment-avatar--rafael";
  return "comment-avatar--equipe";
}

function groupComentariosPorDia(items) {
  const sorted = [...items].sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));
  const groups = [];
  let lastLabel = null;
  for (const c of sorted) {
    const label = comentarioGrupoDia(c.createdAt);
    if (label !== lastLabel) {
      groups.push({ label, items: [] });
      lastLabel = label;
    }
    groups[groups.length - 1].items.push(c);
  }
  return groups;
}

/** Status de cada atividade do checklist. `done` continua gravado (card, cronograma, dashboard). */
const CHECKLIST_STATUS = [
  ["afazer", "A fazer"],
  ["andamento", "Em andamento"],
  ["concluida", "Concluída"],
];
const CHECKLIST_STATUS_LABEL = Object.fromEntries(CHECKLIST_STATUS);

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
    status,
    done: status === "concluida",
  };
}

function normalizeChecklist(list) {
  if (!Array.isArray(list)) return [];
  return list.map(normalizeChecklistItem).filter(Boolean);
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

/* ---------- UI: toast, confirm, tabs ---------- */
const toastEl = document.getElementById("toast");

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

initConfirmDialog();
initToastDialogHosts();

let state = defaultState();

const panels = {
  esteira: document.getElementById("panelEsteira"),
  dashboard: document.getElementById("panelDashboard"),
};

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
    b.setAttribute("aria-selected", on ? "true" : "false");
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

document.querySelectorAll(".tabs__btn[data-tab]").forEach((btn) => {
  if (btn.id === "btnTabEsteira") return;
  btn.addEventListener("click", () => switchMainTab(btn.dataset.tab));
});

document.getElementById("btnTabEsteira")?.addEventListener("click", (e) => {
  e.stopPropagation();
  const panel = document.getElementById("esteiraTabPanel");
  const willOpen = panel?.hidden !== false;
  setEsteiraTabMenuOpen(willOpen);
  if (willOpen) {
    setImportMenuOpen(false);
    setExportMenuOpen(false);
    setUserMenuOpen(false);
  }
  switchMainTab("esteira");
});

document.querySelectorAll("[data-esteira-linha]").forEach((btn) => {
  btn.addEventListener("click", () => {
    setActiveEsteiraCanal(btn.dataset.esteiraLinha);
    switchMainTab("esteira");
  });
});

updateEsteiraTabLabel();

/* ---------- Filters (esteira) ---------- */
initEsteiraFilters();

/* ---------- Arraste: rolagem horizontal automática na esteira ---------- */
const esteiraDragScroll = { active: false, x: 0, y: 0, raf: 0 };

function getEsteiraBoardsForDragScroll() {
  const panel = document.getElementById("panelEsteira");
  if (!panel || panel.hidden) return [];
  return [...panel.querySelectorAll(".board")].filter((el) => {
    if (el.closest("[hidden]")) return false;
    return el.scrollWidth > el.clientWidth + 4;
  });
}

function applyEsteiraBoardDragScroll(board, clientX, clientY) {
  const r = board.getBoundingClientRect();
  const edge = 72;
  const maxSpeed = 20;
  const yPad = 56;
  const xPad = 32;

  if (clientY < r.top - yPad || clientY > r.bottom + yPad) return;
  if (clientX < r.left - xPad || clientX > r.right + xPad) return;

  let speed = 0;
  if (clientX < r.left + edge) {
    const t = Math.max(0, Math.min(1, (clientX - r.left) / edge));
    speed = -maxSpeed * (1 - t);
  } else if (clientX > r.right - edge) {
    const t = Math.max(0, Math.min(1, (r.right - clientX) / edge));
    speed = maxSpeed * (1 - t);
  }

  if (!speed) return;
  const maxLeft = board.scrollWidth - board.clientWidth;
  if (speed < 0 && board.scrollLeft <= 0) return;
  if (speed > 0 && board.scrollLeft >= maxLeft) return;
  board.scrollLeft += speed;
}

function tickEsteiraDragScroll() {
  if (!esteiraDragScroll.active) return;
  const { x, y } = esteiraDragScroll;
  for (const board of getEsteiraBoardsForDragScroll()) {
    applyEsteiraBoardDragScroll(board, x, y);
  }
  esteiraDragScroll.raf = requestAnimationFrame(tickEsteiraDragScroll);
}

function onEsteiraDocumentDragOver(e) {
  if (!esteiraDragScroll.active) return;
  esteiraDragScroll.x = e.clientX;
  esteiraDragScroll.y = e.clientY;
}

function stopEsteiraBoardDragScroll() {
  esteiraDragScroll.active = false;
  if (esteiraDragScroll.raf) {
    cancelAnimationFrame(esteiraDragScroll.raf);
    esteiraDragScroll.raf = 0;
  }
  document.removeEventListener("dragover", onEsteiraDocumentDragOver, true);
  document.querySelectorAll(".card--dragging").forEach((c) => c.classList.remove("card--dragging"));
}

function startEsteiraBoardDragScroll() {
  if (esteiraDragScroll.active) return;
  esteiraDragScroll.active = true;
  document.addEventListener("dragover", onEsteiraDocumentDragOver, true);
  tickEsteiraDragScroll();
}

function initEsteiraBoardDragScroll() {
  const panel = document.getElementById("panelEsteira");
  if (!panel || panel.dataset.dragScrollInited) return;
  panel.dataset.dragScrollInited = "1";

  panel.addEventListener(
    "dragstart",
    (e) => {
      const from = e.target instanceof Element ? e.target : e.target?.parentElement;
      const card = from?.closest(".card[draggable='true']");
      if (!card || !panel.contains(card)) return;
      card.classList.add("card--dragging");
      startEsteiraBoardDragScroll();
    },
    true,
  );

  const endDrag = () => stopEsteiraBoardDragScroll();
  document.addEventListener("dragend", endDrag);
  document.addEventListener("drop", endDrag);
}

initEsteiraBoardDragScroll();

/* ---------- Board (fila geral + esteira unificada) ---------- */
const BOARD_ATRIBUIDOS = "*";

function filteredDemandasForEsteira(linha = activeEsteiraCanal, { rapido = true } = {}) {
  const f = readEsteiraFilters();
  if (!rapido) delete f.rapido;
  const tombstones = demandaDeleteTombstones();
  return state.demandas
    .filter((d) => !tombstones.has(d.id))
    .map(migrateDemanda)
    .filter((d) => inferLinhaEsteira(d) === normalizeLinhaEsteira(linha))
    .filter((d) => demandaMatchesEsteiraFilters(d, f));
}

function demandasForBoard(boardResponsavel, linha = activeEsteiraCanal) {
  const list = filteredDemandasForEsteira(linha);
  // Esteira única: demandas sem projetista ficam na coluna do seu status (com o selo "Não atribuído").
  if (boardResponsavel === BOARD_ATRIBUIDOS) return list;
  const alvo = normalizeResponsavel(boardResponsavel);
  if (alvo === "") return list.filter((d) => normalizeResponsavel(d.responsavel) === "");
  return list.filter((d) => d.responsavel === alvo);
}

function normalizeOrdemEsteira(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Chave de antiguidade na coluna: chegada → criação (mais antigo = menor). */
function demandaAntiguidadeKey(d) {
  const chegada = String(d?.dataChegada || "").trim();
  if (chegada) return chegada;
  const created = String(d?.createdAt || "").trim();
  if (created) return created.slice(0, 10) || created;
  return "";
}

/** Mais antigo no topo, mais novo no fim; empate por ordem manual e id. */
function compareDemandaEsteiraOrdem(a, b) {
  const ka = demandaAntiguidadeKey(a);
  const kb = demandaAntiguidadeKey(b);
  if (ka && kb && ka !== kb) return ka.localeCompare(kb);
  if (ka && !kb) return -1;
  if (!ka && kb) return 1;
  const oa = normalizeOrdemEsteira(a.ordemEsteira);
  const ob = normalizeOrdemEsteira(b.ordemEsteira);
  if (oa != null && ob != null && oa !== ob) return oa - ob;
  if (oa != null && ob == null) return -1;
  if (oa == null && ob != null) return 1;
  const ca = String(a.createdAt || "");
  const cb = String(b.createdAt || "");
  if (ca !== cb) return ca.localeCompare(cb);
  return String(a.id || "").localeCompare(String(b.id || ""));
}

function demandasNaColunaEsteira(dem, linha = activeEsteiraCanal) {
  const unassigned = !normalizeResponsavel(dem.responsavel);
  const pool = unassigned
    ? demandasForBoard("", linha)
    : demandasForBoard(BOARD_ATRIBUIDOS, linha).filter((d) => d.status === dem.status);
  return pool.slice().sort(compareDemandaEsteiraOrdem);
}

function maxOrdemNaColuna(status, responsavel) {
  const stub = { status, responsavel };
  let max = 0;
  for (const d of demandasNaColunaEsteira(stub)) {
    const o = normalizeOrdemEsteira(d.ordemEsteira);
    if (o != null && o > max) max = o;
  }
  return max;
}

function ordemAoEntrarColuna(status, responsavel) {
  return maxOrdemNaColuna(status, responsavel) + 10;
}

function renumberColumnOrdens(orderedList) {
  const now = new Date().toISOString();
  orderedList.forEach((d, i) => {
    d.ordemEsteira = (i + 1) * 10;
    d.updatedAt = now;
  });
  return orderedList;
}

function moveDemandaOrdemEsteira(demId, delta) {
  if (!requireWriteAccess()) return;
  const dem = state.demandas.find((x) => x.id === demId);
  if (!dem || !delta) return;
  const ageKey = demandaAntiguidadeKey(dem);
  const peers = demandasNaColunaEsteira(dem).filter((d) => demandaAntiguidadeKey(d) === ageKey);
  const idx = peers.findIndex((d) => d.id === demId);
  const target = idx + delta;
  if (idx < 0 || target < 0 || target >= peers.length) return;
  const ordered = peers.slice();
  const [item] = ordered.splice(idx, 1);
  ordered.splice(target, 0, item);
  renumberColumnOrdens(ordered);
  for (const d of ordered) applyCloudPatch({ demanda: migrateDemanda(d) });
  saveState();
  renderBoard();
  toast(delta < 0 ? "Card movido para cima" : "Card movido para baixo");
}

function handleDemandaDrop(dem, newStatus, boardResponsavel) {
  if (!requireWriteAccess()) return;
  if (!dem) return;
  const dm = migrateDemanda(dem);
  const alteraResponsavel = boardResponsavel !== BOARD_ATRIBUIDOS;
  const resp = alteraResponsavel ? normalizeResponsavel(boardResponsavel) : normalizeResponsavel(dem.responsavel);
  if (dem.status === newStatus && normalizeResponsavel(dem.responsavel) === resp) return;
  const now = new Date().toISOString();
  if (dem.status !== newStatus) {
    dem.status = newStatus;
    dem.historicoStatus = statusHistoryPush(dem, newStatus);
    if (isStatusConcluidoNoFormulario(newStatus, dm.linhaEsteira) && !dem.dataTermino) {
      dem.dataTermino = todayISODate();
    }
    dem.ordemEsteira = ordemAoEntrarColuna(newStatus, alteraResponsavel ? resp : dem.responsavel);
  }
  if (alteraResponsavel) dem.responsavel = resp;
  dem.updatedAt = now;
  invalidateAlertaSnoozeIfStale(dem);
  saveState({ demanda: dem });
  renderBoard();
  toast("Demanda atualizada");
}

function diasDesdeChegadaDemanda(d) {
  const dm = migrateDemanda(d);
  const iso = dm.dataChegada || (dm.createdAt || "").slice(0, 10);
  const a = parseDate(iso);
  const hoje = parseDate(todayISODate());
  if (a == null || hoje == null) return null;
  return Math.max(0, Math.round((hoje - a) / 86400000));
}

function diasNaColunaAtual(d) {
  const hist = Array.isArray(d.historicoStatus) ? d.historicoStatus : [];
  const status = d.status;
  let inicio = "";
  for (let i = hist.length - 1; i >= 0; i--) {
    const seg = hist[i];
    if (seg && seg.status === status) {
      inicio = isoDatePart(seg.inicio);
      break;
    }
  }
  if (!inicio) inicio = isoDatePart(d.updatedAt) || isoDatePart(d.createdAt) || isoDatePart(d.dataChegada);
  const a = parseDate(inicio);
  const hoje = parseDate(todayISODate());
  if (a == null || hoje == null) return null;
  return Math.max(0, Math.round((hoje - a) / 86400000));
}

function alertaSnoozeAtivo(d, kind) {
  const s = normalizeAlertaSnooze(d?.alertaSnooze);
  if (!s || s.kind !== kind) return false;
  const hoje = todayISODate();
  if (hoje >= s.until) return false;
  if (kind === ALERTA_KIND_SEM_ATRIB) {
    return !normalizeResponsavel(d.responsavel);
  }
  return s.status === d.status;
}

function invalidateAlertaSnoozeIfStale(d) {
  if (!d) return d;
  const s = normalizeAlertaSnooze(d.alertaSnooze);
  if (!s) {
    delete d.alertaSnooze;
    return d;
  }
  if (s.kind === ALERTA_KIND_SEM_ATRIB && normalizeResponsavel(d.responsavel)) {
    delete d.alertaSnooze;
    return d;
  }
  if (s.kind === ALERTA_KIND_COLUNA && s.status !== d.status) {
    delete d.alertaSnooze;
    return d;
  }
  d.alertaSnooze = s;
  return d;
}

function alertaEsteiraSortIndex(d, linha) {
  if (!normalizeResponsavel(d.responsavel)) return -1;
  const cfg = getEsteiraConfig(linha);
  const keys = [
    ...cfg.statusOrder.map(([k]) => k),
    ...(cfg.statusExtra || []).map(([k]) => k),
  ];
  const idx = keys.indexOf(d.status);
  return idx < 0 ? keys.length : idx;
}

function buildInboxAlertasRows(list, linha) {
  const rows = [];
  for (const raw of list) {
    const d = migrateDemanda(raw);
    if (clickupRetornoPendente(d)) {
      const cu = normalizeClickup(d.clickup);
      rows.push({
        severity: "ok",
        kind: ALERTA_KIND_CLICKUP_RETORNO,
        d,
        dias: 0,
        msg: "Retornou da Operação (concluída)",
        curta: "Retornou da Operação",
        meta: cu?.status ? `ClickUp: ${cu.status}` : "ClickUp",
      });
    }
    if (isStatusConcluidoDemanda(d) || isDemandaEncerrada(d)) continue;

    const semAtrib = !normalizeResponsavel(d.responsavel);
    if (semAtrib) {
      if (alertaSnoozeAtivo(d, ALERTA_KIND_SEM_ATRIB)) continue;
      const diasFila = diasDesdeChegadaDemanda(d);
      const extra = [];
      if (linha === LINHA_ESTEIRA_OPERACIONAL && normalizeTipo(d.tipo) === "B2C" && !d.segmentoB2c) {
        extra.push("B2C sem segmento");
      }
      if (linha === LINHA_ESTEIRA_B2B && normalizeTipo(d.tipo) === "B2B" && !d.produtoB2b) {
        extra.push("B2B sem produto");
      }
      const msg =
        diasFila != null
          ? `Sem projetista há ${diasFila} dia(s)`
          : "Sem projetista atribuído";
      rows.push({
        severity: "bad",
        kind: ALERTA_KIND_SEM_ATRIB,
        d,
        dias: diasFila ?? 0,
        msg: extra.length ? `${msg} · ${extra.join(" · ")}` : msg,
        curta: ["Sem projetista", ...extra].join(" · "),
        meta: `Chegou em ${formatDataISO(d.dataChegada || d.createdAt?.slice(0, 10))}`,
      });
      continue;
    }

    const diasCol = diasNaColunaAtual(d);
    if (diasCol != null && diasCol >= ALERTA_DIAS_MESMA_COLUNA) {
      if (alertaSnoozeAtivo(d, ALERTA_KIND_COLUNA)) continue;
      const fase = labelStatus(d.status, d.linhaEsteira);
      rows.push({
        severity: "coluna",
        kind: ALERTA_KIND_COLUNA,
        d,
        dias: diasCol,
        msg: `${diasCol} dia(s) em «${fase}»`,
        curta: `Parado em ${fase}`,
        meta: formatProjetistasDemanda(d) ? `Projetista: ${formatProjetistasDemanda(d)}` : "",
      });
    }
  }
  return rows.sort((a, b) => {
    if (a.kind === ALERTA_KIND_CLICKUP_RETORNO && b.kind !== ALERTA_KIND_CLICKUP_RETORNO) return -1;
    if (b.kind === ALERTA_KIND_CLICKUP_RETORNO && a.kind !== ALERTA_KIND_CLICKUP_RETORNO) return 1;
    const ia = alertaEsteiraSortIndex(a.d, linha);
    const ib = alertaEsteiraSortIndex(b.d, linha);
    if (ia !== ib) return ia - ib;
    return (b.dias ?? 0) - (a.dias ?? 0) || a.d.titulo.localeCompare(b.d.titulo, "pt-BR");
  });
}

/** Aba ativa do painel de alertas ("" = todos). */
let alertasFiltroKind = "";

const ALERTAS_ABAS = [
  { kind: ALERTA_KIND_SEM_ATRIB, label: "Sem projetista", tom: "bad" },
  { kind: ALERTA_KIND_COLUNA, label: "Parados", tom: "coluna" },
  { kind: ALERTA_KIND_CLICKUP_RETORNO, label: "Retornos", tom: "ok" },
];

function renderInboxAlertas(linha = activeEsteiraCanal) {
  const el = document.getElementById("esteiraInboxAlertas");
  if (!el) return;
  const list = filteredDemandasForEsteira(linha, { rapido: false });
  const rows = buildInboxAlertasRows(list, linha);
  syncNotifBadge(rows);
  const canal = linha === LINHA_ESTEIRA_B2B ? "Esteira B2B" : "Esteira Projetos";
  const head = (extra = "") =>
    `<div class="inbox-alertas__head"><h4 class="inbox-alertas__title">Alertas${extra}</h4>` +
    `<span class="inbox-alertas__canal">${canal}${esteiraFiltrosAtivosCount() ? " · com filtros" : ""}</span>` +
    `<span class="inbox-alertas__ajuda" tabindex="0" title="Vermelho: sem projetista. Laranja: ${ALERTA_DIAS_MESMA_COLUNA}+ dias na mesma coluna. Verde: retornou da Operação.&#10;Adiar registra um comentário e silencia o alerta por alguns dias. Ciente tira o retorno da lista." aria-label="Como funcionam os alertas">?</span></div>`;

  if (!rows.length) {
    el.innerHTML =
      `<div class="inbox-alertas inbox-alertas--vazio">${head()}` +
      `<div class="inbox-alertas__tudo-ok"><span class="inbox-alertas__ok-ico" aria-hidden="true">✓</span>` +
      `<strong>Tudo em dia</strong><span class="muted small">${
        list.length
          ? `${list.length} demanda(s) sem alertas no momento.`
          : esteiraFiltrosAtivosCount()
            ? "Nenhuma demanda com estes filtros."
            : "Nenhuma demanda nesta esteira."
      }</span></div></div>`;
    return;
  }

  const contagem = Object.fromEntries(ALERTAS_ABAS.map((a) => [a.kind, rows.filter((r) => r.kind === a.kind).length]));
  if (alertasFiltroKind && !contagem[alertasFiltroKind]) alertasFiltroKind = "";
  const visiveis = alertasFiltroKind ? rows.filter((r) => r.kind === alertasFiltroKind) : rows;
  const temVermelho = rows.some((r) => r.severity === "bad");
  const abas =
    `<div class="inbox-alertas__abas" role="tablist" aria-label="Filtrar alertas">` +
    `<button type="button" role="tab" class="alerta-aba${alertasFiltroKind ? "" : " is-active"}" data-alerta-aba="" aria-selected="${!alertasFiltroKind}">Todos <b>${rows.length}</b></button>` +
    ALERTAS_ABAS.filter((a) => contagem[a.kind])
      .map(
        (a) =>
          `<button type="button" role="tab" class="alerta-aba alerta-aba--${a.tom}${alertasFiltroKind === a.kind ? " is-active" : ""}" data-alerta-aba="${a.kind}" aria-selected="${alertasFiltroKind === a.kind}">` +
          `<i aria-hidden="true"></i>${escapeHtml(a.label)} <b>${contagem[a.kind]}</b></button>`,
      )
      .join("") +
    `</div>`;

  const ro = isReadOnlyUser();
  const items = visiveis
    .map((r) => {
      const dias =
        r.kind === ALERTA_KIND_CLICKUP_RETORNO
          ? `<span class="alerta__dias alerta__dias--ico" aria-hidden="true">✓</span>`
          : `<span class="alerta__dias" title="${escapeHtml(r.msg)}"><b>${r.dias}</b><small>${r.dias === 1 ? "dia" : "dias"}</small></span>`;
      const acao = ro
        ? ""
        : r.kind === ALERTA_KIND_CLICKUP_RETORNO
          ? `<button type="button" class="alerta__acao" data-alerta-ciente="${escapeHtml(r.d.id)}" title="Marcar como ciente" aria-label="Marcar ${escapeHtml(r.d.titulo)} como ciente"><span aria-hidden="true">✓</span> Ciente</button>`
          : `<button type="button" class="alerta__acao" data-alerta-snooze="${escapeHtml(r.d.id)}" data-kind="${escapeHtml(r.kind)}" title="Registrar e silenciar por alguns dias" aria-label="Adiar alerta de ${escapeHtml(r.d.titulo)}"><span aria-hidden="true">⏰</span> Adiar</button>`;
      return (
        `<li class="alerta alerta--${r.severity}">` +
        `<button type="button" class="alerta__abrir" data-alerta-abrir="${escapeHtml(r.d.id)}" title="Abrir projeto">` +
        dias +
        `<span class="alerta__txt"><span class="alerta__titulo" title="${escapeHtml(r.d.titulo)}">${escapeHtml(r.d.titulo)}</span>` +
        `<span class="alerta__msg">${escapeHtml(r.curta || r.msg)}</span>` +
        (r.meta ? `<span class="alerta__meta">${escapeHtml(r.meta)}</span>` : "") +
        `</span></button>` +
        acao +
        `</li>`
      );
    })
    .join("");

  el.innerHTML =
    '<div class="inbox-alertas">' +
    head(` <span class="inbox-alertas__count${temVermelho ? " inbox-alertas__count--bad" : ""}">${rows.length}</span>`) +
    abas +
    `<ul class="inbox-alertas__list">${items}</ul></div>`;

  el.querySelectorAll("[data-alerta-aba]").forEach((btn) => {
    btn.addEventListener("click", () => {
      alertasFiltroKind = btn.dataset.alertaAba;
      renderInboxAlertas(linha);
    });
  });
  el.querySelectorAll("[data-alerta-abrir]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setNotifAberto(false);
      openDemandaModal(btn.dataset.alertaAbrir);
    });
  });
  el.querySelectorAll("[data-alerta-snooze]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const row = rows.find((r) => r.d.id === btn.dataset.alertaSnooze && r.kind === btn.dataset.kind);
      if (!row) return;
      setNotifAberto(false);
      openAlertaSnoozeModal(row);
    });
  });
  el.querySelectorAll("[data-alerta-ciente]").forEach((btn) => {
    btn.addEventListener("click", () => marcarClickupRetornoCiente(btn.dataset.alertaCiente));
  });
}

/* ---------- Sininho de alertas (topo) ---------- */
let notifUltimaContagem = null;

function syncNotifBadge(rows) {
  const badge = document.getElementById("notifBadge");
  const btn = document.getElementById("btnNotif");
  if (!badge || !btn) return;
  const n = rows.length;
  const temVermelho = rows.some((r) => r.severity === "bad");
  badge.hidden = n === 0;
  badge.textContent = n > 99 ? "99+" : String(n);
  badge.classList.toggle("notif__badge--bad", temVermelho);
  btn.classList.toggle("tem-alertas", n > 0);
  btn.title = n ? `${n} alerta(s)` : "Nenhum alerta";
  btn.setAttribute("aria-label", btn.title);
  if (notifUltimaContagem != null && n > notifUltimaContagem) {
    btn.classList.remove("is-novo");
    void btn.offsetWidth;
    btn.classList.add("is-novo");
  }
  notifUltimaContagem = n;
}

function setNotifAberto(aberto) {
  const panel = document.getElementById("notifPanel");
  const btn = document.getElementById("btnNotif");
  if (!panel || !btn) return;
  panel.hidden = !aberto;
  btn.setAttribute("aria-expanded", aberto ? "true" : "false");
  btn.classList.toggle("is-open", aberto);
  if (aberto) renderInboxAlertas(activeEsteiraCanal);
}

function initNotifMenu() {
  const menu = document.getElementById("notifMenu");
  const btn = document.getElementById("btnNotif");
  const panel = document.getElementById("notifPanel");
  if (!menu || !btn || !panel) return;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    setNotifAberto(panel.hidden);
  });
  // composedPath: as abas re-renderizam o painel, então o alvo do clique já pode ter saído do DOM.
  document.addEventListener("click", (e) => {
    if (!panel.hidden && !e.composedPath().includes(menu)) setNotifAberto(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !panel.hidden) {
      setNotifAberto(false);
      btn.focus();
    }
  });
}

initNotifMenu();

let alertaSnoozeCtx = null;

function syncAlertaSnoozeUntilHint() {
  const hint = document.getElementById("alertaSnoozeUntilHint");
  const diasEl = document.getElementById("alertaSnoozeDias");
  if (!hint || !diasEl) return;
  const dias = Math.max(1, Math.min(30, Number(diasEl.value) || ALERTA_SNOOZE_DIAS_PADRAO));
  const until = addDaysISO(todayISODate(), dias);
  hint.textContent = until
    ? `O alerta some da lista hoje e só volta em ${formatDataISO(until)} se a demanda ainda estiver na mesma situação.`
    : "";
}

function openAlertaSnoozeModal(row) {
  const dlg = document.getElementById("modalAlertaSnooze");
  if (!dlg || !row?.d) return;
  alertaSnoozeCtx = {
    id: row.d.id,
    kind: row.kind,
    status: row.d.status,
    titulo: row.d.titulo,
    msg: row.msg,
  };
  const titleEl = document.getElementById("alertaSnoozeDemandaTitulo");
  const resumoEl = document.getElementById("alertaSnoozeResumo");
  const textoEl = document.getElementById("alertaSnoozeTexto");
  const diasEl = document.getElementById("alertaSnoozeDias");
  if (titleEl) titleEl.textContent = row.d.titulo;
  if (resumoEl) resumoEl.textContent = row.msg;
  if (diasEl) diasEl.value = String(ALERTA_SNOOZE_DIAS_PADRAO);
  if (textoEl) textoEl.value = "";
  syncAlertaSnoozeUntilHint();
  dlg.showModal();
  requestAnimationFrame(() => textoEl?.focus());
}

function closeAlertaSnoozeModal() {
  alertaSnoozeCtx = null;
  document.getElementById("modalAlertaSnooze")?.close();
}

function aplicarAlertaSnooze() {
  if (!requireWriteAccess()) return;
  const ctx = alertaSnoozeCtx;
  if (!ctx?.id) return;
  const dem = state.demandas.find((x) => x.id === ctx.id);
  if (!dem) {
    toast("Demanda não encontrada");
    return;
  }
  const diasEl = document.getElementById("alertaSnoozeDias");
  const textoEl = document.getElementById("alertaSnoozeTexto");
  const dias = Math.max(1, Math.min(30, Number(diasEl?.value) || ALERTA_SNOOZE_DIAS_PADRAO));
  const texto = String(textoEl?.value || "").trim();
  if (!texto) {
    toast("Escreva o registro de ciência");
    textoEl?.focus();
    return;
  }
  const now = new Date().toISOString();
  const until = addDaysISO(todayISODate(), dias);
  const autor = getLoggedInComentarioAutor();
  const email = getCurrentUserEmail() || "";
  const entry = normalizeHistoricoAlertaEntry({
    id: uid(),
    at: now,
    autor,
    email,
    texto,
    dias,
    until,
    kind: ctx.kind,
    status: dem.status,
  });
  const hist = normalizeHistoricoAlertas(dem.historicoAlertas);
  hist.push(entry);
  dem.historicoAlertas = hist;
  dem.alertaSnooze = {
    kind: ctx.kind,
    status: dem.status,
    until,
    dias,
    at: now,
    autor,
    email,
    texto,
  };
  const cmt = normalizeComentario({
    texto: `${texto}\n\nAlerta adiado por ${dias} dia(s) — volta em ${formatDataISO(until)} se a fase não mudar.`,
    autor,
    createdAt: now,
  });
  if (cmt) dem.comentarios = [cmt, ...normalizeComentarios(dem.comentarios)];
  dem.updatedAt = now;
  if (editingDemandaOpenId === dem.id) {
    if (cmt) {
      editingComentarios = [cmt, ...normalizeComentarios(editingComentarios)];
      renderComentariosList();
    }
    editingDemandaBaselineUpdatedAt = now;
  }
  noteOwnDemandaWrite(dem.id, now);
  saveState({ demanda: migrateDemanda(dem) });
  closeAlertaSnoozeModal();
  renderBoard();
  toast(`Alerta adiado até ${formatDataISO(until)}`);
}

function initAlertaSnoozeModal() {
  const dlg = document.getElementById("modalAlertaSnooze");
  if (!dlg) return;
  document.getElementById("alertaSnoozeClose")?.addEventListener("click", closeAlertaSnoozeModal);
  document.getElementById("alertaSnoozeCancel")?.addEventListener("click", closeAlertaSnoozeModal);
  document.getElementById("alertaSnoozeOk")?.addEventListener("click", aplicarAlertaSnooze);
  document.getElementById("alertaSnoozeAbrir")?.addEventListener("click", () => {
    const id = alertaSnoozeCtx?.id;
    closeAlertaSnoozeModal();
    if (id) openDemandaModal(id);
  });
  document.getElementById("alertaSnoozeDias")?.addEventListener("input", () => {
    syncAlertaSnoozeUntilHint();
  });
  dlg.addEventListener("close", () => {
    alertaSnoozeCtx = null;
  });
}

initAlertaSnoozeModal();

/**
 * Captura o scroll do board e de cada coluna ANTES de re-renderizar
 * e devolve um restaurador para chamar DEPOIS. Evita que ações como
 * abrir/fechar um card (que disparam onSnapshot do Firestore) joguem
 * a página de volta ao topo.
 */
function preserveBoardScroll(boardEl) {
  if (!boardEl) return () => {};
  const scrollLeft = boardEl.scrollLeft || 0;
  const scrollTop = boardEl.scrollTop || 0;
  const colScrolls = new Map();
  boardEl.querySelectorAll(".column").forEach((col) => {
    const key = col.dataset.status || col.className || "";
    const body = col.querySelector(".column__body");
    if (body) colScrolls.set(key, body.scrollTop || 0);
  });
  return function restore() {
    boardEl.scrollLeft = scrollLeft;
    boardEl.scrollTop = scrollTop;
    boardEl.querySelectorAll(".column").forEach((col) => {
      const key = col.dataset.status || col.className || "";
      if (!colScrolls.has(key)) return;
      const body = col.querySelector(".column__body");
      if (body) body.scrollTop = colScrolls.get(key);
    });
  };
}

/** Flags ▲▼ só entre cards com a mesma data de chegada (ordem fina). */
function buildCardMoveFlagsMap(list) {
  const flags = Object.create(null);
  const byKey = Object.create(null);
  for (const d of list) {
    const key = demandaAntiguidadeKey(d) || "__";
    if (!byKey[key]) byKey[key] = [];
    byKey[key].push(d);
  }
  for (const peers of Object.values(byKey)) {
    peers.forEach((d, j) => {
      flags[d.id] = { canMoveUp: j > 0, canMoveDown: j < peers.length - 1 };
    });
  }
  return flags;
}

function renderBoardInto(boardEl, boardResponsavel, linha = activeEsteiraCanal) {
  const cfg = getEsteiraConfig(linha);
  const cols = visibleEsteiraStatusKeys(linha);
  const visibleSet = new Set(cols);
  const byCol = Object.fromEntries(cols.map((k) => [k, []]));
  for (const d of demandasForBoard(boardResponsavel, linha)) {
    const st = visibleSet.has(d.status) ? d.status : null;
    if (!st) continue; // não monta cards de colunas ocultas (ex.: finalizados no modo ativos)
    byCol[st].push(d);
  }
  const restoreScroll = preserveBoardScroll(boardEl);
  boardEl.innerHTML = "";
  boardEl.classList.toggle("board--finalizados", esteiraModoColunas === ESTEIRA_MODO_FINALIZADOS);
  boardEl.classList.toggle("board--modo-todos", esteiraModoColunas === ESTEIRA_MODO_TODOS);
  if (!cols.length) {
    const empty = document.createElement("p");
    empty.className = "muted esteira-empty-modo";
    empty.textContent = "Nenhuma coluna neste modo.";
    boardEl.appendChild(empty);
    restoreScroll();
    return;
  }
  const frag = document.createDocumentFragment();
  for (const key of cols) {
    const col = document.createElement("div");
    col.className = "column" + (statusFinalizadosKeys(linha).includes(key) ? " column--finalizado" : "");
    col.dataset.status = key;
    // Sem projetista primeiro (novas demandas chamam atenção), depois a ordem normal da coluna.
    const list = (byCol[key] || [])
      .slice()
      .sort(
        (a, b) =>
          Number(Boolean(normalizeResponsavel(a.responsavel))) - Number(Boolean(normalizeResponsavel(b.responsavel))) ||
          compareDemandaEsteiraOrdem(a, b),
      );
    const moveFlags = buildCardMoveFlagsMap(list);
    col.innerHTML = columnHeadHtml(key, linha, list.length, list) + `<div class="column__body"></div>`;
    const body = col.querySelector(".column__body");
    col.addEventListener("dragover", (e) => { e.preventDefault(); col.classList.add("drag-over"); });
    col.addEventListener("dragleave", () => col.classList.remove("drag-over"));
    col.addEventListener("drop", (e) => {
      e.preventDefault();
      col.classList.remove("drag-over");
      const id = e.dataTransfer.getData("text/plain");
      const dem = state.demandas.find((x) => x.id === id);
      handleDemandaDrop(dem, key, boardResponsavel);
    });
    const cardFrag = document.createDocumentFragment();
    list.forEach((d) => {
      cardFrag.appendChild(renderCard(d, moveFlags[d.id] || { canMoveUp: false, canMoveDown: false }));
    });
    body.appendChild(cardFrag);
    if (!list.length) body.innerHTML = columnVazioHtml();
    frag.appendChild(col);
  }
  boardEl.appendChild(frag);
  restoreScroll();
}

function renderBoard() {
  const linha = activeEsteiraCanal;
  esteiraModoColunas = readEsteiraModoColunas();
  updateEsteiraModoHints();
  const viewOp = document.getElementById("esteiraViewOperacional");
  const viewB2b = document.getElementById("esteiraViewB2b");
  if (viewOp) viewOp.hidden = linha !== LINHA_ESTEIRA_OPERACIONAL;
  if (viewB2b) viewB2b.hidden = linha !== LINHA_ESTEIRA_B2B;
  const esteira = document.getElementById(linha === LINHA_ESTEIRA_B2B ? "boardEsteiraB2b" : "boardEsteira");
  if (esteira) renderBoardInto(esteira, BOARD_ATRIBUIDOS, linha);
  renderInboxAlertas(linha);
  updateEsteiraStatusLine();
}

function setEsteiraTabMenuOpen(open) {
  setDropdownMenuOpen("esteiraTabPanel", "btnTabEsteira", open);
}

function updateTopbarTitle(tab) {
  const el = document.getElementById("topbarTitle");
  if (!el) return;
  const current = tab || document.querySelector(".tabs__btn.is-active")?.dataset.tab || "esteira";
  if (current === "dashboard") el.textContent = "Dashboard";
  else if (current === "usuarios") el.textContent = "Usuários";
  else el.textContent = activeEsteiraCanal === LINHA_ESTEIRA_B2B ? "Esteira B2B" : "Esteira Projetos";
}

function updateEsteiraTabLabel() {
  const el = document.getElementById("esteiraTabLabel");
  if (!el) return;
  const nome = activeEsteiraCanal === LINHA_ESTEIRA_B2B ? "Esteira B2B" : "Esteira Projetos";
  el.textContent = activeEsteiraCanal === LINHA_ESTEIRA_B2B ? "· B2B" : "· Projetos";
  const tab = document.getElementById("btnTabEsteira");
  if (tab) {
    tab.dataset.tip = nome;
    tab.setAttribute("aria-label", nome);
  }
  document.querySelectorAll("[data-esteira-linha]").forEach((item) => {
    item.classList.toggle("is-active", item.dataset.esteiraLinha === activeEsteiraCanal);
  });
  updateTopbarTitle("esteira");
}

function setActiveEsteiraCanal(linha) {
  activeEsteiraCanal = normalizeLinhaEsteira(linha);
  setEsteiraTabMenuOpen(false);
  updateEsteiraTabLabel();
  fillFilterProjetistaSelect(activeEsteiraCanal);
  syncEsteiraFiltroTipoProduto(activeEsteiraCanal);
  updateEsteiraModoHints();
  const panelEsteira = document.getElementById("panelEsteira");
  if (panelEsteira && !panelEsteira.hidden) renderBoard();
}

function getUserHomePreference(user) {
  if (window.DemandasUserHome?.resolve) {
    return window.DemandasUserHome.resolve(user);
  }
  return { tab: "esteira", esteira: LINHA_ESTEIRA_OPERACIONAL };
}

/** Tela inicial após login conforme e-mail em user-home.js */
function applyUserRegionalFilter(user) {
  const email = String(user?.email || "")
    .trim()
    .toLowerCase();
  const sel = document.getElementById("filterRegional");
  if (!sel) return;
  const preferred =
    typeof DemandasRoles !== "undefined" && DemandasRoles.regionalForEmail
      ? DemandasRoles.regionalForEmail(email)
      : "";
  const reg = preferred && REGIONAIS_ORDER.includes(preferred) ? preferred : "";
  sel.value = reg;
  fillFilterCidadeSelect(reg);
}

function applyUserHomeOnLogin(user) {
  const home = getUserHomePreference(user);
  applyUserRegionalFilter(user);
  if (home.tab === "esteira") {
    setActiveEsteiraCanal(home.esteira || LINHA_ESTEIRA_OPERACIONAL);
    switchMainTab("esteira");
    renderBoard();
    return;
  }
  if (panels[home.tab]) {
    switchMainTab(home.tab);
    return;
  }
  setActiveEsteiraCanal(LINHA_ESTEIRA_OPERACIONAL);
  switchMainTab("esteira");
  renderBoard();
}

/** Cards com o painel de detalhes aberto — sobrevive aos re-renders do board. */
const cardsExpandidos = new Set();

const CARD_ICONS = {
  relogio:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8.5" r="5.5"/><path d="M8 5.5v3l2 1.5M6.5 1.5h3"/></svg>',
  tarefas:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="2.5"/><path d="M5 8.2l2 2 4-4.2"/></svg>',
  comentario:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z"/></svg>',
  imagem:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3" width="12" height="10" rx="1.5"/><circle cx="6" cy="6.5" r="1.2"/><path d="M2.5 12l3.5-3.5 2.5 2.5 2-2 3 3"/></svg>',
  pino:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 14.5s4.5-4.2 4.5-7.7a4.5 4.5 0 0 0-9 0c0 3.5 4.5 7.7 4.5 7.7z"/><circle cx="8" cy="6.8" r="1.6"/></svg>',
};

/** Próxima coluna do fluxo (sem pausado/reprovado); execução regional/terceirizada são alternativas. */
const CARD_PROXIMA_ETAPA_FIXA = {
  [LINHA_ESTEIRA_OPERACIONAL]: { execucao: "configuracao_op", execucao_terceirizada: "configuracao_op" },
  [LINHA_ESTEIRA_B2B]: { configuracao: "documentacao", execucao_terceirizada: "documentacao" },
};

function cardProximaEtapa(dm) {
  const linha = normalizeLinhaEsteira(dm.linhaEsteira);
  if (isDemandaEncerrada(dm) || dm.status === "pausado" || dm.status === "reprovado") return "";
  const fixa = CARD_PROXIMA_ETAPA_FIXA[linha]?.[dm.status];
  if (fixa) return fixa;
  const fluxo = getEsteiraConfig(linha)
    .statusOrder.map(([k]) => k)
    .filter((k) => k !== "pausado" && k !== "reprovado");
  const idx = fluxo.indexOf(dm.status);
  return idx >= 0 && idx < fluxo.length - 1 ? fluxo[idx + 1] : "";
}

/** Barra de prazo: chegada → prazo previsto, colorida pela urgência. */
function cardPrazoInfo(dm) {
  const prazo = dm.dataFimPrevista;
  if (!prazo || !parseDate(prazo)) return null;
  if (isDemandaEncerrada(dm)) {
    if (dm.status === "reprovado") return null;
    const atraso = demandaDiasAtraso(dm);
    return atraso > 0
      ? { tom: "atraso", pct: 100, texto: `Entregue com ${formatDiasAtrasoLabel(atraso)} de atraso` }
      : { tom: "ok", pct: 100, texto: "Entregue no prazo" };
  }
  if (isAtraso(dm)) {
    return { tom: "atraso", pct: 100, texto: `Atrasado ${formatDiasAtrasoLabel(demandaDiasAtraso(dm))}` };
  }
  const hoje = todayISODate();
  const restam = diasEntreDatasISO(hoje, prazo);
  const inicio = demandaInicioContagemAberto(dm);
  const total = inicio ? diasEntreDatasISO(inicio, prazo) : 0;
  const passados = inicio ? diasEntreDatasISO(inicio, hoje) : 0;
  const pct = total > 0 ? Math.min(100, Math.max(4, Math.round((passados / total) * 100))) : 100;
  const texto = restam <= 0 ? "Vence hoje" : restam === 1 ? "Vence amanhã" : `Vence em ${restam} dias`;
  return { tom: restam <= 3 ? "alerta" : "ok", pct, texto };
}

function cardDetalheRow(label, valor) {
  return `<dt>${escapeHtml(label)}</dt><dd title="${escapeHtml(valor)}">${escapeHtml(valor)}</dd>`;
}

function renderCard(d, { canMoveUp = false, canMoveDown = false } = {}) {
  const el = document.createElement("article");
  const dmCard = migrateDemanda(d);
  const readOnly = isReadOnlyUser();
  const expandido = cardsExpandidos.has(d.id);
  el.className =
    "card " +
    tipoCardClass(d.tipo) +
    (dmCard.linhaEsteira === LINHA_ESTEIRA_B2B ? " card--b2b" : " card--esteira-projetos");
  if (isAtraso(d) && !isDemandaEncerrada(dmCard)) el.classList.add("card--atraso");
  if (d.status === "pausado") el.classList.add("card--pausado");
  if (d.status === "reprovado") el.classList.add("card--reprovado");
  if (normalizeEditingBy(d.editingBy)) {
    el.classList.add("card--being-edited");
  }
  if (expandido) el.classList.add("card--expandido");
  el.draggable = !readOnly;
  el.dataset.id = d.id;
  el.tabIndex = 0;
  el.setAttribute("role", "button");
  el.setAttribute("aria-label", `Abrir projeto ${d.titulo || ""}`.trim());
  if (!readOnly && (canMoveUp || canMoveDown)) {
    el.setAttribute("aria-keyshortcuts", "Alt+ArrowUp Alt+ArrowDown");
  }
  if (readOnly) el.classList.add("card--readonly");
  el.addEventListener("dragstart", (e) => {
    const from = e.target instanceof Element ? e.target : e.target?.parentElement;
    if (isReadOnlyUser()) {
      e.preventDefault();
      return;
    }
    if (from?.closest(".card__prio, .card__acoes")) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData("text/plain", d.id);
    e.dataTransfer.effectAllowed = "move";
    // Depois do snapshot da imagem de arraste: o card de origem vira "fantasma".
    setTimeout(() => el.classList.add("card--drag-source"), 0);
  });
  el.addEventListener("dragend", () => el.classList.remove("card--drag-source"));
  el.addEventListener("click", (e) => {
    const from = e.target instanceof Element ? e.target : e.target?.parentElement;
    if (from?.closest(".card__prio, .card__acoes")) return;
    openDemandaModal(d.id);
  });
  el.addEventListener("keydown", (e) => {
    if (e.target !== el) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openDemandaModal(d.id);
      return;
    }
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown") && !isReadOnlyUser()) {
      e.preventDefault();
      const dir = e.key === "ArrowUp" ? -1 : 1;
      if ((dir < 0 && !canMoveUp) || (dir > 0 && !canMoveDown)) return;
      moveDemandaOrdemEsteira(d.id, dir);
      focusCardById(d.id);
    }
  });

  const tipo = normalizeTipo(d.tipo);
  const produtoHtml =
    tipo === "B2B" && dmCard.produtoB2b
      ? `<span class="badge badge--produto-b2b">${escapeHtml(dmCard.produtoB2b)}</span>`
      : "";
  const segmentoHtml =
    tipo === "B2C" && dmCard.segmentoB2c
      ? `<span class="badge badge--segmento-b2c">${escapeHtml(dmCard.segmentoB2c)}</span>`
      : "";
  const prioHtml = readOnly
    ? ""
    : `<div class="card__prio" title="Ajuste fino na coluna (mesma data de chegada)">` +
      `<button type="button" class="card-prio-btn" data-dir="-1" aria-label="Subir na coluna"${canMoveUp ? "" : " disabled"}>▲</button>` +
      `<button type="button" class="card-prio-btn" data-dir="1" aria-label="Descer na coluna"${canMoveDown ? "" : " disabled"}>▼</button>` +
      `</div>`;

  const statusTxt = (d.statusAtual || "").trim();
  const statusTxtHtml = statusTxt ? `<p class="card__status-atual">${escapeHtml(statusTxt)}</p>` : "";

  const prazo = cardPrazoInfo(dmCard);
  const prazoHtml = prazo
    ? `<div class="card__prazo card__prazo--${prazo.tom}" title="Prazo previsto: ${escapeHtml(formatDataCurta(dmCard.dataFimPrevista))}">` +
      `<div class="card__prazo-bar"><span style="width:${prazo.pct}%"></span></div>` +
      `<p class="card__prazo-txt">${escapeHtml(prazo.texto)}</p>` +
      `</div>`
    : "";

  const snoozeAtivo =
    alertaSnoozeAtivo(dmCard, ALERTA_KIND_SEM_ATRIB) || alertaSnoozeAtivo(dmCard, ALERTA_KIND_COLUNA);
  const diasColuna = diasNaColunaAtual(dmCard);
  const mostraColunaAlerta =
    !snoozeAtivo &&
    !isStatusConcluidoDemanda(dmCard) &&
    !isDemandaEncerrada(dmCard) &&
    normalizeResponsavel(dmCard.responsavel) &&
    diasColuna != null &&
    diasColuna >= ALERTA_DIAS_MESMA_COLUNA;
  if (mostraColunaAlerta) el.classList.add("card--coluna-alerta");
  const colunaAlertaHtml = mostraColunaAlerta
    ? `<p class="card__coluna-alerta"><strong>${escapeHtml(String(diasColuna))} dia(s)</strong> nesta coluna</p>`
    : "";

  const respNomes = demandaProjetistasList(d);
  const pessoaHtml = respNomes.length
    ? cardPessoasHtml(respNomes)
    : `<span class="badge badge--pend">${escapeHtml(labelProjetista(d.responsavel))}</span>`;
  const cidades = formatCidadesDemanda(d);
  const cidadeHtml = cidades
    ? `<span class="card__cidade" title="${escapeHtml(cidades)}">${CARD_ICONS.pino}<span>${escapeHtml(cidades)}</span></span>`
    : "";

  const checklist = normalizeChecklist(dmCard.checklist);
  const feitas = checklist.filter((it) => it.done).length;
  const nComent = Array.isArray(dmCard.comentarios) ? dmCard.comentarios.length : 0;
  const nImg = Array.isArray(dmCard.imagens) ? dmCard.imagens.length : 0;
  const diasAberto = demandaDiasAberto(d);
  const diasAbertoTitle = isStatusConcluidoDemanda(dmCard)
    ? "Dias aberto até a conclusão"
    : dmCard.status === "reprovado"
      ? "Dias aberto até a reprovação"
      : "Dias desde a chegada — atualiza diariamente";
  const stats = [];
  if (demandaInicioContagemAberto(dmCard)) {
    stats.push(`<span class="card__stat" title="${diasAbertoTitle}">${CARD_ICONS.relogio}${diasAberto}d</span>`);
  }
  if (nComent) stats.push(`<span class="card__stat" title="${nComent} comentário(s)">${CARD_ICONS.comentario}${nComent}</span>`);
  if (nImg) stats.push(`<span class="card__stat" title="${nImg} imagem(ns)">${CARD_ICONS.imagem}${nImg}</span>`);

  const proxima = cardProximaEtapa(dmCard);
  const proximaLabel = proxima ? labelStatus(proxima, dmCard.linhaEsteira) : "";
  const podeAvancar = !readOnly && proxima && normalizeResponsavel(dmCard.responsavel);
  const avancarHtml = podeAvancar
    ? `<button type="button" class="card__avancar" title="Mover para ${escapeHtml(proximaLabel)}">Avançar ▸</button>`
    : "";

  let solicitante = (d.solicitante || "").trim();
  if (solicitante && dmCard.setorSolicitanteB2b) solicitante += ` (${dmCard.setorSolicitanteB2b})`;
  const pendente = checklist.find((it) => !it.done);

  // Progresso do checklist: um segmento por atividade, colorido pelo status, e a próxima atividade abaixo.
  let checklistHtml = "";
  if (checklist.length) {
    const segs = checklist
      .map((it) => {
        const sit = checklistItemSituacao(it);
        return `<span class="card__ck-seg is-${sit.tom}" title="${escapeHtml(`${it.name} · ${sit.texto}`)}"></span>`;
      })
      .join("");
    const completo = feitas === checklist.length;
    let proxHtml;
    if (completo) {
      proxHtml = `<p class="card__ck-prox is-completo">✓ Todas as atividades concluídas</p>`;
    } else {
      const sitProx = checklistItemSituacao(pendente);
      proxHtml =
        `<p class="card__ck-prox is-${sitProx.tom}" title="${escapeHtml(`${pendente.name} · ${sitProx.texto}`)}">` +
        `<span class="card__ck-prox-label">Próx. atividade:</span> ${escapeHtml(pendente.name)}</p>`;
    }
    checklistHtml =
      `<div class="card__ck" aria-label="${escapeHtml(`Tarefas do projeto: ${feitas} de ${checklist.length} concluídas`)}">` +
      `<div class="card__ck-head"><span class="card__ck-titulo">${CARD_ICONS.tarefas}Tarefas</span>` +
      `<span class="card__ck-frac${completo ? " is-completo" : ""}">${feitas}/${checklist.length}</span></div>` +
      `<div class="card__ck-bar">${segs}</div>${proxHtml}</div>`;
  } else {
    checklistHtml = `<p class="card__ck-vazio">${CARD_ICONS.tarefas}Sem atividades registradas</p>`;
  }

  const detalhes = [
    solicitante ? cardDetalheRow("Solicitante", solicitante) : "",
    dmCard.dataChegada ? cardDetalheRow("Chegada", formatDataCurta(dmCard.dataChegada)) : "",
    dmCard.dataFimPrevista ? cardDetalheRow("Finalização prevista", formatDataCurta(dmCard.dataFimPrevista)) : "",
    dmCard.dataFimAtualizada
      ? cardDetalheRow("Finalização atualizada", formatDataCurta(dmCard.dataFimAtualizada))
      : "",
    dmCard.dataTermino ? cardDetalheRow("Término", formatDataCurta(dmCard.dataTermino)) : "",
    dmCard.chamadoOcomon ? cardDetalheRow("Ocomon", dmCard.chamadoOcomon) : "",
    respNomes.length > 1 ? cardDetalheRow("Projetistas", respNomes.join(", ")) : "",
  ].join("");
  const detalhesId = `cardDet-${d.id}`;
  const detalhesHtml = expandido
    ? `<dl class="card__detalhes" id="${escapeHtml(detalhesId)}">${detalhes || cardDetalheRow("Detalhes", "Sem dados adicionais")}</dl>`
    : "";

  el.innerHTML = `
    <div class="card__top">
      <div class="card__tags">
        <span class="badge ${tipoBadgeClass(tipo)}">${escapeHtml(tipo)}</span>
        ${produtoHtml}
        ${segmentoHtml}
      </div>
      ${prioHtml}
    </div>
    <h3 class="card__title"></h3>
    ${cardEditingByHtml(d)}
    ${statusTxtHtml}
    ${prazoHtml}
    ${colunaAlertaHtml}
    <div class="card__pessoa">
      ${pessoaHtml}
      ${cidadeHtml}
    </div>
    ${checklistHtml}
    ${detalhesHtml}
    <div class="card__foot">
      <div class="card__stats">${stats.join("")}</div>
      <div class="card__acoes">
        ${avancarHtml}
        <button type="button" class="card__expandir" aria-expanded="${expandido}" aria-controls="${escapeHtml(detalhesId)}"
          aria-label="${expandido ? "Recolher detalhes" : "Ver detalhes"}" title="${expandido ? "Recolher detalhes" : "Ver detalhes"}">${expandido ? "▴" : "▾"}</button>
      </div>
    </div>
  `;
  el.querySelector(".card__title").textContent = d.titulo;
  el.querySelectorAll(".card-prio-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (btn.disabled) return;
      moveDemandaOrdemEsteira(d.id, Number(btn.dataset.dir));
    });
    btn.addEventListener("mousedown", (e) => e.stopPropagation());
  });
  el.querySelector(".card__expandir")?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (cardsExpandidos.has(d.id)) cardsExpandidos.delete(d.id);
    else cardsExpandidos.add(d.id);
    const novo = renderCard(d, { canMoveUp, canMoveDown });
    el.replaceWith(novo);
    novo.querySelector(".card__expandir")?.focus();
  });
  el.querySelector(".card__avancar")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const dem = state.demandas.find((x) => x.id === d.id);
    if (!dem) return;
    handleDemandaDrop(dem, proxima, BOARD_ATRIBUIDOS);
    toast(`Movido para ${proximaLabel}`);
  });
  return el;
}

/** Devolve o foco ao card após um re-render do board (ex.: reordenar pelo teclado). */
function focusCardById(id) {
  requestAnimationFrame(() => {
    const sel = `.card[data-id="${CSS.escape(String(id))}"]`;
    document.querySelector(sel)?.focus({ preventScroll: false });
  });
}

/** Iniciais do avatar: "Vinicius" → VI, "Ana Souza" → AS. */
function cardAvatarIniciais(nome) {
  const partes = String(nome || "").trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

/** Matiz estável por nome — o mesmo projetista mantém a mesma cor em todos os cards. */
function cardAvatarHue(nome) {
  let h = 0;
  for (const ch of String(nome || "")) h = (h * 31 + ch.codePointAt(0)) % 360;
  return h;
}

function cardPessoasHtml(nomes) {
  const principal = nomes[0];
  const extra = nomes.length > 1 ? ` <span class="card__people-more">+${nomes.length - 1}</span>` : "";
  return (
    `<span class="card__people" title="${escapeHtml(nomes.join(" · "))}">` +
    `<span class="card__avatar" style="--avatar-h:${cardAvatarHue(principal)}">${escapeHtml(cardAvatarIniciais(principal))}</span>` +
    `<span class="card__people-names">${escapeHtml(principal)}${extra}</span>` +
    `</span>`
  );
}

function formatCallableError(err, fallback) {
  const code = String(err?.code || "").replace(/^functions\//i, "").toLowerCase();
  const details = typeof err?.details === "string" ? err.details.trim() : "";
  const raw = String(err?.message || "")
    .replace(/^Firebase:\s*/i, "")
    .replace(/\s*\([^)]*\)\s*$/, "")
    .trim();
  if (code === "unauthenticated") return details || "Faça login de novo.";
  if (code === "not-found") {
    return "A função não está publicada. No CMD: firebase deploy --only functions";
  }
  if (code === "internal" || raw.toLowerCase() === "internal") {
    return details || fallback || "Erro no servidor. Publique de novo: firebase deploy --only functions";
  }
  if (code === "failed-precondition" || code === "unavailable" || code === "invalid-argument") {
    return details || raw || fallback;
  }
  return details || raw || fallback || "Não foi possível concluir.";
}

async function enviarDemandaClickup(id, btn, instrucoes) {
  if (!requireWriteAccess()) return;
  const texto = String(instrucoes || "").trim();
  if (!texto) {
    toast("Informe as instruções do que deverá ser feito.");
    return;
  }
  if (typeof firebase === "undefined" || !firebase.functions) {
    toast("Recarregue a página (Ctrl+F5) para carregar o ClickUp.");
    return;
  }
  const prev = btn?.textContent || "Enviar à Operação";
  beginOwnDemandaWrite(id);
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Enviando…";
  }
  try {
    const fns = firebase.app().functions("us-central1");
    const call = fns.httpsCallable("createClickupOperacao");
    const res = await call({ demandaId: id, instrucoes: texto });
    const data = res?.data || {};
    if (data.url) {
      const idx = state.demandas.findIndex((x) => x.id === id);
      if (idx >= 0) {
        const now = new Date().toISOString();
        const clickup = {
          taskId: data.taskId || "",
          url: data.url,
          status: data.status || "Nova demanda",
          listId: "901716986422",
          createdAt: now,
          instrucoes: texto,
        };
        const dem = { ...state.demandas[idx], clickup, clickupTaskId: clickup.taskId, updatedAt: now };
        if (!data.already) {
          const cmt = normalizeComentario({
            texto: `Demanda enviada para o time de Operação no ClickUp (Nova demanda).\nInstruções: ${texto}\n${data.url}`,
            autor: getLoggedInComentarioAutor(),
            createdAt: now,
          });
          if (cmt) {
            dem.comentarios = [cmt, ...normalizeComentarios(dem.comentarios)];
            if (document.getElementById("demId")?.value === id) {
              editingComentarios = [cmt, ...normalizeComentarios(editingComentarios)];
              renderComentariosList();
            }
          }
        }
        state.demandas[idx] = dem;
        noteOwnDemandaWrite(id, now);
        saveState({ demanda: migrateDemanda(dem) });
        renderBoard();
        setClickupUiOverride(id, clickup);
      } else {
        setClickupUiOverride(id, {
          taskId: data.taskId || "",
          url: data.url,
          status: data.status || "Nova demanda",
          instrucoes: texto,
        });
      }
      toast(data.already ? "Já existe no ClickUp" : "Demanda criada no ClickUp");
    } else {
      toast("ClickUp não retornou o link da tarefa");
    }
  } catch (err) {
    toast(formatCallableError(err, "Não foi possível criar no ClickUp"));
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = prev;
    }
    syncDemClickupUi();
  }
}

async function cancelarDemandaClickup(id) {
  if (!requireWriteAccess()) return;
  if (typeof firebase === "undefined" || !firebase.functions) {
    toast("Recarregue a página (Ctrl+F5) para carregar o ClickUp.");
    return;
  }
  const ok = await confirmDialog({
    title: "Cancelar envio à Operação?",
    message:
      "A tarefa será excluída no ClickUp. A demanda continua neste sistema e poderá ser enviada de novo.",
    confirmText: "Excluir no ClickUp",
    cancelText: "Voltar",
    variant: "danger",
  });
  if (!ok) return;
  const btn = document.getElementById("btnCancelarClickup");
  const prev = btn?.textContent || "Cancelar envio";
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Cancelando…";
  }
  beginOwnDemandaWrite(id);
  try {
    const fns = firebase.app().functions("us-central1");
    const call = fns.httpsCallable("cancelClickupOperacao");
    const local = state.demandas.find((x) => x.id === id);
    const cu = normalizeClickup(local?.clickup);
    await call({ demandaId: id, taskId: cu?.taskId || local?.clickupTaskId || "", url: cu?.url || "" });
    const idx = state.demandas.findIndex((x) => x.id === id);
    if (idx >= 0) {
      const now = new Date().toISOString();
      const dem = { ...state.demandas[idx] };
      delete dem.clickup;
      delete dem.clickupTaskId;
      const cmt = normalizeComentario({
        texto: "Envio à Operação cancelado. A tarefa foi excluída no ClickUp.",
        autor: getLoggedInComentarioAutor(),
        createdAt: now,
      });
      if (cmt) {
        dem.comentarios = [cmt, ...normalizeComentarios(dem.comentarios)];
        if (document.getElementById("demId")?.value === id) {
          editingComentarios = [cmt, ...normalizeComentarios(editingComentarios)];
          renderComentariosList();
        }
      }
      dem.updatedAt = now;
      state.demandas[idx] = dem;
      noteOwnDemandaWrite(id, now);
      saveState({ demanda: migrateDemanda(dem) });
      renderBoard();
    }
    setClickupUiOverride(id, null);
    toast("Envio cancelado no ClickUp");
  } catch (err) {
    toast(formatCallableError(err, "Não foi possível cancelar no ClickUp"));
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = prev;
    }
    syncDemClickupUi();
  }
}

let clickupInstrucoesResolve = null;

function initClickupInstrucoesDialog() {
  const dlg = document.getElementById("modalClickupInstrucoes");
  const ta = document.getElementById("clickupInstrucoesTexto");
  const btnOk = document.getElementById("clickupInstrucoesOk");
  const btnCancel = document.getElementById("clickupInstrucoesCancel");
  const btnClose = document.getElementById("clickupInstrucoesClose");
  if (!dlg || !ta || !btnOk || !btnCancel) return;

  const finish = (value) => {
    if (!clickupInstrucoesResolve) return;
    const resolve = clickupInstrucoesResolve;
    clickupInstrucoesResolve = null;
    dlg.close();
    resolve(value);
  };

  btnOk.addEventListener("click", () => {
    const texto = ta.value.trim();
    if (!texto) {
      toast("Informe as instruções do que deverá ser feito.");
      ta.focus();
      return;
    }
    finish(texto);
  });
  btnCancel.addEventListener("click", () => finish(null));
  btnClose?.addEventListener("click", () => finish(null));
  dlg.addEventListener("cancel", (e) => {
    e.preventDefault();
    finish(null);
  });
  dlg.addEventListener("close", () => {
    if (clickupInstrucoesResolve) finish(null);
  });
}

function promptClickupInstrucoes(titulo) {
  const dlg = document.getElementById("modalClickupInstrucoes");
  const ta = document.getElementById("clickupInstrucoesTexto");
  const proj = document.getElementById("clickupInstrucoesProjeto");
  if (!dlg || !ta) return Promise.resolve(null);
  if (proj) {
    const t = String(titulo || "").trim();
    proj.textContent = t ? `Projeto: ${t}` : "";
    proj.hidden = !t;
  }
  ta.value = "";
  return new Promise((resolve) => {
    clickupInstrucoesResolve = resolve;
    dlg.showModal();
    requestAnimationFrame(() => ta.focus());
  });
}

initClickupInstrucoesDialog();

function setClickupUiOverride(id, clickup) {
  clickupUiOverride = id ? { id, clickup: clickup || null } : null;
  ownClickupSyncId = id || "";
  syncDemClickupUi();
  syncDemandaModalAlerts();
}

function syncDemClickupUi() {
  const hint = document.getElementById("demClickupHint");
  const btn = document.getElementById("btnEnviarClickup");
  const link = document.getElementById("demClickupLink");
  const btnCancel = document.getElementById("btnCancelarClickup");
  if (!hint || !btn || !link) return;
  const id = (document.getElementById("demId")?.value || "").trim();
  const d = id ? state.demandas.find((x) => x.id === id) : null;
  let cu = normalizeClickup(d?.clickup);
  if (clickupUiOverride && clickupUiOverride.id === id) {
    cu = clickupUiOverride.clickup ? normalizeClickup(clickupUiOverride.clickup) : null;
  }
  const readOnly = isReadOnlyUser();

  hint.hidden = true;
  hint.textContent = "";
  btn.hidden = true;
  btn.disabled = true;
  link.hidden = true;
  link.removeAttribute("href");
  if (btnCancel) {
    btnCancel.hidden = true;
    btnCancel.disabled = true;
  }

  if (cu?.url) {
    const st = cu.status ? `Status: ${cu.status}` : "Tarefa criada no ClickUp";
    const done = cu.completedAt ? " · concluída" : "";
    hint.hidden = false;
    hint.textContent = st + done;
    link.hidden = false;
    link.href = cu.url;
    if (btnCancel && !readOnly) {
      btnCancel.hidden = false;
      btnCancel.disabled = false;
    }
    return;
  }
  if (!id) {
    hint.hidden = false;
    hint.textContent = "Salve a demanda para enviar ao ClickUp.";
    return;
  }
  if (readOnly) {
    hint.hidden = false;
    hint.textContent = "Ainda não enviada ao ClickUp.";
    return;
  }
  hint.hidden = true;
  btn.hidden = false;
  btn.disabled = false;
  btn.textContent = "Enviar à Operação";
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ---------- Modal demanda ---------- */
const modalDemanda = document.getElementById("modalDemanda");
const demStatusSel = document.getElementById("demStatus");
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
fillStatusSelect();
initDemandaModalScrollLock();

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
initProjetistaSelects();
initDemCidadeSelects();
initDemProjetistasExtra();
initDemProdutoB2bSelect();
initDemSetorSolicitanteB2bSelect();
initDemSolicitanteB2bSelect();
initDemSegmentoB2cSelect();

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

demStatusSel?.addEventListener("change", () => {
  syncDemConclusaoFields();
  syncMotivosAtrasoField();
  syncDiasAbertoResumo();
});
document.getElementById("demTipo")?.addEventListener("change", syncDemandaLinhaFromTipo);
document.getElementById("demDataChegada")?.addEventListener("change", syncDiasAbertoResumo);
document.getElementById("demDataFimPrevista")?.addEventListener("change", syncMotivosAtrasoField);
document.getElementById("demDataTermino")?.addEventListener("change", () => {
  syncMotivosAtrasoField();
  syncDiasAbertoResumo();
});

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

function readChecklistEtapaDraft(ids) {
  return {
    name: (document.getElementById(ids.name)?.value || "").trim(),
    descricao: (document.getElementById(ids.descricao)?.value || "").trim(),
    who: (document.getElementById(ids.who)?.value || "").trim(),
    dateInicio: (document.getElementById(ids.dateInicio)?.value || "").trim(),
    date: (document.getElementById(ids.date)?.value || "").trim(),
  };
}

function validateChecklistEtapa(draft, focusId) {
  // Datas são opcionais: sem término a atividade fica "Sem prazo" (nunca atrasada).
  if (!draft.name || !draft.who) {
    toast("Preencha a atividade e o responsável.");
    return false;
  }
  if (draft.dateInicio && draft.date && draft.dateInicio > draft.date) {
    toast("A previsão de início deve ser anterior ou igual ao término.");
    if (focusId) document.getElementById(focusId)?.focus();
    return false;
  }
  return true;
}

function applyChecklistItemPatch(id, patch) {
  // Mantém `status` e `done` coerentes, venha a mudança por um ou por outro.
  const p = { ...patch };
  if (p.status && CHECKLIST_STATUS_LABEL[p.status]) p.done = p.status === "concluida";
  else if (typeof p.done === "boolean") p.status = p.done ? "concluida" : "afazer";
  editingChecklist = normalizeChecklist(editingChecklist).map((row) =>
    row.id === id ? { ...row, ...p } : row,
  );
}

function persistOpenChecklistEdit() {
  if (!editingChecklistItemId) return;
  const draft = readChecklistEtapaDraft({
    name: "demChecklistEditName",
    descricao: "demChecklistEditDesc",
    who: "demChecklistEditWho",
    dateInicio: "demChecklistEditInicio",
    date: "demChecklistEditFim",
  });
  if (!draft.name) return;
  applyChecklistItemPatch(editingChecklistItemId, draft);
}

function moveChecklistItem(id, delta) {
  if (!requireWriteAccess()) return;
  persistOpenChecklistEdit();
  const items = normalizeChecklist(editingChecklist);
  const i = items.findIndex((row) => row.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= items.length) return;
  const next = items.slice();
  const [row] = next.splice(i, 1);
  next.splice(j, 0, row);
  editingChecklist = next;
  renderChecklistEditor();
}

function appendChecklistMoveButtons(actions, it, idx, n, readOnly) {
  const wrap = document.createElement("div");
  wrap.className = "checklist-item__move";
  const up = document.createElement("button");
  up.type = "button";
  up.className = "checklist-item__move-up";
  up.textContent = "↑";
  up.setAttribute("aria-label", `Mover “${it.name}” para cima`);
  up.title = idx === 0 ? "Primeira atividade" : "Mover atividade para cima";
  up.disabled = readOnly || idx === 0;
  if (up.disabled) up.dataset.keepDisabled = "1";
  else delete up.dataset.keepDisabled;
  up.addEventListener("click", () => moveChecklistItem(it.id, -1));
  const down = document.createElement("button");
  down.type = "button";
  down.className = "checklist-item__move-down";
  down.textContent = "↓";
  down.setAttribute("aria-label", `Mover “${it.name}” para baixo`);
  down.title = idx === n - 1 ? "Última atividade" : "Mover atividade para baixo";
  down.disabled = readOnly || idx === n - 1;
  if (down.disabled) down.dataset.keepDisabled = "1";
  else delete down.dataset.keepDisabled;
  down.addEventListener("click", () => moveChecklistItem(it.id, 1));
  wrap.append(up, down);
  actions.appendChild(wrap);
}

function refreshChecklistMoveButtons() {
  const readOnly = isReadOnlyUser();
  const items = document.querySelectorAll("#demChecklistList .checklist-item");
  const n = normalizeChecklist(editingChecklist).length;
  items.forEach((li) => {
    const idx = Number(li.dataset.idx);
    const up = li.querySelector(".checklist-item__move-up");
    const down = li.querySelector(".checklist-item__move-down");
    if (up) {
      up.disabled = readOnly || idx === 0;
      if (up.disabled) up.dataset.keepDisabled = "1";
      else delete up.dataset.keepDisabled;
      up.title = idx === 0 ? "Primeira atividade" : "Mover atividade para cima";
    }
    if (down) {
      down.disabled = readOnly || idx === n - 1;
      if (down.disabled) down.dataset.keepDisabled = "1";
      else delete down.dataset.keepDisabled;
      down.title = idx === n - 1 ? "Última atividade" : "Mover atividade para baixo";
    }
  });
}

function saveChecklistItemEdit(id) {
  if (!requireWriteAccess()) return;
  const draft = readChecklistEtapaDraft({
    name: "demChecklistEditName",
    descricao: "demChecklistEditDesc",
    who: "demChecklistEditWho",
    dateInicio: "demChecklistEditInicio",
    date: "demChecklistEditFim",
  });
  if (!validateChecklistEtapa(draft, "demChecklistEditInicio")) return;
  applyChecklistItemPatch(id, draft);
  editingChecklistItemId = "";
  renderChecklistEditor();
}

/** Filtro da lista de atividades no modal (todas | pendentes | atrasadas | concluidas). */
let checklistFiltro = "todas";
/** Atividade recém-marcada — ganha uma animação curta na próxima renderização. */
let checklistRecemConcluidaId = "";

const CHECKLIST_FILTROS = [
  ["todas", "Todas"],
  ["afazer", "A fazer"],
  ["andamento", "Em andamento"],
  ["atrasadas", "Atrasadas"],
  ["concluidas", "Concluídas"],
];

/** Prazo da atividade (independe do status): atrasada, termina em N dias, começa em N dias ou sem prazo. */
function checklistItemPrazo(it) {
  let start = checklistGanttItemStart(it);
  let end = checklistGanttItemEnd(it);
  if (start && end && start > end) [start, end] = [end, start];
  const hoje = todayISODate();
  if (it.done) return { atrasada: false, texto: "" };
  if (end && hoje > end) {
    const n = diasEntreDatasISO(end, hoje);
    return { atrasada: true, texto: `Atrasada ${n === 1 ? "1 dia" : `${n} dias`}` };
  }
  if (start && hoje < start && normalizeChecklistStatus(it) === "afazer") {
    const n = diasEntreDatasISO(hoje, start);
    return { atrasada: false, texto: n <= 1 ? "Começa amanhã" : `Começa em ${n} dias` };
  }
  if (end) {
    const n = diasEntreDatasISO(hoje, end);
    return { atrasada: false, texto: n === 0 ? "Termina hoje" : n === 1 ? "Termina amanhã" : `Termina em ${n} dias` };
  }
  return { atrasada: false, texto: "Sem prazo" };
}

/**
 * Situação da atividade: o status escolhido manda (a fazer, em andamento, concluída);
 * passar da data de término sem concluir vira "atrasada".
 */
function checklistItemSituacao(it) {
  const status = normalizeChecklistStatus(it);
  if (status === "concluida") return { tom: "done", texto: "Concluída" };
  const prazo = checklistItemPrazo(it);
  if (prazo.atrasada) return { tom: "late", texto: prazo.texto };
  const base = CHECKLIST_STATUS_LABEL[status];
  const sufixo = prazo.texto ? ` · ${prazo.texto.charAt(0).toLowerCase()}${prazo.texto.slice(1)}` : "";
  return { tom: status === "andamento" ? "active" : "wait", texto: `${base}${sufixo}` };
}

function checklistPassaFiltro(it, filtro) {
  if (filtro === "concluidas") return it.done;
  if (filtro === "afazer") return normalizeChecklistStatus(it) === "afazer";
  if (filtro === "andamento") return normalizeChecklistStatus(it) === "andamento";
  if (filtro === "atrasadas") return checklistItemSituacao(it).tom === "late";
  return true;
}

function checklistPeriodoTexto(it) {
  const a = it.dateInicio ? formatDataCurta(it.dateInicio).slice(0, 5) : "";
  const b = it.date ? formatDataCurta(it.date).slice(0, 5) : "";
  if (a && b) return a === b ? a : `${a} → ${b}`;
  return a || b || "Sem data";
}

/** Limite do nome da atividade (antes 80). */
const CHECKLIST_NOME_MAX = 200;

function setChecklistItemDone(id, done) {
  if (isReadOnlyUser() || !requireWriteAccess()) return;
  applyChecklistItemPatch(id, { status: done ? "concluida" : "afazer" });
  checklistRecemConcluidaId = done ? id : "";
  renderChecklistEditor();
}

function checklistIconBtn(cls, glyph, label) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = cls;
  b.textContent = glyph;
  b.title = label;
  b.setAttribute("aria-label", label);
  return b;
}

function renderChecklistResumo(items) {
  const n = items.length;
  const d = items.filter((it) => it.done).length;
  const pct = n ? Math.round((d / n) * 100) : 0;
  const frac = document.getElementById("demChecklistFrac");
  if (frac) frac.textContent = `${d}/${n}`;
  const pctEl = document.getElementById("demChecklistPct");
  if (pctEl) pctEl.textContent = `${pct}%`;
  const anel = document.getElementById("demChecklistAnel");
  if (anel) {
    anel.style.setProperty("--pct", String(pct));
    anel.classList.toggle("is-completo", n > 0 && d === n);
  }
  const dots = document.getElementById("demChecklistDots");
  if (dots) {
    dots.innerHTML = items
      .map((it) => {
        const sit = checklistItemSituacao(it);
        return `<span class="card__checklist-dot is-${sit.tom}${it.done ? " is-on" : ""}" title="${escapeHtml(
          `${it.name} · ${sit.texto}`,
        )}"></span>`;
      })
      .join("");
  }
  const filtros = document.getElementById("demChecklistFiltros");
  if (filtros) {
    const conta = Object.fromEntries(
      CHECKLIST_FILTROS.map(([k]) => [k, items.filter((it) => checklistPassaFiltro(it, k)).length]),
    );
    filtros.hidden = !n;
    filtros.innerHTML = CHECKLIST_FILTROS.map(
      ([k, label]) =>
        `<button type="button" class="ck-filtro ck-filtro--${k}${checklistFiltro === k ? " is-on" : ""}" data-filtro="${k}"` +
        ` data-ui-nav="1" aria-pressed="${checklistFiltro === k}">${label}<span class="ck-filtro__n">${conta[k]}</span></button>`,
    ).join("");
  }
}

function renderChecklistProxima(items) {
  const host = document.getElementById("demChecklistNext");
  if (!host) return;
  host.className = "ck-proxima";
  if (!items.length) {
    host.hidden = true;
    host.replaceChildren();
    return;
  }
  host.hidden = false;
  const pendente = items.find((it) => !it.done);
  if (!pendente) {
    host.classList.add("is-completo");
    host.innerHTML = `<span class="ck-proxima__ico" aria-hidden="true">✓</span><div><strong>Todas as atividades concluídas</strong><span class="ck-proxima__meta">${items.length} de ${items.length} feitas</span></div>`;
    return;
  }
  const sit = checklistItemSituacao(pendente);
  host.classList.add(`is-${sit.tom}`);
  host.innerHTML =
    `<span class="ck-proxima__ico" aria-hidden="true">▸</span>` +
    `<div class="ck-proxima__txt"><span class="ck-proxima__label">Próxima atividade</span>` +
    `<strong>${escapeHtml(pendente.name)}</strong>` +
    `<span class="ck-proxima__meta">${escapeHtml(pendente.who || "Sem responsável")} · ${escapeHtml(
      checklistPeriodoTexto(pendente),
    )} · <span class="ck-situacao ck-situacao--${sit.tom}">${escapeHtml(sit.texto)}</span></span></div>`;
  if (!isReadOnlyUser()) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ck-proxima__concluir";
    btn.textContent = "✓ Concluir";
    btn.title = `Marcar “${pendente.name}” como concluída`;
    btn.addEventListener("click", () => setChecklistItemDone(pendente.id, true));
    host.appendChild(btn);
  }
}

function renderChecklistEditor() {
  const items = normalizeChecklist(editingChecklist);
  const n = items.length;
  const list = document.getElementById("demChecklistList");
  renderChecklistResumo(items);
  renderChecklistProxima(items);
  const expand = document.getElementById("btnChecklistExpand");
  if (expand) expand.hidden = isReadOnlyUser();
  if (!list) return;
  const readOnly = isReadOnlyUser();
  list.innerHTML = "";
  const visiveis = items.filter((it) => checklistPassaFiltro(it, checklistFiltro) || it.id === editingChecklistItemId);
  if (!visiveis.length) {
    const vazio = document.createElement("li");
    vazio.className = "ck-vazio";
    vazio.textContent = n
      ? "Nenhuma atividade neste filtro."
      : readOnly
        ? "Nenhuma atividade registrada."
        : "Nenhuma atividade ainda. Clique em “Nova atividade” para começar.";
    list.appendChild(vazio);
  }
  items.forEach((it, idx) => {
    if (!visiveis.includes(it)) return;
    const editing = !readOnly && editingChecklistItemId === it.id;
    const sit = checklistItemSituacao(it);
    const status = normalizeChecklistStatus(it);
    const li = document.createElement("li");
    li.dataset.idx = String(idx);
    li.className =
      "checklist-item" +
      (it.done ? "" : " is-off") +
      (editing ? " is-editing" : "") +
      ` is-${sit.tom}` +
      (checklistRecemConcluidaId === it.id ? " is-just-done" : "");

    // Ícone só de visualização: muda conforme o status.
    const icone = document.createElement("span");
    icone.className = `ck-icone ck-icone--${status}`;
    icone.setAttribute("role", "img");
    icone.setAttribute("aria-label", CHECKLIST_STATUS_LABEL[status]);
    icone.title = CHECKLIST_STATUS_LABEL[status];

    const remover = async () => {
      if (readOnly) return;
      const ok = await confirmDialog({
        title: "Remover atividade?",
        message: `A atividade “${it.name}” será removida do checklist das tarefas do projeto.`,
        confirmText: "Remover",
        cancelText: "Voltar",
        variant: "danger",
      });
      if (!ok) return;
      if (editingChecklistItemId === it.id) editingChecklistItemId = "";
      editingChecklist = editingChecklist.filter((x) => x.id !== it.id);
      renderChecklistEditor();
    };
    const cancelarEdicao = () => {
      editingChecklistItemId = "";
      renderChecklistEditor();
    };

    if (editing) {
      const edit = document.createElement("div");
      edit.className = "checklist-item__edit";
      const nameField = createChecklistField({
        id: "demChecklistEditName",
        label: "Atividade",
        value: it.name,
        maxLength: CHECKLIST_NOME_MAX,
        placeholder: "PDF do levantamento",
      });
      nameField.wrap.classList.add("checklist-item__edit-nome");
      const descField = createChecklistField({
        id: "demChecklistEditDesc",
        label: "Descrição",
        value: it.descricao,
        maxLength: 160,
        placeholder: "O que esta atividade entrega",
        multiline: true,
      });
      const whoField = createChecklistField({
        id: "demChecklistEditWho",
        label: "Responsável",
        value: it.who,
        maxLength: 80,
        placeholder: "Nome do responsável",
      });
      const startField = createChecklistField({
        id: "demChecklistEditInicio",
        label: "Início (opcional)",
        type: "date",
        value: it.dateInicio,
      });
      const endField = createChecklistField({
        id: "demChecklistEditFim",
        label: "Término (opcional)",
        type: "date",
        value: it.date,
      });
      [nameField.input, whoField.input, startField.input, endField.input].forEach((input) => {
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            saveChecklistItemEdit(it.id);
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            cancelarEdicao();
          }
        });
      });

      // Rodapé da edição: remover à esquerda, cancelar/salvar à direita.
      const foot = document.createElement("div");
      foot.className = "checklist-item__edit-foot";
      const rm = document.createElement("button");
      rm.type = "button";
      rm.className = "checklist-item__remove checklist-item__remove--txt";
      rm.textContent = "🗑 Remover";
      rm.addEventListener("click", remover);
      const dica = document.createElement("span");
      dica.className = "checklist-item__edit-dica";
      dica.textContent = "Enter salva · Esc cancela";
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "btn btn--ghost btn--sm checklist-item__cancel";
      cancel.textContent = "Cancelar";
      cancel.addEventListener("click", cancelarEdicao);
      const save = document.createElement("button");
      save.type = "button";
      save.className = "btn btn--primary btn--sm checklist-item__save";
      save.textContent = "Salvar";
      save.addEventListener("click", () => saveChecklistItemEdit(it.id));
      foot.append(rm, dica, cancel, save);

      edit.append(nameField.wrap, whoField.wrap, startField.wrap, endField.wrap, descField.wrap, foot);
      li.append(icone, edit);
    } else {
      const body = document.createElement("div");
      body.className = "checklist-item__body";
      if (!readOnly) {
        body.title = "Clique para editar";
        body.addEventListener("click", () => {
          if (!requireWriteAccess()) return;
          persistOpenChecklistEdit();
          editingChecklistItemId = it.id;
          renderChecklistEditor();
          document.getElementById("demChecklistEditName")?.focus();
        });
      }
      const name = document.createElement("span");
      name.className = "checklist-item__name";
      name.textContent = it.name;
      body.append(name);
      if (it.descricao) {
        const desc = document.createElement("p");
        desc.className = "checklist-item__desc";
        desc.textContent = it.descricao;
        body.append(desc);
      }
      const meta = document.createElement("span");
      meta.className = "checklist-item__meta";
      const who = document.createElement("span");
      who.className = "checklist-item__who";
      if (it.who) {
        const av = document.createElement("span");
        av.className = "ck-avatar";
        av.style.setProperty("--avatar-h", String(cardAvatarHue(it.who)));
        av.textContent = cardAvatarIniciais(it.who);
        av.setAttribute("aria-hidden", "true");
        who.append(av, document.createTextNode(it.who));
      } else {
        who.textContent = "Sem responsável";
      }
      meta.append(who);
      if (it.dateInicio || it.date) {
        const periodo = document.createElement("time");
        periodo.dateTime = it.date || it.dateInicio || "";
        periodo.textContent = checklistPeriodoTexto(it);
        periodo.title = `Início ${it.dateInicio ? formatDataCurta(it.dateInicio) : "—"} · Término ${
          it.date ? formatDataCurta(it.date) : "—"
        }`;
        meta.append(periodo);
      }
      body.append(meta);

      // Prazo (texto) + status (seletor) à direita.
      const prazo = checklistItemPrazo(it);
      const prazoEl = document.createElement("span");
      prazoEl.className = "ck-prazo" + (prazo.atrasada ? " is-atrasada" : "") + (!prazo.texto ? " is-vazio" : "");
      prazoEl.textContent = prazo.texto;

      const sel = document.createElement("select");
      sel.className = `ck-status ck-status--${status}`;
      sel.setAttribute("aria-label", `Status de “${it.name}”`);
      sel.disabled = readOnly;
      CHECKLIST_STATUS.forEach(([k, label]) => {
        const o = document.createElement("option");
        o.value = k;
        o.textContent = label;
        o.selected = k === status;
        sel.appendChild(o);
      });
      sel.addEventListener("change", () => {
        if (isReadOnlyUser() || !requireWriteAccess()) {
          sel.value = status;
          return;
        }
        applyChecklistItemPatch(it.id, { status: sel.value });
        checklistRecemConcluidaId = sel.value === "concluida" ? it.id : "";
        renderChecklistEditor();
      });

      const actions = document.createElement("div");
      actions.className = "checklist-item__actions";
      const editBtn = checklistIconBtn("checklist-item__edit-btn", "✎", `Editar “${it.name}”`);
      editBtn.disabled = readOnly;
      editBtn.addEventListener("click", () => {
        if (readOnly || !requireWriteAccess()) return;
        persistOpenChecklistEdit();
        editingChecklistItemId = it.id;
        renderChecklistEditor();
        document.getElementById("demChecklistEditName")?.focus();
      });
      const rm = checklistIconBtn("checklist-item__remove", "🗑", `Remover “${it.name}”`);
      rm.disabled = readOnly;
      rm.addEventListener("click", remover);
      appendChecklistMoveButtons(actions, it, idx, n, readOnly);
      actions.append(editBtn, rm);
      li.append(icone, body, prazoEl, sel, actions);
    }
    list.appendChild(li);
  });
  checklistRecemConcluidaId = "";
  renderChecklistGantt();
}

const GANTT_PAD_DAYS = 2;
const GANTT_WEEK_AFTER_DAYS = 21;
const GANTT_COL_DAY_PX = 32;
const GANTT_COL_COMPACT_PX = 16;
const WEEKDAYS_PT = ["D", "S", "T", "Q", "Q", "S", "S"];
const MONTHS_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function checklistGanttItemStart(it) {
  return isoDatePart(it?.dateInicio) || "";
}

function checklistGanttItemEnd(it) {
  return isoDatePart(it?.date) || "";
}

function checklistGanttTone(it) {
  return checklistItemSituacao(it).tom;
}

function checklistGanttToneLabel(tone) {
  if (tone === "done") return "Concluída";
  if (tone === "late") return "Passou da data final";
  if (tone === "active") return "Em andamento";
  return "A fazer";
}

function checklistGanttRange(items) {
  let min = "";
  let max = "";
  for (const it of items) {
    const start = checklistGanttItemStart(it);
    const end = checklistGanttItemEnd(it);
    const a = start || end;
    const b = end || start;
    if (a && (!min || a < min)) min = a;
    if (b && (!max || b > max)) max = b;
  }
  if (!min || !max) return null;
  if (min > max) {
    const swap = min;
    min = max;
    max = swap;
  }
  const start = addDaysISO(min, -GANTT_PAD_DAYS) || min;
  const end = addDaysISO(max, GANTT_PAD_DAYS) || max;
  return { start, end };
}

function checklistGanttDays(start, end) {
  const days = [];
  let cur = start;
  while (cur && cur <= end) {
    days.push(cur);
    const next = addDaysISO(cur, 1);
    if (!next || next === cur) break;
    cur = next;
  }
  return days;
}

function checklistGanttGroups(days, keyFn) {
  const groups = [];
  for (const iso of days) {
    const key = keyFn(iso);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.days.push(iso);
    else groups.push({ key, days: [iso] });
  }
  return groups;
}

function checklistGanttMonthKey(iso) {
  return String(iso || "").slice(0, 7);
}

function checklistGanttMonthLabel(iso) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})/);
  if (!m) return iso || "";
  const month = MONTHS_PT[Number(m[2]) - 1] || m[2];
  return `${month} ${m[1]}`;
}

function checklistGanttWeekStart(iso) {
  const t = parseDate(iso);
  if (t == null) return iso;
  const d = new Date(t);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  const pad = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function checklistGanttWeekLabel(days) {
  if (!days.length) return "";
  const a = days[0];
  const b = days[days.length - 1];
  const ma = String(a).match(/^(\d{4})-(\d{2})-(\d{2})/);
  const mb = String(b).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!ma || !mb) return `${formatDataCurta(a)} – ${formatDataCurta(b)}`;
  if (ma[2] === mb[2]) return `${ma[3]}–${mb[3]}/${ma[2]}`;
  return `${ma[3]}/${ma[2]}–${mb[3]}/${mb[2]}`;
}

function checklistGanttWeekday(iso) {
  const t = parseDate(iso);
  if (t == null) return "";
  return WEEKDAYS_PT[new Date(t).getDay()] || "";
}

function checklistGanttDayNum(iso) {
  const m = String(iso || "").match(/-(\d{2})$/);
  return m ? String(Number(m[1])) : "";
}

function setChecklistToggleLabel(btn, label) {
  if (!btn) return;
  const span = btn.querySelector(".checklist-toggle__label");
  if (span) span.textContent = label;
  else btn.textContent = label;
}

/** Escala do cronograma: "auto" escolhe dias ou semanas pelo tamanho do período. */
let checklistGanttEscala = "auto";

function checklistGanttIsFds(iso) {
  const t = parseDate(iso);
  if (t == null) return false;
  const dia = new Date(t).getDay();
  return dia === 0 || dia === 6;
}

/** Abre a atividade para edição na lista (a partir do cronograma). */
function editarChecklistItemPeloGantt(id) {
  if (isReadOnlyUser() || !requireWriteAccess()) return;
  persistOpenChecklistEdit();
  checklistFiltro = "todas";
  editingChecklistItemId = id;
  renderChecklistEditor();
  const input = document.getElementById("demChecklistEditName");
  input?.closest(".checklist-item")?.scrollIntoView({ behavior: "smooth", block: "center" });
  input?.focus({ preventScroll: true });
}

function renderChecklistGanttToolbar(host, items) {
  const conta = { done: 0, active: 0, late: 0, wait: 0 };
  for (const it of items) conta[checklistItemSituacao(it).tom] += 1;
  const bar = document.createElement("div");
  bar.className = "checklist-gantt__toolbar";
  const legenda = document.createElement("div");
  legenda.className = "checklist-gantt__legenda";
  [
    ["done", "Concluída"],
    ["active", "Em andamento"],
    ["late", "Atrasada"],
    ["wait", "A fazer"],
  ].forEach(([tom, label]) => {
    const item = document.createElement("span");
    item.className = `checklist-gantt__leg is-${tom}`;
    item.innerHTML = `<i aria-hidden="true"></i>${label} <b>${conta[tom]}</b>`;
    legenda.appendChild(item);
  });
  const escala = document.createElement("div");
  escala.className = "checklist-gantt__escala";
  escala.setAttribute("role", "group");
  escala.setAttribute("aria-label", "Escala do cronograma");
  [
    ["auto", "Automático"],
    ["dias", "Dias"],
    ["semanas", "Semanas"],
  ].forEach(([k, label]) => {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.uiNav = "1";
    b.textContent = label;
    b.className = checklistGanttEscala === k ? "is-on" : "";
    b.setAttribute("aria-pressed", String(checklistGanttEscala === k));
    b.addEventListener("click", () => {
      checklistGanttEscala = k;
      renderChecklistGantt();
    });
    escala.appendChild(b);
  });
  bar.append(legenda, escala);
  host.appendChild(bar);
}

function setChecklistGanttOpen(open) {
  const btn = document.getElementById("btnChecklistGantt");
  const panel = document.getElementById("demChecklistGantt");
  if (btn) {
    btn.setAttribute("aria-expanded", String(open));
    setChecklistToggleLabel(btn, open ? "Fechar cronograma" : "Abrir cronograma");
  }
  if (panel) panel.hidden = !open;
  if (open) renderChecklistGantt();
}

function renderChecklistGantt() {
  const host = document.getElementById("demChecklistGantt");
  if (!host || host.hidden) return;
  const items = normalizeChecklist(editingChecklist);
  const range = checklistGanttRange(items);
  host.replaceChildren();
  if (!range) {
    const empty = document.createElement("p");
    empty.className = "muted small checklist-gantt__empty";
    empty.textContent = "Adicione atividades com início e término para ver o cronograma.";
    host.appendChild(empty);
    return;
  }
  const days = checklistGanttDays(range.start, range.end);
  if (!days.length) {
    const empty = document.createElement("p");
    empty.className = "muted small checklist-gantt__empty";
    empty.textContent = "Adicione atividades com início e término para ver o cronograma.";
    host.appendChild(empty);
    return;
  }
  renderChecklistGanttToolbar(host, items);
  const compact =
    checklistGanttEscala === "semanas" ||
    (checklistGanttEscala === "auto" && days.length > GANTT_WEEK_AFTER_DAYS);
  // Estica as colunas para ocupar a largura disponível (11rem = coluna dos nomes).
  const disponivel = (host.clientWidth || 0) - 176 - 2;
  const colPx = Math.max(
    compact ? GANTT_COL_COMPACT_PX : GANTT_COL_DAY_PX,
    disponivel > 0 ? Math.floor(disponivel / days.length) : 0,
  );
  const chartW = days.length * colPx;
  const today = todayISODate();
  const todayIdx = days.indexOf(today);
  const todayPct = todayIdx >= 0 ? ((todayIdx + 0.5) / days.length) * 100 : null;

  const scroll = document.createElement("div");
  scroll.className = "checklist-gantt__scroll";
  const inner = document.createElement("div");
  inner.className = "checklist-gantt__inner";
  inner.style.setProperty("--gantt-w", `${chartW}px`);
  inner.style.setProperty("--gantt-col", `${colPx}px`);
  inner.setAttribute("role", "img");
  inner.setAttribute("aria-label", "Cronograma das atividades do checklist das tarefas do projeto");

  const head = document.createElement("div");
  head.className = "checklist-gantt__head";
  const headLabel = document.createElement("div");
  headLabel.className = "checklist-gantt__label";
  headLabel.textContent = "Atividade";
  const axis = document.createElement("div");
  axis.className = "checklist-gantt__axis";

  const monthsRow = document.createElement("div");
  monthsRow.className = "checklist-gantt__months";
  checklistGanttGroups(days, checklistGanttMonthKey).forEach((g) => {
    const cell = document.createElement("div");
    cell.className = "checklist-gantt__month";
    cell.style.width = `${g.days.length * colPx}px`;
    cell.textContent = checklistGanttMonthLabel(g.days[0]);
    monthsRow.appendChild(cell);
  });

  const ticksRow = document.createElement("div");
  ticksRow.className = "checklist-gantt__ticks" + (compact ? " is-weeks" : " is-days");
  if (compact) {
    checklistGanttGroups(days, checklistGanttWeekStart).forEach((g) => {
      const cell = document.createElement("div");
      cell.className = "checklist-gantt__tick";
      cell.style.width = `${g.days.length * colPx}px`;
      cell.textContent = checklistGanttWeekLabel(g.days);
      ticksRow.appendChild(cell);
    });
  } else {
    days.forEach((iso) => {
      const cell = document.createElement("div");
      cell.className = "checklist-gantt__tick";
      cell.style.width = `${colPx}px`;
      const num = document.createElement("span");
      num.textContent = checklistGanttDayNum(iso);
      const wd = document.createElement("span");
      wd.textContent = checklistGanttWeekday(iso);
      cell.append(num, wd);
      ticksRow.appendChild(cell);
    });
  }
  axis.append(monthsRow, ticksRow);
  if (todayPct != null) {
    const todayLine = document.createElement("i");
    todayLine.className = "checklist-gantt__today";
    todayLine.style.left = `${todayPct}%`;
    todayLine.setAttribute("aria-hidden", "true");
    axis.appendChild(todayLine);
    const todayTag = document.createElement("span");
    todayTag.className = "checklist-gantt__today-tag";
    todayTag.style.left = `${todayPct}%`;
    todayTag.textContent = "Hoje";
    axis.appendChild(todayTag);
  }
  head.append(headLabel, axis);
  // Fins de semana sombreados (posições em % do eixo).
  const fds = [];
  days.forEach((iso, i) => {
    if (checklistGanttIsFds(iso)) fds.push(i);
  });
  const readOnlyGantt = isReadOnlyUser();

  const body = document.createElement("div");
  body.className = "checklist-gantt__body";
  items.forEach((it) => {
    const row = document.createElement("div");
    const sitRow = checklistItemSituacao(it);
    row.className = "checklist-gantt__row" + (it.done ? " is-done" : " is-off") + ` is-${sitRow.tom}`;
    const label = document.createElement("div");
    label.className = "checklist-gantt__label";
    const name = document.createElement("strong");
    name.textContent = it.name || "Atividade";
    name.title = it.name || "";
    const who = document.createElement("span");
    who.textContent = `${it.who || "—"} · ${sitRow.texto}`;
    label.append(name, who);
    if (!readOnlyGantt) {
      row.classList.add("is-clicavel");
      row.title = "Clique para editar esta atividade";
      row.addEventListener("click", () => editarChecklistItemPeloGantt(it.id));
    }
    const track = document.createElement("div");
    track.className = "checklist-gantt__track";
    fds.forEach((i) => {
      const f = document.createElement("i");
      f.className = "checklist-gantt__fds";
      f.style.left = `${(i / days.length) * 100}%`;
      f.style.width = `${(1 / days.length) * 100}%`;
      f.setAttribute("aria-hidden", "true");
      track.appendChild(f);
    });
    if (todayPct != null) {
      const todayLine = document.createElement("i");
      todayLine.className = "checklist-gantt__today";
      todayLine.style.left = `${todayPct}%`;
      todayLine.setAttribute("aria-hidden", "true");
      track.appendChild(todayLine);
    }
    let start = checklistGanttItemStart(it);
    let end = checklistGanttItemEnd(it);
    if (start && end && start > end) {
      const swap = start;
      start = end;
      end = swap;
    }
    const tone = checklistGanttTone(it, start, end);
    if (start && end) {
      const i0 = days.indexOf(start);
      const i1 = days.indexOf(end);
      if (i0 >= 0 && i1 >= 0) {
        const bar = document.createElement("div");
        bar.className = "checklist-gantt__bar is-" + tone;
        bar.style.left = `${(i0 / days.length) * 100}%`;
        bar.style.width = `${((i1 - i0 + 1) / days.length) * 100}%`;
        bar.title = `${it.name} · ${it.who || "—"} · ${checklistGanttToneLabel(tone)} · Início ${formatDataCurta(start)} · Término ${formatDataCurta(end)}`;
        const dur = i1 - i0 + 1;
        if (dur * colPx >= 34) {
          bar.textContent = `${dur}d`;
          bar.classList.add("has-txt");
        }
        track.appendChild(bar);
      }
    } else if (end || start) {
      const pin = end || start;
      const idx = days.indexOf(pin);
      if (idx >= 0) {
        const mark = document.createElement("div");
        mark.className = "checklist-gantt__mark is-" + tone;
        mark.style.left = `${((idx + 0.5) / days.length) * 100}%`;
        mark.title = `${it.name} · ${checklistGanttToneLabel(tone)} · ${end ? "Término" : "Início"} ${formatDataCurta(pin)}`;
        track.appendChild(mark);
      }
    }
    row.append(label, track);
    body.appendChild(row);
  });

  inner.append(head, body);
  scroll.appendChild(inner);
  host.appendChild(scroll);
  if (todayIdx >= 0) {
    const alvo = 176 + todayIdx * colPx - scroll.clientWidth / 2;
    scroll.scrollLeft = Math.max(0, alvo);
  }
}

function addChecklistEtapaFromForm() {
  if (!requireWriteAccess()) return;
  const draft = readChecklistEtapaDraft({
    name: "demChecklistEtapa",
    descricao: "demChecklistDesc",
    who: "demChecklistWho",
    dateInicio: "demChecklistDateInicio",
    date: "demChecklistDate",
  });
  if (!validateChecklistEtapa(draft, "demChecklistDateInicio")) return;
  const selStatus = document.getElementById("demChecklistStatus");
  const novoStatus = CHECKLIST_STATUS_LABEL[selStatus?.value] ? selStatus.value : "afazer";
  editingChecklistItemId = "";
  editingChecklist = [
    ...normalizeChecklist(editingChecklist),
    {
      id: uid(),
      name: draft.name,
      descricao: draft.descricao,
      who: draft.who,
      dateInicio: draft.dateInicio,
      date: draft.date,
      status: novoStatus,
      done: novoStatus === "concluida",
    },
  ];
  const etapa = document.getElementById("demChecklistEtapa");
  const desc = document.getElementById("demChecklistDesc");
  const resp = document.getElementById("demChecklistWho");
  if (etapa) etapa.value = "";
  if (desc) desc.value = "";
  if (resp) resp.value = "";
  ["demChecklistDateInicio", "demChecklistDate"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  if (selStatus) selStatus.value = "afazer";
  checklistFiltro = "todas";
  renderChecklistEditor();
  toast(`Atividade “${draft.name}” adicionada`);
  etapa?.focus();
}

function setChecklistNovaAberta(open) {
  const expand = document.getElementById("btnChecklistExpand");
  const details = document.getElementById("demChecklistDetails");
  if (expand) {
    expand.setAttribute("aria-expanded", String(open));
    expand.classList.toggle("is-open", open);
    setChecklistToggleLabel(expand, open ? "Fechar" : "Nova atividade");
  }
  if (details) details.hidden = !open;
  if (open) document.getElementById("demChecklistEtapa")?.focus();
}

function bindChecklistEditor() {
  const expand = document.getElementById("btnChecklistExpand");
  const details = document.getElementById("demChecklistDetails");
  expand?.addEventListener("click", () => {
    const open = expand.getAttribute("aria-expanded") === "true";
    setChecklistNovaAberta(!open);
  });
  document.getElementById("btnChecklistAddCancelar")?.addEventListener("click", () => setChecklistNovaAberta(false));
  document.getElementById("demChecklistFiltros")?.addEventListener("click", (e) => {
    const btn = e.target instanceof Element ? e.target.closest("[data-filtro]") : null;
    if (!btn) return;
    checklistFiltro = btn.dataset.filtro || "todas";
    renderChecklistEditor();
  });
  document.getElementById("btnChecklistGantt")?.addEventListener("click", () => {
    const btn = document.getElementById("btnChecklistGantt");
    const open = btn?.getAttribute("aria-expanded") === "true";
    setChecklistGanttOpen(!open);
  });
  document.getElementById("btnChecklistAdd")?.addEventListener("click", addChecklistEtapaFromForm);
  ["demChecklistEtapa", "demChecklistWho"].forEach((id) => {
    document.getElementById(id)?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addChecklistEtapaFromForm();
      }
    });
  });
}

/** Texto do comentário com links clicáveis (o resto escapado). */
function comentarioTextoHtml(texto) {
  return escapeHtml(texto).replace(
    /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]])/g,
    (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`,
  );
}

function renderComentariosList() {
  const list = document.getElementById("demComentariosList");
  const count = document.getElementById("demComentariosCount");
  if (count) {
    count.textContent = String(editingComentarios.length);
    count.hidden = !editingComentarios.length;
  }
  if (!list) return;
  if (!editingComentarios.length) {
    list.innerHTML =
      '<div class="comments-empty"><span class="comments-empty__ico" aria-hidden="true">💬</span>' +
      "<strong>Nenhum comentário ainda</strong><span>Registre atualizações, combinados e pendências do projeto.</span></div>";
    return;
  }
  const eu = getLoggedInComentarioAutor();
  const podeExcluir = !isReadOnlyUser();
  const groups = groupComentariosPorDia(editingComentarios);
  list.innerHTML = groups
    .map(
      (g) =>
        '<div class="comments-day-label"><span>' + escapeHtml(g.label) + "</span></div>" +
        g.items
          .map((c) => {
            const meu = eu && eu !== "Equipe" && c.autor === eu;
            return (
              '<article class="comment-row' + (meu ? " is-meu" : "") + '">' +
              '<div class="comment-avatar ' + comentarioAvatarClass(c.autor) + '" aria-hidden="true">' +
              escapeHtml(comentarioIniciais(c.autor)) + "</div>" +
              '<div class="comment-body"><div class="comment-head"><strong>' + escapeHtml(c.autor) +
              (meu ? ' <span class="comment-voce">você</span>' : "") +
              '</strong><time class="comment-time" datetime="' + escapeHtml(c.createdAt) + '" title="' +
              escapeHtml(formatComentarioData(c.createdAt)) + '">' + escapeHtml(formatComentarioRelativo(c.createdAt)) +
              "</time></div>" +
              '<p class="comment-text">' + comentarioTextoHtml(c.texto) + "</p></div>" +
              (podeExcluir
                ? '<button type="button" class="comment-del" data-cid="' + escapeHtml(c.id) +
                  '" title="Excluir comentário" aria-label="Excluir comentário">🗑</button>'
                : "") +
              "</article>"
            );
          })
          .join(""),
    )
    .join("");
  list.querySelectorAll(".comment-del").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const cid = btn.dataset.cid;
      const c = editingComentarios.find((x) => x.id === cid);
      const ok = await confirmDialog({
        title: "Excluir comentário?",
        message: c ? `“${c.texto.slice(0, 120)}${c.texto.length > 120 ? "…" : ""}”` : "",
        confirmText: "Excluir",
        cancelText: "Voltar",
        variant: "danger",
      });
      if (!ok) return;
      editingComentarios = editingComentarios.filter((x) => x.id !== cid);
      persistComentariosDemandaAberta();
      renderComentariosList();
      toast("Comentário excluído");
    });
  });
}

/** Campo de novo comentário: cresce com o texto e só habilita o envio com conteúdo. */
function syncComentarioCompose() {
  const ta = document.getElementById("demComentarioNovo");
  const btn = document.getElementById("btnAddComentario");
  const hint = document.getElementById("demComentarioHint");
  if (!ta) return;
  ta.style.height = "auto";
  ta.style.height = `${Math.min(ta.scrollHeight, 220)}px`;
  if (btn) btn.disabled = !ta.value.trim() || isReadOnlyUser();
  if (hint) {
    const restante = ta.maxLength - ta.value.length;
    const existente = Boolean((document.getElementById("demId")?.value || "").trim());
    hint.textContent =
      restante < 300
        ? `${restante} caracteres restantes · Ctrl+Enter envia`
        : existente
          ? "Ctrl+Enter envia · salvo na hora"
          : "Ctrl+Enter envia · salvo junto com o projeto";
  }
}

function persistComentariosDemandaAberta() {
  const demId = (document.getElementById("demId")?.value || "").trim() || editingDemandaOpenId;
  const dem = demId ? state.demandas.find((x) => x.id === demId) : null;
  if (!dem) return;
  const now = new Date().toISOString();
  dem.comentarios = normalizeComentarios(editingComentarios);
  dem.historicoAlertas = syncHistoricoAlertasOcultos(dem.historicoAlertas, editingComentarios);
  dem.updatedAt = now;
  editingDemandaBaselineUpdatedAt = now;
  noteOwnDemandaWrite(demId, now);
  saveState({ demanda: migrateDemanda(dem) });
}

function addComentarioFromForm() {
  const ta = document.getElementById("demComentarioNovo");
  if (!ta) return;
  const texto = ta.value.trim();
  if (!texto) {
    toast("Digite um comentário");
    ta.focus();
    return;
  }
  const c = normalizeComentario({ texto, autor: getLoggedInComentarioAutor(), createdAt: new Date().toISOString() });
  if (c) editingComentarios.unshift(c);
  ta.value = "";
  // Projeto existente: grava na hora (como a exclusão). Projeto novo: vai junto com o Salvar.
  if ((document.getElementById("demId")?.value || "").trim()) {
    persistComentariosDemandaAberta();
    toast("Comentário publicado");
  }
  renderComentariosList();
  syncComentarioCompose();
  ta.focus();
}

function setDemandaFormReadOnly(readOnly) {
  const form = document.getElementById("formDemanda");
  const modal = document.getElementById("modalDemanda");
  if (modal) modal.classList.toggle("demanda-modal--readonly", !!readOnly);
  if (form) {
    form.querySelectorAll("input, select, textarea, button").forEach((el) => {
      if (el.dataset.uiNav) return;
        if (el.id === "modalDemandaClose" || el.id === "btnFecharDemanda" || el.id === "btnEnviarClickup" || el.id === "btnCancelarClickup" || el.id === "btnDemClickupCiente" || el.id === "btnChecklistExpand" || el.id === "btnChecklistGantt") return;
      if (el.closest(".comments-panel__toggle")) return;
      if (el.classList.contains("timeline-move-up") || el.classList.contains("timeline-move-down") || el.classList.contains("checklist-item__move-up") || el.classList.contains("checklist-item__move-down")) {
        if (readOnly) el.disabled = true;
        return;
      }
      if (el.type === "hidden") return;
      if (readOnly) {
        if (el.tagName === "SELECT" || el.type === "checkbox" || el.type === "radio" || el.type === "file") {
          el.disabled = true;
        } else if (el.tagName === "BUTTON") {
          el.disabled = true;
        } else {
          el.readOnly = true;
          el.disabled = false;
        }
      } else {
        el.readOnly = false;
        if (!el.dataset.keepDisabled) el.disabled = false;
      }
    });
  }
  const btnSalvar = document.getElementById("btnSalvarDemanda");
  const btnExcluir = document.getElementById("btnExcluirDemanda");
  if (btnSalvar) btnSalvar.hidden = !!readOnly;
  if (btnExcluir) btnExcluir.hidden = !!readOnly;
  const title = document.getElementById("modalDemandaTitle");
  if (title && readOnly && title.textContent === "Editar demanda") {
    title.textContent = "Visualizar demanda";
  }
}

/* ---------- Modal demanda: seções recolhíveis com resumo ---------- */
const DEM_SECOES = [
  {
    key: "chegada",
    sel: ".fieldset--chegada",
    icone: '<path d="M2.5 9.5h3l1 2h3l1-2h3"/><path d="M2.5 9.5 4.5 3.5h7l2 6v3h-11z"/>',
  },
  {
    key: "atribuicao",
    sel: ".fieldset--atribuicao",
    icone: '<circle cx="8" cy="5.5" r="2.5"/><path d="M3 13.5c.6-2.6 2.6-4 5-4s4.4 1.4 5 4"/>',
  },
  {
    key: "esteira",
    sel: ".fieldset--esteira-form",
    icone: '<circle cx="8" cy="8.5" r="5.5"/><path d="M8 5.5v3l2 1.5"/>',
  },
  {
    key: "atraso",
    sel: "#fieldsetMotivosAtraso",
    icone: '<path d="M8 2.5 14 13H2z"/><path d="M8 6.5v3M8 11.3v.2"/>',
  },
  {
    key: "custo",
    sel: "#fieldsetCusto",
    icone: '<rect x="2" y="4" width="12" height="8.5" rx="1.5"/><circle cx="8" cy="8.2" r="1.8"/>',
  },
  {
    key: "referencias",
    sel: ".fieldset--referencias",
    icone: '<path d="M6.5 9.5 9.5 6.5"/><path d="M7 4.5 8.5 3a2.5 2.5 0 0 1 3.5 3.5L10.5 8M9 11.5 7.5 13A2.5 2.5 0 0 1 4 9.5L5.5 8"/>',
  },
  {
    key: "checklist",
    sel: ".fieldset--checklist",
    icone: '<rect x="2" y="2" width="12" height="12" rx="2.5"/><path d="M5 8.2l2 2 4-4.2"/>',
  },
  {
    key: "timeline",
    sel: ".fieldset--timeline",
    icone: '<path d="M2.5 4h6M5 8h8.5M3.5 12h5"/>',
  },
];
const DEM_SECOES_COLAPSADAS_KEY = "demandas.secoesColapsadas";
let demNavSyncRaf = 0;

function demSecaoEl(sec) {
  return document.querySelector(`#formDemanda ${sec.sel}`);
}

function demSvgIcone(paths) {
  return `<svg viewBox="0 0 16 16" aria-hidden="true">${paths}</svg>`;
}

function lerSecoesColapsadas() {
  try {
    const raw = JSON.parse(localStorage.getItem(DEM_SECOES_COLAPSADAS_KEY) || "[]");
    return new Set(Array.isArray(raw) ? raw : []);
  } catch {
    return new Set();
  }
}

function gravarSecoesColapsadas(set) {
  try {
    localStorage.setItem(DEM_SECOES_COLAPSADAS_KEY, JSON.stringify([...set]));
  } catch {
    /* preferência só local — sem storage, segue tudo aberto */
  }
}

function setSecaoColapsada(sec, colapsada, { persistir = true } = {}) {
  const fs = demSecaoEl(sec);
  if (!fs) return;
  fs.classList.toggle("is-collapsed", colapsada);
  fs.querySelector(".seg-toggle")?.setAttribute("aria-expanded", String(!colapsada));
  if (!persistir) return;
  const set = lerSecoesColapsadas();
  if (colapsada) set.add(sec.key);
  else set.delete(sec.key);
  gravarSecoesColapsadas(set);
}

function expandirTodasSecoes() {
  for (const sec of DEM_SECOES) setSecaoColapsada(sec, false, { persistir: false });
}

/* ---------- Seções do modal: modo leitura (resumo visual) + edição sob demanda ---------- */
/** Seções com leitura/edição (checklist e tempo na esteira já têm interação própria). */
const DEM_SECOES_LEITURA = ["chegada", "atribuicao", "esteira", "atraso", "custo", "referencias"];

function lvVal(id) {
  return (document.getElementById(id)?.value || "").trim();
}

function lvOptTxt(id) {
  const sel = document.getElementById(id);
  return sel && sel.value ? (sel.selectedOptions[0]?.textContent || "").trim() : "";
}

function lvPar(label, valorHtml, extra = "") {
  return (
    `<div class="seg-lv${extra}"><span class="seg-lv__label">${escapeHtml(label)}</span>` +
    `<span class="seg-lv__valor">${valorHtml}</span></div>`
  );
}

function lvVazio(txt = "—") {
  return `<span class="seg-lv__vazio">${escapeHtml(txt)}</span>`;
}

function lvData(iso, { relativo = false } = {}) {
  if (!iso) return lvVazio();
  const txt = escapeHtml(formatDataCurta(iso));
  if (!relativo) return txt;
  const dias = diasEntreDatasISO(iso, todayISODate());
  const rel = dias === 0 ? "hoje" : dias === 1 ? "há 1 dia" : `há ${dias} dias`;
  return `${txt} <span class="seg-lv__sub">${rel}</span>`;
}

function lvPessoa(nome) {
  return (
    `<span class="seg-lv__pessoa"><span class="ck-avatar" style="--avatar-h:${cardAvatarHue(nome)}" aria-hidden="true">` +
    `${escapeHtml(cardAvatarIniciais(nome))}</span>${escapeHtml(nome)}</span>`
  );
}

function lvMoney(id) {
  const v = lvVal(id);
  return v ? `R$ ${escapeHtml(v)}` : "";
}

/** Cores dos cabos no resumo do levantamento — paleta categórica validada. */
const CUSTO_LV_CORES = ["#3987e5", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#9085e9"];

function formatIntBr(n) {
  return formatBr().formatIntegerBr?.(n) ?? Number(n).toLocaleString("pt-BR");
}

function custoLvNum(txt) {
  if (!txt) return null;
  const n = parseFloat(String(txt).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function custoLvLinha(rotuloHtml, valorHtml, rotuloJaHtml = false) {
  return `<div class="custo-lv__linha"><span>${rotuloJaHtml ? rotuloHtml : escapeHtml(rotuloHtml)}</span><span>${valorHtml}</span></div>`;
}

function custoLvBloco(ico, titulo, principalHtml, corpoHtml) {
  return (
    `<section class="custo-lv__bloco" data-bloco="${escapeHtml(titulo)}">` +
    `<header class="custo-lv__bloco-head"><span class="custo-lv__ico" aria-hidden="true">${ico}</span>${escapeHtml(titulo)}</header>` +
    principalHtml +
    (corpoHtml ? `<div class="custo-lv__corpo">${corpoHtml}</div>` : "") +
    `</section>`
  );
}

function demSecaoLeituraHtml(key) {
  switch (key) {
    case "chegada": {
      const tipo = normalizeTipo(lvVal("demTipo"));
      const extraTipo = tipo === "B2B" ? lvOptTxt("demProdutoB2b") : tipo === "B2C" ? lvOptTxt("demSegmentoB2c") : "";
      const desc = lvVal("demDescricao");
      return (
        `<div class="seg-lv-hero"><p class="seg-lv-hero__titulo">${escapeHtml(lvVal("demTitulo")) || lvVazio("Sem nome")}</p>` +
        `<div class="seg-lv-hero__tags"><span class="badge ${tipoBadgeClass(tipo)}">${escapeHtml(tipo)}</span>` +
        (extraTipo ? `<span class="badge badge--segmento-b2c">${escapeHtml(extraTipo)}</span>` : "") +
        `</div></div>` +
        `<div class="seg-lv-grid">${lvPar("Chegada", lvData(lvVal("demDataChegada"), { relativo: true }))}</div>` +
        `<div class="seg-lv-texto">${desc ? escapeHtml(desc) : lvVazio("Sem descrição")}</div>`
      );
    }
    case "atribuicao": {
      const resp = normalizeResponsavel(lvVal("demResponsavel"));
      const extras = editingProjetistasExtra || [];
      const pessoas = resp
        ? [resp, ...extras].map(lvPessoa).join("")
        : `<span class="badge badge--pend">Não atribuído</span>`;
      const cidade = lvOptTxt("demCidade");
      const regional = lvOptTxt("demRegional");
      const cidadesExtra = readCidadesExtraFromForm();
      const local =
        (regional || cidade
          ? `${escapeHtml([regional, cidade].filter(Boolean).join(" · "))}`
          : lvVazio()) +
        (cidadesExtra.length
          ? `<span class="seg-lv__chips">${cidadesExtra.map((c) => `<span class="seg-lv__chip">+ ${escapeHtml(c)}</span>`).join("")}</span>`
          : "");
      const sol = readSolicitanteFromForm();
      const setor = readSetorSolicitanteB2bFromForm();
      return (
        `<div class="seg-lv-grid seg-lv-grid--2">` +
        lvPar(extras.length ? "Projetistas" : "Projetista", `<span class="seg-lv__pessoas">${pessoas}</span>`) +
        lvPar("Local", local) +
        lvPar("Solicitante", sol ? `${escapeHtml(sol)}${setor ? ` <span class="seg-lv__sub">${escapeHtml(setor)}</span>` : ""}` : lvVazio()) +
        `</div>`
      );
    }
    case "esteira": {
      const prev = demandaPreviewFromForm();
      const prazo = cardPrazoInfo(prev);
      const statusAtual = lvVal("demStatusAtual");
      const dias = demandaInicioContagemAberto(prev) ? formatDiasAbertoLabel(demandaDiasAberto(prev)) : "";
      const prazoHtml = prazo
        ? `<div class="card__prazo card__prazo--${prazo.tom} seg-lv-prazo"><div class="card__prazo-bar"><span style="width:${prazo.pct}%"></span></div>` +
          `<p class="card__prazo-txt">${escapeHtml(prazo.texto)}</p></div>`
        : `<p class="seg-lv__vazio seg-lv-prazo">Sem finalização prevista</p>`;
      return (
        `<div class="seg-lv-hero seg-lv-hero--linha"><span class="seg-lv-etapa">${escapeHtml(
          labelStatus(lvVal("demStatus"), editingLinhaEsteira),
        )}</span>` +
        `<p class="seg-lv-status">${statusAtual ? escapeHtml(statusAtual) : lvVazio("Sem status atual")}</p></div>` +
        prazoHtml +
        `<div class="seg-lv-grid">` +
        lvPar("Chegada", lvData(prev.dataChegada)) +
        lvPar("Finalização prevista", lvData(lvVal("demDataFimPrevista"))) +
        (lvVal("demDataFimAtualizada") ? lvPar("Finalização atualizada", lvData(lvVal("demDataFimAtualizada"))) : "") +
        (lvVal("demDataTermino") ? lvPar("Término", lvData(lvVal("demDataTermino"))) : "") +
        (dias ? lvPar("Dias aberto", escapeHtml(dias)) : "") +
        `</div>`
      );
    }
    case "atraso": {
      const itens = readMotivosAtrasoFromDom({ forSave: true });
      const totalDias = demandaDiasAtraso(demandaPreviewFromForm());
      if (!itens.length) return `<p class="seg-lv__vazio">Nenhum motivo registrado — clique para informar.</p>`;
      return (
        `<ul class="seg-lv-lista">${itens
          .map(
            (it) =>
              `<li><span>${escapeHtml(it.motivo || "Sem descrição")}</span>${
                it.dias !== "" ? `<b>${escapeHtml(formatDiasAtrasoLabel(it.dias))}</b>` : ""
              }</li>`,
          )
          .join("")}</ul>` +
        (totalDias > 0 ? `<p class="seg-lv__sub">Atraso total: <strong>${escapeHtml(formatDiasAtrasoLabel(totalDias))}</strong></p>` : "")
      );
    }
    case "custo": {
      const exec = lvVal("custoExecucao");
      const temExec = exec && exec !== "Não se aplica";
      const blocos = [];
      if (temExec) {
        const linhas = [];
        if (lvMoney("custoExecucaoRegional")) linhas.push(custoLvLinha("Custo da Regional", lvMoney("custoExecucaoRegional")));
        if (lvMoney("custoExecucaoTerceirizada")) linhas.push(custoLvLinha("Custo da Terceirizada", lvMoney("custoExecucaoTerceirizada")));
        if (linhas.length === 2) {
          const soma = [custoLvNum(lvVal("custoExecucaoRegional")), custoLvNum(lvVal("custoExecucaoTerceirizada"))].reduce((a, n) => a + (n || 0), 0);
          const brl = formatBr().formatMoneyBr?.(soma);
          if (brl) linhas.push(`<div class="custo-lv__destaque"><span>Total da execução</span><strong>R$ ${escapeHtml(brl)}</strong></div>`);
        }
        if (!linhas.length) linhas.push(`<p class="seg-lv__vazio">Custo não informado</p>`);
        blocos.push(custoLvBloco("🛠", "Execução", `<p class="custo-lv__big">${escapeHtml(exec)}</p>`, linhas.join("")));
      }
      if (lvVal("demTemLevantamento") !== "sim") {
        return (
          `<p class="seg-lv__vazio">Sem levantamento de custo (não se aplica).</p>` +
          (blocos.length ? `<div class="custo-lv__blocos">${blocos.join("")}</div>` : "")
        );
      }
      const conta =
        `<div class="custo-lv__conta">` +
        `<div class="custo-lv__termo"><span class="seg-lv__label">Valor do projeto</span><strong>${lvMoney("custoValorProjeto") || "—"}</strong></div>` +
        `<span class="custo-lv__op" aria-hidden="true">+</span>` +
        `<div class="custo-lv__termo"><span class="seg-lv__label">Acréscimo 5%</span><strong>${lvMoney("custoValor5") || "—"}</strong></div>` +
        `<span class="custo-lv__op" aria-hidden="true">=</span>` +
        `<div class="custo-lv__termo is-final"><span class="seg-lv__label">Valor final</span><strong>${lvMoney("custoValorFinal") || "—"}</strong></div>` +
        `</div>`;
      if (lvVal("demTemPortas") === "sim") {
        const num = (id) => custoLvNum(lvVal(id));
        const casas = num("custoQtdCasas");
        const existentes = num("custoQtdPortasAtual") ?? 0;
        const novas = num("custoQtdNovasPortas") ?? 0;
        const linhas = [
          custoLvLinha("Portas existentes", escapeHtml(lvVal("custoQtdPortasAtual") || "0")),
          custoLvLinha("Total após o projeto", `<strong>${escapeHtml(formatIntBr(existentes + novas))}</strong>`),
          custoLvLinha("Casas", casas ? escapeHtml(lvVal("custoQtdCasas")) : lvVazio("Não informado")),
        ];
        let penetracao = "";
        const atual = custoLvNum(lvVal("custoPenetracaoAtual"));
        const nova = custoLvNum(lvVal("custoNovaPenetracao"));
        if (casas && nova != null) {
          const pa = Math.max(0, Math.min(100, atual ?? 0));
          const pn = Math.max(pa, Math.min(100, nova));
          penetracao =
            `<div class="custo-lv__pen">` +
            `<div class="custo-lv__pen-head"><span>Penetração</span><span>${escapeHtml(lvVal("custoPenetracaoAtual") || "0%")} → <strong>${escapeHtml(
              lvVal("custoNovaPenetracao"),
            )}</strong></span></div>` +
            `<div class="custo-lv__pen-bar" role="img" aria-label="Penetração de ${escapeHtml(lvVal("custoPenetracaoAtual") || "0%")} para ${escapeHtml(
              lvVal("custoNovaPenetracao"),
            )}"><span class="custo-lv__pen-nova" style="width:${pn}%"></span><span class="custo-lv__pen-atual" style="width:${pa}%"></span></div>` +
            `</div>`;
        }
        const vpp = lvMoney("custoValorPorPortaNova");
        blocos.unshift(
          custoLvBloco(
            "🚪",
            "Portas",
            `<p class="custo-lv__big">+ ${escapeHtml(formatIntBr(novas))} <small>${novas === 1 ? "porta nova" : "portas novas"}</small></p>`,
            linhas.join("") +
              penetracao +
              (vpp ? `<div class="custo-lv__destaque"><span>Valor por porta nova</span><strong>${vpp}</strong></div>` : ""),
          ),
        );
      }
      if (lvVal("demTemLancamento") === "sim") {
        const cabos = (editingLancamentoCabos || [])
          .map((c) => ({ tipo: c.tipo || "Cabo", m: Number(c.metragem) }))
          .filter((c) => Number.isFinite(c.m) && c.m > 0);
        const total = cabos.reduce((acc, c) => acc + c.m, 0);
        let detalhe = `<p class="seg-lv__vazio">Nenhum cabo informado</p>`;
        if (cabos.length && total > 0) {
          const cor = (i) => CUSTO_LV_CORES[i % CUSTO_LV_CORES.length];
          detalhe =
            (cabos.length > 1
              ? `<div class="custo-lv__stack" aria-hidden="true">${cabos
                  .map((c, i) => `<span style="flex:${c.m} 1 0;background:${cor(i)}"></span>`)
                  .join("")}</div>`
              : "") +
            cabos
              .map((c, i) =>
                custoLvLinha(
                  `<i class="custo-lv__dot" style="background:${cor(i)}"></i>${escapeHtml(c.tipo)}`,
                  `${escapeHtml(formatIntBr(c.m))} m` +
                    (cabos.length > 1 ? ` <span class="seg-lv__sub">${Math.round((c.m / total) * 100)}%</span>` : ""),
                  true,
                ),
              )
              .join("");
        }
        const totalTxt = lvVal("custoTotalMetragem") || formatIntBr(total);
        const idx = blocos.length && blocos[blocos.length - 1].includes('data-bloco="Execução"') ? blocos.length - 1 : blocos.length;
        blocos.splice(idx, 0, custoLvBloco("🧵", "Lançamento", `<p class="custo-lv__big">${escapeHtml(totalTxt)} <small>m de cabo</small></p>`, detalhe));
      }
      if (editingPdfLevantamento?.name) {
        const nome = escapeHtml(editingPdfLevantamento.name);
        blocos.push(
          custoLvBloco(
            "📄",
            "PDF do levantamento",
            editingPdfLevantamento.dataUrl
              ? `<a href="${editingPdfLevantamento.dataUrl}" download="${nome}" target="_blank" rel="noopener" class="custo-lv__pdf" data-lv-acao="1">⬇ ${nome}</a>`
              : `<p class="custo-lv__pdf">${nome}</p>`,
            "",
          ),
        );
      }
      return `<div class="custo-lv">${conta}${blocos.length ? `<div class="custo-lv__blocos">${blocos.join("")}</div>` : ""}</div>`;
    }
    case "referencias": {
      const link = document.getElementById("demClickupLink");
      const hint = (document.getElementById("demClickupHint")?.textContent || "").trim();
      const podeEnviar = !document.getElementById("btnEnviarClickup")?.hidden;
      let clickup = "";
      if (link && !link.hidden && link.getAttribute("href")) {
        clickup =
          `${escapeHtml(hint || "Tarefa criada")} ` +
          `<a class="seg-lv__link" href="${escapeHtml(link.getAttribute("href"))}" target="_blank" rel="noopener" data-lv-acao="1">Abrir no ClickUp ↗</a>`;
      } else if (podeEnviar) {
        clickup = `<button type="button" class="btn btn--primary btn--sm" data-lv-clickup="1" data-lv-acao="1">Enviar à Operação</button>`;
      } else {
        clickup = hint ? escapeHtml(hint) : lvVazio("Não enviada");
      }
      return (
        `<div class="seg-lv-grid">` +
        lvPar("Chamado Ocomon", lvVal("demChamadoOcomon") ? `<span class="seg-lv__codigo">${escapeHtml(lvVal("demChamadoOcomon"))}</span>` : lvVazio()) +
        lvPar("O.S. Aniel", lvVal("demOsAniel") ? `<span class="seg-lv__codigo">${escapeHtml(lvVal("demOsAniel"))}</span>` : lvVazio()) +
        lvPar("ClickUp (Operação)", clickup) +
        `</div>`
      );
    }
    default:
      return "";
  }
}

/** Campos obrigatórios vazios fazem a seção abrir direto em edição. */
function demSecaoTemPendencia(key) {
  if (key === "chegada") return !lvVal("demTitulo") || !lvVal("demDescricao") || !lvVal("demDataChegada");
  if (key === "atribuicao") return !lvVal("demCidade");
  if (key === "esteira") return !lvVal("demStatusAtual");
  if (key === "atraso") return !readMotivosAtrasoFromDom({ forSave: true }).length;
  return false;
}

function renderDemSecaoLeitura(sec) {
  const fs = demSecaoEl(sec);
  const box = fs?.querySelector(":scope > .seg-leitura");
  if (!box) return;
  const podeEditar = !isReadOnlyUser();
  box.innerHTML =
    (podeEditar ? `<button type="button" class="seg-leitura__editar" data-ui-nav="1" data-lv-acao="1">✎ Editar</button>` : "") +
    demSecaoLeituraHtml(sec.key);
}

function setDemSecaoModo(sec, modo) {
  const fs = demSecaoEl(sec);
  if (!fs) return;
  const leitura = modo === "leitura";
  if (leitura) renderDemSecaoLeitura(sec);
  fs.classList.toggle("is-leitura", leitura);
  fs.classList.toggle("is-editando", !leitura && fs.dataset.lvExistente === "1");
}

/** Ao abrir o modal: projeto existente começa em leitura; novo (ou com pendência) em edição. */
function iniciarModosSecoesDemanda(existente) {
  for (const sec of DEM_SECOES) {
    if (!DEM_SECOES_LEITURA.includes(sec.key)) continue;
    const fs = demSecaoEl(sec);
    if (!fs) continue;
    fs.dataset.lvExistente = existente ? "1" : "";
    const leitura = existente && (isReadOnlyUser() || !demSecaoTemPendencia(sec.key));
    setDemSecaoModo(sec, leitura ? "leitura" : "edicao");
  }
}

function secoesParaEdicao() {
  for (const sec of DEM_SECOES) {
    if (DEM_SECOES_LEITURA.includes(sec.key) && demSecaoEl(sec)?.classList.contains("is-leitura")) {
      setDemSecaoModo(sec, "edicao");
    }
  }
}

function initDemSecoesLeitura() {
  for (const sec of DEM_SECOES) {
    if (!DEM_SECOES_LEITURA.includes(sec.key)) continue;
    const fs = demSecaoEl(sec);
    if (!fs || fs.querySelector(":scope > .seg-leitura")) continue;
    const box = document.createElement("div");
    box.className = "seg-leitura";
    box.title = "Clique para editar";
    fs.querySelector(":scope > legend")?.after(box);
    box.addEventListener("click", (e) => {
      const alvo = e.target instanceof Element ? e.target : null;
      if (alvo?.closest("[data-lv-clickup]")) {
        e.preventDefault();
        document.getElementById("btnEnviarClickup")?.click();
        return;
      }
      if (alvo?.closest("a[data-lv-acao]")) return;
      if (isReadOnlyUser()) return;
      setDemSecaoModo(sec, "edicao");
      fs.querySelector("input:not([type=hidden]):not([type=file]), select, textarea")?.focus({ preventScroll: true });
    });
    // Rodapé da edição: volta para a leitura.
    const foot = document.createElement("div");
    foot.className = "seg-edit-foot";
    foot.innerHTML = `<button type="button" class="btn btn--ghost btn--sm seg-edit-foot__ok" data-ui-nav="1">✓ Concluir edição</button>`;
    foot.querySelector("button").addEventListener("click", () => {
      setDemSecaoModo(sec, "leitura");
      fs.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    fs.appendChild(foot);
  }
}

/** Resumo curto de cada seção: aparece no título quando ela está recolhida. */
function demSecaoResumo(key) {
  const val = (id) => (document.getElementById(id)?.value || "").trim();
  const optTxt = (id) => {
    const sel = document.getElementById(id);
    return sel && sel.value ? (sel.selectedOptions[0]?.textContent || "").trim() : "";
  };
  switch (key) {
    case "chegada": {
      const falta = !val("demTitulo") || !val("demDescricao") || !val("demDataChegada");
      if (falta) return { txt: "Faltam dados", tom: "alerta" };
      return { txt: `${val("demTipo")} · chegou ${formatDataCurta(val("demDataChegada")).slice(0, 5)}`, tom: "ok" };
    }
    case "atribuicao": {
      const resp = normalizeResponsavel(val("demResponsavel"));
      const cidade = optTxt("demCidade");
      if (!resp) return { txt: cidade ? `Sem projetista · ${cidade}` : "Sem projetista", tom: "alerta" };
      const extras = editingProjetistasExtra.length ? ` +${editingProjetistasExtra.length}` : "";
      return { txt: `${resp}${extras}${cidade ? ` · ${cidade}` : ""}`, tom: "ok" };
    }
    case "esteira": {
      const prazo = cardPrazoInfo(demandaPreviewFromForm());
      if (!prazo) return { txt: "Sem prazo", tom: "neutro" };
      return { txt: prazo.texto, tom: prazo.tom };
    }
    case "atraso": {
      const n = readMotivosAtrasoFromDom({ forSave: true }).length;
      return n ? { txt: `${n} motivo(s)`, tom: "atraso" } : { txt: "Informe o motivo", tom: "atraso" };
    }
    case "custo": {
      if (val("demTemLevantamento") !== "sim") return { txt: "Não se aplica", tom: "neutro" };
      const final = val("custoValorFinal");
      return final ? { txt: `R$ ${final}`, tom: "ok" } : { txt: "Sem valor", tom: "alerta" };
    }
    case "referencias": {
      const refs = [];
      if (val("demChamadoOcomon")) refs.push(`Ocomon ${val("demChamadoOcomon")}`);
      if (val("demOsAniel")) refs.push(`O.S. ${val("demOsAniel")}`);
      if (!document.getElementById("demClickupLink")?.hidden) refs.push("ClickUp");
      return refs.length ? { txt: refs.join(" · "), tom: "ok" } : { txt: "Nenhuma", tom: "neutro" };
    }
    case "checklist": {
      const n = editingChecklist.length;
      if (!n) return { txt: "Sem atividades", tom: "neutro" };
      const feitas = editingChecklist.filter((it) => it.done).length;
      return { txt: `${feitas}/${n}`, tom: feitas === n ? "ok" : "alerta" };
    }
    case "timeline": {
      const n = document.querySelectorAll("#demTimelineTable tbody tr").length;
      return n ? { txt: `${n} fase(s)`, tom: "neutro" } : { txt: "Sem histórico", tom: "neutro" };
    }
    default:
      return { txt: "", tom: "neutro" };
  }
}

function syncDemSecoesResumo() {
  for (const sec of DEM_SECOES) {
    const fs = demSecaoEl(sec);
    const alvo = fs?.querySelector(".seg-toggle__resumo");
    if (!alvo) continue;
    const r = demSecaoResumo(sec.key);
    alvo.textContent = r.txt;
    alvo.className = `seg-toggle__resumo dem-tom--${r.tom}`;
  }
}

function syncDemNavegacao() {
  demNavSyncRaf = 0;
  syncDemSecoesResumo();
  syncDemandaSujaUi();
}

function agendarSyncDemNavegacao() {
  if (demNavSyncRaf) return;
  demNavSyncRaf = requestAnimationFrame(syncDemNavegacao);
}

function initDemNavegacao() {
  const form = document.getElementById("formDemanda");
  if (!form || form.dataset.navInited) return;
  form.dataset.navInited = "1";
  const colapsadas = lerSecoesColapsadas();
  for (const sec of DEM_SECOES) {
    const fs = demSecaoEl(sec);
    const legend = fs?.querySelector(":scope > legend");
    if (!legend) continue;
    const titulo = legend.textContent.trim();
    legend.innerHTML =
      `<button type="button" class="seg-toggle" data-ui-nav="1" aria-expanded="true">` +
      `<span class="seg-toggle__ico">${demSvgIcone(sec.icone)}</span>` +
      `<span class="seg-toggle__titulo">${escapeHtml(titulo)}</span>` +
      `<span class="seg-toggle__resumo"></span>` +
      `<span class="seg-toggle__chev" aria-hidden="true">▾</span>` +
      `</button>`;
    legend.querySelector(".seg-toggle").addEventListener("click", () => {
      setSecaoColapsada(sec, !fs.classList.contains("is-collapsed"));
    });
    if (colapsadas.has(sec.key)) setSecaoColapsada(sec, true, { persistir: false });
  }
  // Qualquer edição (inclusive listas re-renderizadas por botões) atualiza os resumos.
  form.addEventListener("input", agendarSyncDemNavegacao);
  form.addEventListener("change", agendarSyncDemNavegacao);
  form.addEventListener("click", agendarSyncDemNavegacao);
  // Validação do Salvar foca campos: abre tudo antes para o foco achar o campo.
  document.getElementById("btnSalvarDemanda")?.parentElement?.addEventListener(
    "click",
    (e) => {
      if (e.target instanceof Element && e.target.closest("#btnSalvarDemanda")) {
        expandirTodasSecoes();
        secoesParaEdicao();
      }
    },
    true,
  );
  initDemSecoesLeitura();
}

initDemNavegacao();

function openDemandaModal(id) {
  if (!id && isReadOnlyUser()) {
    toast("Seu perfil (Visibilidade) e somente leitura");
    return;
  }
  if (editingDemandaOpenId && editingDemandaOpenId !== id) {
    releaseDemandaEditing(editingDemandaOpenId);
  }
  stopPresenceHeartbeat();

  const d = id ? state.demandas.find((x) => x.id === id) : null;
  const dm = d ? migrateDemanda(d) : null;
  clickupUiOverride = null;
  editingDemandaOpenId = d?.id || null;
  editingDemandaBaselineUpdatedAt = d?.updatedAt || "";
  hideDemandaModalAlerts();
  editingLinhaEsteira = dm ? dm.linhaEsteira : activeEsteiraCanal;
  fillDemResponsavelSelect(editingLinhaEsteira);
  fillStatusSelect(editingLinhaEsteira);
  const cfg = getEsteiraConfig(editingLinhaEsteira);
  document.getElementById("modalDemandaTitle").textContent = d
    ? "Editar demanda"
    : editingLinhaEsteira === LINHA_ESTEIRA_B2B
      ? "Registrar demanda B2B"
      : "Registrar chegada da demanda";
  document.getElementById("demId").value = d?.id || "";
  const btnExcluirDem = document.getElementById("btnExcluirDemanda");
  if (btnExcluirDem) btnExcluirDem.textContent = d?.id ? "🗑 Excluir" : "Descartar rascunho";
  document.getElementById("demTitulo").value = d?.titulo || "";
  setDemCidadeUi(d?.cidade || "");
  editingCidadesExtra = normalizeCidadesExtra(dm?.cidadesExtra || d?.cidadesExtra, d?.cidade || "");
  const extraReg = document.getElementById("demExtraRegional");
  if (extraReg) extraReg.value = "";
  renderCidadesExtraList();
  document.getElementById("demDataChegada").value = d?.dataChegada || todayISODate();
  document.getElementById("demDataFimPrevista").value = d?.dataFimPrevista || "";
  document.getElementById("demDataFimAtualizada").value = d?.dataFimAtualizada || "";
  document.getElementById("demDataTermino").value = d ? d.dataTermino || demandaDataTermino(d) || "" : "";
  document.getElementById("demSolicitante").value = d?.solicitante || "";
  const selSetorSol = document.getElementById("demSetorSolicitanteB2b");
  if (selSetorSol) selSetorSol.value = dm?.setorSolicitanteB2b || SETORES_SOLICITANTE_B2B[0];
  const selSolB2b = document.getElementById("demSolicitanteB2b");
  if (selSolB2b) {
    const sol = dm?.solicitante || "";
    selSolB2b.value = SOLICITANTES_B2B_COMERCIAL.includes(sol) ? sol : "";
  }
  document.getElementById("demResponsavel").value = normalizeResponsavel(d?.responsavel);
  editingProjetistasExtra = normalizeProjetistasExtra(dm?.projetistasExtra || d?.projetistasExtra, d?.responsavel || "");
  renderProjetistasExtraList();
  syncDemTipoSelect(d?.tipo || (editingLinhaEsteira === LINHA_ESTEIRA_B2B ? "B2B" : "B2C"));
  const selProduto = document.getElementById("demProdutoB2b");
  if (selProduto) selProduto.value = dm?.produtoB2b || "";
  const selSegmento = document.getElementById("demSegmentoB2c");
  if (selSegmento) selSegmento.value = dm?.segmentoB2c || "";
  syncDemCamposPorTipo();
  document.getElementById("demStatus").value = d?.status || cfg.inboxStatus;
  document.getElementById("demStatusAtual").value = d?.statusAtual || "";
  renderMotivosAtrasoLista(dm?.motivosAtrasoItens || normalizeMotivosAtrasoItens(d));
  document.getElementById("demDescricao").value = d?.descricao || "";
  const elChamado = document.getElementById("demChamadoOcomon");
  if (elChamado) elChamado.value = dm?.chamadoOcomon || "";
  const elOsAniel = document.getElementById("demOsAniel");
  if (elOsAniel) elOsAniel.value = dm?.osAniel || "";
  syncDemClickupUi();
  editingCustoBaseline = JSON.parse(JSON.stringify(normalizeCusto(d?.custo)));
  pdfCustoAppliedInSession = false;
  applyCustoToForm(editingCustoBaseline);
  editingImages = JSON.parse(JSON.stringify(d?.imagens || []));
  editingPdfLevantamento = d?.pdfLevantamento
    ? JSON.parse(JSON.stringify(normalizePdfLevantamento(d.pdfLevantamento)))
    : null;
  lastPdfParseResult = null;
  editingComentarios = JSON.parse(JSON.stringify(normalizeComentarios(dm?.comentarios || d?.comentarios || [])));
  editingChecklist = JSON.parse(JSON.stringify(normalizeChecklist(dm?.checklist || d?.checklist || [])));
  editingChecklistItemId = "";
  const expandBtn = document.getElementById("btnChecklistExpand");
  const details = document.getElementById("demChecklistDetails");
  checklistFiltro = "todas";
  checklistRecemConcluidaId = "";
  if (expandBtn) {
    expandBtn.setAttribute("aria-expanded", "false");
    expandBtn.classList.remove("is-open");
    setChecklistToggleLabel(expandBtn, "Nova atividade");
  }
  if (details) details.hidden = true;
  setChecklistGanttOpen(false);
  // Datas da nova atividade começam vazias (opcionais) e o status em "A fazer".
  const dateStartEl = document.getElementById("demChecklistDateInicio");
  if (dateStartEl) dateStartEl.value = "";
  const dateEl = document.getElementById("demChecklistDate");
  if (dateEl) dateEl.value = "";
  const statusNovoEl = document.getElementById("demChecklistStatus");
  if (statusNovoEl) statusNovoEl.value = "afazer";
  const etapaEl = document.getElementById("demChecklistEtapa");
  const descEl = document.getElementById("demChecklistDesc");
  const whoEl = document.getElementById("demChecklistWho");
  if (etapaEl) etapaEl.value = "";
  if (descEl) descEl.value = "";
  if (whoEl) whoEl.value = "";
  renderChecklistEditor();
  const comentarioNovo = document.getElementById("demComentarioNovo");
  if (comentarioNovo) comentarioNovo.value = "";
  renderComentariosList();
  syncComentarioCompose();
  renderPdfLevantamentoPreview();
  renderTimeline(d);
  bindMotivosAtrasoUi();
  syncDemConclusaoFields();
  syncMotivosAtrasoField();
  syncDiasAbertoResumo();

  if (d?.id && !isReadOnlyUser()) {
    const other = normalizeEditingBy(d.editingBy);
    const me = getCurrentUserEmail();
    if (other && other.email !== me) {
      toast(`${other.autor} também está com este projeto aberto`);
    }
    const presence = buildEditingPresence();
    if (presence) {
      setDemandaEditingBy(d.id, presence);
      startPresenceHeartbeat(d.id);
    } else {
      toast("Faça login para marcar que você está editando (presença na esteira).");
    }
  }

  setDemandaFormReadOnly(isReadOnlyUser());
  refreshChecklistMoveButtons();
  refreshTimelineMoveButtons();
  refreshTimelineDeleteButtons();
  renderCidadesExtraList();
  renderProjetistasExtraList();
  syncDemClickupUi();
  const scrollSnap = snapshotPageScroll();
  setDemandaModalScrollLock(true);
  syncDemNavegacao();
  iniciarModosSecoesDemanda(Boolean(d?.id));
  modalDemanda.showModal();
  marcarDemandaLimpa();
  document.getElementById("demFormCol")?.scrollTo({ top: 0 });
  restorePageScroll(scrollSnap);
  requestAnimationFrame(() => syncDemNavegacao());
  requestAnimationFrame(() => syncDemandaModalAlerts());
}

function readTimelineHistoricoFromDom() {
  const segments = [];
  document.querySelectorAll("#demTimelineTable tbody tr").forEach((tr) => {
    const status = tr.dataset.status;
    if (!status) return;
    segments.push({
      status,
      inicio: datetimeLocalToIso(tr.querySelector(".timeline-inicio")?.value) || "",
      fim: datetimeLocalToIso(tr.querySelector(".timeline-fim")?.value || "") || "",
      observacao: tr.querySelector(".timeline-obs")?.value.trim() || "",
    });
  });
  return normalizeHistoricoStatus(segments);
}

function syncDemStatusFromTimeline() {
  renderTimelineResumo();
  const rows = document.querySelectorAll("#demTimelineTable tbody tr");
  if (!rows.length) return;
  const last = rows[rows.length - 1];
  const st = last.dataset.status;
  const sel = document.getElementById("demStatus");
  if (st && sel) {
    sel.value = st;
    syncDemConclusaoFields();
    syncMotivosAtrasoField();
    syncDiasAbertoResumo();
  }
}

function refreshTimelineDeleteButtons() {
  const rows = document.querySelectorAll("#demTimelineTable tbody tr");
  const onlyOne = rows.length <= 1;
  rows.forEach((tr) => {
    const btn = tr.querySelector(".timeline-remove");
    if (btn) {
      btn.disabled = onlyOne;
      if (btn.disabled) btn.dataset.keepDisabled = "1";
      else delete btn.dataset.keepDisabled;
      btn.title = onlyOne ? "Deve restar pelo menos uma fase" : "Excluir esta fase do histórico";
    }
  });
}

function refreshTimelineMoveButtons() {
  const readOnly = isReadOnlyUser();
  const rows = Array.from(document.querySelectorAll("#demTimelineTable tbody tr"));
  rows.forEach((tr, idx) => {
    const btnUp = tr.querySelector(".timeline-move-up");
    const btnDown = tr.querySelector(".timeline-move-down");
    if (btnUp) {
      btnUp.disabled = readOnly || idx === 0;
      if (btnUp.disabled) btnUp.dataset.keepDisabled = "1";
      else delete btnUp.dataset.keepDisabled;
      btnUp.title = idx === 0 ? "Primeira fase" : "Mover fase para cima";
    }
    if (btnDown) {
      btnDown.disabled = readOnly || idx === rows.length - 1;
      if (btnDown.disabled) btnDown.dataset.keepDisabled = "1";
      else delete btnDown.dataset.keepDisabled;
      btnDown.title = idx === rows.length - 1 ? "Última fase" : "Mover fase para baixo";
    }
  });
}

function swapTimelineRowUp(tr) {
  if (isReadOnlyUser() || !requireWriteAccess()) return;
  const tb = tr?.parentElement;
  if (!tb) return;
  const prev = tr.previousElementSibling;
  if (!prev) return;
  tb.insertBefore(tr, prev);
  syncDemStatusFromTimeline();
  refreshTimelineDeleteButtons();
  refreshTimelineMoveButtons();
}

function swapTimelineRowDown(tr) {
  if (isReadOnlyUser() || !requireWriteAccess()) return;
  const tb = tr?.parentElement;
  if (!tb) return;
  const next = tr.nextElementSibling;
  if (!next) return;
  tb.insertBefore(next, tr);
  syncDemStatusFromTimeline();
  refreshTimelineDeleteButtons();
  refreshTimelineMoveButtons();
}

function timelineSetorHtml(status, linha = editingLinhaEsteira) {
  const setor = setorForStatusDemanda(status, linha);
  if (setor) return setorBadgeHtml(setor);
  if (isTempoStatusExcludedDemanda(status, linha)) return '<span class="muted">—</span>';
  return '<span class="dash-setor dash-setor--outros">Outros</span>';
}

function confirmExcluirFaseTimeline(seg) {
  const lab = labelStatus(seg.status, editingLinhaEsteira);
  const setor = setorForStatusDemanda(seg.status, editingLinhaEsteira) || "—";
  const inicio = seg.inicio ? formatComentarioData(seg.inicio) : "—";
  const fim = seg.fim ? formatComentarioData(seg.fim) : "em andamento";
  return confirmDialog({
    title: "Excluir fase do histórico?",
    message: `A fase «${lab}» (${setor}) será removida do histórico desta demanda.`,
    details: [
      { label: "Início", value: inicio },
      { label: "Fim", value: fim },
    ],
    hint: "A alteração só será gravada ao salvar a demanda.",
    confirmText: "Excluir fase",
    variant: "danger",
  });
}

/** "2026-08-11T09:44" → "11/08/26 09:44" (exibição das datas no modo leitura). */
function formatTimelineDataCurta(val) {
  const m = String(val || "").match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1].slice(2)}${m[4] ? ` ${m[4]}:${m[5]}` : ""}`;
}

/** Duração curta para o resumo: "13d 17h", "5h 20m", "12m". */
function formatDurCurta(ms) {
  const min = Math.floor((ms || 0) / 60000);
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  if (d) return h ? `${d}d ${h}h` : `${d}d`;
  if (h) return m ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

/** Atualiza textos de leitura da linha (datas, atualização) e o aviso de fim antes do início. */
function syncTimelineRowView(tr) {
  const inEl = tr.querySelector(".timeline-inicio");
  const fimEl = tr.querySelector(".timeline-fim");
  const obsEl = tr.querySelector(".timeline-obs");
  const ini = tr.querySelector(".tl-data--ini");
  const fim = tr.querySelector(".tl-data--fim");
  const obs = tr.querySelector(".tl-obs-txt");
  if (ini) ini.textContent = formatTimelineDataCurta(inEl?.value) || "—";
  if (fim) {
    const txt = formatTimelineDataCurta(fimEl?.value);
    fim.textContent = txt || "em andamento";
    fim.classList.toggle("is-aberta", !txt);
  }
  if (obs) {
    const t = (obsEl?.value || "").trim();
    obs.textContent = t || "Sem atualização";
    obs.classList.toggle("is-vazia", !t);
  }
  const a = Date.parse(datetimeLocalToIso(inEl?.value) || "");
  const b = Date.parse(datetimeLocalToIso(fimEl?.value || "") || "");
  const erro = Number.isFinite(a) && Number.isFinite(b) && b < a;
  tr.classList.toggle("is-erro", erro);
  const aviso = tr.querySelector(".tl-aviso");
  if (aviso) aviso.hidden = !erro;
}

/** Resumo acima da tabela: tempo total, fase atual, barra proporcional por fase e soma por setor. */
function renderTimelineResumo() {
  const host = document.getElementById("demTimelineResumo");
  const rows = [...document.querySelectorAll("#demTimelineTable tbody tr")];
  if (!host) return;
  if (!rows.length) {
    host.hidden = true;
    return;
  }
  host.hidden = false;
  const linha = editingLinhaEsteira;
  const cfg = normalizeLinhaEsteira(linha) === LINHA_ESTEIRA_B2B ? DASH_TEMPO_CFG_B2B : DASH_TEMPO_CFG_OP;
  const segs = rows.map((tr) => {
    const inicio = datetimeLocalToIso(tr.querySelector(".timeline-inicio")?.value) || "";
    const fim = datetimeLocalToIso(tr.querySelector(".timeline-fim")?.value || "") || "";
    const status = tr.dataset.status;
    const setor = setorForStatusDemanda(status, linha);
    return { tr, status, setor, fim, ms: timelineSegmentMs({ inicio, fim }) };
  });
  const total = segs.reduce((acc, x) => acc + x.ms, 0);
  const max = Math.max(1, ...segs.map((x) => x.ms));
  // Barrinha de duração em cada linha (comparação entre fases).
  segs.forEach((x) => {
    const bar = x.tr.querySelector(".tl-dur-bar span");
    if (bar) {
      bar.style.width = `${Math.max(2, (x.ms / max) * 100)}%`;
      bar.style.background = x.setor ? setorColorFor(x.setor, cfg) : "#94a3b8";
    }
  });
  const atual = segs[segs.length - 1];
  const atualAberta = atual && !atual.fim;
  const porSetor = new Map();
  segs.forEach((x) => {
    // Fases sem setor (ex.: Pausado) aparecem pelo próprio nome.
    const k = x.setor || labelStatus(x.status, linha);
    porSetor.set(k, (porSetor.get(k) || 0) + x.ms);
  });
  const fatias = segs
    .filter((x) => x.ms > 0)
    .map((x) => {
      const cor = x.setor ? setorColorFor(x.setor, cfg) : "#94a3b8";
      const pct = total ? (x.ms / total) * 100 : 0;
      return (
        `<span class="tl-resumo__fatia${x === atual && atualAberta ? " is-atual" : ""}" style="flex-grow:${x.ms};background:${cor}" ` +
        `title="${escapeHtml(`${labelStatus(x.status, linha)} · ${formatDur(x.ms)} · ${pct.toFixed(1)}%`)}"></span>`
      );
    })
    .join("");
  const chips = [...porSetor.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([setor, ms]) => {
      const ehSetor = segs.some((x) => x.setor === setor);
      const cor = ehSetor ? setorColorFor(setor, cfg) : "#94a3b8";
      return `<span class="tl-resumo__chip"><i style="background:${cor}"></i>${escapeHtml(setor)} <b>${formatDurCurta(ms)}</b></span>`;
    })
    .join("");
  host.innerHTML =
    `<div class="tl-resumo__head">` +
    `<div><span class="tl-resumo__label">Tempo total</span><strong>${formatDurCurta(total)}</strong></div>` +
    (atual
      ? `<div><span class="tl-resumo__label">${atualAberta ? "Fase atual" : "Última fase"}</span><strong>${escapeHtml(
          labelStatus(atual.status, linha),
        )}</strong> <span class="muted small">${atualAberta ? `há ${formatDurCurta(atual.ms)}` : "encerrada"}</span></div>`
      : "") +
    `<div><span class="tl-resumo__label">Fases</span><strong>${segs.length}</strong></div>` +
    `</div>` +
    `<div class="tl-resumo__barra" role="img" aria-label="Distribuição do tempo por fase">${fatias}</div>` +
    `<div class="tl-resumo__chips">${chips}</div>`;
}

function refreshTimelineRowDur(tr) {
  const inEl = tr.querySelector(".timeline-inicio");
  const fimEl = tr.querySelector(".timeline-fim");
  const durEl = tr.querySelector(".timeline-dur");
  if (!inEl || !durEl) return;
  const inicio = datetimeLocalToIso(inEl.value) || inEl.value;
  const fim = datetimeLocalToIso(fimEl?.value || "") || "";
  durEl.textContent = formatDur(
    timelineSegmentMs({ inicio, fim: fim || "" }),
  );
  syncTimelineRowView(tr);
  renderTimelineResumo();
}

function renderTimeline(d) {
  const tb = document.querySelector("#demTimelineTable tbody");
  if (!tb) return;
  tb.innerHTML = "";
  if (!d) return;
  const dm = migrateDemanda(d);
  const linha = dm.linhaEsteira;
  const hist = dm.historicoStatus || [];
  const statusAtual = dm.status;
  hist.forEach((seg, idx) => {
    const tr = document.createElement("tr");
    tr.dataset.histIdx = String(idx);
    tr.dataset.status = seg.status;
    const isLast = idx === hist.length - 1;
    const faseAtual = isLast && seg.status === statusAtual;
    if (faseAtual && !seg.fim) tr.classList.add("is-atual");
    tr.innerHTML = `
      <td class="timeline-table__fase"><span class="tl-fase"><strong>${escapeHtml(labelStatus(seg.status, linha))}</strong>${
        faseAtual && !seg.fim ? '<span class="tl-atual">Atual</span>' : ""
      }</span><span class="tl-aviso" hidden>Fim antes do início</span></td>
      <td class="timeline-table__setor">${timelineSetorHtml(seg.status, linha)}</td>
      <td class="timeline-table__date"><span class="tl-data tl-data--ini"></span></td>
      <td class="timeline-table__date"><span class="tl-data tl-data--fim"></span></td>
      <td class="timeline-table__dur"><span class="timeline-dur">${formatDur(timelineSegmentMs(seg))}</span><span class="tl-dur-bar"><span></span></span></td>
      <td class="timeline-table__obs"><span class="tl-obs-txt"></span></td>
      <td class="timeline-table__actions"></td>
    `;
    const inInput = document.createElement("input");
    inInput.type = "datetime-local";
    inInput.className = "timeline-inicio";
    inInput.value = isoToDatetimeLocal(seg.inicio);
    inInput.title = "Data e hora de início nesta fase";
    inInput.required = true;

    const fimInput = document.createElement("input");
    fimInput.type = "datetime-local";
    fimInput.className = "timeline-fim";
    fimInput.value = isoToDatetimeLocal(seg.fim);
    fimInput.title = faseAtual
      ? "Deixe em branco enquanto a fase estiver em andamento"
      : "Data e hora de fim nesta fase";
    if (!faseAtual && seg.fim) fimInput.required = true;

    const onDateChange = () => {
      refreshTimelineRowDur(tr);
    };
    inInput.addEventListener("input", onDateChange);
    inInput.addEventListener("change", onDateChange);
    fimInput.addEventListener("input", onDateChange);
    fimInput.addEventListener("change", onDateChange);

    const dateCells = tr.querySelectorAll(".timeline-table__date");
    dateCells[0]?.appendChild(inInput);
    dateCells[1]?.appendChild(fimInput);

    const ta = document.createElement("textarea");
    ta.className = "timeline-obs";
    ta.rows = 2;
    ta.maxLength = 2000;
    ta.placeholder = "Ex.: vistoria agendada, aguardando retorno do regional…";
    ta.value = seg.observacao || "";
    tr.querySelector(".timeline-table__obs").appendChild(ta);
    ta.addEventListener("input", () => syncTimelineRowView(tr));

    const actionsCell = tr.querySelector(".timeline-table__actions");

    // Leitura por padrão; clicar na linha (ou no ✎) abre a edição das datas e da atualização.
    const alternarEdicao = (abrir) => {
      if (isReadOnlyUser()) return;
      const on = abrir ?? !tr.classList.contains("is-editing");
      tr.classList.toggle("is-editing", on);
      btnEdit.textContent = on ? "✓" : "✎";
      btnEdit.title = on ? "Concluir edição" : "Editar datas e atualização";
      btnEdit.setAttribute("aria-label", btnEdit.title);
      if (on) inInput.focus({ preventScroll: true });
    };
    const btnEdit = document.createElement("button");
    btnEdit.type = "button";
    btnEdit.className = "timeline-edit";
    btnEdit.textContent = "✎";
    btnEdit.title = "Editar datas e atualização";
    btnEdit.setAttribute("aria-label", btnEdit.title);
    btnEdit.addEventListener("click", (e) => {
      e.stopPropagation();
      alternarEdicao();
    });
    if (!isReadOnlyUser()) actionsCell?.appendChild(btnEdit);
    tr.addEventListener("click", (e) => {
      const alvo = e.target instanceof Element ? e.target : null;
      if (!alvo || alvo.closest("input, textarea, button, select")) return;
      if (!tr.classList.contains("is-editing")) alternarEdicao(true);
    });

    const btnUp = document.createElement("button");
    btnUp.type = "button";
    btnUp.className = "timeline-move-up";
    btnUp.setAttribute("aria-label", "Mover fase para cima");
    btnUp.textContent = "↑";
    btnUp.addEventListener("click", () => {
      swapTimelineRowUp(tr);
      toast("Ordem ajustada — salve a demanda para confirmar");
    });
    actionsCell?.appendChild(btnUp);

    const btnDown = document.createElement("button");
    btnDown.type = "button";
    btnDown.className = "timeline-move-down";
    btnDown.setAttribute("aria-label", "Mover fase para baixo");
    btnDown.textContent = "↓";
    btnDown.addEventListener("click", () => {
      swapTimelineRowDown(tr);
      toast("Ordem ajustada — salve a demanda para confirmar");
    });
    actionsCell?.appendChild(btnDown);

    const btnDel = document.createElement("button");
    btnDel.type = "button";
    btnDel.className = "timeline-remove";
    btnDel.setAttribute("aria-label", "Excluir fase");
    btnDel.textContent = "×";
    btnDel.addEventListener("click", async () => {
      const rowCount = tb.querySelectorAll("tr").length;
      if (rowCount <= 1) {
        toast("Mantenha pelo menos uma fase no histórico");
        return;
      }
      if (!(await confirmExcluirFaseTimeline(seg))) return;
      tr.remove();
      syncDemStatusFromTimeline();
      refreshTimelineDeleteButtons();
      refreshTimelineMoveButtons();
      toast("Fase removida — salve a demanda para confirmar");
    });
    actionsCell?.appendChild(btnDel);
    tb.appendChild(tr);
    syncTimelineRowView(tr);
  });
  refreshTimelineDeleteButtons();
  refreshTimelineMoveButtons();
  renderTimelineResumo();
}

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

function applyPdfCustoToForm(parsed) {
  if (!parsed) return;
  const v = parsed.values || {};
  const hasData = parsed.hasLevantamento || parsed.hasPortas || parsed.hasLancamento;
  if (!hasData) {
    toast("Nenhum dado reconhecido no PDF — veja o texto extraído abaixo");
    return;
  }

  if (parsed.hasLevantamento || Object.keys(v).some((k) => v[k] !== "")) {
    document.getElementById("demTemLevantamento").value = "sim";
    toggleCustoFields();
    setCustoInputVal("custoValorProjeto", v.valorProjeto);
    recalcCustoValores();
    if (v.execucao) {
      const selExec = document.getElementById("custoExecucao");
      if (selExec) selExec.value = normalizeExecucaoCusto(v.execucao);
    }
    setCustoInputVal("custoExecucaoRegional", v.custoRegional);
    setCustoInputVal("custoExecucaoTerceirizada", v.custoTerceirizada);
    toggleExecucaoCustoFields();
  }

  if (parsed.hasPortas) {
    document.getElementById("demTemPortas").value = "sim";
    togglePortasFields();
    setCustoInputVal("custoQtdCasas", v.qtdCasas);
    setCustoInputVal("custoQtdPortasAtual", v.qtdPortasAtual);
    setCustoInputVal("custoQtdNovasPortas", v.qtdNovasPortas);
    recalcPenetracaoPortas();
    recalcValorPorPortaNova();
  } else {
    clearPortasCustoForm();
  }

  if (parsed.hasLancamento) {
    document.getElementById("demTemLancamento").value = "sim";
    if (parsed.cabos?.length) {
      editingLancamentoCabos = parsed.cabos.map((c) => ({
        id: uid(),
        tipo: c.tipo,
        metragem: c.metragem,
      }));
    } else if (!editingLancamentoCabos.length) {
      editingLancamentoCabos = [{ id: uid(), tipo: TIPOS_CABO[0], metragem: "" }];
    }
    toggleLancamentoFields();
    renderLancamentoCabos();
    if (v.totalMetragem !== "") {
      setCustoInputVal("custoTotalMetragem", v.totalMetragem);
    } else {
      recalcTotalMetragem();
    }
  }

  pdfCustoAppliedInSession = true;
  toast("Dados do PDF aplicados — confira os campos e salve a demanda");
}

const PDF_CAMPO_LABEL = {
  valorProjeto: "Valor do projeto",
  valor5: "Valor 5%",
  valorFinal: "Valor final",
  qtdCasas: "Qtd. casas",
  qtdPortasAtual: "Portas existentes",
  qtdNovasPortas: "Novas portas",
  penetracaoAtual: "Penetração atual",
  novaPenetracao: "Nova penetração",
  execucao: "Execução",
  custoRegional: "MO Regional",
  custoTerceirizada: "MO Classe L + F",
  totalMetragem: "Metragem total",
};

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
  const fields = parsed
    ? Object.entries(parsed.values || {})
        .filter(([, val]) => val !== "")
        .map(([k, val]) => {
          const label = PDF_CAMPO_LABEL[k] || k;
          return `<li><strong>${escapeHtml(label)}:</strong> ${escapeHtml(pdfPreviewValor(k, val))}</li>`;
        })
        .join("")
    : "";
  const cabos = parsed?.cabos?.length
    ? `<li><strong>Cabos:</strong> ${parsed.cabos
        .map((c) => {
          const m = formatBr().formatIntegerBr ? formatBr().formatIntegerBr(c.metragem) : c.metragem;
          return escapeHtml(`${c.tipo} — ${m} m`);
        })
        .join(", ")}</li>`
    : "";
  const warns = (parsed?.warnings || [])
    .map((w) => `<p class="pdf-custo-preview__warn">${escapeHtml(w)}</p>`)
    .join("");
  const canApply = parsed && (parsed.hasLevantamento || parsed.hasPortas || parsed.hasLancamento);

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
    (fields || cabos
      ? `<p class="muted small">Campos detectados:</p><ul class="pdf-custo-preview__list">${fields}${cabos}</ul>`
      : `<p class="muted small">Nenhum campo detectado ainda.</p>`) +
    (canApply
      ? `<button type="button" class="btn btn--primary btn--sm" id="btnPdfApply">Aplicar ao formulário de custo</button>`
      : "");

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
    applyPdfCustoToForm(lastPdfParseResult);
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
    const n = Object.keys(lastPdfParseResult.values || {}).filter((k) => lastPdfParseResult.values[k] !== "").length;
    const nc = lastPdfParseResult.cabos?.length || 0;
    const capex = lastPdfParseResult?.values?.valorProjeto;
    const parts = [];
    if (capex !== "" && capex != null) parts.push(`CAPEX: ${pdfPreviewValor("valorProjeto", capex)}`);
    const pv = lastPdfParseResult?.values || {};
    if (pv.qtdNovasPortas !== "") parts.push(`Portas est.: ${pv.qtdNovasPortas}`);
    if (pv.qtdCasas !== "" || pv.qtdPortasAtual !== "") {
      parts.push(`HP: ${pv.qtdCasas || "—"} / HC: ${pv.qtdPortasAtual || "—"}`);
    }
    if (pv.execucao) {
      const mo = [];
      if (pv.custoRegional !== "") mo.push(`reg.: ${pdfPreviewValor("custoRegional", pv.custoRegional)}`);
      if (pv.custoTerceirizada !== "") mo.push(`terc.: ${pdfPreviewValor("custoTerceirizada", pv.custoTerceirizada)}`);
      parts.push(`Exec.: ${pv.execucao}${mo.length ? ` (${mo.join("; ")})` : ""}`);
    }
    if (nc) parts.push(`${nc} cabo(s) em LANÇAMENTO DE CABOS`);
    toast(
      parts.length
        ? `${parts.join(" · ")} — clique em Aplicar`
        : "Poucos dados no PDF — confira CAPEX (pág. 1) e LANÇAMENTO DE CABOS (4.1.1)",
    );
  } catch (e) {
    console.error(e);
    lastPdfParseResult = null;
    editingPdfLevantamento = null;
    renderPdfLevantamentoPreview();
    toast(e.message || "Não foi possível ler o PDF");
  }
}

document.getElementById("demPdfInput")?.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    toast("Selecione um arquivo PDF");
    return;
  }
  await handleDemPdfUpload(file);
});

document.getElementById("demTemLevantamento")?.addEventListener("change", toggleCustoFields);
document.getElementById("custoExecucao")?.addEventListener("change", () => {
  const ex = readCustoExecucaoFromForm();
  if (ex === CUSTO_EXECUCAO_NAO_APLICA) {
    const elReg = document.getElementById("custoExecucaoRegional");
    const elTer = document.getElementById("custoExecucaoTerceirizada");
    if (elReg) elReg.value = "";
    if (elTer) elTer.value = "";
  } else if (ex === "Regional") {
    const el = document.getElementById("custoExecucaoTerceirizada");
    if (el) el.value = "";
  } else if (ex === "Terceirizada") {
    const el = document.getElementById("custoExecucaoRegional");
    if (el) el.value = "";
  }
  toggleExecucaoCustoFields();
});
document.getElementById("demTemPortas")?.addEventListener("change", togglePortasFields);
document.getElementById("demTemLancamento")?.addEventListener("change", toggleLancamentoFields);
document.getElementById("btnAddCabo")?.addEventListener("click", () => {
  syncLancamentoCabosFromDom();
  editingLancamentoCabos.push({ id: uid(), tipo: TIPOS_CABO[0], metragem: "" });
  renderLancamentoCabos();
});

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

document.getElementById("btnNovaDemanda")?.addEventListener("click", () => {
  if (!requireWriteAccess()) return;
  openDemandaModal(null);
});

document.getElementById("btnEnviarClickup")?.addEventListener("click", async () => {
  const id = (document.getElementById("demId")?.value || "").trim();
  const btn = document.getElementById("btnEnviarClickup");
  if (!id) {
    toast("Salve a demanda antes de enviar ao ClickUp.");
    return;
  }
  const titulo = (document.getElementById("demTitulo")?.value || "").trim();
  const instrucoes = await promptClickupInstrucoes(titulo);
  if (!instrucoes) return;
  await enviarDemandaClickup(id, btn, instrucoes);
});
document.getElementById("btnCancelarClickup")?.addEventListener("click", async () => {
  const id = (document.getElementById("demId")?.value || "").trim();
  if (!id) return;
  await cancelarDemandaClickup(id);
});
document.getElementById("btnAddComentario")?.addEventListener("click", () => {
  if (!requireWriteAccess()) return;
  addComentarioFromForm();
});
document.getElementById("demComentarioNovo")?.addEventListener("input", syncComentarioCompose);
document.getElementById("demComentarioNovo")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    if (!requireWriteAccess()) return;
    addComentarioFromForm();
  }
});
document.getElementById("commentsPanelToggle")?.addEventListener("click", () => {
  const panel = document.querySelector(".comments-panel");
  const btn = document.getElementById("commentsPanelToggle");
  if (!panel || !btn) return;
  const collapsed = panel.classList.toggle("is-collapsed");
  btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
});
bindChecklistEditor();
document.getElementById("modalDemandaClose")?.addEventListener("click", () => fecharDemandaComConfirmacao());
document.getElementById("btnFecharDemanda")?.addEventListener("click", () => fecharDemandaComConfirmacao());
// Esc também passa pela confirmação; Ctrl+S salva.
modalDemanda?.addEventListener("cancel", (e) => {
  if (!demandaTemAlteracoes()) return;
  e.preventDefault();
  fecharDemandaComConfirmacao();
});
modalDemanda?.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
    e.preventDefault();
    const btn = document.getElementById("btnSalvarDemanda");
    if (btn && !btn.hidden && !btn.disabled) btn.click();
  }
});
document.getElementById("btnDemConflictReload")?.addEventListener("click", () => {
  const id = editingDemandaOpenId;
  if (!id) return;
  openDemandaModal(id);
});
document.getElementById("btnDemClickupCiente")?.addEventListener("click", () => {
  const id = editingDemandaOpenId;
  if (!id) return;
  marcarClickupRetornoCiente(id);
});
window.addEventListener("beforeunload", () => {
  if (editingDemandaOpenId) releaseDemandaEditing(editingDemandaOpenId);
});

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

document.getElementById("custoValorProjeto")?.addEventListener("input", recalcCustoValores);
document.getElementById("custoValorProjeto")?.addEventListener("blur", (e) => {
  formatInputBrOnBlur(e.target);
  recalcCustoValores();
});
bindCustoNumberFormatting();
document.getElementById("custoQtdNovasPortas")?.addEventListener("input", () => {
  recalcPenetracaoPortas();
  recalcValorPorPortaNova();
});
["custoQtdCasas", "custoQtdPortasAtual"].forEach((id) => {
  const el = document.getElementById(id);
  el?.addEventListener("input", recalcPenetracaoPortas);
  el?.addEventListener("blur", (e) => {
    formatInputBrOnBlur(e.target);
    recalcPenetracaoPortas();
  });
});
document.getElementById("custoQtdNovasPortas")?.addEventListener("blur", (e) => {
  formatInputBrOnBlur(e.target);
  recalcPenetracaoPortas();
  recalcValorPorPortaNova();
});

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

document.getElementById("btnSalvarDemanda")?.addEventListener("click", async () => {
  if (!requireWriteAccess()) return;
  const id = document.getElementById("demId").value || uid();
  let existing = state.demandas.find((x) => x.id === id);
  const prevStatus = existing?.status;
  const tipo = normalizeTipo(document.getElementById("demTipo").value);
  const linhaEsteira = inferLinhaEsteira({ tipo });
  const produtoB2b = tipo === "B2B" ? normalizeProdutoB2b(document.getElementById("demProdutoB2b")?.value) : "";
  const segmentoB2c = tipo === "B2C" ? normalizeSegmentoB2c(document.getElementById("demSegmentoB2c")?.value) : "";
  let newStatus = mapStatusParaLinha(document.getElementById("demStatus").value, linhaEsteira);
  const now = new Date().toISOString();
  const motivosItensSalvar = readMotivosAtrasoFromDom({ forSave: true });
  const payload = {
    id,
    titulo: document.getElementById("demTitulo").value.trim(),
    cidade: readCidadeFromForm(),
    cidadesExtra: readCidadesExtraFromForm(),
    dataChegada: document.getElementById("demDataChegada").value,
    dataFimPrevista: document.getElementById("demDataFimPrevista").value,
    dataFimAtualizada: document.getElementById("demDataFimAtualizada").value,
    dataTermino: document.getElementById("demDataTermino").value,
    statusAtual: document.getElementById("demStatusAtual").value.trim(),
    motivosAtrasoItens: motivosItensSalvar,
    motivosAtraso: formatMotivosAtrasoTexto(motivosItensSalvar),
    valorProjetoRealizado: document.getElementById("demValorProjetoRealizado")
      ? readValorProjetoRealizadoFromForm()
      : parseCustoMoney(existing?.valorProjetoRealizado),
    solicitante: readSolicitanteFromForm(),
    setorSolicitanteB2b: readSetorSolicitanteB2bFromForm(),
    responsavel: normalizeResponsavel(document.getElementById("demResponsavel").value),
    projetistasExtra: readProjetistasExtraFromForm(),
    tipo,
    produtoB2b,
    segmentoB2c,
    linhaEsteira,
    status: newStatus,
    descricao: document.getElementById("demDescricao").value,
    comentarios: normalizeComentarios(editingComentarios),
    custo: readCustoFromForm(),
    pdfLevantamento: editingPdfLevantamento,
    imagens: existing?.imagens?.length ? existing.imagens : editingImages,
    historicoStatus: existing?.historicoStatus || [],
    historicoEdicoes: Array.isArray(existing?.historicoEdicoes) ? [...existing.historicoEdicoes] : [],
    historicoAlertas: syncHistoricoAlertasOcultos(existing?.historicoAlertas, editingComentarios),
    alertaSnooze: existing?.alertaSnooze || null,
    clickup: existing?.clickup || null,
    clickupTaskId: existing?.clickupTaskId || existing?.clickup?.taskId || "",
    chamadoOcomon: (document.getElementById("demChamadoOcomon")?.value || "").trim(),
    osAniel: (document.getElementById("demOsAniel")?.value || "").trim(),
    checklist: normalizeChecklist(editingChecklist),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  if (!payload.titulo) {
    toast("Informe o nome do projeto");
    return;
  }
  if (tipo === "B2B" && !produtoB2b) {
    syncDemCamposPorTipo();
    toast("Selecione o produto B2B");
    document.getElementById("demProdutoB2b")?.focus();
    return;
  }
  if (tipo === "B2B" && !payload.solicitante) {
    syncDemCamposPorTipo();
    toast("Selecione o solicitante (Comercial)");
    document.getElementById("demSolicitanteB2b")?.focus();
    return;
  }
  if (tipo === "B2C" && !segmentoB2c) {
    syncDemCamposPorTipo();
    toast("Selecione o segmento B2C (MDU, TCR ou TCT)");
    document.getElementById("demSegmentoB2c")?.focus();
    return;
  }
  if (!document.getElementById("demRegional")?.value) {
    toast("Selecione a regional");
    return;
  }
  if (!payload.cidade) {
    toast("Selecione a cidade");
    return;
  }
  if (!payload.dataChegada) {
    toast("Informe a data de chegada");
    return;
  }
  if (!payload.descricao.trim()) {
    toast("Informe a descrição do projeto");
    return;
  }
  payload.descricao = payload.descricao.trim();
  if (!payload.statusAtual) {
    toast("Informe o status atual do projeto");
    document.getElementById("demStatusAtual")?.focus();
    return;
  }
  let ordem = normalizeOrdemEsteira(existing?.ordemEsteira);
  if (ordem == null || prevStatus !== newStatus) {
    ordem = ordemAoEntrarColuna(newStatus, payload.responsavel);
  }
  payload.ordemEsteira = ordem;
  if (isAtrasoAtivo(payload) && !motivosAtrasoItensPreenchidos(payload.motivosAtrasoItens)) {
    syncMotivosAtrasoField();
    toast("Informe ao menos um motivo do atraso");
    document.getElementById("motivosAtrasoLista")?.querySelector(".motivo-atraso-texto")?.focus();
    return;
  }
  if (isStatusConcluidoNoFormulario(payload.status, linhaEsteira) && !payload.dataTermino) {
    payload.dataTermino = todayISODate();
  }
  let historico = readTimelineHistoricoFromDom();
  if (!historico.length) {
    historico = [{ status: newStatus, inicio: now, fim: "", observacao: "" }];
  }
  if (!existing) {
    payload.historicoStatus = historico;
    const errHist = validateHistoricoStatus(payload.historicoStatus, newStatus, linhaEsteira);
    if (errHist) {
      toast(errHist);
      return;
    }
    registrarCriacaoNoHistoricoEdicao(payload);
    state.demandas.push(payload);
  } else {
    if (
      editingDemandaBaselineUpdatedAt &&
      existing.updatedAt &&
      existing.updatedAt !== editingDemandaBaselineUpdatedAt &&
      ownClickupSyncId !== existing.id &&
      !isInOwnWriteGrace(existing.id) &&
      !ownUpdatedAtWrites.has(`${existing.id}\0${existing.updatedAt}`)
    ) {
      const ok = await confirmDialog({
        title: "Conflito de alteração",
        message:
          "Outra pessoa salvou esta demanda enquanto você editava. Se continuar, suas alterações podem substituir as dela.",
        confirmText: "Salvar mesmo assim",
        cancelText: "Cancelar",
        variant: "warn",
      });
      if (!ok) return;
    }
    if (prevStatus !== newStatus) {
      historico = statusHistoryPush({ historicoStatus: historico }, newStatus);
    }
    const errHist = validateHistoricoStatus(historico, newStatus, linhaEsteira);
    if (errHist) {
      toast(errHist);
      return;
    }
    payload.historicoStatus = historico;
    const prevSnapshot = migrateDemanda(existing);
    registrarEdicaoNoHistoricoEdicao(prevSnapshot, payload);
    Object.assign(existing, payload);
  }
  const saved = existing || payload;
  const savedId = saved.id;
  stopPresenceHeartbeat();
  delete saved.editingBy;
  delete saved.editingAt;
  if (savedId) releaseDemandaEditing(savedId);
  invalidateAlertaSnoozeIfStale(saved);
  saveState({ demanda: migrateDemanda(saved) });
  closeDemandaModal();
  renderBoard();
  toast("Demanda salva");
});

document.getElementById("btnExcluirDemanda")?.addEventListener("click", async () => {
  if (!requireWriteAccess("deleteDemanda")) return;
  const id = document.getElementById("demId").value?.trim();
  if (!id) {
    closeDemandaModal();
    toast("Rascunho descartado");
    return;
  }
  const titulo = document.getElementById("demTitulo")?.value?.trim() || "esta demanda";
  const ok = await confirmDialog({
    title: "Excluir demanda?",
    message: `A demanda «${titulo}» será removida permanentemente. Esta ação não pode ser desfeita.`,
    confirmText: "Excluir demanda",
    variant: "danger",
  });
  if (!ok) return;
  stopPresenceHeartbeat();
  releaseDemandaEditing(id);
  markDemandaPendingDelete(id);
  saveState({ deleteDemandaId: id });
  closeDemandaModal();
  renderBoard();
  toast("Demanda excluída");
});

/* ---------- Histórico de edição ---------- */
const modalHistoricoEdicao = document.getElementById("modalHistoricoEdicao");
const demandaFootMenu = document.getElementById("demandaFootMenu");
const demandaFootMenuList = document.getElementById("demandaFootMenuList");
const btnDemandaMaisOpcoes = document.getElementById("btnDemandaMaisOpcoes");

function setDemandaFootMenuOpen(open) {
  if (!demandaFootMenu || !demandaFootMenuList || !btnDemandaMaisOpcoes) return;
  demandaFootMenu.classList.toggle("is-open", open);
  demandaFootMenuList.hidden = !open;
  btnDemandaMaisOpcoes.setAttribute("aria-expanded", open ? "true" : "false");
}

btnDemandaMaisOpcoes?.addEventListener("click", (e) => {
  e.stopPropagation();
  const open = demandaFootMenuList?.hidden !== false;
  setDemandaFootMenuOpen(open);
});

document.addEventListener("click", (e) => {
  if (!demandaFootMenu) return;
  if (demandaFootMenuList?.hidden) return;
  if (!demandaFootMenu.contains(e.target)) setDemandaFootMenuOpen(false);
});

document.getElementById("btnAbrirHistoricoEdicao")?.addEventListener("click", () => {
  setDemandaFootMenuOpen(false);
  abrirHistoricoEdicaoModal();
});

document.getElementById("modalHistoricoEdicaoClose")?.addEventListener("click", () => modalHistoricoEdicao?.close());
document.getElementById("btnFecharHistoricoEdicao")?.addEventListener("click", () => modalHistoricoEdicao?.close());

function abrirHistoricoEdicaoModal() {
  const id = document.getElementById("demId")?.value?.trim();
  const dem = id ? state.demandas.find((x) => x.id === id) : null;
  const tituloAtual = document.getElementById("demTitulo")?.value?.trim();
  const titEl = document.getElementById("modalHistoricoEdicaoTitulo");
  if (titEl) {
    titEl.textContent = tituloAtual
      ? `Histórico de edição — ${tituloAtual}`
      : "Histórico de edição";
  }
  const target = document.getElementById("histEdicaoList");
  if (!target) return;
  if (!dem) {
    target.innerHTML =
      '<p class="muted small">Esta demanda ainda não foi salva. O histórico começa a ser registrado a partir do primeiro salvamento.</p>';
    modalHistoricoEdicao?.showModal();
    return;
  }
  const lista = normalizeHistoricoEdicoes(dem.historicoEdicoes || []);
  if (!lista.length) {
    target.innerHTML =
      '<p class="muted small">Nenhuma alteração registrada. As próximas edições e a criação serão exibidas aqui.</p>';
  } else {
    target.innerHTML = renderHistoricoEdicaoEntries(lista);
  }
  modalHistoricoEdicao?.showModal();
}

function renderHistoricoEdicaoEntries(lista) {
  const ordenado = [...lista].sort((a, b) => Date.parse(b.at || 0) - Date.parse(a.at || 0));
  return ordenado
    .map((e) => {
      const quando = formatComentarioData(e.at) || "—";
      const autor = escapeHtml(e.by?.autor || "Equipe");
      const email = e.by?.email ? `<span class="hist-edicao__email">${escapeHtml(e.by.email)}</span>` : "";
      const tipoCls = e.tipo === "criacao" ? "hist-edicao__pill hist-edicao__pill--criar" : "hist-edicao__pill";
      const tipoLab = e.tipo === "criacao" ? "Criação" : "Edição";
      let corpo = "";
      if (e.tipo === "criacao") {
        corpo = `<p class="hist-edicao__nota">${escapeHtml(e.nota || "Demanda criada.")}</p>`;
      } else if (e.alteracoes.length) {
        corpo =
          '<ul class="hist-edicao__alteracoes">' +
          e.alteracoes
            .map(
              (a) =>
                `<li><strong>${escapeHtml(a.label)}</strong>: <span class="hist-edicao__de">${escapeHtml(String(a.de ?? "—"))}</span> <span aria-hidden="true">→</span> <span class="hist-edicao__para">${escapeHtml(String(a.para ?? "—"))}</span></li>`,
            )
            .join("") +
          "</ul>";
      } else {
        corpo = '<p class="muted small">Sem campos rastreados alterados.</p>';
      }
      return `
        <article class="hist-edicao-item">
          <header class="hist-edicao__head">
            <span class="${tipoCls}">${tipoLab}</span>
            <span class="hist-edicao__quando" title="${escapeHtml(e.at)}">${escapeHtml(quando)}</span>
          </header>
          <p class="hist-edicao__autor"><strong>${autor}</strong> ${email}</p>
          ${corpo}
        </article>
      `;
    })
    .join("");
}

/* ---------- Diárias ---------- */
const modalDiaria = document.getElementById("modalDiaria");

document.getElementById("btnNovaDiaria")?.addEventListener("click", () => {
  if (!requireWriteAccess()) return;
  openDiariaModal(null);
});
document.getElementById("modalDiariaClose")?.addEventListener("click", () => modalDiaria?.close());
document.getElementById("btnFecharDiaria")?.addEventListener("click", () => modalDiaria?.close());

function openDiariaModal(id) {
  if (!modalDiaria) return;
  const d = id ? state.diarias.find((x) => x.id === id) : null;
  const n = d ? normalizeDiaria(d) : null;
  const idEl = document.getElementById("diariaId");
  const titEl = document.getElementById("diariaTitulo");
  const descEl = document.getElementById("diariaDesc");
  const respEl = document.getElementById("diariaResp");
  if (!idEl || !titEl || !descEl || !respEl) return;
  idEl.value = n?.id || "";
  titEl.value = n?.titulo || "";
  descEl.value = n?.descricao || "";
  respEl.value = n?.responsavel || "Vinicius";
  modalDiaria.showModal();
}

function renderDiarias() {
  const el = document.getElementById("listaDiarias");
  if (!el) return;
  const filtro = document.getElementById("filterDiariaResp")?.value || "";
  let list = state.diarias.map(normalizeDiaria);
  if (filtro) list = list.filter((t) => t.responsavel === filtro);
  list.sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR"));
  el.innerHTML = "";
  if (!list.length) {
    el.innerHTML = `<p class="diarias-empty muted">Nenhuma demanda cadastrada${filtro ? ` para ${filtro}` : ""}.</p>`;
    return;
  }
  for (const t of list) {
    const respClass = diariaRespClass(t.responsavel);
    const card = document.createElement("article");
    card.className = `diaria diaria--${respClass}`;
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.innerHTML = `
      <header class="diaria__head">
        <h3 class="diaria__tit"></h3>
        <span class="diaria__resp"></span>
      </header>
      <p class="diaria__desc"></p>
    `;
    card.querySelector(".diaria__tit").textContent = t.titulo;
    card.querySelector(".diaria__resp").textContent = t.responsavel;
    card.querySelector(".diaria__desc").textContent = t.descricao || "—";
    const open = () => openDiariaModal(t.id);
    card.addEventListener("click", open);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });
    el.appendChild(card);
  }
}

const filterDiariaRespEl = document.getElementById("filterDiariaResp");
if (filterDiariaRespEl) filterDiariaRespEl.addEventListener("change", renderDiarias);

document.getElementById("btnSalvarDiaria")?.addEventListener("click", () => {
  if (!requireWriteAccess()) return;
  const id = document.getElementById("diariaId").value || uid();
  const row = normalizeDiaria({
    id,
    titulo: document.getElementById("diariaTitulo").value,
    descricao: document.getElementById("diariaDesc").value,
    responsavel: document.getElementById("diariaResp").value,
    updatedAt: new Date().toISOString(),
  });
  if (!row.titulo) return toast("Informe o nome da demanda");
  if (!row.descricao) return toast("Informe a descrição");
  const ix = state.diarias.findIndex((x) => x.id === id);
  if (ix === -1) state.diarias.push(row);
  else state.diarias[ix] = row;
  saveState({ meta: true });
  modalDiaria?.close();
  renderDiarias();
  toast("Demanda salva");
});

document.getElementById("btnExcluirDiaria")?.addEventListener("click", async () => {
  if (!requireWriteAccess()) return;
  const id = document.getElementById("diariaId")?.value;
  if (!id) return;
  const titulo = document.getElementById("diariaTitulo")?.value?.trim() || "esta demanda";
  const ok = await confirmDialog({
    title: "Excluir demanda?",
    message: `A demanda «${titulo}» será removida permanentemente. Esta ação não pode ser desfeita.`,
    confirmText: "Excluir demanda",
    variant: "danger",
  });
  if (!ok) return;
  if (!Array.isArray(state.deletedDiariaIds)) state.deletedDiariaIds = [];
  if (!state.deletedDiariaIds.includes(id)) state.deletedDiariaIds.push(id);
  state.diarias = state.diarias.filter((x) => x.id !== id);
  saveState({ meta: true });
  modalDiaria?.close();
  renderDiarias();
  toast("Demanda excluída");
});

/** Vínculo no card do projetista: "e:id" = esteira, "d:id" = diária; só id sem prefixo (legado) = esteira */
function normalizeProjetistaVinculoRef(ref) {
  if (!ref) return "";
  if (ref.startsWith("e:") || ref.startsWith("d:")) return ref;
  return `e:${ref}`;
}

function parseProjetistaVinculo(ref) {
  const n = normalizeProjetistaVinculoRef(ref);
  if (!n) return null;
  if (n.startsWith("d:")) return { tipo: "diaria", id: n.slice(2) };
  return { tipo: "esteira", id: n.slice(2) };
}

function labelProjetistaVinculo(ref) {
  const p = parseProjetistaVinculo(ref);
  if (!p) return "";
  if (p.tipo === "diaria") {
    const d = (state.diarias || []).map(normalizeDiaria).find((x) => x.id === p.id);
    return d ? `Demanda diária: «${d.titulo}»` : "Demanda diária não encontrada (pode ter sido excluída).";
  }
  const d = state.demandas.find((x) => x.id === p.id);
  return d ? `Esteira: «${d.titulo}»` : "Projeto não encontrado (pode ter sido excluído).";
}

/* ---------- Projetistas ---------- */
function renderProjetistas() {
  const grid = document.getElementById("projetistasGrid");
  if (!grid) return;
  grid.innerHTML = "";

  const fmtEsteiraOpt = (d) => {
    const resp = normalizeResponsavel(d.responsavel, inferLinhaEsteira(d));
    const r = resp ? resp : "Sem atrib.";
    return `<option value="e:${d.id}">${escapeHtml(d.titulo)} (${escapeHtml(r)})</option>`;
  };
  const esteiraAtiva = (d) => {
    const dm = migrateDemanda(d);
    if (dm.linhaEsteira === LINHA_ESTEIRA_B2B) return !STATUS_B2B_CONCLUIDOS.has(dm.status);
    return !["conclusao", "reprovado"].includes(dm.status);
  };
  const esteiraOptsOp = state.demandas
    .filter((d) => inferLinhaEsteira(d) === LINHA_ESTEIRA_OPERACIONAL && esteiraAtiva(d))
    .sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR"))
    .map(fmtEsteiraOpt)
    .join("");
  const esteiraOptsB2b = state.demandas
    .filter((d) => inferLinhaEsteira(d) === LINHA_ESTEIRA_B2B && esteiraAtiva(d))
    .sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR"))
    .map(fmtEsteiraOpt)
    .join("");

  const sections = [
    { titulo: "Esteira Projetos", nomes: PROJETISTAS, esteiraOpts: esteiraOptsOp, labelEsteira: "Esteira Projetos" },
    { titulo: "Esteira B2B", nomes: PROJETISTAS_B2B, esteiraOpts: esteiraOptsB2b, labelEsteira: "Esteira B2B" },
  ];

  for (const { titulo, nomes, esteiraOpts, labelEsteira } of sections) {
    const heading = document.createElement("h3");
    heading.className = "projetistas-section-title";
    heading.textContent = titulo;
    grid.appendChild(heading);

    for (const nome of nomes) {
    const p = state.projetistas[nome] || { texto: "", demandaId: "", desde: "" };
    const card = document.createElement("div");
    card.className = "projetista";

    const diariasOpts = (state.diarias || [])
      .map(normalizeDiaria)
      .filter((d) => d.responsavel === nome)
      .sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR"))
      .map((d) => `<option value="d:${d.id}">${escapeHtml(d.titulo)}</option>`)
      .join("");

    const demandasOpts =
      `<option value="">(sem vínculo)</option>` +
      `<optgroup label="${escapeHtml(labelEsteira)}">${esteiraOpts || '<option disabled value="">Nenhuma ativa</option>'}</optgroup>` +
      `<optgroup label="Demandas diárias">${diariasOpts || '<option disabled value="">Nenhuma para este responsável</option>'}</optgroup>`;

    card.innerHTML = `
      <h3>${nome}</h3>
      <label class="field"><span>O que está fazendo agora</span><textarea class="pj-text"></textarea></label>
      <label class="field"><span>Vincular a</span><select class="pj-dem">${demandasOpts}</select></label>
      <p class="muted small pj-vinculo-legenda" aria-live="polite"></p>
      <div class="projetista__row">
        <button type="button" class="btn btn--primary pj-save">Salvar</button>
        <span class="projetista__since"></span>
      </div>
    `;
    card.querySelector(".pj-text").value = p.texto || "";
    const selDem = card.querySelector(".pj-dem");
    const refNorm = normalizeProjetistaVinculoRef(p.demandaId);
    selDem.value = refNorm || "";
    if (refNorm && !Array.from(selDem.options).some((o) => o.value === refNorm && !o.disabled)) {
      const tipo = parseProjetistaVinculo(refNorm)?.tipo;
      const leg = tipo === "diaria" ? "Demanda diária" : "Esteira";
      const o = document.createElement("option");
      o.value = refNorm;
      o.textContent = `${leg}: (mantido · não listado atualmente)`;
      const primeiro = selDem.querySelector("option[value=\"\"]");
      if (primeiro) primeiro.insertAdjacentElement("afterend", o);
      else selDem.insertBefore(o, selDem.firstChild);
      selDem.value = refNorm;
    }

    const legenda = card.querySelector(".pj-vinculo-legenda");
    const atualizaLegenda = () => {
      legenda.textContent = selDem.value ? labelProjetistaVinculo(selDem.value) : "";
    };
    atualizaLegenda();
    selDem.addEventListener("change", atualizaLegenda);
    const since = card.querySelector(".projetista__since");
    since.textContent = p.desde ? `Desde: ${p.desde.slice(0, 16).replace("T", " ")}` : "";
    card.querySelector(".pj-save").addEventListener("click", () => {
      if (!requireWriteAccess()) return;
      const texto = card.querySelector(".pj-text").value;
      const selVal = card.querySelector(".pj-dem").value;
      const demandaId = selVal === "" ? "" : normalizeProjetistaVinculoRef(selVal);
      const prev = state.projetistas[nome] || {};
      const prevNorm = normalizeProjetistaVinculoRef(prev.demandaId || "");
      const mudou = texto !== prev.texto || demandaId !== prevNorm;
      const agora = new Date().toISOString();
      state.projetistas[nome] = {
        texto,
        demandaId,
        desde: mudou ? agora : prev.desde || "",
        updatedAt: agora,
      };
      saveState({ meta: true });
      renderProjetistas();
      toast("Atividade atualizada");
    });
    grid.appendChild(card);
    }
  }
}

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

/** Status da esteira operacional até Documentação (inclusive) — sem Conclusão. */
const STATUS_ATE_DOCUMENTACAO = STATUS_ORDER.map(([k]) => k).filter((k) => k !== "conclusao");
const STATUS_ATE_DOCUMENTACAO_SET = new Set(STATUS_ATE_DOCUMENTACAO);

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
      backgroundColor: TIPO_CHART_COLORS[tipo] || "#94a3b8",
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
      backgroundColor: TIPO_CHART_COLORS[tipo] || "#94a3b8",
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
      backgroundColor: SEGMENTO_B2C_CHART_COLORS[seg] || "#64748b",
      borderWidth: 0,
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
      backgroundColor: SEGMENTO_B2C_CHART_COLORS[seg] || "#64748b",
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
    segmentos,
    (k) => k,
    matrix,
    "Nenhum projeto B2C neste agrupamento.",
  );
}

const B2C_GEO_CHART_IDS = [
  "chartB2cGastoCidade",
  "chartB2cGastoRegional",
  "chartB2cPortasCidade",
  "chartB2cPortasRegional",
];

const B2C_SEGMENTO_CHART_IDS = [
  "chartB2cSegProjetos",
  "chartB2cSegGastos",
  "chartB2cSegPortas",
  "chartB2cSegMetragem",
];

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
  [
    "tableB2cGastoCidade",
    "tableB2cGastoRegional",
    "tableB2cPortasCidade",
    "tableB2cPortasRegional",
  ].forEach((id) => {
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

function renderDashB2cGeoDetalhamento(demandas, rowsCidade, rowsRegional) {
  const nReg = Math.max(rowsRegional.length, 1);
  renderDashSegmentoB2cInvestPorGrupo(
    "chartB2cGastoRegional",
    "tableB2cGastoRegional",
    "Regional",
    demandas,
    rowsRegional,
    demandaRegionaisLabels,
    nReg,
  );
  renderDashSegmentoB2cPortasPorGrupo(
    "chartB2cPortasRegional",
    "tableB2cPortasRegional",
    "Regional",
    demandas,
    rowsRegional,
    demandaRegionaisLabels,
    nReg,
  );
  renderDashSegmentoB2cInvestPorGrupo(
    "chartB2cGastoCidade",
    "tableB2cGastoCidade",
    "Cidade",
    demandas,
    rowsCidade,
    demandaCidadesLabels,
    12,
  );
  renderDashSegmentoB2cPortasPorGrupo(
    "chartB2cPortasCidade",
    "tableB2cPortasCidade",
    "Cidade",
    demandas,
    rowsCidade,
    demandaCidadesLabels,
    12,
  );
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

function renderDashB2cSegmentoCharts(list) {
  const rows = buildB2cMetricasPorSegmento(list).filter((r) => SEGMENTOS_B2C.includes(r.segmento));
  const labels = rows.map((r) => r.segmento);
  const colors = rows.map((r) => SEGMENTO_B2C_CHART_COLORS[r.segmento] || "#94a3b8");
  if (!labels.length) {
    destroyDashB2cSegmentoCharts();
    return;
  }
  const onBarClick = (seg) => openDashGeoProjetosLista("segmento", seg);
  const interact = { showPct: true, onBarClick, horizontal: true };
  makeDashChartMetricBar("chartB2cSegProjetos", labels, rows.map((r) => r.projetos), {
    colors,
    datasetLabel: "Projetos",
    formatValue: (v) => formatQtd(v),
    stepSize: 1,
    ...interact,
  });
  makeDashChartMoneyBar(
    "chartB2cSegGastos",
    labels,
    rows.map((r) => r.investimento),
    colors,
    { datasetLabel: "Gastos (R$)", ...interact },
  );
  makeDashChartMetricBar("chartB2cSegPortas", labels, rows.map((r) => r.portas), {
    colors,
    datasetLabel: "Portas",
    formatValue: (v) => formatQtd(v),
    ...interact,
  });
  makeDashChartMetricBar("chartB2cSegMetragem", labels, rows.map((r) => r.metragem), {
    colors,
    datasetLabel: "Metragem",
    formatValue: (v) => formatMetros(v),
    ...interact,
  });
}

function renderKpiB2cSegmentos(list) {
  const el = document.getElementById("kpiB2cSegmentos");
  if (!el) return;
  const { rows, totais } = withB2cSegmentoPcts(buildB2cMetricasPorSegmento(list));
  const core = rows.filter((r) => SEGMENTOS_B2C.includes(r.segmento));
  let html = "";
  for (const r of core) {
    const color = SEGMENTO_B2C_CHART_COLORS[r.segmento] || "#94a3b8";
    html +=
      `<div class="kpi dash-tipo-card" style="border-left-color:${color}">` +
      `<div class="kpi__label dash-tipo-card__nome"><span>${escapeHtml(r.segmento)}</span>` +
      `<span class="dash-tipo-card__meta">${formatPctShare(r.pctProjetos)} dos projetos</span></div>` +
      `<div class="dash-pj-grid kpi-grid">` +
      kpiCard("Projetos", `${r.projetos} · ${formatPctShare(r.pctProjetos)}`, r.projetos ? "ok" : "warn") +
      kpiCard(
        "Gastos",
        `${r.investimento > 0 ? formatBRL(r.investimento) : "—"} · ${formatPctShare(r.pctInvestimento)}`,
        r.investimento ? "ok" : "warn",
      ) +
      kpiCard(
        "Portas",
        `${r.portas > 0 ? formatQtd(r.portas) : "—"} · ${formatPctShare(r.pctPortas)}`,
        r.portas ? "ok" : "warn",
      ) +
      kpiCard(
        "Metragem",
        `${r.metragem > 0 ? formatMetros(r.metragem) : "—"} · ${formatPctShare(r.pctMetragem)}`,
        r.metragem ? "ok" : "warn",
      ) +
      `</div></div>`;
  }
  html +=
    `<div class="kpi dash-tipo-card" style="border-left-color:#94a3b8">` +
    `<div class="kpi__label dash-tipo-card__nome"><span>Total B2C</span>` +
    `<span class="dash-tipo-card__meta">${totais.projetos} projeto(s)</span></div>` +
    `<div class="dash-pj-grid kpi-grid">` +
    kpiCard("Projetos", String(totais.projetos), totais.projetos ? "ok" : "warn") +
    kpiCard("Gastos", totais.investimento > 0 ? formatBRL(totais.investimento) : "—", totais.investimento ? "ok" : "warn") +
    kpiCard("Portas", totais.portas > 0 ? formatQtd(totais.portas) : "—", totais.portas ? "ok" : "warn") +
    kpiCard("Metragem", totais.metragem > 0 ? formatMetros(totais.metragem) : "—", totais.metragem ? "ok" : "warn") +
    `</div></div>`;
  el.innerHTML = html;
}

function renderDashB2cMetricasSegmento(list) {
  const rawRows = buildB2cMetricasPorSegmento(list);
  const { rows, totais } = withB2cSegmentoPcts(rawRows);

  const tableEl = document.getElementById("dashB2cMetricSegmentoTable");
  if (!tableEl) return;
  if (!rows.length) {
    tableEl.innerHTML = '<p class="muted small">Nenhuma métrica por segmento.</p>';
    return;
  }

  let body = "";
  for (const r of rows) {
    body +=
      "<tr><td><strong>" +
      escapeHtml(r.segmento) +
      "</strong></td>" +
      `<td class="dash-pj-matrix__num">${r.projetos}</td>` +
      `<td class="dash-pj-matrix__num">${formatPctShare(r.pctProjetos)}</td>` +
      `<td class="dash-pj-matrix__num">${r.investimento > 0 ? formatBRL(r.investimento) : "—"}</td>` +
      `<td class="dash-pj-matrix__num">${formatPctShare(r.pctInvestimento)}</td>` +
      `<td class="dash-pj-matrix__num">${r.portas > 0 ? formatQtd(r.portas) : "—"}</td>` +
      `<td class="dash-pj-matrix__num">${formatPctShare(r.pctPortas)}</td>` +
      `<td class="dash-pj-matrix__num">${r.metragem > 0 ? formatMetros(r.metragem) : "—"}</td>` +
      `<td class="dash-pj-matrix__num">${formatPctShare(r.pctMetragem)}</td></tr>`;
  }
  tableEl.innerHTML =
    '<table class="dash-table dash-table--pj-matrix dash-table--b2c-seg"><thead><tr>' +
    "<th>Segmento</th><th>Projetos</th><th>%</th><th>Gastos</th><th>%</th><th>Portas</th><th>%</th><th>Metragem</th><th>%</th>" +
    "</tr></thead><tbody>" +
    body +
    '</tbody><tfoot><tr><td><strong>Total</strong></td>' +
    `<td class="dash-pj-matrix__num"><strong>${totais.projetos}</strong></td>` +
    `<td class="dash-pj-matrix__num"><strong>${totais.projetos ? "100%" : "—"}</strong></td>` +
    `<td class="dash-pj-matrix__num"><strong>${totais.investimento > 0 ? formatBRL(totais.investimento) : "—"}</strong></td>` +
    `<td class="dash-pj-matrix__num"><strong>${totais.investimento > 0 ? "100%" : "—"}</strong></td>` +
    `<td class="dash-pj-matrix__num"><strong>${totais.portas > 0 ? formatQtd(totais.portas) : "—"}</strong></td>` +
    `<td class="dash-pj-matrix__num"><strong>${totais.portas > 0 ? "100%" : "—"}</strong></td>` +
    `<td class="dash-pj-matrix__num"><strong>${totais.metragem > 0 ? formatMetros(totais.metragem) : "—"}</strong></td>` +
    `<td class="dash-pj-matrix__num"><strong>${totais.metragem > 0 ? "100%" : "—"}</strong></td>` +
    "</tr></tfoot></table>";
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
    return (
      `<tr class="${total ? "dash-tipos__total" : ""}">` +
      `<th scope="row"><span class="dash-tipos__nome">` +
      (cor ? `<i style="background:${cor}" aria-hidden="true"></i>` : "") +
      `${escapeHtml(nome)}</span></th>` +
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
  el.innerHTML =
    `<div class="dashboard-table-wrap dash-tipos-wrap"><table class="dash-table dash-tipos" aria-label="Indicadores por tipo de projeto">` +
    `<thead><tr><th scope="col">Tipo</th><th scope="col" class="num">Projetos</th>` +
    `<th scope="col" class="num">Na conclusão</th><th scope="col" class="num">Valor concluído</th>` +
    `<th scope="col" class="num">Em execução</th><th scope="col" class="num">Em aprovação</th>` +
    `<th scope="col" class="num">Média / projeto</th><th scope="col" class="num">Portas novas</th>` +
    `<th scope="col" class="num">Metragem</th></tr></thead><tbody>` +
    rows
      .map(({ tipo, doTipo }) =>
        linha(tipo, TIPO_CHART_COLORS[tipo] || "#94a3b8", doTipo, {
          showPortas: !["SWAP", "Backbone", "Licenciamento", "Mapeamento"].includes(tipo),
        }),
      )
      .join("") +
    `</tbody><tfoot>${linha("Total", "", list, { total: true })}</tfoot></table></div>` +
    `<p class="muted small dash-tipos__nota">Valores, portas, metragem e média consideram a coluna <strong>Conclusão</strong>, como nos indicadores acima. Em execução e em aprovação mostram quantidade e valor final.</p>`;
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
      color: TIPO_CHART_COLORS[tipo] || "#94a3b8",
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
      color: TIPO_CHART_COLORS[tipo] || "#94a3b8",
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

const TIPO_CHART_COLORS = {
  B2C: "#6366f1",
  B2B: "#a855f7",
  SWAP: "#f59e0b",
  Backbone: "#0ea5e9",
  Licenciamento: "#10b981",
  Mapeamento: "#ec4899",
  "Migração": "#14b8a6",
  "Diária": "#a855f7",
};

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
      backgroundColor: TIPO_CHART_COLORS[tipo] || "#94a3b8",
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
  const colors = labels.map((l) => TIPO_CHART_COLORS[l] || "#94a3b8");

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

const SEGMENTO_B2C_CHART_COLORS = {
  MDU: "#22c55e",
  TCR: "#3b82f6",
  TCT: "#f59e0b",
  [B2C_SEGMENTO_SEM]: "#64748b",
};

const B2B_PRODUTO_SEM = "Sem produto";

/** Cores dos produtos B2B — paleta categórica validada (daltonismo), uma variação por tema. */
const PRODUTO_B2B_CORES = {
  "Evento IP": ["#2a78d6", "#3987e5"],
  "IP Dedicado": ["#eb6834", "#d95926"],
  "IP Trânsito": ["#1baf7a", "#199e70"],
  "Lan to Lan": ["#eda100", "#c98500"],
  "Projeto Especial": ["#e87ba4", "#d55181"],
  "Transporte PTT": ["#008300", "#008300"],
  Wireless: ["#4a3aa7", "#9085e9"],
};

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

function renderDashIndicadoresB2c() {
  const list = demandasB2cDashboardList();
  const listModo = filterDemandasModoDash(list);
  const g = countDemandas(list);
  const semDir = list.filter((d) => normalizeResponsavel(d.responsavel) === "").length;
  const valorModoLabel = labelValorDashModo();
  const valor = sumValorDashboard(list);
  const portas = sumPortasDashboard(list);
  const metragem = sumMetragemDashboard(list);
  const rowsCidade = buildStatsPorCidade(listModo);
  const rowsRegional = buildStatsPorRegional(listModo);

  const kpiEl = document.getElementById("kpiB2c");
  if (kpiEl) {
    kpiEl.innerHTML =
      kpiCard("Total B2C", g.total, "ok") +
      kpiCard("Regionais", rowsRegional.length, "ok") +
      kpiCard("Cidades", rowsCidade.length, "ok") +
      kpiCard(valorModoLabel, formatBRL(valor), valor ? "ok" : "warn") +
      kpiCard("Portas novas", formatQtd(portas), portas ? "ok" : "warn") +
      kpiCard("Metragem lanç.", formatMetros(metragem), metragem ? "ok" : "warn") +
      kpiCard("Não atribuídas", semDir, semDir ? "warn" : "ok") +
      kpiCard("Ativas", g.ativas, "ok") +
      kpiCard("Pausadas", g.pausadas, g.pausadas ? "warn" : "ok") +
      kpiCard("Concluídas", g.concluidas, "ok") +
      kpiCard("Em atraso", g.atraso, g.atraso ? "bad" : "ok");
  }

  const countEl = document.getElementById("dashB2cCount");
  if (countEl) {
    const totalOp = demandasDashOperacionalList().length;
    countEl.textContent =
      list.length === 0
        ? "Nenhum projeto tipo B2C na Esteira Projetos."
        : `${list.length} projeto(s) B2C · ${rowsRegional.length} regional(is) · ${rowsCidade.length} cidade(s) · ${totalOp} na Esteira Projetos (sem B2B).`;
  }

  if (!list.length) {
    destroyDashB2cExtraCharts();
    const segKpi = document.getElementById("kpiB2cSegmentos");
    if (segKpi) segKpi.innerHTML = "";
    const segTable = document.getElementById("dashB2cMetricSegmentoTable");
    if (segTable) segTable.innerHTML = '<p class="muted small">Nenhum projeto B2C.</p>';
    return;
  }

  if (!listModo.length) {
    destroyDashB2cExtraCharts();
    const segKpi = document.getElementById("kpiB2cSegmentos");
    if (segKpi) segKpi.innerHTML = "";
    const segTable = document.getElementById("dashB2cMetricSegmentoTable");
    if (segTable) {
      segTable.innerHTML =
        '<p class="muted small">Nenhum B2C na base de indicadores selecionada no topo.</p>';
    }
    return;
  }

  renderDashB2cSegmentoCharts(listModo);
  renderKpiB2cSegmentos(listModo);
  renderDashB2cMetricasSegmento(listModo);
  renderDashB2cGeoDetalhamento(listModo, rowsCidade, rowsRegional);
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


/* ---------- Export / import ---------- */
function downloadBlob(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function setDropdownMenuOpen(panelId, btnId, open) {
  const panel = document.getElementById(panelId);
  const btn = document.getElementById(btnId);
  if (!panel || !btn) return;
  panel.hidden = !open;
  btn.setAttribute("aria-expanded", open ? "true" : "false");
}

function setImportMenuOpen(open) {
  setDropdownMenuOpen("importMenuPanel", "btnImportToggle", open);
}

function setExportMenuOpen(open) {
  setDropdownMenuOpen("exportMenuPanel", "btnExportToggle", open);
}

function exportStateJson() {
  if (!isAdminUser()) {
    toast("Apenas administrador exporta");
    return;
  }
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  downloadBlob(blob, `demandas-backup-${todayISODate()}.json`);
  toast("Exportação JSON gerada");
}

function exportStateCsvFollowUp() {
  if (!isAdminUser()) {
    toast("Apenas administrador exporta");
    return;
  }
  if (typeof DemandasCsvImport === "undefined") {
    toast("Módulo csv-import.js não carregou. Recarregue a página.");
    return;
  }
  const list = state.demandas.map(migrateDemanda);
  if (!list.length) {
    toast("Nenhuma demanda para exportar");
    return;
  }
  const csv = DemandasCsvImport.exportFollowUpCsv(list, todayISODate(), {
    isAtraso: (d) => isAtraso(d),
    diasAtraso: (d) => demandaDiasAtraso(d),
    diasAberto: (d) => demandaDiasAberto(d),
  });
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, `relatorio-projetos-completo-${todayISODate()}.csv`);
  toast(`${list.length} projeto(s) exportado(s) — relatório completo CSV`);
}

document.getElementById("btnExportToggle")?.addEventListener("click", (e) => {
  e.stopPropagation();
  if (!isAdminUser()) {
    toast("Apenas administrador exporta");
    return;
  }
  const panel = document.getElementById("exportMenuPanel");
  const willOpen = panel?.hidden !== false;
  setExportMenuOpen(willOpen);
  if (willOpen) {
    setImportMenuOpen(false);
    setUserMenuOpen(false);
  }
});

document.getElementById("btnExportJson")?.addEventListener("click", () => {
  setExportMenuOpen(false);
  exportStateJson();
});

document.getElementById("btnExportCsv")?.addEventListener("click", () => {
  setExportMenuOpen(false);
  exportStateCsvFollowUp();
});

document.getElementById("btnImportToggle")?.addEventListener("click", (e) => {
  e.stopPropagation();
  if (!isAdminUser()) {
    toast("Apenas administrador importa");
    return;
  }
  if (!requireWriteAccess("import")) return;
  const panel = document.getElementById("importMenuPanel");
  const willOpen = panel?.hidden !== false;
  setImportMenuOpen(willOpen);
  if (willOpen) setExportMenuOpen(false);
});

document.getElementById("btnImportJson")?.addEventListener("click", () => {
  if (!requireWriteAccess("import")) return;
  setImportMenuOpen(false);
  document.getElementById("inputImport")?.click();
});

document.getElementById("btnImportCsvPick")?.addEventListener("click", () => {
  if (!requireWriteAccess("import")) return;
  setImportMenuOpen(false);
  document.getElementById("inputImportCsv")?.click();
});

document.addEventListener("click", (e) => {
  const importMenu = document.getElementById("importMenu");
  const exportMenu = document.getElementById("exportMenu");
  const esteiraMenu = document.getElementById("esteiraTabMenu");
  const userMenu = document.getElementById("userMenu");
  if (!importMenu?.contains(e.target)) setImportMenuOpen(false);
  if (!exportMenu?.contains(e.target)) setExportMenuOpen(false);
  if (!esteiraMenu?.contains(e.target)) setEsteiraTabMenuOpen(false);
  if (!userMenu?.contains(e.target)) setUserMenuOpen(false);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    setImportMenuOpen(false);
    setExportMenuOpen(false);
    setEsteiraTabMenuOpen(false);
    setUserMenuOpen(false);
  }
});

document.getElementById("inputImport")?.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  e.target.value = "";
  setImportMenuOpen(false);
  if (!file) return;
  if (!requireWriteAccess("import")) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    applyLoadedState(data);
    saveState({ importFull: true });
    refreshAllViews();
    toast("Importação concluída");
  } catch {
    toast("Arquivo inválido");
  }
});

/* ---------- Import CSV Follow-up ---------- */
let pendingCsvImport = null;
const modalImportCsv = document.getElementById("modalImportCsv");

function refreshCsvImportPreview() {
  if (!pendingCsvImport) return;
  const mode = document.getElementById("importCsvMode")?.value || "skip";
  const plan = DemandasCsvImport.planImport(
    pendingCsvImport.records,
    state.demandas.map(migrateDemanda),
    mode,
    uid,
    todayISODate,
  );
  pendingCsvImport.plan = plan;

  const sum = document.getElementById("importCsvSummary");
  if (sum) {
    sum.innerHTML =
      `<strong>${pendingCsvImport.records.length}</strong> projeto(s) na planilha → ` +
      `<strong>${plan.novos}</strong> novo(s), <strong>${plan.atualizados}</strong> atualização(ões), ` +
      `<strong>${plan.ignorados}</strong> ignorado(s).`;
  }

  const tbody = document.getElementById("importCsvPreviewBody");
  const more = document.getElementById("importCsvPreviewMore");
  const rows = DemandasCsvImport.previewRows(plan.toApply, 20);
  if (tbody) {
    tbody.innerHTML = rows
      .map(
        (r) =>
          `<tr><td>${escapeHtml(r.titulo)}</td><td>${escapeHtml(r.regional)}</td><td>${escapeHtml(r.csvStatus)}</td>` +
          `<td>${escapeHtml(r.situacao)}</td><td>${escapeHtml(r.linha)}</td><td>${escapeHtml(r.esteira)}</td><td>${escapeHtml(r.responsavel)}</td><td>${escapeHtml(r.acao)}</td></tr>`,
      )
      .join("");
  }
  if (more) {
    const rest = plan.toApply.length - rows.length;
    more.hidden = rest <= 0;
    more.textContent = rest > 0 ? `… e mais ${rest} na importação.` : "";
  }

  const btn = document.getElementById("btnImportCsvConfirm");
  if (btn) btn.disabled = plan.toApply.length === 0;
}

async function openCsvImportModal(file) {
  if (typeof DemandasCsvImport === "undefined") {
    toast("Módulo csv-import.js não carregou. Recarregue a página.");
    return;
  }
  let text;
  try {
    text = await file.text();
  } catch {
    toast("Não foi possível ler o arquivo");
    return;
  }
  const parsed = DemandasCsvImport.parseFile(text);
  if (!parsed.ok) {
    toast(parsed.error || "CSV inválido");
    return;
  }
  pendingCsvImport = { records: parsed.records, fileName: file.name };
  const modeSel = document.getElementById("importCsvMode");
  if (modeSel) modeSel.value = "skip";
  refreshCsvImportPreview();
  modalImportCsv?.showModal();
}

async function confirmCsvImport() {
  if (!requireWriteAccess("import")) return;
  if (!pendingCsvImport?.plan?.toApply?.length) {
    toast("Nada para importar com este modo");
    return;
  }
  const btn = document.getElementById("btnImportCsvConfirm");
  if (btn) btn.disabled = true;
  let n = 0;
  for (const { dem } of pendingCsvImport.plan.toApply) {
    const migrated = migrateDemanda(dem);
    const idx = state.demandas.findIndex((x) => x.id === migrated.id);
    if (idx >= 0) state.demandas[idx] = migrated;
    else state.demandas.push(migrated);
    applyCloudPatch({ demanda: migrated });
    n++;
  }
  saveState();
  pendingCsvImport = null;
  modalImportCsv?.close();
  refreshAllViews();
  if (btn) btn.disabled = false;
  toast(`${n} projeto(s) importado(s) da planilha`);
}

document.getElementById("inputImportCsv")?.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  e.target.value = "";
  setImportMenuOpen(false);
  if (file) await openCsvImportModal(file);
});
document.getElementById("importCsvMode")?.addEventListener("change", refreshCsvImportPreview);
document.getElementById("btnImportCsvConfirm")?.addEventListener("click", () => void confirmCsvImport());
document.getElementById("btnImportCsvCancel")?.addEventListener("click", () => {
  pendingCsvImport = null;
  modalImportCsv?.close();
});
document.getElementById("modalImportCsvClose")?.addEventListener("click", () => {
  pendingCsvImport = null;
  modalImportCsv?.close();
});

/* ---------- init ---------- */
["filterDashTempoBusca", "filterDashTempoResp", "filterDashTempoStatus", "filterDashTempoAno", "filterDashTempoMes"].forEach((id) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener("input", renderDashTempoTable);
  el.addEventListener("change", renderDashTempoTable);
});
["filterDashTempoB2bBusca", "filterDashTempoB2bResp", "filterDashTempoB2bStatus", "filterDashTempoB2bAno", "filterDashTempoB2bMes"].forEach((id) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener("input", renderDashTempoB2bTable);
  el.addEventListener("change", renderDashTempoB2bTable);
});
document.getElementById("filterDashValorModo")?.addEventListener("change", () => {
  updateDashPeriodoHint();
  renderDashboard();
});
["filterDashDataInicio", "filterDashDataFim"].forEach((id) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener("change", () => {
    renderDashboard();
  });
});
document.getElementById("btnDashPeriodoLimpar")?.addEventListener("click", () => {
  const ini = document.getElementById("filterDashDataInicio");
  const fim = document.getElementById("filterDashDataFim");
  if (ini) ini.value = "";
  if (fim) fim.value = "";
  renderDashboard();
});
["filterDashB2bAno", "filterDashB2bMes"].forEach((id) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener("change", () => {
    if (isDashBlockVisible("indicadores-b2b")) renderDashIndicadoresB2b();
  });
});
document.getElementById("filterDashCidadesRegional")?.addEventListener("change", () => {
  const base = demandasDashOperacionalList();
  populateDashCidadesFilters(base);
  const v = document.getElementById("filterDashCidadesRegional")?.value || "";
  setDashCidadesDrillRegional(v, { syncSelect: false });
});
document.getElementById("filterDashCidadesCidade")?.addEventListener("change", () => {
  const cidade = document.getElementById("filterDashCidadesCidade")?.value || "";
  if (!cidade) {
    if (isDashBlockVisible("cidades")) renderDashCidades();
    return;
  }
  const reg = regionalFromCidadeLabel(cidade);
  const selReg = document.getElementById("filterDashCidadesRegional");
  if (selReg && reg) selReg.value = reg;
  setDashCidadesDrillRegional(reg, { syncSelect: false });
});
document.getElementById("filterDashProjetistaResumo")?.addEventListener("change", () => {
  const v = document.getElementById("filterDashProjetistaResumo")?.value || FILTER_PROJETISTA_TODOS;
  if (!v || v === FILTER_PROJETISTA_TODOS) {
    dashPjDrillNome = "";
    renderKpiProjetistas();
    return;
  }
  setDashPjDrill(v, { syncSelect: false });
});

function hideAppLoader() {
  const loader = document.getElementById("appLoader");
  if (loader) loader.hidden = true;
}

/* ---------- Usuarios (somente admin) ---------- */
function roleOptionsHtml(selected) {
  const roles = typeof DemandasRoles !== "undefined" ? DemandasRoles.ROLES : ["admin", "projetista", "visibilidade"];
  const labels = typeof DemandasRoles !== "undefined" ? DemandasRoles.ROLE_LABELS : {};
  return roles
    .map((r) => {
      const lab = labels[r] || r;
      const sel = r === selected ? " selected" : "";
      return `<option value="${escapeHtml(r)}"${sel}>${escapeHtml(lab)}</option>`;
    })
    .join("");
}

function regionalOptionsHtml(selected) {
  const cur =
    typeof DemandasRoles !== "undefined" && DemandasRoles.normalizeRegionalValue
      ? DemandasRoles.normalizeRegionalValue(selected)
      : String(selected || "").trim();
  const opts = [`<option value=""${cur ? "" : " selected"}>Todas</option>`];
  for (const reg of REGIONAIS_ORDER) {
    const sel = reg === cur ? " selected" : "";
    opts.push(`<option value="${escapeHtml(reg)}"${sel}>${escapeHtml(reg)}</option>`);
  }
  return opts.join("");
}

function fillUserNovoRegionalSelect() {
  const sel = document.getElementById("userNovoRegional");
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = regionalOptionsHtml(cur);
  syncNovoUsuarioHint();
}

function syncNovoUsuarioHint() {
  const el = document.getElementById("userNovoHint");
  if (!el) return;
  const role = document.getElementById("userNovoRole")?.value || "projetista";
  const regional = document.getElementById("userNovoRegional")?.value || "";
  const papel =
    role === "admin"
      ? "Acesso total, inclusive a usuários."
      : role === "visibilidade"
        ? "Só consulta, sem alterar."
        : "Pode operar as demandas.";
  const regiao = regional ? "Entra filtrado nesta regional." : "Entra vendo todas as regionais.";
  el.textContent = `${papel} ${regiao}`;
}

function renderUsuariosPanel() {
  const list = document.getElementById("usuariosList");
  const panel = document.getElementById("panelUsuarios");
  if (!list || !panel) return;
  if (!isAdminUser()) {
    list.innerHTML = '<p class="muted">Acesso restrito ao administrador.</p>';
    return;
  }
  fillUserNovoRegionalSelect();
  const map =
    typeof DemandasRoles !== "undefined" ? DemandasRoles.getRolesMap() : { ...(window.DEMANDAS_ROLES_SEED || {}) };
  const emails = Object.keys(map).sort((a, b) => a.localeCompare(b, "pt-BR"));
  if (!emails.length) {
    list.innerHTML = '<p class="muted">Nenhum usuario no mapa de papeis.</p>';
    return;
  }
  list.innerHTML = emails
    .map((email) => {
      const role = map[email];
      const regional =
        typeof DemandasRoles !== "undefined" && DemandasRoles.regionalForEmail
          ? DemandasRoles.regionalForEmail(email)
          : "";
      const disabled = typeof DemandasRoles !== "undefined" && DemandasRoles.isDisabled?.(email);
      const assigned = demandasAssignedToEmail(email).length;
      const status = disabled
        ? `<span class="usuarios-row__status usuarios-row__status--off">Desabilitado</span>`
        : `<span class="usuarios-row__status usuarios-row__status--on">Ativo</span>`;
      const toggleLabel = disabled ? "Habilitar" : "Desabilitar";
      const demandasTxt = assigned
        ? `${assigned} demanda${assigned > 1 ? "s" : ""}`
        : "Sem demandas";
      const regVal = regional || "";
      const nomeAtual = accountDisplayNameForEmail(email);
      const nomeSalvo =
        typeof DemandasRoles !== "undefined" && DemandasRoles.displayNameForEmail
          ? DemandasRoles.displayNameForEmail(email)
          : "";
      const tituloConta = nomeSalvo || nomeAtual || email;
      const mostraEmailAbaixo = tituloConta.toLowerCase() !== String(email).toLowerCase();
      return (
        `<div class="usuarios-row${disabled ? " is-disabled" : ""}" data-email="${escapeHtml(email)}" data-role="${escapeHtml(role)}" data-regional="${escapeHtml(regVal)}" data-nome="${escapeHtml(nomeAtual)}">` +
        `<div class="usuarios-row__head">` +
        `<div class="usuarios-row__id">` +
        `<span class="usuarios-row__email">${escapeHtml(tituloConta)}</span>` +
        (mostraEmailAbaixo ? `<span class="usuarios-row__mail muted">${escapeHtml(email)}</span>` : "") +
        `<span class="usuarios-row__sub">${status}<span class="usuarios-row__meta muted">${demandasTxt}</span></span>` +
        `</div>` +
        `<div class="usuarios-row__more">` +
        `<button type="button" class="icon-btn user-row-more" aria-label="Mais ações de ${escapeHtml(email)}" aria-expanded="false" aria-haspopup="menu">⋯</button>` +
        `<div class="usuarios-row__menu" role="menu" hidden>` +
        `<button type="button" class="user-role-reset" role="menuitem">Recuperar senha</button>` +
        `<button type="button" class="user-role-toggle" role="menuitem">${toggleLabel}</button>` +
        `<button type="button" class="user-role-del" role="menuitem">Remover</button>` +
        `</div></div></div>` +
        `<div class="usuarios-row__edit">` +
        `<label><span>Nome</span><input type="text" class="user-nome-input" maxlength="80" value="${escapeHtml(nomeAtual)}" placeholder="Nome da conta" aria-label="Nome de ${escapeHtml(email)}"${disabled ? " disabled" : ""} /></label>` +
        `<label><span>Papel</span><select class="user-role-select" aria-label="Papel de ${escapeHtml(email)}"${disabled ? " disabled" : ""}>${roleOptionsHtml(role)}</select></label>` +
        `<label><span>Regional</span><select class="user-regional-select" aria-label="Regional de ${escapeHtml(email)}"${disabled ? " disabled" : ""}>${regionalOptionsHtml(regional)}</select></label>` +
        `<button type="button" class="btn btn--primary btn--sm user-role-save" disabled>Salvar</button>` +
        `</div></div>`
      );
    })
    .join("");

  const busca = document.getElementById("usuariosBusca");
  const q = String(busca?.value || "").trim().toLowerCase();
  list.querySelectorAll(".usuarios-row").forEach((row) => {
    const email = row.dataset.email;
    if (q) {
      const nomeTxt = String(row.querySelector(".user-nome-input")?.value || row.dataset.nome || "").toLowerCase();
      row.hidden = !String(email || "").includes(q) && !nomeTxt.includes(q);
    }
    const syncDirty = () => {
      const role = row.querySelector(".user-role-select")?.value || "";
      const regional = row.querySelector(".user-regional-select")?.value || "";
      const nome = normalizeAccountDisplayName(row.querySelector(".user-nome-input")?.value || "");
      const dirty =
        role !== (row.dataset.role || "") ||
        regional !== (row.dataset.regional || "") ||
        nome !== normalizeAccountDisplayName(row.dataset.nome || "");
      const btn = row.querySelector(".user-role-save");
      if (btn) btn.disabled = !dirty;
    };
    row.querySelector(".user-role-select")?.addEventListener("change", syncDirty);
    row.querySelector(".user-regional-select")?.addEventListener("change", syncDirty);
    row.querySelector(".user-nome-input")?.addEventListener("input", syncDirty);
    row.querySelector(".user-row-more")?.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const menu = row.querySelector(".usuarios-row__menu");
      const open = menu?.hidden !== false;
      closeUserRowMenus();
      if (menu && open) {
        menu.hidden = false;
        ev.currentTarget.setAttribute("aria-expanded", "true");
      }
    });
    row.querySelector(".user-role-save")?.addEventListener("click", () => {
      void saveUserAccess(email, {
        role: row.querySelector(".user-role-select")?.value,
        regional: row.querySelector(".user-regional-select")?.value,
        nome: row.querySelector(".user-nome-input")?.value,
      });
    });
    row.querySelector(".user-role-reset")?.addEventListener("click", () => {
      closeUserRowMenus();
      void sendUserPasswordReset(email);
    });
    row.querySelector(".user-role-toggle")?.addEventListener("click", () => {
      closeUserRowMenus();
      void toggleUserDisabled(email);
    });
    row.querySelector(".user-role-del")?.addEventListener("click", () => {
      closeUserRowMenus();
      void removeUserFromSystem(email);
    });
  });
  bindUsuariosBusca();
}

function closeUserRowMenus() {
  document.querySelectorAll(".usuarios-row__menu").forEach((menu) => {
    menu.hidden = true;
    menu.previousElementSibling?.setAttribute("aria-expanded", "false");
  });
}

let usuariosBuscaBound = false;
function bindUsuariosBusca() {
  if (usuariosBuscaBound) return;
  usuariosBuscaBound = true;
  document.getElementById("usuariosBusca")?.addEventListener("input", () => {
    if (usuariosModalAberto()) renderUsuariosPanel();
  });
  document.addEventListener("click", (ev) => {
    if (ev.target.closest(".usuarios-row__more")) return;
    closeUserRowMenus();
  });
}

async function sendUserPasswordReset(email) {
  if (!isAdminUser()) {
    toast("Apenas administrador");
    return;
  }
  const e = String(email || "")
    .trim()
    .toLowerCase();
  if (!e) return;
  if (typeof DemandasAuth?.sendPasswordReset !== "function") {
    toast("Recuperação de senha indisponível. Recarregue com Ctrl+F5.");
    return;
  }
  const ok = await confirmDialog({
    title: "Enviar recuperação de senha?",
    message: `O Firebase enviará um e-mail para «${e}» com link para criar uma nova senha.`,
    hint: "A senha atual não pode ser visualizada — só redefinida.",
    confirmText: "Enviar e-mail",
  });
  if (!ok) return;
  try {
    await DemandasAuth.sendPasswordReset(e);
    toast(`E-mail de recuperação enviado para ${e}`);
  } catch (err) {
    toast(err?.message || "Falha ao enviar recuperação");
  }
}

async function persistRolesMap(nextMap) {
  if (typeof DemandasRoles !== "undefined") DemandasRoles.setRolesMap(nextMap);
  refreshProjetistaAssignmentLists();
  renderUsuariosPanel();
  if (persistenceApi?.persistRoles) {
    const saved = await persistenceApi.persistRoles(nextMap);
    if (saved && typeof DemandasRoles !== "undefined") DemandasRoles.setRolesMap(saved);
  }
  refreshProjetistaAssignmentLists();
  renderUsuariosPanel();
  applyRoleUi();
}

async function saveUserAccess(email, { role, regional, nome } = {}) {
  if (!isAdminUser()) {
    toast("Apenas administrador");
    return;
  }
  const e = String(email).trim().toLowerCase();
  if (typeof DemandasRoles !== "undefined" && DemandasRoles.isDisabled?.(e)) {
    toast("Habilite o usuário antes de alterar");
    return;
  }
  const newRole = String(role || "projetista").trim().toLowerCase();
  const check =
    typeof DemandasRoles !== "undefined"
      ? DemandasRoles.canChangeRole(e, newRole)
      : { ok: true };
  if (!check.ok) {
    toast(check.reason || "Não foi possível alterar o papel");
    return;
  }
  let reg =
    typeof DemandasRoles !== "undefined" && DemandasRoles.normalizeRegionalValue
      ? DemandasRoles.normalizeRegionalValue(regional)
      : String(regional || "").trim();
  if (reg && !REGIONAIS_ORDER.includes(reg)) {
    toast("Regional inválida");
    return;
  }
  const nomeNorm = normalizeAccountDisplayName(nome);
  const map = { ...(typeof DemandasRoles !== "undefined" ? DemandasRoles.getRolesMap() : {}) };
  map[e] = newRole;
  const regionals = {
    ...(typeof DemandasRoles !== "undefined" ? DemandasRoles.getRegionalsMap?.() || {} : {}),
  };
  if (reg) regionals[e] = reg;
  else delete regionals[e];
  const names = {
    ...(typeof DemandasRoles !== "undefined" ? DemandasRoles.getNamesMap?.() || {} : {}),
  };
  if (nomeNorm) names[e] = nomeNorm;
  else delete names[e];
  if (typeof DemandasRoles !== "undefined") {
    DemandasRoles.setRegionalsMap(regionals);
    DemandasRoles.setNamesMap(names);
  }
  try {
    await persistRolesMap(map);
    toast("Dados da conta salvos");
  } catch (err) {
    toast(err?.message || "Falha ao salvar");
  }
}

async function saveUserRole(email, newRole) {
  await saveUserAccess(email, { role: newRole });
}

async function toggleUserDisabled(email) {
  if (!isAdminUser()) {
    toast("Apenas administrador");
    return;
  }
  const e = String(email).trim().toLowerCase();
  const currentlyDisabled = typeof DemandasRoles !== "undefined" && DemandasRoles.isDisabled?.(e);
  const nextDisabled = !currentlyDisabled;
  const check =
    typeof DemandasRoles !== "undefined"
      ? DemandasRoles.canToggleDisabled(e, nextDisabled)
      : { ok: true };
  if (!check.ok) {
    toast(check.reason || "Não foi possível alterar");
    return;
  }
  if (nextDisabled) {
    const ok = await confirmDialog({
      title: "Desabilitar usuário?",
      message: `«${e}» permanece no sistema, mas sem acesso operacional e fora da lista de projetistas.`,
      hint: "Demandas já atribuídas a ele continuam; você pode redistribuí-las depois.",
      confirmText: "Desabilitar",
      variant: "danger",
    });
    if (!ok) return;
  }
  const disabled = {
    ...(typeof DemandasRoles !== "undefined" ? DemandasRoles.getDisabledMap() : {}),
  };
  if (nextDisabled) disabled[e] = true;
  else delete disabled[e];
  if (typeof DemandasRoles !== "undefined") DemandasRoles.setDisabledMap(disabled);
  try {
    const map = { ...(typeof DemandasRoles !== "undefined" ? DemandasRoles.getRolesMap() : {}) };
    await persistRolesMap(map);
    // Garante estado local após sync (snapshot atrasado não deve reverter).
    if (typeof DemandasRoles !== "undefined") DemandasRoles.setDisabledMap(disabled);
    renderUsuariosPanel();
    if (nextDisabled) clearEditingPresenceForEmail(e);
    toast(nextDisabled ? "Usuário desabilitado" : "Usuário habilitado");
  } catch (err) {
    // Reverte UI se a nuvem falhou
    if (typeof DemandasRoles !== "undefined") {
      const rollback = { ...(DemandasRoles.getDisabledMap() || {}) };
      if (nextDisabled) delete rollback[e];
      else rollback[e] = true;
      DemandasRoles.setDisabledMap(rollback);
      renderUsuariosPanel();
    }
    toast(err?.message || "Falha ao atualizar");
  }
}

async function removeUserFromSystem(email) {
  if (!isAdminUser()) {
    toast("Apenas administrador");
    return;
  }
  const e = String(email).trim().toLowerCase();
  const check =
    typeof DemandasRoles !== "undefined" ? DemandasRoles.canRemoveUser(e) : { ok: true };
  if (!check.ok) {
    toast(check.reason || "Não foi possível remover");
    return;
  }
  const assigned = demandasAssignedToEmail(e);
  if (assigned.length) {
    const sample = assigned
      .slice(0, 3)
      .map((d) => d.titulo || d.nome || d.id)
      .join(", ");
    await confirmDialog({
      title: "Não é possível remover",
      message: `«${e}» ainda tem ${assigned.length} demanda${assigned.length > 1 ? "s" : ""} atribuída${assigned.length > 1 ? "s" : ""}${sample ? ` (ex.: ${sample})` : ""}.`,
      hint: "Redistribua as demandas ou use Desabilitar para manter a conta sem acesso.",
      confirmText: "Entendi",
      cancelText: "",
      variant: "danger",
    });
    return;
  }
  const ok = await confirmDialog({
    title: "Remover do sistema?",
    message: `«${e}» será retirado da lista de acessos e não conseguirá usar o sistema.`,
    hint: "A conta no Authentication do Firebase permanece (não dá para apagar daqui). Para excluir de vez, use o Console Firebase → Authentication.",
    confirmText: "Remover do sistema",
    variant: "danger",
  });
  if (!ok) return;
  const map = { ...(typeof DemandasRoles !== "undefined" ? DemandasRoles.getRolesMap() : {}) };
  delete map[e];
  const disabled = {
    ...(typeof DemandasRoles !== "undefined" ? DemandasRoles.getDisabledMap() : {}),
  };
  delete disabled[e];
  const purged = {
    ...(typeof DemandasRoles !== "undefined" ? DemandasRoles.getPurgedMap() : {}),
    [e]: true,
  };
  if (typeof DemandasRoles !== "undefined") {
    DemandasRoles.setDisabledMap(disabled);
    DemandasRoles.setPurgedMap(purged);
    const regionals = { ...(DemandasRoles.getRegionalsMap?.() || {}) };
    delete regionals[e];
    DemandasRoles.setRegionalsMap(regionals);
    const names = { ...(DemandasRoles.getNamesMap?.() || {}) };
    delete names[e];
    DemandasRoles.setNamesMap(names);
  }
  try {
    await persistRolesMap(map);
    clearEditingPresenceForEmail(e);
    toast("Usuário removido da lista de acessos");
  } catch (err) {
    toast(err?.message || "Falha ao remover");
  }
}

document.getElementById("userNovoRole")?.addEventListener("change", syncNovoUsuarioHint);
document.getElementById("userNovoRegional")?.addEventListener("change", syncNovoUsuarioHint);

document.getElementById("formNovoUsuario")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!isAdminUser()) {
    toast("Apenas administrador");
    return;
  }
  const email = String(document.getElementById("userNovoEmail")?.value || "")
    .trim()
    .toLowerCase();
  const senha = String(document.getElementById("userNovoSenha")?.value || "");
  const nomeNovo = normalizeAccountDisplayName(document.getElementById("userNovoNome")?.value || "");
  const role = String(document.getElementById("userNovoRole")?.value || "projetista")
    .trim()
    .toLowerCase();
  let regional =
    typeof DemandasRoles !== "undefined" && DemandasRoles.normalizeRegionalValue
      ? DemandasRoles.normalizeRegionalValue(document.getElementById("userNovoRegional")?.value)
      : String(document.getElementById("userNovoRegional")?.value || "").trim();
  if (regional && !REGIONAIS_ORDER.includes(regional)) {
    toast("Regional inválida");
    return;
  }
  if (!email) {
    toast("Informe o e-mail");
    return;
  }
  const check =
    typeof DemandasRoles !== "undefined"
      ? DemandasRoles.canChangeRole(email, role)
      : { ok: true };
  if (!check.ok) {
    toast(check.reason || "Papel inválido");
    return;
  }
  const btn = document.getElementById("btnCriarUsuario");
  if (btn) btn.disabled = true;
  try {
    let existed = false;
    let created = false;
    if (senha) {
      if (senha.length < 6) {
        toast("A senha deve ter ao menos 6 caracteres");
        return;
      }
      if (typeof DemandasAuth?.createUser !== "function") {
        throw new Error("Criação de usuário indisponível neste modo");
      }
      const result = await DemandasAuth.createUser(email, senha);
      existed = !!result?.existed;
      created = !existed;
    } else {
      existed = true;
    }

    const map = { ...(typeof DemandasRoles !== "undefined" ? DemandasRoles.getRolesMap() : {}) };
    map[email] = role;
    if (typeof DemandasRoles !== "undefined") {
      const disabled = { ...(DemandasRoles.getDisabledMap?.() || {}) };
      const purged = { ...(DemandasRoles.getPurgedMap?.() || {}) };
      const regionals = { ...(DemandasRoles.getRegionalsMap?.() || {}) };
      const names = { ...(DemandasRoles.getNamesMap?.() || {}) };
      delete disabled[email];
      delete purged[email];
      if (regional) regionals[email] = regional;
      else delete regionals[email];
      if (nomeNovo) names[email] = nomeNovo;
      else delete names[email];
      DemandasRoles.setDisabledMap(disabled);
      DemandasRoles.setPurgedMap(purged);
      DemandasRoles.setRegionalsMap(regionals);
      DemandasRoles.setNamesMap(names);
    }
    await persistRolesMap(map);
    document.getElementById("userNovoEmail").value = "";
    document.getElementById("userNovoSenha").value = "";
    if (document.getElementById("userNovoNome")) document.getElementById("userNovoNome").value = "";
    document.getElementById("userNovoRole").value = "projetista";
    if (document.getElementById("userNovoRegional")) document.getElementById("userNovoRegional").value = "";
    toast(
      created
        ? "Usuário criado e adicionado à lista"
        : existed
          ? "Conta já existia no login — papel adicionado à lista"
          : "Usuário atualizado na lista",
    );
  } catch (err) {
    toast(err?.message || "Não foi possível criar o usuário");
  } finally {
    if (btn) btn.disabled = false;
  }
});

async function bootstrap() {
  setSyncStatus("connecting");
  const loader = document.getElementById("appLoader");
  if (loader) loader.hidden = false;
  persistenceReady = false;

  const localFirst = DemandasFirebase.loadLocal?.();
  if (localFirst?.demandas?.length) {
    applyLoadedState(localFirst);
    refreshAllViews();
  }

  const forceHideLoader = setTimeout(hideAppLoader, 12000);

  try {
    persistenceApi = await DemandasFirebase.init({
      onData(data) {
        handleRemoteData(data);
      },
      onStatus: setSyncStatus,
      onRoles() {
        applyRoleUi();
        void enforceAccessOrSignOut();
        if (pendingApplyRegionalOnRoles) {
          pendingApplyRegionalOnRoles = false;
          applyUserRegionalFilter(DemandasAuth?.currentUser?.());
          if (panels.esteira && !panels.esteira.hidden) renderBoard();
        }
        if (usuariosModalAberto()) renderUsuariosPanel();
      },
    });
    persistenceReady = persistenceApi.mode === "firebase";
    flushPendingCloudSave();
    if (persistenceApi.mode === "firebase") {
      toast("Conectado à nuvem");
    } else {
      toast(window.__demandasSyncHint || "Dados só neste navegador");
    }
  } catch (e) {
    console.error(e);
    setSyncStatus("error");
    const local = DemandasFirebase.loadLocal?.();
    if (local) applyLoadedState(local);
    persistenceReady = false;
    persistenceApi = null;
    appBootstrapped = false;
    toast(window.__demandasSyncHint || e.message || "Erro ao sincronizar — exibindo cópia local se houver");
  } finally {
    clearTimeout(forceHideLoader);
    hideAppLoader();
    refreshAllViews();
    updateEsteiraStatusLine();
    if (persistenceApi?.mode === "firebase") {
      /* emitToUi já chama synced; fallback se ainda vazio */
    } else if (!persistenceApi) {
      setSyncStatus(window.__demandasSyncHint ? "error" : "local");
    }
  }
}

function updateEsteiraStatusLine() {
  const el = document.getElementById("esteiraStatusLine");
  syncEsteiraFiltrosUi();
  if (!el) return;
  const n = state.demandas.length;
  if (n === 0) {
    el.innerHTML = `<p class="esteira-resumo__vazio">Nenhuma demanda carregada. Verifique o status de sincronização no topo ou importe os dados.</p>`;
    return;
  }
  const linha = activeEsteiraCanal;
  const base = filteredDemandasForEsteira(linha, { rapido: false });
  const finals = new Set(statusFinalizadosKeys(linha));
  const modo = esteiraModoColunas;
  const visiveis = base.filter((d) => {
    const fin = finals.has(d.status);
    if (modo === ESTEIRA_MODO_FINALIZADOS) return fin;
    if (modo === ESTEIRA_MODO_TODOS) return true;
    return !fin;
  });
  const nFinOcultos = modo === ESTEIRA_MODO_ATIVOS ? base.length - visiveis.length : 0;
  const mostrando = esteiraFiltroRapido
    ? visiveis.filter((d) => ESTEIRA_FILTROS_RAPIDOS[esteiraFiltroRapido]?.test(d)).length
    : visiveis.length;
  const chips = Object.entries(ESTEIRA_FILTROS_RAPIDOS)
    .map(([key, cfg]) => {
      const qtd = visiveis.filter(cfg.test).length;
      const ativo = esteiraFiltroRapido === key;
      if (!qtd && !ativo) return "";
      return (
        `<button type="button" class="resumo-chip resumo-chip--${cfg.tom}${ativo ? " is-ativo" : ""}" data-rapido="${key}" aria-pressed="${ativo}"` +
        ` title="${ativo ? "Clique para mostrar todos" : "Clique para filtrar"}">` +
        `<b>${qtd}</b> ${escapeHtml(cfg.label)}${ativo ? ' <span aria-hidden="true">✕</span>' : ""}</button>`
      );
    })
    .join("");
  const total =
    `<span class="esteira-resumo__total"><b>${mostrando}</b> ${mostrando === 1 ? "projeto" : "projetos"}` +
    (esteiraFiltroRapido || mostrando !== visiveis.length ? ` <span class="muted">de ${visiveis.length}</span>` : "") +
    (nFinOcultos ? ` <span class="muted">· ${nFinOcultos} finalizado(s) oculto(s)</span>` : "") +
    `</span>`;
  el.innerHTML = total + (chips
      ? `<span class="esteira-resumo__chips">${chips}</span>`
      : visiveis.length
        ? `<span class="esteira-resumo__ok">✓ Nenhum atraso ou pendência</span>`
        : "");
}

(function syncPublicLink() {
  const a = document.getElementById("appPublicLink");
  if (a) {
    a.href = APP_PUBLIC_URL;
    a.textContent = APP_PUBLIC_URL.replace(/^https:\/\//, "");
  }
})();

let brandMigrateClicks = 0;
document.querySelector(".brand h1")?.addEventListener("click", async () => {
  if (!persistenceApi?.migrateLegacyPayload) return;
  if (!isAdminUser()) {
    brandMigrateClicks = 0;
    return;
  }
  brandMigrateClicks += 1;
  if (brandMigrateClicks < 5) return;
  brandMigrateClicks = 0;
  const ok = await confirmDialog({
    title: "Migrar dados legados?",
    message: "Copiar demandas do documento legado (demandasSistema/state) para a coleção «demandas».",
    hint: "Esta operação deve ser feita apenas uma vez.",
    confirmText: "Migrar agora",
    variant: "warn",
  });
  if (!ok) return;
  try {
    toast("Migrando…");
    const res = await persistenceApi.migrateLegacyPayload();
    toast(res.message || `Migradas: ${res.migrated}`);
    if (res.migrated > 0) window.__demandasSyncHint = "";
  } catch (e) {
    console.error(e);
    toast(e.message || "Erro na migração");
  }
});

initDashBlocks();
initDashGeoProjetosLista();
initDashCidadesDrill();
initDashPjDrill();
initDashPjTipos();

/* ---------- Login / bootstrap ---------- */
function showLoginScreen() {
  const loginScreen = document.getElementById("loginScreen");
  const appRoot = document.getElementById("appRoot");
  if (loginScreen) loginScreen.hidden = false;
  if (appRoot) appRoot.hidden = true;
  hideAppLoader();
}

function setAuthUi(user) {
  const loginScreen = document.getElementById("loginScreen");
  const appRoot = document.getElementById("appRoot");
  const emailEl = document.getElementById("authUserEmail");
  const roleEl = document.getElementById("authUserRole");
  const btnOut = document.getElementById("btnSignOut");
  if (user) {
    if (loginScreen) loginScreen.hidden = true;
    if (appRoot) appRoot.hidden = false;
    setSyncStatus("connecting");
    if (emailEl) {
      emailEl.textContent = user.email || "Usuario";
      emailEl.hidden = false;
    }
    if (btnOut) btnOut.hidden = false;
    updateUserMenuAvatar(user.email);
    applyRoleUi();
  } else {
    const syncEl = document.getElementById("syncBadge");
    if (syncEl) syncEl.hidden = true;
    showLoginScreen();
    if (emailEl) emailEl.hidden = true;
    if (roleEl) roleEl.hidden = true;
    if (btnOut) btnOut.hidden = true;
    appRoot?.classList.remove("app--readonly", "app--admin");
    appBootstrapped = false;
    persistenceApi = null;
    persistenceReady = false;
    if (typeof DemandasFirebase?.teardown === "function") DemandasFirebase.teardown();
  }
}

async function startAppOnce() {
  if (persistenceApi) return;
  if (bootstrapPromise) return bootstrapPromise;
  bootstrapPromise = (async () => {
    appBootstrapped = true;
    const loader = document.getElementById("appLoader");
    if (loader) loader.hidden = false;
    try {
      await bootstrap();
    } catch (e) {
      appBootstrapped = false;
      throw e;
    } finally {
      hideAppLoader();
      bootstrapPromise = null;
    }
  })();
  return bootstrapPromise;
}

/** Garante Firestore/local após login (evita tela vazia se o 1º bootstrap falhou). */
async function ensureDataAfterLogin(user) {
  if (!user) return;
  if (!persistenceApi) {
    await startAppOnce();
    if (!persistenceApi) return;
  }
  if (!state.demandas.length) {
    setSyncStatus(persistenceApi?.mode === "firebase" ? "empty" : "local");
  }
  refreshAllViews();
}

function showLoginError(msg) {
  const el = document.getElementById("loginError");
  if (!el) return;
  if (msg) {
    el.textContent = msg;
    el.hidden = false;
  } else {
    el.textContent = "";
    el.hidden = true;
  }
}

function setLoginLoading(loading) {
  const btn = document.getElementById("btnLoginSubmit");
  if (!btn) return;
  btn.disabled = loading;
  btn.textContent = loading ? "Entrando…" : "Entrar";
}

let pendingApplyRegionalOnRoles = false;

async function handleAuthUser(user) {
  if (!user) {
    handleAuthPromise = null;
    pendingApplyRegionalOnRoles = false;
    setAuthUi(user);
    appBootstrapped = false;
    return;
  }
  if (handleAuthPromise) return handleAuthPromise;

  handleAuthPromise = (async () => {
    pendingApplyRegionalOnRoles = true;
    setAuthUi(user);
    applyUserHomeOnLogin(user);
    await startAppOnce();
    await ensureDataAfterLogin(user);
    if (await enforceAccessOrSignOut()) return;
    if (pendingApplyRegionalOnRoles) {
      pendingApplyRegionalOnRoles = false;
      applyUserRegionalFilter(user);
      if (panels.esteira && !panels.esteira.hidden) renderBoard();
    }
  })();

  try {
    await handleAuthPromise;
  } catch (e) {
    console.error(e);
    appBootstrapped = false;
    hideAppLoader();
    setSyncStatus("error");
    const msg = window.__demandasSyncHint || e.message || "Erro ao carregar os dados.";
    toast(msg);
    refreshAllViews();
    updateEsteiraStatusLine();
  } finally {
    handleAuthPromise = null;
  }
}

async function doLogin() {
  if (typeof DemandasAuth === "undefined") {
    showLoginError("Módulo de login não carregou. Recarregue a página (Ctrl+F5).");
    return;
  }
  showLoginError("");
  const email = document.getElementById("loginEmail")?.value?.trim() || "";
  const password = document.getElementById("loginPassword")?.value || "";
  if (!email || !password) {
    showLoginError("Informe e-mail e senha.");
    return;
  }
  setLoginLoading(true);
  try {
    await DemandasAuth.signIn(email, password);
    const user = DemandasAuth.currentUser();
    if (user) await handleAuthUser(user);
    else showLoginError("Login concluído, mas a sessão não foi reconhecida. Tente novamente.");
  } catch (err) {
    console.error("Login:", err);
    showLoginError(DemandasAuth.mapAuthError(err));
  } finally {
    setLoginLoading(false);
  }
}

function bindLoginUi() {
  initShellUi();
  document.querySelectorAll("[data-sign-out]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      setUserMenuOpen(false);
      document.getElementById("modalUserConta")?.close();
      document.getElementById("panelUsuarios")?.close();
      try {
        await DemandasAuth.signOut();
        toast("Sessão encerrada");
      } catch (err) {
        toast(DemandasAuth.mapAuthError(err));
      }
    });
  });
}

async function initAuthGate() {
  if (typeof DemandasAuth === "undefined") {
    showLoginScreen();
    showLoginError("Arquivo firebase-auth.js não encontrado. Faça deploy do site atualizado.");
    return;
  }

  if (!DemandasAuth.isConfigured()) {
    const loginScreen = document.getElementById("loginScreen");
    if (loginScreen) loginScreen.hidden = true;
    document.getElementById("appRoot").hidden = false;
    hideAppLoader();
    await startAppOnce();
    return;
  }

  showLoginScreen();

  try {
    await DemandasAuth.init(handleAuthUser);
  } catch (e) {
    console.error(e);
    showLoginError(DemandasAuth.mapAuthError(e) || e.message || "Erro ao iniciar autenticação.");
  }
}

window.addEventListener("error", (ev) => {
  console.error("Erro não tratado:", ev.error || ev.message);
  if (document.getElementById("appRoot")?.hidden !== false) {
    showLoginError("Erro ao carregar o sistema. Recarregue a página (Ctrl+F5).");
    hideAppLoader();
  }
});

window.__demandasFinishLoginFull = handleAuthUser;
window.__demandasApplyUserHome = applyUserHomeOnLogin;
if (window.__demandasAuthUserPending) {
  const pending = window.__demandasAuthUserPending;
  delete window.__demandasAuthUserPending;
  void handleAuthUser(pending);
}

bindMotivosAtrasoUi();
bindLoginUi();

try {
  initAuthGate();
} catch (e) {
  console.error("Falha ao iniciar:", e);
  showLoginError(e.message || "Erro ao iniciar o sistema. Recarregue com Ctrl+F5.");
  hideAppLoader();
}
