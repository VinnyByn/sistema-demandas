const REGIONAL_ORDER = [
  "Regional Centro Oeste",
  "Regional Norte de Minas",
  "Regional São Paulo",
  "Regional Sul de Minas",
];

const CIDADES_CADASTRO = [
  "Belo Horizonte - BHE",
  "Betim - BET",
  "Carmo do Cajuru - CCU",
  "Contagem - CEM",
  "Divinópolis - DVL",
  "Igarapé - IRP",
  "Itaúna - IAN",
  "Juatuba - JUAU",
  "Mateus Leme - MAL",
  "Pará de Minas - PRS",
  "Santo Antônio dos Campos - SADC",
  "São Sebastião do Oeste - SWO",
  "Montes Claros - MCL",
  "Paracatu - PTU",
  "Unaí - UNI",
  "Campos do Jordão - CPJ",
  "Guaratinguetá - GTA",
  "Lorena - LNA",
  "Pindamonhangaba - PBA",
  "São José dos Campos - SJC",
  "Taubaté - TTE",
  "Tremembé - TMB",
  "Itajubá - IJA",
  "Lavras - LAV",
  "Passos - PSO",
  "Piranguinho - PGH",
  "Piranguçu - PYU",
  "Poços de Caldas - PCS",
  "Pouso Alegre - PSA",
  "Santa Rita do Sapucaí - SRS",
  "São José do Alegre - SLK",
  "Três Corações - TCS",
  "Varginha - VGA",
];

function fold(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function emptyMetrics() {
  return { portas: 0, ocupadas: 0, livres: 0, atendimento: 0, equipamentos: 0, ctos: 0 };
}

function addMetrics(target, row) {
  target.portas += num(row["Quantidade portas"]);
  target.ocupadas += num(row["Portas ocupadas"]);
  target.livres += num(row["Portas livres"]);
  target.atendimento += num(row["Portas atendimento cliente"]);
  target.equipamentos += num(row["Quantidade equip."]);
  target.ctos += 1;
}

function mapRegional(name) {
  const n = fold(name);
  if (!n || n === "indeterminado") return "Indeterminado";
  if (n.includes("centro")) return "Regional Centro Oeste";
  if (n === "norte" || n.includes("norte")) return "Regional Norte de Minas";
  if (n === "sp" || n.includes("sao paulo")) return "Regional São Paulo";
  if (n === "sul" || n.includes("sul")) return "Regional Sul de Minas";
  return String(name || "Indeterminado").trim() || "Indeterminado";
}

function mapCidade(name) {
  const raw = String(name || "").trim();
  if (!raw) return "(sem cidade)";
  const n = fold(raw);
  const hit = CIDADES_CADASTRO.find((c) => fold(c.split(" - ")[0]) === n);
  return hit || raw;
}

function sortCidades(a, b) {
  return String(a).localeCompare(String(b), "pt-BR");
}

function regionalSortKey(name) {
  const idx = REGIONAL_ORDER.indexOf(name);
  return idx >= 0 ? idx : REGIONAL_ORDER.length + 1;
}

function sumCityMap(cityMap) {
  const tot = emptyMetrics();
  for (const row of cityMap.values()) {
    tot.portas += row.portas;
    tot.ocupadas += row.ocupadas;
    tot.livres += row.livres;
    tot.atendimento += row.atendimento;
    tot.equipamentos += row.equipamentos;
    tot.ctos += row.ctos;
  }
  return tot;
}

function metricsPlain(row) {
  return {
    portas: row.portas,
    ocupadas: row.ocupadas,
    livres: row.livres,
    atendimento: row.atendimento,
    equipamentos: row.equipamentos,
    ctos: row.ctos,
  };
}

function aggregateCtos(ctos) {
  const byReg = new Map();
  for (const [regRaw, cities] of Object.entries(ctos || {})) {
    const regional = mapRegional(regRaw);
    if (!byReg.has(regional)) byReg.set(regional, new Map());
    const cityMap = byReg.get(regional);
    for (const [cityRaw, rows] of Object.entries(cities || {})) {
      const cidade = mapCidade(cityRaw);
      if (!cityMap.has(cidade)) cityMap.set(cidade, emptyMetrics());
      const acc = cityMap.get(cidade);
      for (const row of Array.isArray(rows) ? rows : []) addMetrics(acc, row);
    }
  }

  const regionais = [...byReg.entries()]
    .sort((a, b) => regionalSortKey(a[0]) - regionalSortKey(b[0]) || a[0].localeCompare(b[0], "pt-BR"))
    .map(([regional, cityMap]) => {
      const cidades = [...cityMap.entries()]
        .sort((a, b) => sortCidades(a[0], b[0]))
        .map(([cidade, row]) => ({ cidade, ...metricsPlain(row) }));
      return { regional, ...metricsPlain(sumCityMap(cityMap)), cidades };
    });

  const total = emptyMetrics();
  for (const r of regionais) {
    total.portas += r.portas;
    total.ocupadas += r.ocupadas;
    total.livres += r.livres;
    total.atendimento += r.atendimento;
    total.equipamentos += r.equipamentos;
    total.ctos += r.ctos;
  }

  return { regionais, total: metricsPlain(total) };
}

function aggregateViabilidade(payload) {
  const agg = aggregateCtos(payload?.ctos || {});
  const stats = payload?.estatisticas && typeof payload.estatisticas === "object" ? payload.estatisticas : {};
  return {
    ok: true,
    fonte: "CTO",
    regionais: agg.regionais,
    total: agg.total,
    cidades: agg.regionais.reduce((n, r) => n + r.cidades.length, 0),
    estatisticas: {
      equipamentos: num(stats.Equipamentos),
      portas: num(stats.Portas),
      ocupadas: num(stats["Portas ocupadas"]),
      livres: num(stats["Portas livres"]),
      atendimento: num(stats["Portas atendimento cliente"]),
    },
  };
}

module.exports = {
  aggregateViabilidade,
  mapRegional,
  mapCidade,
};
