# Wave 1.5 independent correctness-candidate verification

**Verifier date:** 2026-07-23 (Asia/Singapore)
**Worktree:** `candidate-correctness`
**Checkpoint inspected:** complete tracked and untracked worktree delta from `54acaa2`
**Normative source:** the complete approved product contract in the sibling `parallel-build-contract` worktree, plus the shared implementation plan and candidate report
**Verdict:** **REJECT**
**Weighted score:** **62 / 100**

The candidate is not safe to select or commit. The deterministic ledger work is substantial and the browser/accessibility surface is well covered, but three P1 integrity gaps remain. In addition, the full functional suite, deterministic evidence command, and required risk benchmark do not pass on this frozen worktree.

## P1 findings (selection-blocking)

### P1-1: zero volatility does not reproduce the deterministic path

Files: `src/engine/risk/monteCarlo.ts:56`, `src/engine/risk/monteCarlo.ts:126`, `src/engine/risk/monteCarlo.ts:138`, `src/engine/risk/monteCarlo.ts:155`, `src/engine/risk/monteCarlo.ts:163`

`buildRiskSnapshot` starts from event values that already contain deterministic equity growth and event-date FX drift. The simulation then assigns those same deterministic annual rates to factors and multiplies the already-grown ledger values by another GBM state. The shortcut at line 138 only preserves ledger values when both volatility **and** annual rate are zero. This contradicts the required invariant “Zero volatility equals the deterministic path.”

Fresh executable reproduction used the default scenario, retained its ordinary 8% equity growth and 1% FX drift, and set all factor volatilities to zero:

| Measure | Canonical deterministic | Simulated P50, zero volatility |
|---|---:|---:|
| Gross minor | 105,767,230 | 110,109,365 |
| Tax minor | 21,153,445 | 22,021,870 |
| Net minor | 84,613,785 | 88,087,495 |

The existing zero-volatility test masks the defect by also forcing every `annualRate` to zero (`tests/risk/event-step-risk.test.ts:79`). This is a financial/reproducibility P1 and independently requires rejection.

### P1-2: the global grant scope is ignored by Monte Carlo risk

Files: `src/App.tsx:247`, `src/engine/risk/monteCarlo.ts:49`, `src/engine/risk/monteCarlo.ts:50`

The UI exposes `scopeGrant` as a global result control and applies it to visible deterministic selectors and exports, but `runRisk` passes the complete ledger to `buildRiskSnapshot` and only forwards basis and component. The snapshot API has no `grantId` selection at all. Selecting one grant therefore leaves simulated gross/tax/net quantiles based on all grants while the deterministic cards/bands and exports are scoped. This breaks the single-ledger/global-control contract and produces financially misleading risk output.

### P1-3: deleting a named scenario destroys all immutable revisions

Files: `src/persistence/database.ts:79`, `src/persistence/database.ts:82`, `src/persistence/database.ts:117`; executable oracle: `tests/persistence/database.test.ts:22-30`

Both the real IndexedDB repository and the memory repository cascade `removeNamed` into revision deletion. The application already provides a separate, confirmed per-revision deletion action, and the repository test explicitly requires named deletion not to mutate immutable revisions. This is unrecoverable local data loss.

Fresh full-suite and isolated-file runs both reproduce the same failure:

`expected [] to have a length of 1 but got 0` at `tests/persistence/database.test.ts:30`.

## P2 findings

### P2-1: the frozen deterministic evidence command is broken

Files: `scripts/generate-engine-evidence.mjs:12-17`, `scripts/generate-engine-evidence.mjs:36`; fixture: `tests/fixtures/non-january-multi-currency.json:27`

The fixture still expresses its fixed bonus as legacy `amount`, while the revised discriminated schema requires `amountMinor`. The generator converts salary, sign-on, and grant bigint fields but neither converts nor migrates the bonus before calling `ScenarioSchema.parse`. `npm run evidence:generate` exits 1 with a Zod error at `bonuses[0].amountMinor`. Published hashes in the candidate report were therefore not freshly reproducible from this final worktree.

