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

test("tema Neon: liga pela conta, fica salvo, e escolher o claro desliga", async ({ app: { page } }) => {
  await page.evaluate(() => {
    fillContaScreen(); // como o botão «Minha conta» faz
    showContaPane("perfil");
    document.getElementById("modalUserConta").showModal();
  });
  await page.locator("#neonToggle + .conta-switch__track").click();
  const estado = () =>
    page.evaluate(() => ({
      visual: document.documentElement.getAttribute("data-visual"),
      tema: document.documentElement.getAttribute("data-theme"),
      salvo: localStorage.getItem("demandas-visual"),
    }));
  expect(await estado()).toEqual({ visual: "neon", tema: "dark", salvo: "neon" });
  const logos = () =>
    page.evaluate(() => [document.querySelector("img.brand__logo").getAttribute("src"), document.querySelector('link[rel="icon"]').getAttribute("href")]);
  expect(await logos()).toEqual(["img/logo-neon.svg", "img/logo-neon.svg"]);
  await page.reload();
  await page.waitForFunction(() => typeof window.applyLoadedState === "function");
  expect((await estado()).visual).toBe("neon");
  await page.evaluate(() => applyTheme("light"));
  expect(await estado()).toEqual({ visual: null, tema: "light", salvo: null });
  expect(await logos()).toEqual(["img/favicon.png", "img/favicon.png"]);
});

