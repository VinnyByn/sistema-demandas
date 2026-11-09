// Contrato do repositório da integração Asana: os mesmos testes rodam contra a implementação em memória
// (usada nos testes do domínio) e contra a implementação do Supabase (funções SQL no PGlite).
// Se as duas se comportam igual aqui, os testes do domínio valem para o banco de verdade.
import test from "node:test";
import assert from "node:assert/strict";
import { repositorioEmMemoria } from "./helpers/repositorio-em-memoria.mjs";
import { criarBancoDeTeste } from "./helpers/supabase-pglite.mjs";
import { criarRepositorioSupabase, separarRemocoes } from "../../supabase/functions/_shared/asana/repositorio-supabase.mjs";
import { REMOVER_CAMPO } from "../../supabase/functions/_shared/asana/constantes.mjs";
import * as asana from "../../supabase/functions/_shared/asana/index.mjs";

let bancoSupabase = null;
const obterBanco = async () => (bancoSupabase ||= await criarBancoDeTeste());

/** Cada implementação cria um repositório já com as demandas `[{ id, dados }]`. */
const implementacoes = [
  {
    nome: "em memória",
    async criar(demandas) {
      return repositorioEmMemoria(Object.fromEntries(demandas.map(({ id, dados }) => [`demandas/${id}`, { comentarios: [], ...dados }])));
    },
  },
  {
    nome: "Supabase (SQL no PGlite)",
    async criar(demandas) {
      const banco = await obterBanco();
      await banco.limpar();
      await banco.semear(demandas);
      return criarRepositorioSupabase(banco.clienteServidor());
    },
  },
];

const comentario = (id, extra = {}) => ({ id, texto: `texto ${id}`, autor: "Ana", createdAt: "2026-10-20T10:00:00.000Z", origem: "integracao", ...extra });
const ids = async (repo, demandaId) => (await repo.listarComentarios(demandaId)).map((c) => c.id);

test.after(async () => {
  if (bancoSupabase) await bancoSupabase.db.close();
});

