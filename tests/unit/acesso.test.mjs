// Acesso no servidor (_shared/acesso.mjs) e regras de criação/consulta de login (_shared/contas.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { acessoPorMeta, nomeDoEmail, lerAcesso, ADMIN_SEED } from "../../supabase/functions/_shared/acesso.mjs";
import { criarContaLogin, listarContasLogin } from "../../supabase/functions/_shared/contas.mjs";
import { criarBancoDeTeste } from "./helpers/supabase-pglite.mjs";
import { carregarApp } from "./helpers/app-nuvem.mjs";

const RAIZ = fileURLToPath(new URL("../../", import.meta.url));
const ler = (arquivo) => fs.readFileSync(path.join(RAIZ, arquivo), "utf8");

const SEED = "vinicius.morais@soumaster.com.br";
const META = {
  roles: {
    "ana@x.com": "admin",
    "adm.off@x.com": "admin",
    "bia@x.com": "projetista",
    "caio@x.com": "visibilidade",
    "duda@x.com": "projetista",
    "removido@x.com": "admin",
  },
  disabledUsers: { "adm.off@x.com": true, "duda@x.com": true, [SEED]: true },
  purgedUsers: { "removido@x.com": true, [SEED]: true },
  userDisplayNames: { "bia@x.com": "Bia Projetos" },
};

test("acesso segue o doc meta: papel, desabilitado e removido", () => {
  const ver = (email) => {
    const a = acessoPorMeta(META, email);
    return [a.temAcesso, a.podeEscrever, a.admin];
  };
  assert.deepEqual(ver("ana@x.com"), [true, true, true]);
  assert.deepEqual(ver("ANA@X.COM "), [true, true, true], "e-mail sem diferença de maiúsculas");
  assert.deepEqual(ver("adm.off@x.com"), [true, false, false], "admin desabilitado não é admin");
  assert.deepEqual(ver("bia@x.com"), [true, true, false]);
  assert.deepEqual(ver("caio@x.com"), [true, false, false], "visibilidade só lê");
  assert.deepEqual(ver("duda@x.com"), [true, false, false], "desabilitado só lê");
  assert.deepEqual(ver("removido@x.com"), [false, false, false], "removido perde tudo, mesmo com papel antigo");
  assert.deepEqual(ver("estranho@x.com"), [false, false, false], "fora do mapa não acessa");
  assert.deepEqual(ver(""), [false, false, false]);
  assert.deepEqual(ver(SEED), [true, true, true], "administrador principal não pode ser desabilitado nem removido");
  assert.deepEqual(acessoPorMeta({}, SEED).admin, true, "seed não depende do meta");
  assert.deepEqual(acessoPorMeta(null, "ana@x.com").temAcesso, false);
});

test("nome do autor vem do nome salvo pelo admin, senão do e-mail (igual ao app)", () => {
  assert.equal(acessoPorMeta(META, "bia@x.com").nome, "Bia Projetos");
  assert.equal(acessoPorMeta(META, "adm.off@x.com").nome, "Adm Off");
  assert.equal(nomeDoEmail("joao.bosco@soumaster.com.br"), "Joao Bosco");
});

test("nome a partir do e-mail respeita acentos (regressão: \\b\\w transformava João em JoãO)", () => {
  const casos = { "joão.bosco@x.com": "João Bosco", "maria-clara@x.com": "Maria Clara", "ana_luiza@x.com": "Ana Luiza", "ângela@x.com": "Ângela", "joão2.silva@x.com": "João2 Silva" };
  for (const [email, nome] of Object.entries(casos)) assert.equal(nomeDoEmail(email), nome, email);
  const app = ler("site/js/usuarios/usuarios-e-presenca.js").match(/function accountNameFromEmail[\s\S]*?\n}/)[0];
  const accountNameFromEmail = new Function(`${app}; return accountNameFromEmail;`)();
  for (const [email, nome] of Object.entries(casos)) assert.equal(accountNameFromEmail(email), nome, `app: ${email}`);
});

test("papel desconhecido só lê: nunca escreve nem administra", () => {
  for (const papel of ["gestor", "root", "superadmin", " admin", "admin ", "projetista ", "true", "1"]) {
    const a = acessoPorMeta({ roles: { "x@x.com": papel } }, "x@x.com");
    assert.deepEqual([a.temAcesso, a.podeEscrever, a.admin], [true, false, false], JSON.stringify(papel));
  }
});

