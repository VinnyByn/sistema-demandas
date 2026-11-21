// Avisos por e-mail no PGlite: quem é avisado ao salvar um projeto, o e-mail montado e as preferências.
// O envio de verdade (pg_net, Vault, agendamento) não existe aqui: fica na migration de agendamento.
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
    "matheus.costa@x.com": "projetista",
    "joao@x.com": "projetista",
    "daniel.a@x.com": "projetista",
    "daniel.b@x.com": "projetista",
    "leitor@x.com": "visibilidade",
    "saiu@x.com": "projetista",
  },
  disabledUsers: { "saiu@x.com": true },
  purgedUsers: {},
  userRegionals: {},
  userDisplayNames: { [SEED]: "Vinicius Morais", "matheus.costa@x.com": "Matheus Costa", "joao@x.com": "João", "saiu@x.com": "Saiu" },
};

let banco;
const como = (email) => banco.clienteUsuario(email);
const agora = () => new Date().toISOString();
const ok = (r) => assert.equal(r.error, null, JSON.stringify(r.error));

async function eventos() {
  return (await banco.db.query(`select para, tipo, demanda_id, titulo, detalhe, por from public.email_eventos order by para, tipo`)).rows;
}
async function saida() {
  return (await banco.db.query(`select para, assunto, html, texto, chave from public.email_saida order by para`)).rows;
}

before(async () => {
  banco = await criarBancoDeTeste();
});
after(async () => {
  await banco.db.close();
});
beforeEach(async () => {
  await banco.limpar();
  await banco.definirMeta(META);
});

test("menção em comentário novo avisa quem foi mencionado (e não quem escreveu nem quem não tem acesso)", async () => {
  await banco.semear([{ id: "p1", dados: { titulo: "Rota IJA", comentarios: [] } }]);
  const vinicius = await como(SEED);
  const comentario = {
    id: "c1",
    autor: "Vinicius Morais",
    texto: "@Matheus Costa @Saiu confere o custo?",
    createdAt: agora(),
    mencoes: ["matheus.costa@x.com", "saiu@x.com", SEED],
  };
  ok(await vinicius.rpc("demanda_salvar", { p_id: "p1", p_campos: { comentarios: [comentario] } }));
  assert.deepEqual(await eventos(), [
    { para: "matheus.costa@x.com", tipo: "mencao", demanda_id: "p1", titulo: "Rota IJA", detalhe: comentario.texto, por: "Vinicius Morais" },
  ]);

  // Salvar de novo com o mesmo comentário (ou outro campo) não repete o aviso.
  ok(await vinicius.rpc("demanda_salvar", { p_id: "p1", p_campos: { comentarios: [comentario], descricao: "x" } }));
  assert.equal((await eventos()).length, 1);
});

test("comentário antigo (importado ou restaurado) não gera aviso", async () => {
  const vinicius = await como(SEED);
  const velho = { id: "c9", autor: "Vinicius Morais", texto: "@Matheus Costa", createdAt: "2025-01-10T10:00:00.000Z", mencoes: ["matheus.costa@x.com"] };
  ok(await vinicius.rpc("demanda_salvar", { p_id: "p2", p_campos: { titulo: "Velho", comentarios: [velho] } }));
  assert.deepEqual(await eventos(), []);
});

test("projetista e atividade atribuídos: acha a conta pelo nome; nome ambíguo não avisa ninguém", async () => {
  const vinicius = await como(SEED);
  ok(
    await vinicius.rpc("demanda_salvar", {
      p_id: "p3",
      p_campos: {
        titulo: "Condomínio",
        createdAt: agora(),
        responsavel: "Matheus",
        projetistasExtra: ["Daniel", "Joao"],
        checklist: [
          { id: "a1", name: "Vistoria", who: "João", date: "2026-12-01", status: "afazer" },
          { id: "a2", name: "Já feita", who: "Matheus", status: "concluida", done: true },
        ],
      },
    }),
  );
  assert.deepEqual(
    (await eventos()).map((e) => [e.para, e.tipo, e.detalhe]),
    [
      ["joao@x.com", "atividade", "Vistoria · até 01/12/2026"],
      ["joao@x.com", "atribuicao", ""],
      ["matheus.costa@x.com", "atribuicao", ""],
    ],
  );

  // Mudar só a descrição não repete; trocar o projetista avisa só o novo.
  await banco.db.exec("truncate public.email_eventos");
  ok(await vinicius.rpc("demanda_salvar", { p_id: "p3", p_campos: { descricao: "nova", responsavel: "Vinicius" } }));
  assert.deepEqual(await eventos(), [], "quem se coloca no projeto não recebe aviso de si mesmo");
  const matheus = await como("matheus.costa@x.com");
  ok(await matheus.rpc("demanda_salvar", { p_id: "p3", p_campos: { responsavel: "Matheus" } }));
  ok(await matheus.rpc("demanda_salvar", { p_id: "p3", p_campos: { responsavel: "Vinicius" } }));
  assert.deepEqual((await eventos()).map((e) => [e.para, e.tipo, e.por]), [[SEED, "atribuicao", "Matheus Costa"]]);
});

