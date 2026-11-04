// Acesso no backend (functions/acesso.js) e criação de login pelo servidor (functions/contas.js).
const test = require("node:test");
const assert = require("node:assert/strict");
const { acessoPorMeta, nomeDoEmail } = require("../../functions/acesso");
const fs = require("node:fs");
const path = require("node:path");
const { criarContaLogin, listarContasLogin } = require("../../functions/contas");

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

function authFalso(existentes = []) {
  const usuarios = new Map(existentes.map((e) => [e, { email: e }]));
  const criados = [];
  return {
    criados,
    async getUserByEmail(email) {
      if (!usuarios.has(email)) throw Object.assign(new Error("não existe"), { code: "auth/user-not-found" });
      return usuarios.get(email);
    },
    async createUser(dados) {
      if (usuarios.has(dados.email)) throw Object.assign(new Error("existe"), { code: "auth/email-already-exists" });
      usuarios.set(dados.email, dados);
      criados.push(dados);
      return { uid: `u${criados.length}`, ...dados };
    },
  };
}

test("criar login: com senha, sem senha (convite) e e-mail que já tinha login", async () => {
  const auth = authFalso(["ja@x.com"]);
  assert.deepEqual(await criarContaLogin({ auth, email: " Nova@X.com ", senha: "segredo1", nome: "Nova  Pessoa" }), {
    criada: true,
    existia: false,
    convite: false,
  });
  assert.equal(auth.criados[0].email, "nova@x.com");
  assert.equal(auth.criados[0].password, "segredo1");
  assert.equal(auth.criados[0].displayName, "Nova Pessoa");

  const semSenha = await criarContaLogin({ auth, email: "convite@x.com", senha: "" });
  assert.deepEqual(semSenha, { criada: true, existia: false, convite: true });
  assert.ok(auth.criados[1].password.length >= 24, "senha aleatória forte, que ninguém conhece");

  assert.deepEqual(await criarContaLogin({ auth, email: "ja@x.com", senha: "outra1234" }), {
    criada: false,
    existia: true,
    convite: false,
  });
  assert.equal(auth.criados.length, 2, "conta existente não é alterada (nem a senha)");

  await assert.rejects(criarContaLogin({ auth, email: "sem-arroba", senha: "" }), /E-mail inválido/);
  await assert.rejects(criarContaLogin({ auth, email: "a@x.com", senha: "1234567" }), /ao menos 8/);
});

test("situação dos logins: em lotes de 100, sem inventar conta para quem não tem", async () => {
  const lotes = [];
  const auth = {
    async getUsers(ids) {
      lotes.push(ids.length);
      return {
        users: ids
          .filter(({ email }) => !email.startsWith("sem"))
          .map(({ email }) => ({
            email,
            disabled: email === "bloq@x.com",
            metadata: { lastSignInTime: "Tue, 03 Nov 2026 10:00:00 GMT", creationTime: "Mon, 02 Nov 2026 09:00:00 GMT" },
            providerData: [{ providerId: "password" }],
          })),
      };
    },
  };
  const emails = [...Array.from({ length: 150 }, (_, i) => `u${i}@x.com`), "sem.login@x.com", "BLOQ@x.com", "lixo"];
  const r = await listarContasLogin({ auth, emails });
  assert.deepEqual(lotes, [100, 52]);
  assert.equal(r["sem.login@x.com"].existe, false);
  assert.deepEqual(r["bloq@x.com"], {
    existe: true,
    ultimoLogin: "2026-11-03T10:00:00.000Z",
    criadoEm: "2026-11-02T09:00:00.000Z",
    desativadoNoLogin: true,
    temSenha: true,
  });
  assert.equal(r.lixo, undefined, "e-mail inválido fica de fora");
});

test("o administrador principal é o mesmo nas regras, nas funções e no app", () => {
  const raiz = path.join(__dirname, "../..");
  const ler = (f) => fs.readFileSync(path.join(raiz, f), "utf8");
  const emails = {
    "firestore.rules": ler("firestore.rules").match(/isSeedAdmin\(\)\s*\{[^}]*?==\s*'([^']+)'/)?.[1],
    "storage.rules": ler("storage.rules").match(/email == '([^']+)'/)?.[1],
    "functions/acesso.js": ler("functions/acesso.js").match(/ADMIN_SEED = "([^"]+)"/)?.[1],
    "user-roles.js": ler("demandas-projetos/user-roles.js").match(/DEMANDAS_ADMIN_EMAIL = "([^"]+)"/)?.[1],
  };
  assert.ok(Object.values(emails).every(Boolean), JSON.stringify(emails));
  assert.equal(new Set(Object.values(emails)).size, 1, JSON.stringify(emails));
});
