import type { RiskOptions, RiskResult, RiskSnapshot } from "../engine/risk/monteCarlo";
import type { SchedulerDiagnostics } from "./riskScheduler";
export type RiskWorkerRequest = { type: "run"; requestId: string; snapshot: RiskSnapshot; options: RiskOptions } | { type: "cancel"; requestId: string };
export type RiskWorkerResponse = { type: "progress"; requestId: string; completed: number; total: number } | { type: "complete"; requestId: string; result: RiskResult } | { type: "cancelled"; requestId: string; diagnostics: SchedulerDiagnostics } | { type: "error"; requestId: string; message: string };
