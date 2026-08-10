import { expect, test } from "playwright/test";

for (const width of [375, 390, 768, 1024, 1440]) {
  test(`has no page overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const dimensions = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);
    if (width <= 390) {
      await expect(page.getByLabel("Compact projection summary")).toBeVisible();
      await page.getByRole("button", { name: "Assumptions" }).click();
      await expect(page.getByLabel("Compact projection summary")).toBeVisible();
      await page.getByRole("button", { name: "Results" }).click();
      await expect(page.getByLabel("Projection results")).toBeVisible();
    }
  });
}

test("moves through primary tabs with arrow keys", async ({ page }) => {
  await page.goto("/");
  const overview = page.getByRole("tab", { name: "Overview" });
  await overview.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Cash" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Salary, bonus and sign-on cashflow" })).toBeVisible();
});
