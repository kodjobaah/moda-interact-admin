"use client";

import type { ReactNode } from "react";
import { adminI18n, adminQueueJobLabel } from "@/i18n";

import { isRefreshValue, REFRESH_OPTIONS } from "../queue-monitor-refresh";
import { QueueJobDetail } from "./queue-job-detail";
import { QueueJobsTable } from "./queue-jobs-table";
import { formatQueueMonitorTime } from "./queue-summary-table";
import type { QueueMonitorSnapshot } from "./queue-monitor.types";
import type { useQueueJobDetail } from "./use-queue-job-detail";
import type { useQueueJobs } from "./use-queue-jobs";
import type { useResizableDrawer } from "./use-resizable-drawer";

type QueueDetailDrawerProps = {
  snapshot: QueueMonitorSnapshot;
  selectedQueueName: string;
  queueJobsState: ReturnType<typeof useQueueJobs>;
  jobDetailState: ReturnType<typeof useQueueJobDetail>;
  drawerState: ReturnType<typeof useResizableDrawer>;
  refreshMs: number;
  setRefreshMs: (refreshMs: number) => void;
  summaryLoading: boolean;
  refreshSummary: () => Promise<void>;
  setSelectedQueueName: (queueName: string | null) => void;
};

type BreadcrumbButtonProps = {
  children: ReactNode;
  onClick?: () => void;
  current?: boolean;
};

function BreadcrumbButton({
  children,
  onClick,
  current = false,
}: BreadcrumbButtonProps) {
  if (!onClick) {
    return (
      <span
        aria-current={current ? "page" : undefined}
        className={`truncate ${current ? "font-medium text-gray-900" : "text-gray-600"}`}
      >
        {children}
      </span>
    );
  }

  return (
    <button
      type="button"
      className="truncate text-left text-[var(--brand-700)] hover:text-[var(--brand-900)]"
      onClick={onClick}
      aria-current={current ? "page" : undefined}
    >
      {children}
    </button>
  );
}