for (const impl of implementacoes) {
  const t = (nome, fn) => test(`${impl.nome}: ${nome}`, fn);

  t("busca a demanda pelo id e pela tarefa (inclusive ordem anterior)", async () => {
    const repo = await impl.criar([
      { id: "d1", dados: { titulo: "Cond. Alfa", asanaTaskId: "T2", asanaTaskIds: ["T1", "T2"], asana: { taskId: "T2", url: "u" } } },
      { id: "d2", dados: { titulo: "Sem tarefa" } },
    ]);
    const d1 = await repo.buscarDemanda("d1");
    assert.equal(d1.id, "d1");
    assert.equal(d1.dados.titulo, "Cond. Alfa");
    assert.deepEqual(d1.dados.asanaTaskIds, ["T1", "T2"]);
    assert.equal(d1.dados.asana.url, "u");
    assert.equal(await repo.buscarDemanda("nao-existe"), null);
    assert.equal((await repo.buscarDemandaPorTarefa("T1")).id, "d1", "ordem anterior ainda acha a demanda");
    assert.equal((await repo.buscarDemandaPorTarefa("T2")).id, "d1");
    assert.equal(await repo.buscarDemandaPorTarefa("T9"), null);
    const d2 = await repo.buscarDemanda("d2");
    assert.equal(d2.dados.asana, undefined);
    assert.equal(d2.dados.asanaTaskId, undefined);
  });

  t("adicionar comentário: mais novo primeiro, idempotente, campos extras só na primeira vez", async () => {
    const repo = await impl.criar([{ id: "d1", dados: { titulo: "X" } }]);
    await repo.adicionarComentario("d1", comentario("c1"), { asanaTaskId: "T1", asanaTaskIds: ["T1"], asana: { taskId: "T1", url: "u" } });
    await repo.adicionarComentario("d1", comentario("c2"));
    assert.deepEqual(await ids(repo, "d1"), ["c2", "c1"]);
    await repo.adicionarComentario("d1", comentario("c1"), { asanaTaskIds: ["OUTRA"] });
    assert.deepEqual(await ids(repo, "d1"), ["c2", "c1"]);
    const { dados } = await repo.buscarDemanda("d1");
    assert.deepEqual(dados.asanaTaskIds, ["T1"]);
    assert.equal(dados.asanaTaskId, "T1");
    await repo.adicionarComentario("fantasma", comentario("c9"), { asanaTaskId: "X" });
    assert.equal(await repo.buscarDemanda("fantasma"), null);
  });

  t("REMOVER_CAMPO apaga campo de topo e campo aninhado; mesclar soma um nível", async () => {
    const repo = await impl.criar([
      { id: "d1", dados: { asanaTaskId: "T1", asanaTaskIds: ["T1"], asana: { taskId: "T1", url: "u", concluidaEm: "2026-10-20", secao: "Concluído" } } },
    ]);
    await repo.mesclarDemanda("d1", { asana: { secao: "Em andamento" } });
    let { dados } = await repo.buscarDemanda("d1");
    assert.equal(dados.asana.secao, "Em andamento");
    assert.equal(dados.asana.url, "u", "mesclar não apaga o resto");

    await repo.mesclarDemanda("d1", { asana: { concluidaEm: REMOVER_CAMPO }, asanaAviso: { chave: "reaberta:1" } });
    ({ dados } = await repo.buscarDemanda("d1"));
    assert.equal(dados.asana.concluidaEm, undefined, "campo aninhado apagado");
    assert.equal(dados.asana.url, "u");
    assert.equal(dados.asanaAviso.chave, "reaberta:1");

    // cancelar a tarefa: apaga os dois campos de topo junto com o comentário
    await repo.adicionarComentario("d1", comentario("c1"), { asana: REMOVER_CAMPO, asanaTaskId: REMOVER_CAMPO });
    ({ dados } = await repo.buscarDemanda("d1"));
    assert.equal(dados.asana, undefined);
    assert.equal(dados.asanaTaskId, undefined);
    assert.deepEqual(dados.asanaTaskIds, ["T1"], "o histórico de tarefas continua");
  });

  t("mesclar é em profundidade, com listas substituídas e mapa vazio limpando o campo", async () => {
    const repo = await impl.criar([{ id: "d1", dados: { asana: { a: { x: 1, y: 2 }, lista: [1, 2] }, mapa: { k: 1 } } }]);
    await repo.mesclarDemanda("d1", { asana: { a: { y: 3 }, lista: [9] }, mapa: {} });
    const { dados } = await repo.buscarDemanda("d1");
    assert.deepEqual(dados.asana, { a: { x: 1, y: 3 }, lista: [9] });
    assert.deepEqual(dados.mapa, {});
  });

  t("editar e remover comentário", async () => {
    const repo = await impl.criar([{ id: "d1" }]);
    await repo.adicionarComentario("d1", comentario("c1"));
    await repo.adicionarComentario("d1", comentario("c2"));
    await repo.editarComentario("d1", "c1", "texto novo");
    await repo.editarComentario("d1", "inexistente", "x");
    const lista = await repo.listarComentarios("d1");
    assert.equal(lista.find((c) => c.id === "c1").texto, "texto novo");
    assert.ok(lista.find((c) => c.id === "c1").editadoEm, "registra a edição");
    assert.equal(lista.find((c) => c.id === "c2").editadoEm, undefined);
    await repo.removerComentario("d1", "c1");
    assert.deepEqual(await ids(repo, "d1"), ["c2"]);
  });

  t("aviso: não repete a mesma chave e o aviso novo substitui o anterior inteiro", async () => {
    const repo = await impl.criar([
      { id: "d1", dados: { asanaTaskId: "T1", asana: { taskId: "T1", url: "u" }, asanaAviso: { tipo: "andamento", chave: "andamento:T1:A", cienteEm: "2026-10-20T09:05:00.000Z" } } },
    ]);
    const aviso = (chave, tipo = "concluida") => ({ tipo, texto: `aviso ${chave}`, taskId: "T1", em: "2026-10-20T10:00:00.000Z", chave });

    await repo.registrarAviso("d1", { aviso: aviso("concluida:T1:"), comentario: comentario("a1"), camposExtras: { asana: { concluidaEm: "2026-10-20" } } });
    let { dados } = await repo.buscarDemanda("d1");
    assert.equal(dados.asanaAviso.tipo, "concluida");
    assert.equal(dados.asanaAviso.cienteEm, undefined, "não herda o ciente do aviso anterior");
    assert.equal(dados.asana.concluidaEm, "2026-10-20");
    assert.equal(dados.asana.url, "u");
    assert.deepEqual(await ids(repo, "d1"), ["a1"]);

    // mesma chave: sem comentário novo, mas os campos extras ainda entram
    await repo.registrarAviso("d1", { aviso: aviso("concluida:T1:"), comentario: comentario("a2"), camposExtras: { asana: { secao: "Concluído" } } });
    ({ dados } = await repo.buscarDemanda("d1"));
    assert.deepEqual(await ids(repo, "d1"), ["a1"]);
    assert.equal(dados.asana.secao, "Concluído");

    // chave nova, com remoção de campos (tarefa excluída no Asana)
    await repo.registrarAviso("d1", {
      aviso: aviso("excluida:T1:", "excluida"),
      comentario: comentario("a3"),
      camposExtras: { asana: REMOVER_CAMPO, asanaTaskId: REMOVER_CAMPO, asanaAnteriores: [{ taskId: "T1" }] },
    });
    ({ dados } = await repo.buscarDemanda("d1"));
    assert.equal(dados.asanaAviso.tipo, "excluida");
    assert.equal(dados.asana, undefined);
    assert.equal(dados.asanaTaskId, undefined);
    assert.deepEqual(dados.asanaAnteriores, [{ taskId: "T1" }]);
    assert.deepEqual(await ids(repo, "d1"), ["a3", "a1"]);
  });

  // Obs.: o PGlite tem uma única conexão e executa as chamadas em série, então isto confere a regra
  // (mesma chave → um só), mas não exercita a trava FOR UPDATE do Postgres sob concorrência real.
  t("mesma chave chamada duas vezes seguidas: um aviso só e uma reserva de envio só", async () => {
    const repo = await impl.criar([{ id: "d1", dados: { asanaTaskId: "T1" } }]);
    const aviso = { tipo: "concluida", texto: "x", taskId: "T1", em: "2026-10-20T10:00:00.000Z", chave: "concluida:T1:" };
    await Promise.all([
      repo.registrarAviso("d1", { aviso, comentario: comentario("p1") }),
      repo.registrarAviso("d1", { aviso, comentario: comentario("p2") }),
    ]);
    assert.equal((await repo.listarComentarios("d1")).length, 1);
    const reservas = await Promise.all([repo.reservarEnvio("d1", "c1", { estado: "enviando" }), repo.reservarEnvio("d1", "c1", { estado: "enviando" })]);
    assert.deepEqual(reservas.slice().sort(), [false, true]);
  });

  t("envio de comentário: reserva, atualização e liberação da trava", async () => {
    const repo = await impl.criar([{ id: "d1" }]);
    assert.equal(await repo.buscarEnvio("d1", "c1"), null);
    assert.equal(await repo.reservarEnvio("d1", "c1", { estado: "enviando", email: "bia@x.com", autor: "Bia", criadoEm: "2026-10-20T10:00:00.000Z" }), true);
    assert.equal(await repo.reservarEnvio("d1", "c1", { estado: "enviando" }), false);
    let envio = await repo.buscarEnvio("d1", "c1");
    assert.equal(envio.estado, "enviando");
    assert.equal(envio.email, "bia@x.com");
    assert.equal(envio.autor, "Bia");
    assert.equal(envio.storyGid, undefined);
    await repo.atualizarEnvio("d1", "c1", { storyGid: "S1", estado: "ok" });
    envio = await repo.buscarEnvio("d1", "c1");
    assert.deepEqual([envio.storyGid, envio.estado, envio.email], ["S1", "ok", "bia@x.com"]);
    await repo.apagarEnvio("d1", "c1");
    assert.equal(await repo.buscarEnvio("d1", "c1"), null);
    assert.equal(await repo.reservarEnvio("d1", "c1", { estado: "enviando" }), true, "trava liberada");
  });

  t("vínculo story↔comentário e anexos registrados", async () => {
    const repo = await impl.criar([{ id: "d1" }]);
    assert.equal(await repo.buscarVinculoStory("S1"), null);
    await repo.salvarVinculoStory("S1", { demandaId: "d1", comentarioId: "c1", origem: "sistema" });
    assert.deepEqual(await repo.buscarVinculoStory("S1"), { demandaId: "d1", comentarioId: "c1", origem: "sistema" });
    await repo.salvarVinculoStory("S1", { demandaId: "d1", comentarioId: "c2", origem: "asana" });
    assert.equal((await repo.buscarVinculoStory("S1")).comentarioId, "c2", "regravar substitui");
    await repo.apagarVinculoStory("S1");
    assert.equal(await repo.buscarVinculoStory("S1"), null);

    assert.equal(await repo.anexoRegistrado("AT1"), false);
    await repo.registrarAnexo("AT1", { demandaId: "d1", em: "2026-10-20T10:00:00.000Z" });
    assert.equal(await repo.anexoRegistrado("AT1"), true);
    assert.equal(await repo.anexoRegistrado("AT2"), false);
  });

  t("webhook por projeto: vazio vira {}, mescla campos e guarda a janela como número", async () => {
    const repo = await impl.criar([]);
    assert.deepEqual(await repo.buscarWebhook("P1"), {});
    const janela = Date.now() + 2 * 60 * 1000;
    await repo.mesclarWebhook("P1", { handshakeAte: janela });
    let webhook = await repo.buscarWebhook("P1");
    assert.equal(typeof webhook.handshakeAte, "number", "milissegundos, não data");
    assert.equal(webhook.handshakeAte, janela);
    await repo.mesclarWebhook("P1", { secret: "do-asana", handshakeAte: 0, handshakeEm: "2026-10-20T10:00:00.000Z" });
    await repo.mesclarWebhook("P1", { webhookGid: "W1", target: "https://x?projeto=P1", versao: 2, atualizadoEm: "2026-10-20T10:01:00.000Z" });
    webhook = await repo.buscarWebhook("P1");
    assert.deepEqual([webhook.secret, webhook.handshakeAte, webhook.webhookGid, webhook.versao], ["do-asana", 0, "W1", 2]);
    assert.deepEqual(await repo.buscarWebhook("P2"), {}, "projetos não se misturam");
  });
}


