# Worthflow Compensation Planner Parallel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the compensation dashboard as an auditable local-first planner with flexible cash schedules, multiple equity grants, event-date tax and FX, independent monthly/annual and period/cumulative views, deterministic scenarios, and local Monte Carlo risk analysis.

**Architecture:** Replace the single mutable projection model with a modular monolith. A framework-independent TypeScript domain/engine accepts immutable validated scenarios and returns a canonical event ledger; React consumes typed selectors and never contains financial formulas. IndexedDB owns versioned scenarios, a module worker owns Monte Carlo execution, and SVG charts always have semantic table/summary equivalents.

**Tech Stack:** React 18, Vite 7, strict TypeScript, Zod, decimal.js, `@js-temporal/polyfill`, idb, Vitest, fast-check, React Testing Library, Playwright, `@axe-core/playwright`, and small SVG chart components built with `@visx/scale` and `@visx/shape`.

## Global Constraints

- Every candidate starts from contract commit descended directly from `60d08c23b67caee3975c29c0edb33cbffcf60539`.
- Do not read, copy, merge, or overwrite the dirty root `main` worktree during implementation.
- The normative design contract is `docs/superpowers/specs/2026-07-11-compensation-planner-product-design.md`.
- Financial formulas may exist only under `src/engine/`; React components and state selectors may not calculate compensation.
- Deterministic money uses decimal or integer-minor-unit arithmetic; simulation alone may use `Float64Array`.
- Source and reporting currencies use ISO codes in accessible labels; currency symbols alone are insufficient.
- The reporting interval is half-open: `[startDate, addYears(startDate, horizonYears))`.
- Contractual events outside the reporting interval remain inspectable and are excluded from projection totals.
- No network calls, analytics, live market data, authentication, or cloud persistence in release one.
- All existing tests remain unless a test explicitly asserts superseded behavior; replacement coverage must be added in the same commit.
- Release gates include WCAG 2.2 AA, keyboard completion, 200% zoom, no horizontal page overflow at 375 px, and accessible data alternatives for every chart.

---

## File Structure

```text
src/
  domain/
    schema.ts                 Zod schemas and inferred immutable types
    drafts.ts                 raw form-draft types and parsing
    defaults.ts               public sample scenario
  engine/
    dates.ts                  ISO date-only and ACT/365.2425 helpers
    money.ts                  minor-unit/decimal operations and rounding
    schedules/
      salary.ts               salary and bonus events
      signOn.ts               lump, instalment, and custom payments
      vesting.ts              preset, cliff, and custom vest events
    valuation/
      equity.ts               deterministic asset price
      fx.ts                   pair resolution and event-date rates
      tax.ts                  effective tax pipeline
    ledger.ts                 canonical event assembly
    aggregate.ts              period/cumulative/annual/mix selectors
    scenarios.ts              deterministic bear/base/bull
    risk/
      prng.ts                 versioned xoshiro128** and Box–Muller
      correlation.ts          matrix validation and Cholesky
      monteCarlo.ts           pure simulation kernel and percentiles
  workers/
    risk.worker.ts            request/progress/cancel protocol
    riskProtocol.ts           serializable worker messages
  persistence/
    database.ts               IndexedDB scenarios/recovery/results
    migrations.ts             schema migrations
    importExport.ts           JSON and CSV contracts
  state/
    scenarioReducer.ts        domain commands and undoable mutations
    selectors.ts              engine-backed view adapters
    AppStateProvider.tsx      application state context
  features/
    overview/
    cash/
    equity/
    taxFx/
    risk/
  charts/
    CompensationBars.tsx
    EquityTimeline.tsx
    RiskFan.tsx
    DistributionHistogram.tsx
    AccessibleChartFrame.tsx
  components/
    AppShell.tsx
    AssumptionsRail.tsx
    GlobalViewControls.tsx
    ModelHealth.tsx
    SaveStatus.tsx
  styles/
tests/
  fixtures/
  engine/
  features/
  e2e/
  accessibility/
  performance/
```

---

### Task 1: Freeze Schema, Money, Dates, and Golden Fixtures

**Files:**
- Modify: `package.json`
- Create: `src/domain/schema.ts`
- Create: `src/domain/drafts.ts`
- Create: `src/domain/defaults.ts`
- Create: `src/engine/money.ts`
- Create: `src/engine/dates.ts`
- Create: `tests/fixtures/four-year-multi-currency.json`
- Create: `tests/fixtures/three-year-quarterly.json`
- Create: `tests/fixtures/five-year-monthly.json`
- Create: `tests/engine/schema.test.ts`
- Create: `tests/engine/money-dates.test.ts`

