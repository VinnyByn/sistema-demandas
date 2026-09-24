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
        "Demandas em andamento. Conclusão e Reprovado ficam em <strong>Colunas → Finalizados</strong>.";
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
        "Fluxo comercial em andamento. Projeto Final fica em <strong>Colunas → Finalizados</strong>.";
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

function columnHeadHtml(status, linha, count) {
  const title = escapeHtml(labelStatus(status, linha));
  const setor = setorForStatusDemanda(status, linha);
  const setorHtml = setor ? `<span class="column__setor">${setorBadgeHtml(setor)}</span>` : "";
  return (
    `<div class="column__head">` +
    `<div class="column__title" title="${title}">${title}</div>` +
    `<div class="column__head-meta">${setorHtml}<span class="column__count">${count}</span></div>` +
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

/** Nomes exibíveis a partir dos e-mails com papel projetista/admin (homônimos → nome completo). */
function projetistaEmailRowsFromRoles({ includeDisabled = false } = {}) {
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
  return sortProjetistasNomes([
    ...new Set([...projetistaLabelsFromRoles(), ...PROJETISTAS, ...PROJETISTAS_B2B]),
  ]);
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
    o.textContent = reg;
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
    o.textContent = reg;
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
  }
}

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
  if (activeEsteiraCanal === LINHA_ESTEIRA_B2B) {
    return { ...base, produto: selVal };
  }
  return { ...base, tipo: selVal };
}

