// O que alguém digitaria no console do navegador, de verdade: login pela tela, biblioteca oficial, CSP ligada e regras no banco.
const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("@playwright/test");
const { criarSupabaseFalso } = require("./supabase-falso");

const SCRIPT_DO_CONSOLE = fs.readFileSync(path.join(__dirname, "../../scripts/seguranca/teste-no-console.js"), "utf8");

const SEED = "vinicius.morais@soumaster.com.br";
const SENHA = "senha-forte-1";
const CONTAS = [SEED, "ana@x.com", "bia@x.com", "caio@x.com", "estranho@x.com"];
const META = {
  diarias: [],
  projetistas: {},
  deletedDemandaIds: [],
  deletedDiariaIds: [],
  roles: { [SEED]: "admin", "ana@x.com": "admin", "bia@x.com": "projetista", "caio@x.com": "visibilidade" },
  disabledUsers: {},
  purgedUsers: {},
  userDisplayNames: {},
};
const TITULO = "Projeto Sigiloso";

let supabase;

test.beforeAll(async () => {
  supabase = await criarSupabaseFalso({ senhas: Object.fromEntries(CONTAS.map((e) => [e, SENHA])) });
});
test.afterAll(async () => {
  await supabase.banco.db.close();
});
test.beforeEach(async () => {
  supabase.configAuth.disable_signup = true;
  supabase.chamadasAsana.length = 0;
  supabase.metadados.clear();
  await supabase.banco.limpar();
  await supabase.banco.definirMeta(META);
  await supabase.banco.semear([
    { id: "p1", dados: { titulo: TITULO, solicitante: "cliente@empresa.com", status: "novo", tipo: "B2C", updatedAt: "2026-11-01T10:00:00.000Z" } },
    { id: "p2", dados: { titulo: "Sem vínculo", status: "novo", tipo: "B2C", updatedAt: "2026-11-01T10:00:00.000Z" } },
  ]);
});

async function abrir(page) {
  const saida = [];
  page.on("console", (m) => saida.push(m.text()));
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(`${e.effectiveDirective} ${e.blockedURI}`));
  });
  await supabase.ligar(page);
  await page.goto("/index.html");
  await page.waitForFunction(() => typeof DemandasAuth !== "undefined" && DemandasAuth.isConfigured());
  return saida;
}

async function entrar(page, email) {
  await page.fill("#loginEmail", email);
  await page.fill("#loginPassword", SENHA);
  await page.click("#btnLoginSubmit");
}

// A conta sem papel é posta para fora e a página recarrega: a marca some, e o aviso continua na tela de login.
async function entrarEVerSerPostoParaFora(page, email) {
  await page.evaluate(() => {
    window.__antesDeSair = true;
  });
  await entrar(page, email);
  await page.waitForFunction(() => !window.__antesDeSair && document.readyState === "complete" && document.getElementById("loginError")?.textContent.includes("acesso"), null, { timeout: 15000 });
}

async function entrarNoApp(page, email) {
  await entrar(page, email);
  await page.waitForFunction(() => typeof persistenceApi !== "undefined" && persistenceApi?.acessosCarregados?.());
}

// Toda tentativa de virar administrador sem ser um, escrita como no console.
const tentarVirarAdmin = async (eu) => {
  const c = DemandasAuth.cliente();
  const codigo = async (consulta) => {
    const { error } = await consulta;
    return error?.code || (error ? "erro" : "passou");
  };
  const resultado = {
    acessos_salvar: await codigo(c.rpc("acessos_salvar", { p_campos: { roles: { [eu]: "admin" } } })),
    meta_salvar: await codigo(c.rpc("meta_salvar", { p_campos: { roles: { [eu]: "admin" } } })),
    historico: await codigo(c.rpc("acessos_historico_registrar", { p_entradas: [{ alvo: eu, acao: "papel" }] })),
    meta_update: await codigo(c.from("sistema_meta").update({ dados: { roles: { [eu]: "admin" } } }).eq("id", "meta")),
    meta_insert: await codigo(c.from("sistema_meta").insert({ id: "meta", dados: {} })),
    meta_delete: await codigo(c.from("sistema_meta").delete().eq("id", "meta")),
    demanda_delete: await codigo(c.from("demandas").delete().eq("id", "p1")),
    demanda_update: await codigo(c.from("demandas").update({ dados: {} }).eq("id", "p1")),
    interna_nivel: await codigo(c.rpc("acesso_nivel_de", { p_email: "x", p_meta: {} })),
    interna_email: await codigo(c.rpc("acesso_email")),
    interna_asana: await codigo(c.rpc("asana_mesclar_demanda", { p_demanda_id: "p1", p_campos: {} })),
    segredo_webhook: await codigo(c.rpc("asana_buscar_webhook", { p_projeto_gid: "1" })),
    tabela_webhooks: await codigo(c.from("asana_webhooks").select("*")),
  };
  const funcaoDoServidor = async (nome, dados) => DemandasNuvem.chamar(nome, dados).then(() => "passou", (e) => e.code);
  resultado.criarConta = await funcaoDoServidor("criarContaLogin", { email: "invasor@x.com", senha: "senha-forte-1", role: "admin", papel: "admin", app_metadata: { role: "admin" } });
  resultado.listarContas = await funcaoDoServidor("listarContasLogin", {});
  resultado.backup = await funcaoDoServidor("backupAgora", {});
  return resultado;
};

