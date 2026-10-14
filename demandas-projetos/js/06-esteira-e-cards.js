/**
 * Quadro da esteira: filtros, arrastar, ordem, alertas e cards.
 * Só declarações (funções e constantes); o que roda ao abrir a página fica em app.js.
 */
/* ---------- Arraste: rolagem horizontal automática na esteira ---------- */
const esteiraDragScroll = { active: false, x: 0, y: 0, raf: 0 };

function getEsteiraBoardsForDragScroll() {
  const panel = document.getElementById("panelEsteira");
  if (!panel || panel.hidden) return [];
  return [...panel.querySelectorAll(".board")].filter((el) => {
    if (el.closest("[hidden]")) return false;
    return el.scrollWidth > el.clientWidth + 4;
  });
}

function applyEsteiraBoardDragScroll(board, clientX, clientY) {
  const r = board.getBoundingClientRect();
  const edge = 72;
  const maxSpeed = 20;
  const yPad = 56;
  const xPad = 32;

  if (clientY < r.top - yPad || clientY > r.bottom + yPad) return;
  if (clientX < r.left - xPad || clientX > r.right + xPad) return;

  let speed = 0;
  if (clientX < r.left + edge) {
    const t = Math.max(0, Math.min(1, (clientX - r.left) / edge));
    speed = -maxSpeed * (1 - t);
  } else if (clientX > r.right - edge) {
    const t = Math.max(0, Math.min(1, (r.right - clientX) / edge));
    speed = maxSpeed * (1 - t);
  }

  if (!speed) return;
  const maxLeft = board.scrollWidth - board.clientWidth;
  if (speed < 0 && board.scrollLeft <= 0) return;
  if (speed > 0 && board.scrollLeft >= maxLeft) return;
  board.scrollLeft += speed;
}

function tickEsteiraDragScroll() {
  if (!esteiraDragScroll.active) return;
  const { x, y } = esteiraDragScroll;
  for (const board of getEsteiraBoardsForDragScroll()) {
    applyEsteiraBoardDragScroll(board, x, y);
  }
  esteiraDragScroll.raf = requestAnimationFrame(tickEsteiraDragScroll);
}

function onEsteiraDocumentDragOver(e) {
  if (!esteiraDragScroll.active) return;
  esteiraDragScroll.x = e.clientX;
  esteiraDragScroll.y = e.clientY;
}

function stopEsteiraBoardDragScroll() {
  esteiraDragScroll.active = false;
  if (esteiraDragScroll.raf) {
    cancelAnimationFrame(esteiraDragScroll.raf);
    esteiraDragScroll.raf = 0;
  }
  document.removeEventListener("dragover", onEsteiraDocumentDragOver, true);
  document.querySelectorAll(".card--dragging").forEach((c) => c.classList.remove("card--dragging"));
}

function startEsteiraBoardDragScroll() {
  if (esteiraDragScroll.active) return;
  esteiraDragScroll.active = true;
  document.addEventListener("dragover", onEsteiraDocumentDragOver, true);
  tickEsteiraDragScroll();
}

function initEsteiraBoardDragScroll() {
  const panel = document.getElementById("panelEsteira");
  if (!panel || panel.dataset.dragScrollInited) return;
  panel.dataset.dragScrollInited = "1";

  panel.addEventListener(
    "dragstart",
    (e) => {
      const from = e.target instanceof Element ? e.target : e.target?.parentElement;
      const card = from?.closest(".card[draggable='true']");
      if (!card || !panel.contains(card)) return;
      card.classList.add("card--dragging");
      startEsteiraBoardDragScroll();
    },
    true,
  );

  const endDrag = () => stopEsteiraBoardDragScroll();
  document.addEventListener("dragend", endDrag);
  document.addEventListener("drop", endDrag);
}

/* ---------- Board (fila geral + esteira unificada) ---------- */
const BOARD_ATRIBUIDOS = "*";

function filteredDemandasForEsteira(linha = activeEsteiraCanal, { rapido = true } = {}) {
  const f = readEsteiraFilters();
  if (!rapido) delete f.rapido;
  const tombstones = demandaDeleteTombstones();
  return state.demandas
    .filter((d) => !tombstones.has(d.id))
    .map(migrateDemanda)
    .filter((d) => !d.arquivadoEm)
    .filter((d) => inferLinhaEsteira(d) === normalizeLinhaEsteira(linha))
    .filter((d) => demandaMatchesEsteiraFilters(d, f));
}

function demandasForBoard(boardResponsavel, linha = activeEsteiraCanal) {
  const list = filteredDemandasForEsteira(linha);
  // Esteira única: demandas sem projetista ficam na coluna do seu status (com o selo "Não atribuído").
  if (boardResponsavel === BOARD_ATRIBUIDOS) return list;
  const alvo = normalizeResponsavel(boardResponsavel);
  if (alvo === "") return list.filter((d) => normalizeResponsavel(d.responsavel) === "");
  return list.filter((d) => d.responsavel === alvo);
}

