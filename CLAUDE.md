# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Static, zero-build compensation-projection dashboard. The browser entrypoint is `outputs/compensation-dashboard/index.html` and the live app is published to GitHub Pages at `https://ongchinhwee.me/compensation-dashboard/`. There is no npm runtime, bundler, or transpiler for users; the maintainable sources are regenerated into static browser assets by build scripts.

Default assumptions in `src/state.js` are public sample values — never replace them with private/offer data (`tests/public-defaults.spec.cjs` blocks specific private-looking defaults from re-entering source or generated output).

## Build commands

All static browser assets (HTML, CSS, JS) are regenerated from the maintainable sources in one shot. The combined script chains the Python HTML generator, the Node CSS generator, and the Node JS generator.

- One-shot rebuild: `node tools/build-static.cjs`
  - Equivalent npm script: `npm run build` (also runs `playwright install chromium` via `postinstall`).
- Individual generators (rarely needed on their own):
  - `python tools/build-html.py` → writes `outputs/compensation-dashboard/index.html` and the root `index.html`.
  - `node tools/build-styles.cjs` → writes `styles.css` and `outputs/compensation-dashboard/styles.css` (both must stay identical).
  - `node tools/build-standalone.cjs` → writes `outputs/compensation-dashboard/src/standalone.js` (the only file under `outputs/.../src/`; the maintainable ES modules are stripped of imports/exports and concatenated inside an IIFE).

Edit `tools/build-html.py`, files under `src/`, or files under `src/styles/` — never the generated files under `outputs/`, the root `index.html`, or `styles.css`. The browser cannot use ES module imports over `file://`, so the checked-in standalone runtime is the only browser target.

## Testing

Regression tests run as plain Node scripts (no test runner):

- All: `npm test` — runs `public-defaults` + `source-layout` + `html-structure` + `style-structure` + `dashboard` + `file-module-load` in order.
- Structure-only (no browser): `npm run test:structure`.
- Browser-only (needs Playwright + Chromium): `npm run test:browser`.
- A standalone performance check exists at `tests/performance-compare.cjs` (compares modular vs. legacy baseline; not part of `npm test`).

`tests/helpers/playwright.cjs` prefers the `playwright` package from `node_modules` and falls back to a bundled Codex-runtime path; tests run headless using the system Chrome at `C:/Program Files/Google/Chrome/Application/chrome.exe` when present. Playwright version is pinned in `package.json` and asserted in the helper.

The `html-structure` and `style-structure` specs round-trip the generators and compare output to committed files, so they catch unintended drift in the generated assets.

## High-level architecture

Three maintainable source trees feed one combined builder:

1. **HTML component generator** — `tools/build-html.py` is organized in four layers, each layer only depending on prior layers:
   - Markup primitives: `html_attrs`, `tag`, `svg`, `button`.
   - Shared UI components: `panel_header`, `panel`, `table`, `segmented_control`, `zoom_controls`, `zoom_window`.
   - Layout components (each returns a closed element receiving its children explicitly): `base_document`, `app_shell`, `navigation`, `workspace`, `topbar`, `dashboard_grid`, `assumptions_panel`, `main_panel`, `tab_strip`, `tab_panels`.
   - Tab components: `overview`, `cashflow`, `equity`, `scenarios`.
   - Composer: `render_index()` reads like the rendered DOM tree.
   - The generator must remain free of `document_start`/`document_end` fragment helpers — the test suite enforces the layered, closed-element pattern.

