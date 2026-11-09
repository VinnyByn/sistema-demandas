-- Dados e operações da integração com o Asana. Só o servidor (service_role) chama estas funções.
-- Os comentários continuam dentro da demanda (dados -> 'comentarios'), do mais novo para o mais antigo.

create table if not exists public.asana_story_vinculos (
  story_gid text primary key,
  demanda_id text not null,
  comentario_id text not null,
  origem text not null,
  criado_em timestamptz not null default now()
);

create table if not exists public.asana_envios (
  demanda_id text not null,
  comentario_id text not null,
  estado text not null default 'enviando',
  story_gid text,
  email text,
  autor text,
  criado_em timestamptz not null default now(),
  primary key (demanda_id, comentario_id)
);

create table if not exists public.asana_anexos (
  attachment_gid text primary key,
  demanda_id text not null,
  registrado_em timestamptz not null default now()
);

create table if not exists public.asana_webhooks (
  projeto_gid text primary key,
  secret text,
  webhook_gid text,
  target text,
  versao integer,
  handshake_ate bigint,
  handshake_em timestamptz,
  atualizado_em timestamptz
);

alter table public.asana_story_vinculos enable row level security;
alter table public.asana_envios enable row level security;
alter table public.asana_anexos enable row level security;
alter table public.asana_webhooks enable row level security;

revoke all on public.asana_story_vinculos, public.asana_envios, public.asana_anexos, public.asana_webhooks
  from public, anon, authenticated;
grant all on public.asana_story_vinculos, public.asana_envios, public.asana_anexos, public.asana_webhooks
  to service_role;

