# Total Compensation Calculator - Growth Projection Cases

## Objective

This dashboard helps compare projected total compensation across a configurable time horizon. It models monthly and annual cashflow from salary, bonus, sign-on bonuses, and RSU vesting, then converts everything into a selected reporting currency so compensation outcomes can be compared consistently.

The calculator is designed for offer and employment-package analysis where cash compensation and equity compensation may be denominated in different currencies. It supports custom vesting schedules, valuation growth scenarios, and exportable projection outputs.

## Design

The app is a Vite + React 18 + TypeScript single-page application. The build output is a static site deployed to GitHub Pages.

The maintainable source modules live in:

- `src/` — TypeScript/TSX components, state, model, and formatting logic

Core source areas:

- `src/state.ts`: default inputs, localStorage loading, and persistence.
- `src/model.ts`: compensation projection math, vesting logic, currency conversion, row builders, zoom-window helpers, and scenario sensitivity.
- `src/format.ts`: date, currency, HTML escaping, and filename formatting.
- `src/App.tsx`: top-level layout, tab routing, and event wiring.
- `src/main.tsx`: React entrypoint, mounts `<App />` into `#root`.
- `src/components/`: React components for controls, charts, and tables.
- `src/styles/*.css`: component CSS sources imported by the Vite build.

The Vite entrypoint is:

- `index.html` — contains `<div id="root"></div>` and loads `/src/main.tsx`

Build the static site with:

```bash
npm run build
```

This runs `vite build` and emits the production bundle to `dist/`. Vite handles TypeScript compilation, CSS minification (via Lightning CSS), tree-shaking, and code splitting.

For local development with hot module replacement:

```bash
npm run dev
```

For previewing the production build locally:

```bash
npm run preview
```

## Deployment

The static dashboard publishes from:

- `dist/`

GitHub Pages deployment is defined in:

- `.github/workflows/deploy-pages.yml`

The workflow runs on pushes to `main` and through manual dispatch. It installs Node.js, builds the dashboard with `npm run build`, runs the regression tests, uploads `dist/` as the Pages artifact, and deploys to the default GitHub Pages URL for the repository. The exact published URL is shown in the successful deployment output.

Published dashboard:

- `https://ongchinhwee.me/compensation-dashboard/`

The checked-in defaults are public sample assumptions, not private compensation data. Before publishing new examples, run:

```bash
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

Regression tests are stored in `tests/` and can be run with:

```bash
npm test
```

This runs the structure tests (source layout, public defaults, HTML structure, style structure) and the browser tests (dashboard spec, file module load).

Vitest unit tests for the math and formatting layers:

```bash
npm run test:vitest
```

These cover `src/model.ts` and `src/format.ts` with 61 assertions.