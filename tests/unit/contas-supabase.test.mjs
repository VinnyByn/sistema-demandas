// Adaptador de logins sobre o Supabase Auth (_shared/contas-supabase.mjs): tradução de erros,
// paginação e a requisição que realmente sai (biblioteca oficial com `fetch` simulado).
import test from "node:test";
import assert from "node:assert/strict";
import { GoTrueAdminApi } from "@supabase/auth-js";
import { criarAdaptadorAuth } from "../../supabase/functions/_shared/contas-supabase.mjs";
import { criarContaLogin, listarContasLogin } from "../../supabase/functions/_shared/contas.mjs";

/** `authAdmin` falso, no formato do GoTrueAdminApi: devolve { data, error } e não lança exceção. */
function authAdminFalso({ usuarios = [], erroAoCriar = null, erroAoListar = null } = {}) {
  const criados = [];
  const paginas = [];
  return {
    criados,
    paginas,
    async createUser(atributos) {
      criados.push(atributos);
      return erroAoCriar ? { data: { user: null }, error: erroAoCriar } : { data: { user: { id: `u${criados.length}` } }, error: null };
    },
    async listUsers({ page, perPage }) {
      paginas.push({ page, perPage });
      if (erroAoListar) return { data: { users: [] }, error: erroAoListar };
      const ultima = Math.max(1, Math.ceil(usuarios.length / perPage));
      const users = usuarios.slice((page - 1) * perPage, page * perPage);
      return { data: { users, aud: "authenticated", nextPage: page < ultima ? page + 1 : null, lastPage: ultima, total: usuarios.length }, error: null };
    },
  };
}

test("criar conta: já confirmada, sem senha quando é convite e com o nome em user_metadata", async () => {
  const authAdmin = authAdminFalso();
  const auth = criarAdaptadorAuth(authAdmin);
  await auth.criarConta({ email: "a@x.com", senha: "segredo12", nome: "Ana Souza" });
  await auth.criarConta({ email: "b@x.com", senha: undefined, nome: "" });
  assert.deepEqual(authAdmin.criados[0], { email: "a@x.com", email_confirm: true, password: "segredo12", user_metadata: { display_name: "Ana Souza" } });
  assert.deepEqual(authAdmin.criados[1], { email: "b@x.com", email_confirm: true }, "convite: nenhuma senha, nenhum nome");
});

test("erros do Supabase viram os códigos do contas.js; o desconhecido sobe como veio", async () => {
  const tentar = async (code) => {
    const erro = Object.assign(new Error(`erro ${code}`), { code, status: 422 });
    return criarAdaptadorAuth(authAdminFalso({ erroAoCriar: erro })).criarConta({ email: "a@x.com" }).catch((e) => e);
  };
  assert.equal((await tentar("email_exists")).codigo, "email-ja-existe");
  assert.equal((await tentar("user_already_exists")).codigo, "email-ja-existe");
  assert.equal((await tentar("weak_password")).codigo, "senha-fraca");
  assert.equal((await tentar("email_address_invalid")).codigo, "email-invalido");
  const desconhecido = await tentar("unexpected_failure");
  assert.equal(desconhecido.codigo, undefined, "não inventa código para erro que não conhece");
  assert.match(desconhecido.message, /unexpected_failure/);
});

test("com o adaptador, e-mail repetido vira 'já existia' e senha fraca vira erro de entrada", async () => {
  const jaExiste = Object.assign(new Error("registrado"), { code: "email_exists" });
  const fraca = Object.assign(new Error("fraca"), { code: "weak_password" });
  assert.deepEqual(
    await criarContaLogin({ auth: criarAdaptadorAuth(authAdminFalso({ erroAoCriar: jaExiste })), email: "a@x.com", senha: "segredo12" }),
    { criada: false, existia: true, convite: false, senhaIgnorada: true },
  );
  await assert.rejects(
    criarContaLogin({ auth: criarAdaptadorAuth(authAdminFalso({ erroAoCriar: fraca })), email: "a@x.com", senha: "12345678" }),
    (erro) => erro.codigo === "invalid-argument" && /Senha fraca/.test(erro.message),
  );
});

