/**
 * Compatibility boundary for consumers that imported the old download helper.
 * Financial exports are built exclusively by the canonical ledger-backed
 * persistence/plannerExports module.
 */
export { downloadText as exportFile } from "./persistence/plannerExports";
