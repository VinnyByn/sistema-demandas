/**
 * Papéis, conta do usuário, aparência, presença de edição e históricos.
 * Só declarações (funções e constantes); o que roda ao abrir a página fica em app.js.
 */
/** Nome de conta salvo pelo administrador; senão o do login ou o do e-mail. */
function normalizeAccountDisplayName(name) {
  if (typeof DemandasRoles !== "undefined" && DemandasRoles.normalizeDisplayName) {
    return DemandasRoles.normalizeDisplayName(name);
  }
  return String(name || "").replace(/\s+/g, " ").trim();
}

function accountNameFromEmail(email) {
  const e = String(email || "").trim();
  if (!e) return "";
  const local = e.split("@")[0] || e;
  const label = local.replace(/[._-]+/g, " ").trim();
  if (!label) return e;
  return label.replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function accountDisplayNameForEmail(email) {
  const e = String(email || "")
    .trim()
    .toLowerCase();
  if (!e) return "";
  const stored =
    typeof DemandasRoles !== "undefined" && DemandasRoles.displayNameForEmail
      ? DemandasRoles.displayNameForEmail(e)
      : "";
  if (stored) return stored;
  const user = typeof DemandasAuth !== "undefined" ? DemandasAuth.currentUser?.() : null;
  if (user && String(user.email || "").trim().toLowerCase() === e) {
    const authName = String(user.displayName || "").trim();
    if (authName) return authName;
  }
  return accountNameFromEmail(email);
}

/** Nome exibido nos comentários — usuário logado, não o projetista da demanda. */
function getLoggedInComentarioAutor() {
  const user = typeof DemandasAuth !== "undefined" ? DemandasAuth.currentUser() : null;
  if (!user) return "Equipe";
  const name = accountDisplayNameForEmail(user.email);
  return name || "Equipe";
}

const PRESENCE_TTL_MS = 3 * 60 * 1000;
const PRESENCE_HEARTBEAT_MS = 90 * 1000;

function getCurrentUserEmail() {
  const user = typeof DemandasAuth !== "undefined" ? DemandasAuth.currentUser?.() : null;
  return String(user?.email || "")
    .trim()
    .toLowerCase();
}

function currentRoleInfo() {
  if (typeof DemandasRoles === "undefined") {
    return {
      email: getCurrentUserEmail(),
      role: "projetista",
      label: "Projetista",
      isAdmin: false,
      isReadOnly: false,
    };
  }
  return DemandasRoles.resolve(DemandasAuth?.currentUser?.() || { email: getCurrentUserEmail() });
}

function canRole(action) {
  if (typeof DemandasRoles === "undefined") return true;
  return DemandasRoles.can(action);
}

function isReadOnlyUser() {
  return !!currentRoleInfo().isReadOnly;
}

function isAdminUser() {
  return !!currentRoleInfo().isAdmin;
}

function requireWriteAccess(action = "write") {
  if (canRole(action)) return true;
  const info = currentRoleInfo();
  toast(
    info.isBlocked
      ? "Seu acesso foi removido do sistema"
      : info.isDisabled
        ? "Sua conta está desabilitada"
        : "Seu perfil (Visibilidade) é somente leitura",
  );
  return false;
}

function clearEditingPresenceForEmail(email) {
  const e = String(email || "")
    .trim()
    .toLowerCase();
  if (!e) return;
  for (const d of state.demandas || []) {
    const eb = normalizeEditingBy(d.editingBy);
    if (eb?.email === e) setDemandaEditingBy(d.id, null);
  }
}

async function enforceAccessOrSignOut() {
  const info = currentRoleInfo();
  if (!info?.email || !info.isBlocked) return false;
  const msg =
    "Seu acesso foi removido do sistema. Peça ao administrador para adicionar seu e-mail na lista de usuários.";
  try {
    if (typeof DemandasAuth?.signOut === "function") await DemandasAuth.signOut();
  } catch (_) {}
  showLoginScreen();
  showLoginError(msg);
  toast(msg);
  return true;
}

function applyRoleUi(opts = {}) {
  const info = currentRoleInfo();
  const appRoot = document.getElementById("appRoot");
  const roleEl = document.getElementById("authUserRole");
  const tabUsers = document.getElementById("btnMenuUsuarios");
  if (appRoot) {
    appRoot.classList.toggle("app--readonly", info.isReadOnly || info.isBlocked);
    appRoot.classList.toggle("app--admin", !!info.isAdmin);
  }
  if (roleEl) {
    if (info.email) {
      roleEl.hidden = false;
      roleEl.textContent = info.label;
      roleEl.dataset.role = info.role;
    } else {
      roleEl.hidden = true;
    }
  }
  if (tabUsers) tabUsers.hidden = !info.isAdmin;
  if (!info.isAdmin && usuariosModalAberto()) {
    document.getElementById("panelUsuarios")?.close();
  }
  const exportMenu = document.getElementById("exportMenu");
  const importMenu = document.getElementById("importMenu");
  if (exportMenu) exportMenu.hidden = !info.isAdmin;
  if (importMenu) importMenu.hidden = !info.isAdmin;
  if (!info.isAdmin) {
    setExportMenuOpen(false);
    setImportMenuOpen(false);
  }
  updateUserMenuAvatar(info.email);
  if (!opts.light) fillContaScreen();
  // Evita recriar selects e painel de usuários a cada sync da esteira.
  if (!opts.light) {
    refreshProjetistaAssignmentLists();
    if (info.isAdmin && usuariosModalAberto()) renderUsuariosPanel();
  }
}

function userInitialsFromEmail(email) {
  const nome = accountDisplayNameForEmail(email);
  if (nome && !nome.includes("@")) {
    const parts = nome.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    if (parts[0]) return parts[0].slice(0, 2).toUpperCase();
  }
  const local = String(email || "").split("@")[0].trim();
  const parts = local.split(/[.\-_]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (local.slice(0, 2) || "?").toUpperCase();
}

function updateUserMenuAvatar(email) {
  const el = document.getElementById("userMenuAvatar");
  const initials = userInitialsFromEmail(email);
  if (el) el.textContent = initials;
  const btn = document.getElementById("btnUserMenu");
  if (btn) btn.title = email ? `${email} — Minha conta` : "Minha conta";
}

function currentTheme() {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

function chartInk() {
  const light = document.documentElement.getAttribute("data-theme") === "light";
  return light
    ? { tick: "#475569", label: "#1e293b", grid: "rgba(15, 23, 42, 0.08)" }
    : { tick: "#94a3b8", label: "#cbd5e1", grid: "rgba(148, 163, 184, 0.12)" };
}

function applyTheme(theme) {
  const t = theme === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", t);
  try {
    localStorage.setItem("demandas-theme", t);
  } catch (_) {}
  const toggle = document.getElementById("themeToggle");
  if (toggle) toggle.checked = t === "light";
  const dash = document.getElementById("panelDashboard");
  if (dash && !dash.hidden && typeof renderDashboard === "function") renderDashboard();
}

/* ---------- Acessibilidade: tamanho do texto e animações ---------- */
const FONTE_OPCOES = { normal: "Normal", grande: "Grande", maior: "Maior" };

function applyFonte(fonte) {
  const f = FONTE_OPCOES[fonte] ? fonte : "normal";
  if (f === "normal") document.documentElement.removeAttribute("data-fonte");
  else document.documentElement.setAttribute("data-fonte", f);
  try {
    localStorage.setItem("demandas-fonte", f);
  } catch (_) {}
  document.querySelectorAll("#fonteSeg [data-fonte]").forEach((b) => {
    const on = b.dataset.fonte === f;
    b.classList.toggle("is-active", on);
    b.setAttribute("aria-checked", on ? "true" : "false");
    b.setAttribute("aria-label", `Texto ${FONTE_OPCOES[b.dataset.fonte].toLowerCase()}`);
  });
}

function applyMenosAnimacao(on) {
  if (on) document.documentElement.setAttribute("data-menos-animacao", "1");
  else document.documentElement.removeAttribute("data-menos-animacao");
  try {
    localStorage.setItem("demandas-menos-animacao", on ? "1" : "0");
  } catch (_) {}
  const t = document.getElementById("menosAnimacaoToggle");
  if (t) t.checked = !!on;
}

function initAparenciaAcessivel() {
  applyFonte(document.documentElement.getAttribute("data-fonte") || "normal");
  applyMenosAnimacao(document.documentElement.getAttribute("data-menos-animacao") === "1");
  document.getElementById("fonteSeg")?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-fonte]");
    if (b) applyFonte(b.dataset.fonte);
  });
  document.getElementById("menosAnimacaoToggle")?.addEventListener("change", (e) => applyMenosAnimacao(e.target.checked));
}

