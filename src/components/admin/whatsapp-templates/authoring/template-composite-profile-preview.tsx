"use client";

import { useState } from "react";
import { RecoveryCompositeProfileSchema } from "@modainteract/moda-interact-shared/commerce/presentation";
import { compositeProfileError } from "@/lib/admin/whatsapp-templates/authoring/composite-profile";

/** Schematic only: browser SVG is not a claim about native Meta layout or font rendering. */
export function TemplateCompositeProfilePreview({ values, headerText, caption }: { values: Readonly<Record<string, unknown>>; headerText?: string; caption?: string }) {
  const [withProduct, setWithProduct] = useState(true);
  const parsed = RecoveryCompositeProfileSchema.safeParse(values);
  const error = compositeProfileError(values);
  const p = parsed.success && !error ? parsed.data : null;
  return <section aria-label="Composite layout preview" className="my-4 space-y-3 rounded-lg border bg-gray-50 p-4">
    <h3 className="font-semibold">Saved-template layout preview</h3>
    <p className="text-sm text-gray-700">Schematic geometry only. Delivery is one JPEG containing the shop logo, authored shop details and divider, then the optional product image. The actual answer and checkout link remain in the image caption. Native Meta templates are unchanged. Real font fit and media availability are checked by the worker; unsupported text falls back to the complete text reply.</p>
    <label className="flex gap-2 text-sm"><input type="checkbox" checked={withProduct} onChange={(e) => setWithProduct(e.target.checked)} />Include sample product slot</label>
    {!p ? <p role="alert" className="text-sm text-red-800">{error ?? "Complete the profile fields to preview."}</p> : <>
      <p className="text-sm">{p.canvasWidth} × {withProduct ? p.withProductHeight : p.headerOnlyHeight} pixels · {p.fontId} · font {p.fontSize} · line spacing {p.textLineSpacingPt || "font default"}</p>
      <svg role="img" aria-label="Schematic shop header followed by separate contained product slot" viewBox={`0 0 ${p.canvasWidth} ${withProduct ? p.withProductHeight : p.headerOnlyHeight}`} className="max-h-[600px] w-full border bg-white">
        <rect x={p.logoLeft} y={p.logoTop} width={p.logoWidth} height={p.logoHeight} fill="#dbeafe" stroke="#1e40af" />
        <text x={p.logoLeft + p.logoWidth / 2} y={p.logoTop + p.logoHeight / 2} textAnchor="middle" fontSize="24">Logo (contain)</text>
        <rect x={p.textLeft} y={p.textTop} width={p.textWidth} height={p.textHeight} fill="#f0fdf4" stroke="#166534" />
        <text x={p.textLeft + 8} y={p.textTop + 28} fontSize="24">Authored shop details + divider</text>
        {withProduct && <>
          <rect x={p.productLeft} y={p.productTop} width={p.productWidth} height={p.productHeight} fill="#f3f4f6" stroke="#4b5563" />
          <text x={p.productLeft + p.productWidth / 2} y={p.productTop + p.productHeight / 2} textAnchor="middle" fontSize="24">Product image (contain, never crop)</text>
        </>}
      </svg>
      <div className="rounded border bg-white p-3 text-sm"><p className="font-semibold">Authored header (illustrative values)</p><pre className="whitespace-pre-wrap">{headerText ?? "Shop: Example Shop\nWebsite: https://www.example.com\n──────────"}</pre></div>
      <div className="rounded border bg-white p-3 text-sm"><p className="font-semibold">Actual caption position (sample text)</p><pre className="whitespace-pre-wrap">{caption ?? "Here are the product details you requested.\n\n──────────\nhttps://www.example.com/checkout/demo"}</pre></div>
    </>}
  </section>;
}

