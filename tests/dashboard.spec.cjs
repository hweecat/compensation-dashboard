const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { serveStatic } = require("./helpers/static-server.cjs");
const { chromium, browserLaunchOptions } = require("./helpers/playwright.cjs");

const appRoot = path.resolve(__dirname, "../dist");
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
  assert.doesNotMatch(indexHtml, /src\/standalone\.js/, "index.html should not depend on the legacy standalone.js runtime");
  // Vite emits a hashed module script tag referencing /assets/index-*.js
  assert.match(indexHtml, /\/assets\/index-[^"']+\.js/, "index.html should reference the Vite hashed module bundle");

  await resetPage(page, url);
  await assertPublicDefaults(page);
  assert.equal(await page.locator("#summaryCards .summary-card").count(), 4);
});

test("mobile and tablet layouts use bottom navigation without page-level overflow", async ({ page, url }) => {
  const viewports = [
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await resetPage(page, url);

    const layout = await page.evaluate(() => {
      const nav = document.querySelector(".nav-rail");
      const workspace = document.querySelector(".workspace");
      const firstTableWrap = document.querySelector(".table-wrap");
      const firstTable = firstTableWrap.querySelector("table");
      const navStyle = getComputedStyle(nav);
      const workspaceStyle = getComputedStyle(workspace);
      return {
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        navPosition: navStyle.position,
        navBottom: navStyle.bottom,
        navHeight: nav.getBoundingClientRect().height,
        navTop: nav.getBoundingClientRect().top,
        activeRailCurrent: nav.querySelector(".rail-item.is-active")?.getAttribute("aria-current"),
        inactiveRailCurrent: nav.querySelector(".rail-item:not(.is-active)")?.getAttribute("aria-current"),
        workspacePaddingBottom: parseFloat(workspaceStyle.paddingBottom),
        summaryColumns: getComputedStyle(document.querySelector("#summaryCards")).gridTemplateColumns.split(" ").length,
        cashflowTableScrollable: firstTableWrap.scrollWidth > firstTableWrap.clientWidth,
        tableDisplay: getComputedStyle(firstTable).display,
      };
    });

    assert.equal(layout.navPosition, "fixed", `Expected fixed nav at ${viewport.width}px`);
    assert.equal(layout.navBottom, "0px", `Expected bottom-pinned nav at ${viewport.width}px`);
    assert.equal(layout.activeRailCurrent, "page", `Expected active rail item to expose aria-current at ${viewport.width}px`);
    assert.equal(layout.inactiveRailCurrent, null, `Expected inactive rail items to omit aria-current at ${viewport.width}px`);
    assert.ok(
      layout.navTop >= viewport.height - layout.navHeight - 1,
      `Expected bottom nav near the bottom at ${viewport.width}px, got top ${layout.navTop}`,
    );
    assert.ok(
      layout.workspacePaddingBottom > layout.navHeight,
      `Expected workspace bottom padding ${layout.workspacePaddingBottom} to exceed nav height ${layout.navHeight} at ${viewport.width}px`,
    );
    if (viewport.width <= 430) {
      assert.equal(layout.summaryColumns, 2);
      assert.equal(layout.tableDisplay, "block");
      assert.equal(layout.cashflowTableScrollable, false);
    }
    assert.ok(
      layout.documentWidth <= layout.viewportWidth + 1,
      `Expected no document overflow at ${viewport.width}px, got ${layout.documentWidth}`,
    );
    assert.ok(layout.bodyWidth <= layout.viewportWidth + 1, `Expected no body overflow at ${viewport.width}px, got ${layout.bodyWidth}`);
  }
});

