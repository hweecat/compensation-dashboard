# Human-Readable Risk Inputs Design

## Goal

Remove fictional ACME branding from the built-in scenario, prevent internal risk-factor identifiers from appearing in the interface, and eliminate floating-point artifacts from percentage inputs.

## Neutral built-in scenario

The built-in `public-sample` scenario uses one neutral equity asset:

- asset ID: `company-equity`
- asset name: `Company equity`
- risk-factor ID: `equity:company-equity`

The grants and risk configuration reference the new stable ID. Explicit test fixtures may retain their own company names because they are not user-facing defaults.

When persisted data is loaded, migrate the legacy built-in sample only when all of these identity markers match: scenario ID `public-sample`, `baseline: true`, asset ID `acme`, and asset name `ACME`. Rename that asset and remap its grant references, volatility key, and correlation factor ID without changing financial values or matrix order. User-created scenarios and other assets named ACME are not migrated.

## Human-readable risk labels

Risk factor IDs remain stable engine and persistence keys. A single display-name helper resolves them at the presentation boundary:

- `equity:company-equity` becomes `Equity — Company equity`
- `fx:USD/SGD` becomes `FX — USD/SGD`

Volatility labels use `Equity volatility — Company equity (%)` and `FX volatility — USD/SGD (%)`. Correlation row headings, column headings, accessible labels, and displayed simulation provenance use the same human-readable mapping. Unknown legacy factors fall back to a readable form without exposing the raw prefix syntax.

## Clean percentage drafts

A shared percentage-to-draft helper converts stored decimal rates into percentage text with decimal arithmetic, rounds only binary floating-point noise, preserves up to six meaningful decimal places, and removes unnecessary trailing zeros. Examples:

- `0.07` → `7`
- `0.075` → `7.5`
- `0.333333` → `33.3333`

Use it for every assumptions input whose stored value is a decimal rate: salary growth, target bonus, achievement, asset growth, tax rates, FX drift, volatility, and correlation. Parsing and stored calculation semantics remain unchanged.

## Validation

Regression tests cover the neutral default identity and risk keys, persisted built-in sample migration, clean percentage drafts, human-readable volatility labels, human-readable correlation labels, and the absence of raw `equity:` identifiers from the Risk interface. The full unit suite, TypeScript check, and production build must remain green.
