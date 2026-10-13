/**
 * Supabase — mesma interface do DemandasFirebase (firebase-persist.js usa este objeto
 * quando DEMANDAS_BACKEND = "supabase").
 *
 * Tabelas (supabase/migrations): `demandas` (um projeto por linha, objeto em `dados`),
 * `sistema_meta` (linha única: diárias, projetistas, metas, filtros) e `perfis` (acessos).
 * Tempo real: Supabase Realtime avisa a mudança e o app relê só a linha alterada.
 *
 * As funções de mesclagem com a cópia local são as mesmas do firebase-persist.js;
 * depois da virada para o Supabase o arquivo do Firebase sai e fica só esta cópia.
 */
window.DemandasSupabasePersist = !window.DemandasSupabase?.ativo?.()
  ? null
  : (function () {
  const STORAGE_KEY = "demandasProjetos_v1";
  const REQ_TIMEOUT_MS = 15000;
  const LISTENER_TIMEOUT_MS = 12000;
  const PAGINA = 500;
  const sb = window.DemandasSupabase;

  let onStatusFn = () => {};
  let onDataFn = null;
  let onRolesFn = null;
  let canal = null;
  /** id → demanda, como veio do banco. */
  let snapDemandas = new Map();
  let snapMeta = { diarias: [], projetistas: {}, deletedDemandaIds: [], deletedDiariaIds: [] };
  let metaLoaded = false;
  let demandasLoaded = false;
  let listenerTimeoutId = null;
  let emitTimer = null;
  /** Muda no teardown: respostas de uma sessão anterior são descartadas. */
  let geracao = 0;
  /** Demandas com gravação em andamento — o merge não as descarta. */
  const inflightUpserts = new Set();
  const INFLIGHT_LINGER_MS = 1500;
  /** Meta (diárias/projetistas) com gravação em voo — evita perder gravação recente no merge. */
  let inflightMeta = null;
  const INFLIGHT_META_MS = 3000;
  /** Após gravar acessos — ignora releitura atrasada dos perfis. */
  let inflightAccessUntil = 0;
  const INFLIGHT_ACCESS_MS = 4000;
  const META_EXTRA_KEYS = ["metasEtapa", "filtrosSalvos"];

  function pickMetaExtras(src) {
    const out = {};
    for (const k of META_EXTRA_KEYS) {
      if (src && src[k] && typeof src[k] === "object") out[k] = src[k];
    }
    return out;
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
      ...pickMetaExtras(data),
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
      ...pickMetaExtras(l),
      ...pickMetaExtras(r),
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

  function applyAccessMaps({ roles, disabled, purged, regionals, names, source = "merge" } = {}) {
    const hasRoles = roles && typeof roles === "object";
    const hasDisabled = disabled !== undefined && disabled !== null && typeof disabled === "object";
    const hasPurged = purged !== undefined && purged !== null && typeof purged === "object";
    const hasRegionals = regionals !== undefined && regionals !== null && typeof regionals === "object";
    const hasNames = names !== undefined && names !== null && typeof names === "object";

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

    if (hasNames && typeof DemandasRoles !== "undefined" && DemandasRoles.setNamesMap) {
      const incoming = DemandasRoles.normalizeDisplayName
        ? Object.fromEntries(
            Object.entries(names)
              .map(([e, n]) => [
                String(e || "")
                  .trim()
                  .toLowerCase(),
                DemandasRoles.normalizeDisplayName(n),
              ])
              .filter(([e, n]) => e && n),
          )
        : names;
      if (source === "remote" || source === "replace") {
        DemandasRoles.setNamesMap(incoming);
      } else {
        DemandasRoles.setNamesMap({
          ...(DemandasRoles.getNamesMap?.() || {}),
          ...incoming,
        });
      }
    }

    if (typeof onRolesFn === "function") {
      onRolesFn(DemandasRoles?.getRolesMap?.() || {});
    }
  }

  // ---------------------------------------------------------------------------
  // Supabase
  // ---------------------------------------------------------------------------

  function isConfigured() {
    return sb.isConfigured();
  }

  function cliente() {
    const c = sb.clienteAtual();
    if (!c) throw new Error("Faça login para acessar os dados.");
    return c;
  }

  function traduzirErro(error) {
    if (!error) return new Error("Erro desconhecido no Supabase.");
    const code = String(error.code || "");
    let msg = error.message || "Erro no Supabase.";
    if (code === "42501" || /row-level security|permission denied/i.test(msg)) {
      msg = /^Só |^Sem /.test(msg) ? msg : "Sem permissão para esta ação.";
    } else if (code === "PGRST301" || /jwt expired/i.test(msg)) {
      msg = "Sessão expirada. Entre de novo.";
    }
    const e = new Error(msg);
    e.code = code;
    return e;
  }

  /** Executa uma consulta do supabase-js com tempo limite e erro traduzido. */
  async function q(consulta) {
    const { data, error } = await withTimeout(consulta, REQ_TIMEOUT_MS);
    if (error) throw traduzirErro(error);
    return data;
  }

  async function ensureAuth() {
    const { data } = await cliente().auth.getSession();
    if (!data?.session) throw new Error("Faça login para acessar os dados.");
  }

  function linhaParaDemanda(row) {
    if (!row?.id) return null;
    const d = { ...(row.dados && typeof row.dados === "object" ? row.dados : {}), id: row.id };
    delete d.editingBy;
    delete d.editingAt;
    if (row.editing_by) {
      d.editingBy = row.editing_by;
      d.editingAt = row.editing_at ? new Date(row.editing_at).toISOString() : row.editing_by.since;
    }
    return d;
  }

  /** Objeto do app → { dados, remover } para a função salvar_demanda. */
  function demandaParaBanco(demanda) {
    const copia = { ...demanda };
    delete copia.id;
    delete copia.editingBy;
    delete copia.editingAt;
    delete copia.__isMigrated;
    // Campo com valor undefined = apagar (equivale ao FieldValue.delete do Firestore).
    const remover = Object.keys(copia).filter((k) => copia[k] === undefined);
    for (const k of ["alertaSnooze", "clickup", "clickupTaskId"]) {
      if (!copia[k]) remover.push(k);
    }
    for (const k of remover) delete copia[k];
    return { dados: JSON.parse(JSON.stringify(copia)), remover: [...new Set(remover)] };
  }

  function linhaParaMeta(row) {
    if (!row) return { diarias: [], projetistas: {}, deletedDemandaIds: [], deletedDiariaIds: [] };
    return {
      diarias: Array.isArray(row.diarias) ? row.diarias : [],
      projetistas: row.projetistas && typeof row.projetistas === "object" ? row.projetistas : {},
      deletedDemandaIds: Array.isArray(row.deleted_demanda_ids)
        ? row.deleted_demanda_ids.filter((id) => typeof id === "string" && id)
        : [],
      deletedDiariaIds: Array.isArray(row.deleted_diaria_ids)
        ? row.deleted_diaria_ids.filter((id) => typeof id === "string" && id)
        : [],
      ...pickMetaExtras({ metasEtapa: row.metas_etapa, filtrosSalvos: row.filtros_salvos }),
    };
  }

  /** Linhas de `perfis` → mapas usados pelo DemandasRoles. */
  function perfisParaMapas(rows) {
    const roles = {};
    const disabled = {};
    const purged = {};
    const regionals = {};
    const names = {};
    for (const p of rows || []) {
      const e = String(p.email || "")
        .trim()
        .toLowerCase();
      if (!e) continue;
      if (p.removido) {
        purged[e] = true;
        continue;
      }
      roles[e] = p.papel;
      if (p.desabilitado) disabled[e] = true;
      if (p.regional) regionals[e] = p.regional;
      if (p.nome) names[e] = p.nome;
    }
    return { roles, disabled, purged, regionals, names };
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
      console.warn("Supabase: tempo esgotado na primeira leitura", { demandasLoaded, metaLoaded });
      demandasLoaded = true;
      metaLoaded = true;
      onStatusFn("error");
      window.__demandasSyncHint =
        window.__demandasSyncHint ||
        "Tempo esgotado ao carregar a nuvem. Exibindo cópia local; verifique rede e permissões.";
      emitLocalFallback();
    }, LISTENER_TIMEOUT_MS);
  }

  function listaDemandas() {
    return [...snapDemandas.values()];
  }

  function emitToUi() {
    clearTimeout(emitTimer);
    emitTimer = null;
    if (!onDataFn) return;
    if (!demandasLoaded || !metaLoaded) return;
    clearListenerTimeout();
    const remote = { demandas: listaDemandas(), ...snapMeta };
    const merged = pruneConfirmedDeletes(mergeState(remote, loadLocal(), { trustRemote: true }), remote.demandas);
    onDataFn(merged);
    scheduleSaveLocal(merged);
    onStatusFn("synced");
  }

  /** Junta rajadas de eventos do tempo real numa única atualização da tela. */
  function agendarEmit() {
    if (emitTimer) return;
    emitTimer = setTimeout(emitToUi, 80);
  }

  function emitLocalFallback() {
    if (!onDataFn) return;
    const remote = listaDemandas();
    const merged = pruneConfirmedDeletes(mergeState({ demandas: remote, ...snapMeta }, loadLocal()), remote);
    onDataFn(merged);
    scheduleSaveLocal(merged);
  }

  const COLUNAS_DEMANDA = "id,dados,editing_by,editing_at";

  async function carregarDemandas() {
    const g = geracao;
    const mapa = new Map();
    for (let de = 0; ; de += PAGINA) {
      const rows = await q(
        cliente()
          .from("demandas")
          .select(COLUNAS_DEMANDA)
          .order("id")
          .range(de, de + PAGINA - 1),
      );
      for (const r of rows || []) {
        const d = linhaParaDemanda(r);
        if (d) mapa.set(d.id, d);
      }
      if (!rows || rows.length < PAGINA) break;
    }
    if (g !== geracao) return;
    snapDemandas = mapa;
    demandasLoaded = true;
  }

  async function carregarMeta() {
    const g = geracao;
    const row = await q(cliente().from("sistema_meta").select("*").eq("id", "meta").maybeSingle());
    if (g !== geracao) return;
    snapMeta = linhaParaMeta(row);
    if (inflightMeta && Date.now() >= inflightMeta.until) inflightMeta = null;
    metaLoaded = true;
  }

  async function carregarPerfis() {
    const g = geracao;
    const rows = await q(cliente().from("perfis").select("email,papel,desabilitado,removido,regional,nome"));
    if (g !== geracao || Date.now() < inflightAccessUntil) return;
    applyAccessMaps({ ...perfisParaMapas(rows), source: "remote" });
  }

  async function carregarTudo() {
    await Promise.all([
      carregarDemandas(),
      carregarMeta(),
      carregarPerfis().catch((e) => console.warn("Perfis:", e)),
    ]);
    emitToUi();
  }

  /** Ids alterados no tempo real, relidos juntos (o evento pode vir sem o JSON inteiro). */
  const idsParaReler = new Set();
  let relerTimer = null;

  function agendarReleitura(id) {
    idsParaReler.add(id);
    if (relerTimer) return;
    relerTimer = setTimeout(() => {
      relerTimer = null;
      void relerDemandas().catch((e) => {
        console.warn("Releitura de demandas:", e);
        onStatusFn("error");
      });
    }, 150);
  }

  async function relerDemandas() {
    const g = geracao;
    const ids = [...idsParaReler];
    idsParaReler.clear();
    for (let i = 0; i < ids.length; i += 100) {
      const lote = ids.slice(i, i + 100);
      const rows = await q(cliente().from("demandas").select(COLUNAS_DEMANDA).in("id", lote));
      if (g !== geracao) return;
      const achados = new Set();
      for (const r of rows || []) {
        const d = linhaParaDemanda(r);
        if (!d) continue;
        achados.add(d.id);
        snapDemandas.set(d.id, d);
      }
      for (const id of lote) if (!achados.has(id)) snapDemandas.delete(id);
    }
    agendarEmit();
  }

  let perfisTimer = null;
  function agendarPerfis() {
    clearTimeout(perfisTimer);
    perfisTimer = setTimeout(() => {
      void carregarPerfis().catch((e) => console.warn("Perfis:", e));
    }, 300);
  }

  function assinarTempoReal() {
    const c = cliente();
    let jaConectou = false;
    canal = c
      .channel(`esteira-${Math.random().toString(36).slice(2, 10)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "demandas" }, (p) => {
        const id = p?.new?.id || p?.old?.id;
        if (!id) return;
        if (p.eventType === "DELETE") {
          snapDemandas.delete(id);
          agendarEmit();
          return;
        }
        agendarReleitura(id);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "sistema_meta" }, () => {
        void carregarMeta()
          .then(agendarEmit)
          .catch((e) => console.warn("Meta:", e));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "perfis" }, agendarPerfis)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          // Ao reconectar, relê tudo: eventos perdidos enquanto estava fora não voltam.
          if (jaConectou) {
            void carregarTudo().catch((e) => {
              console.warn("Releitura após reconexão:", e);
              onStatusFn("error");
            });
          }
          jaConectou = true;
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("Tempo real:", status);
          onStatusFn("error");
        }
      });
  }

  async function upsertDemanda(demanda) {
    if (!demanda?.id) return;
    inflightUpserts.add(demanda.id);
    try {
      await ensureAuth();
      onStatusFn("saving");
      const { dados, remover } = demandaParaBanco(demanda);
      dados.updatedAt = demanda.updatedAt || new Date().toISOString();
      await q(cliente().rpc("salvar_demanda", { p_id: demanda.id, p_dados: dados, p_remover: remover }));
      // Já reflete a gravação (o tempo real confirma em seguida).
      const anterior = snapDemandas.get(demanda.id) || {};
      const atual = { ...anterior, ...dados, id: demanda.id };
      for (const k of remover) delete atual[k];
      delete atual.editingBy;
      delete atual.editingAt;
      snapDemandas.set(demanda.id, atual);
      onStatusFn("synced");
    } finally {
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
    // Os registros de `arquivos` saem em cascata; o conteúdo no Storage precisa ser apagado aqui.
    try {
      const arquivos = await q(cliente().from("arquivos").select("caminho").eq("demanda_id", id));
      if (arquivos?.length) {
        const { error } = await cliente()
          .storage.from("projetos")
          .remove(arquivos.map((a) => a.caminho));
        if (error) console.warn("Arquivos do projeto excluído:", error);
      }
    } catch (e) {
      console.warn("Arquivos do projeto excluído:", e);
    }
    await q(cliente().rpc("excluir_demanda", { p_id: id }));
    snapDemandas.delete(id);
    if (!snapMeta.deletedDemandaIds.includes(id)) snapMeta.deletedDemandaIds.push(id);
    onStatusFn("synced");
  }

  /** Presença de edição — não altera updatedAt da demanda. */
  async function patchDemandaPresence(demandaId, editingBy) {
    if (!demandaId) return;
    try {
      await ensureAuth();
      await q(cliente().rpc("marcar_presenca", { p_id: demandaId, p_editing: editingBy || null }));
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
      await q(
        cliente()
          .from("sistema_meta")
          .update({
            diarias: meta.diarias || [],
            projetistas: meta.projetistas || {},
            deleted_diaria_ids: meta.deletedDiariaIds || [],
            atualizado_em: new Date().toISOString(),
          })
          .eq("id", "meta"),
      );
      onStatusFn("synced");
    } finally {
      setTimeout(() => {
        if (inflightMeta && Date.now() >= inflightMeta.until) inflightMeta = null;
      }, INFLIGHT_META_MS);
    }
  }

  /** Grava só os campos de configuração informados (mescla em profundidade no banco). */
  async function persistMetaFields(fields) {
    const data = pickMetaExtras(fields);
    if (!Object.keys(data).length) return;
    await ensureAuth();
    onStatusFn("saving");
    await q(cliente().rpc("mesclar_meta", { p_campos: data }));
    onStatusFn("synced");
  }

  async function persistRoles(roles) {
    await ensureAuth();
    const map = normalizeRolesMap(roles);
    const adminEmail = String(window.DEMANDAS_ADMIN_EMAIL || "")
      .trim()
      .toLowerCase();
    if (adminEmail) map[adminEmail] = "admin";
    const R = typeof DemandasRoles !== "undefined" ? DemandasRoles : null;
    const disabled = normalizeFlagMap(R?.getDisabledMap?.() || {});
    const purged = normalizeFlagMap(R?.getPurgedMap?.() || {});
    const regionals = R?.getRegionalsMap?.() || {};
    const names = R?.getNamesMap?.() || {};
    if (adminEmail) {
      delete disabled[adminEmail];
      delete purged[adminEmail];
    }
    onStatusFn("saving");
    inflightAccessUntil = Date.now() + INFLIGHT_ACCESS_MS;
    try {
      await q(cliente().rpc("salvar_perfis", { p_mapas: { roles: map, disabled, purged, regionals, names } }));
      applyAccessMaps({ roles: map, disabled, purged, regionals, names, source: "replace" });
      onStatusFn("synced");
    } catch (err) {
      inflightAccessUntil = 0;
      throw err;
    }
    return R?.getRolesMap ? R.getRolesMap() : map;
  }

  async function importFullState(data) {
    const n = normalizePayload(data);
    for (const d of n.demandas) {
      if (d?.id) await upsertDemanda(d);
    }
    await persistMeta({ diarias: n.diarias, projetistas: n.projetistas, deletedDiariaIds: n.deletedDiariaIds || [] });
  }

  async function migrateLegacyPayload() {
    return { migrated: 0, skipped: 0, message: "Não se aplica ao Supabase (use o script de migração)." };
  }

  async function initSupabase({ onData, onStatus, onRoles }) {
    onStatusFn = onStatus || (() => {});
    onRolesFn = typeof onRoles === "function" ? onRoles : null;
    onDataFn = onData || null;
    onStatusFn("connecting");
    window.__demandasSyncHint = "";

    await sb.obterCliente();
    await ensureAuth();

    const localBackup = loadLocal();
    if (localBackup && onData) {
      onData(mergeState({ demandas: [], ...snapMeta }, localBackup));
    }

    demandasLoaded = false;
    metaLoaded = false;
    scheduleListenerTimeout();
    assinarTempoReal();
    try {
      await carregarTudo();
    } catch (e) {
      console.warn("Primeira leitura:", e);
      demandasLoaded = true;
      metaLoaded = true;
      clearListenerTimeout();
      onStatusFn("error");
      window.__demandasSyncHint = e.message || "Erro ao sincronizar com o Supabase";
      emitLocalFallback();
    }

    return {
      mode: "supabase",
      upsertDemanda,
      deleteDemanda,
      patchDemandaPresence,
      persistMeta,
      persistMetaFields,
      persistRoles,
      importFullState,
      migrateLegacyPayload,
    };
  }

  /** Sem Supabase configurado: dados só neste navegador. */
  function initLocal({ onData, onStatus, onRoles }) {
    onStatusFn = onStatus || (() => {});
    onRolesFn = typeof onRoles === "function" ? onRoles : null;
    onData(loadLocal() || emptyState());
    const R = typeof DemandasRoles !== "undefined" ? DemandasRoles : null;
    applyAccessMaps({ roles: R?.getRolesMap?.() || { ...(window.DEMANDAS_ROLES_SEED || {}) } });
    onStatusFn("local");
    const noop = async () => {};
    return {
      mode: "local",
      upsertDemanda: noop,
      deleteDemanda: noop,
      patchDemandaPresence: noop,
      persistMeta: noop,
      persistMetaFields: noop,
      persistRoles: async (roles) => {
        applyAccessMaps({
          roles,
          disabled: R?.getDisabledMap?.() || {},
          purged: R?.getPurgedMap?.() || {},
          regionals: R?.getRegionalsMap?.() || {},
          names: R?.getNamesMap?.() || {},
          source: "replace",
        });
        return R?.getRolesMap ? R.getRolesMap() : roles;
      },
      importFullState: noop,
      migrateLegacyPayload,
    };
  }

  function teardown() {
    geracao += 1;
    clearListenerTimeout();
    clearTimeout(emitTimer);
    clearTimeout(relerTimer);
    clearTimeout(perfisTimer);
    emitTimer = null;
    relerTimer = null;
    idsParaReler.clear();
    const c = sb.clienteAtual();
    if (canal && c) void c.removeChannel(canal);
    canal = null;
    onDataFn = null;
    onRolesFn = null;
    snapDemandas = new Map();
    snapMeta = { diarias: [], projetistas: {}, deletedDemandaIds: [], deletedDiariaIds: [] };
    demandasLoaded = false;
    metaLoaded = false;
  }

  async function init({ onData, onStatus, onRoles }) {
    if (!isConfigured()) {
      window.__demandasSyncHint = "Configure supabase-config.js";
      return initLocal({ onData, onStatus, onRoles });
    }
    try {
      return await initSupabase({ onData, onStatus, onRoles });
    } catch (e) {
      console.error("Nuvem indisponível:", e);
      if (!window.__demandasSyncHint) window.__demandasSyncHint = e.message || "Erro de conexão";
      throw e;
    }
  }

  return { init, teardown, isConfigured, loadLocal, saveLocal, migrateLegacyPayload };
})();
