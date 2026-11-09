/** Como o app fala com o banco: acesso ao cliente, limite de tempo e tradução dos erros. */
const DemandasConsulta = (function () {
  const LIMITE_DE_TEMPO_MS = 15000;
  const ERRO_SEM_PERMISSAO = "42501";
  const ERRO_DE_REDE = /timeout|failed to fetch|networkerror|load failed|network request failed/i;

  function cliente() {
    return typeof DemandasAuth !== "undefined" ? DemandasAuth.cliente() : null;
  }

  function comLimiteDeTempo(promessa) {
    const estouro = new Promise((_, rejeitar) => setTimeout(() => rejeitar(new Error("timeout")), LIMITE_DE_TEMPO_MS));
    return Promise.race([promessa, estouro]);
  }

  function ehErroDeRede(erro) {
    return ERRO_DE_REDE.test(String(erro?.message || ""));
  }

  function erroDoBanco(erro) {
    const mensagem = erro?.code === ERRO_SEM_PERMISSAO ? "Sem permissão para esta ação." : erro?.message || "Erro ao falar com o banco.";
    return Object.assign(new Error(mensagem), { code: erro?.code });
  }

  async function executar(consulta) {
    const { data, error } = await comLimiteDeTempo(consulta);
    if (error) throw erroDoBanco(error);
    return data;
  }

  return { cliente, ehErroDeRede, erroDoBanco, executar };
})();
