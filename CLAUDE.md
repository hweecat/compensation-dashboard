# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Vite + React 18 + TypeScript single-page application. The live app is published to GitHub Pages at `https://ongchinhwee.me/compensation-dashboard/`. The build emits a static site to `dist/` via `vite build`.

Default assumptions in `src/state.ts` are public sample values — `tests/public-defaults.spec.cjs` blocks specific private-looking defaults from being committed.

## Build commands

- `npm run build` — runs `vite build`, emits to `dist/` (gitignored). Vite handles TypeScript compilation, CSS minification (Lightning CSS), tree-shaking, and code splitting.
- `npm run dev` — starts the Vite dev server with HMR for local development.
- `npm run preview` — serves the production build locally for testing.

Edit files under `src/` (`.ts`, `.tsx`) or `src/styles/` (`.css`) — never the generated files under `dist/`. The `dist/` directory is gitignored and rebuilt on every `npm run build`.

## Testing

- All: `npm test` — runs `public-defaults` + `source-layout` + `html-structure` + `style-structure` + `dashboard` + `file-module-load` in order.
- Structure-only (no browser): `npm run test:structure`.
- Browser-only (needs Playwright + Chromium): `npm run test:browser`.
- Vitest unit tests (math + format layers): `npm run test:vitest` — 61 assertions covering `src/model.ts` and `src/format.ts`.
- A standalone performance check exists at `tests/performance-compare.cjs`. It compares the current modular bundle against a synthetic legacy baseline URL served by `tests/helpers/static-server.cjs`; not part of `npm test` because it requires a local Chrome at `C:/Program Files/Google/Chrome/Application/chrome.exe`. Opt-in: `node tests/performance-compare.cjs`.

Playwright version is pinned in `package.json` (currently `1.61.1`) and enforced in `tests/helpers/playwright.cjs`. The `postinstall` hook runs `playwright install chromium` which downloads ~300 MB; on a slow link it adds minutes to a fresh `npm install`. Set `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` in CI to skip when reusing cached browsers.

`tests/helpers/playwright.cjs` prefers the `playwright` package from `node_modules` and falls back to a bundled Codex-runtime path; tests run headless using the system Chrome at `C:/Program Files/Google/Chrome/Application/chrome.exe` when present.

## High-level architecture

Three source trees:

1. **TypeScript sources** under `src/` — the maintainable application code:
   - `state.ts`: `DEFAULTS` object, `ProjectionState` type, `loadState`/`persistState` (localStorage key `compProjectionState`).
   - `format.ts`: `asNumber`, `addMonths`, `parseStartDate`, `monthDate`, `monthLabel`, `money`, `compactMoney`, `escapeHtml`, `safeFileName`, `formatterFor`.
   - `model.ts`: `projectionFor(state, defaults)`, `annualSalaryForYear`, `convertCurrency`, `signOnForMonth`, `vestingSharesForMonth`, `customVestingWeights`, `customVestingEvents`, `cashflowDisplayRows`, `cumulativeCashflowRows`, `annualCashflowRows`, `scenarioVariants`, window helpers, `mixRows`, `donutSegmentPath`.
   - `export.ts`: CSV and shareable HTML report generation.
   - `dom.ts`: tiny typed DOM helpers.
   - `main.tsx`: React entrypoint, mounts `<App />` into `#root`.
   - `App.tsx`: top-level layout (app shell, nav rail, tab routing, event wiring).
   - `components/`: React components (`*.tsx`) for controls, charts, tables.

2. **Component CSS sources** under `src/styles/` — imported by the Vite build. The order is fixed (asserted by `style-structure.spec.cjs`):
   `00-foundations` → `01-app-shell` → `02-navigation` → `03-top-bar` → `04-buttons` → `05-panels` → `06-forms` → `07-tabs` → `08-summary` → `09-charts` → `10-compensation-mix` → `11-tables` → `12-scenarios` → `13-responsive`. Each file starts with a `/* ===== Section ===== */` header. The CSS must never reference an undefined `--border` token.

3. **Vite entrypoint** `index.html` — contains `<div id="root"></div>` and `<script type="module" src="/src/main.tsx"></script>`. Vite transforms this into the production `dist/index.html` with hashed asset references.

### DOM contract (test-enforced)

