# GitHub Pages Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the sanitized compensation dashboard to a new public GitHub repository named `compensation-dashboard` using the default GitHub Pages URL.

**Architecture:** Keep the app as a zero-build static dashboard and deploy only `outputs/compensation-dashboard/` as the Pages artifact. Add a small npm test/build wrapper so GitHub Actions can run the existing Python, Node, and browser tests on hosted runners before deploying.

**Tech Stack:** Static HTML/CSS/JavaScript, Python HTML generator, Node.js build scripts, Playwright browser tests, GitHub Actions, GitHub Pages.

---

## File Structure

- Modify: `src/state.js`
  - Replace sensitive compensation defaults with public sample values.
- Modify: `app.js`
  - Replace the same sensitive defaults in the legacy runtime file because it will be visible in the public repository even though the dashboard no longer loads it.
- Modify: `tests/dashboard.spec.cjs`
  - Load Playwright through a cross-platform helper and update the expected scenario name.
- Modify: `tests/file-module-load.cjs`
  - Load Playwright through the same cross-platform helper and update the expected scenario name.
- Create: `tests/helpers/playwright.cjs`
  - Prefer `playwright` from npm in CI, fall back to the bundled local `playwright-core` path for the current Windows workspace.
- Create: `tests/public-defaults.spec.cjs`
  - Prevent the original private-looking defaults from returning to source, legacy runtime, or generated output.
- Create: `package.json`
  - Add CI-friendly scripts for build, test, and browser installation.
- Create after `npm install`: `package-lock.json`
  - Lock Playwright dependency versions for repeatable GitHub Actions installs.
- Create: `.gitignore`
  - Exclude local dependency folders, logs, caches, and OS noise while keeping generated static output committed.
- Create: `.github/workflows/deploy-pages.yml`
  - Build, test, upload, and deploy the static dashboard artifact.
- Modify: `README.md`
  - Document sanitized public defaults, deployment, and the expected default Pages URL pattern.
- Regenerate: `index.html`, `styles.css`, `outputs/compensation-dashboard/index.html`, `outputs/compensation-dashboard/styles.css`, `outputs/compensation-dashboard/src/standalone.js`
  - Generated through `npm run build`.

## Public Sample Defaults

Use these values in `src/state.js` and `app.js`:

```js
scenarioName: "Sample Compensation Projection",
baseSalary: 120000,
salaryBasis: "annual",
salaryGrowth: 3,
bonusPercent: 10,
bonusMonth: 3,
signOnYear1: 10000,
signOnYear1Mode: "lump",
signOnYear2: 0,
signOnYear2Mode: "monthly",
rsuGrantValue: 100000,
startingSharePrice: 100,
annualEquityGrowth: 5,
vestingYears: 4,
vestingCadence: "custom",
customVestingMode: "weights",
customVestingPattern: "25:25:25:25",
customVestingSpread: "quarterly",
cliffMonths: 0,
```

These keep the dashboard useful on first load while removing the original offer-like numbers:

- `baseSalary: 220000`
- `signOnYear1: 50000`
- `signOnYear2: 25000`
- `rsuGrantValue: 420000`
- `startingSharePrice: 180`
- `annualEquityGrowth: 12`
- `customVestingPattern: "5:15:45:35"`

### Task 1: Add CI Package Scripts

