// Ataques que qualquer pessoa pode tentar pelo console do navegador. As chamadas passam pelo papel do usuário, como no PostgREST.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { criarBancoDeTeste } from "./helpers/supabase-pglite.mjs";
import { carregarApp } from "./helpers/app-nuvem.mjs";
import { repositorioEmMemoria } from "./helpers/repositorio-em-memoria.mjs";
import { criarRepositorioSupabase } from "../../supabase/functions/_shared/asana/repositorio-supabase.mjs";
import * as asana from "../../supabase/functions/_shared/asana/index.mjs";
import { criarCliente } from "../../supabase/functions/_shared/asana/cliente.mjs";
import { ASANA_PROJETOS } from "../../supabase/functions/_shared/asana/constantes.mjs";
import { responderApi } from "../../supabase/functions/_shared/api.mjs";

const RAIZ = fileURLToPath(new URL("../../", import.meta.url));
const SEED = "vinicius.morais@soumaster.com.br";
const PROJ = ASANA_PROJETOS[1].gid;
const META = {
  diarias: [],
  projetistas: {},
  deletedDemandaIds: [],
  deletedDiariaIds: [],
  roles: { [SEED]: "admin", "ana@x.com": "admin", "bia@x.com": "projetista", "caio@x.com": "visibilidade", "duda@x.com": "projetista", "gestor@x.com": "gestor" },
  disabledUsers: { "duda@x.com": true },
  purgedUsers: {},
  userDisplayNames: {},
};

// Toda forma de tentar virar administrador sem ser um. Cada uma precisa falhar para cada perfil abaixo de admin.
const SEM_ADMIN = ["bia@x.com", "caio@x.com", "duda@x.com", "gestor@x.com", "estranho@x.com"];

let banco;
const como = (email) => banco.clienteUsuario(email);
const claimsDe = async (email) => ({ sub: await banco.idDoUsuario(email), role: "authenticated", email });
const papelDe = async (email) => (await banco.lerMeta()).roles?.[email];

before(async () => {
  banco = await criarBancoDeTeste();
});
after(async () => {
  await banco.db.close();
});
beforeEach(async () => {
  await banco.limpar();
  await banco.definirMeta(META);
  await banco.semear([{ id: "d1", dados: { titulo: "Segredo", asanaTaskId: "111", asana: { taskId: "111", url: "https://app.asana.com/0/1/111" } } }]);
});

test("catálogo: a chave pública não executa nem lê nada; o usuário logado só alcança a lista exata", async () => {
  const funcoes = await banco.db.query(`select p.proname as nome,
      has_function_privilege('anon', p.oid, 'execute') as anon,
      has_function_privilege('authenticated', p.oid, 'execute') as logado
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`);
  assert.ok(funcoes.rows.length > 30, "o catálogo foi lido");
  assert.deepEqual(funcoes.rows.filter((f) => f.anon).map((f) => f.nome), [], "aberto para a chave pública");
  assert.deepEqual(funcoes.rows.filter((f) => f.logado).map((f) => f.nome).sort(), [
    "acesso_admin_principal",
    "acesso_nivel",
    "acessos_historico_registrar",
    "acessos_salvar",
    "demanda_excluir",
    "demanda_presenca",
    "demanda_salvar",
    "meta_salvar",
  ]);

  const tabelas = await banco.db.query(`select c.relname as nome, c.relrowsecurity as rls,
      has_table_privilege('anon', c.oid, 'select,insert,update,delete,truncate,references,trigger') as anon,
      has_table_privilege('authenticated', c.oid, 'select') as logado_le,
      has_table_privilege('authenticated', c.oid, 'insert,update,delete,truncate,references,trigger') as logado_grava
    from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p')`);
  assert.ok(tabelas.rows.length >= 8);
  assert.deepEqual(tabelas.rows.filter((t) => !t.rls).map((t) => t.nome), [], "tabela sem RLS");
  assert.deepEqual(tabelas.rows.filter((t) => t.anon).map((t) => t.nome), [], "chave pública alcança");
  assert.deepEqual(tabelas.rows.filter((t) => t.logado_grava).map((t) => t.nome), [], "logado grava direto");
  assert.deepEqual(tabelas.rows.filter((t) => t.logado_le).map((t) => t.nome).sort(), ["acessos_historico", "demandas", "sistema_backups", "sistema_meta"]);

  const sequencias = await banco.db.query(`select c.relname as nome from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'S' and (has_sequence_privilege('anon', c.oid, 'usage') or has_sequence_privilege('authenticated', c.oid, 'usage'))`);
  assert.deepEqual(sequencias.rows, []);
});

