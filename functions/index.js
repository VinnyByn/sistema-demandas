const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const { aggregateViabilidade } = require("./viabilidade");
const { gerarBackup, isAdminEmail } = require("./backup");
const asanaLib = require("./asana");

initializeApp();

const asanaToken = defineSecret("ASANA_TOKEN");

const REGION = "us-central1";
const ASANA_WEBHOOK_URL = `https://${REGION}-${process.env.GCLOUD_PROJECT || "demproj-fdeac"}.cloudfunctions.net/asanaWebhook`;

function tokenAsana() {
  const token = asanaToken.value();
  if (!token) throw new HttpsError("failed-precondition", "Token do Asana (ASANA_TOKEN) não configurado no Firebase.");
  return token;
}

/** Converte erros do Asana/validação em HttpsError com a mensagem em português. */
function erroCallable(e, padrao) {
  if (e instanceof HttpsError) return e;
  if (e instanceof asanaLib.AsanaErro) {
    // "not-found" fica reservado: no app ele significa "função não publicada".
    const code = e.status === 400 ? "invalid-argument" : e.status === 404 ? "failed-precondition" : e.status === 403 ? "permission-denied" : "unavailable";
    return new HttpsError(code, e.message);
  }
  console.error(padrao, e);
  return new HttpsError("unavailable", String(e?.message || padrao));
}

function exigirLogin(request, acao) {
  if (!request.auth) throw new HttpsError("unauthenticated", `Faça login para ${acao}.`);
}

/** Nomes dos dois projetos do Asana em que a demanda pode entrar (para o seletor do app). */
exports.asanaProjetos = onCall({ region: REGION, secrets: [asanaToken], cors: true }, async (request) => {
  exigirLogin(request, "ver os projetos do Asana");
  try {
    return { projetos: await asanaLib.nomesDosProjetos({ token: tokenAsana() }) };
  } catch (e) {
    throw erroCallable(e, "Não foi possível ler os projetos do Asana.");
  }
});

exports.createAsanaOperacao = onCall({ region: REGION, secrets: [asanaToken], cors: true }, async (request) => {
  exigirLogin(request, "enviar ao Asana");
  const demandaId = String(request.data?.demandaId || "").trim();
  if (!demandaId) throw new HttpsError("invalid-argument", "Informe a demanda.");
  const instrucoes = String(request.data?.instrucoes || "").trim();
  if (!instrucoes) throw new HttpsError("invalid-argument", "Informe as instruções do que deverá ser feito.");
  if (instrucoes.length > 4000) throw new HttpsError("invalid-argument", "As instruções devem ter no máximo 4000 caracteres.");
  try {
    return await asanaLib.criarTarefa({
      db: getFirestore(),
      token: tokenAsana(),
      demandaId,
      instrucoes,
      projetoGid: request.data?.projetoGid,
      email: request.auth.token.email || "",
      endpoint: ASANA_WEBHOOK_URL,
      novaOrdem: request.data?.novaOrdem === true,
    });
  } catch (e) {
    throw erroCallable(e, "Não foi possível criar a tarefa no Asana.");
  }
});

exports.cancelAsanaOperacao = onCall({ region: REGION, secrets: [asanaToken], cors: true }, async (request) => {
  exigirLogin(request, "cancelar no Asana");
  const demandaId = String(request.data?.demandaId || "").trim();
  if (!demandaId) throw new HttpsError("invalid-argument", "Informe a demanda.");
  try {
    return await asanaLib.cancelarTarefa({
      db: getFirestore(),
      token: tokenAsana(),
      demandaId,
      apagarCampo: () => FieldValue.delete(),
    });
  } catch (e) {
    throw erroCallable(e, "Não foi possível cancelar no Asana.");
  }
});

/** Sistema → Asana: comentário digitado (ou editado/apagado) no projeto vira comentário na tarefa. */
exports.asanaComentario = onCall({ region: REGION, secrets: [asanaToken], cors: true }, async (request) => {
  exigirLogin(request, "comentar no Asana");
  const demandaId = String(request.data?.demandaId || "").trim();
  const comentarioId = String(request.data?.comentarioId || "").trim();
  const acao = String(request.data?.acao || "");
  const texto = String(request.data?.texto || "").trim();
  if (!demandaId || !comentarioId) throw new HttpsError("invalid-argument", "Informe a demanda e o comentário.");
  if (!["criar", "editar", "apagar"].includes(acao)) throw new HttpsError("invalid-argument", "Ação inválida.");
  if (acao !== "apagar" && !texto) throw new HttpsError("invalid-argument", "Comentário vazio.");
  if (texto.length > 4000) throw new HttpsError("invalid-argument", "Comentário longo demais.");
  const autor = String(request.data?.autor || request.auth.token.name || request.auth.token.email || "Equipe").slice(0, 120);
  try {
    return await asanaLib.sincronizarComentario({ db: getFirestore(), token: tokenAsana(), demandaId, acao, comentarioId, texto, autor });
  } catch (e) {
    throw erroCallable(e, "Não foi possível enviar o comentário ao Asana.");
  }
});

/**
 * Asana → sistema. O Asana faz um "aperto de mão" (X-Hook-Secret) ao criar o webhook; depois
 * cada entrega vem assinada (X-Hook-Signature = HMAC-SHA256 do corpo com aquele segredo).
 */