function isMobileShell() {
  return window.matchMedia("(max-width: 720px)").matches;
}

function applySidebarCollapsed(collapsed) {
  const app = document.getElementById("appRoot");
  const btn = document.getElementById("btnSidebarToggle");
  app?.classList.toggle("app--sidebar-collapsed", !!collapsed);
  if (btn) {
    btn.setAttribute("aria-pressed", collapsed ? "true" : "false");
    const tip = collapsed ? "Expandir menu" : "Recolher menu";
    btn.dataset.tip = tip;
    btn.setAttribute("aria-label", tip);
  }
  try {
    localStorage.setItem("demandas-sidebar-collapsed", collapsed ? "1" : "0");
  } catch (_) {}
}

function setMobileSidebarOpen(open) {
  const app = document.getElementById("appRoot");
  const backdrop = document.getElementById("sidebarBackdrop");
  app?.classList.toggle("is-sidebar-open", !!open);
  if (backdrop) backdrop.hidden = !open;
}

function setUserMenuOpen(open) {
  setDropdownMenuOpen("userMenuPanel", "btnUserMenu", open);
  document.getElementById("btnUserMenu")?.classList.toggle("is-active", !!open);
}

function fillContaScreen() {
  const info = currentRoleInfo();
  const nome = getLoggedInComentarioAutor();
  const primeiro = nome.split(" ")[0] || nome;
  const initials = userInitialsFromEmail(info.email);
  const emailEl = document.getElementById("userDadosEmail");
  const papelEl = document.getElementById("userDadosPapel");
  const regionalEl = document.getElementById("userDadosRegional");
  const emailTxt = info.email || "—";
  if (emailEl) emailEl.textContent = emailTxt;
  if (papelEl) papelEl.textContent = info.label || "—";
  const regional =
    typeof DemandasRoles !== "undefined" && DemandasRoles.regionalForEmail
      ? DemandasRoles.regionalForEmail(info.email)
      : "";
  if (regionalEl) regionalEl.textContent = regional || "Todas";
  const navNome = document.getElementById("contaNavNome");
  const perfilNome = document.getElementById("contaPerfilNome");
  const nomeCampo = document.getElementById("contaPerfilNomeCampo");
  const navSub = document.getElementById("contaNavSub");
  if (navNome) navNome.textContent = primeiro;
  if (perfilNome) perfilNome.textContent = nome;
  if (nomeCampo) nomeCampo.textContent = nome;
  if (navSub) navSub.textContent = `${info.label || "Conta"} · configurações da conta`;
  ["contaNavAvatar", "contaPerfilAvatar"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = initials;
  });
  const situacao = document.getElementById("contaSituacao");
  if (situacao) {
    situacao.classList.remove("is-warn", "is-off");
    if (info.isBlocked) {
      situacao.textContent = "Sem acesso";
      situacao.classList.add("is-off");
    } else if (info.isDisabled) {
      situacao.textContent = "Desabilitado";
      situacao.classList.add("is-off");
    } else if (info.isReadOnly) {
      situacao.textContent = "Somente leitura";
      situacao.classList.add("is-warn");
    } else {
      situacao.textContent = "Ativo";
    }
  }
  const toggle = document.getElementById("themeToggle");
  if (toggle) toggle.checked = currentTheme() === "light";
  const segEmail = document.getElementById("userSegurancaEmail");
  if (segEmail) segEmail.textContent = info.email || "—";
}

