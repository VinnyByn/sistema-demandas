// Aba Usuários (sem nuvem): resumo, edições pendentes, busca, menu por teclado e remoção.
const { test, expect } = require("./app");

const EU = "vinicius.morais@soumaster.com.br";

/** Monta a lista de acessos e abre a janela Usuários. Guarda os toasts e as confirmações pedidas. */
async function abrirUsuarios(page, { confirmar = true } = {}) {
  await page.evaluate(
    ({ eu, confirmar }) => {
      // Sem nuvem no teste: quem está logado (DemandasRoles confere o admin por aqui).
      DemandasAuth.currentUser = () => ({ email: eu, displayName: "" });
      DemandasRoles.setPurgedMap({});
      DemandasRoles.setDisabledMap({ "duda.lima@x.com": true });
      DemandasRoles.setNamesMap({ "bia.souza@x.com": "Bia Souza" });
      DemandasRoles.setRegionalsMap({ "bia.souza@x.com": "Norte" });
      DemandasRoles.setHomesMap({});
      DemandasRoles.setRolesMap({
        [eu]: "admin",
        "matheus.costa@x.com": "projetista",
        "bia.souza@x.com": "projetista",
        "caio.rocha@x.com": "visibilidade",
        "duda.lima@x.com": "projetista",
        "rafael.mesquita@x.com": "projetista",
        "rafael.machado@x.com": "projetista",
      });
      window.__toasts = [];
      const toastOriginal = window.toast;
      window.toast = (m) => {
        window.__toasts.push(m);
        toastOriginal(m);
      };
      window.__confirmacoes = [];
      window.confirmDialog = async (opts) => {
        window.__confirmacoes.push(opts);
        return window.__responderConfirmacao ?? confirmar;
      };
      openUsuariosModal();
    },
    { eu: EU, confirmar },
  );
  await expect(page.locator("#panelUsuarios")).toBeVisible();
}

const linha = (page, email) => page.locator(`.usuarios-row[data-email="${email}"]`);

test("resumo conta e filtra; desabilitadas no fim; tags de papel e «Você»", async ({ app: { page } }) => {
  await abrirUsuarios(page);
  await expect(page.locator('[data-usuarios-filtro="todos"]')).toContainText("7");
  await expect(page.locator('[data-usuarios-filtro="desabilitados"]')).toContainText("1");
  await expect(page.locator('[data-usuarios-filtro="admin"]')).toContainText("1");
  await expect(page.locator(".usuarios-row").last()).toHaveAttribute("data-email", "duda.lima@x.com");
  await expect(linha(page, EU).locator(".usuarios-tag--voce")).toHaveText("Você");
  await expect(linha(page, "bia.souza@x.com").locator(".usuarios-row__cel--regional")).toContainText("Norte");
  await expect(linha(page, "caio.rocha@x.com").locator(".usuarios-tag--visibilidade")).toBeVisible();

  await page.click('[data-usuarios-filtro="desabilitados"]');
  await expect(page.locator(".usuarios-row:visible")).toHaveCount(1);
  await expect(page.locator('[data-usuarios-filtro="desabilitados"]')).toHaveAttribute("aria-pressed", "true");
  await page.click('[data-usuarios-filtro="todos"]');
  await expect(page.locator(".usuarios-row:visible")).toHaveCount(7);
});

test("edição não salva sobrevive à busca e à sincronização; Descartar volta ao salvo", async ({ app: { page } }) => {
  await abrirUsuarios(page);
  const bia = linha(page, "bia.souza@x.com");
  await bia.locator(".user-row-editar").click();
  await bia.locator(".user-nome-input").fill("Bia Souza Lima");
  await expect(bia.locator(".usuarios-row__sujo")).toBeVisible();
  await expect(bia.locator(".user-role-save")).toBeEnabled();

  await page.fill("#usuariosBusca", "bia");
  await expect(page.locator(".usuarios-row:visible")).toHaveCount(1);
  await page.fill("#usuariosBusca", "");
  // Uma mudança remota redesenha a lista (antes apagava o que estava sendo digitado).
  await page.evaluate(() => renderUsuariosPanel());
  await expect(bia.locator(".user-nome-input")).toHaveValue("Bia Souza Lima");
  await expect(bia.locator(".usuarios-row__sujo")).toBeVisible();

  await bia.locator(".user-row-descartar").click(); // Cancelar
  await expect(bia.locator(".user-nome-input")).toBeHidden();
  await expect(bia).not.toHaveClass(/is-sujo/);
  await bia.locator(".user-row-editar").click();
  await expect(bia.locator(".user-nome-input")).toHaveValue("Bia Souza");
});

