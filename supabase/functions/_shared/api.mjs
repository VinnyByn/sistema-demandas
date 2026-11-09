// Ações que o app chama pela função `api`. Quem pode o quê é conferido aqui: a tela sozinha não basta.
import * as asanaLib from "./asana/index.mjs";
import { criarRepositorioSupabase } from "./asana/repositorio-supabase.mjs";
import { lerAcesso, normalizarEmail } from "./acesso.mjs";
import { criarContaLogin, listarContasLogin } from "./contas.mjs";
import { criarAdaptadorAuth } from "./contas-supabase.mjs";
import { gerarBackup } from "./backup.mjs";

const STATUS_POR_CODIGO = {
  "invalid-argument": 400,
  unauthenticated: 401,
  "permission-denied": 403,
  "not-found": 404,
  "failed-precondition": 412,
  unavailable: 503,
  internal: 500,
};
const CODIGO_POR_STATUS_DO_ASANA = {
  400: "invalid-argument",
  403: "permission-denied",
  404: "failed-precondition",
};
const TEXTO_MAX = 4000;
const AUTOR_MAX = 120;

class ErroApi extends Error {
  constructor(codigo, mensagem) {
    super(mensagem);
    this.codigo = codigo;
  }
}

async function emailDoUsuario(admin, usuarioId) {
  if (!usuarioId) return "";
  const { data, error } = await admin.rpc("acesso_email_de", { p_usuario: usuarioId });
  if (error) throw new Error(error.message);
  return data || "";
}

function lerMetaDe(admin) {
  return async () => {
    const { data, error } = await admin.from("sistema_meta").select("dados").eq("id", "meta").maybeSingle();
    if (error) throw new Error(error.message);
    return data?.dados || {};
  };
}

async function exigirNivel({ email, admin }, nivel, acao) {
  if (!email) throw new ErroApi("unauthenticated", `Faça login para ${acao}.`);
  const acesso = await lerAcesso(email, lerMetaDe(admin));
  if (!acesso.temAcesso) throw new ErroApi("permission-denied", "Seu e-mail não tem acesso ao sistema.");
  if (nivel === "admin" && !acesso.admin) throw new ErroApi("permission-denied", `Só administradores podem ${acao}.`);
  if (nivel === "escrita" && !acesso.podeEscrever) {
    const motivo = acesso.desabilitado ? "Sua conta está desabilitada." : `Seu perfil é somente leitura: não dá para ${acao}.`;
    throw new ErroApi("permission-denied", motivo);
  }
  return acesso;
}

const textoDe = (valor) => String(valor || "").trim();

function exigirDemanda(dados) {
  const demandaId = textoDe(dados?.demandaId);
  if (!demandaId) throw new ErroApi("invalid-argument", "Informe a demanda.");
  return demandaId;
}

function tokenAsana(env) {
  const token = env.ASANA_TOKEN;
  if (!token) throw new ErroApi("failed-precondition", "Token do Asana (ASANA_TOKEN) não configurado no servidor.");
  return token;
}

const dependenciasDoAsana = (c) => ({ repositorio: c.repositorio, token: tokenAsana(c.env), fetchImpl: c.fetchImpl });

