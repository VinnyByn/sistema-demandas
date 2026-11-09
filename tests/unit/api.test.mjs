// Função `api` e webhook do Asana: quem pode o quê, o formato dos erros e a assinatura (banco real, Asana simulado).
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { criarBancoDeTeste } from "./helpers/supabase-pglite.mjs";
import { responderApi } from "../../supabase/functions/_shared/api.mjs";
import { responderWebhookAsana } from "../../supabase/functions/_shared/asana-webhook.mjs";
import { ASANA_PROJETOS } from "../../supabase/functions/_shared/asana/constantes.mjs";

const SEED = "vinicius.morais@soumaster.com.br";
const PROJ = ASANA_PROJETOS[1].gid;
const META = {
  roles: { [SEED]: "admin", "ana@x.com": "admin", "bia@x.com": "projetista", "caio@x.com": "visibilidade", "duda@x.com": "projetista" },
  disabledUsers: { "duda@x.com": true },
  purgedUsers: {},
  userDisplayNames: { "bia@x.com": "Bia Projetos" },
};
const ENV = { SUPABASE_URL: "https://x.supabase.co", ASANA_TOKEN: "tok" };

let banco;

function asanaFalso() {
  const chamadas = [];
  const fetchImpl = async (url, opts = {}) => {
    const caminho = new URL(url).pathname.replace("/api/1.0", "");
    const metodo = opts.method || "GET";
    const corpo = typeof opts.body === "string" ? JSON.parse(opts.body).data : opts.body;
    chamadas.push({ metodo, caminho, corpo });
    const resp = (dados, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify({ data: dados }) });
    if (caminho.startsWith("/projects/")) return resp({ name: "Operação" });
    if (caminho === "/webhooks") return resp(metodo === "POST" ? { gid: "W1" } : []);
    if (caminho === "/tasks" && metodo === "POST") return resp({ gid: "T1", permalink_url: "https://app.asana.com/0/p/T1" });
    if (/\/stories$/.test(caminho)) return resp({ gid: "S1" });
    if (caminho === "/attachments") return resp({ gid: "AT1", name: "a.pdf", permalink_url: "https://app.asana.com/a" });
    if (caminho.startsWith("/stories/")) return resp({ gid: "S9", text: "Oi do Asana", resource_subtype: "comment_added", created_by: { name: "João" }, target: { gid: "T1" } });
    return resp({});
  };
  return { fetchImpl, chamadas };
}

function adminDeTeste(authAdmin) {
  return { ...banco.clienteServidor(), auth: { admin: authAdmin } };
}

async function chamar(email, acao, dados = {}, { env = ENV, authAdmin = {}, asana = asanaFalso() } = {}) {
  const req = new Request("https://x/api", { method: "POST", body: JSON.stringify({ acao, dados }) });
  const usuarioId = email ? await banco.idDoUsuario(email) : "";
  const res = await responderApi(req, { usuarioId, admin: adminDeTeste(authAdmin), env, fetchImpl: asana.fetchImpl });
  return { status: res.status, corpo: await res.json(), asana };
}

const semLog = async (fn) => {
  const [e, w] = [console.error, console.warn];
  console.error = () => {};
  console.warn = () => {};
  try {
    return await fn();
  } finally {
    console.error = e;
    console.warn = w;
  }
};

before(async () => {
  banco = await criarBancoDeTeste();
});
after(async () => {
  await banco.db.close();
});
beforeEach(async () => {
  await banco.limpar();
  await banco.definirMeta(META);
  await banco.semear([{ id: "d1", dados: { titulo: "Cond. Alfa", cidade: "Betim", comentarios: [] } }]);
});

