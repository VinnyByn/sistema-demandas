# Firebase — hospedagem e banco de dados

O sistema salva no **Cloud Firestore** com **uma demanda por documento** (`demandas/{id}`). Metadados (incl. campos legados de diárias/atividade) ficam em `demandasSistema/meta`. O documento antigo `demandasSistema/state` (campo `payload`) serve só para **migração**. Uma cópia continua no `localStorage` como backup. As abas **Demandas diárias** e **Projetistas** foram retiradas da UI.

## 1. Criar projeto no Firebase

1. Acesse [https://console.firebase.google.com](https://console.firebase.google.com) e crie um projeto.
2. Em **Build → Authentication → Sign-in method**, ative **E-mail/senha** (Email/Password).
3. Em **Authentication → Users**, clique em **Add user** e cadastre o e-mail e a senha de cada pessoa da equipe.
4. Em **Build → Firestore Database**, crie o banco (modo produção; região próxima ao Brasil, ex.: `southamerica-east1`).
5. Em **Configurações do projeto → Seus apps**, adicione um app **Web** e copie o objeto `firebaseConfig`.

## 2. Configurar o app

Edite `demandas-projetos/firebase-config.js` com os valores do console (substitua os `COLOQUE_...`).

Na raiz do repositório, edite `.firebaserc` e troque `SEU_PROJECT_ID` pelo ID do projeto.

## 3. Publicar regras e site

Instale a CLI (uma vez):

```bash
npm install -g firebase-tools
firebase login
```

Na pasta **Sistema Demandas** (onde está o `firebase.json`):

```bash
cd "c:\Users\rvini\OneDrive\Área de Trabalho\Sistema Demandas"
firebase use SEU_PROJECT_ID
firebase deploy
```

Isso publica o site (`demandas-projetos/`) e as regras do Firestore.

Somente regras:

```bash
firebase deploy --only firestore:rules
```

Somente site:

```bash
firebase deploy --only hosting
```

URL do site: **https://demproj-fdeac.web.app** (também visível no cabeçalho do app)

## 4. Migração do formato antigo (payload único)

Se ainda existir tudo dentro de `demandasSistema/state`:

1. Faça login no site.
2. Clique **5 vezes** no título **Projetos** no topo.
3. Confirme a migração — cada demanda vira um documento em `demandas/{id}`.

O documento `state` não é apagado; recebe apenas `migratedAt` / `migratedCount`.

Dados só no `localStorage` são mesclados automaticamente na primeira sincronização.

## 5. Sincronização

- Vários usuários veem atualizações em tempo real (listener do Firestore).
- O indicador no topo mostra: **Conectando**, **Salvando**, **Sincronizado** ou **Somente neste navegador** (sem Firebase configurado).
- **Exportar / Importar JSON** continua disponível para backup manual.

## 6. Papéis (Admin / Projetista / Visibilidade)

Fonte única: o doc `demandasSistema/meta` (`roles`, `disabledUsers`, `purgedUsers`, mais `userRegionals`, `userDisplayNames` e `userHomes`). O app, as regras do Firestore e do Storage e as Cloud Functions leem dele. No código fica só o administrador principal (o mesmo e-mail em `user-roles.js`, `firestore.rules`, `storage.rules` e `functions/acesso.js`; um teste confere que os quatro batem).

- **Administrador:** `vinicius.morais@soumaster.com.br` (sempre) e quem tiver `admin` no mapa — tudo, inclusive aba **Usuários**
- **Projetista:** operação completa (sem gerenciar usuários)
- **Visibilidade** ou **desabilitado:** somente leitura
- **Fora do mapa** ou **removido:** sem acesso nenhum (as regras recusam, não só a tela)

Contas novas são criadas pela função `criarContaLogin` (Admin SDK, só administrador). Com "Enviar convite", a pessoa recebe o e-mail para criar a própria senha (mínimo de 8 caracteres). A aba **Usuários** mostra o último acesso de cada conta (função `listarContasLogin`), quem ainda não tem login (com a ação "Criar login e enviar convite") e o **Histórico de acessos** (coleção `acessosHistorico`, gravada só por administradores).

A tela inicial de cada conta (Esteira Projetos ou B2B) agora é escolhida na aba Usuários e fica em `userHomes`. **Depois do deploy, defina "Esteira B2B" para quem abria nela** (antes isso ficava fixo no código).

### Ordem para publicar mudanças de acesso

O merge na `main` publica **só o site**. Regras e funções são manuais:

1. `firebase deploy --only functions` (`criarContaLogin` e `listarContasLogin` precisam estar no ar antes do site novo)
2. **No site que está no ar hoje, antes do merge**, logado como admin, conferir no console do navegador que ninguém da lista antiga ficou de fora do `meta` — tem que dar `[]`. (Depois do merge essa lista sai do código e a conferência perde o sentido.)
   ```js
   const m = (await firebase.firestore().doc("demandasSistema/meta").get()).data();
   Object.keys(DEMANDAS_ROLES_SEED).filter((e) => !m.roles?.[e] && !m.purgedUsers?.[e]);
   ```
3. `firebase deploy --only firestore:rules,storage`
4. Merge do PR (publica o site).
5. Console → Authentication → Settings → User actions → **desmarcar "Enable create (sign-up)"**. Só depois disso ninguém de fora consegue criar conta.
6. Console → Authentication → Settings → Password policy: exigir **8 caracteres** (o app já pede 8 para senhas novas).
7. Na aba Usuários, marcar "Esteira B2B" para as contas que abriam nela.

Teste antes: `cd tests && npm run test:regras` (sobe os emuladores num projeto `demo-`, precisa de Java 21+), `npm run test:unit` e `npm run test:e2e`. Se a porta 4173 estiver ocupada por um servidor antigo, rode o e2e com `E2E_PORT=4180`.

### Cabeçalhos de segurança (firebase.json)

- Valem já: `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` (sem câmera, microfone, localização), `X-Frame-Options: DENY` e um `Content-Security-Policy` só com `frame-ancestors`, `object-src` e `base-uri` (bloqueia o site dentro de iframe e plugins).
- A política completa (scripts, conexões, fontes…) vai como **`Content-Security-Policy-Report-Only`**: só avisa no console do navegador ("[Report Only] Refused to…"), não bloqueia nada. Use o site alguns dias (login, esteira, dashboard, PDF, backups, Asana). Sem avisos, troque o nome do cabeçalho para `Content-Security-Policy` nas duas entradas do `firebase.json` (junte com a política mínima).
- Os testes e2e aplicam os mesmos cabeçalhos e falham em qualquer violação de CSP.

### Proteções no Console (fora do código)

- **Restringir a API key:** Google Cloud Console → APIs e serviços → Credenciais → a chave "Browser key" → Restrições de aplicativo: **Referenciadores HTTP** `https://demproj-fdeac.web.app/*`, `https://demproj-fdeac.firebaseapp.com/*` (e `http://localhost:*/*` se usar local).
- **App Check (opcional, recomendado):**
  1. Console → App Check → registrar o app Web com **reCAPTCHA Enterprise** e copiar a chave do site para `appCheckSiteKey` no `firebase-config.js`.
  2. No `index.html`, logo antes de `<script src="app-check.js">`, incluir `<script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-app-check-compat.js"></script>` (a mesma versão dos outros SDKs). Os dois passos vão juntos: o SDK do App Check carregado sem ser ativado pode atrapalhar as chamadas ao Firestore.
  3. Publicar o site, acompanhar as métricas do App Check por alguns dias (requisições verificadas x não verificadas) e **só então** ativar a aplicação obrigatória (enforce) em Firestore, Storage e Functions.
  Sem a chave e o SDK, o `app-check.js` não faz nada.

- Cada **demanda** é um documento (limite **~1 MB por projeto**). Imagens grandes em base64 ainda podem estourar um único doc; use Storage no futuro.
- Edições simultâneas em **demandas diferentes** não se sobrescrevem mais (Vinicius e Matheus podem trabalhar juntos).
- O app exige **login com e-mail e senha** antes de abrir o painel. As regras do Firestore só liberam quem está no mapa de papéis do `meta`.
- As chaves do `firebase-config.js` são públicas no front-end; a proteção vem das **regras**, do **Authentication** e (se ligado) do **App Check**. Este arquivo (`*.md`) não é publicado no site.
