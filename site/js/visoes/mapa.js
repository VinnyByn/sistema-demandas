/**
 * Mapa dos projetos: uma bolha por cidade (tamanho = quantidade de projetos, cor = regional).
 * O Leaflet fica hospedado no próprio site (vendor/leaflet) e é carregado só ao abrir a aba;
 * o fundo do mapa vem do OpenStreetMap. Só declarações; os eventos são ligados em ligarMapa().
 */
const MAPA_LEAFLET_JS = "vendor/leaflet/leaflet.js";
const MAPA_LEAFLET_CSS = "vendor/leaflet/leaflet.css";
const MAPA_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

/** Centro aproximado de cada cidade do cadastro (latitude, longitude). */
const CIDADES_COORDENADAS = {
  "Belo Horizonte - BHE": [-19.9167, -43.9345],
  "Betim - BET": [-19.9678, -44.1983],
  "Carmo do Cajuru - CCU": [-20.1911, -44.7714],
  "Contagem - CEM": [-19.9317, -44.0536],
  "Divinópolis - DVL": [-20.1446, -44.8912],
  "Igarapé - IRP": [-20.0707, -44.302],
  "Itaúna - IAN": [-20.0753, -44.5764],
  "Juatuba - JUAU": [-19.9447, -44.3453],
  "Mateus Leme - MAL": [-19.9858, -44.4317],
  "Pará de Minas - PRS": [-19.8606, -44.6078],
  "Santo Antônio dos Campos - SADC": [-20.09, -44.96],
  "São Sebastião do Oeste - SWO": [-20.2758, -45.0058],
  "Montes Claros - MCL": [-16.735, -43.8617],
  "Paracatu - PTU": [-17.2222, -46.8747],
  "Unaí - UNI": [-16.3592, -46.9064],
  "Campos do Jordão - CPJ": [-22.7394, -45.5914],
  "Guaratinguetá - GTA": [-22.8164, -45.1925],
  "Lorena - LNA": [-22.7311, -45.1247],
  "Pindamonhangaba - PBA": [-22.9246, -45.4613],
  "São José dos Campos - SJC": [-23.1896, -45.8841],
  "Taubaté - TTE": [-23.0264, -45.5553],
  "Tremembé - TMB": [-22.9572, -45.5492],
  "Itajubá - IJA": [-22.4256, -45.4528],
  "Lavras - LAV": [-21.2453, -44.9997],
  "Passos - PSO": [-20.7189, -46.6097],
  "Piranguinho - PGH": [-22.395, -45.5328],
  "Piranguçu - PYU": [-22.525, -45.4942],
  "Poços de Caldas - PCS": [-21.7878, -46.5614],
  "Pouso Alegre - PSA": [-22.23, -45.9364],
  "Santa Rita do Sapucaí - SRS": [-22.2522, -45.7036],
  "São José do Alegre - SLK": [-22.3253, -45.5261],
  "Três Corações - TCS": [-21.6961, -45.2553],
  "Varginha - VGA": [-21.5514, -45.4303],
};

const mapaEstado = { mapa: null, camada: null, grupos: [], cidade: "", ligado: false, carregando: null, enquadrado: false };

function mapaCarregarLeaflet() {
  if (window.L?.map) return Promise.resolve(window.L);
  if (mapaEstado.carregando) return mapaEstado.carregando;
  mapaEstado.carregando = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${MAPA_LEAFLET_CSS}"]`)) {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = MAPA_LEAFLET_CSS;
      document.head.appendChild(css);
    }
    const s = document.createElement("script");
    s.src = MAPA_LEAFLET_JS;
    s.async = true;
    s.onload = () => resolve(window.L);
    s.onerror = () => {
      mapaEstado.carregando = null;
      s.remove();
      reject(new Error("Não foi possível carregar o mapa."));
    };
    document.head.appendChild(s);
  });
  return mapaEstado.carregando;
}

