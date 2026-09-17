/**
 * Login e-mail/senha — Firebase Authentication.
 */
const DemandasAuth = (function () {
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
      const code = err?.code || "";
      if (code === "auth/user-not-found") {
        throw new Error("Não há conta Firebase com este e-mail.");
      }
      throw new Error(mapAuthError(err));
    }
  }

  /**
   * Cria usuário com e-mail/senha sem trocar a sessão do admin
   * (segunda instância Firebase App).
   * @returns {{ user: object|null, existed: boolean }}
   */
  async function createUser(email, password) {
    if (typeof firebase === "undefined") throw new Error("Firebase Auth não carregou.");
    if (!isConfigured()) throw new Error("Firebase não configurado.");
    const mail = String(email || "").trim();
    const pass = String(password || "");
    if (!mail || !pass) throw new Error("Informe e-mail e senha.");
    if (pass.length < 6) throw new Error("A senha deve ter ao menos 6 caracteres.");

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
        throw new Error("Senha fraca. Use ao menos 6 caracteres.");
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
    mapAuthError,
  };
})();
