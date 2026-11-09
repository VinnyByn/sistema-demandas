/**
 * Banco de teste: PGlite (Postgres em WebAssembly) com as migrations reais e o que o Supabase já traz (auth, storage,
 * papéis, publicação). O PGlite roda como superusuário e o dono da tabela ignora a RLS: por isso toda chamada troca de
 * papel antes, senão os testes de permissão passariam sem provar nada. Não valida o PostgREST nem o Supabase hospedado.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const PASTA_MIGRATIONS = fileURLToPath(new URL("../../../supabase/migrations/", import.meta.url));
const TABELAS = "public.demandas, public.sistema_meta, public.sistema_backups, public.acessos_historico, public.asana_story_vinculos, public.asana_envios, public.asana_anexos, public.asana_webhooks";

const O_QUE_O_SUPABASE_TRAZ = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text unique,
    email_confirmed_at timestamptz default now(),
    banned_until timestamptz,
    deleted_at timestamptz
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  create schema storage;
  create table storage.buckets (id text primary key, name text not null, public boolean default false);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  grant usage on schema storage to authenticated;
  grant select on storage.objects to authenticated;
  create publication supabase_realtime;
  grant usage on schema public to anon, authenticated, service_role;
  -- Como no Supabase: tudo que nasce em public já vem aberto para a chave pública. Sem isto, um revoke esquecido passaria aqui e ficaria aberto lá.
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

const migrationsAplicaveis = () =>
  fs.readdirSync(PASTA_MIGRATIONS).filter((f) => f.endsWith(".sql") && !f.includes("agendamento")).sort();

async function criarBancoDeTeste() {
  const db = new PGlite();
  await db.exec(O_QUE_O_SUPABASE_TRAZ);
  for (const vez of [1, 2]) {
    void vez; // duas vezes de propósito: a migration precisa poder ser reaplicada sem erro
    for (const arquivo of migrationsAplicaveis()) await db.exec(fs.readFileSync(path.join(PASTA_MIGRATIONS, arquivo), "utf8"));
  }

  async function comoPapel(papel, claims, fn) {
    return db.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims || {})]);
      await tx.exec(`set local role ${papel}`);
      return fn(tx);
    });
  }

  async function idDoUsuario(email) {
    const achado = await db.query(`select id from auth.users where email = $1`, [email]);
    if (achado.rows[0]) return achado.rows[0].id;
    return (await db.query(`insert into auth.users (email) values ($1) returning id`, [email])).rows[0].id;
  }

  /** Mesma forma do supabase-js: devolve { data, error } e não lança exceção. */
  function criarCliente(papel, claims = {}) {
    async function executar(fn) {
      try {
        return { data: await comoPapel(papel, claims, fn), error: null };
      } catch (erro) {
        return { data: null, error: { message: erro.message, code: erro.code } };
      }
    }

    function rpc(nome, args = {}) {
      const chaves = Object.keys(args);
      const valores = [];
      const parametros = chaves.map((chave) => {
        const valor = args[chave];
        if (valor === null || valor === undefined) return `${chave} => null`;
        valores.push(typeof valor === "string" ? valor : JSON.stringify(valor));
        // Texto sem tipo, como o PostgREST faz: quem decide é a assinatura da função (text, uuid...).
        return `${chave} => $${valores.length}${typeof valor === "string" ? "" : "::jsonb"}`;
      });
      return executar(async (tx) => (await tx.query(`select public.${nome}(${parametros.join(", ")}) as data`, valores)).rows[0]?.data ?? null);
    }

    function from(tabela) {
      const estado = { colunas: "*", filtros: [], valores: [], ordem: "", limite: "", deslocamento: "", unico: false };
      const consulta = {
        select(colunas = "*") {
          estado.colunas = colunas;
          return consulta;
        },
        eq(coluna, valor) {
          estado.valores.push(valor);
          estado.filtros.push(`${coluna} = $${estado.valores.length}`);
          return consulta;
        },
        in(coluna, lista) {
          estado.valores.push(lista);
          estado.filtros.push(`${coluna} = any($${estado.valores.length})`);
          return consulta;
        },
        order(coluna, { ascending = true } = {}) {
          estado.ordem = ` order by ${coluna} ${ascending ? "asc" : "desc"}`;
          return consulta;
        },
        limit(n) {
          estado.limite = ` limit ${Number(n)}`;
          return consulta;
        },
        range(de, ate) {
          estado.limite = ` limit ${Number(ate) - Number(de) + 1}`;
          estado.deslocamento = ` offset ${Number(de)}`;
          return consulta;
        },
        maybeSingle() {
          estado.unico = true;
          return consulta;
        },
        then(ok, falha) {
          const onde = estado.filtros.length ? ` where ${estado.filtros.join(" and ")}` : "";
          const sql = `select ${estado.colunas} from public.${tabela}${onde}${estado.ordem}${estado.limite}${estado.deslocamento}`;
          return executar(async (tx) => {
            const { rows } = await tx.query(sql, estado.valores);
            return estado.unico ? rows[0] ?? null : rows;
          }).then(ok, falha);
        },
      };
      return consulta;
    }

    return { rpc, from };
  }

  return {
    db,
    clienteServidor: () => criarCliente("service_role", { role: "service_role" }),
    clienteAnonimo: () => criarCliente("anon", { role: "anon" }),
    /** Cliente de um usuário logado, com o usuário já criado em auth.users. */
    async clienteUsuario(email) {
      return criarCliente("authenticated", { sub: await idDoUsuario(email), role: "authenticated", email });
    },
    async sqlComo(papel, claims, sql, valores = []) {
      return comoPapel(papel, claims, (tx) => tx.query(sql, valores));
    },
    idDoUsuario,
    async limpar() {
      await db.exec(`truncate table ${TABELAS} restart identity cascade;
        insert into public.sistema_meta (id, dados) values ('meta', '{"diarias": [], "projetistas": {}, "deletedDemandaIds": [], "deletedDiariaIds": []}');`);
    },
    async semear(demandas) {
      for (const { id, dados = {} } of demandas) {
        await db.query(`insert into public.demandas (id, dados) values ($1, $2::jsonb)`, [id, JSON.stringify(dados)]);
      }
    },
    async definirMeta(dados) {
      await db.query(`update public.sistema_meta set dados = $1::jsonb where id = 'meta'`, [JSON.stringify(dados)]);
    },
    async lerMeta() {
      return (await db.query(`select dados from public.sistema_meta where id = 'meta'`)).rows[0]?.dados;
    },
    async lerDemanda(id) {
      return (await db.query(`select dados from public.demandas where id = $1`, [id])).rows[0]?.dados;
    },
  };
}

export { criarBancoDeTeste };
