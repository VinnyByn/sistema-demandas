/**
 * Listas de seleção (selects) no Chrome/Edge recentes, que desenham a lista no estilo do sistema
 * (appearance: base-select). Cada select ganha um <button><selectedcontent></selectedcontent></button>
 * no início: assim o item escolhido fica numa linha só e termina em «…» quando não cabe, em vez de
 * quebrar em duas linhas. A lista aberta continua mostrando os nomes inteiros.
 * Os selects são preenchidos de novo (innerHTML) em vários lugares, por isso um observador repõe o botão.
 *
 * Versões mais antigas do navegador nem sempre atualizam o <selectedcontent> quando a escolha muda
 * pelo código — o select ficaria mostrando o item errado. Por isso o recurso só liga depois de um
 * teste rápido; se falhar (ou se o navegador não tiver a lista estilizada), fica a lista do sistema.
 */
(function () {
  if (!window.CSS?.supports?.("appearance", "base-select")) return;
  const ALVO = "select:not([multiple]):not([size])";

  function novoBotao() {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "sel-botao";
    botao.appendChild(document.createElement("selectedcontent"));
    return botao;
  }

  /** Texto mostrado bate com a opção escolhida? */
  function mostraCerto(sel) {
    const sc = sel.querySelector(":scope > button.sel-botao > selectedcontent");
    const opt = sel.selectedOptions[0];
    return !!sc && (sc.textContent || "") === (opt ? opt.textContent || "" : "");
  }

  /** Faz o navegador redesenhar o item escolhido (vale para quando o botão acabou de entrar). */
  function atualizar(sel) {
    const i = sel.selectedIndex;
    sel.selectedIndex = -1;
    sel.selectedIndex = i;
  }

  /** O navegador acompanha as mudanças feitas pelo código? (teste fora da tela, uma vez) */
  function confiavel() {
    const s = document.createElement("select");
    s.style.cssText = "position:absolute;left:-9999px;top:0;";
    s.setAttribute("aria-hidden", "true");
    s.tabIndex = -1;
    s.innerHTML = '<option value="a">A</option><option value="b">B</option>';
    document.body.appendChild(s);
    s.prepend(novoBotao());
    atualizar(s);
    const inicio = mostraCerto(s);
    s.value = "b";
    const mudou = mostraCerto(s);
    s.innerHTML = '<option value="c">C</option><option value="d">D</option>';
    s.prepend(novoBotao());
    s.value = "d";
    atualizar(s);
    const refeito = mostraCerto(s);
    s.remove();
    return inicio && mudou && refeito;
  }

  if (!confiavel()) return;
  window.listasSelecaoAtivas = true;

  function preparar(sel) {
    if (!(sel instanceof HTMLSelectElement) || sel.multiple || sel.size > 1 || sel.dataset.selSistema) return;
    const primeiro = sel.firstElementChild;
    if (primeiro?.matches("button.sel-botao")) {
      if (!mostraCerto(sel)) atualizar(sel);
      return;
    }
    sel.querySelectorAll(":scope > button.sel-botao").forEach((b) => b.remove());
    sel.prepend(novoBotao());
    atualizar(sel);
    // Último recurso: se ainda assim não mostrar o item certo, volta para a lista do sistema neste select.
    if (!mostraCerto(sel)) {
      sel.dataset.selSistema = "1";
      sel.querySelector(":scope > button.sel-botao")?.remove();
    }
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