test("toda função que roda com poderes do dono fixa o search_path: sem isso, dá para sequestrá-la", async () => {
  const { rows } = await banco.db.query(`select p.proname as nome from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef and not coalesce(p.proconfig::text ilike '%search_path%', false)`);
  assert.deepEqual(rows, []);
});

test("virar admin pelas funções de acesso: recusado para quem não é admin, em todas as formas", async () => {
  const tentativas = (alvo) => [
    ["acessos_salvar", { p_campos: { roles: { [alvo]: "admin" } } }],
    ["acessos_salvar", { p_campos: { purgedUsers: {}, disabledUsers: {}, roles: { [alvo]: "administrador" } } }],
    ["meta_salvar", { p_campos: { roles: { [alvo]: "admin" } } }],
    ["meta_salvar", { p_campos: { disabledUsers: {} } }],
    ["meta_salvar", { p_campos: { purgedUsers: { "ana@x.com": true } } }],
    ["acessos_historico_registrar", { p_entradas: [{ alvo, acao: "papel", para: "admin" }] }],
  ];
  for (const email of SEM_ADMIN) {
    const cliente = await como(email);
    for (const [funcao, args] of tentativas(email)) {
      const { error } = await cliente.rpc(funcao, args);
      assert.equal(error?.code, "42501", `${email} ${funcao} ${JSON.stringify(args)}`);
    }
    assert.notEqual(await papelDe(email), "admin", email);
  }
  assert.deepEqual(await banco.lerMeta(), META, "o meta não mudou em nada");
});

test("virar admin por caminhos indiretos: chave disfarçada, documento não-objeto, demanda com nome de meta", async () => {
  const bia = await como("bia@x.com");
  const disfarces = [{ roles: { "bia@x.com": "admin" }, diarias: [] }, ["roles"], "roles"];
  for (const campos of disfarces) {
    const { error } = await bia.rpc("meta_salvar", { p_campos: campos });
    assert.ok(error, JSON.stringify(campos));
  }
  assert.equal(await papelDe("bia@x.com"), "projetista");

  // Maiúsculas ou aninhamento gravam um campo qualquer, que a regra de acesso nunca lê.
  assert.equal((await bia.rpc("meta_salvar", { p_campos: { Roles: { "bia@x.com": "admin" }, x: { roles: { "bia@x.com": "admin" } } } })).error, null);
  assert.equal((await bia.rpc("acesso_nivel")).data, "escrita");

  // Uma demanda com o id do meta fica em outra tabela: não encosta nos acessos.
  assert.equal((await bia.rpc("demanda_salvar", { p_id: "meta", p_campos: { roles: { "bia@x.com": "admin" } } })).error, null);
  assert.equal((await bia.rpc("acesso_nivel")).data, "escrita");
});

test("virar admin escrevendo direto nas tabelas: recusado, inclusive para quem já é admin", async () => {
  for (const email of [...SEM_ADMIN, "ana@x.com"]) {
    const claims = await claimsDe(email);
    for (const sql of [
      `update public.sistema_meta set dados = jsonb_set(dados, '{roles,${email}}', '"admin"')`,
      `insert into public.sistema_meta (id, dados) values ('meta', '{}') on conflict (id) do update set dados = '{}'`,
      `delete from public.sistema_meta`,
      `truncate public.sistema_meta`,
      `update public.demandas set dados = '{}'`,
      `delete from public.demandas`,
      `truncate public.demandas`,
      `insert into public.acessos_historico (por, alvo, acao) values ('a', 'b', 'c')`,
      `update public.acessos_historico set por = 'x'`,
      `insert into public.sistema_backups (id, info) values ('ultimo', '{}') on conflict (id) do update set info = '{}'`,
      `insert into storage.objects (bucket_id, name) values ('backups', 'x.json')`,
      `delete from storage.objects`,
      `update storage.buckets set public = true where id = 'backups'`,
      `insert into auth.users (email) values ('novo@x.com')`,
      `update auth.users set email = '${SEED}' where email = '${email}'`,
      `select * from auth.users`,
    ]) {
      await assert.rejects(banco.sqlComo("authenticated", claims, sql), /permission denied/, `${email}: ${sql}`);
    }
  }
  assert.deepEqual(await banco.lerMeta(), META);
});

