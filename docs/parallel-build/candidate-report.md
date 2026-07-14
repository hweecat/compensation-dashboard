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

## Fresh unrestricted verification (2026-07-14)

| Command | Result |
|---|---|
| `npm run test:vitest` | PASS: 18 functional files, 112 tests, 0 failures; performance is intentionally isolated from parallel Vitest contention. |
| `npx tsc --noEmit` | PASS, exit 0. |
| `npm run build` | PASS: 74 modules; app JS 432.17 kB / 131.25 kB gzip; worker JS 5.93 kB; CSS 21.90 kB / 5.08 kB gzip. |
| `npm run evidence:generate` | PASS; evidence below generated from engine execution. |
| `npm test` | PASS: retained structural checks plus 112 current functional tests. |
| `npm run benchmark:risk` | PASS in isolation: 10,000 canonical event-step runs in 642.64 ms. |
| `npm run test:browser` | PASS: 12/12; overflow at 375/390/768/1024/1440, arrow-key tabs, Axe at 375/768/1024/1440, named save/recovery, and five cancellation trials. |
| `git diff --check` | PASS, exit 0. |
| tracked export boundary | PASS: `src/App.tsx`, `src/persistence/plannerExports.ts`, and tracked `src/export.ts` contain no `projectionFor`; `src/export.ts` is a download-only canonical shim. |

The dedicated performance command is isolated because wall-clock assertions are invalid under the parallel functional worker pool. On the reset runtime an initial isolated run exposed a real 1.25 s regression; precompiling factor indexes and step coefficients reduced the same required benchmark to 642.64 ms without changing deterministic evidence or seeded behavior.

## Third-wave risk checkpoint

- Risk snapshots now derive deterministic gross, tax, and net plus sorted dynamic `equity:<asset>` and `fx:<pair>` factors from the canonical ledger.
- The seeded engine advances correlated GBM states between actual event dates, validates correlation positive semidefiniteness, applies event-specific factor paths to gross and tax, derives pathwise net, and returns Type 7 gross/tax/net quantiles, threshold probability, histogram bins, and provenance metadata.
- The Risk UI now executes 10,000 runs in a Vite module worker, displays progress, exposes cancellation, and invalidates stale results on assumption changes. The scheduler bounds work by run count and 20 ms chunks and has deterministic cancellation diagnostics coverage.
- Risk CSV output contains gross/tax/net results, threshold probability, histogram bounds, factor IDs, algorithm, seed, run count, quantile method, and engine version.

## Fourth-wave hard-gate closure

- Five consecutive real-browser cancellation trials under the full four-worker browser load measure main-thread cancel `postMessage` to the matching worker `cancelled` response at `65.40`, `36.20`, `17.10`, `26.70`, and `13.20` ms. Each trial also waits 125 ms after acknowledgement and asserts that no late completion appears.
- Risk snapshots and primary quantiles now honor the independently selected gross/take-home basis and component scope. Results use a 12–40-bin Freedman–Diaconis histogram and the UI exposes the auditable risk CSV download.
- IndexedDB version 2 stores named scenarios, immutable revisions, separate recovery drafts, and preferences. Unit evidence covers revision/recovery separation, schema-zero migration, and future-version rejection; Playwright proves named save/reload and explicit recovery restoration.
- Tax & FX gross, tax, and take-home now derive from the same scope-filtered canonical rows and selector tax subtotal.
- The tracked `src/export.ts` legacy financial path is neutralized to a download-only re-export from canonical `plannerExports`; source-boundary tests prevent `projectionFor` re-entry.

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

## Sandboxed verification

| Command | Result |
|---|---|
| `npx tsc --noEmit` | PASS, exit 0. |
| `npm run build` | BLOCKED before project compilation: esbuild child process `spawn EPERM`. |
| `npm run test:vitest -- tests/features tests/engine` | BLOCKED before config loading: esbuild child process `spawn EPERM`. |

This is an environment distinction: the same build and tests pass unrestricted.

## Remaining contract deviations

- The IndexedDB repository supports named records and immutable revisions, but the UI currently operates on the active named scenario rather than exposing a complete multi-scenario list/version-history manager.
- Legacy calculation helpers remain in `src/model.ts` for retained historical unit coverage, but the fresh app and every tracked export boundary are prevented from importing the legacy financial path.
- The engine supports multiple grants and custom vesting validation, but this fresh UI currently edits only the first grant/asset and does not expose add/duplicate/delete, grant value input, custom end date, custom rows, or all cliff policies.
- Bonus performance-year and per-year achievement now exist in the canonical schema and engine, but editing them is not exposed in the fresh UI.
- Browser evidence now covers document overflow, compact-result visibility, arrow-key primary-tab navigation, and Axe serious/critical gates. It does not yet cover complete keyboard-only editing/import/export workflows or a screenshot bundle.
- No candidate commit exists yet.

## Hard-gate status

| Gate | Status |
|---|---|
| Deterministic fixture parity | PASS for the published correctness fixture; independent verifier recomputation pending. |
| Single visible/exported ledger path | PASS by source boundary and canonical selector/export tests. |
| Seeded simulation tolerance | PASS for deterministic seed identity, dynamic event-step factors, PSD validation, zero-volatility gross/tax/net parity, basis/scope selection, quantile ordering, and adaptive histogram reconciliation. Independent cross-candidate comparison remains pending. |
| Save/reload and JSON round-trip | PASS: versioned JSON round-trip, IndexedDB named reload, immutable revisions, separate recovery drafts, migrations, and browser recovery restoration. |
| Axe serious/critical | PASS at 375/768/1024/1440 px. |
| Keyboard completion | PARTIAL: arrow-key tab navigation and focusable horizontal result scrolling pass; complete keyboard-only workflow is not yet covered. |
| Results visible at 375 px | PASS: no document overflow and compact result remains visible across both mobile surfaces. |
| Cancellable 10,000 runs | PASS: module-worker UI, cooperative progress/cancellation, isolated 642.64 ms benchmark, five browser acknowledgements under 100 ms under the full four-worker browser load, and no late completion. |

This is a verified fresh canonical-ledger rebuild checkpoint, not a full design-contract release candidate.
