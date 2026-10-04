"use client";

import { adminI18n, adminQueueJobLabel, adminQueueWorkloadLabel } from "@/i18n";

import type { QueueMonitorSnapshot } from "./queue-monitor.types";

type QueueSummaryTableProps = {
  snapshot: QueueMonitorSnapshot;
  selectedQueueName: string | null;
  onSelectQueue: (queueName: string) => void;
};

export function formatQueueMonitorTime(value: string | null) {
  if (!value) return adminI18n.t("empty.noneObserved");
  return adminI18n.formatDateTime(value, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function QueueSummaryTable({
  snapshot,
  selectedQueueName,
  onSelectQueue,
}: QueueSummaryTableProps) {
  return (
    <div className="min-w-0 overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-[1120px] w-full text-left text-sm">
        <caption className="sr-only">{adminI18n.t("queue.summary")}</caption>
        <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-4 py-3 font-medium" scope="col">
              {adminI18n.t("queue.queue")}
            </th>
            <th className="px-4 py-3 font-medium" scope="col">
              {adminI18n.t("queue.workload")}
            </th>
            <th className="px-4 py-3 font-medium" scope="col">
              {adminI18n.t("queue.jobLabel")}
            </th>
            <th className="px-4 py-3 text-right font-medium" scope="col">
              {adminI18n.t("status.waiting")}
            </th>
            <th className="px-4 py-3 text-right font-medium" scope="col">
              {adminI18n.t("status.active")}
            </th>
            <th className="px-4 py-3 text-right font-medium" scope="col">
              {adminI18n.t("status.delayed")}
            </th>
            <th className="px-4 py-3 text-right font-medium" scope="col">
              {adminI18n.t("status.failed")}
            </th>
            <th className="px-4 py-3 text-right font-medium" scope="col">
              {adminI18n.t("queue.workers")}
            </th>
            <th className="px-4 py-3 font-medium" scope="col">
              {adminI18n.t("queue.lastRedisActivity")}
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
                  aria-label={adminI18n.t("queue.openDetails", {
                    queueName: queue.queueName,
                  })}
                  onClick={() => onSelectQueue(queue.queueName)}
                >
                  {queue.queueName}
                </button>
              </th>
              <td className="whitespace-nowrap px-4 py-4 text-gray-600">
                {adminQueueWorkloadLabel(queue.queueName)}
              </td>
              <td className="max-w-64 px-4 py-4 text-gray-600">
                {queue.jobNames.map(adminQueueJobLabel).join(", ")}
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
                {adminI18n.t("queue.eventAt", {
                  event:
                    queue.lastActivity?.event ??
                    adminI18n.t("empty.noneObserved"),
                  time: formatQueueMonitorTime(
                    queue.lastActivity?.observedAt ?? null,
                  ),
                })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