test("virar admin chamando funções internas: elas não estão expostas", async () => {
  await assert.rejects(banco.sqlComo("authenticated", await claimsDe("bia@x.com"), `select public.acesso_exigir(array['leitura'])`), /permission denied/);
  const bia = await como("bia@x.com");
  for (const [funcao, args] of [
    ["acesso_nivel_de", { p_email: SEED, p_meta: {} }],
    ["acesso_email", {}],
    ["acesso_email_de", { p_usuario: await banco.idDoUsuario(SEED) }],
    ["acesso_principal_email", {}],
    ["jsonb_mesclar", { p_base: {}, p_novo: {} }],
    ["asana_mesclar_demanda", { p_demanda_id: "d1", p_campos: { asanaTaskId: "222" } }],
    ["asana_buscar_webhook", { p_projeto_gid: PROJ }],
    ["asana_listar_comentarios", { p_demanda_id: "d1" }],
  ]) {
    const { error } = await bia.rpc(funcao, args);
    assert.match(error?.message || "", /permission denied/, funcao);
  }
});

test("token forjado no conteúdo: e-mail do admin no token não vale, a identidade vem de auth.users pelo id", async () => {
  const claims = { sub: await banco.idDoUsuario("bia@x.com"), role: "authenticated", email: SEED, user_metadata: { role: "admin" }, app_metadata: { role: "admin" } };
  const nivel = await banco.sqlComo("authenticated", claims, `select public.acesso_nivel() as n`);
  assert.equal(nivel.rows[0].n, "escrita");
  await assert.rejects(banco.sqlComo("authenticated", claims, `select public.acessos_salvar('{"roles": {}}'::jsonb)`), /Sem permissão/);
  const semUsuario = await banco.sqlComo("authenticated", { role: "authenticated", email: SEED }, `select public.acesso_nivel() as n`);
  assert.equal(semUsuario.rows[0].n, "", "sem sub, sem acesso");
  const inexistente = await banco.sqlComo("authenticated", { sub: "00000000-0000-0000-0000-000000000000", role: "authenticated", email: SEED }, `select public.acesso_nivel() as n`);
  assert.equal(inexistente.rows[0].n, "", "conta que não existe");
});

test("e-mail parecido com o do admin não herda nada", async () => {
  for (const parecido of [`vinicius.morais+x@soumaster.com.br`, `vinicius.morais@soumaster.com.br.evil.com`, `xvinicius.morais@soumaster.com.br`, `vinicius.morais@soumaster.com`]) {
    assert.equal((await (await como(parecido)).rpc("acesso_nivel")).data, "", parecido);
  }
  const { rows } = await banco.db.query(`select public.acesso_nivel_de('', '{"roles": {"": "admin"}}'::jsonb) as vazio, public.acesso_nivel_de(null, '{}'::jsonb) as nulo`);
  assert.deepEqual([rows[0].vazio, rows[0].nulo], ["", ""]);
});

test("conta nova, sem papel nenhum: não lê, não grava, não descobre quem é o admin", async () => {
  const novo = await como("recem.criado@x.com");
  assert.equal((await novo.rpc("acesso_nivel")).data, "");
  assert.equal((await novo.rpc("acesso_admin_principal")).data, null, "o e-mail do admin só vai para quem tem acesso");
  for (const tabela of ["demandas", "sistema_meta", "sistema_backups", "acessos_historico"]) {
    assert.deepEqual((await novo.from(tabela).select("*")).data, [], tabela);
  }
  for (const [funcao, args] of [
    ["demanda_salvar", { p_id: "x", p_campos: {} }],
    ["demanda_excluir", { p_id: "d1" }],
    ["demanda_presenca", { p_id: "d1", p_editing_by: { email: "x" }, p_editing_at: "agora" }],
    ["meta_salvar", { p_campos: {} }],
  ]) {
    assert.equal((await novo.rpc(funcao, args)).error?.code, "42501", funcao);
  }
  assert.equal((await (await como("bia@x.com")).rpc("acesso_admin_principal")).data, SEED, "quem tem acesso recebe");
});

test("papel desconhecido só lê, até no banco", async () => {
  const gestor = await como("gestor@x.com");
  assert.equal((await gestor.rpc("acesso_nivel")).data, "leitura");
  assert.equal((await gestor.from("demandas").select("id")).data.length, 1);
  assert.equal((await gestor.rpc("demanda_salvar", { p_id: "d9", p_campos: { titulo: "x" } })).error?.code, "42501");
});

