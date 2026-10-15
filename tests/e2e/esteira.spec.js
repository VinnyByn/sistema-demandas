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

test("coluna longa mostra 30 cards e o resto em 'Mostrar mais'", async ({ app: { page } }) => {
  await page.evaluate(() => {
    const muitos = Array.from({ length: 45 }, (_, i) => ({
      id: `m${i}`,
      titulo: `Projeto ${i}`,
      tipo: "Backbone",
      status: "custo",
      responsavel: "Vinicius",
      cidade: "Goiânia",
      dataChegada: "2026-10-01",
      descricao: "x",
    }));
    applyLoadedState({ demandas: muitos });
    renderBoard();
  });
  const col = page.locator('#boardEsteira .column[data-status="custo"]');
  await expect(col.locator(".card[data-id]")).toHaveCount(30);
  await col.locator(".column__mais").click();
  await expect(col.locator(".card[data-id]")).toHaveCount(45);
  await expect(col.locator(".column__mais")).toHaveCount(0);
});

test("bibliotecas pesadas não são baixadas na abertura", async ({ app: { page } }) => {
  const r = await page.evaluate(() => ({
    chart: [...document.scripts].some((s) => /chart\\.js|chart\\.umd/.test(s.src)),
    pdf: [...document.scripts].some((s) => /pdf\\.min\\.js/.test(s.src)),
  }));
  expect(r).toEqual({ chart: false, pdf: false });
  await page.evaluate(() => {
    const orig = window.carregarChartJs;
    window.__pediuChart = 0;
    window.carregarChartJs = () => (window.__pediuChart++, orig());
  });
  await page.click('[data-tab="dashboard"]');
  // Abrir o dashboard pede o Chart.js (o teste bloqueia a CDN; o dashboard continua funcionando sem gráficos).
  await expect.poll(() => page.evaluate(() => window.__pediuChart)).toBeGreaterThan(0);
  await expect(page.locator("#kpiGeral")).toContainText("Não atribuídas");
});

test("desfazer: arrastar card e Ctrl+Z volta para a coluna anterior", async ({ app: { page } }) => {
  await page.evaluate(() => handleDemandaDrop(state.demandas.find((d) => d.id === "p1"), "custo", BOARD_ATRIBUIDOS));
  await expect(page.locator("#toast")).toContainText("movido para");
  await expect(page.locator('.column[data-status="custo"] .card[data-id="p1"]')).toBeVisible();
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("Control+z");
  await expect(page.locator('.column[data-status="novo"] .card[data-id="p1"]')).toBeVisible();
  const d = await page.evaluate(() => {
    const p = state.demandas.find((x) => x.id === "p1");
    return { status: p.status, hist: p.historicoStatus.length };
  });
  expect(d).toEqual({ status: "novo", hist: 1 });
});

test("desfazer: ação em lote volta todos os projetos", async ({ app: { page } }) => {
  await page.evaluate(() => {
    selecaoEsteira.ids = new Set(["p3", "p4"]);
    loteAtribuirProjetista("__none__");
  });
  expect(await page.evaluate(() => ["p3", "p4"].map((id) => state.demandas.find((d) => d.id === id).responsavel))).toEqual(["", ""]);
  await page.click("#toast .toast__acao");
  expect(await page.evaluate(() => ["p3", "p4"].map((id) => state.demandas.find((d) => d.id === id).responsavel))).toEqual([
    "Matheus",
    "Vinicius",
  ]);
});

test("desfazer: salvar projeto e excluir comentário", async ({ app: { page } }) => {
  await page.evaluate(() => {
    state.demandas.find((d) => d.id === "p1").cidade = "Betim - BET";
    openDemandaModal("p1");
  });
  await page.evaluate(() => {
    document.getElementById("demTitulo").value = "Rota trocada";
  });
  await page.click("#btnSalvarDemanda");
  await expect(page.locator("#toast")).toContainText("Demanda salva");
  await page.click("#toast .toast__acao");
  expect(await page.evaluate(() => state.demandas.find((d) => d.id === "p1").titulo)).toBe("Rota IJA x SRS");

  await page.evaluate(() => openDemandaModal("p1"));
  await page.fill("#demComentarioNovo", "primeiro");
  await page.keyboard.press("Control+Enter");
  await page.locator(".comment-del").first().click();
  expect(await page.evaluate(() => (state.demandas.find((d) => d.id === "p1").comentarios || []).length)).toBe(0);
  await page.click("#toast .toast__acao");
  expect(await page.evaluate(() => state.demandas.find((d) => d.id === "p1").comentarios.map((c) => c.texto))).toEqual(["primeiro"]);
  await expect(page.locator("#demComentariosList")).toContainText("primeiro");
});

test("pegadinha: F1 cruza a busca ao passar o mouse (e respeita menos animação)", async ({ app: { page } }) => {
  await page.hover("#filterBusca");
  const carro = page.locator(".f1-carro");
  await expect(carro).toHaveCount(1);
  await expect(carro).toHaveCount(0, { timeout: 4000 }); // some depois de atravessar
  await page.evaluate(() => (document.documentElement.dataset.menosAnimacao = "1"));
  await page.mouse.move(0, 0);
  await page.hover("#filterBusca");
  await page.waitForTimeout(150);
  await expect(carro).toHaveCount(0);
});
