-- Backup diário às 03:10 de Brasília (o pg_cron usa UTC). Antes de rodar, crie no Vault `project_url` e `backup_segredo`
-- (ver docs/migracao-supabase.md). O segredo é próprio: o pg_net guarda o cabeçalho em texto na fila de envio,
-- então a chave secreta do projeto não deve passar por aqui.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'backup-diario',
  '10 6 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/backup-diario',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-backup-segredo', (select decrypted_secret from vault.decrypted_secrets where name = 'backup_segredo')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