### P2-2: off-cadence “one regular tranche” cliffs use the wrong tranche denominator

File: `src/engine/schedules/vesting.ts:64-65`, `src/engine/schedules/vesting.ts:84`

For an off-cadence cliff, `withCliff` includes the newly inserted cliff date as well as every original cadence date. The one-tranche policy then calculates the cliff amount as `grant.shares / withCliff.length`. The inserted cliff increases the denominator, so the amount is smaller than one original regular cadence tranche (for example, 1/17 instead of 1/16 in a four-year quarterly schedule). Current tests verify dates and total reconciliation but not the contractual first-tranche amount.

### P2-3: custom end-date catch-up allocation still uses the preset duration

File: `src/engine/schedules/vesting.ts:22-31`, `src/engine/schedules/vesting.ts:74-76`

`endDate` changes the contractual final date, but every intermediate cumulative-floor target continues to divide by `vesting.durationMonths` (36/48/60). A custom end date shorter or longer than that preset therefore uses the wrong elapsed-duration fraction and pushes an artificial residual into the final event. The exact-end test checks final date and total, not intermediate contractual allocation.

### P2-4: Overview FX drift impact ignores global component/grant scope

File: `src/App.tsx:180-185`

Tax & FX correctly computes impact from `scopedLedgerRows`, but Overview calls `fxDriftImpactMinor` with every ledger row. After selecting a component or a single grant, the other Overview amounts change while its FX impact remains all-scope. This is inconsistent global-control behavior.

### P2-5: leap-day work anniversaries are delayed to March in non-leap years

File: `src/engine/schedules/salary.ts:7`

Anniversary completion is inferred by lexically comparing `MM-DD`. For a 29 February start, a 28 February salary event in a non-leap year is treated as pre-anniversary, even though date-only anniversary arithmetic clamps the anniversary to 28 February. Growth is consequently delayed until the March payout. The contract requires growth on each work anniversary.

### P2-6: invalid scenario-name draft enters and can be exported from canonical state

Files: `src/App.tsx:284-286`, `src/persistence/importExport.ts:9`

The top-level scenario-name input writes every keystroke directly into `Scenario`, including the empty string that `ScenarioSchema` rejects. Calculation and JSON export do not validate at this boundary, so a transient invalid raw draft can be exported even though the contract requires raw input strings to stay outside the validated model. The assumptions editors mostly implement the correct draft boundary; the header does not.

## Fresh executable matrix

| Command | Fresh result |
|---|---|
| `git diff --check 54acaa2` | **PASS**, exit 0 (rerun after browser evidence) |
| `npx tsc --noEmit` | **PASS**, exit 0 |
| `npx vitest run tests/features/fresh-app.test.tsx --reporter=verbose` | **PASS**, 1 file / **23 tests**. This specifically closes the implementer’s concern: the complete file was rerun after the final assertion correction, including `keeps custom sign-on payment drafts reconciled before committing them`. |
| `npm run test:structure` | **PASS**, exit 0 after required Windows process escalation; the un-escalated nested Vite build received expected `spawn EPERM` |
| `npm run test:vitest -- --reporter=verbose` | **FAIL**, **20 passed / 1 failed files; 166 passed / 1 failed tests**. Failure is immutable revisions being deleted with the named scenario. |
| `npx vitest run tests/persistence/database.test.ts --reporter=verbose` | **FAIL**, **3 passed / 1 failed**; deterministic isolated reproduction of the same data-loss behavior |
| `npm run build` | **PASS**, 83 modules; app JS **481.01 kB / 143.49 kB gzip**; worker JS **38.83 kB**; CSS **22.95 kB / 5.28 kB gzip** |
| `npm run evidence:generate` | **FAIL**, Zod requires `bonuses[0].amountMinor`; evidence oracle cannot be regenerated |
| `npm run benchmark:risk -- --reporter=verbose` | **FAIL**, **4,325.52 ms** for 10,000 runs versus the required `<1,000 ms` |
| zero-volatility contract probe | **FAIL**, deterministic/P50 mismatch shown under P1-1 |
| `npx playwright test tests/e2e tests/accessibility --workers=1 --reporter=line` | **PASS**, **18/18** in 1.4 min |
| cancellation trials inside Playwright matrix | **PASS**, **16.40 / 10.80 / 12.60 / 7.20 / 16.70 ms**, all under 100 ms with no late completion |