test("projeto restaurado de backup (criado há tempo) e projeto na lixeira não geram aviso", async () => {
  const vinicius = await como(SEED);
  ok(await vinicius.rpc("demanda_salvar", { p_id: "p4", p_campos: { titulo: "Antigo", createdAt: "2025-03-01T00:00:00.000Z", responsavel: "Matheus" } }));
  ok(await vinicius.rpc("demanda_salvar", { p_id: "p5", p_campos: { titulo: "Lixo", createdAt: agora(), responsavel: "Matheus", excluidoEm: agora() } }));
  assert.deepEqual(await eventos(), []);
});

test("um erro no aviso nunca impede salvar o projeto", async () => {
  await banco.db.exec(`alter table public.email_eventos add constraint quebra check (false)`);
  try {
    const vinicius = await como(SEED);
    ok(await vinicius.rpc("demanda_salvar", { p_id: "p6", p_campos: { titulo: "Salva mesmo assim", createdAt: agora(), responsavel: "Matheus" } }));
    assert.equal((await banco.lerDemanda("p6")).titulo, "Salva mesmo assim");
  } finally {
    await banco.db.exec(`alter table public.email_eventos drop constraint quebra`);
  }
});

test("preparar: junta os avisos de cada pessoa num e-mail, com link que abre o projeto e texto escapado", async () => {
  const vinicius = await como(SEED);
  for (const [id, titulo] of [["p7", "Rota <b>1</b>"], ["p8", "Rota 2"]]) {
    ok(await vinicius.rpc("demanda_salvar", { p_id: id, p_campos: { titulo, createdAt: agora(), responsavel: "Matheus" } }));
  }
  assert.equal((await banco.db.query(`select public.email_preparar() as n`)).rows[0].n, 0, "espera a rajada terminar");
  assert.equal((await banco.db.query(`select public.email_preparar(interval '0 seconds') as n`)).rows[0].n, 1);
  const [email] = await saida();
  assert.equal(email.para, "matheus.costa@x.com");
  assert.equal(email.assunto, "2 avisos no Projetos Master");
  assert.ok(email.html.includes("Rota &lt;b&gt;1&lt;/b&gt;"), "título escapado");
  assert.ok(!email.html.includes("<b>1</b>"));
  assert.ok(email.html.includes("https://demproj-fdeac.web.app/?abrir=p7"));
  assert.ok(email.texto.includes("Vinicius Morais colocou você como projetista: Rota 2"));
  assert.equal((await banco.db.query(`select count(*)::int as n from public.email_eventos where saida_id is null`)).rows[0].n, 0);
  assert.equal((await banco.db.query(`select public.email_preparar(interval '0 seconds') as n`)).rows[0].n, 0, "não manda de novo");
});

test("resumo de prazos: atrasados, hoje e próximos dias de cada pessoa, uma vez por dia", async () => {
  await banco.semear([
    { id: "q1", dados: { titulo: "Atrasado", responsavel: "Matheus", status: "custo", dataFimPrevista: "2026-11-10" } },
    { id: "q2", dados: { titulo: "Hoje", responsavel: "Matheus", status: "custo", dataFimPrevista: "2026-11-01", dataFimAtualizada: "2026-11-20" } },
    { id: "q3", dados: { titulo: "Longe", responsavel: "Matheus", status: "custo", dataFimPrevista: "2027-01-10" } },
    { id: "q4", dados: { titulo: "Concluído", responsavel: "Matheus", status: "conclusao", dataFimPrevista: "2026-11-10" } },
    {
      id: "q5",
      dados: {
        titulo: "Com atividade",
        responsavel: "Vinicius",
        status: "novo",
        checklist: [
          { id: "x", name: "Vistoria", who: "Matheus Costa", date: "2026-11-15", dateNova: "2026-11-22", status: "afazer" },
          { id: "y", name: "Feita", who: "Matheus", date: "2026-11-19", status: "concluida", done: true },
        ],
      },
    },
  ]);
  await banco.db.query(`insert into public.email_preferencias (email, prazos) values ($1, false)`, [SEED]);
  assert.equal((await banco.db.query(`select public.email_prazos_preparar('2026-11-20'::date) as n`)).rows[0].n, 1);
  const [email] = await saida();
  assert.equal(email.para, "matheus.costa@x.com");
  assert.equal(email.assunto, "Seus prazos: 1 atrasado, 1 vence hoje, 1 nos próximos dias");
  assert.ok(email.texto.includes("[atrasado] 10/11/2026 · Prazo do projeto · Atrasado"));
  assert.ok(email.texto.includes("[hoje] 20/11/2026 · Prazo do projeto · Hoje"));
  assert.ok(email.texto.includes("22/11/2026 · Atividade: Vistoria · Com atividade"));
  assert.ok(!email.texto.includes("Longe") && !email.texto.includes("Concluído") && !email.texto.includes("Feita"));
  assert.equal(email.chave, "prazos:matheus.costa@x.com:2026-11-20");
  assert.equal((await banco.db.query(`select public.email_prazos_preparar('2026-11-20'::date) as n`)).rows[0].n, 0, "uma vez por dia");
});

