import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
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
const queueMonitorModuleDirectory = path.join(
  repositoryRoot,
  "src/components/admin/queue-monitor",
);

async function readQueueMonitorSources() {
  const entries = await readdir(queueMonitorModuleDirectory, { withFileTypes: true });
  const modulePaths = entries
    .filter((entry) => entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name))
    .map((entry) => path.join(queueMonitorModuleDirectory, entry.name))
    .sort();
  const sources = await Promise.all(
    [componentPath, ...modulePaths].map((filePath) => readFile(filePath, "utf8")),
  );
  return sources.join("\n");
}

test("queue details uses a full-workspace fixed overlay with resizing controls", async () => {
  const source = await readQueueMonitorSources();

  assert.doesNotMatch(source, /flex flex-col gap-5 lg:flex-row/);
  assert.match(
    source,
    /<aside[\s\S]*className="fixed inset-y-0 right-0 z-50 flex w-screen max-w-full flex-col.*md:w-\[calc\(100vw-15rem\)\]"/,
  );
  assert.match(source, /data-testid="queue-details-drawer"/);
  assert.match(source, /min-h-0 flex-1 overflow-y-auto p-5/);
  assert.match(source, /queue\.resizeDetails/);
  assert.match(source, /event.key === "ArrowLeft"/);
  assert.match(source, /event.key === "ArrowRight"/);
  assert.match(source, /event.key === "Home"/);
  assert.match(source, /event.key === "End"/);
  assert.match(source, /queue\.maximizeDetails/);
  assert.match(source, /setDrawerWidth\(null\)/);
  assert.match(source, /queue\.details/);
  assert.match(source, /queue\.closeDetails/);
  assert.match(
    source,
    /onClick=\{\(\) => \{[\s\S]*setSelectedQueueName\(null\)[\s\S]*\}\}/,
  );
});