**Files:**
- Create: `package.json`
- Create after install: `package-lock.json`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "compensation-dashboard",
  "version": "1.0.0",
  "private": true,
  "description": "Static compensation projection dashboard.",
  "scripts": {
    "build": "node tools/build-static.cjs",
    "test": "node tests/public-defaults.spec.cjs && node tests/source-layout.spec.cjs && node tests/html-structure.spec.cjs && node tests/style-structure.spec.cjs && node tests/dashboard.spec.cjs && node tests/file-module-load.cjs",
    "test:structure": "node tests/public-defaults.spec.cjs && node tests/source-layout.spec.cjs && node tests/html-structure.spec.cjs && node tests/style-structure.spec.cjs",
    "test:browser": "node tests/dashboard.spec.cjs && node tests/file-module-load.cjs",
    "postinstall": "playwright install chromium"
  },
  "devDependencies": {
    "playwright": "1.60.0"
  }
}
```

- [ ] **Step 2: Install dependencies and create the lockfile**

Run:

```powershell
npm install
```

Expected:

```text
added ... packages
```

Confirm:

```powershell
Test-Path package-lock.json
```

Expected:

```text
True
```

- [ ] **Step 3: Commit package setup**

```powershell
git add package.json package-lock.json
git commit -m "chore: add dashboard build and test scripts"
```

### Task 2: Make Browser Tests Cross-Platform

**Files:**
- Create: `tests/helpers/playwright.cjs`
- Modify: `tests/dashboard.spec.cjs`
- Modify: `tests/file-module-load.cjs`

- [ ] **Step 1: Create the Playwright helper**

Create `tests/helpers/playwright.cjs`:

```js
const fs = require("node:fs");

const bundledPlaywrightCore =
  "C:/Users/ongch/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/.pnpm/playwright-core@1.60.0/node_modules/playwright-core";
const localChromePath = "C:/Program Files/Google/Chrome/Application/chrome.exe";

function loadChromium() {
  try {
    return require("playwright").chromium;
  } catch (npmError) {
    try {
      return require(bundledPlaywrightCore).chromium;
    } catch {
      throw npmError;
    }
  }
}

function browserLaunchOptions() {
  if (!process.env.CI && fs.existsSync(localChromePath)) {
    return { headless: true, executablePath: localChromePath };
  }

  return { headless: true };
}

module.exports = {
  chromium: loadChromium(),
  browserLaunchOptions,
};
```

- [ ] **Step 2: Update `tests/dashboard.spec.cjs` imports and launch**

Replace:

```js
const { chromium } = require("C:/Users/ongch/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/.pnpm/playwright-core@1.60.0/node_modules/playwright-core");
const { serveStatic } = require("./helpers/static-server.cjs");
```

With:

```js
const { chromium, browserLaunchOptions } = require("./helpers/playwright.cjs");
const { serveStatic } = require("./helpers/static-server.cjs");
```

Remove:

```js
const chromePath = "C:/Program Files/Google/Chrome/Application/chrome.exe";
```

Replace:

```js
const browser = await chromium.launch({ headless: true, executablePath: chromePath });
```

With:

```js
const browser = await chromium.launch(browserLaunchOptions());
```

- [ ] **Step 3: Update `tests/file-module-load.cjs` imports and launch**

Replace:

```js
const { chromium } = require("C:/Users/ongch/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/.pnpm/playwright-core@1.60.0/node_modules/playwright-core");
```

With:

```js
const { chromium, browserLaunchOptions } = require("./helpers/playwright.cjs");
```

Remove:

```js
const chromePath = "C:/Program Files/Google/Chrome/Application/chrome.exe";
```

Replace:

```js
const browser = await chromium.launch({ headless: true, executablePath: chromePath });
```

With:

```js
const browser = await chromium.launch(browserLaunchOptions());
```

- [ ] **Step 4: Run browser tests locally**

Run:

```powershell
npm run test:browser
```

Expected:

```text
PASS overview charts render core compensation components
PASS module app boots without legacy app.js fallback
...
```

- [ ] **Step 5: Commit test portability**

```powershell
git add tests/helpers/playwright.cjs tests/dashboard.spec.cjs tests/file-module-load.cjs
git commit -m "test: make browser tests portable"
```

### Task 3: Sanitize Public Defaults

**Files:**
- Modify: `src/state.js`
- Modify: `app.js`
- Modify: `tests/dashboard.spec.cjs`
- Modify: `tests/file-module-load.cjs`

- [ ] **Step 1: Update `src/state.js` defaults**

Replace the current `DEFAULTS` compensation fields with:

```js
  scenarioName: "Sample Compensation Projection",
  startDate: new Date().toISOString().slice(0, 10),
  years: 4,
  cashCurrency: "SGD",
  equityCurrency: "USD",
  reportCurrency: "SGD",
  usdToSgd: 1.35,
  overviewCashflowView: "monthly",
  overviewCashflowCumulative: false,
  cashflowZoom: 1,
  cashflowWindowStart: 0,
  cashflowWindowEnd: 0,
  equityWindowStart: 0,
  equityWindowEnd: 0,
  selectedEquityPoint: null,
  cashflowComponents: {
    salary: true,
    bonus: true,
    signOn: true,
    equityValue: true,
  },
  detailCashflowView: "monthly",
  detailCashflowCumulative: false,
  mixPeriod: "all",
  baseSalary: 120000,
  salaryBasis: "annual",
  salaryGrowth: 3,
  bonusPercent: 10,
  bonusMonth: 3,
  signOnYear1: 10000,
  signOnYear1Mode: "lump",
  signOnYear2: 0,
  signOnYear2Mode: "monthly",
  rsuGrantValue: 100000,
  startingSharePrice: 100,
  annualEquityGrowth: 5,
  vestingYears: 4,
  vestingCadence: "custom",
  customVestingMode: "weights",
  customVestingPattern: "25:25:25:25",
  customVestingSpread: "quarterly",
  cliffMonths: 0,