function syncTrocarSenhaForm() {
  const atual = document.getElementById("userSenhaAtual")?.value || "";
  const nova = document.getElementById("userSenhaNova")?.value || "";
  const nova2 = document.getElementById("userSenhaNova2")?.value || "";
  const hint = document.getElementById("userSenhaHint");
  const btn = document.getElementById("btnTrocarSenha");
  let msg = "Use ao menos 6 caracteres.";
  let state = "";
  if (nova && nova.length < 6) {
    msg = "A nova senha precisa de ao menos 6 caracteres.";
    state = "is-bad";
  } else if (nova && atual && nova === atual) {
    msg = "A nova senha precisa ser diferente da atual.";
    state = "is-bad";
  } else if (nova2 && nova !== nova2) {
    msg = "A confirmação não confere.";
    state = "is-bad";
  } else if (nova.length >= 6 && nova === nova2 && atual && nova !== atual) {
    msg = "Pronto para salvar.";
    state = "is-ok";
  }
  if (hint) {
    hint.textContent = msg;
    hint.classList.toggle("is-bad", state === "is-bad");
    hint.classList.toggle("is-ok", state === "is-ok");
  }
  if (btn && btn.dataset.busy !== "1") btn.disabled = state !== "is-ok";
}

function showContaPane(pane) {
  const titles = { perfil: "Perfil", seguranca: "Senha" };
  const next = titles[pane] ? pane : "perfil";
  document.querySelectorAll("[data-conta-pane]").forEach((btn) => {
    const on = btn.dataset.contaPane === next;
    btn.classList.toggle("is-active", on);
    if (on) btn.setAttribute("aria-current", "page");
    else btn.removeAttribute("aria-current");
  });
  document.querySelectorAll("[data-conta-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.contaPanel !== next;
  });
  const title = document.getElementById("contaPaneTitulo");
  if (title) title.textContent = titles[next];
}

function initShellUi() {
  try {
    applyTheme(localStorage.getItem("demandas-theme") === "light" ? "light" : currentTheme());
    applySidebarCollapsed(localStorage.getItem("demandas-sidebar-collapsed") === "1");
  } catch (_) {
    applyTheme(currentTheme());
  }
  document.getElementById("themeToggle")?.addEventListener("change", (e) => {
    applyTheme(e.target.checked ? "light" : "dark");
  });
  initAparenciaAcessivel();
  document.getElementById("btnSidebarToggle")?.addEventListener("click", () => {
    const app = document.getElementById("appRoot");
    applySidebarCollapsed(!app?.classList.contains("app--sidebar-collapsed"));
  });
  document.getElementById("btnSidebarOpen")?.addEventListener("click", () => setMobileSidebarOpen(true));
  document.getElementById("sidebarBackdrop")?.addEventListener("click", () => setMobileSidebarOpen(false));
  document.getElementById("btnUserMenu")?.addEventListener("click", (e) => {
    e.stopPropagation();
    setImportMenuOpen(false);
    setExportMenuOpen(false);
    setEsteiraTabMenuOpen(false);
    const panel = document.getElementById("userMenuPanel");
    setUserMenuOpen(panel?.hidden !== false);
  });
  document.querySelectorAll("[data-user-modal]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setUserMenuOpen(false);
      fillContaScreen();
      if (btn.dataset.userModal === "modalUserConta") showContaPane("perfil");
      document.getElementById(btn.dataset.userModal)?.showModal();
    });
  });
  document.querySelectorAll("[data-conta-pane]").forEach((btn) => {
    btn.addEventListener("click", () => showContaPane(btn.dataset.contaPane));
  });
  document.getElementById("btnMenuUsuarios")?.addEventListener("click", () => {
    setUserMenuOpen(false);
    openUsuariosModal();
  });
  document.querySelectorAll("[data-close-user-modal]").forEach((btn) => {
    btn.addEventListener("click", () => btn.closest("dialog")?.close());
  });
  document.querySelectorAll("[data-seg-eye]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = document.getElementById(btn.dataset.segEye);
      if (!input) return;
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.setAttribute("aria-label", show ? "Ocultar senha" : "Mostrar senha");
    });
  });
  ["userSenhaAtual", "userSenhaNova", "userSenhaNova2"].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", syncTrocarSenhaForm);
  });
  document.getElementById("formTrocarSenha")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = document.getElementById("userSenhaError");
    const ok = document.getElementById("userSenhaOk");
    const atual = document.getElementById("userSenhaAtual")?.value || "";
    const nova = document.getElementById("userSenhaNova")?.value || "";
    const nova2 = document.getElementById("userSenhaNova2")?.value || "";
    if (err) { err.hidden = true; err.textContent = ""; }
    if (ok) ok.hidden = true;
    if (nova.length < 6) {
      if (err) { err.hidden = false; err.textContent = "A nova senha precisa de ao menos 6 caracteres."; }
      return;
    }
    if (nova === atual) {
      if (err) { err.hidden = false; err.textContent = "A nova senha precisa ser diferente da atual."; }
      return;
    }
    if (nova !== nova2) {
      if (err) { err.hidden = false; err.textContent = "A confirmação não confere com a nova senha."; }
      return;
    }
    if (typeof DemandasAuth?.updatePassword !== "function") {
      if (err) { err.hidden = false; err.textContent = "Troca de senha indisponível. Recarregue a página."; }
      return;
    }
    const btn = document.getElementById("btnTrocarSenha");
    if (btn) {
      btn.disabled = true;
      btn.dataset.busy = "1";
      btn.textContent = "Salvando…";
    }
    try {
      await DemandasAuth.updatePassword(atual, nova);
      document.getElementById("formTrocarSenha")?.reset();
      document.querySelectorAll(".seg-input input").forEach((input) => {
        input.type = "password";
      });
      if (ok) {
        ok.hidden = false;
        ok.textContent = "Senha atualizada.";
      }
    } catch (ex) {
      if (err) {
        err.hidden = false;
        err.textContent = ex?.message || "Não foi possível trocar a senha.";
      }
    } finally {
      if (btn) {
        btn.dataset.busy = "";
        btn.textContent = "Salvar nova senha";
      }
      syncTrocarSenhaForm();
    }
  });
  document.getElementById("btnUserResetEmail")?.addEventListener("click", async () => {
    const email = currentRoleInfo().email || getCurrentUserEmail();
    const err = document.getElementById("userResetError");
    const ok = document.getElementById("userResetOk");
    if (err) { err.hidden = true; err.textContent = ""; }
    if (ok) ok.hidden = true;
    if (!email || typeof DemandasAuth?.sendPasswordReset !== "function") {
      if (err) { err.hidden = false; err.textContent = "Não foi possível enviar o e-mail."; }
      return;
    }
    const btn = document.getElementById("btnUserResetEmail");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Enviando…";
    }
    try {
      await DemandasAuth.sendPasswordReset(email);
      if (ok) {
        ok.hidden = false;
        ok.textContent = `Enviamos um link para ${email}.`;
      }
    } catch (ex) {
      if (err) {
        err.hidden = false;
        err.textContent = ex?.message || "Não foi possível enviar o e-mail.";
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Enviar link";
      }
    }
  });
}

