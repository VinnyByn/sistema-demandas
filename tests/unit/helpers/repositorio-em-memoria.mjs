/**
 * Implementação em memória do contrato `RepositorioAsana` (ver repositorio-contrato.test.mjs), só para testes.
 * Guarda tudo em `docs` (Map "coleção/id" → dados), então os testes podem inspecionar ou alterar o
 * estado direto. Reproduz as regras do contrato: merge em profundidade, listas substituídas,
 * `REMOVER_CAMPO` apaga o campo e `registrarAviso` substitui o `asanaAviso` inteiro.
 */
import { REMOVER_CAMPO } from "../../../supabase/functions/_shared/asana/constantes.mjs";

const CHAVE_WEBHOOKS = "asanaIntegracao/webhooks";

const ehMapa = (v) => v && typeof v === "object" && !Array.isArray(v);

/** Copia o valor sem as chaves marcadas com REMOVER_CAMPO (structuredClone não aceita Symbol). */
function copiar(valor) {
  if (ehMapa(valor)) {
    return Object.fromEntries(Object.entries(valor).filter(([, v]) => v !== REMOVER_CAMPO).map(([k, v]) => [k, copiar(v)]));
  }
  return structuredClone(valor);
}

/** Mesmo merge do banco: mapas em profundidade, listas substituídas, mapa vazio limpa, REMOVER_CAMPO apaga. */
function mesclar(destino, campos) {
  for (const [chave, valor] of Object.entries(campos)) {
    if (valor === REMOVER_CAMPO) {
      delete destino[chave];
    } else if (ehMapa(valor) && Object.keys(valor).length && ehMapa(destino[chave])) {
      destino[chave] = mesclar({ ...destino[chave] }, valor);
    } else {
      destino[chave] = copiar(valor);
    }
  }
  return destino;
}

function repositorioEmMemoria(inicial = {}) {
  const docs = new Map(Object.entries(inicial).map(([caminho, dados]) => [caminho, structuredClone(dados)]));
  const chaveEnvio = (demandaId, comentarioId) => `asanaComentarios/${`${demandaId}__${comentarioId}`.replace(/\//g, "_")}`;
  const comentariosDe = (dados) => (Array.isArray(dados.comentarios) ? dados.comentarios : []);
  const lerClone = (caminho) => (docs.has(caminho) ? structuredClone(docs.get(caminho)) : null);

  // As operações abaixo não têm `await` entre ler e gravar: em memória, isso as torna atômicas.
  return {
    docs,

    async buscarDemanda(demandaId) {
      const dados = lerClone(`demandas/${demandaId}`);
      return dados ? { id: demandaId, dados } : null;
    },

    async buscarDemandaPorTarefa(taskGid) {
      const donas = [...docs.entries()].filter(([caminho]) => caminho.startsWith("demandas/") && caminho.split("/").length === 2);
      const achada =
        donas.find(([, d]) => (d.asanaTaskIds || []).includes(taskGid)) || donas.find(([, d]) => d.asanaTaskId === taskGid);
      return achada ? { id: achada[0].split("/")[1], dados: structuredClone(achada[1]) } : null;
    },

    async listarComentarios(demandaId) {
      return structuredClone(comentariosDe(docs.get(`demandas/${demandaId}`) || {}));
    },

    async adicionarComentario(demandaId, comentario, camposExtras = {}) {
      const dados = docs.get(`demandas/${demandaId}`);
      if (!dados) return;
      const comentarios = comentariosDe(dados);
      if (comentarios.some((c) => c && c.id === comentario.id)) return;
      mesclar(dados, { ...camposExtras, comentarios: [comentario, ...comentarios], comentariosServidorAt: new Date().toISOString() });
    },

    async editarComentario(demandaId, comentarioId, texto) {
      const dados = docs.get(`demandas/${demandaId}`);
      if (!dados) return;
      mesclar(dados, {
        comentarios: comentariosDe(dados).map((c) =>
          c && c.id === comentarioId && c.texto !== texto ? { ...c, texto, editadoEm: new Date().toISOString() } : c,
        ),
        comentariosServidorAt: new Date().toISOString(),
      });
    },

    async removerComentario(demandaId, comentarioId) {
      const dados = docs.get(`demandas/${demandaId}`);
      if (!dados) return;
      mesclar(dados, {
        comentarios: comentariosDe(dados).filter((c) => !(c && c.id === comentarioId)),
        comentariosServidorAt: new Date().toISOString(),
      });
    },

    async registrarAviso(demandaId, { aviso, comentario, camposExtras = {} }) {
      const dados = docs.get(`demandas/${demandaId}`);
      if (!dados) return;
      if (dados.asanaAviso?.chave === aviso.chave) {
        if (Object.keys(camposExtras).length) mesclar(dados, camposExtras);
        return;
      }
      mesclar(dados, { ...camposExtras, comentarios: [comentario, ...comentariosDe(dados)], comentariosServidorAt: aviso.em });
      dados.asanaAviso = structuredClone(aviso); // substitui o aviso inteiro: não herda o "ciente" do anterior
    },

    async mesclarDemanda(demandaId, campos) {
      const caminho = `demandas/${demandaId}`;
      docs.set(caminho, mesclar(docs.get(caminho) || {}, campos));
    },

    async buscarVinculoStory(storyGid) {
      return lerClone(`asanaStories/${storyGid}`);
    },
    async salvarVinculoStory(storyGid, vinculo) {
      docs.set(`asanaStories/${storyGid}`, structuredClone(vinculo));
    },
    async apagarVinculoStory(storyGid) {
      docs.delete(`asanaStories/${storyGid}`);
    },

    async reservarEnvio(demandaId, comentarioId, dados) {
      const caminho = chaveEnvio(demandaId, comentarioId);
      if (docs.has(caminho)) return false;
      docs.set(caminho, structuredClone({ demandaId, comentarioId, ...dados }));
      return true;
    },
    async buscarEnvio(demandaId, comentarioId) {
      return lerClone(chaveEnvio(demandaId, comentarioId));
    },
    async atualizarEnvio(demandaId, comentarioId, campos) {
      const caminho = chaveEnvio(demandaId, comentarioId);
      docs.set(caminho, mesclar(docs.get(caminho) || {}, campos));
    },
    async apagarEnvio(demandaId, comentarioId) {
      docs.delete(chaveEnvio(demandaId, comentarioId));
    },

    async anexoRegistrado(attachmentGid) {
      return docs.has(`asanaAnexos/${attachmentGid}`);
    },
    async registrarAnexo(attachmentGid, dados) {
      docs.set(`asanaAnexos/${attachmentGid}`, structuredClone(dados));
    },

    async buscarWebhook(projetoGid) {
      return structuredClone(docs.get(CHAVE_WEBHOOKS)?.[projetoGid] || {});
    },
    async mesclarWebhook(projetoGid, campos) {
      docs.set(CHAVE_WEBHOOKS, mesclar(docs.get(CHAVE_WEBHOOKS) || {}, { [projetoGid]: campos }));
    },
  };
}

export { repositorioEmMemoria, CHAVE_WEBHOOKS };
