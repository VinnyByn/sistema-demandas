// Edge Functions de verdade, no runtime Deno e com o @supabase/server real: autenticação por JWT assinado, CORS e o que o
// cliente administrador envia. Só a rede até o banco é falsa. Rodar: npm run test:deno (na pasta tests).
import { assertEquals, assert, assertMatch } from "jsr:@std/assert@1";
import { generateKeyPair, exportJWK, SignJWT } from "npm:jose@5";
import { createHmac } from "node:crypto";

const { publicKey, privateKey } = await generateKeyPair("ES256");
const jwk = { ...(await exportJWK(publicKey)), kid: "chave-teste", alg: "ES256", use: "sig" };

Deno.env.set("SUPABASE_URL", "https://teste.supabase.co");
Deno.env.set("SUPABASE_SECRET_KEYS", JSON.stringify({ default: "sb_secret_teste" }));
Deno.env.set("SUPABASE_PUBLISHABLE_KEYS", JSON.stringify({ default: "sb_publishable_teste" }));
Deno.env.set("SUPABASE_JWKS", JSON.stringify({ keys: [jwk] }));
Deno.env.set("ASANA_TOKEN", "");
Deno.env.set("BACKUP_CRON_SEGREDO", "segredo-do-cron");

const pedidos: { url: string; headers: Headers }[] = [];
const emailPorId = new Map<string, string>();
let registroWebhook: unknown = {};
let meta: unknown = { roles: { "bia@x.com": "projetista", "ana@x.com": "admin" } };
const fetchOriginal = globalThis.fetch;
globalThis.fetch = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
  const pedido = new Request(entrada as RequestInfo, init);
  pedidos.push({ url: pedido.url, headers: pedido.headers });
  const caminho = new URL(pedido.url).pathname;
  if (caminho === "/rest/v1/rpc/acesso_email_de") return Response.json(emailPorId.get((await pedido.clone().json()).p_usuario) ?? null);
  if (caminho === "/rest/v1/sistema_meta") return Response.json([{ dados: meta }]);
  if (caminho === "/rest/v1/rpc/asana_buscar_webhook") return Response.json(registroWebhook);
  if (caminho === "/rest/v1/rpc/asana_mesclar_webhook") return new Response(null, { status: 204 });
  return new Response(JSON.stringify({ message: "sem rota" }), { status: 500 });
}) as typeof fetch;

const { default: api } = await import("../../supabase/functions/api/index.ts");
const { default: webhook } = await import("../../supabase/functions/asana-webhook/index.ts");
const { default: backup } = await import("../../supabase/functions/backup-diario/index.ts");

const jwt = (email: string, exp = "1h") => {
  const sub = crypto.randomUUID();
  emailPorId.set(sub, email);
  return new SignJWT({ sub, email, role: "authenticated", aud: "authenticated" })
    .setProtectedHeader({ alg: "ES256", kid: "chave-teste" })
    .setIssuer("https://teste.supabase.co/auth/v1")
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(privateKey);
};

const chamarApi = async (token: string | null, corpo: unknown) =>
  await api.fetch(
    new Request("https://teste.supabase.co/functions/v1/api", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(corpo),
    }),
  );

const opcoes = { sanitizeOps: false, sanitizeResources: false };

Deno.test({
  name: "api: navegador consegue fazer o preflight de CORS, e respostas levam o cabeçalho",
  ...opcoes,
  fn: async () => {
    const res = await api.fetch(new Request("https://teste.supabase.co/functions/v1/api", { method: "OPTIONS", headers: { Origin: "https://demproj-fdeac.web.app", "Access-Control-Request-Method": "POST" } }));
    await res.text();
    assert(res.status < 300, `preflight respondeu ${res.status}`);
    assert(res.headers.get("access-control-allow-origin"));
    assertMatch(String(res.headers.get("access-control-allow-headers")).toLowerCase(), /authorization/);
    assertMatch(String(res.headers.get("access-control-allow-headers")).toLowerCase(), /apikey/);
    const comErro = await chamarApi(null, { acao: "asanaProjetos" });
    await comErro.text();
    assert(comErro.headers.get("access-control-allow-origin"), "até o erro precisa de CORS, senão o navegador esconde a mensagem");
  },
});