function normalizeOrdemEsteira(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Chave de antiguidade na coluna: chegada → criação (mais antigo = menor). */
function demandaAntiguidadeKey(d) {
  const chegada = String(d?.dataChegada || "").trim();
  if (chegada) return chegada;
  const created = String(d?.createdAt || "").trim();
  if (created) return created.slice(0, 10) || created;
  return "";
}

/** Mais antigo no topo, mais novo no fim; empate por ordem manual e id. */
function compareDemandaEsteiraOrdem(a, b) {
  const ka = demandaAntiguidadeKey(a);
  const kb = demandaAntiguidadeKey(b);
  if (ka && kb && ka !== kb) return ka.localeCompare(kb);
  if (ka && !kb) return -1;
  if (!ka && kb) return 1;
  const oa = normalizeOrdemEsteira(a.ordemEsteira);
  const ob = normalizeOrdemEsteira(b.ordemEsteira);
  if (oa != null && ob != null && oa !== ob) return oa - ob;
  if (oa != null && ob == null) return -1;
  if (oa == null && ob != null) return 1;
  const ca = String(a.createdAt || "");
  const cb = String(b.createdAt || "");
  if (ca !== cb) return ca.localeCompare(cb);
  return String(a.id || "").localeCompare(String(b.id || ""));
}

function demandasNaColunaEsteira(dem, linha = activeEsteiraCanal) {
  const unassigned = !normalizeResponsavel(dem.responsavel);
  const pool = unassigned
    ? demandasForBoard("", linha)
    : demandasForBoard(BOARD_ATRIBUIDOS, linha).filter((d) => d.status === dem.status);
  return pool.slice().sort(compareDemandaEsteiraOrdem);
}

function maxOrdemNaColuna(status, responsavel) {
  const stub = { status, responsavel };
  let max = 0;
  for (const d of demandasNaColunaEsteira(stub)) {
    const o = normalizeOrdemEsteira(d.ordemEsteira);
    if (o != null && o > max) max = o;
  }
  return max;
}

function ordemAoEntrarColuna(status, responsavel) {
  return maxOrdemNaColuna(status, responsavel) + 10;
}

function renumberColumnOrdens(orderedList) {
  const now = new Date().toISOString();
  orderedList.forEach((d, i) => {
    d.ordemEsteira = (i + 1) * 10;
    d.updatedAt = now;
  });
  return orderedList;
}

function moveDemandaOrdemEsteira(demId, delta) {
  if (!requireWriteAccess()) return;
  const dem = state.demandas.find((x) => x.id === demId);
  if (!dem || !delta) return;
  const ageKey = demandaAntiguidadeKey(dem);
  const peers = demandasNaColunaEsteira(dem).filter((d) => demandaAntiguidadeKey(d) === ageKey);
  const idx = peers.findIndex((d) => d.id === demId);
  const target = idx + delta;
  if (idx < 0 || target < 0 || target >= peers.length) return;
  const fotos = fotografarDemandas(peers.map((d) => d.id));
  const ordered = peers.slice();
  const [item] = ordered.splice(idx, 1);
  ordered.splice(target, 0, item);
  renumberColumnOrdens(ordered);
  for (const d of ordered) applyCloudPatch({ demanda: migrateDemanda(d) });
  saveState();
  renderBoard();
  oferecerDesfazer(delta < 0 ? "Card movido para cima" : "Card movido para baixo", () => restaurarFotos(fotos, "Ordem desfeita"));
}

function handleDemandaDrop(dem, newStatus, boardResponsavel) {
  if (!requireWriteAccess()) return;
  if (!dem) return;
  const dm = migrateDemanda(dem);
  const alteraResponsavel = boardResponsavel !== BOARD_ATRIBUIDOS;
  const resp = alteraResponsavel ? normalizeResponsavel(boardResponsavel) : normalizeResponsavel(dem.responsavel);
  if (dem.status === newStatus && normalizeResponsavel(dem.responsavel) === resp) return;
  const fotos = fotografarDemandas([dem.id]);
  const mudouEtapa = dem.status !== newStatus;
  const now = new Date().toISOString();
  if (dem.status !== newStatus) {
    dem.status = newStatus;
    dem.historicoStatus = statusHistoryPush(dem, newStatus);
    if (isStatusConcluidoNoFormulario(newStatus, dm.linhaEsteira) && !dem.dataTermino) {
      dem.dataTermino = todayISODate();
    }
    dem.ordemEsteira = ordemAoEntrarColuna(newStatus, alteraResponsavel ? resp : dem.responsavel);
  }
  if (alteraResponsavel) dem.responsavel = resp;
  dem.updatedAt = now;
  invalidateAlertaSnoozeIfStale(dem);
  saveState({ demanda: dem });
  renderBoard();
  oferecerDesfazer(
    mudouEtapa ? `«${dem.titulo || "Projeto"}» movido para ${labelStatus(newStatus, dm.linhaEsteira)}` : "Demanda atualizada",
    () => restaurarFotos(fotos, "Movimentação desfeita"),
  );
}

function diasDesdeChegadaDemanda(d) {
  const dm = migrateDemanda(d);
  const iso = dm.dataChegada || (dm.createdAt || "").slice(0, 10);
  const a = parseDate(iso);
  const hoje = parseDate(todayISODate());
  if (a == null || hoje == null) return null;
  return Math.max(0, Math.round((hoje - a) / 86400000));
}

function diasNaColunaAtual(d) {
  const hist = Array.isArray(d.historicoStatus) ? d.historicoStatus : [];
  const status = d.status;
  let inicio = "";
  for (let i = hist.length - 1; i >= 0; i--) {
    const seg = hist[i];
    if (seg && seg.status === status) {
      inicio = isoDatePart(seg.inicio);
      break;
    }
  }
  if (!inicio) inicio = isoDatePart(d.updatedAt) || isoDatePart(d.createdAt) || isoDatePart(d.dataChegada);
  const a = parseDate(inicio);
  const hoje = parseDate(todayISODate());
  if (a == null || hoje == null) return null;
  return Math.max(0, Math.round((hoje - a) / 86400000));
}

function alertaSnoozeAtivo(d, kind) {
  const s = normalizeAlertaSnooze(d?.alertaSnooze);
  if (!s || s.kind !== kind) return false;
  const hoje = todayISODate();
  if (hoje >= s.until) return false;
  if (kind === ALERTA_KIND_SEM_ATRIB) {
    return !normalizeResponsavel(d.responsavel);
  }
  return s.status === d.status;
}

function invalidateAlertaSnoozeIfStale(d) {
  if (!d) return d;
  const s = normalizeAlertaSnooze(d.alertaSnooze);
  if (!s) {
    delete d.alertaSnooze;
    return d;
  }
  if (s.kind === ALERTA_KIND_SEM_ATRIB && normalizeResponsavel(d.responsavel)) {
    delete d.alertaSnooze;
    return d;
  }
  if (s.kind === ALERTA_KIND_COLUNA && s.status !== d.status) {
    delete d.alertaSnooze;
    return d;
  }
  d.alertaSnooze = s;
  return d;
}

function alertaEsteiraSortIndex(d, linha) {
  if (!normalizeResponsavel(d.responsavel)) return -1;
  const cfg = getEsteiraConfig(linha);
  const keys = [
    ...cfg.statusOrder.map(([k]) => k),
    ...(cfg.statusExtra || []).map(([k]) => k),
  ];
  const idx = keys.indexOf(d.status);
  return idx < 0 ? keys.length : idx;
}

function buildInboxAlertasRows(list, linha) {
  const rows = [];
  for (const raw of list) {
    const d = migrateDemanda(raw);
    if (clickupRetornoPendente(d)) {
      const cu = normalizeClickup(d.clickup);
      rows.push({
        severity: "ok",
        kind: ALERTA_KIND_CLICKUP_RETORNO,
        d,
        dias: 0,
        msg: "Retornou da Operação (concluída)",
        curta: "Retornou da Operação",
        meta: cu?.status ? `ClickUp: ${cu.status}` : "ClickUp",
      });
    }
    if (isStatusConcluidoDemanda(d) || isDemandaEncerrada(d)) continue;

    const semAtrib = !normalizeResponsavel(d.responsavel);
    if (semAtrib) {
      if (alertaSnoozeAtivo(d, ALERTA_KIND_SEM_ATRIB)) continue;
      const diasFila = diasDesdeChegadaDemanda(d);
      const extra = [];
      if (linha === LINHA_ESTEIRA_OPERACIONAL && normalizeTipo(d.tipo) === "B2C" && !d.segmentoB2c) {
        extra.push("B2C sem segmento");
      }
      if (linha === LINHA_ESTEIRA_B2B && normalizeTipo(d.tipo) === "B2B" && !d.produtoB2b) {
        extra.push("B2B sem produto");
      }
      const msg =
        diasFila != null
          ? `Sem projetista há ${diasFila} dia(s)`
          : "Sem projetista atribuído";
      rows.push({
        severity: "bad",
        kind: ALERTA_KIND_SEM_ATRIB,
        d,
        dias: diasFila ?? 0,
        msg: extra.length ? `${msg} · ${extra.join(" · ")}` : msg,
        curta: ["Sem projetista", ...extra].join(" · "),
        meta: `Chegou em ${formatDataISO(d.dataChegada || d.createdAt?.slice(0, 10))}`,
      });
      continue;
    }

    const diasCol = diasAcimaDaMeta(d);
    if (diasCol != null) {
      if (alertaSnoozeAtivo(d, ALERTA_KIND_COLUNA)) continue;
      const fase = labelStatus(d.status, d.linhaEsteira);
      rows.push({
        severity: "coluna",
        kind: ALERTA_KIND_COLUNA,
        d,
        dias: diasCol,
        msg: `${diasCol} dia(s) em «${fase}» · meta ${metaDiasDemanda(d)}d`,
        curta: `Parado em ${fase}`,
        meta: formatProjetistasDemanda(d) ? `Projetista: ${formatProjetistasDemanda(d)}` : "",
      });
    }
  }
  return rows.sort((a, b) => {
    if (a.kind === ALERTA_KIND_CLICKUP_RETORNO && b.kind !== ALERTA_KIND_CLICKUP_RETORNO) return -1;
    if (b.kind === ALERTA_KIND_CLICKUP_RETORNO && a.kind !== ALERTA_KIND_CLICKUP_RETORNO) return 1;
    const ia = alertaEsteiraSortIndex(a.d, linha);
    const ib = alertaEsteiraSortIndex(b.d, linha);
    if (ia !== ib) return ia - ib;
    return (b.dias ?? 0) - (a.dias ?? 0) || a.d.titulo.localeCompare(b.d.titulo, "pt-BR");
  });
}

/** Aba ativa do painel de alertas ("" = todos). */
let alertasFiltroKind = "";

const ALERTAS_ABAS = [
  { kind: ALERTA_KIND_MENCAO, label: "Menções", tom: "mencao" },
  { kind: ALERTA_KIND_SEM_ATRIB, label: "Sem projetista", tom: "bad" },
  { kind: ALERTA_KIND_COLUNA, label: "Parados", tom: "coluna" },
  { kind: ALERTA_KIND_CLICKUP_RETORNO, label: "Retornos", tom: "ok" },
];

function renderInboxAlertas(linha = activeEsteiraCanal) {
  const el = document.getElementById("esteiraInboxAlertas");
  if (!el) return;
  const list = filteredDemandasForEsteira(linha, { rapido: false });
  const rows = [...mencoesParaMimRows(), ...buildInboxAlertasRows(list, linha)];
  syncNotifBadge(rows);
  const canal = linha === LINHA_ESTEIRA_B2B ? "Esteira B2B" : "Esteira Projetos";
  const head = (extra = "") =>
    `<div class="inbox-alertas__head"><h4 class="inbox-alertas__title">Alertas${extra}</h4>` +
    `<span class="inbox-alertas__canal">${canal}${esteiraFiltrosAtivosCount() ? " · com filtros" : ""}</span>` +
    `<span class="inbox-alertas__ajuda" tabindex="0" title="Vermelho: sem projetista. Laranja: passou da meta de dias da etapa. Verde: retornou da Operação.&#10;Adiar registra um comentário e silencia o alerta por alguns dias. Ciente tira o retorno da lista." aria-label="Como funcionam os alertas">?</span></div>`;

  if (!rows.length) {
    el.innerHTML =
      `<div class="inbox-alertas inbox-alertas--vazio">${head()}` +
      `<div class="inbox-alertas__tudo-ok"><span class="inbox-alertas__ok-ico" aria-hidden="true">✓</span>` +
      `<strong>Tudo em dia</strong><span class="muted small">${
        list.length
          ? `${list.length} demanda(s) sem alertas no momento.`
          : esteiraFiltrosAtivosCount()
            ? "Nenhuma demanda com estes filtros."
            : "Nenhuma demanda nesta esteira."
      }</span></div></div>`;
    return;
  }

  const contagem = Object.fromEntries(ALERTAS_ABAS.map((a) => [a.kind, rows.filter((r) => r.kind === a.kind).length]));
  if (alertasFiltroKind && !contagem[alertasFiltroKind]) alertasFiltroKind = "";
  const visiveis = alertasFiltroKind ? rows.filter((r) => r.kind === alertasFiltroKind) : rows;
  const temVermelho = rows.some((r) => r.severity === "bad");
  const abas =
    `<div class="inbox-alertas__abas" role="tablist" aria-label="Filtrar alertas">` +
    `<button type="button" role="tab" class="alerta-aba${alertasFiltroKind ? "" : " is-active"}" data-alerta-aba="" aria-selected="${!alertasFiltroKind}">Todos <b>${rows.length}</b></button>` +
    ALERTAS_ABAS.filter((a) => contagem[a.kind])
      .map(
        (a) =>
          `<button type="button" role="tab" class="alerta-aba alerta-aba--${a.tom}${alertasFiltroKind === a.kind ? " is-active" : ""}" data-alerta-aba="${a.kind}" aria-selected="${alertasFiltroKind === a.kind}">` +
          `<i aria-hidden="true"></i>${escapeHtml(a.label)} <b>${contagem[a.kind]}</b></button>`,
      )
      .join("") +
    `</div>`;

  const ro = isReadOnlyUser();
  const items = visiveis
    .map((r) => {
      const dias =
        r.kind === ALERTA_KIND_MENCAO
          ? `<span class="alerta__dias alerta__dias--ico" aria-hidden="true">@</span>`
          : r.kind === ALERTA_KIND_CLICKUP_RETORNO
          ? `<span class="alerta__dias alerta__dias--ico" aria-hidden="true">✓</span>`
          : `<span class="alerta__dias" title="${escapeHtml(r.msg)}"><b>${r.dias}</b><small>${r.dias === 1 ? "dia" : "dias"}</small></span>`;
      const acao = r.kind === ALERTA_KIND_MENCAO
        ? `<button type="button" class="alerta__acao" data-mencao-ciente="${escapeHtml(r.cid)}" title="Marcar como lida" aria-label="Marcar menção em ${escapeHtml(r.d.titulo)} como lida"><span aria-hidden="true">✓</span> Ciente</button>`
        : ro
        ? ""
        : r.kind === ALERTA_KIND_CLICKUP_RETORNO
          ? `<button type="button" class="alerta__acao" data-alerta-ciente="${escapeHtml(r.d.id)}" title="Marcar como ciente" aria-label="Marcar ${escapeHtml(r.d.titulo)} como ciente"><span aria-hidden="true">✓</span> Ciente</button>`
          : `<button type="button" class="alerta__acao" data-alerta-snooze="${escapeHtml(r.d.id)}" data-kind="${escapeHtml(r.kind)}" title="Registrar e silenciar por alguns dias" aria-label="Adiar alerta de ${escapeHtml(r.d.titulo)}"><span aria-hidden="true">⏰</span> Adiar</button>`;
      return (
        `<li class="alerta alerta--${r.severity}">` +
        `<button type="button" class="alerta__abrir" data-alerta-abrir="${escapeHtml(r.d.id)}"${r.cid ? ` data-cid="${escapeHtml(r.cid)}"` : ""} title="Abrir projeto">` +
        dias +
        `<span class="alerta__txt"><span class="alerta__titulo" title="${escapeHtml(r.d.titulo)}">${escapeHtml(r.d.titulo)}</span>` +
        `<span class="alerta__msg">${escapeHtml(r.curta || r.msg)}</span>` +
        (r.meta ? `<span class="alerta__meta">${escapeHtml(r.meta)}</span>` : "") +
        `</span></button>` +
        acao +
        `</li>`
      );
    })
    .join("");

  el.innerHTML =
    '<div class="inbox-alertas">' +
    head(` <span class="inbox-alertas__count${temVermelho ? " inbox-alertas__count--bad" : ""}">${rows.length}</span>`) +
    abas +
    `<ul class="inbox-alertas__list">${items}</ul></div>`;

  el.querySelectorAll("[data-alerta-aba]").forEach((btn) => {
    btn.addEventListener("click", () => {
      alertasFiltroKind = btn.dataset.alertaAba;
      renderInboxAlertas(linha);
    });
  });
  el.querySelectorAll("[data-alerta-abrir]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.cid) marcarMencaoVista(btn.dataset.cid);
      setNotifAberto(false);
      openDemandaModal(btn.dataset.alertaAbrir);
    });
  });
  el.querySelectorAll("[data-alerta-snooze]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const row = rows.find((r) => r.d.id === btn.dataset.alertaSnooze && r.kind === btn.dataset.kind);
      if (!row) return;
      setNotifAberto(false);
      openAlertaSnoozeModal(row);
    });
  });
  el.querySelectorAll("[data-alerta-ciente]").forEach((btn) => {
    btn.addEventListener("click", () => marcarClickupRetornoCiente(btn.dataset.alertaCiente));
  });
  el.querySelectorAll("[data-mencao-ciente]").forEach((btn) => {
    btn.addEventListener("click", () => {
      marcarMencaoVista(btn.dataset.mencaoCiente);
      renderInboxAlertas(linha);
    });
  });
}

