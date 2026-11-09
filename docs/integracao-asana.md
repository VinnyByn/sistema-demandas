# Integração com o Asana

O sistema envia projetos à Operação como tarefas no Asana, e as duas pontas ficam sincronizadas.

## O que a integração faz

**Enviar à Operação.** No projeto, *Referências → Enviar à Operação* abre a escolha do projeto do Asana e as instruções. O sistema cria a tarefa lá.

**Comentários nos dois sentidos**, só em projetos já enviados:

| Onde foi escrito | O que acontece |
|---|---|
| No sistema | Aparece na tarefa como `Nome (pelo sistema): texto`. Editar e excluir também refletem lá |
| No Asana | Aparece no sistema com a etiqueta *via Asana*. Edição e exclusão também |

A caixa *Enviar ao Asana*, ao lado do campo de comentário, decide se ele vai também para a tarefa (etiqueta *↗ Asana*) ou fica só no sistema.

**Anexos.** A janela de envio e a *+ Nova ordem* têm o campo *Anexos* (PDF, Word, Excel, imagem, KMZ...), com até 10 MB por arquivo e 25 MB por envio. Depois do envio, *📎 Anexar ao Asana* manda mais arquivos. Eles vão direto para a tarefa, sem ficar no nosso banco, e o projeto ganha um comentário com o link.

**Nova ordem.** Só fica disponível depois que a tarefa atual é concluída no Asana, seja pela coluna "Concluído", seja marcada como concluída. Se for reaberta, trava de novo. A ordem atual vai para *Ordens anteriores* e continua recebendo os comentários feitos nela no Asana. Os novos comentários do sistema vão para a nova.

**Atividades do Asana viram comentário** (*via Asana*): arquivo anexado (com link), responsável definido ou removido, prazo alterado e outras mudanças. Ficam de fora mudança de coluna e conclusão, que têm aviso próprio, curtidas e o que o próprio sistema fez.

**Avisos** (alerta *Asana* no sino e comentário no projeto; somem com *Ciente*):

| No Asana | Aviso no sistema |
|---|---|
| Tarefa movida para coluna com "andamento" no nome | *Em andamento no Asana* |
| Coluna com "conclu" no nome, ou tarefa marcada como concluída | *Concluída no Asana*, uma vez por tarefa |
| Tarefa excluída | *Excluída no Asana*: a ordem é encerrada aqui e *Enviar à Operação* volta a aparecer |

## Configuração

**Projetos do Asana** (workspace `1211507547180510`). Mudar exige alterar os dois arquivos: `supabase/functions/_shared/asana/constantes.mjs` e `site/js/projeto/asana.js`.

| gid | Uso |
|---|---|
| `1211582012771845` | Projeto 1 |
| `1219543786224599` | Projeto 2 |

**Token.** Fica no `.env` da raiz, nunca no código nem no chat, e vai para o servidor com `npm run segredos`.

**Webhooks.** São criados sozinhos no primeiro envio de cada projeto do Asana. Quando os filtros mudam (`WEBHOOK_VERSAO`, em `constantes.mjs`), os antigos são recriados na próxima vez em que alguém abre *Enviar à Operação* ou envia uma demanda.

## Onde fica cada parte

| Parte | Onde |
|---|---|
| Regras | `supabase/functions/_shared/asana/` (recebem as dependências por parâmetro, para rodar nos testes sem rede) |
| Criar e cancelar tarefa | `tarefas.mjs` |
| Sistema → Asana: comentários e anexos | `comentarios.mjs`, `anexos.mjs` |
| Asana → sistema: tarefa e atividades | `eventos-tarefa.mjs`, `eventos-atividade.mjs` |
| Entrada do app | Função `api`, ações `asanaProjetos`, `createAsanaOperacao`, `cancelAsanaOperacao`, `asanaAnexar` e `asanaComentario` |
| Entrada do Asana | Função `asana-webhook`, sem login: quem autentica é a assinatura `X-Hook-Signature` |
| Tela | `site/js/projeto/asana.js` |

## Dados

| Onde | Conteúdo |
|---|---|
| `demandas.dados` | Vínculo com o Asana (`asanaTaskId`, `asanaTaskIds`, `asana`, `asanaAnteriores`, `asanaAviso`) e comentários (`comentarios`). Comentários vindos do Asana têm `origem: "asana"`; avisos da integração, `"integracao"` |
| `asana_story_vinculos` | Liga cada comentário do Asana ao do sistema |
| `asana_envios` | Trava contra enviar o mesmo comentário duas vezes |
| `asana_anexos` | Anexos que o próprio sistema mandou, para o webhook não os repetir |
| `asana_webhooks` | Segredo do webhook, por projeto |

As tabelas `asana_*` têm RLS ligada e nenhuma política, e as funções `asana_*` só executam para o servidor. Sem isso, quem tivesse a chave pública poderia ler o segredo do webhook e forjar avisos.

Todo o acesso passa por `repositorio-supabase.mjs`, e o comportamento esperado está em `tests/unit/repositorio-contrato.test.mjs`.
