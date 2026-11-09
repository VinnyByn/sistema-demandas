/** Valores fixos da integração com o Asana: endereços, projetos, marcas e limites. */

const ASANA_API = "https://app.asana.com/api/1.0";
const ASANA_WORKSPACE_GID = "1211507547180510";
const APP_URL = "https://demproj-fdeac.web.app";

/** Projetos ("pastas") do Asana em que a demanda pode entrar; o nome real vem da API. */
const ASANA_PROJETOS = [
  { gid: "1211582012771845", nome: "Projeto do Asana 1" },
  { gid: "1219543786224599", nome: "Projeto do Asana 2" },
];

/**
 * Marca neutra para "apagar este campo" nos dados gravados na demanda. Cada implementação do
 * repositório a traduz para o seu banco (ver repositorio-supabase.mjs).
 */
const REMOVER_CAMPO = Symbol("remover-campo");

/** Comentários que o sistema escreve no Asana começam assim — evita trazê-los de volta (loop). */
const SUFIXO_AUTOR = " (pelo sistema):";

/** Limite por arquivo enviado pelo app (em base64, o pedido fica cerca de 33% maior). */
const ANEXO_MAX_BYTES = 10 * 1024 * 1024;

/** Quantas ordens substituídas ficam guardadas na demanda. */
const MAX_ORDENS_ANTERIORES = 20;

/** Sobe quando os filtros do webhook mudam: o webhook antigo é recriado com os novos. */
const WEBHOOK_VERSAO = 2;
const WEBHOOK_FILTROS = [
  ...["added", "changed", "removed", "deleted"].map((action) => ({ resource_type: "story", action })),
  { resource_type: "task", action: "added" }, // entrou numa seção (coluna) do quadro
  { resource_type: "task", action: "changed", fields: ["completed"] },
  { resource_type: "task", action: "deleted" },
];

export {
  ASANA_API,
  ASANA_WORKSPACE_GID,
  APP_URL,
  ASANA_PROJETOS,
  REMOVER_CAMPO,
  SUFIXO_AUTOR,
  ANEXO_MAX_BYTES,
  MAX_ORDENS_ANTERIORES,
  WEBHOOK_VERSAO,
  WEBHOOK_FILTROS,
};
