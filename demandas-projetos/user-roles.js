/**
 * Hierarquia de papéis (e-mail do Firebase Auth).
 *
 * admin         — tudo, inclusive gerenciar usuários
 * projetista    — operação completa (sem gerenciar usuários)
 * visibilidade  — somente leitura
 * disabled      — conta no mapa, sem operação (somente leitura / fora das listas)
 *
 * E-mail fora do mapa de papéis ou removido (purged) → sem acesso.
 * E-mail no mapa com disabled → somente leitura.
 */
window.DEMANDAS_ROLES_SEED = {
  "vinicius.morais@soumaster.com.br": "admin",
  "alberto.soares@soumaster.com.br": "projetista",
  "rafael.mesquita@soumaster.com.br": "projetista",
  "rafael.machado@soumaster.com.br": "projetista",
  "matheus.costa@soumaster.com.br": "projetista",
  "daniel.rodrigues@soumaster.com.br": "projetista",
  "joao.bosco@soumaster.com.br": "projetista",
  "eduardo.pereira@soumaster.com.br": "projetista",
  "thiago.coelho@soumaster.com.br": "projetista",
  "hanver.junior@soumaster.com.br": "projetista",
};

window.DEMANDAS_ADMIN_EMAIL = "vinicius.morais@soumaster.com.br";

