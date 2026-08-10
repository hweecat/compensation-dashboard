import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "playwright/test";

for (const width of [375, 768, 1024, 1440]) {
  test(`has no serious or critical accessibility findings at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical")).toEqual([]);
  });
}
