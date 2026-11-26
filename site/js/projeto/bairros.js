/**
 * Liberação por bairros no formulário do projeto: lista de bairros com portas novas, CTOs, valor,
 * situação (Pendente → Em execução → Liberado) e as datas de cada passo.
 * Só declarações; os eventos são ligados em ligarBairrosForm() (chamado pelo app.js).
 */
let editingUsaBairros = false;
let editingBairros = [];
/** "junto": os bairros são entregues todos de uma vez (uma situação e datas só); "separado": cada um no seu tempo. */
let editingBairrosModo = "junto";

function bairroNovo() {
  return { id: uid(), nome: "", portas: "", ctos: "", valor: "", situacao: "pendente", inicio: "", previsao: "", liberadoEm: "", liberadoPor: "", obs: "" };
}

function iniciarBairrosNoForm(dm) {
  editingUsaBairros = demandaUsaBairros(dm);
  editingBairros = editingUsaBairros ? JSON.parse(JSON.stringify(normalizeBairros(dm?.bairros))) : [];
  editingBairrosModo = editingUsaBairros ? normalizeBairrosModo(dm?.bairrosModo) : "junto";
  const chave = document.getElementById("demUsaBairros");
  if (chave) chave.checked = editingUsaBairros;
  renderBairrosForm();
}

/** Bairros para salvar: descarta linhas totalmente vazias. */
function lerBairrosDoForm() {
  if (!editingUsaBairros) return [];
  return normalizeBairros(
    editingBairros.filter((b) => b.nome.trim() || b.portas !== "" || b.ctos !== "" || b.valor !== "" || b.situacao !== "pendente"),
  );
}

function bairrosQtd(n) {
  return Number(n || 0).toLocaleString("pt-BR");
}

function bairrosMoeda(n) {
  return typeof formatBRL === "function" ? formatBRL(n) : `R$ ${Number(n || 0).toFixed(2)}`;
}

