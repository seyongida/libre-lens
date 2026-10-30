import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { renderSponsor } from "../../scripts/sponsor.mjs";

test("public guide pages work at mobile sizes without third-party requests", async ({ page }) => {
  const external = [];
  page.on("request", (request) => {
    if (new URL(request.url()).origin !== "http://localhost:4173") external.push(request.url());
  });
  for (const path of ["guide.html", "privacy.html", "sponsor.html"]) {
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      const response = await page.goto(`/${path}`);
      expect(response.status()).toBe(200);
      await expect(page.locator("h1")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
  expect(external).toEqual([]);
  await page.goto("/");
  await expect(page.locator(".sponsor-card")).toHaveCount(0);
  for (const href of ["./guide.html", "./privacy.html", "./sponsor.html"]) {
    await expect(page.locator(`.footer-links a[href="${href}"]`)).toBeVisible();
  }
});

test("sponsor shows disclosed text only and disappears during analysis", async ({ browser }) => {
  const context = await browser.newContext({ serviceWorkers: "block", viewport: { width: 320, height: 844 } });
  const page = await context.newPage();
  const external = [];
  page.on("request", (r) => { if (!r.url().startsWith("http://localhost:4173") && !r.url().startsWith("blob:")) external.push(r.url()); });
  const card = renderSponsor({ sponsor: { enabled: true, name: "Test <partner>", headline: "A quiet sponsor", description: "Test fixture only", url: "https://example.com/" } });
  const html = fs.readFileSync("dist/index.html", "utf8").replace('<section id="how-it-works"', `${card}<section id="how-it-works"`);
  await page.route("http://localhost:4173/", (route) => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto("/");
  await expect(page.locator(".sponsor-card")).toBeVisible();
  await expect(page.locator(".sponsor-meta")).toContainText("Test <partner>");
  await expect(page.locator(".sponsor-card a")).toHaveAttribute("rel", "sponsored noopener noreferrer");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator("#demo-button").click();
  await expect(page.locator("#workspace")).toBeVisible({ timeout: 60000 });
  await expect(page.locator(".sponsor-card")).toBeHidden();
  await page.locator("#clear-button").click();
  await expect(page.locator(".sponsor-card")).toBeVisible();
  expect(external).toEqual([]);
  await context.close();
});

test("guide and privacy remain readable offline after app preparation", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.locator("#offline-status")).toContainText("오프라인 준비 완료", { timeout: 60000 });
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  for (const path of ["guide.html", "privacy.html", "sponsor.html"]) {
    await page.goto(`/${path}`);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator('a[aria-current="page"]')).toHaveCount(1);
  }
  await context.setOffline(false);
});
