// Dados na nuvem (Supabase): uma linha por demanda em `demandas` e o restante em `sistema_meta`.
// O tempo real só avisa "este id mudou" e a linha é relida: acima de 1 MB o aviso chega sem o campo `dados`.
// Aviso perdido não volta sozinho, então tudo é relido ao reconectar e ao voltar para a aba.
const DemandasNuvem = (function () {
  const FUNCAO_API = "api";
  const BUCKET_BACKUPS = "backups";
  const TAMANHO_PAGINA = 1000;
  const ATRASO_RELEITURA_MS = 150;
  const INTERVALO_RECARGA_MS = 60 * 1000;
  const ATRASO_APOS_ENVIO_MS = 1500;
  const JANELA_DO_META_ENVIADO_MS = 3000;
  const ATRASO_DA_COPIA_LOCAL_MS = 500;
  const META_VAZIO = () => ({ diarias: [], projetistas: {}, deletedDemandaIds: [], deletedDiariaIds: [] });
  const APAGAR = Object.freeze({ apagarCampo: true });

  const { cliente, ehErroDeRede, erroDoBanco, executar } = DemandasConsulta;
  const { mesclarEstado, confirmarExclusoes, normalizarEstado, estadoVazio, extrasDoMeta } = DemandasMesclagem;
  const copiaLocal = DemandasCopiaLocal;
  const acessos = DemandasAcessosNuvem;

  let canal = null;
  let avisarStatus = () => {};
  let entregarDados = null;
  let demandasDoServidor = new Map();
  let metaDoServidor = META_VAZIO();
  let carregado = false;
  let carregando = false;
  let jaAssinou = false;
  let ultimaCarga = 0;
  let timerReleituraDemandas = null;
  let timerReleituraMeta = null;
  let timerCopiaLocal = null;
  let copiaLocalAgendada = null;
  let metaEnviado = null;
  const idsParaReler = new Set();
  const demandasEmEnvio = new Set();

  const nuvemConfigurada = () => typeof DemandasAuth !== "undefined" && DemandasAuth.isConfigured();
  const emEnvio = () => ({ demandaIds: demandasEmEnvio, meta: metaEnviado });

  // ---------- Formato gravado no banco ----------

  const ehApagar = (valor) => valor === APAGAR || (valor && typeof valor === "object" && valor.apagarCampo === true);
  const ehMapa = (valor) => Object.prototype.toString.call(valor) === "[object Object]";

  // Mapa que só tinha campos a apagar não vai: no banco, mapa vazio limparia o campo inteiro.
  function separarApagados(objeto, prefixo = []) {
    const campos = {};
    const remover = [];
    for (const [chave, valor] of Object.entries(objeto || {})) {
      if (valor === undefined) continue;
      const caminho = [...prefixo, chave];
      if (ehApagar(valor)) {
        remover.push(caminho);
      } else if (ehMapa(valor)) {
        const interno = separarApagados(valor, caminho);
        remover.push(...interno.remover);
        if (Object.keys(interno.campos).length || !interno.remover.length) campos[chave] = interno.campos;
      } else {
        campos[chave] = valor;
      }
    }
    return { campos, remover };
  }

  function demandaParaNuvem(demanda) {
    const copia = { ...demanda };
    delete copia.id;
    delete copia.__isMigrated;
    if (!copia.alertaSnooze) copia.alertaSnooze = APAGAR;
    copia.editingBy = APAGAR;
    copia.editingAt = APAGAR;
    copia.updatedAt = demanda.updatedAt || new Date().toISOString();
    return separarApagados(copia);
  }

  const demandaDaNuvem = (linha) => ({ id: linha.id, ...(linha.dados || {}) });

  // ---------- Entrega à tela ----------

  function agendarCopiaLocal(estado) {
    copiaLocalAgendada = estado;
    if (timerCopiaLocal) return;
    timerCopiaLocal = setTimeout(() => {
      timerCopiaLocal = null;
      const pendente = copiaLocalAgendada;
      copiaLocalAgendada = null;
      if (pendente) copiaLocal.salvar(pendente);
    }, ATRASO_DA_COPIA_LOCAL_MS);
  }

  function estadoParaATela({ confiarNoRemoto }) {
    const demandas = [...demandasDoServidor.values()];
    const remoto = { demandas, ...metaDoServidor };
    const mesclado = mesclarEstado(remoto, copiaLocal.carregar(), { confiarNoRemoto, emEnvio: emEnvio() });
    return confirmarExclusoes(mesclado, demandas);
  }

  function entregarATela() {
    if (!entregarDados || !carregado) return;
    const estado = estadoParaATela({ confiarNoRemoto: true });
    entregarDados(estado);
    agendarCopiaLocal(estado);
    avisarStatus("synced");
  }

  function entregarCopiaLocalAposFalha() {
    if (!entregarDados) return;
    const estado = estadoParaATela({ confiarNoRemoto: false });
    entregarDados(estado);
    agendarCopiaLocal(estado);
  }

  // ---------- Leitura ----------

  async function buscarDemandas() {
    const todas = [];
    for (let inicio = 0; ; inicio += TAMANHO_PAGINA) {
      const pagina = await executar(
        cliente()
          .from("demandas")
          .select("id,dados")
          .order("id")
          .range(inicio, inicio + TAMANHO_PAGINA - 1),
      );
      todas.push(...pagina.map(demandaDaNuvem));
      if (pagina.length < TAMANHO_PAGINA) return todas;
    }
  }

  async function buscarAdminPrincipal() {
    try {
      const email = await executar(cliente().rpc("acesso_admin_principal"));
      if (email) DemandasRoles.definirAdminPrincipal(email);
    } catch (erro) {
      DemandasLog.aviso("Administrador principal", erro);
    }
  }

  async function buscarMeta() {
    const linha = await executar(cliente().from("sistema_meta").select("dados").eq("id", "meta").maybeSingle());
    return linha ? linha.dados || {} : null;
  }

  const soTextos = (lista) => (Array.isArray(lista) ? lista.filter((id) => typeof id === "string" && id) : []);

  function aplicarMeta(meta) {
    metaDoServidor = {
      diarias: Array.isArray(meta.diarias) ? meta.diarias : [],
      projetistas: meta.projetistas && typeof meta.projetistas === "object" ? meta.projetistas : {},
      deletedDemandaIds: soTextos(meta.deletedDemandaIds),
      deletedDiariaIds: soTextos(meta.deletedDiariaIds),
      ...extrasDoMeta(meta),
    };
    acessos.aplicarDoMeta(meta);
    if (metaEnviado && Date.now() >= metaEnviado.ate) metaEnviado = null;
  }

  // A linha do meta sempre existe: se a leitura volta vazia, foi a RLS que recusou (a pessoa não tem acesso).
  function aplicarLeituraDoMeta(meta) {
    if (meta) {
      aplicarMeta(meta);
      return;
    }
    copiaLocal.negarAcesso();
    metaDoServidor = META_VAZIO();
    acessos.avisarQueOsPapeisMudaram();
  }

  async function carregarTudo() {
    carregando = true;
    try {
      const [demandas, meta] = await Promise.all([buscarDemandas(), buscarMeta(), buscarAdminPrincipal()]);
      demandasDoServidor = new Map(demandas.map((demanda) => [demanda.id, demanda]));
      aplicarLeituraDoMeta(meta);
      carregado = true;
      ultimaCarga = Date.now();
      entregarATela();
      return meta;
    } finally {
      carregando = false;
      if (idsParaReler.size) agendarReleituraDasDemandas();
    }
  }

  // ---------- Tempo real ----------

  function agendarReleituraDasDemandas() {
    if (timerReleituraDemandas) return;
    timerReleituraDemandas = setTimeout(() => {
      timerReleituraDemandas = null;
      void relerDemandasAlteradas();
    }, ATRASO_RELEITURA_MS);
  }

  async function relerDemandasAlteradas() {
    if (carregando || !idsParaReler.size) return;
    const ids = [...idsParaReler];
    idsParaReler.clear();
    try {
      const linhas = await executar(cliente().from("demandas").select("id,dados").in("id", ids));
      for (const id of ids) demandasDoServidor.delete(id);
      for (const linha of linhas) demandasDoServidor.set(linha.id, demandaDaNuvem(linha));
      entregarATela();
    } catch (erro) {
      DemandasLog.aviso("Reler demandas alteradas", erro);
      for (const id of ids) idsParaReler.add(id);
    }
  }

  function agendarReleituraDoMeta() {
    if (timerReleituraMeta) return;
    timerReleituraMeta = setTimeout(async () => {
      timerReleituraMeta = null;
      try {
        aplicarLeituraDoMeta(await buscarMeta());
        entregarATela();
      } catch (erro) {
        DemandasLog.aviso("Reler meta", erro);
      }
    }, ATRASO_RELEITURA_MS);
  }

  async function aoReconectar() {
    try {
      await enviarPendentes();
      await carregarTudo();
    } catch (erro) {
      DemandasLog.aviso("Atualizar ao reconectar", erro);
    }
  }

  function aoVoltarParaAba() {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    if (Date.now() - ultimaCarga >= INTERVALO_RECARGA_MS) void aoReconectar();
  }

  function assinarTempoReal() {
    canal = cliente()
      .channel("demandas-nuvem")
      .on("postgres_changes", { event: "*", schema: "public", table: "demandas" }, (evento) => {
        const id = evento?.new?.id || evento?.old?.id;
        if (!id) return;
        idsParaReler.add(id);
        agendarReleituraDasDemandas();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "sistema_meta" }, agendarReleituraDoMeta)
      .subscribe((estado, erro) => {
        if (estado === "SUBSCRIBED") {
          if (jaAssinou || carregado) void aoReconectar();
          jaAssinou = true;
        } else if (estado === "CHANNEL_ERROR" || estado === "TIMED_OUT") {
          DemandasLog.aviso(`Tempo real: ${estado}`, erro);
          if (carregado) avisarStatus("cache");
        }
      });
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", aoVoltarParaAba);
    if (typeof window.addEventListener === "function") window.addEventListener("online", aoVoltarParaAba);
  }

  // ---------- Gravação ----------

  async function gravarDemanda(demanda) {
    const { campos, remover } = demandaParaNuvem(demanda);
    await executar(cliente().rpc("demanda_salvar", { p_id: demanda.id, p_campos: campos, p_remover: remover }));
  }

  async function enviarPendentes() {
    const pendentes = copiaLocal.lerPendentes();
    for (const [id, demanda] of Object.entries(pendentes)) {
      try {
        await gravarDemanda(demanda);
        delete pendentes[id];
      } catch (erro) {
        if (ehErroDeRede(erro)) break;
        DemandasLog.aviso("Alteração pendente recusada", erro);
        delete pendentes[id];
      }
    }
    copiaLocal.gravarPendentes(pendentes);
  }

  async function upsertDemanda(demanda) {
    if (!demanda?.id) return;
    demandasEmEnvio.add(demanda.id);
    try {
      avisarStatus("saving");
      await gravarDemanda(demanda);
      const pendentes = copiaLocal.lerPendentes();
      if (pendentes[demanda.id]) {
        delete pendentes[demanda.id];
        copiaLocal.gravarPendentes(pendentes);
      }
      avisarStatus("synced");
    } catch (erro) {
      if (!ehErroDeRede(erro)) throw erro;
      copiaLocal.gravarPendentes({ ...copiaLocal.lerPendentes(), [demanda.id]: demanda });
      avisarStatus("cache");
      throw new Error("Sem conexão: a alteração ficou guardada neste aparelho e será enviada ao reconectar.");
    } finally {
      setTimeout(() => demandasEmEnvio.delete(demanda.id), ATRASO_APOS_ENVIO_MS);
    }
  }

  async function deleteDemanda(id) {
    if (!id) return;
    const estado = normalizarEstado(copiaLocal.carregar() || estadoVazio());
    if (!estado.pendingDeleteDemandaIds.includes(id)) estado.pendingDeleteDemandaIds.push(id);
    if (!estado.deletedDemandaIds.includes(id)) estado.deletedDemandaIds.push(id);
    estado.demandas = estado.demandas.filter((demanda) => demanda.id !== id);
    copiaLocal.salvar(estado);
    avisarStatus("saving");
    await executar(cliente().rpc("demanda_excluir", { p_id: id }));
    avisarStatus("synced");
  }

  async function patchDemandaPresence(demandaId, editingBy) {
    if (!demandaId) return;
    await executar(
      cliente().rpc("demanda_presenca", {
        p_id: demandaId,
        p_editing_by: editingBy || null,
        p_editing_at: editingBy ? editingBy.since || new Date().toISOString() : null,
      }),
    );
  }

  async function persistMeta(meta) {
    avisarStatus("saving");
    const campos = {
      diarias: meta.diarias || [],
      projetistas: meta.projetistas || {},
      deletedDiariaIds: meta.deletedDiariaIds || [],
    };
    metaEnviado = { ...campos, ate: Date.now() + JANELA_DO_META_ENVIADO_MS };
    try {
      await executar(cliente().rpc("meta_salvar", { p_campos: campos }));
      avisarStatus("synced");
    } finally {
      setTimeout(() => {
        if (metaEnviado && Date.now() >= metaEnviado.ate) metaEnviado = null;
      }, JANELA_DO_META_ENVIADO_MS);
    }
  }

  async function persistMetaFields(campos) {
    const extras = extrasDoMeta(campos);
    if (!Object.keys(extras).length) return;
    avisarStatus("saving");
    await executar(cliente().rpc("meta_salvar", { p_campos: extras }));
    avisarStatus("synced");
  }

  async function importFullState(dados) {
    const estado = normalizarEstado(dados);
    for (const demanda of estado.demandas) {
      if (demanda?.id) await upsertDemanda(demanda);
    }
    await persistMeta({ diarias: estado.diarias, projetistas: estado.projetistas, deletedDiariaIds: estado.deletedDiariaIds || [] });
  }

  // ---------- Início e fim da sessão ----------

  async function iniciarNuvem({ onData, onStatus, onRoles }) {
    avisarStatus = onStatus || (() => {});
    entregarDados = onData;
    acessos.configurar({ aoMudarPapeis: onRoles, aoMudarStatus: avisarStatus });
    avisarStatus("connecting");
    window.__demandasSyncHint = "";

    copiaLocal.manterSoACopiaDoUsuarioAtual();
    const copia = copiaLocal.carregar();
    if (copia && onData) {
      onData(mesclarEstado({ demandas: [], ...metaDoServidor }, copia));
      avisarStatus("cache");
    }
    assinarTempoReal();
    try {
      await enviarPendentes();
      await acessos.completarLista(await carregarTudo());
    } catch (erro) {
      DemandasLog.aviso("Carregar da nuvem", erro);
      carregado = true;
      avisarStatus("error");
      window.__demandasSyncHint = erro.message || "Não foi possível carregar da nuvem. Exibindo a cópia local.";
      entregarCopiaLocalAposFalha();
    }

    return {
      mode: "nuvem",
      acessosCarregados: acessos.listaCarregada,
      acessoNegado: copiaLocal.acessoFoiNegado,
      upsertDemanda,
      deleteDemanda,
      patchDemandaPresence,
      persistMeta,
      persistMetaFields,
      persistRoles: acessos.salvarPapeis,
      appendAccessHistory: acessos.registrarHistorico,
      loadAccessHistory: acessos.lerHistorico,
      importFullState,
    };
  }

  /** Sem nuvem configurada (desenvolvimento local): os dados ficam só neste navegador. */
  function iniciarSemNuvem({ onData, onStatus, onRoles }) {
    avisarStatus = onStatus || (() => {});
    acessos.configurar({ aoMudarPapeis: onRoles, aoMudarStatus: avisarStatus });
    onData(copiaLocal.carregar() || estadoVazio());
    acessos.aplicarSoOsPapeis(DemandasRoles.getRolesMap());
    avisarStatus("local");
    const semEfeito = async () => {};
    return {
      mode: "local",
      acessosCarregados: () => true,
      acessoNegado: () => false,
      upsertDemanda: semEfeito,
      deleteDemanda: semEfeito,
      patchDemandaPresence: semEfeito,
      persistMeta: semEfeito,
      persistMetaFields: semEfeito,
      persistRoles: async (papeis) => acessos.salvarPapeisSoNaTela(papeis),
      importFullState: semEfeito,
    };
  }

  function teardown() {
    if (canal) {
      void cliente()?.removeChannel?.(canal);
      canal = null;
    }
    clearTimeout(timerReleituraDemandas);
    clearTimeout(timerReleituraMeta);
    clearTimeout(timerCopiaLocal);
    timerReleituraDemandas = null;
    timerReleituraMeta = null;
    timerCopiaLocal = null;
    copiaLocalAgendada = null;
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", aoVoltarParaAba);
    if (typeof window.removeEventListener === "function") window.removeEventListener("online", aoVoltarParaAba);
    idsParaReler.clear();
    acessos.reiniciar();
    copiaLocal.reiniciar();
    entregarDados = null;
    demandasDoServidor = new Map();
    metaDoServidor = META_VAZIO();
    carregado = false;
    carregando = false;
    jaAssinou = false;
  }

  async function init(retornos) {
    void copiaLocal.apagarRestosDoFirebase();
    if (!nuvemConfigurada()) {
      window.__demandasSyncHint = "Configure supabase-config.js";
      return iniciarSemNuvem(retornos);
    }
    if (!DemandasAuth.currentUser()) {
      window.__demandasSyncHint = "Faça login para acessar a nuvem.";
      throw new Error(window.__demandasSyncHint);
    }
    return iniciarNuvem(retornos);
  }

  // ---------- Funções do servidor e backups ----------

  async function erroDaFuncao(erro) {
    const resposta = erro?.context;
    let corpo = null;
    if (typeof resposta?.json === "function") {
      try {
        corpo = await resposta.json();
      } catch (_) {}
    }
    const status = resposta?.status;
    const codigo = corpo?.erro?.codigo || (status === 404 ? "not-found" : status === 401 ? "unauthenticated" : "unavailable");
    const mensagem = corpo?.erro?.mensagem || (status ? corpo?.message || erro.message : "Sem conexão com o servidor. Tente de novo.");
    return Object.assign(new Error(mensagem), { code: `functions/${codigo}` });
  }

  async function chamar(nome, dados = {}) {
    const c = cliente();
    if (!c) throw Object.assign(new Error("Recarregue a página (Ctrl+F5) para carregar as funções."), { code: "functions/unavailable" });
    const { data, error } = await c.functions.invoke(FUNCAO_API, { body: { acao: nome, dados } });
    if (error) throw await erroDaFuncao(error);
    return { data };
  }

  async function ultimoBackup() {
    const linha = await executar(cliente().from("sistema_backups").select("info").eq("id", "ultimo").maybeSingle());
    return linha?.info || null;
  }

  async function listarBackups() {
    const opcoes = { limit: 1000, sortBy: { column: "name", order: "desc" } };
    const { data, error } = await cliente().storage.from(BUCKET_BACKUPS).list("", opcoes);
    if (error) throw erroDoBanco(error);
    return (data || []).filter((arquivo) => String(arquivo.name || "").endsWith(".json"));
  }

  async function linkDoBackup(nome) {
    const { data, error } = await cliente().storage.from(BUCKET_BACKUPS).createSignedUrl(nome, 300, { download: true });
    if (error) throw erroDoBanco(error);
    return data.signedUrl;
  }

  return {
    APAGAR,
    init,
    teardown,
    isConfigured: nuvemConfigurada,
    loadLocal: copiaLocal.carregar,
    saveLocal: copiaLocal.salvar,
    apagarCopiasLocais: copiaLocal.apagarCopias,
    chamar,
    ultimoBackup,
    listarBackups,
    linkDoBackup,
  };
})();
