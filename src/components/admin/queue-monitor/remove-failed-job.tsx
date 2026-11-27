"use client";

import { useState } from "react";
import { adminI18n } from "@/i18n";
import type { QueueJobDetail } from "./queue-monitor.types";

type Props = {
  job: QueueJobDetail;
  onRemoved(): void;
};

/** Deletion is limited to a single failed job; server rechecks identity, state and admin role. */
export function RemoveFailedJob({ job, onRemoved }: Props) {
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (job.status !== "failed" || confirmation !== job.id || pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/queues/jobs/remove", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          queueName: job.queueName,
          jobName: job.name,
          jobId: job.id,
          confirmJobId: confirmation,
        }),
      });
      if (!response.ok) {
        setError(
          adminI18n.t(
            response.status === 409 || response.status === 404
              ? "queue.removeFailedJobConflict"
              : "queue.removeFailedJobError",
          ),
        );
        return;
      }
      onRemoved();
    } catch {
      setError(adminI18n.t("queue.removeFailedJobError"));
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      className="mt-5 border-t border-gray-200 pt-5"
      aria-label={adminI18n.t("queue.removeFailedJob")}
    >
      <h5 className="text-sm font-semibold text-red-800">
        {adminI18n.t("queue.removeFailedJob")}
      </h5>
      <p className="mt-1 text-xs text-gray-600">
        {adminI18n.t("queue.removeFailedJobHint")}
      </p>
      <label
        className="mt-3 block text-xs font-medium text-gray-700"
        htmlFor="queue-remove-confirm-job-id"
      >
        {adminI18n.t("queue.confirmJobId")}
      </label>
      <input
        id="queue-remove-confirm-job-id"
        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        autoComplete="off"
        spellCheck={false}
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
      />
      <button
        type="button"
        className="mt-3 rounded-md bg-red-700 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        disabled={job.status !== "failed" || pending || confirmation !== job.id}
        onClick={() => void submit()}
      >
        {pending
          ? adminI18n.t("queue.removingJob")
          : adminI18n.t("queue.removeFailedJob")}
      </button>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </section>
  );
}
