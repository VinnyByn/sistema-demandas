/** Webhook do Asana: criação, "aperto de mão" e conferência da assinatura de cada entrega. */
import { Buffer } from "node:buffer";
import { createHmac, timingSafeEqual } from "node:crypto";
import { ASANA_WORKSPACE_GID, WEBHOOK_VERSAO, WEBHOOK_FILTROS } from "./constantes.mjs";
import { criarCliente } from "./cliente.mjs";

// Webhook da hospedagem anterior: enquanto existir, o Asana continua avisando um endereço que não é mais este sistema.
const ENDERECO_ANTIGO = /cloudfunctions\.net\/asanaWebhook/;
const JANELA_DO_APERTO_DE_MAO_MS = 2 * 60 * 1000;

async function apagarWebhooks(chamarAsana, webhooks) {
  for (const webhook of webhooks) {
    await chamarAsana(`/webhooks/${webhook.gid}`, { method: "DELETE", okStatuses: [404] });
  }
}

/** Reaproveita o webhook do mesmo endereço; recria se o Asana o desativou ou se os filtros mudaram. */
async function garantirWebhook({ repositorio: repo, token, fetchImpl, projetoGid, endpoint }) {
  const chamarAsana = criarCliente(token, fetchImpl);
  const enderecoDoWebhook = `${endpoint}?projeto=${projetoGid}`;
  const registroSalvo = await repo.buscarWebhook(projetoGid);
  const versaoEstaAtualizada = Number(registroSalvo.versao) >= WEBHOOK_VERSAO;

  const resposta = await chamarAsana(`/webhooks?workspace=${ASANA_WORKSPACE_GID}&resource=${projetoGid}&opt_fields=gid,target,active`);
  const webhooksDoProjeto = Array.isArray(resposta) ? resposta : [];
  await apagarWebhooks(chamarAsana, webhooksDoProjeto.filter((webhook) => ENDERECO_ANTIGO.test(String(webhook.target || ""))));

  const webhooksDoSistema = webhooksDoProjeto.filter((webhook) => webhook.target === enderecoDoWebhook);
  if (versaoEstaAtualizada && webhooksDoSistema.some((webhook) => webhook.active)) return { criado: false };
  await apagarWebhooks(chamarAsana, webhooksDoSistema);

  // Abre uma janela curta para o "aperto de mão": fora dela, um X-Hook-Secret recebido é recusado.
  await repo.mesclarWebhook(projetoGid, { handshakeAte: Date.now() + JANELA_DO_APERTO_DE_MAO_MS });
  const webhookCriado = await chamarAsana("/webhooks", {
    method: "POST",
    data: { resource: projetoGid, target: enderecoDoWebhook, filters: WEBHOOK_FILTROS },
  });
  await repo.mesclarWebhook(projetoGid, {
    webhookGid: String(webhookCriado?.gid || ""),
    target: enderecoDoWebhook,
    versao: WEBHOOK_VERSAO,
    atualizadoEm: new Date().toISOString(),
  });
  return { criado: true };
}

/**
 * "Aperto de mão" do Asana ao criar o webhook: guarda o segredo só se o próprio sistema acabou de
 * pedir o webhook (senão qualquer um poderia trocar o segredo e forjar comentários).
 */
async function registrarHandshake({ repositorio: repo, projetoGid, segredo }) {
  const registroAtual = await repo.buscarWebhook(projetoGid);
  const janelaAberta = Number(registroAtual.handshakeAte) > Date.now();
  if (!segredo || !janelaAberta) return false;
  await repo.mesclarWebhook(projetoGid, { secret: segredo, handshakeAte: 0, handshakeEm: new Date().toISOString() });
  return true;
}

async function segredoDoWebhook({ repositorio: repo, projetoGid }) {
  return (await repo.buscarWebhook(projetoGid)).secret;
}

function assinaturaValida(segredo, corpoBruto, assinaturaRecebida) {
  if (!segredo || !assinaturaRecebida || !corpoBruto) return false;
  const assinaturaEsperada = createHmac("sha256", segredo).update(corpoBruto).digest("hex");
  const bytesEsperados = Buffer.from(assinaturaEsperada);
  const bytesRecebidos = Buffer.from(String(assinaturaRecebida));
  return bytesEsperados.length === bytesRecebidos.length && timingSafeEqual(bytesEsperados, bytesRecebidos);
}

export { garantirWebhook, registrarHandshake, segredoDoWebhook, assinaturaValida };
