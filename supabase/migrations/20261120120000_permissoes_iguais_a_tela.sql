-- O banco passa a exigir o mesmo que a tela já exige (antes, pelo console, um projetista conseguia):
--  · excluir uma demanda de vez (esvaziar a lixeira) é só do administrador;
--  · a lista de demandas excluídas (deletedDemandaIds) só muda pela própria exclusão — mexer nela à mão
--    esconderia ou faria «ressuscitar» projetos para toda a equipe;
--  · as metas por etapa só o administrador muda.
-- Mover para a lixeira, arquivar e restaurar continuam iguais (são gravações comuns da demanda).

create or replace function public.demanda_excluir(p_id text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.acesso_exigir(array['admin']);
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
  if p_campos ? 'deletedDemandaIds' then
    raise exception 'A lista de excluídas só muda pela exclusão da demanda.' using errcode = '42501';
  end if;
  if p_campos ? 'metasEtapa' and public.acesso_nivel() <> 'admin' then
    raise exception 'Só administradores mudam as metas por etapa.' using errcode = '42501';
  end if;
  update public.sistema_meta m set dados = public.jsonb_mesclar(m.dados, p_campos) where m.id = 'meta';
end $$;

-- «create or replace» mantém as permissões, mas fica explícito (e vale se a função tiver sido recriada).
revoke all on function public.demanda_excluir(text), public.meta_salvar(jsonb) from public, anon, authenticated;
grant execute on function public.demanda_excluir(text), public.meta_salvar(jsonb) to authenticated;
