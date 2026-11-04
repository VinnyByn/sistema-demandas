/**
 * Login e-mail/senha — Firebase Authentication.
 */
const DemandasAuth = (function () {
  /** Tamanho mínimo de senha (o mesmo da função criarContaLogin). */
  const SENHA_MIN = 8;
  let auth = null;
  let onUserCallback = () => {};

  function isConfigured() {
    const c = window.FIREBASE_CONFIG || {};
    return !!(c.apiKey && c.projectId && !String(c.apiKey).includes("COLOQUE"));
  }

  function mapAuthError(err) {
    const code = err?.code || "";
    const map = {
      "auth/invalid-email": "E-mail inválido.",
      "auth/user-disabled": "Usuário desativado. Fale com o administrador.",
      "auth/user-not-found": "E-mail ou senha incorretos.",
      "auth/wrong-password": "E-mail ou senha incorretos.",
      "auth/invalid-credential": "E-mail ou senha incorretos.",
      "auth/invalid-login-credentials": "E-mail ou senha incorretos.",
      "auth/operation-not-allowed":
        "Login por e-mail/senha não está ativo no Firebase. Ative em Authentication → Sign-in method.",
      "auth/too-many-requests": "Muitas tentativas. Aguarde alguns minutos.",
      "auth/network-request-failed": "Sem conexão. Verifique a internet.",
      "auth/missing-password": "Informe a senha.",
      "auth/missing-email": "Informe o e-mail.",
      "auth/invalid-continue-uri": "URL de retorno inválida. Verifique o domínio no Firebase.",
      "auth/unauthorized-continue-uri":
        "Domínio não autorizado no Firebase (Authentication → Settings → Authorized domains).",
    };
    return map[code] || err?.message || "Não foi possível entrar. Tente novamente.";
  }

  function getAuth() {
    if (typeof firebase === "undefined") return null;
    if (!isConfigured()) return null;
    if (!auth) {
      const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(window.FIREBASE_CONFIG);
      auth = firebase.auth(app);
    }
    return auth;
  }

  /** Registra callback e espera o primeiro estado de auth. */
  function init(onUser) {
    if (typeof onUser === "function") onUserCallback = onUser;
    const a = getAuth();
    if (!a) {
      onUserCallback(null);
      return Promise.resolve(null);
    }
    return new Promise((resolve, reject) => {
      const unsub = a.onAuthStateChanged(
        (user) => {
          onUserCallback(user);
          resolve(a);
        },
        (err) => {
          console.error("Auth listener:", err);
          reject(err);
        },
      );
      void unsub;
    });
  }

  function currentUser() {
    return getAuth()?.currentUser || null;
  }

  async function signIn(email, password) {
    const a = getAuth();
    if (!a) throw new Error("Firebase Auth não carregou. Recarregue a página (Ctrl+F5).");
    return await a.signInWithEmailAndPassword(String(email).trim(), password);
  }

  async function signOut() {
    const a = getAuth();
    if (!a) return;
    if (typeof DemandasFirebase?.teardown === "function") DemandasFirebase.teardown();
    await a.signOut();
    onUserCallback(null);
  }

  /**
   * Envia e-mail do Firebase para redefinir a senha.
   * O usuário clica no link e define uma nova senha (não é possível “ver” a senha atual).
   */
  async function sendPasswordReset(email) {
    const a = getAuth();
    if (!a) throw new Error("Firebase Auth não carregou. Recarregue a página (Ctrl+F5).");
    const mail = String(email || "")
      .trim()
      .toLowerCase();
    if (!mail) throw new Error("Informe o e-mail.");
    const continueUrl =
      typeof window !== "undefined" && window.location?.origin
        ? `${window.location.origin}/`
        : "https://demproj-fdeac.web.app/";
    try {
      await a.sendPasswordResetEmail(mail, {
        url: continueUrl,
        handleCodeInApp: false,
      });
    } catch (err) {
      // Não conta para quem pede se o e-mail tem conta (evita descobrir quem é da equipe).
      if (err?.code === "auth/user-not-found") return;
      throw new Error(mapAuthError(err));
    }
  }

  async function updatePassword(currentPassword, newPassword) {
    const a = getAuth();
    const user = a?.currentUser;
    if (!a || !user) throw new Error("Faça login novamente para trocar a senha.");
    const next = String(newPassword || "");
    if (next.length < SENHA_MIN) throw new Error(`A senha deve ter ao menos ${SENHA_MIN} caracteres.`);
    const cred = firebase.auth.EmailAuthProvider.credential(user.email, String(currentPassword || ""));
    try {
      await user.reauthenticateWithCredential(cred);
      await user.updatePassword(next);
    } catch (err) {
      const code = err?.code || "";
      if (
        code === "auth/wrong-password" ||
        code === "auth/invalid-credential" ||
        code === "auth/invalid-login-credentials"
      ) {
        throw new Error("Senha atual incorreta.");
      }
      if (code === "auth/weak-password") {
        throw new Error(`Senha fraca. Use ao menos ${SENHA_MIN} caracteres.`);
      }
      if (code === "auth/requires-recent-login") {
        throw new Error("Entre de novo e tente trocar a senha.");
      }
      throw new Error(mapAuthError(err));
    }
  }

  /**
   * Cria o login pela função criarContaLogin (Admin SDK; o servidor confere se é administrador).
   * Sem senha, a conta nasce com senha aleatória e `invite: true` — mande o e-mail de definir senha.
   * Se a função ainda não foi publicada, cai no cadastro antigo pelo navegador (só com senha).
   * @returns {{ existed: boolean|null, created: boolean, invite: boolean }}
   *   existed null = não deu para conferir (cadastro antigo, sem senha).
   */
  async function createUser(email, password, { nome = "" } = {}) {
    if (typeof firebase === "undefined") throw new Error("Firebase Auth não carregou.");
    if (!isConfigured()) throw new Error("Firebase não configurado.");
    const mail = String(email || "")
      .trim()
      .toLowerCase();
    const pass = String(password || "");
    if (!mail) throw new Error("Informe o e-mail.");
    if (pass && pass.length < SENHA_MIN) throw new Error(`A senha deve ter ao menos ${SENHA_MIN} caracteres.`);

    if (firebase.functions) {
      try {
        const res = await firebase.app().functions("us-central1").httpsCallable("criarContaLogin")({
          email: mail,
          senha: pass,
          nome,
        });
        const d = res?.data || {};
        return { existed: !!d.existia, created: !!d.criada, invite: !!d.convite };
      } catch (err) {
        const code = String(err?.code || "");
        // Função não publicada (404, ou a falha de CORS que o navegador mostra como "internal").
        const naoPublicada = code === "functions/not-found" || (code === "functions/internal" && err?.message === "internal");
        if (!naoPublicada) throw new Error(err?.message || "Não foi possível criar a conta.");
        console.warn("criarContaLogin indisponível; usando o cadastro pelo navegador:", err);
      }
    }
    if (!pass) return { existed: null, created: false, invite: false };
    const legado = await createUserInBrowser(mail, pass);
    return { existed: legado.existed, created: !legado.existed, invite: false };
  }

  /**
   * Cadastro antigo, pelo navegador, sem trocar a sessão do admin (segunda instância Firebase App).
   * Só funciona com o cadastro público ligado no Firebase — fica como reserva até a função estar no ar.
   */
  async function createUserInBrowser(mail, pass) {
    let secondaryApp;
    try {
      secondaryApp = firebase.app("adminCreate");
    } catch (_) {
      secondaryApp = firebase.initializeApp(window.FIREBASE_CONFIG, "adminCreate");
    }
    const secondaryAuth = firebase.auth(secondaryApp);
    try {
      const cred = await secondaryAuth.createUserWithEmailAndPassword(mail, pass);
      await secondaryAuth.signOut();
      return { user: cred.user, existed: false };
    } catch (err) {
      try {
        await secondaryAuth.signOut();
      } catch (_) {}
      const code = err?.code || "";
      if (code === "auth/email-already-in-use") {
        return { user: null, existed: true };
      }
      if (code === "auth/weak-password") {
        throw new Error(`Senha fraca. Use ao menos ${SENHA_MIN} caracteres.`);
      }
      if (code === "auth/admin-restricted-operation" || code === "auth/operation-not-allowed") {
        throw new Error("O cadastro pelo navegador está desligado. Publique a função criarContaLogin (firebase deploy --only functions).");
      }
      throw new Error(mapAuthError(err));
    }
  }

  return {
    isConfigured,
    init,
    currentUser,
    signIn,
    signOut,
    createUser,
    sendPasswordReset,
    updatePassword,
    mapAuthError,
    SENHA_MIN,
  };
})();
