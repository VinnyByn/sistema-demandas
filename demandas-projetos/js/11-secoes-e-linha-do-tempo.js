/**
 * Seções recolhíveis do projeto, abertura do modal e linha do tempo.
 * Só declarações (funções e constantes); o que roda ao abrir a página fica em app.js.
 */
/* ---------- Modal demanda: seções recolhíveis com resumo ---------- */
const DEM_SECOES = [
  {
    key: "chegada",
    sel: ".fieldset--chegada",
    icone: '<rect x="3" y="2" width="10" height="12" rx="1.5"/><path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3"/>',
  },
  {
    key: "atribuicao",
    sel: ".fieldset--atribuicao",
    icone: '<circle cx="8" cy="5.5" r="2.5"/><path d="M3 13.5c.6-2.6 2.6-4 5-4s4.4 1.4 5 4"/>',
  },

  {
    key: "atraso",
    sel: "#fieldsetMotivosAtraso",
    icone: '<path d="M8 2.5 14 13H2z"/><path d="M8 6.5v3M8 11.3v.2"/>',
  },
  {
    key: "custo",
    sel: "#fieldsetCusto",
    icone: '<rect x="2" y="4" width="12" height="8.5" rx="1.5"/><circle cx="8" cy="8.2" r="1.8"/>',
  },

  {
    key: "checklist",
    sel: ".fieldset--checklist",
    icone: '<rect x="2" y="2" width="12" height="12" rx="2.5"/><path d="M5 8.2l2 2 4-4.2"/>',
  },
  {
    key: "timeline",
    sel: ".fieldset--timeline",
    icone: '<path d="M2.5 4h6M5 8h8.5M3.5 12h5"/>',
  },
];
const DEM_SECOES_COLAPSADAS_KEY = "demandas.secoesColapsadas";
let demNavSyncRaf = 0;

function demSecaoEl(sec) {
  return document.querySelector(`#formDemanda ${sec.sel}`);
}

function demSvgIcone(paths) {
  return `<svg viewBox="0 0 16 16" aria-hidden="true">${paths}</svg>`;
}

function lerSecoesColapsadas() {
  try {
    const raw = JSON.parse(localStorage.getItem(DEM_SECOES_COLAPSADAS_KEY) || "[]");
    return new Set(Array.isArray(raw) ? raw : []);
  } catch {
    return new Set();
  }
}

function gravarSecoesColapsadas(set) {
  try {
    localStorage.setItem(DEM_SECOES_COLAPSADAS_KEY, JSON.stringify([...set]));
  } catch {
    /* preferência só local — sem storage, segue tudo aberto */
  }
}

function setSecaoColapsada(sec, colapsada, { persistir = true } = {}) {
  const fs = demSecaoEl(sec);
  if (!fs) return;
  fs.classList.toggle("is-collapsed", colapsada);
  fs.querySelector(".seg-toggle")?.setAttribute("aria-expanded", String(!colapsada));
  if (!persistir) return;
  const set = lerSecoesColapsadas();
  if (colapsada) set.add(sec.key);
  else set.delete(sec.key);
  gravarSecoesColapsadas(set);
}

function expandirTodasSecoes() {
  for (const sec of DEM_SECOES) setSecaoColapsada(sec, false, { persistir: false });
}

/* ---------- Seções do modal: modo leitura (resumo visual) + edição sob demanda ---------- */
/** Seções com leitura/edição (checklist e tempo na esteira já têm interação própria). */
const DEM_SECOES_LEITURA = ["chegada", "atribuicao", "atraso", "custo"];

function lvVal(id) {
  return (document.getElementById(id)?.value || "").trim();
}

function lvOptTxt(id) {
  const sel = document.getElementById(id);
  return sel && sel.value ? (sel.selectedOptions[0]?.textContent || "").trim() : "";
}

function lvPar(label, valorHtml, extra = "") {
  return (
    `<div class="seg-lv${extra}"><span class="seg-lv__label">${escapeHtml(label)}</span>` +
    `<span class="seg-lv__valor">${valorHtml}</span></div>`
  );
}

function lvVazio(txt = "—") {
  return `<span class="seg-lv__vazio">${escapeHtml(txt)}</span>`;
}

function lvData(iso, { relativo = false } = {}) {
  if (!iso) return lvVazio();
  const txt = escapeHtml(formatDataCurta(iso));
  if (!relativo) return txt;
  const dias = diasEntreDatasISO(iso, todayISODate());
  const rel = dias === 0 ? "hoje" : dias === 1 ? "há 1 dia" : `há ${dias} dias`;
  return `${txt} <span class="seg-lv__sub">${rel}</span>`;
}

function lvPessoa(nome) {
  return (
    `<span class="seg-lv__pessoa"><span class="ck-avatar" style="--avatar-h:${cardAvatarHue(nome)}" aria-hidden="true">` +
    `${escapeHtml(cardAvatarIniciais(nome))}</span>${escapeHtml(nome)}</span>`
  );
}

function lvMoney(id) {
  const v = lvVal(id);
  return v ? `R$ ${escapeHtml(v)}` : "";
}

