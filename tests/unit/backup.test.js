// Backup na nuvem: formato do JSON, caminho no Storage e rotação dos 30 mais recentes (Firebase simulado).
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const fnDir = path.join(__dirname, "../../functions");
const firestore = require(require.resolve("firebase-admin/firestore", { paths: [fnDir] }));
const storage = require(require.resolve("firebase-admin/storage", { paths: [fnDir] }));

function montarFirebaseFalso({ existentes = [], roles = {} } = {}) {
  const salvos = {};
  const apagados = [];
  const docs = [];
  const arquivos = [...existentes];
  firestore.getFirestore = () => ({
    collection: () => ({
      get: async () => ({
        docs: [
          { id: "d1", data: () => ({ titulo: "Projeto A", updatedAt: firestore.Timestamp.fromDate(new Date("2026-10-01T10:00:00Z")) }) },
          { id: "d2", data: () => ({ titulo: "Projeto B", excluidoEm: "2026-10-02T09:00:00Z" }) },
        ],
      }),
    }),
    doc: (p) => ({
      get: async () => ({ data: () => ({ diarias: [{ id: "x" }], projetistas: {}, roles, metasEtapa: { operacional: { novo: 3 } } }) }),
      set: async (v) => docs.push([p, v]),
    }),
  });
  storage.getStorage = () => ({
    bucket: () => ({
      file: (name) => ({
        save: async (buf) => {
          salvos[name] = JSON.parse(buf.toString());
          arquivos.push(name);
        },
      }),
      getFiles: async () => [arquivos.map((name) => ({ name, delete: async () => apagados.push(name) }))],
    }),
  });
  delete require.cache[path.join(fnDir, "backup.js")];
  return { backup: require(path.join(fnDir, "backup.js")), salvos, apagados, docs };
}

test("backup grava todos os projetos (inclusive lixeira) e o meta, com datas em ISO", async () => {
  const { backup, salvos, docs } = montarFirebaseFalso();
  const info = await backup.gerarBackup({ motivo: "manual", autor: "admin@x.com" });
  assert.match(info.path, /^backups\/demandas-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-manual\.json$/);
  const json = salvos[info.path];
  assert.equal(json.demandas.length, 2);
  assert.equal(json.demandas[0].updatedAt, "2026-10-01T10:00:00.000Z");
  assert.deepEqual(json.metasEtapa, { operacional: { novo: 3 } });
  assert.equal(json.diarias.length, 1);
  assert.equal(json.backup.totalDemandas, 2);
  assert.deepEqual(docs[0][0], "demandasSistema/backups");
});

test("backup mantém só os 30 mais recentes", async () => {
  const existentes = Array.from({ length: 32 }, (_, i) => `backups/demandas-2026-09-${String(i + 1).padStart(2, "0")}T06-10-00-auto.json`);
  const { backup, apagados } = montarFirebaseFalso({ existentes });
  await backup.gerarBackup();
  assert.equal(apagados.length, 3);
  assert.ok(apagados.every((n) => /2026-09-0[123]T/.test(n)), apagados.join(", "));
});

test("só administradores podem pedir backup manual", async () => {
  const { backup } = montarFirebaseFalso({ roles: { "ana@x.com": "admin", "bia@x.com": "projetista" } });
  assert.equal(await backup.isAdminEmail("vinicius.morais@soumaster.com.br"), true);
  assert.equal(await backup.isAdminEmail("ANA@x.com"), true);
  assert.equal(await backup.isAdminEmail("bia@x.com"), false);
  assert.equal(await backup.isAdminEmail(""), false);
});
