# Correctness Candidate Report

## Provenance

- Branch: `codex-candidate-correctness`
- Contract/base: `60d08c23b67caee3975c29c0edb33cbffcf60539`
- Starting HEAD: `535597480aaf4d32676580e7ff3e6438d5dd927b`
- Runtime: Node `v24.18.0`, npm `11.16.0`
- Final commit: pending; this worktree is intentionally uncommitted for orchestrator verification.

## Architectural result

The fresh React surface now consumes `buildPlannerView`, `buildDeterministicScenarioBands`, and `buildExportBundle`. `src/App.tsx` and the planner export path contain no `projectionFor` reference. Visible summaries, monthly/annual tables, compensation mix subtotals, vest rows, Tax & FX totals, deterministic scenario totals, seeded risk input, and JSON/CSV/HTML exports originate from the canonical event ledger and its aggregate selectors.

The app exposes Overview, Cash, Equity, Tax & FX, and Risk; independent Monthly/Annual, Row-based/Cumulative, Gross/Take-home, and scope controls; editable salary basis/currency, sign-on instalment count, equity currency/growth, 3/4/5-year duration, annual/quarterly/monthly vesting, tax, FX, and seed; persistent compact mobile results; IndexedDB named save/recovery and JSON import; and event-derived accessible tables.

## Final implementation verification (2026-07-20)

| Command | Result |
|---|---|
| `npm run test:vitest` | PASS: 20 files, 134 tests, 0 failures; performance is intentionally isolated from the functional suite. |
| `npx tsc --noEmit` | PASS, exit 0. |
| `npm run test:structure` | PASS, exit 0. |
| `npm run build` | PASS: 80 modules; app JS 461.99 kB / 138.16 kB gzip; worker JS 5.93 kB; CSS 22.67 kB / 5.21 kB gzip. |
| `npm run evidence:generate` | PASS; evidence below generated from engine execution. |
| `npm run benchmark:risk` | PASS in isolation: 10,000 canonical event-step runs in 561.56 ms. |
| `npx playwright test tests/e2e tests/accessibility --workers=1 --reporter=line` | PASS: 15/15; complete keyboard edit/save/scenario/import/export/risk journey (including risk CSV download), revision lifecycle, recovery, 200% reflow, overflow at 375/390/768/1024/1440, arrow-key tabs, Axe at 375/768/1024/1440, and five cancellation trials after nonzero progress. |
| `git diff --check` | PASS, exit 0. |
| tracked export boundary | PASS: `src/App.tsx`, `src/persistence/plannerExports.ts`, and tracked `src/export.ts` contain no `projectionFor`; `src/export.ts` is a download-only canonical shim. |

The dedicated performance command is isolated because wall-clock assertions are invalid under the parallel functional worker pool. Precompiled factor indexes and step coefficients keep the final required benchmark at 561.56 ms without changing deterministic evidence or seeded behavior.

## Third-wave risk checkpoint

- Risk snapshots now derive deterministic gross, tax, and net plus sorted dynamic `equity:<asset>` and `fx:<pair>` factors from the canonical ledger.
- The seeded engine advances correlated GBM states between actual event dates, validates correlation positive semidefiniteness, applies event-specific factor paths to gross and tax, derives pathwise net, and returns Type 7 gross/tax/net quantiles, threshold probability, histogram bins, and provenance metadata.
- The Risk UI now executes 10,000 runs in a Vite module worker, displays progress, exposes cancellation, and invalidates stale results on assumption changes. The scheduler bounds work by run count and 20 ms chunks and has deterministic cancellation diagnostics coverage.
- Risk CSV output contains gross/tax/net results, threshold probability, histogram bounds, factor IDs, algorithm, seed, run count, quantile method, and engine version.

## Fourth-wave hard-gate closure

- Five consecutive real-browser cancellation trials after nonzero progress measure main-thread cancel `postMessage` to the matching worker `cancelled` response at `3.30`, `9.20`, `9.30`, `4.00`, and `11.30` ms. Each trial also waits 125 ms after acknowledgement and asserts that no late completion appears.
- Risk snapshots and primary quantiles now honor the independently selected gross/take-home basis and component scope. Results use a 12–40-bin Freedman–Diaconis histogram and the UI exposes the auditable risk CSV download.
- IndexedDB version 2 stores named scenarios, immutable revisions, separate recovery drafts, and preferences. Unit evidence covers revision/recovery separation, schema-zero migration, and future-version rejection; Playwright proves named save/reload and explicit recovery restoration.
- Tax & FX gross, tax, and take-home now derive from the same scope-filtered canonical rows and selector tax subtotal.
- The tracked `src/export.ts` legacy financial path is neutralized to a download-only re-export from canonical `plannerExports`; source-boundary tests prevent `projectionFor` re-entry.

