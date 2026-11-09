# Sistema de Demandas

Gestão dos projetos da equipe: esteira, janela do projeto, dashboards e integração com o Asana.

O site é estático e fica no Firebase Hosting (`demproj-fdeac.web.app`). Banco, login, funções do servidor e backups ficam no Supabase.

> **Situação:** o código já usa só o Supabase, mas a virada em produção ainda não foi feita. Um merge na `main` publica o site, então ele só pode acontecer no passo 4 do [roteiro da virada](docs/migracao-supabase.md).

## Começar

Requer Node 20 ou mais novo.

```bash
npm ci
npx playwright install chromium   # só na primeira vez, para os testes de tela
npm start                         # abre o site em http://localhost:4173/index.html
```

Sem o Supabase configurado, o site abre em modo local: os dados ficam só no navegador.

## Comandos

| Comando | O que faz |
|---|---|
| `npm start` | Serve o site localmente, com os mesmos cabeçalhos de segurança da hospedagem |
| `npm run segredos` | Envia às Edge Functions os segredos do `.env` |
| `npm test` | Roda todos os testes |
| `npm run test:unit` | Regras, banco de teste e código do navegador |
| `npm run test:deno` | Edge Functions no Deno |
| `npm run test:e2e` | Telas no navegador, incluindo ataques pelo console |

## Pastas

```
site/                     O que vai para a hospedagem
  index.html              Página única; define a ordem de carga dos scripts
  css/  img/
  js/
    nucleo/               Início do app, estado, formatos e interface comum
    nuvem/                Tudo que fala com o Supabase (configuração, login, dados)
    usuarios/             Login, papéis, presença e aba Usuários
    esteira/              Quadro, cartões, filtros e metas
    projeto/              Janela do projeto: checklist, comentários, custo, Asana, lixeira
    dashboard/            Indicadores e gráficos
    importacao/           Importar CSV e PDF, exportar

supabase/                 Servidor
  migrations/             Banco: tabelas, regras de acesso e funções SQL
  functions/              Edge Functions: api, asana-webhook e backup-diario
    _shared/              Código comum às funções (a integração fica em asana/)
  templates/              E-mails
  config.toml

scripts/
  migracao-firebase/      Copia os dados do Firebase (uso único, com dependências próprias)
  seguranca/              Teste para colar no console, no projeto real

tests/
  unit/                   Regras, banco de teste e código do navegador
  deno/                   Edge Functions no runtime real
  e2e/                    Telas no navegador

docs/                     Documentação
```

## Documentação

| Documento | Para quê |
|---|---|
| [Arquitetura](docs/arquitetura.md) | Como as peças se encaixam, e por que são assim |
| [Desenvolvimento](docs/desenvolvimento.md) | Rodar, testar, publicar e fazer as mudanças mais comuns |
| [Segurança](docs/seguranca.md) | O que é garantido, o que não é, e como testar no projeto real |
| [Virada para o Supabase](docs/migracao-supabase.md) | Passo a passo para colocar em produção |
| [Integração com o Asana](docs/integracao-asana.md) | O que a integração faz e onde fica cada parte |
