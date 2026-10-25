"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { publishWhatsAppConversationWrapper } from "@/app/actions/whatsapp-template-wrapper-publication";
import type { Audience, WrapperPublicationWorkspace } from "@/lib/admin/whatsapp-templates/wrappers/contracts";

const PATH = "/system-controls/whatsapp-templates/wrappers";

export function useWrapperPublication(workspace: WrapperPublicationWorkspace, initialAudience: Audience) {
  const router = useRouter();
  const [languageTag, setLanguageTag] = useState("en");
  const [checkoutAvailable, setCheckoutAvailable] = useState(true);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [conflict, setConflict] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const navigate = useCallback((audience: Audience, definitionId?: string) => {
    const params = new URLSearchParams({ audience });
    if (definitionId) params.set("definition", definitionId);
    setMessage(null); setConflict(false); setConfirmed(false); setReason("");
    router.push(`${PATH}?${params.toString()}`);
  }, [router]);
  const activate = useCallback(async () => {
    if (inFlight.current || busy || !confirmed || !workspace.selectedDefinitionId ||
        !workspace.proposed || workspace.proposed.audience !== initialAudience) return;
    const slot = workspace.slots.find((item) => item.audience === initialAudience);
    if (!slot) return;
    inFlight.current = true;
    setBusy(true); setMessage(null);
    try {
      const result = await publishWhatsAppConversationWrapper({ audience: initialAudience,
        definitionId: workspace.proposed.id, expectedDefinitionId: slot.definitionId,
        expectedVersion: slot.editVersion, reason });
      if (!result.ok) {
        setConflict(result.conflict);
        setMessage(result.message);
        if (result.conflict) router.refresh();
      } else {
        setConfirmed(false); setReason("");
        setMessage(result.replay ? "Already active (no duplicate audit record)." : `Activation saved at version ${result.editVersion}.`);
        router.refresh();
      }
    } catch { setMessage("Activation could not be completed. Refresh and retry."); }
    finally { inFlight.current = false; setBusy(false); }
  }, [busy, confirmed, workspace, initialAudience, reason, router]);
  return { languageTag, setLanguageTag, checkoutAvailable, setCheckoutAvailable,
    reason, setReason, confirmed, setConfirmed, busy, conflict, message,
    selectAudience: (audience: Audience) => navigate(audience),
    selectDefinition: (id: string) => navigate(initialAudience, id), activate,
    refreshAfterConflict: () => { setConflict(false); setConfirmed(false); setReason(""); setMessage(null); router.refresh(); }, };
}
