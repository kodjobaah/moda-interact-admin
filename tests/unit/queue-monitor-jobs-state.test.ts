import assert from "node:assert/strict";
import test from "node:test";

import {
  createInitialQueueJobsState,
  reduceQueueJobsState,
  type QueueJobsState,
} from "../../src/components/admin/queue-monitor/use-queue-jobs.ts";

function populatedState(): QueueJobsState {
  return {
    ...createInitialQueueJobsState(),
    queueJobs: {
      queueName: "orders",
      status: "active",
      shop: "shop-a",
      page: 4,
      limit: 10,
      direction: "asc",
      hasPrevious: true,
      hasNext: true,
      knownTotal: 40,
      scanTruncated: false,
      jobs: [],
      facets: { shops: [], hasOrphans: false, hasUnresolved: false },
    },
    showAllJobs: true,
    queueJobPage: 4,
    queueJobShop: "shop-a",
    queueJobStatus: "active",
    queueJobDirection: "asc",
    queueJobsError: "previous error",
    queueJobsLoading: false,
    refreshGeneration: 3,
  };
}

test("queue selection resets results and paging but retains shop/status/direction filters", () => {
  const next = reduceQueueJobsState(populatedState(), { type: "queue-selected" });

  assert.equal(next.queueJobs, null);
  assert.equal(next.showAllJobs, false);
  assert.equal(next.queueJobPage, 1);
  assert.equal(next.queueJobsError, null);
  assert.equal(next.queueJobsLoading, true);
  assert.equal(next.queueJobShop, "shop-a");
  assert.equal(next.queueJobStatus, "active");
  assert.equal(next.queueJobDirection, "asc");
});

test("Shop and Status changes reset page, prepare loading, and preserve current result mode and rows", () => {
  const initial = populatedState();
  const shopChanged = reduceQueueJobsState(initial, {
    type: "shop-changed",
    shop: "__orphan__",
  });
  const statusChanged = reduceQueueJobsState(initial, {
    type: "status-changed",
    status: "failed",
  });

  for (const next of [shopChanged, statusChanged]) {
    assert.equal(next.queueJobPage, 1);
    assert.equal(next.queueJobsLoading, true);
    assert.equal(next.queueJobsError, null);
    assert.equal(next.showAllJobs, true);
    assert.equal(next.queueJobs, initial.queueJobs);
  }
  assert.equal(shopChanged.queueJobShop, "__orphan__");
  assert.equal(statusChanged.queueJobStatus, "failed");
});

test("Direction change resets page and prepares loading without clearing current rows", () => {
  const initial = populatedState();
  const next = reduceQueueJobsState(initial, {
    type: "direction-changed",
    direction: "desc",
  });

  assert.equal(next.queueJobDirection, "desc");
  assert.equal(next.queueJobPage, 1);
  assert.equal(next.queueJobsLoading, true);
  assert.equal(next.queueJobsError, null);
  assert.equal(next.queueJobs, initial.queueJobs);
});

test("View all changes mode and page without preparing loading or clearing rows/error", () => {
  const initial = populatedState();
  const next = reduceQueueJobsState(initial, { type: "view-all" });

  assert.equal(next.showAllJobs, true);
  assert.equal(next.queueJobPage, 1);
  assert.equal(next.queueJobsLoading, initial.queueJobsLoading);
  assert.equal(next.queueJobsError, initial.queueJobsError);
  assert.equal(next.queueJobs, initial.queueJobs);
});

test("pagination keeps the prior rows and loading/error state while changing page", () => {
  const initial = populatedState();
  const previous = reduceQueueJobsState(initial, { type: "page-previous" });
  const next = reduceQueueJobsState(initial, { type: "page-next" });
  const firstPage = reduceQueueJobsState(
    { ...initial, queueJobPage: 1 },
    { type: "page-previous" },
  );

  assert.equal(previous.queueJobPage, 3);
  assert.equal(next.queueJobPage, 5);
  assert.equal(firstPage.queueJobPage, 1);
  for (const result of [previous, next, firstPage]) {
    assert.equal(result.queueJobs, initial.queueJobs);
    assert.equal(result.queueJobsLoading, initial.queueJobsLoading);
    assert.equal(result.queueJobsError, initial.queueJobsError);
  }
});

test("manual refresh prepares loading and advances a request generation", () => {
  const initial = populatedState();
  const next = reduceQueueJobsState(initial, { type: "refresh-requested" });

  assert.equal(next.queueJobsLoading, true);
  assert.equal(next.queueJobsError, null);
  assert.equal(next.refreshGeneration, initial.refreshGeneration + 1);
  assert.equal(next.queueJobs, initial.queueJobs);
});