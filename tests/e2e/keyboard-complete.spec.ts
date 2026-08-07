import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "playwright/test";

const activate = async (locator: Locator, page: Page) => { await locator.focus(); await page.keyboard.press("Enter"); };
const replace = async (locator: Locator, page: Page, value: string) => { await locator.focus(); await page.keyboard.press("ControlOrMeta+A"); await page.keyboard.type(value); await page.keyboard.press("Tab"); };

test("completes edit, save, scenario, import, export and risk workflows without pointer input", async ({ page }) => {
  page.on("pageerror", (error) => console.info(`WORTHFLOW_PAGE_ERROR=${error.message}`));
  await page.goto("/");
  await page.evaluate(async () => { localStorage.clear(); await new Promise<void>((resolve) => { const request = indexedDB.deleteDatabase("worthflow-correctness"); request.onsuccess = request.onerror = request.onblocked = () => resolve(); }); });
  await page.reload();

  await replace(page.getByLabel("Scenario name"), page, "Keyboard offer");
  await activate(page.getByRole("tab", { name: "Cash" }), page);
  await replace(page.getByLabel(/Amount \(SGD\)/).first(), page, "190000");
  await activate(page.getByRole("button", { name: "Add bonus" }), page);
  await expect(page.getByLabel("Achievement (%)").last()).toBeVisible();
  await replace(page.getByLabel("Performance year").last(), page, "2031");
  await expect(page.getByLabel("Achievement (%)").last()).toBeVisible();
  await replace(page.getByLabel("Achievement (%)").last(), page, "125");
  await activate(page.getByRole("button", { name: "Add sign-on" }), page);
  const schedule = page.getByLabel("Payout schedule").last();
  await schedule.focus();
  await page.keyboard.press("End");
  await page.keyboard.press("Tab");
  await activate(page.getByRole("button", { name: "Add custom payment" }).last(), page);

  await activate(page.getByRole("tab", { name: "Equity" }), page);
  await activate(page.getByRole("button", { name: "Add asset" }), page);
  await activate(page.getByRole("button", { name: "Add grant" }), page);
  await activate(page.getByRole("button", { name: "Enter value" }).last(), page);
  await replace(page.getByLabel("Grant value").last(), page, "123456");
  const duration = page.getByLabel("Duration").last();
  await duration.focus(); await page.keyboard.press("End"); await page.keyboard.press("Tab");
  await expect(page.getByLabel("Custom vesting end date").last()).toBeVisible();

  await activate(page.getByRole("tab", { name: "Tax & FX" }), page);
  await replace(page.getByLabel("Start rate").first(), page, "1.4");
  await activate(page.getByRole("button", { name: "Save" }), page);
  await expect(page.getByText("Saved locally")).toBeVisible();

  await activate(page.getByRole("button", { name: "Manage scenarios" }), page);
  await activate(page.getByRole("button", { name: "Duplicate scenario" }), page);
  await expect(page.getByRole("table", { name: "Scenario comparison" }).getByRole("row", { name: /Keyboard offer copy/ })).toBeVisible();
  await activate(page.getByRole("button", { name: "Close scenario manager" }), page);

  const jsonDownload = page.waitForEvent("download");
  await activate(page.getByRole("button", { name: "Scenario JSON" }), page);
  const jsonPath = await (await jsonDownload).path();
  expect(jsonPath).toBeTruthy();
  for (const name of ["Monthly ledger CSV", "Annual totals CSV", "Vest events CSV", "HTML report"]) {
    const download = page.waitForEvent("download");
    await activate(page.getByRole("button", { name }), page);
    expect(await (await download).path()).toBeTruthy();
  }

  const chooser = page.waitForEvent("filechooser");
  await activate(page.getByRole("button", { name: "Import" }), page);
  await (await chooser).setFiles(jsonPath!);
  await expect(page.getByLabel("Scenario name")).toHaveValue("Keyboard offer copy");

  await activate(page.getByRole("tab", { name: "Risk" }), page);
  const migrateCorrelation = page.getByRole("button", { name: "Apply correlation factor migration" });
  if (await migrateCorrelation.count()) await activate(migrateCorrelation, page);
  await activate(page.getByRole("button", { name: "Run 10,000 simulations" }), page);
  await expect(page.getByRole("status", { name: "Risk simulation status" })).toContainText(/Simulation running: [1-9]/);
  await expect(page.getByRole("button", { name: "Cancel simulation" })).toBeVisible();
  await activate(page.getByRole("button", { name: "Cancel simulation" }), page);
  await expect(page.getByRole("status", { name: "Risk simulation status" })).toContainText("cancelled");

  await activate(page.getByRole("button", { name: "Run 10,000 simulations" }), page);
  await expect(page.getByRole("button", { name: "Download risk CSV" })).toBeVisible({ timeout: 10_000 });
  const riskDownload = page.waitForEvent("download");
  await activate(page.getByRole("button", { name: "Download risk CSV" }), page);
  expect(await (await riskDownload).path()).toBeTruthy();

  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.filter((item) => item.impact === "serious" || item.impact === "critical")).toEqual([]);
});

test("reflows at the 200 percent equivalent viewport without page overflow", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 900 });
  await page.goto("/");
  const dimensions = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth }));
  expect(dimensions.page).toBeLessThanOrEqual(dimensions.viewport);
  await expect(page.getByLabel("Compact projection summary")).toBeVisible();
});
