/**
 * Metas por etapa, filtros salvos e ações em lote.
 * Só declarações (funções e constantes); o que roda ao abrir a página fica em app.js.
 */
/* ---------- Metas de dias por etapa (SLA) ---------- */
/**
 * Dias que um projeto pode ficar numa etapa antes de virar alerta de "parado".
 * Sem configuração → padrão de ALERTA_DIAS_MESMA_COLUNA; 0 → etapa sem meta; finalizados nunca têm meta.
 */
function metaDiasEtapa(status, linha = activeEsteiraCanal) {
  const l = normalizeLinhaEsteira(linha);
  if (statusFinalizadosKeys(l).includes(status)) return null;
  const v = state.metasEtapa?.[l]?.[status];
  if (v === undefined || v === null || v === "") return ALERTA_DIAS_MESMA_COLUNA;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 0) return ALERTA_DIAS_MESMA_COLUNA;
  return n === 0 ? null : n;
}

function metaDiasDemanda(d) {
  return metaDiasEtapa(d.status, d.linhaEsteira || inferLinhaEsteira(d));
}

/** Dias na etapa atual acima da meta (null quando não estourou ou não há meta). */
function diasAcimaDaMeta(d) {
  const meta = metaDiasDemanda(d);
  if (meta == null) return null;
  const dias = diasNaColunaAtual(d);
  return dias != null && dias >= meta ? dias : null;
}

function etapasComMeta(linha) {
  const cfg = getEsteiraConfig(linha);
  const fin = new Set(statusFinalizadosKeys(linha));
  return [...cfg.statusOrder, ...cfg.statusExtra].filter(([k]) => !fin.has(k));
}

/** Rascunho do modal de metas: { linha: { status: "" (padrão) | número } }. */
let metasDraft = null;
let metasOriginal = null;
let metasAba = LINHA_ESTEIRA_OPERACIONAL;

const METAS_ABAS = [
  [LINHA_ESTEIRA_OPERACIONAL, "Esteira Projetos"],
  [LINHA_ESTEIRA_B2B, "Esteira B2B"],
];

function metaValorBruto(v) {
  if (v === undefined || v === null || v === "") return "";
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 ? Math.min(365, n) : "";
}

/** Meta efetiva de um valor do rascunho (null = sem meta). */
function metaEfetivaDoRascunho(v) {
  if (v === "") return ALERTA_DIAS_MESMA_COLUNA;
  return v === 0 ? null : v;
}

function metasAlteracoes() {
  let n = 0;
  for (const [linha] of METAS_ABAS) {
    for (const [k] of etapasComMeta(linha)) if (metasDraft[linha][k] !== metasOriginal[linha][k]) n++;
  }
  return n;
}

/** Projetos ativos (não arquivados) de cada etapa e quantos passariam da meta do rascunho. */
function metasContagemEtapas(linha) {
  const out = {};
  // Só etapas com meta configurável (finalizados ficam de fora, como no alerta de parado).
  const etapas = new Set(etapasComMeta(linha).map(([k]) => k));
  for (const d of state.demandas || []) {
    if (d.arquivadoEm || inferLinhaEsteira(d) !== linha || !etapas.has(d.status)) continue;
    const o = (out[d.status] ||= { total: 0, acima: 0 });
    o.total++;
    const meta = metaEfetivaDoRascunho(metasDraft[linha][d.status] ?? "");
    if (meta == null || !normalizeResponsavel(d.responsavel)) continue;
    const dias = diasNaColunaAtual(d);
    if (dias != null && dias >= meta) o.acima++;
  }
  return out;
}

function abrirMetasEtapaModal() {
  const dlg = document.getElementById("modalMetasEtapa");
  if (!dlg) return;
  metasOriginal = {};
  for (const [linha] of METAS_ABAS) {
    metasOriginal[linha] = {};
    for (const [k] of etapasComMeta(linha)) metasOriginal[linha][k] = metaValorBruto(state.metasEtapa?.[linha]?.[k]);
  }
  metasDraft = JSON.parse(JSON.stringify(metasOriginal));
  metasAba = activeEsteiraCanal === LINHA_ESTEIRA_B2B ? LINHA_ESTEIRA_B2B : LINHA_ESTEIRA_OPERACIONAL;
  const todas = document.getElementById("metasTodasValor");
  if (todas) todas.value = "";
  renderMetasEtapaModal();
  if (!dlg.open) dlg.showModal();
}

