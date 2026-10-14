/**
 * Histórico de edição, diárias e projetistas.
 * Só declarações (funções e constantes); o que roda ao abrir a página fica em app.js.
 */
function setDemandaFootMenuOpen(open) {
  if (!demandaFootMenu || !demandaFootMenuList || !btnDemandaMaisOpcoes) return;
  demandaFootMenu.classList.toggle("is-open", open);
  demandaFootMenuList.hidden = !open;
  btnDemandaMaisOpcoes.setAttribute("aria-expanded", open ? "true" : "false");
}

function abrirHistoricoEdicaoModal() {
  const id = document.getElementById("demId")?.value?.trim();
  const dem = id ? state.demandas.find((x) => x.id === id) : null;
  const tituloAtual = document.getElementById("demTitulo")?.value?.trim();
  const titEl = document.getElementById("modalHistoricoEdicaoTitulo");
  if (titEl) {
    titEl.textContent = tituloAtual
      ? `Histórico de edição — ${tituloAtual}`
      : "Histórico de edição";
  }
  const target = document.getElementById("histEdicaoList");
  if (!target) return;
  if (!dem) {
    target.innerHTML =
      '<p class="muted small">Esta demanda ainda não foi salva. O histórico começa a ser registrado a partir do primeiro salvamento.</p>';
    modalHistoricoEdicao?.showModal();
    return;
  }
  const lista = normalizeHistoricoEdicoes(dem.historicoEdicoes || []);
  if (!lista.length) {
    target.innerHTML =
      '<p class="muted small">Nenhuma alteração registrada. As próximas edições e a criação serão exibidas aqui.</p>';
  } else {
    target.innerHTML = renderHistoricoEdicaoEntries(lista);
  }
  modalHistoricoEdicao?.showModal();
}

function renderHistoricoEdicaoEntries(lista) {
  const ordenado = [...lista].sort((a, b) => Date.parse(b.at || 0) - Date.parse(a.at || 0));
  return ordenado
    .map((e) => {
      const quando = formatComentarioData(e.at) || "—";
      const autor = escapeHtml(e.by?.autor || "Equipe");
      const email = e.by?.email ? `<span class="hist-edicao__email">${escapeHtml(e.by.email)}</span>` : "";
      const tipoCls = e.tipo === "criacao" ? "hist-edicao__pill hist-edicao__pill--criar" : "hist-edicao__pill";
      const tipoLab = e.tipo === "criacao" ? "Criação" : "Edição";
      let corpo = "";
      if (e.tipo === "criacao") {
        corpo = `<p class="hist-edicao__nota">${escapeHtml(e.nota || "Demanda criada.")}</p>`;
      } else if (e.alteracoes.length) {
        corpo =
          '<ul class="hist-edicao__alteracoes">' +
          e.alteracoes
            .map(
              (a) =>
                `<li><strong>${escapeHtml(a.label)}</strong>: <span class="hist-edicao__de">${escapeHtml(String(a.de ?? "—"))}</span> <span aria-hidden="true">→</span> <span class="hist-edicao__para">${escapeHtml(String(a.para ?? "—"))}</span></li>`,
            )
            .join("") +
          "</ul>";
      } else {
        corpo = '<p class="muted small">Sem campos rastreados alterados.</p>';
      }
      return `
        <article class="hist-edicao-item">
          <header class="hist-edicao__head">
            <span class="${tipoCls}">${tipoLab}</span>
            <span class="hist-edicao__quando" title="${escapeHtml(e.at)}">${escapeHtml(quando)}</span>
          </header>
          <p class="hist-edicao__autor"><strong>${autor}</strong> ${email}</p>
          ${corpo}
        </article>
      `;
    })
    .join("");
}

function openDiariaModal(id) {
  if (!modalDiaria) return;
  const d = id ? state.diarias.find((x) => x.id === id) : null;
  const n = d ? normalizeDiaria(d) : null;
  const idEl = document.getElementById("diariaId");
  const titEl = document.getElementById("diariaTitulo");
  const descEl = document.getElementById("diariaDesc");
  const respEl = document.getElementById("diariaResp");
  if (!idEl || !titEl || !descEl || !respEl) return;
  idEl.value = n?.id || "";
  titEl.value = n?.titulo || "";
  descEl.value = n?.descricao || "";
  respEl.value = n?.responsavel || "Vinicius";
  modalDiaria.showModal();
}

