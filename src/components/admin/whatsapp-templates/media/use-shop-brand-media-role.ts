"use client";
import { useEffect, useRef, useState } from "react";
import { loadTemplateSampleMedia } from "@/app/actions/template-sample-media";
import type { TemplateSampleMediaView } from "@/lib/admin/whatsapp-templates/media/template-samples";

/** Automatic sample preview only. No sample identity, R2 URL or shop ID enters the saved template AST. */
export function useShopBrandMediaRole() {
  const [media, setMedia] = useState<TemplateSampleMediaView | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const sequence = useRef(0);
  const load = async () => {
    const request = ++sequence.current;
    setPending(true);
    setMessage("");
    try {
      const result = await loadTemplateSampleMedia();
      if (sequence.current !== request) return;
      if (result.ok) setMedia(result.media);
      else setMessage(result.code === "CONFIG_UNAVAILABLE" ? "Public sample media is not configured." : "Could not load sample images.");
    } catch {
      if (sequence.current === request) setMessage("Could not load sample images.");
    } finally { if (sequence.current === request) setPending(false); }
  };
  useEffect(() => {
    void load();
    return () => { sequence.current++; };
    // One initial load. The Refresh button calls load explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { media, pending, message, load };
}
export type ShopBrandMediaController = ReturnType<typeof useShopBrandMediaRole>;
