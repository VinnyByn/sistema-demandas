/**
 * Acesso a dados da integração com o Asana. Cada operação é uma função SQL `asana_*` (ver supabase/migrations):
 * o que precisa ser atômico fica no Postgres, porque o cliente do Supabase não tem transação.
 * O comportamento esperado está em tests/unit/repositorio-contrato.test.mjs.
 */
import { REMOVER_CAMPO } from "./constantes.mjs";

const ehMapa = (valor) => Object.prototype.toString.call(valor) === "[object Object]";

// JSON.stringify descarta Symbol em silêncio: REMOVER_CAMPO precisa virar uma lista de caminhos.
// Mapa que só tinha remoções não vai: mapa vazio limparia o campo inteiro no merge.
function separarRemocoes(campos = {}, prefixo = []) {
  const remover = [];
  const mantidos = {};
  for (const [chave, valor] of Object.entries(campos)) {
    const caminho = [...prefixo, chave];
    if (valor === REMOVER_CAMPO) {
      remover.push(caminho);
    } else if (ehMapa(valor)) {
      const interno = separarRemocoes(valor, caminho);
      remover.push(...interno.remover);
      if (Object.keys(interno.campos).length || !interno.remover.length) mantidos[chave] = interno.campos;
    } else {
      mantidos[chave] = valor;
    }
  }
  return { campos: mantidos, remover };
}

function criarRepositorioSupabase(cliente) {
  async function chamar(funcao, args) {
    const { data, error } = await cliente.rpc(funcao, args);
    if (error) throw Object.assign(new Error(`Banco (${funcao}): ${error.message || error}`), { codigo: error.code });
    return data ?? null;
  }

  const argsDeCampos = (campos) => {
    const { campos: p_campos, remover: p_remover } = separarRemocoes(campos);
    return { p_campos, p_remover };
  };

  return {
    buscarDemanda: (demandaId) => chamar("asana_buscar_demanda", { p_demanda_id: demandaId }),
    buscarDemandaPorTarefa: (taskGid) => chamar("asana_buscar_demanda_por_tarefa", { p_task_gid: taskGid }),
    async listarComentarios(demandaId) {
      return (await chamar("asana_listar_comentarios", { p_demanda_id: demandaId })) || [];
    },

    async adicionarComentario(demandaId, comentario, camposExtras = {}) {
      await chamar("asana_adicionar_comentario", { p_demanda_id: demandaId, p_comentario: comentario, ...argsDeCampos(camposExtras) });
    },
    async editarComentario(demandaId, comentarioId, texto) {
      await chamar("asana_editar_comentario", { p_demanda_id: demandaId, p_comentario_id: comentarioId, p_texto: texto });
    },
    async removerComentario(demandaId, comentarioId) {
      await chamar("asana_remover_comentario", { p_demanda_id: demandaId, p_comentario_id: comentarioId });
    },
    async registrarAviso(demandaId, { aviso, comentario, camposExtras = {} }) {
      await chamar("asana_registrar_aviso", { p_demanda_id: demandaId, p_aviso: aviso, p_comentario: comentario, ...argsDeCampos(camposExtras) });
    },
    async mesclarDemanda(demandaId, campos) {
      await chamar("asana_mesclar_demanda", { p_demanda_id: demandaId, ...argsDeCampos(campos) });
    },

    buscarVinculoStory: (storyGid) => chamar("asana_buscar_vinculo_story", { p_story_gid: storyGid }),
    async salvarVinculoStory(storyGid, vinculo) {
      await chamar("asana_salvar_vinculo_story", {
        p_story_gid: storyGid,
        p_demanda_id: vinculo.demandaId,
        p_comentario_id: vinculo.comentarioId,
        p_origem: vinculo.origem,
      });
    },
    async apagarVinculoStory(storyGid) {
      await chamar("asana_apagar_vinculo_story", { p_story_gid: storyGid });
    },

    async reservarEnvio(demandaId, comentarioId, dados) {
      return (await chamar("asana_reservar_envio", { p_demanda_id: demandaId, p_comentario_id: comentarioId, p_dados: dados })) === true;
    },
    buscarEnvio: (demandaId, comentarioId) => chamar("asana_buscar_envio", { p_demanda_id: demandaId, p_comentario_id: comentarioId }),
    async atualizarEnvio(demandaId, comentarioId, campos) {
      await chamar("asana_atualizar_envio", { p_demanda_id: demandaId, p_comentario_id: comentarioId, p_campos: campos });
    },
    async apagarEnvio(demandaId, comentarioId) {
      await chamar("asana_apagar_envio", { p_demanda_id: demandaId, p_comentario_id: comentarioId });
    },

    async anexoRegistrado(attachmentGid) {
      return (await chamar("asana_anexo_registrado", { p_attachment_gid: String(attachmentGid) })) === true;
    },
    async registrarAnexo(attachmentGid, dados) {
      await chamar("asana_registrar_anexo", { p_attachment_gid: String(attachmentGid), p_demanda_id: dados.demandaId });
    },

    async buscarWebhook(projetoGid) {
      return (await chamar("asana_buscar_webhook", { p_projeto_gid: projetoGid })) || {};
    },
    async mesclarWebhook(projetoGid, campos) {
      await chamar("asana_mesclar_webhook", { p_projeto_gid: projetoGid, p_campos: campos });
    },
  };
}

export { criarRepositorioSupabase, separarRemocoes };
