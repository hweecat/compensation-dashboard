const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { chromium } = require("C:/Users/ongch/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/.pnpm/playwright-core@1.60.0/node_modules/playwright-core");
const { serveStatic } = require("./helpers/static-server.cjs");

const appRoot = path.resolve(__dirname, "../dist");
const chromePath = "C:/Program Files/Google/Chrome/Application/chrome.exe";

// TODO(migration): the legacy-baseline trick (swap standalone.js for app.js
// in index.html) does not work for the Vite output, which uses hashed asset
// names like /assets/index-XXXXX.js. Rewrite this test after commit 5 lands
// the real React app, e.g. by comparing two Vite builds (with vs. without
// minification) or by sourcing the legacy bundle from git history.

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function measure(page, url, runs = 7) {
  const timings = [];
  for (let index = 0; index < runs; index += 1) {
    const start = performance.now();
    await page.goto(url);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForSelector("#summaryCards .summary-card");
    await page.waitForSelector("#cashflowChart svg");
    timings.push(performance.now() - start);
  }
  return timings;
}

(async () => {
  const indexHtml = fs.readFileSync(path.join(appRoot, "index.html"), "utf8");
  const legacyHtml = indexHtml.replace(
    '<script src="./src/standalone.js"></script>',
    '<script src="./app.js"></script>',
  );
  const staticServer = await serveStatic(appRoot, {
    virtualFiles: {
      "/legacy-baseline.html": legacyHtml,
    },
  });
  const browser = await chromium.launch({ headless: true, executablePath: chromePath });

  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    const modularTimings = await measure(page, staticServer.url);
    const legacyTimings = await measure(page, `${staticServer.url}legacy-baseline.html`);
    const modularMedian = median(modularTimings);
    const legacyMedian = median(legacyTimings);
    const allowed = legacyMedian * 3 + 150;

    console.log(`MODULAR median ${modularMedian.toFixed(1)}ms (${modularTimings.map((value) => value.toFixed(1)).join(", ")})`);
    console.log(`LEGACY median ${legacyMedian.toFixed(1)}ms (${legacyTimings.map((value) => value.toFixed(1)).join(", ")})`);
    assert.ok(
      modularMedian <= allowed,
      `Expected modular median ${modularMedian.toFixed(1)}ms to stay within practical range of legacy median ${legacyMedian.toFixed(1)}ms`,
    );
  } finally {
    await browser.close();
    await staticServer.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