/* ---------- Sininho de alertas (topo) ---------- */
let notifUltimaContagem = null;

function syncNotifBadge(rows) {
  const badge = document.getElementById("notifBadge");
  const btn = document.getElementById("btnNotif");
  if (!badge || !btn) return;
  const n = rows.length;
  const temVermelho = rows.some((r) => r.severity === "bad");
  badge.hidden = n === 0;
  badge.textContent = n > 99 ? "99+" : String(n);
  badge.classList.toggle("notif__badge--bad", temVermelho);
  btn.classList.toggle("tem-alertas", n > 0);
  btn.title = n ? `${n} alerta(s)` : "Nenhum alerta";
  btn.setAttribute("aria-label", btn.title);
  if (notifUltimaContagem != null && n > notifUltimaContagem) {
    btn.classList.remove("is-novo");
    void btn.offsetWidth;
    btn.classList.add("is-novo");
  }
  notifUltimaContagem = n;
}

function setNotifAberto(aberto) {
  const panel = document.getElementById("notifPanel");
  const btn = document.getElementById("btnNotif");
  if (!panel || !btn) return;
  panel.hidden = !aberto;
  btn.setAttribute("aria-expanded", aberto ? "true" : "false");
  btn.classList.toggle("is-open", aberto);
  if (aberto) renderInboxAlertas(activeEsteiraCanal);
}

function initNotifMenu() {
  const menu = document.getElementById("notifMenu");
  const btn = document.getElementById("btnNotif");
  const panel = document.getElementById("notifPanel");
  if (!menu || !btn || !panel) return;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    setNotifAberto(panel.hidden);
  });
  // composedPath: as abas re-renderizam o painel, então o alvo do clique já pode ter saído do DOM.
  document.addEventListener("click", (e) => {
    if (!panel.hidden && !e.composedPath().includes(menu)) setNotifAberto(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !panel.hidden) {
      setNotifAberto(false);
      btn.focus();
    }
  });
}

let alertaSnoozeCtx = null;

function syncAlertaSnoozeUntilHint() {
  const hint = document.getElementById("alertaSnoozeUntilHint");
  const diasEl = document.getElementById("alertaSnoozeDias");
  if (!hint || !diasEl) return;
  const dias = Math.max(1, Math.min(30, Number(diasEl.value) || ALERTA_SNOOZE_DIAS_PADRAO));
  const until = addDaysISO(todayISODate(), dias);
  hint.textContent = until
    ? `O alerta some da lista hoje e só volta em ${formatDataISO(until)} se a demanda ainda estiver na mesma situação.`
    : "";
}