window.DemandasRoles = (function () {
  const ROLE_ADMIN = "admin";
  const ROLE_PROJETISTA = "projetista";
  const ROLE_VISIBILIDADE = "visibilidade";
  const ROLES = [ROLE_ADMIN, ROLE_PROJETISTA, ROLE_VISIBILIDADE];
  const DEFAULT_ROLE = ROLE_PROJETISTA;

  const ROLE_LABELS = {
    admin: "Administrador",
    projetista: "Projetista",
    visibilidade: "Visibilidade",
  };

  /** Mapa e-mail → papel (seed + nuvem). */
  let rolesMap = { ...(window.DEMANDAS_ROLES_SEED || {}) };
  /** E-mails desabilitados (permanecem no mapa, sem operar). */
  let disabledMap = {};
  /** Removidos do sistema (impede o seed de reaparecer). */
  let purgedMap = {};
  /** E-mail → regional preferida ("" = todas). */
  let regionalsMap = {};

  function normalizeEmail(email) {
    return String(email || "")
      .trim()
      .toLowerCase();
  }

  function normalizeRole(role) {
    const r = String(role || "")
      .trim()
      .toLowerCase();
    if (r === "administrador" || r === "administrator") return ROLE_ADMIN;
    if (r === "leitura" || r === "readonly" || r === "viewer") return ROLE_VISIBILIDADE;
    return ROLES.includes(r) ? r : DEFAULT_ROLE;
  }

  function normalizeFlagMap(map) {
    const out = {};
    if (!map || typeof map !== "object") return out;
    for (const [email, flag] of Object.entries(map)) {
      const e = normalizeEmail(email);
      if (!e) continue;
      if (flag === true || flag === 1 || flag === "1" || String(flag).toLowerCase() === "true") {
        out[e] = true;
      }
    }
    return out;
  }

  function mergeSeed(map) {
    const out = { ...(window.DEMANDAS_ROLES_SEED || {}) };
    if (map && typeof map === "object") {
      for (const [email, role] of Object.entries(map)) {
        const e = normalizeEmail(email);
        if (!e) continue;
        out[e] = normalizeRole(role);
      }
    }
    const adminEmail = normalizeEmail(window.DEMANDAS_ADMIN_EMAIL);
    for (const e of Object.keys(purgedMap)) {
      if (e && e !== adminEmail) delete out[e];
    }
    if (adminEmail) {
      out[adminEmail] = ROLE_ADMIN;
      delete purgedMap[adminEmail];
      delete disabledMap[adminEmail];
    }
    return out;
  }

  function setRolesMap(map) {
    rolesMap = mergeSeed(map);
    return rolesMap;
  }

  function getRolesMap() {
    return { ...rolesMap };
  }

  function setDisabledMap(map) {
    disabledMap = normalizeFlagMap(map);
    const adminEmail = normalizeEmail(window.DEMANDAS_ADMIN_EMAIL);
    if (adminEmail) delete disabledMap[adminEmail];
    return { ...disabledMap };
  }

  function getDisabledMap() {
    return { ...disabledMap };
  }

  function setPurgedMap(map) {
    purgedMap = normalizeFlagMap(map);
    const adminEmail = normalizeEmail(window.DEMANDAS_ADMIN_EMAIL);
    if (adminEmail) delete purgedMap[adminEmail];
    return { ...purgedMap };
  }

  function getPurgedMap() {
    return { ...purgedMap };
  }

  function normalizeRegionalValue(v) {
    const s = String(v || "").trim();
    if (!s || s === "__all__" || s.toLowerCase() === "todas" || s === "*") return "";
    return s;
  }

  function normalizeRegionalsMap(map) {
    const out = {};
    if (!map || typeof map !== "object") return out;
    for (const [email, regional] of Object.entries(map)) {
      const e = normalizeEmail(email);
      if (!e) continue;
      out[e] = normalizeRegionalValue(regional);
    }
    return out;
  }

  function setRegionalsMap(map) {
    regionalsMap = normalizeRegionalsMap(map);
    return { ...regionalsMap };
  }

  function getRegionalsMap() {
    return { ...regionalsMap };
  }

  /** Regional do usuário; string vazia = todas. */
  function regionalForEmail(email) {
    const e = normalizeEmail(email);
    if (!e) return "";
    return normalizeRegionalValue(regionalsMap[e]);
  }

  function isDisabled(email) {
    const e = normalizeEmail(email);
    if (!e) return false;
    if (e === normalizeEmail(window.DEMANDAS_ADMIN_EMAIL)) return false;
    return !!disabledMap[e];
  }

  function isPurged(email) {
    const e = normalizeEmail(email);
    if (!e) return false;
    if (e === normalizeEmail(window.DEMANDAS_ADMIN_EMAIL)) return false;
    return !!purgedMap[e];
  }

  function roleForEmail(email) {
    const e = normalizeEmail(email);
    if (!e) return null;
    if (isPurged(e)) return null;
    if (!rolesMap[e]) return null;
    return normalizeRole(rolesMap[e]);
  }

  function currentEmail() {
    const user = typeof DemandasAuth !== "undefined" ? DemandasAuth.currentUser?.() : null;
    return normalizeEmail(user?.email);
  }

  function resolve(user) {
    const email = normalizeEmail(user?.email ?? currentEmail());
    // Allowlist: só quem está no mapa (e não foi removido) acessa o sistema.
    if (!email || isPurged(email) || !rolesMap[email]) {
      return {
        email,
        role: "blocked",
        label: "Sem acesso",
        isAdmin: false,
        isProjetista: false,
        isVisibilidade: false,
        isDisabled: false,
        isBlocked: true,
        isReadOnly: true,
      };
    }
    const role = normalizeRole(rolesMap[email]);
    const disabled = isDisabled(email);
    return {
      email,
      role,
      label: disabled ? `${ROLE_LABELS[role] || role} · desabilitado` : ROLE_LABELS[role] || role,
      isAdmin: !disabled && role === ROLE_ADMIN,
      isProjetista: !disabled && role === ROLE_PROJETISTA,
      isVisibilidade: role === ROLE_VISIBILIDADE,
      isDisabled: disabled,
      isBlocked: false,
      isReadOnly: disabled || role === ROLE_VISIBILIDADE,
    };
  }

  function isAdmin(user) {
    return resolve(user).isAdmin;
  }

  function isReadOnly(user) {
    return resolve(user).isReadOnly;
  }

  /**
   * Ações:
   * - write: salvar demanda/diária/meta, drag, snooze, import
   * - deleteDemanda / import / manageUsers
   */
  function can(action, user) {
    const info = resolve(user);
    if (info.isBlocked || info.isDisabled) return false;
    if (info.isAdmin) return true;
    if (info.isReadOnly) return false;
    if (action === "manageUsers") return false;
    if (action === "write" || action === "deleteDemanda" || action === "import" || action === "export") {
      return true;
    }
    return false;
  }

  function countAdmins(map = rolesMap) {
    return Object.entries(map).filter(([email, r]) => {
      if (isDisabled(email)) return false;
      return normalizeRole(r) === ROLE_ADMIN;
    }).length;
  }

  function canChangeRole(email, newRole, actorEmail) {
    const e = normalizeEmail(email);
    const next = normalizeRole(newRole);
    const actor = normalizeEmail(actorEmail || currentEmail());
    if (!e || !actor) return { ok: false, reason: "Usuário inválido" };
    if (roleForEmail(actor) !== ROLE_ADMIN || isDisabled(actor)) {
      return { ok: false, reason: "Apenas administrador" };
    }

    const merged = { ...rolesMap, [e]: next };
    if (countAdmins(merged) < 1) {
      return { ok: false, reason: "É preciso manter ao menos um administrador ativo" };
    }
    return { ok: true };
  }

  function canToggleDisabled(email, disabled, actorEmail) {
    const e = normalizeEmail(email);
    const actor = normalizeEmail(actorEmail || currentEmail());
    if (!e) return { ok: false, reason: "Usuário inválido" };
    if (roleForEmail(actor) !== ROLE_ADMIN || isDisabled(actor)) {
      return { ok: false, reason: "Apenas administrador" };
    }
    if (e === actor) {
    if (disabled) return { ok: false, reason: "Você não pode desabilitar a si mesmo" };
    return { ok: true };
  }
    if (e === normalizeEmail(window.DEMANDAS_ADMIN_EMAIL) && disabled) {
      return { ok: false, reason: "Não é possível desabilitar o administrador principal" };
    }
    if (disabled && roleForEmail(e) === ROLE_ADMIN) {
      const nextDisabled = { ...disabledMap, [e]: true };
      const adminsLeft = Object.entries(rolesMap).filter(([mail, r]) => {
        if (normalizeRole(r) !== ROLE_ADMIN) return false;
        if (nextDisabled[mail]) return false;
        return true;
      }).length;
      if (adminsLeft < 1) {
        return { ok: false, reason: "É preciso manter ao menos um administrador ativo" };
      }
    }
    return { ok: true };
  }

  function canRemoveUser(email, actorEmail) {
    const e = normalizeEmail(email);
    const actor = normalizeEmail(actorEmail || currentEmail());
    if (!e) return { ok: false, reason: "Usuário inválido" };
    if (roleForEmail(actor) !== ROLE_ADMIN || isDisabled(actor)) {
      return { ok: false, reason: "Apenas administrador" };
    }
    if (e === actor) return { ok: false, reason: "Você não pode excluir a si mesmo" };
    if (e === normalizeEmail(window.DEMANDAS_ADMIN_EMAIL)) {
      return { ok: false, reason: "Não é possível remover o administrador principal" };
    }
    const next = { ...rolesMap };
    delete next[e];
    const prevPurged = { ...purgedMap };
    purgedMap[e] = true;
    const withSeed = mergeSeed(next);
    purgedMap = prevPurged;
    if (countAdmins(withSeed) < 1) {
      return { ok: false, reason: "É preciso manter ao menos um administrador ativo" };
    }
    return { ok: true };
  }

  return {
    ROLE_ADMIN,
    ROLE_PROJETISTA,
    ROLE_VISIBILIDADE,
    ROLES,
    ROLE_LABELS,
    DEFAULT_ROLE,
    normalizeEmail,
    normalizeRole,
    setRolesMap,
    getRolesMap,
    setDisabledMap,
    getDisabledMap,
    setPurgedMap,
    getPurgedMap,
    setRegionalsMap,
    getRegionalsMap,
    regionalForEmail,
    normalizeRegionalValue,
    isDisabled,
    isPurged,
    roleForEmail,
    resolve,
    isAdmin,
    isReadOnly,
    can,
    countAdmins,
    canChangeRole,
    canToggleDisabled,
    canRemoveUser,
  };
})();