function normalizeEditingBy(v) {
  if (!v || typeof v !== "object") return null;
  const email = String(v.email || "")
    .trim()
    .toLowerCase();
  if (!email) return null;
  const since = v.since || "";
  const t = Date.parse(since);
  if (!Number.isFinite(t) || Date.now() - t > PRESENCE_TTL_MS) return null;
  const autor = String(v.autor || email).trim() || email;
  return { email, autor, since };
}

function buildEditingPresence() {
  const email = getCurrentUserEmail();
  if (!email) return null;
  return {
    email,
    autor: getLoggedInComentarioAutor(),
    since: new Date().toISOString(),
  };
}

function setDemandaEditingBy(id, editingBy) {
  if (!id) return;
  const idx = state.demandas.findIndex((x) => x.id === id);
  if (idx < 0) return;
  const next = { ...state.demandas[idx] };
  delete next.__isMigrated;
  if (editingBy) next.editingBy = editingBy;
  else {
    delete next.editingBy;
    delete next.editingAt;
  }
  state.demandas[idx] = migrateDemanda(next);
  applyCloudPatch({ presence: { id, editingBy: editingBy || null } });
  // Não recria a esteira inteira a cada heartbeat de presença.
  refreshPresenceBadgesOnly();
}

let editingDemandaOpenId = null;
let editingDemandaBaselineUpdatedAt = "";
let ownAsanaSyncId = "";
let ownWriteGraceUntil = 0;
let asanaUiOverride = null;
const ownUpdatedAtWrites = new Set();

function beginOwnDemandaWrite(id) {
  if (!id) return;
  ownAsanaSyncId = id;
  ownWriteGraceUntil = Date.now() + 20000;
  const conflict = document.getElementById("demConflictBanner");
  if (conflict && editingDemandaOpenId === id) conflict.hidden = true;
}

function isInOwnWriteGrace(id) {
  return !!(id && ownAsanaSyncId === id && Date.now() < ownWriteGraceUntil);
}

function noteOwnDemandaWrite(id, updatedAt) {
  if (!id || !updatedAt) return;
  ownUpdatedAtWrites.add(`${id}\0${updatedAt}`);
  beginOwnDemandaWrite(id);
  if (editingDemandaOpenId === id) editingDemandaBaselineUpdatedAt = updatedAt;
}
let presenceHeartbeatTimer = null;

function stopPresenceHeartbeat() {
  if (presenceHeartbeatTimer) {
    clearInterval(presenceHeartbeatTimer);
    presenceHeartbeatTimer = null;
  }
}

function startPresenceHeartbeat(id) {
  stopPresenceHeartbeat();
  if (!id) return;
  presenceHeartbeatTimer = setInterval(() => {
    if (!modalDemanda?.open || editingDemandaOpenId !== id) return;
    const p = buildEditingPresence();
    if (p) setDemandaEditingBy(id, p);
  }, PRESENCE_HEARTBEAT_MS);
}

function releaseDemandaEditing(id) {
  if (!id) return;
  const dem = state.demandas.find((x) => x.id === id);
  if (!dem) {
    if (editingDemandaOpenId === id) {
      applyCloudPatch({ presence: { id, editingBy: null } });
    }
    return;
  }
  if (!dem.editingBy && editingDemandaOpenId !== id) return;
  const me = getCurrentUserEmail();
  const editorEmail = dem?.editingBy?.email ? String(dem.editingBy.email).toLowerCase() : "";
  if (!editorEmail || !me || editorEmail === me || editingDemandaOpenId === id) {
    setDemandaEditingBy(id, null);
  }
}