function renderMetasEtapaModal({ manterFoco = false } = {}) {
  if (!metasDraft) return;
  const admin = isAdminUser();
  const focado = manterFoco ? document.activeElement?.dataset?.metaStatus : "";
  const abasEl = document.getElementById("metasEtapaAbas");
  if (abasEl) {
    abasEl.innerHTML = METAS_ABAS.map(([linha, nome]) => {
      const cont = metasContagemEtapas(linha);
      const acima = Object.values(cont).reduce((s, c) => s + c.acima, 0);
      const ativo = linha === metasAba;
      return (
        `<button type="button" role="tab" data-metas-aba="${linha}" class="${ativo ? "is-active" : ""}" aria-selected="${ativo}">` +
        `${escapeHtml(nome)}${acima ? ` <span class="metas-aba__n" title="${acima} projeto(s) acima da meta">${acima}</span>` : ""}</button>`
      );
    }).join("");
  }
  const linha = metasAba;
  const etapas = etapasComMeta(linha);
  const cont = metasContagemEtapas(linha);
  const personalizadas = etapas.filter(([k]) => metasDraft[linha][k] !== "").length;
  const totalAcima = etapas.reduce((s, [k]) => s + (cont[k]?.acima || 0), 0);
  const resumo = document.getElementById("metasEtapaResumo");
  if (resumo) {
    resumo.innerHTML =
      `<span class="metas-resumo__item"><b>${etapas.length}</b> etapas</span>` +
      `<span class="metas-resumo__item"><b>${personalizadas}</b> com meta própria</span>` +
      `<span class="metas-resumo__item${totalAcima ? " is-alerta" : " is-ok"}">` +
      (totalAcima ? `<b>${totalAcima}</b> projeto(s) acima da meta agora` : "✓ Nenhum projeto acima da meta") +
      `</span>`;
  }
  const lista = document.getElementById("metasEtapaCorpo");
  if (lista) {
    lista.innerHTML = etapas
      .map(([k, label], i) => {
        const v = metasDraft[linha][k];
        const alterada = v !== metasOriginal[linha][k];
        const semMeta = v === 0;
        const c = cont[k] || { total: 0, acima: 0 };
        const setor = setorForStatusDemanda(k, linha);
        const tag = semMeta
          ? `<span class="meta-tag meta-tag--off">sem meta</span>`
          : v === ""
            ? `<span class="meta-tag">padrão</span>`
            : `<span class="meta-tag meta-tag--custom">própria</span>`;
        const uso = c.total
          ? `${c.total} projeto${c.total > 1 ? "s" : ""}` +
            (c.acima ? ` · <b class="meta-etapa__acima">${c.acima} acima da meta</b>` : "")
          : `<span class="muted">vazia</span>`;
        return (
          `<li class="meta-etapa${alterada ? " is-alterada" : ""}${semMeta ? " is-sem-meta" : ""}">` +
          `<span class="meta-etapa__n" aria-hidden="true">${i + 1}</span>` +
          `<div class="meta-etapa__info"><strong>${escapeHtml(label)}</strong>` +
          `<span class="meta-etapa__sub">${setor ? setorBadgeHtml(setor) : ""}<span>${uso}</span></span></div>` +
          `<div class="meta-etapa__ctrl">${tag}` +
          `<div class="meta-stepper${admin ? "" : " is-ro"}">` +
          `<button type="button" data-meta-passo="-1" data-meta-k="${escapeHtml(k)}" aria-label="Diminuir meta de ${escapeHtml(label)}"${admin ? "" : " disabled"}>−</button>` +
          `<input type="number" min="0" max="365" step="1" inputmode="numeric" data-meta-status="${escapeHtml(k)}" value="${v === "" ? "" : v}" placeholder="${ALERTA_DIAS_MESMA_COLUNA}"` +
          ` aria-label="Meta em dias para ${escapeHtml(label)}"${admin ? "" : " disabled"} />` +
          `<button type="button" data-meta-passo="1" data-meta-k="${escapeHtml(k)}" aria-label="Aumentar meta de ${escapeHtml(label)}"${admin ? "" : " disabled"}>+</button>` +
          `</div><span class="meta-etapa__un">dias</span></div></li>`
        );
      })
      .join("");
    if (focado) {
      const inp = lista.querySelector(`[data-meta-status="${CSS.escape(focado)}"]`);
      if (inp) {
        inp.focus();
        const fim = inp.value.length;
        try {
          inp.setSelectionRange(fim, fim);
        } catch {
          /* input number não aceita seleção em alguns navegadores */
        }
      }
    }
  }
  const n = metasAlteracoes();
  const salvar = document.getElementById("btnSalvarMetasEtapa");
  if (salvar) {
    salvar.hidden = !admin;
    salvar.disabled = n === 0;
    salvar.textContent = n ? `Salvar ${n} ${n > 1 ? "alterações" : "alteração"}` : "Salvar metas";
  }
  const padrao = document.getElementById("btnPadraoMetasEtapa");
  if (padrao) padrao.hidden = !admin;
  const todas = document.getElementById("metasTodas");
  if (todas) todas.hidden = !admin;
  const aviso = document.getElementById("metasEtapaAviso");
  if (aviso) aviso.hidden = admin;
}

