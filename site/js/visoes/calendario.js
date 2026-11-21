/**
 * Calendário de prazos: finalização prevista (ou atualizada) dos projetos e término das atividades do checklist.
 * Só declarações; os eventos da tela são ligados em ligarCalendario() (chamado pelo app.js).
 */
const CAL_MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const CAL_DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const CAL_MAX_NO_DIA = 3;
const CAL_LISTA_DIAS = 60;

const calEstado = { ano: 0, mes: 0, dia: "", modo: "", ligado: false };

function calIso(ano, mes, dia) {
  return `${ano}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

function calSomarDias(iso, n) {
  const [a, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

function calDataLonga(iso) {
  const [a, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  const semana = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"][dt.getUTCDay()];
  return `${semana}, ${d} de ${CAL_MESES[m - 1]}`;
}

function calFiltros() {
  const v = (id) => document.getElementById(id);
  return {
    esteira: v("calFiltroEsteira")?.value || "todas",
    projetista: v("calFiltroProjetista")?.value || "",
    projetos: v("calMostrarProjetos")?.checked !== false,
    atividades: v("calMostrarAtividades")?.checked !== false,
    concluidos: v("calMostrarConcluidos")?.checked === true,
  };
}

/** Todos os prazos (projetos e atividades) que passam pelos filtros, com a data e se estão atrasados. */
function calEventos(f = calFiltros()) {
  const hoje = todayISODate();
  const out = [];
  const slugFiltro = f.projetista ? projetistaSlug(f.projetista) : "";
  for (const bruto of state.demandas || []) {
    if (bruto.arquivadoEm || bruto.excluidoEm) continue;
    const d = migrateDemanda(bruto);
    const b2b = isDemandaB2b(d);
    if (f.esteira === "operacional" && b2b) continue;
    if (f.esteira === "b2b" && !b2b) continue;
    const encerrada = isDemandaEncerrada(d);
    if (d.status === "reprovado") continue;
    const projetistas = demandaProjetistasList(d);
    const daPessoa = !slugFiltro || projetistas.some((p) => projetistaSlug(p) === slugFiltro);
    const linha = d.linhaEsteira;

    if (f.projetos && daPessoa) {
      const prazo = isoDatePart(d.dataFimAtualizada || "") || isoDatePart(d.dataFimPrevista || "");
      if (prazo && (!encerrada || f.concluidos)) {
        const original = isoDatePart(d.dataFimPrevista || "");
        out.push({
          tipo: "projeto",
          data: prazo,
          id: d.id,
          titulo: d.titulo,
          sub: [projetistas.join(" · ") || "Não atribuído", labelStatus(d.status, linha)].join(" · "),
          nota: original && prazo !== original ? `Prazo atualizado (antes ${formatDataCurta(original)})` : "",
          concluido: encerrada,
          atrasado: !encerrada && prazo < hoje,
          tipoDemanda: d.tipo,
        });
      }
    }

    if (f.atividades && !(encerrada && !f.concluidos)) {
      for (const it of d.checklist || []) {
        const fim = checklistNovaData(it) || isoDatePart(it.date || "");
        if (!fim || (it.done && !f.concluidos)) continue;
        if (slugFiltro) {
          const quem = projetistaSlug(it.who || "");
          const dele = quem ? quem === slugFiltro || quem.split(/\s+/)[0] === slugFiltro : daPessoa;
          if (!dele) continue;
        }
        out.push({
          tipo: "atividade",
          data: fim,
          id: d.id,
          titulo: it.name,
          sub: [d.titulo, it.who].filter(Boolean).join(" · "),
          nota: checklistNovaData(it) ? `Reprogramada (antes ${formatDataCurta(it.date)})` : "",
          concluido: !!it.done,
          atrasado: !it.done && fim < hoje,
        });
      }
    }
  }
  return out.sort((a, b) => a.data.localeCompare(b.data) || a.tipo.localeCompare(b.tipo) || String(a.titulo).localeCompare(String(b.titulo), "pt-BR"));
}

function calClasseEvento(ev) {
  return `cal-ev cal-ev--${ev.tipo}${ev.atrasado ? " is-atrasado" : ""}${ev.concluido ? " is-concluido" : ""}`;
}

function calEstadoTexto(ev) {
  if (ev.concluido) return "concluído";
  if (ev.atrasado) return "atrasado";
  return "";
}

function calChipHtml(ev) {
  const estado = calEstadoTexto(ev);
  const rotulo = `${ev.tipo === "projeto" ? "Prazo do projeto" : "Atividade"}: ${ev.titulo}${estado ? ` (${estado})` : ""}`;
  return (
    `<button type="button" class="${calClasseEvento(ev)}" data-cal-abrir="${escapeHtml(ev.id)}" title="${escapeHtml(`${rotulo} — ${ev.sub}`)}" aria-label="${escapeHtml(rotulo)}">` +
    `<span class="cal-ev__ponto" aria-hidden="true"></span><span class="cal-ev__txt">${escapeHtml(ev.titulo)}</span></button>`
  );
}

function calItemHtml(ev) {
  const estado = calEstadoTexto(ev);
  return (
    `<li><button type="button" class="cal-item ${calClasseEvento(ev).replace("cal-ev ", "")}" data-cal-abrir="${escapeHtml(ev.id)}">` +
    `<span class="cal-item__tipo">${ev.tipo === "projeto" ? "Prazo do projeto" : "Atividade"}</span>` +
    `<strong class="cal-item__titulo">${escapeHtml(ev.titulo)}</strong>` +
    `<span class="cal-item__sub">${escapeHtml(ev.sub)}</span>` +
    (ev.nota ? `<span class="cal-item__nota">${escapeHtml(ev.nota)}</span>` : "") +
    (estado ? `<span class="cal-item__estado">${estado === "atrasado" ? `Atrasado desde ${formatDataCurta(ev.data)}` : "Concluído"}</span>` : "") +
    "</button></li>"
  );
}

function calRenderResumo(eventos) {
  const el = document.getElementById("calResumo");
  if (!el) return;
  const hoje = todayISODate();
  const semana = calSomarDias(hoje, 6);
  const mes = calSomarDias(hoje, 29);
  const abertos = eventos.filter((e) => !e.concluido);
  const n = {
    atrasados: abertos.filter((e) => e.atrasado).length,
    hoje: abertos.filter((e) => e.data === hoje).length,
    semana: abertos.filter((e) => e.data >= hoje && e.data <= semana).length,
    mes: abertos.filter((e) => e.data >= hoje && e.data <= mes).length,
  };
  const card = (chave, rotulo, valor, tom) =>
    `<button type="button" class="cal-resumo__card cal-resumo__card--${tom}" data-cal-resumo="${chave}">` +
    `<strong>${valor}</strong><span>${rotulo}</span></button>`;
  el.innerHTML =
    card("atrasados", "Atrasados", n.atrasados, n.atrasados ? "perigo" : "neutro") +
    card("hoje", "Vencem hoje", n.hoje, n.hoje ? "alerta" : "neutro") +
    card("semana", "Próximos 7 dias", n.semana, "info") +
    card("mes", "Próximos 30 dias", n.mes, "neutro");
}

function calRenderMes(eventos) {
  const grade = document.getElementById("calGrade");
  const titulo = document.getElementById("calTitulo");
  if (!grade) return;
  const { ano, mes } = calEstado;
  if (titulo) titulo.textContent = `${CAL_MESES[mes].replace(/^./, (c) => c.toUpperCase())} de ${ano}`;
  const hoje = todayISODate();
  const primeiro = new Date(Date.UTC(ano, mes, 1)).getUTCDay();
  const diasNoMes = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  const inicio = calSomarDias(calIso(ano, mes, 1), -primeiro);
  const semanas = Math.ceil((primeiro + diasNoMes) / 7);
  const porDia = new Map();
  for (const ev of eventos) {
    if (!porDia.has(ev.data)) porDia.set(ev.data, []);
    porDia.get(ev.data).push(ev);
  }
  let html = CAL_DIAS_SEMANA.map((s) => `<div class="cal-grade__semana" aria-hidden="true">${s}</div>`).join("");
  for (let i = 0; i < semanas * 7; i++) {
    const iso = calSomarDias(inicio, i);
    const doMes = Number(iso.slice(5, 7)) - 1 === mes;
    const evs = porDia.get(iso) || [];
    const atrasados = evs.filter((e) => e.atrasado).length;
    const classes = ["cal-dia"];
    if (!doMes) classes.push("is-fora");
    if (iso === hoje) classes.push("is-hoje");
    if (iso === calEstado.dia) classes.push("is-escolhido");
    if (evs.length) classes.push("tem-eventos");
    const rotulo = `${calDataLonga(iso)}: ${evs.length ? `${evs.length} prazo${evs.length > 1 ? "s" : ""}` : "sem prazos"}${atrasados ? `, ${atrasados} atrasado${atrasados > 1 ? "s" : ""}` : ""}`;
    const extras = evs.length - CAL_MAX_NO_DIA;
    html +=
      `<div class="${classes.join(" ")}" data-cal-dia="${iso}">` +
      `<button type="button" class="cal-dia__num" data-cal-escolher="${iso}" aria-label="${escapeHtml(rotulo)}"${iso === calEstado.dia ? ' aria-pressed="true"' : ' aria-pressed="false"'}>${Number(iso.slice(8))}</button>` +
      `<div class="cal-dia__evs">${evs.slice(0, CAL_MAX_NO_DIA).map(calChipHtml).join("")}` +
      (extras > 0 ? `<button type="button" class="cal-dia__mais" data-cal-escolher="${iso}">+${extras} mais</button>` : "") +
      "</div></div>";
  }
  grade.innerHTML = html;
  grade.style.setProperty("--cal-semanas", String(semanas));
}

function calRenderDia(eventos) {
  const box = document.getElementById("calDiaLista");
  const tit = document.getElementById("calDiaTitulo");
  if (!box) return;
  const dia = calEstado.dia || todayISODate();
  const evs = eventos.filter((e) => e.data === dia);
  if (tit) tit.textContent = calDataLonga(dia).replace(/^./, (c) => c.toUpperCase());
  box.innerHTML = evs.length
    ? `<ul class="cal-lista">${evs.map(calItemHtml).join("")}</ul>`
    : '<p class="cal-vazio">Nenhum prazo neste dia.</p>';
}

function calRenderAgenda(eventos) {
  const box = document.getElementById("calAgenda");
  if (!box) return;
  const hoje = todayISODate();
  const ate = calSomarDias(hoje, CAL_LISTA_DIAS - 1);
  const atrasados = eventos.filter((e) => e.atrasado);
  const proximos = eventos.filter((e) => e.data >= hoje && e.data <= ate && !(e.concluido && e.data < hoje));
  const grupos = new Map();
  for (const ev of proximos) {
    if (!grupos.has(ev.data)) grupos.set(ev.data, []);
    grupos.get(ev.data).push(ev);
  }
  let html = "";
  if (atrasados.length) {
    html +=
      `<section class="cal-agenda__grupo cal-agenda__grupo--atraso"><h4>Atrasados <b>${atrasados.length}</b></h4>` +
      `<ul class="cal-lista">${atrasados.map(calItemHtml).join("")}</ul></section>`;
  }
  for (const [dia, evs] of grupos) {
    const rel = dia === hoje ? "Hoje · " : dia === calSomarDias(hoje, 1) ? "Amanhã · " : "";
    html +=
      `<section class="cal-agenda__grupo"><h4>${rel}${escapeHtml(calDataLonga(dia))} <b>${evs.length}</b></h4>` +
      `<ul class="cal-lista">${evs.map(calItemHtml).join("")}</ul></section>`;
  }
  box.innerHTML = html || `<p class="cal-vazio">Nenhum prazo nos próximos ${CAL_LISTA_DIAS} dias.</p>`;
}

function calPreencherProjetistas() {
  const sel = document.getElementById("calFiltroProjetista");
  if (!sel) return;
  const atual = sel.value;
  const nomes = [...new Set([...PROJETISTAS, ...PROJETISTAS_B2B])].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const html = '<option value="">Todos os projetistas</option>' + nomes.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("");
  if (sel.dataset.opcoes !== html) {
    sel.innerHTML = html;
    sel.dataset.opcoes = html;
  }
  sel.value = nomes.includes(atual) ? atual : "";
}

function calModo() {
  if (calEstado.modo) return calEstado.modo;
  return window.matchMedia?.("(max-width: 720px)").matches ? "lista" : "mes";
}

function renderCalendario() {
  const painel = document.getElementById("panelCalendario");
  if (!painel) return;
  if (!calEstado.ano) {
    const hoje = todayISODate();
    calEstado.ano = Number(hoje.slice(0, 4));
    calEstado.mes = Number(hoje.slice(5, 7)) - 1;
    calEstado.dia = hoje;
  }
  calPreencherProjetistas();
  const modo = calModo();
  painel.dataset.calModo = modo;
  document.querySelectorAll("[data-cal-modo]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.calModo === modo)));
  const eventos = calEventos();
  calRenderResumo(eventos);
  if (modo === "mes") {
    calRenderMes(eventos);
    calRenderDia(eventos);
  } else {
    calRenderAgenda(eventos);
  }
}

function calIrParaMes(delta) {
  let m = calEstado.mes + delta;
  let a = calEstado.ano;
  while (m < 0) {
    m += 12;
    a -= 1;
  }
  while (m > 11) {
    m -= 12;
    a += 1;
  }
  calEstado.mes = m;
  calEstado.ano = a;
  renderCalendario();
}

function ligarCalendario() {
  const painel = document.getElementById("panelCalendario");
  if (!painel || calEstado.ligado) return;
  calEstado.ligado = true;
  document.getElementById("calAnterior")?.addEventListener("click", () => calIrParaMes(-1));
  document.getElementById("calProximo")?.addEventListener("click", () => calIrParaMes(1));
  document.getElementById("calHoje")?.addEventListener("click", () => {
    const hoje = todayISODate();
    calEstado.ano = Number(hoje.slice(0, 4));
    calEstado.mes = Number(hoje.slice(5, 7)) - 1;
    calEstado.dia = hoje;
    renderCalendario();
  });
  painel.querySelectorAll("[data-cal-modo]").forEach((b) =>
    b.addEventListener("click", () => {
      calEstado.modo = b.dataset.calModo;
      renderCalendario();
    }),
  );
  ["calFiltroEsteira", "calFiltroProjetista", "calMostrarProjetos", "calMostrarAtividades", "calMostrarConcluidos"].forEach((id) =>
    document.getElementById(id)?.addEventListener("change", renderCalendario),
  );
  painel.addEventListener("click", (e) => {
    const abrir = e.target.closest("[data-cal-abrir]");
    if (abrir) {
      openDemandaModal(abrir.dataset.calAbrir);
      return;
    }
    const escolher = e.target.closest("[data-cal-escolher]");
    if (escolher) {
      calEstado.dia = escolher.dataset.calEscolher;
      const m = Number(calEstado.dia.slice(5, 7)) - 1;
      if (m !== calEstado.mes) {
        calEstado.mes = m;
        calEstado.ano = Number(calEstado.dia.slice(0, 4));
      }
      renderCalendario();
      document.getElementById("calDia")?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
      return;
    }
    const resumo = e.target.closest("[data-cal-resumo]");
    if (resumo) {
      calEstado.modo = "lista";
      renderCalendario();
      const alvo = resumo.dataset.calResumo === "atrasados" ? painel.querySelector(".cal-agenda__grupo--atraso") : painel.querySelector(".cal-agenda__grupo:not(.cal-agenda__grupo--atraso)");
      alvo?.scrollIntoView?.({ block: "start", behavior: "smooth" });
    }
  });
}