test("closing the drawer does not clear queue or failed-job data", async () => {
  const source = await readQueueMonitorSources();
  const closeHandler = source.match(
    /queue\.closeDetails[\s\S]{0,300}?onClick=\{\(\) => \{([\s\S]*?)\}\}/,
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
  const source = await readQueueMonitorSources();
  const selectQueue = source.match(
    /function selectQueue\(queueName: string\) \{([\s\S]*?)\n  \}/,
  );

  assert.ok(selectQueue, "expected a queue selection handler");
  assert.match(source, /queue\.openDetails/);
  assert.doesNotMatch(source, />View details<|>Details<\/span>/);
  assert.match(selectQueue[1], /if \(!selectedQueueName\) setDrawerWidth\(null\)/);
  assert.match(selectQueue[1], /prepareForQueueSelection\(\)/);

  const queueSelectedTransition = source.match(
    /case "queue-selected":([\s\S]*?)case "refresh-requested":/,
  );
  assert.ok(queueSelectedTransition, "expected a queue-selected jobs transition");
  assert.match(queueSelectedTransition[1], /queueJobs: null/);
  assert.match(queueSelectedTransition[1], /showAllJobs: false/);
  assert.match(queueSelectedTransition[1], /queueJobPage: 1/);
  assert.match(queueSelectedTransition[1], /queueJobsError: null/);
  assert.match(queueSelectedTransition[1], /queueJobsLoading: true/);

  assert.match(
    source,
    /onSelectionInvalidated: \(reason\) => invalidateSelectionRef\.current\(reason\)/,
  );
  assert.match(
    source,
    /invalidateSelectionRef\.current = jobDetailState\.invalidateSelection/,
  );

  const detailInvalidatedTransition = source.match(
    /case "selection-invalidated":([\s\S]*?)case "request-succeeded":/,
  );
  assert.ok(detailInvalidatedTransition, "expected a detail invalidation transition");
  assert.match(detailInvalidatedTransition[1], /selectedJobId: null/);
  assert.match(detailInvalidatedTransition[1], /jobDetail: null/);
  assert.match(
    detailInvalidatedTransition[1],
    /action\.reason === "queue-selection" \|\| action\.reason === "jobs-replaced"/,
  );
  assert.match(detailInvalidatedTransition[1], /jobDetailError: null, jobDetailLoading: false/);
});

test("queue drawer uses the bounded Shop, Status, Direction filter contract", async () => {
  const source = await readQueueMonitorSources();

  assert.match(source, /\/api\/admin\/queues\/jobs\?/);
  assert.match(source, /changeShop\(event\.target\.value\)/);
  assert.match(source, /changeStatus\(event\.target\.value as typeof queueJobStatus\)/);
  assert.match(source, /changeDirection\(event\.target\.value as typeof queueJobDirection\)/);
  assert.match(source, /onClick=\{viewAll\}/);
  assert.match(source, /status: state\.queueJobStatus/);
  assert.match(source, /shop: state\.queueJobShop/);
  assert.match(source, /page: state\.queueJobPage/);
  assert.match(source, /limit: state\.showAllJobs \? "10" : "5"/);
  assert.match(source, /direction: state\.queueJobDirection/);
  assert.match(source, /pagination\.page/);
  assert.match(source, /disabled=\{!queueJobs\.hasPrevious/);
  assert.match(source, /disabled=\{!queueJobs\.hasNext/);
  assert.match(source, /queue\.backTo/);
  assert.match(source, /queue\.viewAllJobs/);
  assert.match(source, /adminStatusLabel\("waiting"\)/);
  assert.match(source, /adminStatusLabel\("delayed"\)/);
  assert.doesNotMatch(source, /View all failed jobs/);
  assert.match(source, /queue\.orphanShop/);
  assert.match(source, /queue\.workerOnline/);
});

test("queue drawer keeps the full browser paginated and state-safe", async () => {
  const source = await readQueueMonitorSources();

  assert.match(source, /onClick=\{previousPage\}/);
  assert.match(source, /onClick=\{nextPage\}/);
  assert.match(source, /onClick=\{viewAll\}/);
  assert.match(source, /case "page-previous":/);
  assert.match(source, /queueJobPage: Math\.max\(1, state\.queueJobPage - 1\)/);
  assert.match(source, /case "page-next":/);
  assert.match(source, /queueJobPage: state\.queueJobPage \+ 1/);
  assert.match(source, /case "view-all":/);
  assert.match(source, /showAllJobs: true, queueJobPage: 1/);
  assert.match(source, /knownTotal !== null/);
  assert.match(source, /scanTruncated/);
  assert.match(source, /queue\.backTo/);
  assert.match(source, /onClick=\{clearSelection\}/);

  const detailClearedTransition = source.match(
    /case "selection-cleared":([\s\S]*?)case "selection-invalidated":/,
  );
  assert.ok(detailClearedTransition, "expected a cleared detail transition");
  assert.match(detailClearedTransition[1], /return createInitialQueueJobDetailState\(\)/);
  assert.match(
    source,
    /function createInitialQueueJobDetailState\(\): QueueJobDetailState \{\s+return \{\s+selectedJobId: null,\s+jobDetail: null,\s+jobDetailError: null,\s+jobDetailLoading: false,\s+\};/,
  );
});

test("selecting a job stops queue auto-refresh until the detail view is closed", async () => {
  const source = await readQueueMonitorSources();

  assert.match(source, /suspendAutoRefresh: jobDetailState\.selectedJobId !== null/);
  assert.match(
    source,
    /if \(selectedQueueName && !jobDetailState\.selectedJobId\) \{\s+refreshQueueJobs\(\);\s+\}/,
  );
  assert.match(source, /if \(suspendAutoRefresh\) requestRef\.current\?\.abort\(\)/);
  assert.match(source, /if \(suspendAutoRefresh \|\| refreshMs === 0\) return undefined/);
  assert.match(source, /disabled=\{loading \|\| jobDetailState\.selectedJobId !== null\}/);
  assert.match(source, /disabled=\{queueJobsLoading \|\| selectedJobId !== null\}/);
  assert.match(source, /queue\.refreshStoppedForJob/);
});

test("queue drawer exposes persistent auto-refresh controls while browsing jobs", async () => {
  const source = await readQueueMonitorSources();

  assert.match(source, /refreshMs=\{refreshMs\}/);
  assert.match(source, /setRefreshMs=\{setRefreshMs\}/);
  assert.match(source, /summaryLoading=\{loading\}/);
  assert.match(source, /refreshSummary=\{refresh\}/);
  assert.match(source, /id="queue-detail-refresh-rate"/);
  assert.match(source, /REFRESH_OPTIONS\.map/);
  assert.match(source, /if \(isRefreshValue\(value\)\) setRefreshMs\(value\)/);
  assert.match(source, /queue\.refreshControlHint/);
  assert.match(source, /onClick=\{\(\) => void refreshSummary\(\)\}/);
  assert.match(
    source,
    /disabled=\{summaryLoading \|\| jobDetailState\.selectedJobId !== null\}/,
  );
});