function definirMetaRascunho(k, valor) {
  metasDraft[metasAba][k] = metaValorBruto(valor);
}

function salvarMetasEtapa() {
  if (!isAdminUser()) {
    toast("Só administradores alteram as metas");
    return;
  }
  if (!metasDraft) return;
  // Etapas em branco voltam ao padrão: grava `null` para apagar o valor antigo no merge do Firestore.
  const metas = {};
  for (const [linha] of METAS_ABAS) {
    metas[linha] = {};
    for (const [k] of etapasComMeta(linha)) {
      const v = metasDraft[linha][k];
      metas[linha][k] = v === "" ? null : v;
    }
  }
  const n = metasAlteracoes();
  const anteriores = JSON.parse(JSON.stringify(state.metasEtapa || {}));
  state.metasEtapa = metas;
  saveState({ metaFields: { metasEtapa: metas } });
  document.getElementById("modalMetasEtapa")?.close();
  refreshAllViews();
  oferecerDesfazer(n ? `Metas salvas · ${n} etapa(s) alterada(s)` : "Metas por etapa salvas", () => {
    // Etapas que não existiam antes voltam ao padrão (null apaga o valor no merge do Firestore).
    const volta = {};
    for (const linha of new Set([...Object.keys(metas), ...Object.keys(anteriores)])) {
      volta[linha] = {};
      for (const k of new Set([...Object.keys(metas[linha] || {}), ...Object.keys(anteriores[linha] || {})])) {
        const v = anteriores[linha]?.[k];
        volta[linha][k] = v === undefined ? null : v;
      }
    }
    state.metasEtapa = volta;
    saveState({ metaFields: { metasEtapa: volta } });
    refreshAllViews();
    toast("Metas restauradas");
  });
}