test("demanda: quem escreve não escolhe o vínculo com o Asana, nem na criação", async () => {
  const bia = await como("bia@x.com");
  const forjado = { asanaTaskId: "999", asanaTaskIds: ["999"], asana: { taskId: "999", url: "javascript:alert(1)" }, asanaAnteriores: [{ url: "javascript:alert(1)" }], asanaAviso: { tipo: "concluida" }, comentariosServidorAt: "x" };
  assert.equal((await bia.rpc("demanda_salvar", { p_id: "d1", p_campos: { titulo: "Novo", ...forjado } })).error, null);
  const d1 = await banco.lerDemanda("d1");
  assert.equal(d1.titulo, "Novo", "o resto é gravado");
  assert.equal(d1.asanaTaskId, "111");
  assert.deepEqual(d1.asana, { taskId: "111", url: "https://app.asana.com/0/1/111" });
  for (const campo of ["asanaTaskIds", "asanaAnteriores", "asanaAviso", "comentariosServidorAt"]) assert.equal(campo in d1, false, campo);

  assert.equal((await bia.rpc("demanda_salvar", { p_id: "nova", p_campos: { titulo: "N", ...forjado } })).error, null);
  assert.deepEqual(await banco.lerDemanda("nova"), { titulo: "N" }, "demanda nova também nasce sem vínculo");

  assert.equal((await bia.rpc("demanda_salvar", { p_id: "d1", p_campos: {}, p_remover: [["asanaTaskId"], ["asana"], ["asana", "url"]] })).error, null);
  assert.equal((await banco.lerDemanda("d1")).asanaTaskId, "111", "e também não apaga o vínculo");
  assert.equal((await banco.lerDemanda("d1")).asana.url, "https://app.asana.com/0/1/111");

  const { rows } = await banco.db.query(`select asana_task_id from public.demandas where id = 'nova'`);
  assert.equal(rows[0].asana_task_id, null);
});

test("aviso do Asana: o app só marca ciente, e só no aviso que está valendo", async () => {
  await banco.semear([{ id: "a1", dados: { asanaAviso: { tipo: "concluida", texto: "ok", chave: "c1", em: "2026-11-01" } } }]);
  const bia = await como("bia@x.com");
  await bia.rpc("demanda_salvar", { p_id: "a1", p_campos: { asanaAviso: { tipo: "excluida", texto: "forjado", chave: "c1", cienteEm: "2026-11-02" } } });
  assert.deepEqual((await banco.lerDemanda("a1")).asanaAviso, { tipo: "concluida", texto: "ok", chave: "c1", em: "2026-11-01", cienteEm: "2026-11-02" });
  await bia.rpc("demanda_salvar", { p_id: "a1", p_campos: { asanaAviso: { chave: "aviso-velho", cienteEm: "2026-11-03" } } });
  assert.equal((await banco.lerDemanda("a1")).asanaAviso.cienteEm, "2026-11-02", "aba desatualizada não marca o aviso novo");
});

test("id de demanda nova com HTML é recusado; id antigo importado continua podendo ser salvo", async () => {
  const bia = await como("bia@x.com");
  for (const id of [`"><img src=x onerror=alert(1)>`, "a b", "", "x".repeat(129), "../meta", "a'b"]) {
    assert.equal((await bia.rpc("demanda_salvar", { p_id: id, p_campos: { titulo: "x" } })).error?.code, "22023", JSON.stringify(id));
  }
  await banco.semear([{ id: "antigo com espaço", dados: { titulo: "velho" } }]);
  assert.equal((await bia.rpc("demanda_salvar", { p_id: "antigo com espaço", p_campos: { titulo: "novo" } })).error, null);
  assert.equal((await bia.rpc("demanda_salvar", { p_id: "550e8400-e29b-41d4-a716-446655440000", p_campos: { titulo: "uuid" } })).error, null);
});

test("presença: ninguém aparece editando em nome de outra pessoa", async () => {
  const bia = await como("bia@x.com");
  await bia.rpc("demanda_presenca", { p_id: "d1", p_editing_by: { email: SEED, autor: "Bia", since: "agora" }, p_editing_at: "agora" });
  assert.equal((await banco.lerDemanda("d1")).editingBy.email, "bia@x.com");
  assert.equal((await bia.rpc("demanda_presenca", { p_id: "d1", p_editing_by: ["x"], p_editing_at: "agora" })).error?.code, "22023");
});

test("backups: quem não é admin não lista, e o bucket continua privado", async () => {
  await banco.db.query(`insert into storage.objects (bucket_id, name) values ('backups', 'a.json')`);
  for (const email of SEM_ADMIN) {
    const { rows } = await banco.sqlComo("authenticated", await claimsDe(email), `select name from storage.objects`);
    assert.deepEqual(rows, [], email);
  }
  await assert.rejects(banco.sqlComo("anon", { role: "anon" }, `select name from storage.objects`), /permission denied/);
  const { rows } = await banco.db.query(`select public from storage.buckets where id = 'backups'`);
  assert.equal(rows[0].public, false);
});

// ---------- Servidor ----------

