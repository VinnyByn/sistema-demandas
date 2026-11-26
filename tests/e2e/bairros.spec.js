// Liberação por bairros: formulário, totais, liberação parcial e total, card, histórico, dashboard, calendário e relatório.
const { test, expect } = require("./app");

async function preencherBairro(page, i, { nome, portas, ctos, valor }) {
  const linha = page.locator("#demBairrosLista .bairro").nth(i);
  if (nome != null) await linha.locator('[data-bairro-campo="nome"]').fill(nome);
  if (portas != null) await linha.locator('[data-bairro-campo="portas"]').fill(String(portas));
  if (ctos != null) await linha.locator('[data-bairro-campo="ctos"]').fill(String(ctos));
  if (valor != null) {
    await linha.locator('[data-bairro-campo="valor"]').fill(valor);
    await linha.locator('[data-bairro-campo="valor"]').blur();
  }
}

test("bairros: liga no projeto, soma portas/CTOs/valor, libera aos poucos e avisa quando todos foram liberados", async ({ app: { page } }) => {
  await page.evaluate(() => {
    state.demandas.find((d) => d.id === "p1").cidade = "Betim - BET";
    openDemandaModal("p1");
  });
  await expect(page.locator("#demBairrosArea")).toBeHidden();
  await page.locator("#demUsaBairros + .conta-switch__track").click();
  await expect(page.locator("#demBairrosArea")).toBeVisible();
  await expect(page.locator("#demBairrosLista .bairro")).toHaveCount(1);
  // Começa em «todos juntos»; aqui cada bairro é liberado no seu tempo.
  await expect(page.locator('[data-bairros-modo="junto"]')).toHaveAttribute("aria-checked", "true");
  await page.click('[data-bairros-modo="separado"]');
  await expect(page.locator("#demBairrosConjunto")).toBeHidden();

  // Sem nome não salva.
  await preencherBairro(page, 0, { portas: 120 });
  await page.click("#btnSalvarDemanda");
  await expect(page.locator("#toast")).toContainText("Dê um nome ao bairro 1");

  await preencherBairro(page, 0, { nome: "Centro", portas: 120, ctos: 8, valor: "60.000,00" });
  await page.click("#btnBairroAdd");
  await preencherBairro(page, 1, { nome: "Vila Nova", portas: 80, ctos: 5, valor: "40000" });
  await expect(page.locator("#demBairrosResumo")).toContainText("0 de 2 bairros liberados");
  await expect(page.locator("#demBairrosResumo")).toContainText("de 200 portas");
  await expect(page.locator("#demBairrosResumo")).toContainText("R$ 100.000,00");

  // Liberar um: data de hoje e quem liberou vêm sozinhos.
  await page.locator("#demBairrosLista .bairro").nth(0).locator('[data-bairro-campo="situacao"]').selectOption("liberado");
  const hoje = await page.evaluate(() => todayISODate());
  await expect(page.locator("#demBairrosLista .bairro").nth(0).locator('[data-bairro-campo="liberadoEm"]')).toHaveValue(hoje);
  await expect(page.locator("#demBairrosLista .bairro").nth(0)).toContainText("por Vinicius Morais");
  await expect(page.locator("#demBairrosResumo")).toContainText("60%");
  await expect(page.locator("#demBairrosAvisos")).not.toContainText("Todos os bairros");

  await page.click("#btnSalvarDemanda");
  await expect(page.locator("#toast")).toContainText("Demanda salva");
  const salvo = await page.evaluate(() => {
    const d = migrateDemanda(state.demandas.find((x) => x.id === "p1"));
    return { usa: d.liberacaoPorBairros, modo: d.bairrosModo, bairros: d.bairros.map((b) => [b.nome, b.portas, b.ctos, b.valor, b.situacao]), portas: demandaPortasNovas(d) };
  });
  expect(salvo).toEqual({
    usa: true,
    modo: "separado",
    bairros: [
      ["Centro", 120, 8, 60000, "liberado"],
      ["Vila Nova", 80, 5, 40000, "pendente"],
    ],
    portas: 200, // a soma dos bairros é o número oficial de portas novas
  });

  // Card mostra o andamento.
  const card = page.locator('.card[data-id="p1"] .card__bairros');
  await expect(card).toContainText("1/2");
  await expect(card).toContainText("120 de 200 portas liberadas");

  // Histórico registra a liberação.
  const hist = await page.evaluate(() => state.demandas.find((x) => x.id === "p1").historicoEdicoes.at(-1).alteracoes.map((m) => `${m.label}: ${m.para}`));
  expect(hist).toEqual(expect.arrayContaining(["Controle por bairros: Sim", expect.stringMatching(/^Bairro Centro: Liberado em .* · 120 portas · 8 CTOs/)]));

  // Liberar todos: avisa que todos foram liberados.
  await page.evaluate(() => openDemandaModal("p1"));
  await page.click("#btnBairrosLiberarTodos");
  await expect(page.locator("#demBairrosAvisos")).toContainText("Todos os bairros foram liberados");
  await expect(page.locator("#toast")).toContainText("Todos os bairros liberados");
  await expect(page.locator("#btnBairrosLiberarTodos")).toBeHidden();
  await page.click("#btnSalvarDemanda");
  await expect(page.locator("#toast")).toContainText("Demanda salva");
  await expect(card).toContainText("Todos os bairros liberados");
});

