// Backend Supabase (com um Supabase falso em memória): login, sincronização e arquivos.
const path = require("node:path");
const { test: base, expect } = require("@playwright/test");
const { test: testLocal, diasAtras } = require("./app");

const ADMIN = "vinicius.morais@soumaster.com.br";
const SENHA = "senha-123";

function projetos() {
  return [
    { id: "p1", titulo: "Rota IJA x SRS", tipo: "Backbone", status: "novo", responsavel: "Vinicius", cidade: "Goiânia", dataChegada: diasAtras(10).slice(0, 10), descricao: "x", updatedAt: diasAtras(1), historicoStatus: [{ status: "novo", inicio: diasAtras(10) }] },
    { id: "p2", titulo: "Condomínio Reserva", tipo: "B2C", segmentoB2c: "MDU", status: "novo", responsavel: "", cidade: "Goiânia", dataChegada: diasAtras(2).slice(0, 10), descricao: "x", updatedAt: diasAtras(1) },
  ];
}

const test = base.extend({
  sb: async ({ page }, use) => {
    const erros = [];
    page.on("pageerror", (e) => erros.push(e.message));
    await page.route(/gstatic|jsdelivr|cdnjs|googleapis|firebaseio/, (r) => r.abort());
    // Supabase "configurado" e ligado, sem tocar no arquivo real.
    await page.route("**/supabase-config.js", (r) =>
      r.fulfill({
        contentType: "text/javascript",
        body: 'window.SUPABASE_CONFIG = { url: "https://teste.supabase.co", anonKey: "anon" }; window.DEMANDAS_BACKEND = "supabase";',
      }),
    );
    await page.addInitScript({ path: path.join(__dirname, "supabase-falso.js") });
    await page.addInitScript(
      ({ admin, senha, dados }) => {
        window.__sbFalso.criarUsuario(admin, senha, "admin");
        window.__sbFalso.criarUsuario("matheus.costa@soumaster.com.br", senha, "projetista");
        window.__sbFalso.criarUsuario("leitor@soumaster.com.br", senha, "visibilidade");
        window.__sbFalso.semear(dados);
      },
      { admin: ADMIN, senha: SENHA, dados: projetos() },
    );
    const entrar = async (email, senha = SENHA) => {
      await page.goto("/index.html");
      await page.fill("#loginEmail", email);
      await page.fill("#loginPassword", senha);
      await page.click("#btnLoginSubmit");
    };
    await use({ page, entrar, erros });
    expect(erros, "erros de JavaScript na página").toEqual([]);
  },
});

const card = (page, texto) => page.locator("#boardEsteira .card", { hasText: texto });
const banco = (page, fn, arg) => page.evaluate(fn, arg);

test("login, leitura e gravação no Supabase", async ({ sb: { page, entrar } }) => {
  await entrar(ADMIN, "errada");
  await expect(page.locator("#loginError")).toHaveText("E-mail ou senha incorretos.");

  await entrar(ADMIN);
  await expect(card(page, "Rota IJA x SRS")).toBeVisible();
  await expect(card(page, "Condomínio Reserva")).toBeVisible();

  // Alteração de outra pessoa chega pelo tempo real.
  await page.evaluate(() => window.__sbFalso.alterarRemoto("p1", { titulo: "Rota alterada por outro", updatedAt: new Date().toISOString() }));
  await expect(card(page, "Rota alterada por outro")).toBeVisible();

  // Gravar: campos com undefined são apagados no banco (como o FieldValue.delete do Firestore).
  await page.evaluate(() => {
    const d = state.demandas.find((x) => x.id === "p2");
    Object.assign(d, { titulo: "Condomínio Novo", arquivadoEm: "2026-01-01", updatedAt: new Date().toISOString() });
    saveState({ demanda: d });
  });
  await expect.poll(() => banco(page, () => window.__sbFalso.tabelas.demandas.get("p2").dados.arquivadoEm)).toBe("2026-01-01");
  await page.evaluate(() => {
    const d = state.demandas.find((x) => x.id === "p2");
    Object.assign(d, { arquivadoEm: firebaseCampoApagar(), updatedAt: new Date().toISOString() });
    saveState({ demanda: { ...d } });
  });
  await expect
    .poll(() => banco(page, () => "arquivadoEm" in window.__sbFalso.tabelas.demandas.get("p2").dados))
    .toBe(false);
  expect(await banco(page, () => window.__sbFalso.tabelas.demandas.get("p2").dados.titulo)).toBe("Condomínio Novo");

  // Metas por etapa: mesclagem sem apagar o que já existia.
  await page.evaluate(() => saveState({ metaFields: { filtrosSalvos: { "a@x": [{ id: "f1", nome: "Meus" }] } } }));
  await expect.poll(() => banco(page, () => Object.keys(window.__sbFalso.tabelas.sistema_meta.get("meta").filtros_salvos))).toEqual(["a@x"]);

  // Sair volta para o login.
  await page.evaluate(() => DemandasAuth.signOut());
  await expect(page.locator("#loginScreen")).toBeVisible();
});

