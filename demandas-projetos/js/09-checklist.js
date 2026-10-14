/**
 * Checklist do projeto: edição, dependências, nova data e cronograma.
 * Só declarações (funções e constantes); o que roda ao abrir a página fica em app.js.
 */
function readChecklistEtapaDraft(ids) {
  return {
    name: (document.getElementById(ids.name)?.value || "").trim(),
    descricao: (document.getElementById(ids.descricao)?.value || "").trim(),
    who: (document.getElementById(ids.who)?.value || "").trim(),
    dateInicio: (document.getElementById(ids.dateInicio)?.value || "").trim(),
    date: (document.getElementById(ids.date)?.value || "").trim(),
    ...(ids.dateConclusao && document.getElementById(ids.dateConclusao)
      ? { dateConclusao: (document.getElementById(ids.dateConclusao).value || "").trim() }
      : {}),
    ...(ids.dateNova && document.getElementById(ids.dateNova)
      ? { dateNova: (document.getElementById(ids.dateNova).value || "").trim() }
      : {}),
    ...(ids.dependeDe && document.getElementById(ids.dependeDe)
      ? { dependeDe: document.getElementById(ids.dependeDe).value || "" }
      : {}),
    ...(ids.moverPara && document.getElementById(ids.moverPara)
      ? { moverPara: document.getElementById(ids.moverPara).value || "" }
      : {}),
  };
}

function validateChecklistEtapa(draft, focusId) {
  // Datas são opcionais: sem término a atividade fica "Sem prazo" (nunca atrasada).
  if (!draft.name || !draft.who) {
    toast("Preencha a atividade e o responsável.");
    return false;
  }
  if (draft.dateInicio && draft.date && draft.dateInicio > draft.date) {
    toast("A previsão de início deve ser anterior ou igual ao término.");
    if (focusId) document.getElementById(focusId)?.focus();
    return false;
  }
  if (draft.dateNova && (!draft.date || draft.dateNova <= draft.date)) {
    toast(
      draft.date
        ? `A nova data deve ser depois do término original (${formatDataCurta(draft.date)}).`
        : "Preencha o término original antes de definir uma nova data.",
    );
    document.getElementById("demChecklistEditNova")?.focus();
    return false;
  }
  return true;
}

function applyChecklistItemPatch(id, patch) {
  // Mantém `status` e `done` coerentes, venha a mudança por um ou por outro.
  const p = { ...patch };
  if (p.status && CHECKLIST_STATUS_LABEL[p.status]) p.done = p.status === "concluida";
  else if (typeof p.done === "boolean") p.status = p.done ? "concluida" : "afazer";
  let concluida = null;
  editingChecklist = normalizeChecklist(editingChecklist).map((row) => {
    if (row.id !== id) return row;
    const next = { ...row, ...p };
    if (next.done && !row.done) concluida = next;
    // Ao concluir, registra a data real (hoje) se ainda não houver; ao reabrir, limpa.
    if (p.done === true && !row.done && !p.dateConclusao) next.dateConclusao = todayISODate();
    if (p.done === false) next.dateConclusao = "";
    if (!next.done) next.dateConclusao = "";
    return next;
  });
  propagarDependenciasChecklist();
  if (concluida) moverProjetoPelaAtividade(concluida);
}

function persistOpenChecklistEdit() {
  if (!editingChecklistItemId) return;
  const draft = readChecklistEtapaDraft({
    name: "demChecklistEditName",
    descricao: "demChecklistEditDesc",
    who: "demChecklistEditWho",
    dateInicio: "demChecklistEditInicio",
    date: "demChecklistEditFim",
    dateConclusao: "demChecklistEditConclusao",
    dateNova: "demChecklistEditNova",
    dependeDe: "demChecklistEditDep",
    moverPara: "demChecklistEditMover",
  });
  if (!draft.name) return;
  applyChecklistItemPatch(editingChecklistItemId, draft);
}

function moveChecklistItem(id, delta) {
  if (!requireWriteAccess()) return;
  persistOpenChecklistEdit();
  const items = normalizeChecklist(editingChecklist);
  const i = items.findIndex((row) => row.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= items.length) return;
  const next = items.slice();
  const [row] = next.splice(i, 1);
  next.splice(j, 0, row);
  editingChecklist = next;
  renderChecklistEditor();
}

function appendChecklistMoveButtons(actions, it, idx, n, readOnly) {
  const wrap = document.createElement("div");
  wrap.className = "checklist-item__move";
  const up = document.createElement("button");
  up.type = "button";
  up.className = "checklist-item__move-up";
  up.textContent = "↑";
  up.setAttribute("aria-label", `Mover “${it.name}” para cima`);
  up.title = idx === 0 ? "Primeira atividade" : "Mover atividade para cima";
  up.disabled = readOnly || idx === 0;
  if (up.disabled) up.dataset.keepDisabled = "1";
  else delete up.dataset.keepDisabled;
  up.addEventListener("click", () => moveChecklistItem(it.id, -1));
  const down = document.createElement("button");
  down.type = "button";
  down.className = "checklist-item__move-down";
  down.textContent = "↓";
  down.setAttribute("aria-label", `Mover “${it.name}” para baixo`);
  down.title = idx === n - 1 ? "Última atividade" : "Mover atividade para baixo";
  down.disabled = readOnly || idx === n - 1;
  if (down.disabled) down.dataset.keepDisabled = "1";
  else delete down.dataset.keepDisabled;
  down.addEventListener("click", () => moveChecklistItem(it.id, 1));
  wrap.append(up, down);
  actions.appendChild(wrap);
}

function refreshChecklistMoveButtons() {
  const readOnly = isReadOnlyUser();
  const items = document.querySelectorAll("#demChecklistList .checklist-item");
  const n = normalizeChecklist(editingChecklist).length;
  items.forEach((li) => {
    const idx = Number(li.dataset.idx);
    const up = li.querySelector(".checklist-item__move-up");
    const down = li.querySelector(".checklist-item__move-down");
    if (up) {
      up.disabled = readOnly || idx === 0;
      if (up.disabled) up.dataset.keepDisabled = "1";
      else delete up.dataset.keepDisabled;
      up.title = idx === 0 ? "Primeira atividade" : "Mover atividade para cima";
    }
    if (down) {
      down.disabled = readOnly || idx === n - 1;
      if (down.disabled) down.dataset.keepDisabled = "1";
      else delete down.dataset.keepDisabled;
      down.title = idx === n - 1 ? "Última atividade" : "Mover atividade para baixo";
    }
  });
}

function saveChecklistItemEdit(id) {
  if (!requireWriteAccess()) return;
  const draft = readChecklistEtapaDraft({
    name: "demChecklistEditName",
    descricao: "demChecklistEditDesc",
    who: "demChecklistEditWho",
    dateInicio: "demChecklistEditInicio",
    date: "demChecklistEditFim",
    dateConclusao: "demChecklistEditConclusao",
    dateNova: "demChecklistEditNova",
    dependeDe: "demChecklistEditDep",
    moverPara: "demChecklistEditMover",
  });
  if (!validateChecklistEtapa(draft, "demChecklistEditInicio")) return;
  applyChecklistItemPatch(id, draft);
  editingChecklistItemId = "";
  renderChecklistEditor();
}

/* ---------- Checklist: mover o projeto de coluna ao concluir uma atividade ---------- */
/** Etapas da esteira do projeto aberto, na ordem das colunas. */
function etapasEsteiraProjetoAberto() {
  const cfg = getEsteiraConfig(editingLinhaEsteira);
  return [...cfg.statusOrder, ...cfg.statusExtra];
}

