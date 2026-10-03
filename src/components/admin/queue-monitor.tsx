"use client";

import { useEffect, useRef, useState } from "react";
import { adminI18n } from "@/i18n";

import { isRefreshValue, REFRESH_OPTIONS } from "./queue-monitor-refresh";
import {
  formatQueueMonitorTime as formatTime,
  QueueSummaryTable,
} from "./queue-monitor/queue-summary-table";
import { QueueDetailDrawer } from "./queue-monitor/queue-detail-drawer";
import { useResizableDrawer } from "./queue-monitor/use-resizable-drawer";
import { useQueueJobDetail } from "./queue-monitor/use-queue-job-detail";
import { useQueueMonitorSummary } from "./queue-monitor/use-queue-monitor-summary";
import {
  useQueueJobs,
  type QueueJobsSelectionInvalidationReason,
} from "./queue-monitor/use-queue-jobs";

export function QueueMonitor() {
  const [selectedQueueName, setSelectedQueueName] = useState<string | null>(
    null,
  );
  const drawerState = useResizableDrawer({ selectedQueueName });
  const { setDrawerWidth } = drawerState;
  const invalidateSelectionRef = useRef<
    (reason: QueueJobsSelectionInvalidationReason) => void
  >(() => {});

  const queueJobsState = useQueueJobs({
    selectedQueueName,
    unavailableError: adminI18n.t("queue.jobsUnavailable"),
    onSelectionInvalidated: (reason) => invalidateSelectionRef.current(reason),
  });
  const { prepareForQueueSelection, queueJobStatus, refreshJobs } =
    queueJobsState;
  const jobDetailState = useQueueJobDetail({
    selectedQueueName,
    status: queueJobStatus,
    jobGoneError: adminI18n.t("queue.jobGone"),
    unavailableError: adminI18n.t("queue.jobDetailsUnavailable"),
  });
  useEffect(() => {
    invalidateSelectionRef.current = jobDetailState.invalidateSelection;
  }, [jobDetailState.invalidateSelection]);

  function selectQueue(queueName: string) {
    if (!selectedQueueName) setDrawerWidth(null);
    setSelectedQueueName(queueName);
    prepareForQueueSelection();
  }

  function refreshQueueJobs() {
    refreshJobs();
  }
  const { refreshMs, setRefreshMs, snapshot, error, loading, refresh } =
    useQueueMonitorSummary({
      unavailableError: adminI18n.t("queue.dataUnavailable"),
      onSnapshotAccepted: () => {
        if (selectedQueueName) refreshQueueJobs();
      },
    });

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
            {adminI18n.t("nav.shopifyQueues")}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {adminI18n.t("queue.readOnlyView")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-gray-600" htmlFor="queue-refresh-rate">
            {adminI18n.t("queue.refresh")}
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
                {!("count" in option)
                  ? adminI18n.t(option.labelKey)
                  : adminI18n.t(option.labelKey, { count: option.count })}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="rounded-md bg-[var(--brand-700)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--brand-900)] disabled:opacity-50"
            onClick={() => void refresh()}
            disabled={loading}
          >
            {adminI18n.t("queue.refreshNow")}
          </button>
        </div>
      </div>

      <p
        className={`mt-4 text-sm ${error ? "text-amber-700" : "text-gray-500"}`}
        role={error ? "status" : undefined}
      >
        {error ??
          (snapshot
            ? adminI18n.t("queue.lastUpdated", {
                time: formatTime(snapshot.observedAt),
              })
            : adminI18n.t("queue.loadingData"))}
      </p>

      {snapshot ? (
        <>
          <div className="mt-5">
            <QueueSummaryTable
              snapshot={snapshot}
              selectedQueueName={selectedQueueName}
              onSelectQueue={selectQueue}
            />
            {selectedQueueName ? (
              <QueueDetailDrawer
                snapshot={snapshot}
                selectedQueueName={selectedQueueName}
                queueJobsState={queueJobsState}
                jobDetailState={jobDetailState}
                drawerState={drawerState}
                setSelectedQueueName={setSelectedQueueName}
              />
            ) : null}
          </div>
        </>
      ) : (
        <p className="mt-5 rounded-lg border border-dashed border-gray-300 p-6 text-sm text-gray-500">
          {loading
            ? adminI18n.t("empty.waitingQueueSnapshot")
            : adminI18n.t("empty.noQueueSnapshot")}
        </p>
      )}
    </section>
  );
}
