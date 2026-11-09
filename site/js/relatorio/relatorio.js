/**
 * Relatório: filtra os projetos por qualquer campo do sistema (esteira, regional, cidade, projetista,
 * tipo, produto, segmento, etapa, situação, prazo, solicitante, período e busca), mostra o resumo
 * agrupado e exporta para Excel (CSV) ou imprime / salva em PDF.
 * Só declarações (funções e constantes); o que roda ao abrir a página fica em app.js.
 */

const REL_ESTEIRAS = [
  ["", "Todas"],
  [LINHA_ESTEIRA_OPERACIONAL, "Projetos"],
  [LINHA_ESTEIRA_B2B, "B2B"],
];

const REL_SITUACOES = [
  ["andamento", "Em andamento"],
  ["concluido", "Concluído"],
  ["pausado", "Pausado"],
  ["reprovado", "Reprovado"],
];

const REL_PRAZOS = [
  ["", "Qualquer prazo"],
  ["atrasado", "Em atraso (em andamento)"],
  ["vencendo", "Vence em até 3 dias"],
  ["no_prazo", "Dentro do prazo"],
  ["concluido_atrasado", "Concluídos fora do prazo"],
  ["concluido_no_prazo", "Concluídos no prazo"],
  ["sem_prazo", "Sem prazo definido"],
];

const REL_CAMPOS_DATA = [
  ["chegada", "Data de chegada"],
  ["prazo", "Prazo previsto"],
  ["prazoAtual", "Prazo atualizado"],
  ["termino", "Data de término"],
  ["criacao", "Cadastro no sistema"],
  ["atualizacao", "Última alteração"],
];

const REL_AGRUPAR = [
  ["regional", "Regional"],
  ["cidade", "Cidade"],
  ["projetista", "Projetista"],
  ["etapa", "Etapa"],
  ["situacao", "Situação"],
  ["tipo", "Tipo"],
  ["esteira", "Esteira"],
  ["produto", "Produto B2B"],
  ["segmento", "Segmento B2C"],
  ["solicitante", "Solicitante"],
  ["mes", "Mês de chegada"],
  ["", "Sem agrupar"],
];

const REL_MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function relDataBr(iso) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

