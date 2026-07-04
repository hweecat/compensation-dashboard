# Total Compensation Calculator - Growth Projection Cases

## Objective

This dashboard helps compare projected total compensation across a configurable time horizon. It models monthly and annual cashflow from salary, bonus, sign-on bonuses, and RSU vesting, then converts everything into a selected reporting currency so compensation outcomes can be compared consistently.

The calculator is designed for offer and employment-package analysis where cash compensation and equity compensation may be denominated in different currencies. It supports custom vesting schedules, valuation growth scenarios, and exportable projection outputs.

## Design

The app is a zero-build static dashboard. The browser entrypoint is:

- `outputs/compensation-dashboard/index.html`

The maintainable source modules live in:

- `src/`

The maintainable HTML component generator lives in:

- `tools/build-html.py`

The HTML generator is organized into layered component functions:

- Markup primitives such as attributes, tags, SVGs, and buttons.
- Shared UI components such as panel headers, panels, tables, segmented controls, and zoom panes.
- Independent layout components for the base document, app shell, navigation rail, workspace, topbar, dashboard grid, assumptions area, main panel, tab strip, and tab panels.
- Tab components for Overview, Cashflow, Equity, and Scenarios.
- A final composer that renders the static `index.html`.

Each layout component returns a complete, closed HTML element and receives its children explicitly, so `render_index()` reads like the DOM tree shown in browser DevTools: document, main shell, navigation and workspace, then headers, dashboard grid, panels, and tab content.

The generated browser runtime lives in:

- `outputs/compensation-dashboard/src/standalone.js`

The maintainable stylesheet sources live in:

- `src/styles/`

The generated static stylesheets live in:

- `styles.css`
- `outputs/compensation-dashboard/styles.css`

Regenerate all static browser assets with:

```powershell
C:\Users\ongch\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tools\build-static.cjs
```

`index.html` is generated from Python HTML component functions by:

```powershell
C:\Users\ongch\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe tools\build-html.py
```

`standalone.js` is generated from the source modules by:

```powershell
C:\Users\ongch\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tools\build-standalone.cjs
```

The CSS outputs are generated from component CSS source files by:

```powershell
C:\Users\ongch\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tools\build-styles.cjs
```

This keeps the HTML, source code, and styles split into small component-style units while preserving direct `file://` usage from `index.html`. Direct ES module loading is not reliable from `file://` in Chromium-based browsers because module imports can be blocked by CORS policy, so the checked-in standalone runtime is the static browser target. The checked-in static HTML and stylesheet remain single files because browsers load `index.html` and `./styles.css` directly.

For ordinary edits, change `tools/build-html.py`, files under `src/`, or files under `src/styles/`, then run `tools/build-static.cjs`. The individual `tools/build-html.py`, `tools/build-standalone.cjs`, and `tools/build-styles.cjs` scripts remain available when regenerating only one side is useful.

Core source areas:

- `src/state.js`: default inputs, localStorage loading, and persistence.
- `src/model.js`: compensation projection math, vesting logic, currency conversion, row builders, zoom-window helpers, and scenario sensitivity.
- `src/format.js`: date, currency, HTML escaping, and filename formatting.
- `src/components/controls.js`: assumption controls.
- `src/components/charts.js`: cashflow chart, equity chart, compensation mix, and zoom panes.
- `src/components/tables.js`: summary cards, cashflow tables, vesting tables, equity stats, and scenario tables.
- `src/export.js`: CSV and shareable HTML report generation.
- `src/main.js`: app orchestration and event wiring.
- `tools/build-html.py`: layered Python HTML component functions used to generate the static entrypoint.
- `src/styles/*.css`: component CSS sources used to generate the static stylesheets.
- `tools/build-static.cjs`: one-command generator for static HTML, CSS, and JS browser assets.

## Deployment

The static dashboard publishes from:

- `outputs/compensation-dashboard/`

GitHub Pages deployment is defined in:

- `.github/workflows/deploy-pages.yml`

The workflow runs on pushes to `main` and through manual dispatch. It installs Node.js and Python, regenerates the static dashboard, runs the regression tests, uploads `outputs/compensation-dashboard/` as the Pages artifact, and deploys to the default GitHub Pages URL for the repository. The exact published URL is shown in the successful deployment output.

The checked-in defaults are public sample assumptions, not private compensation data. Before publishing new examples, run:

```powershell
npm run build
npm test
```

## Assumptions

- Base salary can be entered as annual or monthly. Internally, monthly salary cashflow is derived from annualized salary.
- Salary growth compounds annually by projection year.
- Bonus is paid once per year in the configured payout month and is calculated from that year's annual salary.
- Year 1 and Year 2 sign-on bonuses can be paid as a lump sum at the start of the relevant year or spread over monthly instalments.
- RSU share count is implied from grant value divided by starting share price unless an event-based custom vesting schedule provides exact unit counts.
- Equity vests only after each completed vesting period. For example, a 12-month cliff from an August 8 start date vests on the next August 8 anniversary.
- Custom year-weight schedules such as `5:15:45:35` and `22:66:195:151` are normalized as relative year weights.
- Custom event schedules such as `30:98,36:97,42:76,48:75` vest exact units at the completed month numbers.
- Equity valuation compounds monthly from the annual growth assumption.
- Cash and equity can use different source currencies. Totals are converted into the selected report currency using the configured USD/SGD rate.
- Scenario sensitivity includes annual equity growth cases, including the stress case of `-15%`.

## Testing

Regression tests are stored in `tests/` and can be run with the bundled Node runtime:

```powershell
C:\Users\ongch\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tests\dashboard.spec.cjs
C:\Users\ongch\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tests\file-module-load.cjs
C:\Users\ongch\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tests\source-layout.spec.cjs
C:\Users\ongch\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tests\html-structure.spec.cjs
C:\Users\ongch\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tests\style-structure.spec.cjs
```