## Full product-contract closure

- The scenario manager compares every named scenario from canonical annual selectors; it opens, duplicates, renames, and deletes scenarios and lists, restores, and individually deletes immutable revisions. Repository injection keeps the lifecycle independently testable.
- Cash assumptions expose every bonus and sign-on, including performance year, achievement, fixed/percentage modes, source currency, lump sum, configurable 2–60 monthly instalments, and ordered custom rows. The calculated final instalment is visibly labelled when it receives a residual minor unit.
- Equity assumptions expose asset and grant CRUD, shared assets, persisted value/shares entry with original value and whole-share residual, 3/4/5-year or exact end dates, annual/quarterly/monthly/custom cadence, authoritative percent/share custom rows using exact bigint shares, and catch-up/redistribute/one-tranche/custom cliffs. Validated blur commits prevent partial form drafts from entering the canonical `Scenario`.
- Included vest rows expose date, grant, shares, percent, projected price, source/reporting value, and per-grant cumulative allocation. Excluded contractual events and their source assumptions remain inspectable outside the reporting horizon.
- Required FX pairs and risk factors derive from all active source currencies and equity assets. Missing-pair generation is previewed and undoable. The Tax & FX result exposes event-date versus projection-start FX drift impact; component tax overrides are visibly distinguished and independently resettable.
- Risk assumptions expose every dynamic volatility, threshold, seed, and symmetric correlation entry. Scenario edits invalidate prior simulation output; the worker remains progress-aware and cancellable.
- Recovery writes are debounced, expose Unsaved/Saving/Recovery saved/Error states, and are kept separate from explicit named revisions. Explicit Save waits for an in-flight recovery write before clearing it.
- The keyboard-only browser test edits cash/equity/tax assumptions, saves and duplicates a scenario, downloads all four report formats plus JSON, imports JSON, runs/cancels risk, and performs an Axe serious/critical check. A second browser test covers revision rename/delete/restore/duplicate/delete without pointer input.

## Deterministic evidence

- Fixture: `non-january-multi-currency`
- Events: 33 total, 29 included, 4 excluded
- Ledger SHA-256: `60ee6b39d46c52cfd60d013032aa192a9554d848965227c08be1712cbb21763d`
- Fixture SHA-256: `dd79937786ce80198949c7f5fb8637797ffc4da311648d02168878e9fdd33e0e`
- Salary gross/tax/net: `2030002` / `365402` / `1664600`
- Bonus gross/tax/net: `17043637` / `3408727` / `13634910`
- Sign-on gross/tax/net: `120001` / `18000` / `102001`
- Equity gross/tax/net: `2945691` / `648052` / `2297639`
- Aggregate gross/tax/net: `22139331` / `4440181` / `17699150`

The Wave 1.3 artifact records contract version, candidate identity, fixture and ledger hashes, engine provenance, generation provenance, event counts, per-component totals, and aggregate gross/tax/net. The deterministic suite covers exact anniversary boundaries, annual-salary residual allocation, final-share residual allocation for percentage vesting, invalid custom vesting, explicit performance-year bonus payout and achievement, cumulative component reconciliation, monthly/annual equality, missing FX blocking, and JSON/CSV safety.

## Execution-environment note

| Command | Result |
|---|---|
| `npx tsc --noEmit` | PASS in the workspace sandbox, exit 0. |
| Commands that spawn `esbuild` or Chromium | PASS with the required workspace escalation; un-escalated attempts receive the expected Windows child-process `spawn EPERM`. |

This is a documented process-permission distinction rather than a product failure. No network access is required by the app or its test suite.

## Remaining evidence and integration notes

- Legacy calculation helpers remain in `src/model.ts` for retained historical unit coverage, but the fresh app and every tracked export boundary are prevented from importing the legacy financial path.
- This report records repeatable calculation, browser, accessibility, persistence, and performance evidence. A standardized cross-candidate screenshot bundle is still an orchestrator evidence task rather than a calculation or interaction hard gate.
- No candidate commit exists yet.
- Independent verifier recomputation and cross-candidate scoring remain pending.

## Hard-gate status