function relDataHoraBr(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return relDataBr(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function relMoeda(n) {
  return Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function relNumero(n, casas = 0) {
  return Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: casas });
}

function relSituacao(d) {
  if (d.status === "pausado") return "pausado";
  if (d.status === "reprovado") return "reprovado";
  if (isDemandaEncerrada(d)) return "concluido";
  return "andamento";
}

function relSituacaoLabel(d) {
  const s = relSituacao(d);
  if (s === "andamento" && isAtrasoAtivo(d)) return "Em andamento (atrasado)";
  return REL_SITUACOES.find(([k]) => k === s)?.[1] || s;
}

function relEsteiraLabel(linha) {
  return linha === LINHA_ESTEIRA_B2B ? "B2B" : "Projetos";
}

function relEtapaLabel(d) {
  return labelStatus(d.status, inferLinhaEsteira(d));
}

function relDataDoCampo(d, campo) {
  switch (campo) {
    case "prazo":
      return isoDatePart(d.dataFimPrevista);
    case "prazoAtual":
      return isoDatePart(d.dataFimAtualizada || d.dataFimPrevista);
    case "termino":
      return isoDatePart(demandaDataTermino(d));
    case "criacao":
      return isoDatePart(d.createdAt);
    case "atualizacao":
      return isoDatePart(d.updatedAt);
    default:
      return demandaDataChegadaDash(d);
  }
}

function relValorFinal(d) {
  return demandaValorFinal(d) || 0;
}

function relValorRealizado(d) {
  const v = parseCustoMoney(d.valorProjetoRealizado);
  return v === "" ? 0 : v;
}

function relResumoDescricao(d) {
  return String(d.descricao || "").split(/\n\n---\n/)[0].trim();
}

function relUltimoComentario(d) {
  const lista = Array.isArray(d.comentarios) ? d.comentarios : [];
  const ult = lista[lista.length - 1];
  if (!ult) return "";
  const quem = String(ult.autor || "").trim();
  const quando = relDataBr(isoDatePart(ult.createdAt));
  const texto = String(ult.texto || "").trim();
  return [quando, quem].filter(Boolean).join(" · ") + (texto ? ` — ${texto}` : "");
}

/** Colunas disponíveis. `num` marca as numéricas (alinhadas à direita e somadas no total). */
const REL_COLUNAS = [
  { key: "titulo", label: "Projeto", padrao: true, val: (d) => d.titulo || "" },
  { key: "esteira", label: "Esteira", padrao: true, val: (d) => relEsteiraLabel(inferLinhaEsteira(d)) },
  { key: "tipo", label: "Tipo", padrao: true, val: (d) => normalizeTipo(d.tipo) || "" },
  { key: "produto", label: "Produto B2B", val: (d) => d.produtoB2b || "" },
  { key: "segmento", label: "Segmento B2C", val: (d) => d.segmentoB2c || "" },
  { key: "etapa", label: "Etapa", padrao: true, val: relEtapaLabel },
  { key: "situacao", label: "Situação", padrao: true, val: relSituacaoLabel },
  { key: "regional", label: "Regional", padrao: true, val: (d) => demandaRegionaisLabels(d).map(regionalSelectLabel).join(" · ") },
  { key: "cidades", label: "Cidade(s)", padrao: true, val: (d) => demandaCidadesLabels(d).join(" · ") },
  { key: "projetistas", label: "Projetista(s)", padrao: true, val: (d) => formatProjetistasDemanda(d) || "Não atribuído" },
  { key: "solicitante", label: "Solicitante", val: (d) => d.solicitante || "" },
  { key: "chegada", label: "Chegada", padrao: true, val: (d) => relDataBr(demandaDataChegadaDash(d)) },
  { key: "prazo", label: "Prazo previsto", padrao: true, val: (d) => relDataBr(d.dataFimPrevista) },
  { key: "prazoAtual", label: "Prazo atualizado", val: (d) => relDataBr(d.dataFimAtualizada) },
  { key: "termino", label: "Término", padrao: true, val: (d) => relDataBr(demandaDataTermino(d)) },
  { key: "diasAberto", label: "Dias em aberto", padrao: true, num: (d) => demandaDiasAberto(d) },
  { key: "diasAtraso", label: "Dias de atraso", padrao: true, num: (d) => demandaDiasAtraso(d) },
  { key: "motivoAtraso", label: "Motivo do atraso", val: (d) => d.motivosAtraso || "" },
  { key: "statusAtual", label: "Situação atual (texto)", val: (d) => d.statusAtual || "" },
  { key: "execucao", label: "Execução", val: (d) => {
    const ex = String(d.custo?.execucao || "").trim();
    return ex && ex !== CUSTO_EXECUCAO_NAO_APLICA ? ex : "";
  } },
  { key: "valorFinal", label: "Valor final (R$)", padrao: true, num: relValorFinal, moeda: true },
  { key: "valorRealizado", label: "Valor realizado (R$)", num: relValorRealizado, moeda: true },
  { key: "portas", label: "Portas novas", num: (d) => demandaPortasNovas(d) },
  { key: "metragem", label: "Metragem (m)", num: (d) => demandaMetragemLancamento(d), casas: 2 },
  { key: "ocomon", label: "Chamado Ocomon", val: (d) => d.chamadoOcomon || "" },
  { key: "aniel", label: "OS Aniel", val: (d) => d.osAniel || "" },
  { key: "asana", label: "Asana", val: (d) => (d.asana?.taskId || d.asanaTaskId ? "Sim" : "") },
  { key: "resumo", label: "Resumo", val: relResumoDescricao },
  { key: "ultimoComentario", label: "Último comentário", val: relUltimoComentario },
  { key: "arquivado", label: "Arquivado", val: (d) => (d.arquivadoEm ? relDataBr(d.arquivadoEm) : "") },
  { key: "criadoEm", label: "Cadastrado em", val: (d) => relDataHoraBr(d.createdAt) },
  { key: "atualizadoEm", label: "Alterado em", val: (d) => relDataHoraBr(d.updatedAt) },
  { key: "id", label: "ID", val: (d) => d.id || "" },
];

const REL_COLUNAS_PADRAO = REL_COLUNAS.filter((c) => c.padrao).map((c) => c.key);

function relFiltrosPadrao() {
  return {
    esteira: "",
    regionais: [],
    cidades: [],
    projetistas: [],
    tipos: [],
    produtos: [],
    segmentos: [],
    etapas: [],
    situacoes: [],
    solicitantes: [],
    prazo: "",
    campoData: "chegada",
    de: "",
    ate: "",
    busca: "",
    arquivados: false,
    agrupar: "regional",
    colunas: [...REL_COLUNAS_PADRAO],
  };
}

let relFiltros = relFiltrosPadrao();

function relChaveSalva() {
  const email = typeof getCurrentUserEmail === "function" ? getCurrentUserEmail() || "" : "";
  return `relatorioFiltros_v1:${email}`;
}

function relCarregarFiltros() {
  const base = relFiltrosPadrao();
  try {
    const salvo = JSON.parse(localStorage.getItem(relChaveSalva()) || "null");
    if (salvo && typeof salvo === "object") {
      for (const k of Object.keys(base)) {
        if (!(k in salvo)) continue;
        if (Array.isArray(base[k])) base[k] = Array.isArray(salvo[k]) ? salvo[k].map(String) : base[k];
        else if (typeof base[k] === "boolean") base[k] = Boolean(salvo[k]);
        else base[k] = String(salvo[k] ?? "");
      }
      const validas = new Set(REL_COLUNAS.map((c) => c.key));
      base.colunas = base.colunas.filter((k) => validas.has(k));
      if (!base.colunas.length) base.colunas = [...REL_COLUNAS_PADRAO];
    }
  } catch {
    /* sem armazenamento: começa do padrão */
  }
  return base;
}

function relGravarFiltros() {
  try {
    localStorage.setItem(relChaveSalva(), JSON.stringify(relFiltros));
  } catch {
    /* ignora: só conveniência */
  }
}

/** Todos os projetos que entram no relatório (sem lixeira; arquivados só se pedido). */
function relBaseDemandas(incluirArquivados) {
  const tombstones = typeof demandaDeleteTombstones === "function" ? demandaDeleteTombstones() : new Set();
  return (state.demandas || [])
    .filter((d) => d && !tombstones.has(d.id) && !d.excluidoEm)
    .map(migrateDemanda)
    .filter((d) => incluirArquivados || !d.arquivadoEm);
}

function relEtapaChave(d) {
  return `${inferLinhaEsteira(d)}:${d.status}`;
}

function relPassaPrazo(d, prazo) {
  if (!prazo) return true;
  const encerrada = isDemandaEncerrada(d);
  switch (prazo) {
    case "atrasado":
      return isAtrasoAtivo(d);
    case "vencendo":
      return demandaPrazoProximo(d);
    case "no_prazo":
      return Boolean(d.dataFimPrevista) && !isAtraso(d) && !encerrada;
    case "concluido_atrasado":
      return encerrada && isAtraso(d);
    case "concluido_no_prazo":
      return encerrada && Boolean(d.dataFimPrevista) && !isAtraso(d);
    case "sem_prazo":
      return !d.dataFimPrevista;
    default:
      return true;
  }
}

/** Aplica os filtros do relatório a uma lista de projetos (já migrados). */
function relFiltrarDemandas(lista, f) {
  const has = (arr) => Array.isArray(arr) && arr.length > 0;
  const busca = normalizeBuscaText(f.busca);
  let { de, ate } = f;
  if (de && ate && de > ate) [de, ate] = [ate, de];
  return lista.filter((d) => {
    const linha = inferLinhaEsteira(d);
    if (f.esteira && linha !== f.esteira) return false;
    if (has(f.regionais) && !demandaRegionaisLabels(d).some((r) => f.regionais.includes(r))) return false;
    if (has(f.cidades) && !demandaCidadesLabels(d).some((c) => f.cidades.includes(c))) return false;
    if (has(f.projetistas)) {
      const nomes = demandaProjetistasList(d);
      const ok = f.projetistas.some((p) => (p === "__none__" ? nomes.length === 0 : demandaTemProjetista(d, p)));
      if (!ok) return false;
    }
    if (has(f.tipos) && !f.tipos.includes(normalizeTipo(d.tipo))) return false;
    if (has(f.produtos) && !f.produtos.includes(d.produtoB2b || "__none__")) return false;
    if (has(f.segmentos) && !f.segmentos.includes(d.segmentoB2c || "__none__")) return false;
    if (has(f.etapas) && !f.etapas.includes(relEtapaChave(d))) return false;
    if (has(f.situacoes) && !f.situacoes.includes(relSituacao(d))) return false;
    if (has(f.solicitantes) && !f.solicitantes.includes(String(d.solicitante || "").trim() || "__none__")) return false;
    if (!relPassaPrazo(d, f.prazo)) return false;
    if (de || ate) {
      const data = relDataDoCampo(d, f.campoData);
      if (!data) return false;
      if (de && data < de) return false;
      if (ate && data > ate) return false;
    }
    if (busca) {
      const blob = normalizeBuscaText(
        [
          d.titulo,
          d.id,
          formatCidadesDemanda(d),
          ...demandaRegionaisLabels(d),
          d.solicitante,
          formatProjetistasDemanda(d),
          d.descricao,
          d.statusAtual,
          d.motivosAtraso,
          d.chamadoOcomon,
          d.osAniel,
          d.tipo,
          d.produtoB2b,
          d.segmentoB2c,
          relEtapaLabel(d),
        ]
          .filter(Boolean)
          .join(" "),
      );
      if (!blob.includes(busca)) return false;
    }
    return true;
  });
}

/** Chaves do grupo de um projeto (pode cair em mais de um: várias cidades, regionais ou projetistas). */
function relChavesGrupo(d, agrupar) {
  switch (agrupar) {
    case "regional":
      return demandaRegionaisLabels(d);
    case "cidade":
      return demandaCidadesLabels(d);
    case "projetista": {
      const nomes = demandaProjetistasList(d);
      return nomes.length ? nomes : ["Não atribuído"];
    }
    case "etapa":
      return [`${relEsteiraLabel(inferLinhaEsteira(d))} · ${relEtapaLabel(d)}`];
    case "situacao":
      return [REL_SITUACOES.find(([k]) => k === relSituacao(d))?.[1] || "—"];
    case "tipo":
      return [normalizeTipo(d.tipo) || "Sem tipo"];
    case "esteira":
      return [relEsteiraLabel(inferLinhaEsteira(d))];
    case "produto":
      return [d.produtoB2b || "Sem produto"];
    case "segmento":
      return [d.segmentoB2c || "Sem segmento"];
    case "solicitante":
      return [String(d.solicitante || "").trim() || "Sem solicitante"];
    case "mes": {
      const data = demandaDataChegadaDash(d);
      return [data ? data.slice(0, 7) : "Sem data"];
    }
    default:
      return ["Todos"];
  }
}

function relRotuloGrupo(chave, agrupar) {
  if (agrupar === "mes" && /^\d{4}-\d{2}$/.test(chave)) {
    const [a, m] = chave.split("-");
    return `${REL_MESES[Number(m) - 1]}/${a}`;
  }
  return chave;
}

function relMetricasVazias() {
  return { total: 0, andamento: 0, concluido: 0, pausado: 0, reprovado: 0, atrasado: 0, valor: 0, somaDias: 0 };
}

function relSomar(m, d) {
  m.total++;
  m[relSituacao(d)]++;
  if (isAtrasoAtivo(d)) m.atrasado++;
  m.valor += relValorFinal(d);
  m.somaDias += demandaDiasAberto(d);
}

/** Resumo agrupado: [{ chave, rotulo, ...métricas }] ordenado por quantidade. */
function relResumoAgrupado(lista, agrupar) {
  const mapa = new Map();
  for (const d of lista) {
    for (const chave of new Set(relChavesGrupo(d, agrupar))) {
      if (!mapa.has(chave)) mapa.set(chave, relMetricasVazias());
      relSomar(mapa.get(chave), d);
    }
  }
  const linhas = [...mapa.entries()].map(([chave, m]) => ({ chave, rotulo: relRotuloGrupo(chave, agrupar), ...m }));
  if (agrupar === "mes") linhas.sort((a, b) => a.chave.localeCompare(b.chave));
  else linhas.sort((a, b) => b.total - a.total || a.rotulo.localeCompare(b.rotulo, "pt-BR"));
  return linhas;
}

function relTotais(lista) {
  const m = relMetricasVazias();
  lista.forEach((d) => relSomar(m, d));
  return m;
}

function relColunasAtivas(f = relFiltros) {
  const set = new Set(f.colunas);
  return REL_COLUNAS.filter((c) => set.has(c.key));
}

function relValorCelula(col, d) {
  if (col.num) {
    const n = Number(col.num(d)) || 0;
    if (col.moeda) return n ? relMoeda(n) : "";
    return n ? relNumero(n, col.casas || 0) : "";
  }
  return String(col.val(d) ?? "");
}

/** Projetos filtrados, na ordem do relatório (regional, cidade, chegada). */
function relResultado(f = relFiltros) {
  const lista = relFiltrarDemandas(relBaseDemandas(f.arquivados), f);
  return lista.sort(
    (a, b) =>
      demandaRegionaisLabels(a)[0].localeCompare(demandaRegionaisLabels(b)[0], "pt-BR") ||
      demandaCidadesLabels(a)[0].localeCompare(demandaCidadesLabels(b)[0], "pt-BR") ||
      String(demandaDataChegadaDash(b)).localeCompare(String(demandaDataChegadaDash(a))) ||
      String(a.titulo).localeCompare(String(b.titulo), "pt-BR"),
  );
}

/* ---------- Descrição dos filtros (cabeçalho do PDF e do CSV) ---------- */

function relDescricaoFiltros(f = relFiltros) {
  const partes = [];
  const lista = (rotulo, arr, fmt = (x) => x) => {
    if (arr?.length) partes.push(`${rotulo}: ${arr.map(fmt).join(", ")}`);
  };
  if (f.esteira) partes.push(`Esteira: ${relEsteiraLabel(f.esteira)}`);
  lista("Regional", f.regionais, regionalSelectLabel);
  lista("Cidade", f.cidades);
  lista("Projetista", f.projetistas, (p) => (p === "__none__" ? "Não atribuído" : p));
  lista("Tipo", f.tipos);
  lista("Produto", f.produtos, (p) => (p === "__none__" ? "Sem produto" : p));
  lista("Segmento", f.segmentos, (p) => (p === "__none__" ? "Sem segmento" : p));
  lista("Etapa", f.etapas, (k) => {
    const [linha, status] = k.split(":");
    return `${labelStatus(status, linha)}${f.esteira ? "" : ` (${relEsteiraLabel(linha)})`}`;
  });
  lista("Situação", f.situacoes, (s) => REL_SITUACOES.find(([k]) => k === s)?.[1] || s);
  lista("Solicitante", f.solicitantes, (s) => (s === "__none__" ? "Sem solicitante" : s));
  if (f.prazo) partes.push(`Prazo: ${REL_PRAZOS.find(([k]) => k === f.prazo)?.[1] || f.prazo}`);
  if (f.de || f.ate) {
    const campo = REL_CAMPOS_DATA.find(([k]) => k === f.campoData)?.[1] || "Data";
    if (f.de && f.ate) partes.push(`${campo}: de ${relDataBr(f.de)} a ${relDataBr(f.ate)}`);
    else if (f.de) partes.push(`${campo}: a partir de ${relDataBr(f.de)}`);
    else partes.push(`${campo}: até ${relDataBr(f.ate)}`);
  }
  if (String(f.busca || "").trim()) partes.push(`Busca: «${String(f.busca).trim()}»`);
  if (f.arquivados) partes.push("Inclui arquivados");
  return partes;
}

/* ---------- Opções dos filtros ---------- */

function relOpcoesFiltro(nome, f = relFiltros) {
  const base = relBaseDemandas(true);
  switch (nome) {
    case "regionais":
      return [...REGIONAIS_ORDER, "Não informada"].map((r) => [r, regionalSelectLabel(r)]);
    case "cidades": {
      const regs = f.regionais.length ? f.regionais : null;
      const cadastro = regs ? regs.flatMap((r) => REGIONAIS_CIDADES[r] || []) : [...TODAS_CIDADES_LISTA];
      const doSistema = new Set();
      for (const d of base) demandaCidadesLabels(d).forEach((c) => doSistema.add(c));
      const extras = [...doSistema]
        .filter((c) => !cadastro.includes(c))
        .filter((c) => !regs || regs.includes(c === "Não informada" ? "Não informada" : findRegionalForCidade(c) || "Não informada"))
        .sort((a, b) => a.localeCompare(b, "pt-BR"));
      return [...cadastro, ...extras].map((c) => [c, c]);
    }
    case "projetistas": {
      const nomes = new Set([...allProjetistasNomes(), ...projetistaLabelsFromRoles()]);
      for (const d of base) demandaProjetistasList(d).forEach((n) => nomes.add(n));
      return [["__none__", "Não atribuído"], ...sortProjetistasNomes([...nomes]).map((n) => [n, n])];
    }
    case "tipos":
      return TIPOS_DEMANDA.map((t) => [t, t]);
    case "produtos":
      return [...PRODUTOS_B2B.map((p) => [p, p]), ["__none__", "Sem produto"]];
    case "segmentos":
      return [...SEGMENTOS_B2C.map((s) => [s, s]), ["__none__", "Sem segmento"]];
    case "etapas": {
      const linhas = f.esteira ? [f.esteira] : [LINHA_ESTEIRA_OPERACIONAL, LINHA_ESTEIRA_B2B];
      const out = [];
      for (const linha of linhas) {
        const cfg = getEsteiraConfig(linha);
        for (const [k, label] of [...cfg.statusOrder, ...cfg.statusExtra]) {
          if (out.some(([v]) => v === `${linha}:${k}`)) continue;
          out.push([`${linha}:${k}`, linhas.length > 1 ? `${relEsteiraLabel(linha)} · ${label}` : label]);
        }
      }
      return out;
    }
    case "situacoes":
      return REL_SITUACOES;
    case "solicitantes": {
      const nomes = new Set();
      for (const d of base) {
        const s = String(d.solicitante || "").trim();
        if (s) nomes.add(s);
      }
      return [...[...nomes].sort((a, b) => a.localeCompare(b, "pt-BR")).map((s) => [s, s]), ["__none__", "Sem solicitante"]];
    }
    default:
      return [];
  }
}

const REL_MULTI = [
  ["regionais", "Regional", "Todas"],
  ["cidades", "Cidade", "Todas"],
  ["projetistas", "Projetista", "Todos"],
  ["tipos", "Tipo", "Todos"],
  ["produtos", "Produto B2B", "Todos"],
  ["segmentos", "Segmento B2C", "Todos"],
  ["etapas", "Etapa", "Todas"],
  ["situacoes", "Situação", "Todas"],
  ["solicitantes", "Solicitante", "Todos"],
];

/** Remove das seleções o que não existe mais nas opções (ex.: cidade de outra regional). */
function relPodarSelecoes() {
  for (const [nome] of REL_MULTI) {
    const validos = new Set(relOpcoesFiltro(nome).map(([v]) => v));
    relFiltros[nome] = relFiltros[nome].filter((v) => validos.has(v));
  }
}

function relResumoSelecao(nome, vazio) {
  const sel = relFiltros[nome];
  if (!sel.length) return vazio;
  const opcoes = relOpcoesFiltro(nome);
  const rotulo = (v) => opcoes.find(([k]) => k === v)?.[1] || v;
  if (sel.length <= 2) return sel.map(rotulo).join(", ");
  return `${rotulo(sel[0])} +${sel.length - 1}`;
}

function relRenderMulti() {
  const box = document.getElementById("relFiltrosMulti");
  if (!box) return;
  const abertos = new Set([...box.querySelectorAll("details[open]")].map((el) => el.dataset.relMulti));
  const ativo = document.activeElement;
  const foco = box.contains(ativo)
    ? { op: ativo.dataset?.relOp, valor: ativo.value, sum: ativo.closest("details")?.dataset.relMulti, eSum: ativo.tagName === "SUMMARY" }
    : null;
  const esteira = relFiltros.esteira;
  box.innerHTML = REL_MULTI.map(([nome, rotulo, vazio]) => {
    if (nome === "produtos" && esteira === LINHA_ESTEIRA_OPERACIONAL) return "";
    if (nome === "segmentos" && esteira === LINHA_ESTEIRA_B2B) return "";
    const opcoes = relOpcoesFiltro(nome);
    const sel = new Set(relFiltros[nome]);
    const ativo = sel.size > 0;
    const itens = opcoes
      .map(
        ([v, l]) =>
          `<label class="rel-multi__op"><input type="checkbox" data-rel-op="${escapeHtml(nome)}" value="${escapeHtml(v)}"${sel.has(v) ? " checked" : ""} /> <span>${escapeHtml(l)}</span></label>`,
      )
      .join("");
    return (
      `<details class="rel-multi${ativo ? " is-ativo" : ""}" data-rel-multi="${escapeHtml(nome)}"${abertos.has(nome) ? " open" : ""}>` +
      `<summary><span class="rel-multi__rotulo">${escapeHtml(rotulo)}</span><span class="rel-multi__valor">${escapeHtml(relResumoSelecao(nome, vazio))}</span></summary>` +
      `<div class="rel-multi__painel">` +
      `<div class="rel-multi__acoes"><button type="button" class="btn btn--ghost btn--sm" data-rel-todos="${escapeHtml(nome)}">Marcar todos</button>` +
      `<button type="button" class="btn btn--ghost btn--sm" data-rel-nenhum="${escapeHtml(nome)}">Limpar</button></div>` +
      `<div class="rel-multi__lista">${itens}</div></div></details>`
    );
  }).join("");
  if (foco) {
    const alvo = foco.op
      ? [...box.querySelectorAll(`[data-rel-op="${CSS.escape(foco.op)}"]`)].find((el) => el.value === foco.valor)
      : box.querySelector(`[data-rel-multi="${CSS.escape(foco.sum || "")}"] summary`);
    alvo?.focus();
  }
}

function relRenderColunas() {
  const box = document.getElementById("relColunasLista");
  if (!box) return;
  const sel = new Set(relFiltros.colunas);
  box.innerHTML = REL_COLUNAS.map(
    (c) =>
      `<label class="rel-multi__op"><input type="checkbox" data-rel-col value="${escapeHtml(c.key)}"${sel.has(c.key) ? " checked" : ""} /> <span>${escapeHtml(c.label)}</span></label>`,
  ).join("");
  const resumo = document.getElementById("relColunasResumo");
  if (resumo) resumo.textContent = `${sel.size} de ${REL_COLUNAS.length}`;
}

function relPreencherSelect(id, opcoes, valor) {
  const sel = document.getElementById(id);
  if (!sel) return;
  sel.innerHTML = opcoes.map(([v, l]) => `<option value="${escapeHtml(v)}">${escapeHtml(l)}</option>`).join("");
  sel.value = valor;
}

function relSincronizarControles() {
  document.querySelectorAll("#relEsteiraSeg [data-esteira]").forEach((b) => {
    const on = b.dataset.esteira === relFiltros.esteira;
    b.classList.toggle("is-active", on);
    b.setAttribute("aria-checked", on ? "true" : "false");
  });
  relPreencherSelect("relPrazo", REL_PRAZOS, relFiltros.prazo);
  relPreencherSelect("relCampoData", REL_CAMPOS_DATA, relFiltros.campoData);
  relPreencherSelect("relAgrupar", REL_AGRUPAR, relFiltros.agrupar);
  const set = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.value = v;
  };
  set("relDe", relFiltros.de);
  set("relAte", relFiltros.ate);
  set("relBusca", relFiltros.busca);
  const arq = document.getElementById("relArquivados");
  if (arq) arq.checked = relFiltros.arquivados;
  document.getElementById("relPrazo")?.closest(".rel-campo")?.classList.toggle("is-ativo", Boolean(relFiltros.prazo));
  relRenderMulti();
  relRenderColunas();
}

