const { test, expect, diasAtras } = require("./app");

async function abrirDashboard(page) {
  await page.evaluate(() => localStorage.removeItem("demandasDashBlocks_v1"));
  await page.click('[data-tab="dashboard"]');
  await expect(page.locator("#kpiGeral")).toContainText("Não atribuídas");
}

test("dashboard: navegação no topo abre o bloco recolhido, e a explicação fica em «Como ler»", async ({ app: { page } }) => {
  await abrirDashboard(page);
  const nav = page.locator("#dashNav [data-dash-ir]");
  await expect(nav).toHaveText(["Geral", "Tempo", "Projetistas", "Regionais", "B2C", "B2B"]);

  await page.click('.dash-block[data-dash-block="indicadores-b2b"] .dash-block__toggle');
  await expect(page.locator('.dash-block[data-dash-block="indicadores-b2b"]')).toHaveClass(/is-collapsed/);
  await page.click('#dashNav [data-dash-ir="indicadores-b2b"]');
  await expect(page.locator('.dash-block[data-dash-block="indicadores-b2b"]')).not.toHaveClass(/is-collapsed/);
  await expect(page.locator('.dash-block[data-dash-block="indicadores-b2b"] .dash-block__toggle')).toBeInViewport();

  const info = page.locator('.dash-block[data-dash-block="kpi-geral"] .dash-info').first();
  await expect(info.locator("p")).toBeHidden();
  await info.locator("summary").click();
  await expect(info.locator("p")).toContainText("Esteira Projetos (sem B2B)");
});

test("dashboard: tempo em dias legíveis, zerados escondidos e projetistas «de N»", async ({ app: { page } }) => {
  await abrirDashboard(page);
  const etapas = page.locator("#dashTempoSetorMapBody");
  await expect(etapas).toContainText("dias");
  await expect(etapas).not.toContainText(/\dd \d+h/);
  await expect(etapas).toContainText("Sem tempo registrado nas etapas");
  await expect(etapas.locator("tr:not(.dash-tempo-vazias)", { hasText: "Vistoria" })).toHaveCount(0);

  // Pede atenção: só o que tem algo (há 1 sem projetista; nenhum pausado ou reprovado).
  await expect(page.locator("#kpiGeral .kpi")).toHaveCount(1);
  await expect(page.locator("#kpiGeral")).not.toContainText("Reprovados");
  // Tipos sem projeto saem da tabela.
  await expect(page.locator("#kpiGeralPorTipo")).toContainText("Sem projetos:");
  await expect(page.locator("#kpiGeralPorTipo .dash-tipos tbody")).not.toContainText("Migração");
  // Projetistas: deixa claro que é parte do total.
  await expect(page.locator("#kpiProjetistas")).toContainText("de 4 · 1 sem projetista");
});

test("dashboard: atalho de período compara com o anterior, e o cartão abre o Relatório filtrado", async ({ app: { page } }) => {
  await page.evaluate((d) => {
    // Dois projetos antigos (antes dos últimos 90 dias), um deles atrasado.
    state.demandas.push(
      { id: "v1", titulo: "Antigo 1", tipo: "SWAP", status: "custo", responsavel: "Vinicius", cidade: "Lavras - LAV", dataChegada: d.antigo, dataFimPrevista: "2020-01-01", descricao: "x" },
      { id: "v2", titulo: "Antigo 2", tipo: "SWAP", status: "novo", responsavel: "Vinicius", cidade: "Lavras - LAV", dataChegada: d.antigo, descricao: "x" },
    );
    state.demandas.find((x) => x.id === "p4").dataFimPrevista = "2020-01-01";
    state.demandas.forEach((x) => delete x.__isMigrated);
  }, { antigo: diasAtras(120).slice(0, 10) });
  await abrirDashboard(page);
  await page.click('[data-dash-periodo="90"]');
  await expect(page.locator('[data-dash-periodo="90"]')).toHaveClass(/is-active/);
  expect(await page.inputValue("#filterDashDataFim")).toBe(await page.evaluate(() => todayISODate()));
  const total = page.locator("#kpiGeralBaseConclusao .kpi", { hasText: "Total de projetos" });
  await expect(total.locator(".kpi__value")).toHaveText("4");
  await expect(total).toContainText("▲ 2 vs. período anterior");

  const atraso = page.locator('#kpiGeralBaseConclusao [data-dash-relatorio="atrasado"]');
  await expect(atraso.locator(".kpi__value")).toHaveText("1");
  await atraso.click();
  await expect(page.locator("#modalRelatorio")).toBeVisible();
  await expect(page.locator("#relDetalhe tbody tr")).toHaveCount(1);
  await expect(page.locator("#relDetalhe tbody tr")).toContainText("Troca de OLT");
  await expect(page.locator("#relFiltrosAtivos")).toContainText("Esteira: Projetos");
  await expect(page.locator("#relFiltrosAtivos")).toContainText("Data de chegada");
  await page.click("#btnRelFechar");

  await page.click("#btnDashPeriodoLimpar");
  await expect(page.locator('[data-dash-periodo=""]')).toHaveClass(/is-active/);
  await expect(total).not.toContainText("período anterior");
  await expect(total.locator(".kpi__value")).toHaveText("6");
});