function fillChecklistMoverSelect(sel, atual) {
  if (!sel) return;
  const etapas = etapasEsteiraProjetoAberto();
  sel.innerHTML =
    '<option value="">Não mover — fica na coluna atual</option>' +
    etapas.map(([k, label]) => `<option value="${escapeHtml(k)}">${escapeHtml(label)}</option>`).join("");
  sel.value = atual && etapas.some(([k]) => k === atual) ? atual : "";
}

function labelEtapaProjetoAberto(status) {
  return etapasEsteiraProjetoAberto().find(([k]) => k === status)?.[1] || "";
}

/**
 * Ao concluir uma atividade com "mover para", leva o projeto para aquela coluna no formulário
 * (gravado ao salvar, com o histórico de etapas). Só avança: nunca volta o projeto para uma coluna anterior.
 */
/** Coluna de destino válida para "mover ao concluir": existe na esteira e não volta o projeto ("" se não move). */
function destinoMoverValido(destino, statusAtual, linha) {
  if (!destino || destino === statusAtual) return "";
  const cfg = getEsteiraConfig(linha);
  const ordem = [...cfg.statusOrder, ...cfg.statusExtra].map(([k]) => k);
  const iDestino = ordem.indexOf(destino);
  if (iDestino < 0) return "";
  const iAtual = ordem.indexOf(statusAtual);
  const atualEhExtra = cfg.statusExtra.some(([k]) => k === statusAtual);
  if (!atualEhExtra && iAtual >= 0 && iDestino < iAtual) return "";
  return destino;
}

function moverProjetoPelaAtividade(it) {
  const sel = document.getElementById("demStatus");
  if (!sel) return false;
  const destino = destinoMoverValido(it?.moverPara, sel.value, editingLinhaEsteira);
  if (!destino) return false;
  sel.value = destino;
  sel.dispatchEvent(new Event("change", { bubbles: true }));
  agendarSyncDemNavegacao();
  const existente = Boolean((document.getElementById("demId")?.value || "").trim());
  toast(
    `“${it.name}” concluída · projeto vai para «${labelEtapaProjetoAberto(destino)}»` +
      (existente ? " — clique em Salvar para confirmar" : ""),
  );
  return true;
}

/* ---------- Card: concluir a atividade atual (e mover de coluna) ---------- */
/** Atividade que o botão do card conclui: a em andamento ou, se nenhuma, a primeira pendente. */
function cardAtividadeParaConcluir(dm) {
  const items = normalizeChecklist(dm.checklist);
  const { atual } = checklistAtualEProxima(items);
  return atual || items.find((it) => !it.done) || null;
}

/** Conclui uma atividade direto pelo card: grava na hora, reagenda dependentes e move de coluna se configurado. */
function concluirAtividadePeloCard(demId, itemId) {
  if (!requireWriteAccess()) return;
  const dem = state.demandas.find((x) => x.id === demId);
  if (!dem) return;
  const antes = migrateDemanda({ ...dem, __isMigrated: false });
  const fotos = fotografarDemandas([demId]);
  const lista = normalizeChecklist(dem.checklist);
  const it = lista.find((x) => x.id === itemId);
  if (!it || it.done) return;
  const bloqueio = checklistBloqueadaPor(lista, it);
  const concluida = lista.map((x) =>
    x.id === itemId ? { ...x, status: "concluida", done: true, dateConclusao: todayISODate() } : x,
  );
  const { items, movidas } = reagendarDependentes(concluida);
  dem.checklist = items;
  const now = new Date().toISOString();
  const linha = antes.linhaEsteira;
  const destino = destinoMoverValido(it.moverPara, dem.status, linha);
  if (destino) {
    dem.status = destino;
    dem.historicoStatus = statusHistoryPush(dem, destino, now);
    if (isStatusConcluidoNoFormulario(destino, linha) && !dem.dataTermino) dem.dataTermino = todayISODate();
    dem.ordemEsteira = ordemAoEntrarColuna(destino, dem.responsavel);
  }
  dem.updatedAt = now;
  invalidateAlertaSnoozeIfStale(dem);
  registrarEdicaoNoHistoricoEdicao(antes, dem);
  noteOwnDemandaWrite(demId, now);
  saveState({ demanda: dem });
  renderBoard();
  const partes = [`“${it.name}” concluída`];
  if (destino) partes.push(`projeto movido para «${labelStatus(destino, linha)}»`);
  if (movidas.size) partes.push(`${movidas.size} dependente(s) reagendada(s)`);
  if (bloqueio) partes.push(`atenção: “${bloqueio.name}” ainda não foi concluída`);
  oferecerDesfazer(partes.join(" · "), () => restaurarFotos(fotos, "Conclusão desfeita"));
}

/* ---------- Dependências entre atividades do checklist ---------- */
/** Atividade da qual `it` depende (término → início), se existir. */
function checklistPredecessora(items, it) {
  if (!it?.dependeDe) return null;
  return items.find((x) => x.id === it.dependeDe && x.id !== it.id) || null;
}

/** Fim real da atividade: data de conclusão (se concluída) ou término previsto. */
function checklistFimEfetivo(it) {
  return (it.done && isoDatePart(it.dateConclusao || "")) || checklistNovaData(it) || isoDatePart(it.date || "") || "";
}

/** Nova data de término (reprogramação), só se for depois do término original; "" se não houver. */
function checklistNovaData(it) {
  const nova = isoDatePart(it?.dateNova || "");
  const fim = isoDatePart(it?.date || "");
  return nova && fim && nova > fim ? nova : "";
}

/** Atividade pendente que passou do término original — pode ganhar uma nova data. */
function checklistPodeReprogramar(it) {
  const fim = isoDatePart(it?.date || "");
  return !!(it && !it.done && fim && todayISODate() > fim);
}

/** Predecessora ainda não concluída de uma atividade pendente (null se liberada). */
function checklistBloqueadaPor(items, it) {
  const p = checklistPredecessora(items, it);
  return !it.done && p && !p.done ? p : null;
}

/** `id` e tudo que depende dele (direta ou indiretamente) — não podem virar predecessoras dele. */
function checklistCadeiaDependentes(items, id) {
  const out = new Set([id]);
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const x of items) {
      if (x.dependeDe && out.has(x.dependeDe) && !out.has(x.id)) {
        out.add(x.id);
        mudou = true;
      }
    }
  }
  return out;
}

function checklistOpcoesDependencia(items, itemId) {
  const proibidos = itemId ? checklistCadeiaDependentes(items, itemId) : new Set();
  return items.filter((x) => !proibidos.has(x.id));
}

function fillChecklistDepSelect(sel, items, itemId, atual) {
  if (!sel) return;
  const opcoes = checklistOpcoesDependencia(items, itemId);
  sel.innerHTML =
    '<option value="">Nenhuma — pode começar a qualquer momento</option>' +
    opcoes.map((x) => `<option value="${escapeHtml(x.id)}">${escapeHtml(x.name)}</option>`).join("");
  sel.value = atual && opcoes.some((x) => x.id === atual) ? atual : "";
}

/**
 * Empurra para frente as atividades pendentes que começariam antes do fim da predecessora,
 * mantendo a duração. Nunca puxa datas para trás. Devolve quantas foram reagendadas.
 */
/**
 * Empurra para frente as atividades pendentes que começariam antes do fim da predecessora,
 * mantendo a duração. Nunca puxa datas para trás. Não altera a lista recebida.
 */
