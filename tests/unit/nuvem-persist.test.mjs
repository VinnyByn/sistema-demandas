// Código real do navegador (supabase-persist.js) contra o banco real de teste: salvar, tempo real, acessos e queda de rede.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { criarBancoDeTeste } from "./helpers/supabase-pglite.mjs";
import { carregarApp, aguardar, esperar } from "./helpers/app-nuvem.mjs";

const SEED = "vinicius.morais@soumaster.com.br";
const META = {
  diarias: [],
  projetistas: {},
  deletedDemandaIds: [],
  deletedDiariaIds: [],
  roles: { [SEED]: "admin", "bia@x.com": "projetista", "caio@x.com": "visibilidade" },
  disabledUsers: {},
  purgedUsers: {},
  userRegionals: { "bia@x.com": "Norte" },
  userDisplayNames: { "bia@x.com": "Bia" },
  userHomes: { "bia@x.com": { esteira: "b2b" } },
};

let banco;
let abertos = [];

before(async () => {
  banco = await criarBancoDeTeste();
});
after(async () => {
  await banco.db.close();
});
beforeEach(async () => {
  for (const a of abertos) a.DemandasNuvem.teardown();
  abertos = [];
  await banco.limpar();
  await banco.definirMeta(META);
});

async function abrir(email, opcoes = {}) {
  const app = carregarApp(await banco.clienteUsuario(email), { email, ...opcoes });
  abertos.push(app);
  app.dados = [];
  app.status = [];
  app.rolesChamado = 0;
  app.api = await app.DemandasNuvem.init({
    onData: (d) => app.dados.push(d),
    onStatus: (s) => app.status.push(s),
    onRoles: () => {
      app.rolesChamado += 1;
    },
  });
  app.ultimo = () => app.dados.at(-1);
  app.demanda = (id) => app.ultimo().demandas.find((d) => d.id === id);
  return app;
}

test("selo: sem cópia local vai direto a sincronizado; com cópia, mostra 'cópia do aparelho' até o servidor responder", async () => {
  await banco.semear([{ id: "p1", dados: { titulo: "Projeto 1", status: "novo" } }]);
  const sem = await abrir("bia@x.com");
  assert.deepEqual([...sem.status], ["connecting", "synced"]);
  assert.equal(sem.demanda("p1").titulo, "Projeto 1");

  const com = await abrir("bia@x.com", { copiaLocal: { demandas: [{ id: "antiga", titulo: "Só no aparelho" }] } });
  assert.deepEqual([...com.status], ["connecting", "cache", "synced"]);
  assert.equal(com.dados[0].demandas[0].id, "antiga", "abre na hora com a cópia do aparelho");
  assert.equal(com.demanda("antiga"), undefined, "o servidor manda: o que não existe lá sai");
});

test("salvar: não apaga o que só o servidor grava, limpa a presença e respeita a marca de apagar", async () => {
  await banco.semear([{ id: "p1", dados: { titulo: "T", alertaSnooze: "x", excluidoEm: "ontem", excluidoPor: "Ana", editingBy: { email: "a" }, editingAt: "b", asana: { taskId: "T1", url: "u", concluidaEm: "ontem" }, asanaTaskId: "T1" } }]);
  const { api, DemandasNuvem } = await abrir("bia@x.com");
  await api.upsertDemanda({ id: "p1", titulo: "Novo", updatedAt: "2026-11-06T10:00:00.000Z", asana: { taskId: "T1", url: "u2" }, excluidoEm: DemandasNuvem.APAGAR, excluidoPor: DemandasNuvem.APAGAR, __isMigrated: true, ignorar: undefined });
  const d = await banco.lerDemanda("p1");
  assert.equal(d.titulo, "Novo");
  assert.equal(d.asana.concluidaEm, "ontem", "o merge não apaga o que o app não conhece");
  assert.equal(d.asana.url, "u", "o vínculo com o Asana é do servidor: o que o app manda é ignorado");
  assert.equal(d.asanaTaskId, "T1", "o app nunca apaga o vínculo com o Asana");
  for (const campo of ["excluidoEm", "excluidoPor", "editingBy", "editingAt", "alertaSnooze", "__isMigrated", "id", "ignorar"]) assert.equal(campo in d, false, campo);
});