## Browser, accessibility, responsive, and visual inspection

- Axe reported no serious/critical findings at 375, 768, 1024, and 1440 px.
- Keyboard-only edit/save/scenario/import/export/risk and revision journeys passed.
- The 200%-equivalent reflow check and document-overflow checks at 375/390/768/1024/1440 passed.
- At 375 px, the compact result remains visible and the Assumptions/Results switch is operable.
- Every implemented risk visualization has an adjacent semantic table, and results do not require hover.
- The three standardized screenshots were freshly captured and inspected. The overall hierarchy is calm and readable, but the 1440 px five-column Overview cards wrap several currency amounts across two or three lines, reducing finance-grade scanability. The mobile primary tabs require horizontal traversal, though the page itself does not overflow.

These successes satisfy the browser/Axe/keyboard/visible-mobile/cancellation portions of the hard-gate matrix. They do not cure the failed financial, persistence, evidence, and benchmark gates.

## Contract-weighted score

| Category | Weight | Score | Rationale |
|---|---:|---:|---|
| Financial correctness and reproducibility | 40 | **23** | Canonical deterministic ledger, exact minor-unit allocation, FX blocking, and seeded reproducibility are good. Zero-volatility double growth and ignored grant scope are P1 output-integrity failures; evidence regeneration also fails. |
| Boundary clarity and maintainability | 20 | **15** | Engine/state/persistence/worker separation is generally clear and visible/export paths avoid the legacy engine. The large central App/assumptions surfaces, incomplete raw-draft boundary, and scope divergence reduce auditability. |
| UX fidelity, responsive behavior, accessibility | 20 | **17** | All 18 browser/Axe/keyboard/reflow tests pass and accessible tables accompany risk visuals. Amount wrapping and dense/horizontally traversed surfaces merit deductions. |
| Test depth and diagnostics | 10 | **6** | Broad unit/property/browser coverage and a valuable failing persistence oracle. The final full suite is red, the zero-volatility test weakens the normative invariant, and several cliff/scope/date boundaries are absent. |
| Performance and bundle cost | 5 | **0** | Required benchmark fails at 4,325.52 ms, more than four times the budget; the recorded candidate metric is stale for this worktree. |
| Persistence and export robustness | 5 | **1** | JSON/CSV safety and named/recovery/revision APIs exist, but named deletion destroys immutable history and final deterministic evidence/export provenance cannot be regenerated. |
| **Total** | **100** | **62** | **REJECT** |

## Selection decision

**REJECT.** Any one of P1-1, P1-2, or P1-3 is sufficient to block selection. The failed full suite, evidence command, and performance hard gate independently prevent acceptance as well. Required repair order is: (1) make risk factors represent stochastic deviations without reapplying deterministic growth and add a true zero-volatility-with-growth oracle; (2) thread grant scope into risk snapshots; (3) preserve revisions unless the user explicitly deletes each revision or confirms a clearly described cascade; (4) repair and rerun evidence and the complete matrix; (5) restore the sub-second 10,000-run benchmark; then address the P2 date/vesting/scope/draft boundaries.

---

## Independent re-verification after the repair wave

