import { timingSafeEqual } from "node:crypto";
import { withSupabase } from "npm:@supabase/server@1.9.2";
import { gerarBackup } from "../_shared/backup.mjs";

function segredoConfere(recebido: string | null, esperado: string | undefined) {
  if (!recebido || !esperado) return false;
  const bytesRecebidos = new TextEncoder().encode(recebido);
  const bytesEsperados = new TextEncoder().encode(esperado);
  return bytesRecebidos.length === bytesEsperados.length && timingSafeEqual(bytesRecebidos, bytesEsperados);
}

// Quem chama é o agendador do banco, com um segredo próprio (ver a migration de agendamento).
export default {
  fetch: withSupabase({ auth: "none" }, async (req, ctx) => {
    if (!segredoConfere(req.headers.get("x-backup-segredo"), Deno.env.get("BACKUP_CRON_SEGREDO"))) {
      return new Response("segredo", { status: 401 });
    }
    try {
      return Response.json(await gerarBackup({ admin: ctx.supabaseAdmin, motivo: "agendado" }));
    } catch (erro) {
      console.error("backup-diario", erro);
      return new Response("falha", { status: 500 });
    }
  }),
};