const SO_RECUSAS = {
  acessos_salvar: "42501",
  meta_salvar: "42501",
  historico: "42501",
  meta_update: "42501",
  meta_insert: "42501",
  meta_delete: "42501",
  demanda_delete: "42501",
  demanda_update: "42501",
  interna_nivel: "42501",
  interna_email: "42501",
  interna_asana: "42501",
  segredo_webhook: "42501",
  tabela_webhooks: "42501",
  criarConta: "functions/permission-denied",
  listarContas: "functions/permission-denied",
  backup: "functions/permission-denied",
};

async function conferirSemVazamento(page, saida) {
  const texto = saida.join("\n");
  for (const dado of [TITULO, "cliente@empresa.com", "Sem vínculo", SEED, "ana@x.com", "bia@x.com", "caio@x.com"]) expect(texto, `«${dado}» apareceu no console`).not.toContain(dado);
  expect(await page.evaluate(() => window.__csp), "a CSP ligada não atrapalhou o app").toEqual([]);
}

test("projetista: nenhum comando de console o transforma em administrador", async ({ page }) => {
  const saida = await abrir(page);
  await entrarNoApp(page, "bia@x.com");
  expect(await page.evaluate(() => state.demandas.length)).toBe(2);
  expect(await page.evaluate(tentarVirarAdmin, "bia@x.com")).toEqual(SO_RECUSAS);

  const depois = await page.evaluate(async () => {
    const c = DemandasAuth.cliente();
    // Mexe em tudo o que a tela usa para decidir, como faria quem conhece o código.
    await c.auth.updateUser({ data: { role: "admin", papel: "admin", is_admin: true, display_name: "Administrador" } });
    DemandasRoles.setRolesMap({ "bia@x.com": "admin" });
    DemandasRoles.definirAdminPrincipal("bia@x.com");
    window.isAdminUser = () => true;
    window.requireWriteAccess = () => true;
    const naTela = DemandasRoles.isAdmin({ email: "bia@x.com" });
    const salvarPapeis = await persistenceApi.persistRoles({ "bia@x.com": "admin" }).then(() => "passou", (e) => e.code);
    const nivel = (await c.rpc("acesso_nivel")).data;
    const historico = (await c.from("acessos_historico").select("*")).data;
    return { naTela, salvarPapeis, nivel, historico };
  });
  expect(depois).toEqual({ naTela: true, salvarPapeis: "42501", nivel: "escrita", historico: [] });

  const meta = await supabase.banco.lerMeta();
  expect(meta.roles).toEqual(META.roles);
  const criados = await supabase.banco.db.query(`select email from auth.users where email = 'invasor@x.com'`);
  expect(criados.rows).toEqual([]);
  await conferirSemVazamento(page, saida);
});

test("projetista: continua trabalhando normalmente, e não consegue apontar a demanda para a tarefa de outra área", async ({ page }) => {
  const saida = await abrir(page);
  await entrarNoApp(page, "bia@x.com");
  await page.evaluate(() => {
    const d = state.demandas.find((x) => x.id === "p1");
    d.titulo = "Editado pela tela";
    saveState({ demanda: d });
  });
  await expect.poll(async () => (await supabase.banco.lerDemanda("p1")).titulo).toBe("Editado pela tela");

  const cancelou = await page.evaluate(async () => {
    const c = DemandasAuth.cliente();
    await c.rpc("demanda_salvar", { p_id: "p2", p_campos: { asanaTaskId: "tarefa-de-outra-area", asana: { taskId: "tarefa-de-outra-area", url: "https://evil.example" } } });
    return DemandasNuvem.chamar("cancelAsanaOperacao", { demandaId: "p2" }).then((r) => r.data.deleted);
  });
  expect(cancelou).toBe(false);
  expect(supabase.chamadasAsana, "o token da integração não foi usado").toEqual([]);
  expect((await supabase.banco.lerDemanda("p2")).asana).toBeUndefined();
  await conferirSemVazamento(page, saida);
});