test("quem não pode recebe 403 com a mensagem certa, e o Asana nem é chamado", async () => {
  const casos = [
    ["estranho@x.com", "asanaProjetos", /não tem acesso/],
    ["estranho@x.com", "createAsanaOperacao", /não tem acesso/],
    ["caio@x.com", "createAsanaOperacao", /somente leitura/],
    ["duda@x.com", "asanaComentario", /desabilitada/],
    ["bia@x.com", "backupAgora", /Só administradores/],
    ["bia@x.com", "criarContaLogin", /Só administradores/],
    ["bia@x.com", "listarContasLogin", /Só administradores/],
  ];
  for (const [email, acao, msg] of casos) {
    const r = await chamar(email, acao, { demandaId: "d1", instrucoes: "x" });
    assert.equal(r.status, 403, `${email} ${acao}`);
    assert.equal(r.corpo.erro.codigo, "permission-denied");
    assert.match(r.corpo.erro.mensagem, msg);
    assert.equal(r.asana.chamadas.length, 0);
  }
  const semEmail = await chamar("", "asanaProjetos");
  assert.deepEqual([semEmail.status, semEmail.corpo.erro.codigo], [401, "unauthenticated"]);
});

test("ação desconhecida, propriedade herdada e pedido inválido não executam nada", async () => {
  for (const acao of ["naoExiste", "constructor", "__proto__", "toString"]) {
    const r = await chamar(SEED, acao);
    assert.deepEqual([r.status, r.corpo.erro.codigo], [404, "not-found"], acao);
  }
  const res = await responderApi(new Request("https://x/api", { method: "POST", body: "isso não é json" }), { email: SEED, admin: adminDeTeste({}), env: ENV });
  assert.equal(res.status, 400);
});

test("enviar ao Asana: valida, cria a tarefa, grava o vínculo e usa o endereço do Supabase no webhook", async () => {
  assert.match((await chamar("bia@x.com", "createAsanaOperacao", { instrucoes: "x" })).corpo.erro.mensagem, /Informe a demanda/);
  assert.match((await chamar("bia@x.com", "createAsanaOperacao", { demandaId: "d1" })).corpo.erro.mensagem, /Informe as instruções/);
  assert.match((await chamar("bia@x.com", "createAsanaOperacao", { demandaId: "d1", instrucoes: "x".repeat(4001) })).corpo.erro.mensagem, /no máximo 4000/);
  const projetoInvalido = await chamar("bia@x.com", "createAsanaOperacao", { demandaId: "d1", instrucoes: "x", projetoGid: "999" });
  assert.deepEqual([projetoInvalido.status, projetoInvalido.corpo.erro.codigo], [400, "invalid-argument"]);
  const inexistente = await chamar("bia@x.com", "createAsanaOperacao", { demandaId: "nao", instrucoes: "x", projetoGid: PROJ });
  assert.equal(inexistente.corpo.erro.codigo, "failed-precondition", "not-found fica reservado para função não publicada");

  const r = await chamar("bia@x.com", "createAsanaOperacao", { demandaId: "d1", instrucoes: "Lançar cabo", projetoGid: PROJ });
  assert.equal(r.status, 200);
  assert.equal(r.corpo.taskId, "T1");
  assert.equal(r.corpo.createdBy, "bia@x.com", "o autor vem da sessão");
  const d = await banco.lerDemanda("d1");
  assert.equal(d.asanaTaskId, "T1");
  assert.deepEqual(d.asanaTaskIds, ["T1"]);
  assert.match(d.comentarios[0].texto, /enviada à Operação/);
  const hook = r.asana.chamadas.find((c) => c.metodo === "POST" && c.caminho === "/webhooks");
  assert.equal(hook.corpo.target, `https://x.supabase.co/functions/v1/asana-webhook?projeto=${PROJ}`);
});

