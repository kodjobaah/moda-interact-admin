import type { MediaRoleView } from "@/lib/admin/whatsapp-templates/media/readiness";

const messages = {
  MISSING: "No processed image is available for this role.",
  PENDING: "An image is awaiting processing. It cannot be used yet.",
  PROCESSING: "This image is currently processing. It cannot be used yet.",
  FAILED: "Image processing failed. The asset is not usable.",
  STALE: "The previous image does not match the current source or fails verification.",
  READY: "Verified processed media is ready for preview. Send-time readiness is checked again.",
};
export function ShopBrandMediaReadinessMessage({ media }: { media: MediaRoleView }) {
  return <p className={media.status === "READY" ? "text-xs text-emerald-800" : "text-xs text-amber-800"}
    role="status">{messages[media.status]}</p>;
}