test("salvar sem vínculo não apaga o vínculo que o servidor acabou de gravar", async () => {
  await banco.semear([{ id: "p1", dados: { asana: { taskId: "T1" }, asanaTaskId: "T1" } }]);
  const { api } = await abrir("bia@x.com");
  await api.upsertDemanda({ id: "p1", titulo: "Sem saber do Asana" });
  const d = await banco.lerDemanda("p1");
  assert.deepEqual([d.asana.taskId, d.asanaTaskId, d.titulo], ["T1", "T1", "Sem saber do Asana"]);
  assert.ok(d.updatedAt, "toda gravação carimba updatedAt");
});

test("somente leitura: gravar é recusado com mensagem clara", async () => {
  await banco.semear([{ id: "p1", dados: { titulo: "T" } }]);
  const { api } = await abrir("caio@x.com");
  await assert.rejects(api.upsertDemanda({ id: "p1", titulo: "X" }), /Sem permissão/);
  assert.equal((await banco.lerDemanda("p1")).titulo, "T");
});

test("presença e exclusão", async () => {
  await banco.semear([{ id: "p1", dados: { titulo: "T" } }]);
  const { api, armazem } = await abrir("bia@x.com");
  await api.patchDemandaPresence("p1", { email: "bia@x.com", since: "agora" });
  assert.deepEqual((await banco.lerDemanda("p1")).editingBy, { email: "bia@x.com", since: "agora" });
  await api.patchDemandaPresence("p1", null);
  assert.equal("editingBy" in (await banco.lerDemanda("p1")), false);
  await api.deleteDemanda("p1");
  assert.equal(await banco.lerDemanda("p1"), undefined);
  assert.deepEqual((await banco.lerMeta()).deletedDemandaIds, ["p1"]);
  assert.ok(JSON.parse(armazem.get("demandasProjetos_v1:bia@x.com")).deletedDemandaIds.includes("p1"), "marca local impede a demanda de voltar");
});

test("tempo real: o aviso só diz o id; a linha é relida, mesmo sem o campo dados (aviso acima de 1 MB)", async () => {
  await banco.semear([{ id: "p1", dados: { titulo: "T", updatedAt: "2026-01-01T00:00:00Z" } }]);
  const app = await abrir("bia@x.com");
  await banco.db.query(`update public.demandas set dados = dados || '{"titulo": "Mudou", "updatedAt": "2026-06-01T00:00:00Z"}' where id = 'p1'`);
  app.tempoReal.avisarDemanda({ eventType: "UPDATE", new: { id: "p1" }, old: { id: "p1" } });
  await aguardar(() => app.demanda("p1")?.titulo === "Mudou");

  await banco.semear([{ id: "p2", dados: { titulo: "Nova" } }]);
  app.tempoReal.avisarDemanda({ eventType: "INSERT", new: { id: "p2", dados: null }, old: {} });
  await aguardar(() => app.demanda("p2")?.titulo === "Nova");

  await banco.db.query(`delete from public.demandas where id = 'p1'`);
  app.tempoReal.avisarDemanda({ eventType: "DELETE", new: {}, old: { id: "p1" } });
  await aguardar(() => !app.demanda("p1"));
  assert.ok(app.demanda("p2"));
});

test("tempo real: muitos avisos seguidos viram uma releitura só", async () => {
  await banco.semear([{ id: "p1", dados: { titulo: "T" } }, { id: "p2", dados: { titulo: "U" } }]);
  let leituras = 0;
  const app = await abrir("bia@x.com", {
    aoDecorar: (c) => ({
      ...c,
      from: (t) => {
        if (t === "demandas") leituras += 1;
        return c.from(t);
      },
    }),
  });
  const antes = leituras;
  for (let i = 0; i < 20; i++) app.tempoReal.avisarDemanda({ new: { id: i % 2 ? "p1" : "p2" }, old: {} });
  await esperar(300);
  assert.equal(leituras - antes, 1);
});

test("reconectar relê tudo: os avisos perdidos durante a queda não voltam sozinhos", async () => {
  await banco.semear([{ id: "p1", dados: { titulo: "T" } }]);
  const app = await abrir("bia@x.com");
  app.tempoReal.conectar(); // primeira assinatura, depois da carga: cobre o intervalo entre carregar e assinar
  await esperar(50);
  app.tempoReal.cair();
  assert.equal(app.status.at(-1), "cache");
  await banco.semear([{ id: "perdida", dados: { titulo: "Criada durante a queda" } }]);
  app.tempoReal.conectar();
  await aguardar(() => app.demanda("perdida"));
  assert.equal(app.status.at(-1), "synced");
});