const asanaEspiao = () => {
  const chamadas = [];
  return {
    chamadas,
    fetchImpl: async (url, opcoes = {}) => {
      chamadas.push({ url: String(url), metodo: opcoes.method || "GET" });
      return { ok: true, status: 200, text: async () => JSON.stringify({ data: {} }) };
    },
  };
};

test("API: criar conta e ver contas só para admin, e o pedido não escolhe papel nem metadados", async () => {
  const pedidos = [];
  const authAdmin = {
    createUser: async (dados) => {
      pedidos.push(dados);
      return { data: {}, error: null };
    },
    listUsers: async () => ({ data: { users: [{ email: "ana@x.com", created_at: "2026-01-01" }], nextPage: null }, error: null }),
  };
  const admin = { ...banco.clienteServidor(), auth: { admin: authAdmin } };
  const chamar = async (email, acao, dados) => {
    const req = new Request("https://x/api", { method: "POST", body: JSON.stringify({ acao, dados }) });
    return responderApi(req, { usuarioId: email ? await banco.idDoUsuario(email) : "", admin, env: { SUPABASE_URL: "https://x", ASANA_TOKEN: "t" } });
  };
  const dadosAtaque = { email: "invasor@x.com", senha: "senhaforte1", nome: "Invasor", role: "admin", papel: "admin", app_metadata: { role: "admin" }, user_metadata: { role: "admin" }, email_confirm: true };
  for (const email of [...SEM_ADMIN, ""]) {
    for (const acao of ["criarContaLogin", "listarContasLogin", "backupAgora"]) {
      const resposta = await chamar(email, acao, dadosAtaque);
      assert.equal(resposta.status, email ? 403 : 401, `${email || "anônimo"} ${acao}`);
    }
  }
  assert.equal(pedidos.length, 0, "nenhuma conta foi criada");

  const resposta = await chamar("ana@x.com", "criarContaLogin", dadosAtaque);
  assert.equal(resposta.status, 200);
  assert.deepEqual(pedidos[0], { email: "invasor@x.com", email_confirm: true, password: "senhaforte1", user_metadata: { display_name: "Invasor" } });
  assert.equal((await banco.lerMeta()).roles["invasor@x.com"], undefined, "conta criada não ganha papel: sem papel, não acessa");
});

test("API: conta apagada, bloqueada ou sem confirmar não usa o token que ainda tem", async () => {
  const admin = { ...banco.clienteServidor(), auth: { admin: {} } };
  const pedir = async (usuarioId) => {
    const req = new Request("https://x/api", { method: "POST", body: JSON.stringify({ acao: "backupAgora", dados: {} }) });
    return (await responderApi(req, { usuarioId, admin, env: {} })).status;
  };
  const id = await banco.idDoUsuario("ana@x.com");
  for (const sql of [`banned_until = now() + interval '1 hour'`, `deleted_at = now()`, `email_confirmed_at = null`]) {
    await banco.db.query(`update auth.users set ${sql} where email = 'ana@x.com'`);
    assert.equal(await pedir(id), 401, sql);
    await banco.db.query(`update auth.users set banned_until = null, deleted_at = null, email_confirmed_at = now() where email = 'ana@x.com'`);
  }
  assert.equal(await pedir("00000000-0000-0000-0000-000000000000"), 401, "id que não existe");
});

test("Asana: identificador com caminho nunca vira chamada, nem se já estiver gravado na demanda", async () => {
  for (const forjado of ["../projects/1219543786224599", "..%2Fprojects%2F1", "1/../../projects/2", "1?x=1", "a b", "\\..\\x"]) {
    const repo = repositorioEmMemoria({ "demandas/d1": { asanaTaskId: forjado, comentarios: [] } });
    const espiao = asanaEspiao();
    const base = { repositorio: repo, token: "t", fetchImpl: espiao.fetchImpl, demandaId: "d1" };
    assert.equal((await asana.cancelarTarefa(base)).deleted, false, forjado);
    assert.deepEqual(await asana.sincronizarComentario({ ...base, acao: "criar", comentarioId: "c1", texto: "oi", autor: "Bia" }), { ignorado: "sem-tarefa" }, forjado);
    await assert.rejects(asana.anexarArquivo({ ...base, nome: "a.txt", tipo: "text/plain", base64: "YQ==", autor: "Bia" }), /ainda não tem tarefa/, forjado);
    assert.deepEqual(espiao.chamadas, [], forjado);
  }
  const chamar = criarCliente("t", asanaEspiao().fetchImpl);
  for (const caminho of ["/tasks/../projects/1", "/tasks/..%2Fprojects", "/tasks/%2e%2e/x", "/tasks/..\\x"]) {
    await assert.rejects(chamar(caminho), /Caminho inválido/, caminho);
  }
  await chamar("/tasks/123?opt_fields=gid,permalink_url");
});