2. **ES module sources** under `src/`:
   - `state.js`: `DEFAULTS`, `loadState`/`persistState` (localStorage key `compProjectionState`), state normalization rules (years clamped to 1–10, vesting years to 1–8, currency enum, etc.).
   - `model.js`: pure projection math parameterized by `state` and `defaults`. Key exports: `projectionFor` (returns monthly `rows`, `totals`, `peakMonth`, `totalShares`), `annualCashflowRows`, `cashflowDisplayRows`, `cumulativeCashflowRows`, `mixRows`/`mixPeriodOptions`, `scenarioVariants` (sweeps `scenarioGrowthRates = [-15, -10, 0, 5, 10, 15, 25]`), `convertCurrency` (USD↔SGD via `state.usdToSgd`), `customVestingWeights`/`customVestingEvents`/`vestingSharesForMonth`, and the four `*CashflowWindow*`/`*EquityWindow*` zoom helpers.
   - `format.js`: `money`/`compactMoney` (S$ vs $ prefix by currency), `asNumber`, `parseStartDate`, `monthDate`/`monthLabel`/`exactDateLabel`/`vestingDateLabel`, `escapeHtml`, `safeFileName`, `monthOptions`.
   - `components/controls.js`: `renderControlPanel` builds the assumption form (Projection, Currency & FX, Cash Compensation, Sign-on Bonuses, Equity groups). It re-renders the control list itself when `vestingCadence` or `customVestingMode` changes.
   - `components/charts.js`: `renderCashflowChart` (stacked bar), `renderEquityChart` (line + hit-area dots for selection), `renderMix` (donut via `donutSegmentPath`), and the zoom pane renderers.
   - `components/tables.js`: `renderSummary`, `renderTables` (cashflow + vesting), `renderEquityStats`, `renderScenarios`.
   - `export.js`: `exportCsv` and `exportHtmlReport` (standalone printable HTML).
   - `main.js`: loads state, owns `render()`/`renderControls()` orchestration, and wires every event handler (tab switching, view toggles, component filters, zoom buttons + drag-rectangle + wheel + keyboard handlers, window range sliders, reset, exports).
   - `dom.js`: tiny helpers (`byId`, `setHtml`, `setText`, `setActiveBySelector`).

3. **Component CSS sources** under `src/styles/` — sorted and concatenated by `tools/build-styles.cjs`. The order is fixed (asserted by `style-structure.spec.cjs`):
   `00-foundations` → `01-app-shell` → `02-navigation` → `03-top-bar` → `04-buttons` → `05-panels` → `06-forms` → `07-tabs` → `08-summary` → `09-charts` → `10-compensation-mix` → `11-tables` → `12-scenarios` → `13-responsive`. Each file starts with a `/* ===== Section ===== */` header. The generated `styles.css` (root) and `outputs/compensation-dashboard/styles.css` must remain byte-identical (normalized line endings) and must never reference an undefined `--border` token.

## Data flow

`main.js` loads state from `state.js`, then on every render: normalize → call `projectionFor(state, DEFAULTS)` → pass `(state, model)` into each component renderer. UI events mutate `state`, call `persistState`, and re-run `render()` (which re-runs `projectionFor`). Components are pure with respect to the data passed in — no hidden global state, no DOM lookups beyond the explicit container ids declared in the generated HTML.

## Money / currency rules (assumptions to preserve)

- Base salary can be entered annual or monthly; internally normalized to annual then divided by 12.
- Salary compounds annually by `salaryGrowth%`.
- Bonus paid once per year in `bonusMonth` from that year's annual salary.
- Year 1 / Year 2 sign-on bonuses can be `lump` at the start of the year or spread across the year.
- Custom vesting: `weights` mode normalizes colon-separated year weights (`5:15:45:35`); `events` mode takes `month:units` pairs (`30:98,36:97,...`) and vests exact units at completed months.
- Equity compounds monthly from `annualEquityGrowth`; `vestingSharesForMonth` honors `cliffMonths` and the interval (monthly/quarterly/annual/custom spread).
- Cash and equity can use different source currencies; `convertCurrency` normalizes totals to `state.reportCurrency` using `state.usdToSgd` (default `1.35`).
- Scenario sensitivity always includes the `-15%` stress case.

## Deployment

- GitHub Pages deploy workflow: `.github/workflows/deploy-pages.yml` — runs on push to `main` and `workflow_dispatch`, builds with Node 24 + Python 3.13, runs `npm run build` then `npm test`, uploads `outputs/compensation-dashboard/` as the Pages artifact.
- Concurrency group is `pages` with `cancel-in-progress: false`.
- The published URL pattern is the repo's default GitHub Pages URL (see `docs/superpowers/plans/2026-07-04-github-pages-deploy.md`); the currently-published URL is `https://ongchinhwee.me/compensation-dashboard/`.
- Pre-publish checklist: `npm run build` then `npm test`.

## File layout quick reference

- Maintainable: `tools/build-html.py`, `src/**`, `src/styles/**`
- Generated (do not edit): `index.html`, `styles.css`, `outputs/compensation-dashboard/**`
- Tests: `tests/*.spec.cjs`, `tests/file-module-load.cjs`, `tests/performance-compare.cjs`, `tests/helpers/{playwright,static-server}.cjs`
- Plans/specs: `docs/superpowers/plans/`, `docs/superpowers/specs/`
- Concept reference: `assets/concept-dashboard.png`