| Gate | Status |
|---|---|
| Deterministic fixture parity | PASS for the published correctness fixture; independent verifier recomputation pending. |
| Single visible/exported ledger path | PASS by source boundary and canonical selector/export tests. |
| Seeded simulation tolerance | PASS for deterministic seed identity, dynamic event-step factors, PSD validation, zero-volatility gross/tax/net parity, basis/scope selection, quantile ordering, and adaptive histogram reconciliation. Independent cross-candidate comparison remains pending. |
| Save/reload and JSON round-trip | PASS: versioned JSON round-trip, IndexedDB named reload, immutable revisions, separate recovery drafts, migrations, and browser recovery restoration. |
| Axe serious/critical | PASS at 375/768/1024/1440 px. |
| Keyboard completion | PASS: the browser journey completes edit, save, scenario duplication, all exports, JSON import, and risk run/cancel without pointer input; revision lifecycle is separately keyboard-covered. |
| Results visible at 375 px | PASS: no document overflow and compact result remains visible across both mobile surfaces. |
| Cancellable 10,000 runs | PASS: module-worker UI, cooperative progress/cancellation, isolated 561.56 ms benchmark, five browser acknowledgements under 100 ms after nonzero progress, and no late completion. |

## Self-score for orchestrator review

| Category | Score | Rationale |
|---|---:|---|
| Financial correctness and reproducibility | 40 / 40 | Canonical ledger, frozen hashes, exact unit allocation, property tests, event-step seeded risk, and explicit excluded-event accounting. |
| Boundary clarity and maintainability | 18 / 20 | Engine/persistence/worker boundaries are explicit and legacy imports are guarded; the broad assumptions panel is intentionally centralized and could be decomposed further. |
| UX fidelity, responsive behavior, accessibility | 19 / 20 | Complete contract editors, audit tables, keyboard flow, Axe gates, 200% reflow, and all target widths pass; the correctness candidate favors tables over ornamental charts. |
| Test depth and diagnostics | 10 / 10 | 134 functional/property tests plus 15 browser gates, deterministic evidence, cancellation diagnostics, and a separate benchmark. |
| Performance and bundle cost | 5 / 5 | 561.56 ms for 10,000 runs and 138.16 kB gzip app JS. |
| Persistence and export robustness | 5 / 5 | Named/revision/recovery lifecycle, atomic import validation, formula-neutralized CSV, and keyboard-tested downloads/import. |
| **Total** | **97 / 100** | Self-score only; the orchestrator and independent verifier decide the comparable score. |

This is the full design-contract implementation candidate. It remains intentionally uncommitted until the independent verifier reports and the orchestrator authorizes a commit.

## 2026-07-20 round-two verifier repair addendum (authoritative)

The earlier self-score and full-contract wording above are superseded by independent-verifier findings until the complete matrix is freshly rerun. This worktree is **not final-selection ready**.

- Added actual calendar-date validation, zero-pivot positive-semidefinite rejection, ordered/exact custom sign-on validation, and direct/inverse FX-pair conflict rejection.
- Added canonical value-grant repricing when the referenced asset price changes, fully escaped user-provided HTML report text, expanded risk CSV provenance/quantiles/histogram rows, and retained completed risk output with a visible stale marker.
- Fresh focused verification: schema 10/10; scenario commands 3/3; canonical export 4/4; build succeeds; deterministic evidence remains `33/29/4`, fixture hash `dd799377…`, ledger hash `60ee6b39…`; isolated risk benchmark 685.28 ms; five browser cancellation acknowledgements 14.70/6.80/2.30/1.50/2.30 ms.
- The full Vitest/App matrix must still be rerun: after explicit React cleanup was added, verbose execution advances beyond the previously immediate stall but the current tool session has not produced its final summary. Screenshots, common seeded-risk tolerance fixture, comprehensive raw-draft handling, undo/redo, destructive-action confirmation/undo, and the contract-required accessible visual/table implementations remain open verifier work.

## 2026-07-20 round-three repair addendum (authoritative)

This addendum supersedes the preceding list of round-two open items only where a
specific result is recorded below. The candidate is still **not final-selection
ready** until an independent verifier completes the full elevated matrix.

- Added a raw-draft numeric input boundary for projection, cash, equity, tax,
  FX, risk, cliff and custom-payment numbers. Invalid or incomplete text stays
  in the field and cannot replace the authoritative `Scenario`; valid values
  commit immediately for responsive recalculation. A RED/GREEN App regression
  proves that clearing salary does not replace its canonical amount.
- Added general in-memory Undo/Redo for scenario edits (bounded to 100
  snapshots). This includes destructive list edits because they go through the
  same scenario command boundary. A RED/GREEN regression proves name-edit
  undo/redo.
- Added an accessible selected-basis quantile fan and histogram, each with a
  semantic adjacent table. The visual regression proves the histogram and its
  data table are exposed after a completed risk result.
