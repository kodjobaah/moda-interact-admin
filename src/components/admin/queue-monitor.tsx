"use client";

import { useEffect, useRef, useState } from "react";

import {
  getInitialRefreshMs,
  isRefreshValue,
  REFRESH_OPTIONS,
  STORAGE_KEY,
} from "./queue-monitor-refresh";

type QueueJobStatus = "failed" | "active" | "waiting" | "delayed";
type QueueJobShop = "*" | "__orphan__" | "__unresolved__" | string;
type QueueJobDirection = "asc" | "desc";

type QueueMonitorSnapshot = {
  observedAt: string;
  queues: Array<{
    queueName: string;
    jobNames: string[];
    counts: {
      waiting: number;
      active: number;
      delayed: number;
      failed: number;
      workers: number;
    };
    lastActivity: { event: string; observedAt: string } | null;
  }>;
};

type QueueJobSnapshot = {
  queueName: string;
  status: QueueJobStatus;
  shop: string;
  page: number;
  limit: number;
  direction: QueueJobDirection;
  hasPrevious: boolean;
  hasNext: boolean;
  knownTotal: number | null;
  scanTruncated: boolean;
  jobs: Array<{
    id: string;
    queueName: string;
    name: string;
    status: QueueJobStatus;
    shop: string | null;
    attribution: "known" | "unresolved" | "orphan";
    attemptsMade: number;
    eventAt: string | null;
    failedReason: string;
  }>;
  facets: {
    shops: Array<{ value: string; label: string }>;
    hasOrphans: boolean;
    hasUnresolved: boolean;
  };
};

type FailedJobDetail = {
  id: string;
  queueName: string;
  name: string;
  status: QueueJobStatus;
  shop: string | null;
  attribution: "known" | "unresolved" | "orphan";
  attemptsMade: number;
  timestamp: string | null;
  processedOn: string | null;
  finishedOn: string | null;
  failedReason: string;
  stacktrace: string[];
  data: unknown;
};

const DESKTOP_BREAKPOINT = 768;
const SIDEBAR_WIDTH = 240;
const MIN_DRAWER_WIDTH = 448;
const RESIZE_STEP = 32;

function getWorkspaceWidth(viewportWidth: number) {
  return viewportWidth >= DESKTOP_BREAKPOINT
    ? viewportWidth - SIDEBAR_WIDTH
    : viewportWidth;
}

function clampDrawerWidth(width: number, maximum: number) {
  return Math.min(maximum, Math.max(MIN_DRAWER_WIDTH, width));
}

function formatTime(value: string | null) {
  if (!value) return "None observed";
  return new Date(value).toLocaleTimeString("en-GB");
}

function formatDateTime(value: string | null) {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "medium",
  });
}

