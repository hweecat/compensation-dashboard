import { createRiskSimulation, type RiskOptions, type RiskResult, type RiskSnapshot } from "../engine/risk/monteCarlo";

export type SchedulerDiagnostics = Readonly<{ workerReceivedAt: number; cancellationRequestedAt?: number; cancellationEmittedAt?: number }>;
export type CooperativeChunkOptions = Readonly<{
  total: number; maxRunsPerChunk: number; maxChunkMs: number;
  now(): number; runOne(index: number): void; isCancelled(): boolean; yieldControl(): Promise<void>;
  onProgress?(completed: number, total: number): void;
}>;

export const runCooperativeChunks = async (options: CooperativeChunkOptions) => {
  const diagnostics: { workerReceivedAt: number; cancellationRequestedAt?: number; cancellationEmittedAt?: number } = { workerReceivedAt: options.now() };
  let completed = 0;
  const cancelled = () => {
    if (!options.isCancelled()) return false;
    diagnostics.cancellationRequestedAt ??= options.now();
    diagnostics.cancellationEmittedAt = options.now();
    return true;
  };
  if (cancelled()) return { status: "cancelled" as const, completed, diagnostics };
  while (completed < options.total) {
    const started = options.now();
    let chunkRuns = 0;
    while (completed < options.total && chunkRuns < options.maxRunsPerChunk && options.now() - started < options.maxChunkMs) {
      options.runOne(completed++);
      chunkRuns += 1;
    }
    if (cancelled()) return { status: "cancelled" as const, completed, diagnostics };
    options.onProgress?.(completed, options.total);
    if (completed === options.total) return { status: "complete" as const, completed, diagnostics };
    await options.yieldControl();
    if (cancelled()) return { status: "cancelled" as const, completed, diagnostics };
  }
  return { status: "complete" as const, completed, diagnostics };
};

export const runRiskCooperatively = async (snapshot: RiskSnapshot, options: RiskOptions, controls: Readonly<{
  maxRunsPerChunk: number; maxChunkMs: number; yieldControl(): Promise<void>; isCancelled(): boolean;
  onProgress?(completed: number, total: number): void; now?(): number;
}>): Promise<Readonly<{ status: "complete" | "cancelled"; completed: number; diagnostics: SchedulerDiagnostics; result?: RiskResult }>> => {
  const simulation = createRiskSimulation(snapshot, options);
  const scheduled = await runCooperativeChunks({ ...controls, total: simulation.totalRuns, now: controls.now ?? (() => performance.now()), runOne: () => simulation.runOne() });
  return scheduled.status === "complete" ? { ...scheduled, result: simulation.result() } : scheduled;
};