function demandaMatchesEsteiraFilters(d, f) {
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
    document.getElementById("boardPendente"),
    document.getElementById("boardPendenteB2b"),
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
  if (panels.usuarios && !panels.usuarios.hidden) renderUsuariosPanel();
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

/** Nome exibido nos comentários — usuário logado, não o projetista da demanda. */
function getLoggedInComentarioAutor() {
  const user = typeof DemandasAuth !== "undefined" ? DemandasAuth.currentUser() : null;
  if (!user) return "Equipe";
  const name = String(user.displayName || "").trim();
  if (name) return name;
  const email = String(user.email || "").trim();
  if (!email) return "Equipe";
  const local = email.split("@")[0] || email;
  const label = local.replace(/[._-]+/g, " ").trim();
  if (!label) return email;
  return label.replace(/\b\w/g, (ch) => ch.toUpperCase());
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
  const tabUsers = document.getElementById("btnTabUsuarios");
  if (appRoot) appRoot.classList.toggle("app--readonly", info.isReadOnly || info.isBlocked);
  if (roleEl) {
    if (info.email) {
      roleEl.hidden = false;
      roleEl.textContent = info.label;
      roleEl.dataset.role = info.role;
    } else {
      roleEl.hidden = true;
    }
  }
  if (tabUsers) {
    tabUsers.hidden = !info.isAdmin;
    if (!info.isAdmin && panels.usuarios && !panels.usuarios.hidden) {
      switchMainTab("esteira");
    }
  }
  // Evita recriar selects e painel de usuários a cada sync da esteira.
  if (!opts.light) {
    refreshProjetistaAssignmentLists();
    if (info.isAdmin && panels.usuarios && !panels.usuarios.hidden) renderUsuariosPanel();
  }
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
    label: "Checklist",
    format: (v) => {
      const items = normalizeChecklist(v);
      if (!items.length) return "—";
      const d = items.filter((it) => it.done).length;
      return `${d}/${items.length} etapa(s)`;
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
    if (x[i].who !== y[i].who) return false;
    if (x[i].dateInicio !== y[i].dateInicio) return false;
    if (x[i].date !== y[i].date) return false;
    if (x[i].done !== y[i].done) return false;
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

function normalizeChecklistItem(it) {
  if (!it || typeof it !== "object") return null;
  const name = String(it.name || it.etapa || "").trim();
  if (!name) return null;
  return {
    id: it.id || uid(),
    name,
    who: String(it.who || it.responsavel || "").trim(),
    dateInicio: String(it.dateInicio || it.inicio || "").trim(),
    date: String(it.date || it.dateFim || "").trim(),
    done: it.done === true,
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
  usuarios: document.getElementById("panelUsuarios"),
};

function switchMainTab(tab) {
  if (tab === "diarias" || tab === "projetistas") tab = "esteira";
  if (tab === "usuarios" && !isAdminUser()) {
    toast("Apenas administrador acessa Usuarios");
    tab = "esteira";
  }
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
  if (tab === "usuarios") renderUsuariosPanel();
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

function filteredDemandasForEsteira(linha = activeEsteiraCanal) {
  const f = readEsteiraFilters();
  const tombstones = demandaDeleteTombstones();
  return state.demandas
    .filter((d) => !tombstones.has(d.id))
    .map(migrateDemanda)
    .filter((d) => inferLinhaEsteira(d) === normalizeLinhaEsteira(linha))
    .filter((d) => demandaMatchesEsteiraFilters(d, f));
}

function demandasForBoard(boardResponsavel, linha = activeEsteiraCanal) {
  const list = filteredDemandasForEsteira(linha);
  if (boardResponsavel === BOARD_ATRIBUIDOS) {
    return list.filter((d) => normalizeResponsavel(d.responsavel) !== "");
  }
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

/** Fila sem projetista: uma única caixa; soltar aqui só remove o direcionamento (mantém o status). */
function handleInboxDrop(dem) {
  if (!requireWriteAccess()) return;
  if (!dem) return;
  if (normalizeResponsavel(dem.responsavel) === "") return;
  const now = new Date().toISOString();
  dem.responsavel = "";
  dem.updatedAt = now;
  invalidateAlertaSnoozeIfStale(dem);
  saveState({ demanda: dem });
  renderBoard();
  toast("Demanda devolvida à fila geral");
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
        meta: `Chegada: ${formatDataISO(d.dataChegada || d.createdAt?.slice(0, 10))}`,
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

function renderInboxAlertas(linha = activeEsteiraCanal) {
  const el =
    document.getElementById(linha === LINHA_ESTEIRA_B2B ? "esteiraInboxAlertasB2b" : "esteiraInboxAlertas");
  if (!el) return;
  const list = filteredDemandasForEsteira(linha);
  const rows = buildInboxAlertasRows(list, linha);

  if (!list.length) {
    el.innerHTML =
      '<div class="inbox-alertas inbox-alertas--empty">' +
      '<h4 class="inbox-alertas__title">Alertas</h4>' +
      '<p class="muted small">Nenhuma demanda nesta esteira.</p></div>';
    return;
  }

  if (!rows.length) {
    el.innerHTML =
      '<div class="inbox-alertas">' +
      '<h4 class="inbox-alertas__title">Alertas <span class="inbox-alertas__ok">Tudo ok</span></h4>' +
      `<p class="muted small">${list.length} demanda(s) — nenhum alerta no momento.</p></div>`;
    return;
  }

  const temVermelho = rows.some((r) => r.severity === "bad");
  const items = rows
    .map((r) => {
      const acao =
        r.kind === ALERTA_KIND_CLICKUP_RETORNO
          ? `<button type="button" class="inbox-alertas__adiar inbox-alertas__item--${r.severity}" data-alerta-ciente="${escapeHtml(r.d.id)}"${isReadOnlyUser() ? " hidden" : ""}>Ciente</button>`
          : `<button type="button" class="inbox-alertas__adiar inbox-alertas__item--${r.severity}" data-alerta-snooze="${escapeHtml(r.d.id)}" data-kind="${escapeHtml(r.kind)}"${isReadOnlyUser() ? " hidden" : ""}>Adiar</button>`;
      return (
        `<li class="inbox-alertas__row">` +
        `<button type="button" class="inbox-alertas__item inbox-alertas__item--${r.severity}" data-alerta-abrir="${escapeHtml(r.d.id)}">` +
        `<span class="inbox-alertas__item-titulo">${escapeHtml(r.d.titulo)}</span>` +
        `<span class="inbox-alertas__item-msg">${escapeHtml(r.msg)}</span>` +
        (r.meta ? `<span class="inbox-alertas__item-meta">${escapeHtml(r.meta)}</span>` : "") +
        `</button>` +
        acao +
        `</li>`
      );
    })
    .join("");

  el.innerHTML =
    '<div class="inbox-alertas">' +
    `<h4 class="inbox-alertas__title">Alertas <span class="inbox-alertas__count${temVermelho ? " inbox-alertas__count--bad" : ""}">${rows.length}</span></h4>` +
    '<p class="muted small">Clique no alerta para abrir. <strong>Adiar</strong> registra e silencia. <strong>Ciente</strong> tira o retorno da Operação. <strong>Vermelho</strong>: sem projetista. <strong>Laranja</strong>: mais de 6 dias na mesma coluna. <strong>Verde</strong>: retornou da Operação.</p>' +
    `<ul class="inbox-alertas__list">${items}</ul></div>`;

  el.querySelectorAll("[data-alerta-abrir]").forEach((btn) => {
    btn.addEventListener("click", () => openDemandaModal(btn.dataset.alertaAbrir));
  });
  el.querySelectorAll("[data-alerta-snooze]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const row = rows.find((r) => r.d.id === btn.dataset.alertaSnooze && r.kind === btn.dataset.kind);
      if (row) openAlertaSnoozeModal(row);
    });
  });
  el.querySelectorAll("[data-alerta-ciente]").forEach((btn) => {
    btn.addEventListener("click", () => marcarClickupRetornoCiente(btn.dataset.alertaCiente));
  });
}

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

function renderPendenteBoard(boardEl, linha = activeEsteiraCanal) {
  const cfg = getEsteiraConfig(linha);
  const list = demandasForBoard("", linha).sort(compareDemandaEsteiraOrdem);
  const moveFlags = buildCardMoveFlagsMap(list);
  const restoreScroll = preserveBoardScroll(boardEl);
  boardEl.innerHTML = "";
  const col = document.createElement("div");
  col.className = "column column--inbox";
  col.dataset.status = cfg.inboxStatus;
  col.innerHTML = columnHeadHtml(cfg.inboxStatus, linha, list.length) + `<div class="column__body"></div>`;
  const body = col.querySelector(".column__body");
  col.addEventListener("dragover", (e) => { e.preventDefault(); col.classList.add("drag-over"); });
  col.addEventListener("dragleave", () => col.classList.remove("drag-over"));
  col.addEventListener("drop", (e) => {
    e.preventDefault();
    col.classList.remove("drag-over");
    const id = e.dataTransfer.getData("text/plain");
    const dem = state.demandas.find((x) => x.id === id);
    handleInboxDrop(dem);
  });
  list.forEach((d) => {
    body.appendChild(renderCard(d, moveFlags[d.id] || { canMoveUp: false, canMoveDown: false }));
  });
  boardEl.appendChild(col);
  restoreScroll();
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
    const list = (byCol[key] || []).slice().sort(compareDemandaEsteiraOrdem);
    const moveFlags = buildCardMoveFlagsMap(list);
    col.innerHTML = columnHeadHtml(key, linha, list.length) + `<div class="column__body"></div>`;
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
  const hideInbox = esteiraModoColunas === ESTEIRA_MODO_FINALIZADOS;
  if (linha === LINHA_ESTEIRA_B2B) {
    const pendenteBlock = document.querySelector("#esteiraViewB2b .esteira-block--pendente");
    const pendente = document.getElementById("boardPendenteB2b");
    const esteira = document.getElementById("boardEsteiraB2b");
    if (pendenteBlock) pendenteBlock.hidden = hideInbox;
    if (!hideInbox && pendente) renderPendenteBoard(pendente, linha);
    if (!hideInbox) renderInboxAlertas(linha);
    else {
      const alertas = document.getElementById("esteiraInboxAlertasB2b");
      if (alertas) alertas.innerHTML = "";
    }
    if (esteira) renderBoardInto(esteira, BOARD_ATRIBUIDOS, linha);
  } else {
    const pendenteBlock = document.querySelector("#esteiraViewOperacional .esteira-block--pendente");
    const pendente = document.getElementById("boardPendente");
    const esteira = document.getElementById("boardEsteira");
    if (pendenteBlock) pendenteBlock.hidden = hideInbox;
    if (!hideInbox && pendente) renderPendenteBoard(pendente, linha);
    if (!hideInbox) renderInboxAlertas(linha);
    else {
      const alertas = document.getElementById("esteiraInboxAlertas");
      if (alertas) alertas.innerHTML = "";
    }
    if (esteira) renderBoardInto(esteira, BOARD_ATRIBUIDOS, linha);
  }
  updateEsteiraStatusLine();
}

function setEsteiraTabMenuOpen(open) {
  setDropdownMenuOpen("esteiraTabPanel", "btnTabEsteira", open);
}

function updateEsteiraTabLabel() {
  const el = document.getElementById("esteiraTabLabel");
  if (!el) return;
  el.textContent = activeEsteiraCanal === LINHA_ESTEIRA_B2B ? "· B2B" : "· Projetos";
  document.querySelectorAll("[data-esteira-linha]").forEach((item) => {
    item.classList.toggle("is-active", item.dataset.esteiraLinha === activeEsteiraCanal);
  });
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

function renderCard(d, { canMoveUp = false, canMoveDown = false } = {}) {
  const el = document.createElement("article");
  const dmCard = migrateDemanda(d);
  el.className =
    "card " +
    tipoCardClass(d.tipo) +
    (dmCard.linhaEsteira === LINHA_ESTEIRA_B2B ? " card--b2b" : " card--esteira-projetos");
  if (isAtraso(d)) el.classList.add("card--atraso");
  if (d.status === "pausado") el.classList.add("card--pausado");
  if (d.status === "reprovado") el.classList.add("card--reprovado");
  if (normalizeEditingBy(d.editingBy)) {
    el.classList.add("card--being-edited");
  }
  el.draggable = !isReadOnlyUser();
  el.dataset.id = d.id;
  if (isReadOnlyUser()) el.classList.add("card--readonly");
  el.addEventListener("dragstart", (e) => {
    const from = e.target instanceof Element ? e.target : e.target?.parentElement;
    if (isReadOnlyUser()) {
      e.preventDefault();
      return;
    }
    if (from?.closest(".card__prio")) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData("text/plain", d.id);
    e.dataTransfer.effectAllowed = "move";
  });
  el.addEventListener("click", (e) => {
    const from = e.target instanceof Element ? e.target : e.target?.parentElement;
    if (from?.closest(".card__prio")) return;
    openDemandaModal(d.id);
  });

  const atr = isAtraso(d) ? `<span class="badge badge--atr">Atraso</span>` : "";
  const st = d.status || "novo";
  const statusBadge = `<span class="badge ${statusBadgeClass(st)}">${escapeHtml(labelStatus(st, dmCard.linhaEsteira))}</span>`;
  const statusTxt = (d.statusAtual || "").trim();
  const statusTxtHtml = statusTxt
    ? `<p class="card__status-atual">${escapeHtml(statusTxt)}</p>`
    : "";
  const diasAtraso = demandaDiasAtraso(d);
  const atrasoHtml =
    isAtraso(d) && diasAtraso > 0
      ? `<div class="card__atraso"><p class="card__atraso-dias"><strong>Atraso:</strong> ${escapeHtml(formatDiasAtrasoLabel(diasAtraso))}</p></div>`
      : "";
  const diasAberto = demandaDiasAberto(d);
  const diasAbertoTitle = isStatusConcluidoDemanda(dmCard)
    ? "Dias aberto até a conclusão"
    : dmCard.status === "reprovado"
      ? "Dias aberto até a reprovação"
      : "Dias desde a chegada — atualiza diariamente";
  const diasAbertoHtml =
    demandaInicioContagemAberto(dmCard)
      ? `<p class="card__dias-aberto" title="${diasAbertoTitle}"><strong>Aberto:</strong> ${escapeHtml(formatDiasAbertoLabel(diasAberto))}</p>`
      : "";
  const editingHtml = cardEditingByHtml(d);
  const respNomes = demandaProjetistasList(d);
  const respAtrib = respNomes.length
    ? `<span title="${escapeHtml(respNomes.join(" · "))}">${escapeHtml(respNomes.join(" · "))}</span>`
    : `<span class="badge badge--pend">${escapeHtml(labelProjetista(d.responsavel))}</span>`;
  const tipo = normalizeTipo(d.tipo);
  const produtoHtml =
    tipo === "B2B" && dmCard.produtoB2b
      ? `<span class="badge badge--produto-b2b">${escapeHtml(dmCard.produtoB2b)}</span>`
      : "";
  const segmentoHtml =
    tipo === "B2C" && dmCard.segmentoB2c
      ? `<span class="badge badge--segmento-b2c">${escapeHtml(dmCard.segmentoB2c)}</span>`
      : "";
  const prioHtml = isReadOnlyUser()
    ? ""
    : `<div class="card__prio" title="Ajuste fino na coluna (mesma data de chegada)">` +
      `<button type="button" class="card-prio-btn" data-dir="-1" aria-label="Subir na coluna"${canMoveUp ? "" : " disabled"}>▲</button>` +
      `<button type="button" class="card-prio-btn" data-dir="1" aria-label="Descer na coluna"${canMoveDown ? "" : " disabled"}>▼</button>` +
      `</div>`;
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
  el.innerHTML = `
    ${prioHtml}
    <h3 class="card__title"></h3>
    ${editingHtml}
    ${statusTxtHtml}
    ${diasAbertoHtml}
    ${atrasoHtml}
    ${colunaAlertaHtml}
    ${checklistCardHtml(dmCard)}
    <div class="card__meta">
      <span class="badge ${tipoBadgeClass(tipo)}">${escapeHtml(tipo)}</span>
      ${produtoHtml}
      ${segmentoHtml}
      ${statusBadge}
      ${respAtrib}
      ${demandaCidadesList(d).length ? `<span title="${escapeHtml(formatCidadesDemanda(d))}">${escapeHtml(formatCidadesDemanda(d))}</span>` : ""}
      ${d.solicitante ? `<span>${escapeHtml(d.solicitante)}</span>` : ""}
      ${atr}
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
  return el;
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

function checklistCardHtml(dm) {
  const items = normalizeChecklist(dm?.checklist);
  const n = items.length;
  const d = items.filter((it) => it.done).length;
  const dots = items
    .map((it) => `<span class="card__checklist-dot${it.done ? " is-on" : ""}"></span>`)
    .join("");
  return (
    `<div class="card__checklist" title="Checklist ${d} de ${n}">` +
    `<span class="card__checklist-frac">${d}/${n}</span>` +
    `<span class="card__checklist-dots">${dots}</span>` +
    `</div>`
  );
}

function checklistNextLabel(items) {
  const pending = items.find((it) => !it.done);
  if (!items.length) return "Nenhuma etapa ainda";
  return pending ? `Próximo: ${pending.name}` : "Checklist completo";
}

function renderChecklistDots(el, items) {
  if (!el) return;
  el.innerHTML = items
    .map((it) => `<span class="card__checklist-dot${it.done ? " is-on" : ""}"></span>`)
    .join("");
}

function renderChecklistEditor() {
  const items = normalizeChecklist(editingChecklist);
  const n = items.length;
  const d = items.filter((it) => it.done).length;
  const frac = document.getElementById("demChecklistFrac");
  const next = document.getElementById("demChecklistNext");
  const list = document.getElementById("demChecklistList");
  if (frac) frac.textContent = `${d}/${n}`;
  if (next) next.textContent = checklistNextLabel(items);
  renderChecklistDots(document.getElementById("demChecklistDots"), items);
  if (!list) return;
  const readOnly = isReadOnlyUser();
  list.innerHTML = "";
  items.forEach((it) => {
    const li = document.createElement("li");
    li.className = "checklist-item" + (it.done ? "" : " is-off");
    const box = document.createElement("label");
    box.className = "checklist-check";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = it.done;
    cb.disabled = readOnly;
    cb.setAttribute("aria-label", it.name);
    cb.addEventListener("change", () => {
      const done = cb.checked;
      editingChecklist = normalizeChecklist(editingChecklist).map((row) =>
        row.id === it.id ? { ...row, done } : row,
      );
      renderChecklistEditor();
    });
    const mark = document.createElement("i");
    mark.setAttribute("aria-hidden", "true");
    box.append(cb, mark);
    const name = document.createElement("span");
    name.className = "checklist-item__name";
    name.textContent = it.name;
    const meta = document.createElement("span");
    meta.className = "checklist-item__meta";
    const who = document.createElement("span");
    who.className = "checklist-item__who";
    who.textContent = it.who || "—";
    const start = document.createElement("time");
    start.dateTime = it.dateInicio || "";
    start.textContent = it.dateInicio ? `Início ${formatDataCurta(it.dateInicio)}` : "Início —";
    const when = document.createElement("time");
    when.dateTime = it.date || "";
    when.textContent = it.date ? `Término ${formatDataCurta(it.date)}` : "Término —";
    meta.append(who, start, when);
    const rm = document.createElement("button");
    rm.type = "button";
    rm.className = "checklist-item__remove";
    rm.textContent = "Remover";
    rm.disabled = readOnly;
    rm.addEventListener("click", async () => {
      if (readOnly) return;
      const ok = await confirmDialog({
        title: "Remover etapa?",
        message: `A etapa “${it.name}” será removida do checklist.`,
        confirmText: "Remover",
        cancelText: "Voltar",
        variant: "danger",
      });
      if (!ok) return;
      editingChecklist = editingChecklist.filter((x) => x.id !== it.id);
      renderChecklistEditor();
    });
    li.append(box, name, meta, rm);
    list.appendChild(li);
  });
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

function setChecklistGanttOpen(open) {
  const btn = document.getElementById("btnChecklistGantt");
  const panel = document.getElementById("demChecklistGantt");
  if (btn) {
    btn.setAttribute("aria-expanded", String(open));
    btn.textContent = open ? "Fechar cronograma" : "Abrir cronograma";
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
    empty.textContent = "Adicione etapas com início e término para ver o cronograma.";
    host.appendChild(empty);
    return;
  }
  const days = checklistGanttDays(range.start, range.end);
  if (!days.length) {
    const empty = document.createElement("p");
    empty.className = "muted small checklist-gantt__empty";
    empty.textContent = "Adicione etapas com início e término para ver o cronograma.";
    host.appendChild(empty);
    return;
  }
  const compact = days.length > GANTT_WEEK_AFTER_DAYS;
  const colPx = compact ? GANTT_COL_COMPACT_PX : GANTT_COL_DAY_PX;
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
  inner.setAttribute("aria-label", "Cronograma das etapas do checklist");

  const head = document.createElement("div");
  head.className = "checklist-gantt__head";
  const headLabel = document.createElement("div");
  headLabel.className = "checklist-gantt__label";
  headLabel.textContent = "Etapa";
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
  }
  head.append(headLabel, axis);

  const body = document.createElement("div");
  body.className = "checklist-gantt__body";
  items.forEach((it) => {
    const row = document.createElement("div");
    row.className = "checklist-gantt__row" + (it.done ? " is-done" : " is-off");
    const label = document.createElement("div");
    label.className = "checklist-gantt__label";
    const name = document.createElement("strong");
    name.textContent = it.name || "Etapa";
    const who = document.createElement("span");
    who.textContent = it.who || "—";
    label.append(name, who);
    const track = document.createElement("div");
    track.className = "checklist-gantt__track";
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
    if (start && end) {
      const i0 = days.indexOf(start);
      const i1 = days.indexOf(end);
      if (i0 >= 0 && i1 >= 0) {
        const bar = document.createElement("div");
        bar.className = "checklist-gantt__bar" + (it.done ? " is-done" : "");
        bar.style.left = `${(i0 / days.length) * 100}%`;
        bar.style.width = `${((i1 - i0 + 1) / days.length) * 100}%`;
        bar.title = `${it.name} · Início ${formatDataCurta(start)} · Término ${formatDataCurta(end)}`;
        track.appendChild(bar);
      }
    } else if (end || start) {
      const pin = end || start;
      const idx = days.indexOf(pin);
      if (idx >= 0) {
        const mark = document.createElement("div");
        mark.className = "checklist-gantt__mark" + (it.done ? " is-done" : "");
        mark.style.left = `${((idx + 0.5) / days.length) * 100}%`;
        mark.title = `${it.name} · ${end ? "Término" : "Início"} ${formatDataCurta(pin)}`;
        track.appendChild(mark);
      }
    }
    row.append(label, track);
    body.appendChild(row);
  });

  inner.append(head, body);
  scroll.appendChild(inner);
  host.appendChild(scroll);
}

function addChecklistEtapaFromForm() {
  if (!requireWriteAccess()) return;
  const name = (document.getElementById("demChecklistEtapa")?.value || "").trim();
  const who = (document.getElementById("demChecklistWho")?.value || "").trim();
  const dateInicio = (document.getElementById("demChecklistDateInicio")?.value || "").trim();
  const date = (document.getElementById("demChecklistDate")?.value || "").trim();
  if (!name || !who || !dateInicio || !date) {
    toast("Preencha etapa, responsável, previsão de início e término.");
    return;
  }
  if (dateInicio > date) {
    toast("A previsão de início deve ser anterior ou igual ao término.");
    document.getElementById("demChecklistDateInicio")?.focus();
    return;
  }
  editingChecklist = [
    ...normalizeChecklist(editingChecklist),
    { id: uid(), name, who, dateInicio, date, done: true },
  ];
  const etapa = document.getElementById("demChecklistEtapa");
  const resp = document.getElementById("demChecklistWho");
  if (etapa) etapa.value = "";
  if (resp) resp.value = "";
  renderChecklistEditor();
}

function bindChecklistEditor() {
  const expand = document.getElementById("btnChecklistExpand");
  const details = document.getElementById("demChecklistDetails");
  expand?.addEventListener("click", () => {
    const open = expand.getAttribute("aria-expanded") === "true";
    const next = !open;
    expand.setAttribute("aria-expanded", String(next));
    expand.textContent = next ? "Recolher detalhes" : "Expandir detalhes";
    if (details) details.hidden = !next;
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
  const dateStartEl = document.getElementById("demChecklistDateInicio");
  if (dateStartEl && !dateStartEl.value) dateStartEl.value = todayISODate();
  const dateEl = document.getElementById("demChecklistDate");
  if (dateEl && !dateEl.value) dateEl.value = todayISODate();
}

function renderComentariosList() {
  const list = document.getElementById("demComentariosList");
  if (!list) return;
  if (!editingComentarios.length) {
    list.innerHTML = '<p class="comments-empty">Nenhum comentario ainda.</p>';
    return;
  }
  const groups = groupComentariosPorDia(editingComentarios);
  list.innerHTML = groups
    .map((g) => '<div class="comments-day-label">' + escapeHtml(g.label) + "</div>" + g.items.map((c) =>
        '<article class="comment-row">' +
        '<div class="comment-avatar ' + comentarioAvatarClass(c.autor) + '" aria-hidden="true">' + escapeHtml(comentarioIniciais(c.autor)) + "</div>" +
        '<div class="comment-body"><div class="comment-head"><strong>' + escapeHtml(c.autor) + '</strong><span class="comment-time">' +
        escapeHtml(formatComentarioRelativo(c.createdAt)) + '</span></div><p class="comment-text">' + escapeHtml(c.texto) +
        '</p></div><button type="button" class="comment-del" data-cid="' + escapeHtml(c.id) +
        '" title="Excluir" aria-label="Excluir">×</button></article>'
      ).join(""))
    .join("");
  list.querySelectorAll(".comment-del").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cid = btn.dataset.cid;
      editingComentarios = editingComentarios.filter((x) => x.id !== cid);
      persistComentariosDemandaAberta();
      renderComentariosList();
    });
  });
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
  renderComentariosList();
}

function setDemandaFormReadOnly(readOnly) {
  const form = document.getElementById("formDemanda");
  const modal = document.getElementById("modalDemanda");
  if (modal) modal.classList.toggle("demanda-modal--readonly", !!readOnly);
  if (form) {
    form.querySelectorAll("input, select, textarea, button").forEach((el) => {
        if (el.id === "modalDemandaClose" || el.id === "btnFecharDemanda" || el.id === "btnEnviarClickup" || el.id === "btnCancelarClickup" || el.id === "btnDemClickupCiente" || el.id === "btnChecklistExpand") return;
      if (el.closest(".comments-panel__toggle")) return;
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
  if (btnExcluirDem) btnExcluirDem.textContent = d?.id ? "Excluir" : "Descartar";
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
  const expandBtn = document.getElementById("btnChecklistExpand");
  const details = document.getElementById("demChecklistDetails");
  if (expandBtn) {
    expandBtn.setAttribute("aria-expanded", "false");
    expandBtn.textContent = "Expandir detalhes";
  }
  if (details) details.hidden = true;
  setChecklistGanttOpen(false);
  const dateStartEl = document.getElementById("demChecklistDateInicio");
  if (dateStartEl) dateStartEl.value = todayISODate();
  const dateEl = document.getElementById("demChecklistDate");
  if (dateEl) dateEl.value = todayISODate();
  const etapaEl = document.getElementById("demChecklistEtapa");
  const whoEl = document.getElementById("demChecklistWho");
  if (etapaEl) etapaEl.value = "";
  if (whoEl) whoEl.value = "";
  renderChecklistEditor();
  const comentarioNovo = document.getElementById("demComentarioNovo");
  if (comentarioNovo) comentarioNovo.value = "";
  renderComentariosList();
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
  renderCidadesExtraList();
  renderProjetistasExtraList();
  syncDemClickupUi();
  const scrollSnap = snapshotPageScroll();
  setDemandaModalScrollLock(true);
  modalDemanda.showModal();
  restorePageScroll(scrollSnap);
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
      btn.title = onlyOne ? "Deve restar pelo menos uma fase" : "Excluir esta fase do histórico";
    }
  });
}

function refreshTimelineMoveButtons() {
  const rows = Array.from(document.querySelectorAll("#demTimelineTable tbody tr"));
  rows.forEach((tr, idx) => {
    const btnUp = tr.querySelector(".timeline-move-up");
    const btnDown = tr.querySelector(".timeline-move-down");
    if (btnUp) {
      btnUp.disabled = idx === 0;
      btnUp.title = idx === 0 ? "Primeira fase" : "Mover fase para cima";
    }
    if (btnDown) {
      btnDown.disabled = idx === rows.length - 1;
      btnDown.title = idx === rows.length - 1 ? "Última fase" : "Mover fase para baixo";
    }
  });
}

function swapTimelineRowUp(tr) {
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
    tr.innerHTML = `
      <td class="timeline-table__fase"><strong>${escapeHtml(labelStatus(seg.status, linha))}</strong></td>
      <td class="timeline-table__setor">${timelineSetorHtml(seg.status, linha)}</td>
      <td class="timeline-table__date"></td>
      <td class="timeline-table__date"></td>
      <td class="timeline-dur">${formatDur(timelineSegmentMs(seg))}</td>
      <td class="timeline-table__obs"></td>
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

    const actionsCell = tr.querySelector(".timeline-table__actions");

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
  });
  refreshTimelineDeleteButtons();
  refreshTimelineMoveButtons();
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

function renderPdfLevantamentoPreview() {
  const wrap = document.getElementById("demPdfPreview");
  if (!wrap) return;

  if (!editingPdfLevantamento) {
    wrap.hidden = true;
    wrap.innerHTML = "";
    return;
  }

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
document.getElementById("modalDemandaClose")?.addEventListener("click", () => closeDemandaModal());
document.getElementById("btnFecharDemanda")?.addEventListener("click", () => closeDemandaModal());
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

function kpiCard(label, value, tone, sub) {
  const subHtml = sub ? `<div class="kpi__sub">${sub}</div>` : "";
  return (
    `<div class="kpi kpi--${tone}"><div class="kpi__label">${label}</div>` +
    `<div class="kpi__value">${value}</div>${subHtml}</div>`
  );
}

function renderDashValoresFinanceirosKpis(list = demandasDashOperacionalList()) {
  const el = document.getElementById("dashValoresFinanceirosKpis");
  if (!el) return;
  const r = calcResumoIndicadoresDashboard(list);
  el.innerHTML =
    kpiCard("Valor concluído", formatBRL(r.concluido.valor), r.concluido.valor ? "ok" : "warn") +
    kpiCard(`${r.concluido.n} na Conclusão`, r.concluido.n ? String(r.concluido.n) : "—", "ok") +
    kpiCard("Valor em execução", formatBRL(r.execucao.valor), r.execucao.valor ? "ok" : "warn") +
    kpiCard(`${r.execucao.n} em execução`, r.execucao.n ? String(r.execucao.n) : "—", "ok") +
    kpiCard("Valor em aprovação", formatBRL(r.aprovacao.valor), r.aprovacao.valor ? "ok" : "warn") +
    kpiCard(`${r.aprovacao.n} em aprovação`, r.aprovacao.n ? String(r.aprovacao.n) : "—", "ok") +
    kpiCard("Valor total geral", formatBRL(r.geral.valor), r.geral.valor ? "ok" : "warn") +
    kpiCard(`${r.geral.n} projeto(s)`, r.geral.n ? String(r.geral.n) : "—", "ok");
  const hintEl = document.getElementById("dashValoresFinanceirosHint");
  if (hintEl) updateDashPeriodoHint();
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
  el.innerHTML =
    kpiCard("Total de projetos", m.totalCadastro, m.totalCadastro ? "ok" : "warn") +
    kpiCard("Projetos na Conclusão", m.n, m.n ? "ok" : "warn") +
    kpiCard("% de conclusão", formatPct(m.pctConclusao), m.pctConclusao != null ? "ok" : "warn") +
    kpiCard("Valor final (R$)", formatBRL(valor), valor ? "ok" : "warn") +
    kpiCard("Portas novas", formatQtd(portas), portas ? "ok" : "warn") +
    kpiCard("Metragem lançamento", formatMetros(metragem), metragem ? "ok" : "warn") +
    kpiCard(
      "Média de gastos / projeto",
      m.mediaGastos != null ? formatBRL(m.mediaGastos) : "—",
      m.mediaGastos != null && m.mediaGastos > 0 ? "ok" : "warn",
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
    grid: { color: "rgba(148,163,184,0.12)" },
  };
  const categoryScale = {
    ticks: categoryTicks,
    grid: horizontal ? { display: false } : { color: "rgba(148,163,184,0.12)" },
  };
  return horizontal
    ? { indexAxis: "y", scales: { x: valueScale, y: categoryScale } }
    : { scales: { x: categoryScale, y: valueScale } };
}

function makeDashChartMoneyBar(canvasId, labels, data, color = "#22c55e", options = {}) {
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
  dashCharts[canvasId] = new Chart(el, {
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
        valueTicks: { color: "#94a3b8", callback: (v) => formatBRL(v) },
        categoryTicks: { color: "#94a3b8", maxRotation: 45, minRotation: 0, font: { size: 10 } },
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
  const bg = options.colors || options.color || "#6366f1";
  dashCharts[canvasId] = new Chart(el, {
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
          color: "#94a3b8",
          stepSize: options.stepSize,
          callback: options.yFormat || ((v) => formatValue(v)),
        },
        categoryTicks: { color: "#94a3b8", font: { size: 11 } },
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
  let html = "";
  for (const tipo of tiposFiltroEsteiraProjetos()) {
    const doTipo = list.filter((d) => normalizeTipo(d.tipo) === tipo);
    const g = countDemandas(doTipo);
    const r = calcResumoIndicadoresDashboard(doTipo);
    const m = calcMediasIndicadoresGeral(doTipo, DASH_BASE_CONCLUSAO);
    const color = TIPO_CHART_COLORS[tipo] || "#94a3b8";
    const showPortas = !["SWAP", "Backbone", "Licenciamento", "Mapeamento"].includes(tipo);
    html +=
      `<div class="kpi dash-tipo-card" style="border-left-color:${color}">` +
      `<div class="kpi__label dash-tipo-card__nome"><span>${escapeHtml(tipo)}</span>` +
      `<span class="dash-tipo-card__meta">${g.total} cadastrados</span></div>` +
      `<div class="dash-pj-grid kpi-grid">` +
      kpiCard("Total de projetos", g.total, g.total ? "ok" : "warn") +
      kpiCard("Valor concluído", formatBRL(r.concluido.valor), r.concluido.valor ? "ok" : "warn") +
      kpiCard(
        `${r.concluido.n} na Conclusão`,
        r.concluido.n ? String(r.concluido.n) : "—",
        r.concluido.n ? "ok" : "warn",
      ) +
      kpiCard("Valor em execução", formatBRL(r.execucao.valor), r.execucao.valor ? "ok" : "warn") +
      kpiCard(
        `${r.execucao.n} em execução`,
        r.execucao.n ? String(r.execucao.n) : "—",
        r.execucao.n ? "ok" : "warn",
      ) +
      kpiCard("Valor em aprovação", formatBRL(r.aprovacao.valor), r.aprovacao.valor ? "ok" : "warn") +
      kpiCard(
        `${r.aprovacao.n} em aprovação`,
        r.aprovacao.n ? String(r.aprovacao.n) : "—",
        r.aprovacao.n ? "ok" : "warn",
      ) +
      (showPortas
        ? kpiCard("Portas novas (Conclusão)", formatQtd(m.portasTotal), m.portasTotal ? "ok" : "warn")
        : "") +
      kpiCard("Metragem lanç. (Conclusão)", formatMetros(m.metragemTotal), m.metragemTotal ? "ok" : "warn") +
      kpiMediasIndicadoresHtml(m, { includePortas: showPortas }) +
      `</div></div>`;
  }
  el.innerHTML = html;
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
  dashCharts[canvasId] = new Chart(el, {
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
      plugins: { legend: { display: true, labels: { color: "#cbd5e1", boxWidth: 12 } } },
      scales: {
        x: { ticks: { color: "#94a3b8", maxRotation: 45, minRotation: 0, font: { size: 10 } }, grid: { color: "rgba(148,163,184,0.12)" } },
        y: { beginAtZero: true, ticks: { color: "#94a3b8", stepSize: 1 }, grid: { color: "rgba(148,163,184,0.12)" } },
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
  const colors = (list) => colorsForGeoNomes(list.map((r) => r.nome));
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
  return colorsForGeoNomes(rows.map((r) => r.nome));
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
      body += `<td class="dash-pj-matrix__num">${fmtCell(n)}</td>`;
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
    color: "#94a3b8",
    stepSize: chartOpts.stepSize,
    callback: chartOpts.yFormat || ((v) => formatValue(v)),
  };
  const categoryTicks = {
    color: "#94a3b8",
    font: { size: 11 },
    maxRotation: horizontal ? 0 : 45,
    minRotation: 0,
  };
  const scales = horizontal
    ? {
        x: { stacked: true, beginAtZero: true, ticks: valueTicks, grid: { color: "rgba(148,163,184,0.12)" } },
        y: { stacked: true, ticks: categoryTicks, grid: { display: false } },
      }
    : {
        x: { stacked: true, ticks: categoryTicks, grid: { color: "rgba(148,163,184,0.12)" } },
        y: { stacked: true, beginAtZero: true, ticks: valueTicks, grid: { color: "rgba(148,163,184,0.12)" } },
      };
  dashCharts[canvasId] = new Chart(el, {
    type: "bar",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: horizontal ? "y" : "x",
      ...dashChartBarInteractOptions(chartOpts),
      plugins: {
        legend: { display: true, labels: { color: "#cbd5e1", boxWidth: 12, font: { size: 11 } } },
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

const PRODUTO_B2B_CHART_COLORS = {
  "Evento IP": "#a855f7",
  "IP Dedicado": "#6366f1",
  "IP Trânsito": "#818cf8",
  "Lan to Lan": "#c084fc",
  "Projeto Especial": "#e879f9",
  "Transporte PTT": "#7c3aed",
  Wireless: "#d946ef",
  [B2B_PRODUTO_SEM]: "#64748b",
};

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
      backgroundColor: PRODUTO_B2B_CHART_COLORS[prod] || "#64748b",
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

const DASH_B2B_COMERCIAL_CHART_IDS = [
  "chartB2bSolicitanteQtd",
  "chartB2bSolicitanteValor",
  "chartB2bSolicitanteCidade",
];

const SOLICITANTE_B2B_CHART_COLORS = {
  "Christopher Kurt": "#14b8a6",
  "Igor Barreto": "#6366f1",
  "Igor Raposo": "#818cf8",
  "Lorrany Rodrigues": "#a855f7",
  "Michel Dias": "#c084fc",
  "Pedro Cardoso": "#7c3aed",
  "Thiago Miranda": "#8b5cf6",
  [SOLICITANTE_B2B_OUTROS]: "#64748b",
  [SOLICITANTE_B2B_SEM]: "#475569",
};

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
  const colors = labels.map((l) => SOLICITANTE_B2B_CHART_COLORS[l] || "#94a3b8");
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

  const cityColors = ["#6366f1", "#818cf8", "#a855f7", "#c084fc", "#7c3aed", "#8b5cf6", "#22c55e", "#14b8a6", "#f59e0b", "#ef4444"];
  const datasets = cidades
    .map((cid, i) => ({
      label: truncateChartLabel(cid, 20),
      data: activeSol.map((sol) => matrix[sol][cid] || 0),
      backgroundColor: cityColors[i % cityColors.length],
      borderWidth: 0,
    }))
    .filter((ds) => ds.data.some((n) => n > 0));

  makeDashChartProjetistaStacked(
    "chartB2bSolicitanteCidade",
    activeSol.map((s) => truncateChartLabel(s, 22)),
    datasets,
    { stepSize: 1 },
  );

  scheduleDashChartsResize(["chartB2bSolicitanteCidade"]);

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

function countByProdutoB2b(list = demandasB2bDashboardList()) {
  return countByValoresLista(list, PRODUTOS_B2B, (d) => normalizeProdutoB2b(d.produtoB2b));
}

function countB2bIndicadores(list = demandasB2bDashboardList()) {
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
    valorTotal += demandaValorDashPorModo(raw, getDashValorModo());
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
  };
}

/** Gráfico de status B2B — projeto_final agrupado como Aprovados. */
function countByStatusDashboardB2b(list = demandasB2bDashboardList()) {
  const counts = new Map();
  const add = (label, n = 1) => counts.set(label, (counts.get(label) || 0) + n);
  list.forEach((d) => {
    const st = migrateDemanda(d).status;
    if (st === "projeto_final") add("Aprovados");
    else add(labelStatus(st, LINHA_ESTEIRA_B2B));
  });
  return [...counts.entries()]
    .map(([label, n]) => ({ label, n }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, "pt-BR"));
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
  dashCharts[canvasId] = new Chart(el, {
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
      plugins: { legend: { display: true, labels: { color: "#cbd5e1", boxWidth: 12 } } },
      scales: {
        x: { ticks: { color: "#94a3b8" }, grid: { color: "rgba(148,163,184,0.12)" } },
        y: { beginAtZero: true, ticks: { color: "#94a3b8", stepSize: 1 }, grid: { color: "rgba(148,163,184,0.12)" } },
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
  dashCharts[canvasId] = new Chart(el, {
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
        legend: { display: type === "doughnut", labels: { color: "#cbd5e1", boxWidth: 12 } },
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
      scales: type === "bar" ? { x: { ticks: { color: "#94a3b8" }, grid: { color: "rgba(148,163,184,0.12)" } }, y: { beginAtZero: true, ticks: { color: "#94a3b8" }, grid: { color: "rgba(148,163,184,0.12)" } } } : undefined,
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

  dashCharts[cfg.resumoChartId] = new Chart(el, {
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
          title: { display: true, text: "Média de dias", color: "#94a3b8", font: { size: 11 } },
          ticks: { color: "#94a3b8" },
          grid: { color: "rgba(148,163,184,0.12)" },
        },
        y: { ticks: { color: "#cbd5e1", font: { size: 11 } }, grid: { display: false } },
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
  dashCharts[canvasId] = new Chart(el, {
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
          title: { display: true, text: "Dias (média)", color: "#94a3b8", font: { size: 11 } },
          ticks: { color: "#94a3b8" },
          grid: { color: "rgba(148,163,184,0.12)" },
        },
        y: { ticks: { color: "#cbd5e1", font: { size: 11 } }, grid: { display: false } },
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
  dashCharts[canvasId] = new Chart(el, {
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
        legend: { position: "bottom", labels: { color: "#cbd5e1", boxWidth: 12 } },
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
  dashCharts[canvasId] = new Chart(el, {
    type: "bar",
    data: { labels: projectLabels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, labels: { color: "#cbd5e1", boxWidth: 12 } },
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
          ticks: { color: "#94a3b8", maxRotation: 45, minRotation: 0, font: { size: 10 } },
          grid: { color: "rgba(148,163,184,0.12)" },
        },
        y: {
          stacked: true,
          beginAtZero: true,
          title: { display: true, text: "Dias", color: "#94a3b8", font: { size: 11 } },
          ticks: { color: "#94a3b8" },
          grid: { color: "rgba(148,163,184,0.12)" },
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
    kpiCard("Na esteira", naEsteira.length, naEsteira.length ? "ok" : "warn") +
    kpiCard("Não atribuídas", semDirEsteira, semDirEsteira ? "warn" : "ok") +
    kpiCard("Concluídos", g.concluidas, "ok") +
    kpiCard("Pausados", g.pausadas, g.pausadas ? "warn" : "ok") +
    kpiCard("Reprovados", g.reprovadas, g.reprovadas ? "warn" : "ok") +
    kpiCard("Em atraso", g.atraso, g.atraso ? "bad" : "ok");

  renderDashValoresFinanceirosKpis(todas);
  renderKpiGeralPorTipo(todas);
  renderKpiProjetistas(demandasDashOperacionalList());

  if (isDashBlockVisible("cidades")) renderDashCidades();
  if (isDashBlockVisible("tempo")) renderDashTempoTable();
  if (isDashBlockVisible("indicadores-b2c")) renderDashIndicadoresB2c();
  if (isDashBlockVisible("indicadores-b2b")) renderDashIndicadoresB2b();
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
    kpiEl.innerHTML =
      kpiCard("Total de projetos", b.total, "ok") +
      kpiCard("Regionais", rowsRegional.length, "ok") +
      kpiCard("Cidades", rowsCidade.length, "ok") +
      kpiCard("Aguardando BP", b.aguardandoBp, b.aguardandoBp ? "warn" : "ok") +
      kpiCard("Aprovados", b.aprovados, b.aprovados ? "ok" : "warn") +
      kpiCard("Exec. Regional", b.execucaoRegional, b.execucaoRegional ? "ok" : "warn") +
      kpiCard("Exec. Terceirizada", b.execucaoTerceirizada, b.execucaoTerceirizada ? "ok" : "warn") +
      kpiCard("Pausados", b.pausados, b.pausados ? "warn" : "ok") +
      kpiCard("Concluído", b.concluido, "ok") +
      kpiCard(labelValorDashModo(), formatBRL(b.valorTotal), b.valorTotal ? "ok" : "warn");
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

  const prodData = countByProdutoB2b(listModo);
  if (prodData.length) {
    makeDashChart(
      "chartB2bProduto",
      "doughnut",
      prodData.map((s) => s.label),
      prodData.map((s) => s.n),
      { colors: prodData.map((s) => PRODUTO_B2B_CHART_COLORS[s.label] || "#a855f7") },
    );
  } else {
    dashCharts.chartB2bProduto?.destroy();
    delete dashCharts.chartB2bProduto;
  }

  const statusData = countByStatusDashboardB2b(listModo);
  if (statusData.length) {
    makeDashChart(
      "chartB2bStatus",
      "doughnut",
      statusData.map((s) => s.label),
      statusData.map((s) => s.n),
    );
  } else {
    dashCharts.chartB2bStatus?.destroy();
    delete dashCharts.chartB2bStatus;
  }

  const topCidades = rowsCidade.slice(0, 12);
  makeDashChart(
    "chartB2bProjetosCidade",
    "bar",
    topCidades.map((r) => truncateChartLabel(r.cidade, 22)),
    topCidades.map((r) => r.projetos),
    { color: "#a855f7", datasetLabel: "Projetos" },
  );

  makeDashChart(
    "chartB2bProjetosRegional",
    "bar",
    rowsRegional.map((r) => truncateChartLabel(r.cidade, 22)),
    rowsRegional.map((r) => r.projetos),
    { color: "#7c3aed", datasetLabel: "Projetos" },
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
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  downloadBlob(blob, `demandas-backup-${todayISODate()}.json`);
  toast("Exportação JSON gerada");
}

function exportStateCsvFollowUp() {
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
  const panel = document.getElementById("exportMenuPanel");
  const willOpen = panel?.hidden !== false;
  setExportMenuOpen(willOpen);
  if (willOpen) setImportMenuOpen(false);
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
  if (!importMenu?.contains(e.target)) setImportMenuOpen(false);
  if (!exportMenu?.contains(e.target)) setExportMenuOpen(false);
  if (!esteiraMenu?.contains(e.target)) setEsteiraTabMenuOpen(false);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    setImportMenuOpen(false);
    setExportMenuOpen(false);
    setEsteiraTabMenuOpen(false);
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
        ? `<span class="usuarios-row__badge usuarios-row__badge--off">Desabilitado</span>`
        : `<span class="usuarios-row__badge usuarios-row__badge--on">Ativo</span>`;
      const toggleLabel = disabled ? "Habilitar" : "Desabilitar";
      const toggleClass = disabled ? "btn--primary" : "btn--ghost";
      return (
        `<div class="usuarios-row${disabled ? " is-disabled" : ""}" data-email="${escapeHtml(email)}">` +
        `<div class="usuarios-row__main">` +
        `<span class="usuarios-row__email">${escapeHtml(email)}</span>` +
        status +
        (assigned
          ? `<span class="usuarios-row__meta muted small">${assigned} demanda${assigned > 1 ? "s" : ""} atribuída${assigned > 1 ? "s" : ""}</span>`
          : `<span class="usuarios-row__meta muted small">Sem demandas atribuídas</span>`) +
        `</div>` +
        `<select class="user-role-select" aria-label="Papel de ${escapeHtml(email)}"${disabled ? " disabled" : ""}>${roleOptionsHtml(role)}</select>` +
        `<select class="user-regional-select" aria-label="Regional de ${escapeHtml(email)}"${disabled ? " disabled" : ""}>${regionalOptionsHtml(regional)}</select>` +
        `<div class="usuarios-row__actions">` +
        `<button type="button" class="btn btn--ghost btn--sm user-role-save"${disabled ? " disabled" : ""}>Salvar</button>` +
        `<button type="button" class="btn btn--ghost btn--sm user-role-reset">Recuperar senha</button>` +
        `<button type="button" class="btn ${toggleClass} btn--sm user-role-toggle">${toggleLabel}</button>` +
        `<button type="button" class="btn btn--danger btn--sm user-role-del">Remover do sistema</button>` +
        `</div></div>`
      );
    })
    .join("");

  list.querySelectorAll(".usuarios-row").forEach((row) => {
    const email = row.dataset.email;
    row.querySelector(".user-role-save")?.addEventListener("click", () => {
      void saveUserAccess(email, {
        role: row.querySelector(".user-role-select")?.value,
        regional: row.querySelector(".user-regional-select")?.value,
      });
    });
    row.querySelector(".user-role-reset")?.addEventListener("click", () => {
      void sendUserPasswordReset(email);
    });
    row.querySelector(".user-role-toggle")?.addEventListener("click", () => {
      void toggleUserDisabled(email);
    });
    row.querySelector(".user-role-del")?.addEventListener("click", () => {
      void removeUserFromSystem(email);
    });
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

async function saveUserAccess(email, { role, regional } = {}) {
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
  const map = { ...(typeof DemandasRoles !== "undefined" ? DemandasRoles.getRolesMap() : {}) };
  map[e] = newRole;
  const regionals = {
    ...(typeof DemandasRoles !== "undefined" ? DemandasRoles.getRegionalsMap?.() || {} : {}),
  };
  if (reg) regionals[e] = reg;
  else delete regionals[e];
  if (typeof DemandasRoles !== "undefined") DemandasRoles.setRegionalsMap(regionals);
  try {
    await persistRolesMap(map);
    toast("Papel e regional salvos");
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
  }
  try {
    await persistRolesMap(map);
    clearEditingPresenceForEmail(e);
    toast("Usuário removido da lista de acessos");
  } catch (err) {
    toast(err?.message || "Falha ao remover");
  }
}

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
      delete disabled[email];
      delete purged[email];
      if (regional) regionals[email] = regional;
      else delete regionals[email];
      DemandasRoles.setDisabledMap(disabled);
      DemandasRoles.setPurgedMap(purged);
      DemandasRoles.setRegionalsMap(regionals);
    }
    await persistRolesMap(map);
    document.getElementById("userNovoEmail").value = "";
    document.getElementById("userNovoSenha").value = "";
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
        if (panels.usuarios && !panels.usuarios.hidden) renderUsuariosPanel();
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
  if (!el) return;
  const n = state.demandas.length;
  const linha = activeEsteiraCanal;
  const list = filteredDemandasForEsteira(linha);
  const filtradas = list.length;
  const finals = new Set(statusFinalizadosKeys(linha));
  const nFin = list.filter((d) => finals.has(d.status) && normalizeResponsavel(d.responsavel)).length;
  const label = linha === LINHA_ESTEIRA_B2B ? "esteira B2B" : "Esteira Projetos";
  const modo = esteiraModoColunas;
  const modoTxt =
    modo === ESTEIRA_MODO_FINALIZADOS
      ? " · modo finalizados"
      : modo === ESTEIRA_MODO_TODOS
        ? " · todas as colunas"
        : nFin
          ? ` · ${nFin} finalizada(s) ocultas`
          : " · em andamento";
  el.textContent =
    n === 0
      ? "Nenhuma demanda carregada. Verifique o badge de sync no topo ou importe/migre os dados."
      : `${filtradas} demanda(s) na ${label}${modoTxt} · ${n} no total`;
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
    applyRoleUi();
  } else {
    const syncEl = document.getElementById("syncBadge");
    if (syncEl) syncEl.hidden = true;
    showLoginScreen();
    if (emailEl) emailEl.hidden = true;
    if (roleEl) roleEl.hidden = true;
    if (btnOut) btnOut.hidden = true;
    appRoot?.classList.remove("app--readonly");
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
  document.getElementById("btnSignOut")?.addEventListener("click", async () => {
    try {
      await DemandasAuth.signOut();
      toast("Sessão encerrada");
    } catch (err) {
      toast(DemandasAuth.mapAuthError(err));
    }
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
