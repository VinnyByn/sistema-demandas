/**
 * O que fica guardado neste navegador: a cópia dos dados e as alterações feitas sem conexão.
 * Tudo é por pessoa, e só com alguém logado: num computador compartilhado, quem entra depois não recebe os dados de quem saiu.
 */
const DemandasCopiaLocal = (function () {
  const CHAVE_DA_COPIA = "demandasProjetos_v1";
  const CHAVE_DOS_PENDENTES = "demandasProjetos_pendentes_v1";
  const BANCOS_DO_FIREBASE = /^firestore\/|^firebase/;

  let acessoNegado = false;

  function emailAtual() {
    return String(DemandasAuth?.currentUser?.()?.email || "").trim().toLowerCase();
  }

  function chaveDaCopia() {
    if (acessoNegado) return null;
    const email = emailAtual();
    if (email) return `${CHAVE_DA_COPIA}:${email}`;
    // Sem nuvem configurada (desenvolvimento local), esta cópia é a única fonte dos dados.
    return DemandasAuth.isConfigured() ? null : CHAVE_DA_COPIA;
  }

  function carregar() {
    try {
      const chave = chaveDaCopia();
      const texto = chave && localStorage.getItem(chave);
      return texto ? JSON.parse(texto) : null;
    } catch {
      return null;
    }
  }

  function salvar(dados) {
    try {
      const chave = chaveDaCopia();
      if (chave) localStorage.setItem(chave, JSON.stringify(dados));
    } catch (erro) {
      DemandasLog.aviso("Cópia local", erro);
    }
  }

  function chavesGuardadas() {
    const chaves = [];
    for (let i = 0; i < localStorage.length; i += 1) chaves.push(localStorage.key(i));
    return chaves;
  }

  /** Apaga a cópia de outros logins e a da versão antiga, sem dono. As alterações ainda não enviadas ficam. */
  function apagarCopias({ manter = null } = {}) {
    try {
      for (const chave of chavesGuardadas()) {
        const ehCopia = chave === CHAVE_DA_COPIA || String(chave).startsWith(`${CHAVE_DA_COPIA}:`);
        if (ehCopia && chave !== manter) localStorage.removeItem(chave);
      }
    } catch (erro) {
      DemandasLog.aviso("Apagar cópia local", erro);
    }
  }

  function manterSoACopiaDoUsuarioAtual() {
    apagarCopias({ manter: chaveDaCopia() });
  }

  /** O servidor recusou a pessoa: nada dela fica no aparelho, e nada mais é gravado. */
  function negarAcesso() {
    acessoNegado = true;
    apagarCopias();
  }

  function reiniciar() {
    acessoNegado = false;
  }

  // A versão Firebase guardava toda a base no IndexedDB do navegador, e nada mais a apaga depois da migração.
  async function apagarRestosDoFirebase() {
    if (typeof indexedDB === "undefined" || typeof indexedDB.databases !== "function") return;
    try {
      for (const { name } of await indexedDB.databases()) {
        if (BANCOS_DO_FIREBASE.test(String(name))) indexedDB.deleteDatabase(name);
      }
    } catch (erro) {
      DemandasLog.aviso("Apagar dados antigos", erro);
    }
  }

  const chaveDosPendentes = () => `${CHAVE_DOS_PENDENTES}:${emailAtual()}`;

  function lerPendentes() {
    try {
      return JSON.parse(localStorage.getItem(chaveDosPendentes()) || "{}") || {};
    } catch {
      return {};
    }
  }

  function gravarPendentes(pendentes) {
    try {
      if (Object.keys(pendentes).length) localStorage.setItem(chaveDosPendentes(), JSON.stringify(pendentes));
      else localStorage.removeItem(chaveDosPendentes());
    } catch (erro) {
      DemandasLog.aviso("Alterações pendentes", erro);
    }
  }

  return {
    emailAtual,
    carregar,
    salvar,
    apagarCopias,
    manterSoACopiaDoUsuarioAtual,
    negarAcesso,
    acessoFoiNegado: () => acessoNegado,
    reiniciar,
    apagarRestosDoFirebase,
    lerPendentes,
    gravarPendentes,
  };
})();
