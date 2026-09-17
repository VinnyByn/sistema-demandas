/**
 * Firestore — uma demanda por documento em `demandas/{id}`.
 * Diárias e projetistas em `demandasSistema/meta`.
 * Legado: `demandasSistema/state` (payload) — só leitura + migração manual.
 */
const DemandasFirebase = (function () {
  const STORAGE_KEY = "demandasProjetos_v1";
  const COL_DEMANDAS = "demandas";
  const COL_SYSTEM = "demandasSistema";
  const DOC_META = "meta";
  const DOC_LEGACY = "state";
  const DOC_ROLES = "roles";
  const BATCH_SIZE = 450;
  const REQ_TIMEOUT_MS = 15000;
  const LISTENER_TIMEOUT_MS = 12000;

  let db = null;
  let metaRef = null;
  let legacyRef = null;
  let rolesRef = null;
  let onStatusFn = () => {};
  let onDataFn = null;
  let onRolesFn = null;
  let unsubDemandas = null;
  let unsubMeta = null;
  let unsubRoles = null;
  let snapDemandas = [];
  let snapMeta = { diarias: [], projetistas: {}, deletedDemandaIds: [], deletedDiariaIds: [] };
  let metaLoaded = false;
  let demandasLoaded = false;
  let legacyHintChecked = false;
  let autoMigrateAttempted = false;
  let listenerTimeoutId = null;
  /** Demandas com upsert em andamento — não devem ser dropadas pelo merge mesmo
   * que ainda não estejam no snapshot. Após confirmação do servidor, aguardamos
   * uma janela curta para o listener entregar a versão antes de remover daqui. */
  const inflightUpserts = new Set();
  const INFLIGHT_LINGER_MS = 1500;
  /** Meta (diárias/projetistas) com persistMeta em voo — evita perder gravação recente no merge. */
  let inflightMeta = null;
  const INFLIGHT_META_MS = 3000;
  /** Após gravar roles/disabled/purged — ignora snapshot atrasado que reaplicava «Desabilitado». */
  let inflightAccessUntil = 0;
  const INFLIGHT_ACCESS_MS = 4000;

  function cfg() {
    return window.FIREBASE_CONFIG || {};
  }

  function isConfigured() {
    const c = cfg();
    if (!c.apiKey || !c.projectId) return false;
    return !String(c.apiKey).includes("COLOQUE");
  }

  function emptyState() {
    return {
      demandas: [],
      diarias: [],
      projetistas: {},
      pendingDeleteDemandaIds: [],
      deletedDemandaIds: [],
      deletedDiariaIds: [],
    };
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function saveLocal(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn("Cópia local:", e);
    }
  }

  function normalizePayload(data) {
    if (!data || typeof data !== "object") return emptyState();
    return {
      demandas: Array.isArray(data.demandas) ? data.demandas : [],
      diarias: Array.isArray(data.diarias) ? data.diarias : [],
      projetistas: data.projetistas && typeof data.projetistas === "object" ? data.projetistas : {},
      pendingDeleteDemandaIds: Array.isArray(data.pendingDeleteDemandaIds)
        ? data.pendingDeleteDemandaIds.filter((id) => id)
        : [],
      deletedDemandaIds: Array.isArray(data.deletedDemandaIds)
        ? data.deletedDemandaIds.filter((id) => id)
        : [],
      deletedDiariaIds: Array.isArray(data.deletedDiariaIds)
        ? data.deletedDiariaIds.filter((id) => id)
        : [],
    };
  }

  function deleteTombstoneSet(local) {
    const n = normalizePayload(local);
    return new Set([...(n.pendingDeleteDemandaIds || []), ...(n.deletedDemandaIds || [])]);
  }

  function pendingDeleteSet(local) {
    return deleteTombstoneSet(local);
  }

  function filterDemandasNotPendingDelete(demandas, pending) {
    if (!pending?.size) return demandas || [];
    return (demandas || []).filter((d) => d?.id && !pending.has(d.id));
  }

  function itemTime(item) {
    const t = Date.parse(item?.updatedAt || item?.createdAt || 0);
    return Number.isFinite(t) ? t : 0;
  }

  function mergeById(a, b) {
    const map = new Map();
    for (const item of [...(b || []), ...(a || [])]) {
      if (!item?.id) continue;
      const prev = map.get(item.id);
      if (!prev || itemTime(item) >= itemTime(prev)) map.set(item.id, item);
    }
    return [...map.values()];
  }

  function syncPresenceFieldsFromRemote(merged, remote) {
    if (remote.editingBy) merged.editingBy = remote.editingBy;
    else delete merged.editingBy;
    if (remote.editingAt) merged.editingAt = remote.editingAt;
    else delete merged.editingAt;
  }

  /** Demandas: em empate de updatedAt, a nuvem ganha; presença segue sempre o remoto. */
  function mergeDemandaById(local, remote, pendingDeletes = new Set(), opts = {}) {
    const trustRemote = !!opts.trustRemote;
    const map = new Map();
    const remoteIds = new Set();
    for (const d of remote || []) {
      if (d?.id) remoteIds.add(d.id);
    }
    for (const d of local || []) {
      if (!d?.id) continue;
      if (pendingDeletes.has(d.id)) continue;
      if (trustRemote && !remoteIds.has(d.id) && !inflightUpserts.has(d.id)) {
        // Documento não está no snapshot da nuvem e não há upsert em voo:
        // foi excluído remotamente. Não preserva a cópia local.
        continue;
      }
      map.set(d.id, d);
    }
    for (const d of remote || []) {
      if (!d?.id) continue;
      if (pendingDeletes.has(d.id)) continue;
      const prev = map.get(d.id);
      if (!prev) {
        map.set(d.id, d);
        continue;
      }
      const tr = itemTime(d);
      const tl = itemTime(prev);
      if (tr > tl) {
        map.set(d.id, d);
      } else if (tr === tl) {
        const merged = { ...prev, ...d };
        syncPresenceFieldsFromRemote(merged, d);
        map.set(d.id, merged);
      }
    }
    return [...map.values()];
  }

  function projetistaEntryTime(entry) {
    if (!entry) return 0;
    const t = itemTime(entry);
    if (t) return t;
    const d = Date.parse(entry.desde || 0);
    return Number.isFinite(d) ? d : 0;
  }

  function filterDiariasNotDeleted(diarias, tombstones) {
    if (!tombstones?.size) return diarias || [];
    return (diarias || []).filter((d) => d?.id && !tombstones.has(d.id));
  }

  /** Diárias: última alteração vence; tombstones impedem ressurreição de excluídas. */
  function mergeDiariasById(local, remote, tombstones = new Set(), opts = {}) {
    const map = new Map();
    const inflight = filterDiariasNotDeleted(inflightMeta?.diarias, tombstones);
    const inflightIds = new Set(inflight.map((d) => d.id));
    const remoteList = filterDiariasNotDeleted(remote, tombstones);
    const localList = filterDiariasNotDeleted(local, tombstones);

    for (const d of remoteList) {
      map.set(d.id, d);
    }

    for (const d of localList) {
      const prev = map.get(d.id);
      if (prev) {
        if (itemTime(d) >= itemTime(prev)) map.set(d.id, d);
        continue;
      }
      if (opts.trustRemote && !inflightIds.has(d.id) && !itemTime(d)) continue;
      map.set(d.id, d);
    }

    for (const d of inflight) {
      const prev = map.get(d.id);
      if (!prev || itemTime(d) >= itemTime(prev)) map.set(d.id, d);
    }

    return [...map.values()];
  }

  /** Projetistas: última alteração vence por nome (nuvem + local + gravação em voo). */
  function mergeProjetistasByNome(local, remote) {
    const out = {};
    const names = new Set([
      ...Object.keys(remote || {}),
      ...Object.keys(local || {}),
      ...Object.keys(inflightMeta?.projetistas || {}),
    ]);
    for (const nome of names) {
      const candidates = [
        remote?.[nome],
        local?.[nome],
        inflightMeta?.projetistas?.[nome],
      ].filter(Boolean);
      if (!candidates.length) continue;
      let best = candidates[0];
      for (let i = 1; i < candidates.length; i += 1) {
        if (projetistaEntryTime(candidates[i]) >= projetistaEntryTime(best)) best = candidates[i];
      }
      out[nome] = best;
    }
    return out;
  }

  function mergeState(remote, local, opts = {}) {
    const r = normalizePayload(remote);
    const l = normalizePayload(local);
    if (!local) {
      return {
        ...r,
        demandas: filterDemandasNotPendingDelete(r.demandas, pendingDeleteSet(r)),
      };
    }
    if (!remote) return l;
    const remoteTombstones = new Set(r.deletedDemandaIds || []);
    const localTombstones = pendingDeleteSet(l);
    const allTombstones = new Set([...localTombstones, ...remoteTombstones]);
    const mergedDeleted = [...new Set([...(l.deletedDemandaIds || []), ...remoteTombstones])];
    const mergedDeletedDiarias = [...new Set([...(l.deletedDiariaIds || []), ...(r.deletedDiariaIds || [])])];
    const diariaTombstones = new Set(mergedDeletedDiarias);
    return {
      demandas: mergeDemandaById(l.demandas, r.demandas, allTombstones, opts),
      diarias: mergeDiariasById(l.diarias, r.diarias, diariaTombstones, opts),
      projetistas: mergeProjetistasByNome(l.projetistas, r.projetistas),
      pendingDeleteDemandaIds: l.pendingDeleteDemandaIds,
      deletedDemandaIds: mergedDeleted,
      deletedDiariaIds: mergedDeletedDiarias,
    };
  }

  function pruneConfirmedDeletes(payload, remoteDemandas) {
    const remoteIds = new Set((remoteDemandas || []).map((d) => d.id));
    const wasPending = payload.pendingDeleteDemandaIds || [];
    const stillPending = wasPending.filter((id) => remoteIds.has(id));
    const confirmed = wasPending.filter((id) => !remoteIds.has(id));
    const deletedDemandaIds = [...new Set([...(payload.deletedDemandaIds || []), ...confirmed])];
    const tombstones = new Set([...stillPending, ...deletedDemandaIds]);
    return {
      ...payload,
      pendingDeleteDemandaIds: stillPending,
      deletedDemandaIds,
      demandas: filterDemandasNotPendingDelete(payload.demandas, tombstones),
    };
  }

  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
    ]);
  }

  function demandaToFirestore(d) {
    const copy = { ...d };
    delete copy.id;
    delete copy.editingBy;
    delete copy.editingAt;
    delete copy.__isMigrated;
    if (!copy.alertaSnooze) {
      copy.alertaSnooze = firebase.firestore.FieldValue.delete();
    }
    if (!copy.clickup) {
      copy.clickup = firebase.firestore.FieldValue.delete();
    }
    if (!copy.clickupTaskId) {
      copy.clickupTaskId = firebase.firestore.FieldValue.delete();
    }
    return copy;
  }

  function demandaFromFirestore(id, data) {
    if (!data || typeof data !== "object") return null;
    return { id, ...data };
  }

  async function checkLegacyHint() {
    if (legacyHintChecked || snapDemandas.length > 0 || !legacyRef) return;
    legacyHintChecked = true;
    try {
      const legacy = await readLegacyPayload();
      if (legacy?.demandas?.length) {
        window.__demandasSyncHint =
          "Dados no formato antigo (state). Clique 5× em «Projetos» no topo para migrar.";
      }
    } catch (_) {}
  }

  async function tryAutoMigrateLegacy() {
    if (autoMigrateAttempted || snapDemandas.length > 0) return;
    autoMigrateAttempted = true;
    try {
      const res = await migrateLegacyPayload({ force: false });
      if (res.migrated > 0) window.__demandasSyncHint = "";
    } catch (e) {
      console.warn("Migração automática legado:", e);
    }
  }

  function clearListenerTimeout() {
    if (listenerTimeoutId) {
      clearTimeout(listenerTimeoutId);
      listenerTimeoutId = null;
    }
  }

  function scheduleListenerTimeout() {
    clearListenerTimeout();
    listenerTimeoutId = setTimeout(() => {
      if (demandasLoaded && metaLoaded) return;
      console.warn("Firestore: timeout aguardando snapshots", {
        demandasLoaded,
        metaLoaded,
      });
      demandasLoaded = true;
      metaLoaded = true;
      onStatusFn("error");
      window.__demandasSyncHint =
        window.__demandasSyncHint ||
        "Tempo esgotado ao carregar a nuvem. Exibindo cópia local; verifique rede e permissões.";
      emitLocalFallback();
    }, LISTENER_TIMEOUT_MS);
  }

  let saveLocalTimer = null;
  let saveLocalPending = null;

  function scheduleSaveLocal(payload) {
    saveLocalPending = payload;
    if (saveLocalTimer) return;
    saveLocalTimer = setTimeout(() => {
      saveLocalTimer = null;
      const p = saveLocalPending;
      saveLocalPending = null;
      if (p) saveLocal(p);
    }, 500);
  }

  function emitToUi() {
    if (!onDataFn) return;
    if (!demandasLoaded || !metaLoaded) return;
    clearListenerTimeout();
    const remote = { demandas: snapDemandas, ...snapMeta };
    const merged = pruneConfirmedDeletes(
      mergeState(remote, loadLocal(), { trustRemote: true }),
      snapDemandas,
    );
    onDataFn(merged);
    scheduleSaveLocal(merged);
    onStatusFn("synced");
    if (snapDemandas.length === 0 && deleteTombstoneSet(loadLocal()).size === 0) {
      void checkLegacyHint();
    }
  }

  function emitLocalFallback() {
    if (!onDataFn) return;
    const merged = pruneConfirmedDeletes(
      mergeState({ demandas: snapDemandas, ...snapMeta }, loadLocal()),
      snapDemandas,
    );
    onDataFn(merged);
    scheduleSaveLocal(merged);
  }

  function getDb() {
    if (db) return db;
    const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(cfg());
    db = firebase.firestore(app);
    try {
      db.settings({ experimentalForceLongPolling: true });
    } catch (_) {}
    metaRef = db.collection(COL_SYSTEM).doc(DOC_META);
    legacyRef = db.collection(COL_SYSTEM).doc(DOC_LEGACY);
    rolesRef = db.collection(COL_SYSTEM).doc(DOC_ROLES);
    return db;
  }

  function normalizeRolesMap(raw) {
    const out = {};
    if (!raw || typeof raw !== "object") return out;
    for (const [email, role] of Object.entries(raw)) {
      const e = String(email || "")
        .trim()
        .toLowerCase();
      if (!e) continue;
      out[e] = String(role || "")
        .trim()
        .toLowerCase();
    }
    return out;
  }

  function normalizeFlagMap(raw) {
    const out = {};
    if (!raw || typeof raw !== "object") return out;
    for (const [email, flag] of Object.entries(raw)) {
      const e = String(email || "")
        .trim()
        .toLowerCase();
      if (!e) continue;
      if (flag === true || flag === 1 || flag === "1" || String(flag).toLowerCase() === "true") {
        out[e] = true;
      }
    }
    return out;
  }

  function applyAccessMaps({ roles, disabled, purged, regionals, source = "merge" } = {}) {
    const hasRoles = roles && typeof roles === "object";
    const hasDisabled = disabled !== undefined && disabled !== null && typeof disabled === "object";
    const hasPurged = purged !== undefined && purged !== null && typeof purged === "object";
    const hasRegionals = regionals !== undefined && regionals !== null && typeof regionals === "object";

    if (hasPurged && typeof DemandasRoles !== "undefined" && DemandasRoles.setPurgedMap) {
      if (source === "remote" || source === "replace") {
        DemandasRoles.setPurgedMap(normalizeFlagMap(purged));
      } else {
        DemandasRoles.setPurgedMap({
          ...(DemandasRoles.getPurgedMap?.() || {}),
          ...normalizeFlagMap(purged),
        });
      }
    }

    if (hasRoles) {
      const incoming = normalizeRolesMap(roles);
      const local =
        typeof DemandasRoles !== "undefined" && DemandasRoles.getRolesMap
          ? normalizeRolesMap(DemandasRoles.getRolesMap())
          : {};
      let next = local;
      if (source === "remote") {
        if (!Object.keys(incoming).length) {
          /* mantém local */
        } else {
          next = incoming;
        }
      } else if (source === "replace") {
        next = incoming;
      } else if (Object.keys(incoming).length) {
        next = { ...local, ...incoming };
      }
      if (typeof DemandasRoles !== "undefined" && DemandasRoles.setRolesMap) {
        DemandasRoles.setRolesMap(next);
      }
    }

    if (hasDisabled && typeof DemandasRoles !== "undefined" && DemandasRoles.setDisabledMap) {
      if (source === "remote" || source === "replace") {
        DemandasRoles.setDisabledMap(normalizeFlagMap(disabled));
      } else {
        DemandasRoles.setDisabledMap({
          ...(DemandasRoles.getDisabledMap?.() || {}),
          ...normalizeFlagMap(disabled),
        });
      }
    }

    if (hasRegionals && typeof DemandasRoles !== "undefined" && DemandasRoles.setRegionalsMap) {
      const incoming = DemandasRoles.normalizeRegionalValue
        ? Object.fromEntries(
            Object.entries(regionals).map(([e, r]) => [
              String(e || "")
                .trim()
                .toLowerCase(),
              DemandasRoles.normalizeRegionalValue(r),
            ]),
          )
        : regionals;
      if (source === "remote" || source === "replace") {
        DemandasRoles.setRegionalsMap(incoming);
      } else {
        DemandasRoles.setRegionalsMap({
          ...(DemandasRoles.getRegionalsMap?.() || {}),
          ...incoming,
        });
      }
    }

    if (typeof onRolesFn === "function") {
      onRolesFn(DemandasRoles?.getRolesMap?.() || {});
    }
  }

  function emitRoles(map, { source = "merge" } = {}) {
    applyAccessMaps({ roles: map, source });
  }

  function emitAccessFromMeta(d, source = "remote") {
    if (!d || typeof d !== "object") return;
    // Sempre substitui disabled/purged quando o doc meta chega: campo ausente = mapa vazio
    // (senão «Habilitar» falhava se o Firestore omitisse disabledUsers:{}).
    const hasAccessFields =
      Object.prototype.hasOwnProperty.call(d, "roles") ||
      Object.prototype.hasOwnProperty.call(d, "disabledUsers") ||
      Object.prototype.hasOwnProperty.call(d, "purgedUsers") ||
      Object.prototype.hasOwnProperty.call(d, "userRegionals");
    if (!hasAccessFields) return;
    applyAccessMaps({
      roles: d.roles && typeof d.roles === "object" ? d.roles : undefined,
      disabled: Object.prototype.hasOwnProperty.call(d, "disabledUsers")
        ? d.disabledUsers && typeof d.disabledUsers === "object"
          ? d.disabledUsers
          : {}
        : Object.prototype.hasOwnProperty.call(d, "roles")
          ? {}
          : undefined,
      purged: Object.prototype.hasOwnProperty.call(d, "purgedUsers")
        ? d.purgedUsers && typeof d.purgedUsers === "object"
          ? d.purgedUsers
          : {}
        : Object.prototype.hasOwnProperty.call(d, "roles")
          ? {}
          : undefined,
      regionals: Object.prototype.hasOwnProperty.call(d, "userRegionals")
        ? d.userRegionals && typeof d.userRegionals === "object"
          ? d.userRegionals
          : {}
        : undefined,
      source,
    });
  }

  function waitForAuthUser(timeoutMs = 8000) {
    const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(cfg());
    const auth = firebase.auth(app);
    if (auth.currentUser) return Promise.resolve(auth.currentUser);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        unsub();
        reject(new Error("Faça login para acessar os dados."));
      }, timeoutMs);
      const unsub = auth.onAuthStateChanged((user) => {
        if (!user) return;
        clearTimeout(timer);
        unsub();
        resolve(user);
      });
    });
  }

  async function ensureAuth() {
    await waitForAuthUser();
  }

  function startListeners(onData) {
    onDataFn = onData;
    const database = getDb();
    demandasLoaded = false;
    metaLoaded = false;
    scheduleListenerTimeout();

    if (unsubDemandas) unsubDemandas();
    unsubDemandas = database.collection(COL_DEMANDAS).onSnapshot(
      (snap) => {
        snapDemandas = [];
        snap.forEach((doc) => {
          const d = demandaFromFirestore(doc.id, doc.data());
          if (d) snapDemandas.push(d);
        });
        demandasLoaded = true;
        emitToUi();
      },
      (err) => {
        console.warn("Listener demandas:", err);
        demandasLoaded = true;
        onStatusFn("error");
        window.__demandasSyncHint = err.message || "Erro ao sincronizar demandas";
        emitLocalFallback();
      },
    );

    if (unsubMeta) unsubMeta();
    unsubMeta = metaRef.onSnapshot(
      (snap) => {
        if (snap.exists) {
          const d = snap.data();
          snapMeta = {
            diarias: Array.isArray(d.diarias) ? d.diarias : [],
            projetistas: d.projetistas && typeof d.projetistas === "object" ? d.projetistas : {},
            deletedDemandaIds: Array.isArray(d.deletedDemandaIds)
              ? d.deletedDemandaIds.filter((id) => typeof id === "string" && id)
              : [],
            deletedDiariaIds: Array.isArray(d.deletedDiariaIds)
              ? d.deletedDiariaIds.filter((id) => typeof id === "string" && id)
              : [],
          };
          if (Date.now() < inflightAccessUntil) {
            /* gravação local de acesso em voo — não reaplicar mapa antigo */
          } else if (d.roles && typeof d.roles === "object") {
            emitAccessFromMeta(d, "remote");
          } else if (d.disabledUsers || d.purgedUsers) {
            emitAccessFromMeta(d, "remote");
          }
          if (inflightMeta && Date.now() < inflightMeta.until) {
            /* mantém inflight até timeout — merge usa inflightMeta */
          } else {
            inflightMeta = null;
          }
        } else {
          snapMeta = { diarias: [], projetistas: {}, deletedDemandaIds: [], deletedDiariaIds: [] };
        }
        metaLoaded = true;
        emitToUi();
      },
      (err) => {
        console.warn("Listener meta:", err);
        metaLoaded = true;
        snapMeta = { diarias: [], projetistas: {}, deletedDemandaIds: [], deletedDiariaIds: [] };
        onStatusFn("error");
        window.__demandasSyncHint =
          window.__demandasSyncHint || err.message || "Erro ao sincronizar meta";
        emitLocalFallback();
      },
    );

    // Doc dedicado roles = espelho opcional. Fonte de verdade dos acessos: meta.
    // Não reaplicar daqui — um espelho atrasado (ex.: disabledUsers antigo) desfazia o «Habilitar».
    if (unsubRoles) {
      unsubRoles();
      unsubRoles = null;
    }
  }

  async function ensureMetaDoc(initial) {
    const snap = await withTimeout(metaRef.get(), REQ_TIMEOUT_MS);
    if (snap.exists) return;
    await metaRef.set({
      diarias: initial.diarias || [],
      projetistas: initial.projetistas || {},
      deletedDiariaIds: initial.deletedDiariaIds || [],
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }

  async function readLegacyPayload() {
    const snap = await withTimeout(legacyRef.get(), REQ_TIMEOUT_MS);
    if (!snap.exists) return null;
    const d = snap.data();
    if (d.payload) {
      try {
        return normalizePayload(JSON.parse(d.payload));
      } catch {
        return emptyState();
      }
    }
    return normalizePayload(d);
  }

  async function upsertDemanda(demanda) {
    if (!demanda?.id) return;
    inflightUpserts.add(demanda.id);
    try {
      await ensureAuth();
      onStatusFn("saving");
      const ref = getDb().collection(COL_DEMANDAS).doc(demanda.id);
      await withTimeout(
        ref.set(
          {
            ...demandaToFirestore(demanda),
            updatedAt: demanda.updatedAt || new Date().toISOString(),
            editingBy: firebase.firestore.FieldValue.delete(),
            editingAt: firebase.firestore.FieldValue.delete(),
          },
          { merge: true },
        ),
        REQ_TIMEOUT_MS,
      );
      onStatusFn("synced");
    } finally {
      // Mantém a marca por mais um instante para o listener entregar a versão
      // sincronizada antes da próxima passagem de merge.
      setTimeout(() => inflightUpserts.delete(demanda.id), INFLIGHT_LINGER_MS);
    }
  }

  async function deleteDemanda(id) {
    if (!id) return;
    const local = loadLocal() || emptyState();
    const norm = normalizePayload(local);
    if (!norm.pendingDeleteDemandaIds.includes(id)) norm.pendingDeleteDemandaIds.push(id);
    if (!norm.deletedDemandaIds.includes(id)) norm.deletedDemandaIds.push(id);
    norm.demandas = (norm.demandas || []).filter((d) => d.id !== id);
    saveLocal(norm);
    await ensureAuth();
    onStatusFn("saving");
    await withTimeout(getDb().collection(COL_DEMANDAS).doc(id).delete(), REQ_TIMEOUT_MS);
    try {
      await withTimeout(
        metaRef.set(
          {
            deletedDemandaIds: firebase.firestore.FieldValue.arrayUnion(id),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        ),
        REQ_TIMEOUT_MS,
      );
    } catch (e) {
      console.warn("Tombstone na nuvem:", e);
    }
    onStatusFn("synced");
  }

  /** Presença de edição — não altera updatedAt da demanda. */
  async function patchDemandaPresence(demandaId, editingBy) {
    if (!demandaId) return;
    try {
      await ensureAuth();
      const ref = getDb().collection(COL_DEMANDAS).doc(demandaId);
      const data = editingBy
        ? {
            editingBy,
            editingAt: editingBy.since || new Date().toISOString(),
          }
        : {
            editingBy: firebase.firestore.FieldValue.delete(),
            editingAt: firebase.firestore.FieldValue.delete(),
          };
      await withTimeout(ref.set(data, { merge: true }), REQ_TIMEOUT_MS);
    } catch (e) {
      console.warn("patchDemandaPresence:", e);
      throw e;
    }
  }

  async function persistMeta(meta) {
    await ensureAuth();
    onStatusFn("saving");
    inflightMeta = {
      diarias: meta.diarias || [],
      projetistas: meta.projetistas || {},
      deletedDiariaIds: meta.deletedDiariaIds || [],
      until: Date.now() + INFLIGHT_META_MS,
    };
    try {
      await withTimeout(
        metaRef.set(
          {
            diarias: meta.diarias || [],
            projetistas: meta.projetistas || {},
            deletedDiariaIds: meta.deletedDiariaIds || [],
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        ),
        REQ_TIMEOUT_MS,
      );
      onStatusFn("synced");
    } finally {
      setTimeout(() => {
        if (inflightMeta && Date.now() >= inflightMeta.until) inflightMeta = null;
      }, INFLIGHT_META_MS);
    }
  }

  async function ensureRolesDoc() {
    if (!metaRef) getDb();
    const seedBase = { ...(window.DEMANDAS_ROLES_SEED || {}) };
    let remote = {};
    let metaData = null;
    try {
      const snap = await withTimeout(metaRef.get(), REQ_TIMEOUT_MS);
      if (snap.exists) {
        metaData = snap.data() || {};
        remote = normalizeRolesMap(metaData.roles);
      }
    } catch (e) {
      console.warn("Ler roles em meta:", e);
    }
    if (metaData) emitAccessFromMeta(metaData, "remote");
    const merged =
      typeof DemandasRoles !== "undefined" && DemandasRoles.getRolesMap
        ? DemandasRoles.getRolesMap()
        : { ...seedBase, ...remote };
    const missing = Object.keys(seedBase).filter((e) => !remote[e] && !DemandasRoles?.getPurgedMap?.()?.[e]);
    const email = String(
      (typeof DemandasAuth !== "undefined" && DemandasAuth.currentUser?.()?.email) || "",
    )
      .trim()
      .toLowerCase();
    const isAdmin =
      email === String(window.DEMANDAS_ADMIN_EMAIL || "").trim().toLowerCase() ||
      remote[email] === "admin" ||
      seedBase[email] === "admin" ||
      merged[email] === "admin";
    if ((missing.length || !Object.keys(remote).length) && isAdmin) {
      try {
        const disabled =
          typeof DemandasRoles !== "undefined" && DemandasRoles.getDisabledMap
            ? DemandasRoles.getDisabledMap()
            : {};
        const purged =
          typeof DemandasRoles !== "undefined" && DemandasRoles.getPurgedMap
            ? DemandasRoles.getPurgedMap()
            : {};
        const regionals =
          typeof DemandasRoles !== "undefined" && DemandasRoles.getRegionalsMap
            ? DemandasRoles.getRegionalsMap()
            : {};
        await writeAccessMaps(metaRef, {
          roles: merged,
          disabled,
          purged,
          regionals,
        });
        applyAccessMaps({
          roles: merged,
          disabled,
          purged,
          regionals,
          source: "replace",
        });
      } catch (e) {
        console.warn("Backfill roles em meta:", e);
      }
    }
  }

  function mapKeyDeletes(prevMap, nextMap, fieldName) {
    const patch = {};
    const prev = prevMap && typeof prevMap === "object" ? prevMap : {};
    const next = nextMap && typeof nextMap === "object" ? nextMap : {};
    for (const key of Object.keys(prev)) {
      if (!Object.prototype.hasOwnProperty.call(next, key)) {
        patch[`${fieldName}.${key}`] = firebase.firestore.FieldValue.delete();
      }
    }
    return patch;
  }

  async function writeAccessMaps(targetRef, { roles, disabled, purged, regionals }) {
    if (!targetRef) return;
    const nextRoles = roles || {};
    const nextDisabled = disabled || {};
    const nextPurged = purged || {};
    const nextRegionals = regionals || {};
    const payload = {
      roles: nextRoles,
      disabledUsers: nextDisabled,
      purgedUsers: nextPurged,
      userRegionals: nextRegionals,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    // update() com mapa novo deveria substituir o campo; set({merge:true}) NÃO remove chaves.
    // Para «Habilitar», ainda forçamos FieldValue.delete nas chaves que sumiram
    // (mapa vazio {} às vezes não limpa chaves antigas no documento).
    const snap = await withTimeout(targetRef.get(), REQ_TIMEOUT_MS);
    if (snap.exists) {
      const prev = snap.data() || {};
      await withTimeout(targetRef.update(payload), REQ_TIMEOUT_MS);
      const delPatch = {
        ...mapKeyDeletes(prev.disabledUsers, nextDisabled, "disabledUsers"),
        ...mapKeyDeletes(prev.purgedUsers, nextPurged, "purgedUsers"),
        ...mapKeyDeletes(prev.roles, nextRoles, "roles"),
        ...mapKeyDeletes(prev.userRegionals, nextRegionals, "userRegionals"),
      };
      if (Object.keys(delPatch).length) {
        await withTimeout(targetRef.update(delPatch), REQ_TIMEOUT_MS);
      }
    } else {
      await withTimeout(targetRef.set(payload), REQ_TIMEOUT_MS);
    }
  }

  async function persistRoles(roles) {
    await ensureAuth();
    if (!metaRef) getDb();
    const map = normalizeRolesMap(roles);
    const adminEmail = String(window.DEMANDAS_ADMIN_EMAIL || "")
      .trim()
      .toLowerCase();
    if (adminEmail) map[adminEmail] = "admin";
    const disabled =
      typeof DemandasRoles !== "undefined" && DemandasRoles.getDisabledMap
        ? normalizeFlagMap(DemandasRoles.getDisabledMap())
        : {};
    const purged =
      typeof DemandasRoles !== "undefined" && DemandasRoles.getPurgedMap
        ? normalizeFlagMap(DemandasRoles.getPurgedMap())
        : {};
    const regionals =
      typeof DemandasRoles !== "undefined" && DemandasRoles.getRegionalsMap
        ? DemandasRoles.getRegionalsMap()
        : {};
    if (adminEmail) {
      delete disabled[adminEmail];
      delete purged[adminEmail];
    }
    onStatusFn("saving");
    inflightAccessUntil = Date.now() + INFLIGHT_ACCESS_MS;
    try {
      await writeAccessMaps(metaRef, { roles: map, disabled, purged, regionals });
      try {
        if (rolesRef) {
          await writeAccessMaps(rolesRef, { roles: map, disabled, purged, regionals });
        }
      } catch (e) {
        console.warn("Espelho roles doc (opcional):", e);
      }
      applyAccessMaps({
        roles: map,
        disabled,
        purged,
        regionals,
        source: "replace",
      });
      onStatusFn("synced");
    } catch (err) {
      inflightAccessUntil = 0;
      throw err;
    }
    return typeof DemandasRoles !== "undefined" && DemandasRoles.getRolesMap
      ? DemandasRoles.getRolesMap()
      : map;
  }

  async function importFullState(data) {
    const n = normalizePayload(data);
    for (const d of n.demandas) {
      if (d?.id) await upsertDemanda(d);
    }
    await persistMeta({ diarias: n.diarias, projetistas: n.projetistas, deletedDiariaIds: n.deletedDiariaIds || [] });
  }

  async function migrateLegacyPayload({ force = false } = {}) {
    await ensureAuth();
    if (!force && snapDemandas.length > 0) {
      return { migrated: 0, skipped: snapDemandas.length, message: "A coleção demandas já tem documentos. Use forçar no console se necessário." };
    }

    const legacy = await readLegacyPayload();
    if (!legacy || !legacy.demandas.length) {
      return { migrated: 0, skipped: 0, message: "Nenhum payload legado encontrado em demandasSistema/state." };
    }

    const localTombstones = deleteTombstoneSet(loadLocal());
    const remoteTombstones = new Set((snapMeta.deletedDemandaIds || []).filter(Boolean));
    const tombstones = new Set([...localTombstones, ...remoteTombstones]);
    const toMigrate = legacy.demandas.filter((d) => d?.id && !tombstones.has(d.id));
    if (!toMigrate.length) {
      return { migrated: 0, skipped: legacy.demandas.length, message: "Nenhuma demanda legada para migrar (excluídas ou já na nuvem)." };
    }

    const database = getDb();
    let migrated = 0;
    for (let i = 0; i < toMigrate.length; i += BATCH_SIZE) {
      const chunk = toMigrate.slice(i, i + BATCH_SIZE);
      const batch = database.batch();
      for (const d of chunk) {
        if (!d?.id) continue;
        const ref = database.collection(COL_DEMANDAS).doc(d.id);
        batch.set(ref, demandaToFirestore(d), { merge: true });
        migrated += 1;
      }
      await withTimeout(batch.commit(), REQ_TIMEOUT_MS * 2);
    }

    const metaSnap = await metaRef.get();
    if (!metaSnap.exists) {
      await persistMeta({
        diarias: legacy.diarias,
        projetistas: legacy.projetistas,
        deletedDiariaIds: legacy.deletedDiariaIds || [],
      });
    }

    await legacyRef.set(
      {
        migratedAt: new Date().toISOString(),
        migratedCount: migrated,
      },
      { merge: true },
    );

    return { migrated, skipped: 0, message: `${migrated} demanda(s) migrada(s) para a coleção demandas.` };
  }

  async function initFirebase({ onData, onStatus, onRoles }) {
    onStatusFn = onStatus || (() => {});
    onRolesFn = typeof onRoles === "function" ? onRoles : null;
    onStatusFn("connecting");
    window.__demandasSyncHint = "";

    await ensureAuth();
    getDb();

    const localBackup = loadLocal();
    if (localBackup && onData) {
      onData(mergeState({ demandas: [], ...snapMeta }, localBackup));
    }

    startListeners(onData);

    try {
      await ensureMetaDoc(localBackup || emptyState());
    } catch (e) {
      console.warn("ensureMetaDoc:", e);
      window.__demandasSyncHint =
        window.__demandasSyncHint || e.message || "Não foi possível preparar documento meta";
    }

    try {
      await ensureRolesDoc();
    } catch (e) {
      console.warn("ensureRolesDoc:", e);
      /* não zerar roles locais */
    }

    return {
      mode: "firebase",
      upsertDemanda,
      deleteDemanda,
      patchDemandaPresence,
      persistMeta,
      persistRoles,
      importFullState,
      migrateLegacyPayload,
    };
  }

  function initLocal({ onData, onStatus, onRoles }) {
    onStatusFn = onStatus || (() => {});
    onRolesFn = typeof onRoles === "function" ? onRoles : null;
    const data = loadLocal() || emptyState();
    onData(data);
    emitRoles(
      typeof DemandasRoles !== "undefined" && DemandasRoles.getRolesMap
        ? DemandasRoles.getRolesMap()
        : { ...(window.DEMANDAS_ROLES_SEED || {}) },
    );
    onStatusFn("local");
    const noop = async () => {};
    return {
      mode: "local",
      upsertDemanda: noop,
      deleteDemanda: noop,
      patchDemandaPresence: noop,
      persistMeta: noop,
      persistRoles: async (roles) => {
        applyAccessMaps({
          roles,
          disabled:
            typeof DemandasRoles !== "undefined" && DemandasRoles.getDisabledMap
              ? DemandasRoles.getDisabledMap()
              : {},
          purged:
            typeof DemandasRoles !== "undefined" && DemandasRoles.getPurgedMap
              ? DemandasRoles.getPurgedMap()
              : {},
          regionals:
            typeof DemandasRoles !== "undefined" && DemandasRoles.getRegionalsMap
              ? DemandasRoles.getRegionalsMap()
              : {},
          source: "replace",
        });
        return typeof DemandasRoles !== "undefined" && DemandasRoles.getRolesMap
          ? DemandasRoles.getRolesMap()
          : roles;
      },
      importFullState: noop,
      migrateLegacyPayload: async () => ({
        migrated: 0,
        message: "Disponível apenas com Firebase configurado.",
      }),
    };
  }

  function teardown() {
    clearListenerTimeout();
    if (unsubDemandas) {
      unsubDemandas();
      unsubDemandas = null;
    }
    if (unsubMeta) {
      unsubMeta();
      unsubMeta = null;
    }
    if (unsubRoles) {
      unsubRoles();
      unsubRoles = null;
    }
    db = null;
    metaRef = null;
    legacyRef = null;
    rolesRef = null;
    onDataFn = null;
    onRolesFn = null;
    snapDemandas = [];
    snapMeta = { diarias: [], projetistas: {}, deletedDemandaIds: [], deletedDiariaIds: [] };
    demandasLoaded = false;
    metaLoaded = false;
  }

  async function init({ onData, onStatus, onRoles }) {
    if (!isConfigured()) {
      window.__demandasSyncHint = "Configure firebase-config.js";
      return initLocal({ onData, onStatus, onRoles });
    }
    if (typeof DemandasAuth !== "undefined" && !DemandasAuth.currentUser()) {
      try {
        await waitForAuthUser();
      } catch (_) {
        window.__demandasSyncHint = "Faça login para acessar a nuvem.";
        throw new Error(window.__demandasSyncHint);
      }
    } else if (typeof firebase !== "undefined") {
      try {
        await waitForAuthUser();
      } catch (_) {
        window.__demandasSyncHint = "Faça login para acessar a nuvem.";
        throw new Error(window.__demandasSyncHint);
      }
    }
    try {
      return await initFirebase({ onData, onStatus, onRoles });
    } catch (e) {
      console.error("Nuvem indisponível:", e);
      if (!window.__demandasSyncHint) window.__demandasSyncHint = e.message || "Erro de conexão";
      if (location.protocol === "file:") {
        window.__demandasSyncHint = "Use https://demproj-fdeac.web.app — não abra o arquivo da pasta.";
      }
      throw e;
    }
  }

  return { init, teardown, isConfigured, loadLocal, saveLocal, migrateLegacyPayload };
})();
