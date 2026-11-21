/**
 * Avisos por e-mail (Minha conta → Avisos) e o link dos e-mails (?abrir=<projeto>), que abre o projeto ao entrar.
 * Os e-mails são montados e enviados pelo banco; aqui só se escolhe o que receber.
 */
const AVISOS_EMAIL_TIPOS = [
  { chave: "mencao", rotulo: "Quando me mencionarem", desc: "Alguém escreveu @seu nome num comentário." },
  { chave: "atribuicao", rotulo: "Quando algo for passado para mim", desc: "Você virou projetista de um projeto ou responsável por uma atividade." },
  { chave: "prazos", rotulo: "Resumo diário de prazos", desc: "Dias úteis, de manhã: o que está atrasado, vence hoje ou nos próximos 3 dias." },
];

let avisosEmailCarregando = false;

function avisosEmailCliente() {
  return typeof DemandasConsulta !== "undefined" ? DemandasConsulta.cliente() : null;
}

function avisosEmailHtmlLista(prefs, desabilitado) {
  return AVISOS_EMAIL_TIPOS.map(
    (t) =>
      '<div class="conta-row conta-row--split conta-pref">' +
      '<div class="conta-pref__txt">' +
      `<span class="conta-label" id="avisoRot_${t.chave}">${escapeHtml(t.rotulo)}</span>` +
      `<p class="muted small">${escapeHtml(t.desc)}</p></div>` +
      '<label class="conta-switch">' +
      `<input type="checkbox" data-aviso-email="${t.chave}" aria-labelledby="avisoRot_${t.chave}"${prefs?.[t.chave] !== false ? " checked" : ""}${desabilitado ? " disabled" : ""} />` +
      '<span class="conta-switch__track" aria-hidden="true"></span></label></div>',
  ).join("");
}

function avisosEmailStatusHtml(prefs) {
  if (!prefs) return "";
  const admin = typeof isAdminUser === "function" && isAdminUser();
  if (!prefs.envioConfigurado) {
    return (
      '<div class="avisos-status avisos-status--pendente">' +
      "<strong>O envio de e-mails ainda não foi ligado.</strong>" +
      (admin
        ? "<span>Falta guardar no Supabase a chave do serviço de e-mail (veja docs/avisos-email.md). Suas escolhas abaixo já ficam salvas.</span>"
        : "<span>Suas escolhas abaixo já ficam salvas e passam a valer quando o administrador ligar o envio.</span>") +
      "</div>"
    );
  }
  if (!admin) return '<div class="avisos-status avisos-status--ok"><strong>Envio ligado.</strong><span>Os e-mails vão para o endereço da sua conta.</span></div>';
  const n = (v) => Number(v) || 0;
  return (
    '<div class="avisos-status avisos-status--ok">' +
    "<strong>Envio ligado.</strong>" +
    `<span>Últimos 7 dias: ${n(prefs.enviados7d)} enviado${n(prefs.enviados7d) === 1 ? "" : "s"}` +
    (n(prefs.erros7d) ? `, <b class="avisos-status__erro">${n(prefs.erros7d)} com erro</b>` : "") +
    (n(prefs.pendentes) ? ` · ${n(prefs.pendentes)} na fila` : "") +
    "</span>" +
    (prefs.ultimoErro && n(prefs.erros7d) ? `<span class="avisos-status__detalhe">Último erro: ${escapeHtml(String(prefs.ultimoErro).slice(0, 200))}</span>` : "") +
    '<button type="button" class="btn btn--ghost btn--sm" id="btnAvisoEmailTeste">Mandar um e-mail de teste para mim</button>' +
    "</div>"
  );
}

async function carregarAvisosEmail() {
  const box = document.getElementById("contaAvisosEmail");
  if (!box || avisosEmailCarregando) return;
  const cli = avisosEmailCliente();
  if (!cli) {
    box.innerHTML =
      '<div class="avisos-status avisos-status--pendente"><strong>Disponível quando estiver conectado à nuvem.</strong></div>' +
      avisosEmailHtmlLista(null, true);
    return;
  }
  avisosEmailCarregando = true;
  box.setAttribute("aria-busy", "true");
  try {
    const prefs = await DemandasConsulta.executar(cli.rpc("email_preferencias_ler"));
    box.innerHTML = avisosEmailStatusHtml(prefs) + avisosEmailHtmlLista(prefs, false);
  } catch (e) {
    DemandasLog.aviso("Ler avisos por e-mail", e);
    box.innerHTML =
      '<div class="avisos-status avisos-status--pendente"><strong>Não foi possível carregar suas escolhas agora.</strong>' +
      "<span>Tente de novo em instantes.</span></div>";
  } finally {
    avisosEmailCarregando = false;
    box.removeAttribute("aria-busy");
  }
}

async function salvarAvisoEmail(input) {
  const cli = avisosEmailCliente();
  if (!cli) return;
  const chave = input.dataset.avisoEmail;
  input.disabled = true;
  try {
    await DemandasConsulta.executar(cli.rpc("email_preferencias_salvar", { p_campos: { [chave]: input.checked } }));
    toast(input.checked ? "Aviso por e-mail ligado" : "Aviso por e-mail desligado");
  } catch (e) {
    input.checked = !input.checked;
    toast(e?.message || "Não foi possível salvar");
  } finally {
    input.disabled = false;
  }
}

async function pedirEmailTeste(btn) {
  const cli = avisosEmailCliente();
  if (!cli) return;
  btn.disabled = true;
  try {
    await DemandasConsulta.executar(cli.rpc("email_teste"));
    toast("E-mail de teste na fila: chega em até 5 minutos");
  } catch (e) {
    toast(e?.message || "Não foi possível pedir o teste");
  } finally {
    setTimeout(() => {
      btn.disabled = false;
    }, 3000);
  }
}

function ligarAvisosEmail() {
  const box = document.getElementById("contaAvisosEmail");
  if (!box || box.dataset.ligado) return;
  box.dataset.ligado = "1";
  box.addEventListener("change", (e) => {
    const input = e.target.closest("[data-aviso-email]");
    if (input) void salvarAvisoEmail(input);
  });
  box.addEventListener("click", (e) => {
    const btn = e.target.closest("#btnAvisoEmailTeste");
    if (btn) void pedirEmailTeste(btn);
  });
}

/* ---------- Link dos e-mails: ?abrir=<id do projeto> ---------- */
let abrirDoLinkFeito = false;

function abrirProjetoDoLink() {
  if (abrirDoLinkFeito) return;
  let id = "";
  try {
    id = new URLSearchParams(location.search).get("abrir") || "";
  } catch {
    id = "";
  }
  if (!id) {
    abrirDoLinkFeito = true;
    return;
  }
  const d = (state.demandas || []).find((x) => x.id === id);
  if (!d || document.getElementById("appRoot")?.hidden) return; // os dados ainda vão chegar
  abrirDoLinkFeito = true;
  try {
    const url = new URL(location.href);
    url.searchParams.delete("abrir");
    history.replaceState(history.state, "", url.pathname + url.search + url.hash);
  } catch {
    /* sem history: o link continua na barra, sem problema */
  }
  if (d.arquivadoEm) {
    toast("Este projeto está arquivado (veja em Arquivo e lixeira)");
    return;
  }
  openDemandaModal(id);
}