/** `auth` falso, no formato que o contas.js espera (ver contas-supabase.js para o de verdade). */
function authFalso({ existentes = [], contas = [] } = {}) {
  const emails = new Set(existentes);
  const pedidos = [];
  return {
    pedidos,
    async criarConta(dados) {
      pedidos.push(dados);
      if (emails.has(dados.email)) throw Object.assign(new Error("existe"), { codigo: "email-ja-existe" });
      emails.add(dados.email);
    },
    async listarContas() {
      return contas;
    },
  };
}

test("criar login: com senha, sem senha (convite) e e-mail que já tinha login", async () => {
  const auth = authFalso({ existentes: ["ja@x.com"] });
  assert.deepEqual(await criarContaLogin({ auth, email: " Nova@X.com ", senha: "segredo1", nome: "Nova  Pessoa" }), {
    criada: true,
    existia: false,
    convite: false,
  });
  assert.deepEqual(auth.pedidos[0], { email: "nova@x.com", senha: "segredo1", nome: "Nova Pessoa" });

  const semSenha = await criarContaLogin({ auth, email: "convite@x.com", senha: "" });
  assert.deepEqual(semSenha, { criada: true, existia: false, convite: true });
  assert.equal(auth.pedidos[1].senha, undefined, "convite nasce sem senha: nenhuma senha inventada");

  assert.deepEqual(await criarContaLogin({ auth, email: "ja@x.com" }), { criada: false, existia: true, convite: false });
});

test("e-mails comuns passam na validação (regressão: um caractere sobrando na regex rejeitava quase todos)", async () => {
  const auth = authFalso();
  for (const email of ["x@gmail.com", "ana.souza@soumaster.com.br", "a+b@dominio.org", "Maiusculo@Email.COM"]) {
    assert.equal((await criarContaLogin({ auth, email })).criada, true, email);
  }
  for (const email of ["sem-arroba", "a@b", "a b@x.com", "@x.com", ""]) {
    await assert.rejects(criarContaLogin({ auth, email }), /E-mail inválido/, email);
  }
});

test("conta que já existe não recebe a senha enviada, e a resposta avisa isso", async () => {
  const auth = authFalso({ existentes: ["ja@x.com"] });
  assert.deepEqual(await criarContaLogin({ auth, email: "ja@x.com", senha: "outra1234" }), {
    criada: false,
    existia: true,
    convite: false,
    senhaIgnorada: true,
  });
  const semSenha = await criarContaLogin({ auth, email: "ja@x.com" });
  assert.equal("senhaIgnorada" in semSenha, false, "sem senha enviada, não há o que avisar");
});

test("senha: mínimo, máximo e só espaços são recusados antes de falar com o provedor", async () => {
  const auth = authFalso();
  await assert.rejects(criarContaLogin({ auth, email: "a@x.com", senha: "1234567" }), /ao menos 8/);
  await assert.rejects(criarContaLogin({ auth, email: "a@x.com", senha: "        " }), /só espaços/);
  await assert.rejects(criarContaLogin({ auth, email: "a@x.com", senha: "a".repeat(73) }), /no máximo 72/);
  await assert.rejects(criarContaLogin({ auth, email: "a@x.com", senha: "ç".repeat(37) }), /no máximo 72/, "o limite é em bytes");
  assert.equal(auth.pedidos.length, 0, "nada chegou ao provedor");
  assert.equal((await criarContaLogin({ auth, email: "a@x.com", senha: "a".repeat(72) })).criada, true);
});

test("erros do provedor: senha fraca e e-mail inválido viram erro de entrada; o resto sobe como veio", async () => {
  const comErro = (codigo) => ({
    async criarConta() {
      throw Object.assign(new Error(`falhou ${codigo}`), { codigo });
    },
  });
  await assert.rejects(criarContaLogin({ auth: comErro("senha-fraca"), email: "a@x.com", senha: "12345678" }), (erro) => erro.codigo === "invalid-argument" && /Senha fraca/.test(erro.message));
  await assert.rejects(criarContaLogin({ auth: comErro("email-invalido"), email: "a@x.com" }), (erro) => erro.codigo === "invalid-argument");
  await assert.rejects(criarContaLogin({ auth: comErro("rede-fora"), email: "a@x.com" }), (erro) => erro.codigo === "rede-fora" && /falhou/.test(erro.message));
});

