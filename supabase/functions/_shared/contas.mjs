/**
 * Regras de criação e consulta de logins. O provedor entra por `auth` (ver contas-supabase.mjs)
 * para poder ser trocado sem mexer aqui.
 */

import { normalizarEmail } from "./email.mjs";

const SENHA_MIN = 8;
// O bcrypt lê só 72 bytes (não letras): avisar aqui evita um erro genérico do provedor.
const SENHA_MAX_BYTES = 72;
// Simples de propósito: a validação real é do provedor, e uma regex rígida recusaria e-mails válidos.
const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NOME_MAX_CARACTERES = 120;

function erroDeEntrada(mensagem) {
  const erro = new Error(mensagem);
  erro.codigo = "invalid-argument";
  return erro;
}

function validarSenha(senha) {
  if (!senha) return;
  if (!senha.trim()) throw erroDeEntrada("A senha não pode ter só espaços.");
  if (senha.length < SENHA_MIN) throw erroDeEntrada(`A senha deve ter ao menos ${SENHA_MIN} caracteres.`);
  if (new TextEncoder().encode(senha).length > SENHA_MAX_BYTES) throw erroDeEntrada(`A senha deve ter no máximo ${SENHA_MAX_BYTES} caracteres.`);
}

function limparNome(nome) {
  const semEspacosSobrando = String(nome || "")
    .replace(/\s+/g, " ")
    .trim();
  // Corte por letras: o `.slice` direto partiria um emoji ao meio.
  return [...semEspacosSobrando].slice(0, NOME_MAX_CARACTERES).join("");
}

async function criarContaLogin({ auth, email, senha, nome }) {
  const emailNormalizado = normalizarEmail(email);
  if (!REGEX_EMAIL.test(emailNormalizado)) throw erroDeEntrada("E-mail inválido.");
  const senhaInformada = senha == null ? "" : String(senha);
  validarSenha(senhaInformada);

  try {
    // Sem consultar antes: duas chamadas simultâneas passariam ambas pela consulta. O provedor decide.
    await auth.criarConta({ email: emailNormalizado, senha: senhaInformada || undefined, nome: limparNome(nome) });
    return { criada: true, existia: false, convite: !senhaInformada };
  } catch (erro) {
    if (erro?.codigo === "email-ja-existe") {
      return { criada: false, existia: true, convite: false, ...(senhaInformada ? { senhaIgnorada: true } : {}) };
    }
    if (erro?.codigo === "senha-fraca") throw erroDeEntrada(`Senha fraca. Use ao menos ${SENHA_MIN} caracteres.`);
    if (erro?.codigo === "email-invalido") throw erroDeEntrada("E-mail inválido.");
    throw erro;
  }
}

function converterParaIso(valor) {
  const timestamp = valor ? Date.parse(valor) : NaN;
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "";
}

async function listarContasLogin({ auth, emails }) {
  const emailsUnicos = [...new Set((emails || []).map(normalizarEmail).filter((email) => REGEX_EMAIL.test(email)))];
  const contasPorEmail = Object.fromEntries(emailsUnicos.map((email) => [email, { existe: false }]));
  if (!emailsUnicos.length) return contasPorEmail;

  // Só entram os e-mails pedidos (vindos do servidor), senão isto viraria um jeito de descobrir quem tem conta.
  for (const conta of await auth.listarContas()) {
    const email = normalizarEmail(conta.email);
    if (!contasPorEmail[email]) continue;
    contasPorEmail[email] = {
      existe: true,
      ultimoLogin: converterParaIso(conta.ultimoLogin),
      criadoEm: converterParaIso(conta.criadoEm),
      desativadoNoLogin: !!conta.desativada,
      temSenha: null, // a API não informa; "sim" enganaria nos convites pendentes
    };
  }
  return contasPorEmail;
}

export { criarContaLogin, listarContasLogin, SENHA_MIN };
