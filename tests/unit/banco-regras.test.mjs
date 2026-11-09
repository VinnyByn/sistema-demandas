// Regras de acesso do banco no PGlite: quem lê e quem grava o quê, e o merge que o app espera.
// Cada chamada troca de papel (authenticated, anon): como dono da tabela, a RLS seria ignorada e nada seria provado.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { criarBancoDeTeste } from "./helpers/supabase-pglite.mjs";

const SEED = "vinicius.morais@soumaster.com.br";
const META = {
  diarias: [],
  projetistas: {},
  deletedDemandaIds: [],
  deletedDiariaIds: [],
  roles: {
    [SEED]: "admin",
    "ana@x.com": "admin",
    "adm.off@x.com": "admin",
    "bia@x.com": "projetista",
    "caio@x.com": "visibilidade",
    "duda@x.com": "projetista",
    "removido@x.com": "admin", // papel antigo esquecido no mapa: removido vale mais
  },
  disabledUsers: { "adm.off@x.com": true, "duda@x.com": "1" },
  purgedUsers: { "removido@x.com": true },
  userRegionals: {},
  userDisplayNames: { "bia@x.com": "Bia" },
};

let banco;
const como = (email) => banco.clienteUsuario(email);
const negado = (r) => assert.equal(r.error?.code, "42501", JSON.stringify(r));
const liberado = (r) => assert.equal(r.error, null, JSON.stringify(r.error));

before(async () => {
  banco = await criarBancoDeTeste();
});
after(async () => {
  await banco.db.close();
});
beforeEach(async () => {
  await banco.limpar();
  await banco.definirMeta(META);
  await banco.semear([{ id: "d1", dados: { titulo: "Projeto" } }]);
});

test("demandas: só quem está no mapa lê; só quem não é somente leitura grava", async () => {
  for (const email of ["ana@x.com", "bia@x.com", "caio@x.com", "duda@x.com", "adm.off@x.com", SEED]) {
    const { data } = await (await como(email)).from("demandas").select("id");
    assert.equal(data.length, 1, `${email} lê`);
  }
  for (const email of ["estranho@x.com", "removido@x.com"]) {
    const { data, error } = await (await como(email)).from("demandas").select("id");
    assert.equal(error, null);
    assert.equal(data.length, 0, `${email} não vê nada`);
  }
  for (const email of ["ana@x.com", "bia@x.com", SEED]) {
    liberado(await (await como(email)).rpc("demanda_salvar", { p_id: "d2", p_campos: { titulo: email } }));
  }
  for (const email of ["caio@x.com", "duda@x.com", "adm.off@x.com", "estranho@x.com", "removido@x.com"]) {
    negado(await (await como(email)).rpc("demanda_salvar", { p_id: "d3", p_campos: { titulo: "x" } }));
    negado(await (await como(email)).rpc("demanda_excluir", { p_id: "d1" }));
    negado(await (await como(email)).rpc("demanda_presenca", { p_id: "d1", p_editing_by: { email }, p_editing_at: "x" }));
  }
  assert.equal(await banco.lerDemanda("d3"), undefined);
});

test("ninguém grava direto nas tabelas: toda escrita passa pelas funções que conferem o nível", async () => {
  const claims = { sub: await banco.idDoUsuario("ana@x.com"), role: "authenticated" };
  for (const sql of [
    `update public.sistema_meta set dados = '{}'`,
    `insert into public.demandas (id) values ('zz')`,
    `delete from public.demandas`,
    `update public.demandas set dados = '{}'`,
    `insert into public.acessos_historico (por, alvo, acao) values ('a', 'b', 'c')`,
    `delete from public.acessos_historico`,
  ]) {
    await assert.rejects(banco.sqlComo("authenticated", claims, sql), /permission denied/, sql);
  }
});

test("anônimo não alcança nada: nem tabelas, nem funções, inclusive as do Asana", async () => {
  const anonimo = banco.clienteAnonimo();
  for (const tabela of ["demandas", "sistema_meta", "sistema_backups", "acessos_historico", "asana_webhooks", "asana_envios"]) {
    const { error } = await anonimo.from(tabela).select("*");
    assert.match(error?.message || "", /permission denied/, tabela);
  }
  for (const [nome, args] of [
    ["acesso_nivel", {}],
    ["demanda_salvar", { p_id: "x", p_campos: {} }],
    ["acessos_salvar", { p_campos: {} }],
    ["asana_buscar_webhook", { p_projeto_gid: "1" }],
  ]) {
    const { error } = await anonimo.rpc(nome, args);
    assert.match(error?.message || "", /permission denied/, nome);
  }
});