function mapaRegionalDaCidade(cidade) {
  for (const [reg, cidades] of Object.entries(REGIONAIS_CIDADES)) if (cidades.includes(cidade)) return reg;
  return "";
}

function mapaFiltros() {
  const v = (id) => document.getElementById(id);
  return {
    esteira: v("mapaFiltroEsteira")?.value || "todas",
    situacao: v("mapaFiltroSituacao")?.value || "andamento",
    tipo: v("mapaFiltroTipo")?.value || "",
    projetista: v("mapaFiltroProjetista")?.value || "",
  };
}

/** Projetos que passam pelos filtros, agrupados por cidade (um projeto em várias cidades conta em cada uma). */
function mapaAgrupar(f = mapaFiltros()) {
  const cidades = new Map();
  const semLugar = [];
  const slug = f.projetista ? projetistaSlug(f.projetista) : "";
  for (const bruto of state.demandas || []) {
    if (bruto.arquivadoEm || bruto.excluidoEm) continue;
    const d = migrateDemanda(bruto);
    const b2b = isDemandaB2b(d);
    if (f.esteira === "operacional" && b2b) continue;
    if (f.esteira === "b2b" && !b2b) continue;
    if (f.tipo && d.tipo !== f.tipo) continue;
    const encerrada = isDemandaEncerrada(d);
    if (f.situacao === "andamento" && encerrada) continue;
    if (f.situacao === "concluidos" && (!encerrada || d.status === "reprovado")) continue;
    if (slug && !demandaProjetistasList(d).some((p) => projetistaSlug(p) === slug)) continue;
    const lista = [d.cidade, ...(d.cidadesExtra || [])].filter(Boolean);
    const noMapa = lista.filter((c) => CIDADES_COORDENADAS[c]);
    if (!noMapa.length) {
      semLugar.push(d);
      continue;
    }
    for (const c of noMapa) {
      if (!cidades.has(c)) cidades.set(c, { cidade: c, regional: mapaRegionalDaCidade(c), projetos: [], atrasados: 0 });
      const g = cidades.get(c);
      g.projetos.push(d);
      if (isAtrasoAtivo(d)) g.atrasados += 1;
    }
  }
  const grupos = [...cidades.values()].sort((a, b) => b.projetos.length - a.projetos.length || a.cidade.localeCompare(b.cidade, "pt-BR"));
  return { grupos, semLugar };
}

function mapaNomeCidade(c) {
  return String(c).replace(/\s+-\s+[A-Z]+$/, "");
}

function mapaCorRegional(reg) {
  return REGIONAL_CHART_COLORS[reg] || REGIONAL_CHART_COLORS["Não informada"];
}

function mapaRaio(n, max) {
  return Math.round(12 + 14 * Math.sqrt(n / Math.max(1, max)));
}

function mapaProjetoHtml(d) {
  const atraso = isAtrasoAtivo(d);
  const prazo = isoDatePart(d.dataFimAtualizada || "") || isoDatePart(d.dataFimPrevista || "");
  return (
    `<li><button type="button" class="mapa-proj" data-mapa-abrir="${escapeHtml(d.id)}">` +
    `<span class="mapa-proj__topo"><span class="badge ${tipoBadgeClass(d.tipo)}">${escapeHtml(d.tipo || "—")}</span>` +
    `<span class="mapa-proj__etapa">${escapeHtml(labelStatus(d.status, d.linhaEsteira))}</span>` +
    (atraso ? '<span class="mapa-proj__atraso">Atrasado</span>' : "") +
    "</span>" +
    `<strong>${escapeHtml(d.titulo)}</strong>` +
    `<span class="mapa-proj__sub">${escapeHtml(demandaProjetistasList(d).join(" · ") || "Não atribuído")}${prazo ? ` · prazo ${formatDataCurta(prazo)}` : ""}</span>` +
    "</button></li>"
  );
}