**Interfaces:**
- Produces: `ScenarioSchema`, `Scenario`, `EventLedgerRow`, `Money`, `toMinor`, `fromMinor`, `roundHalfEven`, `yearFraction`, `addAnchoredMonths`, `reportingInterval`.
- Consumes: normative types and date/rounding rules from the design contract.

- [ ] **Step 1: Add runtime and test dependencies**

Add exact dependency families while preserving React 18 and Vite 7:

```json
{
  "dependencies": {
    "@js-temporal/polyfill": "^0.5.1",
    "@visx/scale": "^3.12.0",
    "@visx/shape": "^3.12.0",
    "decimal.js": "^10.6.0",
    "idb": "^8.0.3",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "@axe-core/playwright": "^4.10.2",
    "fast-check": "^4.3.0"
  }
}
```

Run: `npm install --ignore-scripts`
Expected: lockfile updates and install exits 0.

- [ ] **Step 2: Write failing schema/date/money tests**

```ts
it("uses a half-open reporting interval", () => {
  expect(reportingInterval("2027-01-01", 4)).toEqual({
    start: "2027-01-01",
    endExclusive: "2031-01-01",
  });
});

it("keeps month-end anchoring", () => {
  expect(addAnchoredMonths("2027-01-31", 1)).toBe("2027-02-28");
  expect(addAnchoredMonths("2027-01-31", 2)).toBe("2027-03-31");
});

it("rounds tax half-even", () => {
  expect(roundHalfEven(new Decimal("10.005"), 2).toString()).toBe("10");
  expect(roundHalfEven(new Decimal("10.015"), 2).toString()).toBe("10.02");
});
```

Run: `npm run test:vitest -- tests/engine/schema.test.ts tests/engine/money-dates.test.ts`
Expected: FAIL because the new modules do not exist.

- [ ] **Step 3: Implement strict schemas and primitives**

`ScenarioSchema` must validate IDs, ISO date-only strings, horizon 1–10, tax 0–1, drift/growth greater than −1, positive FX and price, instalments 2–60, and a symmetric correlation matrix with diagonal one. Export only inferred readonly domain types.

```ts
export const ProjectionConfigSchema = z.object({
  startDate: IsoDateSchema,
  horizonYears: z.number().int().min(1).max(10),
  reportingCurrency: z.string().regex(/^[A-Z]{3}$/),
  displayPrecision: z.enum(["unit", "ten", "hundred", "compact"]),
});

export type Money = Readonly<{ minor: bigint; currency: CurrencyCode }>;
export const reportingInterval = (start: ISODate, years: number) => ({
  start,
  endExclusive: Temporal.PlainDate.from(start).add({ years }).toString(),
});
```

- [ ] **Step 4: Add frozen public fixtures**

Fixtures contain no private values. Include one SGD-salary/USD-equity case with two grants, one 3-year quarterly case, and one 5-year monthly case. Each fixture includes inputs plus expected event counts, source totals, reporting totals, and excluded-event counts.

- [ ] **Step 5: Run tests and commit**

Run: `npm run test:vitest -- tests/engine/schema.test.ts tests/engine/money-dates.test.ts`
Expected: PASS.

Commit: `git add package.json package-lock.json src/domain src/engine/money.ts src/engine/dates.ts tests/fixtures tests/engine && git commit -m "feat: freeze compensation domain contract"`

---

### Task 2: Build Cash Schedules with Exact Instalment Allocation

**Files:**
- Create: `src/engine/schedules/salary.ts`
- Create: `src/engine/schedules/signOn.ts`
- Create: `tests/engine/cash-schedules.test.ts`
- Create: `tests/engine/cash-properties.test.ts`

**Interfaces:**
- Consumes: `Scenario`, `Money`, `addAnchoredMonths`, `reportingInterval`.
- Produces: `buildSalaryEvents(scenario): SourceEvent[]`, `buildBonusEvents(scenario): SourceEvent[]`, `buildSignOnEvents(scenario): SourceEvent[]`.

- [ ] **Step 1: Write salary and bonus tests**

