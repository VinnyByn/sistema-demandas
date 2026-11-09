/** Login por e-mail e senha (Supabase Auth). */
const DemandasAuth = (function () {
  const SENHA_MIN = 8;
  let cliente = null;
  let usuarioAtual = null;
  let onUserCallback = () => {};
  // Lido antes de criar o cliente, que limpa o endereço ao consumir o link que veio por e-mail.
  const linkDoEmail = typeof location !== "undefined" ? String(location.hash || "") : "";
  let precisaDefinirSenha = /[#&]type=(recovery|invite)\b/.test(linkDoEmail);

  function cfg() {
    return window.SUPABASE_CONFIG || {};
  }

  function isConfigured() {
    const c = cfg();
    return !!(c.url && c.publishableKey && !String(c.url).includes("COLOQUE") && !String(c.publishableKey).includes("COLOQUE"));
  }

  function getCliente() {
    if (typeof supabase === "undefined" || !isConfigured()) return null;
    if (!cliente) {
      // Fluxo implícito: o link de recuperação funciona mesmo aberto em outro navegador ou aparelho.
      cliente = supabase.createClient(cfg().url, cfg().publishableKey, {
        auth: { flowType: "implicit", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
    }
    return cliente;
  }

  function mapAuthError(err) {
    const mensagens = {
      invalid_credentials: "E-mail ou senha incorretos.",
      email_not_confirmed: "Este login ainda não foi confirmado. Fale com o administrador.",
      user_banned: "Usuário desativado. Fale com o administrador.",
      email_address_invalid: "E-mail inválido.",
      email_address_not_authorized: "O envio de e-mails não está configurado no servidor. Fale com o administrador.",
      over_request_rate_limit: "Muitas tentativas. Aguarde alguns minutos.",
      over_email_send_rate_limit: "Muitos e-mails enviados. Aguarde alguns minutos.",
      weak_password: `Senha fraca. Use ao menos ${SENHA_MIN} caracteres.`,
      same_password: "A nova senha precisa ser diferente da atual.",
    };
    if (mensagens[err?.code]) return mensagens[err.code];
    if (err?.name === "AuthRetryableFetchError" || /failed to fetch|networkerror|load failed/i.test(String(err?.message || ""))) {
      return "Sem conexão. Verifique a internet.";
    }
    return err?.message || "Não foi possível entrar. Tente novamente.";
  }

  function normalizarUsuario(user) {
    if (!user) return null;
    return { id: user.id, uid: user.id, email: user.email || "", displayName: String(user.user_metadata?.display_name || "") };
  }

  function init(onUser) {
    if (typeof onUser === "function") onUserCallback = onUser;
    const c = getCliente();
    if (!c) {
      onUserCallback(null);
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      let primeiraVez = true;
      c.auth.onAuthStateChange((evento, sessao) => {
        if (evento === "PASSWORD_RECOVERY") precisaDefinirSenha = true;
        // Inclui a sessão que expira ou é encerrada em outra aba, sem passar pelo botão Sair.
        if (evento === "SIGNED_OUT" && typeof DemandasNuvem !== "undefined") DemandasNuvem.apagarCopiasLocais();
        const novo = normalizarUsuario(sessao?.user);
        const mudou = primeiraVez || (novo?.id || null) !== (usuarioAtual?.id || null);
        usuarioAtual = novo;
        // Fora deste callback: ele roda dentro da trava do cliente, e chamar o Supabase aqui travaria tudo.
        if (mudou) setTimeout(() => onUserCallback(novo), 0);
        if (primeiraVez) {
          primeiraVez = false;
          resolve(c);
        }
      });
    });
  }

  function currentUser() {
    return usuarioAtual;
  }

  async function signIn(email, password) {
    const c = getCliente();
    if (!c) throw new Error("O login não carregou. Recarregue a página (Ctrl+F5).");
    const { data, error } = await c.auth.signInWithPassword({ email: String(email).trim(), password });
    if (error) throw error;
    usuarioAtual = normalizarUsuario(data?.user) || usuarioAtual;
    return data;
  }

  async function signOut() {
    const c = getCliente();
    if (!c) return;
    if (typeof DemandasNuvem?.teardown === "function") DemandasNuvem.teardown();
    usuarioAtual = null;
    if (typeof DemandasNuvem !== "undefined") DemandasNuvem.apagarCopiasLocais();
    const { error } = await c.auth.signOut({ scope: "local" });
    if (error) DemandasLog.aviso("Encerrar sessão", error);
    onUserCallback(null);
  }

  /** O servidor não conta se o e-mail tem conta, para não revelar quem é da equipe. */
  async function sendPasswordReset(email) {
    const c = getCliente();
    if (!c) throw new Error("O login não carregou. Recarregue a página (Ctrl+F5).");
    const mail = String(email || "").trim().toLowerCase();
    if (!mail) throw new Error("Informe o e-mail.");
    const origem = typeof location !== "undefined" && location.origin ? location.origin : "https://demproj-fdeac.web.app";
    const { error } = await c.auth.resetPasswordForEmail(mail, { redirectTo: `${origem}/` });
    if (error) throw new Error(mapAuthError(error));
  }

  async function updatePassword(currentPassword, newPassword) {
    const c = getCliente();
    if (!c || !usuarioAtual) throw new Error("Faça login novamente para trocar a senha.");
    const nova = String(newPassword || "");
    if (nova.length < SENHA_MIN) throw new Error(`A senha deve ter ao menos ${SENHA_MIN} caracteres.`);
    const conferida = await c.auth.signInWithPassword({ email: usuarioAtual.email, password: String(currentPassword || "") });
    if (conferida.error) {
      throw new Error(conferida.error.code === "invalid_credentials" ? "Senha atual incorreta." : mapAuthError(conferida.error));
    }
    const { error } = await c.auth.updateUser({ password: nova });
    if (error) throw new Error(mapAuthError(error));
  }

  /** Definir a senha ao chegar pelo link do e-mail (convite ou "esqueci a senha"): já existe sessão, não há senha atual. */
  async function definirNovaSenha(newPassword) {
    const c = getCliente();
    if (!c || !usuarioAtual) throw new Error("O link expirou. Peça um novo em «Esqueci a senha».");
    const nova = String(newPassword || "");
    if (nova.length < SENHA_MIN) throw new Error(`A senha deve ter ao menos ${SENHA_MIN} caracteres.`);
    const { error } = await c.auth.updateUser({ password: nova });
    if (error) throw new Error(mapAuthError(error));
    precisaDefinirSenha = false;
  }

  function erroDoLink() {
    return /[#&]error_code=/.test(linkDoEmail) ? "O link do e-mail expirou ou já foi usado. Peça um novo em «Esqueci a senha»." : "";
  }

  async function createUser(email, password, { nome = "" } = {}) {
    if (!isConfigured()) throw new Error("O login não está configurado.");
    const mail = String(email || "").trim().toLowerCase();
    const pass = String(password || "");
    if (!mail) throw new Error("Informe o e-mail.");
    if (pass && pass.length < SENHA_MIN) throw new Error(`A senha deve ter ao menos ${SENHA_MIN} caracteres.`);
    const res = await DemandasNuvem.chamar("criarContaLogin", { email: mail, senha: pass, nome });
    const d = res?.data || {};
    return { existed: !!d.existia, created: !!d.criada, invite: !!d.convite, senhaIgnorada: !!d.senhaIgnorada };
  }

  return {
    isConfigured,
    cliente: getCliente,
    init,
    currentUser,
    signIn,
    signOut,
    createUser,
    sendPasswordReset,
    updatePassword,
    definirNovaSenha,
    precisaDefinirSenha: () => precisaDefinirSenha,
    dispensarDefinirSenha: () => {
      precisaDefinirSenha = false;
    },
    erroDoLink,
    mapAuthError,
    SENHA_MIN,
  };
})();