test("busca sem resultado mostra aviso e botão para limpar", async ({ app: { page } }) => {
  await abrirUsuarios(page);
  await page.fill("#usuariosBusca", "ninguem-aqui");
  await expect(page.locator("#usuariosVazio")).toBeVisible();
  await expect(page.locator("#usuariosVazioTexto")).toContainText("ninguem-aqui");
  await expect(page.locator("#usuariosStatus")).toHaveText("0 de 7 contas");
  await page.click("#btnUsuariosLimparFiltro");
  await expect(page.locator("#usuariosVazio")).toBeHidden();
  await expect(page.locator(".usuarios-row:visible")).toHaveCount(7);
});

test("menu ⋯ pelo teclado: abre no primeiro item, setas navegam, Esc fecha e devolve o foco", async ({ app: { page } }) => {
  await abrirUsuarios(page);
  const caio = linha(page, "caio.rocha@x.com");
  const botao = caio.locator(".user-row-more");
  await botao.focus();
  await page.keyboard.press("Enter");
  await expect(caio.locator(".usuarios-row__menu")).toBeVisible();
  await expect(botao).toHaveAttribute("aria-expanded", "true");
  await expect(caio.locator('[role="menuitem"]').first()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(caio.locator(".user-role-toggle")).toBeFocused();
  await page.keyboard.press("End");
  await expect(caio.locator(".user-role-del")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(caio.locator(".usuarios-row__menu")).toBeHidden();
  await expect(botao).toBeFocused();
  await expect(page.locator("#panelUsuarios")).toBeVisible(); // Esc fechou só o menu, não a janela
});

test("Remover fica bloqueado com o motivo quando a conta tem demandas", async ({ app: { page } }) => {
  await abrirUsuarios(page);
  const matheus = linha(page, "matheus.costa@x.com"); // responsável do projeto p3
  await expect(matheus).toContainText("1 demanda");
  await matheus.locator(".user-row-more").click();
  const remover = matheus.locator(".user-role-del");
  await expect(remover).toHaveAttribute("aria-disabled", "true");
  await expect(remover).toContainText("redistribua ou use Desabilitar");
  await remover.click({ force: true }); // aria-disabled: continua focável e explica o motivo
  expect(await page.evaluate(() => window.__toasts.at(-1))).toMatch(/Tem 1 demanda/);
  expect(await page.evaluate(() => Object.keys(DemandasRoles.getRolesMap()))).toContain("matheus.costa@x.com");
});

test("nome em comum (dois Rafaéis) não bloqueia a remoção, mas avisa", async ({ app: { page } }) => {
  await page.evaluate(() => {
    state.demandas.push(migrateDemanda({ id: "p9", titulo: "Antiga do Rafael", tipo: "Backbone", status: "novo", responsavel: "Rafael", cidade: "Goiânia" }));
  });
  await abrirUsuarios(page);
  await expect(linha(page, "rafael.machado@x.com")).toContainText("+1 como «Rafael»");
  await linha(page, "rafael.machado@x.com").locator(".user-row-more").click();
  await linha(page, "rafael.machado@x.com").locator(".user-role-del").click();
  const pedido = await page.evaluate(() => window.__confirmacoes.at(-1));
  expect(pedido.title).toBe("Remover do sistema?");
  expect(pedido.hint).toMatch(/rafael\.mesquita@x\.com/);
  expect(await page.evaluate(() => DemandasRoles.getPurgedMap())).toHaveProperty(["rafael.machado@x.com"], true);
});

test("salvar: promover a admin pede confirmação; rebaixar a si mesmo também", async ({ app: { page } }) => {
  await abrirUsuarios(page);
  const bia = linha(page, "bia.souza@x.com");
  await bia.locator(".user-row-editar").click();
  await bia.locator(".user-role-select").selectOption("admin");
  await bia.locator(".user-esteira-select").selectOption("b2b");
  await bia.locator(".user-role-save").click();
  await expect(bia.locator(".usuarios-row__cel--papel .usuarios-tag--admin")).toBeVisible();
  await expect(bia.locator(".usuarios-row__cel--tela")).toContainText("Esteira B2B");
  expect(await page.evaluate(() => window.__confirmacoes.map((c) => c.title))).toEqual(["Dar acesso de administrador?"]);
  expect(await page.evaluate(() => DemandasRoles.homeEsteiraForEmail("bia.souza@x.com"))).toBe("b2b");

  await page.evaluate(() => (window.__responderConfirmacao = false));
  const eu = linha(page, EU);
  await eu.locator(".user-row-editar").click();
  await eu.locator(".user-role-select").selectOption("projetista");
  await eu.locator(".user-role-save").click();
  expect(await page.evaluate(() => window.__confirmacoes.at(-1).title)).toBe("Deixar de ser administrador?");
  expect(await page.evaluate((e) => DemandasRoles.getRolesMap()[e], EU)).toBe("admin");
  await expect(eu.locator(".usuarios-row__sujo")).toBeVisible(); // recusou: continua pendente
});

test("fechar com alteração pendente pergunta antes (× e Esc)", async ({ app: { page } }) => {
  await abrirUsuarios(page, { confirmar: false });
  await linha(page, "caio.rocha@x.com").locator(".user-row-editar").click();
  await linha(page, "caio.rocha@x.com").locator(".user-nome-input").fill("Caio R.");
  await page.click("#btnFecharUsuarios");
  await expect(page.locator("#panelUsuarios")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#panelUsuarios")).toBeVisible();
  expect(await page.evaluate(() => window.__confirmacoes.map((c) => c.title))).toEqual(["Descartar alterações?", "Descartar alterações?"]);
  await page.evaluate(() => (window.__responderConfirmacao = true));
  await page.click("#btnFecharUsuarios");
  await expect(page.locator("#panelUsuarios")).toBeHidden();
});

test("nova conta: o formulário abre pelo botão e o convite esconde a senha", async ({ app: { page } }) => {
  await abrirUsuarios(page);
  await expect(page.locator("#formNovoUsuario")).toBeHidden();
  await page.click("#btnNovaConta");
  await expect(page.locator("#formNovoUsuario")).toBeVisible();
  await expect(page.locator("#userNovoEmail")).toBeFocused();
  await expect(page.locator("#userNovoSenhaCampo")).toBeHidden();
  await page.check('input[name="userNovoAcesso"][value="senha"]');
  await expect(page.locator("#userNovoSenhaCampo")).toBeVisible();
  await expect(page.locator("#btnNovaConta")).toHaveAttribute("aria-expanded", "true");
});

test("quem chega pelo link do e-mail define a senha", async ({ app: { page } }) => {
  await page.evaluate(() => {
    window.__novaSenha = null;
    DemandasAuth.precisaDefinirSenha = () => true;
    DemandasAuth.definirNovaSenha = async (senha) => {
      window.__novaSenha = senha;
    };
    abrirDefinirSenhaSeNecessario();
  });
  const dlg = page.locator("#modalDefinirSenha");
  await expect(dlg).toBeVisible();
  await page.fill("#definirSenhaNova", "curta");
  await page.fill("#definirSenhaNova2", "curta");
  await page.click("#btnDefinirSenha");
  await expect(page.locator("#definirSenhaErro")).toContainText("ao menos 8");
  await page.fill("#definirSenhaNova", "senha-boa-123");
  await page.fill("#definirSenhaNova2", "outra-senha-123");
  await page.click("#btnDefinirSenha");
  await expect(page.locator("#definirSenhaErro")).toContainText("não conferem");
  await page.fill("#definirSenhaNova2", "senha-boa-123");
  await page.click("#btnDefinirSenha");
  await expect(dlg).toBeHidden();
  expect(await page.evaluate(() => window.__novaSenha)).toBe("senha-boa-123");
});
