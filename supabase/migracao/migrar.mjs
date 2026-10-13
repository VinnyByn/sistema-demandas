#!/usr/bin/env node
// Copia o sistema do Firebase para o Supabase. Pode rodar mais de uma vez (idempotente).
//
//   npm install
//   export FIREBASE_SERVICE_ACCOUNT=/caminho/chave-firebase.json   # conta de serviço do projeto demproj-fdeac
//   export SUPABASE_URL=https://xxxx.supabase.co
//   export SUPABASE_SERVICE_ROLE_KEY=...                            # Settings → API → service_role (secreta!)
//   npm run simular      # só lê e mostra o que faria
//   npm run migrar       # grava no Supabase
//
// O que copia:
//   Firebase Auth            → usuários do Supabase Auth (sem senha: cada um usa «Esqueci a senha»)
//   demandasSistema/meta     → perfis (acessos) e sistema_meta (diárias, projetistas, metas, filtros)
//   demandas/{id}            → demandas (PDF do levantamento e fotos em base64 vão para o Storage)

import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import admin from "firebase-admin";
import { createClient } from "@supabase/supabase-js";
import { CRIADO_POR_MIGRACAO, mapasParaPerfis, metaParaLinha, nomeSeguro, prepararDemanda } from "./transformar.mjs";

const EXECUTAR = process.argv.includes("--executar");
const BUCKET = "projetos";
const LOTE = 100;

function exigir(nome) {
  const v = process.env[nome];
  if (!v) {
    console.error(`Falta a variável de ambiente ${nome}. Veja o cabeçalho de migrar.mjs.`);
    process.exit(1);
  }
  return v;
}

const contaServico = JSON.parse(readFileSync(exigir("FIREBASE_SERVICE_ACCOUNT"), "utf8"));
admin.initializeApp({ credential: admin.credential.cert(contaServico) });
const fs = admin.firestore();
const sb = createClient(exigir("SUPABASE_URL"), exigir("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const relatorio = { usuarios: { criados: 0, existiam: 0 }, perfis: 0, demandas: 0, arquivos: 0, avisos: [] };

function ok(res, contexto) {
  if (res.error) throw new Error(`${contexto}: ${res.error.message}`);
  return res.data;
}

async function migrarUsuarios() {
  const existentes = new Set();
  for (let pagina = 1; ; pagina += 1) {
    const { users } = ok(await sb.auth.admin.listUsers({ page: pagina, perPage: 1000 }), "listar usuários Supabase");
    users.forEach((u) => existentes.add(String(u.email || "").toLowerCase()));
    if (users.length < 1000) break;
  }
  let token;
  do {
    const lista = await admin.auth().listUsers(1000, token);
    for (const u of lista.users) {
      const email = String(u.email || "").toLowerCase();
      if (!email) continue;
      if (existentes.has(email)) {
        relatorio.usuarios.existiam += 1;
        continue;
      }
      relatorio.usuarios.criados += 1;
      if (!EXECUTAR) continue;
      ok(
        await sb.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: u.displayName ? { nome: u.displayName } : {},
        }),
        `criar usuário ${email}`,
      );
    }
    token = lista.pageToken;
  } while (token);
}

async function migrarMeta() {
  const snap = await fs.doc("demandasSistema/meta").get();
  const meta = snap.exists ? snap.data() : {};
  const perfis = mapasParaPerfis(meta);
  relatorio.perfis = perfis.length;
  if (!EXECUTAR) return meta;
  ok(await sb.from("perfis").upsert(perfis, { onConflict: "email" }), "gravar perfis");
  ok(await sb.from("sistema_meta").upsert(metaParaLinha(meta), { onConflict: "id" }), "gravar sistema_meta");
  return meta;
}