**Re-verification date:** 2026-07-23 (Asia/Singapore)
**Scope:** complete current worktree delta from `54acaa2`, including all unstaged repair work
**Revised verdict:** **REJECT**
**Revised weighted score:** **89 / 100**

The repair wave closes all three earlier P1s and every previously failing executable gate. Zero volatility now returns the deterministic gross/tax/net totals even when deterministic growth is configured; the global grant scope is passed into `buildRiskSnapshot`; named-scenario deletion preserves immutable revisions; evidence generation and the 10,000-run benchmark pass; and the complete unit/browser/accessibility matrix is green. The candidate nevertheless remains selection-blocked by one normative Monte Carlo mismatch.

### Remaining P1: configured annual rates are collected but never used by the stated GBM algorithm

Files: `src/engine/risk/monteCarlo.ts:8`, `src/engine/risk/monteCarlo.ts:59`, `src/engine/risk/monteCarlo.ts:139-143`; test that codifies the divergence: `tests/risk/event-step-risk.test.ts:27-51`

The normative contract requires correlated GBM with `mu = ln(1 + annualRate)` and ACT/365.2425 variable time steps. `buildRiskSnapshot` correctly places each asset's annual growth or FX pair's annual drift in `RiskFactor.annualRate`, but `simulateRisk` then ignores that field and compiles drift as only `-0.5 * volatility^2 * dt`. The focused test explicitly expects a factor with `annualRate: 0.1` to remain at 1.0 when volatility is zero, so the suite positively locks in behavior opposite to the contract.

Avoiding the earlier double-growth defect is necessary, but silently redefining the required absolute GBM as a driftless stochastic-deviation multiplier is not a contract-compliant repair. The implementation must choose and document one authoritative valuation model: either feed ungrown event bases through the specified GBM, or revise the approved contract and frozen seeded oracle through the contract owner. A source comment cannot unilaterally override the normative formula. This is a financial-model P1 because configured growth/drift inputs and the reported `event-step correlated GBM` provenance do not describe the calculation actually performed.

### Remaining P2 findings

1. **Crash recovery does not preserve invalid in-progress raw edits.** `src/App.tsx:163-167` debounces only the last validated `Scenario`. For example, the scenario-name field keeps an invalid empty draft outside canonical state, correctly preventing invalid model/export data, but a crash reload loses that unsaved raw edit even though the contract says debounced recovery protects unsaved edits. A versioned raw-draft envelope would preserve the boundary and the recovery promise.
2. **Named deletion leaves a stale latest-revision preference.** `src/persistence/database.ts:79-84` preserves revisions, as required, but does not remove or deliberately model `latest:<scenarioId>`. The orphaned pointer is currently benign because ordinary opening lists named scenarios, but it makes the deletion lifecycle ambiguous and can target historical state if the same ID is later reintroduced.
3. **Candidate evidence hygiene includes edits to shared planning artifacts.** The worktree delta changes the approved spec only by trailing whitespace and appends candidate checkpoint/status claims to the shared implementation plan. These are not implementation requirements and should not be selected as product code without explicit orchestrator review.
4. **Bundle headroom is narrowing.** The app bundle is 481.16 kB / 143.57 kB gzip and the worker is 38.95 kB. Build and benchmark gates pass, but the already-dense central application surface has little maintainability/performance margin.

### Fresh executable matrix after repairs

| Command | Fresh result |
|---|---|
| `git diff --check 54acaa2` | **PASS**, exit 0 |
| `npx tsc --noEmit` | **PASS**, exit 0 |
| `npm test` | **PASS**, structure checks plus **21 files / 171 Vitest tests** |
| `npm run build` | **PASS**, 83 modules; app JS **481.16 kB / 143.57 kB gzip**; worker JS **38.95 kB**; CSS **22.95 kB / 5.28 kB gzip** |
| `npm run evidence:generate` | **PASS**; all frozen deterministic hashes, 33/29/4 fixture counts, and gross/tax/net totals match exactly. Seed-77/250 risk quantiles are 77,298,790 / 79,270,029 / 83,115,917 / 88,452,098 / 94,369,211; artifact SHA-256 `9abd80...e9a` |
| `npm run benchmark:risk -- --reporter=verbose` | **PASS**, **644.25 ms** for 10,000 runs, below the 1,000 ms budget |
| `npm run test:browser -- --workers=1 --reporter=line` | **PASS**, **18/18** |
| cancellation trials inside Playwright matrix | **PASS**, **11.30 / 22.20 / 13.00 / 19.30 / 20.00 ms**, all below 100 ms with no late completion |

