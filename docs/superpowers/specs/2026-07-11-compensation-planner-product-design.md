# Worthflow Compensation Planner Product Design Contract

**Status:** Approved for parallel implementation on 2026-07-11
**Base commit:** `60d08c23b67caee3975c29c0edb33cbffcf60539`
**Full PRD:** `C:\Users\ongch\Documents\Codex\2026-07-10\sites-plugin-sites-openai-bundled-create-8\outputs\compensation-planner-prd.md`

## Product outcome

Build a local-first React application that projects compensation over a configurable 1–10 year reporting horizon from salary, annual bonus, sign-on arrangements, and multiple RSU grants. The same canonical event ledger must power monthly and annual views, stacked and cumulative views, gross and estimated take-home values, compensation mix, deterministic scenarios, and optional Monte Carlo risk analysis.

The implementation may improve the current repository architecture substantially, but it must preserve a static Vite deployment and must not use the five uncommitted files in the root `main` worktree.

## Information architecture

- Global header: scenario name, save state, reset, import, export.
- Primary views: Overview, Cash, Equity, Tax & FX, Risk.
- Desktop: assumptions rail plus outcome canvas.
- Mobile: explicit Assumptions / Results switcher with persistent compact summary; results may not disappear at narrow widths.
- Global result controls are independent: Monthly/Annual, Period/Cumulative, Gross/Take-home, scenario, and scope.

## Normative domain model

```ts
type ISODate = string;
type CurrencyCode = string;

interface Scenario {
  schemaVersion: 1;
  id: string;
  name: string;
  baseline: boolean;
  projection: ProjectionConfig;
  salary: SalaryConfig;
  bonuses: BonusConfig[];
  signOns: SignOnConfig[];
  equityAssets: EquityAsset[];
  grants: EquityGrant[];
  tax: TaxConfig;
  fxPairs: FxPairConfig[];
  risk: RiskConfig;
}

interface ProjectionConfig {
  startDate: ISODate;
  horizonYears: number;
  reportingCurrency: CurrencyCode;
  displayPrecision: "unit" | "ten" | "hundred" | "compact";
}

interface EventLedgerRow {
  eventId: string;
  date: ISODate;
  monthKey: string;
  projectionYear: number;
  component: "salary" | "bonus" | "signOn" | "equity";
  sourceId: string;
  grantId?: string;
  grossSourceMinor: bigint;
  sourceCurrency: CurrencyCode;
  fxPair?: string;
  fxRate: string;
  grossReportingMinor: bigint;
  taxRate: string;
  taxReportingMinor: bigint;
  netReportingMinor: bigint;
}
```

Form drafts keep raw input strings outside the validated `Scenario`. Financial formulas must not live in React components or view selectors.

## Cash contract

- Salary accepts annual or monthly input, source currency, and annual growth.
- Salary growth applies on each work anniversary. Salary events occur on each calendar month’s final day.
- Bonus is percentage-of-salary or fixed amount, identifies performance year and payout date, and supports per-year achievement.
- Percentage bonus uses annualized salary effective on the first day of its performance year.
- Sign-ons are an array, each with source currency and one schedule:
  - lump sum with one date;
  - equal monthly instalments with start date and integer count 2–60;
  - custom dated payments.
- Instalments operate in integer source minor units. First `N−1` payments receive `floor(total/N)`; the last receives the residual and is labeled when adjusted.
- Custom payment rows must be ordered and sum exactly to the sign-on total.

## Equity contract

- Multiple grants are supported. Grants reference an equity asset so refresh grants for the same security share price-growth and simulated-price factors.
- Grant input mode is total value or shares. Whole-share grant-value mode rounds shares down and exposes the unused residual.
- Vesting duration is 3 years, 4 years, 5 years, or exact custom end date.
- Vesting cadence is annual, quarterly, monthly, or custom, independent of duration.
- Preset dates use calendar-month addition anchored to the grant-day and clamp invalid dates to month-end.
- Whole-share allocations use cumulative-floor allocation; the last event receives the residual.
- Optional cliff supports catch-up accrued, redistribute remaining, one regular tranche, or custom cliff amount.
- Custom cadence uses exactly one authoritative input mode: percentages or shares. Dates are strictly increasing and later than grant date. Total is exactly 100% or the grant-unit count.
- Every vest row shows date, shares, percent, projected price, source value, reporting value, and cumulative allocation.
- Contractual vesting may extend beyond the half-open reporting interval `[start, addYears(start, horizon))`; excluded events remain visible and are not counted in reporting totals.