test("mobile active tab content fits and phone tables render as labeled cards", async ({ page, url }) => {
  const viewports = [
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 768, height: 1024 },
  ];
  const tabs = ["overview", "cashflow", "equity", "scenarios"];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await resetPage(page, url);

    for (const tabName of tabs) {
      await clickUnique(page, `.rail-item[data-tab='${tabName}']`);
      const layout = await page.evaluate((activeTabName) => {
        const main = document.querySelector(".main-panel");
        const activePanel = document.querySelector(".tab-panel.is-active");
        const mainRect = main.getBoundingClientRect();
        const activeRect = activePanel.getBoundingClientRect();
        const activeChildren = [...activePanel.children].filter((child) => {
          const rect = child.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });
        const overflowingChildren = activeChildren
          .filter((child) => {
            const rect = child.getBoundingClientRect();
            return rect.left < mainRect.left - 1 || rect.right > mainRect.right + 1;
          })
          .map((child) => ({
            tag: child.tagName.toLowerCase(),
            className: child.className,
            left: Math.round(child.getBoundingClientRect().left),
            right: Math.round(child.getBoundingClientRect().right),
            mainLeft: Math.round(mainRect.left),
            mainRight: Math.round(mainRect.right),
          }));
        const scenarioRows = [...document.querySelectorAll("#scenarios .scenario-row")].map((row) => {
          const rect = row.getBoundingClientRect();
          return {
            text: row.textContent.trim().replace(/\s+/g, " "),
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
            hasValue: Boolean(row.querySelector("strong")?.textContent.trim()),
            outsideMain: rect.left < mainRect.left - 1 || rect.right > mainRect.right + 1,
          };
        });
        const firstVisibleTable = activePanel.querySelector(".table-wrap table");
        const tableDisplay = firstVisibleTable ? getComputedStyle(firstVisibleTable).display : null;
        const labeledCells = [...activePanel.querySelectorAll("tbody tr:first-child td, tfoot tr:first-child td")].map((cell) =>
          cell.getAttribute("data-label"),
        );
        return {
          activeTabName,
          mainClientWidth: main.clientWidth,
          mainScrollWidth: main.scrollWidth,
          activeClientWidth: activePanel.clientWidth,
          activeScrollWidth: activePanel.scrollWidth,
          activeLeft: Math.round(activeRect.left),
          activeRight: Math.round(activeRect.right),
          mainLeft: Math.round(mainRect.left),
          mainRight: Math.round(mainRect.right),
          overflowingChildren,
          scenarioRows,
          tableDisplay,
          labeledCells,
        };
      }, tabName);

      assert.ok(
        layout.mainScrollWidth <= layout.mainClientWidth + 1,
        `${tabName} main panel should not hide horizontal overflow at ${viewport.width}px: ${JSON.stringify(layout)}`,
      );
      assert.ok(
        layout.activeScrollWidth <= layout.activeClientWidth + 1,
        `${tabName} active tab should fit its grid track at ${viewport.width}px: ${JSON.stringify(layout)}`,
      );
      assert.deepEqual(
        layout.overflowingChildren,
        [],
        `${tabName} active tab children should stay within main panel at ${viewport.width}px`,
      );

      if (tabName === "scenarios") {
        assert.ok(layout.scenarioRows.length > 0, "Expected scenario summary rows");
        assert.deepEqual(
          layout.scenarioRows.filter((row) => row.outsideMain),
          [],
          `Expected scenario rows to fit the main panel at ${viewport.width}px`,
        );
        assert.ok(layout.scenarioRows.every((row) => row.hasValue), "Expected each scenario row to show its projected value");
      }

      if (viewport.width <= 520 && ["overview", "cashflow", "equity", "scenarios"].includes(tabName)) {
        assert.equal(layout.tableDisplay, "block", `${tabName} table should use card display at ${viewport.width}px`);
        assert.ok(
          layout.labeledCells.length > 0 && layout.labeledCells.every(Boolean),
          `${tabName} mobile table cards should expose data-labels at ${viewport.width}px`,
        );
      }
    }

    await clickUnique(page, ".rail-item[data-tab='scenarios']");
    const bottomClearance = await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
      const nav = document.querySelector(".nav-rail").getBoundingClientRect();
      const activePanel = document.querySelector(".tab-panel.is-active");
      const lastVisible = [...activePanel.querySelectorAll(".scenario-table-wrap, .scenario-row, article.panel")]
        .filter((item) => {
          const rect = item.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        })
        .at(-1);
      const lastRect = lastVisible.getBoundingClientRect();
      return {
        navTop: Math.round(nav.top),
        lastBottom: Math.round(lastRect.bottom),
      };
    });
    assert.ok(
      bottomClearance.lastBottom <= bottomClearance.navTop - 8,
      `Expected bottom nav not to cover scenario content at ${viewport.width}px: ${JSON.stringify(bottomClearance)}`,
    );
  }
});