function reagendarDependentes(lista) {
  const items = normalizeChecklist(lista).map((x) => ({ ...x }));
  const byId = new Map(items.map((x) => [x.id, x]));
  const movidas = new Set();
  for (let volta = 0; volta < items.length; volta++) {
    let mudou = false;
    for (const it of items) {
      if (it.done) continue;
      const p = it.dependeDe ? byId.get(it.dependeDe) : null;
      if (!p || p.id === it.id) continue;
      const fimP = checklistFimEfetivo(p);
      if (!fimP) continue;
      const ini = isoDatePart(it.dateInicio || "");
      const fim = isoDatePart(it.date || "");
      if (ini && ini < fimP) {
        const dur = fim && fim >= ini ? diasEntreDatasISO(ini, fim) : 0;
        it.dateInicio = fimP;
        if (fim) it.date = addDaysISO(fimP, dur);
      } else if (!ini && fim && fim < fimP) {
        it.date = fimP;
      } else {
        continue;
      }
      // A nova data deixa de valer se o término empurrado já passou dela.
      if (it.dateNova && it.dateNova <= it.date) it.dateNova = "";
      movidas.add(it.id);
      mudou = true;
    }
    if (!mudou) break;
  }
  return { items, movidas };
}

/** Versão do modal: reagenda o checklist em edição e avisa. Devolve quantas foram reagendadas. */
function propagarDependenciasChecklist() {
  const { items, movidas } = reagendarDependentes(editingChecklist);
  if (movidas.size) {
    editingChecklist = items;
    const nomes = items.filter((x) => movidas.has(x.id)).map((x) => `“${x.name}”`);
    toast(
      movidas.size === 1
        ? `${nomes[0]} foi reagendada para depois da atividade da qual depende`
        : `${movidas.size} atividades dependentes foram reagendadas`,
    );
  }
  return movidas.size;
}

/** Filtro da lista de atividades no modal (todas | pendentes | atrasadas | concluidas). */
let checklistFiltro = "todas";
/** Atividade recém-marcada — ganha uma animação curta na próxima renderização. */
let checklistRecemConcluidaId = "";

const CHECKLIST_FILTROS = [
  ["todas", "Todas"],
  ["afazer", "A fazer"],
  ["andamento", "Em andamento"],
  ["atrasadas", "Atrasadas"],
  ["concluidas", "Concluídas"],
];

/** Prazo da atividade (independe do status): atrasada, termina em N dias, começa em N dias ou sem prazo. */
function checklistItemPrazo(it) {
  let start = checklistGanttItemStart(it);
  let end = checklistGanttItemEnd(it);
  if (start && end && start > end) [start, end] = [end, start];
  const hoje = todayISODate();
  const nova = checklistNovaData(it);
  if (it.done) {
    const concl = it.dateConclusao || "";
    if (concl && end && concl > end) {
      const n = diasEntreDatasISO(end, concl);
      const naNova = nova && concl <= nova ? " (na nova data)" : "";
      return {
        atrasada: false,
        diasAtrasoConclusao: n,
        texto: `Concluída com ${n === 1 ? "1 dia" : `${n} dias`} de atraso${naNova}`,
      };
    }
    return { atrasada: false, texto: concl ? `Concluída em ${formatDataCurta(concl).slice(0, 5)}` : "" };
  }
  if (nova) {
    // Reprogramada: o prazo passa a contar da nova data (o término original fica de histórico).
    if (hoje > nova) {
      const n = diasEntreDatasISO(nova, hoje);
      return { atrasada: true, reprogramada: true, texto: `Atrasada ${n === 1 ? "1 dia" : `${n} dias`} da nova data` };
    }
    const n = diasEntreDatasISO(hoje, nova);
    return {
      atrasada: false,
      reprogramada: true,
      texto: `Nova data · ${n === 0 ? "termina hoje" : n === 1 ? "termina amanhã" : `termina em ${n} dias`}`,
    };
  }
  if (end && hoje > end) {
    const n = diasEntreDatasISO(end, hoje);
    return { atrasada: true, texto: `Atrasada ${n === 1 ? "1 dia" : `${n} dias`}` };
  }
  if (start && hoje < start && normalizeChecklistStatus(it) === "afazer") {
    const n = diasEntreDatasISO(hoje, start);
    return { atrasada: false, texto: n <= 1 ? "Começa amanhã" : `Começa em ${n} dias` };
  }
  if (end) {
    const n = diasEntreDatasISO(hoje, end);
    return { atrasada: false, texto: n === 0 ? "Termina hoje" : n === 1 ? "Termina amanhã" : `Termina em ${n} dias` };
  }
  return { atrasada: false, texto: "Sem prazo" };
}

/**
 * Situação da atividade: o status escolhido manda (a fazer, em andamento, concluída);
 * passar da data de término sem concluir vira "atrasada".
 */
function checklistItemSituacao(it) {
  const status = normalizeChecklistStatus(it);
  if (status === "concluida") {
    const prazoC = checklistItemPrazo(it);
    if (prazoC.diasAtrasoConclusao) return { tom: "done-late", texto: prazoC.texto };
    return { tom: "done", texto: prazoC.texto && it.date && it.dateConclusao ? "Concluída no prazo" : "Concluída" };
  }
  const prazo = checklistItemPrazo(it);
  if (prazo.atrasada) return { tom: "late", texto: prazo.texto };
  const base = CHECKLIST_STATUS_LABEL[status];
  const sufixo = prazo.texto ? ` · ${prazo.texto.charAt(0).toLowerCase()}${prazo.texto.slice(1)}` : "";
  return { tom: status === "andamento" ? "active" : "wait", texto: `${base}${sufixo}` };
}

function checklistPassaFiltro(it, filtro) {
  if (filtro === "concluidas") return it.done;
  if (filtro === "afazer") return normalizeChecklistStatus(it) === "afazer";
  if (filtro === "andamento") return normalizeChecklistStatus(it) === "andamento";
  if (filtro === "atrasadas") return checklistItemSituacao(it).tom === "late";
  return true;
}

function checklistPeriodoTexto(it) {
  const a = it.dateInicio ? formatDataCurta(it.dateInicio).slice(0, 5) : "";
  const b = it.date ? formatDataCurta(it.date).slice(0, 5) : "";
  if (a && b) return a === b ? a : `${a} → ${b}`;
  return a || b || "Sem data";
}

/** Limite do nome da atividade (antes 80). */
const CHECKLIST_NOME_MAX = 200;

function setChecklistItemDone(id, done) {
  if (isReadOnlyUser() || !requireWriteAccess()) return;
  applyChecklistItemPatch(id, { status: done ? "concluida" : "afazer" });
  checklistRecemConcluidaId = done ? id : "";
  renderChecklistEditor();
}

function checklistIconBtn(cls, glyph, label) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = cls;
  b.textContent = glyph;
  b.title = label;
  b.setAttribute("aria-label", label);
  return b;
}

function renderChecklistResumo(items) {
  const n = items.length;
  const d = items.filter((it) => it.done).length;
  const pct = n ? Math.round((d / n) * 100) : 0;
  const frac = document.getElementById("demChecklistFrac");
  if (frac) frac.textContent = `${d}/${n}`;
  const pctEl = document.getElementById("demChecklistPct");
  if (pctEl) pctEl.textContent = `${pct}%`;
  const anel = document.getElementById("demChecklistAnel");
  if (anel) {
    anel.style.setProperty("--pct", String(pct));
    anel.classList.toggle("is-completo", n > 0 && d === n);
  }
  const dots = document.getElementById("demChecklistDots");
  if (dots) {
    dots.innerHTML = items
      .map((it) => {
        const sit = checklistItemSituacao(it);
        return `<span class="card__checklist-dot is-${sit.tom}${it.done ? " is-on" : ""}" title="${escapeHtml(
          `${it.name} · ${sit.texto}`,
        )}"></span>`;
      })
      .join("");
  }
  const filtros = document.getElementById("demChecklistFiltros");
  if (filtros) {
    const conta = Object.fromEntries(
      CHECKLIST_FILTROS.map(([k]) => [k, items.filter((it) => checklistPassaFiltro(it, k)).length]),
    );
    filtros.hidden = !n;
    filtros.innerHTML = CHECKLIST_FILTROS.map(
      ([k, label]) =>
        `<button type="button" class="ck-filtro ck-filtro--${k}${checklistFiltro === k ? " is-on" : ""}" data-filtro="${k}"` +
        ` data-ui-nav="1" aria-pressed="${checklistFiltro === k}">${label}<span class="ck-filtro__n">${conta[k]}</span></button>`,
    ).join("");
  }
}

