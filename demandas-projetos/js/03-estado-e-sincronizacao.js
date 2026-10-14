/**
 * Estado do app, gravação local/nuvem, datas, prazos e motivos de atraso.
 * Só declarações (funções e constantes); o que roda ao abrir a página fica em app.js.
 */
function mergeLoadedState(data) {
  if (!data || typeof data !== "object") return defaultState();
  return {
    ...defaultState(),
    ...data,
    projetistas: { ...defaultState().projetistas, ...(data.projetistas || {}) },
    pendingDeleteDemandaIds: Array.isArray(data.pendingDeleteDemandaIds)
      ? [...data.pendingDeleteDemandaIds]
      : [],
    deletedDemandaIds: Array.isArray(data.deletedDemandaIds) ? [...data.deletedDemandaIds] : [],
    deletedDiariaIds: Array.isArray(data.deletedDiariaIds) ? [...data.deletedDiariaIds] : [],
  };
}

function demandaDeleteTombstones() {
  return new Set([...(state.pendingDeleteDemandaIds || []), ...(state.deletedDemandaIds || [])]);
}

function diariaDeleteTombstones() {
  return new Set(state.deletedDiariaIds || []);
}

function applyLoadedState(data) {
  state = mergeLoadedState(data);
  const tombstones = demandaDeleteTombstones();
  const diariaTombstones = diariaDeleteTombstones();
  const todas = (state.demandas || []).filter((d) => !tombstones.has(d.id)).map(migrateDemanda);
  // Excluídas ficam na lixeira (fora de esteira, dashboard e alertas) até serem restauradas ou apagadas.
  state.lixeira = todas.filter((d) => d.excluidoEm);
  state.demandas = todas.filter((d) => !d.excluidoEm);
  state.diarias = (state.diarias || [])
    .filter((d) => !diariaTombstones.has(d.id))
    .map(normalizeDiaria);
}

function markDemandaPendingDelete(id) {
  if (!id) return;
  if (!Array.isArray(state.pendingDeleteDemandaIds)) state.pendingDeleteDemandaIds = [];
  if (!state.pendingDeleteDemandaIds.includes(id)) state.pendingDeleteDemandaIds.push(id);
  if (!Array.isArray(state.deletedDemandaIds)) state.deletedDemandaIds = [];
  if (!state.deletedDemandaIds.includes(id)) state.deletedDemandaIds.push(id);
  state.demandas = state.demandas.filter((x) => x.id !== id);
}

function applyCloudPatch(patch) {
  if (!persistenceReady || !persistenceApi) {
    pendingCloudPatch = { ...(pendingCloudPatch || {}), ...patch };
    return;
  }
  if (patch.deleteDemandaId && persistenceApi.deleteDemanda) {
    const deleteId = patch.deleteDemandaId;
    void persistenceApi.deleteDemanda(deleteId).catch((e) => {
      console.warn("Excluir demanda na nuvem:", e);
      state.pendingDeleteDemandaIds = (state.pendingDeleteDemandaIds || []).filter((x) => x !== deleteId);
      state.deletedDemandaIds = (state.deletedDemandaIds || []).filter((x) => x !== deleteId);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (_) {}
      toast(e?.message || "Não foi possível excluir a demanda na nuvem");
      refreshAllViews();
    });
  }
  if (patch.demanda && persistenceApi.upsertDemanda) {
    void persistenceApi.upsertDemanda(patch.demanda).catch((e) => {
      console.warn("Salvar demanda na nuvem:", e);
      toast(e?.message || "Não foi possível salvar a demanda na nuvem");
    });
  }
  if (patch.presence?.id && persistenceApi.patchDemandaPresence) {
    void persistenceApi.patchDemandaPresence(patch.presence.id, patch.presence.editingBy).catch((e) => {
      console.warn("Presença na nuvem:", e);
    });
  }
  if (patch.meta && persistenceApi.persistMeta) {
    void persistenceApi.persistMeta({
      diarias: state.diarias,
      projetistas: state.projetistas,
      deletedDiariaIds: state.deletedDiariaIds || [],
    }).catch((e) => {
      console.warn("Salvar meta na nuvem:", e);
      toast(e?.message || "Não foi possível sincronizar diárias/projetistas na nuvem");
    });
  }
  if (patch.metaFields && persistenceApi.persistMetaFields) {
    void persistenceApi.persistMetaFields(patch.metaFields).catch((e) => {
      console.warn("Salvar configuração na nuvem:", e);
      toast(e?.message || "Não foi possível salvar a configuração na nuvem");
    });
  }
  if (patch.importFull && persistenceApi.importFullState) {
    void persistenceApi.importFullState(state);
  }
}

