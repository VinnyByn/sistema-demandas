-- Modelo de documentos: o app lê e grava a demanda inteira, então `dados` guarda o JSON como ele é.
-- Escrita só pelas funções abaixo, que conferem o nível de quem chama; leitura pela RLS.

create table if not exists public.demandas (
  id text primary key,
  dados jsonb not null default '{}'::jsonb,
  alterado_em timestamptz not null default now(),
  asana_task_id text generated always as (dados ->> 'asanaTaskId') stored
);
create index if not exists demandas_asana_task_id_idx on public.demandas (asana_task_id) where asana_task_id is not null;
create index if not exists demandas_asana_task_ids_idx
  on public.demandas using gin ((dados -> 'asanaTaskIds') jsonb_path_ops);

create table if not exists public.sistema_meta (
  id text primary key default 'meta' check (id = 'meta'),
  dados jsonb not null default '{}'::jsonb,
  alterado_em timestamptz not null default now()
);
insert into public.sistema_meta (id, dados)
values ('meta', '{"diarias": [], "projetistas": {}, "deletedDemandaIds": [], "deletedDiariaIds": []}')
on conflict (id) do nothing;

create table if not exists public.sistema_backups (
  id text primary key default 'ultimo' check (id = 'ultimo'),
  info jsonb not null,
  alterado_em timestamptz not null default now()
);

create table if not exists public.acessos_historico (
  id uuid primary key default gen_random_uuid(),
  em timestamptz not null default now(),
  por text not null,
  alvo text not null,
  acao text not null,
  de text,
  para text
);
create index if not exists acessos_historico_em_idx on public.acessos_historico (em desc);