test("nova ordem no banco real: não herda a situação da anterior e trava outra ordem até concluir esta", async () => {
  await banco.semear([{ id: "n1", dados: { titulo: "T", asanaTaskId: "T1", asanaTaskIds: ["T1"], asana: { taskId: "T1", url: "https://app.asana.com/0/1/T1", concluidaEm: "2026-10-20T10:00:00.000Z", secao: "Concluído", projetoGid: PROJ }, comentarios: [] } }]);
  const repositorio = criarRepositorioSupabase(banco.clienteServidor());
  const gids = ["T2", "T3"];
  const fetchImpl = async (url, opcoes = {}) => {
    const u = new URL(String(url));
    if (u.pathname.endsWith("/tasks") && opcoes.method === "POST") {
      const gid = gids.shift();
      return { ok: true, status: 200, text: async () => JSON.stringify({ data: { gid, permalink_url: `https://app.asana.com/0/1/${gid}` } }) };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify({ data: u.pathname.endsWith("/webhooks") && opcoes.method === "POST" ? { gid: "W1" } : u.pathname.endsWith("/webhooks") ? [] : { name: "Operação" } }) };
  };
  const pedir = () => asana.criarTarefa({ repositorio, token: "t", fetchImpl, demandaId: "n1", instrucoes: "de novo", projetoGid: PROJ, email: "bia@x.com", endpoint: "https://x/w", novaOrdem: true });

  const resposta = await pedir();
  assert.equal(resposta.taskId, "T2");
  assert.equal(JSON.stringify(resposta).includes("REMOVER"), false, "a resposta ao navegador não leva marcador interno");
  const d = await banco.lerDemanda("n1");
  assert.equal(d.asana.taskId, "T2");
  assert.equal("concluidaEm" in d.asana, false, "a ordem nova não nasce concluída");
  assert.equal("secao" in d.asana, false, "nem na coluna da anterior");
  assert.equal(d.asanaAnteriores[0].concluidaEm, "2026-10-20T10:00:00.000Z", "o histórico da anterior fica");
  assert.equal(d.asanaAnteriores[0].secao, "Concluído");
  await assert.rejects(pedir(), /ainda não foi concluída/, "com a atual aberta, não dá para abrir outra");
});

// ---------- Console e dados no aparelho ----------

const iniciarApp = async (email, opcoes = {}) => {
  const cliente = await como(email);
  const app = carregarApp(cliente, { email, ...opcoes });
  const dados = [];
  app.api = await app.DemandasNuvem.init({ onData: (d) => dados.push(d), onStatus() {}, onRoles() {} });
  app.dados = dados;
  return app;
};

test("console do navegador: alterar os papéis na memória muda a tela, não o servidor", async () => {
  const app = await iniciarApp("bia@x.com");
  assert.equal(app.DemandasRoles.isAdmin({ email: "bia@x.com" }), false);

  // O que alguém digitaria no DevTools.
  app.DemandasRoles.setRolesMap({ "bia@x.com": "admin" });
  app.DemandasRoles.definirAdminPrincipal("bia@x.com");
  assert.equal(app.DemandasRoles.isAdmin({ email: "bia@x.com" }), true, "na tela, parece admin");

  await assert.rejects(app.api.persistRoles({ "bia@x.com": "admin" }), /Sem permissão/);
  assert.equal((await app.cliente.rpc("acessos_salvar", { p_campos: { roles: { "bia@x.com": "admin" } } })).error?.code, "42501");
  assert.equal(await papelDe("bia@x.com"), "projetista", "no servidor, nada mudou");
  assert.equal((await app.cliente.rpc("acesso_nivel")).data, "escrita");
  assert.deepEqual((await app.cliente.from("acessos_historico").select("*")).data, [], "o histórico continua fechado");
  app.DemandasNuvem.teardown();
});