function saveState(patch = {}) {
  try {
    // Cópia local sem flag interna de migração
    const toSave = {
      ...state,
      demandas: [...(state.demandas || []), ...(state.lixeira || [])].map((d) => {
        if (!d || !d.__isMigrated) return d;
        const { __isMigrated, ...rest } = d;
        return rest;
      }),
    };
    delete toSave.lixeira;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch (e) {
    console.warn("Falha ao salvar cópia local:", e);
  }
  applyCloudPatch(patch);
}

function flushPendingCloudSave() {
  if (!pendingCloudPatch || !persistenceApi) return;
  const patch = pendingCloudPatch;
  pendingCloudPatch = null;
  applyCloudPatch(patch);
}

function setSyncStatus(status) {
  const el = document.getElementById("syncBadge");
  if (!el) return;
  const labels = {
    connecting: "Conectando…",
    saving: "Salvando…",
    synced: "Sincronizado (nuvem)",
    error: "Erro — não sincroniza",
    local: "Somente neste navegador",
    waiting: "Carregando dados…",
    cache: "Cópia do aparelho — atualizando…",
    empty: "Nenhuma demanda na nuvem",
  };
  if (location.protocol === "file:" && status === "local") {
    window.__demandasSyncHint =
      window.__demandasSyncHint || "Abra " + APP_PUBLIC_URL;
  }
  let text = labels[status] || status;
  if ((status === "local" || status === "error") && window.__demandasSyncHint) {
    text = labels[status] + " — " + window.__demandasSyncHint;
  }
  el.textContent = text;
  el.title = text;
  el.dataset.status = status;
  el.hidden = false;
}

let refreshViewsTimer = null;
let lastDemandasContentFp = "";
let lastDemandasPresenceFp = "";

function demandasContentFingerprint(demandas) {
  return (demandas || [])
    .map((d) =>
      [
        d.id,
        d.updatedAt || "",
        d.status || "",
        d.responsavel || "",
        Array.isArray(d.projetistasExtra) ? d.projetistasExtra.join(",") : "",
        d.ordemEsteira ?? "",
        d.titulo || "",
        d.dataChegada || "",
      ].join("\0"),
    )
    .join("\n");
}

function demandasPresenceFingerprint(demandas) {
  return (demandas || [])
    .map((d) => {
      const eb = d.editingBy || {};
      return [d.id, eb.email || "", eb.since || ""].join("\0");
    })
    .join("\n");
}

function refreshPresenceBadgesOnly() {
  const boardRoots = [
    document.getElementById("boardEsteira"),
    document.getElementById("boardEsteiraB2b"),
  ].filter(Boolean);
  const byId = Object.fromEntries((state.demandas || []).map((d) => [d.id, d]));
  for (const root of boardRoots) {
    root.querySelectorAll(".card[data-id]").forEach((el) => {
      const d = byId[el.dataset.id];
      const eb = d ? normalizeEditingBy(d.editingBy) : null;
      el.classList.toggle("card--being-edited", !!eb);
      const slot = el.querySelector(".card__editing-by");
      if (!eb) {
        if (slot) slot.remove();
        return;
      }
      const html = cardEditingByHtml(d);
      if (!html) {
        if (slot) slot.remove();
        return;
      }
      if (slot) {
        slot.outerHTML = html;
      } else {
        const head = el.querySelector(".card__head") || el;
        head.insertAdjacentHTML("beforeend", html);
      }
    });
  }
  syncDemandaModalAlerts();
}

function refreshAllViews() {
  fillFilterCidadeSelect(document.getElementById("filterRegional")?.value || "");
  if (panels.esteira && !panels.esteira.hidden) renderBoard();
  updateEsteiraStatusLine();
  if (panels.dashboard && !panels.dashboard.hidden) renderDashboard();
  if (usuariosModalAberto()) renderUsuariosPanel();
  applyRoleUi({ light: true });
  syncDemandaModalAlerts();
  syncDemClickupUi();
}

/** Agrupa snapshots do Firestore para não recriar a UI várias vezes seguidas. */
function scheduleRefreshAllViews() {
  if (refreshViewsTimer) return;
  refreshViewsTimer = setTimeout(() => {
    refreshViewsTimer = null;
    refreshAllViews();
  }, 180);
}

function handleRemoteData(data) {
  const incoming = data?.demandas || [];
  const contentFp = demandasContentFingerprint(incoming);
  const presenceFp = demandasPresenceFingerprint(incoming);
  const contentSame = contentFp === lastDemandasContentFp && state.demandas?.length > 0;
  const presenceSame = presenceFp === lastDemandasPresenceFp;

  if (contentSame && presenceSame) return;

  // Só presença mudou: atualiza badges sem remigrar/remontar a esteira.
  if (contentSame && !presenceSame) {
    const byId = Object.fromEntries(incoming.map((d) => [d.id, d]));
    for (const d of state.demandas || []) {
      const rem = byId[d.id];
      if (!rem) continue;
      const eb = normalizeEditingBy(rem.editingBy);
      if (eb) d.editingBy = eb;
      else {
        delete d.editingBy;
        delete d.editingAt;
      }
    }
    lastDemandasPresenceFp = presenceFp;
    refreshPresenceBadgesOnly();
    return;
  }

  lastDemandasContentFp = contentFp;
  lastDemandasPresenceFp = presenceFp;
  applyLoadedState(data);
  scheduleRefreshAllViews();
}

function uid() {
  return crypto.randomUUID();
}

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

function parseDate(d) {
  if (!d) return null;
  const t = Date.parse(d + "T12:00:00");
  return Number.isNaN(t) ? null : t;
}

function addDaysISO(isoDate, days) {
  const t = parseDate(isoDate);
  if (t == null) return "";
  const n = Number(days);
  if (!Number.isFinite(n)) return "";
  const d = new Date(t);
  d.setDate(d.getDate() + n);
  const pad = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isoDatePart(iso) {
  const s = String(iso || "").trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

/** Data real de término (campo do formulário ou histórico ao concluir). */
function demandaDataTermino(d) {
  const dm = migrateDemanda(d);
  if (dm.dataTermino) return dm.dataTermino;
  if (isStatusConcluidoDemanda(dm)) return demandaDataConclusao(dm);
  return "";
}

function isDemandaEncerrada(dm) {
  const linha = inferLinhaEsteira(dm);
  if (linha === LINHA_ESTEIRA_B2B) return STATUS_B2B_CONCLUIDOS.has(dm.status);
  return ["conclusao", "reprovado"].includes(dm.status);
}

function isAtraso(d) {
  const dm = migrateDemanda(d);
  const prev = parseDate(dm.dataFimPrevista);
  if (!prev) return false;
  if (dm.linhaEsteira !== LINHA_ESTEIRA_B2B && dm.status === "reprovado") return false;
  if (isDemandaEncerrada(dm)) {
    const term = parseDate(demandaDataTermino(dm));
    return term != null && term > prev;
  }
  const hoje = parseDate(todayISODate());
  return hoje > prev;
}

/** Em atraso e ainda em andamento (obrigatório registrar motivos). */
function isAtrasoAtivo(d) {
  const dm = migrateDemanda(d);
  if (isDemandaEncerrada(dm)) return false;
  return isAtraso(dm);
}

function demandaPreviewFromForm() {
  return migrateDemanda({
    status: document.getElementById("demStatus")?.value || "novo",
    tipo: document.getElementById("demTipo")?.value || "",
    linhaEsteira: editingLinhaEsteira,
    dataChegada: document.getElementById("demDataChegada")?.value || "",
    dataFimPrevista: document.getElementById("demDataFimPrevista")?.value || "",
    dataTermino: document.getElementById("demDataTermino")?.value || "",
  });
}

function normalizeMotivoAtrasoDias(v) {
  if (v === "" || v == null) return "";
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return "";
  return Math.round(n);
}

function normalizeMotivosAtrasoItens(d) {
  if (Array.isArray(d?.motivosAtrasoItens)) {
    return d.motivosAtrasoItens
      .map((item) => ({
        motivo: String(item?.motivo || "").trim(),
        dias: normalizeMotivoAtrasoDias(item?.dias),
      }))
      .filter((item) => item.motivo || item.dias !== "");
  }
  const legado = String(d?.motivosAtraso || "").trim();
  if (legado) return [{ motivo: legado.slice(0, 500), dias: "" }];
  return [];
}

function formatMotivosAtrasoTexto(itens) {
  const list = normalizeMotivosAtrasoItens({ motivosAtrasoItens: itens });
  if (!list.length) return "";
  return list
    .map((item, i) => {
      const n = i + 1;
      const dias =
        item.dias === "" ? "" : ` (${item.dias === 1 ? "1 dia" : `${item.dias} dias`})`;
      return `Motivo ${n}: ${item.motivo}${dias}`;
    })
    .join(" · ");
}

function motivosAtrasoItensPreenchidos(itens) {
  return normalizeMotivosAtrasoItens({ motivosAtrasoItens: itens }).some((item) => item.motivo);
}

function sameMotivosAtrasoItens(a, b) {
  const na = normalizeMotivosAtrasoItens({ motivosAtrasoItens: a });
  const nb = normalizeMotivosAtrasoItens({ motivosAtrasoItens: b });
  return JSON.stringify(na) === JSON.stringify(nb);
}

function readMotivosAtrasoFromDom(opts = {}) {
  const forSave = opts.forSave === true;
  const root = document.getElementById("motivosAtrasoLista");
  if (!root) return forSave ? [] : [{ motivo: "", dias: "" }];
  const rows = [...root.querySelectorAll(".motivo-atraso-row")];
  const items = rows.map((row) => ({
    motivo: (row.querySelector(".motivo-atraso-texto")?.value || "").trim(),
    dias: normalizeMotivoAtrasoDias(row.querySelector(".motivo-atraso-dias")?.value),
  }));
  if (forSave) {
    return items.filter((item) => item.motivo || item.dias !== "");
  }
  return items.length ? items : [{ motivo: "", dias: "" }];
}

function mapMotivosAtrasoItensParaUi(itens) {
  if (!Array.isArray(itens) || !itens.length) return [{ motivo: "", dias: "" }];
  return itens.map((item) => ({
    motivo: String(item?.motivo || "").trim(),
    dias: normalizeMotivoAtrasoDias(item?.dias),
  }));
}

function renderMotivosAtrasoLista(itens) {
  const root = document.getElementById("motivosAtrasoLista");
  if (!root) return;
  const rows = mapMotivosAtrasoItensParaUi(itens);
  root.innerHTML = "";
  rows.forEach((item, i) => {
    const row = document.createElement("div");
    row.className = "motivo-atraso-row";
    row.innerHTML =
      `<label class="field field--grow">` +
      `<span>Motivo ${i + 1}</span>` +
      `<input type="text" class="motivo-atraso-texto" maxlength="500" placeholder="Descreva o motivo do atraso…" value="${escapeHtml(item.motivo)}" />` +
      `</label>` +
      `<label class="field field--dias">` +
      `<span>Dias</span>` +
      `<input type="number" class="motivo-atraso-dias" min="0" max="9999" step="1" placeholder="0" value="${item.dias === "" ? "" : String(item.dias)}" />` +
      `</label>` +
      `<button type="button" class="motivo-atraso-remove" aria-label="Remover motivo ${i + 1}" title="Remover motivo"${rows.length <= 1 ? " disabled" : ""}>×</button>`;
    root.appendChild(row);
  });
  refreshMotivosAtrasoRemoveButtons();
}

function refreshMotivosAtrasoRemoveButtons() {
  const root = document.getElementById("motivosAtrasoLista");
  if (!root) return;
  const btns = [...root.querySelectorAll(".motivo-atraso-remove")];
  btns.forEach((btn) => {
    btn.disabled = btns.length <= 1;
  });
}

function addMotivoAtrasoRow() {
  const lista = document.getElementById("motivosAtrasoLista");
  if (!lista) return;
  const current = readMotivosAtrasoFromDom();
  current.push({ motivo: "", dias: "" });
  renderMotivosAtrasoLista(current);
  const inputs = lista.querySelectorAll(".motivo-atraso-texto");
  inputs[inputs.length - 1]?.focus();
}

function bindMotivosAtrasoUi() {
  const form = document.getElementById("formDemanda");
  if (!form || form.dataset.motivosBound === "1") return;
  form.dataset.motivosBound = "1";

  form.addEventListener("click", (e) => {
    if (e.target.closest("#btnAddMotivoAtraso")) {
      e.preventDefault();
      e.stopPropagation();
      addMotivoAtrasoRow();
      return;
    }
    const btn = e.target.closest(".motivo-atraso-remove");
    if (!btn || btn.disabled) return;
    const root = document.getElementById("motivosAtrasoLista");
    const row = btn.closest(".motivo-atraso-row");
    if (!root || !row) return;
    e.preventDefault();
    row.remove();
    if (!root.querySelector(".motivo-atraso-row")) {
      renderMotivosAtrasoLista([]);
    } else {
      renumberMotivosAtrasoRows();
      refreshMotivosAtrasoRemoveButtons();
    }
  });
}

function renumberMotivosAtrasoRows() {
  const root = document.getElementById("motivosAtrasoLista");
  if (!root) return;
  root.querySelectorAll(".motivo-atraso-row").forEach((row, i) => {
    const label = row.querySelector(".field--grow > span");
    if (label) label.textContent = `Motivo ${i + 1}`;
    const btn = row.querySelector(".motivo-atraso-remove");
    if (btn) {
      btn.setAttribute("aria-label", `Remover motivo ${i + 1}`);
      btn.title = "Remover motivo";
    }
  });
}

function syncMotivosAtrasoField() {
  const fs = document.getElementById("fieldsetMotivosAtraso");
  const hint = document.getElementById("motivosAtrasoHint");
  const diasEl = document.getElementById("demAtrasoDiasResumo");
  if (!fs) return;
  const d = demandaPreviewFromForm();
  const show = isAtraso(d);
  const ativo = isAtrasoAtivo(d);
  fs.hidden = !show;
  if (hint) {
    hint.textContent = ativo
      ? "O prazo previsto já passou. Registre cada motivo e quantos dias ele representa."
      : "Projeto concluído após o prazo. Registre os motivos do atraso para histórico.";
  }
  if (diasEl) {
    const dias = demandaDiasAtraso(d);
    if (show && dias > 0) {
      diasEl.hidden = false;
      diasEl.innerHTML = `<strong>Atraso:</strong> ${escapeHtml(formatDiasAtrasoLabel(dias))}`;
    } else {
      diasEl.hidden = true;
      diasEl.textContent = "";
    }
  }
  if (show) {
    const root = document.getElementById("motivosAtrasoLista");
    if (root && !root.querySelector(".motivo-atraso-row")) {
      renderMotivosAtrasoLista([]);
    }
  }
}

/** Dias entre duas datas ISO (b − a); zero se inválido. */
function diasEntreDatasISO(isoA, isoB) {
  const a = parseDate(isoA);
  const b = parseDate(isoB);
  if (a == null || b == null) return 0;
  return Math.max(0, Math.round((b - a) / 86400000));
}

/** Projeto em Conclusão com prazo e término preenchidos; null se não comparável. */
function demandaEntregaComparavel(d) {
  const dm = migrateDemanda(d);
  if (!isStatusConcluidoDemanda(dm)) return null;
  const prev = dm.dataFimPrevista;
  if (!prev) return null;
  const fim = demandaDataTermino(dm);
  if (!fim) return null;
  const prevMs = parseDate(prev);
  const fimMs = parseDate(fim);
  if (prevMs == null || fimMs == null) return null;
  const atrasou = fimMs > prevMs;
  return {
    d: dm,
    dataPrevista: prev,
    dataTermino: fim,
    diasAtraso: atrasou ? diasEntreDatasISO(prev, fim) : 0,
    atrasou,
  };
}

/** Projeto concluído após o prazo previsto; null se não aplicável. */
function demandaEntregaAtraso(d) {
  const row = demandaEntregaComparavel(d);
  return row?.atrasou ? row : null;
}

/** Dias de atraso em relação ao prazo previsto (andamento ou concluído). */
function demandaDiasAtraso(d) {
  const dm = migrateDemanda(d);
  if (!isAtraso(dm)) return 0;
  const prev = dm.dataFimPrevista;
  if (!prev) return 0;
  if (isDemandaEncerrada(dm)) {
    const fim = demandaDataTermino(dm);
    return fim ? diasEntreDatasISO(prev, fim) : 0;
  }
  return diasEntreDatasISO(prev, todayISODate());
}

function formatDiasAtrasoLabel(n) {
  const dias = Math.max(0, Number(n) || 0);
  return dias === 1 ? "1 dia" : `${dias} dias`;
}

function demandaInicioContagemAberto(d) {
  const dm = migrateDemanda(d);
  return dm.dataChegada || (dm.createdAt || "").slice(0, 10);
}

/** Dias desde a chegada; congela na conclusão ou na reprovação. */
function demandaDataFimContagemAberto(d) {
  const dm = migrateDemanda(d);
  if (isStatusConcluidoDemanda(dm)) {
    return demandaDataTermino(dm) || demandaDataConclusao(dm) || "";
  }
  if (dm.status === "reprovado") {
    const hist = Array.isArray(dm.historicoStatus) ? dm.historicoStatus : [];
    const seg = [...hist].reverse().find((s) => s.status === "reprovado") || hist[hist.length - 1];
    if (seg?.inicio) return isoDatePart(seg.inicio);
    if (seg?.fim) return isoDatePart(seg.fim);
    return isoDatePart(dm.updatedAt) || isoDatePart(dm.createdAt);
  }
  return "";
}

function demandaDiasAberto(d) {
  const dm = migrateDemanda(d);
  const inicio = demandaInicioContagemAberto(dm);
  if (!inicio) return 0;
  const fim = demandaDataFimContagemAberto(dm);
  if (fim) return diasEntreDatasISO(inicio, fim);
  return diasEntreDatasISO(inicio, todayISODate());
}

function formatDiasAbertoLabel(n) {
  return formatDiasAtrasoLabel(n);
}

function syncDiasAbertoResumo() {
  const el = document.getElementById("demDiasAbertoResumo");
  if (!el) return;
  const d = demandaPreviewFromForm();
  const dias = demandaDiasAberto(d);
  const concluido = isStatusConcluidoDemanda(d);
  const reprovado = d.status === "reprovado";
  const inicio = demandaInicioContagemAberto(d);
  if (!inicio) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  const sufixo = reprovado
    ? " (congelado na reprovação)"
    : concluido
      ? " (congelado na conclusão)"
      : " — atualiza a cada dia";
  el.innerHTML =
    `<strong>Dias aberto:</strong> ${escapeHtml(formatDiasAbertoLabel(dias))}` +
    `<span class="muted small">${escapeHtml(sufixo)}</span>`;
}

function statusHistoryPush(demanda, newStatus, now = new Date().toISOString()) {
  const hist = Array.isArray(demanda.historicoStatus) ? [...demanda.historicoStatus] : [];
  const last = hist[hist.length - 1];
  if (last && !last.fim) last.fim = now;
  if (!last || last.status !== newStatus) hist.push({ status: newStatus, inicio: now, fim: "", observacao: "" });
  return hist;
}

function normalizeHistoricoStatus(hist) {
  if (!Array.isArray(hist)) return [];
  return hist.map((seg) => ({
    status: seg.status,
    inicio: seg.inicio || "",
    fim: seg.fim || "",
    observacao: typeof seg.observacao === "string" ? seg.observacao : "",
  }));
}

/** Converte ISO → valor de `<input type="datetime-local">`. */
function isoToDatetimeLocal(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
    if (!m) return "";
    return `${m[1]}-${m[2]}-${m[3]}T${m[4] || "00"}:${m[5] || "00"}`;
  }
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function datetimeLocalToIso(val) {
  const s = String(val || "").trim();
  if (!s) return "";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

function validateHistoricoStatus(hist, statusAtual, linha = editingLinhaEsteira) {
  const h = normalizeHistoricoStatus(hist);
  if (!h.length) return null;
  for (let i = 0; i < h.length; i++) {
    const seg = h[i];
    const lab = labelStatus(seg.status, linha);
    if (!seg.inicio) return `Informe a data de início em "${lab}".`;
    const start = Date.parse(seg.inicio);
    if (Number.isNaN(start)) return `Data de início inválida em "${lab}".`;
    const isLast = i === h.length - 1;
    const faseAberta = isLast && seg.status === statusAtual && !seg.fim;
    if (!seg.fim && !faseAberta) {
      return `Informe a data de fim em "${lab}" (ou deixe em branco só na fase atual em andamento).`;
    }
    if (seg.fim) {
      const end = Date.parse(seg.fim);
      if (Number.isNaN(end)) return `Data de fim inválida em "${lab}".`;
      if (end < start) return `Em "${lab}", a data de fim não pode ser anterior ao início.`;
    }
  }
  return null;
}
