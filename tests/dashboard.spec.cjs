const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { serveStatic } = require("./helpers/static-server.cjs");
const { chromium, browserLaunchOptions } = require("./helpers/playwright.cjs");

const appRoot = path.resolve(__dirname, "../outputs/compensation-dashboard");
const indexHtmlPath = path.join(appRoot, "index.html");

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

async function resetPage(page, url) {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector("#summaryCards .summary-card");
}

async function loadWithState(page, url, overrides) {
  await page.goto(url);
  await page.evaluate((stateOverrides) => {
    localStorage.setItem("compProjectionState", JSON.stringify(stateOverrides));
  }, overrides);
  await page.reload();
  await page.waitForSelector("#summaryCards .summary-card");
}

async function clickUnique(page, selector) {
  const locator = page.locator(selector);
  assert.equal(await locator.count(), 1, `Expected one match for ${selector}`);
  await locator.click();
}

async function downloadText(page, buttonSelector) {
  const downloadPromise = page.waitForEvent("download");
  await clickUnique(page, buttonSelector);
  const download = await downloadPromise;
  return fs.readFileSync(await download.path(), "utf8");
}

test("overview charts render core compensation components", async ({ page, url }) => {
  await resetPage(page, url);

  assert.equal(await page.locator("#cashflowChart svg").count(), 1);
  assert.equal(await page.locator("#equityChart svg").count(), 1);
  assert.equal(await page.locator("#mixChart .mix-segment").count(), 4);

  const subtitle = await page.locator("#cashflowChartSubtitle").innerText();
  assert.match(subtitle, /salary/);
  assert.match(subtitle, /bonus/);
  assert.match(subtitle, /sign-on/);
  assert.match(subtitle, /equity/);
  assert.match(await page.locator("#mixChart").innerText(), /Salary[\s\S]+Bonus[\s\S]+Sign-on[\s\S]+Equity/);
});

test("module app boots without legacy app.js fallback", async ({ page, url }) => {
  const indexHtml = fs.readFileSync(indexHtmlPath, "utf8");
  assert.doesNotMatch(indexHtml, /app\.js/, "index.html should not depend on the legacy app.js runtime");

  await resetPage(page, url);
  assert.equal(
    await page.locator("#scenarioName").inputValue(),
    "Total Compensation Calculator - Growth Projection Cases",
  );
  assert.equal(await page.locator("script[src='./src/standalone.js']").count(), 1);
  assert.equal(await page.locator("#summaryCards .summary-card").count(), 4);
});

test("cashflow chart colors and zoom pane layout are explicit across browsers", async ({ page, url }) => {
  await resetPage(page, url);

  const fills = await page.locator("#cashflowChart rect.bar").evaluateAll((bars) =>
    bars.slice(0, 8).map((bar) => getComputedStyle(bar).fill),
  );
  assert.ok(fills.length > 0, "Expected cashflow chart bars to render");
  assert.ok(
    fills.some((fill) => !["rgb(0, 0, 0)", "rgba(0, 0, 0, 0)", "none"].includes(fill)),
    `Expected cashflow bars to have component colors, got ${fills.join(", ")}`,
  );

  const overviewStyle = await page.locator("#cashflowWindowOverview").evaluate((overview) => {
    const style = getComputedStyle(overview);
    return {
      gridAutoFlow: style.gridAutoFlow,
      gridAutoColumns: style.gridAutoColumns,
      childCount: overview.children.length,
    };
  });
  assert.equal(overviewStyle.gridAutoFlow, "column");
  assert.ok(overviewStyle.childCount > 12, "Expected the zoom pane to contain monthly overview bars");
  assert.notEqual(overviewStyle.gridAutoColumns, "auto");
});

test("cashflow filters, zoom controls, and cumulative table update the UI", async ({ page, url }) => {
  await resetPage(page, url);

  const initialLabel = await page.locator("#cashflowWindowLabel").innerText();
  await clickUnique(page, "[data-cashflow-zoom='in']");
  const zoomedLabel = await page.locator("#cashflowWindowLabel").innerText();
  assert.notEqual(zoomedLabel, initialLabel);

  await clickUnique(page, "[data-cashflow-zoom-reset]");
  assert.match(await page.locator("#cashflowWindowLabel").innerText(), /Selected: All/);

  await clickUnique(page, "[data-cashflow-component='equityValue']");
  assert.equal(await page.locator("[data-cashflow-component='equityValue']").getAttribute("aria-pressed"), "false");

  await clickUnique(page, "button.tab-button[data-tab='cashflow']");
  const firstTotal = await page.locator("#cashflowRows tr td:last-child").first().innerText();
  await clickUnique(page, "[data-detail-cumulative]");
  const cumulativeTotal = await page.locator("#cashflowRows tr").nth(1).locator("td:last-child").innerText();
  assert.notEqual(cumulativeTotal, firstTotal);
});

