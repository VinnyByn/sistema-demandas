/**
 * Lista de acessos na nuvem: leva para a tela o que está no banco e grava o que o administrador muda.
 * A permissão real é conferida pelo banco; aqui só se decide o que mostrar.
 */
const DemandasAcessosNuvem = (function () {
  // Depois de salvar, ignora por um instante o meta relido: ele pode ser anterior à gravação e desfaria a mudança na tela.
  const JANELA_APOS_SALVAR_MS = 4000;

  let aoMudarPapeis = null;
  let aoMudarStatus = () => {};
  let listaCarregada = false;
  let ignorarMetaAte = 0;

  function configurar({ aoMudarPapeis: mudouPapeis, aoMudarStatus: mudouStatus }) {
    aoMudarPapeis = typeof mudouPapeis === "function" ? mudouPapeis : null;
    aoMudarStatus = mudouStatus || (() => {});
  }

  function reiniciar() {
    aoMudarPapeis = null;
    listaCarregada = false;
  }

  function avisarQueOsPapeisMudaram() {
    if (typeof aoMudarPapeis === "function") aoMudarPapeis(DemandasRoles.getRolesMap());
  }

  /** E-mail em minúsculas e papel como está salvo: a tela lê o papel do mesmo jeito que o banco. */
  function normalizarPapeis(papeis) {
    const resultado = {};
    if (!papeis || typeof papeis !== "object") return resultado;
    for (const [email, papel] of Object.entries(papeis)) {
      const emailNormalizado = String(email || "").trim().toLowerCase();
      if (!emailNormalizado || typeof papel !== "string" || !papel) continue;
      resultado[emailNormalizado] = papel.toLowerCase();
    }
    return resultado;
  }

  function papeisParaAplicar(recebidos, origem) {
    const novos = normalizarPapeis(recebidos);
    const atuais = normalizarPapeis(DemandasRoles.getRolesMap());
    if (origem === "substituir") return novos;
    // Mapa vazio vindo do servidor não apaga a lista da tela.
    if (origem === "servidor") return Object.keys(novos).length ? novos : atuais;
    return { ...atuais, ...novos };
  }

  /** A ordem importa: os removidos precisam estar prontos quando os papéis são montados. */
  function aplicarMapas({ papeis, desabilitados, removidos, regionais, nomes, telasIniciais }, origem) {
    const ehMapa = (valor) => !!valor && typeof valor === "object";
    if (ehMapa(removidos)) DemandasRoles.setPurgedMap(removidos);
    if (ehMapa(papeis)) DemandasRoles.setRolesMap(papeisParaAplicar(papeis, origem));
    if (ehMapa(desabilitados)) DemandasRoles.setDisabledMap(desabilitados);
    if (ehMapa(regionais)) DemandasRoles.setRegionalsMap(regionais);
    if (ehMapa(nomes)) DemandasRoles.setNamesMap(nomes);
    if (ehMapa(telasIniciais)) DemandasRoles.setHomesMap?.(telasIniciais);
    avisarQueOsPapeisMudaram();
  }

  function aplicarSoOsPapeis(papeis) {
    aplicarMapas({ papeis }, "juntar");
  }

  const mapaOuVazio = (valor) => (valor && typeof valor === "object" ? valor : {});

  /** Mapa ausente mantém o que a tela já tem, a não ser que os papéis tenham vindo: aí a ausência significa "ninguém marcado". */
  function marcasDoMeta(meta, chave) {
    if (Object.hasOwn(meta, chave)) return mapaOuVazio(meta[chave]);
    return Object.hasOwn(meta, "roles") ? {} : undefined;
  }

  const mapaOpcional = (meta, chave) => (Object.hasOwn(meta, chave) ? mapaOuVazio(meta[chave]) : undefined);

  function aplicarDoMeta(meta) {
    const trazAcessos = meta.roles || meta.disabledUsers || meta.purgedUsers;
    if (Date.now() < ignorarMetaAte || !trazAcessos) return;
    if (meta.roles && typeof meta.roles === "object") listaCarregada = true;
    aplicarMapas(
      {
        papeis: meta.roles && typeof meta.roles === "object" ? meta.roles : undefined,
        desabilitados: marcasDoMeta(meta, "disabledUsers"),
        removidos: marcasDoMeta(meta, "purgedUsers"),
        regionais: mapaOpcional(meta, "userRegionals"),
        nomes: mapaOpcional(meta, "userDisplayNames"),
        telasIniciais: mapaOpcional(meta, "userHomes"),
      },
      "servidor",
    );
  }

  function mapasAtuais() {
    return {
      desabilitados: DemandasRoles.getDisabledMap(),
      removidos: DemandasRoles.getPurgedMap(),
      regionais: DemandasRoles.getRegionalsMap(),
      nomes: DemandasRoles.getNamesMap(),
      telasIniciais: DemandasRoles.getHomesMap?.(),
    };
  }

  async function gravarMapas({ papeis, desabilitados, removidos, regionais, nomes, telasIniciais }) {
    const campos = {
      roles: papeis || {},
      disabledUsers: desabilitados || {},
      purgedUsers: removidos || {},
      userRegionals: regionais || {},
      userDisplayNames: nomes || {},
    };
    // Ausente = não mexe em userHomes: nunca apaga as telas iniciais por esquecimento.
    if (telasIniciais && typeof telasIniciais === "object") campos.userHomes = telasIniciais;
    await DemandasConsulta.executar(DemandasConsulta.cliente().rpc("acessos_salvar", { p_campos: campos }));
  }

  /** Banco novo: o administrador principal grava a si mesmo na lista na primeira entrada. */
  async function completarLista(meta) {
    if (!meta) return;
    if (!meta.roles) listaCarregada = true;

    const papeisNoBanco = normalizarPapeis(meta.roles);
    const papeisNaTela = DemandasRoles.getRolesMap();
    const removidos = DemandasRoles.getPurgedMap();
    const email = DemandasCopiaLocal.emailAtual();
    const adminPrincipal = String(window.DEMANDAS_ADMIN_EMAIL || "").trim().toLowerCase();
    const ehAdmin = email === adminPrincipal || papeisNoBanco[email] === "admin" || papeisNaTela[email] === "admin";
    const faltaNoBanco = Object.keys(window.DEMANDAS_ROLES_SEED || {}).some((e) => !papeisNoBanco[e] && !removidos[e]);
    if (!ehAdmin || (!faltaNoBanco && Object.keys(papeisNoBanco).length)) return;

    const atuais = mapasAtuais();
    try {
      await gravarMapas({ papeis: papeisNaTela, ...atuais });
      aplicarMapas({ papeis: papeisNaTela, ...atuais }, "substituir");
    } catch (erro) {
      DemandasLog.aviso("Completar acessos", erro);
    }
  }

  async function salvarPapeis(papeis) {
    if (!listaCarregada) {
      throw new Error("A lista de acessos ainda não carregou da nuvem. Aguarde alguns segundos e tente de novo.");
    }
    const novosPapeis = normalizarPapeis(papeis);
    const atuais = mapasAtuais();
    const adminPrincipal = String(window.DEMANDAS_ADMIN_EMAIL || "").trim().toLowerCase();
    if (adminPrincipal) {
      novosPapeis[adminPrincipal] = "admin";
      delete atuais.desabilitados[adminPrincipal];
      delete atuais.removidos[adminPrincipal];
    }

    aoMudarStatus("saving");
    ignorarMetaAte = Date.now() + JANELA_APOS_SALVAR_MS;
    try {
      await gravarMapas({ papeis: novosPapeis, ...atuais });
    } catch (erro) {
      ignorarMetaAte = 0;
      throw erro;
    }
    aplicarMapas({ papeis: novosPapeis, ...atuais }, "substituir");
    aoMudarStatus("synced");
    return DemandasRoles.getRolesMap();
  }

  /** Sem nuvem (desenvolvimento local): só atualiza a tela. */
  function salvarPapeisSoNaTela(papeis) {
    aplicarMapas({ papeis, ...mapasAtuais() }, "substituir");
    return DemandasRoles.getRolesMap();
  }

  async function registrarHistorico(entradas) {
    const validas = (entradas || []).filter((entrada) => entrada && entrada.alvo && entrada.acao);
    if (validas.length) await DemandasConsulta.executar(DemandasConsulta.cliente().rpc("acessos_historico_registrar", { p_entradas: validas }));
  }

  async function lerHistorico(limite = 30) {
    const linhas = await DemandasConsulta.executar(
      DemandasConsulta.cliente().from("acessos_historico").select("id,em,por,alvo,acao,de,para").order("em", { ascending: false }).limit(limite),
    );
    return linhas.map((linha) => ({ ...linha, de: linha.de ?? undefined, para: linha.para ?? undefined, em: new Date(linha.em).toISOString() }));
  }

  return {
    configurar,
    reiniciar,
    avisarQueOsPapeisMudaram,
    aplicarSoOsPapeis,
    aplicarDoMeta,
    completarLista,
    salvarPapeis,
    salvarPapeisSoNaTela,
    registrarHistorico,
    lerHistorico,
    listaCarregada: () => listaCarregada,
  };
})();
