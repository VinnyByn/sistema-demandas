/**
 * Integração com o ClickUp (envio à Operação).
 * Só declarações (funções e constantes); o que roda ao abrir a página fica em app.js.
 */
async function cancelarDemandaClickup(id) {
  if (!requireWriteAccess()) return;
  if (typeof firebase === "undefined" || !firebase.functions) {
    toast("Recarregue a página (Ctrl+F5) para carregar o ClickUp.");
    return;
  }
  const ok = await confirmDialog({
    title: "Cancelar envio à Operação?",
    message:
      "A tarefa será excluída no ClickUp. A demanda continua neste sistema e poderá ser enviada de novo.",
    confirmText: "Excluir no ClickUp",
    cancelText: "Voltar",
    variant: "danger",
  });
  if (!ok) return;
  const btn = document.getElementById("btnCancelarClickup");
  const prev = btn?.textContent || "Cancelar envio";
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Cancelando…";
  }
  beginOwnDemandaWrite(id);
  try {
    const fns = firebase.app().functions("us-central1");
    const call = fns.httpsCallable("cancelClickupOperacao");
    const local = state.demandas.find((x) => x.id === id);
    const cu = normalizeClickup(local?.clickup);
    await call({ demandaId: id, taskId: cu?.taskId || local?.clickupTaskId || "", url: cu?.url || "" });
    const idx = state.demandas.findIndex((x) => x.id === id);
    if (idx >= 0) {
      const now = new Date().toISOString();
      const dem = { ...state.demandas[idx] };
      delete dem.clickup;
      delete dem.clickupTaskId;
      const cmt = normalizeComentario({
        texto: "Envio à Operação cancelado. A tarefa foi excluída no ClickUp.",
        autor: getLoggedInComentarioAutor(),
        createdAt: now,
      });
      if (cmt) {
        dem.comentarios = [cmt, ...normalizeComentarios(dem.comentarios)];
        if (document.getElementById("demId")?.value === id) {
          editingComentarios = [cmt, ...normalizeComentarios(editingComentarios)];
          renderComentariosList();
        }
      }
      dem.updatedAt = now;
      state.demandas[idx] = dem;
      noteOwnDemandaWrite(id, now);
      saveState({ demanda: migrateDemanda(dem) });
      renderBoard();
    }
    setClickupUiOverride(id, null);
    toast("Envio cancelado no ClickUp");
  } catch (err) {
    toast(formatCallableError(err, "Não foi possível cancelar no ClickUp"));
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = prev;
    }
    syncDemClickupUi();
  }
}

let clickupInstrucoesResolve = null;

function initClickupInstrucoesDialog() {
  const dlg = document.getElementById("modalClickupInstrucoes");
  const ta = document.getElementById("clickupInstrucoesTexto");
  const btnOk = document.getElementById("clickupInstrucoesOk");
  const btnCancel = document.getElementById("clickupInstrucoesCancel");
  const btnClose = document.getElementById("clickupInstrucoesClose");
  if (!dlg || !ta || !btnOk || !btnCancel) return;

  const finish = (value) => {
    if (!clickupInstrucoesResolve) return;
    const resolve = clickupInstrucoesResolve;
    clickupInstrucoesResolve = null;
    dlg.close();
    resolve(value);
  };

  btnOk.addEventListener("click", () => {
    const texto = ta.value.trim();
    if (!texto) {
      toast("Informe as instruções do que deverá ser feito.");
      ta.focus();
      return;
    }
    finish(texto);
  });
  btnCancel.addEventListener("click", () => finish(null));
  btnClose?.addEventListener("click", () => finish(null));
  dlg.addEventListener("cancel", (e) => {
    e.preventDefault();
    finish(null);
  });
  dlg.addEventListener("close", () => {
    if (clickupInstrucoesResolve) finish(null);
  });
}

function promptClickupInstrucoes(titulo) {
  const dlg = document.getElementById("modalClickupInstrucoes");
  const ta = document.getElementById("clickupInstrucoesTexto");
  const proj = document.getElementById("clickupInstrucoesProjeto");
  if (!dlg || !ta) return Promise.resolve(null);
  if (proj) {
    const t = String(titulo || "").trim();
    proj.textContent = t ? `Projeto: ${t}` : "";
    proj.hidden = !t;
  }
  ta.value = "";
  return new Promise((resolve) => {
    clickupInstrucoesResolve = resolve;
    dlg.showModal();
    requestAnimationFrame(() => ta.focus());
  });
}

function setClickupUiOverride(id, clickup) {
  clickupUiOverride = id ? { id, clickup: clickup || null } : null;
  ownClickupSyncId = id || "";
  syncDemClickupUi();
  syncDemandaModalAlerts();
}

function syncDemClickupUi() {
  const hint = document.getElementById("demClickupHint");
  const btn = document.getElementById("btnEnviarClickup");
  const link = document.getElementById("demClickupLink");
  const btnCancel = document.getElementById("btnCancelarClickup");
  if (!hint || !btn || !link) return;
  const id = (document.getElementById("demId")?.value || "").trim();
  const d = id ? state.demandas.find((x) => x.id === id) : null;
  let cu = normalizeClickup(d?.clickup);
  if (clickupUiOverride && clickupUiOverride.id === id) {
    cu = clickupUiOverride.clickup ? normalizeClickup(clickupUiOverride.clickup) : null;
  }
  const readOnly = isReadOnlyUser();

  hint.hidden = true;
  hint.textContent = "";
  btn.hidden = true;
  btn.disabled = true;
  link.hidden = true;
  link.removeAttribute("href");
  if (btnCancel) {
    btnCancel.hidden = true;
    btnCancel.disabled = true;
  }

  if (cu?.url) {
    const st = cu.status ? `Status: ${cu.status}` : "Tarefa criada no ClickUp";
    const done = cu.completedAt ? " · concluída" : "";
    hint.hidden = false;
    hint.textContent = st + done;
    link.hidden = false;
    link.href = cu.url;
    if (btnCancel && !readOnly) {
      btnCancel.hidden = false;
      btnCancel.disabled = false;
    }
    return;
  }
  if (!id) {
    hint.hidden = false;
    hint.textContent = "Salve a demanda para enviar ao ClickUp.";
    return;
  }
  if (readOnly) {
    hint.hidden = false;
    hint.textContent = "Ainda não enviada ao ClickUp.";
    return;
  }
  hint.hidden = true;
  btn.hidden = false;
  btn.disabled = false;
  btn.textContent = "Enviar à Operação";
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
