/**
 * Administração de usuários, login e inicialização.
 * Só declarações (funções e constantes); o que roda ao abrir a página fica em app.js.
 */
function hideAppLoader() {
  const loader = document.getElementById("appLoader");
  if (loader) loader.hidden = true;
}

/* ---------- Usuários (somente admin) ---------- */

/**
 * Edições ainda não salvas, por e-mail ({ nome, role, regional, esteira }). Sobrevivem à busca,
 * aos filtros e às sincronizações (antes cada letra digitada ou cada mudança remota apagava tudo).
 * Só sai daqui depois de salvar com sucesso, ao Descartar ou ao fechar a janela.
 */
const usuariosRascunhos = new Map();
/** Contas com a edição aberta (os campos só aparecem ao clicar em Editar). */
const usuariosAbertas = new Set();
/** Filtro do resumo: todos | ativos | admin | projetista | visibilidade | desabilitados. */
let usuariosFiltro = "todos";
/** Situação do login (função listarContasLogin); null = não carregou ou a função não está publicada. */
let usuariosContasLogin = null;
let usuariosContasLoginPromessa = null;
/** Últimas mudanças de acesso (null = ainda não carregado). */
let usuariosHistorico = null;

const USUARIOS_FILTROS = [
  ["todos", "Todas"],
  ["ativos", "Ativas"],
  ["admin", "Administradores"],
  ["projetista", "Projetistas"],
  ["visibilidade", "Visibilidade"],
  ["desabilitados", "Desabilitadas"],
  ["semlogin", "Sem login"],
];

function roleOptionsHtml(selected) {
  const roles = typeof DemandasRoles !== "undefined" ? DemandasRoles.ROLES : ["admin", "projetista", "visibilidade"];
  const labels = typeof DemandasRoles !== "undefined" ? DemandasRoles.ROLE_LABELS : {};
  return roles
    .map((r) => {
      const lab = labels[r] || r;
      const sel = r === selected ? " selected" : "";
      return `<option value="${escapeHtml(r)}"${sel}>${escapeHtml(lab)}</option>`;
    })
    .join("");
}

function regionalOptionsHtml(selected) {
  const cur =
    typeof DemandasRoles !== "undefined" && DemandasRoles.normalizeRegionalValue
      ? DemandasRoles.normalizeRegionalValue(selected)
      : String(selected || "").trim();
  const opts = [`<option value=""${cur ? "" : " selected"}>Todas</option>`];
  for (const reg of REGIONAIS_ORDER) {
    const sel = reg === cur ? " selected" : "";
    opts.push(`<option value="${escapeHtml(reg)}"${sel}>${escapeHtml(reg)}</option>`);
  }
  return opts.join("");
}

const ESTEIRAS_INICIAIS = [
  ["operacional", "Esteira Projetos"],
  ["b2b", "Esteira B2B"],
];

function esteiraInicialOptionsHtml(selected) {
  const cur = selected === "b2b" ? "b2b" : "operacional";
  return ESTEIRAS_INICIAIS.map(
    ([v, l]) => `<option value="${v}"${v === cur ? " selected" : ""}>${escapeHtml(l)}</option>`,
  ).join("");
}

function fillUserNovoRegionalSelect() {
  const sel = document.getElementById("userNovoRegional");
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = regionalOptionsHtml(cur);
  syncNovoUsuarioHint();
}

function syncNovoUsuarioHint() {
  const el = document.getElementById("userNovoHint");
  const acesso = document.querySelector('input[name="userNovoAcesso"]:checked')?.value || "convite";
  const campoSenha = document.getElementById("userNovoSenhaCampo");
  if (campoSenha) campoSenha.hidden = acesso !== "senha";
  if (!el) return;
  const role = document.getElementById("userNovoRole")?.value || "projetista";
  const regional = document.getElementById("userNovoRegional")?.value || "";
  const papel =
    role === "admin"
      ? "Acesso total, inclusive a usuários."
      : role === "visibilidade"
        ? "Só consulta, sem alterar."
        : "Pode operar as demandas.";
  const regiao = regional ? "Entra filtrado nesta regional." : "Entra vendo todas as regionais.";
  const entrada = acesso === "senha" ? "" : " Recebe um e-mail para criar a senha.";
  el.textContent = `${papel} ${regiao}${entrada}`;
}

/** Mostra/esconde o formulário de nova conta (libera espaço para a lista, principalmente no celular). */
function setFormNovaContaAberto(aberto) {
  const form = document.getElementById("formNovoUsuario");
  const btn = document.getElementById("btnNovaConta");
  const layout = document.getElementById("usuariosLayout");
  if (!form) return;
  form.hidden = !aberto;
  layout?.classList.toggle("is-form-fechado", !aberto);
  if (btn) {
    btn.setAttribute("aria-expanded", aberto ? "true" : "false");
    btn.textContent = aberto ? "Fechar formulário" : "+ Nova conta";
  }
  if (aberto) {
    syncNovoUsuarioHint();
    requestAnimationFrame(() => document.getElementById("userNovoEmail")?.focus());
  }
}

/**
 * Dá para editar acessos? Só depois de a lista vir do servidor: antes disso o mapa local tem só o
 * administrador principal, e gravar nesse estado apagaria a equipe inteira.
 */
function acessosEditaveis() {
  if (typeof persistenceApi === "undefined" || !persistenceApi) {
    // Sem persistência ainda: com Firebase no ar, está carregando; sem Firebase (modo local), pode.
    return !(typeof firebase !== "undefined" && typeof DemandasAuth !== "undefined" && DemandasAuth.isConfigured?.());
  }
  return persistenceApi.mode !== "firebase" || !!persistenceApi.acessosCarregados?.();
}

function avisarAcessosCarregando() {
  if (acessosEditaveis()) return false;
  toast("Aguarde: a lista de acessos ainda está carregando da nuvem.");
  return true;
}

/** Valores salvos (na nuvem) da conta — base para saber se há alteração pendente. */
function usuarioValoresSalvos(email) {
  const R = typeof DemandasRoles !== "undefined" ? DemandasRoles : null;
  return {
    nome: normalizeAccountDisplayName(accountDisplayNameForEmail(email)),
    role: R ? R.getRolesMap()[email] || "" : "",
    regional: R?.regionalForEmail ? R.regionalForEmail(email) || "" : "",
    esteira: R?.homeEsteiraForEmail ? R.homeEsteiraForEmail(email) : "operacional",
  };
}

function usuarioValoresNaTela(email) {
  const salvo = usuarioValoresSalvos(email);
  return { ...salvo, ...(usuariosRascunhos.get(email) || {}) };
}

function usuarioTemAlteracao(email) {
  const r = usuariosRascunhos.get(email);
  if (!r) return false;
  const s = usuarioValoresSalvos(email);
  return (
    normalizeAccountDisplayName(r.nome ?? s.nome) !== s.nome ||
    (r.role ?? s.role) !== s.role ||
    (r.regional ?? s.regional) !== s.regional ||
    (r.esteira ?? s.esteira) !== s.esteira
  );
}

function usuariosComAlteracao() {
  return [...usuariosRascunhos.keys()].filter(usuarioTemAlteracao);
}

/**
 * Quem tem quais demandas. As demandas guardam o nome (rótulo) do projetista, não o e-mail, então:
 *  - o rótulo atual de cada projetista/admin é único e conta como certo;
 *  - nomes antigos (primeiro nome, nome completo, nome de exibição) só contam como certos se
 *    nenhuma outra conta puder ter o mesmo nome; senão ficam como "nome em comum" (ambíguos).
 * Calculado uma vez por renderização (roda a cada mudança remota).
 */
