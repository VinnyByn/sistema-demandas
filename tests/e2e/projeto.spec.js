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
  // A lista precisa ficar visível por cima do modal do projeto (não atrás dele).
  const visivel = await page.evaluate(() => {
    const r = document.querySelector("#mencaoAutocomplete li").getBoundingClientRect();
    return !!document.elementFromPoint(r.left + 10, r.top + 10)?.closest("#mencaoAutocomplete");
  });
  expect(visivel).toBe(true);
  await page.keyboard.press("Enter");
  await page.keyboard.type("hoje");
  await page.keyboard.press("Control+Enter");
  const c = await page.evaluate(() => state.demandas.find((d) => d.id === "p1").comentarios[0]);
  expect(c.texto).toBe("Revisar com @Matheus Silva hoje");
  expect(c.mencoes).toEqual(["matheus.silva@soumaster.com.br"]);
  await expect(page.locator("#demComentariosList .mencao")).toHaveText("@Matheus Silva");
});

test("checklist: concluir atividade move o projeto para a coluna configurada (só avança)", async ({ app: { page } }) => {
  const r = await page.evaluate(() => {
    openDemandaModal("p1"); // está em Projetos novos
    editingChecklist = [
      { id: "a", name: "Desenho", who: "V", status: "andamento", moverPara: "vistoria" },
      { id: "b", name: "Rever", who: "V", status: "afazer", moverPara: "novo" },
    ];
    renderChecklistEditor();
    applyChecklistItemPatch("a", { status: "concluida" });
    const aposA = document.getElementById("demStatus").value;
    applyChecklistItemPatch("b", { status: "concluida" });
    return { aposA, aposB: document.getElementById("demStatus").value };
  });
  expect(r).toEqual({ aposA: "vistoria", aposB: "vistoria" });
});

test("checklist: atividade atrasada ganha nova data sem perder o término original", async ({ app: { page } }) => {
  const d = await page.evaluate(() => {
    const d = (n) => addDaysISO(todayISODate(), n);
    openDemandaModal("p1");
    editingChecklist = [
      { id: "a", name: "Aprovação do projeto", who: "Thiago", status: "andamento", dateInicio: d(-6), date: d(-3) },
      { id: "b", name: "Materiais", who: "V", status: "afazer", dateInicio: d(-2), date: d(1), dependeDe: "a" },
    ];
    renderChecklistEditor();
    return { original: d(-3), nova: d(4), cedo: d(-4), bInicio: d(4), bFim: d(7) };
  });
  const linha = page.locator("#demChecklistList .checklist-item").first();
  await expect(linha.locator(".ck-prazo")).toContainText("Atrasada 3 dias");
  await linha.locator(".ck-nova-data-btn").click();
  await expect(page.locator(".checklist-item__edit-nova")).toContainText("Término original");

  // Antes do término original não vale.
  await page.fill("#demChecklistEditNova", d.cedo);
  await page.click(".checklist-item__save");
  await expect(page.locator("#demChecklistEditNova")).toBeVisible();

  await page.fill("#demChecklistEditNova", d.nova);
  await page.click(".checklist-item__save");
  const r = await page.evaluate(() => {
    const g = (id) => editingChecklist.find((x) => x.id === id);
    return { a: g("a"), b: g("b"), prazo: checklistItemPrazo(g("a")).texto };
  });
  expect(r.a.date).toBe(d.original);
  expect(r.a.dateNova).toBe(d.nova);
  expect(r.prazo).toBe("Nova data · termina em 4 dias");
  // A dependente passa a começar depois da nova data.
  expect([r.b.dateInicio, r.b.date]).toEqual([d.bInicio, d.bFim]);
  await expect(linha.locator(".ck-nova-data")).toBeVisible();
  await expect(linha.locator(".ck-nova-data-btn")).toHaveCount(0);
  await page.click("#btnChecklistGantt");
  await expect(page.locator(".checklist-gantt__nova")).toHaveCount(1);

  // Concluindo, o atraso continua contado do término original.
  await page.evaluate(() => applyChecklistItemPatch("a", { status: "concluida" }));
  const fim = await page.evaluate(() => checklistItemPrazo(editingChecklist[0]).texto);
  expect(fim).toBe("Concluída com 3 dias de atraso (na nova data)");
});

test("linha do tempo: atualização só pelo menu ⋯ ou clicando na fase", async ({ app: { page } }) => {
  await page.evaluate(() => openDemandaModal("p1"));
  const linha = page.locator("#demTimelineTable tbody tr").first();
  await linha.scrollIntoViewIfNeeded();
  await linha.hover();
  await expect(page.locator(".tl-nota__add")).toHaveCount(0); // nada aparece ao passar o mouse
  await linha.locator(".tl-menu__btn").click();
  await linha.locator(".timeline-add-obs").click();
  await expect(linha).toHaveClass(/is-editing/);
  await expect(linha.locator(".timeline-obs")).toBeFocused();
});
