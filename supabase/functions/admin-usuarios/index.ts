// Edge Function: administração de usuários (só administradores do sistema).
// Usa a chave de serviço, que fica apenas no servidor do Supabase.
//
//   supabase functions deploy admin-usuarios
//
// Corpo: { acao: "criar", email, senha } → { existia: boolean, usuario?: { id, email } }
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function resposta(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resposta({ erro: "Use POST." }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const servico = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const autorizacao = req.headers.get("Authorization") || "";

  // Quem chamou é administrador? (mesma regra do banco: função eh_admin)
  const comoUsuario = createClient(url, anon, {
    global: { headers: { Authorization: autorizacao } },
    auth: { persistSession: false },
  });
  const { data: ehAdmin, error: erroAdmin } = await comoUsuario.rpc("eh_admin");
  if (erroAdmin) return resposta({ erro: "Sessão inválida. Entre de novo." }, 401);
  if (!ehAdmin) return resposta({ erro: "Só administradores criam usuários." }, 403);

  let corpo: { acao?: string; email?: string; senha?: string };
  try {
    corpo = await req.json();
  } catch {
    return resposta({ erro: "Corpo inválido." }, 400);
  }

  if (corpo.acao !== "criar") return resposta({ erro: "Ação desconhecida." }, 400);
  const email = String(corpo.email || "").trim().toLowerCase();
  const senha = String(corpo.senha || "");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return resposta({ erro: "E-mail inválido." }, 400);
  if (senha.length < 6) return resposta({ erro: "A senha deve ter ao menos 6 caracteres." }, 400);

  const admin = createClient(url, servico, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (error) {
    const msg = String(error.message || "");
    if ((error as { code?: string }).code === "email_exists" || /already (been )?registered|already exists/i.test(msg)) {
      return resposta({ existia: true });
    }
    if (/password/i.test(msg)) return resposta({ erro: "Senha fraca. Use ao menos 6 caracteres." }, 400);
    return resposta({ erro: msg || "Não foi possível criar o usuário." }, 500);
  }
  return resposta({ existia: false, usuario: { id: data.user?.id, email: data.user?.email } });
});
