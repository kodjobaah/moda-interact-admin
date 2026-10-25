"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { decideWhatsAppTemplateTranslation } from "@/app/actions/whatsapp-template-compilation";
import type { ReviewDecision, ReviewWorkspaceDTO } from "@/lib/admin/whatsapp-templates/compilation/contracts";

export function useTemplateTranslationReview(workspace: ReviewWorkspaceDTO) {
  const [selected, setSelected] = useState(workspace.locales.find((locale) => locale.status === "READY")?.languageTag ?? "fr");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const inFlight = useRef(false);
  const router = useRouter();
  const select = (tag: string) => { setSelected(tag); setMessage(null); };
  const current = workspace.locales.find((locale) => locale.languageTag === selected) ?? workspace.source;
  const decide = (decision: ReviewDecision) => {
    const runId = current.runId;
    if (inFlight.current || !runId || current.languageTag === "en") return;
    inFlight.current = true;
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await decideWhatsAppTemplateTranslation({
          definitionId: workspace.definitionId, languageTag: current.languageTag, runId, decision,
        });
        setMessage(result.ok ? result.replay ? "Already reviewed; no content changed." : "Review saved. Refreshing previews…" : result.message);
        if (result.ok) router.refresh();
      } catch { setMessage("Review failed. Refresh and retry."); }
      finally { inFlight.current = false; }
    });
  };
  return { selected, select, current, busy, message, decide };
}
