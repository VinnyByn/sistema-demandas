// Passo 2: grava no Supabase os dados e os logins exportados. Sem --aplicar só mostra o que faria.
// Pode rodar de novo: dados são sobrescritos pela chave e login que já existe é mantido.
// Uso: node --env-file=../../.env importar.mjs [--aplicar] [--usuarios users.json --hash hash.json]
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { montarLinhas, usuarioParaSupabase, avisosDaImportacao, CHAVE_POR_TABELA } from "./conversao.mjs";

const args = process.argv.slice(2);
const opcao = (nome) => (args.includes(nome) ? args[args.indexOf(nome) + 1] : null);
const aplicar = args.includes("--aplicar");
const LOTE = 200;

const linhas = montarLinhas(JSON.parse(fs.readFileSync("saida/firestore.json", "utf8")));
for (const [tabela, itens] of Object.entries(linhas)) console.log(`${tabela}: ${itens.length}`);
for (const aviso of avisosDaImportacao(linhas)) console.warn(`AVISO: ${aviso}`);

const arquivoUsuarios = opcao("--usuarios");
const parametros = opcao("--hash") ? JSON.parse(fs.readFileSync(opcao("--hash"), "utf8")) : null;
const usuarios = arquivoUsuarios ? JSON.parse(fs.readFileSync(arquivoUsuarios, "utf8")).users.filter((u) => u.email).map((u) => usuarioParaSupabase(u, parametros)) : [];
console.log(`logins: ${usuarios.length} (${usuarios.filter((u) => u.password_hash).length} mantêm a senha)`);

if (!aplicar) {
  console.log("Nada foi gravado. Rode com --aplicar para gravar.");
  process.exit(0);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

for (const [tabela, itens] of Object.entries(linhas)) {
  // O histórico não tem chave natural: reimportar duplicaria, então só entra com a tabela vazia.
  if (tabela === "acessos_historico") {
    const { count, error } = await supabase.from(tabela).select("id", { count: "exact", head: true });
    if (error) throw new Error(`${tabela}: ${error.message}`);
    if (count) {
      console.log(`${tabela}: já tem ${count} linhas, mantido`);
      continue;
    }
  }
  for (let i = 0; i < itens.length; i += LOTE) {
    const lote = itens.slice(i, i + LOTE);
    const consulta = CHAVE_POR_TABELA[tabela] ? supabase.from(tabela).upsert(lote, { onConflict: CHAVE_POR_TABELA[tabela] }) : supabase.from(tabela).insert(lote);
    const { error } = await consulta;
    if (error) throw new Error(`${tabela}: ${error.message}`);
  }
  console.log(`${tabela}: gravado`);
}

const resultado = { criados: 0, jaExistiam: 0, falhas: [] };
for (const usuario of usuarios) {
  const { error } = await supabase.auth.admin.createUser(usuario);
  if (!error) resultado.criados += 1;
  else if (error.code === "email_exists" || error.code === "user_already_exists") resultado.jaExistiam += 1;
  else resultado.falhas.push(`${usuario.email}: ${error.message}`);
}
console.log(`logins: ${resultado.criados} criados, ${resultado.jaExistiam} já existiam, ${resultado.falhas.length} falharam`);
for (const falha of resultado.falhas) console.warn(`FALHA: ${falha}`);
process.exit(resultado.falhas.length ? 1 : 0);
