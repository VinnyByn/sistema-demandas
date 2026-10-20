/**
 * Inicialização do app: tudo o que executa ao abrir a página, na ordem original.
 * As funções e constantes ficam nos arquivos de js/ (carregados antes deste).
 */

// ===== Configuração das esteiras, etapas, projetistas, produtos, regionais e cidades (js/01-config-esteira.js) =====

const STATUS_LABEL = Object.fromEntries([...STATUS_ORDER, ...STATUS_EXTRA]);

const STATUS_LABEL_B2B = Object.fromEntries(STATUS_ORDER_B2B);

const ESTEIRA_CONFIG = {
  [LINHA_ESTEIRA_OPERACIONAL]: buildEsteiraConfig(STATUS_ORDER, STATUS_EXTRA, "novo"),
  [LINHA_ESTEIRA_B2B]: buildEsteiraConfig(STATUS_ORDER_B2B, [], "pre_vendas"),
};
const TEMPO_FASES_ORDER = STATUS_ORDER.map(([k]) => k).filter((k) => !TEMPO_STATUS_EXCLUIDOS.has(k));
/** Sem "Projetos novos" no filtro de status do dashboard Tempo por setor. */
const TEMPO_FILTRO_STATUS_OPCOES = TEMPO_FASES_ORDER.filter((k) => k !== "novo");
const TEMPO_FASES_ORDER_B2B = STATUS_ORDER_B2B.map(([k]) => k).filter((k) => !TEMPO_STATUS_EXCLUIDOS_B2B.has(k));
const TEMPO_FILTRO_STATUS_OPCOES_B2B = TEMPO_FASES_ORDER_B2B.filter((k) => k !== "pre_vendas");

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

/** Esteira operacional — ordem alfabética (pt-BR). Usado em filtros/dashboard da linha. */
const PROJETISTAS = sortProjetistasNomes(["Vinicius", "Matheus", "João", "Daniel"]);
/** Esteira B2B. */
const PROJETISTAS_B2B = sortProjetistasNomes(["Alberto", "Rafael"]);

/** Produtos da linha B2B (ordem alfabética pt-BR). */
const PRODUTOS_B2B = sortProjetistasNomes([
  "Evento IP",
  "Fibra Apagada",
  "IP Dedicado",
  "IP Trânsito",
  "Lan to Lan",
  "Projeto Especial",
  "Transporte PTT",
  "Wireless",
]);
const SOLICITANTES_B2B_COMERCIAL = sortProjetistasNomes([
  "Christopher Kurt",
  "Igor Barreto",
  "Igor Raposo",
  "Lorrany Rodrigues",
  "Michel Dias",
  "Pedro Cardoso",
  "Thiago Miranda",
]);

/** Segmento da linha B2C (ordem alfabética pt-BR). */
const SEGMENTOS_B2C = sortProjetistasNomes(["MDU", "TCR", "TCT"]);

const REGIONAIS_ORDER = Object.keys(REGIONAIS_CIDADES).sort((a, b) => a.localeCompare(b, "pt-BR"));

const TODAS_CIDADES_LISTA = REGIONAIS_ORDER.flatMap((reg) => REGIONAIS_CIDADES[reg]);

// ===== Estado do app, gravação local/nuvem, datas, prazos e motivos de atraso (js/03-estado-e-sincronizacao.js) =====

window.setSyncStatus = setSyncStatus;

window.addEventListener("demandas-sync-error", (e) => {
  toast(e.detail?.message || "Erro ao sincronizar com a nuvem");
});

// ===== Modelo do checklist, durações, avisos (toast), diálogos e abas (js/05-base-interface.js) =====
const CHECKLIST_STATUS_LABEL = Object.fromEntries(CHECKLIST_STATUS);

/* ---------- UI: toast, confirm, tabs ---------- */
const toastEl = document.getElementById("toast");

initConfirmDialog();
initToastDialogHosts();

let state = defaultState();

const panels = {
  esteira: document.getElementById("panelEsteira"),
  dashboard: document.getElementById("panelDashboard"),
};

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

// ===== Quadro da esteira: filtros, arrastar, ordem, alertas e cards (js/06-esteira-e-cards.js) =====

/* ---------- Filters (esteira) ---------- */
initEsteiraFilters();

initEsteiraBoardDragScroll();

initNotifMenu();

initAlertaSnoozeModal();
initLixeiraModal();
initBackupsModal();
initTimelineResumoInterativo();
initLoteEsteira();
initFiltrosSalvos();
initMetasEtapa();

