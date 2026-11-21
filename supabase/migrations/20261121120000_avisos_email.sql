-- Avisos por e-mail. Tudo acontece no banco, sem função nova para publicar:
--  · ao salvar um projeto, um gatilho anota os avisos (menção em comentário, projeto ou atividade atribuídos a alguém);
--  · email_preparar() junta os avisos de cada pessoa num e-mail só (uma importação não vira 200 e-mails);
--  · email_prazos_preparar() monta o resumo diário de prazos de cada pessoa;
--  · o envio (pg_net + Vault + agendamento) fica em 20261121120100_agendamento_emails.sql.
-- Quem recebe precisa ter acesso ao sistema (conta desabilitada ou removida não recebe) e pode desligar cada aviso na
-- Minha conta. Nenhum gatilho de e-mail impede a gravação do projeto: se algo falhar aqui, o projeto é salvo do mesmo jeito.

create table if not exists public.email_preferencias (
  email text primary key,
  mencao boolean not null default true,
  atribuicao boolean not null default true,
  prazos boolean not null default true,
  alterado_em timestamptz not null default now()
);

create table if not exists public.email_eventos (
  id uuid primary key default gen_random_uuid(),
  para text not null,
  tipo text not null check (tipo in ('mencao', 'atribuicao', 'atividade')),
  demanda_id text not null,
  titulo text not null,
  detalhe text not null default '',
  por text not null default '',
  criado_em timestamptz not null default now(),
  saida_id uuid
);
create index if not exists email_eventos_pendentes_idx on public.email_eventos (para, criado_em) where saida_id is null;

create table if not exists public.email_saida (
  id uuid primary key default gen_random_uuid(),
  para text not null,
  assunto text not null,
  html text not null,
  texto text not null,
  -- O resumo de prazos usa 'prazos:<e-mail>:<dia>': rodar duas vezes no mesmo dia não manda dois e-mails.
  chave text unique,
  situacao text not null default 'pronto' check (situacao in ('pronto', 'enviando', 'enviado', 'erro')),
  pedido bigint,
  tentativas integer not null default 0,
  erro text,
  criado_em timestamptz not null default now(),
  enviado_em timestamptz
);
create index if not exists email_saida_situacao_idx on public.email_saida (situacao, criado_em);

-- Ninguém lê nem grava essas tabelas direto pela chave do site: só pelas funções abaixo.
alter table public.email_preferencias enable row level security;
alter table public.email_eventos enable row level security;
alter table public.email_saida enable row level security;
revoke all on table public.email_preferencias, public.email_eventos, public.email_saida from public, anon, authenticated;

/* ---------- Auxiliares ---------- */

create or replace function public.email_site()
returns text language sql immutable set search_path = '' as $$
  select 'https://demproj-fdeac.web.app/'::text
$$;

