// Gera um JSON com todos os projetos e o meta, no mesmo formato do "Exportar JSON" do app (restaura pelo "Importar JSON").
const BUCKET = "backups";
const BACKUPS_MANTIDOS = 30;
const TAMANHO_PAGINA = 1000;
const LIMITE_DA_LISTAGEM = 1000;

async function lerDemandas(admin) {
  const demandas = [];
  for (let inicio = 0; ; inicio += TAMANHO_PAGINA) {
    const { data, error } = await admin
      .from("demandas")
      .select("id,dados")
      .order("id")
      .range(inicio, inicio + TAMANHO_PAGINA - 1);
    if (error) throw new Error(`Ler demandas: ${error.message}`);
    demandas.push(...data.map((linha) => ({ id: linha.id, ...linha.dados })));
    if (data.length < TAMANHO_PAGINA) return demandas;
  }
}

async function lerMeta(admin) {
  const { data, error } = await admin.from("sistema_meta").select("dados").eq("id", "meta").maybeSingle();
  if (error) throw new Error(`Ler meta: ${error.message}`);
  return data?.dados || {};
}

function nomeDoArquivo(momento, motivo) {
  const carimbo = momento.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `demandas-${carimbo}-${motivo === "manual" ? "manual" : "auto"}.json`;
}

function montarConteudo({ demandas, meta, momento, motivo, autor }) {
  return {
    backup: { geradoEm: momento.toISOString(), motivo, autor, totalDemandas: demandas.length },
    demandas,
    diarias: meta.diarias || [],
    projetistas: meta.projetistas || {},
    deletedDemandaIds: meta.deletedDemandaIds || [],
    deletedDiariaIds: meta.deletedDiariaIds || [],
    metasEtapa: meta.metasEtapa || {},
    filtrosSalvos: meta.filtrosSalvos || {},
    metaCompleto: meta,
  };
}

/** O nome começa pela data, então a ordem alfabética é cronológica. Falhar aqui não invalida o backup já gravado. */
async function apagarBackupsAntigos(arquivos) {
  const lista = await arquivos.list("", { limit: LIMITE_DA_LISTAGEM, sortBy: { column: "name", order: "desc" } });
  if (lista.error) {
    console.warn("Listar backups:", lista.error.message);
    return;
  }
  const antigos = lista.data
    .map((arquivo) => arquivo.name)
    .filter((nome) => nome.endsWith(".json"))
    .sort((a, b) => b.localeCompare(a))
    .slice(BACKUPS_MANTIDOS);
  if (!antigos.length) return;
  const remocao = await arquivos.remove(antigos);
  if (remocao.error) console.warn("Rotação de backup:", remocao.error.message);
}

async function gerarBackup({ admin, motivo = "agendado", autor = "" }) {
  const [demandas, meta] = await Promise.all([lerDemandas(admin), lerMeta(admin)]);
  const momento = new Date();
  const nome = nomeDoArquivo(momento, motivo);
  const bytes = new TextEncoder().encode(JSON.stringify(montarConteudo({ demandas, meta, momento, motivo, autor })));

  const arquivos = admin.storage.from(BUCKET);
  const envio = await arquivos.upload(nome, new Blob([bytes], { type: "application/json" }), {
    contentType: "application/json",
    upsert: false,
  });
  if (envio.error) throw new Error(`Gravar backup: ${envio.error.message}`);

  await apagarBackupsAntigos(arquivos);

  const info = { path: nome, geradoEm: momento.toISOString(), motivo, autor, totalDemandas: demandas.length, bytes: bytes.length };
  const registro = await admin.from("sistema_backups").upsert({ id: "ultimo", info });
  if (registro.error) throw new Error(`Registrar backup: ${registro.error.message}`);
  return info;
}

export { gerarBackup, BACKUPS_MANTIDOS };
