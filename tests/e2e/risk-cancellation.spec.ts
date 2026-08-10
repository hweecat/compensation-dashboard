import { expect, test } from "playwright/test";

test("acknowledges five worker cancellations under 100ms without late completion", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Risk" }).click();
  const latencies: number[] = [];
  for (let trial = 0; trial < 5; trial += 1) {
    await page.getByRole("button", { name: "Run 10,000 simulations" }).click();
    await expect(page.getByRole("status", { name: "Risk simulation status" })).toContainText(/Simulation running: [1-9]/);
    await page.getByRole("button", { name: "Cancel simulation" }).click();
    const status = page.getByRole("status", { name: "Risk simulation status" });
    await expect(status).toContainText("Simulation cancelled");
    await expect(status).toHaveAttribute("data-cancel-latency-ms", /\d/);
    const elapsed = Number(await status.getAttribute("data-cancel-latency-ms"));
    latencies.push(elapsed);
    expect(elapsed).toBeLessThan(100);
    await page.waitForTimeout(125);
    await expect(page.getByText(/Seeded event-step risk distribution/)).toHaveCount(0);
  }
  console.info(`WORTHFLOW_CANCEL_LATENCIES_MS=${latencies.map((value) => value.toFixed(2)).join(",")}`);
});