- Added `tests/fixtures/seeded-risk-tolerance.json`, with seed 77, 250 runs,
  frozen primary quantiles, and a one-minor-unit tolerance. The event-step risk
  test reads that artifact; generated candidate evidence includes the same
  seed/runs/quantile provenance.
- Replaced binary-float percentage reconciliation with six-decimal fixed-point
  micro-percent units in both schema validation and vest allocation. Regression
  cases cover 1,000 × 0.1% and a three-tranche 33.333333/33.333333/33.333334
  split, preserving exact share totals.
- Re-audited scenario switching: opening another scenario now cancels the old
  recovery generation before its asynchronous lookup and ignores superseded
  lookup completions, preventing an old debounce/status from winning a switch.
  Named-scenario and immutable-revision deletion now require an explicit,
  keyboard-operable confirmation; in-memory model-item deletions remain
  reversible through global Undo.
- Current valid executions: sandbox-safe `npx tsc --noEmit` PASS; elevated
  production build PASS (81 modules, 468.63 kB JS / 140.35 kB gzip); focused
  raw-draft, Undo/Redo, risk-visual, and seeded-artifact Vitest regressions
  PASS; isolated 10,000-run benchmark PASS in 537.88 ms.
- The Windows sandbox still prevents Vite/esbuild/Chromium (`spawn EPERM`). A
  final elevated full Vitest, evidence, serial browser/Axe, screenshot, and
  diff matrix is queued, but it could not be rerun after these changes because
  the required elevation was rejected by the current Codex usage limit. No
  full-suite, browser, visual, or screenshot claim in this report should be
  read as fresh round-three evidence.

## 2026-07-21 round-four implementer evidence (authoritative)

This update supersedes the queued-matrix wording above. It is implementer
evidence only: an independent Sol verifier must still inspect this one frozen,
uncommitted diff before the candidate becomes final-selection ready.

- Fixed bonuses now apply their achievement multiplier. Percentage-of-salary
  bonuses are explicitly sourced in salary currency; fixed bonuses retain their
  selected source currency. Focused RED/GREEN evidence is in
  `tests/engine/cash-schedules.test.ts`.
- Preset cliffs now create a vest event on the actual cliff date even when it
  is off cadence. A cliff at or after the contractual end vests the complete
  remaining grant at the end rather than losing shares. Exact cliff tests are
  in `tests/engine/vesting-ledger.test.ts`.
- The custom percent editor balances six-decimal fixed-point micro-percent
  units. Zero, over-precision, and unbalanced drafts revert on blur and cannot
  enter `Scenario`; the UI regression covers `33.333333/66.666667` and zero.
- Missing FX now prevents all projection exports and risk execution. The
  canonical bundle throws on incomplete ledgers, while the App disables every
  export and simulation action with a visible model issue.
- Correlation matrices now persist factor IDs. Stale factor mappings block risk
  rather than silently becoming identity; the Risk tab renders a keyboard
  operable migration preview that preserves known factor correlations and asks
  the user to apply the reviewed mapping.
- The seeded risk timeline has real calendar-month anchors plus exact event
  dates. This changes stochastic quantiles, so the tolerance fixture was
  regenerated exactly (seed 77, 250 runs: 77298790 / 79270029 / 83115917 /
  88452098 / 94369211, one-minor-unit tolerance), not widened.
- Overview now contains cash compensation, equity value, estimated tax,
  take-home outcome, and FX drift impact alongside the component mix.

Fresh elevated verification on this diff:

| Command | Result |
|---|---|
| `npm run test:vitest` | PASS: 20 files, 159 tests. |
| `npx tsc --noEmit` | PASS. |
| `npm run test:structure` | PASS. |
| `npm run build` | PASS: 82 modules; app 473.72 kB / 141.71 kB gzip; worker 6.32 kB. |
| `npm run evidence:generate` | PASS: deterministic evidence remains 33 total / 29 included / 4 excluded, fixture hash `dd799377…`, ledger hash `60ee6b39…`. |
| `npm run benchmark:risk` | PASS: 10,000 event-step runs in 670.89 ms (under 1,000 ms). |
| `npx playwright test tests/e2e tests/accessibility --workers=1 --reporter=line` | PASS: 15/15; four-width Axe, reflow/overflow, complete keyboard flow, persistence/revisions, and five post-progress cancellations at 10.70/2.30/14.50/14.10/10.90 ms. |
| `npx playwright test tests/e2e/standardized-screenshots.spec.ts --workers=1 --reporter=line` | PASS: 3/3 desktop Overview, mobile Equity, and completed Risk screenshots. |
| `git diff --check` | PASS after the final report, metrics, and screenshot-test edits. |

Screenshot evidence is stored under `docs/parallel-build/screenshots/`.
