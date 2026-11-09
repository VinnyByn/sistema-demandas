import { withSupabase } from "npm:@supabase/server@1.9.2";
import { responderWebhookAsana } from "../_shared/asana-webhook.mjs";

// Sem login de propósito (quem chama é o Asana): a autenticação é a assinatura conferida em responderWebhookAsana.
export default {
  fetch: withSupabase({ auth: "none" }, (req, ctx) =>
    responderWebhookAsana(req, { admin: ctx.supabaseAdmin, token: Deno.env.get("ASANA_TOKEN") ?? "" })),
};