test("annual cashflow, vesting events, and scenarios render expected table rows", async ({ page, url }) => {
  await resetPage(page, url);

  await clickUnique(page, "button.tab-button[data-tab='cashflow']");
  await clickUnique(page, "[data-detail-cashflow-view='annual']");
  assert.match(await page.locator("#cashflowRows").innerText(), /Year 1/);
  assert.match(await page.locator("#cashflowSubtotal").innerText(), /Subtotal/);

  await clickUnique(page, "button.tab-button[data-tab='equity']");
  assert.match(await page.locator("#vestingRows").innerText(), /shares|S\$/i);

  await clickUnique(page, "button.tab-button[data-tab='scenarios']");
  assert.match(await page.locator("#scenarioGrid").innerText(), /-15% annual equity growth/);
  assert.match(await page.locator("#scenarioYearRows").innerText(), /S\$/);
});

test("bonus payout follows the selected calendar month after a mid-month start date", async ({ page, url }) => {
  await loadWithState(page, url, {
    startDate: "2026-06-19",
    years: 1,
    bonusMonth: 3,
    bonusPercent: 20,
  });

  await clickUnique(page, "button.tab-button[data-tab='cashflow']");
  const rows = await page.locator("#cashflowRows tr").evaluateAll((tableRows) =>
    tableRows.map((row) => {
      const cells = [...row.querySelectorAll("td")].map((cell) => cell.textContent.trim());
      return { month: cells[0], bonus: cells[2] };
    }),
  );
  const bonusRows = rows.filter((row) => row.bonus !== "S$0");
  assert.deepEqual(
    bonusRows.map((row) => row.month),
    ["March 2027"],
  );
});

test("equity cashflow is paid in the displayed vesting month and counted in the vesting year mix", async ({ page, url }) => {
  await loadWithState(page, url, {
    startDate: "2026-07-27",
    years: 4,
    baseSalary: 0,
    bonusPercent: 0,
    signOnYear1: 0,
    signOnYear2: 0,
    annualEquityGrowth: 0,
    startingSharePrice: 100,
    usdToSgd: 1,
    vestingCadence: "custom",
    customVestingMode: "events",
    customVestingPattern: "12:22,24:66,30:98,36:97,42:76,48:75",
  });

  await clickUnique(page, "button.tab-button[data-tab='cashflow']");
  const cashflowRows = await page.locator("#cashflowRows tr").evaluateAll((tableRows) =>
    tableRows.map((row) => {
      const cells = [...row.querySelectorAll("td")].map((cell) => cell.textContent.trim());
      return { month: cells[0], equity: cells[4], total: cells[5] };
    }),
  );
  const june2027 = cashflowRows.find((row) => row.month === "June 2027");
  const july2027 = cashflowRows.find((row) => row.month === "July 2027");
  assert.equal(june2027?.equity, "S$0");
  assert.equal(july2027?.equity, "S$2,200");
  assert.equal(july2027?.total, "S$2,200");

  await clickUnique(page, "button.tab-button[data-tab='overview']");
  await page.locator("#mixPeriodSelect").selectOption("year-1");
  assert.match(await page.locator("#mixHoverDetail").innerText(), /S\$2,200/);
  assert.match((await page.locator("#mixChart .mix-segment.equity").getAttribute("aria-label")) || "", /Equity: S\$2,200/);
});