function hideDemandaModalAlerts() {
  const conflict = document.getElementById("demConflictBanner");
  const presence = document.getElementById("demPresenceBanner");
  const selfBanner = document.getElementById("demSelfEditingBanner");
  if (conflict) conflict.hidden = true;
  if (presence) presence.hidden = true;
  if (selfBanner) selfBanner.hidden = true;
}

function absorbOwnDemandaRemoteUpdate(dem) {
  if (!dem?.id) return false;
  const remoteUpdated = dem.updatedAt || "";
  const ownTs = !!(remoteUpdated && ownUpdatedAtWrites.has(`${dem.id}\0${remoteUpdated}`));
  if (!ownTs && !isInOwnWriteGrace(dem.id)) return false;
  if (remoteUpdated) {
    editingDemandaBaselineUpdatedAt = remoteUpdated;
    ownUpdatedAtWrites.add(`${dem.id}\0${remoteUpdated}`);
  }
  return true;
}

function syncDemandaModalAlerts() {
  const id = editingDemandaOpenId;
  const conflict = document.getElementById("demConflictBanner");
  const presence = document.getElementById("demPresenceBanner");
  const presenceText = document.getElementById("demPresenceBannerText");
  const selfBanner = document.getElementById("demSelfEditingBanner");
  if (!id || !modalDemanda?.open) {
    hideDemandaModalAlerts();
    if (selfBanner) selfBanner.hidden = true;
    return;
  }
  const dem = state.demandas.find((x) => x.id === id);
  if (!dem) return;

  if (selfBanner) {
    const mine = normalizeEditingBy(dem.editingBy);
    const me = getCurrentUserEmail();
    selfBanner.hidden = !(mine && me && mine.email === me);
  }

  const remoteUpdated = dem.updatedAt || "";
  const ownUpdate = absorbOwnDemandaRemoteUpdate(dem);
  if (
    conflict &&
    !ownUpdate &&
    editingDemandaBaselineUpdatedAt &&
    remoteUpdated &&
    remoteUpdated !== editingDemandaBaselineUpdatedAt
  ) {
    conflict.hidden = false;
  } else if (conflict) {
    conflict.hidden = true;
  }

  const other = normalizeEditingBy(dem.editingBy);
  const me = getCurrentUserEmail();
  if (presence && presenceText) {
    if (other && other.email !== me) {
      presence.hidden = false;
      presenceText.textContent = `${other.autor} está editando este projeto agora.`;
    } else {
      presence.hidden = true;
    }
  }
}

/* ---------- Modal: alterações não salvas, fechar com confirmação, atalhos ---------- */
/** Ids de campos que não fazem parte do projeto (rascunhos de comentário, novas atividades, seletores de "adicionar"). */
const DEM_CAMPOS_FORA_DO_SNAPSHOT = new Set([
  "demComentarioNovo",
  "demChecklistEtapa",
  "demChecklistWho",
  "demChecklistDateInicio",
  "demChecklistDate",
  "demChecklistDesc",
  "demChecklistStatus",
  "demExtraProjetista",
  "demExtraRegional",
  "demExtraCidade",
  "demPdfInput",
]);
let demSnapshotInicial = "";

function demFormSnapshot() {
  const form = document.getElementById("formDemanda");
  if (!form) return "";
  const campos = [];
  form.querySelectorAll("input, select, textarea").forEach((el) => {
    if (el.type === "file" || el.type === "button") return;
    if (el.id && DEM_CAMPOS_FORA_DO_SNAPSHOT.has(el.id)) return;
    if (el.closest(".checklist-item__edit, .comment-edit")) return;
    campos.push(el.type === "checkbox" ? String(el.checked) : el.value);
  });
  let timeline = [];
  try {
    timeline = readTimelineHistoricoFromDom();
  } catch (_) {}
  return JSON.stringify({
    campos,
    checklist: normalizeChecklist(editingChecklist),
    cidades: editingCidadesExtra,
    projetistas: editingProjetistasExtra,
    cabos: editingLancamentoCabos,
    pdf: editingPdfLevantamento?.name || "",
    timeline,
  });
}

function marcarDemandaLimpa() {
  demSnapshotInicial = demFormSnapshot();
  syncDemandaSujaUi();
}

function demandaTemAlteracoes() {
  if (!modalDemanda?.open || isReadOnlyUser()) return false;
  return demSnapshotInicial !== "" && demFormSnapshot() !== demSnapshotInicial;
}

function syncDemandaSujaUi() {
  const aviso = document.getElementById("demSujoAviso");
  const sujo = demandaTemAlteracoes();
  if (aviso) aviso.hidden = !sujo;
  modalDemanda?.classList.toggle("is-sujo", sujo);
}

/** Fechar pelo usuário (Fechar, ×, Esc): confirma se houver alterações não salvas. */
async function fecharDemandaComConfirmacao() {
  if (demandaTemAlteracoes()) {
    const ok = await confirmDialog({
      title: "Descartar alterações?",
      message: "Há alterações neste projeto que ainda não foram salvas.",
      confirmText: "Descartar",
      cancelText: "Continuar editando",
      variant: "warn",
    });
    if (!ok) return;
  }
  closeDemandaModal();
}

function closeDemandaModal() {
  const id = editingDemandaOpenId;
  const scrollSnap = snapshotPageScroll();
  stopPresenceHeartbeat();
  if (id) releaseDemandaEditing(id);
  editingDemandaOpenId = null;
  editingDemandaBaselineUpdatedAt = "";
  asanaUiOverride = null;
  ownAsanaSyncId = "";
  ownWriteGraceUntil = 0;
  editingCustoBaseline = null;
  pdfCustoAppliedInSession = false;
  hideDemandaModalAlerts();
  if (typeof setDemandaFootMenuOpen === "function") setDemandaFootMenuOpen(false);
  demandaModalClosingFromApi = true;
  modalDemanda?.close();
  demandaModalClosingFromApi = false;
  setDemandaModalScrollLock(false);
  if (panels.esteira && !panels.esteira.hidden) renderBoard();
  restorePageScroll(scrollSnap);
  restoreDashGeoListaIfNeeded();
}