/* ---------- Resultado na tela ---------- */

const REL_PREVIA_LIMITE = 200;

function relKpisHtml(t) {
  const media = t.total ? Math.round(t.somaDias / t.total) : 0;
  const kpi = (rotulo, valor, tom = "") => `<div class="rel-kpi${tom ? ` rel-kpi--${tom}` : ""}"><span>${rotulo}</span><strong>${valor}</strong></div>`;
  return [
    kpi("Projetos", relNumero(t.total)),
    kpi("Em andamento", relNumero(t.andamento)),
    kpi("Concluídos", relNumero(t.concluido), "ok"),
    kpi("Em atraso", relNumero(t.atrasado), t.atrasado ? "bad" : ""),
    kpi("Pausados / reprovados", relNumero(t.pausado + t.reprovado)),
    kpi("Valor final", relMoeda(t.valor)),
    kpi("Média de dias em aberto", relNumero(media)),
  ].join("");
}

function relResumoTabelaHtml(linhas, agrupar, total) {
  if (!agrupar) return "";
  const nome = REL_AGRUPAR.find(([k]) => k === agrupar)?.[1] || "Grupo";
  const multi = ["regional", "cidade", "projetista"].includes(agrupar);
  const corpo = linhas
    .map((l) => {
      const pct = total ? Math.round((l.total / total) * 100) : 0;
      return (
        `<tr><th scope="row">${escapeHtml(l.rotulo)}</th><td class="num">${relNumero(l.total)}</td>` +
        `<td class="num rel-pct"><span class="rel-barra" style="--p:${pct}%"></span>${pct}%</td>` +
        `<td class="num">${relNumero(l.andamento)}</td><td class="num">${relNumero(l.concluido)}</td>` +
        `<td class="num${l.atrasado ? " rel-bad" : ""}">${relNumero(l.atrasado)}</td>` +
        `<td class="num">${relNumero(l.pausado + l.reprovado)}</td>` +
        `<td class="num">${relMoeda(l.valor)}</td><td class="num">${relNumero(l.total ? l.somaDias / l.total : 0)}</td></tr>`
      );
    })
    .join("");
  return (
    `<h3 class="rel-sub">Resumo por ${escapeHtml(nome.toLowerCase())}</h3>` +
    (multi ? `<p class="muted small">Projeto com mais de uma ${agrupar === "projetista" ? "pessoa" : agrupar === "cidade" ? "cidade" : "regional"} conta em cada uma.</p>` : "") +
    `<div class="rel-tabela-wrap" tabindex="0" role="region" aria-label="Resumo por ${escapeHtml(nome.toLowerCase())}"><table class="rel-tabela rel-tabela--resumo"><thead><tr><th scope="col">${escapeHtml(nome)}</th>` +
    `<th scope="col" class="num">Projetos</th><th scope="col" class="num">%</th><th scope="col" class="num">Em andamento</th>` +
    `<th scope="col" class="num">Concluídos</th><th scope="col" class="num">Em atraso</th><th scope="col" class="num">Pausados / reprov.</th>` +
    `<th scope="col" class="num">Valor final</th><th scope="col" class="num">Média dias</th></tr></thead><tbody>${corpo}</tbody></table></div>`
  );
}

