# Avisos por e-mail

O sistema manda três tipos de e-mail:

| Aviso | Quando | Para quem |
|---|---|---|
| Menção | Alguém escreve `@Nome` num comentário | A pessoa mencionada |
| Atribuição | Alguém vira projetista de um projeto ou responsável por uma atividade | Essa pessoa (não quem fez a mudança) |
| Resumo de prazos | Dias úteis, às 07:40 | Quem tem projeto ou atividade atrasada, vencendo hoje ou nos próximos 3 dias |

Cada pessoa liga ou desliga cada aviso em **Minha conta → Avisos**. Conta desabilitada ou removida não recebe nada.
Vários avisos seguidos para a mesma pessoa viram um e-mail só.

## Como a conta é ligada ao projetista

Os projetistas do sistema são nomes ("Vinicius", "Matheus"), não e-mails. O banco procura a conta pelo **nome de exibição**
(o nome que aparece nos comentários, definido na aba Usuários):

1. nome inteiro igual (sem diferenciar acento e maiúscula): "João Silva" = "joao silva";
2. se não achar, o primeiro nome, mas só quando **uma única conta** tem esse primeiro nome.

Se duas contas começam com "Daniel", ninguém recebe o aviso do projetista "Daniel". Nesse caso, ajuste o nome de exibição
ou o nome do projetista para ficarem iguais.

## Ligar o envio (uma vez)

Tudo roda no banco. Não há função nova para publicar.

### 1. Escolher o serviço de e-mail

- **Resend** (resend.com): exige um domínio próprio verificado (por exemplo, `avisos@suaempresa.com.br`). Grátis até 3.000 e-mails por mês.
- **Brevo** (brevo.com): aceita um remetente verificado por e-mail, mas e-mail de domínio próprio chega melhor. Grátis até 300 e-mails por dia.

O mesmo serviço pode servir de SMTP para os e-mails de login do Supabase (convite e "esqueci a senha").

Crie a conta, verifique o domínio (ou o remetente) e gere uma **chave de API**.

### 2. Aplicar o SQL

No Supabase, abra *SQL Editor*, cole e rode, nesta ordem:

1. `supabase/migrations/20261121120000_avisos_email.sql`
2. `supabase/migrations/20261121120100_agendamento_emails.sql`

### 3. Guardar a chave no Vault

No *SQL Editor*, troque os valores e rode:

```sql
select vault.create_secret('COLE_A_CHAVE_DA_API_AQUI', 'email_chave');
select vault.create_secret('Projetos Master <avisos@seudominio.com.br>', 'email_remetente');
select vault.create_secret('resend', 'email_provedor'); -- ou 'brevo'
```

A chave fica guardada criptografada e não aparece no site. Para trocar depois:
`select vault.update_secret((select id from vault.secrets where name = 'email_chave'), 'NOVA_CHAVE');`

### 4. Testar

No sistema, como administrador: **Minha conta → Avisos → Mandar um e-mail de teste para mim**. O e-mail chega em até 5 minutos.
A mesma tela mostra quantos e-mails saíram nos últimos 7 dias e o último erro, se houver.

## Para conferir pelo SQL

```sql
-- Últimos e-mails e situação
select para, assunto, situacao, erro, criado_em, enviado_em from public.email_saida order by criado_em desc limit 20;
-- Agendamentos
select jobname, schedule from cron.job where jobname like 'avisos-email%';
```

## Privacidade

O e-mail leva o título do projeto e, nas menções, o trecho do comentário. Esse conteúdo passa pelo serviço de e-mail escolhido.
O histórico de envios fica 30 dias no banco e depois é apagado.
