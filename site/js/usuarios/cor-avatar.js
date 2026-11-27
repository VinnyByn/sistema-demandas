/**
 * Cor do avatar (a bolinha com as iniciais): cada pessoa escolhe a sua em Minha conta → Perfil.
 * Fica no doc meta (`coresAvatar`, uma chave por e-mail, como os filtros salvos), então todos veem a mesma cor:
 * cards da esteira, responsáveis das atividades, comentários e menu do usuário.
 * Sem escolha, vale a cor automática (calculada pelo nome), como antes.
 */
const CORES_AVATAR = [
  { h: 4, nome: "Vermelho" },
  { h: 24, nome: "Laranja" },
  { h: 45, nome: "Âmbar" },
  { h: 95, nome: "Verde-limão" },
  { h: 145, nome: "Verde" },
  { h: 174, nome: "Turquesa" },
  { h: 195, nome: "Ciano" },
  { h: 215, nome: "Azul" },
  { h: 245, nome: "Índigo" },
  { h: 270, nome: "Roxo" },
  { h: 300, nome: "Magenta" },
  { h: 330, nome: "Rosa" },
];

/** Chave do e-mail no mapa (sem pontos, que viram caminho em algumas operações) — igual aos filtros salvos. */
function corAvatarChave(email) {
  const e = String(email || "").trim().toLowerCase();
  return e ? e.replace(/\./g, ",") : "";
}

function corAvatarDoEmail(email) {
  const mapa = state?.coresAvatar && typeof state.coresAvatar === "object" ? state.coresAvatar : {};
  const h = mapa[corAvatarChave(email)];
  return typeof h === "number" && Number.isInteger(h) && h >= 0 && h < 360 ? h : null;
}

/** Nome (projetista, autor de comentário) → cor escolhida pela conta com esse nome; null se não houver. */
let corAvatarCache = { chave: "", mapa: new Map() };
function corAvatarDoNome(nome) {
  const mapaCores = state?.coresAvatar && typeof state.coresAvatar === "object" ? state.coresAvatar : null;
  if (!mapaCores || !Object.keys(mapaCores).length) return null;
  const versao = typeof DemandasRoles !== "undefined" && DemandasRoles.getVersion ? DemandasRoles.getVersion() : 0;
  const chave = `${versao}|${JSON.stringify(mapaCores)}`;
  if (corAvatarCache.chave !== chave) {
    // Nome inteiro e primeiro nome da conta (os projetistas costumam ser só o primeiro nome).
    const mapa = new Map();
    const primeiros = new Map();
    const emails = new Set(typeof DemandasRoles !== "undefined" ? Object.keys(DemandasRoles.getRolesMap?.() || {}) : []);
    if (getCurrentUserEmail()) emails.add(getCurrentUserEmail());
    for (const email of emails) {
      const h = corAvatarDoEmail(email);
      if (h == null) continue;
      const nomeConta = projetistaSlug(accountDisplayNameForEmail(email));
      if (!nomeConta) continue;
      mapa.set(nomeConta, h);
      const primeiro = nomeConta.split(/\s+/)[0];
      primeiros.set(primeiro, primeiros.has(primeiro) ? null : h); // dois com o mesmo primeiro nome: nenhum
    }
    for (const [p, h] of primeiros) if (h != null && !mapa.has(p)) mapa.set(p, h);
    corAvatarCache = { chave, mapa };
  }
  return corAvatarCache.mapa.get(projetistaSlug(nome)) ?? null;
}

/** Estilo inline para avatares em gradiente (comentários, menu): vazio quando a pessoa não escolheu cor. */
function corAvatarEstilo(nome) {
  const h = corAvatarDoNome(nome);
  return h == null ? "" : ` style="background:linear-gradient(135deg, hsl(${h} 70% 45%), hsl(${(h + 25) % 360} 65% 35%));"`;
}

function aplicarCorAvatarNoElemento(el, h) {
  if (!el) return;
  if (h == null) el.style.removeProperty("background");
  else el.style.background = `linear-gradient(135deg, hsl(${h} 70% 45%), hsl(${(h + 25) % 360} 65% 35%))`;
}

/** Avatares da própria conta (menu do topo e Minha conta). */
function syncCorAvatarDaConta() {
  const email = getCurrentUserEmail();
  const h = corAvatarDoEmail(email);
  ["userMenuAvatar", "userMenuHeadAvatar", "contaNavAvatar", "contaPerfilAvatar"].forEach((id) => aplicarCorAvatarNoElemento(document.getElementById(id), h));
  renderEscolhaCorAvatar();
}

function renderEscolhaCorAvatar() {
  const box = document.getElementById("contaCorAvatar");
  if (!box) return;
  const email = getCurrentUserEmail();
  const atual = corAvatarDoEmail(email);
  const podeMudar = !!email && !isReadOnlyUser();
  const bolinha = (h, nome) =>
    `<button type="button" role="radio" class="cor-avatar__op${(h ?? null) === atual ? " is-ativa" : ""}" data-cor-avatar="${h ?? ""}"` +
    ` aria-checked="${(h ?? null) === atual}" title="${escapeHtml(nome)}" aria-label="${escapeHtml(nome)}"${podeMudar ? "" : " disabled"}` +
    (h == null ? "" : ` style="--cor:hsl(${h} 70% 45%)"`) +
    `>${h == null ? "A" : ""}</button>`;
  box.innerHTML =
    `<div class="cor-avatar__ops" role="radiogroup" aria-labelledby="contaCorAvatarRot">` +
    bolinha(null, "Automática (pelo nome)") +
    CORES_AVATAR.map((c) => bolinha(c.h, c.nome)).join("") +
    `</div>` +
    (podeMudar ? "" : `<p class="muted small">Seu perfil é só de visualização: peça ao administrador para mudar a cor.</p>`);
}

function escolherCorAvatar(valor) {
  const email = getCurrentUserEmail();
  if (!email || isReadOnlyUser()) return;
  const chave = corAvatarChave(email);
  const h = valor === "" || valor == null ? null : Number(valor);
  const novo = { ...(state.coresAvatar || {}) };
  if (h == null) delete novo[chave];
  else novo[chave] = h;
  state.coresAvatar = novo;
  // null apaga a chave no banco (o merge do meta trata null como remoção); número grava a cor.
  saveState({ metaFields: { coresAvatar: { [chave]: h } } });
  syncCorAvatarDaConta();
  refreshAllViews();
  toast(h == null ? "Cor do avatar: automática" : `Cor do avatar: ${CORES_AVATAR.find((c) => c.h === h)?.nome || "escolhida"}`);
}

function ligarCorAvatar() {
  const box = document.getElementById("contaCorAvatar");
  if (!box || box.dataset.ligado) return;
  box.dataset.ligado = "1";
  box.addEventListener("click", (e) => {
    const b = e.target.closest("[data-cor-avatar]");
    if (b && !b.disabled) escolherCorAvatar(b.dataset.corAvatar);
  });
}
