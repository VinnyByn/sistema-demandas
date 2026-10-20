// Integração com o Asana (Asana e Firestore simulados): envio, comentários nos dois sentidos, sem loop.
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const asana = require("../../functions/asana");

const APAGAR = Symbol("apagar");

function firestoreFalso(inicial = {}) {
  const docs = new Map(Object.entries(inicial).map(([k, v]) => [k, structuredClone(v)]));
  const aplicar = (path, data, merge) => {
    const atual = merge ? { ...(docs.get(path) || {}) } : {};
    for (const [k, v] of Object.entries(data)) {
      if (v === APAGAR) delete atual[k];
      else if (merge && v && typeof v === "object" && !Array.isArray(v) && atual[k] && typeof atual[k] === "object") {
        atual[k] = { ...atual[k], ...structuredClone(v) };
      } else atual[k] = structuredClone(v);
    }
    docs.set(path, atual);
  };
  const ref = (path) => ({
    id: path.split("/").pop(),
    path,
    async get() {
      return { exists: docs.has(path), id: path.split("/").pop(), ref: ref(path), data: () => structuredClone(docs.get(path)) };
    },
    async set(data, opts = {}) {
      aplicar(path, data, opts.merge);
    },
    async create(data) {
      if (docs.has(path)) throw new Error("ALREADY_EXISTS");
      aplicar(path, data, false);
    },
    async delete() {
      docs.delete(path);
    },
  });
  const db = {
    docs,
    doc: (p) => ref(p),
    collection: (c) => ({
      doc: (id) => ref(`${c}/${id}`),
      where: (campo, op, valor) => ({
        limit: () => ({
          async get() {
            const achados = [...docs.entries()].filter(([k, v]) => k.startsWith(`${c}/`) && k.split("/").length === 2 && (op === "array-contains" ? (v[campo] || []).includes(valor) : v[campo] === valor));
            return { empty: !achados.length, docs: await Promise.all(achados.map(([k]) => ref(k).get())) };
          },
        }),
      }),
    }),
    async runTransaction(fn) {
      return fn({ get: (r) => r.get(), set: (r, d, o) => r.set(d, o) });
    },
  };
  return db;
}

function asanaFalso() {
  const chamadas = [];
  const stories = new Map();
  let seq = 100;
  const resp = (status, data) => ({ ok: status < 400, status, text: async () => JSON.stringify(data === undefined ? {} : { data }) });
  const fetchImpl = async (url, opts) => {
    const u = new URL(url);
    const caminho = u.pathname.replace("/api/1.0", "");
    const corpo = opts.body ? JSON.parse(opts.body).data : undefined;
    chamadas.push({ method: opts.method, caminho, corpo, auth: opts.headers.Authorization });
    if (opts.method === "GET" && caminho.startsWith("/projects/")) return resp(200, { name: `Nome ${caminho.split("/")[2]}` });
    if (opts.method === "POST" && caminho === "/tasks") return resp(201, { gid: "T1", permalink_url: "https://app.asana.com/0/p/T1" });
    if (opts.method === "GET" && caminho === "/webhooks") return resp(200, []);
    if (opts.method === "POST" && caminho === "/webhooks") return resp(201, { gid: "W1" });
    if (opts.method === "POST" && /\/tasks\/\w+\/stories/.test(caminho)) {
      const gid = `S${seq++}`;
      stories.set(gid, { gid, text: corpo.text, resource_subtype: "comment_added", created_by: { name: "Integração" }, target: { gid: caminho.split("/")[2] } });
      return resp(201, { gid });
    }
    if (caminho.startsWith("/stories/")) {
      const gid = caminho.split("/")[2];
      if (opts.method === "GET") return stories.has(gid) ? resp(200, stories.get(gid)) : resp(404);
      if (opts.method === "PUT") {
        stories.get(gid).text = corpo.text;
        return resp(200, stories.get(gid));
      }
      if (opts.method === "DELETE") {
        stories.delete(gid);
        return resp(200, {});
      }
    }
    if (opts.method === "DELETE" && caminho.startsWith("/tasks/")) return resp(200, {});
    return resp(404);
  };
  return { fetchImpl, chamadas, stories };
}

const base = (db, api) => ({ db, token: "tok", fetchImpl: api.fetchImpl });
const PROJ = asana.ASANA_PROJETOS[1].gid;

