/**
 * Quem pode o quê no backend, lido de sistema_meta (a mesma fonte do app e das regras do banco).
 * roles: e-mail → admin | projetista | visibilidade (fora do mapa = sem acesso); disabledUsers: só lê; purgedUsers: sem acesso.
 * Mesma lógica das regras de acesso do banco e de site/js/usuarios/user-roles.js (tests/unit/acesso.test.mjs confere): mudou aqui, mude lá.
 */
import { normalizarEmail } from "./email.mjs";

const ADMIN_SEED = "vinicius.morais@soumaster.com.br";
const PAPEIS_ADMIN = ["admin", "administrador", "administrator"];
const PAPEIS_ESCRITA = ["projetista"];

function estaMarcado(valor) {
  if (typeof valor === "string") return ["1", "true"].includes(valor.toLowerCase());
  return valor === true || valor === 1;
}

// Igual ao accountNameFromEmail do app. O \b\w não serve: para ele, o "ã" separa palavras ("joão" viraria "JoãO").
function nomeDoEmail(email) {
  const emailLimpo = String(email || "").trim();
  if (!emailLimpo) return "";
  const parteLocal = emailLimpo.split("@")[0] || emailLimpo;
  const rotulo = parteLocal.replace(/[._-]+/g, " ").trim();
  if (!rotulo) return emailLimpo;
  return rotulo.replace(/(^|\s)(\S)/gu, (_, espaco, letra) => espaco + letra.toUpperCase());
}

function nomeDaConta(meta, email) {
  const nomeSalvo = String(meta.userDisplayNames?.[email] || "").replace(/\s+/g, " ").trim();
  return nomeSalvo || nomeDoEmail(email);
}

function papelNoMeta(meta, email) {
  const papel = meta.roles?.[email];
  return typeof papel === "string" ? papel.toLowerCase() : "";
}

function acessoPorMeta(meta, email) {
  const emailNormalizado = normalizarEmail(email);
  const dadosMeta = meta && typeof meta === "object" ? meta : {};
  const identidade = { email: emailNormalizado, nome: nomeDaConta(dadosMeta, emailNormalizado) };
  const semAcesso = { ...identidade, papel: "", desabilitado: false, temAcesso: false, podeEscrever: false, admin: false };

  if (!emailNormalizado) return semAcesso;
  // O admin principal ignora desabilitado e removido, para o sistema nunca ficar sem quem corrija os papéis.
  if (emailNormalizado === ADMIN_SEED) {
    return { ...identidade, papel: "admin", desabilitado: false, temAcesso: true, podeEscrever: true, admin: true };
  }

  const papel = papelNoMeta(dadosMeta, emailNormalizado);
  const removido = estaMarcado(dadosMeta.purgedUsers?.[emailNormalizado]);
  if (!papel || removido) return semAcesso;

  const desabilitado = estaMarcado(dadosMeta.disabledUsers?.[emailNormalizado]);
  const ehAdmin = PAPEIS_ADMIN.includes(papel);
  // Papel desconhecido só lê: um valor digitado errado nunca pode dar mais poder do que o administrador quis dar.
  const podeEscrever = !desabilitado && (ehAdmin || PAPEIS_ESCRITA.includes(papel));
  return { ...identidade, papel, desabilitado, temAcesso: true, podeEscrever, admin: podeEscrever && ehAdmin };
}

// `lerMeta` devolve o meta de onde ele estiver: assim este arquivo não depende de nenhum banco.
// Se o meta não puder ser lido, só o admin principal segue (perde apenas o nome salvo); os demais falham de forma segura.
async function lerAcesso(email, lerMeta) {
  const emailNormalizado = normalizarEmail(email);
  if (!emailNormalizado) return acessoPorMeta({}, "");
  let meta;
  try {
    meta = await lerMeta();
  } catch (erro) {
    if (emailNormalizado !== ADMIN_SEED) throw erro;
  }
  return acessoPorMeta(meta || {}, emailNormalizado);
}

export { ADMIN_SEED, acessoPorMeta, lerAcesso, nomeDoEmail, normalizarEmail };
