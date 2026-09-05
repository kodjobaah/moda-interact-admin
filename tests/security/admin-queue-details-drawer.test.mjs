import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { test } from "node:test";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const componentPath = path.join(
  repositoryRoot,
  "src/components/admin/queue-monitor.tsx",
);

test("queue details uses a full-workspace fixed overlay with resizing controls", async () => {
  const source = await readFile(componentPath, "utf8");

  assert.doesNotMatch(source, /flex flex-col gap-5 lg:flex-row/);
  assert.match(
    source,
    /<aside[\s\S]*className="fixed inset-y-0 right-0 z-50 flex w-screen max-w-full flex-col.*md:w-\[calc\(100vw-15rem\)\]"/,
  );
  assert.match(source, /data-testid="queue-details-drawer"/);
  assert.match(source, /min-h-0 flex-1 overflow-y-auto p-5/);
  assert.match(source, /aria-label="Resize queue details panel"/);
  assert.match(source, /event.key === "ArrowLeft"/);
  assert.match(source, /event.key === "ArrowRight"/);
  assert.match(source, /event.key === "Home"/);
  assert.match(source, /event.key === "End"/);
  assert.match(source, /aria-label="Maximize queue details"/);
  assert.match(source, /setDrawerWidth\(null\)/);
  assert.match(source, /Queue details/);
  assert.match(source, /aria-label="Close queue details"/);
  assert.match(
    source,
    /onClick=\{\(\) => \{[\s\S]*setSelectedQueueName\(null\)[\s\S]*\}\}/,
  );
});

test("closing the drawer does not clear queue or failed-job data", async () => {
  const source = await readFile(componentPath, "utf8");
  const closeHandler = source.match(
    /aria-label="Close queue details"[\s\S]{0,300}?onClick=\{\(\) => \{([\s\S]*?)\}\}/,
  );

  assert.ok(closeHandler, "expected a queue details close handler");
  assert.match(closeHandler[1], /setSelectedQueueName\(null\)/);
  assert.match(closeHandler[1], /setDrawerWidth\(null\)/);
  assert.match(closeHandler[1], /setIsResizing\(false\)/);
  assert.doesNotMatch(
    closeHandler[0],
    /setFailedJobs|setSelectedJobId|setJobDetail/,
  );
});

test("queue names switch diagnostics without resetting an open drawer", async () => {
  const source = await readFile(componentPath, "utf8");
  const selectQueue = source.match(
    /function selectQueue\(queueName: string\) \{([\s\S]*?)\n  \}/,
  );

  assert.ok(selectQueue, "expected a queue selection handler");
  assert.match(source, /aria-label=\{`Open \$\{queue\.queueName\} queue details`\}/);
  assert.doesNotMatch(source, />View details<|>Details<\/span>/);
  assert.match(selectQueue[1], /if \(!selectedQueueName\) setDrawerWidth\(null\)/);
  assert.match(selectQueue[1], /setQueueJobs\(null\)/);
  assert.match(selectQueue[1], /setSelectedJobId\(null\)/);
  assert.match(selectQueue[1], /setJobDetail\(null\)/);
  assert.match(selectQueue[1], /prepareQueueJobsLoad\(\)/);
});

test("queue drawer uses the bounded Shop, Status, Direction filter contract", async () => {
  const source = await readFile(componentPath, "utf8");

  assert.match(source, /\/api\/admin\/queues\/jobs\?/);
  assert.match(source, /status: queueJobStatus/);
  assert.match(source, /shop: queueJobShop/);
  assert.match(source, /limit: showAllJobs \? "10" : "5"/);
  assert.match(source, /setShowAllJobs\(true\)/);
  assert.match(source, /Page \{queueJobs\.page\}/);
  assert.match(source, /disabled=\{!queueJobs\.hasPrevious/);
  assert.match(source, /disabled=\{!queueJobs\.hasNext/);
  assert.match(source, /Back to \{showAllJobs \? "all jobs" : "recent jobs"\}/);
  assert.match(source, /View all jobs/);
  assert.match(source, /<option value="waiting">Waiting<\/option>/);
  assert.match(source, /<option value="delayed">Delayed<\/option>/);
  assert.doesNotMatch(source, /View all failed jobs/);
  assert.match(source, /Orphan \/ No shop/);
  assert.match(source, /Worker online/);
});

test("queue drawer keeps the full browser paginated and state-safe", async () => {
  const source = await readFile(componentPath, "utf8");

  assert.match(source, /setQueueJobPage\(1\)/);
  assert.match(source, /setQueueJobPage\(\(page\) => Math\.max\(1, page - 1\)\)/);
  assert.match(source, /setQueueJobPage\(\(page\) => page \+ 1\)/);
  assert.match(source, /knownTotal !== null/);
  assert.match(source, /scanTruncated/);
  assert.match(source, /Back to \{showAllJobs \? "all jobs" : "recent jobs"\}/);
  assert.match(source, /setJobDetailError\(null\)/);
});
