import { withSupabase } from "npm:@supabase/server@1.9.2";
import { responderApi } from "../_shared/api.mjs";

const lerAmbiente = () => ({
  SUPABASE_URL: Deno.env.get("SUPABASE_URL"),
  ASANA_TOKEN: Deno.env.get("ASANA_TOKEN"),
});

export default {
  fetch: withSupabase({ auth: "user" }, (req, ctx) =>
    responderApi(req, { usuarioId: ctx.userClaims?.id ?? "", admin: ctx.supabaseAdmin, env: lerAmbiente() })),
};