function relDetalheTabelaHtml(lista, colunas, limite = Infinity) {
  const mostrar = lista.slice(0, limite);
  const cab = colunas.map((c) => `<th scope="col"${c.num ? ' class="num"' : ""}>${escapeHtml(c.label)}</th>`).join("");
  const corpo = mostrar
    .map(
      (d) =>
        `<tr data-rel-id="${escapeHtml(d.id)}">` +
        colunas.map((c) => `<td${c.num ? ' class="num"' : ""}>${escapeHtml(relValorCelula(c, d))}</td>`).join("") +
        `</tr>`,
    )
    .join("");
  const somas = colunas.map((c) => {
    if (!c.num || ["diasAberto", "diasAtraso"].includes(c.key)) return "<td></td>";
    const soma = lista.reduce((s, d) => s + (Number(c.num(d)) || 0), 0);
    return `<td class="num">${c.moeda ? relMoeda(soma) : relNumero(soma, c.casas || 0)}</td>`;
  });
  const temSoma = colunas.some((c) => c.num && !["diasAberto", "diasAtraso"].includes(c.key));
  if (temSoma) somas[0] = `<td><strong>Total</strong></td>`;
  return (
    `<div class="rel-tabela-wrap" tabindex="0" role="region" aria-label="Lista de projetos"><table class="rel-tabela rel-tabela--detalhe"><thead><tr>${cab}</tr></thead><tbody>${corpo}</tbody>` +
    (temSoma ? `<tfoot><tr>${somas.join("")}</tr></tfoot>` : "") +
    `</table></div>`
  );
}

