/**
 * Quem pode o quê no backend — lido do doc demandasSistema/meta, a mesma fonte do app e das regras.
 *   roles          e-mail → admin | projetista | visibilidade   (fora do mapa = sem acesso)
 *   disabledUsers  e-mail → true   (desabilitado: só lê)
 *   purgedUsers    e-mail → true   (removido: sem acesso)
 * Mesma lógica de firestore.rules e demandas-projetos/user-roles.js — mudou aqui, mude lá.
 */
const { getFirestore } = require("firebase-admin/firestore");

const ADMIN_SEED = "vinicius.morais@soumaster.com.br";
const DOC_META = "demandasSistema/meta";
const PAPEIS_ADMIN = ["admin", "administrador", "administrator"];
const PAPEIS_LEITURA = ["visibilidade", "leitura", "readonly", "viewer"];

function normalizarEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function marcado(v) {
  return v === true || v === 1 || (typeof v === "string" && ["1", "true"].includes(v.toLowerCase()));
}

/** Igual ao accountNameFromEmail do app: "joao.bosco@x" → "Joao Bosco". */
function nomeDoEmail(email) {
  const e = String(email || "").trim();
  if (!e) return "";
  const label = (e.split("@")[0] || e).replace(/[._-]+/g, " ").trim();
  return label ? label.replace(/\b\w/g, (ch) => ch.toUpperCase()) : e;
}

/**
 * Acesso de um e-mail a partir dos dados do doc meta (função pura).
 * @returns {{ email, papel, desabilitado, temAcesso, podeEscrever, admin, nome }}
 */
function acessoPorMeta(meta, email) {
  const e = normalizarEmail(email);
  const m = meta && typeof meta === "object" ? meta : {};
  const nomeSalvo = String(m.userDisplayNames?.[e] || "").replace(/\s+/g, " ").trim();
  const nome = nomeSalvo || nomeDoEmail(e);
  const semAcesso = { email: e, papel: "", desabilitado: false, temAcesso: false, podeEscrever: false, admin: false, nome };
  if (!e) return semAcesso;
  if (e === ADMIN_SEED) {
    return { email: e, papel: "admin", desabilitado: false, temAcesso: true, podeEscrever: true, admin: true, nome };
  }
  const bruto = m.roles?.[e];
  const papel = typeof bruto === "string" ? bruto.toLowerCase() : "";
  if (!papel || marcado(m.purgedUsers?.[e])) return semAcesso;
  const desabilitado = marcado(m.disabledUsers?.[e]);
  const podeEscrever = !desabilitado && !PAPEIS_LEITURA.includes(papel);
  return { email: e, papel, desabilitado, temAcesso: true, podeEscrever, admin: podeEscrever && PAPEIS_ADMIN.includes(papel), nome };
}

/** Lê o meta e devolve o acesso do e-mail. */
async function lerAcesso(email, db = getFirestore()) {
  const e = normalizarEmail(email);
  if (!e) return acessoPorMeta({}, "");
  if (e === ADMIN_SEED) {
    // O seed não depende do meta para ter acesso, mas o nome salvo vem de lá.
    const snap = await db.doc(DOC_META).get().catch(() => null);
    return acessoPorMeta(snap?.data?.() || {}, e);
  }
  const snap = await db.doc(DOC_META).get();
  return acessoPorMeta(snap.data() || {}, e);
}

module.exports = { ADMIN_SEED, acessoPorMeta, lerAcesso, nomeDoEmail, normalizarEmail };