function indiceDemandasPorConta(emails) {
  const primarios = new Map();
  for (const row of projetistaEmailRowsFromRoles({ includeDisabled: true })) {
    const k = projetistaSlug(row.label);
    if (k && !primarios.has(k)) primarios.set(k, row.email);
  }
  const secundarios = new Map();
  const addSec = (rotulo, email) => {
    const k = projetistaSlug(rotulo);
    if (!k || primarios.has(k)) return;
    if (!secundarios.has(k)) secundarios.set(k, new Set());
    secundarios.get(k).add(email);
  };
  for (const email of emails) {
    const parts = emailLocalNameParts(email);
    addSec(projetistaLabelForEmail(email), email);
    if (parts[0]) addSec(parts[0], email);
    if (parts.length > 1) addSec(parts.join(" "), email);
    const nome = typeof DemandasRoles !== "undefined" ? DemandasRoles.displayNameForEmail?.(email) : "";
    if (nome) addSec(nome, email);
  }
  const certas = new Map();
  const ambiguas = new Map();
  const comNome = new Map(); // e-mail → outros e-mails com o mesmo nome
  const push = (mapa, email, d) => {
    if (!mapa.has(email)) mapa.set(email, []);
    mapa.get(email).push(d);
  };
  for (const d of state.demandas || []) {
    const nomes = new Set([
      ...demandaProjetistasList(d),
      String(d?.responsavel || "").trim(),
      ...(Array.isArray(d?.projetistasExtra) ? d.projetistasExtra.map((n) => String(n || "").trim()) : []),
    ]);
    const jaContou = new Set();
    for (const n of nomes) {
      const k = projetistaSlug(n);
      if (!k) continue;
      const dono = primarios.get(k);
      if (dono) {
        if (!jaContou.has(dono)) push(certas, dono, d);
        jaContou.add(dono);
        continue;
      }
      const donos = secundarios.get(k);
      if (!donos) continue;
      for (const e of donos) {
        if (jaContou.has(e)) continue;
        jaContou.add(e);
        if (donos.size === 1) push(certas, e, d);
        else {
          push(ambiguas, e, d);
          comNome.set(e, new Set([...(comNome.get(e) || []), ...[...donos].filter((x) => x !== e)]));
        }
      }
    }
  }
  return {
    certas: (email) => certas.get(email) || [],
    ambiguas: (email) => (ambiguas.get(email) || []).filter((d) => !(certas.get(email) || []).includes(d)),
    outrosComMesmoNome: (email) => [...(comNome.get(email) || [])],
  };
}

