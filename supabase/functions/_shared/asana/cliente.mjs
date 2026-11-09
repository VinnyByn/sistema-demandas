/** Cliente HTTP da API do Asana e o erro próprio da integração. */
import { ASANA_API } from "./constantes.mjs";

class AsanaErro extends Error {
  constructor(mensagem, status) {
    super(mensagem);
    this.status = status;
  }
}

// Vai para o caminho da URL: com barra ou ponto, "../projects/1" apontaria o token da integração para outro recurso.
const gidSeguro = (gid) => /^[A-Za-z0-9_-]{1,64}$/.test(String(gid || ""));

const CAMINHO_PERIGOSO = /(^|\/)\.{1,2}(\/|$)|\\|%2e|%2f|%5c/i;

async function lerResposta(resposta) {
  const texto = await resposta.text();
  try {
    return { texto, json: texto ? JSON.parse(texto) : {} };
  } catch {
    return { texto, json: { raw: texto } };
  }
}

function erroDaResposta(status, { texto, json }) {
  const mensagem = json?.errors?.[0]?.message || texto || `HTTP ${status}`;
  return new AsanaErro(`Asana: ${mensagem}`, status);
}

/**
 * Devolve a função que chama a API do Asana. `statusAceitos` lista erros HTTP que não são falha
 * (ex.: 404 ao apagar algo que já foi apagado): nesse caso a chamada devolve `{ __status }`.
 */
function criarCliente(token, fetchImpl = fetch) {
  return async function chamarAsana(caminho, { method = "GET", data, okStatuses: statusAceitos = [] } = {}) {
    if (CAMINHO_PERIGOSO.test(caminho.split("?")[0])) throw new AsanaErro("Caminho inválido para o Asana.", 400);

    const cabecalhos = { Authorization: `Bearer ${token}`, Accept: "application/json" };
    if (data) cabecalhos["Content-Type"] = "application/json";

    const resposta = await fetchImpl(`${ASANA_API}${caminho}`, {
      method,
      headers: cabecalhos,
      body: data ? JSON.stringify({ data }) : undefined,
    });
    const corpo = await lerResposta(resposta);

    if (!resposta.ok) {
      if (statusAceitos.includes(resposta.status)) return { __status: resposta.status };
      throw erroDaResposta(resposta.status, corpo);
    }
    return corpo.json.data ?? corpo.json;
  };
}

export { AsanaErro, criarCliente, erroDaResposta, gidSeguro, lerResposta };