test("bairros: diferença com o levantamento de custo e desligar a liberação por bairros", async ({ app: { page } }) => {
  await page.evaluate(() => {
    const d = state.demandas.find((x) => x.id === "p3");
    d.cidade = "Betim - BET";
    d.custo = { temLevantamento: true, valorProjeto: 100000, temPortas: true, qtdCasas: 900, qtdPortasAtual: 100, qtdNovasPortas: 250 };
    d.liberacaoPorBairros = true;
    d.bairros = [{ id: "z1", nome: "Centro", portas: 200, ctos: 10, valor: 90000, situacao: "execucao", inicio: "2026-11-01" }];
    delete d.__isMigrated;
    openDemandaModal("p3");
  });
  await expect(page.locator("#demBairrosAvisos")).toContainText("A soma dos bairros (200 portas) é diferente do levantamento de custo (250)");
  await expect(page.locator("#demBairrosAvisos")).toContainText("valor final do levantamento");

  await page.locator("#demUsaBairros + .conta-switch__track").click(); // desliga; a confirmação («apagar os bairros») é aceita no teste
  await expect(page.locator("#demBairrosArea")).toBeHidden();
  await page.click("#btnSalvarDemanda");
  await expect(page.locator("#toast")).toContainText("Demanda salva");
  const d = await page.evaluate(() => migrateDemanda(state.demandas.find((x) => x.id === "p3")));
  expect([d.liberacaoPorBairros, d.bairros.length]).toEqual([false, 0]);
  expect(await page.evaluate(() => demandaPortasNovas(state.demandas.find((x) => x.id === "p3")))).toBe(250);
});

test("bairros no dashboard, no calendário e no relatório (uma linha por bairro)", async ({ app: { page } }) => {
  await page.evaluate(() => {
    const d = (n) => addDaysISO(todayISODate(), n);
    const p = state.demandas.find((x) => x.id === "p4");
    p.liberacaoPorBairros = true;
    p.bairros = [
      { id: "y1", nome: "Centro", portas: 100, ctos: 6, valor: 50000, situacao: "liberado", inicio: d(-10), liberadoEm: d(0), liberadoPor: "Vinicius" },
      { id: "y2", nome: "Jardim", portas: 50, ctos: 4, valor: 20000, situacao: "execucao", inicio: d(-3), previsao: d(3) },
    ];
    delete p.__isMigrated;
    refreshAllViews();
  });

  await page.evaluate(() => localStorage.removeItem("demandasDashBlocks_v1"));
  await page.click('[data-tab="dashboard"]');
  const bloco = page.locator('[data-dash-block="bairros"]');
  await expect(page.locator('#dashNav [data-dash-ir="bairros"]')).toContainText("Bairros");
  await expect(bloco).toContainText("Bairros liberados");
  await expect(bloco.locator(".kpi").nth(1)).toContainText("1 de 2");
  await expect(bloco.locator(".kpi").nth(2)).toContainText("100");
  await expect(bloco.locator(".dash-bairros-mes tbody tr").last()).toContainText("100");
  await expect(bloco.locator(".dash-bairros-cidade")).toContainText("100 de 150");
  await bloco.locator('[data-dash-abrir="p4"]').click();
  await expect(page.locator("#modalDemanda")).toBeVisible();
  await page.keyboard.press("Escape");

  // Calendário: a previsão do bairro que falta.
  await page.click('[data-tab="calendario"]');
  await page.click('[data-cal-modo="lista"]');
  await expect(page.locator("#calAgenda")).toContainText("Jardim · Troca de OLT");
  await page.uncheck("#calMostrarBairros");
  await expect(page.locator("#calAgenda")).not.toContainText("Jardim · Troca de OLT");

  // Relatório: vista por bairro, com total.
  const linhas = await page.evaluate(() => {
    relFiltros.vista = "bairros";
    return relLinhasBairros(relResultado()).map(({ b }) => [b.nome, b.situacao]);
  });
  expect(linhas).toEqual([
    ["Centro", "liberado"],
    ["Jardim", "execucao"],
  ]);
  const csv = await page.evaluate(() => relGerarCsvBairros(relResultado()));
  expect(csv).toContain("Projeto;Cidade;Projetista(s);Bairro;Situação;Portas novas;CTOs;Valor (R$)");
  expect(csv).toContain("Troca de OLT;Anápolis;Vinicius;Centro;Liberado;100;6;50000,00");
});

