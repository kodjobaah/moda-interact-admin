"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { readWhatsAppMetaTemplateStatus } from "@/app/actions/whatsapp-template-meta-control";
import type { MetaStatusView } from "@/lib/admin/whatsapp-templates/meta/contracts";

const MAX_AUTO_REFRESHES = 4;
const REFRESH_INTERVAL_MS = 30_000;

export function useMetaTemplateStatus(initial: MetaStatusView) {
  const [status, setStatus] = useState(initial);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);
  const selectRecord = useCallback((id: string | null) => {
    // Invalidate an in-flight response and release the loading state when
    // the operator opens the event inspector (which pauses automatic reads).
    sequence.current++;
    setRefreshing(false);
    setSelectedId(id);
  }, []);
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    setRefreshing(true);
    try {
      const next = await readWhatsAppMetaTemplateStatus(initial.definitionId);
      if (sequence.current === request) { setStatus(next); setError(null); }
    } catch {
      if (sequence.current === request) setError("Could not refresh local provider observations. Try again.");
    } finally { if (sequence.current === request) setRefreshing(false); }
  }, [initial.definitionId]);
  useEffect(() => {
    if (selectedId) return;
    let count = 0;
    const requestSequence = sequence;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible" || count >= MAX_AUTO_REFRESHES) {
        if (count >= MAX_AUTO_REFRESHES) window.clearInterval(timer);
        return;
      }
      count++;
      void refresh();
    }, REFRESH_INTERVAL_MS);
    return () => { window.clearInterval(timer); requestSequence.current++; };
  }, [selectedId, refresh]);
  return { status, selectedId, setSelectedId: selectRecord, refreshing, error, refresh };
}
