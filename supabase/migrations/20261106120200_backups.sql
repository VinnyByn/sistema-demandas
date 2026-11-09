-- Bucket privado dos backups: só o servidor grava; só administrador ativo lista e baixa.
insert into storage.buckets (id, name, public) values ('backups', 'backups', false) on conflict (id) do nothing;

drop policy if exists backups_admin_ler on storage.objects;
create policy backups_admin_ler on storage.objects
  for select to authenticated
  using (bucket_id = 'backups' and (select public.acesso_nivel()) = 'admin');