function renderDiarias() {
  const el = document.getElementById("listaDiarias");
  if (!el) return;
  const filtro = document.getElementById("filterDiariaResp")?.value || "";
  let list = state.diarias.map(normalizeDiaria);
  if (filtro) list = list.filter((t) => t.responsavel === filtro);
  list.sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR"));
  el.innerHTML = "";
  if (!list.length) {
    el.innerHTML = `<p class="diarias-empty muted">Nenhuma demanda cadastrada${filtro ? ` para ${filtro}` : ""}.</p>`;
    return;
  }
  for (const t of list) {
    const respClass = diariaRespClass(t.responsavel);
    const card = document.createElement("article");
    card.className = `diaria diaria--${respClass}`;
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.innerHTML = `
      <header class="diaria__head">
        <h3 class="diaria__tit"></h3>
        <span class="diaria__resp"></span>
      </header>
      <p class="diaria__desc"></p>
    `;
    card.querySelector(".diaria__tit").textContent = t.titulo;
    card.querySelector(".diaria__resp").textContent = t.responsavel;
    card.querySelector(".diaria__desc").textContent = t.descricao || "—";
    const open = () => openDiariaModal(t.id);
    card.addEventListener("click", open);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });
    el.appendChild(card);
  }
}

/** Vínculo no card do projetista: "e:id" = esteira, "d:id" = diária; só id sem prefixo (legado) = esteira */
function normalizeProjetistaVinculoRef(ref) {
  if (!ref) return "";
  if (ref.startsWith("e:") || ref.startsWith("d:")) return ref;
  return `e:${ref}`;
}

function parseProjetistaVinculo(ref) {
  const n = normalizeProjetistaVinculoRef(ref);
  if (!n) return null;
  if (n.startsWith("d:")) return { tipo: "diaria", id: n.slice(2) };
  return { tipo: "esteira", id: n.slice(2) };
}

function labelProjetistaVinculo(ref) {
  const p = parseProjetistaVinculo(ref);
  if (!p) return "";
  if (p.tipo === "diaria") {
    const d = (state.diarias || []).map(normalizeDiaria).find((x) => x.id === p.id);
    return d ? `Demanda diária: «${d.titulo}»` : "Demanda diária não encontrada (pode ter sido excluída).";
  }
  const d = state.demandas.find((x) => x.id === p.id);
  return d ? `Esteira: «${d.titulo}»` : "Projeto não encontrado (pode ter sido excluído).";
}

