/**
 * Integração com o Asana: envio da demanda à Operação (tarefa em um dos projetos do Asana)
 * e comentários nos dois sentidos (sistema → Asana pelo callable; Asana → sistema pelo webhook).
 *
 * As funções recebem as dependências (db, token, fetch, apagarCampo) para poderem ser testadas
 * com um Asana e um Firestore simulados.
 */
const crypto = require("node:crypto");

const ASANA_API = "https://app.asana.com/api/1.0";
const ASANA_WORKSPACE_GID = "1211507547180510";
/** Projetos ("pastas") do Asana em que a demanda pode entrar; o nome real vem da API. */
const ASANA_PROJETOS = [
  { gid: "1211582012771845", nome: "Projeto do Asana 1" },
  { gid: "1219543786224599", nome: "Projeto do Asana 2" },
];
const APP_URL = "https://demproj-fdeac.web.app";

/** Coleções só do servidor (as regras do Firestore negam acesso do app a elas). */
const COL_STORIES = "asanaStories"; // {storyGid} → { demandaId, comentarioId, origem }
const COL_ENVIOS = "asanaComentarios"; // {demandaId}__{comentarioId} → { storyGid, estado }
const DOC_WEBHOOKS = "asanaIntegracao/webhooks";
const COL_ANEXOS = "asanaAnexos"; // {attachmentGid} → anexos que o próprio sistema mandou (não repetir no webhook) // { [projetoGid]: { secret, webhookGid } }

/** Comentários que o sistema escreve no Asana começam assim — evita trazê-los de volta (loop). */
const SUFIXO_AUTOR = " (pelo sistema):";

class AsanaErro extends Error {
  constructor(msg, status) {
    super(msg);
    this.status = status;
  }
}

function criarCliente(token, fetchImpl = fetch) {
  return async function asana(caminho, { method = "GET", data, okStatuses = [] } = {}) {
    const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };
    if (data) headers["Content-Type"] = "application/json";
    const res = await fetchImpl(`${ASANA_API}${caminho}`, {
      method,
      headers,
      body: data ? JSON.stringify({ data }) : undefined,
    });
    const txt = await res.text();
    let json = {};
    try {
      json = txt ? JSON.parse(txt) : {};
    } catch {
      json = { raw: txt };
    }
    if (!res.ok) {
      if (okStatuses.includes(res.status)) return { __status: res.status };
      const msg = json?.errors?.[0]?.message || txt || `HTTP ${res.status}`;
      throw new AsanaErro(`Asana: ${msg}`, res.status);
    }
    return json.data ?? json;
  };
}

function projetoValido(gid) {
  return ASANA_PROJETOS.find((p) => p.gid === String(gid || "").trim()) || null;
}

function textoComentarioSistema(autor, texto) {
  return `${String(autor || "Equipe").trim() || "Equipe"}${SUFIXO_AUTOR}\n${String(texto || "").trim()}`;
}

function ehComentarioDoSistema(texto) {
  const primeira = String(texto || "").split("\n", 1)[0];
  return primeira.endsWith(SUFIXO_AUTOR);
}

