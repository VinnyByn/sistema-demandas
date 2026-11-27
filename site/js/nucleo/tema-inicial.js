/**
 * Aplica tema, tamanho de fonte e "menos animação" antes da primeira pintura (evita piscar).
 * Fica num arquivo (não inline no HTML) para o Content-Security-Policy não precisar de 'unsafe-inline'.
 * Carregado com <script src> comum no <head>, sem async/defer.
 */
(function () {
  try {
    var t = localStorage.getItem("demandas-theme");
    if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
    // Variação «Escuro total» do tema escuro.
    if (t !== "light" && localStorage.getItem("demandas-escuro") === "preto") document.documentElement.setAttribute("data-escuro", "preto");
    if (localStorage.getItem("demandas-visual") === "neon") {
      document.documentElement.setAttribute("data-visual", "neon");
      document.documentElement.setAttribute("data-theme", "dark");
      var icones = document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]');
      for (var i = 0; i < icones.length; i++) {
        icones[i].setAttribute("href", "img/logo-neon.svg");
        icones[i].setAttribute("type", "image/svg+xml");
      }
    }
    var f = localStorage.getItem("demandas-fonte");
    if (f === "grande" || f === "maior") document.documentElement.setAttribute("data-fonte", f);
    if (localStorage.getItem("demandas-menos-animacao") === "1") document.documentElement.setAttribute("data-menos-animacao", "1");
  } catch (e) {}
})();
