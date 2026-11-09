// Passo 1: lê o Firestore e grava saida/firestore.json. Só leitura: não altera nada no Firebase.
// Uso: node --env-file=../../.env exportar-firestore.mjs
import fs from "node:fs";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

const colecao = async (nome) => (await db.collection(nome).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
const documento = async (caminho) => (await db.doc(caminho).get()).data() || null;

const exportado = {
  demandas: await colecao("demandas"),
  meta: await documento("demandasSistema/meta"),
  backups: await documento("demandasSistema/backups"),
  acessosHistorico: await colecao("acessosHistorico"),
  asanaStories: await colecao("asanaStories"),
  asanaComentarios: await colecao("asanaComentarios"),
  asanaAnexos: await colecao("asanaAnexos"),
};

fs.mkdirSync("saida", { recursive: true });
fs.writeFileSync("saida/firestore.json", JSON.stringify(exportado, (_, v) => (typeof v?.toDate === "function" ? v.toDate().toISOString() : v)));
for (const [nome, valor] of Object.entries(exportado)) console.log(`${nome}: ${Array.isArray(valor) ? valor.length : valor ? "ok" : "vazio"}`);
console.log("Gravado em saida/firestore.json (tem dados da empresa: não envie nem versione).");
