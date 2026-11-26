/**
 * Dashboard → Liberação por bairros: quanto já foi liberado (portas, CTOs, valor), por mês de liberação,
 * por cidade, e os projetos que estão no meio da liberação.
 */
const DASH_BAIRROS_MESES = 12;
const DASH_MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function dashBairrosLista() {
  return demandasDashboardList().filter((d) => demandaBairrosResumo(d));
}

function dashBairrosBarra(pct, cor = "var(--accent2)") {
  const w = Math.max(0, Math.min(100, Math.round(pct || 0)));
  return `<span class="dash-bairros-barra" aria-hidden="true"><span style="width:${w}%;background:${cor}"></span></span>`;
}

function dashBairrosPorMes(lista) {
  const hoje = todayISODate();
  let ano = Number(hoje.slice(0, 4));
  let mes = Number(hoje.slice(5, 7)) - 1;
  const meses = [];
  for (let i = 0; i < DASH_BAIRROS_MESES; i++) {
    meses.unshift({ chave: `${ano}-${String(mes + 1).padStart(2, "0")}`, rotulo: `${DASH_MESES_CURTOS[mes]}/${String(ano).slice(2)}`, bairros: 0, portas: 0, ctos: 0, valor: 0 });
    mes -= 1;
    if (mes < 0) {
      mes = 11;
      ano -= 1;
    }
  }
  const porChave = new Map(meses.map((m) => [m.chave, m]));
  for (const d of lista) {
    for (const b of normalizeBairros(d.bairros)) {
      if (b.situacao !== "liberado" || !b.liberadoEm) continue;
      const m = porChave.get(b.liberadoEm.slice(0, 7));
      if (!m) continue;
      m.bairros += 1;
      m.portas += Number(b.portas) || 0;
      m.ctos += Number(b.ctos) || 0;
      m.valor += Number(b.valor) || 0;
    }
  }
  return meses;
}

function dashBairrosPorCidade(lista) {
  const mapa = new Map();
  for (const d of lista) {
    const r = demandaBairrosResumo(d);
    const cidade = labelCidade(d.cidade);
    if (!mapa.has(cidade)) mapa.set(cidade, { cidade, projetos: 0, n: 0, liberados: 0, portas: 0, portasLib: 0, ctos: 0, ctosLib: 0, valorLib: 0 });
    const c = mapa.get(cidade);
    c.projetos += 1;
    for (const k of ["n", "liberados", "portas", "portasLib", "ctos", "ctosLib", "valorLib"]) c[k] += r[k];
  }
  return [...mapa.values()].sort((a, b) => b.portas - a.portas || a.cidade.localeCompare(b.cidade, "pt-BR"));
}