test("preferências: cada um lê e muda só as suas; desligar a menção para de avisar", async () => {
  const matheus = await como("matheus.costa@x.com");
  const lido = await matheus.rpc("email_preferencias_ler");
  ok(lido);
  assert.deepEqual(lido.data, { mencao: true, atribuicao: true, prazos: true, envioConfigurado: false });
  ok(await matheus.rpc("email_preferencias_salvar", { p_campos: { mencao: false } }));
  assert.equal((await matheus.rpc("email_preferencias_ler")).data.mencao, false);
  assert.equal((await matheus.rpc("email_preferencias_ler")).data.prazos, true);

  // Só chaves conhecidas e valores verdadeiro/falso; não dá para escolher de quem é a preferência.
  for (const campos of [{ email: "joao@x.com", mencao: false }, { mencao: "nao" }, ["mencao"]]) {
    assert.ok((await matheus.rpc("email_preferencias_salvar", { p_campos: campos })).error, JSON.stringify(campos));
  }
  assert.equal((await banco.db.query(`select count(*)::int as n from public.email_preferencias`)).rows[0].n, 1);

  const vinicius = await como(SEED);
  const c = { id: "c1", autor: "Vinicius Morais", texto: "@Matheus Costa", createdAt: agora(), mencoes: ["matheus.costa@x.com"] };
  ok(await vinicius.rpc("demanda_salvar", { p_id: "p9", p_campos: { titulo: "X", comentarios: [c] } }));
  assert.deepEqual(await eventos(), []);

  // O administrador vê como está o envio; os outros, não.
  assert.ok("pendentes" in (await vinicius.rpc("email_preferencias_ler")).data);
  assert.ok(!("pendentes" in (await matheus.rpc("email_preferencias_ler")).data));
});

test("sem acesso não lê preferências nem pede teste; só o administrador pede e-mail de teste", async () => {
  for (const email of ["estranho@x.com", "saiu@x.com"]) {
    assert.equal((await (await como(email)).rpc("email_preferencias_ler")).error?.code, "42501", email);
  }
  assert.equal((await banco.clienteAnonimo().rpc("email_preferencias_ler")).error?.code, "42501");
  assert.equal((await (await como("matheus.costa@x.com")).rpc("email_teste")).error?.code, "42501");
  const vinicius = await como(SEED);
  ok(await vinicius.rpc("email_teste"));
  assert.ok((await vinicius.rpc("email_teste")).error, "um de cada vez");
  const [email] = await saida();
  assert.equal(email.para, SEED);
  assert.equal(email.assunto, "Teste dos avisos do Projetos Master");
});

test("as tabelas dos avisos não são lidas nem gravadas direto por quem está logado", async () => {
  const vinicius = await como(SEED);
  for (const tabela of ["email_preferencias", "email_eventos", "email_saida"]) {
    const { error } = await vinicius.from(tabela).select("*");
    assert.equal(error?.code, "42501", tabela);
  }
  for (const funcao of ["email_preparar", "email_prazos_preparar", "email_contas_ativas"]) {
    const { error } = await vinicius.rpc(funcao, funcao === "email_contas_ativas" ? { p_meta: META } : {});
    assert.equal(error?.code, "42501", funcao);
  }
});

