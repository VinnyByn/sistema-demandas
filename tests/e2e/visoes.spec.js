// Calendário de prazos e mapa dos projetos.
const { test, expect } = require("./app");

const dia = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function projetosComPrazos() {
  return [
    { id: "k1", titulo: "Rota atrasada", tipo: "Backbone", status: "custo", responsavel: "Vinicius", cidade: "Belo Horizonte - BHE", dataFimPrevista: dia(-3), descricao: "x" },
    { id: "k2", titulo: "Prazo hoje", tipo: "SWAP", status: "novo", responsavel: "Matheus", cidade: "Betim - BET", dataFimPrevista: dia(-20), dataFimAtualizada: dia(0), descricao: "x" },
    {
      id: "k3",
      titulo: "Com atividade",
      tipo: "B2C",
      segmentoB2c: "MDU",
      status: "novo",
      responsavel: "Matheus",
      cidade: "Varginha - VGA",
      cidadesExtra: ["Lavras - LAV"],
      descricao: "x",
      checklist: [
        { id: "a1", name: "Vistoria de campo", who: "Matheus", date: dia(2), status: "afazer" },
        { id: "a2", name: "Feita antes", who: "Matheus", date: dia(1), status: "concluida", done: true, dateConclusao: dia(0) },
      ],
    },
    { id: "k4", titulo: "Já concluído", tipo: "SWAP", status: "conclusao", responsavel: "Vinicius", cidade: "Varginha - VGA", dataFimPrevista: dia(1), dataTermino: dia(0), descricao: "x" },
    { id: "k5", titulo: "Cidade fora", tipo: "SWAP", status: "novo", responsavel: "Daniel", cidade: "Goiânia", descricao: "x" },
  ];
}

async function carregar(page) {
  await page.evaluate((dados) => {
    applyLoadedState({ demandas: dados });
    refreshAllViews();
  }, projetosComPrazos());
}

test("calendário: resumo, prazos do mês, filtros e lista; clicar abre o projeto", async ({ app: { page } }) => {
  await carregar(page);
  await page.click('[data-tab="calendario"]');
  await expect(page.locator("#topbarTitle")).toHaveText("Calendário de prazos");
  await page.click('[data-cal-modo="mes"]');

  const resumo = page.locator("#calResumo");
  await expect(resumo.locator('[data-cal-resumo="atrasados"] strong')).toHaveText("1");
  await expect(resumo.locator('[data-cal-resumo="hoje"] strong')).toHaveText("1");
  await expect(resumo.locator('[data-cal-resumo="semana"] strong')).toHaveText("2"); // hoje + atividade em 2 dias

  // Hoje vem escolhido: a lista do dia mostra o projeto com prazo atualizado para hoje.
  await expect(page.locator("#calDiaLista")).toContainText("Prazo hoje");
  await expect(page.locator("#calDiaLista")).toContainText("Prazo atualizado");
  await expect(page.locator(".cal-ev.is-atrasado").first()).toBeVisible();
  // Concluídos ficam de fora até pedir.
  await expect(page.locator("#panelCalendario")).not.toContainText("Já concluído");
  await expect(page.locator("#panelCalendario")).not.toContainText("Feita antes");
  await page.check("#calMostrarConcluidos");
  await page.click('[data-cal-modo="lista"]');
  await expect(page.locator("#calAgenda")).toContainText("Já concluído");
  await page.uncheck("#calMostrarConcluidos");

  // Filtro por projetista e por tipo de prazo.
  await page.selectOption("#calFiltroProjetista", "Vinicius");
  await expect(page.locator("#calAgenda")).toContainText("Rota atrasada");
  await expect(page.locator("#calAgenda")).not.toContainText("Vistoria de campo");
  await page.selectOption("#calFiltroProjetista", "");
  await page.uncheck("#calMostrarProjetos");
  await expect(page.locator("#calAgenda .cal-item")).toHaveCount(1);
  await expect(page.locator("#calAgenda")).toContainText("Vistoria de campo");
  await page.check("#calMostrarProjetos");

  // Atrasados no topo da lista; clicar abre o projeto.
  await expect(page.locator(".cal-agenda__grupo--atraso")).toContainText("Rota atrasada");
  await page.locator(".cal-agenda__grupo--atraso .cal-item").first().click();
  await expect(page.locator("#modalDemanda")).toBeVisible();
  await expect(page.locator("#demTitulo")).toHaveValue("Rota atrasada");
});

test("calendário: navegar entre meses e voltar para hoje", async ({ app: { page } }) => {
  await carregar(page);
  await page.click('[data-tab="calendario"]');
  await page.click('[data-cal-modo="mes"]');
  const titulo = page.locator("#calTitulo");
  const atual = await titulo.textContent();
  await page.click("#calProximo");
  await expect(titulo).not.toHaveText(atual);
  await page.click("#calAnterior");
  await page.click("#calAnterior");
  await page.click("#calHoje");
  await expect(titulo).toHaveText(atual);
  await expect(page.locator(".cal-dia.is-hoje")).toHaveCount(1);
});

test("mapa: uma bolha por cidade, lista lateral, projeto em várias cidades e sem cidade do cadastro", async ({ app: { page } }) => {
  await page.route(/tile\.openstreetmap\.org/, (r) => r.abort());
  await carregar(page);
  await page.click('[data-tab="mapa"]');
  await expect(page.locator("#topbarTitle")).toHaveText("Mapa dos projetos");
  await expect(page.locator("#mapaCanvas.leaflet-container")).toBeVisible();
  await expect(page.locator(".mapa-bolha").first()).toBeVisible();

  const lado = page.locator("#mapaLado");
  // Em andamento: k1 (BH), k2 (Betim), k3 (Varginha + Lavras). k4 é concluído; k5 está fora do cadastro.
  await expect(lado).toContainText("3 projetos em 4 cidades");
  await expect(lado.locator(".mapa-cidade")).toHaveText([/Belo Horizonte.*1/, /Betim.*1/, /Lavras.*1/, /Varginha.*1/]);
  await expect(lado.locator(".mapa-sem-lugar")).toContainText("1 projeto sem cidade do cadastro");

  await page.selectOption("#mapaFiltroSituacao", "todos");
  await expect(lado.locator('[data-mapa-cidade="Varginha - VGA"] b')).toHaveText("2");

  await lado.locator('[data-mapa-cidade="Varginha - VGA"]').click();
  await expect(lado).toContainText("Sul de Minas · 2 projetos");
  await lado.locator('[data-mapa-abrir="k3"]').click();
  await expect(page.locator("#modalDemanda")).toBeVisible();
  await expect(page.locator("#demTitulo")).toHaveValue("Com atividade");
});