```ts
it("applies growth on the work anniversary", () => {
  const events = buildSalaryEvents(fixtureScenario);
  expect(events.find(e => e.date === "2028-01-31")?.grossSourceMinor).toBe(1_300_000n);
});

it("uses performance-year opening salary for percentage bonus", () => {
  const event = buildBonusEvents(fixtureScenario).find(e => e.date === "2028-03-15");
  expect(event?.grossSourceMinor).toBe(3_000_000n);
});
```

- [ ] **Step 2: Write instalment and property tests**

```ts
it("assigns residual minor units to the last instalment", () => {
  const events = equalInstalments(1000n, "2028-01-31", 3);
  expect(events.map(e => e.amountMinor)).toEqual([333n, 333n, 334n]);
  expect(events.map(e => e.date)).toEqual(["2028-01-31", "2028-02-29", "2028-03-31"]);
});

fc.assert(fc.property(fc.bigInt({ min: 1n, max: 10_000_000n }), fc.integer({ min: 2, max: 60 }),
  (total, count) => equalInstalments(total, "2027-01-31", count)
    .reduce((sum, event) => sum + event.amountMinor, 0n) === total));
```

Run: `npm run test:vitest -- tests/engine/cash-schedules.test.ts tests/engine/cash-properties.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement schedules**

Salary emits month-end events inside the reporting interval. Bonus identifies performance year and emits on exact payout date. Sign-on supports discriminated `lump`, `instalments`, and `custom` schedule variants; custom rows must match the arrangement total before events are emitted.

- [ ] **Step 4: Verify and commit**

Run: `npm run test:vitest -- tests/engine/cash-schedules.test.ts tests/engine/cash-properties.test.ts`
Expected: PASS.

Commit: `git add src/engine/schedules tests/engine && git commit -m "feat: add exact cash schedules"`

---

### Task 3: Build Multi-Grant Vesting and Deterministic Equity Pricing

**Files:**
- Create: `src/engine/schedules/vesting.ts`
- Create: `src/engine/valuation/equity.ts`
- Create: `tests/engine/vesting.test.ts`
- Create: `tests/engine/vesting-properties.test.ts`

**Interfaces:**
- Consumes: `EquityGrant`, `EquityAsset`, date and money primitives.
- Produces: `buildVestEvents(grant, asset): VestSourceEvent[]`, `equityPriceAt(asset, date): Decimal`.

- [ ] **Step 1: Write preset/cliff/custom tests**

```ts
it("creates 25% catch-up then quarterly events", () => {
  const events = buildVestEvents(fourYearQuarterlyWithCliff, asset);
  expect(events[0]).toMatchObject({ date: "2028-01-01", shares: 500n });
  expect(events.at(-1)?.date).toBe("2031-01-01");
  expect(events.reduce((n, e) => n + e.shares, 0n)).toBe(2000n);
});

it("rejects duplicate or descending custom dates", () => {
  expect(() => buildVestEvents(invalidCustomGrant, asset)).toThrow(/strictly increasing/i);
});
```

- [ ] **Step 2: Write allocation property tests**

Generate durations 36/48/60, cadences 1/3/12, cliffs 0–duration, and share totals 1–100,000. Assert nonnegative shares, nondecreasing cumulative units, exact final total, and no event after the contractual end.

- [ ] **Step 3: Implement cumulative-floor allocation**

```ts
const targetUnits = (total: bigint, elapsed: number, duration: number) =>
  (total * BigInt(Math.min(elapsed, duration))) / BigInt(duration);
```

Use original cadence boundaries. Catch-up emits the cumulative target at the cliff; later events emit the difference from prior cumulative units. Custom percentage mode converts percentages to cumulative units deterministically; share mode treats shares as authoritative.

- [ ] **Step 4: Implement ACT/365.2425 pricing**

```ts
export const equityPriceAt = (asset: EquityAsset, date: ISODate) =>
  new Decimal(asset.priceAtAnchor).mul(
    new Decimal(1).plus(asset.annualGrowth).pow(yearFraction(asset.anchorDate, date)),
  );