function openAlertaSnoozeModal(row) {
  const dlg = document.getElementById("modalAlertaSnooze");
  if (!dlg || !row?.d) return;
  alertaSnoozeCtx = {
    id: row.d.id,
    kind: row.kind,
    status: row.d.status,
    titulo: row.d.titulo,
    msg: row.msg,
  };
  const titleEl = document.getElementById("alertaSnoozeDemandaTitulo");
  const resumoEl = document.getElementById("alertaSnoozeResumo");
  const textoEl = document.getElementById("alertaSnoozeTexto");
  const diasEl = document.getElementById("alertaSnoozeDias");
  if (titleEl) titleEl.textContent = row.d.titulo;
  if (resumoEl) resumoEl.textContent = row.msg;
  if (diasEl) diasEl.value = String(ALERTA_SNOOZE_DIAS_PADRAO);
  if (textoEl) textoEl.value = "";
  syncAlertaSnoozeUntilHint();
  dlg.showModal();
  requestAnimationFrame(() => textoEl?.focus());
}

function closeAlertaSnoozeModal() {
  alertaSnoozeCtx = null;
  document.getElementById("modalAlertaSnooze")?.close();
}

function aplicarAlertaSnooze() {
  if (!requireWriteAccess()) return;
  const ctx = alertaSnoozeCtx;
  if (!ctx?.id) return;
  const dem = state.demandas.find((x) => x.id === ctx.id);
  if (!dem) {
    toast("Demanda não encontrada");
    return;
  }
  const diasEl = document.getElementById("alertaSnoozeDias");
  const textoEl = document.getElementById("alertaSnoozeTexto");
  const dias = Math.max(1, Math.min(30, Number(diasEl?.value) || ALERTA_SNOOZE_DIAS_PADRAO));
  const texto = String(textoEl?.value || "").trim();
  if (!texto) {
    toast("Escreva o registro de ciência");
    textoEl?.focus();
    return;
  }
  const fotosSnooze = fotografarDemandas([dem.id]);
  const now = new Date().toISOString();
  const until = addDaysISO(todayISODate(), dias);
  const autor = getLoggedInComentarioAutor();
  const email = getCurrentUserEmail() || "";
  const entry = normalizeHistoricoAlertaEntry({
    id: uid(),
    at: now,
    autor,
    email,
    texto,
    dias,
    until,
    kind: ctx.kind,
    status: dem.status,
  });
  const hist = normalizeHistoricoAlertas(dem.historicoAlertas);
  hist.push(entry);
  dem.historicoAlertas = hist;
  dem.alertaSnooze = {
    kind: ctx.kind,
    status: dem.status,
    until,
    dias,
    at: now,
    autor,
    email,
    texto,
  };
  const cmt = normalizeComentario({
    texto: `${texto}\n\nAlerta adiado por ${dias} dia(s) — volta em ${formatDataISO(until)} se a fase não mudar.`,
    autor,
    createdAt: now,
  });
  if (cmt) dem.comentarios = [cmt, ...normalizeComentarios(dem.comentarios)];
  dem.updatedAt = now;
  if (editingDemandaOpenId === dem.id) {
    if (cmt) {
      editingComentarios = [cmt, ...normalizeComentarios(editingComentarios)];
      renderComentariosList();
    }
    editingDemandaBaselineUpdatedAt = now;
  }
  noteOwnDemandaWrite(dem.id, now);
  saveState({ demanda: migrateDemanda(dem) });
  closeAlertaSnoozeModal();
  renderBoard();
  oferecerDesfazer(`Alerta adiado até ${formatDataISO(until)}`, () => restaurarFotos(fotosSnooze, "Adiamento desfeito"));
}

function initAlertaSnoozeModal() {
  const dlg = document.getElementById("modalAlertaSnooze");
  if (!dlg) return;
  document.getElementById("alertaSnoozeClose")?.addEventListener("click", closeAlertaSnoozeModal);
  document.getElementById("alertaSnoozeCancel")?.addEventListener("click", closeAlertaSnoozeModal);
  document.getElementById("alertaSnoozeOk")?.addEventListener("click", aplicarAlertaSnooze);
  document.getElementById("alertaSnoozeAbrir")?.addEventListener("click", () => {
    const id = alertaSnoozeCtx?.id;
    closeAlertaSnoozeModal();
    if (id) openDemandaModal(id);
  });
  document.getElementById("alertaSnoozeDias")?.addEventListener("input", () => {
    syncAlertaSnoozeUntilHint();
  });
  dlg.addEventListener("close", () => {
    alertaSnoozeCtx = null;
  });
}

/**
 * Captura o scroll do board e de cada coluna ANTES de re-renderizar
 * e devolve um restaurador para chamar DEPOIS. Evita que ações como
 * abrir/fechar um card (que disparam onSnapshot do Firestore) joguem
 * a página de volta ao topo.
 */
function preserveBoardScroll(boardEl) {
  if (!boardEl) return () => {};
  const scrollLeft = boardEl.scrollLeft || 0;
  const scrollTop = boardEl.scrollTop || 0;
  const colScrolls = new Map();
  boardEl.querySelectorAll(".column").forEach((col) => {
    const key = col.dataset.status || col.className || "";
    const body = col.querySelector(".column__body");
    if (body) colScrolls.set(key, body.scrollTop || 0);
  });
  return function restore() {
    boardEl.scrollLeft = scrollLeft;
    boardEl.scrollTop = scrollTop;
    boardEl.querySelectorAll(".column").forEach((col) => {
      const key = col.dataset.status || col.className || "";
      if (!colScrolls.has(key)) return;
      const body = col.querySelector(".column__body");
      if (body) body.scrollTop = colScrolls.get(key);
    });
  };
}

/** Flags ▲▼ só entre cards com a mesma data de chegada (ordem fina). */
function buildCardMoveFlagsMap(list) {
  const flags = Object.create(null);
  const byKey = Object.create(null);
  for (const d of list) {
    const key = demandaAntiguidadeKey(d) || "__";
    if (!byKey[key]) byKey[key] = [];
    byKey[key].push(d);
  }
  for (const peers of Object.values(byKey)) {
    peers.forEach((d, j) => {
      flags[d.id] = { canMoveUp: j > 0, canMoveDown: j < peers.length - 1 };
    });
  }
  return flags;
}

/** Cards por coluna antes do "Mostrar mais" — colunas longas (ex.: Finalizados) não travam a tela. */
const CARDS_POR_COLUNA = 30;
/** Limite atual de cada coluna (`linha:status`), aumentado pelo botão "Mostrar mais". */
const colunaLimiteCards = new Map();

function renderBoardInto(boardEl, boardResponsavel, linha = activeEsteiraCanal) {
  const cfg = getEsteiraConfig(linha);
  const cols = visibleEsteiraStatusKeys(linha);
  const visibleSet = new Set(cols);
  const byCol = Object.fromEntries(cols.map((k) => [k, []]));
  for (const d of demandasForBoard(boardResponsavel, linha)) {
    const st = visibleSet.has(d.status) ? d.status : null;
    if (!st) continue; // não monta cards de colunas ocultas (ex.: finalizados no modo ativos)
    byCol[st].push(d);
  }
  const restoreScroll = preserveBoardScroll(boardEl);
  boardEl.innerHTML = "";
  boardEl.classList.toggle("board--finalizados", esteiraModoColunas === ESTEIRA_MODO_FINALIZADOS);
  boardEl.classList.toggle("board--modo-todos", esteiraModoColunas === ESTEIRA_MODO_TODOS);
  if (!cols.length) {
    const empty = document.createElement("p");
    empty.className = "muted esteira-empty-modo";
    empty.textContent = "Nenhuma coluna neste modo.";
    boardEl.appendChild(empty);
    restoreScroll();
    return;
  }
  const frag = document.createDocumentFragment();
  for (const key of cols) {
    const col = document.createElement("div");
    col.className = "column" + (statusFinalizadosKeys(linha).includes(key) ? " column--finalizado" : "");
    col.dataset.status = key;
    // Sem projetista primeiro (novas demandas chamam atenção), depois a ordem normal da coluna.
    const list = (byCol[key] || [])
      .slice()
      .sort(
        (a, b) =>
          Number(Boolean(normalizeResponsavel(a.responsavel))) - Number(Boolean(normalizeResponsavel(b.responsavel))) ||
          compareDemandaEsteiraOrdem(a, b),
      );
    const moveFlags = buildCardMoveFlagsMap(list);
    col.innerHTML = columnHeadHtml(key, linha, list.length, list) + `<div class="column__body"></div>`;
    const body = col.querySelector(".column__body");
    col.addEventListener("dragover", (e) => { e.preventDefault(); col.classList.add("drag-over"); });
    col.addEventListener("dragleave", () => col.classList.remove("drag-over"));
    col.addEventListener("drop", (e) => {
      e.preventDefault();
      col.classList.remove("drag-over");
      const id = e.dataTransfer.getData("text/plain");
      const dem = state.demandas.find((x) => x.id === id);
      handleDemandaDrop(dem, key, boardResponsavel);
    });
    const cardFrag = document.createDocumentFragment();
    const chaveLimite = `${linha}:${key}`;
    const limite = colunaLimiteCards.get(chaveLimite) || CARDS_POR_COLUNA;
    list.slice(0, limite).forEach((d) => {
      cardFrag.appendChild(renderCard(d, moveFlags[d.id] || { canMoveUp: false, canMoveDown: false }));
    });
    if (list.length > limite) {
      const restam = list.length - limite;
      const mais = document.createElement("button");
      mais.type = "button";
      mais.className = "column__mais";
      mais.textContent = `Mostrar mais ${Math.min(restam, CARDS_POR_COLUNA)} de ${restam} restante${restam > 1 ? "s" : ""}`;
      mais.addEventListener("click", () => {
        colunaLimiteCards.set(chaveLimite, limite + CARDS_POR_COLUNA);
        renderBoard();
        // Leva o foco ao primeiro card novo (quem navega pelo teclado não se perde).
        const novo = boardEl.querySelectorAll(`.column[data-status="${CSS.escape(key)}"] .card[data-id]`)[limite];
        novo?.focus({ preventScroll: false });
      });
      cardFrag.appendChild(mais);
    }
    body.appendChild(cardFrag);
    if (!list.length) body.innerHTML = columnVazioHtml();
    frag.appendChild(col);
  }
  boardEl.appendChild(frag);
  restoreScroll();
}

