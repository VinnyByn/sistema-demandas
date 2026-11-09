/** Projetos do Asana em que a demanda pode entrar. */
import { ASANA_PROJETOS } from "./constantes.mjs";
import { criarCliente } from "./cliente.mjs";

function projetoValido(gid) {
  return ASANA_PROJETOS.find((projeto) => projeto.gid === String(gid || "").trim()) || null;
}

/** Nome real de cada projeto no Asana; se a consulta falhar, usa o nome provisório da lista. */
async function nomesDosProjetos({ token, fetchImpl }) {
  const chamarAsana = criarCliente(token, fetchImpl);
  return Promise.all(
    ASANA_PROJETOS.map(async (projeto) => {
      try {
        const projetoAsana = await chamarAsana(`/projects/${projeto.gid}?opt_fields=name`);
        return { gid: projeto.gid, nome: String(projetoAsana?.name || "").trim() || projeto.nome };
      } catch {
        return { ...projeto };
      }
    }),
  );
}

export { projetoValido, nomesDosProjetos };
