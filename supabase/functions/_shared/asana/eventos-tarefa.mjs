/** Asana → sistema: o que acontece com a própria tarefa (excluída, concluída, reaberta ou movida de coluna). */
import { MAX_ORDENS_ANTERIORES, REMOVER_CAMPO } from "./constantes.mjs";
import { criarCliente } from "./cliente.mjs";
import { normalizarTexto, registrarAviso, reabrirOrdem } from "./demanda.mjs";

const ACEITA_404 = { okStatuses: [404] };
const COLUNA_CONCLUIDA = "concluida";
const COLUNA_EM_ANDAMENTO = "andamento";

const foiEncontrado = (respostaDoAsana) => respostaDoAsana && !respostaDoAsana.__status;

function tipoDaColuna(nomeDaColuna) {
  const coluna = normalizarTexto(nomeDaColuna);
  if (coluna.includes("conclu")) return COLUNA_CONCLUIDA;
  if (coluna.includes("andamento")) return COLUNA_EM_ANDAMENTO;
  return "";
}

/** A tarefa do evento pode ser a ordem atual da demanda ou uma já substituída: só a atual muda o estado da demanda. */
function ordemDaTarefa(demandaEncontrada, taskGid) {
  const demanda = demandaEncontrada.dados;
  const ehAtual = demanda.asanaTaskId === taskGid;
  return {
    demandaId: demandaEncontrada.id,
    demanda,
    taskGid,
    ehAtual,
    rotulo: ehAtual ? "a tarefa" : "uma ordem anterior",
    estavaConcluida: ehAtual && !!demanda.asana?.concluidaEm,
  };
}

async function avisarConclusao(repo, ordem, { texto, secao = "", concluidaEm }) {
  await registrarAviso(repo, ordem.demandaId, {
    tipo: "concluida",
    taskGid: ordem.taskGid,
    texto,
    camposExtras: ordem.ehAtual ? { asana: { ...(secao ? { secao } : {}), concluidaEm } } : {},
  });
}

/** Aplica a coluna em que a tarefa está. `chaveDaColuna` permite avisar de novo ao passar por outra coluna de andamento. */
async function aplicarColuna(repo, ordem, { nomeDaColuna, chaveDaColuna }) {
  const tipo = tipoDaColuna(nomeDaColuna);

  if (tipo === COLUNA_CONCLUIDA) {
    await avisarConclusao(repo, ordem, {
      texto: `A Operação concluiu ${ordem.rotulo} no Asana («${nomeDaColuna}»).`,
      secao: nomeDaColuna,
      concluidaEm: ordem.demanda.asana?.concluidaEm || new Date().toISOString(),
    });
    return "concluida";
  }

  if (ordem.estavaConcluida) await reabrirOrdem(repo, ordem.demandaId);

  if (tipo === COLUNA_EM_ANDAMENTO) {
    await registrarAviso(repo, ordem.demandaId, {
      tipo: "andamento",
      taskGid: ordem.taskGid,
      texto: `A Operação moveu ${ordem.rotulo} para «${nomeDaColuna}» no Asana.`,
      camposExtras: ordem.ehAtual ? { asana: { secao: nomeDaColuna } } : {},
      chaveExtra: chaveDaColuna,
    });
    return "andamento";
  }

  if (ordem.ehAtual && nomeDaColuna) await repo.mesclarDemanda(ordem.demandaId, { asana: { secao: nomeDaColuna } });
  return "secao";
}

/** Uma tarefa pode estar em vários projetos: prefere a coluna do projeto desta demanda. */
function colunaNoProjetoDaDemanda(tarefa, demanda) {
  const vinculos = Array.isArray(tarefa.memberships) ? tarefa.memberships : [];
  const vinculo =
    vinculos.find((v) => v?.project?.gid && v.project.gid === demanda.asana?.projetoGid) ||
    vinculos.find((v) => v?.section) ||
    null;
  const nome = String(vinculo?.section?.name || "").trim();
  return { nomeDaColuna: nome, chaveDaColuna: vinculo?.section?.gid || nome };
}