function chaveEnvio(demandaId, comentarioId) {
  return `${demandaId}__${comentarioId}`.replace(/\//g, "_");
}

function comentarioIntegracao(texto, extra = {}) {
  return {
    id: `asana_sis_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    texto,
    autor: "Asana · Operação",
    createdAt: new Date().toISOString(),
    origem: "integracao",
    ...extra,
  };
}

/** Acrescenta um comentário sem regravar a demanda inteira (não dispara aviso de conflito no app). */
async function acrescentarComentario(db, demandaRef, cmt, extra = {}) {
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(demandaRef);
    if (!snap.exists) return;
    const lista = Array.isArray(snap.data()?.comentarios) ? snap.data().comentarios : [];
    if (lista.some((c) => c && c.id === cmt.id)) return;
    tx.set(
      demandaRef,
      { ...extra, comentarios: [cmt, ...lista], comentariosServidorAt: new Date().toISOString() },
      { merge: true },
    );
  });
}

async function nomesDosProjetos({ token, fetchImpl }) {
  const asana = criarCliente(token, fetchImpl);
  return Promise.all(
    ASANA_PROJETOS.map(async (p) => {
      try {
        const proj = await asana(`/projects/${p.gid}?opt_fields=name`);
        return { gid: p.gid, nome: String(proj?.name || "").trim() || p.nome };
      } catch {
        return { ...p };
      }
    }),
  );
}

/**
 * Garante um webhook ativo no projeto, filtrado para comentários (stories). Idempotente:
 * reaproveita o que já existe para o mesmo endereço; recria se o Asana o desativou.
 */
/** Sobe quando os filtros do webhook mudam: o webhook antigo é recriado com os novos. */
const WEBHOOK_VERSAO = 2;
const WEBHOOK_FILTROS = [
  ...["added", "changed", "removed", "deleted"].map((action) => ({ resource_type: "story", action })),
  { resource_type: "task", action: "added" }, // entrou numa seção (coluna) do quadro
  { resource_type: "task", action: "changed", fields: ["completed"] },
  { resource_type: "task", action: "deleted" },
];

async function garantirWebhook({ db, token, fetchImpl, projetoGid, endpoint }) {
  const asana = criarCliente(token, fetchImpl);
  const target = `${endpoint}?projeto=${projetoGid}`;
  const salvo = (await db.doc(DOC_WEBHOOKS).get()).data()?.[projetoGid] || {};
  const versaoOk = Number(salvo.versao) >= WEBHOOK_VERSAO;
  const lista = await asana(
    `/webhooks?workspace=${ASANA_WORKSPACE_GID}&resource=${projetoGid}&opt_fields=gid,target,active`,
  );
  const meus = (Array.isArray(lista) ? lista : []).filter((w) => w.target === target);
  if (versaoOk && meus.some((w) => w.active)) return { criado: false };
  for (const w of meus) await asana(`/webhooks/${w.gid}`, { method: "DELETE", okStatuses: [404] });
  // Abre uma janela curta para o "aperto de mão": fora dela, um X-Hook-Secret recebido é recusado.
  await db.doc(DOC_WEBHOOKS).set({ [projetoGid]: { handshakeAte: Date.now() + 2 * 60 * 1000 } }, { merge: true });
  const criado = await asana("/webhooks", {
    method: "POST",
    data: {
      resource: projetoGid,
      target,
      filters: WEBHOOK_FILTROS,
    },
  });
  await db.doc(DOC_WEBHOOKS).set(
    { [projetoGid]: { webhookGid: String(criado?.gid || ""), target, versao: WEBHOOK_VERSAO, atualizadoEm: new Date().toISOString() } },
    { merge: true },
  );
  return { criado: true };
}

/**
 * Cria a tarefa da Operação no Asana. Com novaOrdem, a tarefa atual vira "ordem anterior" (continua
 * no Asana e no histórico) e os próximos comentários passam a ir para a nova.
 */
async function criarTarefa({ db, token, fetchImpl, demandaId, instrucoes, projetoGid, email, endpoint, novaOrdem = false }) {
  const projeto = projetoValido(projetoGid);
  if (!projeto) throw new AsanaErro("Escolha em qual projeto do Asana a demanda vai entrar.", 400);
  const ref = db.collection("demandas").doc(demandaId);
  const snap = await ref.get();
  if (!snap.exists) throw new AsanaErro("Demanda não encontrada.", 404);
  const d = snap.data() || {};
  const temAtual = !!(d.asanaTaskId && d.asana?.url);
  if (temAtual && !novaOrdem) {
    return { already: true, taskId: d.asanaTaskId, url: d.asana.url, projetoGid: d.asana.projetoGid || "" };
  }
  if (temAtual && novaOrdem && !d.asana?.concluidaEm) {
    throw new AsanaErro("A ordem atual ainda não foi concluída no Asana — conclua (ou exclua) lá antes de abrir outra.", 400);
  }

  const asana = criarCliente(token, fetchImpl);
  const nomes = await nomesDosProjetos({ token, fetchImpl });
  const projetoNome = nomes.find((p) => p.gid === projeto.gid)?.nome || projeto.nome;
  const notes = [
    "Instruções para a Operação:",
    instrucoes,
    "",
    "———",
    "Origem: Sistema Projetos Master",
    `ID da demanda: ${demandaId}`,
    `Tipo: ${d.tipo || "—"}`,
    `Cidade: ${d.cidade || "—"}`,
    `Projetista: ${d.responsavel || "Não atribuído"}`,
    `Solicitante: ${d.solicitante || "—"}`,
    `Abrir no sistema: ${APP_URL}/`,
    "",
    String(d.descricao || "").trim() || "Sem descrição.",
  ].join("\n");
  const tarefa = await asana("/tasks?opt_fields=gid,permalink_url", {
    method: "POST",
    data: { name: String(d.titulo || "Demanda").trim(), notes, projects: [projeto.gid] },
  });
  const taskId = String(tarefa?.gid || "");
  const url = String(tarefa?.permalink_url || `https://app.asana.com/0/${projeto.gid}/${taskId}`);
  const agora = new Date().toISOString();
  const info = { taskId, url, projetoGid: projeto.gid, projetoNome, createdAt: agora, createdBy: email || "", instrucoes };
  const cmt = comentarioIntegracao(
    `${temAtual ? "Nova ordem aberta" : "Demanda enviada à Operação"} no Asana (${projetoNome}).\nInstruções: ${instrucoes}\n${url}`,
  );
  const anteriores = Array.isArray(d.asanaAnteriores) ? d.asanaAnteriores : [];
  const extra = {
    asanaTaskId: taskId,
    asana: info,
    // Todas as tarefas da demanda: o webhook acha a demanda por qualquer uma (comentário em ordem antiga).
    asanaTaskIds: [...new Set([...(Array.isArray(d.asanaTaskIds) ? d.asanaTaskIds : []), d.asanaTaskId, taskId].filter(Boolean))],
  };
  if (temAtual) extra.asanaAnteriores = [...anteriores, { ...d.asana, substituidaEm: agora }].slice(-20);
  await acrescentarComentario(db, ref, cmt, extra);

  try {
    await garantirWebhook({ db, token, fetchImpl, projetoGid: projeto.gid, endpoint });
  } catch (e) {
    console.warn("Webhook Asana:", e.message || e);
  }
  return { already: false, ...info, comentario: cmt };
}

async function cancelarTarefa({ db, token, fetchImpl, demandaId, apagarCampo }) {
  const ref = db.collection("demandas").doc(demandaId);
  const snap = await ref.get();
  if (!snap.exists) throw new AsanaErro("Demanda não encontrada.", 404);
  const d = snap.data() || {};
  const taskId = String(d.asanaTaskId || d.asana?.taskId || "").trim();
  if (taskId) {
    await criarCliente(token, fetchImpl)(`/tasks/${taskId}`, { method: "DELETE", okStatuses: [404] });
  }
  const cmt = comentarioIntegracao("Envio à Operação cancelado. A tarefa foi excluída no Asana.");
  await acrescentarComentario(db, ref, cmt, { asana: apagarCampo(), asanaTaskId: apagarCampo() });
  return { deleted: !!taskId, comentario: cmt };
}

/** Limite por arquivo enviado pelo app (o pedido à função tem teto de ~32 MB, e base64 cresce ~33%). */
const ANEXO_MAX_BYTES = 10 * 1024 * 1024;

function nomeArquivoSeguro(nome) {
  const limpo = String(nome || "")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .trim()
    .slice(0, 180);
  return limpo || "arquivo";
}

/**
 * Anexa um arquivo na tarefa atual da demanda, direto no Asana (não fica guardado no Firebase),
 * e registra no projeto um comentário com o link.
 */
async function anexarArquivo({ db, token, fetchImpl = fetch, demandaId, nome, tipo, base64, autor }) {
  const ref = db.collection("demandas").doc(demandaId);
  const snap = await ref.get();
  if (!snap.exists) throw new AsanaErro("Demanda não encontrada.", 404);
  const taskId = String(snap.data()?.asanaTaskId || "").trim();
  if (!taskId) throw new AsanaErro("Esta demanda ainda não tem tarefa no Asana.", 400);
  const bytes = Buffer.from(String(base64 || ""), "base64");
  if (!bytes.length) throw new AsanaErro("Arquivo vazio.", 400);
  if (bytes.length > ANEXO_MAX_BYTES) throw new AsanaErro("Arquivo maior que 10 MB — anexe direto no Asana.", 400);
  const arquivo = nomeArquivoSeguro(nome);
  const form = new FormData();
  form.append("parent", taskId);
  form.append("file", new Blob([bytes], { type: String(tipo || "application/octet-stream") }), arquivo);
  const res = await fetchImpl(`${ASANA_API}/attachments?opt_fields=gid,name,permalink_url`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    body: form,
  });
  const txt = await res.text();
  let json = {};
  try {
    json = txt ? JSON.parse(txt) : {};
  } catch {}
  if (!res.ok) throw new AsanaErro(`Asana: ${json?.errors?.[0]?.message || txt || `HTTP ${res.status}`}`, res.status);
  const anexo = json.data || {};
  const ehImagem = /\.(png|jpe?g|gif|webp|heic|bmp)$/i.test(arquivo);
  const cmt = comentarioIntegracao(
    `${ehImagem ? "🖼️" : "📎"} Anexou ${ehImagem ? "a imagem" : "o arquivo"} «${anexo.name || arquivo}» no Asana${
      anexo.permalink_url ? `\n${anexo.permalink_url}` : ""
    }`,
    { autor: String(autor || "").trim() || "Asana · Operação" },
  );
  await acrescentarComentario(db, ref, cmt);
  if (anexo.gid) await db.collection(COL_ANEXOS).doc(String(anexo.gid)).set({ demandaId, em: new Date().toISOString() });
  return { gid: String(anexo.gid || ""), nome: anexo.name || arquivo, url: anexo.permalink_url || "", comentario: cmt };
}

/** Sistema → Asana: publica, edita ou apaga no Asana o comentário digitado no sistema. */
async function sincronizarComentario({ db, token, fetchImpl, demandaId, acao, comentarioId, texto, autor }) {
  const snap = await db.collection("demandas").doc(demandaId).get();
  if (!snap.exists) throw new AsanaErro("Demanda não encontrada.", 404);
  const taskId = String(snap.data()?.asanaTaskId || "").trim();
  if (!taskId) return { ignorado: "sem-tarefa" };
  const asana = criarCliente(token, fetchImpl);
  const envioRef = db.collection(COL_ENVIOS).doc(chaveEnvio(demandaId, comentarioId));

  if (acao === "criar") {
    try {
      await envioRef.create({ demandaId, comentarioId, estado: "enviando", criadoEm: new Date().toISOString() });
    } catch {
      return { ignorado: "ja-enviado" }; // outra chamada já está enviando/enviou este comentário
    }
    let story;
    try {
      story = await asana(`/tasks/${taskId}/stories?opt_fields=gid`, {
        method: "POST",
        data: { text: textoComentarioSistema(autor, texto) },
      });
    } catch (e) {
      await envioRef.delete();
      throw e;
    }
    const storyGid = String(story?.gid || "");
    await Promise.all([
      envioRef.set({ storyGid, estado: "ok" }, { merge: true }),
      db.collection(COL_STORIES).doc(storyGid).set({ demandaId, comentarioId, origem: "sistema" }),
    ]);
    return { storyGid };
  }

  const envio = (await envioRef.get()).data();
  if (!envio?.storyGid) return { ignorado: "nao-enviado" };
  if (acao === "editar") {
    await asana(`/stories/${envio.storyGid}`, { method: "PUT", data: { text: textoComentarioSistema(autor, texto) } });
    return { storyGid: envio.storyGid };
  }
  if (acao === "apagar") {
    await asana(`/stories/${envio.storyGid}`, { method: "DELETE", okStatuses: [404] });
    await Promise.all([envioRef.delete(), db.collection(COL_STORIES).doc(envio.storyGid).delete()]);
    return { storyGid: envio.storyGid };
  }
  throw new AsanaErro("Ação inválida.", 400);
}

/**
 * "Aperto de mão" do Asana ao criar o webhook: guarda o segredo só se o próprio sistema acabou de
 * pedir o webhook (senão qualquer um poderia trocar o segredo e forjar comentários).
 */
async function registrarHandshake({ db, projetoGid, segredo }) {
  const ref = db.doc(DOC_WEBHOOKS);
  const atual = (await ref.get()).data()?.[projetoGid] || {};
  if (!segredo || !(Number(atual.handshakeAte) > Date.now())) return false;
  await ref.set({ [projetoGid]: { secret: segredo, handshakeAte: 0, handshakeEm: new Date().toISOString() } }, { merge: true });
  return true;
}

function assinaturaValida(secret, rawBody, assinatura) {
  if (!secret || !assinatura || !rawBody) return false;
  const esperado = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(esperado);
  const b = Buffer.from(String(assinatura));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Atividades que já viram aviso próprio (coluna, conclusão) ou não interessam — não viram comentário. */
const ATIVIDADES_IGNORADAS = new Set([
  "section_changed", "marked_complete", "marked_incomplete", "added_to_project", "removed_from_project",
  "comment_liked", "liked", "unliked", "added_to_tag", "removed_from_tag", "member_added", "collaborator_added",
  "follower_added", "attachment_liked",
]);

/** Texto em português da atividade do Asana (comentário, anexo, responsável, prazo…), ou "" para ignorar. */
async function textoDaAtividade(asana, story, taskGid, db) {
  const subtipo = String(story.resource_subtype || "");
  const bruto = String(story.text || "").trim();
  if (subtipo === "comment_added") return bruto || "(comentário vazio)";
  if (ATIVIDADES_IGNORADAS.has(subtipo)) return "";
  if (subtipo === "attachment_added") {
    let anexo = null;
    try {
      const lista = await asana(`/attachments?parent=${taskGid}&opt_fields=gid,name,permalink_url,created_at`);
      const arr = Array.isArray(lista) ? lista : [];
      anexo = arr.find((x) => x.name && bruto.includes(x.name)) || arr.sort((x, y) => String(y.created_at).localeCompare(String(x.created_at)))[0];
    } catch {}
    // Anexo enviado pelo próprio sistema (📎 Anexar ao Asana): o comentário já foi registrado na hora.
    if (anexo?.gid && (await db.collection(COL_ANEXOS).doc(String(anexo.gid)).get()).exists) return "";
    const nome = anexo?.name || bruto.replace(/^.*?attached\s*/i, "") || "um arquivo";
    const ehImagem = /\.(png|jpe?g|gif|webp|heic|bmp)$/i.test(nome);
    return `${ehImagem ? "🖼️" : "📎"} Anexou ${ehImagem ? "a imagem" : "o arquivo"} «${nome}» no Asana${anexo?.permalink_url ? `\n${anexo.permalink_url}` : ""}`;
  }
  if (subtipo === "assigned") return `👤 Definiu ${story.assignee?.name || "um responsável"} como responsável no Asana`;
  if (subtipo === "unassigned") return "👤 Removeu o responsável da tarefa no Asana";
  if (subtipo === "due_date_changed") return `📅 Alterou o prazo no Asana${bruto ? ` (${bruto})` : ""}`;
  if (story.type === "comment") return bruto;
  return bruto ? `🔔 Asana: ${bruto}` : "";
}

/** Asana → sistema: aplica um evento de comentário (story) recebido pelo webhook. */
function normTxt(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

async function demandaDaTarefa(db, taskGid) {
  let q = await db.collection("demandas").where("asanaTaskIds", "array-contains", taskGid).limit(1).get();
  if (q.empty) q = await db.collection("demandas").where("asanaTaskId", "==", taskGid).limit(1).get();
  return q.empty ? null : q.docs[0];
}

/** Registra um aviso do Asana na demanda (comentário + alerta no sistema), sem repetir o mesmo aviso. */
async function registrarAviso(db, ref, { tipo, taskGid, texto, extra = {} }) {
  const agora = new Date().toISOString();
  await db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists) return;
    const d = s.data() || {};
    const chave = `${tipo}:${taskGid}:${extra.__chave || ""}`;
    const { __chave, ...resto } = extra;
    if (d.asanaAviso?.chave === chave) {
      if (Object.keys(resto).length) tx.set(ref, resto, { merge: true });
      return;
    }
    const cmt = comentarioIntegracao(texto);
    const lista = Array.isArray(d.comentarios) ? d.comentarios : [];
    tx.set(
      ref,
      {
        ...resto,
        asanaAviso: { tipo, texto, taskId: taskGid, em: agora, chave },
        comentarios: [cmt, ...lista],
        comentariosServidorAt: agora,
      },
      { merge: true },
    );
  });
}

