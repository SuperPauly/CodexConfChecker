import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Check your config" })).toBeVisible();
  const decline = page.getByRole("button", { name: "No thanks" });
  if (await decline.isVisible()) await decline.click();
});

test("keeps the schema loader progressive and the editor stable while typing", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Check your config" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Load schema" })).toBeVisible();
  await expect(page.getByLabel("Schema version")).toHaveCount(0);

  const editor = page.getByRole("textbox", { name: /configuration editor/i });
  const editorDomId = await editor.evaluate((node) => {
    node.setAttribute("data-editor-instance", "stable");
    return node.getAttribute("data-editor-instance");
  });
  await editor.click();
  await page.keyboard.type("x");
  await page.keyboard.press("Backspace");
  await expect(editor).toHaveAttribute("data-editor-instance", editorDomId!);

  await page.getByLabel("Schema source").selectOption("codex");
  await expect(page.getByLabel("Schema version")).toBeVisible();
});

test("gives the mobile editor most of the screen and supports full-screen editing", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "mobile layout assertion");

  const editorFrame = page.locator(".editor-frame");
  const box = await editorFrame.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(500);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

  await page.screenshot({ path: "artifacts/screenshots/configurex-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Expand editor" }).click();
  const expanded = await editorFrame.boundingBox();
  expect(expanded).not.toBeNull();
  expect(expanded!.height).toBeGreaterThan(650);
  await page.screenshot({ path: "artifacts/screenshots/configurex-mobile-expanded.png" });
  await page.getByRole("button", { name: "Done" }).click();
});

test("captures the desktop workbench at its supported viewport", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "desktop screenshot");
  await page.screenshot({ path: "artifacts/screenshots/configurex-desktop.png", fullPage: true });
});