function bairroValorInput(v) {
  if (v === "" || v == null) return "";
  return Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function bairrosSugestoes() {
  const cidade = typeof readCidadeFromForm === "function" ? readCidadeFromForm() : "";
  const nomes = new Set();
  for (const d of state.demandas || []) {
    if (!demandaUsaBairros(d) || (cidade && d.cidade !== cidade)) continue;
    for (const b of d.bairros || []) if (b.nome) nomes.add(b.nome);
  }
  return [...nomes].sort((a, b) => a.localeCompare(b, "pt-BR")).slice(0, 200);
}

function renderBairrosResumo() {
  const box = document.getElementById("demBairrosResumo");
  const avisos = document.getElementById("demBairrosAvisos");
  const r = bairrosResumo(editingBairros.filter((b) => b.nome.trim() || b.portas !== "" || b.ctos !== ""));
  if (box) {
    box.innerHTML = r.n
      ? `<div class="bairros-resumo__barra" role="img" aria-label="${escapeHtml(`${r.pct}% liberado`)}"><span style="width:${r.pct}%"></span></div>` +
        `<div class="bairros-resumo__nums">` +
        `<span><b>${r.liberados}</b> de ${r.n} bairro${r.n > 1 ? "s" : ""} liberado${r.liberados === 1 ? "" : "s"}</span>` +
        `<span><b>${bairrosQtd(r.portasLib)}</b> de ${bairrosQtd(r.portas)} portas</span>` +
        `<span><b>${bairrosQtd(r.ctosLib)}</b> de ${bairrosQtd(r.ctos)} CTOs</span>` +
        (r.temValor ? `<span><b>${escapeHtml(bairrosMoeda(r.valorLib))}</b> de ${escapeHtml(bairrosMoeda(r.valor))}</span>` : "") +
        `<span class="bairros-resumo__pct">${r.pct}%</span></div>`
      : `<p class="muted small">Adicione os bairros do projeto. Cada um pode ser liberado separado ou todos de uma vez.</p>`;
  }
  if (!avisos) return;
  const out = [];
  if (r.todosLiberados) {
    out.push(
      `<p class="bairros-aviso bairros-aviso--ok">✓ <strong>Todos os bairros foram liberados.</strong> Se o projeto já pode seguir, mova-o para a próxima etapa.</p>`,
    );
  }
  // A soma dos bairros vale como portas novas do projeto; avisa se for diferente do levantamento de custo.
  const custo = typeof readCustoFromForm === "function" ? readCustoFromForm() : null;
  const portasLev = custo?.temPortas && custo.qtdNovasPortas !== "" ? Number(custo.qtdNovasPortas) : null;
  if (r.n && portasLev != null && portasLev !== r.portas) {
    out.push(
      `<p class="bairros-aviso">A soma dos bairros (<strong>${bairrosQtd(r.portas)} portas</strong>) é diferente do levantamento de custo ` +
        `(<strong>${bairrosQtd(portasLev)}</strong>). No sistema vale a soma dos bairros.</p>`,
    );
  }
  const valorLev = custo?.temLevantamento && custo.valorFinal !== "" ? Number(custo.valorFinal) : null;
  if (r.temValor && valorLev != null && Math.abs(valorLev - r.valor) >= 0.01) {
    out.push(
      `<p class="bairros-aviso">Valor somado dos bairros: <strong>${escapeHtml(bairrosMoeda(r.valor))}</strong> · ` +
        `valor final do levantamento: <strong>${escapeHtml(bairrosMoeda(valorLev))}</strong>.</p>`,
    );
  }
  avisos.innerHTML = out.join("");
}

/* ---------- Entrega de todos juntos: uma situação e datas para o conjunto ---------- */
function bairrosConjunto() {
  const b = editingBairros[0] || {};
  return { situacao: b.situacao || "pendente", inicio: b.inicio || "", previsao: b.previsao || "", liberadoEm: b.liberadoEm || "", liberadoPor: b.liberadoPor || "" };
}

/** Deixa todos os bairros com a situação e as datas do conjunto (a do primeiro bairro). */
function igualarBairrosAoConjunto(c = bairrosConjunto()) {
  for (const b of editingBairros) Object.assign(b, c);
}

function bairrosDivergem() {
  const chave = (b) => [b.situacao, b.inicio, b.previsao, b.liberadoEm].join("|");
  return new Set(editingBairros.map(chave)).size > 1;
}

function renderBairrosConjunto() {
  const box = document.getElementById("demBairrosConjunto");
  if (!box) return;
  const junto = editingUsaBairros && editingBairrosModo === "junto";
  box.hidden = !junto;
  if (!junto) {
    box.innerHTML = "";
    return;
  }
  const c = bairrosConjunto();
  const lib = c.situacao === "liberado";
  const opcoes = BAIRRO_SITUACOES.map(([k, l]) => `<option value="${k}"${c.situacao === k ? " selected" : ""}>${l}</option>`).join("");
  const campo = (rotulo, html, extra = "") => `<label class="bairro__campo${extra}"><span>${rotulo}</span>${html}</label>`;
  box.className = `bairros-conjunto bairro--${c.situacao}`;
  box.innerHTML =
    `<p class="bairros-conjunto__titulo">Liberação de todos os bairros</p>` +
    `<div class="bairros-conjunto__campos">` +
    campo("Situação", `<select data-conj-campo="situacao">${opcoes}</select>`, " bairro__campo--situacao") +
    campo("Início da execução", `<input type="date" data-conj-campo="inicio" value="${escapeHtml(c.inicio)}" />`) +
    campo("Previsão de liberação", `<input type="date" data-conj-campo="previsao" value="${escapeHtml(c.previsao)}" />`) +
    campo(
      "Liberado em",
      `<input type="date" data-conj-campo="liberadoEm" value="${escapeHtml(c.liberadoEm)}"${lib ? "" : " disabled"} />` +
        (lib && c.liberadoPor ? `<small class="bairro__por">por ${escapeHtml(c.liberadoPor)}</small>` : ""),
    ) +
    `</div>`;
  if (isReadOnlyUser()) box.querySelectorAll("input, select").forEach((el) => (el.disabled = true));
}

function syncBairrosModoUi() {
  document.querySelectorAll("#demBairrosModo [data-bairros-modo]").forEach((b) => {
    const on = b.dataset.bairrosModo === editingBairrosModo;
    b.setAttribute("aria-checked", String(on));
    b.classList.toggle("is-active", on);
  });
}

function bairroLinhaHtml(b, i) {
  const id = escapeHtml(b.id);
  const lib = b.situacao === "liberado";
  const opcoes = BAIRRO_SITUACOES.map(([k, l]) => `<option value="${k}"${b.situacao === k ? " selected" : ""}>${l}</option>`).join("");
  const campo = (rotulo, html, extra = "") => `<label class="bairro__campo${extra}"><span>${rotulo}</span>${html}</label>`;
  return (
    `<div class="bairro bairro--${b.situacao}" data-bairro="${id}">` +
    `<div class="bairro__linha">` +
    `<span class="bairro__n" aria-hidden="true">${i + 1}</span>` +
    campo(
      "Bairro",
      `<input type="text" data-bairro-campo="nome" value="${escapeHtml(b.nome)}" maxlength="80" list="demBairrosSugestoes" placeholder="Nome do bairro" autocomplete="off" />`,
      " bairro__campo--nome",
    ) +
    campo("Portas novas", `<input type="text" inputmode="numeric" data-bairro-campo="portas" value="${b.portas === "" ? "" : b.portas}" placeholder="0" autocomplete="off" />`, " bairro__campo--num") +
    campo("CTOs", `<input type="text" inputmode="numeric" data-bairro-campo="ctos" value="${b.ctos === "" ? "" : b.ctos}" placeholder="0" autocomplete="off" />`, " bairro__campo--num") +
    campo("Valor (R$)", `<input type="text" inputmode="decimal" data-bairro-campo="valor" value="${bairroValorInput(b.valor)}" placeholder="0,00" autocomplete="off" />`, " bairro__campo--valor") +
    `<button type="button" class="bairro__remover" data-bairro-remover="${id}" title="Remover bairro" aria-label="Remover o bairro ${escapeHtml(b.nome || String(i + 1))}">×</button>` +
    `</div>` +
    (editingBairrosModo === "junto"
      ? ""
      : `<div class="bairro__linha bairro__linha--datas">` +
    campo("Situação", `<select data-bairro-campo="situacao">${opcoes}</select>`, " bairro__campo--situacao") +
    campo("Início da execução", `<input type="date" data-bairro-campo="inicio" value="${escapeHtml(b.inicio)}" />`) +
    campo("Previsão de liberação", `<input type="date" data-bairro-campo="previsao" value="${escapeHtml(b.previsao)}" />`) +
    campo(
      "Liberado em",
      `<input type="date" data-bairro-campo="liberadoEm" value="${escapeHtml(b.liberadoEm)}"${lib ? "" : " disabled"} />` +
        (lib && b.liberadoPor ? `<small class="bairro__por">por ${escapeHtml(b.liberadoPor)}</small>` : ""),
    ) +
    `</div>`) +
    `</div>`
  );
}

function renderBairrosForm() {
  const area = document.getElementById("demBairrosArea");
  if (area) area.hidden = !editingUsaBairros;
  const lista = document.getElementById("demBairrosLista");
  if (lista) lista.innerHTML = editingUsaBairros ? editingBairros.map(bairroLinhaHtml).join("") : "";
  const dl = document.getElementById("demBairrosSugestoes");
  if (dl && editingUsaBairros) dl.innerHTML = bairrosSugestoes().map((n) => `<option value="${escapeHtml(n)}"></option>`).join("");
  const btnTodos = document.getElementById("btnBairrosLiberarTodos");
  if (btnTodos) btnTodos.hidden = editingBairrosModo === "junto" || !editingBairros.some((b) => b.situacao !== "liberado");
  syncBairrosModoUi();
  renderBairrosConjunto();
  renderBairrosResumo();
  if (isReadOnlyUser()) lista?.querySelectorAll("input, select, button").forEach((el) => (el.disabled = true));
}

/** Muda a situação de um bairro, preenchendo as datas do passo (dá para corrigir a data depois). */
function definirSituacaoBairro(b, situacao) {
  const hoje = todayISODate();
  b.situacao = situacao;
  if (situacao !== "pendente" && !b.inicio) b.inicio = hoje;
  if (situacao === "liberado") {
    if (!b.liberadoEm) b.liberadoEm = hoje;
    b.liberadoPor = getLoggedInComentarioAutor();
  } else {
    b.liberadoEm = "";
    b.liberadoPor = "";
  }
}

function avisarSeTodosLiberados(antes) {
  const r = bairrosResumo(editingBairros);
  if (r.todosLiberados && !antes) toast("Todos os bairros liberados. Salve e mova o projeto para a próxima etapa, se ele já pode seguir");
}

function ligarBairrosForm() {
  const chave = document.getElementById("demUsaBairros");
  if (!chave || chave.dataset.ligado) return;
  chave.dataset.ligado = "1";
  chave.addEventListener("change", async () => {
    const usar = chave.checked;
    if (!usar && editingBairros.some((b) => b.nome.trim())) {
      const ok = await confirmDialog({
        title: "Deixar de controlar por bairros?",
        message: "Os bairros deste projeto serão apagados quando você salvar.",
        confirmText: "Apagar os bairros",
        cancelText: "Manter",
        variant: "warn",
      });
      if (!ok) {
        chave.checked = true;
        return;
      }
    }
    editingUsaBairros = usar;
    if (usar && !editingBairros.length) {
      editingBairros = [bairroNovo()];
      editingBairrosModo = "junto";
    }
    if (!usar) editingBairros = [];
    renderBairrosForm();
    if (usar) document.querySelector('#demBairrosLista [data-bairro-campo="nome"]')?.focus();
    agendarSyncDemNavegacao();
  });

  document.getElementById("demBairrosModo")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-bairros-modo]");
    if (!btn || isReadOnlyUser() || btn.dataset.bairrosModo === editingBairrosModo) return;
    if (btn.dataset.bairrosModo === "junto" && bairrosDivergem()) {
      const ok = await confirmDialog({
        title: "Entregar todos juntos?",
        message: "Os bairros estão em situações ou datas diferentes. Todos vão ficar com a situação e as datas do primeiro bairro.",
        confirmText: "Igualar todos",
        cancelText: "Cancelar",
      });
      if (!ok) return;
    }
    editingBairrosModo = btn.dataset.bairrosModo;
    if (editingBairrosModo === "junto") igualarBairrosAoConjunto();
    renderBairrosForm();
    agendarSyncDemNavegacao();
  });

  const conjunto = document.getElementById("demBairrosConjunto");
  conjunto?.addEventListener("change", (e) => {
    const el = e.target.closest("[data-conj-campo]");
    if (!el) return;
    const antes = bairrosResumo(editingBairros).todosLiberados;
    const c = bairrosConjunto();
    if (el.dataset.conjCampo === "situacao") {
      const ref = { ...c };
      definirSituacaoBairro(ref, el.value);
      igualarBairrosAoConjunto(ref);
      renderBairrosForm();
      document.querySelector('#demBairrosConjunto [data-conj-campo="situacao"]')?.focus();
      avisarSeTodosLiberados(antes);
    } else {
      igualarBairrosAoConjunto({ ...c, [el.dataset.conjCampo]: el.value });
      renderBairrosResumo();
    }
    agendarSyncDemNavegacao();
  });

  document.getElementById("btnBairroAdd")?.addEventListener("click", () => {
    // Na entrega de todos juntos, o bairro novo já entra com a situação e as datas do conjunto.
    editingBairros.push(editingBairrosModo === "junto" && editingBairros.length ? { ...bairroNovo(), ...bairrosConjunto() } : bairroNovo());
    renderBairrosForm();
    const campos = document.querySelectorAll('#demBairrosLista [data-bairro-campo="nome"]');
    campos[campos.length - 1]?.focus();
    agendarSyncDemNavegacao();
  });

  document.getElementById("btnBairrosLiberarTodos")?.addEventListener("click", async () => {
    const faltam = editingBairros.filter((b) => b.situacao !== "liberado");
    if (!faltam.length) return;
    const ok = await confirmDialog({
      title: "Liberar todos os bairros?",
      message: `${faltam.length} bairro(s) passam para «Liberado» com a data de hoje.`,
      confirmText: "Liberar todos",
      cancelText: "Cancelar",
    });
    if (!ok) return;
    const antes = bairrosResumo(editingBairros).todosLiberados;
    faltam.forEach((b) => definirSituacaoBairro(b, "liberado"));
    renderBairrosForm();
    avisarSeTodosLiberados(antes);
    agendarSyncDemNavegacao();
  });

  const lista = document.getElementById("demBairrosLista");
  lista?.addEventListener("input", (e) => {
    const el = e.target.closest("[data-bairro-campo]");
    const b = editingBairros.find((x) => x.id === el?.closest("[data-bairro]")?.dataset.bairro);
    if (!el || !b) return;
    const campo = el.dataset.bairroCampo;
    if (campo === "nome") b.nome = el.value;
    else if (campo === "portas" || campo === "ctos") b[campo] = bairroInt(el.value.replace(/\D/g, ""));
    else if (campo === "valor") {
      const n = el.value.trim() === "" ? "" : parseNumBrInput(el.value);
      b.valor = n === "" ? "" : parseCustoMoney(n);
    }
    else if (["inicio", "previsao", "liberadoEm"].includes(campo)) b[campo] = el.value;
    if (campo !== "situacao") renderBairrosResumo();
  });
  lista?.addEventListener("change", (e) => {
    const el = e.target.closest("[data-bairro-campo]");
    const b = editingBairros.find((x) => x.id === el?.closest("[data-bairro]")?.dataset.bairro);
    if (!el || !b) return;
    if (el.dataset.bairroCampo === "situacao") {
      const antes = bairrosResumo(editingBairros).todosLiberados;
      definirSituacaoBairro(b, el.value);
      renderBairrosForm();
      lista.querySelector(`[data-bairro="${CSS.escape(b.id)}"] [data-bairro-campo="situacao"]`)?.focus();
      avisarSeTodosLiberados(antes);
    } else if (el.dataset.bairroCampo === "valor") {
      el.value = bairroValorInput(b.valor);
    }
  });
  lista?.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-bairro-remover]");
    if (!btn) return;
    const b = editingBairros.find((x) => x.id === btn.dataset.bairroRemover);
    if (!b) return;
    if (b.nome.trim() || b.portas !== "" || b.ctos !== "") {
      const ok = await confirmDialog({
        title: "Remover bairro?",
        message: `«${b.nome || "Sem nome"}» sai da lista quando você salvar.`,
        confirmText: "Remover",
        cancelText: "Cancelar",
        variant: "warn",
      });
      if (!ok) return;
    }
    editingBairros = editingBairros.filter((x) => x !== b);
    renderBairrosForm();
    agendarSyncDemNavegacao();
  });
}

