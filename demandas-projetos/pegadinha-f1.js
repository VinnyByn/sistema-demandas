/**
 * Pegadinha: ao passar o mouse na busca da esteira, um F1 vermelho (#16 do Leclerc) cruza a barra.
 * Não roda com "menos animação" (Minha conta → Aparência) nem com movimento reduzido no sistema.
 */
(function () {
  const CARRO_SVG = `
<svg viewBox="0 0 160 44" aria-hidden="true" focusable="false">
  <g class="f1-carro__corpo">
    <rect x="2" y="5" width="22" height="5" rx="1" fill="#c00000"/>
    <rect x="4" y="5" width="5" height="23" rx="1" fill="#111"/>
    <text x="13" y="9.3" font-size="4" font-weight="800" fill="#fff" font-family="Arial, sans-serif" text-anchor="middle">LEC</text>
    <path d="M10 27 L12 19 L38 16 L49 8 L60 8 L66 16 L86 18 L140 24 L152 27 L152 31 L10 31 Z" fill="#dc0000"/>
    <path d="M38 22 L86 21 L124 25 L124 27 L38 27 Z" fill="#a00000"/>
    <path d="M86 19 L140 25 L140 26.5 L86 20.6 Z" fill="#fff"/>
    <circle cx="69" cy="15" r="4.3" fill="#fff"/>
    <path d="M65.4 13.6 h7.2 v2.4 h-7.2 Z" fill="#1d4ed8"/>
    <path d="M58 18 Q66 7.5 79 17.5" fill="none" stroke="#222" stroke-width="2" stroke-linecap="round"/>
    <text x="94" y="30" font-size="7" font-weight="900" fill="#fff" font-family="Arial, sans-serif" font-style="italic">16</text>
    <rect x="134" y="30" width="25" height="3.2" rx="1" fill="#dc0000"/>
    <rect x="155" y="25" width="3.5" height="8.2" rx="1" fill="#111"/>
  </g>
  <g class="f1-carro__roda" style="transform-origin:30px 31px">
    <circle cx="30" cy="31" r="10" fill="#111"/><circle cx="30" cy="31" r="4.5" fill="#555"/>
    <path d="M30 22 v18 M21 31 h18" stroke="#333" stroke-width="1.6"/>
    <circle cx="30" cy="31" r="10" fill="none" stroke="#facc15" stroke-width="1" stroke-dasharray="3 4"/>
  </g>
  <g class="f1-carro__roda" style="transform-origin:122px 31px">
    <circle cx="122" cy="31" r="10" fill="#111"/><circle cx="122" cy="31" r="4.5" fill="#555"/>
    <path d="M122 22 v18 M113 31 h18" stroke="#333" stroke-width="1.6"/>
    <circle cx="122" cy="31" r="10" fill="none" stroke="#facc15" stroke-width="1" stroke-dasharray="3 4"/>
  </g>
</svg>`;

  let correndo = false;

  function semAnimacao() {
    if (document.documentElement.dataset.menosAnimacao === "1") return true;
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (_) {
      return false;
    }
  }

  function largar(barra) {
    if (correndo || semAnimacao() || typeof Element.prototype.animate !== "function") return;
    const r = barra.getBoundingClientRect();
    if (!r.width) return;
    correndo = true;
    const carro = document.createElement("div");
    carro.className = "f1-carro";
    carro.setAttribute("aria-hidden", "true");
    carro.innerHTML = CARRO_SVG;
    const largura = 116;
    const altura = Math.round((largura * 44) / 160);
    carro.style.width = `${largura}px`;
    carro.style.height = `${altura}px`;
    // "Pista" = borda de baixo da busca; o carro sai antes da esquerda e some depois da direita.
    carro.style.top = `${Math.round(r.bottom - altura + 4)}px`;
    carro.style.left = `${Math.round(r.left - largura)}px`;
    document.body.appendChild(carro);
    const distancia = r.width + largura * 2;
    const anim = carro.animate(
      [
        { transform: "translateX(0)" },
        { transform: `translateX(${distancia}px)` },
      ],
      { duration: Math.min(1600, 700 + r.width), easing: "cubic-bezier(.45,0,.85,.6)" },
    );
    const fim = () => {
      carro.remove();
      correndo = false;
    };
    anim.onfinish = fim;
    anim.oncancel = fim;
  }

  function iniciar() {
    const barra = document.querySelector(".esteira-busca");
    if (!barra) return;
    barra.addEventListener("mouseenter", () => largar(barra));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
