-- Envio dos avisos por e-mail (fica separado porque usa pg_net, pg_cron e Vault, que só existem no Supabase).
-- Antes de funcionar, guarde no Vault (SQL Editor):
--   select vault.create_secret('CHAVE_DA_API', 'email_chave');
--   select vault.create_secret('Projetos Master <avisos@seudominio.com.br>', 'email_remetente');
--   select vault.create_secret('resend', 'email_provedor');   -- ou 'brevo'
-- Sem essas chaves, nada é enviado: os avisos ficam guardados e saem quando o envio for configurado
-- (os com mais de 2 dias são descartados, para não chegar aviso velho).
-- O pg_net guarda o pedido (com a chave do serviço de e-mail) numa fila interna por alguns segundos; só o banco lê essa fila.
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.email_enviar()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_chave text;
  v_remetente text;
  v_provedor text;
  v_nome text;
  v_de text;
  r record;
  v_resp record;
  v_pedido bigint;
  v_enviados integer := 0;
begin
  select s.decrypted_secret into v_chave from vault.decrypted_secrets s where s.name = 'email_chave';
  select s.decrypted_secret into v_remetente from vault.decrypted_secrets s where s.name = 'email_remetente';
  select lower(btrim(s.decrypted_secret)) into v_provedor from vault.decrypted_secrets s where s.name = 'email_provedor';
  v_provedor := coalesce(nullif(v_provedor, ''), 'resend');

  -- Aviso velho não vale mais a pena mandar.
  update public.email_saida s set situacao = 'erro', erro = 'Descartado: ficou mais de 2 dias sem envio configurado.'
   where s.situacao = 'pronto' and s.criado_em < now() - interval '2 days';
  delete from public.email_eventos e where e.saida_id is null and e.criado_em < now() - interval '2 days';
  -- Histórico curto: nada de e-mail guardado para sempre.
  delete from public.email_saida s where s.criado_em < now() - interval '30 days';
  delete from public.email_eventos e where e.criado_em < now() - interval '30 days';

  if coalesce(v_chave, '') = '' or coalesce(v_remetente, '') = '' then return 0; end if;
  v_nome := nullif(btrim(regexp_replace(v_remetente, '<.*$', '')), '');
  v_de := coalesce(substring(v_remetente from '<([^>]+)>'), btrim(v_remetente));

  -- 1) Resposta dos envios anteriores.
  for r in select s.id, s.pedido, s.tentativas, s.criado_em from public.email_saida s where s.situacao = 'enviando' loop
    select h.status_code, h.content, h.error_msg, h.timed_out into v_resp from net._http_response h where h.id = r.pedido;
    if not found then
      -- O pg_net apaga as respostas depois de algumas horas: sem resposta há muito tempo, tenta de novo.
      if r.criado_em < now() - interval '1 hour' then
        update public.email_saida s set situacao = case when r.tentativas >= 3 then 'erro' else 'pronto' end,
               erro = 'Sem resposta do serviço de e-mail.' where s.id = r.id;
      end if;
      continue;
    end if;
    if v_resp.status_code between 200 and 299 then
      update public.email_saida s set situacao = 'enviado', enviado_em = now(), erro = null where s.id = r.id;
    else
      update public.email_saida s
         set situacao = case when r.tentativas >= 3 or v_resp.status_code in (400, 401, 403, 422) then 'erro' else 'pronto' end,
             erro = left(coalesce(nullif(v_resp.error_msg, ''), 'HTTP ' || v_resp.status_code || ': ' || coalesce(v_resp.content, '')), 500)
       where s.id = r.id;
    end if;
  end loop;

  -- 2) Novos envios (no máximo 40 por rodada).
  for r in
    select s.id, s.para, s.assunto, s.html, s.texto from public.email_saida s
     where s.situacao = 'pronto' order by s.criado_em limit 40 for update skip locked
  loop
    if v_provedor = 'brevo' then
      v_pedido := net.http_post(
        url := 'https://api.brevo.com/v3/smtp/email',
        body := jsonb_build_object(
          'sender', jsonb_strip_nulls(jsonb_build_object('name', v_nome, 'email', v_de)),
          'to', jsonb_build_array(jsonb_build_object('email', r.para)),
          'subject', r.assunto, 'htmlContent', r.html, 'textContent', r.texto
        ),
        headers := jsonb_build_object('Content-Type', 'application/json', 'Accept', 'application/json', 'api-key', v_chave),
        timeout_milliseconds := 15000
      );
    else
      v_pedido := net.http_post(
        url := 'https://api.resend.com/emails',
        body := jsonb_build_object('from', v_remetente, 'to', jsonb_build_array(r.para), 'subject', r.assunto, 'html', r.html, 'text', r.texto),
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_chave),
        timeout_milliseconds := 15000
      );
    end if;
    update public.email_saida s set situacao = 'enviando', pedido = v_pedido, tentativas = s.tentativas + 1 where s.id = r.id;
    v_enviados := v_enviados + 1;
  end loop;
  return v_enviados;
end $$;

revoke all on function public.email_enviar() from public, anon, authenticated;

-- A cada 5 minutos: junta os avisos e manda. Nos dias úteis às 07:40 de Brasília (10:40 UTC): resumo de prazos.
select cron.unschedule(j.jobid) from cron.job j where j.jobname in ('avisos-email', 'avisos-email-prazos');
select cron.schedule('avisos-email', '*/5 * * * *', $$ select public.email_preparar(); select public.email_enviar(); $$);
select cron.schedule('avisos-email-prazos', '40 10 * * 1-5', $$ select public.email_prazos_preparar(); select public.email_enviar(); $$);
