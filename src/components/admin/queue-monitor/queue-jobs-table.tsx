"use client";

import { adminI18n, adminStatusLabel } from "@/i18n";

import { formatQueueJobShop } from "./queue-job-shop";
import { formatQueueMonitorTime } from "./queue-summary-table";
import type { useQueueJobs } from "./use-queue-jobs";

type QueueJobsTableProps = {
  state: ReturnType<typeof useQueueJobs>;
  selectedQueueName: string;
  selectedJobId: string | null;
  selectJob: (jobId: string) => void;
};

export function QueueJobsTable({
  state,
  selectedQueueName,
  selectedJobId,
  selectJob,
}: QueueJobsTableProps) {
  const {
    queueJobs,
    showAllJobs,
    queueJobShop,
    queueJobStatus,
    queueJobDirection,
    queueJobsError,
    queueJobsLoading,
    changeShop,
    changeStatus,
    changeDirection,
    refreshJobs,
    viewAll,
    previousPage,
    nextPage,
  } = state;

  function handleDirectionChange(event: { target: { value: string } }) {
    changeDirection(event.target.value as typeof queueJobDirection);
  }

  return (
    <>
      {!selectedJobId ? (
        <>
          <div className="mt-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-end lg:flex-col">
            <div>
              <h4
                id="failed-job-browser-title"
                className="font-semibold text-gray-900"
              >
                {showAllJobs
                  ? adminI18n.t("queue.allJobs")
                  : adminI18n.t("queue.recentJobs")}
              </h4>
              <p className="mt-1 text-sm text-gray-600">
                {queueJobs
                  ? showAllJobs && queueJobs.scanTruncated
                    ? adminI18n.t("queue.shownBounded", {
                        count: queueJobs.jobs.length,
                      })
                    : adminI18n.t("queue.shown", {
                        count: queueJobs.jobs.length,
                      })
                  : adminI18n.t("queue.readOnlyDiagnostics")}
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-sm text-gray-600">
                <span className="block text-xs uppercase tracking-wide text-gray-500">
                  {adminI18n.t("queue.shop")}
                </span>
                <select
                  aria-label={adminI18n.t("queue.shop")}
                  className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700"
                  value={queueJobShop}
                  onChange={(event) => changeShop(event.target.value)}
                >
                  <option value="*">{adminI18n.t("queue.allShops")}</option>
                  {queueJobs?.facets.shops.map((shop) => (
                    <option key={shop.value} value={shop.value}>
                      {shop.label}
                    </option>
                  ))}
                  {queueJobs?.facets.hasOrphans ? (
                    <option value="__orphan__">
                      {adminI18n.t("queue.orphanShop")}
                    </option>
                  ) : null}
                  {queueJobs?.facets.hasUnresolved ? (
                    <option value="__unresolved__">
                      {adminI18n.t("queue.unresolved")}
                    </option>
                  ) : null}
                </select>
              </label>
              <label className="text-sm text-gray-600">
                <span className="block text-xs uppercase tracking-wide text-gray-500">
                  {adminI18n.t("queue.status")}
                </span>
                <select
                  aria-label={adminI18n.t("queue.status")}
                  className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700"
                  value={queueJobStatus}
                  onChange={(event) =>
                    changeStatus(event.target.value as typeof queueJobStatus)
                  }
                >
                  <option value="failed">{adminStatusLabel("failed")}</option>
                  <option value="active">{adminStatusLabel("active")}</option>
                  <option value="waiting">{adminStatusLabel("waiting")}</option>
                  <option value="delayed">{adminStatusLabel("delayed")}</option>
                </select>
              </label>
              <label className="text-sm text-gray-600">
                <span className="block text-xs uppercase tracking-wide text-gray-500">
                  {adminI18n.t("queue.direction")}
                </span>
                <select
                  aria-label={adminI18n.t("queue.direction")}
                  className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700"
                  value={queueJobDirection}
                  onChange={handleDirectionChange}
                >
                  <option value="desc">
                    {adminI18n.t("queue.descending")}
                  </option>
                  <option value="asc">{adminI18n.t("queue.ascending")}</option>
                </select>
              </label>
              <button
                type="button"
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                onClick={refreshJobs}
                disabled={queueJobsLoading || selectedJobId !== null}
              >
                {adminI18n.t("queue.refreshJobs")}
              </button>
            </div>
          </div>

          {queueJobsLoading ? (
            <p className="mt-4 text-sm text-gray-500" role="status">
              {adminI18n.t("queue.loadingJobs")}
            </p>
          ) : queueJobsError ? (
            <p className="mt-4 text-sm text-amber-700" role="status">
              {queueJobsError}
            </p>
          ) : queueJobs && queueJobs.jobs.length === 0 ? (
            <p className="mt-4 rounded-md border border-dashed border-gray-300 bg-white p-5 text-sm text-gray-500">
              {adminI18n.t("queue.jobStatusEmpty", {
                status: adminStatusLabel(queueJobStatus),
              })}
            </p>
          ) : queueJobs ? (
            <div className="mt-4 overflow-x-auto rounded-md border border-gray-200 bg-white">
              <table className="min-w-[900px] w-full text-left text-sm">
                <caption className="sr-only">
                  {adminI18n.t("queue.recentJobsFor", {
                    queueName: selectedQueueName,
                  })}
                </caption>
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3 font-medium" scope="col">
                      {adminI18n.t("queue.jobId")}
                    </th>
                    <th className="px-4 py-3 font-medium" scope="col">
                      {adminI18n.t("queue.shop")}
                    </th>
                    <th className="px-4 py-3 font-medium" scope="col">
                      {adminI18n.t("queue.jobName")}
                    </th>
                    <th className="px-4 py-3 font-medium" scope="col">
                      {queueJobStatus === "failed"
                        ? adminI18n.t("queue.failedAt")
                        : queueJobStatus === "active"
                          ? adminI18n.t("queue.startedProcessedAt")
                          : queueJobStatus === "waiting"
                            ? adminI18n.t("queue.queuedAt")
                            : adminI18n.t("queue.scheduledAt")}
                    </th>
                    <th
                      className="px-4 py-3 text-right font-medium"
                      scope="col"
                    >
                      {adminI18n.t("queue.attempts")}
                    </th>
                    <th className="px-4 py-3 font-medium" scope="col">
                      {queueJobStatus === "failed"
                        ? adminI18n.t("queue.reason")
                        : adminI18n.t("queue.status")}
                    </th>
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
                          onClick={() => selectJob(job.id)}
                        >
                          {job.id}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {formatQueueJobShop(job.shop, job.attribution, job.shopDomain)}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{job.name}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                        {formatQueueMonitorTime(job.eventAt)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">
                        {job.attemptsMade}
                      </td>
                      <td
                        className="max-w-72 px-4 py-3 text-gray-600"
                        title={
                          job.failedReason ||
                          adminI18n.t("queue.statusJob", {
                            status: adminStatusLabel(queueJobStatus),
                          })
                        }
                      >
                        <span className="block max-w-72 truncate">
                          {queueJobStatus === "failed"
                            ? job.failedReason || adminI18n.t("empty.noReason")
                            : adminStatusLabel(queueJobStatus)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {showAllJobs &&
          queueJobs &&
          (queueJobs.hasPrevious ||
            queueJobs.hasNext ||
            queueJobs.knownTotal !== null) ? (
            <nav
              className="mt-4 flex flex-wrap items-center justify-between gap-3"
              aria-label={adminI18n.t("pagination.queuePages")}
            >
              <button
                type="button"
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!queueJobs.hasPrevious || queueJobsLoading}
                onClick={previousPage}
              >
                {adminI18n.t("pagination.previous")}
              </button>
              <span className="text-sm text-gray-600" aria-live="polite">
                {queueJobs.knownTotal !== null
                  ? adminI18n.t("pagination.page", {
                      page: queueJobs.page,
                      totalPages: Math.max(
                        1,
                        Math.ceil(queueJobs.knownTotal / queueJobs.limit),
                      ),
                    })
                  : adminI18n.t("pagination.pageOfMore", {
                      page: queueJobs.page,
                    })}
              </span>
              <button
                type="button"
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!queueJobs.hasNext || queueJobsLoading}
                onClick={nextPage}
              >
                {adminI18n.t("pagination.next")}
              </button>
            </nav>
          ) : null}

          {!showAllJobs ? (
            <div className="mt-4">
              <button
                type="button"
                className="text-sm font-medium text-[var(--brand-700)] hover:text-[var(--brand-900)]"
                onClick={viewAll}
              >
                {adminI18n.t("queue.viewAllJobs")}
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </>
  );
}
