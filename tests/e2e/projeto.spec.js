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

test("linha do tempo: 'Mover para antes' desce a fase na tela (lista mais recente em cima)", async ({ app: { page } }) => {
  await page.evaluate(() => {
    const p = state.demandas.find((d) => d.id === "p1");
    p.historicoStatus = [
      { status: "novo", inicio: "2026-09-01T09:00:00.000Z", fim: "2026-09-10T09:00:00.000Z" },
      { status: "custo", inicio: "2026-09-10T09:00:00.000Z", fim: null },
    ];
    p.status = "custo";
    openDemandaModal("p1");
  });
  const nomesNaTela = () =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll("#demTimelineTable tbody tr"))
        .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
        .map((tr) => tr.querySelector(".tl-fase strong").textContent)
    );
  const antes = await nomesNaTela();
  expect(antes.length).toBe(2);
  const topo = page.locator("#demTimelineTable tbody tr").last(); // column-reverse: último no DOM = topo da tela
  await topo.locator(".tl-menu__btn").click();
  await expect(topo.locator(".timeline-move-up")).toHaveText("↓ Mover para antes");
  await topo.locator(".timeline-move-up").click();
  const depois = await nomesNaTela();
  expect(depois[1]).toBe(antes[0]);
  expect(depois[0]).toBe(antes[1]);
});

test("B2C TCT: planejamento do alívio aparece só no TCT, é obrigatório e vai para card, ficha e relatório", async ({ app: { page } }) => {
  await page.evaluate(() => {
    state.demandas.find((d) => d.id === "p3").cidade = "Betim - BET";
    openDemandaModal("p3");
  });
  const campo = page.locator("#fieldDemPlanejamentoTct");
  expect(await campo.getAttribute("hidden"), "TCR não tem o campo").not.toBeNull();
  const escolher = (id, valor) =>
    page.evaluate(([i, v]) => {
      const el = document.getElementById(i);
      el.value = v;
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }, [id, valor]);
  // Segmento agora são caixinhas: marca só os pedidos.
  const segmentos = (lista) =>
    page.evaluate((l) => {
      document.querySelectorAll("#demSegmentosB2c [data-seg-b2c]").forEach((i) => (i.checked = l.includes(i.value)));
      document.getElementById("demSegmentosB2c").dispatchEvent(new Event("change", { bubbles: true }));
    }, lista);
  await segmentos(["TCT"]);
  expect(await campo.getAttribute("hidden"), "TCT mostra o campo").toBeNull();
  expect(await page.locator("#demPlanejamentoTct option").allTextContents()).toEqual(["Selecione…", "Planejado", "Não planejado"]);

  // Obrigatório no TCT.
  await page.click("#btnSalvarDemanda");
  await expect(page.locator("#toast")).toContainText("planejamento do alívio");
  expect(await page.evaluate(() => state.demandas.find((d) => d.id === "p3").segmentoB2c)).toBe("TCR");

  await escolher("demPlanejamentoTct", "nao_planejado");
  await page.click("#btnSalvarDemanda");
  await expect(page.locator("#toast")).toContainText("Demanda salva");
  expect(await page.evaluate(() => state.demandas.find((d) => d.id === "p3").planejamentoTct)).toBe("nao_planejado");
  await expect(page.locator('.card[data-id="p3"] .badge--plan-tct-nao')).toHaveText("Não planejado");

  // Relatório: coluna e filtro.
  expect(
    await page.evaluate(() => {
      const d = state.demandas.find((x) => x.id === "p3");
      return [REL_COLUNAS.find((c) => c.key === "planejamentoTct").val(migrateDemanda(d)), relOpcoesFiltro("planejamentosTct").map(([, l]) => l)];
    }),
  ).toEqual(["Não planejado", ["Planejado", "Não planejado", "Não informado"]]);

  // Mudou para outro segmento: o campo some e o valor não fica guardado.
  await page.evaluate(() => openDemandaModal("p3"));
  expect(await page.inputValue("#demPlanejamentoTct")).toBe("nao_planejado");
  await segmentos(["MDU"]);
  expect(await campo.getAttribute("hidden")).not.toBeNull();
  await page.click("#btnSalvarDemanda");
  await expect(page.locator("#toast")).toContainText("Demanda salva");
  expect(await page.evaluate(() => state.demandas.find((d) => d.id === "p3").planejamentoTct)).toBe("");
  await expect(page.locator('.card[data-id="p3"] .badge--plan-tct')).toHaveCount(0);
});