function initMetasEtapa() {
  document.getElementById("btnMetasEtapa")?.addEventListener("click", abrirMetasEtapaModal);
  const dlg = document.getElementById("modalMetasEtapa");
  const fechar = () => dlg?.close();
  document.getElementById("modalMetasEtapaClose")?.addEventListener("click", fechar);
  document.getElementById("btnCancelarMetasEtapa")?.addEventListener("click", fechar);
  document.getElementById("btnSalvarMetasEtapa")?.addEventListener("click", salvarMetasEtapa);
  document.getElementById("btnPadraoMetasEtapa")?.addEventListener("click", () => {
    if (!metasDraft) return;
    for (const [k] of etapasComMeta(metasAba)) metasDraft[metasAba][k] = "";
    renderMetasEtapaModal();
  });
  document.getElementById("metasEtapaAbas")?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-metas-aba]");
    if (!b || b.dataset.metasAba === metasAba) return;
    metasAba = b.dataset.metasAba;
    renderMetasEtapaModal();
  });
  const corpo = document.getElementById("metasEtapaCorpo");
  corpo?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-meta-passo]");
    if (!b || !metasDraft || !isAdminUser()) return;
    const k = b.dataset.metaK;
    const atual = metasDraft[metasAba][k];
    const base = atual === "" ? ALERTA_DIAS_MESMA_COLUNA : atual;
    definirMetaRascunho(k, Math.max(0, base + Number(b.dataset.metaPasso)));
    renderMetasEtapaModal();
  });
  corpo?.addEventListener("input", (e) => {
    const inp = e.target.closest("[data-meta-status]");
    if (!inp || !metasDraft) return;
    definirMetaRascunho(inp.dataset.metaStatus, inp.value.trim());
    renderMetasEtapaModal({ manterFoco: true });
  });
  document.getElementById("btnMetasTodas")?.addEventListener("click", () => {
    const inp = document.getElementById("metasTodasValor");
    const raw = (inp?.value || "").trim();
    if (raw === "" || !metasDraft) {
      toast("Informe quantos dias aplicar em todas as etapas");
      inp?.focus();
      return;
    }
    for (const [k] of etapasComMeta(metasAba)) definirMetaRascunho(k, raw);
    renderMetasEtapaModal();
  });
}

/* ---------- Filtros salvos e "Minhas demandas" ---------- */
const FILTROS_SALVOS_LIMITE = 12;

/** Chave do usuário no mapa `filtrosSalvos` do doc meta (sem pontos, que o Firestore lê como caminho). */
function filtrosSalvosChaveUsuario() {
  const email = String(getCurrentUserEmail() || "").trim().toLowerCase();
  return email ? email.replace(/\./g, ",") : "local";
}

function filtrosSalvosDoUsuario() {
  const mapa = state.filtrosSalvos && typeof state.filtrosSalvos === "object" ? state.filtrosSalvos : {};
  const lista = mapa[filtrosSalvosChaveUsuario()];
  return Array.isArray(lista) ? lista.filter((f) => f && f.id && f.nome) : [];
}

function gravarFiltrosSalvos(lista) {
  const chave = filtrosSalvosChaveUsuario();
  state.filtrosSalvos = { ...(state.filtrosSalvos || {}), [chave]: lista };
  saveState({ metaFields: { filtrosSalvos: { [chave]: lista } } });
}

function filtrosAtuaisEsteira() {
  return {
    linha: activeEsteiraCanal,
    projetista: document.getElementById("filterProjetista")?.value || "",
    tipo: document.getElementById("filterTipo")?.value || "",
    regional: document.getElementById("filterRegional")?.value || "",
    cidade: document.getElementById("filterCidade")?.value || "",
    busca: (document.getElementById("filterBusca")?.value || "").trim(),
    rapido: esteiraFiltroRapido || "",
    modo: document.getElementById("filterEsteiraModo")?.value || ESTEIRA_MODO_ATIVOS,
  };
}

function resumoFiltroSalvo(f) {
  const partes = [];
  if (f.projetista) partes.push(f.projetista === "__none__" ? "Não atribuído" : f.projetista);
  if (f.tipo) partes.push(f.tipo);
  if (f.cidade) partes.push(f.cidade);
  else if (f.regional) partes.push(f.regional);
  if (f.rapido) partes.push(ESTEIRA_FILTROS_RAPIDOS[f.rapido]?.label || f.rapido);
  if (f.busca) partes.push(`“${f.busca}”`);
  if (f.modo === ESTEIRA_MODO_FINALIZADOS) partes.push("Finalizados");
  else if (f.modo === ESTEIRA_MODO_TODOS) partes.push("Todas as colunas");
  return partes.join(" · ") || "Sem filtros";
}

function setSelectSeExistir(id, valor) {
  const sel = document.getElementById(id);
  if (!sel) return;
  sel.value = valor && [...sel.options].some((o) => o.value === valor) ? valor : "";
}

