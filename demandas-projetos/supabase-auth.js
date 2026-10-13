/**
 * Login e-mail/senha — Supabase Auth.
 * Mesma interface do DemandasAuth do Firebase (firebase-auth.js usa este objeto
 * quando DEMANDAS_BACKEND = "supabase").
 */
window.DemandasSupabase = (function () {
  const SDK_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js";
  let cliente = null;
  let sdkPromise = null;

  function ativo() {
    return window.DEMANDAS_BACKEND === "supabase";
  }

  function isConfigured() {
    const c = window.SUPABASE_CONFIG || {};
    return !!(c.url && c.anonKey);
  }

  /** Carrega o supabase-js do CDN só quando o backend é o Supabase. */
  function carregarSdk() {
    if (window.supabase?.createClient) return Promise.resolve(window.supabase);
    if (sdkPromise) return sdkPromise;
    sdkPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = SDK_URL;
      s.async = true;
      s.onload = () =>
        window.supabase?.createClient ? resolve(window.supabase) : reject(new Error("Supabase não carregou."));
      s.onerror = () => {
        sdkPromise = null;
        reject(new Error("Não foi possível carregar o Supabase. Verifique a internet e recarregue."));
      };
      document.head.appendChild(s);
    });
    return sdkPromise;
  }

  async function obterCliente() {
    if (cliente) return cliente;
    if (!isConfigured()) throw new Error("Supabase não configurado (supabase-config.js).");
    const sdk = await carregarSdk();
    if (!cliente) {
      const c = window.SUPABASE_CONFIG;
      cliente = sdk.createClient(c.url, c.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
        realtime: { params: { eventsPerSecond: 20 } },
      });
    }
    return cliente;
  }

  /** Cliente já criado (null antes do login iniciar). */
  function clienteAtual() {
    return cliente;
  }

  return { ativo, isConfigured, obterCliente, clienteAtual };
})();

