# Human-Readable Risk Inputs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace ACME in the built-in sample, render risk factors as human-readable labels, and prevent floating-point artifacts in assumptions inputs.

**Architecture:** Keep stable factor IDs inside the domain and persistence layers, then map them to scenario-aware display names at the UI boundary. Centralize decimal-rate-to-percentage draft formatting in the domain layer and migrate only the precisely identified legacy built-in sample.

**Tech Stack:** React 18, TypeScript, Decimal.js, Zod, Vitest, Testing Library

## Global Constraints

- The built-in asset ID is `company-equity` and its name is `Company equity`.
- Risk factor IDs remain stable internal keys and are never used as visible labels.
- Percentage drafts preserve up to six meaningful decimal places and omit unnecessary trailing zeros.
- The legacy rename applies only to baseline scenario `public-sample` with asset ID `acme` and name `ACME`.
- Financial values, correlation order, parsers, schemas, and simulation semantics remain unchanged.

---

### Task 1: Decimal-safe percentage drafts

**Files:**
- Create: `src/domain/rate.ts`
- Create: `tests/engine/rate.test.ts`
- Modify: `src/features/assumptions/AssumptionsPanel.tsx`

**Interfaces:**
- Produces: `percentToDraft(value: number): string`, converting a stored decimal rate to clean percentage text with at most six decimal places.
- Consumes: Decimal.js, already installed by the project.

- [ ] **Step 1: Write the failing helper test**

Add literal expectations:

```ts
expect(percentToDraft(0.07)).toBe("7");
expect(percentToDraft(0.075)).toBe("7.5");
expect(percentToDraft(0.333333)).toBe("33.3333");
expect(percentToDraft(0.07000000000000001)).toBe("7");
```

- [ ] **Step 2: Run the helper test and verify red**

Run: `npx vitest run tests/engine/rate.test.ts --reporter=verbose`

Expected: FAIL because `src/domain/rate.ts` does not exist.

- [ ] **Step 3: Implement the helper**

Use `new Decimal(String(value)).times(100).toDecimalPlaces(6).toString()` and export it as `percentToDraft`.

- [ ] **Step 4: Replace percentage input formatting**

Import `percentToDraft` in `AssumptionsPanel.tsx` and replace every `String(rate * 100)` value used for salary growth, target bonus, achievement, asset growth, tax, FX drift, volatility, and correlation inputs.

- [ ] **Step 5: Verify Task 1**

Run the helper test and `npx vitest run tests/features/fresh-app.test.tsx --reporter=verbose`.

- [ ] **Step 6: Commit Task 1**

```powershell
git add src/domain/rate.ts tests/engine/rate.test.ts src/features/assumptions/AssumptionsPanel.tsx
git commit -m "fix: format percentage inputs for humans"
```

### Task 2: Human-readable factor labels

**Files:**
- Modify: `src/engine/risk/factors.ts`
- Modify: `src/features/assumptions/AssumptionsPanel.tsx`
- Modify: `src/App.tsx`
- Modify: `tests/features/fresh-app.test.tsx`

**Interfaces:**
- Produces: `riskFactorDisplayName(scenario: Scenario, factorId: string): string`.
- Consumes: equity assets and internal IDs from `Scenario`.

- [ ] **Step 1: Write failing interface tests**

On the Risk tab, assert that `Equity volatility — Company equity (%)` and `FX volatility — USD/SGD (%)` are visible, correlation headings use `Equity — Company equity` and `FX — USD/SGD`, and no visible text matches `equity:`.

- [ ] **Step 2: Run the focused UI tests and verify red**

Run: `npx vitest run tests/features/fresh-app.test.tsx -t "human-readable risk factor labels" --reporter=verbose`

Expected: FAIL because the current labels expose raw factor IDs.

- [ ] **Step 3: Implement the display-name boundary**

Resolve equity IDs through `scenario.equityAssets`; return `Equity — <asset name>`. Render FX IDs as `FX — <pair>`. For unknown IDs, strip the internal prefix and render a readable `Equity — <identifier>` or `FX — <pair>` fallback.

- [ ] **Step 4: Apply labels throughout Risk UI**

Use the display helper for volatility labels, correlation row and column headings, correlation accessible labels, and the displayed simulation factor provenance in `App.tsx`. Retain raw IDs as React keys and engine inputs.

- [ ] **Step 5: Verify Task 2**

Run the focused UI test and `npx tsc --noEmit`.

- [ ] **Step 6: Commit Task 2**

```powershell
git add src/engine/risk/factors.ts src/features/assumptions/AssumptionsPanel.tsx src/App.tsx tests/features/fresh-app.test.tsx
git commit -m "fix: show human-readable risk factor labels"
```

### Task 3: Neutral default and legacy sample migration

**Files:**
- Modify: `src/domain/defaults.ts`
- Modify: `src/domain/schema.ts`
- Modify: `tests/persistence/database.test.ts`
- Modify: contract-dependent tests that use `DEFAULT_SCENARIO` factor IDs

**Interfaces:**
- Consumes: `migrateScenarioDocument(value: unknown): Scenario`.
- Produces: a neutral `DEFAULT_SCENARIO` and an exact legacy built-in sample migration.

- [ ] **Step 1: Write failing default and migration tests**

Assert that the default asset is `{ id: "company-equity", name: "Company equity" }`, grants reference `company-equity`, and risk keys use `equity:company-equity`. Construct a legacy baseline sample with the exact old identity and assert migration remaps the asset, grants, volatility key, and correlation factor ID while preserving values and matrix order. Also assert that a non-baseline scenario with ACME remains unchanged.

- [ ] **Step 2: Run focused tests and verify red**

Run: `npx vitest run tests/persistence/database.test.ts tests/features/fresh-app.test.tsx --reporter=verbose`

Expected: FAIL because defaults and migration still use ACME.

- [ ] **Step 3: Update the neutral default**

Replace `acme`/`ACME` with `company-equity`/`Company equity` in the built-in asset, both grants, the volatility key, and correlation factor IDs.

- [ ] **Step 4: Implement the exact migration**

Inside `migrateScenarioDocument`, before final schema parsing, detect only the approved legacy baseline identity. Remap the asset ID/name, matching grant `assetId` fields, the `equity:acme` volatility entry, and each matching correlation factor ID. Do not reorder the matrix or touch other scenarios.

- [ ] **Step 5: Update default-dependent assertions**

Change tests that intentionally assert built-in factor IDs to `equity:company-equity`; retain explicit non-default fixture IDs unchanged.

- [ ] **Step 6: Verify Task 3 and the whole branch**

Run: `npm test`, `npx tsc --noEmit`, `npm run build`, and `git diff --check`.

Expected: all tests, compilation, build, and diff hygiene pass.

- [ ] **Step 7: Commit Task 3**

```powershell
git add src/domain/defaults.ts src/domain/schema.ts tests
git commit -m "fix: replace ACME with neutral company equity"
```