function renderBoard() {
  const linha = activeEsteiraCanal;
  esteiraModoColunas = readEsteiraModoColunas();
  updateEsteiraModoHints();
  const viewOp = document.getElementById("esteiraViewOperacional");
  const viewB2b = document.getElementById("esteiraViewB2b");
  if (viewOp) viewOp.hidden = linha !== LINHA_ESTEIRA_OPERACIONAL;
  if (viewB2b) viewB2b.hidden = linha !== LINHA_ESTEIRA_B2B;
  const esteira = document.getElementById(linha === LINHA_ESTEIRA_B2B ? "boardEsteiraB2b" : "boardEsteira");
  if (esteira) renderBoardInto(esteira, BOARD_ATRIBUIDOS, linha);
  renderInboxAlertas(linha);
  updateEsteiraStatusLine();
  syncFiltrosSalvosUi();
  podarSelecaoEsteira();
  syncLoteBarra();
}

function setEsteiraTabMenuOpen(open) {
  setDropdownMenuOpen("esteiraTabPanel", "btnTabEsteira", open);
}

function updateTopbarTitle(tab) {
  const el = document.getElementById("topbarTitle");
  if (!el) return;
  const current = tab || document.querySelector(".tabs__btn.is-active")?.dataset.tab || "esteira";
  if (current === "dashboard") el.textContent = "Dashboard";
  else if (current === "usuarios") el.textContent = "Usuários";
  else el.textContent = activeEsteiraCanal === LINHA_ESTEIRA_B2B ? "Esteira B2B" : "Esteira Projetos";
}

function updateEsteiraTabLabel() {
  const el = document.getElementById("esteiraTabLabel");
  if (!el) return;
  const nome = activeEsteiraCanal === LINHA_ESTEIRA_B2B ? "Esteira B2B" : "Esteira Projetos";
  el.textContent = activeEsteiraCanal === LINHA_ESTEIRA_B2B ? "· B2B" : "· Projetos";
  const tab = document.getElementById("btnTabEsteira");
  if (tab) {
    tab.dataset.tip = nome;
    tab.setAttribute("aria-label", nome);
  }
  document.querySelectorAll("[data-esteira-linha]").forEach((item) => {
    item.classList.toggle("is-active", item.dataset.esteiraLinha === activeEsteiraCanal);
  });
  updateTopbarTitle("esteira");
}

function setActiveEsteiraCanal(linha) {
  activeEsteiraCanal = normalizeLinhaEsteira(linha);
  setEsteiraTabMenuOpen(false);
  updateEsteiraTabLabel();
  fillFilterProjetistaSelect(activeEsteiraCanal);
  syncEsteiraFiltroTipoProduto(activeEsteiraCanal);
  updateEsteiraModoHints();
  const panelEsteira = document.getElementById("panelEsteira");
  if (panelEsteira && !panelEsteira.hidden) renderBoard();
}

function getUserHomePreference(user) {
  if (window.DemandasUserHome?.resolve) {
    return window.DemandasUserHome.resolve(user);
  }
  return { tab: "esteira", esteira: LINHA_ESTEIRA_OPERACIONAL };
}

/** Tela inicial após login conforme e-mail em user-home.js */
function applyUserRegionalFilter(user) {
  const email = String(user?.email || "")
    .trim()
    .toLowerCase();
  const sel = document.getElementById("filterRegional");
  if (!sel) return;
  const preferred =
    typeof DemandasRoles !== "undefined" && DemandasRoles.regionalForEmail
      ? DemandasRoles.regionalForEmail(email)
      : "";
  const reg = preferred && REGIONAIS_ORDER.includes(preferred) ? preferred : "";
  sel.value = reg;
  fillFilterCidadeSelect(reg);
}

function applyUserHomeOnLogin(user) {
  const home = getUserHomePreference(user);
  applyUserRegionalFilter(user);
  if (home.tab === "esteira") {
    setActiveEsteiraCanal(home.esteira || LINHA_ESTEIRA_OPERACIONAL);
    switchMainTab("esteira");
    renderBoard();
    return;
  }
  if (panels[home.tab]) {
    switchMainTab(home.tab);
    return;
  }
  setActiveEsteiraCanal(LINHA_ESTEIRA_OPERACIONAL);
  switchMainTab("esteira");
  renderBoard();
}

/** Cards com o painel de detalhes aberto — sobrevive aos re-renders do board. */
const cardsExpandidos = new Set();

const CARD_ICONS = {
  relogio:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8.5" r="5.5"/><path d="M8 5.5v3l2 1.5M6.5 1.5h3"/></svg>',
  tarefas:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="2.5"/><path d="M5 8.2l2 2 4-4.2"/></svg>',
  comentario:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z"/></svg>',
  imagem:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3" width="12" height="10" rx="1.5"/><circle cx="6" cy="6.5" r="1.2"/><path d="M2.5 12l3.5-3.5 2.5 2.5 2-2 3 3"/></svg>',
  pino:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 14.5s4.5-4.2 4.5-7.7a4.5 4.5 0 0 0-9 0c0 3.5 4.5 7.7 4.5 7.7z"/><circle cx="8" cy="6.8" r="1.6"/></svg>',
};

/** Próxima coluna do fluxo (sem pausado/reprovado); execução regional/terceirizada são alternativas. */
const CARD_PROXIMA_ETAPA_FIXA = {
  [LINHA_ESTEIRA_OPERACIONAL]: { execucao: "configuracao_op", execucao_terceirizada: "configuracao_op" },
  [LINHA_ESTEIRA_B2B]: { configuracao: "documentacao", execucao_terceirizada: "documentacao" },
};

function cardProximaEtapa(dm) {
  const linha = normalizeLinhaEsteira(dm.linhaEsteira);
  if (isDemandaEncerrada(dm) || dm.status === "pausado" || dm.status === "reprovado") return "";
  const fixa = CARD_PROXIMA_ETAPA_FIXA[linha]?.[dm.status];
  if (fixa) return fixa;
  const fluxo = getEsteiraConfig(linha)
    .statusOrder.map(([k]) => k)
    .filter((k) => k !== "pausado" && k !== "reprovado");
  const idx = fluxo.indexOf(dm.status);
  return idx >= 0 && idx < fluxo.length - 1 ? fluxo[idx + 1] : "";
}

/** Barra de prazo: chegada → prazo previsto, colorida pela urgência. */
function cardPrazoInfo(dm) {
  const prazo = dm.dataFimPrevista;
  if (!prazo || !parseDate(prazo)) return null;
  if (isDemandaEncerrada(dm)) {
    if (dm.status === "reprovado") return null;
    const atraso = demandaDiasAtraso(dm);
    return atraso > 0
      ? { tom: "atraso", pct: 100, texto: `Entregue com ${formatDiasAtrasoLabel(atraso)} de atraso` }
      : { tom: "ok", pct: 100, texto: "Entregue no prazo" };
  }
  if (isAtraso(dm)) {
    return { tom: "atraso", pct: 100, texto: `Atrasado ${formatDiasAtrasoLabel(demandaDiasAtraso(dm))}` };
  }
  const hoje = todayISODate();
  const restam = diasEntreDatasISO(hoje, prazo);
  const inicio = demandaInicioContagemAberto(dm);
  const total = inicio ? diasEntreDatasISO(inicio, prazo) : 0;
  const passados = inicio ? diasEntreDatasISO(inicio, hoje) : 0;
  const pct = total > 0 ? Math.min(100, Math.max(4, Math.round((passados / total) * 100))) : 100;
  const texto = restam <= 0 ? "Vence hoje" : restam === 1 ? "Vence amanhã" : `Vence em ${restam} dias`;
  return { tom: restam <= 3 ? "alerta" : "ok", pct, texto };
}

