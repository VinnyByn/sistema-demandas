const { test, expect } = require("./app");

const cards = (page) => page.locator("#boardEsteira .card");

test("carrega a esteira com os projetos", async ({ app: { page } }) => {
  await expect(cards(page)).toHaveCount(4);
  await expect(page.locator("#boardEsteira .card", { hasText: "Rota IJA x SRS" })).toBeVisible();
});

test("ações em lote: seleciona, move de etapa e atribui projetista", async ({ app: { page } }) => {
  await page.click("#btnSelecionarCards");
  await expect(page.locator("#loteBarra")).toBeVisible();
  await page.locator('#boardEsteira .card[data-id="p1"]').click();
  await page.locator('#boardEsteira .card[data-id="p2"]').click();
  await expect(page.locator("#loteQtd")).toHaveText("2 projetos selecionados");
  await expect(page.locator("#modalDemanda")).not.toBeVisible();
  await page.selectOption("#loteStatus", "vistoria");
  await page.selectOption("#loteResponsavel", "Matheus");
  const r = await page.evaluate(() => ["p1", "p2"].map((id) => state.demandas.find((d) => d.id === id)).map((d) => [d.status, d.responsavel]));
  expect(r).toEqual([["vistoria", "Matheus"], ["vistoria", "Matheus"]]);
  await page.keyboard.press("Escape");
  await expect(page.locator("#loteBarra")).toBeHidden();
});

test("Minhas demandas e filtro salvo", async ({ app: { page } }) => {
  await page.click("#btnMinhasDemandas");
  await expect(cards(page)).toHaveCount(2);
  await page.click("#btnFiltrosSalvos");
  await page.fill("#filtroSalvoNome", "Meus projetos");
  await page.click("#btnSalvarFiltro");
  await page.click("#btnMinhasDemandas");
  await expect(cards(page)).toHaveCount(4);
  await page.click("#btnFiltrosSalvos");
  await page.locator("[data-fs-aplicar]", { hasText: "Meus projetos" }).click();
  await expect(cards(page)).toHaveCount(2);
  await expect(page.locator("#filtrosSalvosRotulo")).toHaveText("Meus projetos");
});

test("meta por etapa define quem está parado", async ({ app: { page } }) => {
  const parados = () => page.evaluate(() => state.demandas.filter(demandaParadaNaColuna).map((d) => d.id).sort());
  expect(await parados()).toEqual(["p1"]); // 10 dias em Projetos novos, meta padrão de 6
  await page.evaluate(() => {
    state.metasEtapa = { operacional: { novo: 0, custo: 3 } };
    renderBoard();
  });
  expect(await parados()).toEqual(["p3", "p4"]);
});

test("lixeira: move e desfaz", async ({ app: { page } }) => {
  await page.evaluate(() => moverDemandasParaLixeira(["p4"]));
  await expect(cards(page)).toHaveCount(3);
  await page.click("#toast .toast__acao");
  await expect(cards(page)).toHaveCount(4);
});

test("card: Concluir finaliza a atividade atual e move para a coluna configurada", async ({ app: { page } }) => {
  await page.evaluate(() => {
    const p1 = state.demandas.find((d) => d.id === "p1"); // em Projetos novos
    p1.checklist = [{ id: "a", name: "Desenho", who: "V", status: "andamento", moverPara: "vistoria" }];
    renderBoard();
  });
  const card = page.locator('#boardEsteira .card[data-id="p1"]');
  await card.hover();
  await expect(card.locator(".card__concluir")).toHaveText("✓ Concluir ▸");
  await card.locator(".card__concluir").click();
  await expect(page.locator("#modalDemanda")).not.toBeVisible();
  const r = await page.evaluate(() => {
    const d = state.demandas.find((x) => x.id === "p1");
    return { status: d.status, atividade: d.checklist[0].status };
  });
  expect(r).toEqual({ status: "vistoria", atividade: "concluida" });
  await expect(page.locator('.column[data-status="vistoria"] .card[data-id="p1"]')).toBeVisible();
});