test("comentário e anexo: o autor é sempre quem está logado, nunca o que o navegador manda", async () => {
  await banco.db.query(`update public.demandas set dados = dados || '{"asanaTaskId": "T1"}' where id = 'd1'`);
  const c = await chamar("bia@x.com", "asanaComentario", { demandaId: "d1", comentarioId: "c1", acao: "criar", texto: "Oi", autor: "Forjado" });
  assert.equal(c.status, 200);
  const story = c.asana.chamadas.find((x) => /\/stories$/.test(x.caminho));
  assert.equal(story.corpo.text, "Bia Projetos (pelo sistema):\nOi");
  assert.match((await chamar("bia@x.com", "asanaComentario", { demandaId: "d1", comentarioId: "c2", acao: "criar", texto: "  " })).corpo.erro.mensagem, /vazio/);
  assert.match((await chamar("bia@x.com", "asanaComentario", { demandaId: "d1", comentarioId: "c2", acao: "voar", texto: "x" })).corpo.erro.mensagem, /Ação inválida/);

  const a = await chamar("bia@x.com", "asanaAnexar", { demandaId: "d1", nome: "a.pdf", tipo: "application/pdf", base64: Buffer.from("%PDF").toString("base64"), autor: "Forjado" });
  assert.equal(a.status, 200);
  assert.equal(a.corpo.comentario.autor, "Bia Projetos");
});

test("sem token do Asana: erro claro, não um 500 genérico", async () => {
  const r = await chamar("bia@x.com", "asanaProjetos", {}, { env: { ...ENV, ASANA_TOKEN: "" } });
  assert.deepEqual([r.status, r.corpo.erro.codigo], [412, "failed-precondition"]);
  assert.match(r.corpo.erro.mensagem, /ASANA_TOKEN/);
});

test("erro inesperado não vaza detalhe interno para o navegador", async () => {
  const quebrado = { ...asanaFalso(), fetchImpl: async () => { throw new Error("segredo interno: postgres://senha@host"); } };
  const r = await semLog(() => chamar("bia@x.com", "createAsanaOperacao", { demandaId: "d1", instrucoes: "x", projetoGid: PROJ }, { asana: quebrado }));
  assert.equal(r.status, 503);
  assert.equal(r.corpo.erro.mensagem, "Não foi possível criar a tarefa no Asana.");
});

test("contas: admin cria login e lista só quem está na lista de papéis; erro de validação volta como 400", async () => {
  const criados = [];
  const authAdmin = {
    async createUser(a) {
      criados.push(a);
      return { data: { user: { id: "u" } }, error: null };
    },
    async listUsers() {
      return { data: { users: [{ email: "bia@x.com", created_at: "2026-10-01T00:00:00Z" }, { email: "de-fora@x.com" }], nextPage: null }, error: null };
    },
  };
  const r = await chamar("ana@x.com", "criarContaLogin", { email: " Nova@X.com ", nome: "Nova" }, { authAdmin });
  assert.deepEqual(r.corpo, { criada: true, existia: false, convite: true });
  assert.equal(criados[0].email, "nova@x.com");
  const invalido = await chamar("ana@x.com", "criarContaLogin", { email: "sem-arroba" }, { authAdmin });
  assert.deepEqual([invalido.status, invalido.corpo.erro.mensagem], [400, "E-mail inválido."]);

  const l = await chamar("ana@x.com", "listarContasLogin", {}, { authAdmin });
  assert.equal(l.corpo.contas["bia@x.com"].existe, true);
  assert.equal(l.corpo.contas["caio@x.com"].existe, false);
  assert.equal(l.corpo.contas["de-fora@x.com"], undefined);
});

// --- Webhook do Asana ---

const pedidoWebhook = (corpo, cabecalhos = {}, projeto = PROJ) =>
  new Request(`https://x.supabase.co/functions/v1/asana-webhook?projeto=${projeto}`, { method: "POST", headers: cabecalhos, body: corpo });

