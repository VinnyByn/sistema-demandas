/** Anexos: envio de arquivos do app direto para a tarefa do Asana (não ficam guardados no nosso banco). */
import { Buffer } from "node:buffer";
import { ASANA_API, ANEXO_MAX_BYTES } from "./constantes.mjs";
import { AsanaErro, erroDaResposta, gidSeguro, lerResposta } from "./cliente.mjs";
import { comentarioIntegracao, textoDoAnexo } from "./demanda.mjs";

const TAMANHO_MAX_DO_NOME = 180;
const TIPO_PADRAO = "application/octet-stream";

function nomeArquivoSeguro(nome) {
  const nomeLimpo = String(nome || "")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .trim()
    .slice(0, TAMANHO_MAX_DO_NOME);
  return nomeLimpo || "arquivo";
}

function conteudoValidado(base64) {
  const conteudo = Buffer.from(String(base64 || ""), "base64");
  if (!conteudo.length) throw new AsanaErro("Arquivo vazio.", 400);
  if (conteudo.length > ANEXO_MAX_BYTES) throw new AsanaErro("Arquivo maior que 10 MB — anexe direto no Asana.", 400);
  return conteudo;
}

async function enviarAoAsana({ token, fetchImpl, taskId, nomeDoArquivo, tipo, conteudo }) {
  const formulario = new FormData();
  formulario.append("parent", taskId);
  formulario.append("file", new Blob([conteudo], { type: String(tipo || TIPO_PADRAO) }), nomeDoArquivo);

  const resposta = await fetchImpl(`${ASANA_API}/attachments?opt_fields=gid,name,permalink_url`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    body: formulario,
  });
  const corpo = await lerResposta(resposta);
  if (!resposta.ok) throw erroDaResposta(resposta.status, corpo);
  return corpo.json.data || {};
}

/** Anexa um arquivo na tarefa atual da demanda e registra no projeto um comentário com o link. */
async function anexarArquivo({ repositorio: repo, token, fetchImpl = fetch, demandaId, nome, tipo, base64, autor }) {
  const demandaEncontrada = await repo.buscarDemanda(demandaId);
  if (!demandaEncontrada) throw new AsanaErro("Demanda não encontrada.", 404);

  const taskId = String(demandaEncontrada.dados.asanaTaskId || "").trim();
  if (!gidSeguro(taskId)) throw new AsanaErro("Esta demanda ainda não tem tarefa no Asana.", 400);

  const conteudo = conteudoValidado(base64);
  const nomeDoArquivo = nomeArquivoSeguro(nome);
  const anexoCriado = await enviarAoAsana({ token, fetchImpl, taskId, nomeDoArquivo, tipo, conteudo });
  const nomeNoAsana = anexoCriado.name || nomeDoArquivo;

  const comentario = comentarioIntegracao(textoDoAnexo(nomeNoAsana, anexoCriado.permalink_url), {
    autor: String(autor || "").trim() || "Asana · Operação",
  });
  await repo.adicionarComentario(demandaId, comentario);

  // Registra o anexo para o webhook não repetir o aviso quando o Asana notificar este mesmo envio.
  if (anexoCriado.gid) await repo.registrarAnexo(anexoCriado.gid, { demandaId, em: new Date().toISOString() });

  return {
    gid: String(anexoCriado.gid || ""),
    nome: nomeNoAsana,
    url: anexoCriado.permalink_url || "",
    comentario,
  };
}

export { anexarArquivo };
