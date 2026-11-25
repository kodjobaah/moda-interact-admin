"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveWhatsAppTemplateDraft, saveWhatsAppTemplateAndStartTranslations } from "@/app/actions/whatsapp-template-authoring";
import { applyCommonLayoutChoice, cloneDraft, draftWithRecoveryFormat, newMetaDraft, newWrapperDraft } from "@/lib/admin/whatsapp-templates/authoring/draft-operations";
import { makeImmutableAuthoringRecord } from "@/lib/admin/whatsapp-templates/authoring/compiler";
import { commonPreparedExample, makeExamplePreview, makeDraftExamplePreview } from "@/lib/admin/whatsapp-templates/authoring/preview";
import { validateTemplateAst } from "@/lib/admin/whatsapp-templates/authoring/validation";
import { workflowHref } from "@/lib/admin/whatsapp-templates/workflow/contracts";
import type { MetaTemplateAst, TemplateAst, TemplateDetail, TemplatePreviewDTO } from "@/lib/admin/whatsapp-templates/authoring/types";

export function useTemplateAuthoringDraft(source?: TemplateDetail | null,
  activeLayout?: import("@/lib/admin/whatsapp-templates/authoring/common-layout-reads").CommonLayoutChoice, initialScenario?: MetaTemplateAst, initialFormat?: import("@/lib/admin/whatsapp-templates/recovery-defaults/contracts").RecoveryDefaultFormat) {
  const router = useRouter();
  const [draft, setDraft] = useState<TemplateAst>(() => {
    let initial = source?.english?.authoring ? cloneDraft(source.english.authoring) : initialScenario ? structuredClone(initialScenario) : newMetaDraft();
    if (initial.family === "META_RECOVERY" && initialFormat) initial = draftWithRecoveryFormat(initial, initialFormat);
    return activeLayout && initial.family === "META_RECOVERY" ? applyCommonLayoutChoice(initial, activeLayout) : initial;
  });
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [touched, setTouched] = useState(false);
  const pending = useRef(false);
  const submissionId = useRef<string | null>(null);
  const checked = useMemo(() => {
    const value = validateTemplateAst(draft);
    if (!value.ok) return value;
    try { makeImmutableAuthoringRecord(value.value); return value; }
    catch (error) { return { ok: false as const, issues: [{ path: "body", message: error instanceof Error ? error.message : "Unable to compile the complete message." }] }; }
  }, [draft]);
  const preview = useMemo<TemplatePreviewDTO | null>(() => {
    if (!checked.ok) return makeDraftExamplePreview(draft);
    const prepared = makeImmutableAuthoringRecord(checked.value).prepared;
    const result = makeExamplePreview(prepared, checked.value.family === "META_RECOVERY" ? checked.value.commonLayout : undefined, checked.value.family === "MODA_CONVERSATION_WRAPPER" ? checked.value.audience : undefined);
    if (checked.value.family === "MODA_CONVERSATION_WRAPPER" && checked.value.audience === "SHARED" && prepared.family === "MODA_CONVERSATION_WRAPPER") {
      try { result.commonLayout = commonPreparedExample(prepared); } catch { /* Existing wrappers with unavailable fixture-only variables retain their original preview. */ }
    }
    return result;
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
      const recovery = draft.family === "META_RECOVERY";
      const response = await (recovery ? saveWhatsAppTemplateAndStartTranslations : saveWhatsAppTemplateDraft)({
        submissionId: submissionId.current, draft,
        ...(source?.id ? { cloneFromDefinitionId: source.id } : {}),
      });
      if (!response.ok) { setError(response.message); return; }
      setSavedId(response.id);
      router.push(recovery ? workflowHref(response.id, "translate") + (response.translationsRequested === false ? "&startFailed=1" : "")
        : `/system-controls/whatsapp-templates?definition=${encodeURIComponent(response.id)}`);
      router.refresh();
    } catch { setError("Save could not be completed. Retry the same submission safely."); }
    finally { pending.current = false; setSaving(false); }
  };
  return { draft, updateDraft, selectFamily, checked, preview, touched, saving, savedId, error, submit };
}