function aplicarFiltroSalvo(f) {
  setSelectSeExistir("filterProjetista", f.projetista);
  setSelectSeExistir("filterTipo", f.tipo);
  setSelectSeExistir("filterRegional", f.regional);
  fillFilterCidadeSelect(document.getElementById("filterRegional")?.value || "");
  setSelectSeExistir("filterCidade", f.cidade);
  const busca = document.getElementById("filterBusca");
  if (busca) busca.value = f.busca || "";
  esteiraFiltroRapido = f.rapido && ESTEIRA_FILTROS_RAPIDOS[f.rapido] ? f.rapido : "";
  const modo = document.getElementById("filterEsteiraModo");
  if (modo && f.modo && [...modo.options].some((o) => o.value === f.modo)) modo.value = f.modo;
  esteiraModoColunas = readEsteiraModoColunas();
  updateEsteiraModoHints();
  renderBoard();
}

function filtroSalvoIgualAtual(f) {
  const a = filtrosAtuaisEsteira();
  return ["projetista", "tipo", "regional", "cidade", "busca", "rapido", "modo"].every(
    (k) => String(a[k] || "") === String(f[k] || ""),
  );
}

/** Rótulo de projetista do usuário logado, se ele aparece no filtro de projetistas. */
function minhaEtiquetaProjetista() {
  const nome = projetistaLabelForEmail(getCurrentUserEmail());
  if (!nome) return "";
  const sel = document.getElementById("filterProjetista");
  return sel && [...sel.options].some((o) => o.value === nome) ? nome : "";
}

function syncFiltrosSalvosUi() {
  const minhas = document.getElementById("btnMinhasDemandas");
  if (minhas) {
    const eu = minhaEtiquetaProjetista();
    minhas.hidden = !eu;
    const ativo = Boolean(eu) && document.getElementById("filterProjetista")?.value === eu;
    minhas.classList.toggle("is-ativo", ativo);
    minhas.setAttribute("aria-pressed", ativo ? "true" : "false");
    minhas.title = ativo ? "Mostrar os projetos de todos" : `Só os projetos de ${eu}`;
  }
  const lista = filtrosSalvosDoUsuario().filter((f) => (f.linha || LINHA_ESTEIRA_OPERACIONAL) === activeEsteiraCanal);
  const btn = document.getElementById("btnFiltrosSalvos");
  const atual = lista.find(filtroSalvoIgualAtual);
  if (btn) {
    btn.classList.toggle("is-ativo", Boolean(atual));
    document.getElementById("filtrosSalvosRotulo").textContent = atual ? atual.nome : "Filtros salvos";
  }
  const ul = document.getElementById("filtrosSalvosLista");
  if (ul) {
    ul.innerHTML = lista.length
      ? lista
          .map(
            (f) =>
              `<li class="filtros-salvos__item${f === atual ? " is-ativo" : ""}">` +
              `<button type="button" class="filtros-salvos__aplicar" data-fs-aplicar="${escapeHtml(f.id)}">` +
              `<strong>${escapeHtml(f.nome)}</strong><span>${escapeHtml(resumoFiltroSalvo(f))}</span></button>` +
              `<button type="button" class="filtros-salvos__remover" data-fs-remover="${escapeHtml(f.id)}" aria-label="Remover ${escapeHtml(f.nome)}" title="Remover">✕</button></li>`,
          )
          .join("")
      : `<li class="filtros-salvos__vazio">Nenhum filtro salvo nesta esteira. Monte os filtros e salve abaixo para voltar a eles com um clique.</li>`;
  }
  const temFiltro = esteiraFiltrosAtivosCount() > 0 || (document.getElementById("filterEsteiraModo")?.value || ESTEIRA_MODO_ATIVOS) !== ESTEIRA_MODO_ATIVOS;
  const salvar = document.getElementById("btnSalvarFiltro");
  const nome = document.getElementById("filtroSalvoNome");
  if (salvar) salvar.disabled = !temFiltro || !(nome?.value || "").trim();
  if (nome) {
    nome.disabled = !temFiltro;
    nome.placeholder = temFiltro ? "Nome (ex.: Atrasados de Goiânia)" : "Aplique algum filtro para salvar";
  }
}