function renderChecklistProxima(items) {
  const host = document.getElementById("demChecklistNext");
  if (!host) return;
  host.className = "ck-proxima";
  if (!items.length) {
    host.hidden = true;
    host.replaceChildren();
    return;
  }
  host.hidden = false;
  const pendente = items.find((it) => !it.done);
  if (!pendente) {
    host.classList.add("is-completo");
    host.innerHTML = `<span class="ck-proxima__ico" aria-hidden="true">✓</span><div><strong>Todas as atividades concluídas</strong><span class="ck-proxima__meta">${items.length} de ${items.length} feitas</span></div>`;
    return;
  }
  const sit = checklistItemSituacao(pendente);
  host.classList.add(`is-${sit.tom}`);
  host.innerHTML =
    `<span class="ck-proxima__ico" aria-hidden="true">▸</span>` +
    `<div class="ck-proxima__txt"><span class="ck-proxima__label">Próxima atividade</span>` +
    `<strong>${escapeHtml(pendente.name)}</strong>` +
    `<span class="ck-proxima__meta">${escapeHtml(pendente.who || "Sem responsável")} · ${escapeHtml(
      checklistPeriodoTexto(pendente),
    )} · <span class="ck-situacao ck-situacao--${sit.tom}">${escapeHtml(sit.texto)}</span></span></div>`;
  if (!isReadOnlyUser()) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ck-proxima__concluir";
    btn.textContent = "✓ Concluir";
    btn.title = `Marcar “${pendente.name}” como concluída`;
    btn.addEventListener("click", () => setChecklistItemDone(pendente.id, true));
    host.appendChild(btn);
  }
}