/** Tarefa voltou a ficar aberta no Asana: trava de novo a "nova ordem" e permite avisar outra conclusão. */
async function reabrirOrdem(ref, apagarCampo) {
  await ref.set({ asana: { concluidaEm: apagarCampo() }, asanaAviso: { chave: `reaberta:${Date.now()}` } }, { merge: true });
}

/** Asana → sistema: tarefa mudou de coluna, foi concluída ou foi excluída. */
async function processarEventoTarefa({ db, token, fetchImpl, evento, apagarCampo }) {
  const taskGid = String(evento.resource?.gid || "");
  if (!taskGid) return "ignorado";
  const doc = await demandaDaTarefa(db, taskGid);
  if (!doc) return "sem-demanda";
  const d = doc.data() || {};
  const asana = criarCliente(token, fetchImpl);
  const atual = d.asanaTaskId === taskGid;
  const rotulo = atual ? "a tarefa" : "uma ordem anterior";

  if (evento.action === "deleted") {
    if (!atual) return "ignorado"; // cancelada pelo próprio sistema ou ordem antiga
    const agora = new Date().toISOString();
    const anteriores = Array.isArray(d.asanaAnteriores) ? d.asanaAnteriores : [];
    await registrarAviso(db, doc.ref, {
      tipo: "excluida",
      taskGid,
      texto: "A tarefa foi excluída no Asana — a ordem foi encerrada aqui. Use \"Enviar à Operação\" para abrir outra, se precisar.",
      extra: {
        asana: apagarCampo(),
        asanaTaskId: apagarCampo(),
        asanaAnteriores: [...anteriores, { ...(d.asana || {}), excluidaNoAsanaEm: agora }].slice(-20),
      },
    });
    return "excluida";
  }

  if (evento.action === "changed" && evento.change?.field === "completed") {
    const t = await asana(`/tasks/${taskGid}?opt_fields=completed`, { okStatuses: [404] });
    if (!t || t.__status) return "ignorado";
    if (!t.completed) {
      if (atual && d.asana?.concluidaEm) await reabrirOrdem(doc.ref, apagarCampo);
      return atual && d.asana?.concluidaEm ? "reaberta" : "ignorado";
    }
    await registrarAviso(db, doc.ref, {
      tipo: "concluida",
      taskGid,
      texto: `A Operação concluiu ${rotulo} no Asana.`,
      extra: atual ? { asana: { ...(d.asana || {}), concluidaEm: new Date().toISOString() } } : {},
    });
    return "concluida";
  }

  if (evento.action === "added" && evento.parent?.resource_type === "section") {
    const secao = await asana(`/sections/${evento.parent.gid}?opt_fields=name`, { okStatuses: [404] });
    const nome = String(secao?.name || "").trim();
    const n = normTxt(nome);
    const tipo = n.includes("conclu") ? "concluida" : n.includes("andamento") ? "andamento" : "";
    const extraSecao = atual
      ? { asana: { ...(d.asana || {}), secao: nome, ...(tipo === "concluida" ? { concluidaEm: d.asana?.concluidaEm || new Date().toISOString() } : {}) } }
      : {};
    if (tipo !== "concluida" && atual && d.asana?.concluidaEm) await reabrirOrdem(doc.ref, apagarCampo);
    if (!tipo) {
      if (atual) await doc.ref.set({ asana: { secao: nome } }, { merge: true });
      return "secao";
    }
    if (tipo === "andamento" && atual) delete extraSecao.asana.concluidaEm;
    await registrarAviso(db, doc.ref, {
      tipo,
      taskGid,
      texto:
        tipo === "andamento"
          ? `A Operação moveu ${rotulo} para «${nome}» no Asana.`
          : `A Operação concluiu ${rotulo} no Asana («${nome}»).`,
      // "andamento" avisa de novo se voltar para outra coluna de andamento; "concluida" uma vez por tarefa.
      extra: { ...extraSecao, ...(tipo === "andamento" ? { __chave: evento.parent.gid } : {}) },
    });
    return tipo;
  }
  return "ignorado";
}

