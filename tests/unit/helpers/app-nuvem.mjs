/**
 * Carrega o código real do navegador (supabase-persist.js e user-roles.js) num contexto isolado, falando com o banco
 * de teste como o usuário logado. O tempo real é simulado: o teste dispara o aviso quando quiser.
 */
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const pasta = (arquivo) => fileURLToPath(new URL(`../../../site/js/${arquivo}`, import.meta.url));

function tempoRealFalso() {
  const ouvintes = { demandas: [], sistema_meta: [] };
  const estado = { aoAssinar: null, removido: false };
  const canal = {
    on(_tipo, filtro, fn) {
      ouvintes[filtro.table].push(fn);
      return canal;
    },
    subscribe(fn) {
      estado.aoAssinar = fn;
      return canal;
    },
  };
  return {
    canal,
    estado,
    avisarDemanda: (evento) => ouvintes.demandas.forEach((fn) => fn(evento)),
    avisarMeta: () => ouvintes.sistema_meta.forEach((fn) => fn({})),
    conectar: () => estado.aoAssinar?.("SUBSCRIBED"),
    cair: () => estado.aoAssinar?.("CHANNEL_ERROR", new Error("caiu")),
  };
}

/** `aoDecorar` permite trocar partes do cliente (ex.: simular queda de rede). */
function carregarApp(clienteBanco, { email, copiaLocal = null, aoDecorar = (c) => c, armazem: armazemCompartilhado = null } = {}) {
  const tempoReal = tempoRealFalso();
  const armazem = armazemCompartilhado || new Map(copiaLocal ? [[`demandasProjetos_v1:${email}`, JSON.stringify(copiaLocal)]] : []);
  const saidaConsole = [];
  const registrar = (...partes) => saidaConsole.push(partes.map((p) => (p instanceof Error ? `${p.message} ${p.stack}` : typeof p === "string" ? p : JSON.stringify(p))).join(" "));
  const cliente = aoDecorar({
    ...clienteBanco,
    channel: () => tempoReal.canal,
    removeChannel: async () => {
      tempoReal.estado.removido = true;
    },
  });
  const contexto = {
    console: { log: registrar, info: registrar, warn: registrar, error: registrar, debug: registrar },
    setTimeout: (f, ms) => {
      const t = setTimeout(f, ms);
      t.unref?.();
      return t;
    },
    clearTimeout,
    Date,
    JSON,
    Promise,
    location: { protocol: "https:", hash: "" },
    localStorage: {
      getItem: (k) => (armazem.has(k) ? armazem.get(k) : null),
      setItem: (k, v) => armazem.set(k, String(v)),
      removeItem: (k) => armazem.delete(k),
      key: (i) => [...armazem.keys()][i] ?? null,
      get length() {
        return armazem.size;
      },
    },
  };
  contexto.window = contexto;
  contexto.DemandasAuth = {
    cliente: () => cliente,
    isConfigured: () => true,
    currentUser: () => ({ email }),
  };
  vm.createContext(contexto);
  vm.runInContext(fs.readFileSync(pasta("nucleo/log-seguro.js"), "utf8"), contexto);
  vm.runInContext(fs.readFileSync(pasta("usuarios/user-roles.js"), "utf8"), contexto);
  for (const arquivo of ["nuvem/consulta.js", "nuvem/copia-local.js", "nuvem/mesclagem.js", "nuvem/acessos.js"]) {
    vm.runInContext(fs.readFileSync(pasta(arquivo), "utf8"), contexto);
  }
  vm.runInContext(`${fs.readFileSync(pasta("nuvem/supabase-persist.js"), "utf8")}\nthis.DemandasNuvem = DemandasNuvem;`, contexto);
  return { DemandasNuvem: contexto.DemandasNuvem, DemandasRoles: contexto.DemandasRoles, tempoReal, armazem, contexto, cliente, saidaConsole };
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/** Espera a condição virar verdadeira (a releitura do tempo real é assíncrona e com atraso proposital). */
async function aguardar(condicao, { limite = 2000 } = {}) {
  const inicio = Date.now();
  while (Date.now() - inicio < limite) {
    if (await condicao()) return true;
    await esperar(15);
  }
  throw new Error("condição não aconteceu a tempo");
}

export { carregarApp, aguardar, esperar };
