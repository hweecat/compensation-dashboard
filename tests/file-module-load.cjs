const assert = require("node:assert/strict");
const path = require("node:path");
const { serveStatic } = require("./helpers/static-server.cjs");
const { chromium, browserLaunchOptions } = require("./helpers/playwright.cjs");

const appRoot = path.resolve(__dirname, "../dist");

async function assertPublicDefaults(page) {
  const expectedDefaults = {
    "Base Salary": "120000",
    "Bonus %": "10",
    "Year 1 Amount": "10000",
    "Year 2 Amount": "0",
    "RSU Grant Value": "100000",
    "Starting Price": "100",
    "Equity Growth %": "5",
    "Custom Schedule": "25:25:25:25",
  };

  assert.equal(await page.locator("#scenarioName").inputValue(), "Compensation Projection");
  for (const [label, value] of Object.entries(expectedDefaults)) {
    const actual = await page.evaluate((fieldLabel) => {
      const field = [...document.querySelectorAll("#assumptionControls .field")].find((node) =>
        node.textContent.includes(fieldLabel),
      );
      return field?.querySelector("input, select")?.value ?? null;
    }, label);
    assert.equal(actual, value, `Expected public default for ${label}`);
  }
}

(async () => {
  // Serve dist/ over HTTP so the Vite module bundle (which is loaded with
  // `type="module" crossorigin`) can fetch its hashed assets under a real
  // origin. file:// URLs block those fetches under modern Chromium.
  const staticServer = await serveStatic(appRoot);
  const browser = await chromium.launch(browserLaunchOptions());
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    const errors = [];
    page.on("console", (message) => {
      if (["error", "warning"].includes(message.type())) errors.push(`${message.type()}: ${message.text()}`);
    });
    await page.goto(staticServer.url);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForSelector("#summaryCards .summary-card", { timeout: 10000 });

    // Vite emits a hashed module script tag referencing ./assets/index-*.js
    assert.equal(await page.locator("script[src*='assets/index-'][src$='.js']").count(), 1);
    assert.equal(await page.locator("#summaryCards .summary-card").count(), 4);
    await assertPublicDefaults(page);
    assert.equal(await page.locator("#cashflowChart svg").count(), 1);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await staticServer.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
