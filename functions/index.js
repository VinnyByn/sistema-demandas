const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { aggregateViabilidade } = require("./viabilidade");

initializeApp();

const clickupToken = defineSecret("CLICKUP_TOKEN");

const CLICKUP_TEAM_ID = "90171462966";
const CLICKUP_LIST_ID = "901716986422";
const CLICKUP_API = "https://api.clickup.com/api/v2";
const APP_URL = "https://demproj-fdeac.web.app";
const REGION = "us-central1";

const STATUS_NOVA = ["nova demanda", "pendente", "to do", "open"];
const STATUS_CONCLUSAO = ["conclusao", "conclusão", "concluido", "concluído", "complete", "closed", "done"];

function normStatus(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isStatusConclusao(s) {
  const n = normStatus(s);
  return STATUS_CONCLUSAO.some((x) => n === normStatus(x) || n.includes("conclus") || n.includes("conclu"));
}

async function clickupFetch(token, path, opts = {}) {
  const headers = { Authorization: token, Accept: "application/json" };
  if (opts.body) headers["Content-Type"] = "application/json";
  const res = await fetch(`${CLICKUP_API}${path}`, {
    method: opts.method || "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    if ((opts.okStatuses || []).includes(res.status)) return { ...data, __status: res.status };
    const msg = data?.err || data?.error || data?.ECODE || text || `HTTP ${res.status}`;
    const err = new Error(String(msg));
    err.status = res.status;
    throw err;
  }
  return data;
}

function parseClickupTaskId(value) {
  const s = String(value || "").trim();
  if (!s) return "";
  const fromUrl = s.match(/\/t\/(?:id\/)?([a-zA-Z0-9]+)/i);
  if (fromUrl) return fromUrl[1];
  if (/^[a-zA-Z0-9]{6,}$/i.test(s)) return s;
  return "";
}

async function getClickupTask(token, taskId) {
  try {
    const data = await clickupFetch(token, `/task/${taskId}`);
    return data && data.id ? data : null;
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}

async function findClickupTaskInList(token, demandaId) {
  const needle = String(demandaId || "").trim();
  if (!needle) return "";
  const data = await clickupFetch(
    token,
    `/list/${CLICKUP_LIST_ID}/task?archived=false&include_closed=true&subtasks=true`,
  );
  const tasks = Array.isArray(data.tasks) ? data.tasks : [];
  const found = tasks.find((t) => {
    const blob = [t.id, t.custom_id, t.name, t.description, t.text_content, t.url]
      .map((x) => String(x || ""))
      .join("\n");
    return blob.includes(needle);
  });
  return found?.id ? String(found.id) : "";
}

async function deleteClickupTask(token, taskId) {
  const id = parseClickupTaskId(taskId);
  if (!id) return false;
  const existing = await getClickupTask(token, id);
  if (!existing) return false;
  try {
    await clickupFetch(token, `/task/${id}`, { method: "DELETE" });
  } catch (e) {
    if (e.status !== 404) {
      await clickupFetch(token, `/task/${id}`, { method: "PUT", body: { archived: true } });
    }
  }
  const still = await getClickupTask(token, id);
  if (still && !still.archived) {
    throw new Error("A tarefa ainda existe no ClickUp após tentar excluir.");
  }
  return true;
}

async function pickCreateStatus(token) {
  const list = await clickupFetch(token, `/list/${CLICKUP_LIST_ID}`);
  const statuses = (list.statuses || []).map((s) => s.status);
  for (const wanted of STATUS_NOVA) {
    const found = statuses.find((s) => normStatus(s) === normStatus(wanted));
    if (found) return found;
  }
  return statuses[0] || "pendente";
}

function commentFromClickup(texto) {
  return {
    id: `clickup_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    texto,
    autor: "ClickUp · Operação",
    createdAt: new Date().toISOString(),
  };
}

exports.createClickupOperacao = onCall(
  { region: REGION, secrets: [clickupToken], cors: true },
  async (request) => {
    try {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Faça login para enviar ao ClickUp.");
    }
    const token = clickupToken.value();
    if (!token) {
      throw new HttpsError("failed-precondition", "Token do ClickUp não configurado no Firebase.");
    }
    const demandaId = String(request.data?.demandaId || "").trim();
    if (!demandaId) throw new HttpsError("invalid-argument", "Informe a demanda.");
    const instrucoes = String(request.data?.instrucoes || "").trim();
    if (!instrucoes) throw new HttpsError("invalid-argument", "Informe as instruções do que deverá ser feito.");
    if (instrucoes.length > 4000) throw new HttpsError("invalid-argument", "As instruções devem ter no máximo 4000 caracteres.");

    const db = getFirestore();
    const ref = db.collection("demandas").doc(demandaId);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError("failed-precondition", "Demanda não encontrada.");
    const d = snap.data() || {};
    if (d.clickupTaskId && d.clickup?.url) {
      return { ok: true, already: true, taskId: d.clickupTaskId, url: d.clickup.url, status: d.clickup.status || "" };
    }

    const leftover = await findClickupTaskInList(token, demandaId);
    if (leftover) {
      try {
        await deleteClickupTask(token, leftover);
      } catch (e) {
        console.warn("ClickUp leftover:", e.message || e);
      }
    }

    const status = await pickCreateStatus(token);
    const titulo = String(d.titulo || "Demanda").trim();
    const markdown = [
      `## Instruções para a Operação`,
      instrucoes,
      "",
      `---`,
      `**Origem:** Sistema Projetos Master`,
      `**ID da demanda:** \`${demandaId}\``,
      `**Tipo:** ${d.tipo || "—"}`,
      `**Cidade:** ${d.cidade || "—"}`,
      `**Projetista:** ${d.responsavel || "Não atribuído"}`,
      `**Solicitante:** ${d.solicitante || "—"}`,
      `[Abrir no sistema](${APP_URL}/)`,
      "",
      String(d.descricao || "").trim() || "_Sem descrição._",
    ].join("\n");

    const created = await clickupFetch(token, `/list/${CLICKUP_LIST_ID}/task`, {
      method: "POST",
      body: {
        name: titulo,
        markdown_description: markdown,
        status,
      },
    });

    const taskId = String(created.id || "");
    const url = String(created.url || `https://app.clickup.com/t/${taskId}`);
    const now = new Date().toISOString();
    const clickup = {
      taskId,
      url,
      status: created.status?.status || status,
      listId: CLICKUP_LIST_ID,
      createdAt: now,
      createdBy: request.auth.token.email || "",
      instrucoes,
    };
    const cmt = commentFromClickup(
      `Demanda enviada para o time de Operação no ClickUp (Nova demanda).\nInstruções: ${instrucoes}\n${url}`,
    );
    const comentarios = Array.isArray(d.comentarios) ? [cmt, ...d.comentarios] : [cmt];
    await ref.set(
      {
        clickupTaskId: taskId,
        clickup,
        comentarios,
        updatedAt: now,
      },
      { merge: true },
    );

    await ensureWebhook(token, db);

    return { ok: true, already: false, taskId, url, status: clickup.status };
    } catch (e) {
      if (e instanceof HttpsError) throw e;
      console.error("createClickupOperacao", e);
      throw new HttpsError("unavailable", String(e?.message || "Não foi possível criar no ClickUp."));
    }
  },
);

exports.cancelClickupOperacao = onCall(
  { region: REGION, secrets: [clickupToken], cors: true },
  async (request) => {
    try {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Faça login para cancelar no ClickUp.");
    }
    const token = clickupToken.value();
    if (!token) {
      throw new HttpsError("failed-precondition", "Token do ClickUp não configurado no Firebase.");
    }
      const demandaId = String(request.data?.demandaId || "").trim();
      if (!demandaId) throw new HttpsError("invalid-argument", "Informe a demanda.");
      const db = getFirestore();
      const ref = db.collection("demandas").doc(demandaId);
      const snap = await ref.get();
      if (!snap.exists) throw new HttpsError("failed-precondition", "Demanda não encontrada.");
      const d = snap.data() || {};
      const candidates = [
        request.data?.taskId,
        d.clickupTaskId,
        d.clickup?.taskId,
        parseClickupTaskId(request.data?.url),
        parseClickupTaskId(d.clickup?.url),
      ]
        .map((x) => parseClickupTaskId(x))
        .filter(Boolean);
      const seen = new Set();
      const ids = [];
      for (const id of candidates) {
        if (seen.has(id)) continue;
        seen.add(id);
        ids.push(id);
      }
      let deleted = false;
      let lastErr = null;
      for (const id of ids) {
        try {
          if (await deleteClickupTask(token, id)) {
            deleted = true;
            break;
          }
        } catch (e) {
          lastErr = e;
        }
      }
      if (!deleted) {
        try {
          const fromList = await findClickupTaskInList(token, demandaId);
          if (fromList) deleted = await deleteClickupTask(token, fromList);
        } catch (e) {
          lastErr = lastErr || e;
        }
      }
      if (!deleted && lastErr) {
        throw new HttpsError("failed-precondition", String(lastErr.message || lastErr));
      }
      if (!deleted && ids.length) {
        throw new HttpsError("unavailable", "Não foi possível excluir a tarefa no ClickUp. Confira se o token tem permissão de excluir.");
      }
      const now = new Date().toISOString();
      const cmt = commentFromClickup("Envio à Operação cancelado. A tarefa foi excluída no ClickUp.");
      const comentarios = Array.isArray(d.comentarios) ? [cmt, ...d.comentarios] : [cmt];
      await ref.set(
        {
          clickup: FieldValue.delete(),
          clickupTaskId: FieldValue.delete(),
          comentarios,
          updatedAt: now,
        },
        { merge: true },
      );
      return { ok: true, deleted };
    } catch (e) {
      if (e instanceof HttpsError) throw e;
      console.error("cancelClickupOperacao", e);
      throw new HttpsError("unavailable", String(e?.message || "Não foi possível cancelar no ClickUp."));
    }
  },
);

