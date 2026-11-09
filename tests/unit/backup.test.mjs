// Backup na nuvem: formato do JSON, nome do arquivo e rotação dos 30 mais recentes (Storage simulado, banco real).
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { criarBancoDeTeste } from "./helpers/supabase-pglite.mjs";
import { gerarBackup, BACKUPS_MANTIDOS } from "../../supabase/functions/_shared/backup.mjs";

let banco;

function storageFalso(existentes = []) {
  const arquivos = new Map(existentes.map((nome) => [nome, null]));
  const removidos = [];
  return {
    arquivos,
    removidos,
    from: (bucket) => {
      assert.equal(bucket, "backups");
      return {
        async upload(nome, blob, opcoes) {
          assert.equal(opcoes.contentType, "application/json");
          arquivos.set(nome, JSON.parse(await blob.text()));
          return { data: { path: nome }, error: null };
        },
        async list() {
          return { data: [...arquivos.keys()].map((name) => ({ name })), error: null };
        },
        async remove(nomes) {
          for (const n of nomes) {
            arquivos.delete(n);
            removidos.push(n);
          }
          return { data: [], error: null };
        },
      };
    },
  };
}

/** Cliente do servidor: banco real de teste, com `upsert` e o Storage simulado. */
function adminDeTeste(storage) {
  const sql = banco.clienteServidor();
  return {
    ...sql,
    storage,
    from: (tabela) => ({
      ...sql.from(tabela),
      select: (...a) => sql.from(tabela).select(...a),
      upsert: async ({ id, info }) => {
        await banco.db.query(`insert into public.sistema_backups (id, info) values ($1, $2::jsonb) on conflict (id) do update set info = excluded.info`, [id, JSON.stringify(info)]);
        return { error: null };
      },
    }),
  };
}

before(async () => {
  banco = await criarBancoDeTeste();
});
after(async () => {
  await banco.db.close();
});
beforeEach(async () => {
  await banco.limpar();
  await banco.definirMeta({ diarias: [{ id: "x" }], projetistas: {}, roles: { "a@x.com": "admin" }, metasEtapa: { operacional: { novo: 3 } } });
  await banco.semear([
    { id: "d1", dados: { titulo: "Projeto A", updatedAt: "2026-10-01T10:00:00.000Z" } },
    { id: "d2", dados: { titulo: "Projeto B", excluidoEm: "2026-10-02T09:00:00Z" } },
  ]);
});

test("backup grava todos os projetos (inclusive lixeira) e o meta, no formato que o Importar JSON lê", async () => {
  const storage = storageFalso();
  const info = await gerarBackup({ admin: adminDeTeste(storage), motivo: "manual", autor: "admin@x.com" });
  assert.match(info.path, /^demandas-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-manual\.json$/);
  const json = storage.arquivos.get(info.path);
  assert.equal(json.backup.totalDemandas, 2);
  assert.equal(json.backup.autor, "admin@x.com");
  assert.deepEqual(json.demandas.map((d) => d.id).sort(), ["d1", "d2"]);
  assert.equal(json.demandas.find((d) => d.id === "d1").titulo, "Projeto A");
  assert.deepEqual(json.diarias, [{ id: "x" }]);
  assert.deepEqual(json.metasEtapa, { operacional: { novo: 3 } });
  assert.deepEqual(json.metaCompleto.roles, { "a@x.com": "admin" }, "cópia integral, inclui os acessos");
  const registro = (await banco.db.query(`select info from public.sistema_backups where id = 'ultimo'`)).rows[0].info;
  assert.equal(registro.path, info.path);
  assert.equal(registro.totalDemandas, 2);
  assert.ok(registro.bytes > 0);
});

test("backup mantém só os 30 mais recentes", async () => {
  const existentes = Array.from({ length: 32 }, (_, i) => `demandas-2026-09-${String(i + 1).padStart(2, "0")}T06-10-00-auto.json`);
  const storage = storageFalso([...existentes, "nao-e-backup.txt"]);
  await gerarBackup({ admin: adminDeTeste(storage) });
  assert.equal(storage.removidos.length, 3);
  assert.ok(storage.removidos.every((n) => /2026-09-0[123]T/.test(n)), storage.removidos.join(", "));
  assert.equal([...storage.arquivos.keys()].filter((n) => n.endsWith(".json")).length, BACKUPS_MANTIDOS);
  assert.ok(storage.arquivos.has("nao-e-backup.txt"), "arquivo que não é backup fica");
});

test("falha ao gravar o arquivo não registra um backup que não existe; falha na rotação não invalida o backup", async () => {
  const quebrado = storageFalso();
  const original = quebrado.from;
  quebrado.from = (b) => ({ ...original(b), upload: async () => ({ data: null, error: { message: "sem espaço" } }) });
  await assert.rejects(gerarBackup({ admin: adminDeTeste(quebrado) }), /Gravar backup: sem espaço/);
  assert.equal((await banco.db.query(`select 1 from public.sistema_backups`)).rows.length, 0);

  const semLista = storageFalso();
  const original2 = semLista.from;
  semLista.from = (b) => ({ ...original2(b), list: async () => ({ data: null, error: { message: "fora" } }) });
  const avisoOriginal = console.warn;
  console.warn = () => {};
  try {
    const info = await gerarBackup({ admin: adminDeTeste(semLista) });
    assert.ok(info.path);
  } finally {
    console.warn = avisoOriginal;
  }
});
