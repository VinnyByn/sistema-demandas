const { test, expect } = require("./app");

const linhas = (page) => page.locator("#relDetalhe tbody tr");
const kpi = (page, rotulo) => page.locator("#relKpis .rel-kpi", { hasText: rotulo }).locator("strong");

async function abrir(page) {
  await page.evaluate(() => {
    localStorage.clear();
    const set = (id, campos) => Object.assign(state.demandas.find((d) => d.id === id), campos);
    set("p1", { cidade: "Itajubá - IJA", custo: { temLevantamento: true, valorProjeto: 1000, valorFinal: 1050 } });
    set("p2", { cidade: "Pouso Alegre - PSA", cidadesExtra: ["Taubaté - TTE"] });
    set("p3", { cidade: "Taubaté - TTE", status: "conclusao", dataTermino: "2026-01-10" });
    set("p4", { cidade: "Belo Horizonte - BHE", dataFimPrevista: "2020-01-01", chamadoOcomon: "OC-777" });
    state.demandas.forEach((d) => delete d.__isMigrated);
  });
  await page.click("#btnRelatorio");
  await expect(page.locator("#modalRelatorio")).toBeVisible();
}

async function marcar(page, filtro, valor) {
  const det = page.locator(`#relFiltrosMulti details[data-rel-multi="${filtro}"]`);
  if (!(await det.evaluate((el) => el.open))) await det.locator("summary").click();
  await det.locator(`input[value="${valor}"]`).check();
  await page.keyboard.press("Escape"); // fecha só o menu do filtro
  await expect(det).not.toHaveAttribute("open", "");
  await expect(page.locator("#modalRelatorio")).toBeVisible();
}

test("relatório: filtros por regional, cidade, projetista, etapa, situação e prazo", async ({ app: { page } }) => {
  await abrir(page);
  await expect(linhas(page)).toHaveCount(4);
  await expect(kpi(page, "Projetos")).toHaveText("4");
  await expect(kpi(page, "Concluídos")).toHaveText("1");
  await expect(kpi(page, "Em atraso")).toHaveText("1");

  // Regional Sul de Minas: p1 (Itajubá) e p2 (Pouso Alegre + Taubaté).
  await marcar(page, "regionais", "Regional Sul de Minas");
  await expect(linhas(page)).toHaveCount(2);
  await expect(page.locator("#relFiltrosMulti details[data-rel-multi='regionais'] .rel-multi__valor")).toHaveText("Sul de Minas");
  // As cidades passam a ser só as da regional escolhida.
  await expect(page.locator("#relFiltrosMulti details[data-rel-multi='cidades'] input[value='Taubaté - TTE']")).toHaveCount(0);
  await marcar(page, "cidades", "Pouso Alegre - PSA");
  await expect(linhas(page)).toHaveCount(1);
  await expect(linhas(page).first()).toContainText("Condomínio Reserva");

  await page.click("#btnRelLimpar");
  await expect(linhas(page)).toHaveCount(4);

  await marcar(page, "projetistas", "Vinicius");
  await expect(linhas(page)).toHaveCount(2);
  await marcar(page, "etapas", "operacional:custo");
  await expect(linhas(page)).toHaveCount(1);
  await expect(linhas(page).first()).toContainText("Troca de OLT");
  await page.click("#btnRelLimpar");

  await marcar(page, "situacoes", "concluido");
  await expect(linhas(page)).toHaveCount(1);
  await expect(linhas(page).first()).toContainText("Hospital Central");
  await page.click("#btnRelLimpar");

  await page.selectOption("#relPrazo", "atrasado");
  await expect(linhas(page)).toHaveCount(1);
  await expect(linhas(page).first()).toContainText("Troca de OLT");
  await page.selectOption("#relPrazo", "");

  await page.fill("#relBusca", "OC-777");
  await expect(linhas(page)).toHaveCount(1);
  await page.fill("#relBusca", "");
  await expect(linhas(page)).toHaveCount(4);
});

test("relatório: agrupa por regional e exporta CSV para o Excel", async ({ app: { page } }) => {
  await abrir(page);
  await page.selectOption("#relAgrupar", "regional");
  const resumo = page.locator("#relResumo tbody tr");
  // Sul de Minas (p1, p2), São Paulo (p2, p3), Centro Oeste (p4).
  await expect(resumo.filter({ hasText: "Sul de Minas" }).locator("td").first()).toHaveText("2");
  await expect(resumo.filter({ hasText: "São Paulo" }).locator("td").first()).toHaveText("2");
  await expect(resumo.filter({ hasText: "Centro Oeste" }).locator("td").first()).toHaveText("1");

  await marcar(page, "regionais", "Regional Sul de Minas");
  const [download] = await Promise.all([page.waitForEvent("download"), page.click("#btnRelCsv")]);
  expect(download.suggestedFilename()).toMatch(/^relatorio-projetos-\d{4}-\d{2}-\d{2}\.csv$/);
  const fs = require("fs");
  const csv = fs.readFileSync(await download.path(), "utf8");
  expect(csv.startsWith("﻿")).toBe(true);
  expect(csv).toContain("Filtros: Regional: Sul de Minas");
  const cab = csv.split("\r\n")[3];
  expect(cab.split(";")).toEqual(expect.arrayContaining(["Projeto", "Regional", "Cidade(s)", "Projetista(s)", "Valor final (R$)"]));
  expect(csv).toContain("Rota IJA x SRS");
  expect(csv).toContain("1050,00");
  expect(csv).not.toContain("Troca de OLT");
});

test("relatório: escolhe colunas, lembra os filtros e abre o projeto ao clicar", async ({ app: { page } }) => {
  await abrir(page);
  await page.locator(".rel-multi--colunas summary").click();
  await page.locator("#relColunasLista input[value='ocomon']").check();
  await expect(page.locator("#relDetalhe thead")).toContainText("Chamado Ocomon");
  await page.locator("#relColunasLista input[value='valorFinal']").uncheck();
  await expect(page.locator("#relDetalhe thead")).not.toContainText("Valor final");
  await marcar(page, "tipos", "SWAP");
  await expect(linhas(page)).toHaveCount(1);

  await page.click("#btnRelFechar");
  await page.click("#btnRelatorio");
  await expect(linhas(page)).toHaveCount(1);
  await expect(page.locator("#relDetalhe thead")).toContainText("Chamado Ocomon");

  await linhas(page).first().click();
  await expect(page.locator("#modalRelatorio")).not.toBeVisible();
  await expect(page.locator("#modalDemanda")).toBeVisible();
});
