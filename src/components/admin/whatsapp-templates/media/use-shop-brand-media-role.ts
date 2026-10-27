"use client";
import { useState, useRef } from "react";
import { loadVerifiedShopBrandMedia } from "@/app/actions/shop-brand-media-preview";
import type { ShopBrandMediaView } from "@/lib/admin/whatsapp-templates/media/readiness";

const errors = {
  INVALID_SHOP: "Enter a valid Shop ID.",
  NOT_FOUND: "That shop could not be found.",
  CONFIG_UNAVAILABLE: "The verified public media origin is not configured correctly.",
  READ_FAILED: "Shop media could not be loaded. Retry later.",
} as const;

/** Preview state only; no image URLs or shop IDs are persisted in the AST. */
export function useShopBrandMediaRole() {
  const [shopId, setShopId] = useState("");
  const [media, setMedia] = useState<ShopBrandMediaView | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const request = useRef(0);
  const changeShop = (value: string) => {
    request.current++;
    setShopId(value);
    setMedia(null);
    setMessage("");
    setPending(false);
  };
  const load = async () => {
    const current = ++request.current;
    setPending(true); setMessage(""); setMedia(null);
    try {
      const result = await loadVerifiedShopBrandMedia(shopId.trim());
      if (request.current !== current) return;
      if (result.ok) setMedia(result.media);
      else setMessage(errors[result.code]);
    } catch {
      if (request.current === current) setMessage(errors.READ_FAILED);
    } finally {
      if (request.current === current) setPending(false);
    }
  };
  return { shopId, changeShop, media, pending, message, load };
}
export type ShopBrandMediaController = ReturnType<typeof useShopBrandMediaRole>;
