/** Sistema → Asana: publica, edita ou apaga no Asana o comentário digitado no sistema. */
import { AsanaErro, criarCliente, gidSeguro } from "./cliente.mjs";
import { textoComentarioSistema } from "./demanda.mjs";

/**
 * `autor`/`email` vêm do servidor (quem está logado). Editar: só quem publicou ou um administrador,
 * e o nome que aparece no Asana continua o de quem publicou.
 */
async function sincronizarComentario({ repositorio: repo, token, fetchImpl, demandaId, acao, comentarioId, texto, autor, email = "", admin = false }) {
  const demandaEncontrada = await repo.buscarDemanda(demandaId);
  if (!demandaEncontrada) throw new AsanaErro("Demanda não encontrada.", 404);
  const taskId = String(demandaEncontrada.dados.asanaTaskId || "").trim();
  if (!gidSeguro(taskId)) return { ignorado: "sem-tarefa" };
  const chamarAsana = criarCliente(token, fetchImpl);

  if (acao === "criar") {
    // A reserva funciona como trava contra envio duplicado do mesmo comentário.
    const reservou = await repo.reservarEnvio(demandaId, comentarioId, {
      estado: "enviando",
      criadoEm: new Date().toISOString(),
      ...(email ? { email: String(email).toLowerCase() } : {}),
      ...(autor ? { autor: String(autor) } : {}),
    });
    if (!reservou) return { ignorado: "ja-enviado" }; // outra chamada já está enviando/enviou este comentário
    let storyCriada;
    try {
      storyCriada = await chamarAsana(`/tasks/${taskId}/stories?opt_fields=gid`, {
        method: "POST",
        data: { text: textoComentarioSistema(autor, texto) },
      });
    } catch (erro) {
      await repo.apagarEnvio(demandaId, comentarioId); // libera a trava para uma nova tentativa
      throw erro;
    }
    const storyGid = String(storyCriada?.gid || "");
    await Promise.all([
      repo.atualizarEnvio(demandaId, comentarioId, { storyGid, estado: "ok" }),
      repo.salvarVinculoStory(storyGid, { demandaId, comentarioId, origem: "sistema" }),
    ]);
    return { storyGid };
  }

  const registroEnvio = await repo.buscarEnvio(demandaId, comentarioId);
  if (!registroEnvio?.storyGid) return { ignorado: "nao-enviado" };
  if (acao === "editar") {
    if (registroEnvio.email && email && registroEnvio.email !== String(email).toLowerCase() && !admin) {
      throw new AsanaErro("Só quem escreveu o comentário (ou um administrador) pode editá-lo.", 403);
    }
    await chamarAsana(`/stories/${registroEnvio.storyGid}`, {
      method: "PUT",
      data: { text: textoComentarioSistema(registroEnvio.autor || autor, texto) },
    });
    return { storyGid: registroEnvio.storyGid };
  }
  if (acao === "apagar") {
    await chamarAsana(`/stories/${registroEnvio.storyGid}`, { method: "DELETE", okStatuses: [404] });
    await Promise.all([repo.apagarEnvio(demandaId, comentarioId), repo.apagarVinculoStory(registroEnvio.storyGid)]);
    return { storyGid: registroEnvio.storyGid };
  }
  throw new AsanaErro("Ação inválida.", 400);
}

export { sincronizarComentario };
