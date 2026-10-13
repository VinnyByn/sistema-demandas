-- Esteira de projetos — esquema inicial no Supabase (substitui o Firestore).
--
-- Tabelas
--   perfis        quem acessa o sistema (antes: meta.roles, disabledUsers, purgedUsers,
--                 userRegionals e userDisplayNames)
--   demandas      um projeto por linha; o objeto do app fica inteiro em `dados`
--   sistema_meta  linha única com diárias, projetistas, metas por etapa e filtros salvos
--   arquivos      PDFs, KMZs e fotos de cada projeto (o conteúdo fica no Storage)
--
-- Acesso: só entra quem tem linha em `perfis` (não desabilitado nem removido).
-- «visibilidade» só lê; «projetista» e «admin» gravam; só «admin» gerencia usuários.

-- ---------------------------------------------------------------------------
-- Perfis de acesso
-- ---------------------------------------------------------------------------

create table public.perfis (
  email text primary key check (email = lower(btrim(email)) and email <> ''),
  papel text not null default 'projetista' check (papel in ('admin', 'projetista', 'visibilidade')),
  desabilitado boolean not null default false,
  removido boolean not null default false,
  regional text not null default '',
  nome text not null default '',
  atualizado_em timestamptz not null default now()
);

comment on table public.perfis is 'Quem acessa o sistema. Sem linha aqui = sem acesso.';

/** Administrador principal: nunca perde o papel nem é desabilitado. */
create function public.admin_principal() returns text
language sql immutable
as $$ select 'vinicius.morais@soumaster.com.br'::text $$;

create function public.email_atual() returns text
language sql stable
as $$ select lower(btrim(coalesce(auth.jwt() ->> 'email', ''))) $$;

create function public.perfil_ativo() returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.perfis p
    where p.email = public.email_atual() and not p.desabilitado and not p.removido
  )
$$;

create function public.pode_escrever() returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.perfis p
    where p.email = public.email_atual()
      and not p.desabilitado and not p.removido
      and p.papel in ('admin', 'projetista')
  )
$$;

create function public.eh_admin() returns boolean
language sql stable security definer set search_path = public
as $$
  select public.email_atual() = public.admin_principal()
      or exists (
        select 1 from public.perfis p
        where p.email = public.email_atual()
          and not p.desabilitado and not p.removido and p.papel = 'admin'
      )
$$;

alter table public.perfis enable row level security;

-- Quem está ativo vê todos (nomes nas menções, tela de usuários);
-- quem foi desabilitado vê só a própria linha, para o app explicar o bloqueio.
create policy perfis_leitura on public.perfis for select to authenticated
  using (public.perfil_ativo() or email = public.email_atual());
-- Gravação só pela função salvar_perfis (administradores).

/**
 * Substitui os mapas de acesso de uma vez, como o app fazia no doc meta:
 * { roles: {email: papel}, disabled: {email: true}, purged: {email: true},
 *   regionals: {email: regional}, names: {email: nome} }.
 * E-mails que existem na tabela e não aparecem em nenhum mapa voltam ao padrão.
 */
create function public.salvar_perfis(p_mapas jsonb) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_admin text := public.admin_principal();
  v_emails text[];
