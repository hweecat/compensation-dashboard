# Numeric Draft Input Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve multi-digit numeric typing while retaining live projection updates and blur-time normalization.

**Architecture:** Keep the local draft authoritative while its input is focused. Track focus inside `NumericDraftInput`; synchronize external values only while unfocused, then normalize from the committed canonical value after blur.

**Tech Stack:** React 18, TypeScript, Vitest, Testing Library

## Global Constraints

- Do not change financial calculations, schemas, or stored precision.
- Valid drafts continue to update the canonical scenario immediately.
- Invalid and optional-empty draft behavior remains unchanged.

---

### Task 1: Preserve focused numeric drafts

**Files:**
- Modify: `src/features/assumptions/AssumptionsPanel.tsx`
- Test: `tests/features/fresh-app.test.tsx`

**Interfaces:**
- Consumes: `NumericDraftInput<T>` props `value`, `parse`, `onCommit`, and optional `onEmpty`.
- Produces: focused draft preservation with canonical synchronization after blur.

- [ ] **Step 1: Write the failing regression test**

Render `App`, clear the salary input, issue sequential change events for `1`, `12`, and `123`, and assert the input retains each literal draft instead of becoming a two-decimal canonical echo. Blur and assert the value represents `123`.

- [ ] **Step 2: Run the focused test and verify red**

Run: `npx vitest run tests/features/fresh-app.test.tsx -t "preserves multi-digit currency typing"`

Expected: FAIL because the current prop-sync effect changes the focused input to `1.00` after the first valid keystroke.

- [ ] **Step 3: Implement the minimal focus-aware synchronization**

Add focused state to `NumericDraftInput`. Set it on focus, suppress `value`-to-draft synchronization while focused, and clear it on blur after applying the existing validation rules. Ensure blur adopts the canonical formatted prop without changing live `onCommit` behavior.

- [ ] **Step 4: Verify green and regressions**

Run the focused test, then `npm test`, `npx tsc --noEmit`, and `npm run build`.

Expected: the new regression and all existing checks pass.

- [ ] **Step 5: Review the diff**

Run `git diff --check` and inspect the two code/test files to confirm the change remains narrowly scoped.