/**
 * Atividade(s) em execução e a próxima da checklist.
 * Em execução = status "Em andamento"; se nenhuma estiver marcada assim, as que já começaram pela data
 * (início ≤ hoje) e não foram concluídas. Próxima = a primeira pendente que não está em execução.
 */
function checklistAtualEProxima(checklist) {
  const hoje = todayISODate();
  const pendentes = (checklist || []).filter((it) => !it.done);
  let atuais = pendentes.filter((it) => normalizeChecklistStatus(it) === "andamento");
  if (!atuais.length) {
    atuais = pendentes.filter((it) => {
      const ini = checklistGanttItemStart(it);
      return ini && ini <= hoje;
    });
  }
  const proxima = pendentes.find((it) => !atuais.includes(it)) || null;
  return { atuais, atual: atuais[0] || null, proxima };
}

function cardAtividadeDatasHtml(it) {
  const ini = it.dateInicio ? formatDataCurta(it.dateInicio).slice(0, 5) : "";
  const fim = it.date ? formatDataCurta(it.date).slice(0, 5) : "";
  const nova = checklistNovaData(it) ? formatDataCurta(it.dateNova).slice(0, 5) : "";
  if (!ini && !fim) return `<span class="card__agora-datas"><span>Sem datas previstas</span></span>`;
  const fimHtml = nova
    ? `<span title="Término original ${escapeHtml(fim)} · nova data ${escapeHtml(nova)}">Fim <s>${escapeHtml(fim)}</s> <b>${escapeHtml(nova)}</b></span>`
    : fim
      ? `<span>Fim <b>${escapeHtml(fim)}</b></span>`
      : "";
  return `<span class="card__agora-datas">${ini ? `<span>Início <b>${escapeHtml(ini)}</b></span>` : ""}${fimHtml}</span>`;
}

function cardAtividadeTitulo(prefixo, it) {
  const sit = checklistItemSituacao(it);
  return [
    `${prefixo}: ${it.name}`,
    (it.who || "").trim() ? `Responsável: ${it.who.trim()}` : "",
    it.dateInicio ? `Início previsto: ${formatDataCurta(it.dateInicio)}` : "",
    it.date ? `Fim previsto: ${formatDataCurta(it.date)}` : "",
    checklistNovaData(it) ? `Nova data de término: ${formatDataCurta(it.dateNova)}` : "",
    sit.texto,
  ]
    .filter(Boolean)
    .join("\n");
}

/** "Status atual" do card: a atividade em execução (com datas e prazo) e, abaixo, a próxima. */
function cardAtividadeAtualHtml(checklist) {
  const { atuais, atual, proxima } = checklistAtualEProxima(checklist);
  if (!atual && !proxima) return "";
  const foco = atual || proxima;
  const sit = checklistItemSituacao(foco);
  const prazo = checklistItemPrazo(foco);
  const tom = atual ? (sit.tom === "late" ? "late" : "active") : sit.tom === "late" ? "late" : "wait";
  const extras = atuais.length > 1 ? ` <span class="card__agora-mais" title="${atuais.length} atividades em execução">+${atuais.length - 1}</span>` : "";
  const prox =
    atual && proxima
      ? `<span class="card__agora-prox" title="${escapeHtml(cardAtividadeTitulo("Próxima atividade", proxima))}">` +
        `<span class="card__agora-prox-label">Próxima:</span> <span class="card__agora-prox-nome">${escapeHtml(proxima.name)}</span>` +
        (proxima.dateInicio ? ` <span class="card__agora-prox-data">· ${escapeHtml(formatDataCurta(proxima.dateInicio).slice(0, 5))}</span>` : "") +
        `</span>`
      : "";
  return (
    `<div class="card__agora is-${tom}${atual ? " is-executando" : ""}" title="${escapeHtml(
      cardAtividadeTitulo(atual ? "Em execução" : "Próxima atividade", foco),
    )}">` +
    `<span class="card__agora-label">${atual ? "▶ Em execução" : "Próxima atividade"}${extras}</span>` +
    `<strong class="card__agora-nome">${escapeHtml(foco.name)}</strong>` +
    `<span class="card__agora-meta">${cardAtividadeDatasHtml(foco)}${
      prazo.texto ? `<span class="card__agora-prazo">${escapeHtml(prazo.texto)}</span>` : ""
    }</span>` +
    prox +
    `</div>`
  );
}

function cardDetalheRow(label, valor) {
  return `<dt>${escapeHtml(label)}</dt><dd title="${escapeHtml(valor)}">${escapeHtml(valor)}</dd>`;
}

