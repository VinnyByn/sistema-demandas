const { test, expect, diasAtras } = require("./app");

async function abrirDashboard(page) {
  await page.evaluate(() => localStorage.removeItem("demandasDashBlocks_v1"));
  await page.click('[data-tab="dashboard"]');
  await expect(page.locator("#kpiGeral")).toContainText("Não atribuídas");
}

test("dashboard: navegação no topo abre o bloco recolhido, e a explicação fica em «Como ler»", async ({ app: { page } }) => {
  await abrirDashboard(page);
  const nav = page.locator("#dashNav [data-dash-ir]");
  await expect(nav).toHaveText([/^Geral\d*$/, /^Tempo\d*$/, /^Projetistas\d*$/, /^Regionais\d*$/, /^B2C\d*$/, /^B2B\d*$/]);
  await expect(page.locator('#dashNav [data-dash-ir="projetistas"] .dash-nav__n')).toHaveText("2");

  // Durante a rolagem do clique a marcação fica no destino (não passa pelos blocos do caminho).
  await page.evaluate(() => {
    window.__marcas = new Set();
    window.__amostra = setInterval(() => window.__marcas.add(document.querySelector("#dashNav .is-active")?.dataset.dashIr), 20);
  });
  await page.click('#dashNav [data-dash-ir="indicadores-b2c"]');
  await expect(page.locator('#dashNav [data-dash-ir="indicadores-b2c"]')).toHaveClass(/is-active/);
  await page.waitForTimeout(900);
  const marcas = await page.evaluate(() => (clearInterval(window.__amostra), [...window.__marcas]));
  expect(marcas.filter((m) => !["kpi-geral", "indicadores-b2c"].includes(m))).toEqual([]); // nada do caminho
  // O título do bloco para logo abaixo da barra (a posição é corrigida se a página mudar de altura no caminho).
  await expect
    .poll(() =>
      page.evaluate(() => {
        const nav = document.getElementById("dashNav").getBoundingClientRect();
        const bloco = document.querySelector('[data-dash-block="indicadores-b2c"]').getBoundingClientRect();
        const corte = Math.round(bloco.top - nav.bottom);
        return corte >= 0 && corte < 30;
      }),
    )
    .toBe(true);
  // A barra fica abaixo do cabeçalho do topo, nunca atrás dele (mesmo montada antes da tela aparecer).
  const sobra = await page.evaluate(() => Math.round(document.getElementById("dashNav").getBoundingClientRect().top - document.querySelector(".topbar").getBoundingClientRect().bottom));
  expect(sobra).toBeGreaterThanOrEqual(0);
  await expect(page.locator("#dashNavTopo")).toBeVisible();

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

test("dashboard B2C: clicar nos números da tabela abre os projetos daquele segmento e região", async ({ app: { page } }) => {
  await page.evaluate(() => {
    const set = (id, campos) => Object.assign(state.demandas.find((d) => d.id === id), campos);
    const custo = (valor, portas) => ({ temLevantamento: true, valorProjeto: valor, temPortas: portas > 0, qtdCasas: 100, qtdPortasAtual: 10, qtdNovasPortas: portas });
    set("p2", { cidade: "Itajubá - IJA", status: "conclusao", custo: custo(1000, 20) });
    set("p3", { cidade: "Taubaté - TTE", status: "conclusao", custo: custo(2000, 0) });
    state.demandas.push(
      { id: "c1", titulo: "Prédio Azul", tipo: "B2C", segmentoB2c: "MDU", status: "conclusao", responsavel: "Matheus", cidade: "Taubaté - TTE", descricao: "x", custo: custo(3000, 15) },
      { id: "c2", titulo: "Prédio Verde", tipo: "B2C", segmentoB2c: "MDU", status: "conclusao", responsavel: "Matheus", cidade: "Itajubá - IJA", descricao: "x", custo: custo(500, 0) },
    );
    state.demandas.forEach((d) => delete d.__isMigrated);
  });
  await page.evaluate(() => localStorage.removeItem("demandasDashBlocks_v1"));
  await page.click('[data-tab="dashboard"]');
  const tabela = page.locator("#dashB2cSegmentos");
  const modal = page.locator("#modalDashGeoProjetos");
  const linhasModal = modal.locator("tbody tr");

  // MDU · Portas novas: só os MDU com portas (Condomínio Reserva e Prédio Azul).
  await tabela.locator('[data-b2c-seg="MDU"][data-b2c-slice="portas"]').first().click();
  await expect(modal).toBeVisible();
  await expect(page.locator("#modalDashGeoProjetosTitle")).toHaveText("Projetos — Segmento: MDU · Portas novas");
  await expect(linhasModal).toHaveCount(2);
  await expect(modal.locator("thead")).toContainText("Segmento");
  await expect(modal.locator("tfoot")).toContainText("35");
  await page.click("#modalDashGeoProjetosOk");

  // Total de projetos: todos os B2C.
  await tabela.locator('tfoot [data-b2c-seg=""][data-b2c-slice=""]').last().click();
  await expect(page.locator("#modalDashGeoProjetosTitle")).toHaveText("Projetos — B2C: todos os segmentos");
  await expect(linhasModal).toHaveCount(4);
  await page.click("#modalDashGeoProjetosOk");

  // «Onde está o B2C» (gastos por regional): célula São Paulo × MDU = só o Prédio Azul.
  await page.locator('[data-dash-chart-table="b2c-geo"] .dash-chart-table__toggle').click();
  await page.locator('#tableB2cGeo [data-dash-geo-key="MDU"][data-dash-geo-nome="Regional São Paulo"]').click();
  await expect(page.locator("#modalDashGeoProjetosTitle")).toHaveText("Projetos — Segmento: MDU · São Paulo · Valor total geral");
  await expect(linhasModal).toHaveCount(1);
  await expect(linhasModal).toContainText("Prédio Azul");
  await page.click("#modalDashGeoProjetosOk");

  // Total da linha Sul de Minas: todos os segmentos naquela regional.
  await page.locator('#tableB2cGeo tbody [data-dash-geo-key=""][data-dash-geo-nome="Regional Sul de Minas"]').last().click();
  await expect(linhasModal).toHaveCount(2);
});
