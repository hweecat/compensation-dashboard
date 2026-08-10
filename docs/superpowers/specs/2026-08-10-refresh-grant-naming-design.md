# Refresh Grant Naming Design

## Problem

New grants are currently named from the total number of grants in the scenario. When a scenario retains `Initial grant` but deletes `Refresh grant`, the next grant is therefore called `Grant 2`. The label implies that a `Grant 1` exists and does not communicate that subsequent grants represent refresh awards.

## Decision

- The built-in sample grants are named `Initial grant` and `Refresh grant 1`.
- Every grant created with **Add grant** is assigned the lowest available positive name matching `Refresh grant N` exactly.
- Existing `Refresh grant N` names reserve their number. For example, if `Refresh grant 1` and `Refresh grant 3` exist, the next generated name is `Refresh grant 2`.
- Names that do not exactly match the generated pattern, including user-edited names, do not reserve a number and are never renamed.
- Grant IDs remain independent from display names and continue using the existing unique-ID mechanism.
- Duplicating a grant retains the current `<source name> copy` behavior.

## Data Flow

When **Add grant** is activated, the assumptions panel derives the occupied refresh numbers from the current scenario, selects the first free positive integer, and creates the grant with that display name. Deleting a grant changes only the grant list; it does not renumber remaining grants.

## Compatibility

The public default changes from `Refresh grant` to `Refresh grant 1`. Existing persisted scenarios keep their names unchanged, avoiding unexpected edits to user data. The naming rule applies only to grants created after this change.

## Testing

- A regression test deletes the existing refresh grant, adds a grant, and expects `Refresh grant 1`.
- A naming-unit test covers gap filling and ignores custom names.
- Existing grant CRUD, projection, migration, and browser tests must remain green.
- Browser QA repeats the reported delete-then-add flow and checks the rendered grant-name input and accessible action label.