/** Sobe os arquivos embutidos de um projeto e devolve o novo pdfLevantamento (se houver). */
async function subirArquivos(prep) {
  const { data: jaTem } = await sb.from("arquivos").select("nome,tipo,caminho,id,levantamento").eq("demanda_id", prep.id);
  let pdfLevantamento = null;
  for (const a of prep.arquivos) {
    const igual = (jaTem || []).find((x) => x.nome === a.nome && x.tipo === a.tipo && x.levantamento === a.levantamento);
    let linha = igual;
    if (!linha) {
      relatorio.arquivos += 1;
      if (!EXECUTAR) continue;
      const caminho = `${prep.id}/${a.tipo}/${randomUUID()}-${nomeSeguro(a.nome)}`;
      ok(
        await sb.storage.from(BUCKET).upload(caminho, a.bytes, { contentType: a.mime, upsert: false }),
        `enviar ${caminho}`,
      );
      linha = ok(
        await sb
          .from("arquivos")
          .insert({
            demanda_id: prep.id,
            tipo: a.tipo,
            nome: a.nome,
            caminho,
            tamanho: a.bytes.length,
            mime: a.mime,
            levantamento: a.levantamento,
            criado_por: CRIADO_POR_MIGRACAO,
          })
          .select()
          .single(),
        `registrar ${caminho}`,
      );
    }
    if (a.levantamento && linha) pdfLevantamento = linha;
  }
  return pdfLevantamento;
}

async function migrarDemandas() {
  const snap = await fs.collection("demandas").get();
  const preparadas = snap.docs.map((doc) => prepararDemanda(doc.id, doc.data()));
  relatorio.demandas = preparadas.length;

  // 1) Projetos (sem os base64) — precisam existir antes dos arquivos (chave estrangeira).
  for (let i = 0; i < preparadas.length; i += LOTE) {
    const lote = preparadas.slice(i, i + LOTE).map((p) => {
      const dados = { ...p.dados };
      if (dados.pdfLevantamento?.dataUrl) dados.pdfLevantamento = { ...dados.pdfLevantamento, dataUrl: "" };
      return { id: p.id, dados };
    });
    if (EXECUTAR) ok(await sb.from("demandas").upsert(lote, { onConflict: "id" }), `gravar demandas ${i + 1}–${i + lote.length}`);
  }

  // 2) PDFs e fotos embutidos → Storage; o projeto passa a apontar para o arquivo.
  for (const p of preparadas.filter((x) => x.arquivos.length)) {
    try {
      const pdf = await subirArquivos(p);
      if (EXECUTAR && pdf) {
        const dados = {
          ...p.dados,
          pdfLevantamento: { ...p.dados.pdfLevantamento, id: pdf.id, dataUrl: "", caminho: pdf.caminho },
        };
        ok(await sb.from("demandas").update({ dados }).eq("id", p.id), `apontar PDF de ${p.id}`);
      }
    } catch (e) {
      relatorio.avisos.push(`${p.id}: ${e.message}`);
    }
  }
  return preparadas;
}

async function conferir(preparadas) {
  const { count, error } = await sb.from("demandas").select("id", { count: "exact", head: true });
  if (error) throw error;
  const faltando = [];
  const ids = preparadas.map((p) => p.id);
  for (let i = 0; i < ids.length; i += LOTE) {
    const lote = ids.slice(i, i + LOTE);
    const { data } = await sb.from("demandas").select("id").in("id", lote);
    const achados = new Set((data || []).map((r) => r.id));
    lote.filter((id) => !achados.has(id)).forEach((id) => faltando.push(id));
  }
  return { noSupabase: count, faltando };
}

console.log(EXECUTAR ? "Migrando para o Supabase…" : "Simulação (nada é gravado). Use --executar para migrar.");
await migrarUsuarios();
await migrarMeta();
const preparadas = await migrarDemandas();
console.log(`Usuários: ${relatorio.usuarios.criados} a criar/criados, ${relatorio.usuarios.existiam} já existiam`);
console.log(`Perfis de acesso: ${relatorio.perfis}`);
console.log(`Projetos no Firestore: ${relatorio.demandas}`);
console.log(`Arquivos embutidos enviados ao Storage: ${relatorio.arquivos}`);
if (EXECUTAR) {
  const c = await conferir(preparadas);
  console.log(`Projetos no Supabase: ${c.noSupabase}`);
  if (c.faltando.length) {
    console.error(`FALTANDO no Supabase (${c.faltando.length}): ${c.faltando.join(", ")}`);
    process.exitCode = 2;
  } else {
    console.log("Conferência: todos os projetos do Firestore estão no Supabase.");
  }
}
if (relatorio.avisos.length) {
  console.warn(`Avisos (${relatorio.avisos.length}):\n  ${relatorio.avisos.join("\n  ")}`);
  process.exitCode = process.exitCode || 1;
}
process.exit();
