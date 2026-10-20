# Integração com o Asana

Substitui a integração com o ClickUp. Faz duas coisas:

1. **Enviar à Operação**: no projeto, *Referências → Enviar à Operação* abre a escolha do projeto do Asana
   (um dos dois abaixo) e as instruções; a função `createAsanaOperacao` cria a tarefa lá.
2. **Comentários nos dois sentidos** (só em projetos já enviados):
   - digitado no sistema → aparece na tarefa do Asana como `Nome (pelo sistema): texto`
     (editar e excluir também refletem lá) — função `asanaComentario`;
   - feito no Asana → aparece no sistema com a etiqueta *via Asana* (edição e exclusão também) —
     webhook `asanaWebhook`, criado sozinho no primeiro envio de cada projeto do Asana.

**Anexos:** na janela de envio (e na *+ Nova ordem*) há o campo *Anexos* — PDF, Word, Excel, imagem, KMZ…
até 10 MB cada e 25 MB por envio. Depois do envio, *📎 Anexar ao Asana* manda mais arquivos. Os arquivos
passam pela função `asanaAnexar` direto para a tarefa no Asana (não ficam no Firebase) e o projeto ganha
um comentário com o link.

**Marcar o que vai para o Asana:** em projeto já enviado, a caixa *Enviar ao Asana* ao lado do campo de
comentário decide se ele vai também para a tarefa (etiqueta *↗ Asana*) ou fica só no sistema (*só no sistema*).

**Nova ordem:** com uma tarefa já criada, *+ Nova ordem* abre outra tarefa (ex.: a anterior foi fechada e
precisa de retrabalho). A atual fica em *Ordens anteriores* e continua recebendo comentários feitos nela no
Asana; os novos comentários do sistema vão para a nova (campos `asanaAnteriores` e `asanaTaskIds`).

**Atividades do Asana viram comentário** (*via Asana*): imagem/arquivo anexado (com link), responsável
definido/removido, prazo alterado e outras mudanças. Ficam de fora: mudança de coluna e conclusão (já têm
aviso próprio), curtidas e o que o próprio sistema fez.

**Avisos do Asana** (alerta *Asana* no sino + comentário no projeto; some com *Ciente*):
- tarefa movida para uma coluna com "andamento" no nome → *Em andamento no Asana*;
- coluna com "conclu" no nome ou tarefa marcada como concluída → *Concluída no Asana* (uma vez por tarefa);
- tarefa excluída no Asana → *Excluída no Asana*: a ordem é encerrada aqui (vai para *Ordens anteriores*)
  e o botão *Enviar à Operação* volta a aparecer.

Os webhooks antigos (só comentários) são recriados sozinhos com os filtros novos quando alguém abre a
janela *Enviar à Operação* ou envia uma demanda.

Projetos do Asana (workspace `1211507547180510`), em `functions/asana.js` e `demandas-projetos/js/07-asana.js`:

| gid | uso |
|---|---|
| `1211582012771845` | projeto 1 |
| `1219543786224599` | projeto 2 |

## Publicar as funções

```bash
# token do Asana (uma vez; nunca coloque o token no código nem no chat)
firebase functions:secrets:set ASANA_TOKEN

firebase deploy --only functions
```

O deploy remove as funções antigas do ClickUp (`createClickupOperacao`, `cancelClickupOperacao`,
`clickupWebhook`) — confirme com **y** quando o Firebase perguntar. Depois dá para apagar o segredo
antigo: `firebase functions:secrets:destroy CLICKUP_TOKEN`.

## Dados

- Na demanda: `asanaTaskId` e `asana` (`taskId`, `url`, `projetoGid`, `projetoNome`, …), gravados só pelo servidor.
- Comentários vindos do Asana têm `origem: "asana"`; avisos da integração, `origem: "integracao"`.
- Coleções só do servidor (as regras do Firestore negam o app): `asanaStories`, `asanaComentarios`,
  `asanaIntegracao/webhooks` (segredo do webhook para conferir a assinatura `X-Hook-Signature`).