test("meta: aviso relê diárias e acessos; outra pessoa removida perde o papel na hora", async () => {
  const app = await abrir("bia@x.com");
  await banco.definirMeta({ ...META, diarias: [{ id: "d1", updatedAt: "2026-11-06T10:00:00Z" }], roles: { [SEED]: "admin", "bia@x.com": "visibilidade" } });
  app.tempoReal.avisarMeta();
  await aguardar(() => app.ultimo().diarias.some((d) => d.id === "d1"));
  assert.equal(app.DemandasRoles.getRolesMap()["bia@x.com"], "visibilidade");
});

test("sem acesso: a leitura volta vazia e o app sabe que foi recusado (não é 'ainda carregando')", async () => {
  await banco.semear([{ id: "p1", dados: { titulo: "Segredo" } }]);
  const app = await abrir("estranho@x.com");
  assert.equal(app.api.acessoNegado(), true);
  assert.equal(app.api.acessosCarregados(), false);
  assert.ok(app.rolesChamado > 0, "avisa a tela para tirar a pessoa");
  assert.deepEqual([...app.ultimo().demandas], []);
});

test("com acesso: a lista veio do servidor e a pessoa não é barrada", async () => {
  const app = await abrir("bia@x.com");
  assert.equal(app.api.acessoNegado(), false);
  assert.equal(app.api.acessosCarregados(), true);
  assert.equal(app.DemandasRoles.getRolesMap()["caio@x.com"], "visibilidade");
});

test("mudar o papel de alguém mantém a tela inicial, regionais e nomes", async () => {
  const app = await abrir(SEED);
  await app.api.persistRoles({ ...app.DemandasRoles.getRolesMap(), "bia@x.com": "admin" });
  const meta = await banco.lerMeta();
  assert.equal(meta.roles["bia@x.com"], "admin");
  assert.deepEqual(meta.userHomes, META.userHomes);
  assert.deepEqual(meta.userRegionals, META.userRegionals);
  assert.deepEqual(meta.userDisplayNames, META.userDisplayNames);
});

test("remover alguém tira do mapa de verdade (não é merge), e quem não é admin não consegue", async () => {
  const app = await abrir(SEED);
  const semCaio = { ...app.DemandasRoles.getRolesMap() };
  delete semCaio["caio@x.com"];
  await app.api.persistRoles(semCaio);
  assert.equal((await banco.lerMeta()).roles["caio@x.com"], undefined);

  const bia = await abrir("bia@x.com");
  await assert.rejects(bia.api.persistRoles({ "bia@x.com": "admin" }), /Sem permissão/);
  assert.equal((await banco.lerMeta()).roles["bia@x.com"], "projetista");
});

test("versão sem o mapa de telas não apaga userHomes", async () => {
  const app = await abrir(SEED);
  app.DemandasRoles.getHomesMap = undefined;
  await app.api.persistRoles(app.DemandasRoles.getRolesMap());
  assert.deepEqual((await banco.lerMeta()).userHomes, META.userHomes);
});

test("sem a lista vinda do servidor, ninguém grava acessos (nem o admin principal)", async () => {
  const app = await abrir(SEED, {
    aoDecorar: (c) => ({
      ...c,
      from: (t) => (t === "sistema_meta" ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: "fora do ar", code: "500" } }) }) }) } : c.from(t)),
    }),
  });
  assert.equal(app.status.at(-1), "error");
  assert.equal(app.api.acessosCarregados(), false);
  await assert.rejects(app.api.persistRoles({ [SEED]: "admin" }), /ainda não carregou/);
  assert.deepEqual((await banco.lerMeta()).roles, META.roles, "a equipe continua");
});

test("banco novo: o administrador principal grava a si mesmo na primeira entrada; os demais não", async () => {
  await banco.definirMeta({ diarias: [], projetistas: {} });
  await abrir("estranho@x.com");
  assert.equal((await banco.lerMeta()).roles, undefined);
  const app = await abrir(SEED);
  assert.deepEqual((await banco.lerMeta()).roles, { [SEED]: "admin" });
  assert.equal(app.api.acessosCarregados(), true);
});

test("mais de uma página de demandas: carrega todas (o servidor corta em 1000 por resposta)", async () => {
  const valores = Array.from({ length: 2050 }, (_, i) => `('d${i}', '{"titulo": "T${i}"}'::jsonb)`).join(",");
  await banco.db.exec(`insert into public.demandas (id, dados) values ${valores}`);
  const app = await abrir("bia@x.com");
  assert.equal(app.ultimo().demandas.length, 2050);
});

