/**
 * Configuração das esteiras, etapas, projetistas, produtos, regionais e cidades.
 * Só declarações (funções e constantes); o que roda ao abrir a página fica em app.js.
 */
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

/** Modo de seleção da esteira (ações em lote). */
const selecaoEsteira = { ativa: false, ids: new Set() };

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

function isTempoStatusExcluded(status) {
  return TEMPO_STATUS_EXCLUIDOS.has(status);
}

function setorForStatus(status) {
  return STATUS_SETOR[status] || null;
}

/** B2B: pausado e Aprovação BP (stand-by externo) não entram no tempo por setor / SLA. */
const TEMPO_STATUS_EXCLUIDOS_B2B = new Set(["pausado", "aprovacao_bp"]);

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

function setorColorFor(setor, cfg = DASH_TEMPO_CFG_OP) {
  return (cfg.setorColors || SETOR_COLORS)[setor] || SETOR_COLORS.Outros;
}

const TEMPO_CHART_IDS = ["chartTempoFase", "chartTempoSetor", "chartTempoSetorStack"];
const TEMPO_RESUMO_SETOR_CHART_ID = "chartTempoSetorResumo";
const TEMPO_CHART_IDS_B2B = ["chartTempoB2bFase", "chartTempoB2bSetor", "chartTempoB2bSetorStack"];
const TEMPO_RESUMO_SETOR_CHART_ID_B2B = "chartTempoB2bSetorResumo";

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
      (ind.parados ? `<span class="column__ind column__ind--coluna" title="${ind.parados} acima da meta de ${metaDiasEtapa(status, linha)} dia(s) nesta etapa">${ind.parados} parado${ind.parados > 1 ? "s" : ""}</span>` : "");
  }
  const meta = metaDiasEtapa(status, linha);
  const metaHtml = meta != null
    ? `<span class="column__meta" title="Meta: até ${meta} dia(s) nesta etapa">⏱ ${meta}d</span>`
    : "";
  return (
    `<div class="column__head">` +
    `<div class="column__head-top"><div class="column__title" title="${title}">${title}</div>` +
    `<span class="column__count${count ? "" : " is-zero"}" title="${count} projeto(s)">${count}</span></div>` +
    `<div class="column__head-meta">${setorHtml}${metaHtml}</div>` +
    // Linha própria para os avisos (sempre presente): o CSS reserva a mesma altura em todas as colunas.
    `<div class="column__inds">${indHtml}</div>` +
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
const PROJETISTA_PADRAO = "Vinicius";
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

function normalizeProdutoB2b(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  return PRODUTOS_B2B.includes(s) ? s : "";
}

/** Setor e solicitantes comerciais B2B (ordem alfabética pt-BR). */
const SETORES_SOLICITANTE_B2B = ["Comercial"];
const SOLICITANTE_B2B_SEM = "Sem solicitante";
const SOLICITANTE_B2B_OUTROS = "Outros";

function normalizeSetorSolicitanteB2b(v) {
  const s = String(v || "").trim();
  if (!s) return SETORES_SOLICITANTE_B2B[0];
  return SETORES_SOLICITANTE_B2B.includes(s) ? s : SETORES_SOLICITANTE_B2B[0];
}

/** Nome do solicitante comercial cadastrado na demanda, ou null. */
function resolveSolicitanteB2bComercial(d) {
  const sol = String(migrateDemanda(d).solicitante || "").trim();
  if (!sol) return null;
  return SOLICITANTES_B2B_COMERCIAL.find((n) => n.toLowerCase() === sol.toLowerCase()) || null;
}

function normalizeSegmentoB2c(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  return SEGMENTOS_B2C.includes(s) ? s : "";
}

/**
 * Projetos B2C do segmento TCT: o alívio foi planejado ou não?
 * Para trocar o nome do campo na tela, mude só `rotulo` (e os textos das opções, se quiser);
 * o valor guardado no projeto (planejamentoTct = "planejado" | "nao_planejado") continua o mesmo.
 */
const PLANEJAMENTO_TCT = {
  rotulo: "Planejamento do alívio",
  opcoes: { planejado: "Planejado", nao_planejado: "Não planejado" },
};

/**
 * Segmentos B2C do projeto. Uma expansão pode envolver mais de um (ex.: TCR e TCT):
 * `segmentosB2c` guarda todos (na ordem de SEGMENTOS_B2C) e `segmentoB2c` continua sendo o primeiro,
 * para o que só olha um segmento. Projeto antigo, sem a lista, usa o `segmentoB2c`.
 */
function demandaSegmentosB2c(d) {
  if (normalizeTipo(d?.tipo) !== "B2C") return [];
  const lista = Array.isArray(d?.segmentosB2c) && d.segmentosB2c.length ? d.segmentosB2c : [d?.segmentoB2c];
  const set = new Set(lista.map(normalizeSegmentoB2c).filter(Boolean));
  return SEGMENTOS_B2C.filter((s) => set.has(s));
}

/**
 * Divisão entre segmentos, separada para o VALOR e para as PORTAS (podem ser diferentes: 70% das portas no TCR
 * e só metade do custo, por exemplo). Guardada como { valor: { TCR: 50, TCT: 50 }, portas: { TCR: 70, TCT: 30 } }.
 * A metragem de cabo segue a divisão do valor. Formato antigo ({ TCR: 60, TCT: 40 }) vale para os dois.
 */
const DIVISAO_SEGMENTOS_TIPOS = ["valor", "portas"];

function divisaoSegmentosBruta(div, tipo) {
  if (!div || typeof div !== "object") return {};
  if (div.valor || div.portas) return div[tipo] && typeof div[tipo] === "object" ? div[tipo] : {};
  return div;
}

/** Frações (somam 1) de cada segmento para `tipo` ("valor" ou "portas"). Sem divisão válida: partes iguais. */
function demandaDivisaoSegmentos(d, tipo = "valor") {
  const segs = demandaSegmentosB2c(d);
  if (segs.length <= 1) return Object.fromEntries(segs.map((s) => [s, 1]));
  const div = divisaoSegmentosBruta(d?.divisaoSegmentosB2c, tipo);
  const pcts = segs.map((s) => Number(div[s]));
  const soma = pcts.reduce((t, n) => t + (Number.isFinite(n) && n >= 0 ? n : NaN), 0);
  if (!Number.isFinite(soma) || Math.abs(soma - 100) > 0.5) return Object.fromEntries(segs.map((s) => [s, 1 / segs.length]));
  return Object.fromEntries(segs.map((s, i) => [s, pcts[i] / soma]));
}

function demandaFracaoSegmento(d, seg, tipo = "valor") {
  return demandaDivisaoSegmentos(d, tipo)[seg] || 0;
}

/** Divisão normalizada para guardar ({ valor, portas } com % por segmento), só quando há mais de um segmento. */
function normalizeDivisaoSegmentosB2c(segs, div) {
  if (!Array.isArray(segs) || segs.length <= 1) return null;
  const out = {};
  for (const tipo of DIVISAO_SEGMENTOS_TIPOS) {
    const bruta = divisaoSegmentosBruta(div, tipo);
    out[tipo] = {};
    for (const s of segs) {
      const n = Number(bruta[s]);
      out[tipo][s] = Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : 0;
    }
  }
  return out;
}

function pctTexto(fracao) {
  return `${String(Math.round(fracao * 1000) / 10).replace(".", ",")}%`;
}

/** «TCR 60% + TCT 40%» (mesma divisão) ou «TCR (valor 50% · portas 70%) + TCT (…)»; com um segmento, só «TCT». */
function segmentosB2cTexto(d, { comPct = true } = {}) {
  const segs = demandaSegmentosB2c(d);
  if (segs.length <= 1 || !comPct) return segs.join(" + ");
  const dv = demandaDivisaoSegmentos(d, "valor");
  const dp = demandaDivisaoSegmentos(d, "portas");
  const iguais = segs.every((s) => Math.abs(dv[s] - dp[s]) < 0.0005);
  return segs.map((s) => (iguais ? `${s} ${pctTexto(dv[s])}` : `${s} (valor ${pctTexto(dv[s])} · portas ${pctTexto(dp[s])})`)).join(" + ");
}

/** O projeto é B2C e envolve TCT (o único segmento que tem o campo de planejamento)? */
function demandaEhTct(d) {
  return demandaSegmentosB2c(d).includes("TCT");
}

function normalizePlanejamentoTct(v) {
  const s = String(v || "").trim();
  return Object.hasOwn(PLANEJAMENTO_TCT.opcoes, s) ? s : "";
}

function planejamentoTctLabel(v) {
  return PLANEJAMENTO_TCT.opcoes[normalizePlanejamentoTct(v)] || "";
}

/** Etiqueta do planejamento (card e ficha). Vazio: nada no card; «Não informado» na ficha (semValor). */
function planejamentoTctBadgeHtml(v, { semValor = false } = {}) {
  const valor = normalizePlanejamentoTct(v);
  const titulo = escapeHtml(PLANEJAMENTO_TCT.rotulo);
  if (!valor) {
    return semValor ? `<span class="badge badge--plan-tct badge--plan-tct-vazio" title="${titulo}">${titulo}: não informado</span>` : "";
  }
  const cls = valor === "planejado" ? "badge--plan-tct-sim" : "badge--plan-tct-nao";
  return `<span class="badge badge--plan-tct ${cls}" title="${titulo}">${escapeHtml(planejamentoTctLabel(valor))}</span>`;
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

/* ---------- Liberação por bairros ---------- */
/**
 * Projeto liberado aos poucos: cada bairro tem portas novas, CTOs, valor e a própria situação.
 * Quando o projeto usa bairros, a soma das portas dos bairros é o número oficial de portas novas.
 */
const BAIRRO_SITUACOES = [
  ["pendente", "Pendente"],
  ["execucao", "Em execução"],
  ["liberado", "Liberado"],
];
const BAIRRO_SITUACAO_LABEL = Object.fromEntries(BAIRRO_SITUACOES);

function bairroInt(v) {
  if (v === "" || v == null) return "";
  const n = Math.round(Number(String(v).replace(/\./g, "").replace(",", ".")));
  return Number.isFinite(n) && n >= 0 ? n : "";
}

function normalizeBairro(b) {
  if (!b || typeof b !== "object") return null;
  const nome = String(b.nome || "").trim();
  const situacao = BAIRRO_SITUACAO_LABEL[b.situacao] ? b.situacao : "pendente";
  const valor = typeof parseCustoMoney === "function" ? parseCustoMoney(b.valor) : Number(b.valor) || "";
  const out = {
    id: String(b.id || uid()),
    nome,
    portas: bairroInt(b.portas),
    ctos: bairroInt(b.ctos),
    valor: valor === "" || valor == null || !Number.isFinite(Number(valor)) ? "" : Number(valor),
    situacao,
    inicio: isoDatePart(b.inicio || "") || "",
    previsao: isoDatePart(b.previsao || "") || "",
    liberadoEm: situacao === "liberado" ? isoDatePart(b.liberadoEm || "") || "" : "",
    liberadoPor: situacao === "liberado" ? String(b.liberadoPor || "").trim() : "",
    obs: String(b.obs || "").trim(),
  };
  return out;
}

function normalizeBairros(list) {
  if (!Array.isArray(list)) return [];
  return list.map(normalizeBairro).filter(Boolean);
}

/** Como os bairros são entregues: "junto" (todos de uma vez) ou "separado" (cada um no seu tempo). */
function normalizeBairrosModo(v) {
  return v === "junto" ? "junto" : "separado";
}

function demandaUsaBairros(d) {
  return d?.liberacaoPorBairros === true;
}

/** Totais de uma lista de bairros (portas e % de avanço pelas portas; sem portas, pela quantidade). */
function bairrosResumo(lista) {
  const bairros = normalizeBairros(lista);
  const num = (v) => (v === "" || v == null ? 0 : Number(v) || 0);
  const r = {
    n: bairros.length,
    liberados: 0,
    emExecucao: 0,
    portas: 0,
    portasLib: 0,
    ctos: 0,
    ctosLib: 0,
    valor: 0,
    valorLib: 0,
    temValor: false,
    ultimaLiberacao: "",
    proximaPrevisao: "",
  };
  for (const b of bairros) {
    const lib = b.situacao === "liberado";
    r.portas += num(b.portas);
    r.ctos += num(b.ctos);
    r.valor += num(b.valor);
    if (b.valor !== "") r.temValor = true;
    if (lib) {
      r.liberados += 1;
      r.portasLib += num(b.portas);
      r.ctosLib += num(b.ctos);
      r.valorLib += num(b.valor);
      if (b.liberadoEm > r.ultimaLiberacao) r.ultimaLiberacao = b.liberadoEm;
    } else {
      if (b.situacao === "execucao") r.emExecucao += 1;
      if (b.previsao && (!r.proximaPrevisao || b.previsao < r.proximaPrevisao)) r.proximaPrevisao = b.previsao;
    }
  }
  r.todosLiberados = r.n > 0 && r.liberados === r.n;
  r.parcial = r.liberados > 0 && !r.todosLiberados;
  r.pct = r.portas > 0 ? Math.round((r.portasLib / r.portas) * 100) : r.n ? Math.round((r.liberados / r.n) * 100) : 0;
  return r;
}

/** Resumo dos bairros do projeto, ou null se ele não usa (ou ainda não tem) bairros. */
function demandaBairrosResumo(d) {
  if (!demandaUsaBairros(d)) return null;
  const r = bairrosResumo(d.bairros);
  if (!r.n) return null;
  r.modo = normalizeBairrosModo(d.bairrosModo);
  return r;
}

function bairrosSituacaoTexto(r) {
  if (!r) return "";
  if (r.modo === "junto") return r.todosLiberados ? "Liberado (todos juntos)" : r.emExecucao ? "Em execução (todos juntos)" : "Pendente (todos juntos)";
  if (r.todosLiberados) return "Liberado total";
  if (r.parcial) return "Liberação parcial";
  return r.emExecucao ? "Em execução" : "Nenhum bairro liberado";
}