Several DOM ids and class names are load-bearing — they are asserted by the Playwright `dashboard.spec.cjs` and the structural CSS selectors in `tests/style-structure.spec.cjs`. Renaming or removing any of them silently breaks the suite. The contract covers:

- Container ids: `#summaryCards`, `#cashflowChart`, `#equityChart`, `#mixChart`, `#cashflowRows`, `#vestingRows`, `#vestingPreview`, `#equityStats`, `#scenarioGrid`, `#scenarioYearTable`, `#scenarioYearHead`, `#scenarioYearRows`, `#cashflowWindowOverview`, `#equityWindowOverview`, `#cashflowWindowStart`, `#cashflowWindowEnd`, `#equityWindowStart`, `#equityWindowEnd`, `#mixPeriodSelect`, `#mixPeriodLabel`, `#cashflowWindowLabel`, `#equityWindowLabel`, `#cashflowZoomLabel`, `#equityZoomLabel`, `#periodLabel`, `#assumptionControls`, `#peakBadge`, `#cashflowTotal`, `#equityPointDetail`, `#mixHoverDetail`, `#cashflowChartTitle`, `#cashflowChartSubtitle`, `#cashflowDetailTitle`, `#cashflowDetailSubtitle`, `#cashflowSubtotal`.
- Tab routing: `[data-tab="overview|cashflow|equity|scenarios"]` on `.rail-item` and `.tab-button`.
- Cashflow components: `[data-cashflow-component="salary|bonus|signOn|equityValue"]`.
- Cashflow/equity zoom: `[data-{cashflow,equity}-zoom="in|out"]`, `[data-{cashflow,equity}-zoom-reset]`, `[data-overview-cashflow-view="monthly|annual"]`, `[data-detail-cashflow-view="monthly|annual"]`, `[data-overview-cumulative]`, `[data-detail-cumulative]`.
- CSS selectors checked by `style-structure.spec.cjs`: `.cashflow-window-overview`, `.salary-fill`, `.bonus-fill`, `.signon-fill`, `.equity-fill`, `.equity-line`, `.mix-segment`, `.table-wrap`.
- Top-bar control ids: `#resetButton`, `#exportButton`, `#exportReportButton`, `#scenarioName`.
- Mobile contract: at viewport ≤430px the `#summaryCards` grid must use exactly two columns, and tables must use `display: block` (asserted in `dashboard.spec.cjs`).

Always grep these ids/classes before refactoring components: `rg "summaryCards|cashflowChart|mixChart|table-wrap|salary-fill" tests/`.

## Data flow

`App.tsx` loads state from `state.ts` (via `loadState`), then on every render: normalize → call `projectionFor(state, DEFAULTS)` → pass `(state, model)` into each component. UI events mutate `state`, call `persistState`, and trigger a re-render (which re-runs `projectionFor`). Components are pure with respect to the data passed in — no hidden global state, no DOM lookups beyond the explicit container ids.

## Money / currency rules

- Cash currency (`cashCurrency`) and equity currency (`equityCurrency`) can differ.
- `convertCurrency(state, value, from, to)` converts using `usdToSgd` rate.
- Report currency (`reportCurrency`) determines the display prefix (`$` or `S$`).
- Custom vesting weights (e.g. `5:15:45:35`) are relative — normalized at usage site, not in `customVestingWeights()`.
- Custom vesting events (e.g. `30:98,36:97,...`) vest exact shares at completed month numbers.
- The `-15%` growth rate in `scenarioGrowthRates` is the stress case.

## Deployment

- GitHub Pages workflow: `.github/workflows/deploy-pages.yml`
- Runs on push to `main` + manual dispatch.
- Node 24, `npm ci` → `npm run build` → `npm test` → upload `dist/` → deploy.
- Published URL: `https://ongchinhwee.me/compensation-dashboard/`
- Pre-publish checklist: `npm run build && npm test` must pass locally.

## File layout quick reference

- Maintainable: `src/**` (`.ts`, `.tsx`), `src/styles/**` (`.css`), `index.html`, `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`
- Tests: `tests/*.spec.cjs`, `tests/*.test.ts`, `tests/file-module-load.cjs`, `tests/performance-compare.cjs`, `tests/helpers/{playwright,static-server}.cjs`
- Plans/specs: `docs/superpowers/plans/`, `docs/superpowers/specs/`
- Concept reference: `assets/concept-dashboard.png`
- Generated `dist/` (gitignored, rebuilt by `npm run build`)