"use client";
import { ConfigurationField } from "@/components/admin/platform-configuration/configuration-field";
import { COMPOSITE_PROFILE_DEFAULTS, COMPOSITE_PROFILE_FIELDS } from "@/lib/admin/whatsapp-templates/authoring/composite-profile";
import type { AuthoringIssue, WrapperTemplateAst } from "@/lib/admin/whatsapp-templates/authoring/types";

export function TemplateCompositeProfileEditor({ draft, onChange, issues }: {
  draft: WrapperTemplateAst; onChange: (draft: WrapperTemplateAst) => void; issues: AuthoringIssue[];
}) {
  if (draft.audience !== "SHARED") return null;
  return <section aria-label="Saved template composite layout" className="space-y-3 rounded-lg border p-4">
    <label className="flex gap-2 font-semibold"><input type="checkbox" checked={!!draft.compositeProfile}
      onChange={(event) => {
        const next = { ...draft };
        if (event.target.checked) next.compositeProfile = { ...COMPOSITE_PROFILE_DEFAULTS };
        else delete next.compositeProfile;
        onChange(next);
      }} />Define the required composite layout in this common template</label>
    <p className="text-sm text-slate-600">The saved template is the layout source of truth. Geometry is immutable after saving; use Clone as New, review and coordinated activation to change it. No separate platform policy is used. A common template without a profile is historical and cannot be selected or activated. A historical clone requires an explicit layout before saving. Saving does not enable composite delivery or change native Meta templates.</p>
    {draft.compositeProfile && <div className="grid gap-4 sm:grid-cols-2">
      {COMPOSITE_PROFILE_FIELDS.filter(field => field.name !== "schemaVersion").map((field) => <ConfigurationField
        key={field.name} field={field} value={draft.compositeProfile![field.name as keyof typeof draft.compositeProfile]} disabled={false}
        onChange={(value) => onChange({ ...draft, compositeProfile: { ...draft.compositeProfile!, [field.name]: value } })} />)}
    </div>}
    {issues.map((issue, index) => <p key={index} role="alert" className="text-sm text-red-800">{issue.message}</p>)}
  </section>;
}
