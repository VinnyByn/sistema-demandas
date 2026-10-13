/**
 * Supabase — banco, login e arquivos (substitui o Firebase).
 *
 * DEMANDAS_BACKEND define onde o app guarda os dados:
 *   "firebase"  — produção atual (padrão até a virada);
 *   "supabase"  — novo backend.
 * Para testar sem mudar a produção, abra o site com ?backend=supabase
 * (fica lembrado neste navegador; ?backend=firebase volta ao padrão).
 *
 * A anon key é pública por definição: o que protege os dados são as regras (RLS)
 * do arquivo supabase/migrations. A service_role key NUNCA entra aqui.
 */
window.SUPABASE_CONFIG = {
  url: "",
  anonKey: "",
};

window.DEMANDAS_BACKEND = (function () {
  const PADRAO = "firebase";
  const CHAVE = "demandasBackend";
  const validos = ["firebase", "supabase"];
  // Sem URL/chave preenchidas não há Supabase para usar.
  if (!window.SUPABASE_CONFIG.url || !window.SUPABASE_CONFIG.anonKey) return PADRAO;
  try {
    const pedido = new URLSearchParams(location.search).get("backend");
    if (validos.includes(pedido)) {
      if (pedido === PADRAO) localStorage.removeItem(CHAVE);
      else localStorage.setItem(CHAVE, pedido);
      return pedido;
    }
    const lembrado = localStorage.getItem(CHAVE);
    if (validos.includes(lembrado)) return lembrado;
  } catch (_) {}
  return PADRAO;
})();