function relRender() {
  const lista = relResultado();
  const totais = relTotais(lista);
  const colunas = relColunasAtivas();
  const kpis = document.getElementById("relKpis");
  if (kpis) kpis.innerHTML = relKpisHtml(totais);
  const filtrosTxt = relDescricaoFiltros();
  const desc = document.getElementById("relFiltrosAtivos");
  if (desc) desc.textContent = filtrosTxt.length ? filtrosTxt.join(" · ") : "Sem filtros: todos os projetos ativos.";
  const btnLimpar = document.getElementById("btnRelLimpar");
  if (btnLimpar) btnLimpar.hidden = filtrosTxt.length === 0;
  const resumo = document.getElementById("relResumo");
  if (resumo) resumo.innerHTML = lista.length ? relResumoTabelaHtml(relResumoAgrupado(lista, relFiltros.agrupar), relFiltros.agrupar, lista.length) : "";
  const det = document.getElementById("relDetalhe");
  if (det) {
    if (!lista.length) {
      det.innerHTML = `<p class="rel-vazio">Nenhum projeto com esses filtros.</p>`;
    } else {
      const aviso =
        lista.length > REL_PREVIA_LIMITE
          ? `<p class="muted small">Mostrando ${REL_PREVIA_LIMITE} de ${relNumero(lista.length)} na tela. A exportação e a impressão levam todos.</p>`
          : "";
      det.innerHTML =
        `<h3 class="rel-sub">Projetos <span class="muted">(${relNumero(lista.length)})</span></h3>` +
        aviso +
        relDetalheTabelaHtml(lista, colunas, REL_PREVIA_LIMITE);
    }
  }
  ["btnRelCsv", "btnRelImprimir"].forEach((id) => {
    const b = document.getElementById(id);
    if (b) b.disabled = !lista.length || !colunas.length;
  });
}