-- Mapas se somam em profundidade, listas são substituídas e mapa vazio limpa o campo: o `||` do Postgres é raso e apagaria dados.
create or replace function public.jsonb_mesclar(p_base jsonb, p_novo jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  v_saida jsonb := coalesce(p_base, '{}'::jsonb);
  v_chave text;
  v_valor jsonb;
begin
  for v_chave, v_valor in select key, value from jsonb_each(coalesce(p_novo, '{}'::jsonb)) loop
    if jsonb_typeof(v_valor) = 'object'
       and v_valor <> '{}'::jsonb
       and jsonb_typeof(v_saida -> v_chave) = 'object' then
      v_saida := jsonb_set(v_saida, array[v_chave], public.jsonb_mesclar(v_saida -> v_chave, v_valor));
    else
      v_saida := jsonb_set(v_saida, array[v_chave], v_valor);
    end if;
  end loop;
  return v_saida;
end $$;

create or replace function public.jsonb_remover(p_doc jsonb, p_remover jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  v_saida jsonb := p_doc;
  v_caminho jsonb;
  v_partes text[];
begin
  for v_caminho in select value from jsonb_array_elements(coalesce(p_remover, '[]'::jsonb)) loop
    v_partes := array(select jsonb_array_elements_text(v_caminho));
    -- O #- falha se o caminho atravessa uma lista; uma remoção sem efeito não pode derrubar a gravação inteira.
    if jsonb_typeof(v_saida #> v_partes[1:cardinality(v_partes) - 1]) = 'object' then
      v_saida := v_saida #- v_partes;
    end if;
  end loop;
  return v_saida;
end $$;

create or replace function public.definir_alterado_em()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.alterado_em := now();
  return new;
end $$;

drop trigger if exists demandas_alterado_em on public.demandas;
create trigger demandas_alterado_em
  before update on public.demandas
  for each row execute function public.definir_alterado_em();

drop trigger if exists meta_alterado_em on public.sistema_meta;
create trigger meta_alterado_em
  before update on public.sistema_meta
  for each row execute function public.definir_alterado_em();

create or replace function public.acesso_marcado(p_valor jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(
    p_valor = 'true'::jsonb or p_valor = '1'::jsonb
    or (jsonb_typeof(p_valor) = 'string' and lower(p_valor #>> '{}') in ('1', 'true')),
    false
  )
$$;

create or replace function public.acesso_principal_email()
returns text language sql immutable set search_path = '' as $$
  select 'vinicius.morais@soumaster.com.br'::text
$$;

-- Mesma regra de _shared/acesso.mjs e de user-roles.js. Devolve '' | 'leitura' | 'escrita' | 'admin'.
-- Papel desconhecido só lê: um valor digitado errado nunca pode dar mais poder do que o administrador quis dar.
create or replace function public.acesso_nivel_de(p_email text, p_meta jsonb)
returns text language plpgsql immutable set search_path = '' as $$
declare
  v_papel_salvo jsonb := p_meta -> 'roles' -> p_email;
  v_papel text := case when jsonb_typeof(v_papel_salvo) = 'string' then lower(v_papel_salvo #>> '{}') else '' end;
begin
  if coalesce(p_email, '') = '' then return ''; end if;
  if p_email = public.acesso_principal_email() then return 'admin'; end if;
  if v_papel = '' or public.acesso_marcado(p_meta -> 'purgedUsers' -> p_email) then return ''; end if;
  if public.acesso_marcado(p_meta -> 'disabledUsers' -> p_email) then return 'leitura'; end if;
  if v_papel in ('admin', 'administrador', 'administrator') then return 'admin'; end if;
  if v_papel in ('projetista') then return 'escrita'; end if;
  return 'leitura';
end $$;

-- Vem de auth.users, não do token: conta apagada, bloqueada ou sem confirmar perde o acesso na hora.
create or replace function public.acesso_email_de(p_usuario uuid)
returns text language sql stable security definer set search_path = '' as $$
  select lower(u.email) from auth.users u
   where u.id = p_usuario and u.email_confirmed_at is not null and u.deleted_at is null
     and (u.banned_until is null or u.banned_until <= now())
$$;

create or replace function public.acesso_email()
returns text language sql stable security definer set search_path = '' as $$
  select public.acesso_email_de(auth.uid())
$$;

create or replace function public.acesso_nivel()
returns text language sql stable security definer set search_path = '' as $$
  select public.acesso_nivel_de(
    public.acesso_email(),
    (select m.dados from public.sistema_meta m where m.id = 'meta')
  )
$$;

create or replace function public.acesso_exigir(p_niveis text[])
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.acesso_nivel() = any (p_niveis)) then
    raise exception 'Sem permissão para esta ação.' using errcode = '42501';
  end if;
end $$;

-- O e-mail do administrador principal não fica no site público: só quem já tem acesso recebe.
create or replace function public.acesso_admin_principal()
returns text language sql stable security definer set search_path = '' as $$
  select case when public.acesso_nivel() <> '' then public.acesso_principal_email() end
$$;

-- Só o servidor grava o vínculo com o Asana: quem escolhesse o asanaTaskId apagaria a tarefa de outra área com o token da integração.
create or replace function public.demanda_campos_do_servidor()
returns text[] language sql immutable set search_path = '' as $$
  select array['asana', 'asanaTaskId', 'asanaTaskIds', 'asanaAnteriores', 'asanaAviso', 'comentariosServidorAt']
$$;

-- Do aviso do Asana, o app só marca "ciente", e só no aviso que está valendo: uma aba desatualizada não marca o aviso novo.
create or replace function public.demanda_ciente_do_aviso(p_atual jsonb, p_campos jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  v_aviso_enviado jsonb := p_campos -> 'asanaAviso';
  v_chave_atual text := p_atual -> 'asanaAviso' ->> 'chave';
begin
  if v_aviso_enviado ->> 'cienteEm' is not null and v_aviso_enviado ->> 'chave' = v_chave_atual then
    return jsonb_build_object('asanaAviso', jsonb_build_object('cienteEm', v_aviso_enviado -> 'cienteEm'));
  end if;
  return '{}'::jsonb;
end $$;

create or replace function public.demanda_campos_do_cliente(p_atual jsonb, p_campos jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select (p_campos - public.demanda_campos_do_servidor()) || public.demanda_ciente_do_aviso(p_atual, p_campos)
$$;

create or replace function public.demanda_remocoes_do_cliente(p_remover jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select coalesce(jsonb_agg(caminho), '[]'::jsonb)
    from jsonb_array_elements(coalesce(p_remover, '[]'::jsonb)) caminho
   where not coalesce(caminho ->> 0 = any (public.demanda_campos_do_servidor()), false)
$$;

create or replace function public.demanda_salvar(p_id text, p_campos jsonb, p_remover jsonb default '[]'::jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_atual jsonb;
  v_campos jsonb;
  v_remover jsonb;
begin
  perform public.acesso_exigir(array['escrita', 'admin']);
  select d.dados into v_atual from public.demandas d where d.id = p_id for update;
  -- Só vale para id novo: o id vai para atributos HTML na tela, e os antigos, importados, continuam podendo ser salvos.
  if not found and coalesce(p_id, '') !~ '^[A-Za-z0-9_.:-]{1,128}$' then
    raise exception 'Identificador de demanda inválido.' using errcode = '22023';
  end if;
  v_campos := public.demanda_campos_do_cliente(coalesce(v_atual, '{}'::jsonb), p_campos);
  v_remover := public.demanda_remocoes_do_cliente(p_remover);
  insert into public.demandas as d (id, dados)
  values (p_id, public.jsonb_remover(public.jsonb_mesclar('{}'::jsonb, v_campos), v_remover))
  on conflict (id) do update
    set dados = public.jsonb_remover(public.jsonb_mesclar(d.dados, v_campos), v_remover);
end $$;

create or replace function public.demanda_presenca(p_id text, p_editing_by jsonb, p_editing_at text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.acesso_exigir(array['escrita', 'admin']);
  if p_editing_by is not null and jsonb_typeof(p_editing_by) not in ('object', 'null') then
    raise exception 'Presença inválida.' using errcode = '22023';
  end if;
  update public.demandas d
     set dados = case
       when p_editing_by is null or p_editing_by = 'null'::jsonb then d.dados - 'editingBy' - 'editingAt'
       else d.dados || jsonb_build_object(
         'editingBy', p_editing_by || jsonb_build_object('email', public.acesso_email()),
         'editingAt', p_editing_at
       )
     end
   where d.id = p_id;
end $$;

create or replace function public.demanda_excluir(p_id text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.acesso_exigir(array['escrita', 'admin']);
  delete from public.demandas where id = p_id;
  update public.sistema_meta m
     set dados = jsonb_set(
       m.dados,
       '{deletedDemandaIds}',
       coalesce(m.dados -> 'deletedDemandaIds', '[]'::jsonb) || to_jsonb(p_id)
     )
   where m.id = 'meta'
     and not coalesce(m.dados -> 'deletedDemandaIds', '[]'::jsonb) @> to_jsonb(p_id);
end $$;

create or replace function public.meta_salvar(p_campos jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.acesso_exigir(array['escrita', 'admin']);
  if p_campos ?| array['roles', 'disabledUsers', 'purgedUsers', 'userRegionals', 'userDisplayNames', 'userHomes'] then
    raise exception 'Os acessos só mudam por acessos_salvar.' using errcode = '42501';
  end if;
  update public.sistema_meta m set dados = public.jsonb_mesclar(m.dados, p_campos) where m.id = 'meta';
end $$;

create or replace function public.acessos_salvar(p_campos jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_mapas jsonb;
begin
  perform public.acesso_exigir(array['admin']);
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_mapas
    from jsonb_each(p_campos)
   where key in ('roles', 'disabledUsers', 'purgedUsers', 'userRegionals', 'userDisplayNames', 'userHomes');
  update public.sistema_meta m set dados = m.dados || v_mapas where m.id = 'meta';
end $$;

create or replace function public.acessos_historico_registrar(p_entradas jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.acesso_exigir(array['admin']);
  insert into public.acessos_historico (por, alvo, acao, de, para)
  select public.acesso_email(),
         left(entrada ->> 'alvo', 200),
         left(entrada ->> 'acao', 40),
         left(entrada ->> 'de', 200),
         left(entrada ->> 'para', 200)
    from jsonb_array_elements(p_entradas) entrada
   where coalesce(entrada ->> 'alvo', '') <> ''
     and coalesce(entrada ->> 'acao', '') <> ''
   limit 400;
end $$;

alter table public.demandas enable row level security;
alter table public.sistema_meta enable row level security;
alter table public.sistema_backups enable row level security;
alter table public.acessos_historico enable row level security;

drop policy if exists demandas_ler on public.demandas;
create policy demandas_ler on public.demandas
  for select to authenticated
  using ((select public.acesso_nivel()) <> '');

drop policy if exists meta_ler on public.sistema_meta;
create policy meta_ler on public.sistema_meta
  for select to authenticated
  using ((select public.acesso_nivel()) <> '');

drop policy if exists backups_ler on public.sistema_backups;
create policy backups_ler on public.sistema_backups
  for select to authenticated
  using ((select public.acesso_nivel()) <> '');

drop policy if exists historico_ler on public.acessos_historico;
create policy historico_ler on public.acessos_historico
  for select to authenticated
  using ((select public.acesso_nivel()) = 'admin');

revoke all on public.demandas, public.sistema_meta, public.sistema_backups, public.acessos_historico
  from public, anon, authenticated;
grant select on public.demandas, public.sistema_meta, public.sistema_backups, public.acessos_historico
  to authenticated;
grant all on public.demandas, public.sistema_meta, public.sistema_backups, public.acessos_historico
  to service_role;

-- O Supabase abre para a chave pública tudo que nasce em public: cada função precisa ser fechada aqui.
revoke all on function
  public.jsonb_mesclar(jsonb, jsonb),
  public.jsonb_remover(jsonb, jsonb),
  public.definir_alterado_em(),
  public.acesso_marcado(jsonb),
  public.acesso_principal_email(),
  public.acesso_nivel_de(text, jsonb),
  public.acesso_email_de(uuid),
  public.acesso_email(),
  public.acesso_nivel(),
  public.acesso_exigir(text[]),
  public.acesso_admin_principal(),
  public.demanda_campos_do_servidor(),
  public.demanda_ciente_do_aviso(jsonb, jsonb),
  public.demanda_campos_do_cliente(jsonb, jsonb),
  public.demanda_remocoes_do_cliente(jsonb),
  public.demanda_salvar(text, jsonb, jsonb),
  public.demanda_presenca(text, jsonb, text),
  public.demanda_excluir(text),
  public.meta_salvar(jsonb),
  public.acessos_salvar(jsonb),
  public.acessos_historico_registrar(jsonb)
from public, anon, authenticated;

grant execute on function
  public.acesso_nivel(),
  public.acesso_admin_principal(),
  public.demanda_salvar(text, jsonb, jsonb),
  public.demanda_presenca(text, jsonb, text),
  public.demanda_excluir(text),
  public.meta_salvar(jsonb),
  public.acessos_salvar(jsonb),
  public.acessos_historico_registrar(jsonb)
to authenticated;

grant execute on function
  public.jsonb_mesclar(jsonb, jsonb),
  public.jsonb_remover(jsonb, jsonb),
  public.acesso_marcado(jsonb),
  public.acesso_nivel_de(text, jsonb),
  public.acesso_email_de(uuid),
  public.acesso_nivel()
to service_role;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'demandas'
  ) then
    alter publication supabase_realtime add table public.demandas;
  end if;

  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sistema_meta'
  ) then
    alter publication supabase_realtime add table public.sistema_meta;
  end if;
end $$;
