import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 90000,
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://localhost:4173", trace: "retain-on-failure" },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        channel: process.env.CI ? undefined : "chrome",
      },
    },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
  },
});
