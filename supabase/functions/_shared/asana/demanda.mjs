/** Regras da demanda ligadas ao Asana: textos dos comentários automáticos e avisos de situação. */
import { SUFIXO_AUTOR, REMOVER_CAMPO } from "./constantes.mjs";

function textoComentarioSistema(autor, texto) {
  return `${String(autor || "Equipe").trim() || "Equipe"}${SUFIXO_AUTOR}\n${String(texto || "").trim()}`;
}

function ehComentarioDoSistema(texto) {
  const primeiraLinha = String(texto || "").split("\n", 1)[0];
  return primeiraLinha.endsWith(SUFIXO_AUTOR);
}

/** Texto sem acento e em minúsculas, para comparar nomes de coluna ("Concluído" → "concluido"). */
function normalizarTexto(texto) {
  return String(texto || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

const REGEX_IMAGEM = /\.(png|jpe?g|gif|webp|heic|bmp)$/i;

function textoDoAnexo(nome, link) {
  const ehImagem = REGEX_IMAGEM.test(nome);
  const descricao = `${ehImagem ? "🖼️" : "📎"} Anexou ${ehImagem ? "a imagem" : "o arquivo"} «${nome}» no Asana`;
  return link ? `${descricao}\n${link}` : descricao;
}

function comentarioIntegracao(texto, camposExtras = {}) {
  return {
    id: `asana_sis_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    texto,
    autor: "Asana · Operação",
    createdAt: new Date().toISOString(),
    origem: "integracao",
    ...camposExtras,
  };
}

/**
 * Registra um aviso do Asana na demanda (comentário + alerta no sino), sem repetir o mesmo aviso.
 * A repetição é detectada pela chave `tipo:tarefa:chaveExtra`: use `chaveExtra` quando o mesmo tipo
 * de aviso puder acontecer de novo legitimamente (ex.: tarefa movida para outra coluna de andamento).
 */
async function registrarAviso(repo, demandaId, { tipo, taskGid, texto, camposExtras = {}, chaveExtra = "" }) {
  const agora = new Date().toISOString();
  await repo.registrarAviso(demandaId, {
    aviso: { tipo, texto, taskId: taskGid, em: agora, chave: `${tipo}:${taskGid}:${chaveExtra}` },
    comentario: comentarioIntegracao(texto),
    camposExtras,
  });
}

/** Tarefa voltou a ficar aberta no Asana: trava de novo a "nova ordem" e permite avisar outra conclusão. */
async function reabrirOrdem(repo, demandaId) {
  await repo.mesclarDemanda(demandaId, {
    asana: { concluidaEm: REMOVER_CAMPO },
    asanaAviso: { chave: `reaberta:${Date.now()}` },
  });
}

export {
  textoComentarioSistema,
  ehComentarioDoSistema,
  normalizarTexto,
  comentarioIntegracao,
  textoDoAnexo,
  registrarAviso,
  reabrirOrdem,
};