function relAtualizar({ podar = false } = {}) {
  if (podar) relPodarSelecoes();
  relSincronizarControles();
  relRender();
  relGravarFiltros();
}

/* ---------- Exportar ---------- */

function relEscaparCsv(v) {
  const s = String(v ?? "");
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV com «;» (o Excel em português abre direto nas colunas certas) e BOM UTF-8. */
function relGerarCsv(lista, colunas, f = relFiltros) {
  const linhas = [];
  linhas.push([`Relatório de projetos — gerado em ${relDataHoraBr(new Date().toISOString())}`]);
  const filtros = relDescricaoFiltros(f);
  linhas.push([filtros.length ? `Filtros: ${filtros.join(" · ")}` : "Filtros: nenhum (todos os projetos ativos)"]);
  linhas.push([]);
  linhas.push(colunas.map((c) => c.label));
  for (const d of lista) {
    linhas.push(
      colunas.map((c) => {
        if (!c.num) return String(c.val(d) ?? "");
        const n = Number(c.num(d)) || 0;
        if (!n) return "";
        return String(c.moeda || c.casas ? n.toFixed(2) : Math.round(n)).replace(".", ",");
      }),
    );
  }
  return "﻿" + linhas.map((l) => l.map(relEscaparCsv).join(";")).join("\r\n");
}

function relNomeArquivo(ext) {
  return `relatorio-projetos-${todayISODate()}.${ext}`;
}

function relExportarCsv() {
  const lista = relResultado();
  const colunas = relColunasAtivas();
  if (!lista.length || !colunas.length) {
    toast("Nada para exportar com esses filtros");
    return;
  }
  const blob = new Blob([relGerarCsv(lista, colunas)], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, relNomeArquivo("csv"));
  toast(`${lista.length} projeto(s) no relatório (Excel / CSV)`);
}

function relHtmlImpressao(lista, colunas) {
  const filtros = relDescricaoFiltros();
  const totais = relTotais(lista);
  return (
    `<header class="rel-print__cab"><h1>Relatório de projetos</h1>` +
    `<p>Gerado em ${escapeHtml(relDataHoraBr(new Date().toISOString()))}${typeof getLoggedInComentarioAutor === "function" && getLoggedInComentarioAutor() ? ` por ${escapeHtml(getLoggedInComentarioAutor())}` : ""}</p>` +
    `<p>${escapeHtml(filtros.length ? `Filtros: ${filtros.join(" · ")}` : "Sem filtros: todos os projetos ativos.")}</p></header>` +
    `<div class="rel-kpis">${relKpisHtml(totais)}</div>` +
    relResumoTabelaHtml(relResumoAgrupado(lista, relFiltros.agrupar), relFiltros.agrupar, lista.length) +
    `<h3 class="rel-sub">Projetos (${relNumero(lista.length)})</h3>` +
    relDetalheTabelaHtml(lista, colunas)
  );
}

/** Imprime só o relatório (o navegador oferece «Salvar como PDF»). */
function relImprimir() {
  const lista = relResultado();
  const colunas = relColunasAtivas();
  if (!lista.length || !colunas.length) {
    toast("Nada para imprimir com esses filtros");
    return;
  }
  let area = document.getElementById("relatorioImpressao");
  if (!area) {
    area = document.createElement("div");
    area.id = "relatorioImpressao";
    area.className = "rel-print";
    document.body.appendChild(area);
  }
  area.innerHTML = relHtmlImpressao(lista, colunas);
  document.body.classList.add("imprimindo-relatorio");
  const limpar = () => {
    document.body.classList.remove("imprimindo-relatorio");
    area.innerHTML = "";
    window.removeEventListener("afterprint", limpar);
  };
  window.addEventListener("afterprint", limpar);
  window.print();
}

/* ---------- Abrir e ligar os controles ---------- */

function abrirRelatorio() {
  const dlg = document.getElementById("modalRelatorio");
  if (!dlg) return;
  relFiltros = relCarregarFiltros();
  relAtualizar({ podar: true });
  if (!dlg.open) dlg.showModal();
}

function initRelatorio() {
  document.getElementById("btnRelatorio")?.addEventListener("click", abrirRelatorio);
  const dlg = document.getElementById("modalRelatorio");
  if (!dlg) return;
  const fechar = () => dlg.close();
  document.getElementById("modalRelatorioClose")?.addEventListener("click", fechar);
  document.getElementById("btnRelFechar")?.addEventListener("click", fechar);
  document.getElementById("btnRelCsv")?.addEventListener("click", relExportarCsv);
  document.getElementById("btnRelImprimir")?.addEventListener("click", relImprimir);
  document.getElementById("btnRelLimpar")?.addEventListener("click", () => {
    const { agrupar, colunas } = relFiltros;
    relFiltros = { ...relFiltrosPadrao(), agrupar, colunas };
    relAtualizar();
    document.getElementById("relBusca")?.focus(); // o botão some; o foco fica na janela
  });
  document.getElementById("btnRelColunasPadrao")?.addEventListener("click", () => {
    relFiltros.colunas = [...REL_COLUNAS_PADRAO];
    relAtualizar();
  });

  document.getElementById("relEsteiraSeg")?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-esteira]");
    if (!b) return;
    relFiltros.esteira = b.dataset.esteira;
    relAtualizar({ podar: true });
  });

  const porId = {
    relPrazo: "prazo",
    relCampoData: "campoData",
    relDe: "de",
    relAte: "ate",
    relAgrupar: "agrupar",
  };
  for (const [id, campo] of Object.entries(porId)) {
    document.getElementById(id)?.addEventListener("change", (e) => {
      relFiltros[campo] = e.target.value;
      relAtualizar();
    });
  }
  let buscaTimer = 0;
  document.getElementById("relBusca")?.addEventListener("input", (e) => {
    clearTimeout(buscaTimer);
    buscaTimer = setTimeout(() => {
      relFiltros.busca = e.target.value;
      relRender();
      relGravarFiltros();
    }, 200);
  });
  document.getElementById("relArquivados")?.addEventListener("change", (e) => {
    relFiltros.arquivados = e.target.checked;
    relAtualizar();
  });

  // Esc com um menu de filtro aberto fecha só o menu, não a janela.
  const fecharMenusAbertos = () => {
    const abertos = dlg.querySelectorAll(".rel-multi[open]");
    abertos.forEach((el) => {
      el.open = false;
    });
    return abertos.length > 0;
  };
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Escape" || !dlg.open) return;
      const menu = e.target.closest?.(".rel-multi");
      if (fecharMenusAbertos()) {
        e.preventDefault();
        e.stopPropagation();
        menu?.querySelector("summary")?.focus();
      }
    },
    true,
  );
  dlg.addEventListener("cancel", (e) => {
    if (fecharMenusAbertos()) e.preventDefault();
  });

  dlg.addEventListener("change", (e) => {
    const op = e.target.closest("[data-rel-op]");
    if (op) {
      const nome = op.dataset.relOp;
      const set = new Set(relFiltros[nome]);
      if (op.checked) set.add(op.value);
      else set.delete(op.value);
      relFiltros[nome] = [...set];
      relAtualizar({ podar: nome === "regionais" });
      return;
    }
    const col = e.target.closest("[data-rel-col]");
    if (col) {
      const set = new Set(relFiltros.colunas);
      if (col.checked) set.add(col.value);
      else set.delete(col.value);
      relFiltros.colunas = REL_COLUNAS.map((c) => c.key).filter((k) => set.has(k));
      relAtualizar();
    }
  });
  dlg.addEventListener("click", (e) => {
    const todos = e.target.closest("[data-rel-todos]");
    const nenhum = e.target.closest("[data-rel-nenhum]");
    if (todos) {
      const nome = todos.dataset.relTodos;
      relFiltros[nome] = relOpcoesFiltro(nome).map(([v]) => v);
      relAtualizar({ podar: nome === "regionais" });
    } else if (nenhum) {
      const nome = nenhum.dataset.relNenhum;
      relFiltros[nome] = [];
      relAtualizar({ podar: nome === "regionais" });
    }
    const linha = e.target.closest("[data-rel-id]");
    if (linha && typeof openDemandaModal === "function" && state.demandas.some((x) => x.id === linha.dataset.relId)) {
      dlg.close();
      openDemandaModal(linha.dataset.relId);
    }
    // Fecha os outros menus de filtro ao abrir um.
    const sum = e.target.closest(".rel-multi > summary");
    if (sum) {
      const atual = sum.parentElement;
      dlg.querySelectorAll(".rel-multi[open]").forEach((el) => {
        if (el !== atual) el.open = false;
      });
    } else if (!e.target.closest(".rel-multi")) {
      dlg.querySelectorAll(".rel-multi[open]").forEach((el) => {
        el.open = false;
      });
    }
  });
}
