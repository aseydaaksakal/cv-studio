import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: /.*\.e2e\.mjs/,
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: "http://localhost:4173", trace: "retain-on-failure" },
  webServer: { command: "node tests/serve.mjs", url: "http://localhost:4173", reuseExistingServer: !process.env.CI },
  /* PLAYWRIGHT_CHROMIUM lets a machine with a preinstalled Chromium (agent sandboxes) run the suite without downloading one. */
  projects: [{ name: "chromium", use: { browserName: "chromium", launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"], ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}) } } }],
});