test("tema Miami: letra condensada nos títulos e botões; textos, campos e listas na letra de leitura", async ({ app: { page } }) => {
  const primeira = (sel) =>
    page.evaluate((s) => {
      const el = document.querySelector(s);
      return el ? getComputedStyle(el).fontFamily.split(",")[0].replace(/["']/g, "").trim() : s + " ausente";
    }, sel);
  const titulos = [".column__title", ".card__title", ".topbar__title", "#btnRelatorio"];
  const leitura = ["body", ".card .card__geo, .card [class*=meta], .card p", "#filterRegional", "#filterBusca", ".column__vazio"];
  await page.evaluate(() => applyVisualNeon(true));
  for (const sel of titulos) expect(await primeira(sel), sel).toBe("Bebas Neue");
  for (const sel of leitura) expect(await primeira(sel), sel).toBe("DM Sans");
  await page.evaluate(() => applyVisualNeon(false));
  for (const sel of [...titulos, ...leitura]) expect(await primeira(sel), sel).not.toBe("Bebas Neue");
});

test("tema Miami: a letra de letreiro fica no centro da caixa (botões, títulos e menus)", async ({ app: { page } }) => {
  await page.evaluate(() => applyVisualNeon(true));
  await page.evaluate(() => document.fonts.load('400 20px "Bebas Neue"'));
  const desvios = await page.evaluate(() => {
    const c = document.createElement("canvas").getContext("2d");
    const alvos = [".sidebar__item", ".btn", ".column__title", ".topbar__title", ".card__title"];
    return alvos.map((sel) => {
      const el = document.querySelector(sel);
      const cs = getComputedStyle(el);
      c.font = `${cs.fontWeight} 100px ${cs.fontFamily}`;
      const m = c.measureText("DASHBOARD");
      const area = m.fontBoundingBoxAscent + m.fontBoundingBoxDescent;
      const centroDaTinta = m.fontBoundingBoxAscent - (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
      return { sel, carregada: document.fonts.check('20px "Bebas Neue"'), desvioEm: Math.round(((centroDaTinta - area / 2) / 100) * 1000) / 1000 };
    });
  });
  for (const d of desvios) {
    expect(d.carregada, "a letra vem do próprio site").toBe(true);
    expect(Math.abs(d.desvioEm), `${d.sel} centralizado`).toBeLessThanOrEqual(0.01);
  }
});

test("dashboard B2C: TCT separado por planejamento do alívio, e o clique abre os projetos", async ({ app: { page } }) => {
  await page.evaluate(() => {
    const custo = (valor, portas) => ({ temLevantamento: true, valorProjeto: valor, temPortas: portas > 0, qtdCasas: 100, qtdPortasAtual: 10, qtdNovasPortas: portas });
    const tct = (id, titulo, planejamentoTct, valor) => ({ id, titulo, tipo: "B2C", segmentoB2c: "TCT", planejamentoTct, status: "conclusao", responsavel: "Matheus", cidade: "Itajubá - IJA", descricao: "x", custo: custo(valor, 5) });
    state.demandas.push(tct("t1", "Alívio Norte", "planejado", 1000), tct("t2", "Alívio Sul", "planejado", 500), tct("t3", "Alívio Leste", "nao_planejado", 2000), tct("t4", "Alívio Antigo", "", 100));
    state.demandas.forEach((d) => delete d.__isMigrated);
  });
  await page.evaluate(() => localStorage.removeItem("demandasDashBlocks_v1"));
  await page.click('[data-tab="dashboard"]');
  const bloco = page.locator("#dashB2cPlanejamentoTct");
  await expect(bloco.locator("tbody tr")).toHaveCount(3);
  const linha = (rotulo) => bloco.locator("tbody tr", { hasText: rotulo });
  await expect(linha("Não planejado").locator("td").first()).toContainText("1");
  await expect(linha("Planejado").first().locator("td").first()).toContainText("2");
  await expect(linha("Não informado").locator("td").first()).toContainText("1");
  await expect(bloco).toContainText("66,7%");

  const modal = page.locator("#modalDashGeoProjetos");
  await bloco.locator('th [data-plan-tct="nao_planejado"]').click();
  await expect(modal).toBeVisible();
  await expect(modal.locator("tbody tr")).toHaveCount(1);
  await expect(modal.locator("tbody")).toContainText("Alívio Leste");
  await expect(page.locator("#modalDashGeoProjetosTitle")).toContainText("Não planejado");
});

test("dashboard B2C: projeto com TCR e TCT entra nos dois segmentos, com as portas divididas", async ({ app: { page } }) => {
  await page.evaluate(() => {
    state.demandas = state.demandas.filter((d) => d.tipo !== "B2C");
    state.demandas.push({
      id: "x1", titulo: "Expansão Centro", tipo: "B2C", segmentoB2c: "TCR", segmentosB2c: ["TCR", "TCT"], divisaoSegmentosB2c: { TCR: 60, TCT: 40 },
      planejamentoTct: "nao_planejado", status: "conclusao", responsavel: "Matheus", cidade: "Itajubá - IJA", descricao: "x",
      custo: { temLevantamento: true, valorProjeto: 1000, temPortas: true, qtdCasas: 200, qtdPortasAtual: 10, qtdNovasPortas: 100 },
    });
    state.demandas.forEach((d) => delete d.__isMigrated);
  });
  await page.evaluate(() => localStorage.removeItem("demandasDashBlocks_v1"));
  await page.click('[data-tab="dashboard"]');
  const tabela = page.locator("#dashB2cSegmentos");
  const portas = (seg) => tabela.locator("tbody tr", { hasText: seg }).locator("td").nth(2);
  await expect(portas("TCR")).toContainText("60");
  await expect(portas("TCT")).toContainText("40");
  await expect(tabela.locator("tfoot td").first()).toHaveText("1"); // Total conta o projeto uma vez
  await expect(tabela).toContainText("envolvem mais de um segmento");
  // Planejamento do TCT: só a parte TCT (40 portas).
  await expect(page.locator("#dashB2cPlanejamentoTct tbody tr", { hasText: "Não planejado" }).locator("td").nth(2)).toContainText("40");
  // Clicar em TCR lista o projeto.
  await tabela.locator('th [data-b2c-seg="TCR"]').click();
  await expect(page.locator("#modalDashGeoProjetos tbody")).toContainText("Expansão Centro");
  await expect(page.locator("#modalDashGeoProjetos tbody")).toContainText("TCR 60% + TCT 40%");
});
