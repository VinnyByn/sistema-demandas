/**
 * Administração de usuários, login e inicialização.
 * Só declarações (funções e constantes); o que roda ao abrir a página fica em app.js.
 */
function hideAppLoader() {
  const loader = document.getElementById("appLoader");
  if (loader) loader.hidden = true;
}

/* ---------- Usuarios (somente admin) ---------- */
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

function fillUserNovoRegionalSelect() {
  const sel = document.getElementById("userNovoRegional");
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = regionalOptionsHtml(cur);
  syncNovoUsuarioHint();
}

function syncNovoUsuarioHint() {
  const el = document.getElementById("userNovoHint");
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
  el.textContent = `${papel} ${regiao}`;
}

function renderUsuariosPanel() {
  const list = document.getElementById("usuariosList");
  const panel = document.getElementById("panelUsuarios");
  if (!list || !panel) return;
  if (!isAdminUser()) {
    list.innerHTML = '<p class="muted">Acesso restrito ao administrador.</p>';
    return;
  }
  fillUserNovoRegionalSelect();
  const map =
    typeof DemandasRoles !== "undefined" ? DemandasRoles.getRolesMap() : { ...(window.DEMANDAS_ROLES_SEED || {}) };
  const emails = Object.keys(map).sort((a, b) => a.localeCompare(b, "pt-BR"));
  if (!emails.length) {
    list.innerHTML = '<p class="muted">Nenhum usuario no mapa de papeis.</p>';
    return;
  }
  list.innerHTML = emails
    .map((email) => {
      const role = map[email];
      const regional =
        typeof DemandasRoles !== "undefined" && DemandasRoles.regionalForEmail
          ? DemandasRoles.regionalForEmail(email)
          : "";
      const disabled = typeof DemandasRoles !== "undefined" && DemandasRoles.isDisabled?.(email);
      const assigned = demandasAssignedToEmail(email).length;
      const status = disabled
        ? `<span class="usuarios-row__status usuarios-row__status--off">Desabilitado</span>`
        : `<span class="usuarios-row__status usuarios-row__status--on">Ativo</span>`;
      const toggleLabel = disabled ? "Habilitar" : "Desabilitar";
      const demandasTxt = assigned
        ? `${assigned} demanda${assigned > 1 ? "s" : ""}`
        : "Sem demandas";
      const regVal = regional || "";
      const nomeAtual = accountDisplayNameForEmail(email);
      const nomeSalvo =
        typeof DemandasRoles !== "undefined" && DemandasRoles.displayNameForEmail
          ? DemandasRoles.displayNameForEmail(email)
          : "";
      const tituloConta = nomeSalvo || nomeAtual || email;
      const mostraEmailAbaixo = tituloConta.toLowerCase() !== String(email).toLowerCase();
      return (
        `<div class="usuarios-row${disabled ? " is-disabled" : ""}" data-email="${escapeHtml(email)}" data-role="${escapeHtml(role)}" data-regional="${escapeHtml(regVal)}" data-nome="${escapeHtml(nomeAtual)}">` +
        `<div class="usuarios-row__head">` +
        `<div class="usuarios-row__id">` +
        `<span class="usuarios-row__email">${escapeHtml(tituloConta)}</span>` +
        (mostraEmailAbaixo ? `<span class="usuarios-row__mail muted">${escapeHtml(email)}</span>` : "") +
        `<span class="usuarios-row__sub">${status}<span class="usuarios-row__meta muted">${demandasTxt}</span></span>` +
        `</div>` +
        `<div class="usuarios-row__more">` +
        `<button type="button" class="icon-btn user-row-more" aria-label="Mais ações de ${escapeHtml(email)}" aria-expanded="false" aria-haspopup="menu">⋯</button>` +
        `<div class="usuarios-row__menu" role="menu" hidden>` +
        `<button type="button" class="user-role-reset" role="menuitem">Recuperar senha</button>` +
        `<button type="button" class="user-role-toggle" role="menuitem">${toggleLabel}</button>` +
        `<button type="button" class="user-role-del" role="menuitem">Remover</button>` +
        `</div></div></div>` +
        `<div class="usuarios-row__edit">` +
        `<label><span>Nome</span><input type="text" class="user-nome-input" maxlength="80" value="${escapeHtml(nomeAtual)}" placeholder="Nome da conta" aria-label="Nome de ${escapeHtml(email)}"${disabled ? " disabled" : ""} /></label>` +
        `<label><span>Papel</span><select class="user-role-select" aria-label="Papel de ${escapeHtml(email)}"${disabled ? " disabled" : ""}>${roleOptionsHtml(role)}</select></label>` +
        `<label><span>Regional</span><select class="user-regional-select" aria-label="Regional de ${escapeHtml(email)}"${disabled ? " disabled" : ""}>${regionalOptionsHtml(regional)}</select></label>` +
        `<button type="button" class="btn btn--primary btn--sm user-role-save" disabled>Salvar</button>` +
        `</div></div>`
      );
    })
    .join("");

  const busca = document.getElementById("usuariosBusca");
  const q = String(busca?.value || "").trim().toLowerCase();
  list.querySelectorAll(".usuarios-row").forEach((row) => {
    const email = row.dataset.email;
    if (q) {
      const nomeTxt = String(row.querySelector(".user-nome-input")?.value || row.dataset.nome || "").toLowerCase();
      row.hidden = !String(email || "").includes(q) && !nomeTxt.includes(q);
    }
    const syncDirty = () => {
      const role = row.querySelector(".user-role-select")?.value || "";
      const regional = row.querySelector(".user-regional-select")?.value || "";
      const nome = normalizeAccountDisplayName(row.querySelector(".user-nome-input")?.value || "");
      const dirty =
        role !== (row.dataset.role || "") ||
        regional !== (row.dataset.regional || "") ||
        nome !== normalizeAccountDisplayName(row.dataset.nome || "");
      const btn = row.querySelector(".user-role-save");
      if (btn) btn.disabled = !dirty;
    };
    row.querySelector(".user-role-select")?.addEventListener("change", syncDirty);
    row.querySelector(".user-regional-select")?.addEventListener("change", syncDirty);
    row.querySelector(".user-nome-input")?.addEventListener("input", syncDirty);
    row.querySelector(".user-row-more")?.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const menu = row.querySelector(".usuarios-row__menu");
      const open = menu?.hidden !== false;
      closeUserRowMenus();
      if (menu && open) {
        menu.hidden = false;
        ev.currentTarget.setAttribute("aria-expanded", "true");
      }
    });
    row.querySelector(".user-role-save")?.addEventListener("click", () => {
      void saveUserAccess(email, {
        role: row.querySelector(".user-role-select")?.value,
        regional: row.querySelector(".user-regional-select")?.value,
        nome: row.querySelector(".user-nome-input")?.value,
      });
    });
    row.querySelector(".user-role-reset")?.addEventListener("click", () => {
      closeUserRowMenus();
      void sendUserPasswordReset(email);
    });
    row.querySelector(".user-role-toggle")?.addEventListener("click", () => {
      closeUserRowMenus();
      void toggleUserDisabled(email);
    });
    row.querySelector(".user-role-del")?.addEventListener("click", () => {
      closeUserRowMenus();
      void removeUserFromSystem(email);
    });
  });
  bindUsuariosBusca();
}