test("envio: monta o pedido do Resend e do Brevo, confere a resposta e tenta de novo quando falha", async () => {
  // No PGlite não há pg_net, Vault nem pg_cron: imitações mínimas, só para rodar a migration do envio.
  const fs = await import("node:fs");
  await banco.db.exec(`
    create schema if not exists vault;
    create table if not exists vault.decrypted_secrets (name text primary key, decrypted_secret text);
    create schema if not exists net;
    create table if not exists net.pedidos (id bigserial primary key, url text, body jsonb, headers jsonb);
    create table if not exists net._http_response (id bigint primary key, status_code int, content text, error_msg text, timed_out boolean);
    create or replace function net.http_post(url text, body jsonb, headers jsonb, timeout_milliseconds int) returns bigint
      language sql as $$ insert into net.pedidos (url, body, headers) values (url, body, headers) returning id $$;
    create schema if not exists cron;
    create table if not exists cron.job (jobid bigserial primary key, jobname text, schedule text, command text);
    create or replace function cron.schedule(n text, s text, c text) returns bigint
      language sql as $$ insert into cron.job (jobname, schedule, command) values (n, s, c) returning jobid $$;
    create or replace function cron.unschedule(id bigint) returns boolean
      language sql as $$ delete from cron.job where jobid = id returning true $$;
    truncate vault.decrypted_secrets, net.pedidos, net._http_response, cron.job;
  `);
  const sql = fs
    .readFileSync(new URL("../../supabase/migrations/20261121120100_agendamento_emails.sql", import.meta.url), "utf8")
    .replace(/^create extension.*$/gm, "");
  await banco.db.exec(sql);
  await banco.db.exec(sql); // reaplicar não duplica o agendamento
  assert.deepEqual((await banco.db.query(`select jobname, schedule from cron.job order by jobname`)).rows, [
    { jobname: "avisos-email", schedule: "*/5 * * * *" },
    { jobname: "avisos-email-prazos", schedule: "40 10 * * 1-5" },
  ]);

  const enviar = async () => (await banco.db.query(`select public.email_enviar() as n`)).rows[0].n;
  await (await como(SEED)).rpc("email_teste");
  assert.equal(await enviar(), 0, "sem chave no Vault, nada sai");

  await banco.db.exec(`insert into vault.decrypted_secrets values ('email_chave', 're_teste'), ('email_remetente', 'Projetos Master <avisos@exemplo.com>')`);
  assert.equal(await enviar(), 1);
  const [resend] = (await banco.db.query(`select * from net.pedidos`)).rows;
  assert.equal(resend.url, "https://api.resend.com/emails");
  assert.equal(resend.headers.Authorization, "Bearer re_teste");
  assert.equal(resend.body.from, "Projetos Master <avisos@exemplo.com>");
  assert.deepEqual(resend.body.to, [SEED]);
  assert.equal(resend.body.subject, "Teste dos avisos do Projetos Master");

  // Erro temporário: volta para a fila; na rodada seguinte sai de novo.
  await banco.db.query(`insert into net._http_response values ($1, 503, 'ocupado', null, false)`, [resend.id]);
  assert.equal(await enviar(), 1);
  const segundo = (await banco.db.query(`select max(id) as id from net.pedidos`)).rows[0].id;
  await banco.db.query(`insert into net._http_response values ($1, 200, '{"id":"x"}', null, false)`, [segundo]);
  assert.equal(await enviar(), 0);
  const [registro] = (await banco.db.query(`select situacao, tentativas, erro from public.email_saida`)).rows;
  assert.deepEqual(registro, { situacao: "enviado", tentativas: 2, erro: null });

  // Brevo: outro formato, chave no cabeçalho api-key. Chave errada (401) não fica tentando.
  await banco.db.exec(`insert into vault.decrypted_secrets values ('email_provedor', 'brevo'); truncate public.email_saida;`);
  await banco.db.query(`insert into public.email_saida (para, assunto, html, texto) values ($1, 'Oi', '<p>Oi</p>', 'Oi')`, ["joao@x.com"]);
  assert.equal(await enviar(), 1);
  const brevo = (await banco.db.query(`select * from net.pedidos order by id desc limit 1`)).rows[0];
  assert.equal(brevo.url, "https://api.brevo.com/v3/smtp/email");
  assert.equal(brevo.headers["api-key"], "re_teste");
  assert.deepEqual(brevo.body.sender, { name: "Projetos Master", email: "avisos@exemplo.com" });
  assert.deepEqual(brevo.body.to, [{ email: "joao@x.com" }]);
  await banco.db.query(`insert into net._http_response values ($1, 401, 'chave inválida', null, false)`, [brevo.id]);
  assert.equal(await enviar(), 0);
  const falhou = (await banco.db.query(`select situacao, erro from public.email_saida where para = 'joao@x.com'`)).rows[0];
  assert.deepEqual(falhou, { situacao: "erro", erro: "HTTP 401: chave inválida" });
});
