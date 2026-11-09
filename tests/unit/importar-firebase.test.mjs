// Migração dos dados do Firebase: conversões, formato de senha e carga no banco real de teste.
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { paraJson, base64Padrao, montarHashFirebase, usuarioParaSupabase, montarLinhas, avisosDaImportacao } from "../../scripts/migracao-firebase/conversao.mjs";
import { criarBancoDeTeste } from "./helpers/supabase-pglite.mjs";

// Vetor publicado no repositório oficial firebase/scrypt.
const VETOR = {
  senha: "user1password",
  salt: "42xEC+ixf3L2lw==",
  passwordHash: "lSrfV15cpx95/sZS2W9c9Kp6i/LVgQNDNC/qzrCnh1SAyZvqmZqAjTdn3aoItz+VHjoZilo78198JAdRuid5lQ==",
  parametros: {
    base64_signer_key: "jxspr8Ki0RYycVU8zykbdLGjFQ3McFUH0uiiTvC8pVMXAn210wjLNmdZJzxUECKbm0QsEmYUSDzZvpjeJ9WmXA==",
    base64_salt_separator: "Bw==",
    rounds: 8,
    mem_cost: 14,
  },
};

// Expressão copiada de internal/crypto/password.go do Supabase Auth.
const FORMATO_DO_SUPABASE = /^\$fbscrypt\$v=(?<v>[0-9]+),n=(?<n>[0-9]+),r=(?<r>[0-9]+),p=(?<p>[0-9]+)(?:,ss=(?<ss>[^,]+))?(?:,sk=(?<sk>[^$]+))?\$(?<salt>[^$]+)\$(?<hash>.+)$/;

/** Mesma conferência que o Supabase faz no login (reimplementada aqui, independente do código testado). */
function senhaConfere(senha, hashCompleto) {
  const m = hashCompleto.match(FORMATO_DO_SUPABASE).groups;
  const b64 = (t) => Buffer.from(t, "base64");
  assert.equal(b64(m.salt).toString("base64"), m.salt, "base64 padrão, com preenchimento");
  assert.equal(b64(m.hash).toString("base64"), m.hash);
  const chaveDerivada = crypto.scryptSync(senha, Buffer.concat([b64(m.salt), b64(m.ss)]), 32, { N: 2 ** Number(m.n), r: Number(m.r), p: Number(m.p), maxmem: 256 * 1024 * 1024 });
  const cifra = crypto.createCipheriv("aes-256-ctr", chaveDerivada, Buffer.alloc(16, 0));
  const calculado = Buffer.concat([cifra.update(b64(m.sk)), cifra.final()]);
  return crypto.timingSafeEqual(calculado, b64(m.hash));
}

test("senha: o formato gerado passa na conferência do Supabase com o vetor oficial do Firebase", () => {
  const hash = montarHashFirebase(VETOR, VETOR.parametros);
  assert.match(hash, /^\$fbscrypt\$v=1,n=14,r=8,p=1,/, "n é o expoente (mem_cost), não 16384");
  assert.equal(senhaConfere(VETOR.senha, hash), true);
  assert.equal(senhaConfere("outra-senha", hash), false);
});

test("senha: a variante de URL do base64 (como a exportação pode vir) resulta no mesmo hash", () => {
  const urlSafe = (t) => t.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const hash = montarHashFirebase({ salt: urlSafe(VETOR.salt), passwordHash: urlSafe(VETOR.passwordHash) }, VETOR.parametros);
  assert.equal(hash, montarHashFirebase(VETOR, VETOR.parametros));
  assert.equal(senhaConfere(VETOR.senha, hash), true);
  assert.equal(base64Padrao("YQ"), "YQ==");
});

test("login: e-mail normalizado e confirmado, nome no lugar certo, desativado continua bloqueado, sem senha vira convite", () => {
  const u = usuarioParaSupabase({ email: " Bia@X.com ", displayName: " Bia ", ...VETOR, disabled: true, emailVerified: false }, VETOR.parametros);
  assert.equal(u.email, "bia@x.com");
  assert.equal(u.email_confirm, true, "a RLS exige e-mail confirmado: sem isto ninguém entraria");
  assert.deepEqual(u.user_metadata, { display_name: "Bia" });
  assert.equal(u.ban_duration, "876000h");
  assert.ok(u.password_hash);
  const semSenha = usuarioParaSupabase({ email: "a@x.com" }, VETOR.parametros);
  assert.deepEqual(semSenha, { email: "a@x.com", email_confirm: true });
});

test("datas do Firestore viram texto ISO em qualquer nível; undefined some", () => {
  const data = { toDate: () => new Date("2026-11-06T10:00:00.000Z") };
  assert.deepEqual(paraJson({ a: data, b: [data, { c: data }], d: undefined, e: null, f: 1 }), {
    a: "2026-11-06T10:00:00.000Z",
    b: ["2026-11-06T10:00:00.000Z", { c: "2026-11-06T10:00:00.000Z" }],
    e: null,
    f: 1,
  });
});

