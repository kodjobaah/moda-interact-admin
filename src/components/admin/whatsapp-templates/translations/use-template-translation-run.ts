"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  generateWhatsAppTemplateTranslations, readWhatsAppTemplateTranslations, retryWhatsAppTemplateTranslations,
  type TranslationActionResult,
} from "@/app/actions/whatsapp-template-translations";
import type { TranslationWorkspaceState } from "@/lib/admin/whatsapp-templates/translations/progress";

export function useTemplateTranslationRun(initial: TranslationWorkspaceState) {
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latestRequest = useRef(0);
  const busyRef = useRef(false);

  const accept = useCallback((response: TranslationActionResult, seq: number) => {
    if (seq !== latestRequest.current) return;
    if (response.ok) { setState(response.state); setError(null); }
    else setError(response.message);
  }, []);
  const refresh = useCallback(async () => {
    if (busyRef.current) return;
    const seq = ++latestRequest.current;
    try { accept(await readWhatsAppTemplateTranslations(initial.definitionId), seq); }
    catch { if (seq === latestRequest.current) setError("Progress could not be loaded. Refresh to try again."); }
  }, [accept, initial.definitionId]);
  const mutate = useCallback(async (operation: "generate" | "retry") => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const seq = ++latestRequest.current;
    try {
      const response = operation === "generate"
        ? await generateWhatsAppTemplateTranslations(initial.definitionId)
        : await retryWhatsAppTemplateTranslations(initial.definitionId);
      accept(response, seq);
    } catch { if (seq === latestRequest.current) setError("Translation operation failed. Try again."); }
    finally { busyRef.current = false; setBusy(false); }
  }, [accept, initial.definitionId]);

  // No concurrent implicit starts. Poll DB state only while an active run exists and no locale is selected.
  useEffect(() => {
    if (!state.activelyProcessing || selected !== null || busy) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled || busyRef.current) return;
      const seq = ++latestRequest.current;
      try {
        const response = await readWhatsAppTemplateTranslations(initial.definitionId);
        if (!cancelled) accept(response, seq);
      } catch { if (!cancelled && seq === latestRequest.current) setError("Automatic progress refresh failed."); }
    }, 5000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [state, selected, busy, initial.definitionId, accept]);
  useEffect(() => () => { latestRequest.current++; }, []);
  return { state, selected, setSelected, busy, error, refresh, generate: () => mutate("generate"), retry: () => mutate("retry") };
}
