"use client";

import Link from "next/link";
import { workflowHref } from "@/lib/admin/whatsapp-templates/workflow/contracts";
import { hasMetaProviderDrift } from "@/lib/admin/whatsapp-templates/meta/contracts";

import { MetaSubmissionReview } from "./meta-submission-review";
import { MetaSubmissionConfirmation } from "./meta-submission-confirmation";
import { MetaApprovalSummary } from "./meta-approval-summary";
import { MetaLocaleStatusTable } from "./meta-locale-status-table";
import { MetaDriftNotice } from "./meta-drift-notice";
import { useMetaTemplateStatus } from "./use-meta-template-status";
import type { MetaDashboardData } from "@/lib/admin/whatsapp-templates/meta/reads";

export function MetaTemplateDashboard({
  initial,
  integratedWabaId,
}: {
  initial: MetaDashboardData;
  integratedWabaId?: string | null;
}) {
  const { status, selectedId, setSelectedId, refreshing, error, refresh } =
    useMetaTemplateStatus(initial.status);
  const current = status.registrations.filter(
    (row) => row.wabaId === integratedWabaId,
  );
  const ready =
    current.length === 20 &&
    new Set(current.map((row) => row.languageTag)).size === 20 &&
    current.every(
      (row) =>
        row.providerStatus === "APPROVED" &&
        row.submissionState === "SUBMITTED" &&
        !!row.providerTemplateId &&
        !row.failureCode &&
        !!row.lastReconciledAt &&
        !!row.lastObservedContentHash &&
        row.lastObservedCategory === "MARKETING" &&
        !hasMetaProviderDrift(row),
    );
  return (
    <div className="space-y-5">
      {initial.plan ? (
        <MetaSubmissionReview plan={initial.plan} />
      ) : (
        <section
          role="alert"
          className="rounded-xl border border-amber-300 bg-amber-50 p-4"
        >
          <h2 className="font-semibold">Submission not ready</h2>
          <p className="mt-1 text-sm">
            {initial.previewIssue ??
              "The compiled provider snapshot is unavailable."}
          </p>
          <p className="mt-1 text-sm">
            All 20 reviewed languages, including the immutable English original,
            must be ready before confirming.
          </p>
        </section>
      )}
      <MetaSubmissionConfirmation
        plan={initial.plan}
        existingRegistrations={status.registrations.length}
        onConfirmed={refresh}
      />
      <MetaApprovalSummary status={status} />
      {integratedWabaId !== undefined &&
        (ready ? (
          <Link
            className="inline-block rounded bg-blue-800 px-3 py-2 text-sm font-semibold text-white"
            href={workflowHref(initial.definitionId, "publish")}
          >
            Continue to publication and shop assignment
          </Link>
        ) : (
          <p className="text-sm text-slate-600">
            Publication review is available from the Publish and assign stage.
            All 20 current-sender approvals and content checks must pass before
            confirmation.
          </p>
        ))}
      <MetaDriftNotice status={status} />
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={refreshing}
          className="rounded border border-blue-800 px-3 py-2 text-blue-800 disabled:opacity-50"
        >
          {refreshing ? "Refreshing…" : "Refresh local provider status"}
        </button>
        <span className="text-slate-500">
          Last read: {status.updatedAt} · Automatic refresh is bounded and
          pauses during event inspection.
        </span>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <MetaLocaleStatusTable
        status={status}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onChanged={refresh}
      />
    </div>
  );
}
