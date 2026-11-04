/**
 * App Check (opcional): prova para o Firebase que as chamadas vêm deste site, não de um script
 * com a apiKey copiada. Só liga se firebase-config.js tiver `appCheckSiteKey` (chave do
 * reCAPTCHA Enterprise criada no Console → App Check). Sem a chave, não faz nada.
 * Precisa rodar antes de qualquer uso do Firestore, Functions ou Storage.
 */
(function () {
  const cfg = window.FIREBASE_CONFIG || {};
  const chave = String(cfg.appCheckSiteKey || "").trim();
  if (!chave || typeof firebase === "undefined" || typeof firebase.appCheck !== "function") return;
  const Provedor = firebase.appCheck.ReCaptchaEnterpriseProvider;
  if (typeof Provedor !== "function") {
    console.warn("App Check: provedor reCAPTCHA Enterprise indisponível nesta versão do SDK.");
    return;
  }
  try {
    const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(cfg);
    firebase.appCheck(app).activate(new Provedor(chave), true);
  } catch (e) {
    console.warn("App Check não ativado:", e);
  }
})();
