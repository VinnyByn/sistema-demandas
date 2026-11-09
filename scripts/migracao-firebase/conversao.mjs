// Conversões puras da migração (sem rede nem SDK), para poderem ser testadas. Ver docs/migracao-supabase.md.

const BLOQUEIO_SEM_FIM = "876000h"; // 100 anos: o Supabase representa conta desativada como bloqueio por tempo

/** Firestore → JSON: Timestamp vira data ISO; o resto passa igual (o app grava quase tudo como texto ISO). */
function paraJson(valor) {
  if (valor === undefined) return undefined;
  if (valor === null || typeof valor !== "object") return valor;
  if (typeof valor.toDate === "function") return valor.toDate().toISOString();
  if (Array.isArray(valor)) return valor.map((v) => (v === undefined ? null : paraJson(v)));
  const saida = {};
  for (const [chave, v] of Object.entries(valor)) {
    const convertido = paraJson(v);
    if (convertido !== undefined) saida[chave] = convertido;
  }
  return saida;
}

// O Supabase decodifica com base64 padrão (com "=" no fim); a exportação do Firebase pode vir na variante de URL.
function base64Padrao(texto) {
  const limpo = String(texto || "").replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
  return limpo + "=".repeat((4 - (limpo.length % 4)) % 4);
}

/** `n` é o expoente (mem_cost do Firebase), não o N do scrypt: é o que o Supabase espera nesse formato. */
function montarHashFirebase({ passwordHash, salt }, parametros) {
  const { base64_signer_key: chave, base64_salt_separator: separador, rounds, mem_cost: memoria } = parametros;
  if (!passwordHash || !salt) return null;
  return `$fbscrypt$v=1,n=${Number(memoria)},r=${Number(rounds)},p=1,ss=${base64Padrao(separador)},sk=${base64Padrao(chave)}$${base64Padrao(salt)}$${base64Padrao(passwordHash)}`;
}

function usuarioParaSupabase(usuario, parametros) {
  const hash = montarHashFirebase(usuario, parametros);
  const nome = String(usuario.displayName || "").trim();
  return {
    email: String(usuario.email || "").trim().toLowerCase(),
    email_confirm: true, // quem estava no Firebase já foi aceito pelo administrador; a RLS exige e-mail confirmado
    ...(hash ? { password_hash: hash } : {}),
    ...(nome ? { user_metadata: { display_name: nome } } : {}),
    ...(usuario.disabled ? { ban_duration: BLOQUEIO_SEM_FIM } : {}),
  };
}

/** Linhas de cada tabela a partir do que foi exportado do Firestore. */
function montarLinhas(exportado) {
  const emJson = paraJson(exportado);
  const demandas = (emJson.demandas || []).map(({ id, ...dados }) => ({ id, dados }));
  const { updatedAt: _ignorado, ...meta } = emJson.meta || {};
  return {
    demandas,
    sistema_meta: [{ id: "meta", dados: meta }],
    sistema_backups: emJson.backups?.ultimo ? [{ id: "ultimo", info: emJson.backups.ultimo }] : [],
    acessos_historico: (emJson.acessosHistorico || [])
      .filter((h) => h.por && h.alvo && h.acao)
      .map((h) => ({ em: h.em, por: h.por, alvo: h.alvo, acao: h.acao, de: h.de ?? null, para: h.para ?? null })),
    asana_story_vinculos: (emJson.asanaStories || [])
      .filter((s) => s.demandaId && s.comentarioId)
      .map((s) => ({ story_gid: s.id, demanda_id: s.demandaId, comentario_id: s.comentarioId, origem: s.origem || "sistema" })),
    asana_envios: (emJson.asanaComentarios || [])
      .filter((e) => e.demandaId && e.comentarioId)
      .map((e) => ({ demanda_id: e.demandaId, comentario_id: e.comentarioId, estado: e.estado || "ok", story_gid: e.storyGid ?? null, email: e.email ?? null, autor: e.autor ?? null, criado_em: e.criadoEm || new Date().toISOString() })),
    asana_anexos: (emJson.asanaAnexos || [])
      .filter((a) => a.demandaId)
      .map((a) => ({ attachment_gid: a.id, demanda_id: a.demandaId, registrado_em: a.em || new Date().toISOString() })),
  };
}

const CHAVE_POR_TABELA = {
  demandas: "id",
  sistema_meta: "id",
  sistema_backups: "id",
  asana_story_vinculos: "story_gid",
  asana_envios: "demanda_id,comentario_id",
  asana_anexos: "attachment_gid",
};

function avisosDaImportacao(linhas) {
  const avisos = [];
  const comAnexoFirebase = linhas.demandas.filter((d) => /firebasestorage/.test(JSON.stringify(d.dados?.anexos || ""))).length;
  if (comAnexoFirebase) avisos.push(`${comAnexoFirebase} demanda(s) têm anexos com link do Firebase Storage: os links param quando o Storage for desligado.`);
  const pdfEstranho = linhas.demandas.filter((d) => {
    const url = d.dados?.pdfLevantamento?.dataUrl;
    return typeof url === "string" && url && !/^data:(application\/(pdf|x-pdf|octet-stream))?;base64,[A-Za-z0-9+/=]*$/.test(url);
  }).length;
  if (pdfEstranho) avisos.push(`${pdfEstranho} demanda(s) têm PDF de levantamento em formato não reconhecido: o app descarta essa cópia na próxima gravação.`);
  const papeis = linhas.sistema_meta[0].dados.roles || {};
  if (!Object.keys(papeis).length) avisos.push("O meta não tem lista de papéis: confira se a exportação leu o documento certo.");
  const conhecidos = ["admin", "administrador", "administrator", "projetista", "visibilidade"];
  const desconhecidos = Object.entries(papeis).filter(([, papel]) => !conhecidos.includes(String(papel).toLowerCase()));
  if (desconhecidos.length) {
    avisos.push(`${desconhecidos.length} login(s) com papel fora da lista ficarão só com leitura; corrija antes da virada: ${desconhecidos.map(([email, papel]) => `${email} (${papel})`).join(", ")}`);
  }
  return avisos;
}

export { paraJson, base64Padrao, montarHashFirebase, usuarioParaSupabase, montarLinhas, avisosDaImportacao, CHAVE_POR_TABELA };
