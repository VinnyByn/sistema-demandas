// Conversões Firestore → Supabase usadas pelo script de migração.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mapasParaPerfis, metaParaLinha, nomeSeguro, paraJson, prepararDemanda } from "../../supabase/migracao/transformar.mjs";

const timestamp = (iso) => ({ toDate: () => new Date(iso) });

test("paraJson converte Timestamp do Firestore em ISO, inclusive aninhado", () => {
  const r = paraJson({ a: timestamp("2026-01-02T03:04:05.000Z"), lista: [{ b: timestamp("2026-02-01T00:00:00.000Z") }], c: undefined });
  assert.deepEqual(r, { a: "2026-01-02T03:04:05.000Z", lista: [{ b: "2026-02-01T00:00:00.000Z" }] });
});

test("prepararDemanda tira presença e manda PDF/fotos em base64 para o Storage", () => {
  const pdf = Buffer.from("%PDF-1.4 conteúdo").toString("base64");
  const png = Buffer.from([137, 80, 78, 71]).toString("base64");
  const r = prepararDemanda("p1", {
    id: "p1",
    titulo: "Rota",
    editingBy: { email: "x" },
    editingAt: "2026-01-01",
    updatedAt: timestamp("2026-03-01T00:00:00.000Z"),
    pdfLevantamento: { id: "a", name: "Levantamento.pdf", dataUrl: `data:application/pdf;base64,${pdf}` },
    imagens: [`data:image/png;base64,${png}`, { url: "https://exemplo/foto.jpg" }],
  });
  assert.equal(r.id, "p1");
  assert.equal(r.dados.titulo, "Rota");
  assert.equal(r.dados.updatedAt, "2026-03-01T00:00:00.000Z");
  assert.equal("editingBy" in r.dados, false);
  assert.equal("id" in r.dados, false);
  assert.deepEqual(r.dados.imagens, [{ url: "https://exemplo/foto.jpg" }]);
  assert.deepEqual(
    r.arquivos.map((a) => [a.tipo, a.nome, a.mime, a.levantamento, a.bytes.toString("base64")]),
    [
      ["pdf", "Levantamento.pdf", "application/pdf", true, pdf],
      ["foto", "imagem-1.png", "image/png", false, png],
    ],
  );
});

test("mapasParaPerfis respeita papéis, bloqueios, removidos e a lista semente", () => {
  const perfis = mapasParaPerfis({
    roles: { "Ana@X.com": "visibilidade", "vinicius.morais@soumaster.com.br": "projetista" },
    disabledUsers: { "ana@x.com": true, "vinicius.morais@soumaster.com.br": true },
    purgedUsers: { "joao.bosco@soumaster.com.br": true },
    userRegionals: { "ana@x.com": "Centro", "matheus.costa@soumaster.com.br": "__all__" },
    userDisplayNames: { "ana@x.com": "  Ana   Lima " },
  });
  const por = Object.fromEntries(perfis.map((p) => [p.email, p]));
  assert.deepEqual(por["ana@x.com"], { email: "ana@x.com", papel: "visibilidade", desabilitado: true, removido: false, regional: "Centro", nome: "Ana Lima" });
  // Admin principal nunca perde o papel nem é bloqueado.
  assert.equal(por["vinicius.morais@soumaster.com.br"].papel, "admin");
  assert.equal(por["vinicius.morais@soumaster.com.br"].desabilitado, false);
  // Semente entra como projetista; removido continua removido.
  assert.equal(por["matheus.costa@soumaster.com.br"].papel, "projetista");
  assert.equal(por["matheus.costa@soumaster.com.br"].removido, false);
  assert.equal(por["matheus.costa@soumaster.com.br"].regional, "");
  assert.equal(por["joao.bosco@soumaster.com.br"].removido, true);
});

test("metaParaLinha e nomeSeguro", () => {
  const l = metaParaLinha({ diarias: [{ id: "d1" }], deletedDemandaIds: ["a", "", 3], metasEtapa: { B2C: { novo: 2 } } });
  assert.deepEqual(l.deleted_demanda_ids, ["a"]);
  assert.deepEqual(l.metas_etapa, { B2C: { novo: 2 } });
  assert.deepEqual(l.filtros_salvos, {});
  assert.equal(nomeSeguro("Relatório final (v2).pdf"), "Relatorio_final_v2_.pdf");
});