function renderChecklistEditor() {
  const items = normalizeChecklist(editingChecklist);
  const n = items.length;
  const list = document.getElementById("demChecklistList");
  renderChecklistResumo(items);
  renderChecklistProxima(items);
  const expand = document.getElementById("btnChecklistExpand");
  if (expand) expand.hidden = isReadOnlyUser();
  const novaDep = document.getElementById("demChecklistDep");
  fillChecklistDepSelect(novaDep, items, "", novaDep?.value || "");
  const novoMover = document.getElementById("demChecklistMover");
  fillChecklistMoverSelect(novoMover, novoMover?.value || "");
  if (!list) return;
  const readOnly = isReadOnlyUser();
  list.innerHTML = "";
  const visiveis = items.filter((it) => checklistPassaFiltro(it, checklistFiltro) || it.id === editingChecklistItemId);
  if (!visiveis.length) {
    const vazio = document.createElement("li");
    vazio.className = "ck-vazio";
    vazio.textContent = n
      ? "Nenhuma atividade neste filtro."
      : readOnly
        ? "Nenhuma atividade registrada."
        : "Nenhuma atividade ainda. Clique em “Nova atividade” para começar.";
    list.appendChild(vazio);
  }
  items.forEach((it, idx) => {
    if (!visiveis.includes(it)) return;
    const editing = !readOnly && editingChecklistItemId === it.id;
    const sit = checklistItemSituacao(it);
    const status = normalizeChecklistStatus(it);
    const li = document.createElement("li");
    li.dataset.idx = String(idx);
    li.className =
      "checklist-item" +
      (it.done ? "" : " is-off") +
      (editing ? " is-editing" : "") +
      ` is-${sit.tom}` +
      (checklistRecemConcluidaId === it.id ? " is-just-done" : "");

    // Ícone só de visualização: muda conforme o status.
    const icone = document.createElement("span");
    icone.className = `ck-icone ck-icone--${status}`;
    icone.setAttribute("role", "img");
    icone.setAttribute("aria-label", CHECKLIST_STATUS_LABEL[status]);
    icone.title = CHECKLIST_STATUS_LABEL[status];

    const remover = async () => {
      if (readOnly) return;
      const ok = await confirmDialog({
        title: "Remover atividade?",
        message: `A atividade “${it.name}” será removida do checklist das tarefas do projeto.`,
        confirmText: "Remover",
        cancelText: "Voltar",
        variant: "danger",
      });
      if (!ok) return;
      if (editingChecklistItemId === it.id) editingChecklistItemId = "";
      editingChecklist = editingChecklist.filter((x) => x.id !== it.id);
      renderChecklistEditor();
    };
    const cancelarEdicao = () => {
      editingChecklistItemId = "";
      renderChecklistEditor();
    };

    if (editing) {
      const edit = document.createElement("div");
      edit.className = "checklist-item__edit";
      const nameField = createChecklistField({
        id: "demChecklistEditName",
        label: "Atividade",
        value: it.name,
        maxLength: CHECKLIST_NOME_MAX,
        placeholder: "PDF do levantamento",
      });
      nameField.wrap.classList.add("checklist-item__edit-nome");
      const descField = createChecklistField({
        id: "demChecklistEditDesc",
        label: "Descrição",
        value: it.descricao,
        maxLength: 160,
        placeholder: "O que esta atividade entrega",
        multiline: true,
      });
      const whoField = createChecklistField({
        id: "demChecklistEditWho",
        label: "Responsável",
        value: it.who,
        maxLength: 80,
        placeholder: "Nome do responsável",
      });
      const startField = createChecklistField({
        id: "demChecklistEditInicio",
        label: "Início (opcional)",
        type: "date",
        value: it.dateInicio,
      });
      const endField = createChecklistField({
        id: "demChecklistEditFim",
        label: "Término (opcional)",
        type: "date",
        value: it.date,
      });
      const conclField = it.done
        ? createChecklistField({
            id: "demChecklistEditConclusao",
            label: "Concluída em",
            type: "date",
            value: it.dateConclusao || "",
          })
        : null;
      // Prazo vencido sem concluir: nova data de término, mantendo o término original de histórico.
      const novaField =
        it.date && (checklistPodeReprogramar(it) || it.dateNova)
          ? createChecklistField({
              id: "demChecklistEditNova",
              label: "Nova data de término",
              type: "date",
              value: it.dateNova || "",
            })
          : null;
      let novaBox = null;
      if (novaField) {
        novaField.input.min = addDaysISO(it.date, 1) || "";
        novaBox = document.createElement("div");
        novaBox.className = "checklist-item__edit-nova";
        const info = document.createElement("p");
        info.className = "checklist-item__edit-nova-info";
        const atraso = diasEntreDatasISO(it.date, it.done ? it.dateConclusao || todayISODate() : todayISODate());
        info.innerHTML =
          `<strong>Término original: ${escapeHtml(formatDataCurta(it.date))}</strong>` +
          (!it.done && atraso > 0 ? ` · passou há ${atraso === 1 ? "1 dia" : `${atraso} dias`}` : "") +
          `<span>A data original fica guardada; o prazo passa a contar da nova data. Deixe em branco para manter o original.</span>`;
        novaBox.append(novaField.wrap, info);
      }
      const depWrap = document.createElement("label");
      depWrap.className = "field checklist-item__edit-dep";
      const depSpan = document.createElement("span");
      depSpan.textContent = "Depende de";
      const depSel = document.createElement("select");
      depSel.id = "demChecklistEditDep";
      fillChecklistDepSelect(depSel, items, it.id, it.dependeDe);
      depWrap.append(depSpan, depSel);
      const moverWrap = document.createElement("label");
      moverWrap.className = "field checklist-item__edit-mover";
      const moverSpan = document.createElement("span");
      moverSpan.textContent = "Ao concluir, mover projeto para";
      const moverSel = document.createElement("select");
      moverSel.id = "demChecklistEditMover";
      fillChecklistMoverSelect(moverSel, it.moverPara);
      moverWrap.append(moverSpan, moverSel);
      [nameField.input, whoField.input, startField.input, endField.input, conclField?.input, novaField?.input].filter(Boolean).forEach((input) => {
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            saveChecklistItemEdit(it.id);
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            cancelarEdicao();
          }
        });
      });

      // Rodapé da edição: remover à esquerda, cancelar/salvar à direita.
      const foot = document.createElement("div");
      foot.className = "checklist-item__edit-foot";
      const rm = document.createElement("button");
      rm.type = "button";
      rm.className = "checklist-item__remove checklist-item__remove--txt";
      rm.textContent = "🗑 Remover";
      rm.addEventListener("click", remover);
      const dica = document.createElement("span");
      dica.className = "checklist-item__edit-dica";
      dica.textContent = "Enter salva · Esc cancela";
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "btn btn--ghost btn--sm checklist-item__cancel";
      cancel.textContent = "Cancelar";
      cancel.addEventListener("click", cancelarEdicao);
      const save = document.createElement("button");
      save.type = "button";
      save.className = "btn btn--primary btn--sm checklist-item__save";
      save.textContent = "Salvar";
      save.addEventListener("click", () => saveChecklistItemEdit(it.id));
      foot.append(rm, dica, cancel, save);

      edit.append(
        nameField.wrap,
        whoField.wrap,
        startField.wrap,
        endField.wrap,
        ...(novaBox ? [novaBox] : []),
        ...(conclField ? [conclField.wrap] : []),
        depWrap,
        moverWrap,
        descField.wrap,
        foot,
      );
      li.append(icone, edit);
    } else {
      const body = document.createElement("div");
      body.className = "checklist-item__body";
      if (!readOnly) {
        body.title = "Clique para editar";
        body.addEventListener("click", () => {
          if (!requireWriteAccess()) return;
          persistOpenChecklistEdit();
          editingChecklistItemId = it.id;
          renderChecklistEditor();
          document.getElementById("demChecklistEditName")?.focus();
        });
      }
      const name = document.createElement("span");
      name.className = "checklist-item__name";
      name.textContent = it.name;
      body.append(name);
      if (it.descricao) {
        const desc = document.createElement("p");
        desc.className = "checklist-item__desc";
        desc.textContent = it.descricao;
        body.append(desc);
      }
      const meta = document.createElement("span");
      meta.className = "checklist-item__meta";
      const who = document.createElement("span");
      who.className = "checklist-item__who";
      if (it.who) {
        const av = document.createElement("span");
        av.className = "ck-avatar";
        av.style.setProperty("--avatar-h", String(cardAvatarHue(it.who)));
        av.textContent = cardAvatarIniciais(it.who);
        av.setAttribute("aria-hidden", "true");
        who.append(av, document.createTextNode(it.who));
      } else {
        who.textContent = "Sem responsável";
      }
      meta.append(who);
      if (it.dateInicio || it.date) {
        const periodo = document.createElement("time");
        periodo.dateTime = it.date || it.dateInicio || "";
        periodo.textContent = checklistPeriodoTexto(it);
        periodo.title = `Início ${it.dateInicio ? formatDataCurta(it.dateInicio) : "—"} · Término ${
          it.date ? formatDataCurta(it.date) : "—"
        }`;
        meta.append(periodo);
      }
      const novaData = checklistNovaData(it);
      if (novaData) {
        const nv = document.createElement("span");
        nv.className = "ck-nova-data";
        nv.textContent = `↻ Nova data ${formatDataCurta(novaData).slice(0, 5)}`;
        nv.title = `Término original ${formatDataCurta(it.date)} · nova data ${formatDataCurta(novaData)} (+${diasEntreDatasISO(
          it.date,
          novaData,
        )} dia(s))`;
        meta.append(nv);
      }
      const pred = checklistPredecessora(items, it);
      if (pred) {
        const bloq = checklistBloqueadaPor(items, it);
        const dep = document.createElement("span");
        dep.className = "ck-dep" + (bloq ? " is-bloqueada" : "");
        dep.textContent = bloq ? `⛓ Aguardando “${pred.name}”` : `⛓ Após “${pred.name}”`;
        dep.title = bloq
          ? `Bloqueada: “${pred.name}” ainda não foi concluída`
          : `Depende de “${pred.name}” (já concluída)`;
        meta.append(dep);
      }
      const moverLabel = it.moverPara ? labelEtapaProjetoAberto(it.moverPara) : "";
      if (moverLabel) {
        const mv = document.createElement("span");
        mv.className = "ck-mover" + (it.done ? " is-feito" : "");
        mv.textContent = `➜ ${moverLabel}`;
        mv.title = it.done
          ? `Ao ser concluída, levou o projeto para «${moverLabel}»`
          : `Ao concluir, o projeto vai para a coluna «${moverLabel}»`;
        meta.append(mv);
      }
      body.append(meta);

      // Prazo (texto) + status (seletor) à direita.
      const prazo = checklistItemPrazo(it);
      const prazoEl = document.createElement("span");
      prazoEl.className =
        "ck-prazo" +
        (prazo.atrasada ? " is-atrasada" : "") +
        (prazo.diasAtrasoConclusao ? " is-concl-atraso" : "") +
        (!prazo.texto ? " is-vazio" : "");
      prazoEl.textContent = prazo.texto;
      if (prazo.atrasada && !readOnly) {
        const novaBtn = document.createElement("button");
        novaBtn.type = "button";
        novaBtn.className = "ck-nova-data-btn";
        novaBtn.textContent = "📅 Nova data";
        novaBtn.title = `Definir uma nova data de término para “${it.name}”`;
        novaBtn.addEventListener("click", () => {
          if (!requireWriteAccess()) return;
          persistOpenChecklistEdit();
          editingChecklistItemId = it.id;
          renderChecklistEditor();
          const inp = document.getElementById("demChecklistEditNova");
          inp?.focus();
          try {
            inp?.showPicker?.();
          } catch {
            /* showPicker exige gesto do usuário em alguns navegadores */
          }
        });
        prazoEl.append(novaBtn);
      }

      const sel = document.createElement("select");
      sel.className = `ck-status ck-status--${status}`;
      sel.setAttribute("aria-label", `Status de “${it.name}”`);
      sel.disabled = readOnly;
      CHECKLIST_STATUS.forEach(([k, label]) => {
        const o = document.createElement("option");
        o.value = k;
        o.textContent = label;
        o.selected = k === status;
        sel.appendChild(o);
      });
      sel.addEventListener("change", () => {
        if (isReadOnlyUser() || !requireWriteAccess()) {
          sel.value = status;
          return;
        }
        const bloq = sel.value !== "afazer" ? checklistBloqueadaPor(items, it) : null;
        applyChecklistItemPatch(it.id, { status: sel.value });
        checklistRecemConcluidaId = sel.value === "concluida" ? it.id : "";
        if (bloq) toast(`Atenção: “${bloq.name}” (da qual esta depende) ainda não foi concluída`);
        renderChecklistEditor();
      });

      const actions = document.createElement("div");
      actions.className = "checklist-item__actions";
      const editBtn = checklistIconBtn("checklist-item__edit-btn", "✎", `Editar “${it.name}”`);
      editBtn.disabled = readOnly;
      editBtn.addEventListener("click", () => {
        if (readOnly || !requireWriteAccess()) return;
        persistOpenChecklistEdit();
        editingChecklistItemId = it.id;
        renderChecklistEditor();
        document.getElementById("demChecklistEditName")?.focus();
      });
      const rm = checklistIconBtn("checklist-item__remove", "🗑", `Remover “${it.name}”`);
      rm.disabled = readOnly;
      rm.addEventListener("click", remover);
      appendChecklistMoveButtons(actions, it, idx, n, readOnly);
      actions.append(editBtn, rm);
      li.append(icone, body, prazoEl, sel, actions);
    }
    list.appendChild(li);
  });
  checklistRecemConcluidaId = "";
  renderChecklistGantt();
}