The browser run also freshly passed Axe at 375/768/1024/1440 px, keyboard-only editing/import/export/risk and revision flows, 200%-equivalent reflow, mobile visible-result checks, recovery/reload, and standardized screenshot capture.

### Revised contract-weighted score

| Category | Weight | Score | Rationale |
|---|---:|---:|---|
| Financial correctness and reproducibility | 40 | **36** | Deterministic parity, exact allocation, grant scope, zero-volatility equality, evidence, and seeded reproducibility pass. The simulation still omits normative `mu`, making configured annual-rate semantics and provenance materially inaccurate. |
| Boundary clarity and maintainability | 20 | **17** | Engine/state/persistence/worker boundaries are generally strong; raw invalid edits are kept outside canonical state. Recovery protects only canonical state, the central application remains dense, and plan/spec edits pollute the product delta. |
| UX fidelity, responsive behavior, accessibility | 20 | **19** | All 18 browser/Axe/keyboard/reflow tests pass with visible mobile results and semantic alternatives. Dense/wrapping finance surfaces retain a small usability deduction. |
| Test depth and diagnostics | 10 | **9** | 171 unit tests and 18 browser tests all pass with strong persistence, financial, cancellation, and accessibility coverage. The GBM test asserts the non-normative annual-rate omission instead of catching it. |
| Performance and bundle cost | 5 | **4** | The 644.25 ms benchmark passes comfortably; bundle size and the 38.95 kB worker reduce headroom. |
| Persistence and export robustness | 5 | **4** | Immutable revisions, recovery, import, formula-safe exports, and evidence generation pass. Raw-edit recovery and stale latest-pointer lifecycle remain incomplete. |
| **Total** | **100** | **89** | **REJECT** |

### Revised selection decision

**REJECT.** The repair wave is technically strong and moves the candidate from 62 to 89, but the approved risk formula remains unimplemented while the product metadata claims that algorithm. Selection requires a contract-owner decision followed by TDD: implement `mu = Math.log1p(annualRate)` from an ungrown authoritative base without double-counting deterministic growth, or formally amend the contract/oracles to define the engine as deviations around pre-grown ledger values. Then rerun the full frozen matrix and regenerate the seeded risk artifact.

---

## Final independent re-verification of the GBM repair

**Final re-verification date:** 2026-07-23 (Asia/Singapore)
**Final verdict:** **ACCEPT WITH P2 FOLLOW-UP — eligible for a final-selection checkpoint**
**Final score:** **93 / 100**

The remaining P1 is repaired with coherent raw-versus-canonical semantics. The kernel now always compiles the normative drift as `(Math.log1p(annualRate) - 0.5 * volatility^2) * dt`. For raw risk events, the GBM factor applies directly: the focused one-year, zero-volatility, 10% oracle produces 110 from 100. For canonical ledger rows whose event values already include deterministic asset/FX rates, `RiskSnapshot.eventValuesIncludeDeterministicRates` makes the engine divide by a separately accumulated deterministic factor state before applying the full stochastic state. That normalization applies deterministic growth exactly once while preserving the required GBM formula.

The canonical zero-volatility invariant also remains intact: gross, tax, and net quantiles exactly equal the deterministic ledger totals with configured growth/drift. Source inspection and the focused test therefore close both the earlier double-growth defect and the later annual-rate omission without redefining the contract.