/* ---------- Projetistas ---------- */
function renderProjetistas() {
  const grid = document.getElementById("projetistasGrid");
  if (!grid) return;
  grid.innerHTML = "";

  const fmtEsteiraOpt = (d) => {
    const resp = normalizeResponsavel(d.responsavel, inferLinhaEsteira(d));
    const r = resp ? resp : "Sem atrib.";
    return `<option value="e:${d.id}">${escapeHtml(d.titulo)} (${escapeHtml(r)})</option>`;
  };
  const esteiraAtiva = (d) => {
    const dm = migrateDemanda(d);
    if (dm.linhaEsteira === LINHA_ESTEIRA_B2B) return !STATUS_B2B_CONCLUIDOS.has(dm.status);
    return !["conclusao", "reprovado"].includes(dm.status);
  };
  const esteiraOptsOp = state.demandas
    .filter((d) => inferLinhaEsteira(d) === LINHA_ESTEIRA_OPERACIONAL && esteiraAtiva(d))
    .sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR"))
    .map(fmtEsteiraOpt)
    .join("");
  const esteiraOptsB2b = state.demandas
    .filter((d) => inferLinhaEsteira(d) === LINHA_ESTEIRA_B2B && esteiraAtiva(d))
    .sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR"))
    .map(fmtEsteiraOpt)
    .join("");

  const sections = [
    { titulo: "Esteira Projetos", nomes: PROJETISTAS, esteiraOpts: esteiraOptsOp, labelEsteira: "Esteira Projetos" },
    { titulo: "Esteira B2B", nomes: PROJETISTAS_B2B, esteiraOpts: esteiraOptsB2b, labelEsteira: "Esteira B2B" },
  ];

  for (const { titulo, nomes, esteiraOpts, labelEsteira } of sections) {
    const heading = document.createElement("h3");
    heading.className = "projetistas-section-title";
    heading.textContent = titulo;
    grid.appendChild(heading);

    for (const nome of nomes) {
    const p = state.projetistas[nome] || { texto: "", demandaId: "", desde: "" };
    const card = document.createElement("div");
    card.className = "projetista";

    const diariasOpts = (state.diarias || [])
      .map(normalizeDiaria)
      .filter((d) => d.responsavel === nome)
      .sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR"))
      .map((d) => `<option value="d:${d.id}">${escapeHtml(d.titulo)}</option>`)
      .join("");

    const demandasOpts =
      `<option value="">(sem vínculo)</option>` +
      `<optgroup label="${escapeHtml(labelEsteira)}">${esteiraOpts || '<option disabled value="">Nenhuma ativa</option>'}</optgroup>` +
      `<optgroup label="Demandas diárias">${diariasOpts || '<option disabled value="">Nenhuma para este responsável</option>'}</optgroup>`;

    card.innerHTML = `
      <h3>${nome}</h3>
      <label class="field"><span>O que está fazendo agora</span><textarea class="pj-text"></textarea></label>
      <label class="field"><span>Vincular a</span><select class="pj-dem">${demandasOpts}</select></label>
      <p class="muted small pj-vinculo-legenda" aria-live="polite"></p>
      <div class="projetista__row">
        <button type="button" class="btn btn--primary pj-save">Salvar</button>
        <span class="projetista__since"></span>
      </div>
    `;
    card.querySelector(".pj-text").value = p.texto || "";
    const selDem = card.querySelector(".pj-dem");
    const refNorm = normalizeProjetistaVinculoRef(p.demandaId);
    selDem.value = refNorm || "";
    if (refNorm && !Array.from(selDem.options).some((o) => o.value === refNorm && !o.disabled)) {
      const tipo = parseProjetistaVinculo(refNorm)?.tipo;
      const leg = tipo === "diaria" ? "Demanda diária" : "Esteira";
      const o = document.createElement("option");
      o.value = refNorm;
      o.textContent = `${leg}: (mantido · não listado atualmente)`;
      const primeiro = selDem.querySelector("option[value=\"\"]");
      if (primeiro) primeiro.insertAdjacentElement("afterend", o);
      else selDem.insertBefore(o, selDem.firstChild);
      selDem.value = refNorm;
    }

    const legenda = card.querySelector(".pj-vinculo-legenda");
    const atualizaLegenda = () => {
      legenda.textContent = selDem.value ? labelProjetistaVinculo(selDem.value) : "";
    };
    atualizaLegenda();
    selDem.addEventListener("change", atualizaLegenda);
    const since = card.querySelector(".projetista__since");
    since.textContent = p.desde ? `Desde: ${p.desde.slice(0, 16).replace("T", " ")}` : "";
    card.querySelector(".pj-save").addEventListener("click", () => {
      if (!requireWriteAccess()) return;
      const texto = card.querySelector(".pj-text").value;
      const selVal = card.querySelector(".pj-dem").value;
      const demandaId = selVal === "" ? "" : normalizeProjetistaVinculoRef(selVal);
      const prev = state.projetistas[nome] || {};
      const prevNorm = normalizeProjetistaVinculoRef(prev.demandaId || "");
      const mudou = texto !== prev.texto || demandaId !== prevNorm;
      const agora = new Date().toISOString();
      state.projetistas[nome] = {
        texto,
        demandaId,
        desde: mudou ? agora : prev.desde || "",
        updatedAt: agora,
      };
      saveState({ meta: true });
      renderProjetistas();
      toast("Atividade atualizada");
    });
    grid.appendChild(card);
    }
  }
}