## Tax and FX contract

- Tax mode is one blended effective rate or rates for salary, bonus, sign-on, and equity.
- Tax is applied at each payout or vest.
- Currency is selectable for salary, fixed bonus, every sign-on, and every grant.
- Required source/reporting FX pairs are derived from active currencies. Same-currency events use rate 1; missing pairs block affected totals.
- Quotes are reporting-currency units per one source-currency unit. Inverse pairs are derived and never separately editable.
- Deterministic rates use `FX(d) = FX0 × (1 + drift)^ACT/365.2425(anchor,d)` with drift greater than −100%.
- Event valuation order is gross source → source tax → source net → event-date FX on gross and tax → rounded reporting gross/tax → reporting net.
- FX drift impact compares event-date conversion with conversion at the projection-start rate; never compare with a fictitious 1:1 baseline.

## Risk contract

- Bear/Base/Bull scenarios are deterministic and always usable.
- Dynamic Monte Carlo factors consist of one factor per equity asset and one factor per required FX pair.
- Use versioned xoshiro128** random generation, Box–Muller normal shocks, correlated through a symmetric positive-semidefinite matrix with diagonal one.
- Use correlated GBM with `mu = ln(1 + annualRate)` and ACT/365.2425 variable time steps over monthly anchors plus exact event dates.
- Default is 10,000 runs; simulation runs in a module worker, supports cancellation/progress, and never blocks input.
- Type 7 quantiles produce P10/P25/P50/P75/P90. Histogram bins use Freedman–Diaconis clamped to 12–40.
- Editing assumptions marks prior simulation output stale.
- Risk results honor the selected Gross/Take-home basis; taxes remain deterministic pathwise.

## Persistence and export

- IndexedDB stores named scenarios and versioned recovery drafts. Small display preferences may use localStorage.
- Explicit Save creates a named revision; debounced recovery protects unsaved edits. UI exposes Saving, Saved locally, Unsaved, and Save error.
- JSON round-trip preserves the full versioned model. Import validates and migrates atomically.
- CSV exports monthly ledger, annual totals, vest events, and risk summary; values that could trigger spreadsheet formulas are neutralized.
- No network transmission or analytics in release one.

## Interaction and accessibility contract

- Use semantic buttons, inputs, fieldsets, radios, tabs, and tables.
- Editable and calculated values have visibly different treatments.
- Cross-tab side effects such as generated FX pairs are previewed and undoable.
- Global defaults and local overrides are visually distinguished; one override can reset independently.
- Every chart has an adjacent accessible table or summary. Values never depend on hover or color alone.
- WCAG 2.2 AA contrast, visible focus, keyboard completion, reduced motion, and 200% zoom are release gates.
- Touch targets are at least 44 px. Verify widths 375, 768, 1024, and 1440 px.

## Visual direction

Use the approved calm, finance-grade design: light neutral canvas, white input surfaces, forest-green primary, restrained amber secondary series, editorial serif outcome headings, sans-serif controls and tables, open panels rather than nested card grids. The HTML mockups in the full PRD establish hierarchy only; their numerical examples are not calculation fixtures and their microtype must be increased for production accessibility.

## Required invariants

- Instalment source amounts sum exactly to the entered total.
- Vest units are nonnegative, cumulative allocation never decreases, and the final event equals the grant total.
- Monthly totals equal annual totals; period and cumulative views end at the same horizon value.
- Gross minus tax equals net after documented rounding.
- Same-currency events are invariant to FX assumptions.
- All-grant totals equal the sum of individual grant contributions after event-level valuation.
- Duplicate grants double contributions without changing their shared asset price path.
- Same seed, engine version, and inputs produce identical simulation summaries.
- Zero volatility equals the deterministic path.
- Quantiles are ordered and probabilities remain in `[0,1]`.

## Parallel candidate comparison

Hard gates: deterministic fixture parity, seeded simulation tolerance, save/reload and JSON round-trip, no serious/critical Axe findings, keyboard completion, visible results at 375 px, and a cancellable 10,000-run simulation.

Weighted scoring:

- Financial correctness and reproducibility: 40%.
- Boundary clarity and maintainability: 20%.
- UX fidelity, responsive behavior, and accessibility: 20%.
- Test depth and diagnostics: 10%.
- Performance and bundle cost: 5%.
- Persistence and export robustness: 5%.

The best candidate is the one with the clearest auditable event pipeline and contract-fixture parity, not necessarily the most visually ornate candidate.
