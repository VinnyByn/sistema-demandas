// Regras do Firestore e do Storage no emulador (projeto demo-*, nunca toca a produção).
// Rodar: npm run test:regras (sobe os emuladores e roda este arquivo).
const { test, before, after, beforeEach } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { initializeTestEnvironment, assertSucceeds, assertFails } = require("@firebase/rules-unit-testing");
const firebase = require("firebase/compat/app");
require("firebase/compat/firestore");

const RAIZ = path.join(__dirname, "../..");
const SEED = "vinicius.morais@soumaster.com.br";
const FV = firebase.firestore.FieldValue;

/** Quem é quem no doc meta usado nos testes. */
const META = {
  roles: {
    [SEED]: "admin",
    "ana@x.com": "admin",
    "adm.off@x.com": "admin",
    "bia@x.com": "projetista",
    "caio@x.com": "visibilidade",
    "duda@x.com": "projetista",
    "removido@x.com": "admin", // papel antigo esquecido no mapa: removido vale mais
  },
  disabledUsers: { "adm.off@x.com": true, "duda@x.com": true },
  purgedUsers: { "removido@x.com": true },
  userRegionals: {},
  userDisplayNames: { "bia@x.com": "Bia" },
  diarias: [],
  projetistas: {},
  deletedDiariaIds: [],
};

const PERFIS = {
  seed: SEED,
  admin: "ana@x.com",
  adminDesabilitado: "adm.off@x.com",
  projetista: "bia@x.com",
  visibilidade: "caio@x.com",
  desabilitado: "duda@x.com",
  removido: "removido@x.com",
  foraDoMapa: "estranho@x.com",
};
const LEEM = ["seed", "admin", "adminDesabilitado", "projetista", "visibilidade", "desabilitado"];
const ESCREVEM = ["seed", "admin", "projetista"];
const ADMINS = ["seed", "admin"];

let env;

function quem(perfil) {
  if (perfil === "anonimo") return env.unauthenticatedContext();
  if (perfil === "semEmail") return env.authenticatedContext("sem-email", {});
  return env.authenticatedContext(`uid-${perfil}`, { email: PERFIS[perfil], email_verified: true });
}
const TODOS = [...Object.keys(PERFIS), "semEmail", "anonimo"];

/** Dados iniciais de cada teste (cada perfil começa do zero, sem herdar o que o anterior gravou). */
async function semear({ comMeta = true } = {}) {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    if (comMeta) await db.doc("demandasSistema/meta").set(META);
    await db.doc("demandas/d1").set({ titulo: "Cond. Alfa", status: "novo" });
    await db.doc("demandasSistema/state").set({ payload: "{}" });
    await db.doc("demandasSistema/backups").set({ ultimo: { path: "backups/a.json" } });
    await db.doc("demandasSistema/roles").set({ roles: META.roles });
  });
}

/** Roda `op` para cada perfil: espera sucesso para quem está em `permitidos`, recusa para os outros. */
async function matriz(permitidos, op, preparo = {}) {
  for (const perfil of TODOS) {
    await semear(preparo);
    const ctx = quem(perfil);
    const p = op(ctx.firestore(), ctx, perfil);
    try {
      await (permitidos.includes(perfil) ? assertSucceeds(p) : assertFails(p));
    } catch (e) {
      e.message = `[${perfil}] ${e.message}`;
      throw e;
    }
  }
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-demandas",
    firestore: { rules: fs.readFileSync(path.join(RAIZ, "firestore.rules"), "utf8") },
    storage: { rules: fs.readFileSync(path.join(RAIZ, "storage.rules"), "utf8") },
  });
});

after(async () => {
  await env?.cleanup();
});

beforeEach(() => semear());

test("demandas: só quem está no mapa lê; só quem não é somente leitura grava", async () => {
  await matriz(LEEM, (db) => db.doc("demandas/d1").get());
  await matriz(LEEM, (db) => db.collection("demandas").get());
  await matriz(ESCREVEM, (db, _c, p) => db.doc("demandas/d1").set({ titulo: `por ${p}`, updatedAt: new Date().toISOString() }, { merge: true }));
  await matriz(ESCREVEM, (db, _c, p) => db.doc(`demandas/nova-${p}`).set({ titulo: "Nova" }));
  await matriz(ESCREVEM, (db, _c, p) => db.doc(`demandas/apagar-${p}`).delete());
});