test("diárias, metas e histórico de acessos", async () => {
  const bia = await abrir("bia@x.com");
  await bia.api.persistMeta({ diarias: [{ id: "x" }], projetistas: { Ana: { ativo: true } }, deletedDiariaIds: ["y"] });
  await bia.api.persistMetaFields({ metasEtapa: { operacional: { novo: 3 } }, ignorado: 1 });
  await bia.api.persistMetaFields({ filtrosSalvos: { "bia@x.com": { a: 1 } } });
  const meta = await banco.lerMeta();
  assert.deepEqual(meta.diarias, [{ id: "x" }]);
  assert.deepEqual(meta.metasEtapa, { operacional: { novo: 3 } });
  assert.deepEqual(meta.filtrosSalvos, { "bia@x.com": { a: 1 } });
  assert.equal(meta.ignorado, undefined);

  const admin = await abrir(SEED);
  await admin.api.appendAccessHistory([{ alvo: "bia@x.com", acao: "papel", de: "A", para: "B" }, { alvo: "caio@x.com", acao: "desabilitado" }, { acao: "sem alvo" }]);
  const hist = await admin.api.loadAccessHistory(10);
  assert.equal(hist.length, 2);
  assert.match(hist[0].em, /^\d{4}-\d{2}-\d{2}T.*Z$/);
  assert.equal(hist[0].por, SEED);
  assert.equal(hist.find((h) => h.acao === "desabilitado").de, undefined, "campo vazio some, como a tela espera");
});

test("sem rede: a alteração fica guardada no aparelho e é enviada ao reconectar", async () => {
  await banco.semear([{ id: "p1", dados: { titulo: "T" } }]);
  let foraDoAr = false;
  const app = await abrir("bia@x.com", {
    aoDecorar: (c) => ({
      ...c,
      rpc: (nome, args) => (foraDoAr ? Promise.resolve({ data: null, error: { message: "TypeError: Failed to fetch" } }) : c.rpc(nome, args)),
    }),
  });
  foraDoAr = true;
  await assert.rejects(app.api.upsertDemanda({ id: "p1", titulo: "Offline", excluidoEm: app.DemandasNuvem.APAGAR }), /guardada neste aparelho/);
  assert.equal(app.status.at(-1), "cache");
  assert.equal((await banco.lerDemanda("p1")).titulo, "T");
  assert.ok(app.armazem.has("demandasProjetos_pendentes_v1:bia@x.com"));

  foraDoAr = false;
  app.tempoReal.conectar();
  app.tempoReal.conectar();
  await aguardar(async () => (await banco.lerDemanda("p1")).titulo === "Offline");
  assert.equal(app.armazem.has("demandasProjetos_pendentes_v1:bia@x.com"), false, "fila vazia depois de enviar");
});

test("erro que não é de rede não entra na fila: seria reenviado para sempre", async () => {
  const app = await abrir("caio@x.com");
  await assert.rejects(app.api.upsertDemanda({ id: "p1", titulo: "X" }), /Sem permissão/);
  assert.equal(app.armazem.has("demandasProjetos_pendentes_v1:caio@x.com"), false);
});

test("mesmo navegador, outra pessoa: as alterações guardadas de quem saiu não são enviadas em nome de quem entrou", async () => {
  await banco.semear([{ id: "p1", dados: { titulo: "Original" } }]);
  const armazem = new Map();
  let foraDoAr = true;
  const primeira = await abrir("bia@x.com", {
    armazem,
    aoDecorar: (c) => ({ ...c, rpc: (n, a) => (foraDoAr ? Promise.resolve({ data: null, error: { message: "Failed to fetch" } }) : c.rpc(n, a)) }),
  });
  await assert.rejects(primeira.api.upsertDemanda({ id: "p1", titulo: "Da Bia, offline" }), /guardada neste aparelho/);
  primeira.DemandasNuvem.teardown();
  foraDoAr = false;

  await abrir(SEED, { armazem });
  assert.equal((await banco.lerDemanda("p1")).titulo, "Original", "não saiu em nome de quem entrou depois");
  assert.ok(armazem.has("demandasProjetos_pendentes_v1:bia@x.com"), "continua guardado para quando ela voltar");

  await abrir("bia@x.com", { armazem });
  assert.equal((await banco.lerDemanda("p1")).titulo, "Da Bia, offline");
  assert.equal(armazem.has("demandasProjetos_pendentes_v1:bia@x.com"), false);
});

test("sair: para de ouvir e esquece o estado", async () => {
  const app = await abrir("bia@x.com");
  app.DemandasNuvem.teardown();
  assert.equal(app.tempoReal.estado.removido, true);
  const n = app.dados.length;
  app.tempoReal.avisarDemanda({ new: { id: "p1" }, old: {} });
  await esperar(250);
  assert.equal(app.dados.length, n);
});
