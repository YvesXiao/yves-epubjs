import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./packages/demo/e2e",
  testMatch: ["**/*.spec.js"],
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:4173",
    headless: true
  },
  webServer: {
    command: "pnpm --filter @yves-epub/demo dev --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: true,
    timeout: 30_000
  },
});
