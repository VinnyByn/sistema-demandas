const { getFirestore, Timestamp } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");

const BACKUP_PREFIX = "backups/";
const BACKUPS_MANTIDOS = 30;
const ADMIN_SEED = "vinicius.morais@soumaster.com.br";

/** Converte Timestamps do Firestore em ISO para o JSON ficar legível e reimportável. */
function serializar(v) {
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (Array.isArray(v)) return v.map(serializar);
  if (v && typeof v === "object") {
    const out = {};
    for (const [k, val] of Object.entries(v)) out[k] = serializar(val);
    return out;
  }
  return v;
}

async function isAdminEmail(email) {
  const e = String(email || "").trim().toLowerCase();
  if (!e) return false;
  if (e === ADMIN_SEED) return true;
  const meta = await getFirestore().doc("demandasSistema/meta").get();
  return String(meta.data()?.roles?.[e] || "").toLowerCase() === "admin";
}

/**
 * Gera um JSON com todos os projetos e o doc meta, no mesmo formato do "Exportar JSON" do app
 * (dá para restaurar pelo "Importar JSON"), grava em backups/ no Storage e mantém os 30 mais recentes.
 */
async function gerarBackup({ motivo = "agendado", autor = "" } = {}) {
  const db = getFirestore();
  const [demandasSnap, metaSnap] = await Promise.all([
    db.collection("demandas").get(),
    db.doc("demandasSistema/meta").get(),
  ]);
  const meta = serializar(metaSnap.data() || {});
  const demandas = demandasSnap.docs.map((d) => serializar({ id: d.id, ...d.data() }));
  const agora = new Date();
  const payload = {
    backup: { geradoEm: agora.toISOString(), motivo, autor, totalDemandas: demandas.length },
    demandas,
    diarias: meta.diarias || [],
    projetistas: meta.projetistas || {},
    deletedDemandaIds: meta.deletedDemandaIds || [],
    deletedDiariaIds: meta.deletedDiariaIds || [],
    metasEtapa: meta.metasEtapa || {},
    filtrosSalvos: meta.filtrosSalvos || {},
    // Cópia integral do doc meta (inclui perfis de acesso) para recuperação manual.
    metaCompleto: meta,
  };
  const stamp = agora.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const path = `${BACKUP_PREFIX}demandas-${stamp}-${motivo === "manual" ? "manual" : "auto"}.json`;
  const bucket = getStorage().bucket();
  const conteudo = Buffer.from(JSON.stringify(payload));
  await bucket.file(path).save(conteudo, {
    contentType: "application/json",
    resumable: false,
    metadata: { metadata: { motivo, autor, totalDemandas: String(demandas.length) } },
  });

  // Rotação: mantém só os mais recentes (o nome começa pela data, então a ordem alfabética é cronológica).
  const [files] = await bucket.getFiles({ prefix: BACKUP_PREFIX });
  const antigos = files
    .filter((f) => f.name.endsWith(".json"))
    .sort((a, b) => b.name.localeCompare(a.name))
    .slice(BACKUPS_MANTIDOS);
  await Promise.all(antigos.map((f) => f.delete().catch((e) => console.warn("Rotação de backup:", f.name, e.message))));

  const info = { path, geradoEm: agora.toISOString(), motivo, autor, totalDemandas: demandas.length, bytes: conteudo.length };
  await db.doc("demandasSistema/backups").set({ ultimo: info }, { merge: true });
  return info;
}

module.exports = { gerarBackup, isAdminEmail, BACKUPS_MANTIDOS };
