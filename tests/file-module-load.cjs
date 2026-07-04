const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium, browserLaunchOptions } = require("./helpers/playwright.cjs");

const indexPath = path.resolve(__dirname, "../outputs/compensation-dashboard/index.html");

(async () => {
  const browser = await chromium.launch(browserLaunchOptions());
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    const errors = [];
    page.on("console", (message) => {
      if (["error", "warning"].includes(message.type())) errors.push(`${message.type()}: ${message.text()}`);
    });
    await page.goto(pathToFileURL(indexPath).href);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForSelector("#summaryCards .summary-card", { timeout: 10000 });

    assert.equal(await page.locator("script[src='./src/standalone.js']").count(), 1);
    assert.equal(await page.locator("#summaryCards .summary-card").count(), 4);
    assert.equal(
      await page.locator("#scenarioName").inputValue(),
      "Sample Compensation Projection",
    );
    assert.equal(await page.locator("#cashflowChart svg").count(), 1);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