begin
  if not public.eh_admin() then
    raise exception 'Só administradores alteram usuários.' using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct lower(btrim(k))), '{}')
    into v_emails
    from (
      select jsonb_object_keys(coalesce(p_mapas -> 'roles', '{}')) as k
      union select jsonb_object_keys(coalesce(p_mapas -> 'disabled', '{}'))
      union select jsonb_object_keys(coalesce(p_mapas -> 'purged', '{}'))
      union select jsonb_object_keys(coalesce(p_mapas -> 'regionals', '{}'))
      union select jsonb_object_keys(coalesce(p_mapas -> 'names', '{}'))
      union select v_admin
    ) t
    where btrim(k) <> '';

  insert into public.perfis as p (email, papel, desabilitado, removido, regional, nome, atualizado_em)
  select
    e,
    case
      when e = v_admin then 'admin'
      when lower(coalesce(p_mapas -> 'roles' ->> e, '')) in ('admin', 'administrador') then 'admin'
      when lower(coalesce(p_mapas -> 'roles' ->> e, '')) in ('visibilidade', 'leitura') then 'visibilidade'
      else 'projetista'
    end,
    e <> v_admin and coalesce(p_mapas -> 'disabled' ->> e, 'false') in ('true', '1'),
    e <> v_admin and coalesce(p_mapas -> 'purged' ->> e, 'false') in ('true', '1'),
    coalesce(p_mapas -> 'regionals' ->> e, ''),
    coalesce(p_mapas -> 'names' ->> e, ''),
    now()
  from unnest(v_emails) as e
  on conflict (email) do update set
    papel = excluded.papel,
    desabilitado = excluded.desabilitado,
    removido = excluded.removido,
    regional = excluded.regional,
    nome = excluded.nome,
    atualizado_em = now();

  -- Fora dos mapas = sem papel no app (allowlist): marca como removido.
  update public.perfis
     set removido = true, atualizado_em = now()
   where email <> all (v_emails) and not removido;
end;
$$;

-- ---------------------------------------------------------------------------
-- Demandas (projetos)
-- ---------------------------------------------------------------------------

create table public.demandas (
  id text primary key,
  dados jsonb not null default '{}'::jsonb,
  -- Cópias de campos de `dados`, para filtros e relatórios em SQL.
  status text generated always as (dados ->> 'status') stored,
  tipo text generated always as (dados ->> 'tipo') stored,
  titulo text generated always as (dados ->> 'titulo') stored,
  responsavel text generated always as (dados ->> 'responsavel') stored,
  cidade text generated always as (dados ->> 'cidade') stored,
  -- Presença: quem está com o projeto aberto para edição (não mexe em `dados`).
  editing_by jsonb,
  editing_at timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);

create index demandas_status_idx on public.demandas (status);
create index demandas_responsavel_idx on public.demandas (responsavel);

create function public.demandas_carimbo() returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' or new.dados is distinct from old.dados then
    new.atualizado_em := now();
    new.atualizado_por := nullif(public.email_atual(), '');
  end if;
  return new;
end;
$$;

create trigger demandas_carimbo before insert or update on public.demandas
  for each row execute function public.demandas_carimbo();

alter table public.demandas enable row level security;

create policy demandas_leitura on public.demandas for select to authenticated
  using (public.perfil_ativo());
create policy demandas_inclusao on public.demandas for insert to authenticated
  with check (public.pode_escrever());
create policy demandas_alteracao on public.demandas for update to authenticated
  using (public.pode_escrever()) with check (public.pode_escrever());
create policy demandas_exclusao on public.demandas for delete to authenticated
  using (public.pode_escrever());

/**
 * Grava um projeto como o `set(..., {merge: true})` do Firestore: os campos enviados
 * substituem os gravados, os de `p_remover` são apagados e o resto é mantido
 * (ex.: campos escritos pelo webhook do ClickUp). Sempre limpa a presença.
 */
create function public.salvar_demanda(p_id text, p_dados jsonb, p_remover text[] default '{}')
returns void
language sql
as $$
  insert into public.demandas as d (id, dados)
  values (p_id, (p_dados - coalesce(p_remover, '{}')) - 'id')
  on conflict (id) do update set
    dados = ((d.dados || excluded.dados) - coalesce(p_remover, '{}')) - 'id',
    editing_by = null,
    editing_at = null;
$$;

/** Presença de edição: qualquer usuário ativo pode marcar/desmarcar. */
create function public.marcar_presenca(p_id text, p_editing jsonb) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.perfil_ativo() then
    raise exception 'Sem acesso.' using errcode = '42501';
  end if;
  update public.demandas
     set editing_by = p_editing,
         editing_at = case when p_editing is null then null
                           else coalesce((p_editing ->> 'since')::timestamptz, now()) end
   where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Configuração geral (linha única)
