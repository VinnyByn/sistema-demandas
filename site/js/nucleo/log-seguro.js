/**
 * Único ponto do app que escreve no console. Mostra só o contexto e o código do erro: a mensagem de um erro do banco pode
 * trazer ids e e-mails. Para investigar no próprio navegador: localStorage.setItem("demandas-debug", "1").
 */
window.DemandasLog = (function () {
  function codigoDe(erro) {
    const codigo = String(erro?.code ?? erro?.status ?? erro?.name ?? "");
    return /^[\w./-]{1,40}$/.test(codigo) ? codigo : "";
  }

  function detalharLigado() {
    try {
      return localStorage.getItem("demandas-debug") === "1";
    } catch {
      return false;
    }
  }

  function escrever(nivel, contexto, erro) {
    const codigo = codigoDe(erro);
    console[nivel](`[Projetos] ${contexto}${codigo ? ` (${codigo})` : ""}`);
    if (erro !== undefined && detalharLigado()) console[nivel](erro);
  }

  return {
    aviso: (contexto, erro) => escrever("warn", contexto, erro),
    erro: (contexto, erro) => escrever("error", contexto, erro),
  };
})();