```

- [ ] **Step 5: Verify and commit**

Run: `npm run test:vitest -- tests/engine/vesting.test.ts tests/engine/vesting-properties.test.ts`
Expected: PASS.

Commit: `git add src/engine tests/engine && git commit -m "feat: add flexible multi-grant vesting"`

---

### Task 4: Assemble the Event Ledger, Tax/FX Pipeline, and Aggregates

**Files:**
- Create: `src/engine/valuation/fx.ts`
- Create: `src/engine/valuation/tax.ts`
- Create: `src/engine/ledger.ts`
- Create: `src/engine/aggregate.ts`
- Create: `src/engine/scenarios.ts`
- Create: `tests/engine/ledger.test.ts`
- Create: `tests/engine/aggregate-properties.test.ts`

**Interfaces:**
- Consumes: all source-event builders and validated `Scenario`.
- Produces: `buildLedger(scenario, overrides?): LedgerResult`, `aggregateLedger(rows, view): ProjectionSummary`, `runDeterministicScenarios(scenario): ScenarioResult[]`.

- [ ] **Step 1: Write FX orientation and tax-order tests**

```ts
it("quotes reporting units per one source unit", () => {
  expect(fxRateAt(usdSgd, "2027-01-01").toString()).toBe("1.35");
});

it("applies source tax before reporting conversion", () => {
  const row = valueSourceEvent(usdBonusEvent, fixtureScenario);
  expect(row.grossReportingMinor - row.taxReportingMinor).toBe(row.netReportingMinor);
});
```

- [ ] **Step 2: Write ledger invariants**

Assert monthly totals equal annual totals, filtered-grant totals sum to all-grant totals, gross minus tax equals net, same-currency events ignore FX, and excluded contractual events remain present in `excludedEvents` but not `rows`.

- [ ] **Step 3: Implement pair resolution and event valuation**

`resolveFxPair(source, reporting)` returns rate 1 for equality, finds one direct pair, or derives the inverse. Missing pairs return a blocking `ModelIssue`; they never return 1.

- [ ] **Step 4: Implement aggregation adapters**

Support `{ cadence: "monthly" | "annual", accumulation: "period" | "cumulative", basis: "gross" | "net", scope }`. Compute mix and all subtotals from ledger rows only.

- [ ] **Step 5: Verify fixtures and commit**

Run: `npm run test:vitest -- tests/engine/ledger.test.ts tests/engine/aggregate-properties.test.ts`
Expected: PASS and frozen fixture totals match.

Commit: `git add src/engine tests && git commit -m "feat: add auditable compensation ledger"`

---

### Task 5: Add Reproducible Monte Carlo in a Cancellable Worker

**Files:**
- Create: `src/engine/risk/prng.ts`
- Create: `src/engine/risk/correlation.ts`
- Create: `src/engine/risk/monteCarlo.ts`
- Create: `src/workers/riskProtocol.ts`
- Create: `src/workers/risk.worker.ts`
- Create: `tests/engine/risk.test.ts`
- Create: `tests/performance/risk-benchmark.test.ts`

**Interfaces:**
- Produces: `simulateRisk(snapshot, options, progress?, cancelled?): RiskResult` and serializable `RiskWorkerRequest` / `RiskWorkerResponse`.
- Consumes: scalar validated snapshot from the deterministic engine; worker does not import React or IndexedDB.

- [ ] **Step 1: Write PRNG, correlation, and zero-volatility tests**

```ts
it("is reproducible", () => {
  expect(simulateRisk(snapshot, { seed: 42, runs: 1000 }))
    .toEqual(simulateRisk(snapshot, { seed: 42, runs: 1000 }));
});

it("matches deterministic output at zero volatility", () => {
  expect(simulateRisk(zeroVolSnapshot, { seed: 42, runs: 100 }).p50)
    .toBe(zeroVolSnapshot.deterministicTotal);
});
```

- [ ] **Step 2: Implement `xoshiro128**`, Box–Muller, PSD validation, and Cholesky**

Reject nonsymmetric matrices, diagonal values other than one, values outside `[-1,1]`, and matrices with a Cholesky pivot below `-1e-12`. Clamp tiny negative numerical pivots to zero.

- [ ] **Step 3: Implement GBM and summaries**

Use `mu = Math.log1p(annualRate)`, variable ACT/365.2425 steps, Type 7 quantiles, Freedman–Diaconis bins clamped 12–40, and strict probability predicates documented in the result metadata. Keep only aggregates and histogram counts, not all paths.

- [ ] **Step 4: Implement worker protocol**

```ts
type RiskWorkerRequest =
  | { type: "run"; requestId: string; snapshot: RiskSnapshot; options: RiskOptions }
  | { type: "cancel"; requestId: string };

type RiskWorkerResponse =
  | { type: "progress"; requestId: string; completed: number; total: number }
  | { type: "complete"; requestId: string; result: RiskResult }
  | { type: "cancelled"; requestId: string }
  | { type: "error"; requestId: string; message: string };