test("app em produção hoje continua funcionando para quem escreve (presença, tombstone, diárias)", async () => {
  // patchDemandaPresence / upsertDemanda / deleteDemanda / persistMeta, como o app grava.
  await matriz(ESCREVEM, (db) =>
    db.doc("demandas/d1").set({ editingBy: { email: "x", autor: "X" }, editingAt: new Date().toISOString() }, { merge: true }),
  );
  await matriz(ESCREVEM, (db) => db.doc("demandas/d1").set({ editingBy: FV.delete(), editingAt: FV.delete() }, { merge: true }));
  await matriz(ESCREVEM, (db) =>
    db.doc("demandasSistema/meta").set({ deletedDemandaIds: FV.arrayUnion("d9"), updatedAt: FV.serverTimestamp() }, { merge: true }),
  );
  await matriz(ESCREVEM, (db) =>
    db
      .doc("demandasSistema/meta")
      .set({ diarias: [{ id: "x" }], projetistas: {}, deletedDiariaIds: [], updatedAt: FV.serverTimestamp() }, { merge: true }),
  );
  await matriz(ESCREVEM, (db) => db.doc("demandasSistema/meta").set({ metasEtapa: { novo: 3 } }, { merge: true }));
});

test("meta: leitura só para quem está no mapa", async () => {
  await matriz(LEEM, (db) => db.doc("demandasSistema/meta").get());
});

test("meta: só administrador ativo mexe nos acessos (o item 1 da revisão)", async () => {
  // O ataque da revisão: promover a si mesmo.
  await matriz(ADMINS, (db, _c, p) => db.doc("demandasSistema/meta").set({ roles: { ...META.roles, [`novo-${p}@x.com`]: "admin" } }, { merge: true }));
  await matriz(ADMINS, (db) => db.doc("demandasSistema/meta").update({ disabledUsers: {} }));
  await matriz(ADMINS, (db) => db.doc("demandasSistema/meta").update({ purgedUsers: {} }));
  await matriz(ADMINS, (db) => db.doc("demandasSistema/meta").update({ userDisplayNames: { "bia@x.com": "Outro nome" } }));
  await matriz(ADMINS, (db) => db.doc("demandasSistema/meta").update({ userRegionals: { "bia@x.com": "Norte" } }));
  // set sem merge apaga os campos de acesso: também conta como mexer neles.
  await matriz(ADMINS, (db) => db.doc("demandasSistema/meta").set({ diarias: [] }));
});

test("meta: gravação de acessos do app atual (update do mapa inteiro + chaves apagadas) passa para admin", async () => {
  const db = quem("admin").firestore();
  const roles = { ...META.roles };
  delete roles["duda@x.com"];
  await assertSucceeds(
    db.doc("demandasSistema/meta").update({
      roles,
      disabledUsers: { "adm.off@x.com": true },
      purgedUsers: { "removido@x.com": true, "duda@x.com": true },
      userRegionals: {},
      userDisplayNames: {},
      updatedAt: FV.serverTimestamp(),
    }),
  );
  // O espelho antigo (demandasSistema/roles) agora é recusado; o app atual só registra um aviso.
  await assertFails(db.doc("demandasSistema/roles").update({ roles }));
});

test("meta: ninguém apaga; só o administrador principal cria quando não existe", async () => {
  await matriz([], (db) => db.doc("demandasSistema/meta").delete());
  await matriz(["seed"], (db, _c, p) => db.doc("demandasSistema/meta").set({ diarias: [], criadoPor: p }), { comMeta: false });
});

test("sem doc meta, só o administrador principal entra", async () => {
  await matriz(["seed"], (db) => db.doc("demandas/d1").get(), { comMeta: false });
  await matriz(["seed"], (db) => db.doc("demandas/d1").set({ titulo: "x" }, { merge: true }), { comMeta: false });
});

test("e-mail com maiúsculas no token conta como o mesmo usuário", async () => {
  const db = env.authenticatedContext("uid-maiusc", { email: "BIA@X.COM" }).firestore();
  await assertSucceeds(db.doc("demandas/d1").set({ titulo: "ok" }, { merge: true }));
});

