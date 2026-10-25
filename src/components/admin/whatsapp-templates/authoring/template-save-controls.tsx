"use client";
import Link from "next/link";
import type { AuthoringIssue } from "@/lib/admin/whatsapp-templates/authoring/types";
export function TemplateSaveControls({ issues, saving, savedId, error, onSave, cloneFromId, showIssues = true }: {
  issues: AuthoringIssue[]; saving: boolean; savedId: string | null;
  error: string; onSave: () => void; cloneFromId?: string; showIssues?: boolean;
}) {
  return <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-6" aria-label="Save controls">
    <div><h2 className="font-semibold">Save immutable source</h2>
      <p className="mt-1 text-sm text-slate-600">Saving permanently freezes the English AST and prepared projection. Any correction requires Clone as New.</p></div>
    {cloneFromId && <p className="text-sm text-blue-800">Clone as New from <code className="break-all">{cloneFromId}</code>. The original will not change.</p>}
    {showIssues && issues.length > 0 && <div role="alert" aria-label="Validation issues" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
      <p className="font-medium">Correct these issues before saving:</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">{issues.slice(0, 20).map((issue, index) => <li key={index}><strong>{issue.path}</strong>: {issue.message}</li>)}</ul>
    </div>}
    {!showIssues && issues.length > 0 && <p className="text-sm text-amber-800">Resolve the validation issues in the review summary above to enable saving.</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {savedId && <p role="status" className="text-sm text-green-800">Saved. Loading immutable definition…</p>}
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={onSave} disabled={saving || !!savedId || issues.length > 0}
        className="rounded-lg bg-blue-800 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-50">
        {saving ? "Saving…" : savedId ? "Saved" : cloneFromId ? "Save new clone" : "Save immutable English definition"}
      </button>
      <Link href="/system-controls/whatsapp-templates?create=1" className="text-sm text-blue-800 underline">New empty template</Link>
    </div>
  </section>;
}
