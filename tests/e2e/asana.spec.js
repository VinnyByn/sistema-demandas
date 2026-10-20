// Asana no app (funções do Firebase simuladas): escolher o projeto, enviar e sincronizar comentários.
const { test, expect } = require("./app");

async function simularFuncoes(page) {
  await page.evaluate(() => {
    window.__chamadas = [];
    const respostas = {
      asanaProjetos: () => ({
        projetos: [
          { gid: "1211582012771845", nome: "Operação Rede" },
          { gid: "1219543786224599", nome: "Operação B2B" },
        ],
      }),
      createAsanaOperacao: (d) => ({
        already: false,
        taskId: "T1",
        url: "https://app.asana.com/0/1219543786224599/T1",
        projetoGid: d.projetoGid,
        projetoNome: "Operação B2B",
        comentario: { id: "asana_sis_1", texto: "Demanda enviada à Operação no Asana (Operação B2B).", autor: "Asana · Operação", createdAt: new Date().toISOString(), origem: "integracao" },
      }),
      asanaComentario: () => ({ storyGid: "S1" }),
    };
    window.firebase = {
      apps: [1],
      auth: () => ({ currentUser: null, onAuthStateChanged: () => () => {} }),
      functions: () => {},
      app: () => ({
        functions: () => ({
          httpsCallable: (nome) => async (dados) => {
            window.__chamadas.push({ nome, dados });
            return { data: respostas[nome](dados) };
          },
        }),
      }),
    };
  });
}

test("Asana: escolhe o projeto, envia e sincroniza os comentários nos dois sentidos", async ({ app: { page } }) => {
  await simularFuncoes(page);
  await page.evaluate(() => openDemandaModal("p1"));

  await page.click("[data-lv-asana]"); // seção Referências começa em modo leitura
  const opcoes = page.locator("#asanaEnvioProjetosLista .asana-projeto");
  await expect(opcoes).toHaveText(["Operação Rede", "Operação B2B"]);
  await page.fill("#asanaEnvioTexto", "Lançar cabo no poste 12");
  await page.click("#asanaEnvioOk");
  await expect(page.locator(".toast, #toast").last()).toContainText(/Escolha em qual projeto/);
  await page.getByText("Operação B2B").click();
  await page.click("#asanaEnvioOk");

  const referencias = page.locator(".seg-leitura", { hasText: "Asana (Operação)" });
  await expect(referencias.getByRole("link", { name: "Abrir no Asana ↗" })).toHaveAttribute("href", /asana\.com/);
  await expect(referencias).toContainText("Operação B2B");
  const envio = await page.evaluate(() => window.__chamadas.find((c) => c.nome === "createAsanaOperacao").dados);
  expect(envio).toMatchObject({ demandaId: "p1", projetoGid: "1219543786224599", instrucoes: "Lançar cabo no poste 12" });
  await expect(page.locator("#demComentariosList")).toContainText("Demanda enviada à Operação no Asana");

  // Sistema → Asana: comentário digitado aqui chama a função com o texto e o autor.
  await page.fill("#demComentarioNovo", "Equipe confirmada para quinta");
  await page.click("#btnAddComentario");
  await expect
    .poll(() => page.evaluate(() => window.__chamadas.filter((c) => c.nome === "asanaComentario").map((c) => c.dados)))
    .toEqual([expect.objectContaining({ acao: "criar", texto: "Equipe confirmada para quinta", autor: "Vinicius Morais", demandaId: "p1" })]);

  // Asana → sistema: chega da nuvem um comentário feito no Asana; aparece no projeto aberto, sem ✎.
  await page.evaluate(() => {
    const d = state.demandas.find((x) => x.id === "p1");
    d.comentarios = [
      { id: "asana_S9", texto: "Material separado", autor: "João Operação", createdAt: new Date().toISOString(), origem: "asana", asanaStoryGid: "S9" },
      ...d.comentarios,
    ];
    refreshAllViews();
  });
  const doAsana = page.locator(".comment-row", { hasText: "Material separado" });
  await expect(doAsana).toContainText("via Asana");
  await expect(doAsana.locator(".comment-edit-btn")).toHaveCount(0);

  // Um comentário novo aqui não apaga o que veio do Asana, e o do Asana não é reenviado para lá.
  await page.fill("#demComentarioNovo", "Ok, obrigado");
  await page.click("#btnAddComentario");
  const salvo = await page.evaluate(() => state.demandas.find((x) => x.id === "p1").comentarios.map((c) => c.texto));
  expect(salvo).toEqual(expect.arrayContaining(["Material separado", "Ok, obrigado", "Equipe confirmada para quinta"]));
  const enviados = await page.evaluate(() => window.__chamadas.filter((c) => c.nome === "asanaComentario").map((c) => c.dados.texto));
  expect(enviados).toEqual(["Equipe confirmada para quinta", "Ok, obrigado"]);
});

test("Asana: projeto sem tarefa no Asana não envia comentários para lá", async ({ app: { page } }) => {
  await simularFuncoes(page);
  await page.evaluate(() => openDemandaModal("p2"));
  await expect(page.locator("[data-lv-asana]")).toBeVisible();
  await page.fill("#demComentarioNovo", "Só aqui");
  await page.click("#btnAddComentario");
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__chamadas.length)).toBe(0);
});
