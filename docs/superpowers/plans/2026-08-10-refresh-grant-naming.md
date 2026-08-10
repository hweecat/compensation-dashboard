# Refresh Grant Naming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standardize every grant added after the initial grant as the lowest available `Refresh grant N` name.

**Architecture:** Put the name-selection rule in a small pure domain helper so its gap-filling and custom-name behavior can be tested without rendering React. The assumptions panel consumes that helper when adding a grant, while the built-in scenario adopts `Refresh grant 1`; persisted scenarios are not migrated or renamed.

**Tech Stack:** React 18, TypeScript, Vitest, Testing Library, Vite

## Global Constraints

- The built-in sample grants are named `Initial grant` and `Refresh grant 1`.
- **Add grant** uses the lowest available positive number whose exact `Refresh grant N` name is not already present.
- User-edited names and persisted scenarios remain unchanged.
- Deleting a grant never renumbers remaining grants.
- Duplicating a grant retains the existing `<source name> copy` behavior.
- Grant IDs remain independent from display names.

---

### Task 1: Refresh Grant Name Selection

**Files:**
- Create: `src/domain/grantNames.ts`
- Create: `tests/domain/grantNames.test.ts`

**Interfaces:**
- Consumes: `readonly string[]` containing current grant display names.
- Produces: `nextRefreshGrantName(names: readonly string[]): string`.

- [ ] **Step 1: Write the failing unit test**

```ts
import { describe, expect, it } from "vitest";
import { nextRefreshGrantName } from "../../src/domain/grantNames";

describe("nextRefreshGrantName", () => {
  it.each([
    [["Initial grant"], "Refresh grant 1"],
    [["Initial grant", "Refresh grant 1"], "Refresh grant 2"],
    [["Initial grant", "Refresh grant 1", "Refresh grant 3"], "Refresh grant 2"],
    [["Initial grant", "Refresh grant", "Refresh grant 1 copy", "Custom award"], "Refresh grant 1"],
  ])("selects the lowest unused exact refresh-grant number", (names, expected) => {
    expect(nextRefreshGrantName(names)).toBe(expected);
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npx vitest run tests/domain/grantNames.test.ts`

Expected: FAIL because `src/domain/grantNames.ts` does not exist.

- [ ] **Step 3: Add the minimal helper**

```ts
const REFRESH_GRANT_NAME = /^Refresh grant ([1-9]\d*)$/;

export function nextRefreshGrantName(names: readonly string[]): string {
  const occupied = new Set(names.flatMap((name) => {
    const match = REFRESH_GRANT_NAME.exec(name);
    return match ? [Number(match[1])] : [];
  }));
  let number = 1;
  while (occupied.has(number)) number += 1;
  return `Refresh grant ${number}`;
}
```

- [ ] **Step 4: Run the unit test and verify GREEN**

Run: `npx vitest run tests/domain/grantNames.test.ts`

Expected: four cases PASS.

- [ ] **Step 5: Commit the helper and unit test**

```powershell
git add src/domain/grantNames.ts tests/domain/grantNames.test.ts
git commit -m "feat: derive refresh grant names"
```

### Task 2: Grant Creation and Public Default

**Files:**
- Modify: `src/features/assumptions/AssumptionsPanel.tsx:1-175`
- Modify: `src/domain/defaults.ts:10`
- Modify: `tests/features/fresh-app.test.tsx:145-195`

**Interfaces:**
- Consumes: `nextRefreshGrantName(scenario.grants.map((grant) => grant.name))` from Task 1.
- Produces: rendered grant creation behavior and a built-in `Refresh grant 1` label.

- [ ] **Step 1: Write the failing rendered regression test**

Add this test before changing production behavior:

```ts
it("reuses the lowest available refresh-grant number after deletion", () => {
  render(<App />);
  fireEvent.click(screen.getByRole("tab", { name: "Equity" }));
  fireEvent.click(screen.getAllByRole("button", { name: /Delete grant/ })[1]);
  fireEvent.click(screen.getByRole("button", { name: "Add grant" }));

  expect(screen.getAllByLabelText("Grant name").at(-1)).toHaveValue("Refresh grant 1");
  expect(screen.getByRole("button", { name: "Duplicate grant Refresh grant 1" })).toBeVisible();
  expect(screen.queryByDisplayValue("Grant 2")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the rendered regression and verify RED**

Run: `npx vitest run tests/features/fresh-app.test.tsx -t "reuses the lowest available refresh-grant number after deletion"`

Expected: FAIL because the new grant is rendered as `Grant 2`.

- [ ] **Step 3: Connect the helper and update the default**

Import the helper:

```ts
import { nextRefreshGrantName } from "../../domain/grantNames";
```

Derive the name in `addGrant`:

```ts
const name = nextRefreshGrantName(scenario.grants.map((grant) => grant.name));
setScenario({
  ...scenario,
  grants: [...scenario.grants, {
    id,
    name,
    assetId,
    grantDate: scenario.projection.startDate,
    shares: 1000n,
    grantInput: { mode: "shares" },
    vesting: {
      kind: "preset",
      durationMonths: 48,
      cadenceMonths: 3,
      cliffMonths: 12,
      cliffMode: "catchUp",
    },
  }],
});
```

Change only the public default label:

```ts
{
  id: "grant-b",
  name: "Refresh grant 1",
  assetId: "company-equity",
  grantDate: "2028-01-01",
  shares: 800n,
  grantInput: { mode: "shares" },
  vesting: { kind: "preset", durationMonths: 36, cadenceMonths: 12, cliffMonths: 0 },
}
```

At `tests/features/fresh-app.test.tsx:151`, change the excluded grant text from `Refresh grant` to `Refresh grant 1`. At line 185, change the newly added grant action expectation from `Duplicate grant Grant 3` to `Duplicate grant Refresh grant 2`.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npx vitest run tests/domain/grantNames.test.ts tests/features/fresh-app.test.tsx`

Expected: both files PASS with no warnings attributable to the change.

- [ ] **Step 5: Run full static and automated verification**

Run: `npm test`

Expected: all unit and integration tests PASS.

Run: `npx tsc --noEmit`

Expected: exit code 0.

Run: `npm run build`

Expected: production build completes successfully.

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 6: Verify the reported browser flow**

At `http://127.0.0.1:5174/`: reset to the public sample, open **Equity**, delete **Refresh grant 1**, activate **Add grant**, and confirm the new name input and duplicate action both say `Refresh grant 1`. Confirm no relevant console warning/error or framework overlay is present and capture a viewport screenshot.

- [ ] **Step 7: Commit the implementation**

```powershell
git add src/features/assumptions/AssumptionsPanel.tsx src/domain/defaults.ts tests/features/fresh-app.test.tsx
git commit -m "fix: standardize refresh grant names"
```