function renderCard(d, { canMoveUp = false, canMoveDown = false } = {}) {
  const el = document.createElement("article");
  const dmCard = migrateDemanda(d);
  const readOnly = isReadOnlyUser();
  const expandido = cardsExpandidos.has(d.id);
  el.className =
    "card " +
    tipoCardClass(d.tipo) +
    (dmCard.linhaEsteira === LINHA_ESTEIRA_B2B ? " card--b2b" : " card--esteira-projetos");
  if (isAtraso(d) && !isDemandaEncerrada(dmCard)) el.classList.add("card--atraso");
  if (d.status === "pausado") el.classList.add("card--pausado");
  if (d.status === "reprovado") el.classList.add("card--reprovado");
  if (normalizeEditingBy(d.editingBy)) {
    el.classList.add("card--being-edited");
  }
  if (expandido) el.classList.add("card--expandido");
  const emSelecao = selecaoEsteira.ativa;
  if (emSelecao) {
    el.classList.add("card--selecionavel");
    const sel = selecaoEsteira.ids.has(d.id);
    el.classList.toggle("is-selecionado", sel);
    el.setAttribute("aria-pressed", sel ? "true" : "false");
  }
  el.draggable = !readOnly && !emSelecao;
  el.dataset.id = d.id;
  el.tabIndex = 0;
  // Card como "artigo" focável (não botão: tem botões dentro). Teclado: ver cardTecladoAjuda.
  el.setAttribute("aria-label", `Projeto ${d.titulo || ""} — ${labelStatus(d.status, dmCard.linhaEsteira)}`.trim());
  el.setAttribute("aria-describedby", "cardTecladoAjuda");
  el.setAttribute(
    "aria-keyshortcuts",
    readOnly ? "Enter ArrowUp ArrowDown ArrowLeft ArrowRight" : "Enter ArrowUp ArrowDown ArrowLeft ArrowRight Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight",
  );
  if (readOnly) el.classList.add("card--readonly");
  el.addEventListener("dragstart", (e) => {
    const from = e.target instanceof Element ? e.target : e.target?.parentElement;
    if (isReadOnlyUser()) {
      e.preventDefault();
      return;
    }
    if (from?.closest(".card__prio, .card__acoes")) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData("text/plain", d.id);
    e.dataTransfer.effectAllowed = "move";
    // Depois do snapshot da imagem de arraste: o card de origem vira "fantasma".
    setTimeout(() => el.classList.add("card--drag-source"), 0);
  });
  el.addEventListener("dragend", () => el.classList.remove("card--drag-source"));
  el.addEventListener("click", (e) => {
    if (selecaoEsteira.ativa) {
      e.preventDefault();
      alternarSelecaoCard(d.id, el);
      return;
    }
    const from = e.target instanceof Element ? e.target : e.target?.parentElement;
    if (from?.closest(".card__prio, .card__acoes")) return;
    openDemandaModal(d.id);
  });
  el.addEventListener("keydown", (e) => {
    if (e.target !== el) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (selecaoEsteira.ativa) alternarSelecaoCard(d.id, el);
      else openDemandaModal(d.id);
      return;
    }
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown") && !isReadOnlyUser()) {
      e.preventDefault();
      const dir = e.key === "ArrowUp" ? -1 : 1;
      if ((dir < 0 && !canMoveUp) || (dir > 0 && !canMoveDown)) return;
      moveDemandaOrdemEsteira(d.id, dir);
      focusCardById(d.id);
      return;
    }
    if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight") && !isReadOnlyUser()) {
      e.preventDefault();
      moverCardDeColunaPeloTeclado(d.id, e.key === "ArrowLeft" ? -1 : 1);
      return;
    }
    if (!e.altKey && !e.ctrlKey && !e.metaKey && /^Arrow(Up|Down|Left|Right)$/.test(e.key)) {
      e.preventDefault();
      focarCardVizinho(el, e.key);
    }
  });

  const tipo = normalizeTipo(d.tipo);
  const produtoHtml =
    tipo === "B2B" && dmCard.produtoB2b
      ? `<span class="badge badge--produto-b2b">${escapeHtml(dmCard.produtoB2b)}</span>`
      : "";
  const segmentoHtml =
    tipo === "B2C" && dmCard.segmentoB2c
      ? `<span class="badge badge--segmento-b2c">${escapeHtml(dmCard.segmentoB2c)}</span>`
      : "";
  const prioHtml = readOnly
    ? ""
    : `<div class="card__prio" title="Ajuste fino na coluna (mesma data de chegada)">` +
      `<button type="button" class="card-prio-btn" data-dir="-1" aria-label="Subir na coluna"${canMoveUp ? "" : " disabled"}>▲</button>` +
      `<button type="button" class="card-prio-btn" data-dir="1" aria-label="Descer na coluna"${canMoveDown ? "" : " disabled"}>▼</button>` +
      `</div>`;

  const prazo = cardPrazoInfo(dmCard);
  const prazoHtml = prazo
    ? `<div class="card__prazo card__prazo--${prazo.tom}" title="Prazo previsto: ${escapeHtml(formatDataCurta(dmCard.dataFimPrevista))}">` +
      `<div class="card__prazo-bar"><span style="width:${prazo.pct}%"></span></div>` +
      `<p class="card__prazo-txt">${escapeHtml(prazo.texto)}</p>` +
      `</div>`
    : "";

  const snoozeAtivo =
    alertaSnoozeAtivo(dmCard, ALERTA_KIND_SEM_ATRIB) || alertaSnoozeAtivo(dmCard, ALERTA_KIND_COLUNA);
  const diasColuna = diasAcimaDaMeta(dmCard);
  const mostraColunaAlerta =
    !snoozeAtivo &&
    !isStatusConcluidoDemanda(dmCard) &&
    !isDemandaEncerrada(dmCard) &&
    normalizeResponsavel(dmCard.responsavel) &&
    diasColuna != null;
  if (mostraColunaAlerta) el.classList.add("card--coluna-alerta");
  const colunaAlertaHtml = mostraColunaAlerta
    ? `<p class="card__coluna-alerta"><strong>${escapeHtml(String(diasColuna))} dia(s)</strong> nesta coluna · meta ${metaDiasDemanda(dmCard)}d</p>`
    : "";

  const respNomes = demandaProjetistasList(d);
  const pessoaHtml = respNomes.length
    ? cardPessoasHtml(respNomes)
    : `<span class="badge badge--pend">${escapeHtml(labelProjetista(d.responsavel))}</span>`;
  const cidades = formatCidadesDemanda(d);
  const cidadeHtml = cidades
    ? `<span class="card__cidade" title="${escapeHtml(cidades)}">${CARD_ICONS.pino}<span>${escapeHtml(cidades)}</span></span>`
    : "";

  const checklist = normalizeChecklist(dmCard.checklist);
  const feitas = checklist.filter((it) => it.done).length;
  const nComent = Array.isArray(dmCard.comentarios) ? dmCard.comentarios.length : 0;
  const nImg = Array.isArray(dmCard.imagens) ? dmCard.imagens.length : 0;
  const diasAberto = demandaDiasAberto(d);
  const diasAbertoTitle = isStatusConcluidoDemanda(dmCard)
    ? "Dias aberto até a conclusão"
    : dmCard.status === "reprovado"
      ? "Dias aberto até a reprovação"
      : "Dias desde a chegada — atualiza diariamente";
  const stats = [];
  if (demandaInicioContagemAberto(dmCard)) {
    stats.push(`<span class="card__stat" title="${diasAbertoTitle}">${CARD_ICONS.relogio}${diasAberto}d</span>`);
  }
  if (nComent) stats.push(`<span class="card__stat" title="${nComent} comentário(s)">${CARD_ICONS.comentario}${nComent}</span>`);
  if (nImg) stats.push(`<span class="card__stat" title="${nImg} imagem(ns)">${CARD_ICONS.imagem}${nImg}</span>`);

  const proxima = cardProximaEtapa(dmCard);
  const proximaLabel = proxima ? labelStatus(proxima, dmCard.linhaEsteira) : "";
  // Com atividade pendente, o botão conclui a atividade (e move para a coluna configurada nela);
  // sem checklist pendente, segue avançando para a próxima coluna.
  const atividadeConcluir = readOnly || isDemandaEncerrada(dmCard) ? null : cardAtividadeParaConcluir(dmCard);
  const destinoConcluir = atividadeConcluir
    ? destinoMoverValido(atividadeConcluir.moverPara, dmCard.status, dmCard.linhaEsteira)
    : "";
  const podeAvancar = !readOnly && proxima && normalizeResponsavel(dmCard.responsavel);
  const avancarHtml = atividadeConcluir
    ? `<button type="button" class="card__avancar card__concluir" data-concluir="${escapeHtml(atividadeConcluir.id)}" title="${escapeHtml(
        `Concluir “${atividadeConcluir.name}”` +
          (destinoConcluir ? ` e mover o projeto para «${labelStatus(destinoConcluir, dmCard.linhaEsteira)}»` : ""),
      )}">✓ Concluir${destinoConcluir ? " ▸" : ""}</button>`
    : podeAvancar
      ? `<button type="button" class="card__avancar" title="Mover para ${escapeHtml(proximaLabel)}">Avançar ▸</button>`
      : "";

  let solicitante = (d.solicitante || "").trim();
  if (solicitante && dmCard.setorSolicitanteB2b) solicitante += ` (${dmCard.setorSolicitanteB2b})`;

  // Progresso do checklist: um segmento por atividade, colorido pelo status, e a próxima atividade abaixo.
  let checklistHtml = "";
  if (checklist.length) {
    const { atuais } = checklistAtualEProxima(checklist);
    const segs = checklist
      .map((it) => {
        const sit = checklistItemSituacao(it);
        const atual = atuais.includes(it);
        const tom = atual ? "atual" : sit.tom;
        const dica = `${it.name} · ${atual ? `Em execução · ${sit.texto}` : sit.texto}`;
        return `<span class="card__ck-seg is-${tom}" title="${escapeHtml(dica)}"></span>`;
      })
      .join("");
    const completo = feitas === checklist.length;
    let proxHtml;
    if (completo) {
      proxHtml = `<p class="card__ck-prox is-completo">✓ Todas as atividades concluídas</p>`;
    } else {
      proxHtml = cardAtividadeAtualHtml(checklist);
    }
    checklistHtml =
      `<div class="card__ck" aria-label="${escapeHtml(`Tarefas do projeto: ${feitas} de ${checklist.length} concluídas`)}">` +
      `<div class="card__ck-head"><span class="card__ck-titulo">${CARD_ICONS.tarefas}Tarefas</span>` +
      `<span class="card__ck-frac${completo ? " is-completo" : ""}">${feitas}/${checklist.length}</span></div>` +
      `<div class="card__ck-bar">${segs}</div>${proxHtml}</div>`;
  } else {
    checklistHtml = `<p class="card__ck-vazio">${CARD_ICONS.tarefas}Sem atividades registradas</p>`;
  }

  const detalhes = [
    solicitante ? cardDetalheRow("Solicitante", solicitante) : "",
    dmCard.dataChegada ? cardDetalheRow("Chegada", formatDataCurta(dmCard.dataChegada)) : "",
    dmCard.dataFimPrevista ? cardDetalheRow("Finalização prevista", formatDataCurta(dmCard.dataFimPrevista)) : "",
    dmCard.dataFimAtualizada
      ? cardDetalheRow("Finalização atualizada", formatDataCurta(dmCard.dataFimAtualizada))
      : "",
    dmCard.dataTermino ? cardDetalheRow("Término", formatDataCurta(dmCard.dataTermino)) : "",
    dmCard.chamadoOcomon ? cardDetalheRow("Ocomon", dmCard.chamadoOcomon) : "",
    respNomes.length > 1 ? cardDetalheRow("Projetistas", respNomes.join(", ")) : "",
  ].join("");
  const detalhesId = `cardDet-${d.id}`;
  const detalhesHtml = expandido
    ? `<dl class="card__detalhes" id="${escapeHtml(detalhesId)}">${detalhes || cardDetalheRow("Detalhes", "Sem dados adicionais")}</dl>`
    : "";

  el.innerHTML = `
    <div class="card__top">
      <div class="card__tags">
        <span class="badge ${tipoBadgeClass(tipo)}">${escapeHtml(tipo)}</span>
        ${produtoHtml}
        ${segmentoHtml}
      </div>
      ${prioHtml}
    </div>
    <h3 class="card__title"></h3>
    ${cardEditingByHtml(d)}
    ${prazoHtml}
    ${colunaAlertaHtml}
    <div class="card__pessoa">
      ${pessoaHtml}
      ${cidadeHtml}
    </div>
    ${checklistHtml}
    ${detalhesHtml}
    <div class="card__foot">
      <div class="card__stats">${stats.join("")}</div>
      <div class="card__acoes">
        ${avancarHtml}
        <button type="button" class="card__expandir" aria-expanded="${expandido}" aria-controls="${escapeHtml(detalhesId)}"
          aria-label="${expandido ? "Recolher detalhes" : "Ver detalhes"}" title="${expandido ? "Recolher detalhes" : "Ver detalhes"}">${expandido ? "▴" : "▾"}</button>
      </div>
    </div>
  `;
  el.querySelector(".card__title").textContent = d.titulo;
  if (emSelecao) el.insertAdjacentHTML("afterbegin", '<span class="card__sel" aria-hidden="true"></span>');
  el.querySelectorAll(".card-prio-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (btn.disabled) return;
      moveDemandaOrdemEsteira(d.id, Number(btn.dataset.dir));
    });
    btn.addEventListener("mousedown", (e) => e.stopPropagation());
  });
  el.querySelector(".card__expandir")?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (cardsExpandidos.has(d.id)) cardsExpandidos.delete(d.id);
    else cardsExpandidos.add(d.id);
    const novo = renderCard(d, { canMoveUp, canMoveDown });
    el.replaceWith(novo);
    novo.querySelector(".card__expandir")?.focus();
  });
  el.querySelector(".card__avancar")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const btn = e.currentTarget;
    if (btn.dataset.concluir) {
      concluirAtividadePeloCard(d.id, btn.dataset.concluir);
      return;
    }
    const dem = state.demandas.find((x) => x.id === d.id);
    if (!dem) return;
    handleDemandaDrop(dem, proxima, BOARD_ATRIBUIDOS);
    toast(`Movido para ${proximaLabel}`);
  });
  return el;
}

