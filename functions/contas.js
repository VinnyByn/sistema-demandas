/**
 * Criação de login (Firebase Auth) pelo servidor, com o Admin SDK.
 * Quem chama (index.js) já conferiu que é administrador.
 */
const crypto = require("node:crypto");

const SENHA_MIN = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function erroDeEntrada(msg) {
  const e = new Error(msg);
  e.codigo = "invalid-argument";
  return e;
}

function senhaAleatoria() {
  return crypto.randomBytes(24).toString("base64url");
}

/**
 * @param {{ auth: import("firebase-admin/auth").Auth, email: string, senha?: string, nome?: string }} p
 * @returns {Promise<{ criada: boolean, existia: boolean, convite: boolean }>}
 *   existia: o login já existia (nada foi alterado nele, nem a senha);
 *   convite: criada sem senha definida pelo admin — o app deve mandar o e-mail de definir senha.
 */
async function criarContaLogin({ auth, email, senha, nome }) {
  const e = String(email || "")
    .trim()
    .toLowerCase();
  if (!EMAIL_RE.test(e)) throw erroDeEntrada("E-mail inválido.");
  const s = senha == null ? "" : String(senha);
  if (s && s.length < SENHA_MIN) throw erroDeEntrada(`A senha deve ter ao menos ${SENHA_MIN} caracteres.`);

  try {
    await auth.getUserByEmail(e);
    return { criada: false, existia: true, convite: false };
  } catch (err) {
    if (err?.code !== "auth/user-not-found") throw err;
  }

  const displayName = String(nome || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  try {
    await auth.createUser({ email: e, password: s || senhaAleatoria(), ...(displayName ? { displayName } : {}) });
    return { criada: true, existia: false, convite: !s };
  } catch (err) {
    if (err?.code === "auth/email-already-exists") return { criada: false, existia: true, convite: false };
    if (err?.code === "auth/invalid-password") throw erroDeEntrada(`Senha fraca. Use ao menos ${SENHA_MIN} caracteres.`);
    if (err?.code === "auth/invalid-email") throw erroDeEntrada("E-mail inválido.");
    throw err;
  }
}

function dataIso(v) {
  const t = v ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? new Date(t).toISOString() : "";
}

/**
 * Situação do login de cada e-mail (existe? último acesso?), para a aba Usuários.
 * Os e-mails vêm do doc meta no servidor — nunca do navegador, para não virar um jeito
 * de descobrir quais e-mails têm conta.
 * @returns {Promise<Record<string, { existe: boolean, ultimoLogin?: string, criadoEm?: string, desativadoNoLogin?: boolean, temSenha?: boolean }>>}
 */
async function listarContasLogin({ auth, emails }) {
  const lista = [...new Set((emails || []).map((e) => String(e || "").trim().toLowerCase()).filter((e) => EMAIL_RE.test(e)))];
  const out = Object.fromEntries(lista.map((e) => [e, { existe: false }]));
  for (let i = 0; i < lista.length; i += 100) {
    const { users } = await auth.getUsers(lista.slice(i, i + 100).map((email) => ({ email })));
    for (const u of users || []) {
      const e = String(u.email || "").toLowerCase();
      if (!out[e]) continue;
      out[e] = {
        existe: true,
        ultimoLogin: dataIso(u.metadata?.lastSignInTime),
        criadoEm: dataIso(u.metadata?.creationTime),
        desativadoNoLogin: !!u.disabled,
        temSenha: (u.providerData || []).some((p) => p.providerId === "password"),
      };
    }
  }
  return out;
}

module.exports = { criarContaLogin, listarContasLogin, SENHA_MIN };
