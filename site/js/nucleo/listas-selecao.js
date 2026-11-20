/**
 * Listas de seleção (selects) no Chrome/Edge recentes, que desenham a lista no estilo do sistema
 * (appearance: base-select). Cada select ganha um <button><selectedcontent></selectedcontent></button>
 * no início: assim o item escolhido fica numa linha só e termina em «…» quando não cabe, em vez de
 * quebrar em duas linhas. A lista aberta continua mostrando os nomes inteiros.
 * Os selects são preenchidos de novo (innerHTML) em vários lugares, por isso um observador repõe o botão.
 * Navegadores sem esse recurso ficam com a lista do sistema, como antes.
 */
(function () {
  if (!window.CSS?.supports?.("appearance", "base-select")) return;
  const ALVO = "select:not([multiple]):not([size])";

  function preparar(sel) {
    if (!(sel instanceof HTMLSelectElement) || sel.multiple || sel.size > 1) return;
    const primeiro = sel.firstElementChild;
    if (primeiro?.matches("button.sel-botao")) return;
    sel.querySelectorAll(":scope > button.sel-botao").forEach((b) => b.remove());
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "sel-botao";
    botao.appendChild(document.createElement("selectedcontent"));
    sel.prepend(botao);
  }

  document.querySelectorAll(ALVO).forEach(preparar);
  new MutationObserver((mudancas) => {
    for (const m of mudancas) {
      if (m.target instanceof HTMLSelectElement) preparar(m.target);
      for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.matches(ALVO)) preparar(n);
        else if (n.firstElementChild) n.querySelectorAll(ALVO).forEach(preparar);
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