test("mobile tall detail tables expand to contain card rows", async ({ page, url }) => {
  const viewports = [
    { width: 390, height: 844 },
    { width: 430, height: 932 },
  ];
  const tabs = ["cashflow", "equity"];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await resetPage(page, url);

    for (const tabName of tabs) {
      await clickUnique(page, `.rail-item[data-tab='${tabName}']`);
      const tableContainment = await page.evaluate((activeTabName) => {
        const activePanel = document.querySelector(".tab-panel.is-active");
        return [...activePanel.querySelectorAll(".table-wrap.tall")].map((wrap) => {
          const table = wrap.querySelector("table");
          const panel = wrap.closest(".panel");
          const wrapRect = wrap.getBoundingClientRect();
          const tableRect = table.getBoundingClientRect();
          const panelRect = panel.getBoundingClientRect();
          const style = getComputedStyle(wrap);
          return {
            activeTabName,
            maxHeight: style.maxHeight,
            overflowY: style.overflowY,
            wrapHeight: Math.round(wrapRect.height),
            tableHeight: Math.round(tableRect.height),
            panelBottom: Math.round(panelRect.bottom),
            tableBottom: Math.round(tableRect.bottom),
            cardDisplay: getComputedStyle(table).display,
            labeledCells: [...table.querySelectorAll("tbody tr:first-child td")].map((cell) => cell.getAttribute("data-label")),
          };
        });
      }, tabName);

      assert.ok(tableContainment.length > 0, `Expected ${tabName} to include a tall table wrapper`);
      for (const detail of tableContainment) {
        assert.equal(detail.cardDisplay, "block", `${tabName} tall table should render as mobile cards`);
        assert.equal(detail.maxHeight, "none", `${tabName} tall wrapper should not cap card rows: ${JSON.stringify(detail)}`);
        assert.ok(
          detail.wrapHeight >= detail.tableHeight,
          `${tabName} tall wrapper should grow around its table cards: ${JSON.stringify(detail)}`,
        );
        assert.ok(
          detail.tableBottom <= detail.panelBottom + 1,
          `${tabName} panel should contain the final visible card row: ${JSON.stringify(detail)}`,
        );
        assert.ok(
          detail.labeledCells.length > 0 && detail.labeledCells.every(Boolean),
          `${tabName} card rows should retain labels: ${JSON.stringify(detail)}`,
        );
      }

      const finalCardClearance = await page.evaluate(() => {
        window.scrollTo(0, document.documentElement.scrollHeight);
        const nav = document.querySelector(".nav-rail").getBoundingClientRect();
        const activePanel = document.querySelector(".tab-panel.is-active");
        const rows = [...activePanel.querySelectorAll(".table-wrap.tall tbody tr, .table-wrap.tall tfoot tr")].filter((row) => {
          const rect = row.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });
        const finalRow = rows.at(-1).getBoundingClientRect();
        return {
          navTop: Math.round(nav.top),
          finalRowBottom: Math.round(finalRow.bottom),
        };
      });
      assert.ok(
        finalCardClearance.finalRowBottom <= finalCardClearance.navTop - 8,
        `${tabName} final mobile table card should clear the bottom nav: ${JSON.stringify(finalCardClearance)}`,
      );
    }
  }
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
