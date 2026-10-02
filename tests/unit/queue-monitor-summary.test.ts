import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createSummaryRequestGate,
  isQueueMonitorAbortError,
  reduceQueueMonitorSummary,
  type QueueMonitorSummaryState,
} from "../../src/components/admin/queue-monitor/use-queue-monitor-summary.ts";

const snapshot = { observedAt: "2026-10-02T00:00:00.000Z", queues: [] };

function reduce(
  state: QueueMonitorSummaryState,
  ...actions: Parameters<typeof reduceQueueMonitorSummary>[1][]
) {
  return actions.reduce(reduceQueueMonitorSummary, state);
}

test("summary request gate admits only one request until it is released", () => {
  const gate = createSummaryRequestGate();

  assert.equal(gate.tryAcquire(), true);
  assert.equal(gate.tryAcquire(), false);
  gate.release();
  assert.equal(gate.tryAcquire(), true);
});

test("summary failure and abort retain the last snapshot and error convergence", () => {
  const loaded = reduce(
    { snapshot: null, error: null, loading: true },
    { type: "request-succeeded", snapshot },
    { type: "request-finished" },
  );
  const failed = reduce(loaded, { type: "request-started" }, {
    type: "request-failed",
    error: "unavailable",
  }, { type: "request-finished" });
  const abort = new DOMException("Aborted", "AbortError");
  const aborted = isQueueMonitorAbortError(abort)
    ? reduce(failed, { type: "request-started" }, { type: "request-finished" })
    : reduce(failed, { type: "request-started" }, {
        type: "request-failed",
        error: "unavailable",
      }, { type: "request-finished" });

  assert.equal(isQueueMonitorAbortError(abort), true);
  assert.equal(isQueueMonitorAbortError(new Error("unavailable")), false);
  assert.deepEqual(failed, { snapshot, error: "unavailable", loading: false });
  assert.deepEqual(aborted, failed);
});

test("accepted summary replaces the snapshot and clears its error", () => {
  const refreshed = reduce(
    { snapshot, error: "unavailable", loading: true },
    { type: "request-succeeded", snapshot: { ...snapshot, observedAt: "new" } },
    { type: "request-finished" },
  );

  assert.deepEqual(refreshed, {
    snapshot: { ...snapshot, observedAt: "new" },
    error: null,
    loading: false,
  });
});