window.DemandasSupabaseAuth = !window.DemandasSupabase.ativo()
  ? null
  : (function () {
      const sb = window.DemandasSupabase;
      let onUserCallback = () => {};
      let usuario = null;
      let assinatura = null;

      /** Adapta o usuário do Supabase ao formato que o app lê (email, displayName, uid). */
      function adaptar(u) {
        if (!u) return null;
        const meta = u.user_metadata || {};
        return {
          uid: u.id,
          email: String(u.email || "").toLowerCase(),
          displayName: meta.nome || meta.full_name || meta.name || null,
          raw: u,
        };
      }

      function definirUsuario(u) {
        const novo = adaptar(u);
        // Mantém a mesma referência quando nada mudou (o app compara usuários).
        if (usuario && novo && usuario.uid === novo.uid && usuario.email === novo.email) {
          usuario.displayName = novo.displayName;
          usuario.raw = novo.raw;
          return usuario;
        }
        usuario = novo;
        return usuario;
      }

      function mapAuthError(err) {
        const msg = String(err?.message || "");
        const code = String(err?.code || "");
        const tabela = [
          [/invalid login credentials|invalid_credentials/i, "E-mail ou senha incorretos."],
          [/email not confirmed|email_not_confirmed/i, "E-mail ainda não confirmado. Abra o link enviado ou fale com o administrador."],
          [/user is banned|user_banned/i, "Usuário desativado. Fale com o administrador."],
          [/rate limit|too many|over_request_rate_limit|over_email_send_rate_limit/i, "Muitas tentativas. Aguarde alguns minutos."],
          [/failed to fetch|networkerror|network request failed|load failed/i, "Sem conexão. Verifique a internet."],
          [/password should be at least|weak_password/i, "Senha fraca. Use ao menos 6 caracteres."],
          [/same_password|should be different/i, "A nova senha deve ser diferente da atual."],
          [/signup.*disabled|signup_disabled/i, "Cadastro desativado. Peça acesso ao administrador."],
        ];
        for (const [re, texto] of tabela) {
          if (re.test(code) || re.test(msg)) return texto;
        }
        return msg || "Não foi possível entrar. Tente novamente.";
      }

      function erroTraduzido(err) {
        const e = new Error(mapAuthError(err));
        e.code = err?.code;
        return e;
      }

      function isConfigured() {
        return sb.isConfigured();
      }

      /** Registra callback e espera o primeiro estado de auth. */
      async function init(onUser) {
        if (typeof onUser === "function") onUserCallback = onUser;
        if (!isConfigured()) {
          onUserCallback(null);
          return null;
        }
        const cliente = await sb.obterCliente();
        if (assinatura) assinatura.unsubscribe();
        return await new Promise((resolve) => {
          let primeiro = true;
          // uid já avisado ao app; o Supabase repete SIGNED_IN ao voltar para a aba.
          let avisado;
          const { data } = cliente.auth.onAuthStateChange((evento, sessao) => {
            const u = definirUsuario(sessao?.user || null);
            // Não chamar o Supabase dentro deste callback (trava o cliente): adia.
            setTimeout(() => {
              if (evento === "PASSWORD_RECOVERY") abrirNovaSenha();
              const uid = u?.uid || null;
              if (primeiro || uid !== avisado) {
                avisado = uid;
                onUserCallback(u);
              }
              if (primeiro) {
                primeiro = false;
                resolve(cliente);
              }
            }, 0);
          });
          assinatura = data?.subscription || null;
        });
      }

      function currentUser() {
        return usuario;
      }

      async function signIn(email, password) {
        const cliente = await sb.obterCliente();
        const { data, error } = await cliente.auth.signInWithPassword({
          email: String(email).trim().toLowerCase(),
          password,
        });
        if (error) throw erroTraduzido(error);
        definirUsuario(data?.user || null);
        return { user: usuario };
      }

      async function signOut() {
        const cliente = sb.clienteAtual();
        if (typeof DemandasFirebase?.teardown === "function") DemandasFirebase.teardown();
        if (cliente) await cliente.auth.signOut();
        usuario = null;
        // O evento SIGNED_OUT também avisa o app; aqui garante a tela de login na hora.
        onUserCallback(null);
      }

      async function sendPasswordReset(email) {
        const mail = String(email || "")
          .trim()
          .toLowerCase();
        if (!mail) throw new Error("Informe o e-mail.");
        const cliente = await sb.obterCliente();
        const { error } = await cliente.auth.resetPasswordForEmail(mail, {
          redirectTo: `${window.location.origin}${window.location.pathname}`,
        });
        if (error) throw erroTraduzido(error);
      }

      async function updatePassword(currentPassword, newPassword) {
        const cliente = sb.clienteAtual();
        if (!cliente || !usuario) throw new Error("Faça login novamente para trocar a senha.");
        const nova = String(newPassword || "");
        if (nova.length < 6) throw new Error("A senha deve ter ao menos 6 caracteres.");
        const conferir = await cliente.auth.signInWithPassword({
          email: usuario.email,
          password: String(currentPassword || ""),
        });
        if (conferir.error) {
          if (/invalid login credentials|invalid_credentials/i.test(conferir.error.message || conferir.error.code || "")) {
            throw new Error("Senha atual incorreta.");
          }
          throw erroTraduzido(conferir.error);
        }
        const { error } = await cliente.auth.updateUser({ password: nova });
        if (error) throw erroTraduzido(error);
      }

      /**
       * Cria usuário com e-mail/senha sem trocar a sessão do admin
       * (Edge Function admin-usuarios, que usa a chave de serviço no servidor).
       * @returns {{ user: object|null, existed: boolean }}
       */
      async function createUser(email, password) {
        const mail = String(email || "")
          .trim()
          .toLowerCase();
        const pass = String(password || "");
        if (!mail || !pass) throw new Error("Informe e-mail e senha.");
        if (pass.length < 6) throw new Error("A senha deve ter ao menos 6 caracteres.");
        const cliente = await sb.obterCliente();
        const { data, error } = await cliente.functions.invoke("admin-usuarios", {
          body: { acao: "criar", email: mail, senha: pass },
        });
        if (error) {
          let detalhe = "";
          try {
            detalhe = (await error.context?.json?.())?.erro || "";
          } catch (_) {}
          throw new Error(detalhe || mapAuthError(error));
        }
        if (data?.erro) throw new Error(data.erro);
        return { user: data?.usuario || null, existed: !!data?.existia };
      }

      /** Link de «Esqueci a senha»: pede a nova senha assim que o usuário volta ao site. */
      function abrirNovaSenha() {
        if (document.getElementById("dlgSupabaseNovaSenha")) return;
        const dlg = document.createElement("dialog");
        dlg.id = "dlgSupabaseNovaSenha";
        dlg.className = "modal";
        dlg.innerHTML = `
          <form method="dialog" class="modal__body" style="display:grid;gap:12px;min-width:min(360px,90vw)">
            <h2 style="margin:0">Definir nova senha</h2>
            <label>Nova senha <input type="password" name="nova" minlength="6" required autocomplete="new-password" /></label>
            <label>Repita a senha <input type="password" name="repete" minlength="6" required autocomplete="new-password" /></label>
            <p class="login-error" data-erro hidden></p>
            <div style="display:flex;gap:8px;justify-content:flex-end">
              <button type="submit" class="btn btn--primary">Salvar senha</button>
            </div>
          </form>`;
        document.body.appendChild(dlg);
        const form = dlg.querySelector("form");
        const erro = dlg.querySelector("[data-erro]");
        form.addEventListener("submit", async (ev) => {
          ev.preventDefault();
          const nova = form.nova.value;
          erro.hidden = true;
          if (nova !== form.repete.value) {
            erro.textContent = "As senhas não conferem.";
            erro.hidden = false;
            return;
          }
          const { error } = await sb.clienteAtual().auth.updateUser({ password: nova });
          if (error) {
            erro.textContent = mapAuthError(error);
            erro.hidden = false;
            return;
          }
          dlg.close();
          dlg.remove();
          if (typeof window.toast === "function") window.toast("Senha atualizada");
        });
        dlg.showModal();
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
      };
    })();
