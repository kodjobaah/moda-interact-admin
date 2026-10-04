"use client";

import { useState } from "react";
import { adminI18n, adminStatusLabel } from "@/i18n";

import { formatQueueJobShop } from "./queue-job-shop";
import type { useQueueJobDetail } from "./use-queue-job-detail";

type QueueJobDetailProps = {
  state: ReturnType<typeof useQueueJobDetail>;
  showAllJobs: boolean;
};

function formatDateTime(value: string | null) {
  if (!value) return adminI18n.t("empty.notRecorded");
  return adminI18n.formatDateTime(value, {
    dateStyle: "medium",
    timeStyle: "medium",
  });
}

function formatJobData(data: unknown) {
  try {
    return JSON.stringify(data, null, 2) ?? "null";
  } catch {
    return adminI18n.t("format.payloadError");
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
      aria-label={adminI18n.t("queue.copyLabel", { label })}
    >
      {copied ? adminI18n.t("queue.copied") : adminI18n.t("queue.copy")}
    </button>
  );
}

export function QueueJobDetail({ state, showAllJobs }: QueueJobDetailProps) {
  const {
    selectedJobId,
    jobDetail,
    jobDetailError,
    jobDetailLoading,
    clearSelection,
  } = state;

  if (!selectedJobId) return null;

  return (
    <section
      className="mt-5 rounded-lg border border-gray-200 bg-gray-50 p-4"
      aria-labelledby="failed-job-detail-title"
    >
      <button
        type="button"
        className="mb-4 text-sm font-medium text-[var(--brand-700)] hover:text-[var(--brand-900)]"
        onClick={clearSelection}
      >
        {adminI18n.t("queue.backTo", {
          target: showAllJobs
            ? adminI18n.t("queue.allJobs")
            : adminI18n.t("queue.recentJobs"),
        })}
      </button>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h4
            id="failed-job-detail-title"
            className="font-semibold text-gray-900"
          >
            {adminI18n.t("queue.jobDetails")}
          </h4>
          <p className="mt-1 text-sm text-gray-600">
            {adminI18n.t("queue.selectedJob", { jobId: selectedJobId })}
          </p>
          <p className="mt-1 text-xs text-amber-700" role="status">
            {adminI18n.t("queue.refreshStoppedForJob")}
          </p>
        </div>
        <CopyButton value={selectedJobId} label={adminI18n.t("queue.jobId")} />
      </div>

      {jobDetailLoading ? (
        <p className="mt-4 text-sm text-gray-500" role="status">
          {adminI18n.t("queue.loadingJobDetails")}
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
              [adminI18n.t("queue.queue"), jobDetail.queueName],
              [adminI18n.t("queue.jobName"), jobDetail.name],
              [adminI18n.t("queue.status"), adminStatusLabel(jobDetail.status)],
              [
                adminI18n.t("queue.shop"),
                formatQueueJobShop(jobDetail.shop, jobDetail.attribution),
              ],
              [
                adminI18n.t("queue.attemptsMade"),
                String(jobDetail.attemptsMade),
              ],
              [
                adminI18n.t("queue.created"),
                formatDateTime(jobDetail.timestamp),
              ],
              [
                adminI18n.t("queue.processedAt"),
                formatDateTime(jobDetail.processedOn),
              ],
              [
                adminI18n.t("queue.finishedAt"),
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

          {jobDetail.status === "failed" ? (
            <div className="mt-5 border-t border-gray-200 pt-5">
              <div className="flex items-center justify-between gap-3">
                <h5 className="text-sm font-semibold text-gray-900">
                  {adminI18n.t("queue.failedReason")}
                </h5>
                <CopyButton
                  value={
                    jobDetail.failedReason || adminI18n.t("empty.noReason")
                  }
                  label={adminI18n.t("queue.failedReason")}
                />
              </div>
              <p className="mt-2 whitespace-pre-wrap break-words rounded-md bg-amber-50 p-4 text-sm text-amber-900">
                {jobDetail.failedReason || adminI18n.t("empty.noReason")}
              </p>
            </div>
          ) : null}

          <div className="mt-5 border-t border-gray-200 pt-5">
            <div className="flex items-center justify-between gap-3">
              <h5 className="text-sm font-semibold text-gray-900">
                {adminI18n.t("queue.stackTrace")}
              </h5>
              <CopyButton
                value={jobDetail.stacktrace.join("\n")}
                label={adminI18n.t("queue.stackTrace")}
              />
            </div>
            <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-gray-950 p-4 text-xs leading-5 text-gray-100">
              {jobDetail.stacktrace.length > 0
                ? jobDetail.stacktrace.join("\n")
                : adminI18n.t("empty.noStackTrace")}
            </pre>
          </div>

          <div className="mt-5 border-t border-gray-200 pt-5">
            <div className="flex items-center justify-between gap-3">
              <h5 className="text-sm font-semibold text-gray-900">
                {adminI18n.t("queue.payloadData")}
              </h5>
              <CopyButton
                value={formatJobData(jobDetail.data)}
                label={adminI18n.t("queue.payloadData")}
              />
            </div>
            <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-gray-50 p-4 text-xs leading-5 text-gray-800">
              {formatJobData(jobDetail.data)}
            </pre>
          </div>
        </>
      ) : null}
    </section>
  );
}