// ===== Integração com o Asana (envio à Operação e comentários) (js/07-asana.js) =====

initAsanaEnvioDialog();

// ===== Modal do projeto: campos, selects e sincronização do formulário (js/08-modal-projeto.js) =====

/* ---------- Modal demanda ---------- */
const modalDemanda = document.getElementById("modalDemanda");
const demStatusSel = document.getElementById("demStatus");
fillStatusSelect();
initDemandaModalScrollLock();
initProjetistaSelects();
initDemCidadeSelects();
initDemProjetistasExtra();
initDemProdutoB2bSelect();
initDemSetorSolicitanteB2bSelect();
initDemSolicitanteB2bSelect();
initDemSegmentoB2cSelect();

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

// ===== Seções recolhíveis do projeto, abertura do modal e linha do tempo (js/11-secoes-e-linha-do-tempo.js) =====

initDemNavegacao();

// ===== Levantamento de custo, leitura do PDF, portas e lançamento (js/12-custo-e-pdf.js) =====

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

document.getElementById("btnNovaDemanda")?.addEventListener("click", () => {
  if (!requireWriteAccess()) return;
  openDemandaModal(null);
});

document.getElementById("btnEnviarAsana")?.addEventListener("click", async () => {
  const id = (document.getElementById("demId")?.value || "").trim();
  const btn = document.getElementById("btnEnviarAsana");
  if (!id) {
    toast("Salve a demanda antes de enviar ao Asana.");
    return;
  }
  const titulo = (document.getElementById("demTitulo")?.value || "").trim();
  const envio = await promptAsanaEnvio(titulo);
  if (!envio) return;
  await enviarDemandaAsana(id, btn, envio);
});
document.getElementById("btnNovaOrdemAsana")?.addEventListener("click", async () => {
  const id = (document.getElementById("demId")?.value || "").trim();
  if (id) await abrirNovaOrdemAsana(id);
});
document.getElementById("btnCancelarAsana")?.addEventListener("click", async () => {
  const id = (document.getElementById("demId")?.value || "").trim();
  if (!id) return;
  await cancelarDemandaAsana(id);
});
document.getElementById("btnAddComentario")?.addEventListener("click", () => {
  if (!requireWriteAccess()) return;
  addComentarioFromForm();
});
document.getElementById("demComentarioNovo")?.addEventListener("input", syncComentarioCompose);
ligarMencoesNoCampo(document.getElementById("demComentarioNovo"));
// Botão "@": insere o marcador no cursor e abre a lista de pessoas.
document.getElementById("btnComentarioMencao")?.addEventListener("click", () => {
  const ta = document.getElementById("demComentarioNovo");
  if (!ta || ta.readOnly || ta.disabled) return;
  const ini = ta.selectionStart ?? ta.value.length;
  const fim = ta.selectionEnd ?? ini;
  const antes = ta.value.slice(0, ini);
  const marcador = antes && !/\s$/.test(antes) ? " @" : "@";
  ta.value = antes + marcador + ta.value.slice(fim);
  const caret = ini + marcador.length;
  ta.focus();
  ta.setSelectionRange(caret, caret);
  ta.dispatchEvent(new Event("input", { bubbles: true }));
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
window.addEventListener("beforeunload", () => {
  if (editingDemandaOpenId) releaseDemandaEditing(editingDemandaOpenId);
});

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

document.getElementById("btnSalvarDemanda")?.addEventListener("click", async () => {
  if (!requireWriteAccess()) return;
  const id = document.getElementById("demId").value || uid();
  let existing = state.demandas.find((x) => x.id === id);
  let fotosSalvar = [];
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
    // "Status atual" saiu do formulário (a checklist mostra o andamento); mantém o texto legado salvo.
    statusAtual: existing?.statusAtual || "",
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
    comentarios: normalizeComentarios(mesclarComentariosDoServidor(editingComentarios, existing?.comentarios)),
    custo: readCustoFromForm(),
    pdfLevantamento: editingPdfLevantamento,
    imagens: existing?.imagens?.length ? existing.imagens : editingImages,
    historicoStatus: existing?.historicoStatus || [],
    historicoEdicoes: Array.isArray(existing?.historicoEdicoes) ? [...existing.historicoEdicoes] : [],
    historicoAlertas: syncHistoricoAlertasOcultos(existing?.historicoAlertas, editingComentarios),
    alertaSnooze: existing?.alertaSnooze || null,
    asana: existing?.asana || null,
    asanaTaskId: existing?.asanaTaskId || existing?.asana?.taskId || "",
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
    fotosSalvar = [{ id: payload.id, antes: null }];
    state.demandas.push(payload);
  } else {
    if (
      editingDemandaBaselineUpdatedAt &&
      existing.updatedAt &&
      existing.updatedAt !== editingDemandaBaselineUpdatedAt &&
      ownAsanaSyncId !== existing.id &&
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
    fotosSalvar = fotografarDemandas([existing.id]);
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
  oferecerDesfazer(existing ? "Demanda salva" : "Demanda criada", () =>
    restaurarFotos(fotosSalvar, existing ? "Alterações desfeitas" : "Criação desfeita — o projeto foi para a lixeira"),
  );
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
    title: "Mover para a lixeira?",
    message: `O projeto «${titulo}» sai da esteira e vai para a Lixeira. Dá para restaurar depois.`,
    confirmText: "Mover para a lixeira",
    variant: "danger",
  });
  if (!ok) return;
  stopPresenceHeartbeat();
  releaseDemandaEditing(id);
  closeDemandaModal();
  moverDemandasParaLixeira([id]);
});

// ===== Backups na nuvem, lixeira, arquivo e Desfazer (js/14-backups-lixeira-e-desfazer.js) =====

initDesfazerAtalho();

// ===== Histórico de edição, diárias e projetistas (js/15-historico-diarias-e-projetistas.js) =====

/* ---------- Histórico de edição ---------- */
const modalHistoricoEdicao = document.getElementById("modalHistoricoEdicao");
const demandaFootMenu = document.getElementById("demandaFootMenu");
const demandaFootMenuList = document.getElementById("demandaFootMenuList");
const btnDemandaMaisOpcoes = document.getElementById("btnDemandaMaisOpcoes");

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

/* ---------- Diárias ---------- */
const modalDiaria = document.getElementById("modalDiaria");

document.getElementById("btnNovaDiaria")?.addEventListener("click", () => {
  if (!requireWriteAccess()) return;
  openDiariaModal(null);
});
document.getElementById("modalDiariaClose")?.addEventListener("click", () => modalDiaria?.close());
document.getElementById("btnFecharDiaria")?.addEventListener("click", () => modalDiaria?.close());

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

// ===== Dashboard: blocos, gráficos, KPIs, tipos e B2C (js/16-dashboard-base.js) =====

/** Status da esteira operacional até Documentação (inclusive) — sem Conclusão. */
const STATUS_ATE_DOCUMENTACAO = STATUS_ORDER.map(([k]) => k).filter((k) => k !== "conclusao");
const STATUS_ATE_DOCUMENTACAO_SET = new Set(STATUS_ATE_DOCUMENTACAO);

// ===== Dashboard: B2B, tempo por etapa e períodos (js/18-dashboard-b2b-e-tempo.js) =====

/**
 * Cores dos produtos B2B: um slot da paleta por produto, na mesma ordem em que aparecem (alfabética),
 * para que vizinhos nos gráficos sempre passem na validação de contraste/daltonismo.
 */
const PRODUTO_B2B_CORES = Object.fromEntries(
  PRODUTOS_B2B.map((p, i) => [p, PALETA_CATEGORICA[i % PALETA_CATEGORICA.length]]),
);

initDashB2cGeoControles();

// ===== Exportar e importar (JSON e CSV) (js/19-exportar-e-importar.js) =====

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
    // Backups da nuvem trazem cabeçalho e cópia bruta do meta — não entram no estado do app.
    const { backup: _cabecalho, metaCompleto: _metaBruto, ...data } = JSON.parse(text);
    applyLoadedState(data);
    saveState({ importFull: true });
    const metaFields = {};
    if (data.metasEtapa && typeof data.metasEtapa === "object") metaFields.metasEtapa = data.metasEtapa;
    if (data.filtrosSalvos && typeof data.filtrosSalvos === "object") metaFields.filtrosSalvos = data.filtrosSalvos;
    if (Object.keys(metaFields).length) saveState({ metaFields });
    refreshAllViews();
    toast("Importação concluída");
  } catch {
    toast("Arquivo inválido");
  }
});
const modalImportCsv = document.getElementById("modalImportCsv");

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

// ===== Administração de usuários, login e inicialização (js/20-usuarios-e-login.js) =====

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

(function syncPublicLink() {
  const a = document.getElementById("appPublicLink");
  if (a) {
    a.href = APP_PUBLIC_URL;
    a.textContent = APP_PUBLIC_URL.replace(/^https:\/\//, "");
  }
})();
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