-- ---------------------------------------------------------------------------

create table public.sistema_meta (
  id text primary key default 'meta' check (id = 'meta'),
  diarias jsonb not null default '[]'::jsonb,
  projetistas jsonb not null default '{}'::jsonb,
  deleted_demanda_ids jsonb not null default '[]'::jsonb,
  deleted_diaria_ids jsonb not null default '[]'::jsonb,
  metas_etapa jsonb not null default '{}'::jsonb,
  filtros_salvos jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);

insert into public.sistema_meta (id) values ('meta');

alter table public.sistema_meta enable row level security;

create policy meta_leitura on public.sistema_meta for select to authenticated
  using (public.perfil_ativo());
create policy meta_alteracao on public.sistema_meta for update to authenticated
  using (public.pode_escrever()) with check (public.pode_escrever());

/** Mescla objetos em profundidade (como o merge do Firestore); listas são substituídas. */
create function public.jsonb_mesclar(a jsonb, b jsonb) returns jsonb
language sql immutable
as $$
  select case
    when jsonb_typeof(a) = 'object' and jsonb_typeof(b) = 'object' then (
      select coalesce(jsonb_object_agg(
        k,
        case
          when a ? k and b ? k then public.jsonb_mesclar(a -> k, b -> k)
          when b ? k then b -> k
          else a -> k
        end
      ), '{}'::jsonb)
      from (select jsonb_object_keys(a) as k union select jsonb_object_keys(b)) chaves
    )
    else b
  end
$$;

/**
 * Grava metas por etapa e/ou filtros salvos sem apagar o que outros usuários gravaram.
 * Filtros salvos: qualquer usuário ativo. Metas por etapa: só quem grava.
 */
create function public.mesclar_meta(p_campos jsonb) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_campos ? 'metasEtapa' and not public.pode_escrever() then
    raise exception 'Sem permissão para alterar metas.' using errcode = '42501';
  end if;
  if p_campos ? 'filtrosSalvos' and not public.perfil_ativo() then
    raise exception 'Sem acesso.' using errcode = '42501';
  end if;
  update public.sistema_meta set
    metas_etapa = case when jsonb_typeof(p_campos -> 'metasEtapa') = 'object'
                       then public.jsonb_mesclar(metas_etapa, p_campos -> 'metasEtapa') else metas_etapa end,
    filtros_salvos = case when jsonb_typeof(p_campos -> 'filtrosSalvos') = 'object'
                          then public.jsonb_mesclar(filtros_salvos, p_campos -> 'filtrosSalvos') else filtros_salvos end,
    atualizado_em = now()
  where id = 'meta';
end;
$$;

/** Exclui um projeto e registra o id na lista de excluídos (impede que volte de cópias locais). */
create function public.excluir_demanda(p_id text) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.pode_escrever() then
    raise exception 'Sem permissão para excluir.' using errcode = '42501';
  end if;
  delete from public.demandas where id = p_id;
  update public.sistema_meta
     set deleted_demanda_ids = case when deleted_demanda_ids ? p_id then deleted_demanda_ids
                                    else deleted_demanda_ids || to_jsonb(p_id) end,
         atualizado_em = now()
   where id = 'meta';
end;
$$;

-- ---------------------------------------------------------------------------
-- Arquivos dos projetos (PDF, KMZ, fotos)
-- ---------------------------------------------------------------------------

create table public.arquivos (
  id uuid primary key default gen_random_uuid(),
  demanda_id text not null references public.demandas (id) on delete cascade,
  tipo text not null check (tipo in ('pdf', 'kmz', 'foto')),
  nome text not null,
  caminho text not null unique,
  tamanho bigint not null default 0,
  mime text not null default '',
  -- PDF do levantamento (substitui o PDF em base64 que ficava dentro do projeto).
  levantamento boolean not null default false,
  criado_por text not null default public.email_atual(),
  criado_em timestamptz not null default now()
);

