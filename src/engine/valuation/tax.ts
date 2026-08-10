import type { Scenario, SourceComponent } from "../../domain/schema";

export const taxRateFor = (scenario: Scenario, component: SourceComponent) =>
  scenario.tax.mode === "blended" ? scenario.tax.blendedRate : scenario.tax.byComponent[component];
