# Migração para o Supabase

O app passa a guardar **banco, login e arquivos** no Supabase. A hospedagem do site continua no
Firebase Hosting (https://demproj-fdeac.web.app).

Enquanto a virada não acontece, **a produção continua no Firebase**: o Supabase só é usado por quem
abrir o site com `?backend=supabase`.

## O que fica onde

| Antes (Firebase)                         | Agora (Supabase)                                               |
| ---------------------------------------- | -------------------------------------------------------------- |
| Firestore `demandas/{id}`                | tabela `demandas` (projeto inteiro em `dados`)                 |
| Firestore `demandasSistema/meta`         | tabela `sistema_meta` (diárias, projetistas, metas, filtros)   |
| `meta.roles`, `disabledUsers`…           | tabela `perfis` (papel, desabilitado, removido, regional, nome) |
| Firebase Auth                            | Supabase Auth (e-mail e senha)                                 |
| PDF do levantamento em base64 (≤ 650 KB) | Storage, bucket `projetos` (até 50 MB por arquivo)             |
| —                                        | seção **Arquivos** do projeto: abas PDF, KMZ e Fotos           |
| Regras do Firestore (qualquer logado grava) | RLS: visibilidade só lê; projetista e admin gravam; só admin gerencia usuários |

Arquivos ficam em `projetos/{id do projeto}/{pdf|kmz|foto}/…` e são abertos por link assinado
que vale 1 hora. O bucket é privado.

## Passo a passo

### 1. Criar o projeto

1. Em https://supabase.com crie um projeto (região **South America (São Paulo)**).
2. Guarde a senha do banco num cofre.

### 2. Criar as tabelas e regras

No painel: **SQL Editor → New query**, cole o conteúdo de
`supabase/migrations/20261013000000_inicial.sql` e clique em **Run**.

(Com a CLI: `supabase link --project-ref <ref>` e `supabase db push`.)

### 3. Configurar o login

Em **Authentication**:

- **Sign In / Providers → Email**: deixe ativo; **desative "Allow new users to sign up"**
  (só o admin cria contas, como hoje).
- **URL Configuration**: *Site URL* = `https://demproj-fdeac.web.app` e adicione o mesmo endereço em
  *Redirect URLs* (é para onde o link de "Esqueci a senha" volta).
- **Emails → SMTP Settings**: configure um SMTP próprio. O envio padrão do Supabase é limitado a
  poucos e-mails por hora, e na virada cada usuário vai pedir um link de senha.

### 4. Publicar a função de criar usuários

Com a [CLI do Supabase](https://supabase.com/docs/guides/cli):

```bash
supabase login
supabase link --project-ref <ref do projeto>
supabase functions deploy admin-usuarios
```

Ela usa a chave `service_role` no servidor; essa chave **nunca** vai para o site.

### 5. Ligar o site ao projeto

Em **Project Settings → API** copie a *Project URL* e a chave *anon public* para
`demandas-projetos/supabase-config.js`:

```js
window.SUPABASE_CONFIG = {
  url: "https://xxxx.supabase.co",
  anonKey: "eyJ...",
};
```

A chave anon é pública por definição; quem protege os dados são as regras do passo 2.

### 6. Copiar os dados do Firebase

Rode **antes** de liberar o Supabase para uso (rodar de novo sobrescreve os projetos com o que está
no Firestore).

```bash
cd supabase/migracao
npm install
export FIREBASE_SERVICE_ACCOUNT=/caminho/chave-da-conta-de-servico.json  # Firebase → Configurações → Contas de serviço
export SUPABASE_URL=https://xxxx.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=...                                     # Supabase → Settings → API (secreta)
npm run simular   # só mostra o que faria
npm run migrar    # grava e confere se todos os projetos chegaram
```

O script copia usuários (sem senha), acessos, configurações e projetos, e manda para o Storage os
PDFs do levantamento e fotos que estavam embutidos nos projetos.

### 7. Testar sem afetar ninguém

Abra `https://demproj-fdeac.web.app/?backend=supabase`. O navegador lembra a escolha;
`?backend=firebase` volta ao normal.

### 8. Virada

1. Em `supabase-config.js`, troque `const PADRAO = "firebase"` por `"supabase"` e publique.
2. Avise a equipe: no primeiro acesso cada um clica em **Esqueci a senha** e define a senha nova
   (o Supabase não lê as senhas do Firebase).
3. Deixe o Firebase só como leitura por alguns dias e depois desligue Firestore e Auth.

## Ainda no Firebase (próxima fase)

Estas partes dependem de Cloud Functions e serão portadas para Edge Functions do Supabase:

- Envio e cancelamento à Operação no **ClickUp** (e o webhook que atualiza o projeto);
- **Backup automático** diário.

No modo Supabase o app avisa que essas ações ainda não foram migradas, em vez de falhar.

## Testes

- `supabase/tests/regras.test.sql`: regras de acesso (RLS) e funções, num Postgres comum
  (`supabase-simulado.sql` imita o que o Supabase já traz). Roda no CI no job **banco**.
- `tests/e2e/supabase.spec.js`: o app inteiro no modo Supabase, com um Supabase falso em memória
  (login, tempo real, gravação, permissões e a seção Arquivos).
- `tests/unit/migracao.test.mjs`: conversões do script de migração.