test("envio cria a tarefa no projeto escolhido, guarda o vínculo e liga o webhook de comentários", async () => {
  const db = firestoreFalso({ "demandas/d1": { titulo: "Cond. Alfa", cidade: "Betim", comentarios: [] } });
  const api = asanaFalso();
  const r = await asana.criarTarefa({ ...base(db, api), demandaId: "d1", instrucoes: "Lançar cabos", projetoGid: PROJ, email: "a@b.com", endpoint: "https://x/asanaWebhook" });
  assert.equal(r.taskId, "T1");
  assert.equal(r.projetoNome, `Nome ${PROJ}`);
  const d = db.docs.get("demandas/d1");
  assert.equal(d.asanaTaskId, "T1");
  assert.equal(d.asana.projetoGid, PROJ);
  assert.equal(d.comentarios[0].origem, "integracao");
  const criar = api.chamadas.find((c) => c.method === "POST" && c.caminho === "/tasks");
  assert.deepEqual(criar.corpo.projects, [PROJ]);
  assert.equal(criar.auth, "Bearer tok");
  const hook = api.chamadas.find((c) => c.method === "POST" && c.caminho === "/webhooks");
  assert.equal(hook.corpo.target, `https://x/asanaWebhook?projeto=${PROJ}`);
  assert.ok(hook.corpo.filters.every((f) => f.resource_type === "story"));
  await assert.rejects(
    asana.criarTarefa({ ...base(db, api), demandaId: "d1", instrucoes: "x", projetoGid: "999", endpoint: "e" }),
    /Escolha em qual projeto/,
  );
});

test("comentário do sistema vai ao Asana uma vez só; editar e apagar seguem junto", async () => {
  const db = firestoreFalso({ "demandas/d1": { asanaTaskId: "T1", comentarios: [] } });
  const api = asanaFalso();
  const args = { ...base(db, api), demandaId: "d1", comentarioId: "c1", autor: "Vinícius Morais" };
  const [a, b] = await Promise.all([
    asana.sincronizarComentario({ ...args, acao: "criar", texto: "Revisar poste 12" }),
    asana.sincronizarComentario({ ...args, acao: "criar", texto: "Revisar poste 12" }),
  ]);
  assert.equal([a, b].filter((x) => x.storyGid).length, 1, "não duplica com duas chamadas ao mesmo tempo");
  const gid = (a.storyGid || b.storyGid);
  assert.equal(api.stories.get(gid).text, "Vinícius Morais (pelo sistema):\nRevisar poste 12");
  await asana.sincronizarComentario({ ...args, acao: "editar", texto: "Revisar poste 13" });
  assert.match(api.stories.get(gid).text, /poste 13$/);
  await asana.sincronizarComentario({ ...args, acao: "apagar" });
  assert.equal(api.stories.has(gid), false);
  const semTarefa = firestoreFalso({ "demandas/d2": { comentarios: [] } });
  assert.deepEqual(await asana.sincronizarComentario({ ...base(semTarefa, api), demandaId: "d2", comentarioId: "c", acao: "criar", texto: "x" }), { ignorado: "sem-tarefa" });
});

test("comentário feito no Asana aparece no sistema; edição e exclusão também; o eco do sistema é ignorado", async () => {
  const db = firestoreFalso({ "demandas/d1": { asanaTaskId: "T1", comentarios: [{ id: "c0", texto: "antigo", autor: "X" }] } });
  const api = asanaFalso();
  api.stories.set("S9", { gid: "S9", text: "Equipe chega amanhã", resource_subtype: "comment_added", created_at: "2026-10-20T12:00:00.000Z", created_by: { name: "João Operação" }, target: { gid: "T1" } });
  const ev = (action, gid = "S9") => ({ action, resource: { gid, resource_type: "story" }, parent: { gid: "T1", resource_type: "task" } });

  assert.equal(await asana.processarEvento({ ...base(db, api), evento: ev("added") }), "adicionado");
  assert.equal(await asana.processarEvento({ ...base(db, api), evento: ev("added") }), "ja-conhecido", "entrega repetida não duplica");
  let lista = db.docs.get("demandas/d1").comentarios;
  assert.equal(lista.length, 2);
  assert.deepEqual(
    { autor: lista[0].autor, texto: lista[0].texto, origem: lista[0].origem },
    { autor: "João Operação", texto: "Equipe chega amanhã", origem: "asana" },
  );

  api.stories.get("S9").text = "Equipe chega sexta";
  assert.equal(await asana.processarEvento({ ...base(db, api), evento: ev("changed") }), "editado");
  assert.equal(db.docs.get("demandas/d1").comentarios[0].texto, "Equipe chega sexta");
  assert.equal(await asana.processarEvento({ ...base(db, api), evento: ev("deleted") }), "apagado");
  lista = db.docs.get("demandas/d1").comentarios;
  assert.deepEqual(lista.map((c) => c.id), ["c0"]);

  // Eco: o comentário que o próprio sistema publicou não volta como comentário novo.
  const { storyGid } = await asana.sincronizarComentario({ ...base(db, api), demandaId: "d1", comentarioId: "c5", acao: "criar", texto: "oi", autor: "Ana" });
  assert.equal(await asana.processarEvento({ ...base(db, api), evento: ev("added", storyGid) }), "ja-conhecido");
  db.docs.delete(`asanaStories/${storyGid}`); // mesmo se o webhook chegar antes do vínculo ser gravado
  assert.equal(await asana.processarEvento({ ...base(db, api), evento: ev("added", storyGid) }), "eco");
  assert.equal(db.docs.get("demandas/d1").comentarios.length, 1);
});

