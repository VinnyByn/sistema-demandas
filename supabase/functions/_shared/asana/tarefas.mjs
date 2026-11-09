/** Tarefa da Operação no Asana: criar (inclusive "nova ordem") e cancelar. */
import { APP_URL, MAX_ORDENS_ANTERIORES, REMOVER_CAMPO } from "./constantes.mjs";
import { AsanaErro, criarCliente, gidSeguro } from "./cliente.mjs";
import { projetoValido, nomesDosProjetos } from "./projetos.mjs";
import { garantirWebhook } from "./webhook.mjs";
import { comentarioIntegracao } from "./demanda.mjs";

async function buscarDemandaOuFalhar(repo, demandaId) {
  const demandaEncontrada = await repo.buscarDemanda(demandaId);
  if (!demandaEncontrada) throw new AsanaErro("Demanda não encontrada.", 404);
  return demandaEncontrada.dados;
}

function descricaoDaTarefa({ demanda, demandaId, instrucoes }) {
  return [
    "Instruções para a Operação:",
    instrucoes,
    "",
    "———",
    "Origem: Sistema Projetos Master",
    `ID da demanda: ${demandaId}`,
    `Tipo: ${demanda.tipo || "—"}`,
    `Cidade: ${demanda.cidade || "—"}`,
    `Projetista: ${demanda.responsavel || "Não atribuído"}`,
    `Solicitante: ${demanda.solicitante || "—"}`,
    `Abrir no sistema: ${APP_URL}/`,
    "",
    String(demanda.descricao || "").trim() || "Sem descrição.",
  ].join("\n");
}

/** O que gravar na demanda ao criar a tarefa. Com uma ordem aberta antes, ela vai para o histórico. */
function camposDaNovaOrdem({ demanda, dadosDaTarefa, temTarefaAtual, agora }) {
  const tarefasJaConhecidas = Array.isArray(demanda.asanaTaskIds) ? demanda.asanaTaskIds : [];
  const campos = {
    asanaTaskId: dadosDaTarefa.taskId,
    // A situação é da tarefa anterior: herdada, a ordem nova já nasceria "concluída" e liberaria outra sem terminar esta.
    asana: { ...dadosDaTarefa, concluidaEm: REMOVER_CAMPO, secao: REMOVER_CAMPO },
    // Todas as tarefas da demanda: o webhook acha a demanda por qualquer uma (comentário em ordem antiga).
    asanaTaskIds: [...new Set([...tarefasJaConhecidas, demanda.asanaTaskId, dadosDaTarefa.taskId].filter(Boolean))],
  };
  if (temTarefaAtual) {
    const anteriores = Array.isArray(demanda.asanaAnteriores) ? demanda.asanaAnteriores : [];
    campos.asanaAnteriores = [...anteriores, { ...demanda.asana, substituidaEm: agora }].slice(-MAX_ORDENS_ANTERIORES);
  }
  return campos;
}

/**
 * Cria a tarefa da Operação no Asana. Com novaOrdem, a tarefa atual vira "ordem anterior" (continua
 * no Asana e no histórico) e os próximos comentários passam a ir para a nova.
 */
async function criarTarefa({ repositorio: repo, token, fetchImpl, demandaId, instrucoes, projetoGid, email, endpoint, novaOrdem = false }) {
  const projeto = projetoValido(projetoGid);
  if (!projeto) throw new AsanaErro("Escolha em qual projeto do Asana a demanda vai entrar.", 400);

  const demanda = await buscarDemandaOuFalhar(repo, demandaId);
  const temTarefaAtual = !!(demanda.asanaTaskId && demanda.asana?.url);
  if (temTarefaAtual && !novaOrdem) {
    return { already: true, taskId: demanda.asanaTaskId, url: demanda.asana.url, projetoGid: demanda.asana.projetoGid || "" };
  }
  if (temTarefaAtual && !demanda.asana?.concluidaEm) {
    throw new AsanaErro("A ordem atual ainda não foi concluída no Asana — conclua (ou exclua) lá antes de abrir outra.", 400);
  }

  const chamarAsana = criarCliente(token, fetchImpl);
  const nomesReais = await nomesDosProjetos({ token, fetchImpl });
  const projetoNome = nomesReais.find((p) => p.gid === projeto.gid)?.nome || projeto.nome;

  const tarefaCriada = await chamarAsana("/tasks?opt_fields=gid,permalink_url", {
    method: "POST",
    data: {
      name: String(demanda.titulo || "Demanda").trim(),
      notes: descricaoDaTarefa({ demanda, demandaId, instrucoes }),
      projects: [projeto.gid],
    },
  });
  const taskId = String(tarefaCriada?.gid || "");
  const url = String(tarefaCriada?.permalink_url || `https://app.asana.com/0/${projeto.gid}/${taskId}`);
  const agora = new Date().toISOString();
  const dadosDaTarefa = { taskId, url, projetoGid: projeto.gid, projetoNome, createdAt: agora, createdBy: email || "", instrucoes };

  const abertura = temTarefaAtual ? "Nova ordem aberta" : "Demanda enviada à Operação";
  const comentario = comentarioIntegracao(`${abertura} no Asana (${projetoNome}).\nInstruções: ${instrucoes}\n${url}`);
  await repo.adicionarComentario(demandaId, comentario, camposDaNovaOrdem({ demanda, dadosDaTarefa, temTarefaAtual, agora }));

  try {
    await garantirWebhook({ repositorio: repo, token, fetchImpl, projetoGid: projeto.gid, endpoint });
  } catch (erro) {
    // A tarefa já foi criada: sem o webhook, só os comentários vindos do Asana deixam de chegar.
    console.warn("Webhook Asana:", erro.message || erro);
  }
  return { already: false, ...dadosDaTarefa, comentario };
}

async function cancelarTarefa({ repositorio: repo, token, fetchImpl, demandaId }) {
  const demanda = await buscarDemandaOuFalhar(repo, demandaId);
  const taskId = String(demanda.asanaTaskId || demanda.asana?.taskId || "").trim();
  if (gidSeguro(taskId)) {
    await criarCliente(token, fetchImpl)(`/tasks/${taskId}`, { method: "DELETE", okStatuses: [404] });
  }
  const comentario = comentarioIntegracao("Envio à Operação cancelado. A tarefa foi excluída no Asana.");
  await repo.adicionarComentario(demandaId, comentario, { asana: REMOVER_CAMPO, asanaTaskId: REMOVER_CAMPO });
  return { deleted: gidSeguro(taskId), comentario };
}

export { criarTarefa, cancelarTarefa };
