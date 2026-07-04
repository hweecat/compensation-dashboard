# Zero-Build Dashboard Refactor Design

## Goal

Refactor the compensation projection dashboard into smaller, reusable, component-style HTML sources, JavaScript modules, and CSS source files while preserving the current zero-build static workflow. Add frontend regression tests for charts, tables, visualizations, exported reports, and generated static assets.

## Scope

The existing dashboard remains a static app served from `outputs/compensation-dashboard/index.html`. The refactor will not introduce React, Vite, npm build steps, or runtime dependencies for users. Source files are split for maintainability, then checked-in static HTML, CSS, and JS assets are generated for direct `file://` usage.

## Current State

The dashboard originally had three main files:

- `outputs/compensation-dashboard/index.html`: static markup and app containers.
- `outputs/compensation-dashboard/app.js`: projection math, state management, controls, charts, tables, export logic, and event listeners in one large file.
- `outputs/compensation-dashboard/styles.css`: app layout and visual styling.

The biggest maintainability issue was that `app.js` mixed model logic, rendering, event wiring, export generation, and low-level SVG construction. Styling also lived in one large stylesheet, and the static HTML was a single large entrypoint. The current refactor keeps layered HTML component functions in `tools/build-html.py`, source modules under `src/`, and component CSS sources under `src/styles/`, then generates the static browser assets consumed from `outputs/compensation-dashboard`.

## Architecture

Use root source ES modules, component CSS files, and Python HTML component functions as the maintainable source, then generate static browser assets:

```powershell
C:\Users\ongch\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tools\build-static.cjs
```

The new module layout will be:

- `tools/build-html.py`
  - Owns layered Python HTML component functions for markup primitives, shared UI components, independent closed layout sections, dashboard tabs, and script/style includes.
- `src/state.js`
  - Owns default values, localStorage load/save, state normalization, and state mutation helpers.
- `src/format.js`
  - Owns currency formatting, compact currency formatting, date labels, HTML escaping, and safe filenames.
- `src/model.js`
  - Owns compensation projection logic, vesting schedule logic, forex conversion, annual/monthly/cumulative row builders, scenario sensitivity variants, and mix-period rows.
- `src/components/controls.js`
  - Renders assumption controls and emits state updates through callbacks.
- `src/components/charts.js`
  - Renders compensation cashflow, equity valuation growth, compensation mix, zoom panes, and chart detail labels.
- `src/components/tables.js`
  - Renders cashflow, vesting, equity stats, and scenario tables.
- `src/export.js`
  - Generates CSV and shareable HTML reports.
- `src/dom.js`
  - Contains small DOM helpers for rendering HTML, binding events, and query safety.
- `src/main.js`
  - Owns top-level render orchestration and event wiring.
- `src/styles/*.css`
  - Owns component CSS sources for foundations, shell, navigation, controls, panels, charts, compensation mix, tables, scenarios, and responsive rules.
- `outputs/compensation-dashboard/index.html`
  - Generated static browser entrypoint consumed by users and tests.
- `outputs/compensation-dashboard/src/standalone.js`
  - Generated browser runtime consumed by the static HTML entrypoint.
- `outputs/compensation-dashboard/styles.css`
  - Generated stylesheet consumed by the static HTML entrypoint.
- `styles.css`
  - Generated root copy kept in sync for inspection and standalone output parity.

No module should directly reach into unrelated state. Components will receive the state, model, and callbacks they need as explicit parameters.

## Data Flow

1. `main.js` loads state through `state.js`.
2. `main.js` calls `projectionFor(state)` from `model.js`.
3. `main.js` passes state and model data into component render functions.
4. UI events call state update helpers, persist localStorage, and rerender.
5. Exports receive state and projection model, then return generated CSV or HTML content.

This preserves the current behavior while making calculations, rendering, and styling easier to test independently.

## Refactor Strategy

The refactor will be characterization-first:

