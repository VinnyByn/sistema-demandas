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
        taskId: d.novaOrdem ? "T2" : "T1",
        url: `https://app.asana.com/0/1219543786224599/${d.novaOrdem ? "T2" : "T1"}`,
        projetoGid: d.projetoGid,
        projetoNome: "Operação B2B",
        comentario: { id: "asana_sis_1", texto: "Demanda enviada à Operação no Asana (Operação B2B).", autor: "Asana · Operação", createdAt: new Date().toISOString(), origem: "integracao" },
      }),
      asanaComentario: () => ({ storyGid: "S1" }),
      asanaAnexar: (d) => ({ gid: "AT", nome: d.nome, comentario: { id: `asana_sis_anexo_${d.nome}`, texto: `📎 Anexou o arquivo «${d.nome}» no Asana`, autor: d.autor, createdAt: new Date().toISOString(), origem: "integracao" } }),
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

test("Asana: comentário marcado só para o sistema não vai; nova ordem guarda a anterior", async ({ app: { page } }) => {
  await simularFuncoes(page);
  await page.evaluate(() => {
    const d = state.demandas.find((x) => x.id === "p1");
    d.asanaTaskId = "T1";
    d.asana = { taskId: "T1", url: "https://app.asana.com/0/x/T1", projetoGid: "1211582012771845", projetoNome: "Operação Rede" };
    openDemandaModal("p1");
  });
  // Ordem ainda aberta no Asana: "+ Nova ordem" não aparece.
  await expect(page.locator("[data-lv-asana-nova]")).toHaveCount(0);
  await page.evaluate(() => {
    const d = state.demandas.find((x) => x.id === "p1");
    d.asana = { ...d.asana, concluidaEm: new Date().toISOString() };
    refreshAllViews();
  });
  await expect(page.locator("#demComentarioAsanaBox")).toBeVisible();
  await page.uncheck("#demComentarioAsana");
  await page.fill("#demComentarioNovo", "Nota interna");
  await page.click("#btnAddComentario");
  await expect(page.locator(".comment-row", { hasText: "Nota interna" })).toContainText("só no sistema");
  await page.check("#demComentarioAsana");
  await page.fill("#demComentarioNovo", "Para a Operação");
  await page.click("#btnAddComentario");
  await expect(page.locator(".comment-row", { hasText: "Para a Operação" })).toContainText("↗ Asana");
  await expect
    .poll(() => page.evaluate(() => window.__chamadas.filter((c) => c.nome === "asanaComentario").map((c) => c.dados.texto)))
    .toEqual(["Para a Operação"]);

  await expect(page.locator("[data-lv-asana-nova]")).toBeVisible();
  await page.click("[data-lv-asana-nova]");
  await page.locator("#asanaEnvioProjetosLista input").first().check();
  await expect(page.locator("#asanaEnvioOk")).toHaveText("Abrir nova ordem");
  await page.fill("#asanaEnvioTexto", "Refazer emenda");
  await page.click("#asanaEnvioOk");
  const envio = await page.evaluate(() => window.__chamadas.filter((c) => c.nome === "createAsanaOperacao").at(-1).dados);
  expect(envio).toMatchObject({ novaOrdem: true, instrucoes: "Refazer emenda" });
  const d = await page.evaluate(() => state.demandas.find((x) => x.id === "p1"));
  expect(d.asanaTaskId).toBe("T2");
  expect(d.asanaAnteriores.map((a) => a.taskId)).toEqual(["T1"]);
  await expect(page.locator(".seg-leitura", { hasText: "Asana (Operação)" }).first()).toContainText("Ordens anteriores");
});

test("Asana: aviso de concluída aparece nos alertas e sai com Ciente", async ({ app: { page } }) => {
  await page.evaluate(() => {
    const d = state.demandas.find((x) => x.id === "p3");
    d.asanaTaskId = "T7";
    d.asana = { taskId: "T7", url: "https://app.asana.com/0/x/T7", projetoNome: "Operação Rede", concluidaEm: new Date().toISOString() };
    d.asanaAviso = { tipo: "concluida", texto: "A Operação concluiu a tarefa no Asana.", taskId: "T7", em: new Date().toISOString(), chave: "c" };
    renderBoard();
  });
  await page.click("#btnNotif");
  const linha = page.locator("#esteiraInboxAlertas .alerta", { hasText: "Hospital Central" }).filter({ hasText: "Concluída no Asana" });
  await expect(linha).toHaveCount(1);
  await linha.locator("[data-asana-ciente]").click();
  await expect(page.locator("#esteiraInboxAlertas")).not.toContainText("Concluída no Asana");
  expect(await page.evaluate(() => !!state.demandas.find((x) => x.id === "p3").asanaAviso.cienteEm)).toBe(true);
});