function formatarDataCurta(iso) {
  const t = iso ? new Date(iso) : null;
  if (!t || Number.isNaN(t.getTime())) return "";
  return t.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/** Texto da situação do login (função listarContasLogin); "" se a informação não está disponível. */
function textoSituacaoLogin(email) {
  const c = usuariosContasLogin?.[email];
  if (!c) return "";
  if (!c.existe) return "Sem login criado";
  if (c.desativadoNoLogin) return "Login bloqueado no Firebase";
  return c.ultimoLogin ? `Último acesso ${formatarDataCurta(c.ultimoLogin)}` : "Nunca entrou";
}

function usuarioPassaNoFiltro(email, { role, disabled }) {
  switch (usuariosFiltro) {
    case "ativos":
      return !disabled;
    case "desabilitados":
      return disabled;
    case "semlogin":
      return usuariosContasLogin?.[email]?.existe === false;
    case "admin":
    case "projetista":
    case "visibilidade":
      return role === usuariosFiltro;
    default:
      return true;
  }
}

function renderUsuariosResumo(contas) {
  const box = document.getElementById("usuariosResumo");
  if (!box) return;
  const contar = (f) =>
    contas.filter((c) => {
      const antes = usuariosFiltro;
      usuariosFiltro = f;
      const ok = usuarioPassaNoFiltro(c.email, c);
      usuariosFiltro = antes;
      return ok;
    }).length;
  // "Sem login" só aparece quando a função listarContasLogin respondeu (e há alguém sem login).
  const filtros = USUARIOS_FILTROS.filter(([f]) => f !== "semlogin" || (usuariosContasLogin && contar("semlogin") > 0));
  if (usuariosFiltro === "semlogin" && !filtros.some(([f]) => f === "semlogin")) usuariosFiltro = "todos";
  box.innerHTML = filtros
    .map(([f, rotulo]) => {
      const n = contar(f);
      const ativo = f === usuariosFiltro;
      return `<button type="button" class="usuarios-filtro${ativo ? " is-ativo" : ""}${f === "semlogin" ? " usuarios-filtro--alerta" : ""}" data-usuarios-filtro="${f}" aria-pressed="${ativo}">${escapeHtml(rotulo)} <span class="usuarios-filtro__n">${n}</span></button>`;
    })
    .join("");
}

/** Aplica busca + filtro sem recriar a lista (não perde o que está sendo digitado). */
function aplicarFiltroUsuarios() {
  const list = document.getElementById("usuariosList");
  if (!list) return;
  const q = String(document.getElementById("usuariosBusca")?.value || "")
    .trim()
    .toLowerCase();
  let visiveis = 0;
  let desabilitadasVisiveis = 0;
  const linhas = [...list.querySelectorAll(".usuarios-row")];
  for (const row of linhas) {
    const email = row.dataset.email || "";
    const nome = String(row.dataset.nome || "").toLowerCase();
    const okBusca = !q || email.includes(q) || nome.includes(q);
    const desabilitada = row.classList.contains("is-disabled");
    const okFiltro = usuarioPassaNoFiltro(email, { role: row.dataset.role, disabled: desabilitada });
    row.hidden = !(okBusca && okFiltro);
    if (!row.hidden) {
      visiveis++;
      if (desabilitada) desabilitadasVisiveis++;
    }
  }
  const grupo = list.querySelector('[data-grupo="desabilitadas"]');
  if (grupo) grupo.hidden = !desabilitadasVisiveis || usuariosFiltro === "desabilitados";
  const cab = list.querySelector(".usuarios-tabela__cab");
  if (cab) cab.hidden = !visiveis;
  const vazio = document.getElementById("usuariosVazio");
  if (vazio) {
    vazio.hidden = visiveis > 0 || !linhas.length;
    const txt = document.getElementById("usuariosVazioTexto");
    if (txt) {
      const filtro = USUARIOS_FILTROS.find(([f]) => f === usuariosFiltro)?.[1] || "";
      txt.textContent = q
        ? `Nenhuma conta encontrada para «${q}»${usuariosFiltro !== "todos" ? ` em ${filtro}` : ""}.`
        : `Nenhuma conta em ${filtro}.`;
    }
  }
  const status = document.getElementById("usuariosStatus");
  const texto = `${visiveis} de ${linhas.length} conta${linhas.length === 1 ? "" : "s"}`;
  // Só anuncia (leitor de tela) quando o número muda — não a cada sincronização.
  if (status && status.textContent !== texto) status.textContent = texto;
}

/** Iniciais para o avatar ("Bia Souza" → "BS"). */
function iniciaisDaConta(titulo) {
  const partes = String(titulo || "")
    .replace(/@.*/, "")
    .split(/[\s._-]+/)
    .filter(Boolean);
  return (partes.slice(0, 2).map((p) => p[0]).join("") || "?").toUpperCase();
}

/** Abre/fecha a edição de uma conta (os campos só aparecem ao clicar em Editar). */
function alternarEdicaoUsuario(email, abrir) {
  const aberta = usuariosAbertas.has(email);
  const quer = abrir ?? !aberta;
  if (!quer && usuarioTemAlteracao(email)) {
    toast("Salve ou cancele as alterações desta conta");
    return;
  }
  if (quer) usuariosAbertas.add(email);
  else usuariosAbertas.delete(email);
  renderUsuariosPanel();
  const row = [...document.querySelectorAll("#usuariosList .usuarios-row")].find((r) => r.dataset.email === email);
  (quer ? row?.querySelector(".user-nome-input") : row?.querySelector(".user-row-editar"))?.focus();
}

function renderUsuariosPanel() {
  const list = document.getElementById("usuariosList");
  const panel = document.getElementById("panelUsuarios");
  if (!list || !panel) return;
  bindUsuariosBusca();
  if (!isAdminUser()) {
    list.innerHTML = '<p class="muted">Acesso restrito ao administrador.</p>';
    return;
  }
  fillUserNovoRegionalSelect();
  if (!acessosEditaveis()) {
    list.innerHTML = '<p class="usuarios-carregando muted">Carregando a lista de acessos da nuvem…</p>';
    const resumo = document.getElementById("usuariosResumo");
    if (resumo) resumo.innerHTML = "";
    return;
  }
  const R = typeof DemandasRoles !== "undefined" ? DemandasRoles : null;
  const map = R ? R.getRolesMap() : { ...(window.DEMANDAS_ROLES_SEED || {}) };
  const eu = getCurrentUserEmail();

  // Guarda o foco (e o cursor) para devolver depois de recriar as linhas.
  const ativo = document.activeElement;
  const rowAtiva = ativo && list.contains(ativo) ? ativo.closest(".usuarios-row") : null;
  const foco = rowAtiva
    ? {
        email: rowAtiva.dataset.email,
        cls: [...ativo.classList].find((c) => c.startsWith("user-")),
        ini: typeof ativo.selectionStart === "number" ? ativo.selectionStart : null,
        fim: typeof ativo.selectionEnd === "number" ? ativo.selectionEnd : null,
      }
    : null;

  const emails = Object.keys(map);
  const indice = indiceDemandasPorConta(emails);
  const contas = emails.map((email) => {
    const disabled = !!R?.isDisabled?.(email);
    const salvo = usuarioValoresSalvos(email);
    const titulo = (R?.displayNameForEmail?.(email) || "") || accountDisplayNameForEmail(email) || email;
    return { email, role: map[email], disabled, salvo, titulo };
  });
  // Ativas primeiro, desabilitadas no fim; dentro de cada grupo, por nome.
  contas.sort((a, b) => Number(a.disabled) - Number(b.disabled) || a.titulo.localeCompare(b.titulo, "pt-BR", { sensitivity: "base" }));
  renderUsuariosResumo(contas);

  if (!contas.length) {
    list.innerHTML = '<p class="muted">Nenhum usuário na lista de acessos.</p>';
    aplicarFiltroUsuarios();
    return;
  }

  const labels = R?.ROLE_LABELS || {};
  const cel = (rotulo, html, cls) =>
    `<div class="usuarios-row__cel usuarios-row__cel--${cls}"><span class="usuarios-row__rotulo">${rotulo}</span><span class="usuarios-row__valor">${html}</span></div>`;
  const cabecalho =
    `<div class="usuarios-tabela__cab" aria-hidden="true"><span>Conta</span><span>Papel</span><span>Regional</span>` +
    `<span>Tela inicial</span><span>Demandas</span><span>Último acesso</span><span>Situação</span><span></span></div>`;
  let grupoAberto = false;

  list.innerHTML =
    cabecalho +
    contas
      .map(({ email, role, disabled, salvo, titulo }, i) => {
        const tela = usuarioValoresNaTela(email);
        const sujo = usuarioTemAlteracao(email);
        const aberta = !disabled && (usuariosAbertas.has(email) || sujo);
        const certas = indice.certas(email).length;
        const ambiguas = indice.ambiguas(email).length;
        const demandasHtml =
          (certas ? `<strong>${certas}</strong> demanda${certas > 1 ? "s" : ""}` : `<span class="muted">Sem demandas</span>`) +
          (ambiguas ? `<span class="usuarios-row__nota" title="Demandas com um nome que também pode ser de outra conta">+${ambiguas} com nome em comum</span>` : "");
        const c = usuariosContasLogin?.[email];
        const semLogin = c && !c.existe;
        const loginHtml = !c
          ? `<span class="muted" title="Publique a função listarContasLogin para ver o último acesso">—</span>`
          : !c.existe
            ? `<span class="usuarios-row__meta--alerta">Sem login criado</span>`
            : c.desativadoNoLogin
              ? `<span class="usuarios-row__meta--alerta">Login bloqueado no Firebase</span>`
              : c.ultimoLogin
                ? escapeHtml(formatarDataCurta(c.ultimoLogin))
                : `<span class="muted">Nunca entrou</span>`;
        const mostraEmailAbaixo = titulo.toLowerCase() !== email.toLowerCase();
        const ehVoce = email === eu;
        const motivoRemover = certas
          ? `Tem ${certas} demanda${certas > 1 ? "s" : ""}: redistribua ou use Desabilitar`
          : ehVoce
            ? "Você não pode remover a si mesmo"
            : "";
        const idEdit = `usuarioEdit${i}`;
        const dis = disabled ? " disabled" : "";
        let grupo = "";
        if (disabled && !grupoAberto) {
          grupoAberto = true;
          grupo = `<div class="usuarios-grupo" data-grupo="desabilitadas">Desabilitadas</div>`;
        }
        return (
          grupo +
          `<div class="usuarios-row${disabled ? " is-disabled" : ""}${sujo ? " is-sujo" : ""}${aberta ? " is-aberta" : ""}" data-email="${escapeHtml(email)}" data-role="${escapeHtml(role)}" data-regional="${escapeHtml(salvo.regional)}" data-nome="${escapeHtml(salvo.nome)}">` +
          `<div class="usuarios-row__linha">` +
          `<div class="usuarios-row__conta">` +
          `<span class="usuarios-avatar usuarios-avatar--${escapeHtml(role)}" aria-hidden="true">${escapeHtml(iniciaisDaConta(titulo))}</span>` +
          `<span class="usuarios-row__id">` +
          `<span class="usuarios-row__titulo"><span class="usuarios-row__email">${escapeHtml(titulo)}</span>${ehVoce ? '<span class="usuarios-tag usuarios-tag--voce">Você</span>' : ""}</span>` +
          (mostraEmailAbaixo ? `<span class="usuarios-row__mail">${escapeHtml(email)}</span>` : "") +
          `</span></div>` +
          cel("Papel", `<span class="usuarios-tag usuarios-tag--${escapeHtml(role)}">${escapeHtml(labels[role] || role)}</span>`, "papel") +
          cel("Regional", escapeHtml(salvo.regional || "Todas"), "regional") +
          cel("Tela inicial", salvo.esteira === "b2b" ? "Esteira B2B" : "Esteira Projetos", "tela") +
          cel("Demandas", demandasHtml, "demandas") +
          cel("Último acesso", loginHtml, "login") +
          cel(
            "Situação",
            disabled
              ? `<span class="usuarios-row__status usuarios-row__status--off">Desabilitada</span>`
              : `<span class="usuarios-row__status usuarios-row__status--on">Ativa</span>`,
            "situacao",
          ) +
          `<div class="usuarios-row__acoes">` +
          (disabled
            ? ""
            : `<button type="button" class="btn btn--ghost btn--sm user-row-editar" aria-expanded="${aberta}" aria-controls="${idEdit}" aria-label="Editar ${escapeHtml(titulo)}">Editar</button>`) +
          `<div class="usuarios-row__more">` +
          `<button type="button" class="icon-btn user-row-more" aria-label="Mais ações de ${escapeHtml(email)}" aria-expanded="false" aria-haspopup="menu">⋯</button>` +
          `<div class="usuarios-row__menu" role="menu" aria-label="Ações de ${escapeHtml(email)}" hidden>` +
          (semLogin
            ? `<button type="button" class="user-login-criar" role="menuitem" tabindex="-1">Criar login e enviar convite</button>`
            : `<button type="button" class="user-role-reset" role="menuitem" tabindex="-1">Recuperar senha</button>`) +
          `<button type="button" class="user-role-toggle" role="menuitem" tabindex="-1">${disabled ? "Habilitar" : "Desabilitar"}</button>` +
          `<button type="button" class="user-role-del" role="menuitem" tabindex="-1"${motivoRemover ? ` aria-disabled="true" data-motivo="${escapeHtml(motivoRemover)}"` : ""}>Remover${motivoRemover ? `<small>${escapeHtml(motivoRemover)}</small>` : ""}</button>` +
          `</div></div></div>` +
          `</div>` +
          `<div class="usuarios-row__edit" id="${idEdit}"${aberta ? "" : " hidden"}>` +
          `<div class="usuarios-row__campos">` +
          `<label><span>Nome</span><input type="text" class="user-nome-input" maxlength="80" value="${escapeHtml(tela.nome)}" placeholder="Nome da conta" aria-label="Nome de ${escapeHtml(email)}"${dis} /></label>` +
          `<label><span>Papel</span><select class="user-role-select" aria-label="Papel de ${escapeHtml(email)}"${dis}>${roleOptionsHtml(tela.role)}</select></label>` +
          `<label><span>Regional</span><select class="user-regional-select" aria-label="Regional de ${escapeHtml(email)}"${dis}>${regionalOptionsHtml(tela.regional)}</select></label>` +
          `<label><span>Tela inicial</span><select class="user-esteira-select" aria-label="Tela inicial de ${escapeHtml(email)}"${dis}>${esteiraInicialOptionsHtml(tela.esteira)}</select></label>` +
          `</div>` +
          `<div class="usuarios-row__edit-acoes">` +
          `<span class="usuarios-row__sujo" role="note"${sujo ? "" : " hidden"}>Alterações não salvas</span>` +
          `<button type="button" class="btn btn--ghost btn--sm user-row-descartar">Cancelar</button>` +
          `<button type="button" class="btn btn--primary btn--sm user-role-save"${sujo ? "" : " disabled"}>Salvar</button>` +
          `</div>` +
          `</div>` +
          `</div>`
        );
      })
      .join("");

  aplicarFiltroUsuarios();

  if (foco?.email && foco.cls) {
    const row = [...list.querySelectorAll(".usuarios-row")].find((r) => r.dataset.email === foco.email);
    const el = row?.querySelector(`.${foco.cls}`);
    if (el && !el.disabled && !el.closest("[hidden]")) {
      el.focus({ preventScroll: true });
      if (foco.ini != null && typeof el.setSelectionRange === "function") {
        try {
          el.setSelectionRange(foco.ini, foco.fim ?? foco.ini);
        } catch (_) {}
      }
    }
  }
}

/** Atualiza o rascunho da linha a partir dos campos e marca/desmarca "alterações não salvas". */
function syncLinhaUsuario(row) {
  const email = row?.dataset.email;
  if (!email) return;
  usuariosRascunhos.set(email, {
    nome: row.querySelector(".user-nome-input")?.value ?? "",
    role: row.querySelector(".user-role-select")?.value ?? "",
    regional: row.querySelector(".user-regional-select")?.value ?? "",
    esteira: row.querySelector(".user-esteira-select")?.value ?? "operacional",
  });
  const sujo = usuarioTemAlteracao(email);
  if (!sujo) usuariosRascunhos.delete(email);
  row.classList.toggle("is-sujo", sujo);
  const btn = row.querySelector(".user-role-save");
  if (btn) btn.disabled = !sujo;
  const aviso = row.querySelector(".usuarios-row__sujo");
  if (aviso) aviso.hidden = !sujo;
}

function itensMenuUsuario(menu) {
  return [...(menu?.querySelectorAll('[role="menuitem"]') || [])];
}

function closeUserRowMenus({ devolverFoco = null } = {}) {
  document.querySelectorAll(".usuarios-row__menu").forEach((menu) => {
    if (menu.hidden) return;
    menu.hidden = true;
    const btn = menu.previousElementSibling;
    btn?.setAttribute("aria-expanded", "false");
    if (devolverFoco === menu) btn?.focus();
  });
}

function abrirMenuUsuario(btn) {
  const menu = btn?.nextElementSibling;
  if (!menu) return;
  closeUserRowMenus();
  menu.hidden = false;
  btn.setAttribute("aria-expanded", "true");
  itensMenuUsuario(menu)[0]?.focus();
}

/** Setas, Home/End, Esc (fecha e volta o foco ao ⋯) e Tab (fecha) dentro do menu da linha. */
function teclasMenuUsuario(ev) {
  const menu = ev.target.closest(".usuarios-row__menu");
  if (!menu || menu.hidden) return false;
  const itens = itensMenuUsuario(menu);
  const i = itens.indexOf(document.activeElement);
  const ir = (n) => itens[(n + itens.length) % itens.length]?.focus();
  if (ev.key === "ArrowDown") ir(i + 1);
  else if (ev.key === "ArrowUp") ir(i - 1);
  else if (ev.key === "Home") ir(0);
  else if (ev.key === "End") ir(itens.length - 1);
  else if (ev.key === "Escape") closeUserRowMenus({ devolverFoco: menu });
  else if (ev.key === "Tab") {
    closeUserRowMenus();
    return true;
  } else return true;
  ev.preventDefault();
  ev.stopPropagation();
  return true;
}

async function fecharUsuariosComConfirmacao() {
  const dlg = document.getElementById("panelUsuarios");
  if (!dlg?.open) return;
  const pendentes = usuariosComAlteracao();
  if (pendentes.length) {
    const ok = await confirmDialog({
      title: "Descartar alterações?",
      message: `Há alterações não salvas em ${pendentes.length} conta${pendentes.length > 1 ? "s" : ""}.`,
      hint: "Se fechar agora, elas serão perdidas.",
      confirmText: "Descartar e fechar",
      cancelText: "Continuar editando",
      variant: "warn",
    });
    if (!ok) return;
  }
  dlg.close();
}

let usuariosBuscaBound = false;
function bindUsuariosBusca() {
  if (usuariosBuscaBound) return;
  usuariosBuscaBound = true;
  const list = document.getElementById("usuariosList");
  const dlg = document.getElementById("panelUsuarios");

  document.getElementById("usuariosBusca")?.addEventListener("input", aplicarFiltroUsuarios);
  document.getElementById("usuariosResumo")?.addEventListener("click", (ev) => {
    const chip = ev.target.closest("[data-usuarios-filtro]");
    if (!chip) return;
    usuariosFiltro = chip.dataset.usuariosFiltro;
    document.querySelectorAll("[data-usuarios-filtro]").forEach((b) => {
      const on = b.dataset.usuariosFiltro === usuariosFiltro;
      b.classList.toggle("is-ativo", on);
      b.setAttribute("aria-pressed", String(on));
    });
    aplicarFiltroUsuarios();
  });
  document.getElementById("btnUsuariosLimparFiltro")?.addEventListener("click", () => {
    const busca = document.getElementById("usuariosBusca");
    if (busca) busca.value = "";
    usuariosFiltro = "todos";
    renderUsuariosPanel();
    busca?.focus();
  });
  document.getElementById("btnNovaConta")?.addEventListener("click", () => {
    setFormNovaContaAberto(document.getElementById("formNovoUsuario")?.hidden !== false);
  });
  document.getElementById("btnCancelarNovaConta")?.addEventListener("click", () => {
    setFormNovaContaAberto(false);
    document.getElementById("btnNovaConta")?.focus();
  });
  document.querySelectorAll('input[name="userNovoAcesso"]').forEach((r) => r.addEventListener("change", syncNovoUsuarioHint));
  document.getElementById("btnFecharUsuarios")?.addEventListener("click", () => void fecharUsuariosComConfirmacao());
  document.getElementById("usuariosHistorico")?.addEventListener("toggle", (ev) => {
    if (ev.currentTarget.open) void carregarHistoricoAcessos();
  });

  if (dlg) {
    // Esc: fecha primeiro o menu ⋯ aberto; com alterações pendentes, pergunta antes de fechar.
    dlg.addEventListener("cancel", (ev) => {
      const menuAberto = dlg.querySelector(".usuarios-row__menu:not([hidden])");
      if (menuAberto) {
        ev.preventDefault();
        closeUserRowMenus({ devolverFoco: menuAberto });
        return;
      }
      if (usuariosComAlteracao().length) {
        ev.preventDefault();
        void fecharUsuariosComConfirmacao();
      }
    });
    dlg.addEventListener("close", () => {
      usuariosRascunhos.clear();
      usuariosAbertas.clear();
      closeUserRowMenus();
    });
  }

  if (list) {
    const aoEditar = (ev) => {
      const row = ev.target.closest(".usuarios-row");
      if (row && ev.target.matches(".user-nome-input, .user-role-select, .user-regional-select, .user-esteira-select")) {
        syncLinhaUsuario(row);
      }
    };
    list.addEventListener("input", aoEditar);
    list.addEventListener("change", aoEditar);
    list.addEventListener("keydown", (ev) => {
      if (teclasMenuUsuario(ev)) return;
      if (ev.target.matches(".user-row-more") && (ev.key === "ArrowDown" || ev.key === "ArrowUp")) {
        ev.preventDefault();
        abrirMenuUsuario(ev.target);
      }
    });
    list.addEventListener("click", (ev) => {
      const row = ev.target.closest(".usuarios-row");
      const email = row?.dataset.email;
      if (!email) return;
      const alvo = ev.target.closest("button");
      if (!alvo) return;
      if (alvo.matches(".user-row-more")) {
        ev.stopPropagation();
        const menu = alvo.nextElementSibling;
        if (menu?.hidden === false) closeUserRowMenus({ devolverFoco: menu });
        else abrirMenuUsuario(alvo);
        return;
      }
      if (alvo.matches(".user-role-save")) {
        const v = usuarioValoresNaTela(email);
        void saveUserAccess(email, { role: v.role, regional: v.regional, nome: v.nome, esteira: v.esteira });
        return;
      }
      if (alvo.matches(".user-row-editar")) {
        alternarEdicaoUsuario(email);
        return;
      }
      if (alvo.matches(".user-row-descartar")) {
        usuariosRascunhos.delete(email);
        alternarEdicaoUsuario(email, false);
        return;
      }
      if (!alvo.closest(".usuarios-row__menu")) return;
      if (alvo.getAttribute("aria-disabled") === "true") {
        toast(alvo.dataset.motivo || "Indisponível");
        return;
      }
      closeUserRowMenus();
      if (alvo.matches(".user-role-reset")) void sendUserPasswordReset(email);
      else if (alvo.matches(".user-login-criar")) void criarLoginParaConta(email);
      else if (alvo.matches(".user-role-toggle")) void toggleUserDisabled(email);
      else if (alvo.matches(".user-role-del")) void removeUserFromSystem(email);
    });
  }
  document.addEventListener("click", (ev) => {
    if (ev.target.closest(".usuarios-row__more")) return;
    closeUserRowMenus();
  });
}

/** Carrega a situação do login de cada conta (último acesso, sem login). Falha em silêncio se a função não existir. */
function carregarContasLogin({ forcar = false } = {}) {
  if (usuariosContasLoginPromessa) return usuariosContasLoginPromessa;
  if (usuariosContasLogin && !forcar) return Promise.resolve(usuariosContasLogin);
  if (typeof firebase === "undefined" || !firebase.functions || !firebase.apps?.length) return Promise.resolve(null);
  usuariosContasLoginPromessa = (async () => {
    try {
      const res = await firebase.app().functions("us-central1").httpsCallable("listarContasLogin")({});
      usuariosContasLogin = res?.data?.contas || {};
    } catch (e) {
      console.info("Situação dos logins indisponível (publique a função listarContasLogin):", e?.code || e);
      usuariosContasLogin = null;
    } finally {
      usuariosContasLoginPromessa = null;
    }
    if (usuariosModalAberto()) renderUsuariosPanel();
    return usuariosContasLogin;
  })();
  return usuariosContasLoginPromessa;
}

const HISTORICO_ACOES = {
  adicionado: (h) => `deu acesso a ${h.alvo} como ${h.para || "—"}`,
  removido: (h) => `removeu ${h.alvo} do sistema${h.de ? ` (era ${h.de})` : ""}`,
  papel: (h) => `mudou o papel de ${h.alvo}: ${h.de || "—"} → ${h.para || "—"}`,
  desabilitado: (h) => `desabilitou ${h.alvo}`,
  habilitado: (h) => `habilitou ${h.alvo}`,
  nome: (h) => `renomeou ${h.alvo}: «${h.de || "—"}» → «${h.para || "—"}»`,
  regional: (h) => `mudou a regional de ${h.alvo}: ${h.de || "Todas"} → ${h.para || "Todas"}`,
  esteira: (h) => `mudou a tela inicial de ${h.alvo}: ${h.de || "—"} → ${h.para || "—"}`,
  "login-criado": (h) => `criou o login de ${h.alvo}${h.para ? ` (${h.para})` : ""}`,
};

function renderHistoricoAcessos() {
  const lista = document.getElementById("usuariosHistoricoLista");
  const status = document.getElementById("usuariosHistoricoStatus");
  if (!lista || !status) return;
  if (usuariosHistorico?.erro) {
    status.hidden = false;
    status.textContent = `Não foi possível ler o histórico (${usuariosHistorico.erro}). Publique as regras novas do Firestore.`;
    lista.innerHTML = "";
    return;
  }
  if (!Array.isArray(usuariosHistorico)) {
    status.hidden = false;
    status.textContent = persistenceApi?.loadAccessHistory ? "Carregando…" : "Disponível só com o Firebase conectado.";
    lista.innerHTML = "";
    return;
  }
  status.hidden = usuariosHistorico.length > 0;
  status.textContent = "Nenhuma mudança registrada ainda.";
  lista.innerHTML = usuariosHistorico
    .map((h) => {
      const quem = accountDisplayNameForEmail(h.por) || h.por || "—";
      const texto = (HISTORICO_ACOES[h.acao] || ((x) => `${x.acao} em ${x.alvo}`))(h);
      return `<li><time datetime="${escapeHtml(h.em || "")}">${escapeHtml(formatarDataCurta(h.em) || "—")}</time> <strong>${escapeHtml(quem)}</strong> ${escapeHtml(texto)}</li>`;
    })
    .join("");
}

async function carregarHistoricoAcessos() {
  if (!persistenceApi?.loadAccessHistory) {
    usuariosHistorico = null;
    renderHistoricoAcessos();
    return;
  }
  try {
    usuariosHistorico = await persistenceApi.loadAccessHistory(30);
  } catch (e) {
    console.warn("Histórico de acessos:", e);
    usuariosHistorico = { erro: e?.code || e?.message || "erro" };
  }
  renderHistoricoAcessos();
}

/** Diferenças entre dois retratos dos acessos → linhas do histórico. */
function diferencasDeAcesso(antes, depois) {
  if (!antes || !depois) return [];
  const rot = (r) => (typeof DemandasRoles !== "undefined" && DemandasRoles.ROLE_LABELS?.[r]) || r || "—";
  const est = (h) => (h?.esteira === "b2b" ? "Esteira B2B" : "Esteira Projetos");
  const out = [];
  const emails = new Set([...Object.keys(antes.roles || {}), ...Object.keys(depois.roles || {})]);
  for (const e of emails) {
    const r0 = antes.roles?.[e];
    const r1 = depois.roles?.[e];
    if (!r0 && r1) {
      out.push({ alvo: e, acao: "adicionado", para: rot(r1) });
      continue;
    }
    if (r0 && !r1) {
      out.push({ alvo: e, acao: "removido", de: rot(r0) });
      continue;
    }
    if (r0 !== r1) out.push({ alvo: e, acao: "papel", de: rot(r0), para: rot(r1) });
    const d0 = !!antes.disabled?.[e];
    const d1 = !!depois.disabled?.[e];
    if (d0 !== d1) out.push({ alvo: e, acao: d1 ? "desabilitado" : "habilitado" });
    // Sem nome salvo vale o nome tirado do e-mail (é o que aparece na tela): salvar igual não é "renomear".
    const n0 = antes.names?.[e] || accountNameFromEmail(e);
    const n1 = depois.names?.[e] || accountNameFromEmail(e);
    if (n0 !== n1) out.push({ alvo: e, acao: "nome", de: n0, para: n1 });
    const g0 = antes.regionals?.[e] || "";
    const g1 = depois.regionals?.[e] || "";
    if (g0 !== g1) out.push({ alvo: e, acao: "regional", de: g0 || "Todas", para: g1 || "Todas" });
    if (est(antes.homes?.[e]) !== est(depois.homes?.[e])) {
      out.push({ alvo: e, acao: "esteira", de: est(antes.homes?.[e]), para: est(depois.homes?.[e]) });
    }
  }
  return out;
}

/** Registra no histórico o que mudou. Nunca desfaz a mudança se o registro falhar. */
function registrarMudancasDeAcesso(antes, extras = []) {
  const lista = [...diferencasDeAcesso(antes, snapshotAcessos()), ...extras];
  if (!lista.length || !persistenceApi?.appendAccessHistory) return;
  persistenceApi
    .appendAccessHistory(lista)
    .then(() => {
      if (document.getElementById("usuariosHistorico")?.open) void carregarHistoricoAcessos();
    })
    .catch((e) => console.warn("Histórico de acessos (a mudança foi salva):", e));
}

/** Conta que está na lista mas nunca teve login criado: cria agora e manda o convite. */
async function criarLoginParaConta(email) {
  if (!isAdminUser()) {
    toast("Apenas administrador");
    return;
  }
  if (avisarAcessosCarregando()) return;
  const ok = await confirmDialog({
    title: "Criar login e enviar convite?",
    message: `«${email}» está na lista, mas ainda não tem login.`,
    hint: "O login é criado agora e a pessoa recebe um e-mail para definir a própria senha.",
    confirmText: "Criar e enviar",
    variant: "default",
  });
  if (!ok) return;
  try {
    const r = await DemandasAuth.createUser(email, "", { nome: accountDisplayNameForEmail(email) });
    if (r?.invite) await DemandasAuth.sendPasswordReset(email);
    toast(r?.created ? `Login criado. Enviamos o convite para ${email}.` : r?.existed ? "Esse e-mail já tinha login." : "Feito.");
    if (r?.created) registrarMudancasDeAcesso(null, [{ alvo: email, acao: "login-criado", para: "convite por e-mail" }]);
  } catch (err) {
    toast(err?.message || "Não foi possível criar o login");
  }
  void carregarContasLogin({ forcar: true });
}

async function sendUserPasswordReset(email) {
  if (!isAdminUser()) {
    toast("Apenas administrador");
    return;
  }
  const e = String(email || "")
    .trim()
    .toLowerCase();
  if (!e) return;
  if (typeof DemandasAuth?.sendPasswordReset !== "function") {
    toast("Recuperação de senha indisponível. Recarregue com Ctrl+F5.");
    return;
  }
  const ok = await confirmDialog({
    title: "Enviar recuperação de senha?",
    message: `O Firebase enviará um e-mail para «${e}» com link para criar uma nova senha.`,
    hint: "A senha atual não pode ser visualizada — só redefinida.",
    confirmText: "Enviar e-mail",
  });
  if (!ok) return;
  try {
    await DemandasAuth.sendPasswordReset(e);
    // O Firebase não diz se o e-mail tem login (protege contra descobrir contas); a lista mostra "Sem login criado".
    toast(`Pedido enviado: ${e} recebe o link se já tiver login.`);
  } catch (err) {
    toast(err?.message || "Falha ao enviar recuperação");
  }
}

/** Cópia dos mapas de acesso — para desfazer na tela se a gravação na nuvem falhar. */
function snapshotAcessos() {
  if (typeof DemandasRoles === "undefined") return null;
  return {
    roles: DemandasRoles.getRolesMap(),
    disabled: DemandasRoles.getDisabledMap?.() || {},
    purged: DemandasRoles.getPurgedMap?.() || {},
    regionals: DemandasRoles.getRegionalsMap?.() || {},
    names: DemandasRoles.getNamesMap?.() || {},
    homes: DemandasRoles.getHomesMap?.() || {},
  };
}

function restaurarAcessos(snap) {
  if (!snap || typeof DemandasRoles === "undefined") return;
  // Removidos primeiro: setRolesMap usa a lista de removidos ao juntar com o seed.
  DemandasRoles.setPurgedMap(snap.purged);
  DemandasRoles.setDisabledMap(snap.disabled);
  DemandasRoles.setRegionalsMap(snap.regionals);
  DemandasRoles.setNamesMap(snap.names);
  DemandasRoles.setHomesMap?.(snap.homes || {});
  DemandasRoles.setRolesMap(snap.roles);
  refreshProjetistaAssignmentLists();
  renderUsuariosPanel();
  applyRoleUi();
}

async function persistRolesMap(nextMap) {
  if (typeof DemandasRoles !== "undefined") DemandasRoles.setRolesMap(nextMap);
  refreshProjetistaAssignmentLists();
  renderUsuariosPanel();
  if (persistenceApi?.persistRoles) {
    const saved = await persistenceApi.persistRoles(nextMap);
    if (saved && typeof DemandasRoles !== "undefined") DemandasRoles.setRolesMap(saved);
  }
  refreshProjetistaAssignmentLists();
  renderUsuariosPanel();
  applyRoleUi();
}

async function saveUserAccess(email, { role, regional, nome, esteira } = {}) {
  if (!isAdminUser()) {
    toast("Apenas administrador");
    return;
  }
  if (avisarAcessosCarregando()) return;
  const e = String(email).trim().toLowerCase();
  if (typeof DemandasRoles !== "undefined" && DemandasRoles.isDisabled?.(e)) {
    toast("Habilite o usuário antes de alterar");
    return;
  }
  const newRole = String(role || "projetista").trim().toLowerCase();
  const check =
    typeof DemandasRoles !== "undefined"
      ? DemandasRoles.canChangeRole(e, newRole)
      : { ok: true };
  if (!check.ok) {
    toast(check.reason || "Não foi possível alterar o papel");
    return;
  }
  const papelAtual = typeof DemandasRoles !== "undefined" ? DemandasRoles.roleForEmail?.(e) : null;
  const rotulo = (r) => (typeof DemandasRoles !== "undefined" && DemandasRoles.ROLE_LABELS?.[r]) || r;
  // Rebaixar a si mesmo tira a aba Usuários na hora; promover a admin dá acesso a tudo. Confirma os dois.
  if (e === getCurrentUserEmail() && papelAtual === "admin" && newRole !== "admin") {
    const ok = await confirmDialog({
      title: "Deixar de ser administrador?",
      message: `Você vai passar a ${rotulo(newRole)} e perde o acesso a esta tela assim que salvar.`,
      hint: "Só outro administrador poderá devolver o seu acesso.",
      confirmText: `Mudar para ${rotulo(newRole)}`,
      variant: "danger",
    });
    if (!ok) return;
  } else if (newRole === "admin" && papelAtual !== "admin") {
    const ok = await confirmDialog({
      title: "Dar acesso de administrador?",
      message: `«${e}» vai poder gerenciar usuários, backups e todas as demandas.`,
      confirmText: "Tornar administrador",
      variant: "warn",
    });
    if (!ok) return;
  }
  let reg =
    typeof DemandasRoles !== "undefined" && DemandasRoles.normalizeRegionalValue
      ? DemandasRoles.normalizeRegionalValue(regional)
      : String(regional || "").trim();
  if (reg && !REGIONAIS_ORDER.includes(reg)) {
    toast("Regional inválida");
    return;
  }
  const nomeNorm = normalizeAccountDisplayName(nome);
  const acessosAntes = snapshotAcessos();
  const map = { ...(typeof DemandasRoles !== "undefined" ? DemandasRoles.getRolesMap() : {}) };
  map[e] = newRole;
  const regionals = {
    ...(typeof DemandasRoles !== "undefined" ? DemandasRoles.getRegionalsMap?.() || {} : {}),
  };
  if (reg) regionals[e] = reg;
  else delete regionals[e];
  const names = {
    ...(typeof DemandasRoles !== "undefined" ? DemandasRoles.getNamesMap?.() || {} : {}),
  };
  if (nomeNorm) names[e] = nomeNorm;
  else delete names[e];
  if (typeof DemandasRoles !== "undefined") {
    DemandasRoles.setRegionalsMap(regionals);
    DemandasRoles.setNamesMap(names);
    if (esteira !== undefined && DemandasRoles.setHomesMap) {
      const homes = DemandasRoles.getHomesMap?.() || {};
      if (esteira === "b2b") homes[e] = { esteira: "b2b" };
      else delete homes[e];
      DemandasRoles.setHomesMap(homes);
    }
  }
  try {
    await persistRolesMap(map);
    // Só depois de gravar na nuvem: se falhar, a linha continua marcada com as alterações.
    usuariosRascunhos.delete(e);
    usuariosAbertas.delete(e);
    renderUsuariosPanel();
    registrarMudancasDeAcesso(acessosAntes);
    toast("Dados da conta salvos");
  } catch (err) {
    restaurarAcessos(acessosAntes);
    toast(err?.message || "Falha ao salvar");
  }
}

async function saveUserRole(email, newRole) {
  await saveUserAccess(email, { role: newRole });
}

async function toggleUserDisabled(email) {
  if (!isAdminUser()) {
    toast("Apenas administrador");
    return;
  }
  if (avisarAcessosCarregando()) return;
  const e = String(email).trim().toLowerCase();
  const currentlyDisabled = typeof DemandasRoles !== "undefined" && DemandasRoles.isDisabled?.(e);
  const nextDisabled = !currentlyDisabled;
  const check =
    typeof DemandasRoles !== "undefined"
      ? DemandasRoles.canToggleDisabled(e, nextDisabled)
      : { ok: true };
  if (!check.ok) {
    toast(check.reason || "Não foi possível alterar");
    return;
  }
  if (nextDisabled) {
    const ok = await confirmDialog({
      title: "Desabilitar usuário?",
      message: `«${e}» permanece no sistema, mas sem acesso operacional e fora da lista de projetistas.`,
      hint: "Demandas já atribuídas a ele continuam; você pode redistribuí-las depois.",
      confirmText: "Desabilitar",
      variant: "danger",
    });
    if (!ok) return;
  }
  const acessosAntes = snapshotAcessos();
  const disabled = {
    ...(typeof DemandasRoles !== "undefined" ? DemandasRoles.getDisabledMap() : {}),
  };
  if (nextDisabled) disabled[e] = true;
  else delete disabled[e];
  if (typeof DemandasRoles !== "undefined") DemandasRoles.setDisabledMap(disabled);
  try {
    const map = { ...(typeof DemandasRoles !== "undefined" ? DemandasRoles.getRolesMap() : {}) };
    await persistRolesMap(map);
    // Garante estado local após sync (snapshot atrasado não deve reverter).
    if (typeof DemandasRoles !== "undefined") DemandasRoles.setDisabledMap(disabled);
    usuariosRascunhos.delete(e);
    renderUsuariosPanel();
    registrarMudancasDeAcesso(acessosAntes);
    if (nextDisabled) clearEditingPresenceForEmail(e);
    toast(nextDisabled ? "Usuário desabilitado" : "Usuário habilitado");
  } catch (err) {
    // Reverte UI se a nuvem falhou
    if (typeof DemandasRoles !== "undefined") {
      const rollback = { ...(DemandasRoles.getDisabledMap() || {}) };
      if (nextDisabled) delete rollback[e];
      else rollback[e] = true;
      DemandasRoles.setDisabledMap(rollback);
      renderUsuariosPanel();
    }
    toast(err?.message || "Falha ao atualizar");
  }
}

async function removeUserFromSystem(email) {
  if (!isAdminUser()) {
    toast("Apenas administrador");
    return;
  }
  if (avisarAcessosCarregando()) return;
  const e = String(email).trim().toLowerCase();
  const check =
    typeof DemandasRoles !== "undefined" ? DemandasRoles.canRemoveUser(e) : { ok: true };
  if (!check.ok) {
    toast(check.reason || "Não foi possível remover");
    return;
  }
  const emailsMapa = Object.keys(typeof DemandasRoles !== "undefined" ? DemandasRoles.getRolesMap() : {});
  const indice = indiceDemandasPorConta(emailsMapa);
  const assigned = indice.certas(e);
  const exemplos = (lista) =>
    lista
      .slice(0, 3)
      .map((d) => d.titulo || d.nome || d.id)
      .join(", ");
  if (assigned.length) {
    const sample = exemplos(assigned);
    await confirmDialog({
      title: "Não é possível remover",
      message: `«${e}» ainda tem ${assigned.length} demanda${assigned.length > 1 ? "s" : ""} atribuída${assigned.length > 1 ? "s" : ""}${sample ? ` (ex.: ${sample})` : ""}.`,
      hint: "Redistribua as demandas ou use Desabilitar para manter a conta sem acesso.",
      confirmText: "Entendi",
      cancelText: "",
      variant: "danger",
    });
    return;
  }
  // Demandas com um nome que também pode ser de outra conta (ex.: «Rafael» de antes de haver dois Rafaéis).
  const ambiguas = indice.ambiguas(e);
  const outros = indice.outrosComMesmoNome(e);
  const ok = await confirmDialog({
    title: "Remover do sistema?",
    message: `«${e}» será retirado da lista de acessos e não conseguirá usar o sistema.`,
    hint: ambiguas.length
      ? `Atenção: ${ambiguas.length} demanda${ambiguas.length > 1 ? "s têm" : " tem"} um nome que pode ser desta conta ou de ${outros.join(", ") || "outra conta"}${exemplos(ambiguas) ? ` (ex.: ${exemplos(ambiguas)})` : ""}. Confira antes de remover.`
      : "A conta no Authentication do Firebase permanece (não dá para apagar daqui). Para excluir de vez, use o Console Firebase → Authentication.",
    confirmText: "Remover do sistema",
    variant: "danger",
  });
  if (!ok) return;
  const acessosAntes = snapshotAcessos();
  const map = { ...(typeof DemandasRoles !== "undefined" ? DemandasRoles.getRolesMap() : {}) };
  delete map[e];
  const disabled = {
    ...(typeof DemandasRoles !== "undefined" ? DemandasRoles.getDisabledMap() : {}),
  };
  delete disabled[e];
  const purged = {
    ...(typeof DemandasRoles !== "undefined" ? DemandasRoles.getPurgedMap() : {}),
    [e]: true,
  };
  if (typeof DemandasRoles !== "undefined") {
    DemandasRoles.setDisabledMap(disabled);
    DemandasRoles.setPurgedMap(purged);
    const regionals = { ...(DemandasRoles.getRegionalsMap?.() || {}) };
    delete regionals[e];
    DemandasRoles.setRegionalsMap(regionals);
    const names = { ...(DemandasRoles.getNamesMap?.() || {}) };
    delete names[e];
    DemandasRoles.setNamesMap(names);
    const homes = DemandasRoles.getHomesMap?.() || {};
    delete homes[e];
    DemandasRoles.setHomesMap?.(homes);
  }
  try {
    await persistRolesMap(map);
    usuariosRascunhos.delete(e);
    registrarMudancasDeAcesso(acessosAntes);
    clearEditingPresenceForEmail(e);
    toast("Usuário removido da lista de acessos");
  } catch (err) {
    restaurarAcessos(acessosAntes);
    toast(err?.message || "Falha ao remover");
  }
}

async function bootstrap() {
  setSyncStatus("connecting");
  const loader = document.getElementById("appLoader");
  if (loader) loader.hidden = false;
  persistenceReady = false;

  const localFirst = DemandasFirebase.loadLocal?.();
  if (localFirst?.demandas?.length) {
    applyLoadedState(localFirst);
    refreshAllViews();
  }

  const forceHideLoader = setTimeout(hideAppLoader, 12000);

  try {
    persistenceApi = await DemandasFirebase.init({
      onData(data) {
        handleRemoteData(data);
      },
      onStatus: setSyncStatus,
      onRoles() {
        applyRoleUi();
        void enforceAccessOrSignOut();
        if (pendingApplyRegionalOnRoles) {
          pendingApplyRegionalOnRoles = false;
          applyUserRegionalFilter(DemandasAuth?.currentUser?.());
          aplicarEsteiraInicialDaNuvem(DemandasAuth?.currentUser?.());
          if (panels.esteira && !panels.esteira.hidden) renderBoard();
        }
        if (usuariosModalAberto()) renderUsuariosPanel();
      },
    });
    persistenceReady = persistenceApi.mode === "firebase";
    flushPendingCloudSave();
    if (persistenceApi.mode === "firebase") {
      toast("Conectado à nuvem");
    } else {
      toast(window.__demandasSyncHint || "Dados só neste navegador");
    }
  } catch (e) {
    console.error(e);
    setSyncStatus("error");
    const local = DemandasFirebase.loadLocal?.();
    if (local) applyLoadedState(local);
    persistenceReady = false;
    persistenceApi = null;
    appBootstrapped = false;
    toast(window.__demandasSyncHint || e.message || "Erro ao sincronizar — exibindo cópia local se houver");
  } finally {
    clearTimeout(forceHideLoader);
    hideAppLoader();
    refreshAllViews();
    updateEsteiraStatusLine();
    if (persistenceApi?.mode === "firebase") {
      /* emitToUi já chama synced; fallback se ainda vazio */
    } else if (!persistenceApi) {
      setSyncStatus(window.__demandasSyncHint ? "error" : "local");
    }
  }
}

function updateEsteiraStatusLine() {
  const el = document.getElementById("esteiraStatusLine");
  syncEsteiraFiltrosUi();
  if (!el) return;
  const n = state.demandas.length;
  if (n === 0) {
    el.innerHTML = `<p class="esteira-resumo__vazio">Nenhuma demanda carregada. Verifique o status de sincronização no topo ou importe os dados.</p>`;
    return;
  }
  const linha = activeEsteiraCanal;
  const base = filteredDemandasForEsteira(linha, { rapido: false });
  const finals = new Set(statusFinalizadosKeys(linha));
  const modo = esteiraModoColunas;
  const visiveis = base.filter((d) => {
    const fin = finals.has(d.status);
    if (modo === ESTEIRA_MODO_FINALIZADOS) return fin;
    if (modo === ESTEIRA_MODO_TODOS) return true;
    return !fin;
  });
  const nFinOcultos = modo === ESTEIRA_MODO_ATIVOS ? base.length - visiveis.length : 0;
  const mostrando = esteiraFiltroRapido
    ? visiveis.filter((d) => ESTEIRA_FILTROS_RAPIDOS[esteiraFiltroRapido]?.test(d)).length
    : visiveis.length;
  const chips = Object.entries(ESTEIRA_FILTROS_RAPIDOS)
    .map(([key, cfg]) => {
      const qtd = visiveis.filter(cfg.test).length;
      const ativo = esteiraFiltroRapido === key;
      if (!qtd && !ativo) return "";
      return (
        `<button type="button" class="resumo-chip resumo-chip--${cfg.tom}${ativo ? " is-ativo" : ""}" data-rapido="${key}" aria-pressed="${ativo}"` +
        ` title="${ativo ? "Clique para mostrar todos" : "Clique para filtrar"}">` +
        `<b>${qtd}</b> ${escapeHtml(cfg.label)}${ativo ? ' <span aria-hidden="true">✕</span>' : ""}</button>`
      );
    })
    .join("");
  const total =
    `<span class="esteira-resumo__total"><b>${mostrando}</b> ${mostrando === 1 ? "projeto" : "projetos"}` +
    (esteiraFiltroRapido || mostrando !== visiveis.length ? ` <span class="muted">de ${visiveis.length}</span>` : "") +
    (nFinOcultos ? ` <span class="muted">· ${nFinOcultos} finalizado(s) oculto(s)</span>` : "") +
    `</span>`;
  el.innerHTML = total + (chips
      ? `<span class="esteira-resumo__chips">${chips}</span>`
      : visiveis.length
        ? `<span class="esteira-resumo__ok">✓ Nenhum atraso ou pendência</span>`
        : "");
}

let brandMigrateClicks = 0;

/* ---------- Login / bootstrap ---------- */
function showLoginScreen() {
  const loginScreen = document.getElementById("loginScreen");
  const appRoot = document.getElementById("appRoot");
  if (loginScreen) loginScreen.hidden = false;
  if (appRoot) appRoot.hidden = true;
  hideAppLoader();
}

function setAuthUi(user) {
  const loginScreen = document.getElementById("loginScreen");
  const appRoot = document.getElementById("appRoot");
  const emailEl = document.getElementById("authUserEmail");
  const roleEl = document.getElementById("authUserRole");
  const btnOut = document.getElementById("btnSignOut");
  if (user) {
    if (loginScreen) loginScreen.hidden = true;
    if (appRoot) appRoot.hidden = false;
    setSyncStatus("connecting");
    if (emailEl) {
      emailEl.textContent = user.email || "Usuario";
      emailEl.hidden = false;
    }
    if (btnOut) btnOut.hidden = false;
    updateUserMenuAvatar(user.email);
    applyRoleUi();
  } else {
    const syncEl = document.getElementById("syncBadge");
    if (syncEl) syncEl.hidden = true;
    showLoginScreen();
    if (emailEl) emailEl.hidden = true;
    if (roleEl) roleEl.hidden = true;
    if (btnOut) btnOut.hidden = true;
    appRoot?.classList.remove("app--readonly", "app--admin");
    appBootstrapped = false;
    persistenceApi = null;
    persistenceReady = false;
    if (typeof DemandasFirebase?.teardown === "function") DemandasFirebase.teardown();
  }
}

async function startAppOnce() {
  if (persistenceApi) return;
  if (bootstrapPromise) return bootstrapPromise;
  bootstrapPromise = (async () => {
    appBootstrapped = true;
    const loader = document.getElementById("appLoader");
    if (loader) loader.hidden = false;
    try {
      await bootstrap();
    } catch (e) {
      appBootstrapped = false;
      throw e;
    } finally {
      hideAppLoader();
      bootstrapPromise = null;
    }
  })();
  return bootstrapPromise;
}

/** Garante Firestore/local após login (evita tela vazia se o 1º bootstrap falhou). */
async function ensureDataAfterLogin(user) {
  if (!user) return;
  if (!persistenceApi) {
    await startAppOnce();
    if (!persistenceApi) return;
  }
  if (!state.demandas.length) {
    setSyncStatus(persistenceApi?.mode === "firebase" ? "empty" : "local");
  }
  refreshAllViews();
}

function showLoginError(msg) {
  const el = document.getElementById("loginError");
  if (!el) return;
  if (msg) {
    el.textContent = msg;
    el.hidden = false;
  } else {
    el.textContent = "";
    el.hidden = true;
  }
}

function setLoginLoading(loading) {
  const btn = document.getElementById("btnLoginSubmit");
  if (!btn) return;
  btn.disabled = loading;
  btn.textContent = loading ? "Entrando…" : "Entrar";
}

let pendingApplyRegionalOnRoles = false;

async function handleAuthUser(user) {
  if (!user) {
    handleAuthPromise = null;
    pendingApplyRegionalOnRoles = false;
    setAuthUi(user);
    appBootstrapped = false;
    return;
  }
  if (handleAuthPromise) return handleAuthPromise;

  handleAuthPromise = (async () => {
    pendingApplyRegionalOnRoles = true;
    setAuthUi(user);
    applyUserHomeOnLogin(user);
    await startAppOnce();
    await ensureDataAfterLogin(user);
    if (await enforceAccessOrSignOut()) return;
    if (pendingApplyRegionalOnRoles) {
      pendingApplyRegionalOnRoles = false;
      applyUserRegionalFilter(user);
      aplicarEsteiraInicialDaNuvem(user);
      if (panels.esteira && !panels.esteira.hidden) renderBoard();
    }
  })();

  try {
    await handleAuthPromise;
  } catch (e) {
    console.error(e);
    appBootstrapped = false;
    hideAppLoader();
    setSyncStatus("error");
    const msg = window.__demandasSyncHint || e.message || "Erro ao carregar os dados.";
    toast(msg);
    refreshAllViews();
    updateEsteiraStatusLine();
  } finally {
    handleAuthPromise = null;
  }
}

async function doLogin() {
  if (typeof DemandasAuth === "undefined") {
    showLoginError("Módulo de login não carregou. Recarregue a página (Ctrl+F5).");
    return;
  }
  showLoginError("");
  const email = document.getElementById("loginEmail")?.value?.trim() || "";
  const password = document.getElementById("loginPassword")?.value || "";
  if (!email || !password) {
    showLoginError("Informe e-mail e senha.");
    return;
  }
  setLoginLoading(true);
  try {
    await DemandasAuth.signIn(email, password);
    const user = DemandasAuth.currentUser();
    if (user) await handleAuthUser(user);
    else showLoginError("Login concluído, mas a sessão não foi reconhecida. Tente novamente.");
  } catch (err) {
    console.error("Login:", err);
    showLoginError(DemandasAuth.mapAuthError(err));
  } finally {
    setLoginLoading(false);
  }
}

function bindLoginUi() {
  initShellUi();
  document.querySelectorAll("[data-sign-out]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      setUserMenuOpen(false);
      document.getElementById("modalUserConta")?.close();
      document.getElementById("panelUsuarios")?.close();
      try {
        await DemandasAuth.signOut();
        toast("Sessão encerrada");
      } catch (err) {
        toast(DemandasAuth.mapAuthError(err));
      }
    });
  });
}

async function initAuthGate() {
  if (typeof DemandasAuth === "undefined") {
    showLoginScreen();
    showLoginError("Arquivo firebase-auth.js não encontrado. Faça deploy do site atualizado.");
    return;
  }

  if (!DemandasAuth.isConfigured()) {
    const loginScreen = document.getElementById("loginScreen");
    if (loginScreen) loginScreen.hidden = true;
    document.getElementById("appRoot").hidden = false;
    hideAppLoader();
    await startAppOnce();
    return;
  }

  showLoginScreen();

  try {
    await DemandasAuth.init(handleAuthUser);
  } catch (e) {
    console.error(e);
    showLoginError(DemandasAuth.mapAuthError(e) || e.message || "Erro ao iniciar autenticação.");
  }
}
