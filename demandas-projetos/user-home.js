/**
 * Tela inicial por usuário (e-mail do Firebase Auth).
 *
 * esteira: "operacional" → Esteira Projetos | "b2b" → Esteira B2B
 * tab: "esteira" (padrão) | "dashboard" | "usuarios"
 *
 * Use o e-mail completo em minúsculas, igual ao login.
 */
// A esteira de cada conta agora fica no doc meta (userHomes), definida pelo admin na aba Usuários
// — a lista de e-mails não vai mais no código público. Este mapa fica só como reserva local.
window.DEMANDAS_USER_HOME = {};

window.DemandasUserHome = {
  defaultHome: { tab: "esteira", esteira: "operacional" },

  resolve(user) {
    const email = String(user?.email || "")
      .trim()
      .toLowerCase();
    const map = window.DEMANDAS_USER_HOME || {};
    const daNuvem =
      email && typeof DemandasRoles !== "undefined" && DemandasRoles.homeEsteiraForEmail
        ? DemandasRoles.homeEsteiraForEmail(email)
        : "operacional";
    const raw = email ? (daNuvem !== "operacional" ? { esteira: daNuvem } : map[email]) : null;
    if (!raw || typeof raw !== "object") {
      return { ...this.defaultHome };
    }
    const esteira = raw.esteira === "b2b" ? "b2b" : "operacional";
    const tab = ["esteira", "dashboard", "usuarios"].includes(raw.tab) ? raw.tab : "esteira";
    return { tab, esteira };
  },
};