// Cada ação confere primeiro quem chama. `erroPadrao` é o que o usuário vê se algo inesperado acontecer.
const ACOES = {
  asanaProjetos: {
    erroPadrao: "Não foi possível ler os projetos do Asana.",
    async executar(c) {
      await exigirNivel(c, "acesso", "ver os projetos do Asana");
      const { repositorio, token, fetchImpl } = dependenciasDoAsana(c);
      await Promise.all(
        asanaLib.ASANA_PROJETOS.map((projeto) =>
          asanaLib
            .garantirWebhook({ repositorio, token, fetchImpl, projetoGid: projeto.gid, endpoint: c.enderecoWebhook })
            .catch((erro) => console.warn("Webhook Asana:", erro.message || erro)),
        ),
      );
      return { projetos: await asanaLib.nomesDosProjetos({ token, fetchImpl }) };
    },
  },

  createAsanaOperacao: {
    erroPadrao: "Não foi possível criar a tarefa no Asana.",
    async executar(c) {
      await exigirNivel(c, "escrita", "enviar ao Asana");
      const demandaId = exigirDemanda(c.dados);
      const instrucoes = textoDe(c.dados?.instrucoes);
      if (!instrucoes) throw new ErroApi("invalid-argument", "Informe as instruções do que deverá ser feito.");
      if (instrucoes.length > TEXTO_MAX) throw new ErroApi("invalid-argument", `As instruções devem ter no máximo ${TEXTO_MAX} caracteres.`);
      return asanaLib.criarTarefa({
        ...dependenciasDoAsana(c),
        demandaId,
        instrucoes,
        projetoGid: c.dados?.projetoGid,
        email: c.email,
        endpoint: c.enderecoWebhook,
        novaOrdem: c.dados?.novaOrdem === true,
      });
    },
  },

  cancelAsanaOperacao: {
    erroPadrao: "Não foi possível cancelar no Asana.",
    async executar(c) {
      await exigirNivel(c, "escrita", "cancelar no Asana");
      return asanaLib.cancelarTarefa({ ...dependenciasDoAsana(c), demandaId: exigirDemanda(c.dados) });
    },
  },

  asanaAnexar: {
    erroPadrao: "Não foi possível anexar no Asana.",
    async executar(c) {
      const acesso = await exigirNivel(c, "escrita", "anexar no Asana");
      return asanaLib.anexarArquivo({
        ...dependenciasDoAsana(c),
        demandaId: exigirDemanda(c.dados),
        nome: c.dados?.nome,
        tipo: c.dados?.tipo,
        base64: c.dados?.base64,
        autor: acesso.nome.slice(0, AUTOR_MAX), // de quem está logado, não o que o navegador mandar: ninguém assina por outro
      });
    },
  },

  asanaComentario: {
    erroPadrao: "Não foi possível enviar o comentário ao Asana.",
    async executar(c) {
      const acesso = await exigirNivel(c, "escrita", "comentar no Asana");
      const demandaId = textoDe(c.dados?.demandaId);
      const comentarioId = textoDe(c.dados?.comentarioId);
      const acao = String(c.dados?.acao || "");
      const texto = textoDe(c.dados?.texto);
      if (!demandaId || !comentarioId) throw new ErroApi("invalid-argument", "Informe a demanda e o comentário.");
      if (!["criar", "editar", "apagar"].includes(acao)) throw new ErroApi("invalid-argument", "Ação inválida.");
      if (acao !== "apagar" && !texto) throw new ErroApi("invalid-argument", "Comentário vazio.");
      if (texto.length > TEXTO_MAX) throw new ErroApi("invalid-argument", "Comentário longo demais.");
      return asanaLib.sincronizarComentario({
        ...dependenciasDoAsana(c),
        demandaId,
        acao,
        comentarioId,
        texto,
        autor: (acesso.nome || "Equipe").slice(0, AUTOR_MAX),
        email: acesso.email,
        admin: acesso.admin,
      });
    },
  },

  backupAgora: {
    erroPadrao: "Falha ao gerar o backup.",
    async executar(c) {
      const acesso = await exigirNivel(c, "admin", "gerar o backup");
      return gerarBackup({ admin: c.admin, motivo: "manual", autor: acesso.email });
    },
  },

  criarContaLogin: {
    erroPadrao: "Não foi possível criar a conta.",
    async executar(c) {
      await exigirNivel(c, "admin", "criar contas");
      return criarContaLogin({
        auth: criarAdaptadorAuth(c.admin.auth.admin),
        email: normalizarEmail(c.dados?.email),
        senha: c.dados?.senha,
        nome: c.dados?.nome,
      });
    },
  },

  listarContasLogin: {
    erroPadrao: "Não foi possível ler as contas de login.",
    async executar(c) {
      await exigirNivel(c, "admin", "ver as contas de login");
      const meta = await lerMetaDe(c.admin)();
      return {
        contas: await listarContasLogin({
          auth: criarAdaptadorAuth(c.admin.auth.admin),
          emails: Object.keys(meta.roles || {}),
        }),
      };
    },
  },
};

// AsanaErro traz mensagem escrita para o usuário; o que não conhecemos fica só no log, para não vazar detalhe interno.
function erroParaOUsuario(erro, erroPadrao) {
  if (erro instanceof ErroApi) return erro;
  if (erro instanceof asanaLib.AsanaErro) {
    return new ErroApi(CODIGO_POR_STATUS_DO_ASANA[erro.status] || "unavailable", erro.message);
  }
  if (erro?.codigo === "invalid-argument") return new ErroApi("invalid-argument", erro.message);
  console.error(erroPadrao, erro);
  return new ErroApi("unavailable", erroPadrao);
}

async function executarAcao({ acao, dados, email, admin, env, fetchImpl }) {
  // hasOwn: "constructor" ou "__proto__" vindos do pedido não podem virar uma ação.
  const definicao = Object.hasOwn(ACOES, acao) ? ACOES[acao] : null;
  if (!definicao) throw new ErroApi("not-found", "Ação desconhecida.");

  const contexto = {
    dados: dados && typeof dados === "object" ? dados : {},
    email,
    admin,
    env,
    fetchImpl,
    repositorio: criarRepositorioSupabase(admin),
    enderecoWebhook: `${env.SUPABASE_URL}/functions/v1/asana-webhook`,
  };
  try {
    return await definicao.executar(contexto);
  } catch (erro) {
    throw erroParaOUsuario(erro, definicao.erroPadrao);
  }
}

/** Transforma o pedido HTTP em resultado. O erro segue um formato só, que o app traduz (ver DemandasNuvem.chamar). */
async function responderApi(req, { usuarioId, admin, env, fetchImpl = undefined }) {
  try {
    const corpo = await req.json().catch(() => null);
    if (!corpo?.acao) throw new ErroApi("invalid-argument", "Pedido inválido.");
    const email = await emailDoUsuario(admin, usuarioId);
    const resultado = await executarAcao({ acao: String(corpo.acao), dados: corpo.dados, email, admin, env, fetchImpl });
    return Response.json(resultado);
  } catch (erro) {
    const conhecido = erro instanceof ErroApi;
    if (!conhecido) console.error("api", erro);
    const codigo = conhecido ? erro.codigo : "internal";
    const mensagem = conhecido ? erro.message : "Erro no servidor.";
    return Response.json({ erro: { codigo, mensagem } }, { status: STATUS_POR_CODIGO[codigo] || 500 });
  }
}

export { responderApi, executarAcao, ErroApi };