test("bairros entregues todos juntos: uma situação e datas para o conjunto, bairro novo herda, calendário com um evento só", async ({ app: { page } }) => {
  await page.evaluate(() => {
    state.demandas.find((d) => d.id === "p2").cidade = "Betim - BET";
    openDemandaModal("p2");
  });
  await page.locator("#demUsaBairros + .conta-switch__track").click();
  await expect(page.locator("#demBairrosConjunto")).toBeVisible();
  // Na lista, só os números de cada bairro (sem situação e datas por bairro).
  await expect(page.locator("#demBairrosLista .bairro__linha--datas")).toHaveCount(0);
  await expect(page.locator("#btnBairrosLiberarTodos")).toBeHidden();
  await preencherBairro(page, 0, { nome: "Centro", portas: 60, ctos: 4 });

  const previsao = await page.evaluate(() => addDaysISO(todayISODate(), 5));
  await page.locator('#demBairrosConjunto [data-conj-campo="situacao"]').selectOption("execucao");
  await page.locator('#demBairrosConjunto [data-conj-campo="previsao"]').fill(previsao);
  await page.click("#btnBairroAdd");
  await preencherBairro(page, 1, { nome: "Vila Nova", portas: 40, ctos: 3 });
  await page.click("#btnSalvarDemanda");
  await expect(page.locator("#toast")).toContainText("Demanda salva");
  const salvo = await page.evaluate(() => {
    const d = migrateDemanda(state.demandas.find((x) => x.id === "p2"));
    return { modo: d.bairrosModo, bairros: d.bairros.map((b) => [b.nome, b.situacao, b.previsao]) };
  });
  expect(salvo).toEqual({
    modo: "junto",
    bairros: [
      ["Centro", "execucao", previsao],
      ["Vila Nova", "execucao", previsao], // o bairro novo herdou a situação e a previsão do conjunto
    ],
  });

  // Calendário: um evento só, com os bairros somados.
  await page.click('[data-tab="calendario"]');
  await page.click('[data-cal-modo="lista"]');
  await expect(page.locator("#calAgenda .cal-ev--bairro")).toHaveCount(1);
  await expect(page.locator("#calAgenda .cal-ev--bairro")).toContainText("2 bairros (todos juntos) · Condomínio Reserva");
  await expect(page.locator("#calAgenda .cal-ev--bairro")).toContainText("100 portas · 7 CTOs");

  // Liberar o conjunto libera todos; passar para «separado» mantém o que já foi feito.
  await page.evaluate(() => openDemandaModal("p2"));
  await page.locator('#demBairrosConjunto [data-conj-campo="situacao"]').selectOption("liberado");
  await expect(page.locator("#demBairrosAvisos")).toContainText("Todos os bairros foram liberados");
  await page.click('[data-bairros-modo="separado"]');
  await expect(page.locator('#demBairrosLista [data-bairro-campo="situacao"]')).toHaveCount(2);
  await expect(page.locator('#demBairrosLista [data-bairro-campo="situacao"]').nth(1)).toHaveValue("liberado");
});