function setFiltrosSalvosAberto(aberto) {
  setDropdownMenuOpen("filtrosSalvosMenu", "btnFiltrosSalvos", aberto);
  if (aberto) {
    syncFiltrosSalvosUi();
    const nome = document.getElementById("filtroSalvoNome");
    if (nome && !nome.disabled) nome.focus();
  }
}

function salvarFiltroAtual() {
  const inp = document.getElementById("filtroSalvoNome");
  const nome = (inp?.value || "").trim().slice(0, 40);
  if (!nome) return;
  const lista = filtrosSalvosDoUsuario();
  const f = { id: uid(), nome, ...filtrosAtuaisEsteira(), criadoEm: new Date().toISOString() };
  const semMesmoNome = lista.filter((x) => !(x.nome.toLowerCase() === nome.toLowerCase() && x.linha === f.linha));
  if (semMesmoNome.length >= FILTROS_SALVOS_LIMITE) {
    toast(`Limite de ${FILTROS_SALVOS_LIMITE} filtros salvos — remova algum antes`);
    return;
  }
  gravarFiltrosSalvos([...semMesmoNome, f]);
  inp.value = "";
  syncFiltrosSalvosUi();
  toast(`Filtro “${nome}” salvo`);
}

function initFiltrosSalvos() {
  document.getElementById("btnMinhasDemandas")?.addEventListener("click", () => {
    const eu = minhaEtiquetaProjetista();
    const sel = document.getElementById("filterProjetista");
    if (!eu || !sel) return;
    sel.value = sel.value === eu ? "" : eu;
    renderBoard();
  });
  const btn = document.getElementById("btnFiltrosSalvos");
  const menu = document.getElementById("filtrosSalvosMenu");
  btn?.addEventListener("click", (e) => {
    e.stopPropagation();
    setFiltrosSalvosAberto(menu.hidden);
  });
  document.addEventListener("click", (e) => {
    if (menu && !menu.hidden && !e.composedPath().some((n) => n === menu || n === btn)) setFiltrosSalvosAberto(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && menu && !menu.hidden) {
      setFiltrosSalvosAberto(false);
      btn?.focus();
    }
  });
  menu?.addEventListener("click", (e) => {
    const aplicar = e.target.closest("[data-fs-aplicar]");
    const remover = e.target.closest("[data-fs-remover]");
    if (aplicar) {
      const f = filtrosSalvosDoUsuario().find((x) => x.id === aplicar.dataset.fsAplicar);
      if (f) aplicarFiltroSalvo(f);
      setFiltrosSalvosAberto(false);
    } else if (remover) {
      const lista = filtrosSalvosDoUsuario();
      const f = lista.find((x) => x.id === remover.dataset.fsRemover);
      gravarFiltrosSalvos(lista.filter((x) => x.id !== remover.dataset.fsRemover));
      syncFiltrosSalvosUi();
      if (f) toast(`Filtro “${f.nome}” removido`);
    }
  });
  document.getElementById("filtroSalvoNome")?.addEventListener("input", syncFiltrosSalvosUi);
  document.getElementById("filtroSalvoForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    salvarFiltroAtual();
  });
}

/* ---------- Seleção e ações em lote na esteira ---------- */
function setSelecaoEsteiraAtiva(ativa) {
  if (ativa && !requireWriteAccess()) return;
  selecaoEsteira.ativa = Boolean(ativa);
  selecaoEsteira.ids.clear();
  renderBoard();
}

/** Cards visíveis na esteira atual (na ordem em que aparecem). */
function idsCardsVisiveisEsteira() {
  const board = document.getElementById(activeEsteiraCanal === LINHA_ESTEIRA_B2B ? "boardEsteiraB2b" : "boardEsteira");
  return board ? [...board.querySelectorAll(".card[data-id]")].map((c) => c.dataset.id) : [];
}