function mapaRenderLado(grupos, semLugar) {
  const lado = document.getElementById("mapaLado");
  if (!lado) return;
  const escolhido = grupos.find((g) => g.cidade === mapaEstado.cidade);
  if (escolhido) {
    lado.innerHTML =
      `<div class="mapa-lado__head"><button type="button" class="btn btn--ghost btn--sm" data-mapa-voltar>← Todas as cidades</button></div>` +
      `<h3 class="mapa-lado__titulo"><span class="mapa-ponto" style="--cor:${mapaCorRegional(escolhido.regional)}"></span>${escapeHtml(mapaNomeCidade(escolhido.cidade))}</h3>` +
      `<p class="mapa-lado__sub">${escapeHtml(regionalSelectLabel(escolhido.regional) || "Sem regional")} · ${escolhido.projetos.length} projeto${escolhido.projetos.length > 1 ? "s" : ""}` +
      (escolhido.atrasados ? ` · <span class="mapa-lado__atraso">${escolhido.atrasados} atrasado${escolhido.atrasados > 1 ? "s" : ""}</span>` : "") +
      "</p>" +
      `<ul class="mapa-lista">${escolhido.projetos.map(mapaProjetoHtml).join("")}</ul>`;
    return;
  }
  const total = new Set(grupos.flatMap((g) => g.projetos.map((d) => d.id))).size;
  const max = Math.max(1, ...grupos.map((g) => g.projetos.length));
  lado.innerHTML =
    `<h3 class="mapa-lado__titulo">Cidades</h3>` +
    `<p class="mapa-lado__sub">${total} projeto${total === 1 ? "" : "s"} em ${grupos.length} cidade${grupos.length === 1 ? "" : "s"}</p>` +
    (grupos.length
      ? `<ul class="mapa-cidades">${grupos
          .map(
            (g) =>
              `<li><button type="button" class="mapa-cidade" data-mapa-cidade="${escapeHtml(g.cidade)}">` +
              `<span class="mapa-ponto" style="--cor:${mapaCorRegional(g.regional)}" aria-hidden="true"></span>` +
              `<span class="mapa-cidade__nome">${escapeHtml(mapaNomeCidade(g.cidade))}</span>` +
              (g.atrasados ? `<span class="mapa-cidade__atraso" title="Atrasados">${g.atrasados}</span>` : "") +
              `<b>${g.projetos.length}</b>` +
              `<span class="mapa-cidade__barra" style="--pct:${Math.round((g.projetos.length / max) * 100)}%" aria-hidden="true"></span>` +
              "</button></li>",
          )
          .join("")}</ul>`
      : '<p class="cal-vazio">Nenhum projeto com esses filtros.</p>') +
    (semLugar.length
      ? `<details class="mapa-sem-lugar"><summary>${semLugar.length} projeto${semLugar.length > 1 ? "s" : ""} sem cidade do cadastro</summary>` +
        `<ul class="mapa-lista">${semLugar.map(mapaProjetoHtml).join("")}</ul></details>`
      : "");
}

function mapaRenderLegenda() {
  const el = document.getElementById("mapaLegenda");
  if (!el || el.dataset.pronta) return;
  el.dataset.pronta = "1";
  el.innerHTML =
    Object.keys(REGIONAIS_CIDADES)
      .map((r) => `<span><i class="mapa-ponto" style="--cor:${mapaCorRegional(r)}"></i>${escapeHtml(regionalSelectLabel(r))}</span>`)
      .join("") + '<span><i class="mapa-ponto mapa-ponto--atraso"></i>Tem atrasado</span>';
}

