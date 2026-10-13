-- Testes das regras de acesso (RLS) e das funções da migração inicial.
-- Rodar num Postgres limpo: supabase-simulado.sql → migrations/*.sql → este arquivo.
\set ON_ERROR_STOP 1

create function pg_temp.como(e text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('email', e)::text, false);
$$;

/** Executa o comando e exige que falhe por permissão. */
create function pg_temp.negado(cmd text) returns void language plpgsql as $$
begin
  execute cmd;
  raise exception 'deveria ter sido negado: %', cmd;
exception when insufficient_privilege then
  null;
end;
$$;

create function pg_temp.confere(ok boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FALHOU: %', msg; end if;
end;
$$;

set role authenticated;

-- Projetista grava com mesclagem rasa, apaga campos pedidos e limpa a presença.
select pg_temp.como('Matheus.Costa@soumaster.com.br');
select salvar_demanda('p1', '{"id":"p1","titulo":"Rota","status":"novo","clickup":{"a":1},"x":1}');
select salvar_demanda('p1', '{"titulo":"Rota 2","status":"custo"}', array['clickup']);
select pg_temp.confere((select dados = '{"x":1,"status":"custo","titulo":"Rota 2"}' and status = 'custo' and atualizado_por = 'matheus.costa@soumaster.com.br' from demandas where id = 'p1'), 'salvar_demanda mescla e apaga');
select marcar_presenca('p1', '{"email":"m","since":"2026-10-13T10:00:00Z"}');
select pg_temp.confere((select editing_at = '2026-10-13T10:00:00Z' from demandas where id = 'p1'), 'presença marcada');
select salvar_demanda('p1', '{"y":2}');
select pg_temp.confere((select editing_by is null and dados ? 'x' and dados ? 'y' from demandas where id = 'p1'), 'gravar limpa presença');

-- Metas e filtros: mescla profunda sem perder o que outros gravaram.
select mesclar_meta('{"filtrosSalvos":{"a@x":[1]}}');
select mesclar_meta('{"filtrosSalvos":{"b@x":[2]},"metasEtapa":{"B2C":{"novo":3}}}');
select mesclar_meta('{"metasEtapa":{"B2C":{"custo":5}}}');
select pg_temp.confere((select filtros_salvos = '{"a@x":[1],"b@x":[2]}' and metas_etapa = '{"B2C":{"novo":3,"custo":5}}' from sistema_meta), 'mesclar_meta');

-- Exclusão registra o id.
select excluir_demanda('p1');
select pg_temp.confere((select count(*) = 0 from demandas) and (select deleted_demanda_ids = '["p1"]' from sistema_meta), 'excluir_demanda');

-- Só admin mexe em usuários.
select pg_temp.negado($$select salvar_perfis('{"roles":{"x@y":"admin"}}')$$);

-- Quem não está em perfis não vê nem grava nada.
select pg_temp.como('estranho@x.com');
select pg_temp.negado($$select salvar_demanda('p2', '{}')$$);
select pg_temp.confere((select count(*) = 0 from sistema_meta) and (select count(*) = 0 from perfis), 'desconhecido não lê');

-- Admin: salvar_perfis aplica papéis/bloqueios e protege o admin principal.
select pg_temp.como('vinicius.morais@soumaster.com.br');
select salvar_demanda('p3', '{"titulo":"T"}');
select salvar_perfis('{"roles":{"matheus.costa@soumaster.com.br":"visibilidade","novo@x.com":"projetista","vinicius.morais@soumaster.com.br":"visibilidade"},"disabled":{"novo@x.com":true,"vinicius.morais@soumaster.com.br":true},"regionals":{"novo@x.com":"Centro"},"names":{"novo@x.com":"Novo"}}');
select pg_temp.confere((select papel = 'admin' and not desabilitado from perfis where email = 'vinicius.morais@soumaster.com.br'), 'admin principal protegido');
select pg_temp.confere((select desabilitado and regional = 'Centro' and nome = 'Novo' from perfis where email = 'novo@x.com'), 'novo usuário desabilitado');
select pg_temp.confere((select removido from perfis where email = 'alberto.soares@soumaster.com.br'), 'fora dos mapas = removido');

-- Visibilidade lê, salva filtros e presença, mas não grava projetos nem metas.
select pg_temp.como('matheus.costa@soumaster.com.br');
select pg_temp.confere((select count(*) = 1 from demandas), 'visibilidade lê');
select pg_temp.negado($$select salvar_demanda('p3', '{"z":1}')$$);
select pg_temp.negado($$select mesclar_meta('{"metasEtapa":{"x":1}}')$$);
select mesclar_meta('{"filtrosSalvos":{"m":[]}}');
select marcar_presenca('p3', '{"e":1}');
with u as (update demandas set dados = '{}' returning 1)
select pg_temp.confere((select count(*) = 0 from u), 'visibilidade não altera por update direto');

-- Desabilitado vê só o próprio perfil e nenhum projeto.
select pg_temp.como('novo@x.com');
select pg_temp.confere((select count(*) = 0 from demandas) and (select array_agg(email) = array['novo@x.com'] from perfis), 'desabilitado isolado');
select pg_temp.negado($$insert into storage.objects (bucket_id, name) values ('projetos', 'p3/foto/a.jpg')$$);

-- Arquivos: quem grava envia; criado_por precisa ser o próprio e o projeto precisa existir.
select pg_temp.como('vinicius.morais@soumaster.com.br');
insert into storage.objects (bucket_id, name) values ('projetos', 'p3/foto/a.jpg');
insert into arquivos (demanda_id, tipo, nome, caminho) values ('p3', 'foto', 'a.jpg', 'p3/foto/a.jpg');
select pg_temp.confere((select criado_por = 'vinicius.morais@soumaster.com.br' from arquivos), 'criado_por automático');
select pg_temp.negado($$insert into arquivos (demanda_id, tipo, nome, caminho, criado_por) values ('p3', 'foto', 'b.jpg', 'p3/foto/b.jpg', 'outro@x')$$);
select pg_temp.negado($$insert into storage.objects (bucket_id, name) values ('backups', 'x.json')$$);
select excluir_demanda('p3');
select pg_temp.confere((select count(*) = 0 from arquivos), 'arquivos saem junto com o projeto');

reset role;
select 'regras: ok' as resultado;