/** Devolve o foco ao card após um re-render do board (ex.: reordenar pelo teclado). */
/** Setas no quadro: ↑↓ no mesmo card da coluna, ←→ para a coluna ao lado (mesma altura). */
function focarCardVizinho(card, tecla) {
  const col = card.closest(".column");
  const board = card.closest(".board, [id^='boardEsteira']") || document;
  if (!col) return;
  const cards = (c) => [...c.querySelectorAll(".card[data-id]")];
  const daColuna = cards(col);
  const i = daColuna.indexOf(card);
  if (tecla === "ArrowUp" || tecla === "ArrowDown") {
    daColuna[i + (tecla === "ArrowUp" ? -1 : 1)]?.focus();
    return;
  }
  const colunas = [...board.querySelectorAll(".column")];
  const dir = tecla === "ArrowLeft" ? -1 : 1;
  for (let j = colunas.indexOf(col) + dir; j >= 0 && j < colunas.length; j += dir) {
    const alvo = cards(colunas[j]);
    if (alvo.length) {
      const destino = alvo[Math.min(i, alvo.length - 1)];
      destino.focus();
      destino.scrollIntoView({ block: "nearest", inline: "nearest" });
      return;
    }
  }
}

/** Alt+←/→: leva o projeto para a etapa anterior/seguinte (mesma regra do arrastar, com Desfazer). */
function moverCardDeColunaPeloTeclado(id, dir) {
  const dem = state.demandas.find((x) => x.id === id);
  if (!dem) return;
  const linha = migrateDemanda(dem).linhaEsteira;
  const cols = visibleEsteiraStatusKeys(linha);
  const destino = cols[cols.indexOf(dem.status) + dir];
  if (!destino) {
    toast(dir < 0 ? "Já está na primeira etapa visível" : "Já está na última etapa visível");
    return;
  }
  handleDemandaDrop(dem, destino, BOARD_ATRIBUIDOS);
  focusCardById(id);
}

function focusCardById(id) {
  requestAnimationFrame(() => {
    const sel = `.card[data-id="${CSS.escape(String(id))}"]`;
    document.querySelector(sel)?.focus({ preventScroll: false });
  });
}

/** Iniciais do avatar: "Vinicius" → VI, "Ana Souza" → AS. */
function cardAvatarIniciais(nome) {
  const partes = String(nome || "").trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

/** Matiz estável por nome — o mesmo projetista mantém a mesma cor em todos os cards. */
function cardAvatarHue(nome) {
  let h = 0;
  for (const ch of String(nome || "")) h = (h * 31 + ch.codePointAt(0)) % 360;
  return h;
}

function cardPessoasHtml(nomes) {
  const principal = nomes[0];
  const extra = nomes.length > 1 ? ` <span class="card__people-more">+${nomes.length - 1}</span>` : "";
  return (
    `<span class="card__people" title="${escapeHtml(nomes.join(" · "))}">` +
    `<span class="card__avatar" style="--avatar-h:${cardAvatarHue(principal)}">${escapeHtml(cardAvatarIniciais(principal))}</span>` +
    `<span class="card__people-names">${escapeHtml(principal)}${extra}</span>` +
    `</span>`
  );
}

function formatCallableError(err, fallback) {
  const code = String(err?.code || "").replace(/^functions\//i, "").toLowerCase();
  const details = typeof err?.details === "string" ? err.details.trim() : "";
  const raw = String(err?.message || "")
    .replace(/^Firebase:\s*/i, "")
    .replace(/\s*\([^)]*\)\s*$/, "")
    .trim();
  if (code === "unauthenticated") return details || "Faça login de novo.";
  if (code === "not-found") {
    return "A função não está publicada. No CMD: firebase deploy --only functions";
  }
  if (code === "internal" || raw.toLowerCase() === "internal") {
    return details || fallback || "Erro no servidor. Publique de novo: firebase deploy --only functions";
  }
  if (code === "failed-precondition" || code === "unavailable" || code === "invalid-argument") {
    return details || raw || fallback;
  }
  return details || raw || fallback || "Não foi possível concluir.";
}

async function enviarDemandaClickup(id, btn, instrucoes) {
  if (!requireWriteAccess()) return;
  const texto = String(instrucoes || "").trim();
  if (!texto) {
    toast("Informe as instruções do que deverá ser feito.");
    return;
  }
  if (typeof firebase === "undefined" || !firebase.functions) {
    toast("Recarregue a página (Ctrl+F5) para carregar o ClickUp.");
    return;
  }
  const prev = btn?.textContent || "Enviar à Operação";
  beginOwnDemandaWrite(id);
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Enviando…";
  }
  try {
    const fns = firebase.app().functions("us-central1");
    const call = fns.httpsCallable("createClickupOperacao");
    const res = await call({ demandaId: id, instrucoes: texto });
    const data = res?.data || {};
    if (data.url) {
      const idx = state.demandas.findIndex((x) => x.id === id);
      if (idx >= 0) {
        const now = new Date().toISOString();
        const clickup = {
          taskId: data.taskId || "",
          url: data.url,
          status: data.status || "Nova demanda",
          listId: "901716986422",
          createdAt: now,
          instrucoes: texto,
        };
        const dem = { ...state.demandas[idx], clickup, clickupTaskId: clickup.taskId, updatedAt: now };
        if (!data.already) {
          const cmt = normalizeComentario({
            texto: `Demanda enviada para o time de Operação no ClickUp (Nova demanda).\nInstruções: ${texto}\n${data.url}`,
            autor: getLoggedInComentarioAutor(),
            createdAt: now,
          });
          if (cmt) {
            dem.comentarios = [cmt, ...normalizeComentarios(dem.comentarios)];
            if (document.getElementById("demId")?.value === id) {
              editingComentarios = [cmt, ...normalizeComentarios(editingComentarios)];
              renderComentariosList();
            }
          }
        }
        state.demandas[idx] = dem;
        noteOwnDemandaWrite(id, now);
        saveState({ demanda: migrateDemanda(dem) });
        renderBoard();
        setClickupUiOverride(id, clickup);
      } else {
        setClickupUiOverride(id, {
          taskId: data.taskId || "",
          url: data.url,
          status: data.status || "Nova demanda",
          instrucoes: texto,
        });
      }
      toast(data.already ? "Já existe no ClickUp" : "Demanda criada no ClickUp");
    } else {
      toast("ClickUp não retornou o link da tarefa");
    }
  } catch (err) {
    toast(formatCallableError(err, "Não foi possível criar no ClickUp"));
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = prev;
    }
    syncDemClickupUi();
  }
}
