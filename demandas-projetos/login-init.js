/**
 * Login independente — carrega antes do app.js para o botão Entrar sempre funcionar.
 */
(function () {
  function showErr(msg) {
    const el = document.getElementById("loginError");
    const ok = document.getElementById("loginOk");
    if (ok) {
      ok.textContent = "";
      ok.hidden = true;
    }
    if (!el) return;
    if (msg) {
      el.textContent = msg;
      el.hidden = false;
    } else {
      el.textContent = "";
      el.hidden = true;
    }
  }

  function showOk(msg) {
    const el = document.getElementById("loginOk");
    const err = document.getElementById("loginError");
    if (err) {
      err.textContent = "";
      err.hidden = true;
    }
    if (!el) return;
    if (msg) {
      el.textContent = msg;
      el.hidden = false;
    } else {
      el.textContent = "";
      el.hidden = true;
    }
  }

  function setLoading(on) {
    const btn = document.getElementById("btnLoginSubmit");
    const forgot = document.getElementById("btnForgotPassword");
    if (btn) {
      btn.disabled = on;
      btn.textContent = on ? "Entrando…" : "Entrar";
    }
    if (forgot) forgot.disabled = on;
  }

  function setForgotLoading(on) {
    const btn = document.getElementById("btnForgotPassword");
    const login = document.getElementById("btnLoginSubmit");
    if (btn) {
      btn.disabled = on;
      btn.textContent = on ? "Enviando…" : "Esqueci a senha";
    }
    if (login) login.disabled = on;
  }

  async function waitForAppHandler(user, maxMs) {
    const start = Date.now();
    while (Date.now() - start < maxMs) {
      if (typeof window.onDemandasAuthReady === "function") {
        try {
          await window.onDemandasAuthReady(user);
          return true;
        } catch (err) {
          console.error("Pós-login:", err);
          showErr(err.message || "Erro ao abrir o painel.");
          return false;
        }
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    return false;
  }

  async function doLoginSubmit(e) {
    e.preventDefault();
    showErr("");

    if (typeof DemandasAuth === "undefined") {
      showErr("Autenticação não carregou. Recarregue a página (Ctrl+F5).");
      return;
    }

    const email = document.getElementById("loginEmail")?.value?.trim() || "";
    const password = document.getElementById("loginPassword")?.value || "";
    if (!email || !password) {
      showErr("Informe e-mail e senha.");
      return;
    }

    setLoading(true);
    try {
      await DemandasAuth.signIn(email, password);
      const user = DemandasAuth.currentUser();
      if (!user) {
        showErr("Sessão não reconhecida. Tente novamente.");
        return;
      }
      const ok = await waitForAppHandler(user, 8000);
      if (!ok) {
        showErr(
          "Não foi possível abrir o painel. Confira se app-boot.js e app.js carregaram (F12 → Rede) e recarregue com Ctrl+F5.",
        );
      }
    } catch (err) {
      console.error("Login:", err);
      showErr(DemandasAuth.mapAuthError ? DemandasAuth.mapAuthError(err) : err.message || "Erro ao entrar.");
    } finally {
      setLoading(false);
    }
  }

  async function doForgotPassword() {
    showErr("");
    showOk("");
    if (typeof DemandasAuth === "undefined" || typeof DemandasAuth.sendPasswordReset !== "function") {
      showErr("Recuperação de senha não carregou. Recarregue com Ctrl+F5.");
      return;
    }
    const email = document.getElementById("loginEmail")?.value?.trim() || "";
    if (!email) {
      showErr("Informe o e-mail para receber o link de recuperação.");
      document.getElementById("loginEmail")?.focus();
      return;
    }
    setForgotLoading(true);
    try {
      await DemandasAuth.sendPasswordReset(email);
      showOk(`Enviamos um link para ${email}. Abra o e-mail e defina uma nova senha.`);
    } catch (err) {
      console.error("Reset senha:", err);
      showErr(err?.message || "Não foi possível enviar o e-mail de recuperação.");
    } finally {
      setForgotLoading(false);
    }
  }

  function bindForm() {
    const form = document.getElementById("loginForm");
    if (!form || form.dataset.loginInit === "1") return;
    form.dataset.loginInit = "1";
    form.addEventListener("submit", (ev) => void doLoginSubmit(ev));
    document.getElementById("btnLoginSubmit")?.addEventListener("click", (ev) => {
      ev.preventDefault();
      void doLoginSubmit(ev);
    });
    document.getElementById("btnForgotPassword")?.addEventListener("click", () => {
      void doForgotPassword();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindForm);
  } else {
    bindForm();
  }

  window.demandasDoLogin = () => {
    const form = document.getElementById("loginForm");
    if (form) form.requestSubmit();
  };
})();