test("somente leitura: lê, e toda escrita é recusada", async ({ page }) => {
  const saida = await abrir(page);
  await entrarNoApp(page, "caio@x.com");
  const r = await page.evaluate(async () => {
    const c = DemandasAuth.cliente();
    return {
      nivel: (await c.rpc("acesso_nivel")).data,
      le: (await c.from("demandas").select("id")).data.length,
      salvar: (await c.rpc("demanda_salvar", { p_id: "p1", p_campos: { titulo: "x" } })).error?.code,
      excluir: (await c.rpc("demanda_excluir", { p_id: "p1" })).error?.code,
      presenca: (await c.rpc("demanda_presenca", { p_id: "p1", p_editing_by: { email: "x" }, p_editing_at: "y" })).error?.code,
      meta: (await c.rpc("meta_salvar", { p_campos: { diarias: [] } })).error?.code,
    };
  });
  expect(r).toEqual({ nivel: "leitura", le: 2, salvar: "42501", excluir: "42501", presenca: "42501", meta: "42501" });
  expect((await supabase.banco.lerDemanda("p1")).titulo).toBe(TITULO);
  await conferirSemVazamento(page, saida);
});

test("conta sem papel: é posta para fora, sem ver nada; insistindo pelo console, continua sem ver", async ({ page }) => {
  const saida = await abrir(page);
  await entrarEVerSerPostoParaFora(page, "estranho@x.com");
  await expect(page.locator("#appRoot")).toBeHidden();
  const r = await page.evaluate(async (senha) => {
    const cfg = window.SUPABASE_CONFIG;
    const c = supabase.createClient(cfg.url, cfg.publishableKey, { auth: { persistSession: false } });
    await c.auth.signInWithPassword({ email: "estranho@x.com", password: senha });
    const linhas = async (t) => (await c.from(t).select("*")).data;
    return {
      demandas: await linhas("demandas"),
      meta: await linhas("sistema_meta"),
      backups: await linhas("sistema_backups"),
      historico: await linhas("acessos_historico"),
      adminPrincipal: (await c.rpc("acesso_admin_principal")).data,
      nivel: (await c.rpc("acesso_nivel")).data,
      salvar: (await c.rpc("demanda_salvar", { p_id: "p9", p_campos: {} })).error?.code,
      arquivos: (await c.storage.from("backups").list()).data,
      emMemoria: state.demandas.length,
      adminNaMemoria: window.DEMANDAS_ADMIN_EMAIL,
      papeisNaMemoria: DemandasRoles.getRolesMap(),
    };
  }, SENHA);
  expect(r).toEqual({ demandas: [], meta: [], backups: [], historico: [], adminPrincipal: null, nivel: "", salvar: "42501", arquivos: [], emMemoria: 0, adminNaMemoria: "", papeisNaMemoria: {} });
  expect(await page.locator("body").innerText()).not.toContain(TITULO);
  await conferirSemVazamento(page, saida);
});

test("visitante sem login, só com a chave pública: nada responde", async ({ page }) => {
  const saida = await abrir(page);
  const r = await page.evaluate(async () => {
    const cfg = window.SUPABASE_CONFIG;
    const c = supabase.createClient(cfg.url, cfg.publishableKey, { auth: { persistSession: false } });
    const codigo = async (consulta) => (await consulta).error?.code;
    const invocar = await c.functions.invoke("api", { body: { acao: "listarContasLogin", dados: {} } });
    return {
      demandas: await codigo(c.from("demandas").select("*")),
      meta: await codigo(c.from("sistema_meta").select("*")),
      salvar: await codigo(c.rpc("demanda_salvar", { p_id: "x", p_campos: {} })),
      acessos: await codigo(c.rpc("acessos_salvar", { p_campos: {} })),
      nivel: await codigo(c.rpc("acesso_nivel")),
      principal: await codigo(c.rpc("acesso_admin_principal")),
      api: invocar.error?.context?.status,
      adminNaMemoria: window.DEMANDAS_ADMIN_EMAIL,
    };
  });
  expect(r).toEqual({ demandas: "42501", meta: "42501", salvar: "42501", acessos: "42501", nivel: "42501", principal: "42501", api: 401, adminNaMemoria: "" });
  await conferirSemVazamento(page, saida);
});

