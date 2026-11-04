const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const { aggregateViabilidade } = require("./viabilidade");
const { gerarBackup } = require("./backup");
const { lerAcesso, normalizarEmail } = require("./acesso");
const { criarContaLogin, listarContasLogin } = require("./contas");
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

/**
 * Confere no servidor (doc meta) se quem chamou pode fazer a ação — a tela sozinha não basta.
 * nivel: "acesso" (está no mapa e não foi removido) | "escrita" (e não é somente leitura) | "admin".
 * @returns o acesso do usuário (inclui o nome de exibição salvo pelo admin).
 */
async function exigirNivel(request, nivel, acao) {
  if (!request.auth) throw new HttpsError("unauthenticated", `Faça login para ${acao}.`);
  const acesso = await lerAcesso(request.auth.token.email || "", getFirestore());
  if (!acesso.temAcesso) throw new HttpsError("permission-denied", "Seu e-mail não tem acesso ao sistema.");
  if (nivel === "admin" && !acesso.admin) throw new HttpsError("permission-denied", `Só administradores podem ${acao}.`);
  if (nivel === "escrita" && !acesso.podeEscrever) {
    throw new HttpsError(
      "permission-denied",
      acesso.desabilitado ? "Sua conta está desabilitada." : `Seu perfil é somente leitura: não dá para ${acao}.`,
    );
  }
  return acesso;
}

/** Nomes dos dois projetos do Asana em que a demanda pode entrar (para o seletor do app). */
exports.asanaProjetos = onCall({ region: REGION, secrets: [asanaToken], cors: true }, async (request) => {
  await exigirNivel(request, "acesso", "ver os projetos do Asana");
  try {
    const token = tokenAsana();
    // Aproveita para atualizar os webhooks (ex.: novos avisos de coluna/conclusão/exclusão).
    await Promise.all(
      asanaLib.ASANA_PROJETOS.map((p) =>
        asanaLib.garantirWebhook({ db: getFirestore(), token, projetoGid: p.gid, endpoint: ASANA_WEBHOOK_URL }).catch((e) =>
          console.warn("Webhook Asana:", e.message || e),
        ),
      ),
    );
    return { projetos: await asanaLib.nomesDosProjetos({ token }) };
  } catch (e) {
    throw erroCallable(e, "Não foi possível ler os projetos do Asana.");
  }
});

exports.createAsanaOperacao = onCall({ region: REGION, secrets: [asanaToken], cors: true }, async (request) => {
  await exigirNivel(request, "escrita", "enviar ao Asana");
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
  await exigirNivel(request, "escrita", "cancelar no Asana");
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

/** Anexa um arquivo (PDF, Word, imagem…) na tarefa do Asana; um arquivo por chamada. */
exports.asanaAnexar = onCall({ region: REGION, secrets: [asanaToken], cors: true, timeoutSeconds: 120, memory: "512MiB" }, async (request) => {
  const acesso = await exigirNivel(request, "escrita", "anexar no Asana");
  const demandaId = String(request.data?.demandaId || "").trim();
  if (!demandaId) throw new HttpsError("invalid-argument", "Informe a demanda.");
  try {
    return await asanaLib.anexarArquivo({
      db: getFirestore(),
      token: tokenAsana(),
      demandaId,
      nome: request.data?.nome,
      tipo: request.data?.tipo,
      base64: request.data?.base64,
      // Nome de quem está logado (não o que o navegador mandar), para ninguém assinar por outro.
      autor: acesso.nome.slice(0, 120),
    });
  } catch (e) {
    throw erroCallable(e, "Não foi possível anexar no Asana.");
  }
});

/** Sistema → Asana: comentário digitado (ou editado/apagado) no projeto vira comentário na tarefa. */
exports.asanaComentario = onCall({ region: REGION, secrets: [asanaToken], cors: true }, async (request) => {
  const acesso = await exigirNivel(request, "escrita", "comentar no Asana");
  const demandaId = String(request.data?.demandaId || "").trim();
  const comentarioId = String(request.data?.comentarioId || "").trim();
  const acao = String(request.data?.acao || "");
  const texto = String(request.data?.texto || "").trim();
  if (!demandaId || !comentarioId) throw new HttpsError("invalid-argument", "Informe a demanda e o comentário.");
  if (!["criar", "editar", "apagar"].includes(acao)) throw new HttpsError("invalid-argument", "Ação inválida.");
  if (acao !== "apagar" && !texto) throw new HttpsError("invalid-argument", "Comentário vazio.");
  if (texto.length > 4000) throw new HttpsError("invalid-argument", "Comentário longo demais.");
  // Autor vem do servidor: o nome salvo pelo admin (ou o do e-mail) de quem está logado.
  const autor = (acesso.nome || "Equipe").slice(0, 120);
  try {
    return await asanaLib.sincronizarComentario({
      db: getFirestore(),
      token: tokenAsana(),
      demandaId,
      acao,
      comentarioId,
      texto,
      autor,
      email: acesso.email,
      admin: acesso.admin,
    });
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
      await asanaLib.processarEvento({ db, token, evento, apagarCampo: () => FieldValue.delete() });
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
      const acesso = await exigirNivel(request, "acesso", "ver a viabilidade");
      const force = Boolean(request.data?.force);
      // Forçar dispara a exportação inteira na API Leclerc (cara): só administradores.
      if (force && !acesso.admin) throw new HttpsError("permission-denied", "Só administradores podem forçar a atualização da viabilidade.");
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
  const acesso = await exigirNivel(request, "admin", "gerar o backup");
  try {
    return await gerarBackup({ motivo: "manual", autor: acesso.email });
  } catch (e) {
    console.error("backupAgora", e);
    throw new HttpsError("internal", String(e?.message || "Falha ao gerar o backup."));
  }
});

/**
 * Cria o login (Firebase Auth) de um usuário novo — só administradores, conferido no servidor.
 * Substitui o cadastro feito no navegador, para o cadastro público do Firebase poder ficar desligado.
 * Sem senha: cria com uma senha aleatória e o app manda o e-mail para a pessoa definir a dela.
 */
exports.criarContaLogin = onCall({ region: REGION, cors: true }, async (request) => {
  const acesso = await exigirNivel(request, "admin", "criar contas");
  try {
    return await criarContaLogin({
      auth: getAuth(),
      email: normalizarEmail(request.data?.email),
      senha: request.data?.senha,
      nome: request.data?.nome,
      autor: acesso.email,
    });
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    if (e?.codigo === "invalid-argument") throw new HttpsError("invalid-argument", e.message);
    console.error("criarContaLogin", e);
    throw new HttpsError("internal", String(e?.message || "Não foi possível criar a conta."));
  }
});

/** Situação do login (existe, último acesso) de cada conta da lista de papéis — só administradores. */
exports.listarContasLogin = onCall({ region: REGION, cors: true }, async (request) => {
  await exigirNivel(request, "admin", "ver as contas de login");
  const meta = (await getFirestore().doc("demandasSistema/meta").get()).data() || {};
  try {
    return { contas: await listarContasLogin({ auth: getAuth(), emails: Object.keys(meta.roles || {}) }) };
  } catch (e) {
    console.error("listarContasLogin", e);
    throw new HttpsError("internal", String(e?.message || "Não foi possível ler as contas de login."));
  }
});