test("cancelar exclui a tarefa e limpa o vínculo; assinatura do webhook é conferida", async () => {
  const db = firestoreFalso({ "demandas/d1": { asanaTaskId: "T1", asana: { taskId: "T1", url: "u" }, comentarios: [] } });
  const api = asanaFalso();
  await asana.cancelarTarefa({ ...base(db, api), demandaId: "d1", apagarCampo: () => APAGAR });
  const d = db.docs.get("demandas/d1");
  assert.equal(d.asanaTaskId, undefined);
  assert.equal(d.asana, undefined);
  assert.ok(api.chamadas.some((c) => c.method === "DELETE" && c.caminho === "/tasks/T1"));

  const corpo = Buffer.from(JSON.stringify({ events: [] }));
  const assinatura = crypto.createHmac("sha256", "segredo").update(corpo).digest("hex");
  assert.equal(asana.assinaturaValida("segredo", corpo, assinatura), true);
  assert.equal(asana.assinaturaValida("outro", corpo, assinatura), false);
  assert.equal(asana.assinaturaValida("", corpo, assinatura), false);
});

test("aperto de mão do webhook só vale logo depois que o sistema pediu o webhook", async () => {
  const db = firestoreFalso();
  const api = asanaFalso();
  assert.equal(await asana.registrarHandshake({ db, projetoGid: PROJ, segredo: "intruso" }), false);
  await asana.garantirWebhook({ ...base(db, api), projetoGid: PROJ, endpoint: "https://x/asanaWebhook" });
  assert.equal(await asana.registrarHandshake({ db, projetoGid: PROJ, segredo: "do-asana" }), true);
  assert.equal(db.docs.get(asana.DOC_WEBHOOKS)[PROJ].secret, "do-asana");
  assert.equal(await asana.registrarHandshake({ db, projetoGid: PROJ, segredo: "outro" }), false, "janela fecha após o primeiro");
});

test("nova ordem: a tarefa atual vira anterior e comentários na antiga ainda chegam", async () => {
  const db = firestoreFalso({ "demandas/d1": { titulo: "X", comentarios: [] } });
  const api = asanaFalso();
  const args = { ...base(db, api), demandaId: "d1", projetoGid: PROJ, endpoint: "https://x/asanaWebhook" };
  await asana.criarTarefa({ ...args, instrucoes: "primeira" });
  const ja = await asana.criarTarefa({ ...args, instrucoes: "de novo" });
  assert.equal(ja.already, true, "sem nova ordem não duplica");
  let gid = 1;
  const original = api.fetchImpl;
  api.fetchImpl = async (url, opts) => {
    if (opts.method === "POST" && new URL(url).pathname.endsWith("/tasks")) {
      return { ok: true, status: 201, text: async () => JSON.stringify({ data: { gid: `T${++gid}`, permalink_url: `https://app.asana.com/0/p/T${gid}` } }) };
    }
    return original(url, opts);
  };
  const r = await asana.criarTarefa({ ...base(db, api), demandaId: "d1", projetoGid: PROJ, endpoint: "e", instrucoes: "retrabalho", novaOrdem: true });
  assert.equal(r.taskId, "T2");
  const d = db.docs.get("demandas/d1");
  assert.equal(d.asanaTaskId, "T2");
  assert.deepEqual(d.asanaAnteriores.map((a) => a.taskId), ["T1"]);
  assert.deepEqual(d.asanaTaskIds, ["T1", "T2"]);
  assert.match(d.comentarios[0].texto, /^Nova ordem aberta/);
  api.stories.set("S50", { gid: "S50", text: "obs na ordem antiga", resource_subtype: "comment_added", created_by: { name: "Op" }, target: { gid: "T1" } });
  const ev = { action: "added", resource: { gid: "S50", resource_type: "story" }, parent: { gid: "T1" } };
  assert.equal(await asana.processarEvento({ ...base(db, api), evento: ev }), "adicionado");
});
