import { expect, test } from "playwright/test";

// Playwright resolves this relative path from the candidate worktree; avoiding
// a Node-path import keeps the browser-test source in this project's TS setup.
const screenshot = (name: string) => `docs/parallel-build/screenshots/correctness-${name}.png`;

test("captures the desktop overview outcome surface", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.getByLabel("Compensation outcomes")).toBeVisible();
  await page.screenshot({ path: screenshot("overview-1440"), fullPage: false });
});

test("captures the mobile equity assumptions surface", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Assumptions" }).click();
  await page.getByRole("tab", { name: "Equity" }).click();
  await expect(page.getByRole("heading", { name: "RSU grants" })).toBeVisible();
  await page.screenshot({ path: screenshot("equity-mobile-375"), fullPage: false });
});

test("captures completed risk distribution with accessible visuals", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByRole("tab", { name: "Risk" }).click();
  await page.getByRole("button", { name: "Run 10,000 simulations" }).click();
  await expect(page.getByRole("button", { name: "Download risk CSV" })).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: screenshot("risk-complete-1440"), fullPage: false });
});
