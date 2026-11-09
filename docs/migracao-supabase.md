# Virada para o Supabase

Passo a passo para colocar o sistema em produção. Do Firebase fica apenas a **hospedagem** (a URL `demproj-fdeac.web.app`).

Os comandos estão na sintaxe do PowerShell e rodam a partir da raiz do projeto, salvo indicação.

> **Atenção:** um merge na `main` publica o site automaticamente. Não faça o merge antes do passo 4 da virada: as pessoas ficariam sem acesso até lá.

## Antes de começar

- [ ] Escolher o plano do Supabase. No Free, o projeto é pausado por inatividade e não há backup automático do banco.
- [ ] Ter um serviço de e-mail (Resend, SES, SendGrid...). O padrão do Supabase não atende produção.
- [ ] Combinar com a equipe um horário sem uso. Os dois bancos não convivem, e o sistema para durante a cópia.
- [ ] Ter acesso ao console do Firebase e ao token do Asana.

## Parte 1: preparar

Nada aqui afeta quem está usando o sistema.

### 1. Criar o projeto

Crie o projeto no [painel do Supabase](https://supabase.com/dashboard), de preferência na região São Paulo (`sa-east-1`). Em *Settings → API Keys*, crie as chaves publicável (`sb_publishable_...`) e secreta (`sb_secret_...`). As antigas `anon` e `service_role` estão sendo descontinuadas até o fim de 2026.

Copie `.env.example` para `.env`, na raiz, e preencha `SUPABASE_URL` e `SUPABASE_SECRET_KEY`. O `.env` nunca vai para o Git.

### 2. Criar o banco e aplicar a configuração

```powershell
npx supabase login
npx supabase link --project-ref SEU_PROJETO
npx supabase db push --remote    # sem --remote iria para o banco local
npx supabase config push         # cadastro público fechado e endereços de retorno
```

O `config push` mostra as diferenças antes de aplicar: leia antes de confirmar. Se rodar de novo mais tarde, confira que ele não desfaz o e-mail do passo 3.

Confira no painel, em *Authentication*:
- [ ] O cadastro público está desligado (*Allow new users to sign up*). Com ele ligado, alguém poderia se registrar com o e-mail de um colega e herdar o papel dele.
- [ ] As contas anônimas estão desligadas.
- [ ] *Secure email change* está ligado.
- [ ] O e-mail de recuperação está em português (*Email Templates → Reset Password*).

### 3. Configurar o e-mail

O envio padrão do Supabase faz só **2 e-mails por hora**, e só para membros da organização: convite e "esqueci a senha" não funcionam sem um serviço próprio.

Configure em *Authentication → SMTP*. Depois, ajuste o limite em *Authentication → Rate Limits*, que começa em 30 por hora.

### 4. Publicar as funções e os segredos

Gere o segredo do backup e guarde-o até o passo 5: depois de gravado, o Supabase não mostra o valor.

```powershell
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
($bytes | ForEach-Object { $_.ToString("x2") }) -join ""
```

Preencha `ASANA_TOKEN` e `BACKUP_CRON_SEGREDO` no `.env` e envie. Só esses dois vão para as funções:

```powershell
npm run segredos

# --use-api empacota no servidor, sem precisar de Docker
npx supabase functions deploy api --use-api
npx supabase functions deploy asana-webhook --no-verify-jwt --use-api
npx supabase functions deploy backup-diario --no-verify-jwt --use-api
```

### 5. Ligar o backup agendado

No *SQL Editor*, guarde no Vault os valores que o agendamento lê:

```sql
select vault.create_secret('https://SEU_PROJETO.supabase.co', 'project_url');
select vault.create_secret('O_SEGREDO_DO_PASSO_4', 'backup_segredo');
```

### 6. Ensaiar

1. Faça a exportação do passo 2 da Parte 2 e rode a importação sem `--aplicar`. Confira as contagens e os avisos: eles listam quem tem papel fora da lista (essa pessoa passaria a só ler) e PDFs em formato não reconhecido.
2. Aplique a importação num projeto Supabase **de teste**.
3. Entre com uma conta descartável, usando a **senha antiga**. Isso prova que as senhas importadas funcionam. Se não funcionarem, a saída é mandar "Esqueci a senha" para todos, o que depende do passo 3.
4. Veja o tamanho de `saida/firestore.json`. Se passar de poucos MB, leia a seção Limites em [Arquitetura](arquitetura.md#limites).

## Parte 2: a virada

### 1. Parar o uso

Peça para ninguém usar o sistema. O que for gravado no Firebase depois da exportação se perde.

### 2. Exportar do Firebase

Em *Firebase → Configurações → Contas de serviço*, gere uma chave privada. Em *Authentication → Users → ⋮ → Password hash parameters*, copie os parâmetros para o arquivo `scripts/migracao-firebase/hash.json`:

```json
{ "base64_signer_key": "...", "base64_salt_separator": "...", "rounds": 8, "mem_cost": 14 }
```

Salve a chave como `scripts/migracao-firebase/chave-do-firebase.json`. Esta pasta tem dependências próprias e exige Node 22:

```powershell
cd scripts/migracao-firebase
npm install
node --env-file=../../.env exportar-firestore.mjs
npx firebase-tools auth:export users.json --format=json --project demproj-fdeac
```

### 3. Importar no Supabase

Sem `--aplicar`, só mostra o que faria. Pode rodar de novo sem duplicar nada.

```powershell
node --env-file=../../.env importar.mjs --usuarios users.json --hash hash.json
node --env-file=../../.env importar.mjs --usuarios users.json --hash hash.json --aplicar
```

### 4. Apontar o site

Em `site/js/nuvem/supabase-config.js`, preencha a URL e a chave **publicável** (a secreta nunca vai no site) e publique com o merge na `main`. Até isso ser preenchido, o site publicado mostra uma tela de manutenção.

### 5. Conferir

Ainda com a equipe fora do sistema, com uma conta de cada papel:

- [ ] Entrar com a senha antiga e ver os projetos.
- [ ] Abrir o sistema em duas abas e ver uma alteração aparecer na outra.
- [ ] Salvar um projeto. Com uma conta de leitura, não deve conseguir.
- [ ] "Esqueci a senha": o e-mail chega, o link abre o app e pede a nova senha.
- [ ] Criar um login novo por convite.
- [ ] Enviar um projeto ao Asana e comentar nos dois sentidos.
- [ ] Anexar um arquivo de quase 10 MB e mover a tarefa de coluna.
- [ ] *Backups → Fazer backup agora* e baixar o arquivo.
- [ ] Rodar o [teste de segurança no console](seguranca.md#o-teste-no-projeto-real). Com qualquer linha `FALHOU`, corrija antes de liberar.

### 6. Liberar e desligar o Firebase

Avise a equipe. Na aba Usuários, todos aparecem como "Nunca entrou" até entrarem de novo, porque o último acesso não vem do Firebase.

Depois de alguns dias sem problemas, desligue as funções antigas:

```powershell
npx firebase-tools functions:delete asanaProjetos createAsanaOperacao cancelAsanaOperacao asanaAnexar asanaComentario asanaWebhook getViabilidadePortas backupDiario backupAgora criarContaLogin listarContasLogin --project demproj-fdeac
```

Os webhooks antigos do Asana são removidos sozinhos na primeira vez em que alguém abre a janela *Enviar à Operação*.

Mantenha o Firestore e o Storage parados por algumas semanas, como cópia de segurança. Depois, apague a pasta `scripts/migracao-firebase/`, incluindo `users.json`, `hash.json` e `saida/`, que têm dados da empresa e hash de senha.

## Se algo der errado

Até o passo 6, o Firebase continua intacto. Para voltar, reverta o merge na `main`: o site antigo é publicado de novo e lê o Firestore.

O que tiver sido gravado no Supabase depois da virada não volta sozinho para o Firebase. Por isso, confira tudo no passo 5 antes de liberar a equipe.

## O que deixou de existir

- **`getViabilidadePortas`:** nada no app chamava essa função, e ela usava 1 GB de memória e até 4 minutos, acima dos limites de uma Edge Function.
- **App Check** (estava desligado), migração do formato `state` antigo e cadastro pelo navegador.
- **Segredos dos webhooks do Asana:** não são copiados, porque os webhooks são recriados com o endereço novo.
- **Arquivos de backup antigos:** ficam no Firebase Storage até ele ser apagado. Baixe os que quiser guardar.
- **Telas sem uso:** o código de Diárias, Projetistas, Solicitantes, Projetado x Executado, e Chegadas e Finalizações foi removido. Essas telas já não existiam no `index.html`. Os dados continuam guardados.