test("listar contas: percorre todas as páginas e sabe quem está bloqueado", async () => {
  const futuro = new Date(Date.now() + 86_400_000).toISOString();
  const passado = new Date(Date.now() - 86_400_000).toISOString();
  const usuarios = Array.from({ length: 2500 }, (_, i) => ({ email: `u${i}@x.com`, created_at: "2026-10-01T09:00:00Z", last_sign_in_at: "2026-11-03T10:00:00Z" }));
  usuarios[1] = { ...usuarios[1], banned_until: futuro };
  usuarios[2] = { ...usuarios[2], banned_until: passado };
  usuarios[3] = { ...usuarios[3], banned_until: "infinity" };
  const authAdmin = authAdminFalso({ usuarios });
  const contas = await criarAdaptadorAuth(authAdmin).listarContas();
  assert.equal(contas.length, 2500);
  assert.deepEqual(authAdmin.paginas, [{ page: 1, perPage: 1000 }, { page: 2, perPage: 1000 }, { page: 3, perPage: 1000 }]);
  assert.deepEqual(contas[1], { email: "u1@x.com", criadoEm: "2026-10-01T09:00:00Z", ultimoLogin: "2026-11-03T10:00:00Z", desativada: true });
  assert.equal(contas[2].desativada, false, "bloqueio que já terminou não conta");
  assert.equal(contas[3].desativada, true, "bloqueio sem fim");
  assert.equal(contas[0].desativada, false);

  const r = await listarContasLogin({ auth: criarAdaptadorAuth(authAdminFalso({ usuarios })), emails: ["u1@x.com", "u2499@x.com", "nao.tem@x.com"] });
  assert.equal(r["u1@x.com"].desativadoNoLogin, true);
  assert.equal(r["u2499@x.com"].existe, true, "achou a conta da última página");
  assert.equal(r["nao.tem@x.com"].existe, false);
});

test("listar contas: erro do provedor sobe, e paginação que nunca termina é interrompida", async () => {
  const erro = Object.assign(new Error("sem permissão"), { code: "not_admin" });
  await assert.rejects(criarAdaptadorAuth(authAdminFalso({ erroAoListar: erro })).listarContas(), /sem permissão/);
  let pedidos = 0;
  const infinito = {
    async listUsers() {
      pedidos++;
      return { data: { users: [{ email: "a@x.com" }], aud: "x", nextPage: 2, lastPage: 99999, total: 1 }, error: null };
    },
  };
  await criarAdaptadorAuth(infinito).listarContas();
  assert.equal(pedidos, 100, "para na trava de segurança");
});

test("requisição real da biblioteca: endereço, chave de serviço e corpo; erro do servidor é traduzido", async () => {
  const pedidos = [];
  let resposta = { status: 200, corpo: { id: "11111111-1111-1111-1111-111111111111", email: "a@x.com", aud: "authenticated" } };
  const fetchImpl = async (url, opcoes) => {
    pedidos.push({ url: String(url), metodo: opcoes.method, cabecalhos: new Headers(opcoes.headers), corpo: opcoes.body ? JSON.parse(opcoes.body) : null });
    return new Response(JSON.stringify(resposta.corpo), { status: resposta.status, headers: { "Content-Type": "application/json" } });
  };
  const auth = criarAdaptadorAuth(new GoTrueAdminApi({ url: "https://x.supabase.co/auth/v1", headers: { apikey: "sb_secret_teste" }, fetch: fetchImpl }));

  await auth.criarConta({ email: "a@x.com", senha: undefined, nome: "Ana" });
  assert.equal(pedidos[0].url, "https://x.supabase.co/auth/v1/admin/users");
  assert.equal(pedidos[0].metodo, "POST");
  assert.equal(pedidos[0].cabecalhos.get("apikey"), "sb_secret_teste", "a chave nova vai no apikey");
  assert.deepEqual(pedidos[0].corpo, { email: "a@x.com", email_confirm: true, user_metadata: { display_name: "Ana" } });

  resposta = { status: 422, corpo: { code: 422, error_code: "email_exists", msg: "A user with this email address has already been registered" } };
  const erro = await auth.criarConta({ email: "a@x.com" }).catch((e) => e);
  assert.equal(erro.codigo, "email-ja-existe", "o código do servidor chega traduzido");

  resposta = { status: 422, corpo: { code: 422, error_code: "weak_password", msg: "Password should be at least 6 characters." } };
  assert.equal((await auth.criarConta({ email: "b@x.com", senha: "123" }).catch((e) => e)).codigo, "senha-fraca");
});