```

- [ ] **Step 2: Update the matching default block in `app.js`**

Make the same value changes in the root-level `app.js` default state block:

```js
  scenarioName: "Sample Compensation Projection",
  baseSalary: 120000,
  bonusPercent: 10,
  signOnYear1: 10000,
  signOnYear2: 0,
  rsuGrantValue: 100000,
  startingSharePrice: 100,
  annualEquityGrowth: 5,
  customVestingPattern: "25:25:25:25",
```

- [ ] **Step 3: Update scenario-name assertions**

In `tests/dashboard.spec.cjs` and `tests/file-module-load.cjs`, replace:

```js
"Total Compensation Calculator - Growth Projection Cases"
```

With:

```js
"Sample Compensation Projection"
```

- [ ] **Step 4: Run the structure tests before regenerating**

Run:

```powershell
npm run test:structure
```

Expected:

```text
no assertion output and exit code 0
```

- [ ] **Step 5: Commit sanitized source defaults**

```powershell
git add src/state.js app.js tests/dashboard.spec.cjs tests/file-module-load.cjs
git commit -m "chore: sanitize public dashboard defaults"
```

### Task 4: Add a Regression Test for Public Defaults

**Files:**
- Create: `tests/public-defaults.spec.cjs`

- [ ] **Step 1: Create `tests/public-defaults.spec.cjs`**

```js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const files = [
  "src/state.js",
  "app.js",
  "outputs/compensation-dashboard/src/standalone.js",
].map((file) => ({
  file,
  text: fs.readFileSync(path.join(root, file), "utf8"),
}));

const requiredPublicDefaults = [
  /scenarioName:\s*"Sample Compensation Projection"/,
  /baseSalary:\s*120000/,
  /bonusPercent:\s*10/,
  /signOnYear1:\s*10000/,
  /signOnYear2:\s*0/,
  /rsuGrantValue:\s*100000/,
  /startingSharePrice:\s*100/,
  /annualEquityGrowth:\s*5/,
  /customVestingPattern:\s*"25:25:25:25"/,
];

const forbiddenPrivateDefaults = [
  /scenarioName:\s*"Total Compensation Calculator - Growth Projection Cases"/,
  /baseSalary:\s*220000/,
  /signOnYear1:\s*50000/,
  /signOnYear2:\s*25000/,
  /rsuGrantValue:\s*420000/,
  /startingSharePrice:\s*180/,
  /annualEquityGrowth:\s*12/,
  /customVestingPattern:\s*"5:15:45:35"/,
];

