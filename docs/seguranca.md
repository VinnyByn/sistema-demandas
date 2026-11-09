# Segurança

Quem decide o acesso é o banco. O que roda no navegador só organiza a tela: alterar variáveis pelo console muda o que aparece, nunca o que o servidor aceita.

## O que é recusado

| Tentativa pelo console | Resultado |
|---|---|
| Visitante com a chave pública lê ou grava qualquer coisa | Recusado |
| Criar conta pelo navegador | Recusado. Conta só nasce por `criarContaLogin`, de admin, e nasce sem papel |
| Quem não é admin alterar papéis, por qualquer função ou direto na tabela | Recusado |
| Mudar os metadados da própria conta ou forjar o e-mail no token | Sem efeito: a identidade vem de `auth.users`, pelo id |
| Conta sem papel descobrir quem é o administrador principal | Recusado |
| Conta apagada, bloqueada ou sem confirmar usar o token que ainda tem | Recusado na hora |
| Gravar HTML num campo para rodar no navegador do admin | Escapado na tela e barrado pela CSP do `firebase.json` |
| Apontar a demanda para uma tarefa de outra área e cancelar | `demanda_salvar` ignora o campo, e o token do Asana não é usado |

## O console

Só `site/js/nucleo/log-seguro.js` escreve nele, com o contexto e o código do erro, nunca a mensagem nem os dados.

Duas coisas ficam fora do controle do app ou do navegador do usuário:
- As mensagens do próprio navegador, como um `403` numa chamada, com o endereço dela, não podem ser desligadas.
- O log das Edge Functions fica no painel do Supabase, visível só para quem administra o projeto.

## O aparelho

A cópia local é por pessoa e some ao sair, ao perder o acesso e quando outra pessoa entra. Sair recarrega a página, para limpar também a memória. A cópia e o IndexedDB da versão Firebase são apagados no primeiro uso.

Ficam no navegador apenas as preferências de tela, a marca de menções lidas e as alterações feitas sem internet que ainda não foram enviadas.

## O que não é garantido

**O que a conta pode ler fica visível para ela.** O navegador precisa receber o que a tela mostra. Quem tem acesso vê, no DevTools (aba *Network* e memória), tudo o que a conta pode ler, inclusive a lista da equipe e os papéis em `sistema_meta`. Ofuscar isso não seria proteção.

**Autoria de comentários.** Os comentários, o histórico de edição e o nome do autor são gravados pelo navegador. Pelo console, um projetista consegue alterar o comentário de outra pessoa ou assinar com outro nome. Isso não dá acesso a nada novo, mas esses registros não servem como prova de autoria. O histórico de acessos, ao contrário, é gravado pelo banco, em nome de quem está logado.

**CSP e projetos do Supabase.** `connect-src` aceita qualquer projeto em `*.supabase.co`. Isso só importaria se um script estranho rodasse, e é justamente o que o resto da CSP bloqueia.

## O teste no projeto real

Os testes do repositório não alcançam o Supabase hospedado. No passo 5 da [virada](migracao-supabase.md), ainda com a equipe fora do sistema:

1. Abra o site e entre com uma conta de **projetista**.
2. Abra o console (F12). No Chrome, digite antes `allow pasting`.
3. Cole o conteúdo de `scripts/seguranca/teste-no-console.js` e tecle Enter.

Ele confere o cadastro fechado, a chave pública, as funções e as promoções, sem alterar dados quando as regras estão certas. Com qualquer linha `FALHOU`, corrija antes de liberar o sistema.

## Onde estão os testes

| Arquivo | O que ataca |
|---|---|
| `tests/unit/seguranca.test.mjs` | Banco, servidor e dados no aparelho |
| `tests/e2e/ataque-console.spec.js` | Comandos de console em navegador real, por perfil |
| `tests/e2e/seguranca.spec.js` | HTML gravado nos campos e bloqueios da CSP |
| `tests/unit/acesso.test.mjs` | As três cópias da regra de acesso, comparadas |