/** A mudança de coluna também chega como atividade: lê a situação atual da tarefa para gerar o aviso certo. */
async function avaliarSituacaoTarefa({ repo, chamarAsana, taskGid }) {
  const demandaEncontrada = await repo.buscarDemandaPorTarefa(taskGid);
  if (!demandaEncontrada) return "sem-demanda";
  const ordem = ordemDaTarefa(demandaEncontrada, taskGid);

  const tarefa = await chamarAsana(
    `/tasks/${taskGid}?opt_fields=completed,memberships.project.gid,memberships.section.gid,memberships.section.name`,
    ACEITA_404,
  );
  if (!foiEncontrado(tarefa)) return "ignorado";

  const coluna = colunaNoProjetoDaDemanda(tarefa, ordem.demanda);
  // Marcada como concluída em qualquer coluna: a coluna não é a única forma de concluir.
  if (tarefa.completed && tipoDaColuna(coluna.nomeDaColuna) !== COLUNA_CONCLUIDA) {
    await avisarConclusao(repo, ordem, {
      texto: `A Operação concluiu ${ordem.rotulo} no Asana${coluna.nomeDaColuna ? ` («${coluna.nomeDaColuna}»)` : ""}.`,
      secao: coluna.nomeDaColuna,
      concluidaEm: ordem.demanda.asana?.concluidaEm || new Date().toISOString(),
    });
    return "concluida";
  }
  return aplicarColuna(repo, ordem, coluna);
}

async function tarefaExcluida(repo, ordem) {
  if (!ordem.ehAtual) return "ignorado"; // cancelada pelo próprio sistema ou ordem antiga
  const anteriores = Array.isArray(ordem.demanda.asanaAnteriores) ? ordem.demanda.asanaAnteriores : [];
  const ordemEncerrada = { ...(ordem.demanda.asana || {}), excluidaNoAsanaEm: new Date().toISOString() };
  await registrarAviso(repo, ordem.demandaId, {
    tipo: "excluida",
    taskGid: ordem.taskGid,
    texto: 'A tarefa foi excluída no Asana — a ordem foi encerrada aqui. Use "Enviar à Operação" para abrir outra, se precisar.',
    camposExtras: {
      asana: REMOVER_CAMPO,
      asanaTaskId: REMOVER_CAMPO,
      asanaAnteriores: [...anteriores, ordemEncerrada].slice(-MAX_ORDENS_ANTERIORES),
    },
  });
  return "excluida";
}

async function tarefaMudouDeConclusao(repo, chamarAsana, ordem) {
  const tarefa = await chamarAsana(`/tasks/${ordem.taskGid}?opt_fields=completed`, ACEITA_404);
  if (!foiEncontrado(tarefa)) return "ignorado";
  if (!tarefa.completed) {
    if (!ordem.estavaConcluida) return "ignorado";
    await reabrirOrdem(repo, ordem.demandaId);
    return "reaberta";
  }
  await avisarConclusao(repo, ordem, {
    texto: `A Operação concluiu ${ordem.rotulo} no Asana.`,
    concluidaEm: new Date().toISOString(),
  });
  return "concluida";
}

async function tarefaEntrouEmColuna(repo, chamarAsana, ordem, secaoGid) {
  const secao = await chamarAsana(`/sections/${secaoGid}?opt_fields=name`, ACEITA_404);
  return aplicarColuna(repo, ordem, { nomeDaColuna: String(secao?.name || "").trim(), chaveDaColuna: secaoGid });
}

async function processarEventoTarefa({ repo, token, fetchImpl, evento }) {
  const taskGid = String(evento.resource?.gid || "");
  if (!taskGid) return "ignorado";
  const demandaEncontrada = await repo.buscarDemandaPorTarefa(taskGid);
  if (!demandaEncontrada) return "sem-demanda";

  const ordem = ordemDaTarefa(demandaEncontrada, taskGid);
  const chamarAsana = criarCliente(token, fetchImpl);

  if (evento.action === "deleted") return tarefaExcluida(repo, ordem);
  if (evento.action === "changed" && evento.change?.field === "completed") return tarefaMudouDeConclusao(repo, chamarAsana, ordem);
  if (evento.action === "added" && evento.parent?.resource_type === "section") return tarefaEntrouEmColuna(repo, chamarAsana, ordem, evento.parent.gid);
  return "ignorado";
}

export { avaliarSituacaoTarefa, processarEventoTarefa };
