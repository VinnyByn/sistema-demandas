const { test, expect } = require("./app");

test("checklist: atrasar uma atividade empurra as dependentes", async ({ app: { page } }) => {
  const r = await page.evaluate(() => {
    const d = (n) => addDaysISO(todayISODate(), n);
    editingChecklist = [
      { id: "a", name: "Levantamento", who: "V", status: "andamento", dateInicio: d(-2), date: d(1) },
      { id: "b", name: "Projeto", who: "V", status: "afazer", dateInicio: d(2), date: d(4), dependeDe: "a" },
      { id: "c", name: "Licença", who: "V", status: "afazer", dateInicio: d(5), date: d(6), dependeDe: "b" },
    ];
    applyChecklistItemPatch("a", { date: d(3) });
    const g = (id) => editingChecklist.find((x) => x.id === id);
    return {
      b: [g("b").dateInicio === d(3), g("b").date === d(5)],
      c: [g("c").dateInicio === d(5), g("c").date === d(6)],
      opcoesDeA: checklistOpcoesDependencia(editingChecklist, "a").map((x) => x.id),
    };
  });
  expect(r.b).toEqual([true, true]);
  expect(r.c).toEqual([true, true]);
  expect(r.opcoesDeA).toEqual([]); // b e c dependem de a: escolher qualquer um criaria um ciclo
});

test("comentário com @menção guarda quem foi citado", async ({ app: { page } }) => {
  await page.evaluate(() => {
    DemandasRoles.setRolesMap({ "matheus.silva@soumaster.com.br": "projetista", "vinicius.morais@soumaster.com.br": "admin" });
    openDemandaModal("p1");
  });
  await page.click("#demComentarioNovo");
  await page.keyboard.type("Revisar com @matheus si");
  await expect(page.locator("#mencaoAutocomplete li")).toHaveCount(1);
  await expect(page.locator("#mencaoAutocomplete li")).toContainText("Matheus Silva");
  await page.keyboard.press("Enter");
  await page.keyboard.type("hoje");
  await page.keyboard.press("Control+Enter");
  const c = await page.evaluate(() => state.demandas.find((d) => d.id === "p1").comentarios[0]);
  expect(c.texto).toBe("Revisar com @Matheus Silva hoje");
  expect(c.mencoes).toEqual(["matheus.silva@soumaster.com.br"]);
  await expect(page.locator("#demComentariosList .mencao")).toHaveText("@Matheus Silva");
});

test("projeto aberto mostra a seção de anexos", async ({ app: { page } }) => {
  await page.evaluate(() => openDemandaModal("p1"));
  await expect(page.locator(".fieldset--anexos")).toBeVisible();
  // Sem Firebase (modo local) o envio fica desativado com aviso.
  await expect(page.locator("#demAnexosDica")).toContainText("Firebase Storage");
});
