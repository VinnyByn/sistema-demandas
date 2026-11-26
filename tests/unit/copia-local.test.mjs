// Cópia local no navegador: quando os dados passam do limite do armazenamento, a cópia velha sai do caminho.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

function carregar({ email, configurado, limite }) {
  const armazem = new Map();
  const tamanho = () => [...armazem.values()].reduce((s, v) => s + v.length, 0);
  const localStorage = {
    getItem: (k) => (armazem.has(k) ? armazem.get(k) : null),
    setItem: (k, v) => {
      const antes = armazem.get(k)?.length || 0;
      if (tamanho() - antes + String(v).length > limite) throw Object.assign(new Error("exceeded the quota"), { name: "QuotaExceededError" });
      armazem.set(k, String(v));
    },
    removeItem: (k) => armazem.delete(k),
    key: (i) => [...armazem.keys()][i] ?? null,
    get length() {
      return armazem.size;
    },
  };
  const avisos = [];
  const contexto = vm.createContext({
    localStorage,
    DemandasAuth: { currentUser: () => (email ? { email } : null), isConfigured: () => configurado },
    DemandasLog: { aviso: (o) => avisos.push(o) },
  });
  const codigo = fs.readFileSync(fileURLToPath(new URL("../../site/js/nuvem/copia-local.js", import.meta.url)), "utf8");
  vm.runInContext(`${codigo}\nthis.DemandasCopiaLocal = DemandasCopiaLocal;`, contexto);
  return { copia: contexto.DemandasCopiaLocal, armazem, avisos };
}

test("com a nuvem: cópia grande demais apaga a cópia velha e deixa espaço para as alterações sem conexão", () => {
  const { copia, armazem, avisos } = carregar({ email: "bia@x.com", configurado: true, limite: 300 });
  copia.salvar({ demandas: [{ id: "a", titulo: "pequeno" }] });
  assert.ok(armazem.has("demandasProjetos_v1:bia@x.com"));
  copia.salvar({ demandas: [{ id: "a", titulo: "x".repeat(400) }] });
  assert.equal(armazem.has("demandasProjetos_v1:bia@x.com"), false, "a cópia velha saiu");
  assert.equal(avisos.length, 1);
  assert.equal(copia.carregar(), null);
});

test("sem nuvem (uso local): a cópia é a única fonte e nunca é apagada por falta de espaço", () => {
  const { copia, armazem } = carregar({ email: "", configurado: false, limite: 300 });
  copia.salvar({ demandas: [{ id: "a", titulo: "pequeno" }] });
  copia.salvar({ demandas: [{ id: "a", titulo: "x".repeat(400) }] });
  assert.ok(armazem.has("demandasProjetos_v1"), "a cópia anterior continua");
  assert.equal(copia.carregar().demandas[0].titulo, "pequeno");
});