function closeUserRowMenus() {
  document.querySelectorAll(".usuarios-row__menu").forEach((menu) => {
    menu.hidden = true;
    menu.previousElementSibling?.setAttribute("aria-expanded", "false");
  });
}

let usuariosBuscaBound = false;
function bindUsuariosBusca() {
  if (usuariosBuscaBound) return;
  usuariosBuscaBound = true;
  document.getElementById("usuariosBusca")?.addEventListener("input", () => {
    if (usuariosModalAberto()) renderUsuariosPanel();
  });
  document.addEventListener("click", (ev) => {
    if (ev.target.closest(".usuarios-row__more")) return;
    closeUserRowMenus();
  });
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
    toast(`E-mail de recuperação enviado para ${e}`);
  } catch (err) {
    toast(err?.message || "Falha ao enviar recuperação");
  }
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

async function saveUserAccess(email, { role, regional, nome } = {}) {
  if (!isAdminUser()) {
    toast("Apenas administrador");
    return;
  }
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
  let reg =
    typeof DemandasRoles !== "undefined" && DemandasRoles.normalizeRegionalValue
      ? DemandasRoles.normalizeRegionalValue(regional)
      : String(regional || "").trim();
  if (reg && !REGIONAIS_ORDER.includes(reg)) {
    toast("Regional inválida");
    return;
  }
  const nomeNorm = normalizeAccountDisplayName(nome);
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
  }
  try {
    await persistRolesMap(map);
    toast("Dados da conta salvos");
  } catch (err) {
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
    renderUsuariosPanel();
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
  const e = String(email).trim().toLowerCase();
  const check =
    typeof DemandasRoles !== "undefined" ? DemandasRoles.canRemoveUser(e) : { ok: true };
  if (!check.ok) {
    toast(check.reason || "Não foi possível remover");
    return;
  }
  const assigned = demandasAssignedToEmail(e);
  if (assigned.length) {
    const sample = assigned
      .slice(0, 3)
      .map((d) => d.titulo || d.nome || d.id)
      .join(", ");
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
  const ok = await confirmDialog({
    title: "Remover do sistema?",
    message: `«${e}» será retirado da lista de acessos e não conseguirá usar o sistema.`,
    hint: "A conta no Authentication do Firebase permanece (não dá para apagar daqui). Para excluir de vez, use o Console Firebase → Authentication.",
    confirmText: "Remover do sistema",
    variant: "danger",
  });
  if (!ok) return;
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
  }
  try {
    await persistRolesMap(map);
    clearEditingPresenceForEmail(e);
    toast("Usuário removido da lista de acessos");
  } catch (err) {
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
