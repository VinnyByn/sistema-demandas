/**
 * Comentários e @menções.
 * Só declarações (funções e constantes); o que roda ao abrir a página fica em app.js.
 */
/* ---------- @Menções nos comentários ---------- */
const MENCOES_JANELA_DIAS = 30;
let mencionaveisCache = { versao: -1, lista: [] };

/** Usuários que podem ser mencionados: todos com acesso (não bloqueados), pelo nome de exibição. */
function usuariosMencionaveis() {
  const versao = typeof DemandasRoles !== "undefined" && DemandasRoles.getVersion ? DemandasRoles.getVersion() : 0;
  if (mencionaveisCache.versao === versao && mencionaveisCache.lista.length) return mencionaveisCache.lista;
  const mapa =
    typeof DemandasRoles !== "undefined" ? DemandasRoles.getRolesMap() : { ...(window.DEMANDAS_ROLES_SEED || {}) };
  const lista = Object.keys(mapa)
    .map((e) => String(e).trim().toLowerCase())
    .filter((e) => e && !(typeof DemandasRoles !== "undefined" && DemandasRoles.isDisabled?.(e)))
    .map((email) => ({ email, nome: accountDisplayNameForEmail(email) || email }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  mencionaveisCache = { versao, lista };
  return lista;
}

/** E-mails mencionados no texto (`@Nome` de um usuário conhecido). */
function extrairMencoes(texto) {
  const t = String(texto || "").toLowerCase();
  const out = [];
  for (const u of usuariosMencionaveis()) {
    const alvo = `@${u.nome.toLowerCase()}`;
    let i = t.indexOf(alvo);
    while (i >= 0) {
      const depois = t.charAt(i + alvo.length);
      if (!depois || !/[\p{L}\d]/u.test(depois)) {
        out.push(u.email);
        break;
      }
      i = t.indexOf(alvo, i + 1);
    }
  }
  return [...new Set(out)];
}

/** Destaca `@Nome` (já escapado) de usuários conhecidos — nomes mais longos primeiro. */
function destacarMencoesHtml(html) {
  const nomes = usuariosMencionaveis()
    .map((u) => escapeHtml(u.nome))
    .sort((a, b) => b.length - a.length);
  if (!nomes.length) return html;
  const re = new RegExp(`@(${nomes.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![\\p{L}\\d])`, "giu");
  const eu = accountDisplayNameForEmail(getCurrentUserEmail()).toLowerCase();
  return html.replace(re, (m, nome) => `<span class="mencao${eu && nome.toLowerCase() === escapeHtml(eu).toLowerCase() ? " is-eu" : ""}">${m}</span>`);
}

/* Autocompletar: aparece ao digitar "@" num campo de comentário. */
const mencaoAc = { ta: null, inicio: -1, itens: [], ativo: 0 };

function mencaoAcEl() {
  let el = document.getElementById("mencaoAutocomplete");
  if (!el) {
    el = document.createElement("ul");
    el.id = "mencaoAutocomplete";
    el.className = "mencao-ac";
    el.setAttribute("role", "listbox");
    el.hidden = true;
    el.addEventListener("mousedown", (e) => {
      const li = e.target.closest("[data-idx]");
      if (!li) return;
      e.preventDefault();
      escolherMencao(Number(li.dataset.idx));
    });
    document.body.appendChild(el);
  }
  return el;
}

function fecharMencaoAc() {
  const el = document.getElementById("mencaoAutocomplete");
  if (el) el.hidden = true;
  mencaoAc.ta = null;
  mencaoAc.inicio = -1;
  mencaoAc.itens = [];
}

function atualizarMencaoAc(ta) {
  const pos = ta.selectionStart ?? ta.value.length;
  const antes = ta.value.slice(0, pos);
  const m = antes.match(/(^|\s)@([\p{L}\d .'-]{0,30})$/u);
  if (!m || /\s{2}/.test(m[2])) return fecharMencaoAc();
  const termo = projetistaSlug(m[2].trim());
  const itens = usuariosMencionaveis()
    .filter((u) => {
      if (!termo) return true;
      const nome = projetistaSlug(u.nome);
      return nome.startsWith(termo) || nome.split(/\s+/).some((p) => p.startsWith(termo)) || u.email.startsWith(termo);
    })
    .slice(0, 6);
  if (!itens.length) return fecharMencaoAc();
  mencaoAc.ta = ta;
  mencaoAc.inicio = pos - m[2].length - 1;
  mencaoAc.itens = itens;
  mencaoAc.ativo = Math.min(mencaoAc.ativo, itens.length - 1);
  const el = mencaoAcEl();
  el.innerHTML = itens
    .map(
      (u, i) =>
        `<li role="option" data-idx="${i}" class="${i === mencaoAc.ativo ? "is-ativo" : ""}" aria-selected="${i === mencaoAc.ativo}">` +
        `<span class="mencao-ac__av comment-avatar ${comentarioAvatarClass(u.nome)}">${escapeHtml(comentarioIniciais(u.nome))}</span>` +
        `<span class="mencao-ac__txt"><strong>${escapeHtml(u.nome)}</strong><small>${escapeHtml(u.email)}</small></span></li>`,
    )
    .join("");
  // Um dialog modal fica na camada superior e cobre o que está no body: a lista vai para dentro dele.
  const host = ta.closest("dialog[open]") || document.body;
  if (el.parentElement !== host) host.appendChild(el);
  const r = (ta.closest(".compose-card") || ta).getBoundingClientRect();
  el.hidden = false;
  const alto = el.offsetHeight;
  const cabeEmbaixo = r.bottom + alto + 8 < window.innerHeight;
  const alvoX = Math.max(8, Math.min(r.left, window.innerWidth - el.offsetWidth - 8));
  const alvoY = cabeEmbaixo ? r.bottom + 4 : Math.max(8, r.top - alto - 4);
  el.style.left = `${alvoX}px`;
  el.style.top = `${alvoY}px`;
  // Se o dialog cria um bloco de contenção (transform), "fixed" passa a ser relativo a ele: corrige o deslocamento.
  const real = el.getBoundingClientRect();
  if (Math.abs(real.left - alvoX) > 1 || Math.abs(real.top - alvoY) > 1) {
    el.style.left = `${alvoX - (real.left - alvoX)}px`;
    el.style.top = `${alvoY - (real.top - alvoY)}px`;
  }
}

function escolherMencao(idx) {
  const ta = mencaoAc.ta;
  const u = mencaoAc.itens[idx];
  if (!ta || !u || mencaoAc.inicio < 0) return fecharMencaoAc();
  const pos = ta.selectionStart ?? ta.value.length;
  const insercao = `@${u.nome} `;
  ta.value = ta.value.slice(0, mencaoAc.inicio) + insercao + ta.value.slice(pos);
  const caret = mencaoAc.inicio + insercao.length;
  ta.setSelectionRange(caret, caret);
  fecharMencaoAc();
  ta.dispatchEvent(new Event("input", { bubbles: true }));
  ta.focus();
}

/** Liga o autocompletar a um textarea (o teclado tem prioridade sobre os atalhos do campo). */
function ligarMencoesNoCampo(ta) {
  if (!ta || ta.dataset.mencoes) return;
  ta.dataset.mencoes = "1";
  ta.addEventListener("input", () => {
    mencaoAc.ativo = mencaoAc.ta === ta ? mencaoAc.ativo : 0;
    atualizarMencaoAc(ta);
  });
  ta.addEventListener("click", () => atualizarMencaoAc(ta));
  ta.addEventListener("blur", () => setTimeout(() => mencaoAc.ta === ta && fecharMencaoAc(), 120));
  ta.addEventListener(
    "keydown",
    (e) => {
      if (mencaoAc.ta !== ta || document.getElementById("mencaoAutocomplete")?.hidden) return;
      const n = mencaoAc.itens.length;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        e.stopImmediatePropagation();
        mencaoAc.ativo = (mencaoAc.ativo + (e.key === "ArrowDown" ? 1 : n - 1)) % n;
        atualizarMencaoAc(ta);
      } else if ((e.key === "Enter" && !e.ctrlKey && !e.metaKey) || e.key === "Tab") {
        e.preventDefault();
        e.stopImmediatePropagation();
        escolherMencao(mencaoAc.ativo);
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        fecharMencaoAc();
      }
    },
    true,
  );
}

/* Menções para mim no sino: comentários recentes que me citam e que ainda não marquei como cientes. */
function mencoesVistasChave() {
  return `demandas.mencoesVistas.${getCurrentUserEmail() || "local"}`;
}

function mencoesVistas() {
  try {
    const arr = JSON.parse(localStorage.getItem(mencoesVistasChave()) || "[]");
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function marcarMencaoVista(cid) {
  const vistas = [...mencoesVistas(), cid].slice(-500);
  try {
    localStorage.setItem(mencoesVistasChave(), JSON.stringify(vistas));
  } catch {
    /* sem armazenamento local: a menção volta a aparecer na próxima sessão */
  }
}

function mencoesParaMimRows() {
  const eu = getCurrentUserEmail();
  if (!eu) return [];
  const meuNome = getLoggedInComentarioAutor();
  const vistas = mencoesVistas();
  const limite = new Date(Date.now() - MENCOES_JANELA_DIAS * 864e5).toISOString();
  const rows = [];
  for (const d of state.demandas || []) {
    for (const c of d.comentarios || []) {
      if (!Array.isArray(c.mencoes) || !c.mencoes.includes(eu)) continue;
      if (c.autor === meuNome || vistas.has(c.id) || (c.createdAt || "") < limite) continue;
      const trecho = c.texto.length > 90 ? `${c.texto.slice(0, 87)}…` : c.texto;
      rows.push({
        severity: "mencao",
        kind: ALERTA_KIND_MENCAO,
        d,
        cid: c.id,
        dias: 0,
        at: c.createdAt,
        msg: `${c.autor} mencionou você`,
        curta: `${c.autor} mencionou você · ${formatComentarioRelativo(c.createdAt)}`,
        meta: trecho,
      });
    }
  }
  return rows.sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

/** Comentário em edição no painel (id) — só um por vez. */
let comentarioEditandoId = "";

/** Pode editar: o próprio autor ou um administrador (nunca quem só visualiza). */
function podeEditarComentario(c) {
  if (isReadOnlyUser()) return false;
  const eu = getLoggedInComentarioAutor();
  return (eu && eu !== "Equipe" && c.autor === eu) || isAdminUser();
}

function renderComentariosList() {
  const list = document.getElementById("demComentariosList");
  const count = document.getElementById("demComentariosCount");
  if (count) {
    count.textContent = String(editingComentarios.length);
    count.hidden = !editingComentarios.length;
  }
  if (!list) return;
  if (!editingComentarios.length) {
    comentarioEditandoId = "";
    list.innerHTML =
      '<div class="comments-empty"><span class="comments-empty__ico" aria-hidden="true">💬</span>' +
      "<strong>Nenhum comentário ainda</strong><span>Registre atualizações, combinados e pendências do projeto.</span></div>";
    return;
  }
  if (comentarioEditandoId && !editingComentarios.some((c) => c.id === comentarioEditandoId)) comentarioEditandoId = "";
  const eu = getLoggedInComentarioAutor();
  const podeExcluir = !isReadOnlyUser();
  const groups = groupComentariosPorDia(editingComentarios);
  list.innerHTML = groups
    .map(
      (g) =>
        '<div class="comments-day-label"><span>' + escapeHtml(g.label) + "</span></div>" +
        g.items
          .map((c) => {
            const meu = eu && eu !== "Equipe" && c.autor === eu;
            const editando = c.id === comentarioEditandoId;
            const editado = c.editadoEm
              ? ' <span class="comment-editado" title="Editado em ' + escapeHtml(formatComentarioData(c.editadoEm)) + '">· editado</span>'
              : "";
            const corpo = editando
              ? '<div class="comment-edit">' +
                '<textarea class="comment-edit__input" data-cid="' + escapeHtml(c.id) + '" maxlength="4000" rows="3" aria-label="Editar comentário">' +
                escapeHtml(c.texto) + "</textarea>" +
                '<div class="comment-edit__acoes"><span class="comment-edit__dica">Ctrl+Enter salva · Esc cancela</span>' +
                '<button type="button" class="btn btn--ghost btn--sm" data-comment-cancelar="' + escapeHtml(c.id) + '">Cancelar</button>' +
                '<button type="button" class="btn btn--primary btn--sm" data-comment-salvar="' + escapeHtml(c.id) + '">Salvar</button></div></div>'
              : '<p class="comment-text">' + comentarioTextoHtml(c.texto) + "</p>";
            const acoes =
              editando || (!podeExcluir && !podeEditarComentario(c))
                ? ""
                : '<div class="comment-acoes">' +
                  (podeEditarComentario(c)
                    ? '<button type="button" class="comment-acao comment-edit-btn" data-cid="' + escapeHtml(c.id) +
                      '" title="Editar comentário" aria-label="Editar comentário">✎</button>'
                    : "") +
                  (podeExcluir
                    ? '<button type="button" class="comment-acao comment-del" data-cid="' + escapeHtml(c.id) +
                      '" title="Excluir comentário" aria-label="Excluir comentário">🗑</button>'
                    : "") +
                  "</div>";
            return (
              '<article class="comment-row' + (meu ? " is-meu" : "") + (editando ? " is-editando" : "") + '">' +
              '<div class="comment-avatar ' + comentarioAvatarClass(c.autor) + '" aria-hidden="true">' +
              escapeHtml(comentarioIniciais(c.autor)) + "</div>" +
              '<div class="comment-body"><div class="comment-head"><strong>' + escapeHtml(c.autor) +
              (meu ? ' <span class="comment-voce">você</span>' : "") +
              '</strong><time class="comment-time" datetime="' + escapeHtml(c.createdAt) + '" title="' +
              escapeHtml(formatComentarioData(c.createdAt)) + '">' + escapeHtml(formatComentarioRelativo(c.createdAt)) +
              "</time>" + editado + "</div>" +
              corpo + "</div>" +
              acoes +
              "</article>"
            );
          })
          .join(""),
    )
    .join("");
  list.querySelectorAll(".comment-edit-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      comentarioEditandoId = btn.dataset.cid;
      renderComentariosList();
    });
  });
  const ta = list.querySelector(".comment-edit__input");
  if (ta) {
    ligarMencoesNoCampo(ta);
    const ajustar = () => {
      ta.style.height = "auto";
      ta.style.height = `${Math.min(ta.scrollHeight, 260)}px`;
    };
    ajustar();
    ta.addEventListener("input", ajustar);
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        cancelarEdicaoComentario();
      } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        salvarEdicaoComentario(ta.dataset.cid, ta.value);
      }
    });
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    });
  }
  list.querySelector("[data-comment-cancelar]")?.addEventListener("click", cancelarEdicaoComentario);
  list.querySelector("[data-comment-salvar]")?.addEventListener("click", (e) => {
    salvarEdicaoComentario(e.currentTarget.dataset.commentSalvar, ta?.value ?? "");
  });
  list.querySelectorAll(".comment-del").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const cid = btn.dataset.cid;
      const c = editingComentarios.find((x) => x.id === cid);
      if (!c) return;
      // Sem confirmação: o aviso traz "Desfazer" (devolve o comentário na mesma posição).
      const pos = editingComentarios.indexOf(c);
      const demIdComentario = editingDemandaOpenId;
      editingComentarios = editingComentarios.filter((x) => x.id !== cid);
      persistComentariosDemandaAberta();
      renderComentariosList();
      oferecerDesfazer("Comentário excluído", () => restaurarComentario(demIdComentario, c, pos));
    });
  });
}