/** Junta as cidades cujas bolhas se encostariam no zoom atual (perto de BH, por exemplo, ficam umas sobre as outras). */
function mapaAgruparNaTela(grupos, max) {
  const mapa = mapaEstado.mapa;
  const blocos = [];
  for (const g of [...grupos].sort((a, b) => b.projetos.length - a.projetos.length)) {
    const pt = mapa.latLngToLayerPoint(CIDADES_COORDENADAS[g.cidade]);
    const r = mapaRaio(g.projetos.length, max);
    const perto = blocos.find((b) => b.pt.distanceTo(pt) < b.r + r + 2);
    if (perto) {
      perto.cidades.push(g);
      perto.ids = new Set([...perto.ids, ...g.projetos.map((d) => d.id)]);
      perto.atrasados += g.atrasados;
      perto.r = mapaRaio(perto.ids.size, max);
    } else {
      blocos.push({ pt, r, cidades: [g], ids: new Set(g.projetos.map((d) => d.id)), atrasados: g.atrasados });
    }
  }
  return blocos;
}

function mapaDesenhar(L, grupos) {
  if (!mapaEstado.mapa) {
    const el = document.getElementById("mapaCanvas");
    if (!el) return;
    mapaEstado.mapa = L.map(el, { zoomControl: true, attributionControl: true, minZoom: 5, maxZoom: 16 }).setView([-20.6, -45.2], 6);
    mapaEstado.mapa.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
    L.tileLayer(MAPA_TILES, {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
      className: "mapa-tiles",
    }).addTo(mapaEstado.mapa);
    mapaEstado.camada = L.layerGroup().addTo(mapaEstado.mapa);
    mapaEstado.mapa.on("zoomend", () => mapaDesenharBolhas(L));
  }
  mapaEstado.grupos = grupos;
  mapaEstado.mapa.invalidateSize();
  if (!mapaEstado.enquadrado && grupos.length) {
    mapaEstado.enquadrado = true;
    const limites = L.latLngBounds(grupos.map((g) => CIDADES_COORDENADAS[g.cidade]));
    mapaEstado.mapa.fitBounds(limites.pad(0.2), { maxZoom: 10, animate: false });
  }
  mapaDesenharBolhas(L);
}

function mapaDesenharBolhas(L) {
  const camada = mapaEstado.camada;
  const grupos = mapaEstado.grupos || [];
  if (!camada) return;
  camada.clearLayers();
  const max = Math.max(1, ...grupos.map((g) => g.projetos.length));
  for (const b of mapaAgruparNaTela(grupos, max)) {
    const n = b.ids.size;
    const unica = b.cidades.length === 1;
    const principal = b.cidades[0];
    const latlng = unica
      ? CIDADES_COORDENADAS[principal.cidade]
      : mapaEstado.mapa.layerPointToLatLng(
          b.cidades
            .map((g) => mapaEstado.mapa.latLngToLayerPoint(CIDADES_COORDENADAS[g.cidade]))
            .reduce((a, p) => a.add(p), L.point(0, 0))
            .divideBy(b.cidades.length),
        );
    const nomes = b.cidades.map((g) => mapaNomeCidade(g.cidade));
    const nome = unica ? nomes[0] : `${nomes.length} cidades`;
    const escolhido = b.cidades.some((g) => g.cidade === mapaEstado.cidade);
    const icone = L.divIcon({
      className: "mapa-bolha-wrap",
      iconSize: [b.r * 2, b.r * 2],
      html:
        `<span class="mapa-bolha${b.atrasados ? " tem-atraso" : ""}${escolhido ? " is-escolhida" : ""}${unica ? "" : " is-grupo"}" style="--cor:${mapaCorRegional(principal.regional)};--r:${b.r}px">` +
        `<b>${n}</b></span>`,
    });
    const marca = L.marker(latlng, { icon: icone, title: `${nome}: ${n} projeto${n > 1 ? "s" : ""}`, alt: nome, keyboard: true, riseOnHover: true });
    marca.bindTooltip(
      `<strong>${escapeHtml(nome)}</strong>${unica ? "" : `<br><small>${escapeHtml(nomes.join(", "))}</small>`}<br>${n} projeto${n > 1 ? "s" : ""}` +
        (b.atrasados ? ` · ${b.atrasados} atrasado${b.atrasados > 1 ? "s" : ""}` : "") +
        (unica ? "" : "<br><small>Clique para aproximar</small>"),
      { direction: "top", offset: [0, -b.r], className: "mapa-tooltip" },
    );
    marca.on("click", () => {
      if (unica) {
        mapaEscolherCidade(principal.cidade, true);
        return;
      }
      const limites = L.latLngBounds(b.cidades.map((g) => CIDADES_COORDENADAS[g.cidade]));
      const zoom = Math.min(mapaEstado.mapa.getBoundsZoom(limites.pad(0.3)), mapaEstado.mapa.getMaxZoom());
      if (zoom <= mapaEstado.mapa.getZoom()) mapaEscolherCidade(principal.cidade, false);
      else mapaEstado.mapa.flyToBounds(limites.pad(0.3), { duration: 0.6 });
    });
    camada.addLayer(marca);
  }
}