for (const { file, text } of files) {
  for (const pattern of requiredPublicDefaults) {
    assert.match(text, pattern, `${file} should contain public sample default ${pattern}`);
  }

  for (const pattern of forbiddenPrivateDefaults) {
    assert.doesNotMatch(text, pattern, `${file} should not contain private-looking default ${pattern}`);
  }
}
```

- [ ] **Step 2: Regenerate generated assets**

Run:

```powershell
npm run build
```

Expected:

```text
no error output and exit code 0
```

- [ ] **Step 3: Run the new defaults test**

Run:

```powershell
node tests/public-defaults.spec.cjs
```

Expected:

```text
no assertion output and exit code 0
```

- [ ] **Step 4: Commit the defaults test and generated assets**

```powershell
git add tests/public-defaults.spec.cjs index.html styles.css outputs/compensation-dashboard/index.html outputs/compensation-dashboard/styles.css outputs/compensation-dashboard/src/standalone.js
git commit -m "test: guard public dashboard defaults"
```

### Task 5: Add GitHub Pages Workflow

**Files:**
- Create: `.github/workflows/deploy-pages.yml`

- [ ] **Step 1: Create `.github/workflows/deploy-pages.yml`**

```yaml
name: Deploy GitHub Pages

on:
  push:
    branches:
      - main
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Set up Node
        uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: npm

      - name: Set up Python
        uses: actions/setup-python@v6
        with:
          python-version: "3.13"

      - name: Install dependencies
        run: npm ci

      - name: Build static dashboard
        run: npm run build

      - name: Test dashboard
        run: npm test

      - name: Configure Pages
        uses: actions/configure-pages@v5

      - name: Upload Pages artifact
        uses: actions/upload-pages-artifact@v4
        with:
          path: outputs/compensation-dashboard

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Run a local YAML sanity check**

Run:

```powershell
Get-Content .github\workflows\deploy-pages.yml
```

Expected:

```text
name: Deploy GitHub Pages
...
uses: actions/deploy-pages@v4
```

- [ ] **Step 3: Commit the workflow**

```powershell
git add .github/workflows/deploy-pages.yml
git commit -m "ci: deploy dashboard to github pages"
```

### Task 6: Add Public Repo Hygiene

**Files:**
- Create: `.gitignore`
- Modify: `README.md`

- [ ] **Step 1: Create `.gitignore`**

```gitignore
node_modules/
npm-debug.log*
playwright-report/
test-results/
.cache/
.DS_Store
Thumbs.db
*.pyc
__pycache__/
```

- [ ] **Step 2: Add a README deployment section**

Append this section to `README.md`:

```markdown
## Deployment

This repository publishes the static dashboard to GitHub Pages from:

- `outputs/compensation-dashboard/`

The deployment workflow is:

- `.github/workflows/deploy-pages.yml`

The workflow runs on pushes to `main` and can also be triggered manually from the GitHub Actions tab. It installs Node.js and Python, regenerates the static dashboard, runs the regression tests, uploads `outputs/compensation-dashboard/` as the Pages artifact, and deploys it to the default GitHub Pages URL. The exact URL is shown in the successful GitHub Pages deployment output.

The checked-in defaults are public sample assumptions, not private compensation data. Before publishing new examples, run:

```powershell
npm run build
npm test
```
```

- [ ] **Step 3: Commit repo hygiene docs**

```powershell
git add .gitignore README.md
git commit -m "docs: document github pages deployment"
```

### Task 7: Run Full Local Verification

**Files:**
- No file changes expected.

- [ ] **Step 1: Regenerate static assets**

Run:

```powershell
npm run build
```

Expected:

```text
no error output and exit code 0
```

- [ ] **Step 2: Run all tests**

Run:

```powershell
npm test
```

Expected:

```text
PASS overview charts render core compensation components
PASS module app boots without legacy app.js fallback
PASS cashflow chart colors and zoom pane layout are explicit across browsers
PASS cashflow filters, zoom controls, and cumulative table update the UI
PASS annual cashflow, vesting events, and scenarios render expected table rows
PASS bonus payout follows the selected calendar month after a mid-month start date
PASS equity cashflow is paid in the displayed vesting month and counted in the vesting year mix
PASS month zero vesting events use the start date and appear in cashflow and vesting events
PASS equity visualization supports point details and reset zoom
PASS compensation mix exposes detailed labels
PASS CSV and HTML exports include expected projection outputs
```