/** Devolve um comentário excluído (no modal aberto ou direto no projeto, se o modal já fechou). */
function restaurarComentario(demId, c, pos) {
  if (!requireWriteAccess()) return;
  const dem = state.demandas.find((x) => x.id === demId);
  if (!dem) return;
  const inserir = (lista) => {
    const out = lista.filter((x) => x.id !== c.id);
    out.splice(Math.min(Math.max(pos, 0), out.length), 0, c);
    return out;
  };
  if (editingDemandaOpenId === demId) {
    editingComentarios = inserir(editingComentarios);
    persistComentariosDemandaAberta();
    renderComentariosList();
  } else {
    const agora = new Date().toISOString();
    dem.comentarios = normalizeComentarios(inserir(normalizeComentarios(dem.comentarios)));
    dem.updatedAt = agora;
    noteOwnDemandaWrite(demId, agora);
    saveState({ demanda: migrateDemanda(dem) });
    refreshAllViews();
  }
  toast("Comentário restaurado");
}

function cancelarEdicaoComentario() {
  comentarioEditandoId = "";
  renderComentariosList();
}

function salvarEdicaoComentario(cid, texto) {
  const c = editingComentarios.find((x) => x.id === cid);
  if (!c || !podeEditarComentario(c)) return;
  const novo = String(texto || "").trim();
  if (!novo) {
    toast("O comentário não pode ficar vazio — use 🗑 para excluir");
    return;
  }
  comentarioEditandoId = "";
  if (novo === c.texto) {
    renderComentariosList();
    return;
  }
  editingComentarios = editingComentarios.map((x) =>
    x.id === cid ? { ...x, texto: novo, mencoes: extrairMencoes(novo), editadoEm: new Date().toISOString() } : x,
  );
  persistComentariosDemandaAberta();
  renderComentariosList();
  toast("Comentário editado");
}