create or replace function public.asana_iso(p_momento timestamptz)
returns text language sql stable set search_path = '' as $$
  select to_char(p_momento at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$$;

create or replace function public.asana_buscar_demanda(p_demanda_id text)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('id', d.id, 'dados', d.dados) from public.demandas d where d.id = p_demanda_id
$$;

create or replace function public.asana_buscar_demanda_por_tarefa(p_task_gid text)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('id', d.id, 'dados', d.dados)
    from public.demandas d
   where d.dados -> 'asanaTaskIds' @> to_jsonb(p_task_gid) or d.asana_task_id = p_task_gid
   order by (d.dados -> 'asanaTaskIds' @> to_jsonb(p_task_gid)) desc nulls last, d.id
   limit 1
$$;

create or replace function public.asana_listar_comentarios(p_demanda_id text)
returns jsonb language sql stable set search_path = '' as $$
  select coalesce((select d.dados -> 'comentarios' from public.demandas d where d.id = p_demanda_id), '[]'::jsonb)
$$;

create or replace function public.asana_adicionar_comentario(
  p_demanda_id text, p_comentario jsonb, p_campos jsonb default '{}'::jsonb, p_remover jsonb default '[]'::jsonb
)
returns void language plpgsql set search_path = '' as $$
declare
  v_dados jsonb;
  v_comentarios jsonb;
begin
  select d.dados into v_dados from public.demandas d where d.id = p_demanda_id for update;
  if not found then return; end if;
  v_comentarios := coalesce(v_dados -> 'comentarios', '[]'::jsonb);
  if exists (select 1 from jsonb_array_elements(v_comentarios) c where c ->> 'id' = p_comentario ->> 'id') then
    return;
  end if;
  v_dados := public.jsonb_remover(public.jsonb_mesclar(v_dados, p_campos), p_remover);
  update public.demandas d
     set dados = v_dados || jsonb_build_object(
       'comentarios', jsonb_build_array(p_comentario) || v_comentarios,
       'comentariosServidorAt', public.asana_iso(now())
     )
   where d.id = p_demanda_id;
end $$;

create or replace function public.asana_editar_comentario(p_demanda_id text, p_comentario_id text, p_texto text)
returns void language plpgsql set search_path = '' as $$
begin
  update public.demandas d
     set dados = d.dados || jsonb_build_object(
       'comentariosServidorAt', public.asana_iso(now()),
       'comentarios', coalesce((
         select jsonb_agg(
           case
             when c.valor ->> 'id' = p_comentario_id and c.valor ->> 'texto' is distinct from p_texto
               then c.valor || jsonb_build_object('texto', p_texto, 'editadoEm', public.asana_iso(now()))
             else c.valor
           end
           order by c.posicao)
         from jsonb_array_elements(coalesce(d.dados -> 'comentarios', '[]'::jsonb)) with ordinality as c(valor, posicao)
       ), '[]'::jsonb))
   where d.id = p_demanda_id;
end $$;

create or replace function public.asana_remover_comentario(p_demanda_id text, p_comentario_id text)
returns void language plpgsql set search_path = '' as $$
begin
  update public.demandas d
     set dados = d.dados || jsonb_build_object(
       'comentariosServidorAt', public.asana_iso(now()),
       'comentarios', coalesce((
         select jsonb_agg(c.valor order by c.posicao)
         from jsonb_array_elements(coalesce(d.dados -> 'comentarios', '[]'::jsonb)) with ordinality as c(valor, posicao)
         where c.valor ->> 'id' is distinct from p_comentario_id
       ), '[]'::jsonb))
   where d.id = p_demanda_id;
end $$;

-- A trava da linha faz duas entregas simultâneas do webhook gerarem um aviso só. O aviso novo substitui o
-- antigo inteiro: mesclar manteria o "ciente" do anterior e esconderia o novo.
create or replace function public.asana_registrar_aviso(
  p_demanda_id text, p_aviso jsonb, p_comentario jsonb, p_campos jsonb default '{}'::jsonb, p_remover jsonb default '[]'::jsonb
)
returns void language plpgsql set search_path = '' as $$
declare
  v_dados jsonb;
  v_chave_atual text;
begin
  select d.dados into v_dados from public.demandas d where d.id = p_demanda_id for update;
  if not found then return; end if;
  v_chave_atual := v_dados -> 'asanaAviso' ->> 'chave';
  v_dados := public.jsonb_remover(public.jsonb_mesclar(v_dados, p_campos), p_remover);
  if v_chave_atual is distinct from p_aviso ->> 'chave' then
    v_dados := v_dados || jsonb_build_object(
      'asanaAviso', p_aviso,
      'comentarios', jsonb_build_array(p_comentario) || coalesce(v_dados -> 'comentarios', '[]'::jsonb),
      'comentariosServidorAt', p_aviso -> 'em');
  end if;
  update public.demandas d set dados = v_dados where d.id = p_demanda_id;
end $$;

create or replace function public.asana_mesclar_demanda(
  p_demanda_id text, p_campos jsonb default '{}'::jsonb, p_remover jsonb default '[]'::jsonb
)
returns void language plpgsql set search_path = '' as $$
begin
  update public.demandas d
     set dados = public.jsonb_remover(public.jsonb_mesclar(d.dados, p_campos), p_remover)
   where d.id = p_demanda_id;
end $$;

create or replace function public.asana_buscar_vinculo_story(p_story_gid text)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('demandaId', v.demanda_id, 'comentarioId', v.comentario_id, 'origem', v.origem)
    from public.asana_story_vinculos v where v.story_gid = p_story_gid
$$;

create or replace function public.asana_salvar_vinculo_story(
  p_story_gid text, p_demanda_id text, p_comentario_id text, p_origem text
)
returns void language plpgsql set search_path = '' as $$
begin
  insert into public.asana_story_vinculos (story_gid, demanda_id, comentario_id, origem)
  values (p_story_gid, p_demanda_id, p_comentario_id, p_origem)
  on conflict (story_gid) do update
    set demanda_id = excluded.demanda_id,
        comentario_id = excluded.comentario_id,
        origem = excluded.origem;
end $$;

create or replace function public.asana_apagar_vinculo_story(p_story_gid text)
returns void language sql set search_path = '' as $$
  delete from public.asana_story_vinculos where story_gid = p_story_gid
$$;

-- A chave primária é a trava: devolve false se outra chamada já está enviando este comentário.
create or replace function public.asana_reservar_envio(p_demanda_id text, p_comentario_id text, p_dados jsonb)
returns boolean language plpgsql set search_path = '' as $$
declare
  v_linhas integer;
begin
  insert into public.asana_envios (demanda_id, comentario_id, estado, email, autor, criado_em)
  values (
    p_demanda_id,
    p_comentario_id,
    coalesce(p_dados ->> 'estado', 'enviando'),
    p_dados ->> 'email',
    p_dados ->> 'autor',
    coalesce((p_dados ->> 'criadoEm')::timestamptz, now())
  )
  on conflict (demanda_id, comentario_id) do nothing;
  get diagnostics v_linhas = row_count;
  return v_linhas > 0;
end $$;

create or replace function public.asana_buscar_envio(p_demanda_id text, p_comentario_id text)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object(
           'demandaId', e.demanda_id,
           'comentarioId', e.comentario_id,
           'estado', e.estado,
           'storyGid', e.story_gid,
           'email', e.email,
           'autor', e.autor,
           'criadoEm', public.asana_iso(e.criado_em)
         ))
    from public.asana_envios e
   where e.demanda_id = p_demanda_id and e.comentario_id = p_comentario_id