test("webhook: só POST, só projeto conhecido, e o aperto de mão só vale logo depois de o sistema pedir", async () => {
  const admin = banco.clienteServidor();
  assert.equal((await responderWebhookAsana(new Request("https://x/w?projeto=1"), { admin, token: "t" })).status, 405);
  assert.equal((await responderWebhookAsana(pedidoWebhook("{}", {}, "999"), { admin, token: "t" })).status, 400);
  assert.equal((await responderWebhookAsana(pedidoWebhook("", { "X-Hook-Secret": "intruso" }), { admin, token: "t" })).status, 403);

  await banco.db.query(`insert into public.asana_webhooks (projeto_gid, handshake_ate) values ($1, $2)`, [PROJ, Date.now() + 60000]);
  const ok = await responderWebhookAsana(pedidoWebhook("", { "X-Hook-Secret": "do-asana" }), { admin, token: "t" });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("X-Hook-Secret"), "do-asana");
  assert.equal((await responderWebhookAsana(pedidoWebhook("", { "X-Hook-Secret": "outro" }), { admin, token: "t" })).status, 403, "a janela fecha");
});

test("webhook: assinatura é conferida nos bytes recebidos, e evento válido chega à demanda", async () => {
  await banco.db.query(`update public.demandas set dados = dados || '{"asanaTaskId": "T1", "asanaTaskIds": ["T1"]}' where id = 'd1'`);
  await banco.db.query(`insert into public.asana_webhooks (projeto_gid, secret) values ($1, 's3gredo')`, [PROJ]);
  const admin = banco.clienteServidor();
  const asana = asanaFalso();
  // Acentos e espaços de propósito: remontar o JSON mudaria os bytes e a assinatura não bateria.
  const corpo = `{ "events":  [ {"action":"added","resource":{"gid":"S9","resource_type":"story"},"parent":{"gid":"T1","resource_type":"task"},"obs":"coração"} ] }`;
  const assinatura = crypto.createHmac("sha256", "s3gredo").update(Buffer.from(corpo)).digest("hex");

  assert.equal((await responderWebhookAsana(pedidoWebhook(corpo, { "X-Hook-Signature": "falsa" }), { admin, token: "t", fetchImpl: asana.fetchImpl })).status, 401);
  assert.equal((await responderWebhookAsana(pedidoWebhook(corpo), { admin, token: "t", fetchImpl: asana.fetchImpl })).status, 401);
  assert.equal(asana.chamadas.length, 0, "assinatura ruim não processa nada");

  const ok = await responderWebhookAsana(pedidoWebhook(corpo, { "X-Hook-Signature": assinatura }), { admin, token: "t", fetchImpl: asana.fetchImpl });
  assert.equal(ok.status, 200);
  const d = await banco.lerDemanda("d1");
  assert.equal(d.comentarios[0].texto, "Oi do Asana");
  assert.equal(d.comentarios[0].origem, "asana");
  assert.ok(d.comentariosServidorAt);

  const quebrado = await responderWebhookAsana(pedidoWebhook("não é json", { "X-Hook-Signature": crypto.createHmac("sha256", "s3gredo").update("não é json").digest("hex") }), { admin, token: "t" });
  assert.equal(quebrado.status, 400);
});

test("webhook: um evento com erro não derruba os seguintes", async () => {
  await banco.db.query(`update public.demandas set dados = dados || '{"asanaTaskId": "T1", "asanaTaskIds": ["T1"]}' where id = 'd1'`);
  await banco.db.query(`insert into public.asana_webhooks (projeto_gid, secret) values ($1, 's3gredo')`, [PROJ]);
  const asana = asanaFalso();
  const original = asana.fetchImpl;
  let primeira = true;
  const fetchImpl = async (url, opts) => {
    if (primeira) {
      primeira = false;
      throw new Error("falha de rede");
    }
    return original(url, opts);
  };
  const evento = (gid) => ({ action: "added", resource: { gid, resource_type: "story" }, parent: { gid: "T1", resource_type: "task" } });
  const corpo = JSON.stringify({ events: [evento("S8"), evento("S9")] });
  const assinatura = crypto.createHmac("sha256", "s3gredo").update(corpo).digest("hex");
  const res = await semLog(() => responderWebhookAsana(pedidoWebhook(corpo, { "X-Hook-Signature": assinatura }), { admin: banco.clienteServidor(), token: "t", fetchImpl }));
  assert.equal(res.status, 200);
  assert.equal((await banco.lerDemanda("d1")).comentarios.length, 1);
});