test("administrador: cria a conta sem papel, e só a promoção feita por ele vale", async ({ page }) => {
  const saida = await abrir(page);
  await entrarNoApp(page, "ana@x.com");
  const r = await page.evaluate(async () => {
    const criada = await DemandasAuth.createUser("nova@x.com", "senha-forte-1", { nome: "Nova" });
    const mapa = { ...DemandasRoles.getRolesMap(), "nova@x.com": "admin" };
    await persistenceApi.persistRoles(mapa);
    return { criada: criada.created, admin: window.DEMANDAS_ADMIN_EMAIL };
  });
  expect(r.criada).toBe(true);
  expect(r.admin, "quem tem acesso recebe o admin principal do banco").toBe(SEED);
  expect((await supabase.banco.lerMeta()).roles["nova@x.com"]).toBe("admin");
  const nova = await supabase.banco.clienteUsuario("nova@x.com");
  expect((await nova.rpc("acesso_nivel")).data).toBe("admin");
  await conferirSemVazamento(page, saida);
});

test("sair: não sobra dado nem sessão, na memória, na página e no navegador", async ({ page }) => {
  const saida = await abrir(page);
  await entrarNoApp(page, "bia@x.com");
  await expect(page.locator("#appRoot")).toContainText(TITULO);
  await page.waitForFunction(() => Object.keys(localStorage).some((k) => k.startsWith("demandasProjetos_v1:")));

  await page.evaluate(() => DemandasAuth.signOut());
  await expect(page.locator("#loginScreen")).toBeVisible();
  await page.waitForFunction(() => document.readyState === "complete" && typeof DemandasAuth !== "undefined");
  await expect(page.locator("#appRoot")).toBeHidden();

  const r = await page.evaluate(() => ({
    chaves: Object.keys(localStorage).filter((k) => k.startsWith("demandasProjetos") || k.startsWith("sb-")),
    emMemoria: typeof state === "undefined" ? 0 : state.demandas.length,
    papeis: DemandasRoles.getRolesMap(),
    admin: window.DEMANDAS_ADMIN_EMAIL,
    pagina: document.documentElement.outerHTML.includes("Projeto Sigiloso"),
  }));
  expect(r).toEqual({ chaves: [], emMemoria: 0, papeis: {}, admin: "", pagina: false });
  expect(saida.join("\n")).not.toContain(TITULO);
});

test("mesmo navegador: quem entra depois não vê a cópia de quem saiu sem encerrar a sessão", async ({ page }) => {
  await abrir(page);
  await entrarNoApp(page, "bia@x.com");
  await page.waitForFunction(() => Object.keys(localStorage).some((k) => k === "demandasProjetos_v1:bia@x.com"));
  // Sessão perdida sem passar pelo Sair: a cópia ficou para trás.
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (k.startsWith("sb-")) localStorage.removeItem(k);
  });
  await page.reload();
  await page.waitForFunction(() => typeof DemandasAuth !== "undefined" && DemandasAuth.isConfigured());
  await expect(page.locator("#loginScreen")).toBeVisible();

  await entrarEVerSerPostoParaFora(page, "estranho@x.com");
  const chaves = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("demandasProjetos_v1")));
  expect(chaves).toEqual([]);
  expect(await page.locator("body").innerText()).not.toContain(TITULO);
});

test("teste de segurança do roteiro: passa como projetista, sem alterar dados, e avisa quando algo está aberto", async ({ page }) => {
  await abrir(page);
  const comoVisitante = await page.evaluate(SCRIPT_DO_CONSOLE);
  expect(comoVisitante.filter((l) => l.resultado !== "ok"), "visitante").toEqual([]);
  expect(comoVisitante.map((l) => l.teste)).toContain("parte logada não rodou: entre com uma conta de projetista");

  await entrarNoApp(page, "bia@x.com");
  const metaAntes = await supabase.banco.lerMeta();
  const demandaAntes = await supabase.banco.lerDemanda("p1");
  const linhas = await page.evaluate(SCRIPT_DO_CONSOLE);
  expect(linhas.filter((l) => l.resultado !== "ok"), "projetista").toEqual([]);
  expect(linhas.length).toBeGreaterThan(25);
  expect(await supabase.banco.lerMeta(), "o teste não alterou os acessos").toEqual(metaAntes);
  expect(await supabase.banco.lerDemanda("p1"), "nem as demandas").toEqual(demandaAntes);
  expect(supabase.metadados.get("bia@x.com"), "nem deixou marca na conta").toEqual({});

  supabase.configAuth.disable_signup = false;
  const aberto = await page.evaluate(SCRIPT_DO_CONSOLE);
  expect(aberto.filter((l) => l.resultado !== "ok").map((l) => l.teste)).toEqual(["cadastro público fechado"]);
});

test("com uma conta administradora, o teste não finge que passou: pede a conta certa", async ({ page }) => {
  await abrir(page);
  await entrarNoApp(page, "ana@x.com");
  const linhas = await page.evaluate(SCRIPT_DO_CONSOLE);
  expect(linhas.filter((l) => l.resultado !== "ok").map((l) => l.teste)).toEqual(['parte logada exige projetista, e esta conta é "admin"']);
});