test("nome do login: espaços juntos e corte por letras, sem partir um emoji ao meio", async () => {
  const auth = authFalso();
  await criarContaLogin({ auth, email: "a@x.com", nome: `${"a".repeat(119)}😀😀` });
  const nome = auth.pedidos[0].nome;
  assert.equal([...nome].length, 120);
  assert.ok(nome.endsWith("😀"), "o emoji do limite ficou inteiro");
  assert.equal(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(nome), false, "nenhuma metade de emoji sobrando");
  await criarContaLogin({ auth, email: "b@x.com", nome: "   " });
  assert.equal(auth.pedidos[1].nome, "", "nome em branco vai vazio");
});

test("situação dos logins: só quem foi pedido, sem inventar conta para quem não tem", async () => {
  const contas = [
    { email: "BLOQ@x.com", criadoEm: "2026-11-02T09:00:00.000Z", ultimoLogin: "2026-11-03T10:00:00.000Z", desativada: true },
    { email: "ativa@x.com", criadoEm: "2026-10-01T09:00:00.000Z", ultimoLogin: undefined, desativada: false },
    { email: "de-outro@x.com", criadoEm: "2026-10-01T09:00:00.000Z", desativada: false },
  ];
  const auth = authFalso({ contas });
  const r = await listarContasLogin({ auth, emails: ["sem.login@x.com", "bloq@x.com", "ATIVA@x.com", "lixo", "bloq@x.com"] });
  assert.equal(r["sem.login@x.com"].existe, false);
  assert.deepEqual(r["bloq@x.com"], {
    existe: true,
    ultimoLogin: "2026-11-03T10:00:00.000Z",
    criadoEm: "2026-11-02T09:00:00.000Z",
    desativadoNoLogin: true,
    temSenha: null,
  });
  assert.equal(r["ativa@x.com"].ultimoLogin, "", "nunca entrou: vazio");
  assert.equal(r["ativa@x.com"].desativadoNoLogin, false);
  assert.equal(r["de-outro@x.com"], undefined, "conta que não está na lista de papéis não aparece");
  assert.equal(r.lixo, undefined, "e-mail inválido fica de fora");
  assert.deepEqual(Object.keys(r).sort(), ["ativa@x.com", "bloq@x.com", "sem.login@x.com"]);
});

test("situação dos logins: lista vazia nem consulta o provedor", async () => {
  let consultou = false;
  const auth = { async listarContas() { consultou = true; return []; } };
  assert.deepEqual(await listarContasLogin({ auth, emails: [] }), {});
  assert.deepEqual(await listarContasLogin({ auth, emails: ["lixo"] }), {});
  assert.equal(consultou, false);
});

test("o administrador principal é o mesmo no banco e nas funções, e o e-mail dele não está no site público", () => {
  const emails = {
    "migration base": ler("supabase/migrations/20261106120000_base.sql").match(/select '([^']+)'::text/)?.[1],
    "_shared/acesso.mjs": ler("supabase/functions/_shared/acesso.mjs").match(/ADMIN_SEED = "([^"]+)"/)?.[1],
  };
  assert.ok(Object.values(emails).every(Boolean), JSON.stringify(emails));
  assert.equal(new Set(Object.values(emails)).size, 1, JSON.stringify(emails));
  const site = path.join(RAIZ, "site");
  for (const entrada of fs.readdirSync(site, { recursive: true })) {
    const arquivo = path.join(site, String(entrada));
    if (fs.statSync(arquivo).isFile() && /\.(js|html|css|json)$/.test(arquivo)) assert.equal(fs.readFileSync(arquivo, "utf8").includes(ADMIN_SEED), false, arquivo);
  }
});

test("as listas de papéis de administrador e de escrita são as mesmas nas funções e no banco", () => {
  const palavras = (trecho) => (trecho.match(/['"]([^'"]+)['"]/g) || []).map((p) => p.slice(1, -1)).sort();
  const funcoes = ler("supabase/functions/_shared/acesso.mjs");
  const banco = ler("supabase/migrations/20261106120000_base.sql");
  const emFuncoes = (nome) => palavras(funcoes.split(`${nome} = [`)[1]?.split("]")[0] || "");
  const emBanco = (nivel) => palavras(banco.match(new RegExp(`if v_papel in \\(([^)]*)\\) then return '${nivel}'`))?.[1] || "");
  assert.deepEqual(emBanco("admin"), emFuncoes("PAPEIS_ADMIN"));
  assert.deepEqual(emBanco("escrita"), emFuncoes("PAPEIS_ESCRITA"));
});