### Final executable matrix

| Command | Fresh result |
|---|---|
| `git diff --check 54acaa2` | **PASS**, exit 0. |
| `npx tsc --noEmit` | **PASS**, no diagnostics. |
| `npx vitest run tests/risk/event-step-risk.test.ts --reporter=verbose` | **PASS**, **10/10**, including raw annual-rate growth, canonical zero-volatility parity, frozen seeded tolerance, scope, and stale-correlation rejection. |
| `npm test` | **PASS**, structure checks plus **21 files / 171 tests**. |
| `npm run benchmark:risk -- --reporter=verbose` | **PASS**, independently observed **620.82 ms** for 10,000 runs. |
| `npm run evidence:generate` | **PASS**, exact common hashes/totals and seed-77/250 quantiles **77,298,790 / 79,270,029 / 83,115,917 / 88,452,098 / 94,369,211**; artifact SHA-256 `9abd80...e9a`. |
| `npm run build` | **PASS**, 83 modules; app **481.20 kB / 143.59 kB gzip**; worker **39.21 kB**; CSS **22.95 kB / 5.28 kB gzip**. |
| `npm run test:browser -- --workers=1 --reporter=line` | **PASS**, **18/18**. Axe passed at 375/768/1024/1440; keyboard completion, 200% reflow, recovery, revision lifecycle, and standardized screenshots passed. |
| cancellation trials | **PASS**, **6.30 / 14.30 / 13.20 / 13.80 / 15.60 ms**, all under 100 ms with no late completion. |

### Final residual P2s

- Crash recovery persists the last validated canonical `Scenario`, not invalid in-progress raw field strings. A versioned raw-draft envelope would make the "protects unsaved edits" promise complete without contaminating the validated model.
- Named deletion preserves immutable revisions but leaves `latest:<scenarioId>` deliberately or accidentally orphaned; the lifecycle should be made explicit before an ID is reused.
- At canonical zero volatility, final gross/tax/net use the exact deterministic shortcut while monthly fan points are calculated through floating factor normalization. Current ordinary-value evidence is stable, but an exact monthly-fan parity oracle would guard exceptional minor-unit rounding.
- Candidate-only edits to the approved plan/spec should be reviewed out of the product selection delta unless the orchestrator explicitly wants those status notes.
- Bundle and worker sizes pass all gates but reduce future headroom.

### Final weighted score

| Category | Weight | Score | Rationale |
|---|---:|---:|---|
| Financial correctness and reproducibility | 40 | **40** | Exact deterministic parity, allocation, scope, zero-volatility equality, normative raw/canonical GBM, evidence, seeded tolerance, and financial tests pass. |
| Boundary clarity and maintainability | 20 | **17** | Engine/state/persistence/worker boundaries are clear; raw recovery completeness, central density, and plan/spec delta hygiene remain follow-ups. |
| UX fidelity, responsive behavior, accessibility | 20 | **19** | All browser, Axe-width, keyboard, mobile, reflow, and visible-result gates pass. |
| Test depth and diagnostics | 10 | **9** | 171 unit and 18 browser tests pass with strong contract diagnostics; an exact canonical monthly-fan zero-volatility oracle would deepen coverage. |
| Performance and bundle cost | 5 | **4** | Benchmark/cancellation are comfortably within budget; worker/bundle size trims headroom. |
| Persistence and export robustness | 5 | **4** | Revision, recovery, import, exports, and evidence pass; raw-edit recovery and stale latest-pointer lifecycle remain. |
| **Total** | **100** | **93** | **ACCEPT WITH P2 FOLLOW-UP** |

### Final selection decision

**ACCEPT WITH P2 FOLLOW-UP.** No P1 finding or hard-gate failure remains in the complete current worktree. Correctness is eligible to become the final-selection checkpoint; retain the residual P2s in the selection record.
