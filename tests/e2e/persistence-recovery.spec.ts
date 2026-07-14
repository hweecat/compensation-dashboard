import { expect, test } from "playwright/test";

test("reloads a named scenario and offers a separate recovery draft", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase("worthflow-correctness");
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    });
  });
  await page.reload();
  const name = page.getByLabel("Scenario name");
  await name.fill("Named checkpoint");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved locally")).toBeVisible();
  await page.reload();
  await expect(name).toHaveValue("Named checkpoint");

  await name.fill("Recovered checkpoint");
  await expect(page.getByText("Recovery saved")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Restore recovery" })).toBeVisible();
  await page.getByRole("button", { name: "Restore recovery" }).click();
  await expect(name).toHaveValue("Recovered checkpoint");
});