function mapaEscolherCidade(cidade, centralizar) {
  mapaEstado.cidade = cidade;
  renderMapa();
  if (centralizar && cidade && mapaEstado.mapa && CIDADES_COORDENADAS[cidade]) {
    mapaEstado.mapa.setView(CIDADES_COORDENADAS[cidade], Math.max(mapaEstado.mapa.getZoom(), 11), { animate: true });
  }
}

function mapaPreencherProjetistas() {
  const sel = document.getElementById("mapaFiltroProjetista");
  if (!sel || sel.options.length > 1) return;
  const nomes = [...new Set([...PROJETISTAS, ...PROJETISTAS_B2B])].sort((a, b) => a.localeCompare(b, "pt-BR"));
  sel.insertAdjacentHTML("beforeend", nomes.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join(""));
  const tipo = document.getElementById("mapaFiltroTipo");
  if (tipo && tipo.options.length <= 1) {
    tipo.insertAdjacentHTML("beforeend", TIPOS_DEMANDA.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join(""));
  }
}

function renderMapa() {
  const painel = document.getElementById("panelMapa");
  if (!painel || painel.hidden) return;
  mapaPreencherProjetistas();
  mapaRenderLegenda();
  const { grupos, semLugar } = mapaAgrupar();
  if (mapaEstado.cidade && !grupos.some((g) => g.cidade === mapaEstado.cidade)) mapaEstado.cidade = "";
  mapaRenderLado(grupos, semLugar);
  const aviso = document.getElementById("mapaAviso");
  mapaCarregarLeaflet()
    .then((L) => {
      if (aviso) aviso.hidden = true;
      mapaDesenhar(L, grupos);
    })
    .catch(() => {
      if (aviso) {
        aviso.hidden = false;
        aviso.textContent = "Não foi possível carregar o mapa agora. A lista de cidades ao lado continua valendo.";
      }
    });
}

function ligarMapa() {
  const painel = document.getElementById("panelMapa");
  if (!painel || mapaEstado.ligado) return;
  mapaEstado.ligado = true;
  ["mapaFiltroEsteira", "mapaFiltroSituacao", "mapaFiltroTipo", "mapaFiltroProjetista"].forEach((id) =>
    document.getElementById(id)?.addEventListener("change", () => {
      mapaEstado.enquadrado = false;
      renderMapa();
    }),
  );
  painel.addEventListener("click", (e) => {
    const abrir = e.target.closest("[data-mapa-abrir]");
    if (abrir) {
      openDemandaModal(abrir.dataset.mapaAbrir);
      return;
    }
    const cidade = e.target.closest("[data-mapa-cidade]");
    if (cidade) {
      mapaEscolherCidade(cidade.dataset.mapaCidade, true);
      return;
    }
    if (e.target.closest("[data-mapa-voltar]")) {
      mapaEscolherCidade("", false);
      mapaEstado.enquadrado = false;
      renderMapa();
    }
  });
}
