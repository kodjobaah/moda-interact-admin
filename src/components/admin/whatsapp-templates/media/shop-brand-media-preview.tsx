import type { ReadyMedia } from "@/lib/admin/whatsapp-templates/media/readiness";

/** URL comes ONLY from the server-verified R2 key under the configured origin. */
export function ShopBrandMediaPreview({ media, domain }: { media: ReadyMedia; domain: string }) {
  return <figure className="max-w-full space-y-2 rounded-lg border border-emerald-200 bg-white p-3"
    aria-label={`${media.role.replaceAll("_", " ")} processed image preview`}>
    {/* This HTTPS image is an immutable public asset, not a merchant-controlled source URL. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={media.url} alt={`Processed ${media.role.replaceAll("_", " ").toLowerCase()} for ${domain}`}
      width={media.width} height={media.height} loading="lazy"
      className="mx-auto max-h-48 w-full max-w-full rounded object-contain" />
    <figcaption className="break-words text-xs text-slate-700">
      {media.contentType === "image/png" ? "PNG" : "JPEG"} · {media.width} × {media.height} · {Math.ceil(media.sizeBytes / 1024)} KiB
    </figcaption>
  </figure>;
}