function cardEditingByHtml(d) {
  const eb = normalizeEditingBy(d.editingBy);
  const me = getCurrentUserEmail();
  if (!eb) return "";
  if (me && eb.email === me) {
    return `<p class="card__editing-by card__editing-by--self" title="Você está com este projeto aberto">✎ Você está editando</p>`;
  }
  return `<p class="card__editing-by" title="Edição em andamento">✎ ${escapeHtml(eb.autor)} editando…</p>`;
}

function normalizeComentario(c) {
  const texto = String(c?.texto || "").trim();
  if (!texto) return null;
  const autor = String(c?.autor || "").trim() || "Equipe";
  const out = {
    id: c?.id || uid(),
    texto,
    autor,
    createdAt: c?.createdAt || new Date().toISOString(),
  };
  if (c?.editadoEm) out.editadoEm = String(c.editadoEm);
  const mencoes = Array.isArray(c?.mencoes)
    ? [...new Set(c.mencoes.map((e) => String(e || "").trim().toLowerCase()).filter(Boolean))]
    : [];
  if (mencoes.length) out.mencoes = mencoes;
  // Gravados pelo servidor: "asana" (comentário feito no Asana) ou "integracao" (avisos de envio).
  if (c?.origem === "asana" || c?.origem === "integracao") out.origem = c.origem;
  if (c?.asanaStoryGid) out.asanaStoryGid = String(c.asanaStoryGid);
  // Escrito aqui num projeto com tarefa no Asana: true = foi também para o Asana; false = só no sistema.
  if (typeof c?.paraAsana === "boolean") out.paraAsana = c.paraAsana;
  return out;
}

function normalizeComentarios(list) {
  if (!Array.isArray(list)) return [];
  return list.map(normalizeComentario).filter(Boolean);
}

const HISTORICO_EDICAO_LIMITE = 200;

const HISTORICO_EDICAO_CAMPOS = [
  { campo: "titulo", label: "Nome do projeto" },
  { campo: "status", label: "Status (esteira)", format: (v) => labelStatus(v) || v || "—" },
  { campo: "statusAtual", label: "Status atual" },
  { campo: "responsavel", label: "Projetista responsável", format: (v) => v || "Não atribuído" },
  {
    campo: "projetistasExtra",
    label: "Projetistas extras",
    format: (v) => {
      const list = normalizeProjetistasExtra(v, "");
      return list.length ? list.join(" · ") : "—";
    },
  },
  { campo: "tipo", label: "Tipo" },
  { campo: "produtoB2b", label: "Produto B2B", format: (v) => v || "—" },
  { campo: "segmentoB2c", label: "Segmento B2C", format: (v) => v || "—" },
  { campo: "cidade", label: "Cidade", format: (v) => v || "—" },
  {
    campo: "cidadesExtra",
    label: "Cidades extras",
    format: (v) => {
      const list = normalizeCidadesExtra(v, "");
      return list.length ? list.join(" · ") : "—";
    },
  },
  { campo: "solicitante", label: "Solicitante", format: (v) => v || "—" },
  { campo: "setorSolicitanteB2b", label: "Setor solicitante (B2B)", format: (v) => v || "—" },
  { campo: "dataChegada", label: "Data de chegada", format: formatDataCurta },
  { campo: "dataFimPrevista", label: "Previsão de término", format: formatDataCurta },
  { campo: "dataFimAtualizada", label: "Finalização atualizada", format: formatDataCurta },
  { campo: "dataTermino", label: "Data real de término", format: formatDataCurta },
  { campo: "motivosAtrasoItens", label: "Motivos do atraso", format: (v) => formatMotivosAtrasoTexto(v) || "—" },
  { campo: "valorProjetoRealizado", label: "Valor realizado", format: (v) => (v === "" || v == null ? "—" : formatBRL(v)) },
  { campo: "descricao", label: "Descrição", format: shortText },
  { campo: "chamadoOcomon", label: "Chamado Ocomon", format: (v) => v || "—" },
  { campo: "osAniel", label: "Nº O.S. Aniel", format: (v) => v || "—" },
  { campo: "asana", label: "Asana", format: (v) => (v && v.url) || "—" },
  {
    campo: "checklist",
    label: "Checklist das tarefas do projeto",
    format: (v) => {
      const items = normalizeChecklist(v);
      if (!items.length) return "—";
      const d = items.filter((it) => it.done).length;
      const names = items.map((it) => it.name).join(" → ");
      return `${d}/${items.length} · ${names}`;
    },
  },
];

function shortText(v) {
  const s = String(v ?? "").trim();
  if (!s) return "—";
  return s.length > 80 ? s.slice(0, 77) + "…" : s;
}