create index arquivos_demanda_idx on public.arquivos (demanda_id, tipo, criado_em desc);

alter table public.arquivos enable row level security;

create policy arquivos_leitura on public.arquivos for select to authenticated
  using (public.perfil_ativo());
create policy arquivos_inclusao on public.arquivos for insert to authenticated
  with check (public.pode_escrever() and criado_por = public.email_atual());
create policy arquivos_alteracao on public.arquivos for update to authenticated
  using (public.pode_escrever()) with check (public.pode_escrever());
create policy arquivos_exclusao on public.arquivos for delete to authenticated
  using (public.pode_escrever());

-- ---------------------------------------------------------------------------
-- Tempo real
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.demandas, public.sistema_meta, public.perfis, public.arquivos;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Storage: bucket privado dos arquivos (acesso por URL assinada)
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'projetos', 'projetos', false, 52428800,
      array[
        'application/pdf',
        'application/vnd.google-earth.kmz',
        'application/vnd.google-earth.kml+xml',
        'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'
      ]
    )
    on conflict (id) do update set
      public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

    insert into storage.buckets (id, name, public)
    values ('backups', 'backups', false)
    on conflict (id) do nothing;

    -- Caminho: {id do projeto}/{pdf|kmz|foto}/{arquivo}
    execute $p$
      create policy projetos_leitura on storage.objects for select to authenticated
        using (bucket_id = 'projetos' and public.perfil_ativo())
    $p$;
    execute $p$
      create policy projetos_envio on storage.objects for insert to authenticated
        with check (bucket_id = 'projetos' and public.pode_escrever())
    $p$;
    execute $p$
      create policy projetos_exclusao on storage.objects for delete to authenticated
        using (bucket_id = 'projetos' and public.pode_escrever())
    $p$;
    execute $p$
      create policy backups_leitura on storage.objects for select to authenticated
        using (bucket_id = 'backups' and public.eh_admin())
    $p$;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Usuários iniciais (os mesmos do DEMANDAS_ROLES_SEED do app)
-- ---------------------------------------------------------------------------

insert into public.perfis (email, papel) values
  ('vinicius.morais@soumaster.com.br', 'admin'),
  ('alberto.soares@soumaster.com.br', 'projetista'),
  ('rafael.mesquita@soumaster.com.br', 'projetista'),
  ('rafael.machado@soumaster.com.br', 'projetista'),
  ('matheus.costa@soumaster.com.br', 'projetista'),
  ('daniel.rodrigues@soumaster.com.br', 'projetista'),
  ('joao.bosco@soumaster.com.br', 'projetista'),
  ('eduardo.pereira@soumaster.com.br', 'projetista'),
  ('thiago.coelho@soumaster.com.br', 'projetista'),
  ('hanver.junior@soumaster.com.br', 'projetista')
on conflict (email) do nothing;

-- Funções usadas pelas regras (RLS) e pela Edge Function admin-usuarios.
grant execute on function public.email_atual() to authenticated;
grant execute on function public.perfil_ativo() to authenticated;
grant execute on function public.pode_escrever() to authenticated;
grant execute on function public.eh_admin() to authenticated;

-- Funções chamadas pelo app (o resto fica fechado ao público).
revoke execute on function public.salvar_perfis(jsonb) from public, anon;
revoke execute on function public.salvar_demanda(text, jsonb, text[]) from public, anon;
revoke execute on function public.marcar_presenca(text, jsonb) from public, anon;
revoke execute on function public.mesclar_meta(jsonb) from public, anon;
revoke execute on function public.excluir_demanda(text) from public, anon;
grant execute on function public.salvar_perfis(jsonb) to authenticated;
grant execute on function public.salvar_demanda(text, jsonb, text[]) to authenticated;
grant execute on function public.marcar_presenca(text, jsonb) to authenticated;
grant execute on function public.mesclar_meta(jsonb) to authenticated;
grant execute on function public.excluir_demanda(text) to authenticated;