export function QueueDetailDrawer({
  snapshot,
  selectedQueueName,
  queueJobsState,
  jobDetailState,
  drawerState,
  refreshMs,
  setRefreshMs,
  summaryLoading,
  refreshSummary,
  setSelectedQueueName,
}: QueueDetailDrawerProps) {
  const {
    activeDrawerWidth,
    maximizeDrawer,
    resizeDrawerForKey,
    setDrawerWidth,
    setIsResizing,
    startResizing,
  } = drawerState;
  const selectedQueue = snapshot.queues.find(
    (queue) => queue.queueName === selectedQueueName,
  );
  const browsingLabel = queueJobsState.showAllJobs
    ? adminI18n.t("queue.allJobs")
    : adminI18n.t("queue.recentJobs");

  return (
    <aside
      className="fixed inset-y-0 right-0 z-50 flex w-screen max-w-full flex-col border-l border-[var(--brand-200)] bg-white shadow-2xl md:w-[calc(100vw-15rem)]"
      aria-labelledby="queue-details-title"
      data-testid="queue-details-drawer"
      style={
        activeDrawerWidth ? { width: `${activeDrawerWidth}px` } : undefined
      }
    >
      <div
        className="absolute inset-y-0 left-0 z-10 hidden w-3 -translate-x-1/2 cursor-col-resize items-center justify-center md:flex"
        role="separator"
        tabIndex={0}
        aria-label={adminI18n.t("queue.resizeDetails")}
        aria-orientation="vertical"
        onPointerDown={(event) => {
          event.preventDefault();
          startResizing();
        }}
        onKeyDown={(event) => {
          if (resizeDrawerForKey(event)) event.preventDefault();
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
            {adminI18n.t("queue.details")}
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
            aria-label={adminI18n.t("queue.maximizeDetails")}
            onClick={maximizeDrawer}
          >
            {adminI18n.t("queue.maximize")}
          </button>
          <button
            type="button"
            className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
            aria-label={adminI18n.t("queue.closeDetails")}
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
      <nav
        aria-label={adminI18n.t("queue.breadcrumbs")}
        className="border-b border-gray-200 bg-white px-5 py-3"
      >
        <ol className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
          <li>
            <BreadcrumbButton
              onClick={() => {
                jobDetailState.clearSelection();
                setSelectedQueueName(null);
                setDrawerWidth(null);
                setIsResizing(false);
              }}
            >
              {adminI18n.t("nav.platformQueues")}
            </BreadcrumbButton>
          </li>
          <li aria-hidden="true" className="text-gray-400">
            /
          </li>
          <li>
            <BreadcrumbButton>{selectedQueueName}</BreadcrumbButton>
          </li>
          <li aria-hidden="true" className="text-gray-400">
            /
          </li>
          <li>
            {jobDetailState.selectedJobId ? (
              <BreadcrumbButton onClick={jobDetailState.clearSelection}>
                {browsingLabel}
              </BreadcrumbButton>
            ) : (
              <BreadcrumbButton current>{browsingLabel}</BreadcrumbButton>
            )}
          </li>
          {jobDetailState.selectedJobId ? (
            <>
              <li aria-hidden="true" className="text-gray-400">
                /
              </li>
              <li>
                <BreadcrumbButton current>
                  {adminI18n.t("queue.jobDetails")}
                </BreadcrumbButton>
              </li>
            </>
          ) : null}
        </ol>
      </nav>
      <div className="flex flex-col justify-between gap-3 border-b border-gray-200 bg-gray-50 px-5 py-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-gray-900">
            {adminI18n.t("queue.refresh")}
          </p>
          <p className="mt-1 text-xs text-gray-600">
            {adminI18n.t("queue.refreshControlHint")}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs uppercase tracking-wide text-gray-500">
            <span className="sr-only">{adminI18n.t("queue.refresh")}</span>
            <select
              id="queue-detail-refresh-rate"
              aria-label={adminI18n.t("queue.refresh")}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm normal-case tracking-normal text-gray-700"
              value={refreshMs}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (isRefreshValue(value)) setRefreshMs(value);
              }}
            >
              {REFRESH_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {!("count" in option)
                    ? adminI18n.t(option.labelKey)
                    : adminI18n.t(option.labelKey, { count: option.count })}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
            onClick={() => void refreshSummary()}
            disabled={summaryLoading || jobDetailState.selectedJobId !== null}
          >
            {adminI18n.t("queue.refreshNow")}
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {selectedQueue ? (
          <>
            <div className="grid gap-3 sm:grid-cols-5">
              {[
                [adminI18n.t("status.waiting"), selectedQueue.counts.waiting],
                [adminI18n.t("status.active"), selectedQueue.counts.active],
                [adminI18n.t("status.delayed"), selectedQueue.counts.delayed],
                [adminI18n.t("status.failed"), selectedQueue.counts.failed],
                [adminI18n.t("queue.workers"), selectedQueue.counts.workers],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-md border border-gray-200 bg-gray-50 p-3"
                >
                  <dt className="text-xs uppercase tracking-wide text-gray-500">
                    {label}
                  </dt>
                  <dd className="mt-1 text-xl font-semibold text-gray-900">
                    {value}
                  </dd>
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-md border border-gray-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="font-semibold text-gray-900">
                    {adminI18n.t("queue.information")}
                  </h4>
                  <p className="mt-1 text-sm text-gray-600">
                    {selectedQueue.jobNames.map(adminQueueJobLabel).join(", ")}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-xs font-medium ${selectedQueue.counts.workers > 0 ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-700"}`}
                >
                  {selectedQueue.counts.workers > 0
                    ? adminI18n.t("queue.workerOnline")
                    : adminI18n.t("queue.noWorkersOnline")}
                </span>
              </div>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-gray-500">
                    {adminI18n.t("queue.queueName")}
                  </dt>
                  <dd className="mt-1 font-medium text-gray-900">
                    {selectedQueue.queueName}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">
                    {adminI18n.t("queue.lastRedisActivity")}
                  </dt>
                  <dd className="mt-1 text-gray-900">
                    {selectedQueue.lastActivity
                      ? adminI18n.t("queue.eventAt", {
                          event: selectedQueue.lastActivity.event,
                          time: formatQueueMonitorTime(
                            selectedQueue.lastActivity.observedAt,
                          ),
                        })
                      : adminI18n.t("empty.noneObserved")}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">
                    {adminI18n.t("queue.lastSnapshot")}
                  </dt>
                  <dd className="mt-1 text-gray-900">
                    {formatQueueMonitorTime(snapshot.observedAt)}
                  </dd>
                </div>
              </dl>
            </div>
          </>
        ) : null}
        <QueueJobsTable
          state={queueJobsState}
          selectedQueueName={selectedQueueName}
          selectedJobId={jobDetailState.selectedJobId}
          selectJob={jobDetailState.selectJob}
        />
        <QueueJobDetail
          state={jobDetailState}
          showAllJobs={queueJobsState.showAllJobs}
        />
      </div>
    </aside>
  );
}