/** Campo de novo comentário: cresce com o texto e só habilita o envio com conteúdo. */
function syncComentarioCompose() {
  const ta = document.getElementById("demComentarioNovo");
  const btn = document.getElementById("btnAddComentario");
  const hint = document.getElementById("demComentarioHint");
  if (!ta) return;
  ta.style.height = "auto";
  ta.style.height = `${Math.min(ta.scrollHeight, 220)}px`;
  if (btn) btn.disabled = !ta.value.trim() || isReadOnlyUser();
  if (hint) {
    const restante = ta.maxLength - ta.value.length;
    const existente = Boolean((document.getElementById("demId")?.value || "").trim());
    hint.classList.toggle("is-limite", restante < 300);
    hint.textContent =
      restante < 300
        ? `${restante} caracteres restantes`
        : existente
          ? "Ctrl+Enter envia"
          : "Vai junto ao salvar o projeto";
  }
}

function persistComentariosDemandaAberta() {
  const demId = (document.getElementById("demId")?.value || "").trim() || editingDemandaOpenId;
  const dem = demId ? state.demandas.find((x) => x.id === demId) : null;
  if (!dem) return;
  const now = new Date().toISOString();
  dem.comentarios = normalizeComentarios(editingComentarios);
  dem.historicoAlertas = syncHistoricoAlertasOcultos(dem.historicoAlertas, editingComentarios);
  dem.updatedAt = now;
  editingDemandaBaselineUpdatedAt = now;
  noteOwnDemandaWrite(demId, now);
  saveState({ demanda: migrateDemanda(dem) });
}

