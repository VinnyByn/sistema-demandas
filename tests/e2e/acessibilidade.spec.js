// Auditoria automática de acessibilidade (axe-core) nas telas principais, nos dois temas.
const path = require("path");
const { test, expect } = require("./app");

const AXE = path.join(__dirname, "..", "node_modules", "axe-core", "axe.min.js");

async function violacoes(page, contexto) {
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async (ctx) => {
    const r = await axe.run(ctx || document, { resultTypes: ["violations"] });
    return r.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")}`);
  }, contexto);
}

for (const tema of ["dark", "light"]) {
  test(`acessibilidade sem violações · tema ${tema === "dark" ? "escuro" : "claro"}`, async ({ app: { page } }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate((t) => applyTheme(t), tema);
    expect(await violacoes(page), "esteira").toEqual([]);

    await page.evaluate(() => openDemandaModal("p1"));
    await expect(page.locator("#modalDemanda")).toBeVisible();
    expect(await violacoes(page, "#modalDemanda"), "projeto").toEqual([]);
    await page.evaluate(() => document.querySelector("dialog[open]")?.close());

    await page.click('[data-tab="dashboard"]');
    await expect(page.locator("#kpiGeral")).toContainText("Não atribuídas");
    expect(await violacoes(page), "dashboard").toEqual([]);

    await page.evaluate(() => document.getElementById("modalUserConta")?.showModal());
    expect(await violacoes(page, "#modalUserConta"), "minha conta").toEqual([]);
  });
}

test("teclado: setas navegam entre cards e Alt+→ muda de etapa", async ({ app: { page } }) => {
  await page.locator('#boardEsteira .card[data-id="p2"]').focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator('#boardEsteira .card[data-id="p1"]')).toBeFocused();
  await page.keyboard.press("ArrowRight");
  // Vai para a coluna seguinte com cards (mesma altura): Levantamento de custo.
  expect(await page.evaluate(() => document.activeElement.closest(".column")?.dataset.status)).toBe("custo");
  await page.locator('#boardEsteira .card[data-id="p1"]').focus();
  await page.keyboard.press("Alt+ArrowRight");
  expect(await page.evaluate(() => state.demandas.find((d) => d.id === "p1").status)).toBe("analise"); // Projetos novos → Análise geral / Desenho
  await expect(page.locator('#boardEsteira .card[data-id="p1"]')).toBeFocused();
});

test("tamanho do texto fica salvo e aumenta a fonte", async ({ app: { page } }) => {
  const base = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
  await page.evaluate(() => applyFonte("maior"));
  const maior = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
  expect(maior).toBeCloseTo(base * 1.25, 1);
  expect(await page.evaluate(() => localStorage.getItem("demandas-fonte"))).toBe("maior");
});