test("month zero vesting events use the start date and appear in cashflow and vesting events", async ({ page, url }) => {
  await loadWithState(page, url, {
    startDate: "2026-07-27",
    years: 1,
    baseSalary: 0,
    bonusPercent: 0,
    signOnYear1: 0,
    signOnYear2: 0,
    annualEquityGrowth: 0,
    startingSharePrice: 100,
    usdToSgd: 1,
    vestingCadence: "custom",
    customVestingMode: "events",
    customVestingPattern: "0:10,12:22",
  });

  await clickUnique(page, "button.tab-button[data-tab='cashflow']");
  const cashflowRows = await page.locator("#cashflowRows tr").evaluateAll((tableRows) =>
    tableRows.slice(0, 2).map((row) => {
      const cells = [...row.querySelectorAll("td")].map((cell) => cell.textContent.trim());
      return { month: cells[0], equity: cells[4], total: cells[5] };
    }),
  );
  assert.deepEqual(cashflowRows, [
    { month: "July 2026", equity: "S$1,000", total: "S$1,000" },
    { month: "August 2026", equity: "S$0", total: "S$0" },
  ]);

  await clickUnique(page, "button.tab-button[data-tab='equity']");
  const vestingRows = await page.locator("#vestingRows tr").evaluateAll((tableRows) =>
    tableRows.slice(0, 2).map((row) => {
      const cells = [...row.querySelectorAll("td")].map((cell) => cell.textContent.trim());
      return { date: cells[0], shares: cells[1], value: cells[3] };
    }),
  );
  assert.deepEqual(vestingRows, [
    { date: "Jul 27, 2026", shares: "10", value: "S$1,000" },
    { date: "Jul 27, 2027", shares: "22", value: "S$2,200" },
  ]);
});

test("equity visualization supports point details and reset zoom", async ({ page, url }) => {
  await resetPage(page, url);

  const lineStyle = await page.locator("#equityChart .equity-line").evaluate((line) => {
    const style = getComputedStyle(line);
    return { fill: style.fill, stroke: style.stroke, strokeWidth: style.strokeWidth };
  });
  assert.ok(["none", "rgba(0, 0, 0, 0)"].includes(lineStyle.fill), `Expected equity line fill to be none, got ${lineStyle.fill}`);
  assert.notEqual(lineStyle.stroke, "none");

  const clicked = await page.locator("#equityChart").evaluate((chart) => {
    const point = chart.querySelector("[data-equity-index]");
    if (!point) return false;
    point.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    return true;
  });
  assert.equal(clicked, true);
  assert.match(await page.locator("#equityPointDetail").innerText(), /Vested|Cumulative equity/);

  await page.locator("[data-equity-zoom='in']").dispatchEvent("click");
  assert.match(await page.locator("#equityWindowLabel").innerText(), /Selected:/);
  await page.locator("[data-equity-zoom-reset]").dispatchEvent("click");
  assert.match(await page.locator("#equityWindowLabel").innerText(), /Selected: All months/);
});

test("compensation mix exposes detailed labels", async ({ page, url }) => {
  await resetPage(page, url);

  const salarySegment = page.locator("#mixChart .mix-segment.salary");
  assert.match((await salarySegment.getAttribute("aria-label")) || "", /Salary.+\d+\.\d%/);
  await salarySegment.click();
  assert.match(await page.locator("#mixHoverDetail").innerText(), /Salary.+\d+\.\d%/);
});

test("CSV and HTML exports include expected projection outputs", async ({ page, url }) => {
  await resetPage(page, url);

  const csv = await downloadText(page, "#exportButton");
  assert.match(csv, /Month,Salary \(SGD\),Bonus \(SGD\),Sign-on \(SGD\),Shares Vested,Projected Share Price \(USD\),Equity Value \(SGD\),Total \(SGD\)/);
  assert.match(csv, /August|September|January|February|March|April|May|June|July|October|November|December/);

  const html = await downloadText(page, "#exportReportButton");
  assert.match(html, /Total projected comp \(4 year horizon\)/);
  assert.match(html, /Cash compensation \(4 year horizon\)/);
  assert.match(html, /<h2>Annual Cashflow<\/h2>/);
  assert.match(html, /<h2>Monthly Cashflow<\/h2>/);
  assert.match(html, /<h2>Vesting Schedule<\/h2>/);
  assert.match(html, /<h2>Scenario Sensitivity<\/h2>/);
  assert.match(html, /-15% annual equity growth/);
});

(async () => {
  const staticServer = await serveStatic(appRoot);
  const browser = await chromium.launch(browserLaunchOptions());
  const failures = [];

  try {
    for (const item of tests) {
      const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
      const errors = [];
      page.on("console", (message) => {
        if (["error", "warning"].includes(message.type())) errors.push(`${message.type()}: ${message.text()}`);
      });
      try {
        await item.fn({ page, url: staticServer.url });
        assert.deepEqual(errors, [], "Expected no browser console errors or warnings");
        console.log(`PASS ${item.name}`);
      } catch (error) {
        failures.push({ name: item.name, error });
        console.error(`FAIL ${item.name}`);
        console.error(error);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
    await staticServer.close();
  }

  if (failures.length) process.exit(1);
})();
