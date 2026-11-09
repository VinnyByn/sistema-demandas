/**
 * Junta o que veio do servidor com a cópia local, sem acessar nada de fora.
 * `emEnvio` traz o que este navegador acabou de enviar e o servidor ainda pode não ter refletido: { demandaIds, meta }.
 */
const DemandasMesclagem = (function () {
  const CHAVES_EXTRAS_DO_META = ["metasEtapa", "filtrosSalvos"];
  const NADA_EM_ENVIO = { demandaIds: new Set(), meta: null };

  function extrasDoMeta(origem) {
    const extras = {};
    for (const chave of CHAVES_EXTRAS_DO_META) {
      if (origem && origem[chave] && typeof origem[chave] === "object") extras[chave] = origem[chave];
    }
    return extras;
  }

  function estadoVazio() {
    return {
      demandas: [],
      diarias: [],
      projetistas: {},
      pendingDeleteDemandaIds: [],
      deletedDemandaIds: [],
      deletedDiariaIds: [],
    };
  }

  const listaSemVazios = (valor) => (Array.isArray(valor) ? valor.filter((item) => item) : []);

  function normalizarEstado(dados) {
    if (!dados || typeof dados !== "object") return estadoVazio();
    return {
      demandas: Array.isArray(dados.demandas) ? dados.demandas : [],
      diarias: Array.isArray(dados.diarias) ? dados.diarias : [],
      projetistas: dados.projetistas && typeof dados.projetistas === "object" ? dados.projetistas : {},
      pendingDeleteDemandaIds: listaSemVazios(dados.pendingDeleteDemandaIds),
      deletedDemandaIds: listaSemVazios(dados.deletedDemandaIds),
      deletedDiariaIds: listaSemVazios(dados.deletedDiariaIds),
      ...extrasDoMeta(dados),
    };
  }

  function idsExcluidos(estado) {
    const normalizado = normalizarEstado(estado);
    return new Set([...normalizado.pendingDeleteDemandaIds, ...normalizado.deletedDemandaIds]);
  }

  function semExcluidas(lista, excluidos) {
    if (!excluidos?.size) return lista || [];
    return (lista || []).filter((item) => item?.id && !excluidos.has(item.id));
  }

  function momentoDe(item) {
    const momento = Date.parse(item?.updatedAt || item?.createdAt || 0);
    return Number.isFinite(momento) ? momento : 0;
  }

  /** Presença vem sempre do servidor: a cópia local pode mostrar alguém que já saiu do projeto. */
  function copiarPresencaDoRemoto(destino, remota) {
    if (remota.editingBy) destino.editingBy = remota.editingBy;
    else delete destino.editingBy;
    if (remota.editingAt) destino.editingAt = remota.editingAt;
    else delete destino.editingAt;
  }

  function mesclarDemandas(locais, remotas, excluidos, { confiarNoRemoto, emEnvio }) {
    const porId = new Map();
    const idsRemotos = new Set((remotas || []).filter((d) => d?.id).map((d) => d.id));

    for (const local of locais || []) {
      if (!local?.id || excluidos.has(local.id)) continue;
      // Sumiu do servidor e não foi este navegador que acabou de criar: foi apagada por alguém.
      if (confiarNoRemoto && !idsRemotos.has(local.id) && !emEnvio.demandaIds.has(local.id)) continue;
      porId.set(local.id, local);
    }

    for (const remota of remotas || []) {
      if (!remota?.id || excluidos.has(remota.id)) continue;
      const local = porId.get(remota.id);
      if (!local || momentoDe(remota) > momentoDe(local)) {
        porId.set(remota.id, remota);
      } else if (momentoDe(remota) === momentoDe(local)) {
        const juntas = { ...local, ...remota };
        copiarPresencaDoRemoto(juntas, remota);
        porId.set(remota.id, juntas);
      }
    }
    return [...porId.values()];
  }

  function mesclarDiarias(locais, remotas, excluidas, { confiarNoRemoto, emEnvio }) {
    const porId = new Map();
    const enviadas = semExcluidas(emEnvio.meta?.diarias, excluidas);
    const idsEnviados = new Set(enviadas.map((diaria) => diaria.id));

    for (const remota of semExcluidas(remotas, excluidas)) porId.set(remota.id, remota);

    for (const local of semExcluidas(locais, excluidas)) {
      const atual = porId.get(local.id);
      if (atual) {
        if (momentoDe(local) >= momentoDe(atual)) porId.set(local.id, local);
      } else if (!confiarNoRemoto || idsEnviados.has(local.id) || momentoDe(local)) {
        porId.set(local.id, local);
      }
    }

    for (const enviada of enviadas) {
      const atual = porId.get(enviada.id);
      if (!atual || momentoDe(enviada) >= momentoDe(atual)) porId.set(enviada.id, enviada);
    }
    return [...porId.values()];
  }

  function momentoDoProjetista(registro) {
    if (!registro) return 0;
    const momento = momentoDe(registro);
    if (momento) return momento;
    const desde = Date.parse(registro.desde || 0);
    return Number.isFinite(desde) ? desde : 0;
  }

  function mesclarProjetistas(locais, remotos, { emEnvio }) {
    const enviados = emEnvio.meta?.projetistas;
    const resultado = {};
    const nomes = new Set([...Object.keys(remotos || {}), ...Object.keys(locais || {}), ...Object.keys(enviados || {})]);
    for (const nome of nomes) {
      const candidatos = [remotos?.[nome], locais?.[nome], enviados?.[nome]].filter(Boolean);
      if (!candidatos.length) continue;
      resultado[nome] = candidatos.reduce((melhor, atual) => (momentoDoProjetista(atual) >= momentoDoProjetista(melhor) ? atual : melhor));
    }
    return resultado;
  }

  function mesclarEstado(remoto, local, { confiarNoRemoto = false, emEnvio = NADA_EM_ENVIO } = {}) {
    const doServidor = normalizarEstado(remoto);
    const daCopia = normalizarEstado(local);
    if (!local) return { ...doServidor, demandas: semExcluidas(doServidor.demandas, idsExcluidos(doServidor)) };
    if (!remoto) return daCopia;

    const opcoes = { confiarNoRemoto, emEnvio };
    const excluidasNoServidor = new Set(doServidor.deletedDemandaIds);
    const demandasExcluidas = new Set([...idsExcluidos(daCopia), ...excluidasNoServidor]);
    const diariasExcluidas = [...new Set([...daCopia.deletedDiariaIds, ...doServidor.deletedDiariaIds])];

    return {
      demandas: mesclarDemandas(daCopia.demandas, doServidor.demandas, demandasExcluidas, opcoes),
      diarias: mesclarDiarias(daCopia.diarias, doServidor.diarias, new Set(diariasExcluidas), opcoes),
      projetistas: mesclarProjetistas(daCopia.projetistas, doServidor.projetistas, opcoes),
      pendingDeleteDemandaIds: daCopia.pendingDeleteDemandaIds,
      deletedDemandaIds: [...new Set([...daCopia.deletedDemandaIds, ...excluidasNoServidor])],
      deletedDiariaIds: diariasExcluidas,
      ...extrasDoMeta(daCopia),
      ...extrasDoMeta(doServidor),
    };
  }

  /** A exclusão pendente que já sumiu do servidor foi confirmada: vira definitiva. */
  function confirmarExclusoes(estado, demandasRemotas) {
    const idsRemotos = new Set((demandasRemotas || []).map((demanda) => demanda.id));
    const pendentes = estado.pendingDeleteDemandaIds || [];
    const aindaPendentes = pendentes.filter((id) => idsRemotos.has(id));
    const confirmadas = pendentes.filter((id) => !idsRemotos.has(id));
    const excluidas = [...new Set([...(estado.deletedDemandaIds || []), ...confirmadas])];
    return {
      ...estado,
      pendingDeleteDemandaIds: aindaPendentes,
      deletedDemandaIds: excluidas,
      demandas: semExcluidas(estado.demandas, new Set([...aindaPendentes, ...excluidas])),
    };
  }

  return { extrasDoMeta, estadoVazio, normalizarEstado, mesclarEstado, confirmarExclusoes };
})();