test("docs de sistema: backups e state leem quem está no mapa; roles (espelho antigo) fechado", async () => {
  await matriz(LEEM, (db) => db.doc("demandasSistema/backups").get());
  await matriz([], (db) => db.doc("demandasSistema/backups").set({ ultimo: {} }));
  await matriz(LEEM, (db) => db.doc("demandasSistema/state").get());
  await matriz(ESCREVEM, (db) => db.doc("demandasSistema/state").set({ migratedAt: "agora" }, { merge: true }));
  await matriz([], (db) => db.doc("demandasSistema/roles").get());
  await matriz([], (db) => db.doc("demandasSistema/roles").set({ roles: { "x@x.com": "admin" } }));
  await matriz([], (db) => db.doc("asanaIntegracao/webhooks").get());
  await matriz([], (db) => db.doc("demandasSistema/viabilidadePortas").get());
});

test("meta: só admin muda a tela inicial (userHomes) e mudar papel não apaga as telas", async () => {
  await matriz(ADMINS, (db) => db.doc("demandasSistema/meta").update({ userHomes: { "bia@x.com": { esteira: "b2b" } } }));
});

test("histórico de acessos: só admin grava, em nome próprio, com a hora do servidor; ninguém edita nem apaga", async () => {
  const registro = (p, extra = {}) => ({ em: FV.serverTimestamp(), por: PERFIS[p] || "", alvo: "bia@x.com", acao: "papel", de: "projetista", para: "admin", ...extra });
  await matriz(ADMINS, (db, _c, p) => db.collection("acessosHistorico").add(registro(p)));
  await matriz(ADMINS, (db) => db.collection("acessosHistorico").limit(5).get());
  // Assinando por outra pessoa, com data inventada ou com campo a mais: recusado até para admin.
  const admin = quem("admin").firestore();
  await assertFails(admin.collection("acessosHistorico").add(registro("seed")));
  await assertFails(admin.collection("acessosHistorico").add(registro("admin", { em: new Date("2020-01-01") })));
  await assertFails(admin.collection("acessosHistorico").add(registro("admin", { extra: "x" })));
  await assertFails(admin.collection("acessosHistorico").add({ em: FV.serverTimestamp(), por: PERFIS.admin }));
  await env.withSecurityRulesDisabled((ctx) => ctx.firestore().doc("acessosHistorico/r1").set({ por: SEED, alvo: "x", acao: "papel" }));
  await matriz([], (db) => db.doc("acessosHistorico/r1").update({ acao: "outra" }));
  await matriz([], (db) => db.doc("acessosHistorico/r1").delete());
});

test("ataque do console: conta recém-cadastrada não se promove a admin nem lê ou grava nada", async () => {
  const EMAIL = "invasor_demo_1@exemplo-invasao.com";
  const db = env.authenticatedContext("invasor", { email: EMAIL }).firestore();
  // Passo 3 do script de invasão, exatamente como ele faz, e variações.
  await assertFails(db.doc("demandasSistema/meta").update(new firebase.firestore.FieldPath("roles", EMAIL), "admin"));
  await assertFails(db.doc("demandasSistema/meta").set({ roles: { [EMAIL]: "admin" } }, { merge: true }));
  await assertFails(db.doc("demandasSistema/roles").set({ roles: { [EMAIL]: "admin" } }));
  // Sem papel no mapa: não lê nem grava nada (nem pelo console).
  await assertFails(db.collection("demandas").get());
  await assertFails(db.doc("demandas/d1").get());
  await assertFails(db.doc("demandasSistema/meta").get());
  await assertFails(db.doc("demandas/d1").set({ titulo: "x" }, { merge: true }));
  // Quem já está na equipe também não se promove pelo console.
  const proj = quem("projetista").firestore();
  await assertFails(proj.doc("demandasSistema/meta").update(new firebase.firestore.FieldPath("roles", PERFIS.projetista), "admin"));
  const vis = quem("visibilidade").firestore();
  await assertFails(vis.doc("demandas/d1").set({ valorProjetoRealizado: 1 }, { merge: true }));
});

test("storage: só administrador ativo baixa backups; ninguém grava pelo app", async () => {
  await env.withSecurityRulesDisabled((ctx) => ctx.storage().ref("backups/a.json").putString("{}"));
  await matriz(ADMINS, (_db, ctx) => ctx.storage().ref("backups/a.json").getMetadata());
  await matriz(ADMINS, (_db, ctx) => ctx.storage().ref("backups").listAll());
  await matriz([], (_db, ctx) => ctx.storage().ref("backups/b.json").putString("{}"));
});
