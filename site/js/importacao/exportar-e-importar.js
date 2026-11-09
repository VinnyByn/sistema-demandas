/**
 * Exportar e importar (JSON e CSV).
 * Só declarações (funções e constantes); o que roda ao abrir a página fica em app.js.
 */
/* ---------- Export / import ---------- */
function downloadBlob(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function setDropdownMenuOpen(panelId, btnId, open) {
  const panel = document.getElementById(panelId);
  const btn = document.getElementById(btnId);
  if (!panel || !btn) return;
  panel.hidden = !open;
  btn.setAttribute("aria-expanded", open ? "true" : "false");
}

function setImportMenuOpen(open) {
  setDropdownMenuOpen("importMenuPanel", "btnImportToggle", open);
}

function setExportMenuOpen(open) {
  setDropdownMenuOpen("exportMenuPanel", "btnExportToggle", open);
}

function exportStateJson() {
  if (!isAdminUser()) {
    toast("Apenas administrador exporta");
    return;
  }
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  downloadBlob(blob, `demandas-backup-${todayISODate()}.json`);
  toast("Exportação JSON gerada");
}

function exportStateCsvFollowUp() {
  if (!isAdminUser()) {
    toast("Apenas administrador exporta");
    return;
  }
  if (typeof DemandasCsvImport === "undefined") {
    toast("Módulo csv-import.js não carregou. Recarregue a página.");
    return;
  }
  const list = state.demandas.map(migrateDemanda);
  if (!list.length) {
    toast("Nenhuma demanda para exportar");
    return;
  }
  const csv = DemandasCsvImport.exportFollowUpCsv(list, todayISODate(), {
    isAtraso: (d) => isAtraso(d),
    diasAtraso: (d) => demandaDiasAtraso(d),
    diasAberto: (d) => demandaDiasAberto(d),
  });
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, `relatorio-projetos-completo-${todayISODate()}.csv`);
  toast(`${list.length} projeto(s) exportado(s) — relatório completo CSV`);
}

/* ---------- Import CSV Follow-up ---------- */
let pendingCsvImport = null;

function refreshCsvImportPreview() {
  if (!pendingCsvImport) return;
  const mode = document.getElementById("importCsvMode")?.value || "skip";
  const plan = DemandasCsvImport.planImport(
    pendingCsvImport.records,
    state.demandas.map(migrateDemanda),
    mode,
    uid,
    todayISODate,
  );
  pendingCsvImport.plan = plan;

  const sum = document.getElementById("importCsvSummary");
  if (sum) {
    sum.innerHTML =
      `<strong>${pendingCsvImport.records.length}</strong> projeto(s) na planilha → ` +
      `<strong>${plan.novos}</strong> novo(s), <strong>${plan.atualizados}</strong> atualização(ões), ` +
      `<strong>${plan.ignorados}</strong> ignorado(s).`;
  }

  const tbody = document.getElementById("importCsvPreviewBody");
  const more = document.getElementById("importCsvPreviewMore");
  const rows = DemandasCsvImport.previewRows(plan.toApply, 20);
  if (tbody) {
    tbody.innerHTML = rows
      .map(
        (r) =>
          `<tr><td>${escapeHtml(r.titulo)}</td><td>${escapeHtml(r.regional)}</td><td>${escapeHtml(r.csvStatus)}</td>` +
          `<td>${escapeHtml(r.situacao)}</td><td>${escapeHtml(r.linha)}</td><td>${escapeHtml(r.esteira)}</td><td>${escapeHtml(r.responsavel)}</td><td>${escapeHtml(r.acao)}</td></tr>`,
      )
      .join("");
  }
  if (more) {
    const rest = plan.toApply.length - rows.length;
    more.hidden = rest <= 0;
    more.textContent = rest > 0 ? `… e mais ${rest} na importação.` : "";
  }

  const btn = document.getElementById("btnImportCsvConfirm");
  if (btn) btn.disabled = plan.toApply.length === 0;
}

async function openCsvImportModal(file) {
  if (typeof DemandasCsvImport === "undefined") {
    toast("Módulo csv-import.js não carregou. Recarregue a página.");
    return;
  }
  let text;
  try {
    text = await file.text();
  } catch {
    toast("Não foi possível ler o arquivo");
    return;
  }
  const parsed = DemandasCsvImport.parseFile(text);
  if (!parsed.ok) {
    toast(parsed.error || "CSV inválido");
    return;
  }
  pendingCsvImport = { records: parsed.records, fileName: file.name };
  const modeSel = document.getElementById("importCsvMode");
  if (modeSel) modeSel.value = "skip";
  refreshCsvImportPreview();
  modalImportCsv?.showModal();
}

async function confirmCsvImport() {
  if (!requireWriteAccess("import")) return;
  if (!pendingCsvImport?.plan?.toApply?.length) {
    toast("Nada para importar com este modo");
    return;
  }
  const btn = document.getElementById("btnImportCsvConfirm");
  if (btn) btn.disabled = true;
  let n = 0;
  for (const { dem } of pendingCsvImport.plan.toApply) {
    const migrated = migrateDemanda(dem);
    const idx = state.demandas.findIndex((x) => x.id === migrated.id);
    if (idx >= 0) state.demandas[idx] = migrated;
    else state.demandas.push(migrated);
    applyCloudPatch({ demanda: migrated });
    n++;
  }
  saveState();
  pendingCsvImport = null;
  modalImportCsv?.close();
  refreshAllViews();
  if (btn) btn.disabled = false;
  toast(`${n} projeto(s) importado(s) da planilha`);
}