test("B2C com mais de um segmento (TCR + TCT): divisão dos valores em %, obrigatória e somando 100%", async ({ app: { page } }) => {
  await page.evaluate(() => {
    state.demandas.find((d) => d.id === "p3").cidade = "Betim - BET";
    openDemandaModal("p3");
  });
  const segmentos = (lista) =>
    page.evaluate((l) => {
      document.querySelectorAll("#demSegmentosB2c [data-seg-b2c]").forEach((i) => (i.checked = l.includes(i.value)));
      document.getElementById("demSegmentosB2c").dispatchEvent(new Event("change", { bubbles: true }));
    }, lista);
  // O projeto abre em modo leitura (campos atrás de «Editar»): preenche como o formulário faria.
  const digitar = (seg, valor, tipo = "valor") =>
    page.evaluate(([s, v, t]) => {
      const i = document.querySelector(`[data-div-seg="${s}"][data-div-tipo="${t}"]`);
      i.value = v;
      i.dispatchEvent(new Event("input", { bubbles: true }));
    }, [seg, valor, tipo]);
  await expect(page.locator("#demSegmentosB2c [data-seg-b2c]:checked")).toHaveCount(1);
  expect(await page.locator("#demDivisaoSegmentos").getAttribute("hidden"), "um segmento: sem divisão").not.toBeNull();

  await segmentos(["TCR", "TCT"]);
  expect(await page.locator("#demDivisaoSegmentos").getAttribute("hidden")).toBeNull();
  // Começa em partes iguais; digitar num completa o outro.
  // Duas linhas (valor e portas), começando em partes iguais; digitar num completa o outro da mesma linha.
  expect(await page.locator("[data-div-seg]").evaluateAll((els) => els.map((e) => [e.dataset.divTipo, e.dataset.divSeg, e.value]))).toEqual([
    ["valor", "TCR", "50"], ["valor", "TCT", "50"], ["portas", "TCR", "50"], ["portas", "TCT", "50"],
  ]);
  await digitar("TCR", "60");
  await expect(page.locator('[data-div-seg="TCT"][data-div-tipo="valor"]')).toHaveValue("40");
  await expect(page.locator('[data-div-seg="TCT"][data-div-tipo="portas"]')).toHaveValue("50"); // a outra linha não muda
  await digitar("TCR", "70", "portas");
  await expect(page.locator('[data-div-seg="TCT"][data-div-tipo="portas"]')).toHaveValue("30");
  await expect(page.locator('[data-soma-tipo="valor"]')).toHaveText("Total: 100%");
  await expect(page.locator('[data-soma-tipo="portas"]')).toHaveText("Total: 100%");
  // TCT marcado: o planejamento aparece e é obrigatório.
  expect(await page.locator("#fieldDemPlanejamentoTct").getAttribute("hidden")).toBeNull();
  await page.evaluate(() => (document.getElementById("demPlanejamentoTct").value = "planejado"));

  // Soma errada não salva.
  await page.evaluate(() => {
    const i = document.querySelector('[data-div-seg="TCT"][data-div-tipo="portas"]');
    i.value = "10";
    i.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.click("#btnSalvarDemanda");
  await expect(page.locator("#toast")).toContainText("divisão das portas");
  await digitar("TCR", "70", "portas");
  await page.click("#btnSalvarDemanda");
  await expect(page.locator("#toast")).toContainText("Demanda salva");

  const salvo = await page.evaluate(() => {
    const d = state.demandas.find((x) => x.id === "p3");
    return { seg: d.segmentoB2c, segs: d.segmentosB2c, div: d.divisaoSegmentosB2c, plan: d.planejamentoTct };
  });
  expect(salvo).toEqual({ seg: "TCR", segs: ["TCR", "TCT"], div: { valor: { TCR: 60, TCT: 40 }, portas: { TCR: 70, TCT: 30 } }, plan: "planejado" });
  await expect(page.locator('.card[data-id="p3"] .badge--segmento-b2c')).toHaveText(["TCR", "TCT"]);

  // Relatório: coluna mostra a divisão; filtro por TCR ou por TCT acha o projeto; agrupado divide os valores.
  const rel = await page.evaluate(() => {
    const d = migrateDemanda(state.demandas.find((x) => x.id === "p3"));
    d.custo = { temLevantamento: true, valorProjeto: 1000, temPortas: true, qtdCasas: 200, qtdPortasAtual: 10, qtdNovasPortas: 100 };
    const col = REL_COLUNAS.find((c) => c.key === "segmento").val(d);
    const grupos = relResumoAgrupado([d], "segmento").map((l) => [l.chave, l.total, l.portas]);
    return { col, grupos };
  });
  expect(rel.col).toBe("TCR (valor 60% · portas 70%) + TCT (valor 40% · portas 30%)");
  expect(rel.grupos.sort()).toEqual([["TCR", 1, 70], ["TCT", 1, 30]]);

  // Dashboard: conta nos dois segmentos (Total uma vez) e divide as portas.
  const dash = await page.evaluate(() => {
    const d = migrateDemanda(state.demandas.find((x) => x.id === "p3"));
    return segmentosB2cPartes(d).map((p) => [p.seg, Math.round(p.fracao * 100), Math.round(p.fracPortas * 100)]);
  });
  expect(dash).toEqual([["TCR", 60, 70], ["TCT", 40, 30]]);

  // Projeto salvo antes (uma divisão só) continua valendo para valor e portas.
  expect(
    await page.evaluate(() => {
      const antigo = { tipo: "B2C", segmentosB2c: ["TCR", "TCT"], divisaoSegmentosB2c: { TCR: 60, TCT: 40 } };
      return [demandaFracaoSegmento(antigo, "TCR", "valor"), demandaFracaoSegmento(antigo, "TCR", "portas"), segmentosB2cTexto(antigo)];
    }),
  ).toEqual([0.6, 0.6, "TCR 60% + TCT 40%"]);

  // Voltar para um segmento só apaga a divisão.
  await page.evaluate(() => openDemandaModal("p3"));
  await segmentos(["TCR"]);
  await page.click("#btnSalvarDemanda");
  await expect(page.locator("#toast")).toContainText("Demanda salva");
  expect(await page.evaluate(() => {
    const d = state.demandas.find((x) => x.id === "p3");
    return [d.segmentosB2c, d.divisaoSegmentosB2c, d.planejamentoTct];
  })).toEqual([["TCR"], null, ""]);
});
