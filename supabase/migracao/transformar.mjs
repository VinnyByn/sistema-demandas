// Conversões puras Firestore → Supabase (sem rede), usadas por migrar.mjs e pelos testes.

export const ADMIN_PRINCIPAL = "vinicius.morais@soumaster.com.br";
export const CRIADO_POR_MIGRACAO = "migracao@sistema";

/** Mesmo DEMANDAS_ROLES_SEED do user-roles.js: o app sempre os inclui (salvo removidos). */
export const PAPEIS_SEMENTE = {
  "vinicius.morais@soumaster.com.br": "admin",
  "alberto.soares@soumaster.com.br": "projetista",
  "rafael.mesquita@soumaster.com.br": "projetista",
  "rafael.machado@soumaster.com.br": "projetista",
  "matheus.costa@soumaster.com.br": "projetista",
  "daniel.rodrigues@soumaster.com.br": "projetista",
  "joao.bosco@soumaster.com.br": "projetista",
  "eduardo.pereira@soumaster.com.br": "projetista",
  "thiago.coelho@soumaster.com.br": "projetista",
  "hanver.junior@soumaster.com.br": "projetista",
};

/** Converte valores do Firestore (Timestamp, GeoPoint, refs) em JSON simples. */
export function paraJson(v) {
  if (v === null || v === undefined) return v ?? null;
  if (Array.isArray(v)) return v.map(paraJson);
  if (typeof v === "object") {
    if (typeof v.toDate === "function") return v.toDate().toISOString();
    if (typeof v.latitude === "number" && typeof v.longitude === "number" && Object.keys(v).length <= 2) {
      return { latitude: v.latitude, longitude: v.longitude };
    }
    if (typeof v.path === "string" && typeof v.id === "string" && v.firestore) return v.path;
    const out = {};
    for (const [k, x] of Object.entries(v)) {
      if (x === undefined) continue;
      out[k] = paraJson(x);
    }
    return out;
  }
  return v;
}

/** "data:application/pdf;base64,AAA" → { mime, bytes } (ou null). */
export function lerDataUrl(dataUrl) {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(String(dataUrl || ""));
  if (!m) return null;
  const mime = m[1] || "application/octet-stream";
  const bytes = m[2] ? Buffer.from(m[3], "base64") : Buffer.from(decodeURIComponent(m[3]), "utf8");
  return bytes.length ? { mime, bytes } : null;
}

/** Nome seguro para a chave do Storage (mesma regra do arquivos.js). */
export function nomeSeguro(nome) {
  const base = String(nome || "arquivo")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(-120);
  return base || "arquivo";
}

const EXT_POR_MIME = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "application/pdf": "pdf" };

/**
 * Separa um projeto do Firestore em:
 *  - dados: o que vai para demandas.dados (sem presença e sem arquivos em base64);
 *  - arquivos: PDFs/fotos embutidos que devem subir para o Storage.
 */
export function prepararDemanda(id, bruto) {
  const dados = paraJson(bruto) || {};
  delete dados.id;
  delete dados.editingBy;
  delete dados.editingAt;
  delete dados.__isMigrated;
  const arquivos = [];

  const pdf = dados.pdfLevantamento;
  if (pdf && typeof pdf === "object" && typeof pdf.dataUrl === "string" && pdf.dataUrl.startsWith("data:")) {
    const lido = lerDataUrl(pdf.dataUrl);
    if (lido) {
      arquivos.push({
        tipo: "pdf",
        nome: pdf.name || "levantamento.pdf",
        mime: "application/pdf",
        bytes: lido.bytes,
        levantamento: true,
      });
    }
  }

  if (Array.isArray(dados.imagens)) {
    const restantes = [];
    dados.imagens.forEach((img, i) => {
      const url = typeof img === "string" ? img : img?.dataUrl || img?.src || img?.url;
      const lido = typeof url === "string" && url.startsWith("data:image") ? lerDataUrl(url) : null;
      if (!lido) {
        restantes.push(img);
        return;
      }
      const nome = (typeof img === "object" && img?.name) || `imagem-${i + 1}.${EXT_POR_MIME[lido.mime] || "jpg"}`;
      arquivos.push({ tipo: "foto", nome, mime: lido.mime, bytes: lido.bytes, levantamento: false });
    });
    dados.imagens = restantes;
  }

  return { id, dados, arquivos };
}

function emailNorm(e) {
  return String(e || "")
    .trim()
    .toLowerCase();
}

function flag(v) {
  return v === true || v === 1 || v === "1" || String(v).toLowerCase() === "true";
}

/** Mapas de acesso do doc meta (roles, disabledUsers…) → linhas da tabela perfis. */
export function mapasParaPerfis(meta = {}) {
  const roles = { ...PAPEIS_SEMENTE, ...(meta.roles || {}) };
  const disabled = meta.disabledUsers || {};
  const purged = meta.purgedUsers || {};
  const regionals = meta.userRegionals || {};
  const names = meta.userDisplayNames || {};
  const emails = new Set([ADMIN_PRINCIPAL]);
  for (const m of [roles, disabled, purged, regionals, names]) {
    for (const e of Object.keys(m)) if (emailNorm(e)) emails.add(emailNorm(e));
  }
  const pegar = (m, e) => {
    for (const [k, v] of Object.entries(m)) if (emailNorm(k) === e) return v;
    return undefined;
  };
  return [...emails].sort().map((e) => {
    const r = String(pegar(roles, e) || "").toLowerCase();
    const papel =
      e === ADMIN_PRINCIPAL || r === "admin" || r === "administrador"
        ? "admin"
        : r === "visibilidade" || r === "leitura"
          ? "visibilidade"
          : "projetista";
    const regional = String(pegar(regionals, e) || "").trim();
    return {
      email: e,
      papel,
      desabilitado: e !== ADMIN_PRINCIPAL && flag(pegar(disabled, e)),
      // Fora do mapa de papéis = sem acesso no app (allowlist).
      removido: e !== ADMIN_PRINCIPAL && (flag(pegar(purged, e)) || pegar(roles, e) === undefined),
      regional: ["__all__", "todas", "*"].includes(regional.toLowerCase()) ? "" : regional,
      nome: String(pegar(names, e) || "")
        .replace(/\s+/g, " ")
        .trim(),
    };
  });
}

/** Doc meta do Firestore → linha de sistema_meta. */
export function metaParaLinha(meta = {}) {
  const m = paraJson(meta) || {};
  const lista = (v) => (Array.isArray(v) ? v : []);
  const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
  return {
    id: "meta",
    diarias: lista(m.diarias),
    projetistas: obj(m.projetistas),
    deleted_demanda_ids: lista(m.deletedDemandaIds).filter((x) => typeof x === "string" && x),
    deleted_diaria_ids: lista(m.deletedDiariaIds).filter((x) => typeof x === "string" && x),
    metas_etapa: obj(m.metasEtapa),
    filtros_salvos: obj(m.filtrosSalvos),
  };
}