test("banco, servidor e tela dão o mesmo nível em toda combinação de papel e marca", async () => {
  const banco = await criarBancoDeTeste();
  const { DemandasRoles } = carregarApp({ rpc: async () => ({}) }, { email: "ana@x.com" });
  try {
    const papeis = [undefined, null, "", "admin", "ADMIN", "Administrador", "administrator", "projetista", "Projetista", "visibilidade", "LEITURA", "readonly", "viewer", "gestor", "root", " admin", "admin ", 7, true, {}];
    const marcas = [undefined, true, false, 1, 0, "1", "true", "TRUE", "0", "false", "", null];
    const nivelJs = (a) => (!a.temAcesso ? "" : a.admin ? "admin" : a.podeEscrever ? "escrita" : "leitura");
    const nivelTela = (r) => (r.isBlocked ? "" : r.isAdmin ? "admin" : r.isReadOnly ? "leitura" : "escrita");
    let casos = 0;
    for (const email of ["ana@x.com", ADMIN_SEED]) {
      for (const papel of papeis) for (const removido of marcas) for (const desabilitado of marcas) {
        const meta = JSON.parse(JSON.stringify({ roles: { [email]: papel }, purgedUsers: { [email]: removido }, disabledUsers: { [email]: desabilitado } }));
        const contexto = JSON.stringify({ email, papel, removido, desabilitado });
        const { rows } = await banco.db.query(`select public.acesso_nivel_de($1, $2::jsonb) as nivel`, [email, JSON.stringify(meta)]);
        assert.equal(rows[0].nivel, nivelJs(acessoPorMeta(meta, email)), `servidor ${contexto}`);
        DemandasRoles.definirAdminPrincipal(ADMIN_SEED);
        DemandasRoles.setPurgedMap(meta.purgedUsers || {});
        DemandasRoles.setRolesMap(meta.roles || {});
        DemandasRoles.setDisabledMap(meta.disabledUsers || {});
        assert.equal(nivelTela(DemandasRoles.resolve({ email })), rows[0].nivel, `tela ${contexto}`);
        casos += 1;
      }
    }
    assert.equal(casos, 2 * papeis.length * marcas.length * marcas.length);
  } finally {
    await banco.db.close();
  }
});

test("o acesso é independente de banco: não importa nada de Firebase, Supabase ou Postgres", () => {
  for (const arquivo of ["supabase/functions/_shared/acesso.mjs", "supabase/functions/_shared/email.mjs", "supabase/functions/_shared/contas.mjs"]) {
    const importacoes = [...ler(arquivo).matchAll(/from ["']([^"']+)["']/g)].map((m) => m[1]);
    assert.deepEqual(importacoes.filter((p) => /firebase|supabase|postgres|^pg$/i.test(p)), [], arquivo);
  }
  assert.ok([...ler("supabase/functions/_shared/acesso.mjs").matchAll(/from ["']([^"']+)["']/g)].some((m) => m[1] === "./email.mjs"), "a leitura dos imports funciona");
});

test("lerAcesso: usa o meta que lhe entregam; se ele não puder ser lido, só o administrador principal segue", async () => {
  const comMeta = (dados) => async () => dados;
  const metaForaDoAr = async () => {
    throw new Error("banco fora");
  };
  const meta = { roles: { "ana@x.com": "admin", "bia@x.com": "leitura" }, userDisplayNames: { [ADMIN_SEED]: "Vinícius Morais" } };

  assert.equal((await lerAcesso("ANA@x.com", comMeta(meta))).admin, true);
  assert.equal((await lerAcesso("bia@x.com", comMeta(meta))).podeEscrever, false);
  assert.equal((await lerAcesso("sem@x.com", comMeta(meta))).temAcesso, false);
  assert.equal((await lerAcesso("", comMeta(meta))).temAcesso, false);
  assert.equal((await lerAcesso("ana@x.com", comMeta(undefined))).temAcesso, false, "meta vazio: ninguém tem acesso");

  assert.equal((await lerAcesso(ADMIN_SEED, comMeta(meta))).nome, "Vinícius Morais", "o nome salvo vem do meta");
  const semMeta = await lerAcesso(ADMIN_SEED, metaForaDoAr);
  assert.equal(semMeta.admin, true, "o admin principal continua com acesso");
  assert.equal(semMeta.nome, "Vinicius Morais", "sem o meta, o nome vem do e-mail");
  await assert.rejects(lerAcesso("ana@x.com", metaForaDoAr), /banco fora/, "os demais não ganham acesso quando o meta falha");
});