- [ ] **Step 3: Check for private defaults one more time**

Run:

```powershell
rg -n "220000|420000|50000|25000|startingSharePrice:\s*180|annualEquityGrowth:\s*12|5:15:45:35|Total Compensation Calculator - Growth Projection Cases" .
```

Expected:

```text
no matches
```

- [ ] **Step 4: Commit any regenerated drift**

Run:

```powershell
git status --short
```

Expected:

```text
no output
```

If generated files changed, commit them:

```powershell
git add index.html styles.css outputs/compensation-dashboard/index.html outputs/compensation-dashboard/styles.css outputs/compensation-dashboard/src/standalone.js
git commit -m "build: refresh static dashboard assets"
```

### Task 8: Create and Push the GitHub Repository

**Files:**
- Local Git metadata only.
- Remote GitHub repository: `compensation-dashboard`

- [ ] **Step 1: Initialize Git if needed**

Run:

```powershell
git status
```

Expected if Git is not initialized:

```text
fatal: not a git repository (or any of the parent directories): .git
```

If Git is not initialized, run:

```powershell
git init -b main
git add .
git commit -m "feat: prepare compensation dashboard for pages"
```

- [ ] **Step 2: Create the public GitHub repository under the authenticated account**

Run:

```powershell
gh repo create compensation-dashboard --public --source=. --remote=origin --push --description "Static compensation projection dashboard"
```

Expected:

```text
The command prints the new GitHub repository URL for the authenticated account.
```

- [ ] **Step 3: Confirm the remote**

Run:

```powershell
git remote -v
```

Expected:

```text
origin appears for fetch and push, and both URLs end with /compensation-dashboard.git
```

### Task 9: Enable and Verify GitHub Pages

**Files:**
- GitHub repository settings and Actions run.

- [ ] **Step 1: Confirm Pages source**

In GitHub, open:

```powershell
$GitHubOwner = gh api user --jq ".login"
"https://github.com/$GitHubOwner/compensation-dashboard/settings/pages"
```

Set:

```text
Source: GitHub Actions
```

- [ ] **Step 2: Watch the deployment workflow**

Run:

```powershell
gh run list --workflow deploy-pages.yml --limit 1
```

Expected:

```text
completed  success  Deploy GitHub Pages
```

If the run is still active, watch it:

```powershell
gh run watch
```

- [ ] **Step 3: Open the default Pages URL**

Open:

```powershell
$GitHubOwner = gh api user --jq ".login"
"https://$GitHubOwner.github.io/compensation-dashboard/"
```

Expected:

```text
The dashboard loads, shows "Sample Compensation Projection", renders summary cards and charts, and has no browser console errors.
```

- [ ] **Step 4: Record the final URL in `README.md`**

Add the actual URL emitted by the successful deployment:

```markdown
- Published dashboard: the GitHub Pages URL emitted by the successful deployment.
```

Then commit and push:

```powershell
git add README.md
git commit -m "docs: add published pages url"
git push origin main
```

## Self-Review

- Spec coverage:
  - New GitHub repository named `compensation-dashboard`: Task 8.
  - Sanitized defaults before publishing: Tasks 3, 4, and 7.
  - Default GitHub Pages URL first: Tasks 5, 8, and 9.
  - CI-friendly deployment: Tasks 1, 2, 5, and 7.
- Placeholder scan:
  - No banned placeholder markers remain.
  - The GitHub owner is resolved from `gh api user --jq ".login"` when execution reaches repository creation and Pages verification.
- Type consistency:
  - Default field names match existing `src/state.js` and generated `standalone.js` fields.
  - Test helper exports `chromium` and `browserLaunchOptions`, and both browser tests import those exact names.

## References

- GitHub Pages custom workflows: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
- `actions/setup-node`: https://github.com/actions/setup-node
- `actions/setup-python`: https://github.com/actions/setup-python