```

- [ ] **Step 5: Benchmark and commit**

Run: `npm run test:vitest -- tests/engine/risk.test.ts tests/performance/risk-benchmark.test.ts`
Expected: deterministic tests pass; 10,000 runs × 48 months × 3 factors finish under 1,000 ms on the reference machine; cancellation is acknowledged under 100 ms.

Commit: `git add src/engine/risk src/workers tests && git commit -m "feat: add local compensation risk simulation"`

---

### Task 6: Add Versioned Persistence, Undoable Commands, and Safe Export

**Files:**
- Create: `src/persistence/database.ts`
- Create: `src/persistence/migrations.ts`
- Create: `src/persistence/importExport.ts`
- Create: `src/state/scenarioReducer.ts`
- Create: `src/state/selectors.ts`
- Create: `src/state/AppStateProvider.tsx`
- Create: `tests/persistence/persistence.test.ts`
- Create: `tests/state/scenarioReducer.test.ts`

**Interfaces:**
- Produces: `ScenarioRepository`, `scenarioReducer`, typed commands, `selectProjection`, `exportScenarioJson`, `importScenarioJson`, and CSV exporters.
- Consumes: validated domain schemas and engine results.

```ts
export interface ScenarioRepository {
  list(): Promise<Scenario[]>;
  get(id: string): Promise<Scenario | undefined>;
  save(scenario: Scenario): Promise<void>;
  remove(id: string): Promise<void>;
  saveRecoveryDraft(scenario: Scenario): Promise<void>;
  loadRecoveryDraft(id: string): Promise<Scenario | undefined>;
}
```

- [ ] **Step 1: Write save/recovery/migration tests**

Test atomic import, JSON round-trip, recovery draft isolation, unsupported-version rejection, baseline switching, and an undo command after changing a currency that generated a new FX pair.

- [ ] **Step 2: Implement IndexedDB stores**

Use database `worthflow`, version 1, with stores `scenarios`, `recoveryDrafts`, and `riskResults`. `saveScenario` writes one validated scenario transactionally; `saveRecoveryDraft` is debounced by the provider.

- [ ] **Step 3: Implement command reducer**

Commands include `setProjection`, `setSalary`, `addSignOn`, `updateSignOn`, `addGrant`, `updateGrant`, `setCurrency`, `resetOverride`, `undo`, and `redo`. A command may return a user-visible side-effect summary such as `Created EUR/SGD and recalculated 16 vest events`.

- [ ] **Step 4: Implement safe import/export**

JSON contains schema/engine versions and ISO dates. CSV prefixes formula-like cell values with a single quote and exports raw locale-independent decimals.

- [ ] **Step 5: Verify and commit**

Run: `npm run test:vitest -- tests/persistence tests/state`
Expected: PASS.

Commit: `git add src/persistence src/state tests && git commit -m "feat: add local scenario lifecycle"`

---

### Task 7: Build the Semantic App Shell and Global Controls

**Files:**
- Refactor: `src/App.tsx`
- Create: `src/components/AppShell.tsx`
- Create: `src/components/AssumptionsRail.tsx`
- Create: `src/components/GlobalViewControls.tsx`
- Create: `src/components/ModelHealth.tsx`
- Create: `src/components/SaveStatus.tsx`
- Create: `src/features/overview/Overview.tsx`
- Create: `tests/features/app-shell.test.tsx`
- Modify: `src/styles/00-foundations.css` through `src/styles/03-top-bar.css`

**Interfaces:**
- Consumes: `AppStateProvider`, selectors, model issues.
- Produces: consistent Overview / Cash / Equity / Tax & FX / Risk navigation and independent view-control state.

- [ ] **Step 1: Write semantic navigation and independence tests**

Test that tabs are keyboard operable, active state is programmatic, and switching Monthly to Annual does not change Period/Cumulative, Gross/Take-home, scenario, or scope.

- [ ] **Step 2: Implement tokens and shell**

Use CSS custom properties for forest green, restrained amber, neutral canvas, surfaces, text, borders, focus ring, radii, spacing, and motion. Inputs are at least 14 px; dense captions at least 12 px; interactive targets at least 44 px.

- [ ] **Step 3: Implement save and model-health feedback**

Expose Saved locally, Saving, Unsaved changes, and Save error. Model health groups blocking errors, warnings, stale risk results, missing FX, and excluded future events with links to their relevant tab.

- [ ] **Step 4: Verify and commit**

Run: `npm run test:vitest -- tests/features/app-shell.test.tsx`
Expected: PASS.

Commit: `git add src tests && git commit -m "feat: add semantic planner shell"`

---

### Task 8: Build Cash and Equity Workflows Against the Real Engine

**Files:**
- Create: `src/features/cash/CashAssumptions.tsx`
- Create: `src/features/cash/CashResults.tsx`
- Create: `src/features/equity/GrantSelector.tsx`
- Create: `src/features/equity/EquityAssumptions.tsx`
- Create: `src/features/equity/VestingEditor.tsx`
- Create: `src/features/equity/EquityResults.tsx`
- Create: `tests/features/cash.test.tsx`
- Create: `tests/features/equity.test.tsx`

**Interfaces:**
- Consumes: reducer commands and ledger/aggregate selectors only.
- Produces: accessible forms, inline drafts, calculated read-only fields, and detail tables.

- [ ] **Step 1: Write Cash workflow tests**

Cover annual/monthly salary basis, bonus percentage/fixed modes, per-component currency, lump sum, configurable 2–60 instalments, custom payment rows, residual disclosure, and generated FX-pair undo.

- [ ] **Step 2: Implement Cash**

Monthly instalment mode reveals start date, stepper, 3/6/12/24 presets, calculated amount, and calculated final date. Custom mode creates incomplete inline rows and blocks included exports until valid.

- [ ] **Step 3: Write Equity workflow tests**

Cover add/duplicate/delete/rename grant, shared asset, value/shares mode, 3/4/5/custom duration, annual/quarterly/monthly/custom cadence, cliff behavior, custom percentage/share modes, local override reset, and All grants filtering.

- [ ] **Step 4: Implement Equity**

The event table always exposes date, shares, percent, projected price, source/reporting value, and cumulative allocation. Long schedules expand inline. Destructive actions use named confirmation or undo, never tiny inline text alone.

- [ ] **Step 5: Verify and commit**

Run: `npm run test:vitest -- tests/features/cash.test.tsx tests/features/equity.test.tsx`
Expected: PASS.

Commit: `git add src/features tests/features && git commit -m "feat: add flexible cash and equity editors"`

---

### Task 9: Build Tax & FX, Risk, Overview, and Accessible Charts

**Files:**
- Create: `src/features/taxFx/TaxFxAssumptions.tsx`
- Create: `src/features/taxFx/TaxFxResults.tsx`
- Create: `src/features/risk/RiskAssumptions.tsx`
- Create: `src/features/risk/RiskResults.tsx`
- Create: `src/charts/AccessibleChartFrame.tsx`
- Create: `src/charts/CompensationBars.tsx`
- Create: `src/charts/EquityTimeline.tsx`
- Create: `src/charts/RiskFan.tsx`
- Create: `src/charts/DistributionHistogram.tsx`
- Create: `tests/features/tax-fx.test.tsx`
- Create: `tests/features/risk.test.tsx`
- Create: `tests/features/overview.test.tsx`

**Interfaces:**
- Consumes: selectors and worker protocol.
- Produces: deterministic/risk results, accessible tables, and visualization summaries.

- [ ] **Step 1: Write Tax & FX tests**

Verify real currency dropdowns in both source tabs and the consolidated table, pair preview/undo, direct/inverse behavior, missing-pair blocking, tax modes, and defined FX drift impact.

- [ ] **Step 2: Write Risk tests**

Verify bear/base/bull without worker use, dynamic factors for EUR equity/SGD reporting, full correlation validation, run/progress/cancel/stale states, gross/net consistency, threshold editing, and visible simulation metadata.

- [ ] **Step 3: Implement chart frames first**

`AccessibleChartFrame` requires `title`, `summary`, and `table`. SVG graphics are `aria-hidden`; the semantic summary/table is authoritative. Values appear on focus/tap and never require hover.

- [ ] **Step 4: Implement views and Overview**

Overview exposes total, cash, equity, tax, take-home, FX drift impact, component subtotals, compensation mix, and independent global controls. Tax & FX and Risk use the same design tokens and open-panel model as Cash and Equity.

- [ ] **Step 5: Verify and commit**

Run: `npm run test:vitest -- tests/features`
Expected: PASS.

Commit: `git add src/features src/charts tests/features && git commit -m "feat: add tax fx risk and overview experiences"`

---

### Task 10: Complete Responsive, Accessibility, E2E, and Performance Gates

**Files:**
- Modify: `src/styles/13-responsive.css`
- Create: `tests/e2e/core-flow.spec.ts`
- Create: `tests/e2e/import-export.spec.ts`
- Create: `tests/accessibility/axe.spec.ts`
- Create: `tests/accessibility/keyboard.spec.ts`
- Create: `tests/performance/interaction.spec.ts`
- Modify: `package.json`

**Interfaces:**
- Produces scripts `test:e2e`, `test:a11y`, and `benchmark:risk` used by candidate comparison.

- [ ] **Step 1: Add scripts**

```json
{
  "scripts": {
    "test:e2e": "playwright test tests/e2e",
    "test:a11y": "playwright test tests/accessibility",
    "benchmark:risk": "vitest run tests/performance/risk-benchmark.test.ts"
  }
}
```

- [ ] **Step 2: Implement mobile sibling layout**

At 375 and 768 px, show a persistent compact outcome summary and Assumptions/Results switcher. Tables reflow without losing headers. Do not hide the entire results canvas with CSS.

- [ ] **Step 3: Add core E2E**

Create scenario → configure SGD salary, GBP instalment sign-on, EUR grant → generate EUR/SGD and GBP/SGD → set tax → inspect monthly and annual totals → save/reload → export/import → run/cancel/rerun simulation. Assert deterministic totals survive JSON round-trip.

- [ ] **Step 4: Add accessibility and performance gates**

Run Axe at 375, 768, 1024, and 1440 px; require zero serious/critical findings. Complete the core flow using keyboard only. Assert no main-thread task over 50 ms during ordinary edits and risk cancellation acknowledged under 100 ms.

- [ ] **Step 5: Run full verification and commit**

Run:

```powershell
npm run build
npm test
npm run test:vitest
npm run test:e2e
npm run test:a11y
npm run benchmark:risk
```

Expected: all commands exit 0.

Commit: `git add . && git commit -m "test: complete compensation planner quality gates"`

---

### Task 11: Produce the Candidate Evidence Bundle

**Files:**
- Create: `docs/parallel-build/candidate-report.md`
- Create: `tests/fixtures/candidate-results.json`
- Create: `tests/performance/candidate-metrics.json`

**Interfaces:**
- Produces identical evidence artifacts for orchestrator scoring.

- [ ] **Step 1: Record provenance**

Include candidate branch, base/contract commit, final commit, Node/npm versions, dependency changes, build size, and known deviations.

- [ ] **Step 2: Record hard-gate results**

List exact deterministic fixture hashes, simulation seed/results, JSON round-trip hash, Axe findings, keyboard result, 375 px result, 10k-run duration, cancellation duration, and complete test command outputs.

- [ ] **Step 3: Capture visual evidence**

Capture Overview, Cash instalments, multi-grant Equity, Tax & FX, and Risk at 1440×900 plus Overview/Cash/Equity at 375×812. Store screenshots under `docs/parallel-build/screenshots/`.

- [ ] **Step 4: Self-score without selecting a winner**

Use the shared 40/20/20/10/5/5 rubric. Explain every deduction and list intentional design deviations.

- [ ] **Step 5: Commit**

Commit: `git add docs/parallel-build tests/fixtures/candidate-results.json tests/performance/candidate-metrics.json && git commit -m "docs: add parallel candidate evidence"`

---

## Parallel Execution Strategy

After the contract branch is committed, create three branches and worktrees from the same contract commit:

| Candidate | Branch | Worktree | Emphasis |
|---|---|---|---|
| A | `codex-candidate-correctness` | `.worktrees/candidate-correctness` | Engine-first, strongest fixture/property-test discipline, restrained UI. |
| B | `codex-candidate-experience` | `.worktrees/candidate-experience` | Interaction-first, strongest progressive disclosure and responsive product flow. |
| C | `codex-candidate-auditability` | `.worktrees/candidate-auditability` | Ledger/table-first, strongest explainability, accessibility, and worker instrumentation. |

All candidates implement the complete plan and must pass all hard gates. Emphasis changes implementation choices and sequencing, not scope or calculation semantics. Agents must not inspect another candidate’s worktree before submitting their evidence bundle.

## Orchestrator Comparison

1. Verify all branches descend from the contract commit and have no root-worktree changes.
2. Run every hard-gate command independently in every worktree.
3. Compare frozen fixture hashes and reject any candidate with deterministic drift.
4. Inspect the candidate evidence screenshots at identical viewports.
5. Score financial correctness/reproducibility 40%, maintainability 20%, UX/responsive/accessibility 20%, tests/diagnostics 10%, performance/bundle 5%, and persistence/export 5%.
6. Select the highest-scoring candidate only if all hard gates pass. If none pass, integrate no candidate and issue a concrete repair list.
7. The selected branch remains separate; do not merge into dirty `main` without explicit user direction.

---

## 2026-07-20 Correctness Candidate Contract-Closure Checkpoint

This checkpoint supersedes the older partial-status notes in the correctness candidate report. The implementation remains uncommitted until independent verification.

- [x] Preserve one canonical event ledger for visible monthly/annual, period/cumulative, gross/take-home, scoped totals, Tax & FX, deterministic bands, risk input, and every export.
- [x] Complete named-scenario compare/open/duplicate/rename/delete and immutable revision list/restore/delete, with separate debounced recovery drafts.
- [x] Complete salary, bonus performance-year/achievement, multiple sign-ons, configurable 2–60 instalments, final-residual disclosure, and custom dated payment editing.
- [x] Complete asset/grant CRUD, shares/value input and residual, 3/4/5/exact duration, annual/quarterly/monthly/custom cadence, custom percent/share rows, and all four cliff policies.
- [x] Keep partial custom-row drafts outside the canonical scenario until a valid blur commit; reject invalid date ordering without invalidating results.
- [x] Show all included vest valuations/cumulative allocation, excluded contractual events, and inspectable model/equity assumptions.
- [x] Derive required FX pairs and Monte Carlo factors from all active source currencies and equity assets; preview/generate/undo missing pairs.
- [x] Expose scoped FX drift impact against the projection-start quote, independently resettable component-tax overrides, all volatilities, threshold, seed, and symmetric correlation controls.
- [x] Complete keyboard-only edit/save/scenario/import/export/risk and scenario-revision journeys; verify Axe and 200% reflow plus widths 375/390/768/1024/1440.
- [x] Re-run deterministic evidence, structural tests, TypeScript, production build, 10,000-run benchmark, complete Vitest, and complete browser matrices.
- [ ] Independent GPT-5.6 Sol verifier recomputation and source review.
- [ ] Orchestrator cross-candidate comparison and commit authorization.

### Verifier handoff evidence

| Gate | Fresh result |
|---|---|
| `npx tsc --noEmit` | PASS |
| `npm run test:vitest` | PASS — 20 files, 131 tests |
| `npm run test:structure` | PASS |
| `npm run build` | PASS — 80 modules, 137.77 kB gzip app JS |
| `npm run evidence:generate` | PASS — fixture `dd799377…`, ledger `60ee6b39…`, 33/29/4 events |
| `npm run benchmark:risk` | PASS — 417.81 ms for 10,000 runs |
| `npm run test:browser -- --workers=1 --reporter=line` | PASS — 15/15 |
| `git diff --check` | PASS before documentation-only checkpoint edits |

The verifier should rerun these commands on the uncommitted worktree, inspect `docs/parallel-build/candidate-report.md`, confirm no `projectionFor` import has re-entered a visible/export path, and report findings before any commit is created.

### 2026-07-20 Round-three corrective sequence

- [x] Make authoritative numeric edits draft-safe; valid values commit without
  allowing empty/invalid text to overwrite canonical scenario state.
- [x] Add general bounded Undo/Redo, including edits that remove list items.
- [x] Cancel/ignore superseded recovery generations on scenario changes and
  require explicit confirmation for irreversible named-scenario/revision deletes.
- [x] Replace float custom-percent reconciliation with exact six-decimal
  micro-percent allocation in validation and vest-event generation.
- [x] Add a frozen seeded-risk tolerance fixture and accessible risk fan /
  histogram with complete data tables.
- [x] Refresh candidate evidence and provisional metrics only from valid runs.
- [ ] After the temporary elevated-execution limit clears: run the full
  functional suite twice, typecheck, structure, build, evidence, benchmark,
  serial browser/Axe journeys, standard screenshots, and `git diff --check`.
- [ ] Have an independent Sol verifier rerun the same matrix and issue the
  final full-contract/final-selection decision before any commit.

Current round-three evidence is deliberately provisional: sandbox-safe
TypeScript and `git diff --check` pass; focused elevated regressions, the
isolated benchmark (537.88 ms), and the last production build pass. The final
elevated matrix is queued rather than represented as fresh evidence.
