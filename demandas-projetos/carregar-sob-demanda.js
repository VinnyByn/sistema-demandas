/**
 * Bibliotecas pesadas carregadas só quando usadas (gráficos do dashboard, leitura de PDF).
 * Cada uma é baixada uma única vez; chamadas repetidas reaproveitam a mesma promessa.
 */
(function (global) {
  const CHART_JS = "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js";
  const PDF_JS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
  const PDF_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const pendentes = {};

  function carregarScript(url) {
    if (!pendentes[url]) {
      pendentes[url] = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = url;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => {
          delete pendentes[url];
          s.remove();
          reject(new Error("Não foi possível carregar " + url));
        };
        document.head.appendChild(s);
      });
    }
    return pendentes[url];
  }

  /** Chart.js (gráficos do dashboard). */
  global.carregarChartJs = function () {
    if (typeof global.Chart !== "undefined") return Promise.resolve(global.Chart);
    return carregarScript(CHART_JS).then(() => global.Chart);
  };

  /** PDF.js (leitura do PDF do levantamento de custo). */
  global.carregarPdfJs = function () {
    const pronto = () => {
      const lib = global.pdfjsLib;
      if (lib?.GlobalWorkerOptions && !lib.GlobalWorkerOptions.workerSrc) lib.GlobalWorkerOptions.workerSrc = PDF_WORKER;
      return lib;
    };
    if (global.pdfjsLib) return Promise.resolve(pronto());
    return carregarScript(PDF_JS).then(pronto);
  };
})(window);