function formatJobData(data: unknown) {
  try {
    return JSON.stringify(data, null, 2) ?? "null";
  } catch {
    return "Payload could not be formatted.";
  }
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copyValue() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100"
      onClick={() => void copyValue()}
      aria-label={`Copy ${label}`}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function QueueMonitor() {
  const [refreshMs, setRefreshMs] = useState(getInitialRefreshMs);
  const [snapshot, setSnapshot] = useState<QueueMonitorSnapshot | null>(null);
  const [selectedQueueName, setSelectedQueueName] = useState<string | null>(
    null,
  );
  const [drawerWidth, setDrawerWidth] = useState<number | null>(null);
  const [viewportWidth, setViewportWidth] = useState<number | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [queueJobs, setQueueJobs] = useState<QueueJobSnapshot | null>(null);
  const [showAllJobs, setShowAllJobs] = useState(false);
  const [queueJobPage, setQueueJobPage] = useState(1);
  const [queueJobShop, setQueueJobShop] = useState<QueueJobShop>("*");
  const [queueJobStatus, setQueueJobStatus] =
    useState<QueueJobStatus>("failed");
  const [queueJobDirection, setQueueJobDirection] =
    useState<QueueJobDirection>("desc");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [jobDetail, setJobDetail] = useState<FailedJobDetail | null>(null);
  const [jobDetailError, setJobDetailError] = useState<string | null>(null);
  const [jobDetailLoading, setJobDetailLoading] = useState(false);
  const [queueJobsError, setQueueJobsError] = useState<string | null>(null);
  const [queueJobsLoading, setQueueJobsLoading] = useState(false);
  const [queueJobsRefreshKey, setQueueJobsRefreshKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const requestRef = useRef<AbortController | null>(null);
  const queueJobsRequestRef = useRef<AbortController | null>(null);
  const jobDetailRequestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const updateViewportWidth = () => setViewportWidth(window.innerWidth);
    updateViewportWidth();
    window.addEventListener("resize", updateViewportWidth);
    return () => window.removeEventListener("resize", updateViewportWidth);
  }, []);

  useEffect(() => {
    if (!isResizing || !selectedQueueName) return undefined;

    const handlePointerMove = (event: PointerEvent) => {
      const maximum = getWorkspaceWidth(window.innerWidth);
      setDrawerWidth(clampDrawerWidth(window.innerWidth - event.clientX, maximum));
    };
    const stopResizing = () => setIsResizing(false);

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResizing);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResizing);
    };
  }, [isResizing, selectedQueueName]);

  const maximumDrawerWidth = viewportWidth
    ? getWorkspaceWidth(viewportWidth)
    : null;
  const activeDrawerWidth = drawerWidth ?? maximumDrawerWidth;

  function prepareQueueJobsLoad() {
    setQueueJobsLoading(true);
    setQueueJobsError(null);
  }

  function selectQueue(queueName: string) {
    if (!selectedQueueName) setDrawerWidth(null);
    queueJobsRequestRef.current?.abort();
    jobDetailRequestRef.current?.abort();
    setSelectedQueueName(queueName);
    setQueueJobs(null);
    setShowAllJobs(false);
    setQueueJobPage(1);
    setQueueJobsError(null);
    setSelectedJobId(null);
    setJobDetail(null);
    setJobDetailError(null);
    setJobDetailLoading(false);
    prepareQueueJobsLoad();
  }

  function refreshQueueJobs() {
    prepareQueueJobsLoad();
    setQueueJobsRefreshKey((current) => current + 1);
  }
  const inFlightRef = useRef(false);

  async function refresh() {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);

    try {
      const response = await fetch("/api/admin/queues", {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Queue data unavailable");
      const nextSnapshot = (await response.json()) as QueueMonitorSnapshot;
      setSnapshot(nextSnapshot);
      setError(null);
      if (selectedQueueName) refreshQueueJobs();
    } catch (fetchError) {
      if (!(
        fetchError instanceof DOMException && fetchError.name === "AbortError"
      )) {
        setError(
          "Queue data is unavailable. The last successful snapshot is shown when available.",
        );
      }
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
      inFlightRef.current = false;
      setLoading(false);
    }
  }

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => void refresh(), 0);

    return () => {
      window.clearTimeout(initialRefresh);
      requestRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, String(refreshMs));
    if (refreshMs === 0) return undefined;
    const timer = window.setInterval(() => void refresh(), refreshMs);
    return () => window.clearInterval(timer);
  }, [refreshMs]);

  useEffect(() => {
    if (!selectedQueueName) {
      return undefined;
    }

    const controller = new AbortController();
    queueJobsRequestRef.current?.abort();
    queueJobsRequestRef.current = controller;

    const params = new URLSearchParams({
      queue: selectedQueueName,
      status: queueJobStatus,
      shop: queueJobShop,
      page: String(queueJobPage),
      limit: showAllJobs ? "10" : "5",
      direction: queueJobDirection,
    });

    void fetch(`/api/admin/queues/jobs?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Queue jobs unavailable");
        return (await response.json()) as QueueJobSnapshot;
      })
      .then((nextQueueJobs) => {
        setQueueJobs(nextQueueJobs);
        setSelectedJobId(null);
        setJobDetail(null);
        setJobDetailError(null);
        setJobDetailLoading(false);
      })
      .catch((fetchError) => {
        if (!(
          fetchError instanceof DOMException && fetchError.name === "AbortError"
        )) {
          setQueueJobsError(
            "Queue jobs are unavailable. Try refreshing this queue.",
          );
          setQueueJobs(null);
        }
      })
      .finally(() => {
        if (queueJobsRequestRef.current === controller) {
          queueJobsRequestRef.current = null;
          setQueueJobsLoading(false);
        }
      });

    return () => controller.abort();
  }, [
    selectedQueueName,
    queueJobShop,
    queueJobStatus,
    queueJobDirection,
    queueJobPage,
    showAllJobs,
    queueJobsRefreshKey,
  ]);

  useEffect(() => {
    if (!selectedQueueName || !selectedJobId) {
      jobDetailRequestRef.current?.abort();
      return undefined;
    }

    const controller = new AbortController();
    jobDetailRequestRef.current?.abort();
    jobDetailRequestRef.current = controller;
    const params = new URLSearchParams({
      queue: selectedQueueName,
      status: queueJobStatus,
      jobId: selectedJobId,
    });

    void fetch(`/api/admin/queues/jobs/detail?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 404)
          throw new Error("Selected queue job is no longer available.");
        if (!response.ok)
          throw new Error("Selected queue job details are unavailable.");
        return (await response.json()) as FailedJobDetail;
      })
      .then((nextDetail) => {
        setJobDetail(nextDetail);
        setJobDetailError(null);
      })
      .catch((fetchError) => {
        if (!(
          fetchError instanceof DOMException && fetchError.name === "AbortError"
        )) {
          setJobDetail(null);
          setJobDetailError(
            fetchError instanceof Error
              ? fetchError.message
              : "Selected queue job details are unavailable.",
          );
        }
      })
      .finally(() => {
        if (jobDetailRequestRef.current === controller) {
          jobDetailRequestRef.current = null;
          setJobDetailLoading(false);
        }
      });

    return () => controller.abort();
  }, [selectedQueueName, selectedJobId, queueJobStatus]);

  return (
    <section
      className="mb-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
      aria-labelledby="queue-monitor-title"
    >
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <h2
            id="queue-monitor-title"
            className="text-lg font-semibold text-[var(--brand-900)]"
          >
            Shopify Queue Activity
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Read-only operational view. Completed jobs may disappear immediately
            after processing.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-gray-600" htmlFor="queue-refresh-rate">
            Refresh
          </label>
          <select
            id="queue-refresh-rate"
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700"
            value={refreshMs}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (isRefreshValue(value)) setRefreshMs(value);
            }}
          >
            {REFRESH_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="rounded-md bg-[var(--brand-700)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--brand-900)] disabled:opacity-50"
            onClick={() => void refresh()}
            disabled={loading}
          >
            Refresh now
          </button>
        </div>
      </div>

      <p
        className={`mt-4 text-sm ${error ? "text-amber-700" : "text-gray-500"}`}
        role={error ? "status" : undefined}
      >
        {error ??
          (snapshot
            ? `Last updated: ${formatTime(snapshot.observedAt)}`
            : "Loading queue data...")}
      </p>

      {snapshot ? (
        <>
          <div className="mt-5">
            <div className="min-w-0 overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-[960px] w-full text-left text-sm">
                <caption className="sr-only">
                  Shopify queue operational summary
                </caption>
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3 font-medium" scope="col">
                      Queue
                    </th>
                    <th className="px-4 py-3 font-medium" scope="col">
                      Job label
                    </th>
                    <th
                      className="px-4 py-3 text-right font-medium"
                      scope="col"
                    >
                      Waiting
                    </th>
                    <th
                      className="px-4 py-3 text-right font-medium"
                      scope="col"
                    >
                      Active
                    </th>
                    <th
                      className="px-4 py-3 text-right font-medium"
                      scope="col"
                    >
                      Delayed
                    </th>
                    <th
                      className="px-4 py-3 text-right font-medium"
                      scope="col"
                    >
                      Failed
                    </th>
                    <th
                      className="px-4 py-3 text-right font-medium"
                      scope="col"
                    >
                      Workers
                    </th>
                    <th className="px-4 py-3 font-medium" scope="col">
                      Last Redis activity
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {snapshot.queues.map((queue) => (
                    <tr
                      key={queue.queueName}
                      className={
                        selectedQueueName === queue.queueName
                          ? "bg-[var(--brand-50)]"
                          : undefined
                      }
                    >
                      <th
                        className="whitespace-nowrap px-4 py-4 font-semibold text-gray-900"
                        scope="row"
                      >
                        <button
                          type="button"
                          className="font-semibold text-[var(--brand-900)] underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-700)]"
                          aria-label={`Open ${queue.queueName} queue details`}
                          onClick={() => selectQueue(queue.queueName)}
                        >
                          {queue.queueName}
                        </button>
                      </th>
                      <td className="max-w-56 px-4 py-4 text-gray-600">
                        {queue.jobNames.join(", ")}
                      </td>
                      <td className="px-4 py-4 text-right text-gray-700">
                        {queue.counts.waiting}
                      </td>
                      <td className="px-4 py-4 text-right font-semibold text-gray-900">
                        {queue.counts.active}
                      </td>
                      <td className="px-4 py-4 text-right text-gray-700">
                        {queue.counts.delayed}
                      </td>
                      <td className="px-4 py-4 text-right text-gray-700">
                        {queue.counts.failed}
                      </td>
                      <td className="px-4 py-4 text-right text-gray-700">
                        {queue.counts.workers}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-gray-600">
                        {queue.lastActivity?.event ?? "None observed"} at{" "}
                        {formatTime(queue.lastActivity?.observedAt ?? null)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {selectedQueueName ? (
              <aside
                className="fixed inset-y-0 right-0 z-50 flex w-screen max-w-full flex-col border-l border-[var(--brand-200)] bg-white shadow-2xl md:w-[calc(100vw-15rem)]"
                aria-labelledby="queue-details-title"
                data-testid="queue-details-drawer"
                style={activeDrawerWidth ? { width: `${activeDrawerWidth}px` } : undefined}
              >
                <div
                  className="absolute inset-y-0 left-0 z-10 hidden w-3 -translate-x-1/2 cursor-col-resize items-center justify-center md:flex"
                  role="separator"
                  tabIndex={0}
                  aria-label="Resize queue details panel"
                  aria-orientation="vertical"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    setIsResizing(true);
                  }}
                  onKeyDown={(event) => {
                    if (!maximumDrawerWidth) return;
                    const currentWidth = drawerWidth ?? maximumDrawerWidth;
                    if (event.key === "ArrowLeft") {
                      event.preventDefault();
                      setDrawerWidth(
                        clampDrawerWidth(
                          currentWidth + RESIZE_STEP,
                          maximumDrawerWidth,
                        ),
                      );
                    } else if (event.key === "ArrowRight") {
                      event.preventDefault();
                      setDrawerWidth(
                        clampDrawerWidth(
                          currentWidth - RESIZE_STEP,
                          maximumDrawerWidth,
                        ),
                      );
                    } else if (event.key === "Home") {
                      event.preventDefault();
                      setDrawerWidth(MIN_DRAWER_WIDTH);
                    } else if (event.key === "End") {
                      event.preventDefault();
                      setDrawerWidth(maximumDrawerWidth);
                    }
                  }}
                >
                  <span className="h-12 w-1 rounded-full bg-gray-300 transition-colors hover:bg-[var(--brand-500)]" />
                </div>
                <div className="flex items-start justify-between gap-4 border-b border-gray-200 p-5">
                  <div>
                    <h3
                      id="queue-details-title"
                      className="text-lg font-semibold text-gray-950"
                    >
                      Queue details
                    </h3>
                    <p className="mt-1 text-sm text-gray-600">
                      <span className="font-medium text-[var(--brand-900)]">
                        {selectedQueueName}
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100"
                      aria-label="Maximize queue details"
                      onClick={() => setDrawerWidth(null)}
                    >
                      Maximize
                    </button>
                    <button
                      type="button"
                      className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                      aria-label="Close queue details"
                      onClick={() => {
                        setSelectedQueueName(null);
                        setDrawerWidth(null);
                        setIsResizing(false);
                      }}
                    >
                      <span aria-hidden="true" className="text-xl leading-none">
                        &times;
                      </span>
                    </button>
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-5">
                  {(() => {
                    const selectedQueue = snapshot.queues.find(
                      (queue) => queue.queueName === selectedQueueName,
                    );
                    return selectedQueue ? (
                      <>
                        <div className="grid gap-3 sm:grid-cols-5">
                          {[
                            ["Waiting", selectedQueue.counts.waiting],
                            ["Active", selectedQueue.counts.active],
                            ["Delayed", selectedQueue.counts.delayed],
                            ["Failed", selectedQueue.counts.failed],
                            ["Workers", selectedQueue.counts.workers],
                          ].map(([label, value]) => (
                            <div key={label} className="rounded-md border border-gray-200 bg-gray-50 p-3">
                              <dt className="text-xs uppercase tracking-wide text-gray-500">{label}</dt>
                              <dd className="mt-1 text-xl font-semibold text-gray-900">{value}</dd>
                            </div>
                          ))}
                        </div>
                        <div className="mt-5 rounded-md border border-gray-200 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <h4 className="font-semibold text-gray-900">Queue information</h4>
                              <p className="mt-1 text-sm text-gray-600">
                                {selectedQueue.jobNames.join(", ")}
                              </p>
                            </div>
                            <span className={`rounded-full px-2 py-1 text-xs font-medium ${selectedQueue.counts.workers > 0 ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-700"}`}>
                              {selectedQueue.counts.workers > 0 ? "Worker online" : "No workers online"}
                            </span>
                          </div>
                          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                            <div><dt className="text-gray-500">Queue name</dt><dd className="mt-1 font-medium text-gray-900">{selectedQueue.queueName}</dd></div>
                            <div><dt className="text-gray-500">Last Redis activity</dt><dd className="mt-1 text-gray-900">{selectedQueue.lastActivity ? `${selectedQueue.lastActivity.event} at ${formatTime(selectedQueue.lastActivity.observedAt)}` : "None observed"}</dd></div>
                            <div><dt className="text-gray-500">Last snapshot</dt><dd className="mt-1 text-gray-900">{formatTime(snapshot.observedAt)}</dd></div>
                          </dl>
                        </div>
                      </>
                    ) : null;
                  })()}
                  {!selectedJobId ? <>
                  <div className="mt-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-end lg:flex-col">
                    <div>
                      <h4
                        id="failed-job-browser-title"
                        className="font-semibold text-gray-900"
                      >
                        {showAllJobs ? "All queue jobs" : "Recent jobs"}
                      </h4>
                      <p className="mt-1 text-sm text-gray-600">
                        {queueJobs
                          ? `${queueJobs.jobs.length} shown${showAllJobs && queueJobs.scanTruncated ? " from a bounded scan" : ""}`
                          : "Read-only queue diagnostics"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-end gap-3">
                      <label className="text-sm text-gray-600">
                        <span className="block text-xs uppercase tracking-wide text-gray-500">
                          Shop
                        </span>
                        <select
                          aria-label="Shop"
                          className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700"
                          value={queueJobShop}
                          onChange={(event) => {
                            prepareQueueJobsLoad();
                            setQueueJobShop(event.target.value);
                            setQueueJobPage(1);
                            setSelectedJobId(null);
                            setJobDetail(null);
                          }}
                        >
                          <option value="*">All shops</option>
                          {queueJobs?.facets.shops.map((shop) => (
                            <option key={shop.value} value={shop.value}>{shop.label}</option>
                          ))}
                          {queueJobs?.facets.hasOrphans ? <option value="__orphan__">Orphan / No shop</option> : null}
                          {queueJobs?.facets.hasUnresolved ? <option value="__unresolved__">Unresolved</option> : null}
                        </select>
                      </label>
                      <label className="text-sm text-gray-600">
                        <span className="block text-xs uppercase tracking-wide text-gray-500">
                          Status
                        </span>
                        <select
                          aria-label="Status"
                          className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700"
                          value={queueJobStatus}
                          onChange={(event) => {
                            prepareQueueJobsLoad();
                            setQueueJobStatus(event.target.value as QueueJobStatus);
                            setQueueJobPage(1);
                            setSelectedJobId(null);
                            setJobDetail(null);
                          }}
                        >
                          <option value="failed">Failed</option>
                          <option value="active">Active</option>
                          <option value="waiting">Waiting</option>
                          <option value="delayed">Delayed</option>
                        </select>
                      </label>
                      <label className="text-sm text-gray-600">
                        <span className="block text-xs uppercase tracking-wide text-gray-500">Direction</span>
                        <select
                          aria-label="Direction"
                          className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700"
                          value={queueJobDirection}
                          onChange={(event) => {
                            prepareQueueJobsLoad();
                            setQueueJobDirection(event.target.value as QueueJobDirection);
                            setQueueJobPage(1);
                          }}
                        >
                          <option value="desc">Descending</option>
                          <option value="asc">Ascending</option>
                        </select>
                      </label>
                      <button
                        type="button"
                        className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                        onClick={refreshQueueJobs}
                        disabled={queueJobsLoading}
                      >
                        Refresh jobs
                      </button>
                    </div>
                  </div>

                  {!selectedJobId && queueJobsLoading ? (
                    <p className="mt-4 text-sm text-gray-500" role="status">
                      Loading queue jobs...
                    </p>
                  ) : !selectedJobId && queueJobsError ? (
                    <p className="mt-4 text-sm text-amber-700" role="status">
                      {queueJobsError}
                    </p>
                  ) : !selectedJobId && queueJobs && queueJobs.jobs.length === 0 ? (
                    <p className="mt-4 rounded-md border border-dashed border-gray-300 bg-white p-5 text-sm text-gray-500">
                      No {queueJobStatus} jobs were found for this queue.
                    </p>
                  ) : !selectedJobId && queueJobs ? (
                    <div className="mt-4 overflow-x-auto rounded-md border border-gray-200 bg-white">
                      <table className="min-w-[900px] w-full text-left text-sm">
                        <caption className="sr-only">
                          Recent jobs for {selectedQueueName}
                        </caption>
                        <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                          <tr>
                            <th className="px-4 py-3 font-medium" scope="col">
                              Job ID
                            </th>
                            <th className="px-4 py-3 font-medium" scope="col">Shop</th>
                            <th className="px-4 py-3 font-medium" scope="col">
                              Job name
                            </th>
                            <th className="px-4 py-3 font-medium" scope="col">
                              {queueJobStatus === "failed"
                                ? "Failed at"
                                : queueJobStatus === "active"
                                  ? "Started / processed at"
                                  : queueJobStatus === "waiting"
                                    ? "Queued at"
                                    : "Scheduled at"}
                            </th>
                            <th
                              className="px-4 py-3 text-right font-medium"
                              scope="col"
                            >
                              Attempts
                            </th>
                            <th className="px-4 py-3 font-medium" scope="col">{queueJobStatus === "failed" ? "Reason" : "Status"}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {queueJobs.jobs.map((job) => (
                            <tr
                              key={job.id}
                              className={
                                selectedJobId === job.id
                                  ? "bg-[var(--brand-50)]"
                                  : undefined
                              }
                              aria-selected={selectedJobId === job.id}
                            >
                              <td className="max-w-44 px-4 py-3">
                                <button
                                  type="button"
                                  className="max-w-40 truncate font-medium text-[var(--brand-700)] hover:text-[var(--brand-900)]"
                                  title={job.id}
                                  onClick={() => {
                                    setSelectedJobId(job.id);
                                    setJobDetail(null);
                                    setJobDetailError(null);
                                    setJobDetailLoading(true);
                                  }}
                                >
                                  {job.id}
                                </button>
                              </td>
                              <td className="px-4 py-3 text-gray-700">
                                {job.shop ?? (job.attribution === "unresolved" ? "Unresolved" : "Orphan / No shop")}
                              </td>
                              <td className="px-4 py-3 text-gray-700">
                                {job.name}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                                {formatTime(job.eventAt)}
                              </td>
                              <td className="px-4 py-3 text-right text-gray-700">
                                {job.attemptsMade}
                              </td>
                              <td
                                className="max-w-72 px-4 py-3 text-gray-600"
                                title={job.failedReason || `${queueJobStatus} job`}
                              >
                                <span className="block max-w-72 truncate">
                                  {queueJobStatus === "failed"
                                    ? job.failedReason || "No reason recorded"
                                    : queueJobStatus[0].toUpperCase() + queueJobStatus.slice(1)}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}

                  {showAllJobs && queueJobs && (queueJobs.hasPrevious || queueJobs.hasNext || queueJobs.knownTotal !== null) ? (
                    <nav className="mt-4 flex flex-wrap items-center justify-between gap-3" aria-label="Queue job pages">
                      <button
                        type="button"
                        className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={!queueJobs.hasPrevious || queueJobsLoading}
                        onClick={() => setQueueJobPage((page) => Math.max(1, page - 1))}
                      >
                        Previous
                      </button>
                      <span className="text-sm text-gray-600" aria-live="polite">
                        Page {queueJobs.page}{queueJobs.knownTotal !== null ? ` of ${Math.max(1, Math.ceil(queueJobs.knownTotal / queueJobs.limit))}` : " of more"}
                      </span>
                      <button
                        type="button"
                        className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={!queueJobs.hasNext || queueJobsLoading}
                        onClick={() => setQueueJobPage((page) => page + 1)}
                      >
                        Next
                      </button>
                    </nav>
                  ) : null}

                  {!showAllJobs ? <div className="mt-4">
                    <button
                      type="button"
                      className="text-sm font-medium text-[var(--brand-700)] hover:text-[var(--brand-900)]"
                      onClick={() => {
                        setShowAllJobs(true);
                        setQueueJobPage(1);
                        setSelectedJobId(null);
                        setJobDetail(null);
                      }}
                    >
                      View all jobs
                    </button>
                  </div> : null}
                  </> : null}

                  {selectedJobId ? (
                    <section
                      className="mt-5 rounded-lg border border-gray-200 bg-gray-50 p-4"
                      aria-labelledby="failed-job-detail-title"
                    >
                      <button
                        type="button"
                        className="mb-4 text-sm font-medium text-[var(--brand-700)] hover:text-[var(--brand-900)]"
                        onClick={() => {
                          setSelectedJobId(null);
                          setJobDetail(null);
                          setJobDetailError(null);
                          setJobDetailLoading(false);
                        }}
                      >
                        Back to {showAllJobs ? "all jobs" : "recent jobs"}
                      </button>
                      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                        <div>
                          <h4
                            id="failed-job-detail-title"
                            className="font-semibold text-gray-900"
                          >
                            Queue job details
                          </h4>
                          <p className="mt-1 text-sm text-gray-600">
                            Selected job:{" "}
                            <span className="font-medium text-gray-900">
                              {selectedJobId}
                            </span>
                          </p>
                        </div>
                        <CopyButton value={selectedJobId} label="job ID" />
                      </div>

                      {jobDetailLoading ? (
                        <p className="mt-4 text-sm text-gray-500" role="status">
                          Loading queue job details...
                        </p>
                      ) : jobDetailError ? (
                        <p
                          className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"
                          role="status"
                        >
                          {jobDetailError}
                        </p>
                      ) : jobDetail ? (
                        <>
                          <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            {[
                              ["Queue", jobDetail.queueName],
                              ["Job name", jobDetail.name],
                              ["Status", jobDetail.status],
                              [
                                "Shop",
                                jobDetail.shop ??
                                  (jobDetail.attribution === "unresolved"
                                    ? "Unresolved"
                                    : "Orphan / No shop"),
                              ],
                              ["Attempts made", String(jobDetail.attemptsMade)],
                              ["Created", formatDateTime(jobDetail.timestamp)],
                              [
                                "Processed at",
                                formatDateTime(jobDetail.processedOn),
                              ],
                              [
                                "Finished at",
                                formatDateTime(jobDetail.finishedOn),
                              ],
                            ].map(([label, value]) => (
                              <div key={label} className="min-w-0">
                                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                                  {label}
                                </dt>
                                <dd className="mt-1 break-words text-sm text-gray-900">
                                  {value}
                                </dd>
                              </div>
                            ))}
                          </dl>

                          {jobDetail.status === "failed" ? <div className="mt-5 border-t border-gray-200 pt-5">
                            <div className="flex items-center justify-between gap-3">
                              <h5 className="text-sm font-semibold text-gray-900">
                                Failed reason
                              </h5>
                              <CopyButton
                                value={
                                  jobDetail.failedReason || "No reason recorded"
                                }
                                label="failed reason"
                              />
                            </div>
                            <p className="mt-2 whitespace-pre-wrap break-words rounded-md bg-amber-50 p-4 text-sm text-amber-900">
                              {jobDetail.failedReason || "No reason recorded"}
                            </p>
                          </div> : null}

                          <div className="mt-5 border-t border-gray-200 pt-5">
                            <div className="flex items-center justify-between gap-3">
                              <h5 className="text-sm font-semibold text-gray-900">
                                Stack trace
                              </h5>
                              <CopyButton
                                value={jobDetail.stacktrace.join("\n")}
                                label="stack trace"
                              />
                            </div>
                            <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-gray-950 p-4 text-xs leading-5 text-gray-100">
                              {jobDetail.stacktrace.length > 0
                                ? jobDetail.stacktrace.join("\n")
                                : "No stack trace recorded"}
                            </pre>
                          </div>

                          <div className="mt-5 border-t border-gray-200 pt-5">
                            <div className="flex items-center justify-between gap-3">
                              <h5 className="text-sm font-semibold text-gray-900">
                                Payload / job data
                              </h5>
                              <CopyButton
                                value={formatJobData(jobDetail.data)}
                                label="job data"
                              />
                            </div>
                            <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-gray-50 p-4 text-xs leading-5 text-gray-800">
                              {formatJobData(jobDetail.data)}
                            </pre>
                          </div>
                        </>
                      ) : null}
                    </section>
                  ) : null}
                </div>
              </aside>
            ) : null}
          </div>
        </>
      ) : (
        <p className="mt-5 rounded-lg border border-dashed border-gray-300 p-6 text-sm text-gray-500">
          {loading
            ? "Waiting for the first queue snapshot..."
            : "No queue snapshot is available."}
        </p>
      )}
    </section>
  );
}
