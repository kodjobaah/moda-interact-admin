import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fetchQueueJobDetail,
  fetchQueueJobs,
  fetchQueueMonitorSnapshot,
  QueueJobDetailHttpError,
} from "../../src/components/admin/queue-monitor/queue-monitor.client.ts";

type FetchCall = { url: string; init: RequestInit | undefined };

async function withMockFetch(
  responseFor: (url: string) => Response,
  run: (calls: FetchCall[]) => Promise<void>,
) {
  const originalFetch = globalThis.fetch;
  const calls: FetchCall[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    return responseFor(url);
  };

  try {
    await run(calls);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function assertNoStoreAndSignal(call: FetchCall, signal: AbortSignal) {
  assert.equal(call.init?.cache, "no-store");
  assert.equal(call.init?.signal, signal);
}

test("summary request uses the protected endpoint, no-store cache, and signal", async () => {
  const signal = new AbortController().signal;
  const payload = { observedAt: "2026-10-02T00:00:00.000Z", queues: [] };

  await withMockFetch(() => Response.json(payload), async (calls) => {
    assert.deepEqual(await fetchQueueMonitorSnapshot(signal), payload);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "/api/admin/queues");
    assertNoStoreAndSignal(calls[0], signal);
  });
});

test("jobs requests serialize recent and full filters in the established order", async () => {
  const signal = new AbortController().signal;
  const requests = [
    {
      queue: "checkout-events",
      status: "failed" as const,
      shop: "*",
      page: 2,
      limit: "5",
      direction: "desc" as const,
      expected: "queue=checkout-events&status=failed&shop=*&page=2&limit=5&direction=desc",
    },
    {
      queue: "order-events",
      status: "active" as const,
      shop: "__unresolved__",
      page: 7,
      limit: "10",
      direction: "asc" as const,
      expected: "queue=order-events&status=active&shop=__unresolved__&page=7&limit=10&direction=asc",
    },
  ];

  await withMockFetch(() => Response.json({}), async (calls) => {
    for (const { expected, ...request } of requests) {
      await fetchQueueJobs(request, signal);
      const call = calls.at(-1)!;
      assert.equal(call.url, `/api/admin/queues/jobs?${expected}`);
      assertNoStoreAndSignal(call, signal);
    }
    assert.equal(calls.length, requests.length);
  });
});

test("detail requests serialize selected job filters and preserve HTTP status", async () => {
  const signal = new AbortController().signal;
  const detail = {
    id: "job-1",
    queueName: "checkout-events",
    name: "checkout-created",
    status: "failed",
    shop: "shop-1",
    attribution: "known",
    attemptsMade: 1,
    timestamp: null,
    processedOn: null,
    finishedOn: null,
    failedReason: "failed",
    stacktrace: [],
    data: {},
  };

  await withMockFetch(
    (url) => {
      if (url.includes("jobId=missing")) return new Response(null, { status: 404 });
      if (url.includes("jobId=unavailable")) return new Response(null, { status: 503 });
      return Response.json(detail);
    },
    async (calls) => {
      const request = { queue: "checkout-events", status: "failed" as const };
      assert.deepEqual(
        await fetchQueueJobDetail({ ...request, jobId: "job-1" }, signal),
        detail,
      );
      await assert.rejects(
        fetchQueueJobDetail({ ...request, jobId: "missing" }, signal),
        (error) => error instanceof QueueJobDetailHttpError && error.status === 404,
      );
      await assert.rejects(
        fetchQueueJobDetail({ ...request, jobId: "unavailable" }, signal),
        (error) => error instanceof QueueJobDetailHttpError && error.status === 503,
      );

      assert.deepEqual(
        calls.map(({ url }) => url),
        [
          "/api/admin/queues/jobs/detail?queue=checkout-events&status=failed&jobId=job-1",
          "/api/admin/queues/jobs/detail?queue=checkout-events&status=failed&jobId=missing",
          "/api/admin/queues/jobs/detail?queue=checkout-events&status=failed&jobId=unavailable",
        ],
      );
      for (const call of calls) assertNoStoreAndSignal(call, signal);
    },
  );
});