const GANTT_PAD_DAYS = 2;
const GANTT_WEEK_AFTER_DAYS = 21;
const GANTT_COL_DAY_PX = 32;
const GANTT_COL_COMPACT_PX = 16;
const WEEKDAYS_PT = ["D", "S", "T", "Q", "Q", "S", "S"];
const MONTHS_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function checklistGanttItemStart(it) {
  return isoDatePart(it?.dateInicio) || "";
}

function checklistGanttItemEnd(it) {
  return isoDatePart(it?.date) || "";
}

function checklistGanttTone(it) {
  return checklistItemSituacao(it).tom;
}

function checklistGanttToneLabel(tone) {
  if (tone === "done") return "Concluída";
  if (tone === "done-late") return "Concluída com atraso";
  if (tone === "late") return "Passou da data final";
  if (tone === "active") return "Em andamento";
  return "A fazer";
}

function checklistGanttRange(items) {
  let min = "";
  let max = "";
  for (const it of items) {
    const start = checklistGanttItemStart(it);
    const end = checklistGanttItemEnd(it);
    const concl = it.done ? isoDatePart(it.dateConclusao || "") : "";
    const nova = it.done ? "" : checklistNovaData(it);
    const a = start || end;
    const b = [end || start, concl, nova].filter(Boolean).sort().pop() || "";
    if (a && (!min || a < min)) min = a;
    if (b && (!max || b > max)) max = b;
  }
  if (!min || !max) return null;
  if (min > max) {
    const swap = min;
    min = max;
    max = swap;
  }
  const start = addDaysISO(min, -GANTT_PAD_DAYS) || min;
  const end = addDaysISO(max, GANTT_PAD_DAYS) || max;
  return { start, end };
}

function checklistGanttDays(start, end) {
  const days = [];
  let cur = start;
  while (cur && cur <= end) {
    days.push(cur);
    const next = addDaysISO(cur, 1);
    if (!next || next === cur) break;
    cur = next;
  }
  return days;
}

function checklistGanttGroups(days, keyFn) {
  const groups = [];
  for (const iso of days) {
    const key = keyFn(iso);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.days.push(iso);
    else groups.push({ key, days: [iso] });
  }
  return groups;
}

function checklistGanttMonthKey(iso) {
  return String(iso || "").slice(0, 7);
}

function checklistGanttMonthLabel(iso) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})/);
  if (!m) return iso || "";
  const month = MONTHS_PT[Number(m[2]) - 1] || m[2];
  return `${month} ${m[1]}`;
}

function checklistGanttWeekStart(iso) {
  const t = parseDate(iso);
  if (t == null) return iso;
  const d = new Date(t);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  const pad = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function checklistGanttWeekLabel(days) {
  if (!days.length) return "";
  const a = days[0];
  const b = days[days.length - 1];
  const ma = String(a).match(/^(\d{4})-(\d{2})-(\d{2})/);
  const mb = String(b).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!ma || !mb) return `${formatDataCurta(a)} – ${formatDataCurta(b)}`;
  if (ma[2] === mb[2]) return `${ma[3]}–${mb[3]}/${ma[2]}`;
  return `${ma[3]}/${ma[2]}–${mb[3]}/${mb[2]}`;
}

function checklistGanttWeekday(iso) {
  const t = parseDate(iso);
  if (t == null) return "";
  return WEEKDAYS_PT[new Date(t).getDay()] || "";
}

function checklistGanttDayNum(iso) {
  const m = String(iso || "").match(/-(\d{2})$/);
  return m ? String(Number(m[1])) : "";
}

function setChecklistToggleLabel(btn, label) {
  if (!btn) return;
  const span = btn.querySelector(".checklist-toggle__label");
  if (span) span.textContent = label;
  else btn.textContent = label;
}

/** Escala do cronograma: "auto" escolhe dias ou semanas pelo tamanho do período. */
let checklistGanttEscala = "auto";

function checklistGanttIsFds(iso) {
  const t = parseDate(iso);
  if (t == null) return false;
  const dia = new Date(t).getDay();
  return dia === 0 || dia === 6;
}

/** Abre a atividade para edição na lista (a partir do cronograma). */
function editarChecklistItemPeloGantt(id) {
  if (isReadOnlyUser() || !requireWriteAccess()) return;
  persistOpenChecklistEdit();
  checklistFiltro = "todas";
  editingChecklistItemId = id;
  renderChecklistEditor();
  const input = document.getElementById("demChecklistEditName");
  input?.closest(".checklist-item")?.scrollIntoView({ behavior: "smooth", block: "center" });
  input?.focus({ preventScroll: true });
}

function renderChecklistGanttToolbar(host, items) {
  const conta = { done: 0, "done-late": 0, active: 0, late: 0, wait: 0 };
  for (const it of items) conta[checklistItemSituacao(it).tom] += 1;
  const bar = document.createElement("div");
  bar.className = "checklist-gantt__toolbar";
  const legenda = document.createElement("div");
  legenda.className = "checklist-gantt__legenda";
  [
    ["done", "Concluída"],
    ["done-late", "Concluída com atraso"],
    ["active", "Em andamento"],
    ["late", "Atrasada"],
    ["wait", "A fazer"],
  ].forEach(([tom, label]) => {
    const item = document.createElement("span");
    item.className = `checklist-gantt__leg is-${tom}`;
    item.innerHTML = `<i aria-hidden="true"></i>${label} <b>${conta[tom]}</b>`;
    legenda.appendChild(item);
  });
  const reprogramadas = items.filter((it) => !it.done && checklistNovaData(it)).length;
  if (reprogramadas) {
    const item = document.createElement("span");
    item.className = "checklist-gantt__leg is-nova";
    item.title = "Trecho entre o término original e a nova data";
    item.innerHTML = `<i aria-hidden="true"></i>Nova data <b>${reprogramadas}</b>`;
    legenda.appendChild(item);
  }
  const escala = document.createElement("div");
  escala.className = "checklist-gantt__escala";
  escala.setAttribute("role", "group");
  escala.setAttribute("aria-label", "Escala do cronograma");
  [
    ["auto", "Automático"],
    ["dias", "Dias"],
    ["semanas", "Semanas"],
  ].forEach(([k, label]) => {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.uiNav = "1";
    b.textContent = label;
    b.className = checklistGanttEscala === k ? "is-on" : "";
    b.setAttribute("aria-pressed", String(checklistGanttEscala === k));
    b.addEventListener("click", () => {
      checklistGanttEscala = k;
      renderChecklistGantt();
    });
    escala.appendChild(b);
  });
  bar.append(legenda, escala);
  host.appendChild(bar);
}

