// Código real do navegador com a biblioteca oficial do Supabase; só a rede é falsa. Prova que o que o app chama existe e
// o que sai pela rede (endereços, chave, sessão) é o esperado, coisa que o cliente de teste do PGlite não prova sozinho.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const pasta = (arquivo) => fileURLToPath(new URL(`../../site/js/${arquivo}`, import.meta.url));
const CHAVE = "sb_publishable_teste";
const USUARIO = { id: "11111111-1111-1111-1111-111111111111", email: "bia@x.com", aud: "authenticated", user_metadata: { display_name: "Bia Projetos" }, app_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
const TOKEN = `cabecalho.${Buffer.from(JSON.stringify({ sub: USUARIO.id, exp: 4102444800 })).toString("base64url")}.assinatura`;

const json = (dados, status = 200) => new Response(JSON.stringify(dados), { status, headers: { "Content-Type": "application/json" } });

class TransporteMudo {
  constructor() {
    this.readyState = 0;
  }
  send() {}
  close() {}
}

function carregar({ rotas = {}, hash = "", config = { url: "https://teste.supabase.co", publishableKey: CHAVE } } = {}) {
  const pedidos = [];
  const fetchFalso = async (url, opcoes = {}) => {
    const u = new URL(String(url));
    const corpo = typeof opcoes.body === "string" ? JSON.parse(opcoes.body) : null;
    const pedido = { caminho: u.pathname, busca: u.search, metodo: opcoes.method || "GET", cabecalhos: new Headers(opcoes.headers), corpo };
    pedidos.push(pedido);
    const rota = rotas[`${pedido.metodo} ${u.pathname}`] || rotas[u.pathname];
    if (!rota) return json({ message: `sem rota: ${pedido.metodo} ${u.pathname}` }, 500);
    return typeof rota === "function" ? rota(pedido) : rota.clone();
  };
  const armazem = new Map();
  const memoria = {
    getItem: (k) => armazem.get(k) ?? null,
    setItem: (k, v) => armazem.set(k, v),
    removeItem: (k) => armazem.delete(k),
    key: (i) => [...armazem.keys()][i] ?? null,
    get length() {
      return armazem.size;
    },
  };
  const contexto = {
    console: { ...console, info() {}, warn() {} },
    setTimeout: (f, ms) => {
      const t = setTimeout(f, ms);
      t.unref?.();
      return t;
    },
    clearTimeout,
    Date,
    Promise,
    location: { protocol: "https:", hash, origin: "https://demproj-fdeac.web.app", hostname: "demproj-fdeac.web.app" },
    localStorage: memoria,
    SUPABASE_CONFIG: config,
    supabase: {
      createClient: (url, chave, opcoes) =>
        createClient(url, chave, {
          ...opcoes,
          auth: { ...opcoes.auth, storage: memoria, autoRefreshToken: false, detectSessionInUrl: false },
          global: { fetch: fetchFalso },
          realtime: { transport: TransporteMudo },
        }),
    },
  };
  contexto.window = contexto;
  vm.createContext(contexto);
  for (const arquivo of ["nucleo/log-seguro.js", "nuvem/supabase-auth.js", "usuarios/user-roles.js", "nuvem/consulta.js", "nuvem/copia-local.js", "nuvem/mesclagem.js", "nuvem/acessos.js", "nuvem/supabase-persist.js"]) vm.runInContext(fs.readFileSync(pasta(arquivo), "utf8"), contexto);
  vm.runInContext("this.DemandasAuth = DemandasAuth; this.DemandasNuvem = DemandasNuvem;", contexto);
  return { DemandasAuth: contexto.DemandasAuth, DemandasNuvem: contexto.DemandasNuvem, pedidos, contexto, armazem };
}

const ROTA_LOGIN = {
  "/auth/v1/token": () => json({ access_token: TOKEN, token_type: "bearer", expires_in: 3600, expires_at: 4102444800, refresh_token: "r1", user: USUARIO }),
};

async function logado(rotas = {}) {
  const app = carregar({ rotas: { ...ROTA_LOGIN, ...rotas } });
  const vistos = [];
  await app.DemandasAuth.init((u) => vistos.push(u));
  await app.DemandasAuth.signIn("bia@x.com", "senha-boa-123");
  await new Promise((r) => setTimeout(r, 10));
  app.vistos = vistos;
  return app;
}

test("sem configuração preenchida não há cliente, e o app sabe disso", () => {
  const { DemandasAuth } = carregar({ config: { url: "https://COLOQUE-SEU-PROJETO.supabase.co", publishableKey: "COLOQUE_A_CHAVE" } });
  assert.equal(DemandasAuth.isConfigured(), false);
  assert.equal(DemandasAuth.cliente(), null);
});

test("login: envia a chave publicável, guarda a sessão e normaliza o usuário", async () => {
  const app = await logado();
  const pedido = app.pedidos.find((p) => p.caminho === "/auth/v1/token");
  assert.match(pedido.busca, /grant_type=password/);
  assert.equal(pedido.cabecalhos.get("apikey"), CHAVE);
  const u = app.DemandasAuth.currentUser();
  assert.deepEqual([u.email, u.displayName, u.id], ["bia@x.com", "Bia Projetos", USUARIO.id]);
  assert.equal(app.vistos.at(-1).email, "bia@x.com", "o app é avisado");
  assert.equal(app.vistos.filter(Boolean).length, 1, "um login, um aviso: abrir o painel duas vezes recarregaria tudo");
});

test("login recusado vira mensagem em português", async () => {
  const rotas = { "/auth/v1/token": () => json({ code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" }, 400) };
  const { DemandasAuth } = carregar({ rotas });
  await assert.rejects(DemandasAuth.signIn("a@x.com", "errada"), (e) => DemandasAuth.mapAuthError(e) === "E-mail ou senha incorretos.");
});

test("trocar senha confere a atual antes; senha atual errada não troca nada", async () => {
  const app = await logado({
    "PUT /auth/v1/user": () => json({ ...USUARIO }),
  });
  await app.DemandasAuth.updatePassword("senha-boa-123", "senha-nova-456");
  const troca = app.pedidos.find((p) => p.metodo === "PUT" && p.caminho === "/auth/v1/user");
  assert.equal(troca.corpo.password, "senha-nova-456");
  assert.equal(troca.cabecalhos.get("authorization"), `Bearer ${TOKEN}`);

  const recusa = await logado({ "PUT /auth/v1/user": () => assert.fail("não deveria trocar") });
  const original = recusa.contexto.supabase;
  void original;
  recusa.DemandasAuth.cliente().auth.signInWithPassword = async () => ({ data: {}, error: { code: "invalid_credentials", message: "x" } });
  await assert.rejects(recusa.DemandasAuth.updatePassword("errada", "senha-nova-456"), /Senha atual incorreta/);
});

test("esqueci a senha: pede o link de volta para o site", async () => {
  const app = carregar({ rotas: { "/auth/v1/recover": () => json({}) } });
  await app.DemandasAuth.sendPasswordReset(" Bia@X.com ");
  const pedido = app.pedidos.find((p) => p.caminho === "/auth/v1/recover");
  assert.equal(pedido.corpo.email, "bia@x.com");
  assert.equal(decodeURIComponent(pedido.busca), "?redirect_to=https://demproj-fdeac.web.app/");
});

test("link do e-mail: reconhece recuperação e convite antes de a biblioteca limpar o endereço", async () => {
  assert.equal(carregar({ hash: "#access_token=a&type=recovery" }).DemandasAuth.precisaDefinirSenha(), true);
  assert.equal(carregar({ hash: "#access_token=a&type=invite" }).DemandasAuth.precisaDefinirSenha(), true);
  assert.equal(carregar({ hash: "#access_token=a&type=signup" }).DemandasAuth.precisaDefinirSenha(), false);
  assert.equal(carregar().DemandasAuth.precisaDefinirSenha(), false);
  assert.match(carregar({ hash: "#error=access_denied&error_code=otp_expired" }).DemandasAuth.erroDoLink(), /expirou/);
  assert.equal(carregar().DemandasAuth.erroDoLink(), "");
  const app = await logado({ "PUT /auth/v1/user": () => json({ ...USUARIO }) });
  await app.DemandasAuth.definirNovaSenha("senha-nova-456");
  assert.equal(app.pedidos.find((p) => p.metodo === "PUT").corpo.password, "senha-nova-456");
  await assert.rejects(app.DemandasAuth.definirNovaSenha("curta"), /ao menos 8/);
});

test("chamar uma função: vai com a sessão do usuário, e o erro chega no formato que a tela entende", async () => {
  let resposta = json({ projetos: [{ gid: "1" }] });
  const app = await logado({ "/functions/v1/api": () => resposta });
  const ok = await app.DemandasNuvem.chamar("asanaProjetos", { x: 1 });
  assert.deepEqual(ok.data, { projetos: [{ gid: "1" }] });
  const pedido = app.pedidos.find((p) => p.caminho === "/functions/v1/api");
  assert.deepEqual(pedido.corpo, { acao: "asanaProjetos", dados: { x: 1 } });
  assert.equal(pedido.cabecalhos.get("authorization"), `Bearer ${TOKEN}`, "a sessão, nunca a chave");
  assert.equal(pedido.cabecalhos.get("apikey"), CHAVE);

  resposta = json({ erro: { codigo: "permission-denied", mensagem: "Só administradores podem gerar o backup." } }, 403);
  await assert.rejects(app.DemandasNuvem.chamar("backupAgora"), (e) => e.code === "functions/permission-denied" && /Só administradores/.test(e.message));

  resposta = json({ code: "NOT_FOUND", message: "Requested function was not found" }, 404);
  await assert.rejects(app.DemandasNuvem.chamar("backupAgora"), (e) => e.code === "functions/not-found");

  resposta = json({ msg: "Invalid JWT" }, 401);
  await assert.rejects(app.DemandasNuvem.chamar("backupAgora"), (e) => e.code === "functions/unauthenticated");
});

test("função sem rede: mensagem clara", async () => {
  const app = await logado({
    "/functions/v1/api": () => {
      throw new TypeError("Failed to fetch");
    },
  });
  await assert.rejects(app.DemandasNuvem.chamar("asanaProjetos"), (e) => e.code === "functions/unavailable" && /Sem conexão/.test(e.message));
});

test("sem biblioteca carregada, chamar uma função pede para recarregar em vez de quebrar", async () => {
  const app = carregar({ config: { url: "", publishableKey: "" } });
  await assert.rejects(app.DemandasNuvem.chamar("x"), /Recarregue/);
});

test("carregar e salvar pela biblioteca real: endereços, paginação, sessão e assinatura do tempo real", async () => {
  const app = await logado({
    "GET /rest/v1/demandas": () => json([{ id: "p1", dados: { titulo: "Projeto" } }]),
    "GET /rest/v1/sistema_meta": () => json([{ dados: { roles: { "bia@x.com": "projetista" }, diarias: [] } }]),
    "POST /rest/v1/rpc/demanda_salvar": () => json(null),
  });
  const recebidos = [];
  const api = await app.DemandasNuvem.init({ onData: (d) => recebidos.push(d), onStatus() {} });
  assert.equal(api.mode, "nuvem");
  assert.equal(recebidos.at(-1).demandas[0].titulo, "Projeto");
  assert.equal(api.acessosCarregados(), true);

  const leitura = app.pedidos.find((p) => p.caminho === "/rest/v1/demandas");
  assert.match(decodeURIComponent(leitura.busca), /select=id,dados/);
  assert.match(leitura.busca, /order=id/);
  assert.match(leitura.busca, /offset=0&limit=1000/);
  assert.equal(leitura.cabecalhos.get("authorization"), `Bearer ${TOKEN}`);
  const meta = app.pedidos.find((p) => p.caminho === "/rest/v1/sistema_meta");
  assert.match(meta.busca, /id=eq\.meta/);

  await api.upsertDemanda({ id: "p1", titulo: "Novo", excluidoEm: app.DemandasNuvem.APAGAR });
  const gravacao = app.pedidos.find((p) => p.caminho === "/rest/v1/rpc/demanda_salvar");
  assert.equal(gravacao.corpo.p_id, "p1");
  assert.equal(gravacao.corpo.p_campos.titulo, "Novo");
  assert.ok(gravacao.corpo.p_remover.some((c) => c.join(".") === "excluidoEm"));
  assert.equal("excluidoEm" in gravacao.corpo.p_campos, false);
  app.DemandasNuvem.teardown();
});

test("backups pela biblioteca real: lista só os .json e pede link assinado", async () => {
  const app = await logado({
    "GET /rest/v1/sistema_backups": () => json([{ info: { totalDemandas: 3 } }]),
    "POST /storage/v1/object/list/backups": () => json([{ name: "demandas-2026-11-06T06-10-00-auto.json" }, { name: ".emptyFolderPlaceholder" }]),
    "POST /storage/v1/object/sign/backups/demandas-2026-11-06T06-10-00-auto.json": () => json({ signedURL: "/object/sign/backups/x?token=abc" }),
  });
  assert.deepEqual((await app.DemandasNuvem.ultimoBackup()).totalDemandas, 3);
  const lista = await app.DemandasNuvem.listarBackups();
  assert.deepEqual(lista.map((a) => a.name), ["demandas-2026-11-06T06-10-00-auto.json"]);
  const link = await app.DemandasNuvem.linkDoBackup(lista[0].name);
  assert.match(link, /^https:\/\/teste\.supabase\.co\/storage\/v1\/object\/sign\/backups\/x\?token=abc/);
  assert.match(link, /download/);
});