$$;

create or replace function public.asana_atualizar_envio(p_demanda_id text, p_comentario_id text, p_campos jsonb)
returns void language plpgsql set search_path = '' as $$
begin
  update public.asana_envios e set
    story_gid = case when p_campos ? 'storyGid' then p_campos ->> 'storyGid' else e.story_gid end,
    estado = case when p_campos ? 'estado' then p_campos ->> 'estado' else e.estado end
  where e.demanda_id = p_demanda_id and e.comentario_id = p_comentario_id;
end $$;

create or replace function public.asana_apagar_envio(p_demanda_id text, p_comentario_id text)
returns void language sql set search_path = '' as $$
  delete from public.asana_envios where demanda_id = p_demanda_id and comentario_id = p_comentario_id
$$;

create or replace function public.asana_anexo_registrado(p_attachment_gid text)
returns boolean language sql stable set search_path = '' as $$
  select exists (select 1 from public.asana_anexos where attachment_gid = p_attachment_gid)
$$;

create or replace function public.asana_registrar_anexo(p_attachment_gid text, p_demanda_id text)
returns void language plpgsql set search_path = '' as $$
begin
  insert into public.asana_anexos (attachment_gid, demanda_id) values (p_attachment_gid, p_demanda_id)
  on conflict (attachment_gid) do update set demanda_id = excluded.demanda_id;
end $$;

create or replace function public.asana_buscar_webhook(p_projeto_gid text)
returns jsonb language sql stable set search_path = '' as $$
  select coalesce((
    select jsonb_strip_nulls(jsonb_build_object(
             'secret', w.secret,
             'webhookGid', w.webhook_gid,
             'target', w.target,
             'versao', w.versao,
             'handshakeAte', w.handshake_ate,
             'handshakeEm', public.asana_iso(w.handshake_em),
             'atualizadoEm', public.asana_iso(w.atualizado_em)
           ))
      from public.asana_webhooks w
     where w.projeto_gid = p_projeto_gid), '{}'::jsonb)
$$;

create or replace function public.asana_mesclar_webhook(p_projeto_gid text, p_campos jsonb)
returns void language plpgsql set search_path = '' as $$
begin
  insert into public.asana_webhooks (projeto_gid) values (p_projeto_gid) on conflict (projeto_gid) do nothing;
  update public.asana_webhooks w set
    secret        = case when p_campos ? 'secret'       then p_campos ->> 'secret'                     else w.secret end,
    webhook_gid   = case when p_campos ? 'webhookGid'   then p_campos ->> 'webhookGid'                 else w.webhook_gid end,
    target        = case when p_campos ? 'target'       then p_campos ->> 'target'                     else w.target end,
    versao        = case when p_campos ? 'versao'       then (p_campos ->> 'versao')::integer          else w.versao end,
    handshake_ate = case when p_campos ? 'handshakeAte' then (p_campos ->> 'handshakeAte')::bigint     else w.handshake_ate end,
    handshake_em  = case when p_campos ? 'handshakeEm'  then (p_campos ->> 'handshakeEm')::timestamptz else w.handshake_em end,
    atualizado_em = case when p_campos ? 'atualizadoEm' then (p_campos ->> 'atualizadoEm')::timestamptz else w.atualizado_em end
  where w.projeto_gid = p_projeto_gid;
end $$;

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as assinatura from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'asana\_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.assinatura);
    execute format('grant execute on function %s to service_role', f.assinatura);
  end loop;
end $$;
