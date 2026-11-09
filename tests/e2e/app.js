// Abre o app sem rede (nuvem configurada, mas a biblioteca não carrega), com login dispensado e dados de exemplo.
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

// O que nenhuma mensagem do console pode conter, em nenhum teste: nomes de projeto e e-mails da equipe.
const DADOS_QUE_NAO_VAO_AO_CONSOLE = [...projetosExemplo().map((p) => p.titulo), "vinicius.morais@soumaster.com.br", "matheus.costa@x.com", "alberto.soares@x.com"];

const test = base.extend({
  app: async ({ page }, use) => {
    const erros = [];
    const saidaConsole = [];
    page.on("pageerror", (e) => erros.push(e.message));
    page.on("console", (m) => saidaConsole.push(m.text()));
    // Violações do Content-Security-Policy do firebase.json, que o servidor de teste aplica.
    await page.addInitScript(() => {
      window.__violacoesCsp = [];
      document.addEventListener("securitypolicyviolation", (e) =>
        window.__violacoesCsp.push(`${e.disposition} ${e.effectiveDirective} ${e.blockedURI || "(inline)"}`),
      );
    });
    // Sem rede externa: Supabase e CDNs ficam de fora. A configuração é fixa para o teste não depender do arquivo real.
    await page.route(/gstatic|jsdelivr|cdnjs|googleapis|supabase\.co/, (r) => r.abort());
    await page.route("**/supabase-config.js", (r) =>
      r.fulfill({ contentType: "text/javascript", body: 'window.SUPABASE_CONFIG = { url: "https://teste.supabase.co", publishableKey: "sb_publishable_teste" };' }),
    );
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
      DemandasRoles.definirAdminPrincipal("vinicius.morais@soumaster.com.br");
      window.getLoggedInComentarioAutor = () => "Vinicius Morais";
      window.confirm = () => true;
      window.confirmDialog = async () => true;
      // Lista de acessos do teste (a da equipe não fica mais no código; em produção vem do doc meta).
      DemandasRoles.setRolesMap({
        "vinicius.morais@soumaster.com.br": "admin",
        "matheus.costa@x.com": "projetista",
        "alberto.soares@x.com": "projetista",
      });
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
    await use({ page, erros, saidaConsole });
    expect(erros, "erros de JavaScript na página").toEqual([]);
    for (const dado of DADOS_QUE_NAO_VAO_AO_CONSOLE) {
      expect(saidaConsole.filter((linha) => linha.includes(dado)), `«${dado}» apareceu no console`).toEqual([]);
    }
    const csp = page.isClosed() ? [] : await page.evaluate(() => window.__violacoesCsp || []).catch(() => []);
    expect(csp, "violações do Content-Security-Policy (firebase.json)").toEqual([]);
  },
});

module.exports = { test, expect, diasAtras };