/* ---------- Card da esteira ---------- */
function cardBairrosHtml(d) {
  const r = demandaBairrosResumo(d);
  if (!r) return "";
  const segs = normalizeBairros(d.bairros)
    .map(
      (b) =>
        `<span class="card__bairro-seg is-${b.situacao}" title="${escapeHtml(
          `${b.nome || "Bairro"} · ${BAIRRO_SITUACAO_LABEL[b.situacao]}${b.portas !== "" ? ` · ${b.portas} portas` : ""}`,
        )}"></span>`,
    )
    .join("");
  const linha = r.todosLiberados
    ? `<p class="card__bairros-txt is-completo">✓ Todos os bairros liberados</p>`
    : `<p class="card__bairros-txt">${bairrosQtd(r.portasLib)} de ${bairrosQtd(r.portas)} portas liberadas${r.proximaPrevisao ? ` · próximo ${formatDataCurta(r.proximaPrevisao).slice(0, 5)}` : ""}</p>`;
  return (
    `<div class="card__bairros" aria-label="${escapeHtml(`Bairros: ${r.liberados} de ${r.n} liberados`)}">` +
    `<div class="card__ck-head"><span class="card__ck-titulo">` +
    `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 14V7l3-2 3 2v7"/><path d="M8 14V5l3-2.5L14 5v9"/><path d="M1.5 14h13"/></svg>Bairros</span>` +
    `<span class="card__ck-frac${r.todosLiberados ? " is-completo" : ""}">${r.liberados}/${r.n}</span></div>` +
    `<div class="card__bairros-bar">${segs}</div>${linha}</div>`
  );
}
