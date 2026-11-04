// Gravação dos acessos no doc meta (Firestore simulado): mudar um papel não pode apagar as telas
// iniciais (userHomes) nem os outros mapas.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const META_INICIAL = {
  diarias: [],
  projetistas: {},
  roles: { "vinicius.morais@soumaster.com.br": "admin", "bia@x.com": "projetista", "caio@x.com": "projetista" },
  disabledUsers: {},
  purgedUsers: {},
  userRegionals: { "bia@x.com": "Norte" },
  userDisplayNames: { "bia@x.com": "Bia" },
  userHomes: { "bia@x.com": { esteira: "b2b" } },
};

function montar({ falharLeitura = false } = {}) {
  const atualizacoes = [];
  let meta = structuredClone(META_INICIAL);
  const ouvintes = [];
  const ref = (nome) => ({
    onSnapshot(a, b) {
      const fn = typeof a === "function" ? a : b;
      if (nome === "meta") ouvintes.push(fn);
      return () => {};
    },
    get: async () => {
      if (falharLeitura) throw Object.assign(new Error("deadline-exceeded"), { code: "deadline-exceeded" });
      return { exists: true, data: () => structuredClone(meta), metadata: { fromCache: false } };
    },
    set: async () => {},
    update: async (dados) => {
      atualizacoes.push(dados);
      for (const [k, v] of Object.entries(dados)) if (!k.includes(".")) meta[k] = structuredClone(v);
    },
    doc: (id) => ref(id),
  });
  const db = {
    settings() {},
    enablePersistence: async () => {},
    collection: (nome) => (nome === "demandas" ? { onSnapshot: () => () => {}, doc: () => ref("demanda") } : ref("sistema")),
  };
  const contexto = {
    console: { ...console, info() {}, warn() {} },
    setTimeout: (f, ms) => setTimeout(f, ms).unref(),
    clearTimeout,
    location: { protocol: "https:" },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    firebase: {
      apps: [1],
      app: () => ({}),
      auth: () => ({ currentUser: { email: "vinicius.morais@soumaster.com.br" } }),
      firestore: Object.assign(() => db, { FieldValue: { serverTimestamp: () => 0, delete: () => "APAGAR" } }),
    },
  };
  contexto.window = contexto;
  contexto.window.FIREBASE_CONFIG = { apiKey: "x", projectId: "y" };
  vm.createContext(contexto);
  const raiz = path.join(__dirname, "../../demandas-projetos");
  vm.runInContext(fs.readFileSync(path.join(raiz, "user-roles.js"), "utf8"), contexto);
  vm.runInContext(
    fs.readFileSync(path.join(raiz, "firebase-persist.js"), "utf8") + "\nthis.DemandasFirebase = DemandasFirebase;",
    contexto,
  );
  const emitirMeta = () => ouvintes.forEach((fn) => fn({ exists: true, data: () => structuredClone(meta), metadata: { fromCache: false } }));
  return { contexto, atualizacoes, emitirMeta };
}

test("mudar o papel de alguém mantém a tela inicial (userHomes), regionais e nomes", async () => {
  const { contexto, atualizacoes, emitirMeta } = montar();
  const api = await contexto.DemandasFirebase.init({ onData() {}, onStatus() {} });
  emitirMeta();
  assert.equal(contexto.DemandasRoles.homeEsteiraForEmail("bia@x.com"), "b2b", "tela inicial veio do meta");

  await api.persistRoles({ ...contexto.DemandasRoles.getRolesMap(), "caio@x.com": "visibilidade" });
  const gravado = atualizacoes.find((u) => u.roles);
  assert.ok(gravado, "gravou os acessos");
  assert.equal(gravado.roles["caio@x.com"], "visibilidade");
  assert.deepEqual(JSON.parse(JSON.stringify(gravado.userHomes)), { "bia@x.com": { esteira: "b2b" } });
  assert.deepEqual(JSON.parse(JSON.stringify(gravado.userRegionals)), { "bia@x.com": "Norte" });
  assert.deepEqual(JSON.parse(JSON.stringify(gravado.userDisplayNames)), { "bia@x.com": "Bia" });
  assert.equal(contexto.DemandasRoles.homeEsteiraForEmail("bia@x.com"), "b2b", "continua depois de gravar");
  contexto.DemandasFirebase.teardown();
});

test("versão sem o mapa de telas (DemandasRoles antigo) não apaga userHomes", async () => {
  const { contexto, atualizacoes, emitirMeta } = montar();
  delete contexto.DemandasRoles.getHomesMap;
  const api = await contexto.DemandasFirebase.init({ onData() {}, onStatus() {} });
  emitirMeta();
  await api.persistRoles({ ...contexto.DemandasRoles.getRolesMap(), "caio@x.com": "admin" });
  const gravado = atualizacoes.find((u) => u.roles);
  assert.equal("userHomes" in gravado, false, "sem o mapa, nem toca no campo");
  contexto.DemandasFirebase.teardown();
});

test("sem a lista vinda do servidor, ninguém grava acessos (nem o admin principal)", async () => {
  const { contexto, atualizacoes } = montar({ falharLeitura: true });
  const api = await contexto.DemandasFirebase.init({ onData() {}, onStatus() {} });
  assert.equal(api.acessosCarregados(), false);
  // A leitura do meta falhou: o init (logado como admin principal) não pode "completar" o mapa.
  assert.equal(atualizacoes.filter((u) => u.roles).length, 0, "init não gravou papéis");
  // O mapa local só tem o admin principal; gravar isso apagaria a equipe.
  await assert.rejects(api.persistRoles(contexto.DemandasRoles.getRolesMap()), /ainda não carregou/);
  assert.equal(atualizacoes.filter((u) => u.roles).length, 0, "persistRoles não gravou");
  contexto.DemandasFirebase.teardown();
});
