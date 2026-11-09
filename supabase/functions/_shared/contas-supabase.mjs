/** Adaptador do Supabase Auth: é o `auth` do contas.mjs. Outro provedor = outro adaptador com os mesmos métodos. */

const USUARIOS_POR_PAGINA = 1000;
// Trava contra paginação que nunca termina (100 mil contas, muito acima do real).
const MAX_PAGINAS = 100;

const CODIGO_POR_ERRO_DO_SUPABASE = {
  email_exists: "email-ja-existe",
  user_already_exists: "email-ja-existe",
  weak_password: "senha-fraca",
  email_address_invalid: "email-invalido",
};

// O que não conhecemos sobe como veio.
function traduzirErro(erro) {
  const codigo = CODIGO_POR_ERRO_DO_SUPABASE[erro?.code];
  return codigo ? Object.assign(new Error(erro.message), { codigo, causa: erro }) : erro;
}

// O bloqueio no Supabase é uma data (banned_until): no futuro = bloqueada; "infinity" = sem fim.
function estaBloqueada(bannedUntil) {
  if (!bannedUntil) return false;
  if (bannedUntil === "infinity") return true;
  const ate = Date.parse(bannedUntil);
  return Number.isFinite(ate) && ate > Date.now();
}

function criarAdaptadorAuth(authAdmin) {
  return {
    async criarConta({ email, senha, nome }) {
      // E-mail já confirmado (quem cria é admin); sem senha informada não mandamos nenhuma.
      // O nome vai em user_metadata porque o Supabase não tem coluna de nome.
      const { error } = await authAdmin.createUser({
        email,
        email_confirm: true,
        ...(senha ? { password: senha } : {}),
        ...(nome ? { user_metadata: { display_name: nome } } : {}),
      });
      if (error) throw traduzirErro(error);
    },

    // A API não filtra por e-mail, então lê tudo. Basta para esta equipe.
    async listarContas() {
      const contas = [];
      for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
        const { data, error } = await authAdmin.listUsers({ page: pagina, perPage: USUARIOS_POR_PAGINA });
        if (error) throw error;
        for (const usuario of data.users) {
          contas.push({
            email: usuario.email,
            criadoEm: usuario.created_at,
            ultimoLogin: usuario.last_sign_in_at,
            desativada: estaBloqueada(usuario.banned_until),
          });
        }
        if (!data.nextPage || !data.users.length) break;
      }
      return contas;
    },
  };
}

export { criarAdaptadorAuth };