function setChecklistGanttOpen(open) {
  const btn = document.getElementById("btnChecklistGantt");
  const panel = document.getElementById("demChecklistGantt");
  if (btn) {
    btn.setAttribute("aria-expanded", String(open));
    setChecklistToggleLabel(btn, open ? "Fechar cronograma" : "Abrir cronograma");
  }
  if (panel) panel.hidden = !open;
  if (open) renderChecklistGantt();
}

function renderChecklistGantt() {
  const host = document.getElementById("demChecklistGantt");
  if (!host || host.hidden) return;
  const items = normalizeChecklist(editingChecklist);
  const range = checklistGanttRange(items);
  host.replaceChildren();
  if (!range) {
    const empty = document.createElement("p");
    empty.className = "muted small checklist-gantt__empty";
    empty.textContent = "Adicione atividades com início e término para ver o cronograma.";
    host.appendChild(empty);
    return;
  }
  const days = checklistGanttDays(range.start, range.end);
  if (!days.length) {
    const empty = document.createElement("p");
    empty.className = "muted small checklist-gantt__empty";
    empty.textContent = "Adicione atividades com início e término para ver o cronograma.";
    host.appendChild(empty);
    return;
  }
  renderChecklistGanttToolbar(host, items);
  const compact =
    checklistGanttEscala === "semanas" ||
    (checklistGanttEscala === "auto" && days.length > GANTT_WEEK_AFTER_DAYS);
  // Estica as colunas para ocupar a largura disponível (11rem = coluna dos nomes).
  const disponivel = (host.clientWidth || 0) - 176 - 2;
  const colPx = Math.max(
    compact ? GANTT_COL_COMPACT_PX : GANTT_COL_DAY_PX,
    disponivel > 0 ? Math.floor(disponivel / days.length) : 0,
  );
  const chartW = days.length * colPx;
  const today = todayISODate();
  const todayIdx = days.indexOf(today);
  const todayPct = todayIdx >= 0 ? ((todayIdx + 0.5) / days.length) * 100 : null;

  const scroll = document.createElement("div");
  scroll.className = "checklist-gantt__scroll";
  const inner = document.createElement("div");
  inner.className = "checklist-gantt__inner";
  inner.style.setProperty("--gantt-w", `${chartW}px`);
  inner.style.setProperty("--gantt-col", `${colPx}px`);
  inner.setAttribute("role", "img");
  inner.setAttribute("aria-label", "Cronograma das atividades do checklist das tarefas do projeto");

  const head = document.createElement("div");
  head.className = "checklist-gantt__head";
  const headLabel = document.createElement("div");
  headLabel.className = "checklist-gantt__label";
  headLabel.textContent = "Atividade";
  const axis = document.createElement("div");
  axis.className = "checklist-gantt__axis";

  const monthsRow = document.createElement("div");
  monthsRow.className = "checklist-gantt__months";
  checklistGanttGroups(days, checklistGanttMonthKey).forEach((g) => {
    const cell = document.createElement("div");
    cell.className = "checklist-gantt__month";
    cell.style.width = `${g.days.length * colPx}px`;
    cell.textContent = checklistGanttMonthLabel(g.days[0]);
    monthsRow.appendChild(cell);
  });

  const ticksRow = document.createElement("div");
  ticksRow.className = "checklist-gantt__ticks" + (compact ? " is-weeks" : " is-days");
  if (compact) {
    checklistGanttGroups(days, checklistGanttWeekStart).forEach((g) => {
      const cell = document.createElement("div");
      cell.className = "checklist-gantt__tick";
      cell.style.width = `${g.days.length * colPx}px`;
      cell.textContent = checklistGanttWeekLabel(g.days);
      ticksRow.appendChild(cell);
    });
  } else {
    days.forEach((iso) => {
      const cell = document.createElement("div");
      cell.className = "checklist-gantt__tick";
      cell.style.width = `${colPx}px`;
      const num = document.createElement("span");
      num.textContent = checklistGanttDayNum(iso);
      const wd = document.createElement("span");
      wd.textContent = checklistGanttWeekday(iso);
      cell.append(num, wd);
      ticksRow.appendChild(cell);
    });
  }
  axis.append(monthsRow, ticksRow);
  if (todayPct != null) {
    const todayLine = document.createElement("i");
    todayLine.className = "checklist-gantt__today";
    todayLine.style.left = `${todayPct}%`;
    todayLine.setAttribute("aria-hidden", "true");
    axis.appendChild(todayLine);
    const todayTag = document.createElement("span");
    todayTag.className = "checklist-gantt__today-tag";
    todayTag.style.left = `${todayPct}%`;
    todayTag.textContent = "Hoje";
    axis.appendChild(todayTag);
  }
  head.append(headLabel, axis);
  // Fins de semana sombreados (posições em % do eixo).
  const fds = [];
  days.forEach((iso, i) => {
    if (checklistGanttIsFds(iso)) fds.push(i);
  });
  const readOnlyGantt = isReadOnlyUser();

  const body = document.createElement("div");
  body.className = "checklist-gantt__body";
  items.forEach((it) => {
    const row = document.createElement("div");
    const sitRow = checklistItemSituacao(it);
    row.className = "checklist-gantt__row" + (it.done ? " is-done" : " is-off") + ` is-${sitRow.tom}`;
    const label = document.createElement("div");
    label.className = "checklist-gantt__label";
    const name = document.createElement("strong");
    name.textContent = it.name || "Atividade";
    name.title = it.name || "";
    const who = document.createElement("span");
    const predGantt = checklistPredecessora(items, it);
    who.textContent = `${it.who || "—"} · ${sitRow.texto}${predGantt ? ` · ⛓ após “${predGantt.name}”` : ""}`;
    label.append(name, who);
    if (!readOnlyGantt) {
      row.classList.add("is-clicavel");
      row.title = "Clique para editar esta atividade";
      row.addEventListener("click", () => editarChecklistItemPeloGantt(it.id));
    }
    const track = document.createElement("div");
    track.className = "checklist-gantt__track";
    fds.forEach((i) => {
      const f = document.createElement("i");
      f.className = "checklist-gantt__fds";
      f.style.left = `${(i / days.length) * 100}%`;
      f.style.width = `${(1 / days.length) * 100}%`;
      f.setAttribute("aria-hidden", "true");
      track.appendChild(f);
    });
    if (todayPct != null) {
      const todayLine = document.createElement("i");
      todayLine.className = "checklist-gantt__today";
      todayLine.style.left = `${todayPct}%`;
      todayLine.setAttribute("aria-hidden", "true");
      track.appendChild(todayLine);
    }
    let start = checklistGanttItemStart(it);
    let end = checklistGanttItemEnd(it);
    if (start && end && start > end) {
      const swap = start;
      start = end;
      end = swap;
    }
    const tone = checklistGanttTone(it, start, end);
    if (start && end) {
      const i0 = days.indexOf(start);
      const i1 = days.indexOf(end);
      if (i0 >= 0 && i1 >= 0) {
        const bar = document.createElement("div");
        bar.className = "checklist-gantt__bar is-" + (tone === "done-late" ? "done" : tone);
        bar.style.left = `${(i0 / days.length) * 100}%`;
        bar.style.width = `${((i1 - i0 + 1) / days.length) * 100}%`;
        bar.title = `${it.name} · ${it.who || "—"} · ${checklistGanttToneLabel(tone)} · Início ${formatDataCurta(start)} · Término ${formatDataCurta(end)}`;
        const dur = i1 - i0 + 1;
        if (dur * colPx >= 34) {
          bar.textContent = `${dur}d`;
          bar.classList.add("has-txt");
        }
        track.appendChild(bar);
      }
    } else if (end || start) {
      const pin = end || start;
      const idx = days.indexOf(pin);
      if (idx >= 0) {
        const mark = document.createElement("div");
        mark.className = "checklist-gantt__mark is-" + tone;
        mark.style.left = `${((idx + 0.5) / days.length) * 100}%`;
        mark.title = `${it.name} · ${checklistGanttToneLabel(tone)} · ${end ? "Término" : "Início"} ${formatDataCurta(pin)}`;
        track.appendChild(mark);
      }
    }
    // Reprogramada (ainda pendente): trecho tracejado do término original até a nova data.
    const novaGantt = it.done ? "" : checklistNovaData(it);
    if (novaGantt && end) {
      const iA = days.indexOf(addDaysISO(end, 1));
      const iB = days.indexOf(novaGantt);
      if (iA >= 0 && iB >= iA) {
        const ext = document.createElement("div");
        ext.className = "checklist-gantt__bar checklist-gantt__nova" + (tone === "late" ? " is-late" : "");
        ext.style.left = `${(iA / days.length) * 100}%`;
        ext.style.width = `${((iB - iA + 1) / days.length) * 100}%`;
        const n = diasEntreDatasISO(end, novaGantt);
        ext.title = `${it.name} · término original ${formatDataCurta(end)} · nova data ${formatDataCurta(novaGantt)} (+${n} dia(s))`;
        if ((iB - iA + 1) * colPx >= 34) {
          ext.textContent = `+${n}d`;
          ext.classList.add("has-txt");
        }
        track.appendChild(ext);
      }
    }
    // Concluída depois do previsto: trecho vermelho do término previsto até a conclusão real.
    const concl = it.done ? isoDatePart(it.dateConclusao || "") : "";
    if (concl && end && concl > end) {
      const iA = days.indexOf(addDaysISO(end, 1));
      const iB = days.indexOf(concl);
      if (iA >= 0 && iB >= iA) {
        const atraso = document.createElement("div");
        atraso.className = "checklist-gantt__bar checklist-gantt__atraso";
        atraso.style.left = `${(iA / days.length) * 100}%`;
        atraso.style.width = `${((iB - iA + 1) / days.length) * 100}%`;
        const n = diasEntreDatasISO(end, concl);
        atraso.title = `${it.name} · previsto até ${formatDataCurta(end)} · concluída em ${formatDataCurta(concl)} (${n} dia(s) de atraso)`;
        if ((iB - iA + 1) * colPx >= 34) {
          atraso.textContent = `+${n}d`;
          atraso.classList.add("has-txt");
        }
        track.appendChild(atraso);
      }
    }
    if (concl) {
      const iC = days.indexOf(concl);
      if (iC >= 0) {
        const ok = document.createElement("span");
        ok.className = "checklist-gantt__concl" + (end && concl > end ? " is-atraso" : "");
        ok.style.left = `${((iC + 0.5) / days.length) * 100}%`;
        ok.textContent = "✓";
        ok.title = `Concluída em ${formatDataCurta(concl)}`;
        ok.setAttribute("aria-hidden", "true");
        track.appendChild(ok);
      }
    }
    row.append(label, track);
    body.appendChild(row);
  });

  inner.append(head, body);
  scroll.appendChild(inner);
  host.appendChild(scroll);
  if (todayIdx >= 0) {
    const alvo = 176 + todayIdx * colPx - scroll.clientWidth / 2;
    scroll.scrollLeft = Math.max(0, alvo);
  }
}