exports.asanaWebhook = onRequest({ region: REGION, secrets: [asanaToken] }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("method");
    return;
  }
  const projetoGid = String(req.query.projeto || "");
  if (!asanaLib.projetoValido(projetoGid)) {
    res.status(400).send("projeto");
    return;
  }
  const db = getFirestore();
  const webhooksRef = db.doc(asanaLib.DOC_WEBHOOKS);
  const segredoNovo = req.get("X-Hook-Secret");
  if (segredoNovo) {
    if (!(await asanaLib.registrarHandshake({ db, projetoGid, segredo: segredoNovo }))) {
      res.status(403).send("handshake");
      return;
    }
    res.set("X-Hook-Secret", segredoNovo);
    res.status(200).send("");
    return;
  }
  const segredo = (await webhooksRef.get()).data()?.[projetoGid]?.secret;
  if (!asanaLib.assinaturaValida(segredo, req.rawBody, req.get("X-Hook-Signature"))) {
    res.status(401).send("assinatura");
    return;
  }
  const eventos = Array.isArray(req.body?.events) ? req.body.events : [];
  const token = asanaToken.value();
  for (const evento of eventos) {
    try {
      await asanaLib.processarEvento({ db, token, evento });
    } catch (e) {
      console.warn("Evento do Asana:", e.message || e);
    }
  }
  res.status(200).json({ ok: true });
});

const LECLERC_API = "https://george-ocon-leclerc-piastri.fastapicloud.dev";
const VIABILIDADE_CACHE_MS = 6 * 60 * 60 * 1000;
const VIABILIDADE_EXPORT = "viabilidade";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function leclercFetch(path, opts = {}) {
  const res = await fetch(`${LECLERC_API}${path}`, {
    method: opts.method || "GET",
    headers: { Accept: "application/json" },
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg = data?.detail || data?.message || data?.error || text || `HTTP ${res.status}`;
    const err = new Error(String(typeof msg === "string" ? msg : JSON.stringify(msg)));
    err.status = res.status;
    throw err;
  }
  return data;
}

function isViabilidadeReady(statusPayload) {
  const status = String(statusPayload?.status || "").toLowerCase();
  const step = String(statusPayload?.step || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return status === "done" || step.includes("conclu");
}

async function fetchViabilidadeRaw(forceExport) {
  if (!forceExport) {
    try {
      const data = await leclercFetch("/api/v1/viability");
      if (data && data.ctos) return data;
    } catch (e) {
      if (e.status && e.status !== 400 && e.status !== 404) throw e;
    }
  }

  await leclercFetch(`/api/v1/${VIABILIDADE_EXPORT}`, { method: "POST" });
  const deadline = Date.now() + 240000;
  let last = {};
  while (Date.now() < deadline) {
    await sleep(4000);
    last = await leclercFetch(`/api/v1/${VIABILIDADE_EXPORT}/status`);
    if (isViabilidadeReady(last)) break;
    const st = String(last?.status || last?.step || "").toLowerCase();
    if (st.includes("fail") || st.includes("error") || st.includes("erro")) {
      throw new Error("A exportação de viabilidade falhou na API Leclerc.");
    }
  }
  if (!isViabilidadeReady(last)) {
    throw new Error("A exportação de viabilidade não concluiu a tempo. Tente de novo em alguns minutos.");
  }
  const data = await leclercFetch("/api/v1/viability");
  if (!data || !data.ctos) {
    throw new Error("A API Leclerc não devolveu os dados de viabilidade.");
  }
  return data;
}

exports.getViabilidadePortas = onCall(
  { region: REGION, cors: true, timeoutSeconds: 300, memory: "1GiB" },
  async (request) => {
    try {
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "Faça login para ver a viabilidade.");
      }
      const force = Boolean(request.data?.force);
      const db = getFirestore();
      const ref = db.doc("demandasSistema/viabilidadePortas");
      if (!force) {
        const snap = await ref.get();
        const cached = snap.data() || {};
        const fetchedAt = String(cached.fetchedAt || "");
        const age = fetchedAt ? Date.now() - Date.parse(fetchedAt) : Number.POSITIVE_INFINITY;
        if (cached.payload && Number.isFinite(age) && age >= 0 && age < VIABILIDADE_CACHE_MS) {
          return { ...cached.payload, cached: true, fetchedAt };
        }
      }

      const raw = await fetchViabilidadeRaw(force);
      const payload = aggregateViabilidade(raw);
      const fetchedAt = new Date().toISOString();
      await ref.set({ payload, fetchedAt }, { merge: true });
      return { ...payload, cached: false, fetchedAt };
    } catch (e) {
      if (e instanceof HttpsError) throw e;
      console.error("getViabilidadePortas", e);
      throw new HttpsError("unavailable", String(e?.message || "Não foi possível carregar a viabilidade."));
    }
  },
);

/** Backup diário (03:10, horário de Brasília) de todos os projetos e do doc meta no Storage. */
exports.backupDiario = onSchedule(
  { schedule: "10 3 * * *", timeZone: "America/Sao_Paulo", region: REGION, memory: "512MiB", timeoutSeconds: 300 },
  async () => {
    const info = await gerarBackup({ motivo: "agendado" });
    console.log("Backup diário gerado", info);
  },
);

/** Backup sob demanda (botão no app) — só administradores. */
exports.backupAgora = onCall({ region: REGION, memory: "512MiB", timeoutSeconds: 300 }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Faça login para gerar o backup.");
  const email = request.auth.token.email || "";
  if (!(await isAdminEmail(email))) throw new HttpsError("permission-denied", "Só administradores geram backup.");
  try {
    return await gerarBackup({ motivo: "manual", autor: email });
  } catch (e) {
    console.error("backupAgora", e);
    throw new HttpsError("internal", String(e?.message || "Falha ao gerar o backup."));
  }
});