1. Add Playwright regression tests against the current app behavior.
2. Move pure helpers first: formatting, dates, state defaults, projection math.
3. Move rendering functions into component modules without changing generated DOM contracts.
4. Move export logic into `export.js`.
5. Move HTML into component functions in `tools/build-html.py`.
6. Layer those HTML functions as primitives, shared components, independent closed layout components, tab components, and the final document composer.
7. Compose layout functions in DOM order: base document, app shell, navigation and workspace, topbar and dashboard grid, assumptions and main panel, then tab strip and tab panels.
8. Split CSS into component source files under `src/styles`.
9. Generate `outputs/compensation-dashboard/index.html`, `outputs/compensation-dashboard/src/standalone.js`, `outputs/compensation-dashboard/styles.css`, and root `styles.css` from source.
10. Keep selectors and IDs stable so existing UI behavior remains intact.
11. Run tests after each meaningful extraction.

The goal is not to redesign the UI. The goal is smaller files, clearer boundaries, less duplication, and test coverage.

## Frontend Tests

Tests will live in:

- `tests/dashboard.spec.cjs`
- `tests/helpers/static-server.cjs`
- `tests/html-structure.spec.cjs`
- `tests/style-structure.spec.cjs`

The tests will launch the static app through a local HTTP server using installed Chrome via Playwright. They will verify:

- Charts:
  - Compensation Cashflow renders salary, bonus, sign-on, and equity labels.
  - Cashflow component filters update the chart and table totals.
  - Cashflow zoom in, zoom out, reset, and range pane controls work.
  - Equity Valuation Growth renders vesting points and supports zoom/reset.
  - Compensation Mix renders percentages and detailed mouseover/click labels.
- Tables:
  - Monthly and annual cashflow modes render expected row labels.
  - Cumulative cashflow mode changes table totals.
  - Vesting events table aligns with configured custom vesting schedules.
  - Scenario Sensitivity includes year-on-year rows and the `-15% annual equity growth` stress case.
- Exports:
  - CSV contains projected monthly rows with salary, bonus, sign-on, shares, price, equity value, and total.
  - HTML report includes projection horizon labels for total projected comp and cash compensation.
  - HTML report includes Annual Cashflow, Monthly Cashflow, Vesting Schedule, and conditional Scenario Sensitivity when RSU grant value is positive.
- Generated assets:
  - Python HTML component functions exist in `tools/build-html.py`.
  - `outputs/compensation-dashboard/index.html` is generated by `tools/build-html.py` and keeps critical IDs/data attributes.
  - Component CSS files exist under `src/styles`.
  - `styles.css` and `outputs/compensation-dashboard/styles.css` match the generated component CSS output.
  - `outputs/compensation-dashboard/src/standalone.js` remains the only generated JS file under the output `src` folder.

## Compatibility

The refactored app must support direct static usage in modern browsers. Because browser ES modules can be restricted under `file://`, generated `index.html` loads generated `./src/standalone.js` rather than importing ES modules at runtime. Tests serve the folder over `http://127.0.0.1`, while `tests/file-module-load.cjs` verifies direct file loading.

## Non-Goals

- No React, Vite, webpack, TypeScript compilation, or package manager setup for the production dashboard.
- No visual redesign beyond small markup adjustments needed to preserve component boundaries.
- No changes to compensation formulas except where tests expose an existing regression.
- No network-based forex lookup or external service integration.

## Risks And Mitigations

- Risk: Splitting the large file changes event timing or selector behavior.
  - Mitigation: Keep DOM IDs and data attributes stable, and cover key flows in Playwright tests.
- Risk: ES modules behave differently under direct `file://` usage in some browsers.
  - Mitigation: Generate `standalone.js` from source modules and keep `index.html` loading a normal script.
- Risk: generated CSS drifts from component CSS sources.
  - Mitigation: `tests/style-structure.spec.cjs` compares generated stylesheets against the concatenated `src/styles` output.
- Risk: generated HTML drifts from Python HTML component functions.
  - Mitigation: `tests/html-structure.spec.cjs` runs `tools/build-html.py` and verifies critical IDs/data attributes remain present.
- Risk: Export output changes accidentally.
  - Mitigation: Add tests that download and inspect the HTML and CSV exports.

## Acceptance Criteria

- `index.html` loads the refactored static app through generated `standalone.js`.
- Projection math and vesting behavior remain consistent with the current dashboard.
- Cashflow, equity, compensation mix, scenario, table, and export flows are covered by frontend tests.
- Reusable chart/table/export helpers remove duplicated HTML generation patterns.
- Production app remains zero-build and can be served directly from `outputs/compensation-dashboard`.
- `tools/build-static.cjs` regenerates generated HTML, CSS, and JS assets from source.
