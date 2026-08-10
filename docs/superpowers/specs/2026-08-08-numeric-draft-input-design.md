# Numeric Draft Input Design

## Problem

`NumericDraftInput` commits every valid keystroke to the canonical scenario. Currency values then return through `minorToDecimalDraft`, which formats them with two decimal places. The component's prop-sync effect overwrites the focused draft with that formatted value, moving subsequent typed digits into the fractional portion.

## Approved behavior

- Preserve the exact text the user is typing while the input remains focused.
- Continue committing valid drafts immediately so projection results update live.
- Ignore canonical value echoes that originate from those live commits while the field is focused.
- On blur, commit a valid draft and allow the canonical formatted value to normalize the field.
- On blur, restore the last canonical value when the draft is invalid.
- Preserve the existing optional-empty behavior.

## Scope

Change only the shared `NumericDraftInput` synchronization behavior and add a regression test that enters a multi-digit salary amount one keystroke at a time. No domain schema, calculation, formatting, or visual design changes are required.

## Validation

The regression test must demonstrate that typing `123` produces `123`, updates the projection from the valid draft, and normalizes to `123.00` semantics after blur. Existing incomplete-draft tests and the full test suite must continue to pass.
