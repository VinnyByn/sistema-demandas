// Selo de sincronização: depois de abrir pela cópia do aparelho, precisa virar "synced" quando o servidor
// confirma — mesmo sem nenhuma mudança nos dados (Firestore simulado).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function montarFirestoreFalso() {
  const ouvintes = [];
  const meta = { exists: true, data: () => ({ diarias: [], projetistas: {} }) };
  const docsDemandas = [{ id: "p1", data: () => ({ titulo: "Projeto 1", status: "novo" }) }];
  const ref = (alvo) => ({
    onSnapshot(a, b, c) {
      const comMeta = typeof a === "object" && a?.includeMetadataChanges === true;
      const o = { alvo, comMeta, next: comMeta ? b : a };
      ouvintes.push(o);
      return () => ouvintes.splice(ouvintes.indexOf(o), 1);
    },
    get: async () => meta,
    set: async () => {},
    doc: () => ref("meta"),
  });
  const snap = (alvo, fromCache) =>
    alvo === "meta"
      ? { ...meta, metadata: { fromCache } }
      : { empty: false, metadata: { fromCache }, forEach: (fn) => docsDemandas.forEach(fn) };
  return {
    db: { settings() {}, enablePersistence: async () => {}, collection: (nome) => ref(nome === "demandas" ? "demandas" : "sistema") },
    // Firestore só avisa listeners comuns quando os dados mudam; os com includeMetadataChanges também na troca de origem.
    emitir(fromCache, { soMetadados = false } = {}) {
      for (const o of [...ouvintes]) if (!soMetadados || o.comMeta) o.next(snap(o.alvo, fromCache));
    },
  };
}

function carregar(fs_) {
  const usuario = { email: "a@b.com" };
  const contexto = {
    console: { ...console, info() {}, warn() {} },
    setTimeout: (f, ms) => setTimeout(f, ms).unref(),
    clearTimeout,
    location: { protocol: "https:" },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    firebase: {
      apps: [1],
      app: () => ({}),
      auth: () => ({ currentUser: usuario }),
      firestore: Object.assign(() => fs_.db, { FieldValue: { serverTimestamp: () => 0, delete: () => null } }),
    },
  };
  contexto.window = contexto;
  contexto.window.FIREBASE_CONFIG = { apiKey: "x", projectId: "y" };
  vm.createContext(contexto);
  const src = fs.readFileSync(path.join(__dirname, "../../demandas-projetos/firebase-persist.js"), "utf8");
  vm.runInContext(src + "\nthis.DemandasFirebase = DemandasFirebase;", contexto);
  return contexto.DemandasFirebase;
}

test("selo sai de 'cópia do aparelho' quando o servidor confirma os mesmos dados", async () => {
  const fs_ = montarFirestoreFalso();
  const DemandasFirebase = carregar(fs_);
  const status = [];
  await DemandasFirebase.init({ onData() {}, onStatus: (s) => status.push(s) });
  fs_.emitir(true);
  assert.equal(status.at(-1), "cache");
  fs_.emitir(false, { soMetadados: true });
  assert.equal(status.at(-1), "synced");
  DemandasFirebase.teardown();
});
