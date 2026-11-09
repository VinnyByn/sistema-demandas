/**
 * Integração com o Asana: envio da demanda à Operação e comentários nos dois sentidos
 * (sistema → Asana pela função api; Asana → sistema pela função asana-webhook).
 * Tudo recebe as dependências por parâmetro (repositorio, token, fetch) para poder ser testado sem rede.
 */
import { ASANA_PROJETOS, ANEXO_MAX_BYTES } from "./constantes.mjs";
import { AsanaErro } from "./cliente.mjs";
import { textoComentarioSistema, ehComentarioDoSistema } from "./demanda.mjs";
import { projetoValido, nomesDosProjetos } from "./projetos.mjs";
import { garantirWebhook, registrarHandshake, segredoDoWebhook, assinaturaValida } from "./webhook.mjs";
import { criarTarefa, cancelarTarefa } from "./tarefas.mjs";
import { anexarArquivo } from "./anexos.mjs";
import { sincronizarComentario } from "./comentarios.mjs";
import { processarEvento } from "./eventos.mjs";

export {
  ASANA_PROJETOS,
  AsanaErro,
  projetoValido,
  nomesDosProjetos,
  garantirWebhook,
  criarTarefa,
  cancelarTarefa,
  sincronizarComentario,
  anexarArquivo,
  ANEXO_MAX_BYTES,
  assinaturaValida,
  registrarHandshake,
  segredoDoWebhook,
  processarEvento,
  textoComentarioSistema,
  ehComentarioDoSistema,
};
