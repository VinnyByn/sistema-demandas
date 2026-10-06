// Abre o app em modo local (sem Firebase), com login dispensado e dados de exemplo.
const { test: base, expect } = require("@playwright/test");

const hoje = () => new Date();
const diasAtras = (n) => new Date(hoje() - n * 864e5).toISOString();

function projetosExemplo() {
  return [
    { id: "p1", titulo: "Rota IJA x SRS", tipo: "Backbone", status: "novo", responsavel: "Vinicius", cidade: "Goiânia", dataChegada: diasAtras(10).slice(0, 10), descricao: "x", historicoStatus: [{ status: "novo", inicio: diasAtras(10) }] },
    { id: "p2", titulo: "Condomínio Reserva", tipo: "B2C", segmentoB2c: "MDU", status: "novo", responsavel: "", cidade: "Goiânia", dataChegada: diasAtras(2).slice(0, 10), descricao: "x" },
    { id: "p3", titulo: "Hospital Central", tipo: "B2C", segmentoB2c: "TCR", status: "custo", responsavel: "Matheus", cidade: "Anápolis", dataChegada: diasAtras(4).slice(0, 10), descricao: "x", historicoStatus: [{ status: "custo", inicio: diasAtras(4) }] },
    { id: "p4", titulo: "Troca de OLT", tipo: "SWAP", status: "custo", responsavel: "Vinicius", cidade: "Anápolis", dataChegada: diasAtras(6).slice(0, 10), descricao: "x", historicoStatus: [{ status: "custo", inicio: diasAtras(5) }] },
  ];
}

const test = base.extend({
  app: async ({ page }, use) => {
    const erros = [];
    page.on("pageerror", (e) => erros.push(e.message));
    // Sem rede externa: Firebase/CDNs ficam de fora e o app cai no modo local.
    await page.route(/gstatic|jsdelivr|cdnjs|googleapis|firebaseio/, (r) => r.abort());
    await page.goto("/index.html");
    await page.waitForFunction(() => typeof window.applyLoadedState === "function");
    await page.evaluate((dados) => {
      document.getElementById("loginScreen").style.display = "none";
      document.getElementById("appRoot").hidden = false;
      window.isReadOnlyUser = () => false;
      window.requireWriteAccess = () => true;
      window.isAdminUser = () => true;
      window.setDemandaEditingBy = () => {};
      window.startPresenceHeartbeat = () => {};
      window.getCurrentUserEmail = () => "vinicius.morais@soumaster.com.br";
      window.getLoggedInComentarioAutor = () => "Vinicius Morais";
      window.confirm = () => true;
      window.confirmDialog = async () => true;
      window.__salvos = [];
      const salvarOriginal = window.saveState;
      window.saveState = (patch) => {
        window.__salvos.push(patch);
        return salvarOriginal(patch);
      };
      applyLoadedState({ demandas: dados });
      fillFilterProjetistaSelect();
      renderBoard();
    }, projetosExemplo());
    await use({ page, erros });
    expect(erros, "erros de JavaScript na página").toEqual([]);
  },
});

module.exports = { test, expect, diasAtras };