function alternarSelecaoCard(id, el) {
  if (selecaoEsteira.ids.has(id)) selecaoEsteira.ids.delete(id);
  else selecaoEsteira.ids.add(id);
  const on = selecaoEsteira.ids.has(id);
  el?.classList.toggle("is-selecionado", on);
  el?.setAttribute("aria-pressed", on ? "true" : "false");
  syncLoteBarra();
}

/** Mantém só o que continua visível (filtro mudou, card arquivado/excluído etc.). */
function podarSelecaoEsteira() {
  if (!selecaoEsteira.ativa) return;
  const visiveis = new Set(idsCardsVisiveisEsteira());
  for (const id of [...selecaoEsteira.ids]) if (!visiveis.has(id)) selecaoEsteira.ids.delete(id);
}

function syncLoteBarra() {
  const barra = document.getElementById("loteBarra");
  const btn = document.getElementById("btnSelecionarCards");
  if (btn) {
    btn.classList.toggle("is-ativo", selecaoEsteira.ativa);
    btn.setAttribute("aria-pressed", selecaoEsteira.ativa ? "true" : "false");
    btn.hidden = isReadOnlyUser();
  }
  document.body.classList.toggle("modo-selecao", selecaoEsteira.ativa);
  if (!barra) return;
  barra.hidden = !selecaoEsteira.ativa;
  if (!selecaoEsteira.ativa) return;
  const n = selecaoEsteira.ids.size;
  const visiveis = idsCardsVisiveisEsteira();
  const todos = visiveis.length > 0 && visiveis.every((id) => selecaoEsteira.ids.has(id));
  document.getElementById("loteQtd").textContent =
    n === 0 ? "Clique nos cards para selecionar" : n === 1 ? "1 projeto selecionado" : `${n} projetos selecionados`;
  const tudo = document.getElementById("btnLoteTodos");
  if (tudo) {
    tudo.textContent = todos ? "Limpar seleção" : `Selecionar todos (${visiveis.length})`;
    tudo.disabled = !visiveis.length;
  }
  barra.querySelectorAll("[data-lote-acao]").forEach((el) => {
    el.disabled = n === 0;
  });
  // Etapas da esteira atual.
  const selStatus = document.getElementById("loteStatus");
  if (selStatus && selStatus.dataset.linha !== activeEsteiraCanal) {
    selStatus.dataset.linha = activeEsteiraCanal;
    const cfg = getEsteiraConfig(activeEsteiraCanal);
    selStatus.innerHTML =
      '<option value="">Mover para…</option>' +
      [...cfg.statusOrder, ...cfg.statusExtra]
        .map(([k, label]) => `<option value="${escapeHtml(k)}">${escapeHtml(label)}</option>`)
        .join("");
  }
  const selResp = document.getElementById("loteResponsavel");
  if (selResp) {
    const lista = projetistaLabelsFromRoles();
    const chave = lista.join("|");
    if (selResp.dataset.chave !== chave) {
      selResp.dataset.chave = chave;
      selResp.innerHTML =
        '<option value="">Projetista…</option><option value="__none__">Não atribuído</option>' +
        lista.map((nome) => `<option value="${escapeHtml(nome)}">${escapeHtml(nome)}</option>`).join("");
    }
  }
}

/** Aplica `mudar(dem)` em cada projeto selecionado; registra no histórico e salva um a um. */
function aplicarEmLote(mudar, msgFeito) {
  if (!requireWriteAccess()) return 0;
  const now = new Date().toISOString();
  const fotos = fotografarDemandas([...selecaoEsteira.ids]);
  let n = 0;
  for (const id of selecaoEsteira.ids) {
    const dem = state.demandas.find((x) => x.id === id);
    if (!dem) continue;
    const antes = migrateDemanda({ ...dem, __isMigrated: false });
    if (mudar(dem, now) === false) continue;
    dem.updatedAt = now;
    invalidateAlertaSnoozeIfStale(dem);
    registrarEdicaoNoHistoricoEdicao(antes, dem);
    noteOwnDemandaWrite(id, now);
    saveState({ demanda: dem });
    n++;
  }
  renderBoard();
  if (n) oferecerDesfazer(msgFeito(n), () => restaurarFotos(fotos, n === 1 ? "Alteração desfeita" : `Alteração desfeita em ${n} projetos`));
  else toast("Nada a alterar nos projetos selecionados");
  return n;
}