test("Asana: anexos escolhidos no envio vão para a tarefa, e dá para anexar depois", async ({ app: { page } }) => {
  await simularFuncoes(page);
  await page.evaluate(() => openDemandaModal("p1"));
  await page.click("[data-lv-asana]");
  await page.locator("#asanaEnvioProjetosLista input").first().check();
  await page.fill("#asanaEnvioTexto", "Executar conforme planta");
  await page.setInputFiles("#asanaEnvioArquivos", [
    { name: "planta.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 x") },
    { name: "foto.jpg", mimeType: "image/jpeg", buffer: Buffer.from([0xff, 0xd8, 0xff]) },
  ]);
  await expect(page.locator("#asanaEnvioArquivosLista li")).toHaveCount(2);
  await page.locator('#asanaEnvioArquivosLista [data-anexo-remover="1"]').click();
  await expect(page.locator("#asanaEnvioArquivosLista li")).toHaveCount(1);
  await page.click("#asanaEnvioOk");
  await expect
    .poll(() => page.evaluate(() => window.__chamadas.filter((c) => c.nome === "asanaAnexar").map((c) => [c.dados.nome, c.dados.base64])))
    .toEqual([["planta.pdf", Buffer.from("%PDF-1.4 x").toString("base64")]]);
  await expect(page.locator("#demComentariosList")).toContainText("Anexou o arquivo «planta.pdf» no Asana");

  // depois do envio: 📎 Anexar ao Asana
  await expect(page.locator("[data-lv-asana-anexar]")).toBeVisible();
  await page.setInputFiles("#asanaAnexarInput", [{ name: "medicao.xlsx", mimeType: "application/vnd.ms-excel", buffer: Buffer.from("x") }]);
  await expect
    .poll(() => page.evaluate(() => window.__chamadas.filter((c) => c.nome === "asanaAnexar").map((c) => c.dados.nome)))
    .toEqual(["planta.pdf", "medicao.xlsx"]);
  await expect(page.locator("#demComentariosList")).toContainText("medicao.xlsx");
});

test("Asana: aviso novo vira notificação na tela e faixa no projeto aberto", async ({ app: { page } }) => {
  await page.evaluate(() => {
    refreshAllViews(); // estado inicial: nada pendente
    openDemandaModal("p3");
    const d = state.demandas.find((x) => x.id === "p3");
    d.asanaTaskId = "T7";
    d.asana = { taskId: "T7", url: "https://app.asana.com/0/x/T7", concluidaEm: new Date().toISOString() };
    d.asanaAviso = { tipo: "concluida", texto: "A Operação concluiu a tarefa no Asana.", taskId: "T7", em: new Date().toISOString(), chave: "c" };
    refreshAllViews(); // como se tivesse chegado da nuvem
  });
  await expect(page.locator("#toast")).toContainText("Concluída no Asana: «Hospital Central»");
  await expect(page.locator("#demAsanaAvisoBanner")).toBeVisible();
  await expect(page.locator("#demAsanaAvisoTexto")).toContainText("concluiu a tarefa");
  await page.click("#btnDemAsanaCiente");
  await expect(page.locator("#demAsanaAvisoBanner")).toBeHidden();
});

test("Asana: aviso aparece no sino mesmo com filtro ou em outra esteira", async ({ app: { page } }) => {
  await page.evaluate(() => {
    const d = state.demandas.find((x) => x.id === "p3");
    d.asanaTaskId = "T7";
    d.asana = { taskId: "T7", url: "u", concluidaEm: new Date().toISOString() };
    d.asanaAviso = { tipo: "concluida", texto: "A Operação concluiu a tarefa no Asana.", taskId: "T7", em: new Date().toISOString(), chave: "c" };
    document.getElementById("filterBusca").value = "Rota IJA"; // filtro que esconde o Hospital Central
    document.getElementById("filterBusca").dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.click("#btnNotif");
  await expect(page.locator("#esteiraInboxAlertas .alerta", { hasText: "Hospital Central" })).toContainText("Concluída no Asana");
  await expect(page.locator("#esteiraInboxAlertas")).toContainText("Asana 1");
});

test("Asana: aviso mais novo que o último Ciente volta a aparecer no sino", async ({ app: { page } }) => {
  await page.evaluate(() => {
    const d = state.demandas.find((x) => x.id === "p1");
    d.asanaTaskId = "T1";
    d.asana = { taskId: "T1", url: "u", concluidaEm: new Date().toISOString() };
    // dado já gravado assim no Firestore: aviso novo com o cienteEm do anterior
    d.asanaAviso = { tipo: "concluida", texto: "A Operação concluiu a tarefa no Asana.", taskId: "T1", em: "2026-10-20T12:00:00.000Z", chave: "c", cienteEm: "2026-10-20T10:00:00.000Z" };
    renderBoard();
  });
  await page.click("#btnNotif");
  await expect(page.locator("#esteiraInboxAlertas .alerta", { hasText: "Rota IJA" })).toContainText("Concluída no Asana");
});