create or replace function public.email_html(p_texto text)
returns text language sql immutable set search_path = '' as $$
  select replace(replace(replace(replace(replace(coalesce(p_texto, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;')
$$;

-- Sem acento e em minúsculas, como o projetistaSlug do site: «João» e «joao» são a mesma pessoa.
create or replace function public.email_slug(p_texto text)
returns text language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(lower(translate(coalesce(p_texto, ''),
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
    'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn')), '\s+', ' ', 'g'))
$$;

create or replace function public.email_data(p_texto text)
returns date language plpgsql immutable set search_path = '' as $$
begin
  if coalesce(p_texto, '') !~ '^\d{4}-\d{2}-\d{2}' then return null; end if;
  return left(p_texto, 10)::date;
exception when others then
  return null;
end $$;

create or replace function public.email_data_br(p_data date)
returns text language sql immutable set search_path = '' as $$
  select to_char(p_data, 'DD/MM/YYYY')
$$;

create or replace function public.email_lista(p_valor jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p_valor) = 'array' then p_valor else '[]'::jsonb end
$$;

-- Nome de exibição da conta (o mesmo dos comentários): o salvo pelo administrador ou o tirado do e-mail.
create or replace function public.email_nome_de(p_email text, p_meta jsonb)
returns text language sql immutable set search_path = '' as $$
  select coalesce(
    nullif(btrim(p_meta -> 'userDisplayNames' ->> p_email), ''),
    initcap(regexp_replace(split_part(p_email, '@', 1), '[._-]+', ' ', 'g'))
  )
$$;

-- Contas com acesso (habilitadas), com o administrador principal sempre incluído.
create or replace function public.email_contas_ativas(p_meta jsonb)
returns setof text language sql stable set search_path = '' as $$
  select distinct e from (
    select lower(k) as e from jsonb_object_keys(case when jsonb_typeof(p_meta -> 'roles') = 'object' then p_meta -> 'roles' else '{}'::jsonb end) k
    union all
    select public.acesso_principal_email()
  ) x
  where public.acesso_nivel_de(e, p_meta) <> ''
$$;

-- Os projetistas são nomes («Vinicius»), não e-mails. A conta é achada pelo nome de exibição: primeiro o nome inteiro;
-- se não houver, o primeiro nome — e só quando uma única conta tem esse primeiro nome (na dúvida, ninguém recebe).
create or replace function public.email_contas_do_nome(p_nome text, p_meta jsonb)
returns setof text language sql stable set search_path = '' as $$
  with contas as (
    select e, public.email_slug(public.email_nome_de(e, p_meta)) as n from public.email_contas_ativas(p_meta) e
  ),
  alvo as (select public.email_slug(p_nome) as n),
  exatas as (select c.e from contas c, alvo a where a.n <> '' and c.n = a.n),
  primeiro as (
    select c.e from contas c, alvo a
     where a.n <> '' and split_part(c.n, ' ', 1) = split_part(a.n, ' ', 1)
  )
  select e from exatas
  union all
  select e from primeiro where not exists (select 1 from exatas) and (select count(*) from primeiro) = 1
$$;

create or replace function public.email_quer(p_email text, p_tipo text, p_meta jsonb)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.acesso_nivel_de(p_email, p_meta) <> '', false)
     and coalesce((
       select case p_tipo when 'mencao' then p.mencao when 'prazos' then p.prazos else p.atribuicao end
         from public.email_preferencias p where p.email = p_email
     ), true)
$$;

create or replace function public.email_encerrada(p_dados jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select case
    when coalesce(p_dados ->> 'linhaEsteira', '') = 'b2b' or upper(coalesce(p_dados ->> 'tipo', '')) = 'B2B'
      then coalesce(p_dados ->> 'status', '') in ('projeto_final', 'documentacao', 'reprovado')
    else coalesce(p_dados ->> 'status', '') in ('conclusao', 'reprovado')
  end
$$;

create or replace function public.email_fora_da_esteira(p_dados jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(p_dados ->> 'excluidoEm', '') <> '' or coalesce(p_dados ->> 'arquivadoEm', '') <> ''
$$;

-- Projeto criado agora (e não restaurado de um backup ou importado com data antiga).
create or replace function public.email_recente(p_iso text)
returns boolean language sql stable set search_path = '' as $$
  select coalesce(p_iso, '') >= to_char((now() - interval '2 days') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS')
$$;

/* ---------- Gatilho: anota os avisos ao salvar o projeto ---------- */

create or replace function public.email_eventos_da_demanda()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_meta jsonb;
  v_por_email text;
  v_por text;
  v_titulo text;
  v_novo boolean := tg_op = 'INSERT';
  v_antigo jsonb := case when tg_op = 'UPDATE' then old.dados else '{}'::jsonb end;
begin
  if public.email_fora_da_esteira(new.dados) then return null; end if;
  select m.dados into v_meta from public.sistema_meta m where m.id = 'meta';
  v_meta := coalesce(v_meta, '{}'::jsonb);
  v_por_email := public.acesso_email();
  v_por := case when v_por_email is not null then public.email_nome_de(v_por_email, v_meta) else 'Alguém' end;
  v_titulo := coalesce(nullif(btrim(new.dados ->> 'titulo'), ''), 'Sem título');

  -- Menções em comentários novos (o comentário já traz os e-mails mencionados).
  insert into public.email_eventos (para, tipo, demanda_id, titulo, detalhe, por)
  select distinct on (lower(m.email), c ->> 'id')
         lower(m.email), 'mencao', new.id, v_titulo, left(coalesce(c ->> 'texto', ''), 400),
         coalesce(nullif(btrim(c ->> 'autor'), ''), v_por)
    from jsonb_array_elements(public.email_lista(new.dados -> 'comentarios')) c
    cross join lateral jsonb_array_elements_text(public.email_lista(c -> 'mencoes')) m(email)
   where not exists (
           select 1 from jsonb_array_elements(public.email_lista(v_antigo -> 'comentarios')) o where o ->> 'id' = c ->> 'id'
         )
     and public.email_recente(c ->> 'createdAt')
     and lower(m.email) is distinct from v_por_email
     and public.email_quer(lower(m.email), 'mencao', v_meta);

  if not v_novo or public.email_recente(new.dados ->> 'createdAt') then
    -- Projetistas que entraram no projeto (principal ou extras).
    insert into public.email_eventos (para, tipo, demanda_id, titulo, por)
    select distinct e, 'atribuicao', new.id, v_titulo, v_por
      from (
        select new.dados ->> 'responsavel' as n
        union all
        select jsonb_array_elements_text(public.email_lista(new.dados -> 'projetistasExtra'))
      ) novos
      cross join lateral public.email_contas_do_nome(novos.n, v_meta) e
     where coalesce(btrim(novos.n), '') <> ''
       and public.email_slug(novos.n) not in (
             select public.email_slug(a) from (
               select v_antigo ->> 'responsavel' as a
               union all
               select jsonb_array_elements_text(public.email_lista(v_antigo -> 'projetistasExtra'))
             ) antigos where a is not null
           )
       and e is distinct from v_por_email
       and not public.email_encerrada(new.dados)
       and public.email_quer(e, 'atribuicao', v_meta);

    -- Atividades do checklist com um responsável novo (ou atividade nova já com responsável).
    insert into public.email_eventos (para, tipo, demanda_id, titulo, detalhe, por)
    select distinct on (e, it ->> 'id')
           e, 'atividade', new.id, v_titulo,
           coalesce(it ->> 'name', 'Atividade') ||
             coalesce(' · até ' || public.email_data_br(public.email_data(it ->> 'date')), ''),
           v_por
      from jsonb_array_elements(public.email_lista(new.dados -> 'checklist')) it
      cross join lateral public.email_contas_do_nome(it ->> 'who', v_meta) e
     where coalesce(btrim(it ->> 'who'), '') <> ''
       and coalesce(it ->> 'status', '') <> 'concluida'
       and coalesce(it ->> 'done', 'false') <> 'true'
       and not exists (
             select 1 from jsonb_array_elements(public.email_lista(v_antigo -> 'checklist')) o
              where o ->> 'id' = it ->> 'id' and public.email_slug(o ->> 'who') = public.email_slug(it ->> 'who')
           )
       and e is distinct from v_por_email
       and public.email_quer(e, 'atribuicao', v_meta);
  end if;
  return null;
exception when others then
  raise warning 'Avisos por e-mail (projeto %): %', new.id, sqlerrm;
  return null;
end $$;

drop trigger if exists demandas_avisos_email_ins on public.demandas;
create trigger demandas_avisos_email_ins
  after insert on public.demandas
  for each row execute function public.email_eventos_da_demanda();

-- A presença (quem está com o projeto aberto) grava a cada minuto e meio: só olha quando muda o que interessa.
drop trigger if exists demandas_avisos_email_upd on public.demandas;
create trigger demandas_avisos_email_upd
  after update of dados on public.demandas
  for each row
  when (
    old.dados -> 'comentarios' is distinct from new.dados -> 'comentarios'
    or old.dados -> 'responsavel' is distinct from new.dados -> 'responsavel'
    or old.dados -> 'projetistasExtra' is distinct from new.dados -> 'projetistasExtra'
    or old.dados -> 'checklist' is distinct from new.dados -> 'checklist'
  )
  execute function public.email_eventos_da_demanda();

/* ---------- Montagem dos e-mails ---------- */

create or replace function public.email_link(p_demanda text)
returns text language sql immutable set search_path = '' as $$
  select public.email_site() || '?abrir=' || replace(replace(replace(coalesce(p_demanda, ''), '%', '%25'), '&', '%26'), '#', '%23')
$$;

create or replace function public.email_layout(p_titulo text, p_corpo text, p_rodape text)
returns text language sql immutable set search_path = '' as $$
  select '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>'
    || '<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a">'
    || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px"><tr><td align="center">'
    || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;border:1px solid #e2e8f0">'
    || '<tr><td style="padding:18px 24px;border-bottom:1px solid #e2e8f0;font-size:13px;font-weight:bold;color:#2563eb;letter-spacing:.04em">PROJETOS MASTER</td></tr>'
    || '<tr><td style="padding:22px 24px 8px"><h1 style="margin:0 0 6px;font-size:19px;line-height:1.35">' || public.email_html(p_titulo) || '</h1></td></tr>'
    || '<tr><td style="padding:0 24px 18px">' || p_corpo || '</td></tr>'
    || '<tr><td style="padding:14px 24px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b">' || p_rodape || '</td></tr>'
    || '</table></td></tr></table></body></html>'
$$;

create or replace function public.email_rodape()
returns text language sql immutable set search_path = '' as $$
  select 'Você recebe este aviso porque tem acesso ao Projetos Master. Para escolher quais e-mails receber, abra '
    || '<a href="' || public.email_site() || '" style="color:#2563eb">o sistema</a> → Minha conta → Avisos.'
$$;

create or replace function public.email_botao(p_url text, p_rotulo text)
returns text language sql immutable set search_path = '' as $$
  select '<a href="' || public.email_html(p_url) || '" style="display:inline-block;margin-top:10px;padding:9px 16px;border-radius:8px;'
    || 'background:#2563eb;color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold">' || public.email_html(p_rotulo) || '</a>'
$$;

create or replace function public.email_evento_frase(p_tipo text, p_por text)
returns text language sql immutable set search_path = '' as $$
  select case p_tipo
    when 'mencao' then p_por || ' mencionou você'
    when 'atribuicao' then p_por || ' colocou você como projetista'
    else p_por || ' passou uma atividade para você'
  end
$$;

-- Junta os avisos pendentes de cada pessoa num e-mail. Espera a pessoa ficar `p_espera` sem avisos novos,
-- para que uma rajada (vários comentários seguidos, uma importação) vire um e-mail só.
create or replace function public.email_preparar(p_espera interval default interval '2 minutes')
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_para text;
  v_eventos jsonb;
  v_n integer;
  v_assunto text;
  v_corpo text;
  v_texto text;
  v_saida uuid;
  v_total integer := 0;
  ev jsonb;
begin
  for v_para in
    select e.para from public.email_eventos e where e.saida_id is null
     group by e.para having max(e.criado_em) <= now() - p_espera
  loop
    select jsonb_agg(to_jsonb(e) order by e.criado_em), count(*) into v_eventos, v_n
      from public.email_eventos e where e.para = v_para and e.saida_id is null;
    if v_n = 1 then
      ev := v_eventos -> 0;
      v_assunto := case ev ->> 'tipo'
        when 'mencao' then (ev ->> 'por') || ' mencionou você em ' || (ev ->> 'titulo')
        when 'atribuicao' then 'Projeto para você: ' || (ev ->> 'titulo')
        else 'Atividade para você em ' || (ev ->> 'titulo')
      end;
    else
      v_assunto := v_n || ' avisos no Projetos Master';
    end if;
    v_corpo := '';
    v_texto := '';
    for ev in select * from jsonb_array_elements(v_eventos) limit 20 loop
      v_corpo := v_corpo
        || '<div style="margin:0 0 14px;padding:12px 14px;border:1px solid #e2e8f0;border-left:4px solid #2563eb;border-radius:10px">'
        || '<div style="font-size:12px;color:#64748b">' || public.email_html(public.email_evento_frase(ev ->> 'tipo', ev ->> 'por')) || '</div>'
        || '<div style="margin-top:3px;font-size:15px;font-weight:bold">' || public.email_html(ev ->> 'titulo') || '</div>'
        || case when coalesce(ev ->> 'detalhe', '') <> '' then
             '<div style="margin-top:6px;font-size:14px;color:#334155;white-space:pre-wrap">'
             || case when ev ->> 'tipo' = 'mencao' then '“' || public.email_html(ev ->> 'detalhe') || '”' else public.email_html(ev ->> 'detalhe') end
             || '</div>'
           else '' end
        || public.email_botao(public.email_link(ev ->> 'demanda_id'), 'Abrir projeto')
        || '</div>';
      v_texto := v_texto || public.email_evento_frase(ev ->> 'tipo', ev ->> 'por') || ': ' || (ev ->> 'titulo')
        || case when coalesce(ev ->> 'detalhe', '') <> '' then E'\n' || (ev ->> 'detalhe') else '' end
        || E'\n' || public.email_link(ev ->> 'demanda_id') || E'\n\n';
    end loop;
    if v_n > 20 then
      v_corpo := v_corpo || '<p style="font-size:14px;color:#334155">E mais ' || (v_n - 20) || ' avisos. Veja tudo no sistema.</p>';
      v_texto := v_texto || 'E mais ' || (v_n - 20) || E' avisos. Veja tudo no sistema.\n';
    end if;
    insert into public.email_saida (para, assunto, html, texto)
    values (v_para, left(v_assunto, 180), public.email_layout(v_assunto, v_corpo, public.email_rodape()), v_texto || public.email_site())
    returning id into v_saida;
    update public.email_eventos e set saida_id = v_saida where e.para = v_para and e.saida_id is null;
    v_total := v_total + 1;
  end loop;
  return v_total;
end $$;

-- Prazos de uma pessoa: projetos em que ela é projetista e atividades que estão com ela, que já passaram ou vencem
-- nos próximos `p_dias` dias. Projetos concluídos, arquivados ou na lixeira ficam de fora.
create or replace function public.email_prazos_de(p_email text, p_hoje date, p_dias integer, p_meta jsonb)
returns table (tipo text, demanda_id text, titulo text, atividade text, data date)
language sql stable security definer set search_path = '' as $$
  with ativas as (
    select d.id, d.dados from public.demandas d
     where not public.email_fora_da_esteira(d.dados) and not public.email_encerrada(d.dados)
  )
  select 'projeto', a.id, coalesce(nullif(btrim(a.dados ->> 'titulo'), ''), 'Sem título'), '', p.data
    from ativas a
    cross join lateral (
      select coalesce(public.email_data(a.dados ->> 'dataFimAtualizada'), public.email_data(a.dados ->> 'dataFimPrevista')) as data
    ) p
   where p.data is not null and p.data <= p_hoje + p_dias
     and p_email in (
       select public.email_contas_do_nome(n, p_meta) from (
         select a.dados ->> 'responsavel' as n
         union all
         select jsonb_array_elements_text(public.email_lista(a.dados -> 'projetistasExtra'))
       ) nomes where coalesce(btrim(n), '') <> ''
     )
  union all
  select 'atividade', a.id, coalesce(nullif(btrim(a.dados ->> 'titulo'), ''), 'Sem título'), coalesce(it ->> 'name', 'Atividade'), f.data
    from ativas a
    cross join lateral jsonb_array_elements(public.email_lista(a.dados -> 'checklist')) it
    cross join lateral (
      select coalesce(
        case when public.email_data(it ->> 'dateNova') > public.email_data(it ->> 'date') then public.email_data(it ->> 'dateNova') end,
        public.email_data(it ->> 'date')
      ) as data
    ) f
   where f.data is not null and f.data <= p_hoje + p_dias
     and coalesce(it ->> 'status', '') <> 'concluida' and coalesce(it ->> 'done', 'false') <> 'true'
     and coalesce(btrim(it ->> 'who'), '') <> ''
     and p_email in (select public.email_contas_do_nome(it ->> 'who', p_meta))
$$;

create or replace function public.email_prazos_secao(p_titulo text, p_cor text, p_itens jsonb)
returns text language sql immutable set search_path = '' as $$
  select case when jsonb_array_length(p_itens) = 0 then '' else
    '<h2 style="margin:16px 0 8px;font-size:14px;color:' || p_cor || '">' || public.email_html(p_titulo) || ' (' || jsonb_array_length(p_itens) || ')</h2>'
    || (select string_agg(
          '<div style="margin:0 0 8px;padding:10px 12px;border:1px solid #e2e8f0;border-left:4px solid ' || p_cor || ';border-radius:8px">'
          || '<div style="font-size:12px;color:#64748b">'
          || case when i ->> 'tipo' = 'projeto' then 'Prazo do projeto' else 'Atividade: ' || public.email_html(i ->> 'atividade') end
          || ' · ' || public.email_data_br((i ->> 'data')::date) || '</div>'
          || '<a href="' || public.email_html(public.email_link(i ->> 'demanda_id')) || '" style="display:block;margin-top:2px;font-size:15px;font-weight:bold;color:#0f172a;text-decoration:none">'
          || public.email_html(i ->> 'titulo') || ' →</a></div>', '' order by n)
        from jsonb_array_elements(p_itens) with ordinality as x(i, n) where n <= 15)
    || case when jsonb_array_length(p_itens) > 15 then '<p style="font-size:13px;color:#64748b">E mais ' || (jsonb_array_length(p_itens) - 15) || '.</p>' else '' end
  end
$$;

-- Resumo diário de prazos (o agendamento chama nos dias úteis de manhã). Só manda para quem tem algo na lista.
create or replace function public.email_prazos_preparar(p_hoje date default (now() at time zone 'America/Sao_Paulo')::date, p_dias integer default 3)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_meta jsonb;
  v_email text;
  v_atrasados jsonb;
  v_hoje jsonb;
  v_proximos jsonb;
  v_assunto text;
  v_partes text[];
  v_texto text;
  v_total integer := 0;
  v_id uuid;
begin
  select m.dados into v_meta from public.sistema_meta m where m.id = 'meta';
  v_meta := coalesce(v_meta, '{}'::jsonb);
  for v_email in select e from public.email_contas_ativas(v_meta) e where public.email_quer(e, 'prazos', v_meta) loop
    select coalesce(jsonb_agg(to_jsonb(p) order by p.data, p.titulo) filter (where p.data < p_hoje), '[]'::jsonb),
           coalesce(jsonb_agg(to_jsonb(p) order by p.titulo) filter (where p.data = p_hoje), '[]'::jsonb),
           coalesce(jsonb_agg(to_jsonb(p) order by p.data, p.titulo) filter (where p.data > p_hoje), '[]'::jsonb)
      into v_atrasados, v_hoje, v_proximos
      from public.email_prazos_de(v_email, p_hoje, p_dias, v_meta) p;
    if jsonb_array_length(v_atrasados) + jsonb_array_length(v_hoje) + jsonb_array_length(v_proximos) = 0 then continue; end if;
    v_partes := array_remove(array[
      case when jsonb_array_length(v_atrasados) > 0 then jsonb_array_length(v_atrasados) || case when jsonb_array_length(v_atrasados) = 1 then ' atrasado' else ' atrasados' end end,
      case when jsonb_array_length(v_hoje) > 0 then jsonb_array_length(v_hoje) || case when jsonb_array_length(v_hoje) = 1 then ' vence hoje' else ' vencem hoje' end end,
      case when jsonb_array_length(v_proximos) > 0 then jsonb_array_length(v_proximos) || ' nos próximos dias' end
    ], null);
    v_assunto := 'Seus prazos: ' || array_to_string(v_partes, ', ');
    select string_agg(
             case when (i ->> 'data')::date < p_hoje then '[atrasado] ' when (i ->> 'data')::date = p_hoje then '[hoje] ' else '' end
             || public.email_data_br((i ->> 'data')::date) || ' · '
             || case when i ->> 'tipo' = 'projeto' then 'Prazo do projeto' else 'Atividade: ' || (i ->> 'atividade') end
             || ' · ' || (i ->> 'titulo') || E'\n' || public.email_link(i ->> 'demanda_id'), E'\n\n')
      into v_texto
      from jsonb_array_elements(v_atrasados || v_hoje || v_proximos) i;
    insert into public.email_saida (para, assunto, html, texto, chave)
    values (
      v_email,
      v_assunto,
      public.email_layout(
        v_assunto,
        '<p style="margin:0 0 6px;font-size:14px;color:#334155">Bom dia! Estes são os prazos que estão com você.</p>'
          || public.email_prazos_secao('Atrasados', '#dc2626', v_atrasados)
          || public.email_prazos_secao('Vencem hoje', '#d97706', v_hoje)
          || public.email_prazos_secao('Próximos ' || p_dias || ' dias', '#2563eb', v_proximos)
          || public.email_botao(public.email_site(), 'Abrir o calendário'),
        public.email_rodape()
      ),
      coalesce(v_texto, '') || E'\n\n' || public.email_site(),
      'prazos:' || v_email || ':' || p_hoje
    )
    on conflict (chave) do nothing
    returning id into v_id;
    if v_id is not null then v_total := v_total + 1; end if;
    v_id := null;
  end loop;
  return v_total;
end $$;

/* ---------- O que o site chama ---------- */

-- O envio está configurado? (as chaves ficam no Vault, que só existe no Supabase; nos testes, responde «não»).
create or replace function public.email_envio_configurado()
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v boolean;
begin
  if to_regclass('vault.secrets') is null then return false; end if;
  execute 'select count(*) >= 2 from vault.secrets where name in (''email_chave'', ''email_remetente'')' into v;
  return coalesce(v, false);
exception when others then
  return false;
end $$;

create or replace function public.email_preferencias_ler()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_email text := public.acesso_email();
  v_nivel text := public.acesso_nivel();
  v_pref public.email_preferencias;
  v_resp jsonb;
begin
  if coalesce(v_nivel, '') = '' then
    raise exception 'Sem permissão para esta ação.' using errcode = '42501';
  end if;
  select * into v_pref from public.email_preferencias p where p.email = v_email;
  v_resp := jsonb_build_object(
    'mencao', coalesce(v_pref.mencao, true),
    'atribuicao', coalesce(v_pref.atribuicao, true),
    'prazos', coalesce(v_pref.prazos, true),
    'envioConfigurado', public.email_envio_configurado()
  );
  -- Para o administrador conferir se o envio está funcionando.
  if v_nivel = 'admin' then
    v_resp := v_resp || jsonb_build_object(
      'enviados7d', (select count(*) from public.email_saida s where s.situacao = 'enviado' and s.enviado_em > now() - interval '7 days'),
      'pendentes', (select count(*) from public.email_saida s where s.situacao in ('pronto', 'enviando'))
        + (select count(*) from public.email_eventos e where e.saida_id is null),
      'erros7d', (select count(*) from public.email_saida s where s.situacao = 'erro' and s.criado_em > now() - interval '7 days'),
      'ultimoErro', (select s.erro from public.email_saida s where s.erro is not null order by s.criado_em desc limit 1)
    );
  end if;
  return v_resp;
end $$;

create or replace function public.email_preferencias_salvar(p_campos jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_email text := public.acesso_email();
  v_chave text;
begin
  if coalesce(public.acesso_nivel(), '') = '' then
    raise exception 'Sem permissão para esta ação.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_campos) <> 'object' then
    raise exception 'Preferências inválidas.' using errcode = '22023';
  end if;
  for v_chave in select jsonb_object_keys(p_campos) loop
    if v_chave not in ('mencao', 'atribuicao', 'prazos') or jsonb_typeof(p_campos -> v_chave) <> 'boolean' then
      raise exception 'Preferências inválidas.' using errcode = '22023';
    end if;
  end loop;
  insert into public.email_preferencias as p (email, mencao, atribuicao, prazos)
  values (
    v_email,
    coalesce((p_campos ->> 'mencao')::boolean, true),
    coalesce((p_campos ->> 'atribuicao')::boolean, true),
    coalesce((p_campos ->> 'prazos')::boolean, true)
  )
  on conflict (email) do update set
    mencao = coalesce((p_campos ->> 'mencao')::boolean, p.mencao),
    atribuicao = coalesce((p_campos ->> 'atribuicao')::boolean, p.atribuicao),
    prazos = coalesce((p_campos ->> 'prazos')::boolean, p.prazos),
    alterado_em = now();
end $$;

-- E-mail de teste para o próprio administrador (sai no próximo envio, em até 5 minutos). No máximo um a cada 2 minutos.
create or replace function public.email_teste()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_email text := public.acesso_email();
begin
  perform public.acesso_exigir(array['admin']);
  if exists (select 1 from public.email_saida s where s.para = v_email and s.chave like 'teste:%' and s.criado_em > now() - interval '2 minutes') then
    raise exception 'Espere um pouco antes de pedir outro e-mail de teste.' using errcode = '22023';
  end if;
  insert into public.email_saida (para, assunto, html, texto, chave)
  values (
    v_email,
    'Teste dos avisos do Projetos Master',
    public.email_layout(
      'Os avisos por e-mail estão funcionando',
      '<p style="font-size:14px;color:#334155">Se você recebeu esta mensagem, o envio está configurado certo.</p>'
        || public.email_botao(public.email_site(), 'Abrir o sistema'),
      public.email_rodape()
    ),
    'Se você recebeu esta mensagem, o envio está configurado certo.' || E'\n' || public.email_site(),
    'teste:' || v_email || ':' || extract(epoch from now())::bigint
  );
end $$;

/* ---------- Permissões ---------- */
-- Tudo nasce aberto no Supabase (privilégios padrão do schema public): fecha primeiro, abre só o que o site usa.
revoke all on function
  public.email_site(), public.email_html(text), public.email_slug(text), public.email_data(text), public.email_data_br(date),
  public.email_lista(jsonb), public.email_nome_de(text, jsonb), public.email_contas_ativas(jsonb),
  public.email_contas_do_nome(text, jsonb), public.email_quer(text, text, jsonb), public.email_encerrada(jsonb),
  public.email_fora_da_esteira(jsonb), public.email_recente(text), public.email_eventos_da_demanda(),
  public.email_link(text), public.email_layout(text, text, text), public.email_rodape(), public.email_botao(text, text),
  public.email_evento_frase(text, text), public.email_preparar(interval), public.email_prazos_de(text, date, integer, jsonb),
  public.email_prazos_secao(text, text, jsonb), public.email_prazos_preparar(date, integer), public.email_envio_configurado(),
  public.email_preferencias_ler(), public.email_preferencias_salvar(jsonb), public.email_teste()
from public, anon, authenticated;
grant execute on function public.email_preferencias_ler(), public.email_preferencias_salvar(jsonb), public.email_teste() to authenticated;
