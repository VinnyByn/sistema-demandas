/**
 * Tela inicial por usuário (e-mail do Firebase Auth).
 *
 * esteira: "operacional" → Esteira Projetos | "b2b" → Esteira B2B
 * tab: "esteira" (padrão) | "dashboard" | "usuarios"
 *
 * Use o e-mail completo em minúsculas, igual ao login.
 */
window.DEMANDAS_USER_HOME = {
  "alberto.soares@soumaster.com.br": { esteira: "b2b" },
  "rafael.mesquita@soumaster.com.br": { esteira: "b2b" },
};

window.DemandasUserHome = {
  defaultHome: { tab: "esteira", esteira: "operacional" },

  resolve(user) {
    const email = String(user?.email || "")
      .trim()
      .toLowerCase();
    const map = window.DEMANDAS_USER_HOME || {};
    const raw = email ? map[email] : null;
    if (!raw || typeof raw !== "object") {
      return { ...this.defaultHome };
    }
    const esteira = raw.esteira === "b2b" ? "b2b" : "operacional";
    const tab = ["esteira", "dashboard", "usuarios"].includes(raw.tab) ? raw.tab : "esteira";
    return { tab, esteira };
  },
};