function addChecklistEtapaFromForm() {
  if (!requireWriteAccess()) return;
  const draft = readChecklistEtapaDraft({
    name: "demChecklistEtapa",
    descricao: "demChecklistDesc",
    who: "demChecklistWho",
    dateInicio: "demChecklistDateInicio",
    date: "demChecklistDate",
    dependeDe: "demChecklistDep",
    moverPara: "demChecklistMover",
  });
  if (!validateChecklistEtapa(draft, "demChecklistDateInicio")) return;
  const selStatus = document.getElementById("demChecklistStatus");
  const novoStatus = CHECKLIST_STATUS_LABEL[selStatus?.value] ? selStatus.value : "afazer";
  editingChecklistItemId = "";
  editingChecklist = [
    ...normalizeChecklist(editingChecklist),
    {
      id: uid(),
      name: draft.name,
      descricao: draft.descricao,
      who: draft.who,
      dateInicio: draft.dateInicio,
      date: draft.date,
      dependeDe: draft.dependeDe || "",
      moverPara: draft.moverPara || "",
      status: novoStatus,
      done: novoStatus === "concluida",
    },
  ];
  propagarDependenciasChecklist();
  const etapa = document.getElementById("demChecklistEtapa");
  const desc = document.getElementById("demChecklistDesc");
  const resp = document.getElementById("demChecklistWho");
  if (etapa) etapa.value = "";
  if (desc) desc.value = "";
  if (resp) resp.value = "";
  ["demChecklistDateInicio", "demChecklistDate"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  if (selStatus) selStatus.value = "afazer";
  const selDep = document.getElementById("demChecklistDep");
  if (selDep) selDep.value = "";
  const selMover = document.getElementById("demChecklistMover");
  if (selMover) selMover.value = "";
  checklistFiltro = "todas";
  renderChecklistEditor();
  toast(`Atividade “${draft.name}” adicionada`);
  etapa?.focus();
}

function setChecklistNovaAberta(open) {
  const expand = document.getElementById("btnChecklistExpand");
  const details = document.getElementById("demChecklistDetails");
  if (expand) {
    expand.setAttribute("aria-expanded", String(open));
    expand.classList.toggle("is-open", open);
    setChecklistToggleLabel(expand, open ? "Fechar" : "Nova atividade");
  }
  if (details) details.hidden = !open;
  if (open) document.getElementById("demChecklistEtapa")?.focus();
}

function bindChecklistEditor() {
  const expand = document.getElementById("btnChecklistExpand");
  const details = document.getElementById("demChecklistDetails");
  expand?.addEventListener("click", () => {
    const open = expand.getAttribute("aria-expanded") === "true";
    setChecklistNovaAberta(!open);
  });
  document.getElementById("btnChecklistAddCancelar")?.addEventListener("click", () => setChecklistNovaAberta(false));
  document.getElementById("demChecklistFiltros")?.addEventListener("click", (e) => {
    const btn = e.target instanceof Element ? e.target.closest("[data-filtro]") : null;
    if (!btn) return;
    checklistFiltro = btn.dataset.filtro || "todas";
    renderChecklistEditor();
  });
  document.getElementById("btnChecklistGantt")?.addEventListener("click", () => {
    const btn = document.getElementById("btnChecklistGantt");
    const open = btn?.getAttribute("aria-expanded") === "true";
    setChecklistGanttOpen(!open);
  });
  document.getElementById("btnChecklistAdd")?.addEventListener("click", addChecklistEtapaFromForm);
  ["demChecklistEtapa", "demChecklistWho"].forEach((id) => {
    document.getElementById(id)?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addChecklistEtapaFromForm();
      }
    });
  });
}

/** Texto do comentário com links clicáveis (o resto escapado). */
function comentarioTextoHtml(texto) {
  return destacarMencoesHtml(
    escapeHtml(texto).replace(
      /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]])/g,
      (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`,
    ),
  );
}
