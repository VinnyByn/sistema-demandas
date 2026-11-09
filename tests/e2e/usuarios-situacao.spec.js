// Aba Usuários: situação do login (função listarContasLogin) e histórico de acessos, com dados simulados.
const { test, expect } = require("./app");

const EU = "vinicius.morais@soumaster.com.br";

test.beforeEach(async ({ app: { page } }) => {
  await page.evaluate((eu) => {
    DemandasAuth.currentUser = () => ({ email: eu, displayName: "" });
    DemandasRoles.setRolesMap({ [eu]: "admin", "bia.souza@x.com": "projetista", "caio.rocha@x.com": "visibilidade" });
    window.confirmDialog = async () => true;
    openUsuariosModal();
  }, EU);
});

test("mostra último acesso, quem nunca entrou e oferece criar login para quem não tem", async ({ app: { page } }) => {
  await page.evaluate(() => {
    usuariosContasLogin = {
      "bia.souza@x.com": { existe: true, ultimoLogin: "2026-11-03T10:00:00.000Z" },
      "caio.rocha@x.com": { existe: false },
      "vinicius.morais@soumaster.com.br": { existe: true, ultimoLogin: "" },
    };
    renderUsuariosPanel();
  });
  await expect(page.locator('.usuarios-row[data-email="bia.souza@x.com"] .usuarios-row__cel--login')).toContainText("03/11/2026");
  await expect(page.locator(`.usuarios-row[data-email="${EU}"]`)).toContainText("Nunca entrou");
  const caio = page.locator('.usuarios-row[data-email="caio.rocha@x.com"]');
  await expect(caio).toContainText("Sem login criado");
  await caio.locator(".user-row-more").click();
  await expect(caio.locator(".user-login-criar")).toHaveText("Criar login e enviar convite");
  await expect(caio.locator(".user-role-reset")).toHaveCount(0);
});

test("histórico lista as mudanças e o registro não inventa troca de nome", async ({ app: { page } }) => {
  const linhas = await page.evaluate(() => {
    const antes = snapshotAcessos();
    DemandasRoles.setRolesMap({ ...DemandasRoles.getRolesMap(), "bia.souza@x.com": "admin" });
    DemandasRoles.setNamesMap({ "bia.souza@x.com": "Bia Souza" }); // igual ao nome tirado do e-mail
    DemandasRoles.setDisabledMap({ "caio.rocha@x.com": true });
    return diferencasDeAcesso(antes, snapshotAcessos());
  });
  expect(linhas).toEqual([
    { alvo: "bia.souza@x.com", acao: "papel", de: "Projetista", para: "Administrador" },
    { alvo: "caio.rocha@x.com", acao: "desabilitado" },
  ]);

  await page.locator("#usuariosHistorico summary").click();
  await expect(page.locator("#usuariosHistoricoStatus")).toContainText("Disponível só com a nuvem");
  await page.evaluate((eu) => {
    usuariosHistorico = [
      { em: "2026-11-04T12:30:00.000Z", por: eu, alvo: "bia.souza@x.com", acao: "papel", de: "Projetista", para: "Administrador" },
      { em: "2026-11-04T12:31:00.000Z", por: eu, alvo: "caio.rocha@x.com", acao: "desabilitado" },
    ];
    renderHistoricoAcessos();
  }, EU);
  const itens = page.locator("#usuariosHistoricoLista li");
  await expect(itens).toHaveCount(2);
  await expect(itens.first()).toContainText("mudou o papel de bia.souza@x.com: Projetista → Administrador");
  await expect(itens.nth(1)).toContainText("desabilitou caio.rocha@x.com");
});