/** Cores dos cabos no resumo do levantamento — paleta categórica validada. */
const CUSTO_LV_CORES = ["#3987e5", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#9085e9"];

function formatIntBr(n) {
  return formatBr().formatIntegerBr?.(n) ?? Number(n).toLocaleString("pt-BR");
}

function custoLvNum(txt) {
  if (!txt) return null;
  const n = parseFloat(String(txt).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function custoLvLinha(rotuloHtml, valorHtml, rotuloJaHtml = false) {
  return `<div class="custo-lv__linha"><span>${rotuloJaHtml ? rotuloHtml : escapeHtml(rotuloHtml)}</span><span>${valorHtml}</span></div>`;
}

function custoLvBloco(ico, titulo, principalHtml, corpoHtml) {
  return (
    `<section class="custo-lv__bloco" data-bloco="${escapeHtml(titulo)}">` +
    `<header class="custo-lv__bloco-head"><span class="custo-lv__ico" aria-hidden="true">${ico}</span>${escapeHtml(titulo)}</header>` +
    principalHtml +
    (corpoHtml ? `<div class="custo-lv__corpo">${corpoHtml}</div>` : "") +
    `</section>`
  );
}

function demSecaoLeituraHtml(key) {
  switch (key) {
    case "chegada": {
      const tipo = normalizeTipo(lvVal("demTipo"));
      const extraTipo = tipo === "B2B" ? lvOptTxt("demProdutoB2b") : tipo === "B2C" ? lvOptTxt("demSegmentoB2c") : "";
      const desc = lvVal("demDescricao");
      return (
        `<div class="seg-lv-hero"><p class="seg-lv-hero__titulo">${escapeHtml(lvVal("demTitulo")) || lvVazio("Sem nome")}</p>` +
        `<div class="seg-lv-hero__tags"><span class="badge ${tipoBadgeClass(tipo)}">${escapeHtml(tipo)}</span>` +
        (extraTipo ? `<span class="badge badge--segmento-b2c">${escapeHtml(extraTipo)}</span>` : "") +
        `<span class="seg-lv-etapa">${escapeHtml(labelStatus(lvVal("demStatus"), editingLinhaEsteira))}</span>` +
        `</div></div>` +
        `<div class="seg-lv-texto">${desc ? escapeHtml(desc) : lvVazio("Sem descrição")}</div>` +
        `<div class="dados-lv__bloco"><span class="dados-lv__titulo">Prazos</span>${demSecaoLeituraHtml("esteira")}</div>` +
        `<div class="dados-lv__bloco dados-lv__bloco--refs"><span class="dados-lv__titulo">Referências externas</span>${demSecaoLeituraHtml("referencias")}</div>`
      );
    }
    case "atribuicao": {
      const resp = normalizeResponsavel(lvVal("demResponsavel"));
      const extras = editingProjetistasExtra || [];
      const pessoas = resp
        ? [resp, ...extras].map(lvPessoa).join("")
        : `<span class="badge badge--pend">Não atribuído</span>`;
      const cidade = lvOptTxt("demCidade");
      const regional = lvOptTxt("demRegional");
      const cidadesExtra = readCidadesExtraFromForm();
      const local =
        (regional || cidade
          ? `${escapeHtml([regional, cidade].filter(Boolean).join(" · "))}`
          : lvVazio()) +
        (cidadesExtra.length
          ? `<span class="seg-lv__chips">${cidadesExtra.map((c) => `<span class="seg-lv__chip">+ ${escapeHtml(c)}</span>`).join("")}</span>`
          : "");
      const sol = readSolicitanteFromForm();
      const setor = readSetorSolicitanteB2bFromForm();
      return (
        `<div class="seg-lv-grid seg-lv-grid--2">` +
        lvPar(extras.length ? "Projetistas" : "Projetista", `<span class="seg-lv__pessoas">${pessoas}</span>`) +
        lvPar("Local", local) +
        lvPar("Solicitante", sol ? `${escapeHtml(sol)}${setor ? ` <span class="seg-lv__sub">${escapeHtml(setor)}</span>` : ""}` : lvVazio()) +
        `</div>`
      );
    }
    case "esteira": {
      const prev = demandaPreviewFromForm();
      const prazo = cardPrazoInfo(prev);
      const dias = demandaInicioContagemAberto(prev) ? formatDiasAbertoLabel(demandaDiasAberto(prev)) : "";
      const prazoHtml = prazo
        ? `<div class="card__prazo card__prazo--${prazo.tom} seg-lv-prazo"><div class="card__prazo-bar"><span style="width:${prazo.pct}%"></span></div>` +
          `<p class="card__prazo-txt">${escapeHtml(prazo.texto)}</p></div>`
        : `<p class="seg-lv__vazio seg-lv-prazo">Sem finalização prevista</p>`;
      return (
        prazoHtml +
        `<div class="seg-lv-grid">` +
        lvPar("Chegada", lvData(prev.dataChegada)) +
        lvPar("Finalização prevista", lvData(lvVal("demDataFimPrevista"))) +
        (lvVal("demDataFimAtualizada") ? lvPar("Finalização atualizada", lvData(lvVal("demDataFimAtualizada"))) : "") +
        (lvVal("demDataTermino") ? lvPar("Término", lvData(lvVal("demDataTermino"))) : "") +
        (dias ? lvPar("Dias aberto", escapeHtml(dias)) : "") +
        `</div>`
      );
    }
    case "atraso": {
      const itens = readMotivosAtrasoFromDom({ forSave: true });
      const totalDias = demandaDiasAtraso(demandaPreviewFromForm());
      if (!itens.length) return `<p class="seg-lv__vazio">Nenhum motivo registrado — clique para informar.</p>`;
      return (
        `<ul class="seg-lv-lista">${itens
          .map(
            (it) =>
              `<li><span>${escapeHtml(it.motivo || "Sem descrição")}</span>${
                it.dias !== "" ? `<b>${escapeHtml(formatDiasAtrasoLabel(it.dias))}</b>` : ""
              }</li>`,
          )
          .join("")}</ul>` +
        (totalDias > 0 ? `<p class="seg-lv__sub">Atraso total: <strong>${escapeHtml(formatDiasAtrasoLabel(totalDias))}</strong></p>` : "")
      );
    }
    case "custo": {
      const exec = lvVal("custoExecucao");
      const temExec = exec && exec !== "Não se aplica";
      const blocos = [];
      if (temExec) {
        const linhas = [];
        if (lvMoney("custoExecucaoRegional")) linhas.push(custoLvLinha("Custo da Regional", lvMoney("custoExecucaoRegional")));
        if (lvMoney("custoExecucaoTerceirizada")) linhas.push(custoLvLinha("Custo da Terceirizada", lvMoney("custoExecucaoTerceirizada")));
        if (linhas.length === 2) {
          const soma = [custoLvNum(lvVal("custoExecucaoRegional")), custoLvNum(lvVal("custoExecucaoTerceirizada"))].reduce((a, n) => a + (n || 0), 0);
          const brl = formatBr().formatMoneyBr?.(soma);
          if (brl) linhas.push(`<div class="custo-lv__destaque"><span>Total da execução</span><strong>R$ ${escapeHtml(brl)}</strong></div>`);
        }
        if (!linhas.length) linhas.push(`<p class="seg-lv__vazio">Custo não informado</p>`);
        blocos.push(custoLvBloco("🛠", "Execução", `<p class="custo-lv__big">${escapeHtml(exec)}</p>`, linhas.join("")));
      }
      if (lvVal("demTemLevantamento") !== "sim") {
        return (
          `<p class="seg-lv__vazio">Sem levantamento de custo (não se aplica).</p>` +
          (blocos.length ? `<div class="custo-lv__blocos">${blocos.join("")}</div>` : "")
        );
      }
      const conta =
        `<div class="custo-lv__conta">` +
        `<div class="custo-lv__termo"><span class="seg-lv__label">Valor do projeto</span><strong>${lvMoney("custoValorProjeto") || "—"}</strong></div>` +
        `<span class="custo-lv__op" aria-hidden="true">+</span>` +
        `<div class="custo-lv__termo"><span class="seg-lv__label">Acréscimo 5%</span><strong>${lvMoney("custoValor5") || "—"}</strong></div>` +
        `<span class="custo-lv__op" aria-hidden="true">=</span>` +
        `<div class="custo-lv__termo is-final"><span class="seg-lv__label">Valor final</span><strong>${lvMoney("custoValorFinal") || "—"}</strong></div>` +
        `</div>`;
      if (lvVal("demTemPortas") === "sim") {
        const num = (id) => custoLvNum(lvVal(id));
        const casas = num("custoQtdCasas");
        const existentes = num("custoQtdPortasAtual") ?? 0;
        const novas = num("custoQtdNovasPortas") ?? 0;
        const linhas = [
          custoLvLinha("Portas existentes", escapeHtml(lvVal("custoQtdPortasAtual") || "0")),
          custoLvLinha("Total após o projeto", `<strong>${escapeHtml(formatIntBr(existentes + novas))}</strong>`),
          custoLvLinha("Casas", casas ? escapeHtml(lvVal("custoQtdCasas")) : lvVazio("Não informado")),
        ];
        let penetracao = "";
        const atual = custoLvNum(lvVal("custoPenetracaoAtual"));
        const nova = custoLvNum(lvVal("custoNovaPenetracao"));
        if (casas && nova != null) {
          const pa = Math.max(0, Math.min(100, atual ?? 0));
          const pn = Math.max(pa, Math.min(100, nova));
          penetracao =
            `<div class="custo-lv__pen">` +
            `<div class="custo-lv__pen-head"><span>Penetração</span><span>${escapeHtml(lvVal("custoPenetracaoAtual") || "0%")} → <strong>${escapeHtml(
              lvVal("custoNovaPenetracao"),
            )}</strong></span></div>` +
            `<div class="custo-lv__pen-bar" role="img" aria-label="Penetração de ${escapeHtml(lvVal("custoPenetracaoAtual") || "0%")} para ${escapeHtml(
              lvVal("custoNovaPenetracao"),
            )}"><span class="custo-lv__pen-nova" style="width:${pn}%"></span><span class="custo-lv__pen-atual" style="width:${pa}%"></span></div>` +
            `</div>`;
        }
        const vpp = lvMoney("custoValorPorPortaNova");
        blocos.unshift(
          custoLvBloco(
            "🚪",
            "Portas",
            `<p class="custo-lv__big">+ ${escapeHtml(formatIntBr(novas))} <small>${novas === 1 ? "porta nova" : "portas novas"}</small></p>`,
            linhas.join("") +
              penetracao +
              (vpp ? `<div class="custo-lv__destaque"><span>Valor por porta nova</span><strong>${vpp}</strong></div>` : ""),
          ),
        );
      }
      if (lvVal("demTemLancamento") === "sim") {
        const cabos = (editingLancamentoCabos || [])
          .map((c) => ({ tipo: c.tipo || "Cabo", m: Number(c.metragem) }))
          .filter((c) => Number.isFinite(c.m) && c.m > 0);
        const total = cabos.reduce((acc, c) => acc + c.m, 0);
        let detalhe = `<p class="seg-lv__vazio">Nenhum cabo informado</p>`;
        if (cabos.length && total > 0) {
          const cor = (i) => CUSTO_LV_CORES[i % CUSTO_LV_CORES.length];
          detalhe =
            (cabos.length > 1
              ? `<div class="custo-lv__stack" aria-hidden="true">${cabos
                  .map((c, i) => `<span style="flex:${c.m} 1 0;background:${cor(i)}"></span>`)
                  .join("")}</div>`
              : "") +
            cabos
              .map((c, i) =>
                custoLvLinha(
                  `<i class="custo-lv__dot" style="background:${cor(i)}"></i>${escapeHtml(c.tipo)}`,
                  `${escapeHtml(formatIntBr(c.m))} m` +
                    (cabos.length > 1 ? ` <span class="seg-lv__sub">${Math.round((c.m / total) * 100)}%</span>` : ""),
                  true,
                ),
              )
              .join("");
        }
        const totalTxt = lvVal("custoTotalMetragem") || formatIntBr(total);
        const idx = blocos.length && blocos[blocos.length - 1].includes('data-bloco="Execução"') ? blocos.length - 1 : blocos.length;
        blocos.splice(idx, 0, custoLvBloco("🧵", "Lançamento", `<p class="custo-lv__big">${escapeHtml(totalTxt)} <small>m de cabo</small></p>`, detalhe));
      }
      if (editingPdfLevantamento?.name) {
        const nome = escapeHtml(editingPdfLevantamento.name);
        blocos.push(
          custoLvBloco(
            "📄",
            "PDF do levantamento",
            editingPdfLevantamento.dataUrl
              ? `<a href="${editingPdfLevantamento.dataUrl}" download="${nome}" target="_blank" rel="noopener" class="custo-lv__pdf" data-lv-acao="1">⬇ ${nome}</a>`
              : `<p class="custo-lv__pdf">${nome}</p>`,
            "",
          ),
        );
      }
      return `<div class="custo-lv">${conta}${blocos.length ? `<div class="custo-lv__blocos">${blocos.join("")}</div>` : ""}</div>`;
    }
    case "referencias": {
      const link = document.getElementById("demAsanaLink");
      const hint = (document.getElementById("demAsanaHint")?.textContent || "").trim();
      const podeEnviar = !document.getElementById("btnEnviarAsana")?.hidden;
      let asana = "";
      if (link && !link.hidden && link.getAttribute("href")) {
        asana =
          `${escapeHtml(hint || "Tarefa criada")} ` +
          `<a class="seg-lv__link" href="${escapeHtml(link.getAttribute("href"))}" target="_blank" rel="noopener" data-lv-acao="1">Abrir no Asana ↗</a>` +
          (!document.getElementById("btnAnexarAsana")?.hidden
            ? ` <button type="button" class="btn btn--ghost btn--sm" data-lv-asana-anexar="1" data-lv-acao="1">📎 Anexar ao Asana</button>`
            : "") +
          (!document.getElementById("btnNovaOrdemAsana")?.hidden
            ? ` <button type="button" class="btn btn--ghost btn--sm" data-lv-asana-nova="1" data-lv-acao="1"${
                document.getElementById("btnNovaOrdemAsana").disabled
                  ? ` disabled title="${escapeHtml(document.getElementById("btnNovaOrdemAsana").title)}"`
                  : ""
              }>+ Nova ordem</button>`
            : "") +
          (!document.getElementById("demAsanaAnteriores")?.hidden
            ? `<br><span class="muted small">${document.getElementById("demAsanaAnteriores").innerHTML}</span>`
            : "");
      } else if (podeEnviar) {
        asana = `<button type="button" class="btn btn--primary btn--sm" data-lv-asana="1" data-lv-acao="1">Enviar à Operação</button>`;
      } else {
        asana = hint ? escapeHtml(hint) : lvVazio("Não enviada");
      }
      return (
        `<div class="seg-lv-grid">` +
        lvPar("Chamado Ocomon", lvVal("demChamadoOcomon") ? `<span class="seg-lv__codigo">${escapeHtml(lvVal("demChamadoOcomon"))}</span>` : lvVazio()) +
        lvPar("O.S. Aniel", lvVal("demOsAniel") ? `<span class="seg-lv__codigo">${escapeHtml(lvVal("demOsAniel"))}</span>` : lvVazio()) +
        lvPar("Asana (Operação)", asana) +
        `</div>`
      );
    }
    default:
      return "";
  }
}

/** Campos obrigatórios vazios fazem a seção abrir direto em edição. */
function demSecaoTemPendencia(key) {
  if (key === "chegada") return !lvVal("demTitulo") || !lvVal("demDescricao") || !lvVal("demDataChegada");
  if (key === "atribuicao") return !lvVal("demCidade");
  if (key === "atraso") return !readMotivosAtrasoFromDom({ forSave: true }).length;
  return false;
}

function renderDemSecaoLeitura(sec) {
  const fs = demSecaoEl(sec);
  const box = fs?.querySelector(":scope > .seg-leitura");
  if (!box) return;
  const podeEditar = !isReadOnlyUser();
  box.innerHTML =
    (podeEditar ? `<button type="button" class="seg-leitura__editar" data-ui-nav="1" data-lv-acao="1">✎ Editar</button>` : "") +
    demSecaoLeituraHtml(sec.key);
}

function setDemSecaoModo(sec, modo) {
  const fs = demSecaoEl(sec);
  if (!fs) return;
  const leitura = modo === "leitura";
  if (leitura) renderDemSecaoLeitura(sec);
  fs.classList.toggle("is-leitura", leitura);
  fs.classList.toggle("is-editando", !leitura && fs.dataset.lvExistente === "1");
}

/** Ao abrir o modal: projeto existente começa em leitura; novo (ou com pendência) em edição. */
function iniciarModosSecoesDemanda(existente) {
  for (const sec of DEM_SECOES) {
    if (!DEM_SECOES_LEITURA.includes(sec.key)) continue;
    const fs = demSecaoEl(sec);
    if (!fs) continue;
    fs.dataset.lvExistente = existente ? "1" : "";
    const leitura = existente && (isReadOnlyUser() || !demSecaoTemPendencia(sec.key));
    setDemSecaoModo(sec, leitura ? "leitura" : "edicao");
  }
}

function secoesParaEdicao() {
  for (const sec of DEM_SECOES) {
    if (DEM_SECOES_LEITURA.includes(sec.key) && demSecaoEl(sec)?.classList.contains("is-leitura")) {
      setDemSecaoModo(sec, "edicao");
    }
  }
}

function initDemSecoesLeitura() {
  for (const sec of DEM_SECOES) {
    if (!DEM_SECOES_LEITURA.includes(sec.key)) continue;
    const fs = demSecaoEl(sec);
    if (!fs || fs.querySelector(":scope > .seg-leitura")) continue;
    const box = document.createElement("div");
    box.className = "seg-leitura";
    box.title = "Clique para editar";
    fs.querySelector(":scope > legend")?.after(box);
    box.addEventListener("click", (e) => {
      const alvo = e.target instanceof Element ? e.target : null;
      if (alvo?.closest("[data-lv-asana-anexar]")) {
        e.preventDefault();
        document.getElementById("btnAnexarAsana")?.click();
        return;
      }
      if (alvo?.closest("[data-lv-asana-nova]")) {
        e.preventDefault();
        document.getElementById("btnNovaOrdemAsana")?.click();
        return;
      }
      if (alvo?.closest("[data-lv-asana]")) {
        e.preventDefault();
        document.getElementById("btnEnviarAsana")?.click();
        return;
      }
      if (alvo?.closest("a[data-lv-acao]")) return;
      if (isReadOnlyUser()) return;
      setDemSecaoModo(sec, "edicao");
      fs.querySelector("input:not([type=hidden]):not([type=file]), select, textarea")?.focus({ preventScroll: true });
    });
    // Rodapé da edição: volta para a leitura.
    const foot = document.createElement("div");
    foot.className = "seg-edit-foot";
    foot.innerHTML = `<button type="button" class="btn btn--ghost btn--sm seg-edit-foot__ok" data-ui-nav="1">✓ Concluir edição</button>`;
    foot.querySelector("button").addEventListener("click", () => {
      setDemSecaoModo(sec, "leitura");
      fs.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    fs.appendChild(foot);
  }
}

/** Resumo curto de cada seção: aparece no título quando ela está recolhida. */
function demSecaoResumo(key) {
  const val = (id) => (document.getElementById(id)?.value || "").trim();
  const optTxt = (id) => {
    const sel = document.getElementById(id);
    return sel && sel.value ? (sel.selectedOptions[0]?.textContent || "").trim() : "";
  };
  switch (key) {
    case "chegada": {
      const falta = !val("demTitulo") || !val("demDescricao") || !val("demDataChegada");
      if (falta) return { txt: "Faltam dados", tom: "alerta" };
      const etapa = labelStatus(val("demStatus"), editingLinhaEsteira);
      const prazo = cardPrazoInfo(demandaPreviewFromForm());
      return {
        txt: [val("demTipo"), etapa, prazo ? prazo.texto : `chegou ${formatDataCurta(val("demDataChegada")).slice(0, 5)}`].filter(Boolean).join(" · "),
        tom: prazo && prazo.tom !== "ok" ? prazo.tom : "ok",
      };
    }
    case "atribuicao": {
      const resp = normalizeResponsavel(val("demResponsavel"));
      const cidade = optTxt("demCidade");
      if (!resp) return { txt: cidade ? `Sem projetista · ${cidade}` : "Sem projetista", tom: "alerta" };
      const extras = editingProjetistasExtra.length ? ` +${editingProjetistasExtra.length}` : "";
      return { txt: `${resp}${extras}${cidade ? ` · ${cidade}` : ""}`, tom: "ok" };
    }
    case "esteira": {
      const prazo = cardPrazoInfo(demandaPreviewFromForm());
      if (!prazo) return { txt: "Sem prazo", tom: "neutro" };
      return { txt: prazo.texto, tom: prazo.tom };
    }
    case "atraso": {
      const n = readMotivosAtrasoFromDom({ forSave: true }).length;
      return n ? { txt: `${n} motivo(s)`, tom: "atraso" } : { txt: "Informe o motivo", tom: "atraso" };
    }
    case "custo": {
      if (val("demTemLevantamento") !== "sim") return { txt: "Não se aplica", tom: "neutro" };
      const final = val("custoValorFinal");
      return final ? { txt: `R$ ${final}`, tom: "ok" } : { txt: "Sem valor", tom: "alerta" };
    }
    case "referencias": {
      const refs = [];
      if (val("demChamadoOcomon")) refs.push(`Ocomon ${val("demChamadoOcomon")}`);
      if (val("demOsAniel")) refs.push(`O.S. ${val("demOsAniel")}`);
      if (!document.getElementById("demAsanaLink")?.hidden) refs.push("Asana");
      return refs.length ? { txt: refs.join(" · "), tom: "ok" } : { txt: "Nenhuma", tom: "neutro" };
    }
    case "checklist": {
      const n = editingChecklist.length;
      if (!n) return { txt: "Sem atividades", tom: "neutro" };
      const feitas = editingChecklist.filter((it) => it.done).length;
      return { txt: `${feitas}/${n}`, tom: feitas === n ? "ok" : "alerta" };
    }
    case "timeline": {
      const n = document.querySelectorAll("#demTimelineTable tbody tr").length;
      return n ? { txt: `${n} fase(s)`, tom: "neutro" } : { txt: "Sem histórico", tom: "neutro" };
    }
    default:
      return { txt: "", tom: "neutro" };
  }
}

function syncDemSecoesResumo() {
  for (const sec of DEM_SECOES) {
    const fs = demSecaoEl(sec);
    const alvo = fs?.querySelector(".seg-toggle__resumo");
    if (!alvo) continue;
    const r = demSecaoResumo(sec.key);
    alvo.textContent = r.txt;
    alvo.className = `seg-toggle__resumo dem-tom--${r.tom}`;
  }
}

function syncDemNavegacao() {
  demNavSyncRaf = 0;
  syncDemSecoesResumo();
  // Seções em modo leitura acompanham mudanças feitas em outras partes (ex.: etapa movida pelo checklist).
  for (const sec of DEM_SECOES) {
    if (DEM_SECOES_LEITURA.includes(sec.key) && demSecaoEl(sec)?.classList.contains("is-leitura")) renderDemSecaoLeitura(sec);
  }
  syncDemandaSujaUi();
}

function agendarSyncDemNavegacao() {
  if (demNavSyncRaf) return;
  demNavSyncRaf = requestAnimationFrame(syncDemNavegacao);
}

function initDemNavegacao() {
  const form = document.getElementById("formDemanda");
  if (!form || form.dataset.navInited) return;
  form.dataset.navInited = "1";
  const colapsadas = lerSecoesColapsadas();
  for (const sec of DEM_SECOES) {
    const fs = demSecaoEl(sec);
    const legend = fs?.querySelector(":scope > legend");
    if (!legend) continue;
    const titulo = legend.textContent.trim();
    legend.innerHTML =
      `<button type="button" class="seg-toggle" data-ui-nav="1" aria-expanded="true">` +
      `<span class="seg-toggle__ico">${demSvgIcone(sec.icone)}</span>` +
      `<span class="seg-toggle__titulo">${escapeHtml(titulo)}</span>` +
      `<span class="seg-toggle__resumo"></span>` +
      `<span class="seg-toggle__chev" aria-hidden="true">▾</span>` +
      `</button>`;
    legend.querySelector(".seg-toggle").addEventListener("click", () => {
      setSecaoColapsada(sec, !fs.classList.contains("is-collapsed"));
    });
    if (colapsadas.has(sec.key)) setSecaoColapsada(sec, true, { persistir: false });
  }
  // Qualquer edição (inclusive listas re-renderizadas por botões) atualiza os resumos.
  form.addEventListener("input", agendarSyncDemNavegacao);
  form.addEventListener("change", agendarSyncDemNavegacao);
  form.addEventListener("click", agendarSyncDemNavegacao);
  // Validação do Salvar foca campos: abre tudo antes para o foco achar o campo.
  document.getElementById("btnSalvarDemanda")?.parentElement?.addEventListener(
    "click",
    (e) => {
      if (e.target instanceof Element && e.target.closest("#btnSalvarDemanda")) {
        expandirTodasSecoes();
        secoesParaEdicao();
      }
    },
    true,
  );
  initDemSecoesLeitura();
}

function openDemandaModal(id) {
  comentarioEditandoId = "";
  setTimeout(() => syncDemandaArquivadoUi(id), 0);
  if (!id && isReadOnlyUser()) {
    toast("Seu perfil (Visibilidade) e somente leitura");
    return;
  }
  if (editingDemandaOpenId && editingDemandaOpenId !== id) {
    releaseDemandaEditing(editingDemandaOpenId);
  }
  stopPresenceHeartbeat();

  const d = id ? state.demandas.find((x) => x.id === id) : null;
  const dm = d ? migrateDemanda(d) : null;
  asanaUiOverride = null;
  editingDemandaOpenId = d?.id || null;
  editingDemandaBaselineUpdatedAt = d?.updatedAt || "";
  hideDemandaModalAlerts();
  editingLinhaEsteira = dm ? dm.linhaEsteira : activeEsteiraCanal;
  fillDemResponsavelSelect(editingLinhaEsteira);
  fillStatusSelect(editingLinhaEsteira);
  const cfg = getEsteiraConfig(editingLinhaEsteira);
  document.getElementById("modalDemandaTitle").textContent = d
    ? "Editar demanda"
    : editingLinhaEsteira === LINHA_ESTEIRA_B2B
      ? "Registrar demanda B2B"
      : "Registrar chegada da demanda";
  document.getElementById("demId").value = d?.id || "";
  const btnExcluirDem = document.getElementById("btnExcluirDemanda");
  if (btnExcluirDem) btnExcluirDem.textContent = d?.id ? "🗑 Excluir" : "Descartar rascunho";
  document.getElementById("demTitulo").value = d?.titulo || "";
  setDemCidadeUi(d?.cidade || "");
  editingCidadesExtra = normalizeCidadesExtra(dm?.cidadesExtra || d?.cidadesExtra, d?.cidade || "");
  const extraReg = document.getElementById("demExtraRegional");
  if (extraReg) extraReg.value = "";
  renderCidadesExtraList();
  document.getElementById("demDataChegada").value = d?.dataChegada || todayISODate();
  document.getElementById("demDataFimPrevista").value = d?.dataFimPrevista || "";
  document.getElementById("demDataFimAtualizada").value = d?.dataFimAtualizada || "";
  document.getElementById("demDataTermino").value = d ? d.dataTermino || demandaDataTermino(d) || "" : "";
  document.getElementById("demSolicitante").value = d?.solicitante || "";
  const selSetorSol = document.getElementById("demSetorSolicitanteB2b");
  if (selSetorSol) selSetorSol.value = dm?.setorSolicitanteB2b || SETORES_SOLICITANTE_B2B[0];
  const selSolB2b = document.getElementById("demSolicitanteB2b");
  if (selSolB2b) {
    const sol = dm?.solicitante || "";
    selSolB2b.value = SOLICITANTES_B2B_COMERCIAL.includes(sol) ? sol : "";
  }
  document.getElementById("demResponsavel").value = normalizeResponsavel(d?.responsavel);
  editingProjetistasExtra = normalizeProjetistasExtra(dm?.projetistasExtra || d?.projetistasExtra, d?.responsavel || "");
  renderProjetistasExtraList();
  syncDemTipoSelect(d?.tipo || (editingLinhaEsteira === LINHA_ESTEIRA_B2B ? "B2B" : "B2C"));
  const selProduto = document.getElementById("demProdutoB2b");
  if (selProduto) selProduto.value = dm?.produtoB2b || "";
  const selSegmento = document.getElementById("demSegmentoB2c");
  if (selSegmento) selSegmento.value = dm?.segmentoB2c || "";
  syncDemCamposPorTipo();
  document.getElementById("demStatus").value = d?.status || cfg.inboxStatus;
  renderMotivosAtrasoLista(dm?.motivosAtrasoItens || normalizeMotivosAtrasoItens(d));
  document.getElementById("demDescricao").value = d?.descricao || "";
  const elChamado = document.getElementById("demChamadoOcomon");
  if (elChamado) elChamado.value = dm?.chamadoOcomon || "";
  const elOsAniel = document.getElementById("demOsAniel");
  if (elOsAniel) elOsAniel.value = dm?.osAniel || "";
  syncDemAsanaUi();
  editingCustoBaseline = JSON.parse(JSON.stringify(normalizeCusto(d?.custo)));
  pdfCustoAppliedInSession = false;
  applyCustoToForm(editingCustoBaseline);
  editingImages = JSON.parse(JSON.stringify(d?.imagens || []));
  editingPdfLevantamento = d?.pdfLevantamento
    ? JSON.parse(JSON.stringify(normalizePdfLevantamento(d.pdfLevantamento)))
    : null;
  lastPdfParseResult = null;
  editingComentarios = JSON.parse(JSON.stringify(normalizeComentarios(dm?.comentarios || d?.comentarios || [])));
  comentariosApagadosNoModal.clear();
  editingChecklist = JSON.parse(JSON.stringify(normalizeChecklist(dm?.checklist || d?.checklist || [])));
  editingChecklistItemId = "";
  const expandBtn = document.getElementById("btnChecklistExpand");
  const details = document.getElementById("demChecklistDetails");
  checklistFiltro = "todas";
  checklistRecemConcluidaId = "";
  if (expandBtn) {
    expandBtn.setAttribute("aria-expanded", "false");
    expandBtn.classList.remove("is-open");
    setChecklistToggleLabel(expandBtn, "Nova atividade");
  }
  if (details) details.hidden = true;
  setChecklistGanttOpen(false);
  // Datas da nova atividade começam vazias (opcionais) e o status em "A fazer".
  const dateStartEl = document.getElementById("demChecklistDateInicio");
  if (dateStartEl) dateStartEl.value = "";
  const dateEl = document.getElementById("demChecklistDate");
  if (dateEl) dateEl.value = "";
  const statusNovoEl = document.getElementById("demChecklistStatus");
  if (statusNovoEl) statusNovoEl.value = "afazer";
  const etapaEl = document.getElementById("demChecklistEtapa");
  const descEl = document.getElementById("demChecklistDesc");
  const whoEl = document.getElementById("demChecklistWho");
  if (etapaEl) etapaEl.value = "";
  if (descEl) descEl.value = "";
  if (whoEl) whoEl.value = "";
  renderChecklistEditor();
  const comentarioNovo = document.getElementById("demComentarioNovo");
  if (comentarioNovo) comentarioNovo.value = "";
  renderComentariosList();
  syncComentarioCompose();
  renderPdfLevantamentoPreview();
  renderTimeline(d);
  bindMotivosAtrasoUi();
  syncDemConclusaoFields();
  syncMotivosAtrasoField();
  syncDiasAbertoResumo();

  if (d?.id && !isReadOnlyUser()) {
    const other = normalizeEditingBy(d.editingBy);
    const me = getCurrentUserEmail();
    if (other && other.email !== me) {
      toast(`${other.autor} também está com este projeto aberto`);
    }
    const presence = buildEditingPresence();
    if (presence) {
      setDemandaEditingBy(d.id, presence);
      startPresenceHeartbeat(d.id);
    } else {
      toast("Faça login para marcar que você está editando (presença na esteira).");
    }
  }

  setDemandaFormReadOnly(isReadOnlyUser());
  refreshChecklistMoveButtons();
  refreshTimelineMoveButtons();
  refreshTimelineDeleteButtons();
  renderCidadesExtraList();
  renderProjetistasExtraList();
  syncDemAsanaUi();
  const scrollSnap = snapshotPageScroll();
  setDemandaModalScrollLock(true);
  syncDemNavegacao();
  iniciarModosSecoesDemanda(Boolean(d?.id));
  modalDemanda.showModal();
  marcarDemandaLimpa();
  document.getElementById("demFormCol")?.scrollTo({ top: 0 });
  restorePageScroll(scrollSnap);
  requestAnimationFrame(() => syncDemNavegacao());
  requestAnimationFrame(() => syncDemandaModalAlerts());
}

function readTimelineHistoricoFromDom() {
  const segments = [];
  document.querySelectorAll("#demTimelineTable tbody tr").forEach((tr) => {
    const status = tr.dataset.status;
    if (!status) return;
    segments.push({
      status,
      inicio: datetimeLocalToIso(tr.querySelector(".timeline-inicio")?.value) || "",
      fim: datetimeLocalToIso(tr.querySelector(".timeline-fim")?.value || "") || "",
      observacao: tr.querySelector(".timeline-obs")?.value.trim() || "",
    });
  });
  return normalizeHistoricoStatus(segments);
}

function syncDemStatusFromTimeline() {
  renderTimelineResumo();
  const rows = document.querySelectorAll("#demTimelineTable tbody tr");
  if (!rows.length) return;
  const last = rows[rows.length - 1];
  const st = last.dataset.status;
  const sel = document.getElementById("demStatus");
  if (st && sel) {
    sel.value = st;
    syncDemConclusaoFields();
    syncMotivosAtrasoField();
    syncDiasAbertoResumo();
  }
}

function refreshTimelineDeleteButtons() {
  const rows = document.querySelectorAll("#demTimelineTable tbody tr");
  const onlyOne = rows.length <= 1;
  rows.forEach((tr) => {
    const btn = tr.querySelector(".timeline-remove");
    if (btn) {
      btn.disabled = onlyOne;
      if (btn.disabled) btn.dataset.keepDisabled = "1";
      else delete btn.dataset.keepDisabled;
      btn.title = onlyOne ? "Deve restar pelo menos uma fase" : "Excluir esta fase do histórico";
    }
  });
}

function refreshTimelineMoveButtons() {
  const readOnly = isReadOnlyUser();
  const rows = Array.from(document.querySelectorAll("#demTimelineTable tbody tr"));
  rows.forEach((tr, idx) => {
    const btnUp = tr.querySelector(".timeline-move-up");
    const btnDown = tr.querySelector(".timeline-move-down");
    if (btnUp) {
      btnUp.disabled = readOnly || idx === 0;
      if (btnUp.disabled) btnUp.dataset.keepDisabled = "1";
      else delete btnUp.dataset.keepDisabled;
      btnUp.title = idx === 0 ? "Já é a fase mais antiga" : "Mover para antes (desce na lista)";
    }
    if (btnDown) {
      btnDown.disabled = readOnly || idx === rows.length - 1;
      if (btnDown.disabled) btnDown.dataset.keepDisabled = "1";
      else delete btnDown.dataset.keepDisabled;
      btnDown.title = idx === rows.length - 1 ? "Já é a fase mais recente" : "Mover para depois (sobe na lista)";
    }
  });
}

function swapTimelineRowUp(tr) {
  if (isReadOnlyUser() || !requireWriteAccess()) return;
  const tb = tr?.parentElement;
  if (!tb) return;
  const prev = tr.previousElementSibling;
  if (!prev) return;
  tb.insertBefore(tr, prev);
  syncDemStatusFromTimeline();
  refreshTimelineDeleteButtons();
  refreshTimelineMoveButtons();
}

function swapTimelineRowDown(tr) {
  if (isReadOnlyUser() || !requireWriteAccess()) return;
  const tb = tr?.parentElement;
  if (!tb) return;
  const next = tr.nextElementSibling;
  if (!next) return;
  tb.insertBefore(next, tr);
  syncDemStatusFromTimeline();
  refreshTimelineDeleteButtons();
  refreshTimelineMoveButtons();
}

function timelineSetorHtml(status, linha = editingLinhaEsteira) {
  const setor = setorForStatusDemanda(status, linha);
  if (setor) return setorBadgeHtml(setor);
  if (isTempoStatusExcludedDemanda(status, linha)) return '<span class="muted">—</span>';
  return '<span class="dash-setor dash-setor--outros">Outros</span>';
}

function confirmExcluirFaseTimeline(seg) {
  const lab = labelStatus(seg.status, editingLinhaEsteira);
  const setor = setorForStatusDemanda(seg.status, editingLinhaEsteira) || "—";
  const inicio = seg.inicio ? formatComentarioData(seg.inicio) : "—";
  const fim = seg.fim ? formatComentarioData(seg.fim) : "em andamento";
  return confirmDialog({
    title: "Excluir fase do histórico?",
    message: `A fase «${lab}» (${setor}) será removida do histórico desta demanda.`,
    details: [
      { label: "Início", value: inicio },
      { label: "Fim", value: fim },
    ],
    hint: "A alteração só será gravada ao salvar a demanda.",
    confirmText: "Excluir fase",
    variant: "danger",
  });
}

/** "2026-08-11T09:44" → "11/08/26 09:44" (exibição das datas no modo leitura). */
function formatTimelineDataCurta(val) {
  const m = String(val || "").match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1].slice(2)}${m[4] ? ` ${m[4]}:${m[5]}` : ""}`;
}

/** Duração curta para o resumo: "13d 17h", "5h 20m", "12m". */
function formatDurCurta(ms) {
  const min = Math.floor((ms || 0) / 60000);
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  if (d) return h ? `${d}d ${h}h` : `${d}d`;
  if (h) return m ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

/** Atualiza textos de leitura da linha (datas, atualização) e o aviso de fim antes do início. */
function syncTimelineRowView(tr) {
  const inEl = tr.querySelector(".timeline-inicio");
  const fimEl = tr.querySelector(".timeline-fim");
  const obsEl = tr.querySelector(".timeline-obs");
  const ini = tr.querySelector(".tl-data--ini");
  const fim = tr.querySelector(".tl-data--fim");
  const obs = tr.querySelector(".tl-obs-txt");
  if (ini) {
    ini.textContent = formatTimelineDiaMes(inEl?.value) || "—";
    ini.title = formatTimelineDataCurta(inEl?.value) || "";
  }
  if (fim) {
    const txt = formatTimelineDiaMes(fimEl?.value);
    const mesmoDia = txt && txt === formatTimelineDiaMes(inEl?.value);
    fim.textContent = txt || "em andamento";
    fim.title = formatTimelineDataCurta(fimEl?.value) || "Fase em andamento";
    fim.classList.toggle("is-aberta", !txt);
    tr.classList.toggle("is-mesmo-dia", Boolean(mesmoDia));
  }
  if (obs) {
    const t = (obsEl?.value || "").trim();
    obs.textContent = t;
    tr.classList.toggle("tem-nota", Boolean(t));
  }
  const a = Date.parse(datetimeLocalToIso(inEl?.value) || "");
  const b = Date.parse(datetimeLocalToIso(fimEl?.value || "") || "");
  const erro = Number.isFinite(a) && Number.isFinite(b) && b < a;
  tr.classList.toggle("is-erro", erro);
  const aviso = tr.querySelector(".tl-aviso");
  if (aviso) aviso.hidden = !erro;
}

/** Resumo do tempo na esteira: indicadores, barra interativa por fase, eixo de datas e tempo por setor. */
let timelineSetorFiltro = "";
/** Fases do último resumo desenhado (para o balão da barra). */
let timelineSegsResumo = [];

function mostrarBalaoTimeline(fatia) {
  const tip = document.querySelector("#demTimelineResumo .tl-tip");
  const x = timelineSegsResumo[Number(fatia?.dataset.tlIdx)];
  if (!tip || !x) return;
  const nome = labelStatus(x.status, x.linha);
  const pct = x.total ? (x.ms / x.total) * 100 : 0;
  const passou = x.metaMs && x.ms > x.metaMs;
  tip.innerHTML =
    `<div class="tl-tip__titulo"><b>${escapeHtml(nome)}</b>${x.setor ? ` <span>· ${escapeHtml(x.setor)}</span>` : ""}</div>` +
    `<dl><dt>Início</dt><dd>${escapeHtml(formatTimelineDataCurta(isoToDatetimeLocal(x.inicio)) || "—")}</dd>` +
    `<dt>Fim</dt><dd>${x.fim ? escapeHtml(formatTimelineDataCurta(isoToDatetimeLocal(x.fim))) : "em andamento"}</dd>` +
    `<dt>Duração</dt><dd><b>${escapeHtml(formatDurCurta(x.ms))}</b> · ${pct.toFixed(0)}% do total</dd>` +
    (x.metaMs
      ? `<dt>Meta</dt><dd class="${passou ? "is-acima" : ""}">${Math.round(x.metaMs / 86400000)}d${
          passou ? ` — passou ${escapeHtml(formatDurCurta(x.ms - x.metaMs))}` : " — dentro"
        }</dd>`
      : "") +
    `</dl>`;
  tip.hidden = false;
  const wrap = tip.parentElement.getBoundingClientRect();
  const r = fatia.getBoundingClientRect();
  const larg = tip.offsetWidth;
  const centro = r.left - wrap.left + r.width / 2;
  tip.style.left = `${Math.max(0, Math.min(wrap.width - larg, centro - larg / 2))}px`;
  tip.style.setProperty("--seta", `${Math.max(12, Math.min(larg - 12, centro - parseFloat(tip.style.left)))}px`);
}

function timelineCorSeg(setor, cfg) {
  return setor ? setorColorFor(setor, cfg) : "#94a3b8";
}

function renderTimelineResumo() {
  const host = document.getElementById("demTimelineResumo");
  const table = document.getElementById("demTimelineTable");
  const rows = [...document.querySelectorAll("#demTimelineTable tbody tr")];
  if (!host) return;
  if (!rows.length) {
    host.hidden = true;
    return;
  }
  host.hidden = false;
  const linha = editingLinhaEsteira;
  const cfg = normalizeLinhaEsteira(linha) === LINHA_ESTEIRA_B2B ? DASH_TEMPO_CFG_B2B : DASH_TEMPO_CFG_OP;
  const segs = rows.map((tr, i) => {
    const inicio = datetimeLocalToIso(tr.querySelector(".timeline-inicio")?.value) || "";
    const fim = datetimeLocalToIso(tr.querySelector(".timeline-fim")?.value || "") || "";
    const status = tr.dataset.status;
    const setor = setorForStatusDemanda(status, linha);
    tr.dataset.tlIdx = String(i);
    return { tr, i, status, setor, inicio, fim, ms: timelineSegmentMs({ inicio, fim }) };
  });
  const total = segs.reduce((acc, x) => acc + x.ms, 0);
  const max = Math.max(1, ...segs.map((x) => x.ms));
  const atual = segs[segs.length - 1];
  const atualAberta = atual && !atual.fim;

  // Por linha: barra de duração, "Nª passagem", intervalo/sobreposição com a fase anterior.
  const passagens = new Map();
  segs.forEach((x, i) => {
    const n = (passagens.get(x.status) || 0) + 1;
    passagens.set(x.status, n);
    // Régua da duração: a escala é a maior entre a duração e a meta; o que passa da meta fica em laranja.
    const meta = metaDiasEtapa(x.status, linha);
    const metaMs = meta != null ? meta * 86400000 : 0;
    x.metaMs = metaMs;
    const escala = metaMs ? Math.max(x.ms, metaMs) : max;
    const pctOk = escala ? (Math.min(x.ms, metaMs || x.ms) / escala) * 100 : 0;
    const pctAcima = metaMs && x.ms > metaMs ? ((x.ms - metaMs) / escala) * 100 : 0;
    const regua = x.tr.querySelector(".tl-regua");
    if (regua) {
      regua.querySelector(".tl-regua__ok").style.width = `${Math.max(x.ms ? 1.5 : 0, pctOk)}%`;
      const acima = regua.querySelector(".tl-regua__acima");
      acima.style.left = `${pctOk}%`;
      acima.style.width = `${pctAcima}%`;
      const marca = regua.querySelector(".tl-regua__meta");
      marca.hidden = !metaMs;
      if (metaMs) {
        marca.style.left = `${(metaMs / escala) * 100}%`;
        marca.dataset.l = `meta ${meta}d`;
      }
    }
    const instantanea = x.ms < 60000 && x.fim;
    const dur = x.tr.querySelector(".timeline-dur");
    if (dur) {
      dur.textContent = instantanea ? "instantânea" : formatDurCurta(x.ms);
      dur.title = instantanea ? "" : formatDur(x.ms);
      dur.classList.toggle("is-instantanea", Boolean(instantanea));
    }
    x.tr.classList.toggle("is-instantanea", Boolean(instantanea));
    const metaTxt = x.tr.querySelector(".tl-meta-txt");
    if (metaTxt) {
      const passou = metaMs && x.ms > metaMs;
      metaTxt.textContent = instantanea ? "" : !metaMs ? "sem meta" : passou ? `+${formatDurCurta(x.ms - metaMs)} acima da meta` : "dentro da meta";
      metaTxt.classList.toggle("is-acima", Boolean(passou));
    }
    x.tr.classList.toggle("is-acima-meta", Boolean(metaMs && x.ms > metaMs));
    const extra = x.tr.querySelector(".tl-extra");
    if (extra) {
      const notas = [];
      if (n > 1) notas.push(`<span class="tl-volta" title="Esta é a ${n}ª vez que o projeto passa por esta fase">↺ ${n}ª passagem</span>`);
      const ant = segs[i - 1];
      if (ant?.fim && x.inicio) {
        const gap = Date.parse(x.inicio) - Date.parse(ant.fim);
        if (gap > 3600000) {
          notas.push(`<span class="tl-gap" title="Período entre o fim da fase anterior e o início desta">⋯ intervalo de ${formatDurCurta(gap)}</span>`);
        } else if (gap < -60000) {
          notas.push(`<span class="tl-gap is-sobreposta" title="Começa antes de a fase anterior terminar">⚠ sobrepõe ${formatDurCurta(-gap)}</span>`);
        }
      }
      extra.innerHTML = notas.join("");
      extra.hidden = !notas.length;
    }
  });

  // Tempo por setor (fases sem setor, como Pausado, entram pelo próprio nome).
  const porSetor = new Map();
  segs.forEach((x) => {
    const k = x.setor || labelStatus(x.status, linha);
    const o = porSetor.get(k) || { ms: 0, cor: timelineCorSeg(x.setor, cfg) };
    o.ms += x.ms;
    porSetor.set(k, o);
  });
  const setoresOrd = [...porSetor.entries()].sort((a, b) => b[1].ms - a[1].ms);
  if (timelineSetorFiltro && !porSetor.has(timelineSetorFiltro)) timelineSetorFiltro = "";

  // Indicadores.
  const pausadoMs = segs.filter((x) => x.status === "pausado").reduce((acc, x) => acc + x.ms, 0);
  const maior = setoresOrd[0];
  const retornos = [...passagens.entries()].filter(([, n]) => n > 1);
  let atualHtml = "";
  if (atual) {
    const meta = atualAberta ? metaDiasEtapa(atual.status, linha) : null;
    const dias = atual.ms / 86400000;
    const estourou = meta != null && dias >= meta;
    atualHtml =
      `<div class="tl-kpi${estourou ? " is-alerta" : ""}"><span class="tl-kpi__label">${atualAberta ? "Fase atual" : "Última fase"}</span>` +
      `<strong>${escapeHtml(labelStatus(atual.status, linha))}</strong>` +
      `<span class="tl-kpi__sub">${
        atualAberta
          ? `há <b class="tl-ao-vivo">${escapeHtml(formatDurCurta(atual.ms))}</b>${meta != null ? ` · meta ${meta}d${estourou ? " — passou" : ""}` : ""}`
          : "encerrada"
      }</span></div>`;
  }
  const kpis =
    `<div class="tl-kpi"><span class="tl-kpi__label">Tempo total</span><strong>${formatDurCurta(total)}</strong>` +
    `<span class="tl-kpi__sub">${
      pausadoMs ? `<span title="Sem o tempo em Pausado">${formatDurCurta(total - pausadoMs)} efetivos</span> · ` : ""
    }${segs.length} ${segs.length === 1 ? "fase" : "fases"}</span></div>` +
    atualHtml +
    (maior && total
      ? `<div class="tl-kpi"><span class="tl-kpi__label">Mais tempo em</span><strong><i class="tl-kpi__cor" style="background:${maior[1].cor}"></i>${escapeHtml(maior[0])}</strong>` +
        `<span class="tl-kpi__sub">${Math.round((maior[1].ms / total) * 100)}% do total · ${formatDurCurta(maior[1].ms)}</span></div>`
      : "") +
    `<div class="tl-kpi${retornos.length ? " is-aviso" : ""}"><span class="tl-kpi__label">Retornos</span><strong>${retornos.length ? retornos.reduce((s, [, n]) => s + n - 1, 0) : "Nenhum"}</strong>` +
    `<span class="tl-kpi__sub">${
      retornos.length
        ? escapeHtml(retornos.map(([st, n]) => `${labelStatus(st, linha)} ${n}×`).join(" · "))
        : "fluxo sem voltas"
    }</span></div>`;

  // Barra interativa: cada fatia é uma fase; passar o mouse destaca a linha, clicar leva até ela.
  const fatias = segs
    .filter((x) => x.ms > 0)
    .map((x) => {
      const pct = total ? (x.ms / total) * 100 : 0;
      const nome = labelStatus(x.status, linha);
      const rotulo = pct >= 11 ? `<span class="tl-fatia__txt">${escapeHtml(nome)} · ${escapeHtml(formatDurCurta(x.ms))}</span>` : "";
      const apagada = timelineSetorFiltro && (x.setor || nome) !== timelineSetorFiltro;
      return (
        `<button type="button" class="tl-fatia${x === atual && atualAberta ? " is-atual" : ""}${apagada ? " is-apagada" : ""}" data-tl-idx="${x.i}" ` +
        `style="flex-grow:${x.ms};background-color:${timelineCorSeg(x.setor, cfg)}" ` +
        `aria-label="${escapeHtml(`${nome} · ${formatDur(x.ms)} · ${pct.toFixed(1)}%`)}">${rotulo}</button>`
      );
    })
    .join("");
  const ini = segs.find((x) => x.inicio)?.inicio || "";
  const fimTotal = atualAberta ? "" : atual?.fim || "";
  const eixo =
    `<div class="tl-eixo"><span>${ini ? escapeHtml(formatTimelineDiaMes(isoToDatetimeLocal(ini))) : ""}</span>` +
    `<span>${atualAberta ? "hoje" : escapeHtml(formatTimelineDiaMes(isoToDatetimeLocal(fimTotal)))}</span></div>`;

  const legenda = setoresOrd
    .map(([setor, o]) => {
      const pct = total ? Math.round((o.ms / total) * 100) : 0;
      const ativo = timelineSetorFiltro === setor;
      return (
        `<button type="button" class="tl-legenda__item${ativo ? " is-ativo" : ""}" data-tl-setor="${escapeHtml(setor)}" aria-pressed="${ativo}" ` +
        `title="${ativo ? "Mostrar todas as fases" : `Destacar as fases de ${escapeHtml(setor)}`}">` +
        `<i style="background:${o.cor}"></i>${escapeHtml(setor)} <b>${formatDurCurta(o.ms)}</b><span class="tl-legenda__pct">${pct}%</span></button>`
      );
    })
    .join("");

  host.innerHTML =
    `<div class="tl-kpis">${kpis}</div>` +
    `<div class="tl-barra-wrap"><div class="tl-barra" role="group" aria-label="Distribuição do tempo por fase">${fatias}</div><div class="tl-tip" hidden></div></div>` +
    eixo +
    `<div class="tl-legenda">${legenda}${
      timelineSetorFiltro ? `<button type="button" class="tl-legenda__limpar" data-tl-setor="">✕ Mostrar todas</button>` : ""
    }</div>`;

  timelineSegsResumo = segs.map((x) => ({ ...x, total, linha }));
  // Destaque das linhas pelo setor escolhido na legenda.
  segs.forEach((x) => {
    const apagada = timelineSetorFiltro && (x.setor || labelStatus(x.status, linha)) !== timelineSetorFiltro;
    x.tr.classList.toggle("is-apagada", Boolean(apagada));
  });
  table?.classList.toggle("is-filtrada", Boolean(timelineSetorFiltro));
}

function destacarFaseTimeline(idx, on) {
  document.querySelectorAll(`#demTimelineTable tbody tr[data-tl-idx="${idx}"]`).forEach((tr) => tr.classList.toggle("is-destaque", on));
  document.querySelectorAll(`#demTimelineResumo .tl-fatia[data-tl-idx="${idx}"]`).forEach((f) => f.classList.toggle("is-destaque", on));
}

function initTimelineResumoInterativo() {
  const host = document.getElementById("demTimelineResumo");
  const tbody = document.querySelector("#demTimelineTable tbody");
  host?.addEventListener("click", (e) => {
    const fatia = e.target.closest(".tl-fatia");
    if (fatia) {
      const tr = document.querySelector(`#demTimelineTable tbody tr[data-tl-idx="${fatia.dataset.tlIdx}"]`);
      if (tr) {
        tr.scrollIntoView({ block: "center", behavior: "smooth" });
        tr.classList.remove("is-piscando");
        void tr.offsetWidth;
        tr.classList.add("is-piscando");
      }
      return;
    }
    const leg = e.target.closest("[data-tl-setor]");
    if (leg) {
      const setor = leg.dataset.tlSetor;
      timelineSetorFiltro = setor && timelineSetorFiltro !== setor ? setor : "";
      renderTimelineResumo();
    }
  });
  host?.addEventListener("mouseover", (e) => {
    const f = e.target.closest(".tl-fatia");
    if (!f) return;
    destacarFaseTimeline(f.dataset.tlIdx, true);
    mostrarBalaoTimeline(f);
  });
  host?.addEventListener("mouseout", (e) => {
    const f = e.target.closest(".tl-fatia");
    if (!f) return;
    destacarFaseTimeline(f.dataset.tlIdx, false);
    const tip = host.querySelector(".tl-tip");
    if (tip && !f.contains(e.relatedTarget)) tip.hidden = true;
  });
  host?.addEventListener("focusin", (e) => {
    const f = e.target.closest(".tl-fatia");
    if (f) mostrarBalaoTimeline(f);
  });
  host?.addEventListener("focusout", () => {
    const tip = host.querySelector(".tl-tip");
    if (tip) tip.hidden = true;
  });
  // Fecha o menu ⋯ das fases ao clicar fora ou com Esc.
  document.addEventListener("click", (e) => {
    if (!e.target.closest?.(".tl-menu")) fecharMenusTimeline();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.querySelector("#demTimelineTable .tl-menu.is-aberto")) {
      e.preventDefault();
      fecharMenusTimeline();
    }
  });
  tbody?.addEventListener("mouseover", (e) => {
    const tr = e.target.closest("tr[data-tl-idx]");
    if (tr) destacarFaseTimeline(tr.dataset.tlIdx, true);
  });
  tbody?.addEventListener("mouseout", (e) => {
    const tr = e.target.closest("tr[data-tl-idx]");
    if (tr && !tr.contains(e.relatedTarget)) destacarFaseTimeline(tr.dataset.tlIdx, false);
  });
  // A fase em andamento segue contando enquanto o projeto está aberto.
  setInterval(() => {
    if (!modalDemanda?.open) return;
    const ultima = document.querySelector("#demTimelineTable tbody tr:last-child");
    if (ultima && !(ultima.querySelector(".timeline-fim")?.value || "")) refreshTimelineRowDur(ultima);
  }, 60000);
}

function refreshTimelineRowDur(tr) {
  const inEl = tr.querySelector(".timeline-inicio");
  const fimEl = tr.querySelector(".timeline-fim");
  const durEl = tr.querySelector(".timeline-dur");
  if (!inEl || !durEl) return;
  const inicio = datetimeLocalToIso(inEl.value) || inEl.value;
  const fim = datetimeLocalToIso(fimEl?.value || "") || "";
  durEl.textContent = formatDurCurta(timelineSegmentMs({ inicio, fim: fim || "" }));
  syncTimelineRowView(tr);
  renderTimelineResumo();
}

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "2026-08-29T10:08" → "29 ago" (com o ano só quando não é o ano atual). */
function formatTimelineDiaMes(val) {
  const m = String(val || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  const ano = Number(m[1]) !== new Date().getFullYear() ? ` ${m[1]}` : "";
  return `${Number(m[3])} ${MESES_CURTOS[Number(m[2]) - 1]}${ano}`;
}

function fecharMenusTimeline(exceto = null) {
  document.querySelectorAll("#demTimelineTable .tl-menu.is-aberto").forEach((menu) => {
    if (menu === exceto) return;
    menu.classList.remove("is-aberto");
    menu.querySelector(".tl-menu__btn")?.setAttribute("aria-expanded", "false");
  });
}

function renderTimeline(d) {
  const tb = document.querySelector("#demTimelineTable tbody");
  if (!tb) return;
  tb.innerHTML = "";
  timelineSetorFiltro = "";
  if (!d) return;
  const dm = migrateDemanda(d);
  const linha = dm.linhaEsteira;
  const hist = dm.historicoStatus || [];
  const statusAtual = dm.status;
  const ro = isReadOnlyUser();
  hist.forEach((seg, idx) => {
    const tr = document.createElement("tr");
    tr.dataset.histIdx = String(idx);
    tr.dataset.status = seg.status;
    const isLast = idx === hist.length - 1;
    const faseAtual = isLast && seg.status === statusAtual;
    if (faseAtual && !seg.fim) tr.classList.add("is-atual");
    const setor = setorForStatusDemanda(seg.status, linha);
    const cfg = normalizeLinhaEsteira(linha) === LINHA_ESTEIRA_B2B ? DASH_TEMPO_CFG_B2B : DASH_TEMPO_CFG_OP;
    tr.style.setProperty("--tl-cor", timelineCorSeg(setor, cfg));
    tr.innerHTML = `
      <td class="tl-c-info">
        <div class="tl-fase"><strong>${escapeHtml(labelStatus(seg.status, linha))}</strong>${
          faseAtual && !seg.fim ? '<span class="tl-atual">Atual</span>' : ""
        }<span class="tl-extra" hidden></span></div>
        <div class="tl-sub">${setor ? `<span class="tl-setor">${escapeHtml(setor)}</span>` : ""}<span class="tl-periodo"><span class="tl-data tl-data--ini"></span><span class="tl-seta">→</span><span class="tl-data tl-data--fim"></span></span></div>
        <span class="tl-aviso" hidden>Fim antes do início</span>
        <div class="tl-edit">
          <label class="field"><span>Início</span></label>
          <label class="field"><span>Fim <small>(em branco = em andamento)</small></span></label>
          <label class="field tl-edit__obs"><span>Atualização</span></label>
        </div>
        <div class="tl-nota"><span class="tl-obs-txt"></span></div>
      </td>
      <td class="tl-c-dur">
        <div class="tl-dur-topo"><span class="timeline-dur">${formatDurCurta(timelineSegmentMs(seg))}</span><span class="tl-meta-txt"></span></div>
        <div class="tl-regua"><span class="tl-regua__ok"></span><span class="tl-regua__acima"></span><span class="tl-regua__meta"></span></div>
      </td>
      <td class="tl-c-acoes"></td>
    `;
    const campos = tr.querySelectorAll(".tl-edit .field");
    const inInput = document.createElement("input");
    inInput.type = "datetime-local";
    inInput.className = "timeline-inicio";
    inInput.value = isoToDatetimeLocal(seg.inicio);
    inInput.title = "Data e hora de início nesta fase";
    inInput.required = true;
    const fimInput = document.createElement("input");
    fimInput.type = "datetime-local";
    fimInput.className = "timeline-fim";
    fimInput.value = isoToDatetimeLocal(seg.fim);
    fimInput.title = faseAtual ? "Deixe em branco enquanto a fase estiver em andamento" : "Data e hora de fim nesta fase";
    if (!faseAtual && seg.fim) fimInput.required = true;
    const ta = document.createElement("textarea");
    ta.className = "timeline-obs";
    ta.rows = 2;
    ta.maxLength = 2000;
    ta.placeholder = "Ex.: vistoria agendada, aguardando retorno do regional…";
    ta.value = seg.observacao || "";
    campos[0].appendChild(inInput);
    campos[1].appendChild(fimInput);
    campos[2].appendChild(ta);
    const onDateChange = () => refreshTimelineRowDur(tr);
    [inInput, fimInput].forEach((el) => {
      el.addEventListener("input", onDateChange);
      el.addEventListener("change", onDateChange);
    });
    ta.addEventListener("input", () => syncTimelineRowView(tr));

    // Leitura por padrão; clicar na fase (ou em Editar no menu) abre datas e atualização.
    const fecharEdicao = document.createElement("button");
    fecharEdicao.type = "button";
    fecharEdicao.className = "btn btn--primary btn--sm tl-edit__ok";
    fecharEdicao.textContent = "Concluir edição";
    tr.querySelector(".tl-edit").appendChild(fecharEdicao);
    const alternarEdicao = (abrir, foco = inInput) => {
      if (isReadOnlyUser()) return;
      const on = abrir ?? !tr.classList.contains("is-editing");
      tr.classList.toggle("is-editing", on);
      if (on) foco.focus({ preventScroll: true });
    };
    fecharEdicao.addEventListener("click", (e) => {
      e.stopPropagation();
      alternarEdicao(false);
    });
    tr.addEventListener("click", (e) => {
      const alvo = e.target instanceof Element ? e.target : null;
      if (!alvo || alvo.closest("input, textarea, button, select, .tl-menu")) return;
      if (!tr.classList.contains("is-editing")) alternarEdicao(true);
    });

    // Menu ⋯: editar, mover e excluir (os botões mantêm as classes usadas pelas regras de ordem/exclusão).
    const acoes = tr.querySelector(".tl-c-acoes");
    if (!ro) {
      const menu = document.createElement("div");
      menu.className = "tl-menu";
      menu.innerHTML =
        `<button type="button" class="tl-menu__btn" aria-haspopup="menu" aria-expanded="false" aria-label="Ações da fase" title="Ações da fase">⋯</button>` +
        `<div class="tl-menu__lista" role="menu">` +
        `<button type="button" role="menuitem" class="timeline-edit">✎ Editar datas e atualização</button>` +
        `<button type="button" role="menuitem" class="timeline-add-obs">💬 Adicionar atualização</button>` +
        // A lista aparece invertida (fase mais recente em cima): "antes" desce e "depois" sobe na tela.
        `<button type="button" role="menuitem" class="timeline-move-down">↑ Mover para depois</button>` +
        `<button type="button" role="menuitem" class="timeline-move-up">↓ Mover para antes</button>` +
        `<button type="button" role="menuitem" class="timeline-remove">🗑 Excluir fase</button></div>`;
      acoes.appendChild(menu);
      const btnMenu = menu.querySelector(".tl-menu__btn");
      btnMenu.addEventListener("click", (e) => {
        e.stopPropagation();
        const abrir = !menu.classList.contains("is-aberto");
        fecharMenusTimeline(menu);
        menu.classList.toggle("is-aberto", abrir);
        btnMenu.setAttribute("aria-expanded", abrir ? "true" : "false");
      });
      menu.querySelector(".timeline-edit").addEventListener("click", (e) => {
        e.stopPropagation();
        fecharMenusTimeline();
        alternarEdicao(true);
      });
      menu.querySelector(".timeline-add-obs").addEventListener("click", (e) => {
        e.stopPropagation();
        fecharMenusTimeline();
        alternarEdicao(true, ta);
      });
      menu.querySelector(".timeline-move-up").addEventListener("click", (e) => {
        e.stopPropagation();
        fecharMenusTimeline();
        swapTimelineRowUp(tr);
        toast("Ordem ajustada — salve o projeto para confirmar");
      });
      menu.querySelector(".timeline-move-down").addEventListener("click", (e) => {
        e.stopPropagation();
        fecharMenusTimeline();
        swapTimelineRowDown(tr);
        toast("Ordem ajustada — salve o projeto para confirmar");
      });
      menu.querySelector(".timeline-remove").addEventListener("click", async (e) => {
        e.stopPropagation();
        fecharMenusTimeline();
        if (tb.querySelectorAll("tr").length <= 1) {
          toast("Mantenha pelo menos uma fase no histórico");
          return;
        }
        if (!(await confirmExcluirFaseTimeline(seg))) return;
        tr.remove();
        syncDemStatusFromTimeline();
        refreshTimelineDeleteButtons();
        refreshTimelineMoveButtons();
        toast("Fase removida — salve o projeto para confirmar");
      });
    }
    tb.appendChild(tr);
    syncTimelineRowView(tr);
  });
  refreshTimelineDeleteButtons();
  refreshTimelineMoveButtons();
  renderTimelineResumo();
}
