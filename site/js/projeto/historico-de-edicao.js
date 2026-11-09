/**
 * Histórico de edição do projeto e menu do rodapé da janela.
 * Só declarações (funções e constantes); o que roda ao abrir a página fica em app.js.
 */
function setDemandaFootMenuOpen(open) {
  if (!demandaFootMenu || !demandaFootMenuList || !btnDemandaMaisOpcoes) return;
  demandaFootMenu.classList.toggle("is-open", open);
  demandaFootMenuList.hidden = !open;
  btnDemandaMaisOpcoes.setAttribute("aria-expanded", open ? "true" : "false");
}

function abrirHistoricoEdicaoModal() {
  const id = document.getElementById("demId")?.value?.trim();
  const dem = id ? state.demandas.find((x) => x.id === id) : null;
  const tituloAtual = document.getElementById("demTitulo")?.value?.trim();
  const titEl = document.getElementById("modalHistoricoEdicaoTitulo");
  if (titEl) {
    titEl.textContent = tituloAtual
      ? `Histórico de edição — ${tituloAtual}`
      : "Histórico de edição";
  }
  const target = document.getElementById("histEdicaoList");
  if (!target) return;
  if (!dem) {
    target.innerHTML =
      '<p class="muted small">Esta demanda ainda não foi salva. O histórico começa a ser registrado a partir do primeiro salvamento.</p>';
    modalHistoricoEdicao?.showModal();
    return;
  }
  const lista = normalizeHistoricoEdicoes(dem.historicoEdicoes || []);
  if (!lista.length) {
    target.innerHTML =
      '<p class="muted small">Nenhuma alteração registrada. As próximas edições e a criação serão exibidas aqui.</p>';
  } else {
    target.innerHTML = renderHistoricoEdicaoEntries(lista);
  }
  modalHistoricoEdicao?.showModal();
}

function renderHistoricoEdicaoEntries(lista) {
  const ordenado = [...lista].sort((a, b) => Date.parse(b.at || 0) - Date.parse(a.at || 0));
  return ordenado
    .map((e) => {
      const quando = formatComentarioData(e.at) || "—";
      const autor = escapeHtml(e.by?.autor || "Equipe");
      const email = e.by?.email ? `<span class="hist-edicao__email">${escapeHtml(e.by.email)}</span>` : "";
      const tipoCls = e.tipo === "criacao" ? "hist-edicao__pill hist-edicao__pill--criar" : "hist-edicao__pill";
      const tipoLab = e.tipo === "criacao" ? "Criação" : "Edição";
      let corpo = "";
      if (e.tipo === "criacao") {
        corpo = `<p class="hist-edicao__nota">${escapeHtml(e.nota || "Demanda criada.")}</p>`;
      } else if (e.alteracoes.length) {
        corpo =
          '<ul class="hist-edicao__alteracoes">' +
          e.alteracoes
            .map(
              (a) =>
                `<li><strong>${escapeHtml(a.label)}</strong>: <span class="hist-edicao__de">${escapeHtml(String(a.de ?? "—"))}</span> <span aria-hidden="true">→</span> <span class="hist-edicao__para">${escapeHtml(String(a.para ?? "—"))}</span></li>`,
            )
            .join("") +
          "</ul>";
      } else {
        corpo = '<p class="muted small">Sem campos rastreados alterados.</p>';
      }
      return `
        <article class="hist-edicao-item">
          <header class="hist-edicao__head">
            <span class="${tipoCls}">${tipoLab}</span>
            <span class="hist-edicao__quando" title="${escapeHtml(e.at)}">${escapeHtml(quando)}</span>
          </header>
          <p class="hist-edicao__autor"><strong>${autor}</strong> ${email}</p>
          ${corpo}
        </article>
      `;
    })
    .join("");
}