test("console do navegador: erros de permissão e de rede não escrevem dados, só o contexto e o código", async () => {
  const SENSIVEIS = ["Título Confidencial", "cliente.vip@empresa.com", "Rua Secreta", "p-secreto", "bia@x.com", SEED, "permission denied", "demanda_salvar"];
  await banco.semear([{ id: "p-secreto", dados: { titulo: "Título Confidencial", solicitante: "cliente.vip@empresa.com", descricao: "Rua Secreta" } }]);
  let fora = false;
  const app = await iniciarApp("bia@x.com", {
    aoDecorar: (c) => ({
      ...c,
      rpc: (n, a) => (fora ? Promise.resolve({ data: null, error: { message: `Failed to fetch p-secreto bia@x.com ${n}` } }) : c.rpc(n, a)),
      from: (t) => {
        const consulta = c.from(t);
        return fora ? { ...consulta, select: () => ({ order: () => ({ range: () => Promise.resolve({ data: null, error: { message: "permission denied p-secreto Título Confidencial" } }) }), eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: { message: "permission denied bia@x.com" } }) }), in: () => Promise.resolve({ data: null, error: { message: "permission denied p-secreto" } }) }) } : consulta;
      },
    }),
  });
  fora = true;
  await assert.rejects(app.api.upsertDemanda({ id: "p-secreto", titulo: "Título Confidencial", solicitante: "cliente.vip@empresa.com" }), /guardada neste aparelho/);
  await app.api.persistMeta({ diarias: [] }).catch(() => {});
  await app.DemandasNuvem.chamar("x").catch(() => {});
  app.tempoReal.avisarDemanda({ new: { id: "p-secreto" } });
  app.tempoReal.avisarMeta();
  app.tempoReal.cair();
  await new Promise((r) => setTimeout(r, 300));
  app.DemandasNuvem.teardown();

  assert.ok(app.saidaConsole.length > 0, "as falhas foram registradas");
  for (const linha of app.saidaConsole) {
    for (const dado of SENSIVEIS) assert.equal(linha.includes(dado), false, `console mostrou «${dado}»: ${linha}`);
    assert.match(linha, /^\[Projetos\] /);
  }
});