function formatDataCurta(v) {
  if (!v) return "—";
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return v;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function normalizeHistoricoEdicaoEntry(e) {
  if (!e || typeof e !== "object") return null;
  const tipo = e.tipo === "criacao" ? "criacao" : "edicao";
  const at = e.at || "";
  if (!at) return null;
  const by = {
    email: String(e.by?.email || "").trim().toLowerCase(),
    autor: String(e.by?.autor || "").trim() || "Equipe",
  };
  const alteracoes = Array.isArray(e.alteracoes)
    ? e.alteracoes
        .map((a) => ({
          campo: String(a?.campo || ""),
          label: String(a?.label || a?.campo || ""),
          de: a?.de ?? "",
          para: a?.para ?? "",
        }))
        .filter((a) => a.campo)
    : [];
  return {
    id: e.id || uid(),
    tipo,
    at,
    by,
    alteracoes,
    nota: typeof e.nota === "string" ? e.nota : "",
  };
}

function normalizeHistoricoEdicoes(list) {
  if (!Array.isArray(list)) return [];
  return list.map(normalizeHistoricoEdicaoEntry).filter(Boolean);
}

const HISTORICO_ALERTAS_LIMITE = 80;
const ALERTA_KIND_SEM_ATRIB = "sem_atribuicao";
const ALERTA_KIND_COLUNA = "coluna";
const ALERTA_KIND_MENCAO = "mencao";
const ALERTA_DIAS_MESMA_COLUNA = 6;
const ALERTA_SNOOZE_DIAS_PADRAO = 4;

function normalizeAlertaSnooze(s) {
  if (!s || typeof s !== "object") return null;
  const kind = s.kind === ALERTA_KIND_SEM_ATRIB ? ALERTA_KIND_SEM_ATRIB : ALERTA_KIND_COLUNA;
  const until = isoDatePart(s.until);
  if (!until) return null;
  const dias = Math.max(1, Math.min(30, Number(s.dias) || 1));
  return {
    kind,
    status: String(s.status || ""),
    until,
    dias,
    at: s.at || "",
    autor: String(s.autor || "").trim() || "Equipe",
    email: String(s.email || "").trim().toLowerCase(),
    texto: String(s.texto || "").trim(),
  };
}

function normalizeHistoricoAlertaEntry(e) {
  if (!e || typeof e !== "object") return null;
  const texto = String(e.texto || "").trim();
  const at = e.at || e.createdAt || "";
  if (!texto || !at) return null;
  const kind = e.kind === ALERTA_KIND_SEM_ATRIB ? ALERTA_KIND_SEM_ATRIB : ALERTA_KIND_COLUNA;
  return {
    id: e.id || uid(),
    at,
    autor: String(e.autor || "").trim() || "Equipe",
    email: String(e.email || "").trim().toLowerCase(),
    texto,
    dias: Math.max(1, Math.min(30, Number(e.dias) || 1)),
    until: isoDatePart(e.until),
    kind,
    status: String(e.status || ""),
    ocultoNoComentario: !!e.ocultoNoComentario,
  };
}

function normalizeHistoricoAlertas(list) {
  if (!Array.isArray(list)) return [];
  const out = list.map(normalizeHistoricoAlertaEntry).filter(Boolean);
  if (out.length > HISTORICO_ALERTAS_LIMITE) return out.slice(out.length - HISTORICO_ALERTAS_LIMITE);
  return out;
}

function comentarioTextoFromHistoricoAlerta(e) {
  const texto = String(e?.texto || "").trim();
  if (!texto) return "";
  const dias = e.dias ? `Adiado por ${e.dias} dia(s)` : "Alerta adiado";
  const untilTxt = e.until ? ` — volta em ${formatDataISO(e.until)} se a fase não mudar.` : ".";
  return `${texto}\n\n${dias}${untilTxt}`;
}

function mergeHistoricoAlertasIntoComentarios(d) {
  const comments = normalizeComentarios(d?.comentarios);
  const hist = normalizeHistoricoAlertas(d?.historicoAlertas);
  if (!hist.length) return comments;
  for (const e of hist) {
    if (e.ocultoNoComentario) continue;
    const origem = String(e.texto || "").trim();
    if (!origem) continue;
    const already = comments.some((c) => String(c.texto || "").includes(origem));
    if (already) continue;
    const cmt = normalizeComentario({
      texto: comentarioTextoFromHistoricoAlerta(e),
      autor: e.autor,
      createdAt: e.at,
    });
    if (cmt) comments.push(cmt);
  }
  comments.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  return comments;
}

function syncHistoricoAlertasOcultos(hist, comments) {
  const cmts = normalizeComentarios(comments);
  return normalizeHistoricoAlertas(hist).map((e) => {
    const origem = String(e.texto || "").trim();
    if (!origem) return e;
    const still = cmts.some((c) => String(c.texto || "").includes(origem));
    return { ...e, ocultoNoComentario: !still };
  });
}

function buildEditorPresenceForLog() {
  return {
    email: getCurrentUserEmail() || "",
    autor: getLoggedInComentarioAutor(),
  };
}

function diffEditTracked(prev, next) {
  const out = [];
  for (const def of HISTORICO_EDICAO_CAMPOS) {
    const a = prev?.[def.campo];
    const b = next?.[def.campo];
    if (def.campo === "motivosAtrasoItens") {
      if (sameMotivosAtrasoItens(a, b)) continue;
    } else if (def.campo === "checklist") {
      if (sameChecklist(a, b)) continue;
    } else if (def.campo === "cidadesExtra") {
      if (sameCidadesExtra(a, b, next?.cidade || prev?.cidade)) continue;
    } else if (def.campo === "projetistasExtra") {
      if (sameProjetistasExtra(a, b, next?.responsavel || prev?.responsavel)) continue;
    } else if (sameTrackedValue(a, b)) {
      continue;
    }
    const fmt = def.format || ((v) => (v === "" || v == null ? "—" : String(v)));
    out.push({ campo: def.campo, label: def.label, de: fmt(a), para: fmt(b) });
  }
  const cmtPrev = Array.isArray(prev?.comentarios) ? prev.comentarios.length : 0;
  const cmtNext = Array.isArray(next?.comentarios) ? next.comentarios.length : 0;
  if (cmtNext > cmtPrev) {
    const delta = cmtNext - cmtPrev;
    out.push({ campo: "comentarios", label: "Comentários", de: `${cmtPrev}`, para: `${cmtNext} (+${delta})` });
  } else if (cmtNext < cmtPrev) {
    out.push({ campo: "comentarios", label: "Comentários", de: `${cmtPrev}`, para: `${cmtNext}` });
  }
  const histPrev = Array.isArray(prev?.historicoStatus) ? prev.historicoStatus : [];
  const histNext = Array.isArray(next?.historicoStatus) ? next.historicoStatus : [];
  if (!sameTimeline(histPrev, histNext)) {
    out.push({
      campo: "historicoStatus",
      label: "Tempo na esteira",
      de: `${histPrev.length} fase(s)`,
      para: `${histNext.length} fase(s)`,
    });
  }
  const custoPrev = JSON.stringify(prev?.custo || null);
  const custoNext = JSON.stringify(next?.custo || null);
  if (custoPrev !== custoNext) {
    out.push({ campo: "custo", label: "Levantamento de custo", de: "—", para: "atualizado" });
  }
  const pdfPrev = prev?.pdfLevantamento?.id || "";
  const pdfNext = next?.pdfLevantamento?.id || "";
  if (pdfPrev !== pdfNext) {
    out.push({
      campo: "pdfLevantamento",
      label: "PDF de levantamento",
      de: pdfPrev ? "Anexado" : "—",
      para: pdfNext ? next.pdfLevantamento?.name || "Anexado" : "—",
    });
  }
  return out;
}

function sameTrackedValue(a, b) {
  const norm = (v) => (v === undefined || v === null ? "" : String(v));
  return norm(a) === norm(b);
}

function sameChecklist(a, b) {
  const x = normalizeChecklist(a);
  const y = normalizeChecklist(b);
  if (x.length !== y.length) return false;
  for (let i = 0; i < x.length; i++) {
    if (x[i].id !== y[i].id) return false;
    if (x[i].name !== y[i].name) return false;
    if (x[i].descricao !== y[i].descricao) return false;
    if (x[i].who !== y[i].who) return false;
    if (x[i].dateInicio !== y[i].dateInicio) return false;
    if (x[i].date !== y[i].date) return false;
    if (x[i].done !== y[i].done) return false;
    if (x[i].status !== y[i].status) return false;
    if ((x[i].dependeDe || "") !== (y[i].dependeDe || "")) return false;
    if ((x[i].moverPara || "") !== (y[i].moverPara || "")) return false;
    if ((x[i].dateConclusao || "") !== (y[i].dateConclusao || "")) return false;
    if ((x[i].dateNova || "") !== (y[i].dateNova || "")) return false;
  }
  return true;
}

function sameTimeline(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] || {};
    const y = b[i] || {};
    if (x.status !== y.status) return false;
    if ((x.inicio || "") !== (y.inicio || "")) return false;
    if ((x.fim || "") !== (y.fim || "")) return false;
    if ((x.observacao || "") !== (y.observacao || "")) return false;
  }
  return true;
}

