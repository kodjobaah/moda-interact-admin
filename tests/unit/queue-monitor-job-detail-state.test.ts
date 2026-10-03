import assert from "node:assert/strict";
import test from "node:test";

import {
  createInitialQueueJobDetailState,
  getQueueJobDetailError,
  isQueueJobDetailAbort,
  reduceQueueJobDetailState,
} from "../../src/components/admin/queue-monitor/use-queue-job-detail.ts";
import type { QueueJobDetail } from "../../src/components/admin/queue-monitor/queue-monitor.types.ts";
import { QueueJobDetailHttpError } from "../../src/components/admin/queue-monitor/queue-monitor.client.ts";

function selectedState() {
  return reduceQueueJobDetailState(createInitialQueueJobDetailState(), {
    type: "job-selected",
    jobId: "job-1",
  });
}

const previousDetail: QueueJobDetail = {
  id: "previous",
  queueName: "orders",
  name: "order-created",
  status: "failed",
  shop: "shop-a",
  attribution: "known",
  attemptsMade: 1,
  timestamp: null,
  processedOn: null,
  finishedOn: null,
  failedReason: "failed",
  stacktrace: [],
  data: {},
};

test("selecting a job immediately clears previous result state and starts loading", () => {
  const state = {
    ...selectedState(),
    jobDetail: previousDetail,
    jobDetailError: "previous error",
    jobDetailLoading: false,
  };
  const next = reduceQueueJobDetailState(state, {
    type: "job-selected",
    jobId: "job-2",
  });

  assert.equal(next.selectedJobId, "job-2");
  assert.equal(next.jobDetail, null);
  assert.equal(next.jobDetailError, null);
  assert.equal(next.jobDetailLoading, true);
});

test("clear and back transitions reset selection and detail state", () => {
  const next = reduceQueueJobDetailState(
    { ...selectedState(), jobDetailError: "error" },
    { type: "selection-cleared" },
  );

  assert.deepEqual(next, createInitialQueueJobDetailState());
});

test("jobs invalidation preserves the established reason-specific status behavior", () => {
  const selected = {
    ...selectedState(),
    jobDetailError: "error",
    jobDetailLoading: true,
  };

  for (const reason of ["filter-change", "view-all"] as const) {
    const next = reduceQueueJobDetailState(selected, {
      type: "selection-invalidated",
      reason,
    });
    assert.equal(next.selectedJobId, null);
    assert.equal(next.jobDetail, null);
    assert.equal(next.jobDetailError, "error");
    assert.equal(next.jobDetailLoading, true);
  }

  for (const reason of ["queue-selection", "jobs-replaced"] as const) {
    const next = reduceQueueJobDetailState(selected, {
      type: "selection-invalidated",
      reason,
    });
    assert.equal(next.selectedJobId, null);
    assert.equal(next.jobDetail, null);
    assert.equal(next.jobDetailError, null);
    assert.equal(next.jobDetailLoading, false);
  }
});

test("detail request errors preserve the 404, unavailable, and ordinary error mappings", () => {
  assert.equal(
    getQueueJobDetailError(new QueueJobDetailHttpError(404), "gone", "unavailable"),
    "gone",
  );
  assert.equal(
    getQueueJobDetailError(new QueueJobDetailHttpError(503), "gone", "unavailable"),
    "unavailable",
  );
  assert.equal(getQueueJobDetailError(new Error("network"), "gone", "unavailable"), "network");
  assert.equal(getQueueJobDetailError("unknown", "gone", "unavailable"), "unavailable");
});

test("abort errors are recognized and never become user-facing errors", () => {
  const abortError = new DOMException("Request aborted", "AbortError");

  assert.equal(isQueueJobDetailAbort(abortError), true);
  assert.equal(getQueueJobDetailError(abortError, "gone", "unavailable"), null);
});