async function ensureWebhook(token, db) {
  const cfgRef = db.doc("demandasSistema/clickup");
  const cfg = (await cfgRef.get()).data() || {};
  if (cfg.webhookId) return;
  const endpoint = `https://${REGION}-${process.env.GCLOUD_PROJECT || "demproj-fdeac"}.cloudfunctions.net/clickupWebhook`;
  try {
    const created = await clickupFetch(token, `/team/${CLICKUP_TEAM_ID}/webhook`, {
      method: "POST",
      body: {
        endpoint,
        events: ["taskStatusUpdated"],
        list_id: CLICKUP_LIST_ID,
      },
    });
    await cfgRef.set(
      {
        webhookId: created.id || created.webhook?.id || "",
        endpoint,
        listId: CLICKUP_LIST_ID,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
  } catch (e) {
    console.warn("Webhook ClickUp:", e.message || e);
  }
}

exports.clickupWebhook = onRequest({ region: REGION, cors: true, secrets: [clickupToken] }, async (req, res) => {
  if (req.method === "GET") {
    res.status(200).send("ok");
    return;
  }
  if (req.method !== "POST") {
    res.status(405).send("method");
    return;
  }
  const body = req.body || {};
  const event = String(body.event || "");
  const taskId = String(body.task_id || body.task?.id || "").trim();
  if (!taskId) {
    res.status(200).json({ ok: true, ignored: true });
    return;
  }

  let statusName = "";
  const hist = Array.isArray(body.history_items) ? body.history_items : [];
  for (const item of hist) {
    const after = item?.after;
    if (after && typeof after === "object" && after.status) {
      statusName = after.status;
      break;
    }
    if (typeof after === "string") statusName = after;
  }
  if (!statusName && body.task?.status) {
    statusName = typeof body.task.status === "string" ? body.task.status : body.task.status.status || "";
  }

  const db = getFirestore();
  const q = await db.collection("demandas").where("clickupTaskId", "==", taskId).limit(1).get();
  if (q.empty) {
    res.status(200).json({ ok: true, unmatched: true });
    return;
  }
  const doc = q.docs[0];
  const d = doc.data() || {};
  const prev = d.clickup && typeof d.clickup === "object" ? { ...d.clickup } : {};
  const now = new Date().toISOString();
  const next = { ...prev, status: statusName || prev.status || "" };
  const patch = { clickup: next, updatedAt: now };

  if (event.includes("taskStatusUpdated") && isStatusConclusao(statusName) && !prev.completedAt) {
    const url = prev.url || `https://app.clickup.com/t/${taskId}`;
    next.completedAt = now;
    patch.clickup = next;
    const cmt = commentFromClickup(`Operação concluiu a demanda no ClickUp.\n${url}`);
    patch.comentarios = Array.isArray(d.comentarios) ? [cmt, ...d.comentarios] : [cmt];
  }

  await doc.ref.set(patch, { merge: true });
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