test("usuário logado não alcança o segredo do webhook nem as funções internas", async () => {
  const bia = await como("ana@x.com");
  for (const [nome, args] of [
    ["asana_buscar_webhook", { p_projeto_gid: "1" }],
    ["asana_mesclar_demanda", { p_demanda_id: "d1", p_campos: {} }],
    ["acesso_exigir", { p_niveis: ["admin"] }],
    ["acesso_nivel_de", { p_email: "a", p_meta: {} }],
  ]) {
    const { error } = await bia.rpc(nome, args);
    assert.ok(error, `${nome} deveria ser recusada`);
    assert.match(error.message, /permission denied|does not exist/, nome);
  }
  const { error } = await bia.from("asana_webhooks").select("*");
  assert.match(error?.message || "", /permission denied/);
});

test("toda tabela pública tem RLS, e as funções asana_* são só do servidor", async () => {
  const { rows } = await banco.db.query(`select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
  assert.deepEqual(rows, [], "tabela sem RLS");
  const funcoes = await banco.db.query(`select p.oid::regprocedure::text as nome,
      has_function_privilege('anon', p.oid, 'execute') as anon,
      has_function_privilege('authenticated', p.oid, 'execute') as logado,
      has_function_privilege('service_role', p.oid, 'execute') as servidor
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'asana\\_%'`);
  assert.ok(funcoes.rows.length >= 20);
  for (const f of funcoes.rows) assert.deepEqual([f.anon, f.logado, f.servidor], [false, false, true], f.nome);
  const publicas = await banco.db.query(`select p.oid::regprocedure::text as nome from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')`);
  assert.deepEqual(publicas.rows, [], "nenhuma função aberta para a chave pública");
});

test("meta: leitura só para quem está no mapa; quem escreve não mexe nos acessos", async () => {
  assert.equal((await (await como("caio@x.com")).from("sistema_meta").select("dados").eq("id", "meta").maybeSingle()).data.dados.roles["bia@x.com"], "projetista");
  assert.equal((await (await como("estranho@x.com")).from("sistema_meta").select("dados").eq("id", "meta").maybeSingle()).data, null);
  assert.equal((await (await como("removido@x.com")).from("sistema_meta").select("dados").eq("id", "meta").maybeSingle()).data, null);

  const bia = await como("bia@x.com");
  liberado(await bia.rpc("meta_salvar", { p_campos: { diarias: [{ id: "x" }], metasEtapa: { operacional: { novo: 3 } } } }));
  assert.deepEqual((await banco.lerMeta()).diarias, [{ id: "x" }]);
  for (const campos of [{ roles: { "bia@x.com": "admin" } }, { disabledUsers: {} }, { purgedUsers: {} }, { userDisplayNames: {} }, { userRegionals: {} }, { userHomes: {} }]) {
    negado(await bia.rpc("meta_salvar", { p_campos: campos }));
    negado(await bia.rpc("acessos_salvar", { p_campos: campos }));
  }
  assert.equal((await banco.lerMeta()).roles["bia@x.com"], "projetista", "não se promoveu");
  negado(await (await como("caio@x.com")).rpc("meta_salvar", { p_campos: { diarias: [] } }));
  negado(await (await como("adm.off@x.com")).rpc("acessos_salvar", { p_campos: { roles: {} } }));
});

test("meta: administrador troca os mapas inteiros (remove chaves) sem encostar no resto", async () => {
  await banco.definirMeta({ ...META, userHomes: { "bia@x.com": { esteira: "b2b" } } });
  liberado(await (await como("ana@x.com")).rpc("acessos_salvar", {
    p_campos: { roles: { [SEED]: "admin", "ana@x.com": "admin" }, disabledUsers: {}, naoEAcesso: "ignorado" },
  }));
  const meta = await banco.lerMeta();
  assert.deepEqual(meta.roles, { [SEED]: "admin", "ana@x.com": "admin" }, "quem saiu do mapa saiu mesmo");
  assert.deepEqual(meta.disabledUsers, {});
  assert.deepEqual(meta.userHomes, { "bia@x.com": { esteira: "b2b" } }, "mapa não enviado continua");
  assert.deepEqual(meta.purgedUsers, META.purgedUsers);
  assert.equal(meta.naoEAcesso, undefined, "só os mapas de acesso entram por aqui");
});

test("administrador principal entra mesmo com meta vazio, desabilitado ou removido", async () => {
  await banco.definirMeta({ disabledUsers: { [SEED]: true }, purgedUsers: { [SEED]: true } });
  const seed = await como(SEED);
  assert.equal((await seed.rpc("acesso_nivel")).data, "admin");
  liberado(await seed.rpc("acessos_salvar", { p_campos: { roles: { [SEED]: "admin" } } }));
});

test("e-mail com maiúsculas conta como o mesmo usuário; conta sem e-mail confirmado não tem acesso", async () => {
  const maiusculas = await como("BIA@X.COM");
  assert.equal((await maiusculas.rpc("acesso_nivel")).data, "escrita");
  await banco.db.query(`update auth.users set email_confirmed_at = null where email = 'ana@x.com'`);
  const ana = await como("ana@x.com");
  assert.equal((await ana.rpc("acesso_nivel")).data, "", "sem confirmar, herdaria o papel de quem tem o e-mail");
  negado(await ana.rpc("acessos_salvar", { p_campos: { roles: {} } }));
  await banco.db.query(`update auth.users set email_confirmed_at = now() where email = 'ana@x.com'`);
});

test("histórico: só administrador registra, em nome próprio e com a hora do servidor; ninguém edita", async () => {
  const ana = await como("ana@x.com");
  liberado(await ana.rpc("acessos_historico_registrar", {
    p_entradas: [
      { alvo: "bia@x.com", acao: "papel", de: "Projetista", para: "Admin", por: "forjado@x.com", em: "2000-01-01T00:00:00Z" },
      { alvo: "", acao: "ignorada" },
    ],
  }));
  const { data } = await ana.from("acessos_historico").select("*").order("em", { ascending: false }).limit(10);
  assert.equal(data.length, 1);
  assert.equal(data[0].por, "ana@x.com", "o autor vem da sessão");
  assert.ok(new Date(data[0].em).getFullYear() > 2020, "a hora vem do servidor");
  assert.equal((await (await como("bia@x.com")).from("acessos_historico").select("*")).data.length, 0, "só admin lê");
  negado(await (await como("bia@x.com")).rpc("acessos_historico_registrar", { p_entradas: [{ alvo: "x", acao: "y" }] }));
});

test("backups: quem tem acesso vê a situação; só administrador ativo vê os arquivos", async () => {
  await banco.db.query(`insert into public.sistema_backups (info) values ('{"totalDemandas": 1}')`);
  await banco.db.query(`insert into storage.objects (bucket_id, name) values ('backups', 'a.json'), ('outro', 'b.json')`);
  assert.equal((await (await como("caio@x.com")).from("sistema_backups").select("info")).data.length, 1);
  assert.equal((await (await como("estranho@x.com")).from("sistema_backups").select("info")).data.length, 0);
  const arquivos = async (email) => {
    const claims = { sub: await banco.idDoUsuario(email), role: "authenticated" };
    return (await banco.sqlComo("authenticated", claims, `select name from storage.objects`)).rows.map((r) => r.name);
  };
  assert.deepEqual(await arquivos("ana@x.com"), ["a.json"]);
  assert.deepEqual(await arquivos("bia@x.com"), []);
  assert.deepEqual(await arquivos("adm.off@x.com"), [], "desabilitado não baixa");
});

test("salvar demanda: merge igual ao do app — mapas em profundidade, listas substituídas, mapa vazio limpa", async () => {
  await banco.semear([{ id: "m1", dados: { custo: { valor: 1, moeda: "BRL", obs: "a" }, lista: [1, 2, 3], mapa: { a: 1 }, fica: "sim", fundo: { n1: { n2: { x: 1, y: 2 } } } } }]);
  const bia = await como("bia@x.com");
  liberado(await bia.rpc("demanda_salvar", {
    p_id: "m1",
    p_campos: { custo: { valor: 2 }, lista: [9], mapa: {}, novo: true, fundo: { n1: { n2: { y: 3 } } } },
  }));
  assert.deepEqual(await banco.lerDemanda("m1"), {
    custo: { valor: 2, moeda: "BRL", obs: "a" },
    lista: [9],
    mapa: {},
    fica: "sim",
    novo: true,
    fundo: { n1: { n2: { x: 1, y: 3 } } },
  });
  liberado(await bia.rpc("demanda_salvar", { p_id: "m1", p_campos: { fica: "agora sim" }, p_remover: [["novo"], ["custo", "obs"], ["naoExiste"], ["lista", "x"]] }));
  const depois = await banco.lerDemanda("m1");
  assert.equal(depois.novo, undefined);
  assert.equal(depois.custo.obs, undefined);
  assert.equal(depois.custo.valor, 2);
  assert.equal(depois.fica, "agora sim");
});

test("salvar demanda: chave com ponto (e-mail) é uma chave só, e merge cria a demanda que não existe", async () => {
  const bia = await como("bia@x.com");
  liberado(await bia.rpc("meta_salvar", { p_campos: { filtrosSalvos: { "bia@x.com": { a: 1 } } } }));
  liberado(await bia.rpc("meta_salvar", { p_campos: { filtrosSalvos: { "ana@x.com": { b: 2 } } } }));
  assert.deepEqual((await banco.lerMeta()).filtrosSalvos, { "bia@x.com": { a: 1 }, "ana@x.com": { b: 2 } });
  liberado(await bia.rpc("demanda_salvar", { p_id: "nova", p_campos: { titulo: "Nova", apagar: 1 }, p_remover: [["apagar"]] }));
  assert.deepEqual(await banco.lerDemanda("nova"), { titulo: "Nova" });
});

test("presença não encosta no resto da demanda; excluir registra a marca uma vez só", async () => {
  await banco.semear([{ id: "p1", dados: { titulo: "T", updatedAt: "2026-01-01" } }]);
  const bia = await como("bia@x.com");
  liberado(await bia.rpc("demanda_presenca", { p_id: "p1", p_editing_by: { email: "bia@x.com", since: "agora" }, p_editing_at: "agora" }));
  assert.deepEqual(await banco.lerDemanda("p1"), { titulo: "T", updatedAt: "2026-01-01", editingBy: { email: "bia@x.com", since: "agora" }, editingAt: "agora" });
  liberado(await bia.rpc("demanda_presenca", { p_id: "p1", p_editing_by: null, p_editing_at: null }));
  assert.deepEqual(await banco.lerDemanda("p1"), { titulo: "T", updatedAt: "2026-01-01" });
  liberado(await bia.rpc("demanda_presenca", { p_id: "nao-existe", p_editing_by: { email: "x" }, p_editing_at: "y" }));
  assert.equal(await banco.lerDemanda("nao-existe"), undefined, "presença não ressuscita demanda apagada");

  liberado(await bia.rpc("demanda_excluir", { p_id: "p1" }));
  liberado(await bia.rpc("demanda_excluir", { p_id: "p1" }));
  assert.equal(await banco.lerDemanda("p1"), undefined);
  assert.deepEqual((await banco.lerMeta()).deletedDemandaIds, ["p1"]);
});

test("as tabelas certas estão na publicação do tempo real", async () => {
  const { rows } = await banco.db.query(`select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1`);
  assert.deepEqual(rows.map((r) => r.tablename), ["demandas", "sistema_meta"]);
});

test("conta bloqueada ou apagada perde o acesso na hora, mesmo com o token ainda válido", async () => {
  const ana = await como("ana@x.com");
  assert.equal((await ana.rpc("acesso_nivel")).data, "admin");
  await banco.db.query(`update auth.users set banned_until = now() + interval '1 day' where email = 'ana@x.com'`);
  assert.equal((await ana.rpc("acesso_nivel")).data, "", "bloqueada");
  await banco.db.query(`update auth.users set banned_until = now() - interval '1 day' where email = 'ana@x.com'`);
  assert.equal((await ana.rpc("acesso_nivel")).data, "admin", "bloqueio vencido");
  await banco.db.query(`update auth.users set deleted_at = now() where email = 'ana@x.com'`);
  assert.equal((await ana.rpc("acesso_nivel")).data, "", "apagada");
  await banco.db.query(`update auth.users set deleted_at = null, banned_until = null where email = 'ana@x.com'`);
});