function loteMoverStatus(novoStatus) {
  const label = getEsteiraConfig(activeEsteiraCanal).statusLabel[novoStatus] || novoStatus;
  return aplicarEmLote(
    (dem, now) => {
      if (dem.status === novoStatus) return false;
      const linha = migrateDemanda(dem).linhaEsteira;
      dem.status = novoStatus;
      dem.historicoStatus = statusHistoryPush(dem, novoStatus, now);
      if (isStatusConcluidoNoFormulario(novoStatus, linha) && !dem.dataTermino) dem.dataTermino = todayISODate();
      dem.ordemEsteira = ordemAoEntrarColuna(novoStatus, dem.responsavel);
    },
    (n) => `${n} ${n === 1 ? "projeto movido" : "projetos movidos"} para ${label}`,
  );
}

function loteAtribuirProjetista(valor) {
  const resp = valor === "__none__" ? "" : normalizeResponsavel(valor);
  return aplicarEmLote(
    (dem) => {
      if (normalizeResponsavel(dem.responsavel) === resp) return false;
      dem.responsavel = resp;
      dem.projetistasExtra = normalizeProjetistasExtra(dem.projetistasExtra, resp);
    },
    (n) => (resp ? `${n} ${n === 1 ? "projeto atribuído" : "projetos atribuídos"} a ${resp}` : `${n} projeto(s) sem projetista`),
  );
}

function loteDefinirPrazo(dataIso) {
  return aplicarEmLote(
    (dem) => {
      if ((dem.dataFimPrevista || "") === dataIso) return false;
      dem.dataFimPrevista = dataIso;
    },
    (n) => `Previsão de término ${dataIso ? `em ${formatDataCurta(dataIso)}` : "removida"} · ${n} projeto(s)`,
  );
}

function initLoteEsteira() {
  document.getElementById("btnSelecionarCards")?.addEventListener("click", () =>
    setSelecaoEsteiraAtiva(!selecaoEsteira.ativa),
  );
  document.getElementById("btnLoteCancelar")?.addEventListener("click", () => setSelecaoEsteiraAtiva(false));
  document.getElementById("btnLoteTodos")?.addEventListener("click", () => {
    const visiveis = idsCardsVisiveisEsteira();
    const todos = visiveis.every((id) => selecaoEsteira.ids.has(id));
    selecaoEsteira.ids = todos ? new Set() : new Set(visiveis);
    renderBoard();
  });
  document.getElementById("loteStatus")?.addEventListener("change", (e) => {
    const v = e.target.value;
    e.target.value = "";
    if (v) loteMoverStatus(v);
  });
  document.getElementById("loteResponsavel")?.addEventListener("change", (e) => {
    const v = e.target.value;
    e.target.value = "";
    if (v) loteAtribuirProjetista(v);
  });
  document.getElementById("btnLotePrazo")?.addEventListener("click", () => {
    const inp = document.getElementById("lotePrazo");
    const v = inp?.value || "";
    if (!v) {
      toast("Escolha a data da previsão de término");
      inp?.focus();
      return;
    }
    loteDefinirPrazo(v);
    inp.value = "";
  });
  document.getElementById("btnLoteArquivar")?.addEventListener("click", () => {
    const ids = [...selecaoEsteira.ids];
    if (!ids.length) return;
    selecaoEsteira.ids.clear();
    arquivarDemandas(ids, true);
  });
  document.getElementById("btnLoteLixeira")?.addEventListener("click", () => {
    const ids = [...selecaoEsteira.ids];
    if (!ids.length) return;
    if (!confirm(`Mover ${ids.length === 1 ? "o projeto selecionado" : `${ids.length} projetos`} para a lixeira?`)) return;
    selecaoEsteira.ids.clear();
    moverDemandasParaLixeira(ids);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !selecaoEsteira.ativa) return;
    if (document.querySelector("dialog[open]")) return;
    setSelecaoEsteiraAtiva(false);
  });
}