function renderDashBairros() {
  const el = document.getElementById("dashBairros");
  if (!el) return;
  const lista = dashBairrosLista();
  if (!lista.length) {
    el.innerHTML =
      '<p class="muted dash-bairros-vazio">Nenhum projeto está marcado como liberado por bairros. No projeto, use a seção <strong>Liberação por bairros</strong>.</p>';
    return;
  }
  const t = { n: 0, liberados: 0, portas: 0, portasLib: 0, ctos: 0, ctosLib: 0, valor: 0, valorLib: 0, parcial: 0, total: 0 };
  for (const d of lista) {
    const r = demandaBairrosResumo(d);
    for (const k of ["n", "liberados", "portas", "portasLib", "ctos", "ctosLib", "valor", "valorLib"]) t[k] += r[k];
    if (r.parcial) t.parcial += 1;
    if (r.todosLiberados) t.total += 1;
  }
  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);
  const kpis =
    `<div class="kpi-grid kpi-grid--6">` +
    kpiCard("Projetos por bairros", String(lista.length), "ok", `${t.parcial} em liberação parcial · ${t.total} liberado(s) total`) +
    kpiCard("Bairros liberados", `${formatQtd(t.liberados)} de ${formatQtd(t.n)}`, "ok", `${pct(t.liberados, t.n)}% dos bairros`) +
    kpiCard("Portas liberadas", formatQtd(t.portasLib), "ok", `de ${formatQtd(t.portas)} · ${pct(t.portasLib, t.portas)}%`) +
    kpiCard("CTOs liberadas", formatQtd(t.ctosLib), "ok", `de ${formatQtd(t.ctos)} · ${pct(t.ctosLib, t.ctos)}%`) +
    kpiCard("Valor liberado", formatBRLCompact(t.valorLib), "ok", t.valor ? `de ${formatBRLCompact(t.valor)} · ${pct(t.valorLib, t.valor)}%` : "Sem valor nos bairros") +
    `</div>`;

  // Meses antes da primeira liberação não dizem nada: mostra a partir dela (no mínimo os últimos 6 meses).
  const todosMeses = dashBairrosPorMes(lista);
  const primeiro = todosMeses.findIndex((m) => m.bairros);
  const meses = todosMeses.slice(primeiro < 0 ? todosMeses.length - 6 : Math.min(primeiro, todosMeses.length - 6));
  const maxPortas = Math.max(1, ...meses.map((m) => m.portas));
  const porMes =
    `<h3 class="dash-subhead">Liberado por mês <span class="muted small">(pela data de liberação de cada bairro)</span></h3>` +
    `<div class="dashboard-table-wrap" tabindex="0"><table class="dash-table dash-bairros-mes" aria-label="Liberações por mês">` +
    `<thead><tr><th>Mês</th><th class="num">Bairros</th><th>Portas liberadas</th><th class="num">CTOs</th><th class="num">Valor</th></tr></thead><tbody>` +
    meses
      .map(
        (m) =>
          `<tr${m.bairros ? "" : ' class="is-vazio"'}><td>${escapeHtml(m.rotulo)}</td><td class="num">${m.bairros || "—"}</td>` +
          `<td><span class="dash-bairros-cel">${dashBairrosBarra((m.portas / maxPortas) * 100)}<b>${m.portas ? formatQtd(m.portas) : "—"}</b></span></td>` +
          `<td class="num">${m.ctos ? formatQtd(m.ctos) : "—"}</td><td class="num">${m.valor ? escapeHtml(formatBRL(m.valor)) : "—"}</td></tr>`,
      )
      .join("") +
    `</tbody></table></div>`;

  const cidades = dashBairrosPorCidade(lista);
  const porCidade =
    `<h3 class="dash-subhead">Por cidade</h3>` +
    `<div class="dashboard-table-wrap" tabindex="0"><table class="dash-table dash-bairros-cidade" aria-label="Liberação por cidade">` +
    `<thead><tr><th>Cidade</th><th class="num">Projetos</th><th class="num">Bairros liberados</th><th>Portas liberadas</th><th class="num">CTOs liberadas</th><th class="num">Valor liberado</th></tr></thead><tbody>` +
    cidades
      .map(
        (c) =>
          `<tr><td>${escapeHtml(c.cidade)}</td><td class="num">${c.projetos}</td><td class="num">${c.liberados}/${c.n}</td>` +
          `<td><span class="dash-bairros-cel">${dashBairrosBarra(c.portas ? (c.portasLib / c.portas) * 100 : 0)}<b>${formatQtd(c.portasLib)} de ${formatQtd(c.portas)}</b></span></td>` +
          `<td class="num">${formatQtd(c.ctosLib)} de ${formatQtd(c.ctos)}</td><td class="num">${c.valorLib ? escapeHtml(formatBRL(c.valorLib)) : "—"}</td></tr>`,
      )
      .join("") +
    `</tbody></table></div>`;

  const andamento = lista
    .map((d) => ({ d, r: demandaBairrosResumo(d) }))
    .filter(({ r }) => !r.todosLiberados)
    .sort((a, b) => b.r.pct - a.r.pct || String(a.d.titulo).localeCompare(String(b.d.titulo), "pt-BR"));
  const emAndamento =
    `<h3 class="dash-subhead">Ainda liberando <span class="muted small">(${andamento.length})</span></h3>` +
    (andamento.length
      ? `<ul class="dash-bairros-proj">` +
        andamento
          .map(
            ({ d, r }) =>
              `<li><button type="button" class="dash-bairros-proj__item" data-dash-abrir="${escapeHtml(d.id)}">` +
              `<span class="dash-bairros-proj__topo"><strong>${escapeHtml(d.titulo)}</strong><span>${r.pct}%</span></span>` +
              dashBairrosBarra(r.pct, r.parcial ? "var(--accent2)" : "var(--accent)") +
              `<span class="dash-bairros-proj__sub">${escapeHtml(labelCidade(d.cidade))} · ${r.liberados}/${r.n} bairros · ${formatQtd(r.portasLib)} de ${formatQtd(r.portas)} portas` +
              (r.ultimaLiberacao ? ` · última liberação ${formatDataCurta(r.ultimaLiberacao)}` : "") +
              (r.proximaPrevisao ? ` · próxima prevista ${formatDataCurta(r.proximaPrevisao)}` : "") +
              `</span></button></li>`,
          )
          .join("") +
        `</ul>`
      : '<p class="muted dash-bairros-vazio">✓ Todos os projetos por bairros já foram liberados por completo.</p>');

  el.innerHTML = kpis + porMes + porCidade + emAndamento;
  el.querySelectorAll("[data-dash-abrir]").forEach((b) => b.addEventListener("click", () => openDemandaModal(b.dataset.dashAbrir)));
  if (typeof ajustarTextoAoQuadro === "function") requestAnimationFrame(() => ajustarTextoAoQuadro(el.querySelectorAll(".kpi__value")));
}