const EXPORTADO = {
  demandas: [
    { id: "d1", titulo: "Cond. Alfa", comentarios: [{ id: "c1", texto: "oi" }], asanaTaskId: "T1", asanaTaskIds: ["T1"], asana: { taskId: "T1" }, editadoEm: { toDate: () => new Date("2026-01-01T00:00:00Z") } },
    { id: "d2", titulo: "Com anexo antigo", anexos: [{ url: "https://firebasestorage.googleapis.com/x" }] },
  ],
  meta: { diarias: [], projetistas: {}, roles: { "bia@x.com": "projetista" }, updatedAt: { toDate: () => new Date() } },
  backups: { ultimo: { totalDemandas: 2 } },
  acessosHistorico: [{ id: "h1", em: "2026-01-01T00:00:00.000Z", por: "ana@x.com", alvo: "bia@x.com", acao: "papel", de: "A", para: "B" }, { id: "ruim" }],
  asanaStories: [{ id: "S1", demandaId: "d1", comentarioId: "c1", origem: "sistema" }, { id: "S2" }],
  asanaComentarios: [{ id: "d1__c1", demandaId: "d1", comentarioId: "c1", storyGid: "S1", estado: "ok", email: "bia@x.com", autor: "Bia", criadoEm: "2026-01-01T00:00:00.000Z" }],
  asanaAnexos: [{ id: "AT1", demandaId: "d1", em: "2026-01-01T00:00:00.000Z" }],
};

test("o que foi exportado cabe no banco real e o servidor enxerga como antes", async () => {
  const linhas = montarLinhas(EXPORTADO);
  assert.equal(linhas.demandas[0].dados.id, undefined, "o id fica na coluna");
  assert.equal(linhas.sistema_meta[0].dados.updatedAt, undefined);
  assert.equal(linhas.acessos_historico.length, 1, "registro incompleto não entra");
  assert.equal(linhas.asana_story_vinculos.length, 1);
  assert.match(avisosDaImportacao(linhas).join(), /1 demanda\(s\) têm anexos/);

  const banco = await criarBancoDeTeste();
  try {
    await banco.limpar();
    const colunas = { demandas: ["id", "dados"], sistema_backups: ["id", "info"], acessos_historico: ["em", "por", "alvo", "acao", "de", "para"], asana_story_vinculos: ["story_gid", "demanda_id", "comentario_id", "origem"], asana_envios: ["demanda_id", "comentario_id", "estado", "story_gid", "email", "autor", "criado_em"], asana_anexos: ["attachment_gid", "demanda_id", "registrado_em"] };
    for (const [tabela, nomes] of Object.entries(colunas)) {
      for (const linha of linhas[tabela]) {
        const valores = nomes.map((n) => (typeof linha[n] === "object" && linha[n] !== null ? JSON.stringify(linha[n]) : linha[n]));
        await banco.db.query(`insert into public.${tabela} (${nomes.join(",")}) values (${nomes.map((_, i) => `$${i + 1}`).join(",")})`, valores);
      }
    }
    await banco.definirMeta(linhas.sistema_meta[0].dados);

    const { criarRepositorioSupabase } = await import("../../supabase/functions/_shared/asana/repositorio-supabase.mjs");
    const repo = criarRepositorioSupabase(banco.clienteServidor());
    assert.equal((await repo.buscarDemandaPorTarefa("T1")).id, "d1");
    assert.deepEqual((await repo.listarComentarios("d1")).map((c) => c.id), ["c1"]);
    assert.equal((await repo.buscarVinculoStory("S1")).comentarioId, "c1", "comentário antigo continua ligado ao do Asana");
    assert.equal((await repo.buscarEnvio("d1", "c1")).storyGid, "S1");
    assert.equal(await repo.anexoRegistrado("AT1"), true);
    const bia = await banco.clienteUsuario("bia@x.com");
    assert.equal((await bia.from("demandas").select("id")).data.length, 2, "quem está nos papéis lê");
    const dados = (await bia.from("demandas").select("dados").eq("id", "d1").maybeSingle()).data.dados;
    assert.equal(dados.editadoEm, "2026-01-01T00:00:00.000Z");
  } finally {
    await banco.db.close();
  }
});

test("o ensaio da importação lista quem tem papel fora da lista, porque essa pessoa passa a só ler", () => {
  const linhas = (roles) => ({ demandas: [], sistema_meta: [{ dados: { roles } }] });
  const avisos = avisosDaImportacao(linhas({ "a@x.com": "admin", "b@x.com": "Projetista", "c@x.com": "visibilidade", "d@x.com": "gerente", "e@x.com": " admin" }));
  const aviso = avisos.find((a) => a.includes("papel fora da lista"));
  assert.ok(aviso, JSON.stringify(avisos));
  assert.match(aviso, /2 login\(s\)/);
  assert.match(aviso, /d@x\.com \(gerente\)/);
  assert.match(aviso, /e@x\.com \( admin\)/);
  assert.equal(avisosDaImportacao(linhas({ "a@x.com": "admin" })).some((a) => a.includes("papel fora da lista")), false);
});

test("o ensaio da importação avisa de PDF em formato que o app descartaria", () => {
  const linhas = (dataUrl) => ({ demandas: [{ dados: { pdfLevantamento: { name: "a.pdf", dataUrl } } }], sistema_meta: [{ dados: { roles: { "a@x.com": "admin" } } }] });
  const avisa = (dataUrl) => avisosDaImportacao(linhas(dataUrl)).some((a) => a.includes("PDF de levantamento"));
  for (const url of ["data:application/pdf;base64,AAAA", "data:application/x-pdf;base64,AAAA", "data:application/octet-stream;base64,AAAA", "data:;base64,AAAA", ""]) assert.equal(avisa(url), false, url);
  for (const url of ["data:text/html;base64,AAAA", "javascript:alert(1)", "https://x.com/a.pdf"]) assert.equal(avisa(url), true, url);
});
