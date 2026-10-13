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
  url: "https://fcvyssnaruyyprecedan.supabase.co",
  anonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZjdnlzc25hcnV5eXByZWNlZGFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5MDkwMTIsImV4cCI6MjEwNzQ4NTAxMn0.E-P5-yCSefdqvmQXIfWh_DFEkM_Uuy2ZoxN9QgBGABM",
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
