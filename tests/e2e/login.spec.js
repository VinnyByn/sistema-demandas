// Tela de login: o que acontece antes de haver sessão (site sem configuração, link de e-mail vencido).
const { test, expect } = require("@playwright/test");

async function abrirComo(page, baseURL, enderecoPublico, configuracao) {
  await page.route(/gstatic|jsdelivr|cdnjs|googleapis|supabase\.co/, (r) => r.abort());
  await page.route(`${enderecoPublico}/**`, async (r) => {
    const resposta = await page.request.get(baseURL + new URL(r.request().url()).pathname);
    await r.fulfill({ response: resposta });
  });
  await page.route("**/supabase-config.js", (r) => r.fulfill({ contentType: "text/javascript", body: `window.SUPABASE_CONFIG = ${JSON.stringify(configuracao)};` }));
}

const SEM_CONFIGURAR = { url: "https://COLOQUE-SEU-PROJETO.supabase.co", publishableKey: "COLOQUE_A_CHAVE" };
const CONFIGURADO = { url: "https://teste.supabase.co", publishableKey: "sb_publishable_teste" };

test("site publicado sem configuração avisa e não cai no modo local (cada um veria só os próprios dados)", async ({ page, baseURL }) => {
  await abrirComo(page, baseURL, "http://demandas.teste", SEM_CONFIGURAR);
  await page.goto("http://demandas.teste/index.html");
  await expect(page.locator("#loginError")).toContainText("manutenção");
  await expect(page.locator("#loginScreen")).toBeVisible();
  await expect(page.locator("#appRoot")).toBeHidden();
});

test("na máquina de desenvolvimento, sem configuração, o app abre em modo local", async ({ page, baseURL }) => {
  await abrirComo(page, baseURL, "http://demandas.teste", SEM_CONFIGURAR);
  await page.goto(`${baseURL}/index.html`);
  await expect(page.locator("#appRoot")).toBeVisible();
  await expect(page.locator("#syncBadge")).toContainText("Somente neste navegador");
});

test("link do e-mail vencido explica o que fazer", async ({ page, baseURL }) => {
  await abrirComo(page, baseURL, "http://demandas.teste", CONFIGURADO);
  await page.goto(`${baseURL}/index.html#error=access_denied&error_code=otp_expired&error_description=expirou`);
  await expect(page.locator("#loginError")).toContainText("expirou ou já foi usado");
  await expect(page.locator("#appRoot")).toBeHidden();
});
