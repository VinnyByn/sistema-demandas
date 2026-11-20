-- Conta desabilitada passa a não ver nada (antes ela continuava lendo todos os projetos, só sem editar).
-- Quem sai da equipe e ainda tem projetos é desabilitado, não removido: ele não pode seguir vendo os dados.
-- O administrador principal continua imune (o sistema nunca fica sem quem corrija os papéis).
-- Mesma regra de _shared/acesso.mjs e de user-roles.js (tests/unit/acesso.test.mjs confere as três).
create or replace function public.acesso_nivel_de(p_email text, p_meta jsonb)
returns text language plpgsql immutable set search_path = '' as $$
declare
  v_papel_salvo jsonb := p_meta -> 'roles' -> p_email;
  v_papel text := case when jsonb_typeof(v_papel_salvo) = 'string' then lower(v_papel_salvo #>> '{}') else '' end;
begin
  if coalesce(p_email, '') = '' then return ''; end if;
  if p_email = public.acesso_principal_email() then return 'admin'; end if;
  if v_papel = '' or public.acesso_marcado(p_meta -> 'purgedUsers' -> p_email) then return ''; end if;
  if public.acesso_marcado(p_meta -> 'disabledUsers' -> p_email) then return ''; end if;
  if v_papel in ('admin', 'administrador', 'administrator') then return 'admin'; end if;
  if v_papel in ('projetista') then return 'escrita'; end if;
  return 'leitura';
end $$;

revoke all on function public.acesso_nivel_de(text, jsonb) from public, anon, authenticated;
grant execute on function public.acesso_nivel_de(text, jsonb) to service_role;
