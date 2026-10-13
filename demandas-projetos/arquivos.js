/**
 * Arquivos dos projetos (PDF, KMZ, fotos) no Supabase Storage.
 *
 * Conteúdo: bucket privado `projetos`, caminho {id do projeto}/{pdf|kmz|foto}/{arquivo}.
 * Lista: tabela `arquivos` (nome, tamanho, quem enviou). Abrir/baixar: URL assinada temporária.
 * Só funciona com DEMANDAS_BACKEND = "supabase".
 */
window.DemandasArquivos = (function () {
  const BUCKET = "projetos";
  const TAMANHO_MAX = 50 * 1024 * 1024;
  const VALIDADE_URL_S = 60 * 60;

  const TIPOS = {
    pdf: { rotulo: "PDF", extensoes: ["pdf"] },
    kmz: { rotulo: "KMZ", extensoes: ["kmz", "kml"] },
    foto: { rotulo: "Fotos", extensoes: ["jpg", "jpeg", "png", "webp", "gif", "heic", "heif"] },
  };

  const MIME_POR_EXTENSAO = {
    pdf: "application/pdf",
    kmz: "application/vnd.google-earth.kmz",
    kml: "application/vnd.google-earth.kml+xml",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    heic: "image/heic",
    heif: "image/heif",
  };

  function cliente() {
    return window.DemandasSupabase?.clienteAtual?.() || null;
  }

  /** Há Supabase com sessão: dá para enviar e listar. */
  function disponivel() {
    return window.DEMANDAS_BACKEND === "supabase" && !!cliente();
  }

  function extensao(nome) {
    const m = /\.([a-z0-9]+)$/i.exec(String(nome || ""));
    return m ? m[1].toLowerCase() : "";
  }

  /** pdf | kmz | foto, ou "" quando o arquivo não é aceito. */
  function tipoDoArquivo(file) {
    const ext = extensao(file?.name);
    for (const [tipo, def] of Object.entries(TIPOS)) {
      if (def.extensoes.includes(ext)) return tipo;
    }
    if (String(file?.type || "").startsWith("image/")) return "foto";
    if (file?.type === "application/pdf") return "pdf";
    return "";
  }

  function mimeDoArquivo(file) {
    return MIME_POR_EXTENSAO[extensao(file?.name)] || file?.type || "application/octet-stream";
  }

  /** Nome seguro para a chave do Storage (sem acentos nem espaços). */
  function nomeSeguro(nome) {
    const base = String(nome || "arquivo")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^\w.-]+/g, "_")
      .replace(/_+/g, "_")
      .slice(-120);
    return base || "arquivo";
  }

  function idAleatorio() {
    if (crypto?.randomUUID) return crypto.randomUUID();
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function erro(e, padrao) {
    const msg = String(e?.message || e?.error || "");
    if (/row-level security|permission|unauthorized|403/i.test(msg)) return new Error("Sem permissão para esta ação.");
    if (/payload too large|exceeded the maximum|413/i.test(msg)) return new Error("Arquivo maior que o limite (50 MB).");
    if (/mime type|invalid_mime|not supported/i.test(msg)) return new Error("Tipo de arquivo não aceito.");
    if (/foreign key|violates foreign key/i.test(msg)) return new Error("Salve o projeto antes de anexar arquivos.");
    return new Error(msg || padrao);
  }

  async function listar(demandaId) {
    const c = cliente();
    if (!c || !demandaId) return [];
    const { data, error } = await c
      .from("arquivos")
      .select("*")
      .eq("demanda_id", demandaId)
      .order("criado_em", { ascending: false });
    if (error) throw erro(error, "Não foi possível listar os arquivos.");
    return data || [];
  }

  /**
   * Envia um arquivo e registra na tabela.
   * @returns {Promise<object>} linha de `arquivos`
   */
  async function enviar(demandaId, file, { levantamento = false } = {}) {
    const c = cliente();
    if (!c) throw new Error("Arquivos disponíveis só com o Supabase.");
    const tipo = tipoDoArquivo(file);
    if (!tipo) throw new Error(`«${file?.name}»: use PDF, KMZ/KML ou imagem.`);
    if (file.size > TAMANHO_MAX) throw new Error(`«${file.name}» passa de 50 MB.`);
    const caminho = `${demandaId}/${tipo}/${idAleatorio()}-${nomeSeguro(file.name)}`;
    const mime = mimeDoArquivo(file);
    const up = await c.storage.from(BUCKET).upload(caminho, file, { contentType: mime, upsert: false });
    if (up.error) throw erro(up.error, "Falha no envio.");
    const { data, error } = await c
      .from("arquivos")
      .insert({
        demanda_id: demandaId,
        tipo,
        nome: file.name,
        caminho,
        tamanho: file.size,
        mime,
        levantamento: !!levantamento,
      })
      .select()
      .single();
    if (error) {
      // Sem registro, o arquivo ficaria órfão no Storage.
      await c.storage.from(BUCKET).remove([caminho]);
      throw erro(error, "Falha ao registrar o arquivo.");
    }
    return data;
  }

  async function excluir(arquivo) {
    const c = cliente();
    if (!c || !arquivo?.id) return;
    const rm = await c.storage.from(BUCKET).remove([arquivo.caminho]);
    if (rm.error) throw erro(rm.error, "Não foi possível excluir o arquivo.");
    const { error } = await c.from("arquivos").delete().eq("id", arquivo.id);
    if (error) throw erro(error, "Não foi possível excluir o registro do arquivo.");
  }

  /** URL temporária; com `baixarComo`, o navegador baixa com esse nome. */
  async function urlAssinada(caminho, { baixarComo } = {}) {
    const c = cliente();
    if (!c) throw new Error("Arquivos disponíveis só com o Supabase.");
    const opcoes = baixarComo ? { download: baixarComo } : undefined;
    const { data, error } = await c.storage.from(BUCKET).createSignedUrl(caminho, VALIDADE_URL_S, opcoes);
    if (error) throw erro(error, "Não foi possível abrir o arquivo.");
    return data.signedUrl;
  }

  /** caminho → URL assinada, em uma chamada (miniaturas das fotos). */
  async function urlsAssinadas(caminhos) {
    const c = cliente();
    if (!c || !caminhos.length) return {};
    const { data, error } = await c.storage.from(BUCKET).createSignedUrls(caminhos, VALIDADE_URL_S);
    if (error) throw erro(error, "Não foi possível carregar as fotos.");
    const out = {};
    for (const item of data || []) {
      if (item?.path && item.signedUrl) out[item.path] = item.signedUrl;
    }
    return out;
  }

  /**
   * Avisa quando arquivos do projeto mudam (outra pessoa enviou/excluiu). Retorna o cancelamento.
   * Exclusões chegam sem filtro (o Realtime não filtra DELETE): `aoMudar` recebe o id excluído.
   */
  function observar(demandaId, aoMudar) {
    const c = cliente();
    if (!c || !demandaId) return () => {};
    const canal = c
      .channel(`arquivos-${demandaId}-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "arquivos", filter: `demanda_id=eq.${demandaId}` },
        () => aoMudar(null),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "arquivos", filter: `demanda_id=eq.${demandaId}` },
        () => aoMudar(null),
      )
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "arquivos" }, (p) =>
        aoMudar(p?.old?.id || null),
      )
      .subscribe();
    return () => {
      void c.removeChannel(canal);
    };
  }

  return {
    TIPOS,
    TAMANHO_MAX,
    disponivel,
    tipoDoArquivo,
    listar,
    enviar,
    excluir,
    urlAssinada,
    urlsAssinadas,
    observar,
  };
})();
