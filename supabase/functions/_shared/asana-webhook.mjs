// Asana → sistema. Ao criar o webhook, o Asana faz um "aperto de mão" (X-Hook-Secret); depois, cada entrega vem assinada.
import { assinaturaValida, processarEvento, projetoValido, registrarHandshake, segredoDoWebhook } from "./asana/index.mjs";
import { criarRepositorioSupabase } from "./asana/repositorio-supabase.mjs";

const recusar = (motivo, status) => new Response(motivo, { status });

async function responderApertoDeMao({ repositorio, projetoGid, segredo }) {
  const aceito = await registrarHandshake({ repositorio, projetoGid, segredo });
  if (!aceito) return recusar("handshake", 403);
  return new Response("", { status: 200, headers: { "X-Hook-Secret": segredo } });
}

function lerEventos(corpoBruto) {
  const corpo = JSON.parse(new TextDecoder().decode(corpoBruto));
  return Array.isArray(corpo?.events) ? corpo.events : [];
}

/** Um evento com problema não pode impedir os seguintes: o Asana entrega vários no mesmo pedido. */
async function processarEventos({ eventos, repositorio, token, fetchImpl }) {
  for (const evento of eventos) {
    try {
      await processarEvento({ repositorio, token, fetchImpl, evento });
    } catch (erro) {
      console.warn("Evento do Asana:", erro?.message || erro);
    }
  }
}

async function responderWebhookAsana(req, { admin, token, fetchImpl = undefined }) {
  if (req.method !== "POST") return recusar("method", 405);

  const projetoGid = new URL(req.url).searchParams.get("projeto") || "";
  if (!projetoValido(projetoGid)) return recusar("projeto", 400);

  const repositorio = criarRepositorioSupabase(admin);
  const segredoNovo = req.headers.get("X-Hook-Secret");
  if (segredoNovo) return responderApertoDeMao({ repositorio, projetoGid, segredo: segredoNovo });

  // A assinatura é sobre os bytes recebidos: remontar o JSON mudaria o conteúdo e recusaria entregas legítimas.
  const corpoBruto = new Uint8Array(await req.arrayBuffer());
  const segredo = await segredoDoWebhook({ repositorio, projetoGid });
  if (!assinaturaValida(segredo, corpoBruto, req.headers.get("X-Hook-Signature"))) return recusar("assinatura", 401);

  let eventos;
  try {
    eventos = lerEventos(corpoBruto);
  } catch {
    return recusar("corpo", 400);
  }
  await processarEventos({ eventos, repositorio, token, fetchImpl });
  return Response.json({ ok: true });
}

export { responderWebhookAsana };