test("acessos vêm da tabela perfis e só admin altera", async ({ sb: { page, entrar } }) => {
  await entrar("leitor@soumaster.com.br");
  await expect(card(page, "Rota IJA x SRS")).toBeVisible();
  const r = await page.evaluate(() => ({
    papel: DemandasRoles.resolve(DemandasAuth.currentUser()).role,
    leitura: isReadOnlyUser(),
  }));
  expect(r).toEqual({ papel: "visibilidade", leitura: true });
  // Gravação negada pelas regras do banco (o app avisa).
  await page.evaluate(() => {
    const d = state.demandas.find((x) => x.id === "p1");
    void persistenceApi.upsertDemanda({ ...d, titulo: "hack" }).catch((e) => (window.__erroGravar = e.message));
  });
  await expect.poll(() => page.evaluate(() => window.__erroGravar)).toBe("Sem permissão para esta ação.");
});

test("arquivos: envia PDF, KMZ e foto, abre e exclui", async ({ sb: { page, entrar } }) => {
  await entrar("matheus.costa@soumaster.com.br");
  await expect(card(page, "Rota IJA x SRS")).toBeVisible();
  await page.evaluate(() => openDemandaModal("p1"));
  const secao = page.locator("#fieldsetArquivos");
  await expect(secao).toBeVisible();
  await expect(secao.locator(".arq__vazio")).toHaveText("Nenhum PDF ainda.");

  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  );
  await page.setInputFiles("#demArquivosInput", [
    { name: "Planta baixa.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 teste") },
    { name: "rota.kmz", mimeType: "", buffer: Buffer.from("PK kmz") },
    { name: "poste.png", mimeType: "image/png", buffer: png },
    { name: "notas.txt", mimeType: "text/plain", buffer: Buffer.from("x") },
  ]);
  await expect(page.locator("#toast")).toContainText("3 arquivos salvos");
  // Vai para a aba do último tipo enviado (fotos) e mostra a miniatura.
  await expect(secao.locator('[data-arq-aba="foto"]')).toHaveClass(/is-ativa/);
  await expect(secao.locator(".arq-foto img")).toHaveJSProperty("complete", true);
  await expect(secao.locator('[data-arq-n="pdf"]')).toHaveText("1");
  await expect(secao.locator('[data-arq-n="kmz"]')).toHaveText("1");

  const db = await banco(page, () =>
    [...window.__sbFalso.tabelas.arquivos.values()].map((a) => [a.tipo, a.nome, a.mime, a.caminho.split("/").slice(0, 2).join("/")]).sort(),
  );
  expect(db).toEqual([
    ["foto", "poste.png", "image/png", "p1/foto"],
    ["kmz", "rota.kmz", "application/vnd.google-earth.kmz", "p1/kmz"],
    ["pdf", "Planta baixa.pdf", "application/pdf", "p1/pdf"],
  ]);
  // Nome com espaço/acentos vira chave segura no Storage.
  expect(await banco(page, () => [...window.__sbFalso.objetos.keys()].some((k) => k.endsWith("-Planta_baixa.pdf")))).toBe(true);

  // Visor de foto.
  await secao.locator(".arq-foto__ver").click();
  await expect(page.locator("#dlgArquivoFoto")).toBeVisible();
  await expect(page.locator("#arqVisorNome")).toHaveText("poste.png");
  await page.click("#arqVisorFechar");

  // Lista de PDF: nome, autor e abrir em nova aba.
  await secao.locator('[data-arq-aba="pdf"]').click();
  await expect(secao.locator(".arq-item__nome")).toHaveText("Planta baixa.pdf");
  await expect(secao.locator(".arq-item__meta")).toContainText("Matheus");
  await page.evaluate(() => {
    window.open = () => ({ location: { set href(u) { window.__abriu = u; } }, close() {} });
  });
  await secao.locator("[data-arq-abrir]").click();
  await expect.poll(() => page.evaluate(() => window.__abriu)).toMatch(/^blob:/);

  // Excluir apaga registro e arquivo do Storage.
  await secao.locator("[data-arq-excluir]").click();
  await expect(page.locator("#confirmDialogMessage")).toContainText("Planta baixa.pdf");
  await page.click("#confirmDialogOk");
  await expect(secao.locator(".arq__vazio")).toHaveText("Nenhum PDF ainda.");
  expect(await banco(page, () => [window.__sbFalso.tabelas.arquivos.size, window.__sbFalso.objetos.size])).toEqual([2, 2]);
  await expect(secao.locator(".seg-toggle__resumo")).toHaveText("2 arquivo(s)");

  // Excluir o projeto de vez apaga também o conteúdo no Storage.
  await page.evaluate(() => closeDemandaModal());
  await page.evaluate(() => persistenceApi.deleteDemanda("p1"));
  expect(await banco(page, () => [window.__sbFalso.tabelas.arquivos.size, window.__sbFalso.objetos.size])).toEqual([0, 0]);
});

