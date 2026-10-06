const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "e2e",
  timeout: 30000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:4173",
    viewport: { width: 1360, height: 900 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node e2e/servidor.js",
    url: "http://localhost:4173/index.html",
    reuseExistingServer: !process.env.CI,
  },
});
