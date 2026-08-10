import { expect, test, type Locator, type Page } from "playwright/test";

const activate = async (locator: Locator, page: Page) => {
  await locator.focus();
  await page.keyboard.press("Enter");
};

const replace = async (locator: Locator, page: Page, value: string) => {
  await locator.focus();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type(value);
  await page.keyboard.press("Tab");
};

test("renames, deletes, restores, duplicates and removes scenario revisions", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase("worthflow-correctness");
      request.onsuccess = request.onerror = request.onblocked = () => resolve();
    });
  });
  await page.reload();

  await replace(page.getByLabel("Scenario name"), page, "Revision one");
  await activate(page.getByRole("button", { name: "Save", exact: true }), page);
  await expect(page.getByText("Saved locally")).toBeVisible();

  await replace(page.getByLabel("Scenario name"), page, "Revision two");
  await activate(page.getByRole("button", { name: "Save", exact: true }), page);
  await expect(page.getByText("Saved locally")).toBeVisible();

  await activate(page.getByRole("button", { name: "Manage scenarios" }), page);
  const history = page.getByRole("table", { name: "Revision history" });
  await expect(history.locator("tbody tr")).toHaveCount(2);

  await replace(page.getByLabel("Rename scenario"), page, "Renamed current");
  await activate(page.getByRole("button", { name: "Apply name" }), page);
  await expect(page.getByRole("table", { name: "Scenario comparison" }).getByRole("row", { name: /Renamed current/ })).toBeVisible();

  await activate(history.getByRole("button", { name: "Delete revision" }).last(), page);
  await activate(page.getByRole("button", { name: "Confirm delete" }), page);
  await expect(history.locator("tbody tr")).toHaveCount(1);
  await activate(history.getByRole("button", { name: "Restore revision" }), page);
  await expect(page.getByLabel("Scenario name")).toHaveValue("Revision two");

  await activate(page.getByRole("button", { name: "Manage scenarios" }), page);
  await activate(page.getByRole("button", { name: "Duplicate scenario" }), page);
  const comparison = page.getByRole("table", { name: "Scenario comparison" });
  await expect(comparison.locator("tbody tr")).toHaveCount(2);
  await activate(comparison.getByRole("button", { name: "Delete Revision two copy" }), page);
  await activate(page.getByRole("button", { name: "Confirm delete" }), page);
  await expect(comparison.locator("tbody tr")).toHaveCount(1);
  await expect(page.getByLabel("Scenario name")).toHaveValue("Renamed current");
});
