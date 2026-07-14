import { describe, expect, it } from "vitest";
import { runCooperativeChunks } from "../../src/workers/riskScheduler";

describe("cooperative risk scheduling", () => {
  it("yields between bounded chunks and acknowledges cancellation", async () => {
    let clock = 100;
    let cancelled = false;
    const progress: number[] = [];
    const result = await runCooperativeChunks({
      total: 10_000,
      maxRunsPerChunk: 1_000,
      maxChunkMs: 20,
      now: () => clock,
      runOne: () => { clock += 7; },
      isCancelled: () => cancelled,
      yieldControl: async () => { cancelled = true; clock += 2; },
      onProgress: (completed) => progress.push(completed),
    });
    expect(result.status).toBe("cancelled");
    expect(result.completed).toBe(3);
    expect(progress).toEqual([3]);
    expect(result.diagnostics.cancellationEmittedAt! - result.diagnostics.cancellationRequestedAt!).toBeLessThan(100);
  });
});
