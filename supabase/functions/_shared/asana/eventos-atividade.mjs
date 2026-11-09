/** Asana → sistema: comentários e demais atividades da tarefa viram comentários na demanda. */
import { criarCliente } from "./cliente.mjs";
import { ehComentarioDoSistema, textoDoAnexo } from "./demanda.mjs";
import { avaliarSituacaoTarefa } from "./eventos-tarefa.mjs";

/** Já viram aviso próprio (coluna, conclusão) ou não interessam: não viram comentário. */
const ATIVIDADES_IGNORADAS = new Set([
  "section_changed",
  "marked_complete",
  "marked_incomplete",
  "added_to_project",
  "removed_from_project",
  "comment_liked",
  "liked",
  "unliked",
  "added_to_tag",
  "removed_from_tag",
  "member_added",
  "collaborator_added",
  "follower_added",
  "attachment_liked",
]);
const ATIVIDADES_DE_SITUACAO = new Set(["section_changed", "marked_complete", "marked_incomplete"]);
const CAMPOS_DA_ATIVIDADE = "text,resource_subtype,type,created_at,created_by.gid,created_by.name,target.gid,assignee.name";
const ACEITA_404 = { okStatuses: [404] };

const foiEncontrado = (respostaDoAsana) => respostaDoAsana && !respostaDoAsana.__status;
const foiApagada = (evento) => evento.action === "deleted" || evento.action === "removed";

/** A atividade não traz o anexo em si: procura pelo nome e, sem achar, usa o mais recente. */
async function acharAnexoDaAtividade(chamarAsana, taskGid, textoDaAtividade) {
  try {
    const resposta = await chamarAsana(`/attachments?parent=${taskGid}&opt_fields=gid,name,permalink_url,created_at`);
    const anexos = Array.isArray(resposta) ? resposta : [];
    return (
      anexos.find((anexo) => anexo.name && textoDaAtividade.includes(anexo.name)) ||
      anexos.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0] ||
      null
    );
  } catch {
    return null;
  }
}

async function textoDoAnexoAdicionado({ repo, chamarAsana, taskGid, textoOriginal }) {
  const anexo = await acharAnexoDaAtividade(chamarAsana, taskGid, textoOriginal);
  // Enviado pelo próprio sistema (📎 Anexar ao Asana): o comentário já foi registrado na hora do envio.
  if (anexo?.gid && (await repo.anexoRegistrado(anexo.gid))) return "";
  const nome = anexo?.name || textoOriginal.replace(/^.*?attached\s*/i, "") || "um arquivo";
  return textoDoAnexo(nome, anexo?.permalink_url);
}

/** Texto do comentário que representa a atividade; vazio quando ela não deve aparecer na demanda. */
async function textoDaAtividade({ repo, chamarAsana, story, taskGid }) {
  const subtipo = String(story.resource_subtype || "");
  const textoOriginal = String(story.text || "").trim();

  if (subtipo === "comment_added") return textoOriginal || "(comentário vazio)";
  if (ATIVIDADES_IGNORADAS.has(subtipo)) return "";
  if (subtipo === "attachment_added") return textoDoAnexoAdicionado({ repo, chamarAsana, taskGid, textoOriginal });
  if (subtipo === "assigned") return `👤 Definiu ${story.assignee?.name || "um responsável"} como responsável no Asana`;
  if (subtipo === "unassigned") return "👤 Removeu o responsável da tarefa no Asana";
  if (subtipo === "due_date_changed") return `📅 Alterou o prazo no Asana${textoOriginal ? ` (${textoOriginal})` : ""}`;
  if (story.type === "comment") return textoOriginal;
  return textoOriginal ? `🔔 Asana: ${textoOriginal}` : "";
}

async function atividadeAdicionada({ repo, chamarAsana, storyGid, evento }) {
  const story = await chamarAsana(`/stories/${storyGid}?opt_fields=${CAMPOS_DA_ATIVIDADE}`, ACEITA_404);
  if (!foiEncontrado(story)) return "ignorado";

  const subtipo = String(story.resource_subtype || "");
  // Comentário que o próprio sistema publicou voltando pelo webhook: descarta para não entrar em loop.
  if (subtipo === "comment_added" && ehComentarioDoSistema(story.text)) return "eco";

  const taskGid = String(story.target?.gid || evento.parent?.gid || "");
  if (ATIVIDADES_DE_SITUACAO.has(subtipo)) return avaliarSituacaoTarefa({ repo, chamarAsana, taskGid });

  const texto = await textoDaAtividade({ repo, chamarAsana, story, taskGid });
  if (!texto) return "ignorado";
  const demandaEncontrada = await repo.buscarDemandaPorTarefa(taskGid);
  if (!demandaEncontrada) return "sem-demanda";

  const comentarioId = `asana_${storyGid}`;
  await repo.adicionarComentario(demandaEncontrada.id, {
    id: comentarioId,
    texto,
    autor: String(story.created_by?.name || "").trim() || "Asana",
    createdAt: story.created_at || new Date().toISOString(),
    origem: "asana",
    asanaStoryGid: storyGid,
  });
  await repo.salvarVinculoStory(storyGid, { demandaId: demandaEncontrada.id, comentarioId, origem: "asana" });
  return "adicionado";
}

/** Comentário que o sistema mandou ao Asana: se foi apagado lá, só esquece o vínculo. */
async function atividadeDoSistemaAlterada({ repo, storyGid, vinculo, evento }) {
  if (foiApagada(evento)) {
    await Promise.all([repo.apagarVinculoStory(storyGid), repo.apagarEnvio(vinculo.demandaId, vinculo.comentarioId)]);
  }
  return "do-sistema";
}

async function comentarioDoAsanaEditado({ repo, chamarAsana, storyGid, vinculo }) {
  const story = await chamarAsana(`/stories/${storyGid}?opt_fields=text`, ACEITA_404);
  if (!foiEncontrado(story)) return "ignorado";
  await repo.editarComentario(vinculo.demandaId, vinculo.comentarioId, String(story.text || "").trim());
  return "editado";
}

async function comentarioDoAsanaApagado({ repo, storyGid, vinculo }) {
  await repo.removerComentario(vinculo.demandaId, vinculo.comentarioId);
  await repo.apagarVinculoStory(storyGid);
  return "apagado";
}

async function processarEventoAtividade({ repo, token, fetchImpl, evento }) {
  const storyGid = String(evento.resource.gid || "");
  if (!storyGid) return "ignorado";

  const vinculo = await repo.buscarVinculoStory(storyGid);
  const contexto = { repo, chamarAsana: criarCliente(token, fetchImpl), storyGid, vinculo, evento };

  if (evento.action === "added") return vinculo ? "ja-conhecido" : atividadeAdicionada(contexto);
  if (!vinculo) return "desconhecido";
  if (vinculo.origem !== "asana") return atividadeDoSistemaAlterada(contexto);
  if (evento.action === "changed") return comentarioDoAsanaEditado(contexto);
  if (foiApagada(evento)) return comentarioDoAsanaApagado(contexto);
  return "ignorado";
}

export { processarEventoAtividade };
