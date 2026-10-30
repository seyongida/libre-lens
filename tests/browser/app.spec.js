import { test, expect } from "@playwright/test";
import fs from "node:fs";
const source = fs.existsSync("../sample.png")
  ? "../sample.png"
  : "public/demo.png";
async function importSample(page, file = source) {
  await page.locator("#file-input").setInputFiles(file);
  await expect(page.locator("#workspace")).toBeVisible({ timeout: 60000 });
  await expect(page.locator("#status")).toBeHidden();
}
test("mobile: real screenshot OCR, drag, edge tooltip, re-import, export and clear", async ({
  page,
  browserName,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const external = [];
  page.on("request", (r) => {
    if (
      !r.url().startsWith("http://localhost:4173") &&
      !r.url().startsWith("blob:") &&
      !r.url().startsWith("data:")
    )
      external.push(r.url());
  });
  await page.goto("/");
  await importSample(page);
  await expect(page.locator("#selected-value")).toHaveText("115");
  await expect(page.locator("#calibration-summary")).toContainText("자동 판독");
  await expect(page.locator("#selected-time")).toHaveText("20:52");
  const chart = page.locator("#chart");
  await chart.scrollIntoViewIfNeeded();
  let box = await chart.boundingBox();
  await page.mouse.move(box.x + 36, box.y + 150);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 18, box.y + 150, { steps: 25 });
  await page.mouse.up();
  const rightTime = await page.locator("#selected-time").textContent();
  expect(rightTime).toMatch(/20:/);
  for (const x of [box.x + 35, box.x + box.width / 2, box.x + box.width - 16]) {
    await page.mouse.click(x, box.y + 200);
    const tip = await page.locator("#tooltip").boundingBox();
    expect(tip).not.toBeNull();
    expect(tip.x).toBeGreaterThanOrEqual(box.x);
    expect(tip.x + tip.width).toBeLessThanOrEqual(box.x + box.width + 1);
  }
  await chart.focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("End");
  await expect(page.locator("#selected-value")).toHaveText("115");
  await page.locator("#original-button").click();
  await expect(page.locator("#original-dialog")).toBeVisible();
  await page.locator('[data-close="original-dialog"]').click();
  await page.locator("#settings-button").click();
  await page.locator("#end-time").fill("01:00");
  await page.locator("#hours").fill("8");
  await page.locator("#calibration-form button").click();
  await expect(page.locator("#calibration-summary")).toContainText(
    "17:00–01:00",
  );
  await chart.focus();
  await page.keyboard.press("Home");
  await expect(page.locator("#selected-time")).toContainText("전날");
  const download = page.waitForEvent("download");
  await page.locator("#export-button").click();
  expect((await download).suggestedFilename()).toBe("libre-lens-estimates.csv");
  await importSample(page, "public/demo.png");
  await expect(page.locator("#selected-time")).toHaveText("20:52");
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
  await page.locator("#clear-button").click();
  await expect(page.locator("#workspace")).toBeHidden();
  await expect(page.locator("#upload-button")).toBeVisible();
});
test("offline restart: shell, demo, OCR and file import work without network", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(page.locator("#offline-status")).toContainText(
    "오프라인 준비 완료",
    { timeout: 60000 },
  );
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  await page.locator("#demo-button").click();
  await expect(page.locator("#workspace")).toBeVisible({ timeout: 60000 });
  await expect(page.locator("#calibration-summary")).toContainText("자동 판독");
  await expect(page.locator("#selected-value")).toHaveText("115");
  await importSample(page);
  await expect(page.locator("#selected-time")).toHaveText("20:52");
  await context.setOffline(false);
});
test("invalid file keeps existing analysis and offers readable error", async ({
  page,
}) => {
  await page.goto("/");
  await importSample(page);
  await page
    .locator("#file-input")
    .setInputFiles({
      name: "broken.png",
      mimeType: "image/png",
      buffer: Buffer.from("broken"),
    });
  await expect(page.locator("#error")).toContainText("이미지를 열 수 없습니다");
  await expect(page.locator("#selected-value")).toHaveText("115");
});
test("narrow, landscape and large screens have no horizontal overflow", async ({
  page,
}) => {
  await page.goto("/");
  await importSample(page, "public/demo.png");
  for (const width of [320, 360, 430, 844, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await page.waitForTimeout(80);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.locator("#chart").focus();
    await page.keyboard.press("End");
    const t = await page.locator("#tooltip").boundingBox();
    expect(t.x).toBeGreaterThanOrEqual(0);
    expect(t.x + t.width).toBeLessThanOrEqual(width);
  }
});
test("OCR unavailable: no fabricated time, manual calibration succeeds", async ({
  browser,
}) => {
  const context = await browser.newContext({ serviceWorkers: "block" });
  await context.route("**/vendor/worker.min.js", (r) => r.abort());
  const page = await context.newPage();
  await page.goto("http://localhost:4173");
  await importSample(page, "public/demo.png");
  await expect(page.locator("#selected-time")).toHaveText(
    "시간 기준 입력 필요",
  );
  await expect(page.locator("#calibration-panel")).toHaveAttribute("open", "");
  await page.locator("#end-time").fill("20:52");
  await page.locator("#calibration-form button").click();
  await expect(page.locator("#selected-time")).toHaveText("20:52");
  await context.close();
});
test("touch input: tap and finger drag move the crosshair without scrolling", async ({
  browser,
  browserName,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await page.goto("http://localhost:4173");
  await importSample(page, "public/demo.png");
  await page.locator("#chart").scrollIntoViewIfNeeded();
  const b = await page.locator("#chart").boundingBox();
  await page.touchscreen.tap(b.x + b.width * 0.4, b.y + 200);
  const first = await page.locator("#selected-time").textContent();
  expect(first).not.toBe("20:52");
  if (browserName === "chromium") {
    const cdp = await context.newCDPSession(page),
      scroll = await page.evaluate(() => scrollY);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: b.x + b.width * 0.4, y: b.y + 200 }],
    });
    for (let i = 4; i <= 9; i++)
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: b.x + (b.width * i) / 10, y: b.y + 190 }],
      });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    expect(await page.locator("#selected-time").textContent()).not.toBe(first);
    expect(await page.evaluate(() => scrollY)).toBe(scroll);
  }
  await context.close();
});