function addComentarioFromForm() {
  const ta = document.getElementById("demComentarioNovo");
  if (!ta) return;
  const texto = ta.value.trim();
  if (!texto) {
    toast("Digite um comentário");
    ta.focus();
    return;
  }
  const c = normalizeComentario({
    texto,
    autor: getLoggedInComentarioAutor(),
    createdAt: new Date().toISOString(),
    mencoes: extrairMencoes(texto),
  });
  if (c) editingComentarios.unshift(c);
  ta.value = "";
  // Projeto existente: grava na hora (como a exclusão). Projeto novo: vai junto com o Salvar.
  if ((document.getElementById("demId")?.value || "").trim()) {
    persistComentariosDemandaAberta();
    toast("Comentário publicado");
  }
  renderComentariosList();
  syncComentarioCompose();
  ta.focus();
}

function setDemandaFormReadOnly(readOnly) {
  const form = document.getElementById("formDemanda");
  const modal = document.getElementById("modalDemanda");
  if (modal) modal.classList.toggle("demanda-modal--readonly", !!readOnly);
  if (form) {
    form.querySelectorAll("input, select, textarea, button").forEach((el) => {
      if (el.dataset.uiNav) return;
        if (el.id === "modalDemandaClose" || el.id === "btnFecharDemanda" || el.id === "btnEnviarClickup" || el.id === "btnCancelarClickup" || el.id === "btnDemClickupCiente" || el.id === "btnChecklistExpand" || el.id === "btnChecklistGantt") return;
      if (el.closest(".comments-panel__toggle")) return;
      if (el.classList.contains("timeline-move-up") || el.classList.contains("timeline-move-down") || el.classList.contains("checklist-item__move-up") || el.classList.contains("checklist-item__move-down")) {
        if (readOnly) el.disabled = true;
        return;
      }
      if (el.type === "hidden") return;
      if (readOnly) {
        if (el.tagName === "SELECT" || el.type === "checkbox" || el.type === "radio" || el.type === "file") {
          el.disabled = true;
        } else if (el.tagName === "BUTTON") {
          el.disabled = true;
        } else {
          el.readOnly = true;
          el.disabled = false;
        }
      } else {
        el.readOnly = false;
        if (!el.dataset.keepDisabled) el.disabled = false;
      }
    });
  }
  const btnSalvar = document.getElementById("btnSalvarDemanda");
  const btnExcluir = document.getElementById("btnExcluirDemanda");
  if (btnSalvar) btnSalvar.hidden = !!readOnly;
  if (btnExcluir) btnExcluir.hidden = !!readOnly;
  const title = document.getElementById("modalDemandaTitle");
  if (title && readOnly && title.textContent === "Editar demanda") {
    title.textContent = "Visualizar demanda";
  }
  // O laço acima reabilita todos os botões; o envio de comentário só vale com texto.
  syncComentarioCompose();
}