test("Supabase: erro do banco vira exceção (o cliente devolve { error } sem lançar)", async () => {
  const banco = await obterBanco();
  await banco.limpar();
  const repo = criarRepositorioSupabase(banco.clienteServidor());
  await assert.rejects(repo.reservarEnvio("d1", "c1", { criadoEm: "isso nao e uma data" }), /Banco \(asana_reservar_envio\)/);
});

test("separarRemocoes troca REMOVER_CAMPO por caminhos, e mapa só com remoções não vira mapa vazio (que limparia o campo)", () => {
  const { campos, remover } = separarRemocoes({ a: REMOVER_CAMPO, asana: { concluidaEm: REMOVER_CAMPO, secao: "X" }, so: { x: REMOVER_CAMPO }, vazio: {}, lista: [1, 2] });
  assert.deepEqual(remover, [["a"], ["asana", "concluidaEm"], ["so", "x"]]);
  assert.deepEqual(campos, { asana: { secao: "X" }, vazio: {}, lista: [1, 2] });
});

test("Supabase: fluxo do domínio inteiro (enviar, concluir, nova ordem, excluir) passa pelo SQL sem perder campos", async () => {
  const banco = await obterBanco();
  await banco.limpar();
  await banco.semear([{ id: "d1", dados: { titulo: "Cond. Alfa", cidade: "Betim" } }]);
  const repositorio = criarRepositorioSupabase(banco.clienteServidor());
  const projeto = asana.ASANA_PROJETOS[0].gid;

  let ultima = 0;
  const fetchImpl = async (url, opcoes) => {
    const caminho = new URL(url).pathname.replace("/api/1.0", "");
    const resposta = (dados) => ({ ok: true, status: 200, text: async () => JSON.stringify({ data: dados }) });
    if (opcoes.method === "POST" && caminho === "/tasks") return resposta({ gid: `T${++ultima}`, permalink_url: `https://app.asana.com/0/p/T${ultima}` });
    if (caminho.startsWith("/projects/")) return resposta({ name: "Operação" });
    if (caminho === "/webhooks") return resposta(opcoes.method === "POST" ? { gid: "W1" } : []);
    if (/^\/tasks\/T\d+$/.test(caminho) && opcoes.method === "GET") return resposta({ completed: true });
    return resposta({});
  };
  const base = { repositorio, token: "tok", fetchImpl };
  const enviar = (extra) => asana.criarTarefa({ ...base, demandaId: "d1", projetoGid: projeto, endpoint: "https://x/asanaWebhook", ...extra });
  const evento = (extra) => ({ resource: { gid: "T1", resource_type: "task" }, ...extra });
  const lerDados = async () => (await repositorio.buscarDemanda("d1")).dados;

  await enviar({ instrucoes: "primeira" });
  let dados = await lerDados();
  assert.deepEqual([dados.asanaTaskId, dados.asana.url, dados.asana.projetoGid, dados.asanaTaskIds], ["T1", "https://app.asana.com/0/p/T1", projeto, ["T1"]]);
  await assert.rejects(enviar({ instrucoes: "cedo", novaOrdem: true }), /ainda não foi concluída/);

  assert.equal(await asana.processarEvento({ ...base, evento: evento({ action: "changed", change: { field: "completed" } }) }), "concluida");
  dados = await lerDados();
  assert.ok(dados.asana.concluidaEm, "ordem concluída");
  assert.equal(dados.asanaAviso.tipo, "concluida");
  assert.equal(dados.asana.url, "https://app.asana.com/0/p/T1", "concluir não apaga o resto do vínculo");

  await enviar({ instrucoes: "retrabalho", novaOrdem: true });
  dados = await lerDados();
  assert.deepEqual([dados.asanaTaskId, dados.asanaTaskIds], ["T2", ["T1", "T2"]]);
  assert.deepEqual(dados.asanaAnteriores.map((a) => a.taskId), ["T1"]);

  // aperto de mão do webhook pelo mesmo caminho do servidor
  assert.equal(await asana.registrarHandshake({ repositorio, projetoGid: projeto, segredo: "do-asana" }), true);
  assert.equal(await asana.segredoDoWebhook({ repositorio, projetoGid: projeto }), "do-asana");

  assert.equal(await asana.processarEvento({ ...base, evento: { resource: { gid: "T2", resource_type: "task" }, action: "deleted" } }), "excluida");
  dados = await lerDados();
  assert.equal(dados.asanaTaskId, undefined);
  assert.equal(dados.asana, undefined);
  assert.deepEqual(dados.asanaAnteriores.map((a) => a.taskId), ["T1", "T2"]);
  assert.equal(dados.asanaAviso.tipo, "excluida");
  const textos = (await repositorio.listarComentarios("d1")).map((c) => c.texto);
  assert.equal(textos.length, 4, "enviada, concluída, nova ordem e excluída");
  assert.match(textos[0], /excluída no Asana/);
});
