const { defineConfig } = require("@playwright/test");

// Porta do servidor de teste (E2E_PORT muda, se a 4173 estiver ocupada por outro servidor antigo).
const porta = Number(process.env.E2E_PORT || 4173);

module.exports = defineConfig({
  testDir: "e2e",
  timeout: 30000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${porta}`,
    viewport: { width: 1360, height: 900 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node e2e/servidor.js",
    env: { PORT: String(porta) },
    url: `http://localhost:${porta}/index.html`,
    reuseExistingServer: !process.env.CI,
  },
});