test("PDF do levantamento vai para o Storage e aparece em Arquivos", async ({ sb: { page, entrar } }) => {
  await entrar("matheus.costa@soumaster.com.br");
  await expect(card(page, "Rota IJA x SRS")).toBeVisible();
  await page.evaluate(() => openDemandaModal("p2"));
  const r = await page.evaluate(async () => {
    const pdf = await guardarPdfLevantamento(new File(["%PDF-1.4 x"], "Levantamento.pdf", { type: "application/pdf" }));
    return { caminho: pdf.caminho, dataUrl: pdf.dataUrl, normalizado: normalizePdfLevantamento(pdf).caminho };
  });
  expect(r.caminho).toMatch(/^p2\/pdf\/.+-Levantamento\.pdf$/);
  expect(r.dataUrl).toBe("");
  expect(r.normalizado).toBe(r.caminho);
  await expect(page.locator("#fieldsetArquivos .arq-item__tag")).toHaveText("Levantamento");
});

test("arquivos: leitura não envia; projeto novo pede para salvar", async ({ sb: { page, entrar } }) => {
  await entrar("leitor@soumaster.com.br");
  await expect(card(page, "Rota IJA x SRS")).toBeVisible();
  await page.evaluate(() => openDemandaModal("p1"));
  await expect(page.locator("#fieldsetArquivos")).toBeVisible();
  await expect(page.locator("#demArquivosDrop")).toBeHidden();
  await page.evaluate(() => closeDemandaModal());

  await page.evaluate(() => DemandasAuth.signOut());
  await entrar("matheus.costa@soumaster.com.br");
  await expect(card(page, "Rota IJA x SRS")).toBeVisible();
  await page.evaluate(() => openDemandaModal(null));
  await expect(page.locator("#fieldsetArquivos .arq__vazio")).toHaveText("Salve o projeto para anexar arquivos.");
  await expect(page.locator("#demArquivosDrop")).toBeHidden();
});

testLocal("sem Supabase a seção Arquivos fica escondida", async ({ app: { page } }) => {
  await page.evaluate(() => openDemandaModal("p1"));
  await expect(page.locator("#modalDemanda")).toBeVisible();
  await expect(page.locator("#fieldsetArquivos")).toBeHidden();
});
