// Responde pelo Supabase dentro do Playwright: a biblioteca oficial no navegador fala HTTP e as regras rodam no banco real de teste (PGlite),
// no papel de quem chamou. É uma tradução simples do PostgREST e do Auth: não prova o comportamento deles, só o das nossas regras e do app.
const fs = require("node:fs");
const path = require("node:path");

const BASE = "https://teste.supabase.co";
const BIBLIOTECA = fs.readFileSync(path.join(__dirname, "../../node_modules/@supabase/supabase-js/dist/umd/supabase.js"));
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
const lerToken = (token) => JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());

async function criarSupabaseFalso({ senhas }) {
  const { criarBancoDeTeste } = await import("../unit/helpers/supabase-pglite.mjs");
  const { responderApi } = await import("../../supabase/functions/_shared/api.mjs");
  const banco = await criarBancoDeTeste();
  const metadados = new Map();
  const chamadasAsana = [];
  const configAuth = { disable_signup: true, mailer_autoconfirm: false, external: { email: true, anonymous_users: false } };

  const usuarioDe = async (email) => ({
    id: await banco.idDoUsuario(email),
    aud: "authenticated",
    role: "authenticated",
    email,
    email_confirmed_at: "2026-01-01T00:00:00Z",
    app_metadata: { provider: "email" },
    user_metadata: metadados.get(email) || {},
  });
  const sessaoDe = async (email) => {
    const user = await usuarioDe(email);
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const claims = { sub: user.id, email, role: "authenticated", aud: "authenticated", exp, user_metadata: user.user_metadata };
    return { access_token: `${b64({ alg: "HS256", typ: "JWT" })}.${b64(claims)}.assinatura`, token_type: "bearer", expires_in: 3600, expires_at: exp, refresh_token: `r-${email}`, user };
  };

  const authAdmin = {
    async createUser({ email, user_metadata }) {
      const achado = await banco.db.query(`select id from auth.users where email = $1`, [email]);
      if (achado.rows[0]) return { data: null, error: { code: "email_exists", message: "existe" } };
      await banco.idDoUsuario(email);
      if (user_metadata) metadados.set(email, user_metadata);
      return { data: { user: { email } }, error: null };
    },
    async listUsers() {
      const { rows } = await banco.db.query(`select email, null as created_at from auth.users`);
      return { data: { users: rows, nextPage: null }, error: null };
    },
  };
  const fetchAsana = async (url, opcoes = {}) => {
    chamadasAsana.push({ metodo: opcoes.method || "GET", caminho: new URL(url).pathname.replace("/api/1.0", "") });
    return { ok: true, status: 200, text: async () => JSON.stringify({ data: {} }) };
  };

  const json = (status, corpo) => ({ status, headers: { ...CORS, "content-type": "application/json" }, body: corpo === undefined ? "" : JSON.stringify(corpo) });
  const erroBanco = (papel, erro) => json(erro.code === "42501" ? (papel === "anon" ? 401 : 403) : 400, { code: erro.code, message: erro.message, details: null, hint: null });

  function filtrosDe(url) {
    const valores = [];
    const partes = [];
    for (const [coluna, valor] of url.searchParams) {
      if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(coluna)) continue;
      if (!/^[a-z_]+$/.test(coluna)) throw Object.assign(new Error("coluna inválida"), { code: "42703" });
      if (valor.startsWith("eq.")) {
        valores.push(valor.slice(3));
        partes.push(`${coluna} = $${valores.length}`);
      } else if (valor.startsWith("in.(")) {
        valores.push(valor.slice(4, -1).split(",").map((v) => v.replace(/^"|"$/g, "")));
        partes.push(`${coluna} = any($${valores.length})`);
      }
    }
    return { valores, onde: partes.length ? ` where ${partes.join(" and ")}` : "" };
  }

  async function tabela(pedido, url, papel, claims, nome) {
    const corpo = pedido.postData() ? JSON.parse(pedido.postData()) : null;
    const metodo = pedido.method();
    const { valores, onde } = filtrosDe(url);
    if (metodo === "GET" || metodo === "HEAD") {
      const colunas = url.searchParams.get("select") || "*";
      const [ordem, sentido] = (url.searchParams.get("order") || "").split(".");
      const sql = `select ${colunas.replace(/[^\w,*]/g, "")} from public.${nome}${onde}${ordem ? ` order by ${ordem} ${sentido === "desc" ? "desc" : "asc"}` : ""}${url.searchParams.get("limit") ? ` limit ${Number(url.searchParams.get("limit"))}` : ""}${url.searchParams.get("offset") ? ` offset ${Number(url.searchParams.get("offset"))}` : ""}`;
      const { rows } = await banco.sqlComo(papel, claims, sql, valores);
      if (String(pedido.headers().accept).includes("vnd.pgrst.object")) return rows[0] ? json(200, rows[0]) : json(406, { code: "PGRST116", message: "sem linhas" });
      return json(200, rows);
    }
    if (metodo === "DELETE") await banco.sqlComo(papel, claims, `delete from public.${nome}${onde}`, valores);
    if (metodo === "PATCH") await banco.sqlComo(papel, claims, `update public.${nome} set ${Object.keys(corpo).map((k, i) => `${k} = $${valores.length + i + 1}`).join(", ")}${onde}`, [...valores, ...Object.values(corpo).map((v) => (typeof v === "string" ? v : JSON.stringify(v)))]);
    if (metodo === "POST") {
      const linha = Array.isArray(corpo) ? corpo[0] : corpo;
      await banco.sqlComo(papel, claims, `insert into public.${nome} (${Object.keys(linha).join(", ")}) values (${Object.keys(linha).map((_, i) => `$${i + 1}`).join(", ")})`, Object.values(linha).map((v) => (typeof v === "string" ? v : JSON.stringify(v))));
    }
    return json(204);
  }

  async function funcaoSql(pedido, papel, claims, nome) {
    const args = pedido.postData() ? JSON.parse(pedido.postData()) : {};
    const valores = [];
    const parametros = Object.entries(args).map(([chave, valor]) => {
      if (valor === null || valor === undefined) return `${chave} => null`;
      valores.push(typeof valor === "string" ? valor : JSON.stringify(valor));
      return `${chave} => $${valores.length}${typeof valor === "string" ? "" : "::jsonb"}`;
    });
    const { rows } = await banco.sqlComo(papel, claims, `select public.${nome}(${parametros.join(", ")}) as data`, valores);
    const dado = rows[0]?.data;
    return dado === undefined ? json(204) : json(200, dado);
  }

  async function auth(pedido, url, claims) {
    const caminho = url.pathname.replace("/auth/v1", "");
    const corpo = pedido.postData() ? JSON.parse(pedido.postData()) : {};
    if (caminho === "/token") {
      if (senhas[corpo.email] !== corpo.password) return json(400, { code: "invalid_credentials", message: "Invalid login credentials" });
      return json(200, await sessaoDe(corpo.email));
    }
    if (caminho === "/settings") return json(200, configAuth);
    if (caminho === "/signup") return json(422, { code: "signup_disabled", message: "Signups not allowed for this instance" });
    if (caminho === "/logout") return json(204);
    if (caminho === "/user" && claims) {
      if (pedido.method() === "PUT" && corpo.data) {
        const juntos = { ...(metadados.get(claims.email) || {}), ...corpo.data };
        metadados.set(claims.email, Object.fromEntries(Object.entries(juntos).filter(([, v]) => v !== null)));
      }
      return json(200, await usuarioDe(claims.email));
    }
    return json(404, { message: "sem rota" });
  }

  async function responder(pedido) {
    const url = new URL(pedido.url());
    if (pedido.method() === "OPTIONS") return { status: 204, headers: CORS, body: "" };
    const token = String(pedido.headers().authorization || "").replace(/^Bearer /, "");
    const claims = token.split(".").length === 3 ? lerToken(token) : null;
    const papel = claims ? "authenticated" : "anon";
    const banco_claims = claims || { role: "anon" };
    try {
      if (url.pathname.startsWith("/auth/v1")) return await auth(pedido, url, claims);
      if (url.pathname === "/functions/v1/api") {
        if (!claims) return json(401, { message: "Sem autenticação" });
        const req = new Request(url, { method: "POST", body: pedido.postData() });
        const res = await responderApi(req, { usuarioId: claims.sub, admin: { ...banco.clienteServidor(), auth: { admin: authAdmin } }, env: { SUPABASE_URL: BASE, ASANA_TOKEN: "t" }, fetchImpl: fetchAsana });
        return json(res.status, await res.json());
      }
      if (url.pathname.startsWith("/rest/v1/rpc/")) return await funcaoSql(pedido, papel, banco_claims, url.pathname.split("/").pop());
      if (url.pathname.startsWith("/rest/v1/")) return await tabela(pedido, url, papel, banco_claims, url.pathname.split("/").pop());
      if (url.pathname.startsWith("/storage/v1/object/list/")) {
        const { rows } = await banco.sqlComo(papel, banco_claims, `select name from storage.objects where bucket_id = 'backups'`);
        return json(200, rows);
      }
      return json(404, { message: "sem rota" });
    } catch (erro) {
      return erroBanco(papel, erro);
    }
  }

  /** Liga a página a este Supabase, com a biblioteca oficial (a integridade do index.html é conferida pelo navegador). */
  async function ligar(page) {
    await page.route(/gstatic|cdnjs|googleapis/, (r) => r.abort());
    await page.route("https://cdn.jsdelivr.net/**", (r) =>
      r.request().url().includes("supabase-js") ? r.fulfill({ contentType: "text/javascript", headers: CORS, body: BIBLIOTECA }) : r.abort(),
    );
    await page.route("**/supabase-config.js", (r) =>
      r.fulfill({ contentType: "text/javascript", body: `window.SUPABASE_CONFIG = { url: "${BASE}", publishableKey: "sb_publishable_teste" };` }),
    );
    await page.route(`${BASE}/**`, async (r) => r.fulfill(await responder(r.request())));
    await page.routeWebSocket(/supabase\.co/, () => {});
  }

  return { banco, ligar, chamadasAsana, metadados, configAuth };
}

module.exports = { criarSupabaseFalso };
