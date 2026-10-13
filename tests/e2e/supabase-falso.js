// Supabase falso, em memória, para os testes no navegador.
// Imita o pedaço do supabase-js que o app usa (auth, tabelas, funções SQL, tempo real,
// Storage e Edge Functions), com as mesmas regras de acesso da migração SQL.
(function () {
  const ADMIN = "vinicius.morais@soumaster.com.br";
  const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
  const agora = () => new Date().toISOString();

  const tabelas = {
    demandas: new Map(),
    sistema_meta: new Map([
      ["meta", { id: "meta", diarias: [], projetistas: {}, deleted_demanda_ids: [], deleted_diaria_ids: [], metas_etapa: {}, filtros_salvos: {} }],
    ]),
    perfis: new Map(),
    arquivos: new Map(),
  };
  const usuarios = new Map();
  const objetos = new Map();
  const canais = new Set();
  const ouvintesAuth = new Set();
  let sessao = null;
  let seq = 0;

  function perfil(email = sessao?.user?.email) {
    const p = tabelas.perfis.get(String(email || "").toLowerCase());
    return p && !p.desabilitado && !p.removido ? p : null;
  }
  const ativo = () => !!perfil();
  const escreve = () => ["admin", "projetista"].includes(perfil()?.papel);
  const admin = () => sessao?.user?.email === ADMIN || perfil()?.papel === "admin";
  const negado = (msg = "new row violates row-level security policy") => ({ data: null, error: { code: "42501", message: msg } });

  function podeLer(tabela, linha) {
    if (tabela === "perfis") return ativo() || linha.email === sessao?.user?.email;
    return ativo();
  }

  function avisar(tabela, eventType, novo, velho) {
    setTimeout(() => {
      for (const c of canais) c._emitir(tabela, { eventType, new: clone(novo) || {}, old: clone(velho) || {} });
    }, 10);
  }

  function gravar(tabela, chave, linha, evento) {
    const velho = tabelas[tabela].get(chave);
    tabelas[tabela].set(chave, linha);
    avisar(tabela, evento || (velho ? "UPDATE" : "INSERT"), linha, velho ? { id: velho.id } : {});
  }

  function mesclar(a, b) {
    if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
      const out = { ...a };
      for (const k of Object.keys(b)) out[k] = k in a ? mesclar(a[k], b[k]) : b[k];
      return out;
    }
    return b;
  }

  const chaveDe = (tabela, linha) => (tabela === "perfis" ? linha.email : linha.id);

  class Consulta {
    constructor(tabela) {
      this.tabela = tabela;
      this.filtros = [];
      this.acao = "select";
      this.faixa = null;
      this.ordem = null;
      this.um = null;
    }
    select() {
      if (this.acao !== "select") this.devolver = true;
      return this;
    }
    eq(c, v) {
      this.filtros.push((l) => l[c] === v);
      return this;
    }
    in(c, vs) {
      this.filtros.push((l) => vs.includes(l[c]));
      return this;
    }
    order(c, o = {}) {
      this.ordem = { c, asc: o.ascending !== false };
      return this;
    }
    range(a, b) {
      this.faixa = [a, b];
      return this;
    }
    maybeSingle() {
      this.um = "talvez";
      return this;
    }
    single() {
      this.um = "um";
      return this;
    }
    update(v) {
      this.acao = "update";
      this.valor = v;
      return this;
    }
    insert(v) {
      this.acao = "insert";
      this.valor = v;
      return this;
    }
    delete() {
      this.acao = "delete";
      return this;
    }
    then(ok, falha) {
      return Promise.resolve()
        .then(() => this.executar())
        .then(ok, falha);
    }
    linhas() {
      let ls = [...tabelas[this.tabela].values()].filter((l) => podeLer(this.tabela, l));
      for (const f of this.filtros) ls = ls.filter(f);
      return ls;
    }
    executar() {
      if (!sessao) return negado();
      const t = this.tabela;
      if (this.acao === "insert") {
        if (t !== "arquivos" || !escreve()) return negado();
        const l = { id: `arq-${++seq}`, criado_por: sessao.user.email, criado_em: agora(), levantamento: false, ...clone(this.valor) };
        if (l.criado_por !== sessao.user.email) return negado();
        if (!tabelas.demandas.has(l.demanda_id)) return { data: null, error: { code: "23503", message: "violates foreign key constraint" } };
        gravar(t, l.id, l, "INSERT");
        return { data: clone(l), error: null };
      }
      if (this.acao === "update") {
        if (!escreve() || t === "perfis") return negado();
        const ls = this.linhas();
        for (const l of ls) gravar(t, chaveDe(t, l), { ...l, ...clone(this.valor) }, "UPDATE");
        return { data: null, error: null };
      }
      if (this.acao === "delete") {
        if (!escreve()) return negado();
        for (const l of this.linhas()) {
          tabelas[t].delete(chaveDe(t, l));
          avisar(t, "DELETE", null, { id: l.id });
        }
        return { data: null, error: null };
      }
      let ls = this.linhas();
      if (this.ordem) {
        const { c, asc } = this.ordem;
        ls.sort((a, b) => (a[c] < b[c] ? -1 : a[c] > b[c] ? 1 : 0) * (asc ? 1 : -1));
      }
      if (this.faixa) ls = ls.slice(this.faixa[0], this.faixa[1] + 1);
      if (this.um) {
        if (!ls.length && this.um === "um") return { data: null, error: { code: "PGRST116", message: "0 rows" } };
        return { data: clone(ls[0] || null), error: null };
      }
      return { data: clone(ls), error: null };
    }
  }

  const rpcs = {
    salvar_demanda({ p_id, p_dados, p_remover }) {
      if (!escreve()) return negado();
      const velho = tabelas.demandas.get(p_id);
      const dados = { ...(velho?.dados || {}), ...clone(p_dados) };
      for (const k of p_remover || []) delete dados[k];
      delete dados.id;
      gravar("demandas", p_id, { id: p_id, dados, editing_by: null, editing_at: null });
      return { data: null, error: null };
    },
    marcar_presenca({ p_id, p_editing }) {
      if (!ativo()) return negado("Sem acesso.");
      const l = tabelas.demandas.get(p_id);
      if (l) gravar("demandas", p_id, { ...l, editing_by: p_editing, editing_at: p_editing ? p_editing.since || agora() : null });
      return { data: null, error: null };
    },
    excluir_demanda({ p_id }) {
      if (!escreve()) return negado("Sem permissão para excluir.");
      if (tabelas.demandas.delete(p_id)) avisar("demandas", "DELETE", null, { id: p_id });
      for (const [id, a] of tabelas.arquivos) if (a.demanda_id === p_id) tabelas.arquivos.delete(id);
      const m = tabelas.sistema_meta.get("meta");
      if (!m.deleted_demanda_ids.includes(p_id)) gravar("sistema_meta", "meta", { ...m, deleted_demanda_ids: [...m.deleted_demanda_ids, p_id] });
      return { data: null, error: null };
    },
    mesclar_meta({ p_campos }) {
      if (p_campos.metasEtapa && !escreve()) return negado("Sem permissão para alterar metas.");
      if (!ativo()) return negado("Sem acesso.");
      const m = tabelas.sistema_meta.get("meta");
      gravar("sistema_meta", "meta", {
        ...m,
        metas_etapa: p_campos.metasEtapa ? mesclar(m.metas_etapa, p_campos.metasEtapa) : m.metas_etapa,
        filtros_salvos: p_campos.filtrosSalvos ? mesclar(m.filtros_salvos, p_campos.filtrosSalvos) : m.filtros_salvos,
      });
      return { data: null, error: null };
    },
    salvar_perfis({ p_mapas }) {
      if (!admin()) return negado("Só administradores alteram usuários.");
      const m = p_mapas || {};
      const emails = new Set([ADMIN]);
      for (const k of ["roles", "disabled", "purged", "regionals", "names"]) Object.keys(m[k] || {}).forEach((e) => emails.add(e.toLowerCase()));
      for (const e of emails) {
        gravar("perfis", e, {
          email: e,
          papel: e === ADMIN ? "admin" : ["admin", "visibilidade"].includes(m.roles?.[e]) ? m.roles[e] : "projetista",
          desabilitado: e !== ADMIN && !!m.disabled?.[e],
          removido: e !== ADMIN && !!m.purged?.[e],
          regional: m.regionals?.[e] || "",
          nome: m.names?.[e] || "",
        });
      }
      for (const [e, p] of tabelas.perfis) if (!emails.has(e) && !p.removido) gravar("perfis", e, { ...p, removido: true });
      return { data: null, error: null };
    },
  };

  function canal() {
    const ouvintes = [];
    const c = {
      on(_tipo, filtro, cb) {
        ouvintes.push({ filtro, cb });
        return c;
      },
      subscribe(cb) {
        canais.add(c);
        setTimeout(() => cb?.("SUBSCRIBED"), 5);
        return c;
      },
      _emitir(tabela, payload) {
        for (const { filtro, cb } of ouvintes) {
          if (filtro.table !== tabela) continue;
          if (filtro.event !== "*" && filtro.event !== payload.eventType) continue;
          const linha = payload.eventType === "DELETE" ? payload.old : payload.new;
          if (filtro.filter) {
            const [col, cond] = filtro.filter.split("=");
            if (String(linha[col]) !== cond.replace(/^eq\./, "")) continue;
          }
          if (payload.eventType !== "DELETE" && !podeLer(tabela, payload.new)) continue;
          cb(payload);
        }
      },
    };
    return c;
  }

  function emitirAuth(evento) {
    for (const cb of ouvintesAuth) cb(evento, sessao);
  }

  const storage = {
    from(bucket) {
      return {
        async upload(caminho, arquivo, opcoes = {}) {
          if (!escreve()) return negado();
          const chave = `${bucket}/${caminho}`;
          if (objetos.has(chave)) return { data: null, error: { message: "The resource already exists" } };
          objetos.set(chave, { blob: arquivo, tipo: opcoes.contentType || arquivo.type });
          return { data: { path: caminho }, error: null };
        },
        async remove(caminhos) {
          if (!escreve()) return negado();
          for (const c of caminhos) objetos.delete(`${bucket}/${c}`);
          return { data: [], error: null };
        },
        async createSignedUrl(caminho) {
          const o = ativo() && objetos.get(`${bucket}/${caminho}`);
          if (!o) return { data: null, error: { message: "Object not found" } };
          return { data: { signedUrl: URL.createObjectURL(new Blob([o.blob], { type: o.tipo })) }, error: null };
        },
        async createSignedUrls(caminhos) {
          const data = [];
          for (const c of caminhos) {
            const r = await this.createSignedUrl(c);
            data.push({ path: c, signedUrl: r.data?.signedUrl || null, error: r.error?.message || null });
          }
          return { data, error: null };
        },
      };
    },
  };

  const cliente = {
    auth: {
      onAuthStateChange(cb) {
        ouvintesAuth.add(cb);
        setTimeout(() => cb("INITIAL_SESSION", sessao), 0);
        return { data: { subscription: { unsubscribe: () => ouvintesAuth.delete(cb) } } };
      },
      async getSession() {
        return { data: { session: sessao }, error: null };
      },
      async signInWithPassword({ email, password }) {
        const u = usuarios.get(String(email).toLowerCase());
        if (!u || u.senha !== password) return { data: {}, error: { code: "invalid_credentials", message: "Invalid login credentials" } };
        sessao = { user: { id: u.id, email: u.email, user_metadata: {} } };
        emitirAuth("SIGNED_IN");
        return { data: { user: sessao.user, session: sessao }, error: null };
      },
      async signOut() {
        sessao = null;
        emitirAuth("SIGNED_OUT");
        return { error: null };
      },
      async resetPasswordForEmail(email) {
        window.__sbFalso.emailsReset.push(email);
        return { data: {}, error: null };
      },
      async updateUser({ password }) {
        if (!sessao) return { data: null, error: { message: "Auth session missing!" } };
        usuarios.get(sessao.user.email).senha = password;
        return { data: { user: sessao.user }, error: null };
      },
    },
    from: (t) => new Consulta(t),
    async rpc(nome, args) {
      if (!sessao) return negado();
      return rpcs[nome](args || {});
    },
    channel: () => canal(),
    async removeChannel(c) {
      canais.delete(c);
      return "ok";
    },
    storage,
    functions: {
      async invoke(nome, { body }) {
        if (nome !== "admin-usuarios" || !admin()) return { data: null, error: { message: "Edge Function returned a non-2xx status code" } };
        const e = String(body.email).toLowerCase();
        if (usuarios.has(e)) return { data: { existia: true }, error: null };
        usuarios.set(e, { id: `u-${++seq}`, email: e, senha: body.senha });
        return { data: { existia: false, usuario: { email: e } }, error: null };
      },
    },
  };

  window.supabase = { createClient: () => cliente };

  // Controles para os testes.
  window.__sbFalso = {
    tabelas,
    objetos,
    emailsReset: [],
    criarUsuario(email, senha, papel = "projetista") {
      const e = email.toLowerCase();
      usuarios.set(e, { id: `u-${++seq}`, email: e, senha });
      tabelas.perfis.set(e, { email: e, papel, desabilitado: false, removido: false, regional: "", nome: "" });
    },
    /** Alteração feita por "outra pessoa": grava direto e avisa pelo tempo real. */
    alterarRemoto(id, dados) {
      const velho = tabelas.demandas.get(id);
      gravar("demandas", id, { id, dados: { ...(velho?.dados || {}), ...dados }, editing_by: null, editing_at: null });
    },
    semear(demandas) {
      for (const d of demandas) {
        const { id, ...dados } = d;
        tabelas.demandas.set(id, { id, dados, editing_by: null, editing_at: null });
      }
    },
  };
})();