test("código do app: nada escreve no console a não ser o registro seguro", () => {
  const site = path.join(RAIZ, "site");
  const encontrados = [];
  for (const entrada of fs.readdirSync(site, { recursive: true })) {
    const arquivo = path.join(site, String(entrada));
    if (!/\.js$/.test(arquivo) || path.basename(arquivo) === "log-seguro.js" || !fs.statSync(arquivo).isFile()) continue;
    if (/\bconsole\s*[.[]/.test(fs.readFileSync(arquivo, "utf8"))) encontrados.push(path.relative(site, arquivo));
  }
  assert.deepEqual(encontrados, []);
});

test("computador compartilhado: quem entra depois não recebe nada de quem saiu", async () => {
  await banco.semear([{ id: "p1", dados: { titulo: "De outra pessoa", updatedAt: "2026-11-06T10:00:00.000Z" } }]);
  const armazem = new Map();
  const bia = await iniciarApp("bia@x.com", { armazem });
  await new Promise((r) => setTimeout(r, 650));
  assert.ok(armazem.has("demandasProjetos_v1:bia@x.com"), "a cópia existe enquanto ela usa");
  assert.ok(bia.dados.at(-1).demandas.some((d) => d.id === "p1"));
  bia.DemandasNuvem.teardown();

  // Sem sair (sessão expirou, navegador fechado): outra pessoa, sem acesso nenhum, entra no mesmo navegador.
  const dados = [];
  const estranho = carregarApp(await como("estranho@x.com"), { email: "estranho@x.com", armazem });
  await estranho.DemandasNuvem.init({ onData: (d) => dados.push(d), onStatus() {}, onRoles() {} });
  assert.equal(dados.flatMap((d) => d.demandas).some((d) => d.id === "p1"), false, "nunca recebeu a demanda");
  assert.equal(estranho.DemandasNuvem.loadLocal(), null);
  await new Promise((r) => setTimeout(r, 650));
  assert.deepEqual([...armazem.keys()].filter((k) => k.startsWith("demandasProjetos_v1")), [], "e a cópia dela não fica mais legível");
  estranho.DemandasNuvem.teardown();
});

test("sair apaga a cópia local; alterações ainda não enviadas ficam até a pessoa voltar", async () => {
  await banco.semear([{ id: "p1", dados: { titulo: "T" } }]);
  const armazem = new Map();
  let fora = false;
  const bia = await iniciarApp("bia@x.com", {
    armazem,
    aoDecorar: (c) => ({ ...c, rpc: (n, a) => (fora && n === "demanda_salvar" ? Promise.resolve({ data: null, error: { message: "Failed to fetch" } }) : c.rpc(n, a)) }),
  });
  bia.DemandasNuvem.saveLocal({ demandas: [{ id: "p1", titulo: "T" }] });
  fora = true;
  await assert.rejects(bia.api.upsertDemanda({ id: "p1", titulo: "Offline" }), /guardada/);
  bia.DemandasNuvem.teardown();
  bia.DemandasNuvem.apagarCopiasLocais();
  const chaves = [...armazem.keys()];
  assert.deepEqual(chaves.filter((k) => k.startsWith("demandasProjetos_v1")), []);
  assert.deepEqual(chaves.filter((k) => k.startsWith("demandasProjetos_pendentes_v1")), ["demandasProjetos_pendentes_v1:bia@x.com"]);
});

test("quem perde o acesso perde também a cópia guardada no aparelho", async () => {
  await banco.semear([{ id: "p1", dados: { titulo: "T" } }]);
  const armazem = new Map([["demandasProjetos_v1:removida@x.com", JSON.stringify({ demandas: [{ id: "p1", titulo: "Antigo" }] })]]);
  const dados = [];
  const app = carregarApp(await como("removida@x.com"), { email: "removida@x.com", armazem });
  await app.DemandasNuvem.init({ onData: (d) => dados.push(d), onStatus() {}, onRoles() {} });
  await new Promise((r) => setTimeout(r, 650));
  assert.equal(armazem.has("demandasProjetos_v1:removida@x.com"), false);
  assert.equal(dados.at(-1).demandas.length, 0, "a tela final fica vazia");
  assert.equal(app.DemandasNuvem.loadLocal(), null);
  app.DemandasNuvem.teardown();
});

test("a cópia da versão antiga, sem dono, é apagada ao entrar", async () => {
  const armazem = new Map([["demandasProjetos_v1", JSON.stringify({ demandas: [{ id: "velha", titulo: "Firebase" }] })]]);
  const dados = [];
  const app = carregarApp(await como("bia@x.com"), { email: "bia@x.com", armazem });
  await app.DemandasNuvem.init({ onData: (d) => dados.push(d), onStatus() {}, onRoles() {} });
  assert.equal(armazem.has("demandasProjetos_v1"), false);
  assert.equal(dados.flatMap((d) => d.demandas).some((d) => d.id === "velha"), false);
  app.DemandasNuvem.teardown();
});

test("o e-mail do admin só aparece na memória do app depois de o banco confirmar o acesso", async () => {
  const antes = carregarApp(await como("bia@x.com"), { email: "bia@x.com" });
  assert.equal(antes.contexto.DEMANDAS_ADMIN_EMAIL, "", "visitante não vê");
  assert.deepEqual(JSON.parse(JSON.stringify(antes.contexto.DEMANDAS_ROLES_SEED)), {});

  const estranho = await iniciarApp("estranho@x.com");
  assert.equal(estranho.contexto.DEMANDAS_ADMIN_EMAIL, "", "conta sem acesso também não");
  estranho.DemandasNuvem.teardown();

  const bia = await iniciarApp("bia@x.com");
  assert.equal(bia.contexto.DEMANDAS_ADMIN_EMAIL, SEED);
  bia.DemandasNuvem.teardown();
});

test("hospedagem: CSP bloqueia de verdade, sem script inline e sem CDN inteira; biblioteca sob demanda tem integridade", () => {
  const hosting = JSON.parse(fs.readFileSync(path.join(RAIZ, "firebase.json"), "utf8")).hosting;
  const regras = hosting.headers.filter((r) => r.headers.some((h) => h.key === "Content-Security-Policy"));
  assert.equal(regras.length, 2);
  for (const regra of regras) {
    assert.equal(regra.headers.some((h) => h.key === "Content-Security-Policy-Report-Only"), false, "não é só relatório");
    const csp = regra.headers.find((h) => h.key === "Content-Security-Policy").value;
    const script = csp.split(";").find((d) => d.trim().startsWith("script-src"));
    assert.ok(!/unsafe-inline|unsafe-eval|\*/.test(script), script);
    for (const origem of script.trim().split(/\s+/).slice(1)) {
      if (origem !== "'self'") assert.match(origem, /^https:\/\/[^/]+\/.+\.js$/, `origem inteira liberada: ${origem}`);
    }
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /object-src 'none'/);
    assert.match(csp, /base-uri 'self'/);
    assert.match(csp, /form-action 'self'/);
    assert.ok(!/img-src[^;]*https:/.test(csp), "imagem de qualquer site serviria para vazar dados");
  }
  const carregador = fs.readFileSync(path.join(RAIZ, "site/js/nucleo/carregar-sob-demanda.js"), "utf8");
  assert.match(carregador, /\[CHART_JS\]: "sha384-/);
  assert.match(carregador, /\[PDF_JS\]: "sha384-/);
  assert.match(fs.readFileSync(path.join(RAIZ, "site/index.html"), "utf8"), /supabase\.js" integrity="sha384-/);
  assert.equal(hosting.public, "site", "só a pasta do site é publicada: migrations e scripts ficam de fora");
});