function appendHistoricoEdicao(target, entry) {
  if (!target || !entry) return target;
  const list = Array.isArray(target.historicoEdicoes) ? [...target.historicoEdicoes] : [];
  list.push(entry);
  if (list.length > HISTORICO_EDICAO_LIMITE) list.splice(0, list.length - HISTORICO_EDICAO_LIMITE);
  target.historicoEdicoes = list;
  return target;
}

function registrarCriacaoNoHistoricoEdicao(payload) {
  const entry = normalizeHistoricoEdicaoEntry({
    id: uid(),
    tipo: "criacao",
    at: payload.updatedAt || new Date().toISOString(),
    by: buildEditorPresenceForLog(),
    nota: "Demanda criada",
  });
  appendHistoricoEdicao(payload, entry);
}

function registrarEdicaoNoHistoricoEdicao(prev, next) {
  const alt = diffEditTracked(prev, next);
  if (!alt.length) return false;
  const entry = normalizeHistoricoEdicaoEntry({
    id: uid(),
    tipo: "edicao",
    at: next.updatedAt || new Date().toISOString(),
    by: buildEditorPresenceForLog(),
    alteracoes: alt,
  });
  appendHistoricoEdicao(next, entry);
  return true;
}

function formatComentarioData(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function formatComentarioRelativo(iso) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return min + " min";
  const h = Math.floor(min / 60);
  if (h < 24) return h + " h";
  const d = Math.floor(h / 24);
  if (d === 1) return "ontem";
  if (d < 7) return d + " dias";
  return formatComentarioData(iso);
}

function comentarioGrupoDia(iso) {
  const d = new Date(iso);
  const hoje = new Date();
  if (d.toDateString() === hoje.toDateString()) return "Hoje";
  const ontem = new Date(hoje);
  ontem.setDate(ontem.getDate() - 1);
  if (d.toDateString() === ontem.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function comentarioIniciais(autor) {
  const a = String(autor || "?").trim();
  const parts = a.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return a.slice(0, 2).toUpperCase();
}

function comentarioAvatarClass(autor) {
  const n = projetistaSlug(autor);
  if (n.includes("matheus")) return "comment-avatar--matheus";
  if (n.includes("vinicius")) return "comment-avatar--vinicius";
  if (n.includes("joao")) return "comment-avatar--joao";
  if (n.includes("daniel")) return "comment-avatar--daniel";
  if (n.includes("alberto")) return "comment-avatar--alberto";
  if (n.includes("rafael")) return "comment-avatar--rafael";
  return "comment-avatar--equipe";
}

function groupComentariosPorDia(items) {
  const sorted = [...items].sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));
  const groups = [];
  let lastLabel = null;
  for (const c of sorted) {
    const label = comentarioGrupoDia(c.createdAt);
    if (label !== lastLabel) {
      groups.push({ label, items: [] });
      lastLabel = label;
    }
    groups[groups.length - 1].items.push(c);
  }
  return groups;
}
