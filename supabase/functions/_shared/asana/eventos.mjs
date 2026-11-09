/** Asana → sistema: encaminha cada evento do webhook. O retorno diz o que foi feito (usado nos testes). */
import { processarEventoAtividade } from "./eventos-atividade.mjs";
import { processarEventoTarefa } from "./eventos-tarefa.mjs";

async function processarEvento({ repositorio: repo, token, fetchImpl, evento }) {
  const tipoDoRecurso = evento?.resource?.resource_type;
  if (tipoDoRecurso === "task") return processarEventoTarefa({ repo, token, fetchImpl, evento });
  if (tipoDoRecurso === "story") return processarEventoAtividade({ repo, token, fetchImpl, evento });
  return "ignorado";
}

export { processarEvento };
