/// <reference lib="webworker" />
import type { RiskWorkerRequest, RiskWorkerResponse } from "./riskProtocol";
import { runRiskCooperatively } from "./riskScheduler";

const cancelled = new Set<string>();
const terminal = new Set<string>();
type MutableDiagnostics = {
  workerReceivedAt: number;
  cancellationRequestedAt?: number;
  cancellationEmittedAt?: number;
};
const diagnostics = new Map<string, MutableDiagnostics>();
const send = (message: RiskWorkerResponse) => self.postMessage(message);

self.addEventListener("message", (event: MessageEvent<RiskWorkerRequest>) => {
  const request = event.data;
  if (request.type === "cancel") {
    if (terminal.has(request.requestId)) return;
    const timing = diagnostics.get(request.requestId) ?? { workerReceivedAt: performance.now() };
    cancelled.add(request.requestId);
    timing.cancellationRequestedAt = performance.now();
    timing.cancellationEmittedAt = performance.now();
    diagnostics.set(request.requestId, timing);
    terminal.add(request.requestId);
    send({ type: "cancelled", requestId: request.requestId, diagnostics: timing });
    return;
  }
  cancelled.delete(request.requestId);
  terminal.delete(request.requestId);
  diagnostics.set(request.requestId, { workerReceivedAt: performance.now() });
  setTimeout(() => {
    if (terminal.has(request.requestId)) return;
    void runRiskCooperatively(request.snapshot, request.options, {
      maxRunsPerChunk: 250,
      maxChunkMs: 20,
      isCancelled: () => cancelled.has(request.requestId),
      yieldControl: () => new Promise<void>((resolve) => setTimeout(resolve, 0)),
      onProgress: (completed, total) => {
        if (!terminal.has(request.requestId)) send({ type: "progress", requestId: request.requestId, completed, total });
      },
    }).then((scheduled) => {
      if (terminal.has(request.requestId)) return;
      terminal.add(request.requestId);
      if (scheduled.status === "cancelled") send({ type: "cancelled", requestId: request.requestId, diagnostics: scheduled.diagnostics });
      else send({ type: "complete", requestId: request.requestId, result: scheduled.result! });
    }).catch((error) => {
      if (terminal.has(request.requestId)) return;
      terminal.add(request.requestId);
      send({ type: "error", requestId: request.requestId, message: error instanceof Error ? error.message : "Risk simulation failed" });
    });
  }, 0);
});

export {};