Deno.test({
  name: "api: sem sessão, com token inválido ou vencido não entra",
  ...opcoes,
  fn: async () => {
    const semToken = await chamarApi(null, { acao: "naoExiste" });
    await semToken.text();
    assertEquals(semToken.status, 401);
    const falso = await chamarApi("nao.e.jwt", { acao: "naoExiste" });
    await falso.text();
    assertEquals(falso.status, 401);
    const vencido = await chamarApi(await jwt("bia@x.com", "-1h"), { acao: "naoExiste" });
    await vencido.text();
    assertEquals(vencido.status, 401);
    const outraChave = await new SignJWT({ sub: "x", email: "ana@x.com", role: "authenticated", aud: "authenticated" })
      .setProtectedHeader({ alg: "ES256", kid: "chave-teste" })
      .setExpirationTime("1h")
      .sign((await generateKeyPair("ES256")).privateKey);
    const forjado = await chamarApi(outraChave, { acao: "naoExiste" });
    await forjado.text();
    assertEquals(forjado.status, 401, "assinatura de outra chave");
  },
});

Deno.test({
  name: "api: com sessão válida, o e-mail do token decide o acesso e o banco é lido com a chave secreta no apikey",
  ...opcoes,
  fn: async () => {
    const desconhecida = await chamarApi(await jwt("bia@x.com"), { acao: "naoExiste" });
    assertEquals(desconhecida.status, 404);
    assertEquals((await desconhecida.json()).erro.codigo, "not-found");

    pedidos.length = 0;
    const semPermissao = await chamarApi(await jwt("bia@x.com"), { acao: "backupAgora" });
    assertEquals(semPermissao.status, 403);
    assertMatch((await semPermissao.json()).erro.mensagem, /Só administradores/);
    const leitura = pedidos.find((p) => new URL(p.url).pathname === "/rest/v1/sistema_meta");
    assert(leitura, "leu o meta");
    assertEquals(leitura.headers.get("apikey"), "sb_secret_teste");

    const estranho = await chamarApi(await jwt("estranho@x.com"), { acao: "asanaProjetos" });
    assertEquals(estranho.status, 403);
    assertMatch((await estranho.json()).erro.mensagem, /não tem acesso/);

    const semToken = await chamarApi(await jwt("ana@x.com"), { acao: "asanaProjetos" });
    assertEquals(semToken.status, 412);
    assertMatch((await semToken.json()).erro.mensagem, /ASANA_TOKEN/);
  },
});

Deno.test({
  name: "webhook do Asana: abre sem login, mas recusa método e projeto errados (a assinatura está em api.test.mjs)",
  ...opcoes,
  fn: async () => {
    const metodo = await webhook.fetch(new Request("https://teste.supabase.co/functions/v1/asana-webhook?projeto=1219543786224599"));
    await metodo.text();
    assertEquals(metodo.status, 405);
    const projeto = await webhook.fetch(new Request("https://teste.supabase.co/functions/v1/asana-webhook?projeto=999", { method: "POST", body: "{}" }));
    await projeto.text();
    assertEquals(projeto.status, 400);
  },
});

Deno.test({
  name: "webhook do Asana pelo pacote oficial: o aperto de mão devolve o segredo e a assinatura confere nos bytes recebidos",
  ...opcoes,
  fn: async () => {
    const endereco = "https://teste.supabase.co/functions/v1/asana-webhook?projeto=1219543786224599";
    registroWebhook = { handshakeAte: Date.now() + 60000 };
    const aperto = await webhook.fetch(new Request(endereco, { method: "POST", headers: { "X-Hook-Secret": "do-asana" } }));
    await aperto.text();
    assertEquals(aperto.status, 200);
    assertEquals(aperto.headers.get("X-Hook-Secret"), "do-asana");

    registroWebhook = { secret: "s3gredo" };
    const corpo = '{ "events":   [],  "obs": "coração" }';
    const assinatura = createHmac("sha256", "s3gredo").update(new TextEncoder().encode(corpo)).digest("hex");
    const certa = await webhook.fetch(new Request(endereco, { method: "POST", headers: { "X-Hook-Signature": assinatura }, body: corpo }));
    await certa.text();
    assertEquals(certa.status, 200);
    const errada = await webhook.fetch(new Request(endereco, { method: "POST", headers: { "X-Hook-Signature": "falsa" }, body: corpo }));
    await errada.text();
    assertEquals(errada.status, 401);
  },
});

Deno.test({
  name: "backup agendado: sem o segredo certo não roda",
  ...opcoes,
  fn: async () => {
    pedidos.length = 0;
    for (const cabecalhos of [{}, { "x-backup-segredo": "errado" }] as Record<string, string>[]) {
      const res = await backup.fetch(new Request("https://teste.supabase.co/functions/v1/backup-diario", { method: "POST", headers: cabecalhos, body: "{}" }));
      await res.text();
      assertEquals(res.status, 401);
    }
    assertEquals(pedidos.length, 0, "nem tocou no banco");
  },
});

globalThis.addEventListener("unload", () => {
  globalThis.fetch = fetchOriginal;
});
