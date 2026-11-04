/**
 * Aplica tema, tamanho de fonte e "menos animação" antes da primeira pintura (evita piscar).
 * Fica num arquivo (não inline no HTML) para o Content-Security-Policy não precisar de 'unsafe-inline'.
 * Carregado com <script src> comum no <head>, sem async/defer.
 */
(function () {
  try {
    var t = localStorage.getItem("demandas-theme");
    if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
    var f = localStorage.getItem("demandas-fonte");
    if (f === "grande" || f === "maior") document.documentElement.setAttribute("data-fonte", f);
    if (localStorage.getItem("demandas-menos-animacao") === "1") document.documentElement.setAttribute("data-menos-animacao", "1");
  } catch (e) {}
})();
