/*
 * Teste de segurança no projeto Supabase de verdade. Abra o site, entre com uma conta de PROJETISTA (sem login, roda só a parte
 * do visitante), abra o console (F12), cole tudo isto e tecle Enter. No Chrome, digite antes: allow pasting
 * Não altera dados quando as regras estão certas. Com qualquer linha "FALHOU", não libere o sistema. Ver docs/seguranca.md.
 */
(async () => {
  const { url, publishableKey: chave } = window.SUPABASE_CONFIG;
  const linhas = [];
  const anotar = (teste, ok, obtido = "") => linhas.push({ teste, resultado: ok ? "ok" : "FALHOU", obtido: String(obtido).slice(0, 80) });
  const NINGUEM = "__nao_existe__";

  async function recusado(teste, consulta) {
    const { error } = await consulta;
    anotar(teste, !!error, error ? error.code || error.message : "passou");
  }

  // ---- Configuração pública do login ----
  const config = await (await fetch(`${url}/auth/v1/settings`, { headers: { apikey: chave } })).json();
  anotar("cadastro público fechado", config.disable_signup === true, config.disable_signup);
  anotar("e-mail precisa ser confirmado", config.mailer_autoconfirm === false, config.mailer_autoconfirm);
  anotar("conta anônima desligada", !config.external?.anonymous_users, config.external?.anonymous_users);

  // ---- Visitante, só com a chave pública ----
  const visitante = supabase.createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false, storageKey: "teste-seguranca" } });
  if (config.disable_signup === true) {
    const { error } = await visitante.auth.signUp({ email: `teste-${Date.now()}@example.invalid`, password: "Teste-seguranca-123" });
    anotar("criar conta pelo navegador é recusado", !!error, error?.code || "conta criada");
  }
  for (const tabela of ["demandas", "sistema_meta", "sistema_backups", "acessos_historico", "asana_webhooks", "asana_envios"]) {
    const { data, error } = await visitante.from(tabela).select("*").limit(1);
    anotar(`visitante não lê ${tabela}`, !!error || !data?.length, error?.code || `${data?.length} linha(s)`);
  }
  await recusado("visitante não grava demanda", visitante.rpc("demanda_salvar", { p_id: NINGUEM, p_campos: {} }));
  await recusado("visitante não altera acessos", visitante.rpc("acessos_salvar", { p_campos: {} }));
  await recusado("visitante não descobre o admin", visitante.rpc("acesso_admin_principal"));
  await recusado("tabela de contas não está exposta", visitante.schema("auth").from("users").select("id").limit(1));
  const lista = await visitante.storage.from("backups").list();
  anotar("visitante não lista backups", !!lista.error || !lista.data?.length, lista.error?.message || `${lista.data?.length} arquivo(s)`);
  for (const funcao of ["api", "backup-diario", "asana-webhook"]) {
    const resposta = await fetch(`${url}/functions/v1/${funcao}`, { method: "POST", headers: { apikey: chave, Authorization: `Bearer ${chave}`, "Content-Type": "application/json" }, body: JSON.stringify({ acao: "listarContasLogin", dados: {} }) });
    anotar(`função ${funcao} recusa quem não se identifica`, resposta.status >= 400, resposta.status);
  }

  // ---- Conta logada ----
  const c = DemandasAuth.cliente();
  const eu = DemandasAuth.currentUser()?.email;
  const nivel = eu ? (await c.rpc("acesso_nivel")).data : "";
  if (!eu) {
    anotar("parte logada não rodou: entre com uma conta de projetista", true);
  } else if (nivel !== "escrita") {
    anotar(`parte logada exige projetista, e esta conta é "${nivel}"`, false, nivel);
  } else {
    // Vazio de propósito: se a regra estivesse aberta, um mapa de papéis aqui substituiria a lista inteira da equipe.
    await recusado("alterar acessos sem ser admin (acessos_salvar)", c.rpc("acessos_salvar", { p_campos: {} }));
    await recusado("promover a si mesmo (meta_salvar)", c.rpc("meta_salvar", { p_campos: { roles: { [eu]: "projetista" } } }));
    await recusado("escrever direto em sistema_meta", c.from("sistema_meta").update({ dados: {} }).eq("id", NINGUEM));
    await recusado("escrever direto em demandas", c.from("demandas").update({ dados: {} }).eq("id", NINGUEM));
    await recusado("apagar direto em demandas", c.from("demandas").delete().eq("id", NINGUEM));
    await recusado("função interna acesso_nivel_de", c.rpc("acesso_nivel_de", { p_email: eu, p_meta: {} }));
    await recusado("função interna do Asana", c.rpc("asana_buscar_webhook", { p_projeto_gid: NINGUEM }));
    await recusado("segredo do webhook", c.from("asana_webhooks").select("*"));
    const historico = await c.from("acessos_historico").select("*").limit(1);
    anotar("histórico de acessos é só de admin", !!historico.error || !historico.data?.length, historico.error?.code || `${historico.data?.length} linha(s)`);
    const arquivos = await c.storage.from("backups").list();
    anotar("backups são só de admin", !!arquivos.error || !arquivos.data?.length, arquivos.error?.message || `${arquivos.data?.length} arquivo(s)`);

    await c.auth.updateUser({ data: { teste_papel: "admin" } });
    anotar("metadados da conta não dão poder", (await c.rpc("acesso_nivel")).data === "escrita");
    await c.auth.updateUser({ data: { teste_papel: null } });
    for (const acao of ["criarContaLogin", "listarContasLogin", "backupAgora"]) {
      const resultado = await DemandasNuvem.chamar(acao, { email: "", role: "admin" }).then(() => "passou", (e) => e.code);
      anotar(`${acao} é só de admin`, resultado === "functions/permission-denied", resultado);
    }
  }

  const falhas = linhas.filter((l) => l.resultado !== "ok");
  console.table(linhas);
  console.log(falhas.length ? `${falhas.length} FALHA(S): não libere o sistema para a equipe.` : `Tudo certo (${linhas.length} verificações).`);
  return linhas;
})();
