# Desenvolvimento

Instalação e comandos estão no [README](../README.md). Tudo roda a partir da raiz do projeto. A exceção é `scripts/migracao-firebase/`, que tem dependências próprias porque é descartável e exige Node 22.

## Testes

| Pasta | O que prova | O que não prova |
|---|---|---|
| `tests/unit/` | Regras do banco em Postgres real (PGlite), trocando de papel para a RLS valer; código do navegador; biblioteca oficial do Supabase | Concorrência real: o PGlite tem uma conexão só |
| `tests/deno/` | Edge Functions no runtime real, com autenticação por JWT assinado | O banco: a rede até ele é simulada |
| `tests/e2e/` | Telas e ataques em navegador real, com a política de segurança (CSP) do `firebase.json` | Auth e PostgREST: são traduções simples, em `supabase-falso.js` |

Nenhum deles roda contra um projeto Supabase de verdade. Para isso existe o [teste no console](seguranca.md#o-teste-no-projeto-real).

## Publicar

| O que mudou | Como publicar |
|---|---|
| Site | Merge na `main`: o GitHub Actions publica sozinho |
| Banco | `npx supabase db push --remote` |
| Funções | `npx supabase functions deploy NOME --use-api` (`asana-webhook` e `backup-diario` levam também `--no-verify-jwt`) |
| Configuração do Auth | `npx supabase config push`: leia as diferenças antes de confirmar |

## Configuração

| O quê | Onde | Vai para o Git? |
|---|---|---|
| Endereço e chave **publicável** do Supabase | `site/js/nuvem/supabase-config.js` | Sim: são públicos por natureza |
| Todo o resto (chave secreta, token do Asana, segredo do backup) | `.env` na raiz (modelo em `.env.example`) | Não |

O site não tem build, então não lê o `.env`. Para rodar localmente, ele não é necessário. `npm run segredos` envia às Edge Functions só o que é delas.

## Mudanças comuns

**Novo arquivo no site.** Crie na pasta do assunto, em `site/js/`, e acrescente a tag `<script>` no `index.html`. A ordem importa, e o escopo é global: procure no projeto antes de criar um nome de função.

**Mudança no banco.** Crie uma migration nova em `supabase/migrations/`. Depois da virada, não edite uma que já foi aplicada. Toda função nova precisa de `revoke` explícito, porque o Supabase abre para a chave pública o que nasce em `public`. `tests/unit/seguranca.test.mjs` tem a lista exata do que pode ficar aberto e reprova o que escapar dela.

**Nova ação do servidor.** Acrescente em `ACOES`, em `supabase/functions/_shared/api.mjs`, conferindo o nível com `exigirNivel` antes de tudo.

**Mudança nas regras de acesso.** Altere os três lugares listados em [Arquitetura](arquitetura.md#papéis).

**Campo que só o servidor grava.** Acrescente em `demanda_campos_do_servidor`, no banco.

## Convenções

- **HTML:** todo dado passa por `escapeHtml`. Link vindo de dado salvo passa por `urlHttpsSegura`, porque o escape não barra `javascript:`.
- **Console:** só `site/js/nucleo/log-seguro.js` escreve nele. Use `DemandasLog.aviso(contexto, erro)` ou `DemandasLog.erro(contexto, erro)`. Um teste reprova qualquer `console.` fora desse arquivo.
- **Comentários:** explicam o porquê, não o quê.
- **Investigar um erro no próprio navegador:** `localStorage.setItem("demandas-debug", "1")` mostra o erro completo no console.