async function processarEvento({ db, token, fetchImpl, evento, apagarCampo = () => null }) {
  if (evento?.resource?.resource_type === "task") return processarEventoTarefa({ db, token, fetchImpl, evento, apagarCampo });
  if (evento?.resource?.resource_type !== "story") return "ignorado";
  const storyGid = String(evento.resource.gid || "");
  if (!storyGid) return "ignorado";
  const mapaRef = db.collection(COL_STORIES).doc(storyGid);
  const mapa = (await mapaRef.get()).data();
  const asana = criarCliente(token, fetchImpl);

  if (evento.action === "added") {
    if (mapa) return "ja-conhecido"; // veio do próprio sistema ou já foi aplicado
    const story = await asana(
      `/stories/${storyGid}?opt_fields=text,resource_subtype,type,created_at,created_by.gid,created_by.name,target.gid,assignee.name`,
      { okStatuses: [404] },
    );
    if (!story || story.__status) return "ignorado";
    const subtipo = String(story.resource_subtype || "");
    if (subtipo === "comment_added" && ehComentarioDoSistema(story.text)) return "eco";
    const taskGid = String(story.target?.gid || evento.parent?.gid || "");
    const texto = await textoDaAtividade(asana, story, taskGid, db);
    if (!texto) return "ignorado";
    const doc = await demandaDaTarefa(db, taskGid);
    if (!doc) return "sem-demanda";
    const comentarioId = `asana_${storyGid}`;
    await acrescentarComentario(db, doc.ref, {
      id: comentarioId,
      texto,
      autor: String(story.created_by?.name || "").trim() || "Asana",
      createdAt: story.created_at || new Date().toISOString(),
      origem: "asana",
      asanaStoryGid: storyGid,
    });
    await mapaRef.set({ demandaId: doc.id, comentarioId, origem: "asana" });
    return "adicionado";
  }

  if (!mapa) return "desconhecido";
  if (mapa.origem !== "asana") {
    // Comentário que o sistema mandou e foi apagado lá: só esquece o vínculo.
    if (evento.action === "deleted" || evento.action === "removed") {
      await Promise.all([mapaRef.delete(), db.collection(COL_ENVIOS).doc(chaveEnvio(mapa.demandaId, mapa.comentarioId)).delete()]);
    }
    return "do-sistema";
  }
  const demandaRef = db.collection("demandas").doc(mapa.demandaId);

  if (evento.action === "changed") {
    const story = await asana(`/stories/${storyGid}?opt_fields=text`, { okStatuses: [404] });
    if (!story || story.__status) return "ignorado";
    const texto = String(story.text || "").trim();
    await db.runTransaction(async (tx) => {
      const s = await tx.get(demandaRef);
      if (!s.exists) return;
      const lista = Array.isArray(s.data()?.comentarios) ? s.data().comentarios : [];
      const nova = lista.map((c) =>
        c && c.id === mapa.comentarioId && c.texto !== texto ? { ...c, texto, editadoEm: new Date().toISOString() } : c,
      );
      tx.set(demandaRef, { comentarios: nova, comentariosServidorAt: new Date().toISOString() }, { merge: true });
    });
    return "editado";
  }

  if (evento.action === "deleted" || evento.action === "removed") {
    await db.runTransaction(async (tx) => {
      const s = await tx.get(demandaRef);
      if (!s.exists) return;
      const lista = Array.isArray(s.data()?.comentarios) ? s.data().comentarios : [];
      tx.set(
        demandaRef,
        { comentarios: lista.filter((c) => !(c && c.id === mapa.comentarioId)), comentariosServidorAt: new Date().toISOString() },
        { merge: true },
      );
    });
    await mapaRef.delete();
    return "apagado";
  }
  return "ignorado";
}

module.exports = {
  ASANA_PROJETOS,
  DOC_WEBHOOKS,
  AsanaErro,
  projetoValido,
  nomesDosProjetos,
  garantirWebhook,
  criarTarefa,
  cancelarTarefa,
  sincronizarComentario,
  anexarArquivo,
  ANEXO_MAX_BYTES,
  assinaturaValida,
  registrarHandshake,
  processarEvento,
  textoComentarioSistema,
  ehComentarioDoSistema,
};
