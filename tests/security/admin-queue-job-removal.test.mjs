import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const { removeFailedQueueJob, QueueJobRemovalError } =
  await import("../../src/lib/admin/queue-job-removal.ts");
const input = {
  queueName: "pending-recovery-candidates",
  jobName: "evaluate-pending-recovery",
  jobId: "old-failed-shopify-job",
};

function fixture(state = "failed", override = {}) {
  const calls = [];
  const job = {
    id: input.jobId,
    name: input.jobName,
    getState: async () => {
      calls.push("state");
      return state;
    },
    remove: async () => {
      calls.push("remove");
    },
    ...override,
  };
  const queueFactory = () => ({
    waitUntilReady: async () => {
      calls.push("ready");
    },
    getJob: async () => {
      calls.push("getJob");
      return job;
    },
    close: async () => {
      calls.push("close");
    },
  });
  return { calls, queueFactory };
}

function options(f) {
  return { redisUrl: "redis://unused.invalid", queueFactory: f.queueFactory };
}

function rejected(code) {
  return (error) =>
    error instanceof QueueJobRemovalError && error.code === code;
}

test("only the exact verified failed job is removed and reader is closed", async () => {
  const f = fixture();
  await removeFailedQueueJob(input, options(f));
  assert.deepEqual(f.calls, ["ready", "getJob", "state", "remove", "close"]);
});

test("waiting, delayed and active jobs are never removed", async () => {
  for (const state of ["waiting", "delayed", "active", "completed"]) {
    const f = fixture(state);
    await assert.rejects(
      removeFailedQueueJob(input, options(f)),
      rejected("conflict"),
    );
    assert.equal(f.calls.includes("remove"), false);
    assert.equal(f.calls.at(-1), "close");
  }
});

test("unknown queue and names are rejected before opening Redis", async () => {
  const f = fixture();
  await assert.rejects(
    removeFailedQueueJob({ ...input, queueName: "not-a-queue" }, options(f)),
    rejected("invalid"),
  );
  await assert.rejects(
    removeFailedQueueJob({ ...input, jobName: "unregistered-job" }, options(f)),
    rejected("invalid"),
  );
  await assert.rejects(
    removeFailedQueueJob({ ...input, jobId: "" }, options(f)),
    rejected("invalid"),
  );
  assert.deepEqual(f.calls, []);
});

test("identity mismatch, repeat and parent-linked jobs are not removed", async () => {
  for (const job of [
    { id: "other-job" },
    { name: "not-this-job" },
    { opts: { repeat: { every: 1000 } } },
    { repeatJobKey: "repeat:some-job" },
    { parentKey: "parent:some-job" },
  ]) {
    const f = fixture("failed", job);
    await assert.rejects(
      removeFailedQueueJob(input, options(f)),
      rejected("conflict"),
    );
    assert.equal(f.calls.includes("remove"), false);
  }
});

test("removal races or missing jobs fail closed", async () => {
  const f = fixture("failed", { remove: async () => false });
  await assert.rejects(
    removeFailedQueueJob(input, options(f)),
    rejected("conflict"),
  );
  const missing = fixture();
  missing.queueFactory = () => ({
    waitUntilReady: async () => {},
    getJob: async () => undefined,
    close: async () => {},
  });
  await assert.rejects(
    removeFailedQueueJob(input, options(missing)),
    rejected("not_found"),
  );
});

test("the removal endpoint authorizes mutation, denies development bypass and checks the origin before the Redis action", () => {
  const route = readFileSync(
    new URL(
      "../../src/app/api/admin/queues/jobs/remove/route.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(route, /await requirePlatformAdminMutation\(\)/);
  assert.match(
    route,
    /principal\.role !== 'SUPER_ADMIN' \|\| principal\.developmentBypass/,
  );
  assert.match(route, /!sameOrigin\(request\)/);
  assert.ok(
    route.indexOf("await requirePlatformAdminMutation()") <
      route.indexOf("await removeFailedQueueJob(input)"),
  );
  assert.match(route, /confirmJobId/);
  assert.match(route, /logAdminSecurityEvent\('admin\.queue_job\.removed'/);
});

test("WooCommerce queues attribute their documented shopId rather than showing an orphan", async () => {
  const { extractQueueJobShopId } =
    await import("../../src/lib/admin/queue-monitor.ts");
  for (const [queueName, name] of [
    ["woo-checkout-capture-v1", "checkout-updated"],
    ["woo-order-capture-v1", "order-lifecycle"],
    ["woo-coupon-sync", "sync-woo-coupons"],
  ]) {
    assert.equal(
      extractQueueJobShopId(queueName, name, { shopId: "shop-1" }),
      "shop-1",
    );
  }
});
