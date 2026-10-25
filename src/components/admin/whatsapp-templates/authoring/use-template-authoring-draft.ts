"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveWhatsAppTemplateDraft } from "@/app/actions/whatsapp-template-authoring";
import { cloneDraft, newMetaDraft, newWrapperDraft } from "@/lib/admin/whatsapp-templates/authoring/draft-operations";
import { makeImmutableAuthoringRecord } from "@/lib/admin/whatsapp-templates/authoring/compiler";
import { makeExamplePreview, makeDraftExamplePreview } from "@/lib/admin/whatsapp-templates/authoring/preview";
import { validateTemplateAst } from "@/lib/admin/whatsapp-templates/authoring/validation";
import type { TemplateAst, TemplateDetail, TemplatePreviewDTO } from "@/lib/admin/whatsapp-templates/authoring/types";

export function useTemplateAuthoringDraft(source?: TemplateDetail | null) {
  const router = useRouter();
  const [draft, setDraft] = useState<TemplateAst>(() => source?.english?.authoring ? cloneDraft(source.english.authoring) : newMetaDraft());
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [touched, setTouched] = useState(false);
  const pending = useRef(false);
  const submissionId = useRef<string | null>(null);
  const checked = useMemo(() => validateTemplateAst(draft), [draft]);
  const preview = useMemo<TemplatePreviewDTO | null>(() => {
    return checked.ok
      ? makeExamplePreview(makeImmutableAuthoringRecord(checked.value).prepared)
      : makeDraftExamplePreview(draft);
  }, [checked, draft]);
  const updateDraft = (next: TemplateAst) => {
    if (pending.current || savedId) return;
    setDraft(next); setTouched(true); setError("");
  };
  const selectFamily = (family: TemplateAst["family"]) => {
    if (family === draft.family) return;
    if ((touched || source?.id) && !window.confirm("Changing the template family will reset the current unsaved content. Continue?")) return;
    updateDraft(family === "META_RECOVERY" ? newMetaDraft() : newWrapperDraft());
  };
  const submit = async () => {
    if (pending.current || savedId || !checked.ok) return;
    pending.current = true; setSaving(true); setError("");
    try {
      submissionId.current ??= crypto.randomUUID();
      const response = await saveWhatsAppTemplateDraft({
        submissionId: submissionId.current, draft,
        ...(source?.id ? { cloneFromDefinitionId: source.id } : {}),
      });
      if (!response.ok) { setError(response.message); return; }
      setSavedId(response.id);
      router.push(`/system-controls/whatsapp-templates?definition=${encodeURIComponent(response.id)}`);
      router.refresh();
    } catch { setError("Save could not be completed. Retry the same submission safely."); }
    finally { pending.current = false; setSaving(false); }
  };
  return { draft, updateDraft, selectFamily, checked, preview, touched, saving, savedId, error, submit };
}
