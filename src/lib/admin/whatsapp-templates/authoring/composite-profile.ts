import { digestRecoveryCompositeProfile } from "@modainteract/moda-interact-shared/commerce/presentation";
import { layoutDigest } from "./common-layout";
import { RecoveryCompositeProfileSchema, assertRecoveryCompositeProfileSafety, type RecoveryCompositeProfile } from "@modainteract/moda-interact-shared/commerce/presentation";
import type { FieldContract } from "../../platform-configuration/contracts";

/** Admin-owned starting values, applied only when explicitly adding a profile to a new draft. */
export const COMPOSITE_PROFILE_DEFAULTS: Readonly<RecoveryCompositeProfile> = Object.freeze({
  schemaVersion: 1, fontId: "DEJAVU_SANS_2_37",
  canvasWidth: 1125, headerOnlyHeight: 300, withProductHeight: 900,
  logoLeft: 48, logoTop: 60, logoWidth: 180, logoHeight: 180,
  textLeft: 264, textTop: 24, textWidth: 813, textHeight: 252,
  fontSize: 44, textLineSpacingPt: 0,
  productLeft: 0, productTop: 300, productWidth: 1125, productHeight: 600,
});

export function compositeProfileError(value: unknown): string | null {
  const parsed = RecoveryCompositeProfileSchema.safeParse(value);
  if (!parsed.success) return "Profile structure is invalid. Supply exactly the supported fields with numeric dimensions and the supported schema/font identifiers.";
  const p = parsed.data;
  for (const field of COMPOSITE_PROFILE_FIELDS) {
    const v = p[field.name as keyof RecoveryCompositeProfile];
    if (field.kind === "integer" && (typeof v !== "number" || !Number.isSafeInteger(v) || v < field.min || v > field.max)) return `${field.label}: enter a whole number from ${field.min} to ${field.max}.`;
    if (field.kind === "enum" && (typeof v !== "string" || !field.options.includes(v))) return `${field.label}: choose a supported value.`;
  }
  try { assertRecoveryCompositeProfileSafety(p); }
  catch { return "Profile exceeds renderer safety limits. Use finite whole-number allocations, contained slots and at most 2,000,000 output pixels."; }
  if (p.withProductHeight <= p.headerOnlyHeight) return "Height with product must exceed the header-only height.";
  if (p.productTop < p.headerOnlyHeight) return "Product slot must start below the complete shop header.";
  if (p.textLineSpacingPt !== 0 && (p.textLineSpacingPt < p.fontSize || p.textLineSpacingPt > p.fontSize * 2)) return "Line spacing must be 0 (font default), or between the font size and twice the font size.";
  const overlap = p.logoLeft < p.textLeft + p.textWidth && p.logoLeft + p.logoWidth > p.textLeft &&
    p.logoTop < p.textTop + p.textHeight && p.logoTop + p.logoHeight > p.textTop;
  if (overlap) return "Logo and shop-details slots must not overlap. The logo may be beside or above the text.";
  return null;
}


const size = (name: string, label: string, min: number, max: number, section: string): FieldContract => ({
  name, label, kind: "integer", min, max, section,
  description: `Whole number from ${min} to ${max}. Coordinates and sizes are pixels at the renderer's fixed 72 DPI.`,
});
export const COMPOSITE_PROFILE_FIELDS: readonly FieldContract[] = [
    size("schemaVersion", "Profile schema version", 1, 1, "Canvas"),
    { name: "fontId", label: "Bundled font", kind: "enum", options: ["DEJAVU_SANS_2_37"], description: "Supported bundled font only; custom fonts and URLs are not accepted." },
    size("canvasWidth", "Canvas width", 640, 1600, "Canvas"),
    size("headerOnlyHeight", "Header-only height", 160, 640, "Canvas"),
    size("withProductHeight", "Height with product", 400, 1840, "Canvas"),
    ...(["logoLeft", "logoTop"] as const).map((name) => size(name, name === "logoLeft" ? "Logo left" : "Logo top", 0, 1840, "Logo")),
    size("logoWidth", "Logo width", 32, 320, "Logo"), size("logoHeight", "Logo height", 32, 320, "Logo"),
    size("textLeft", "Shop details left", 0, 1840, "Shop details"), size("textTop", "Shop details top", 0, 1840, "Shop details"),
    size("textWidth", "Shop details width", 128, 1600, "Shop details"), size("textHeight", "Shop details height", 32, 640, "Shop details"),
    size("fontSize", "Shop details font size", 24, 96, "Shop details"), size("textLineSpacingPt", "Line spacing (0 = font default)", 0, 192, "Shop details"),
    size("productLeft", "Product left", 0, 1840, "Product"), size("productTop", "Product top", 0, 1840, "Product"),
    size("productWidth", "Product width", 128, 1600, "Product"), size("productHeight", "Product height", 128, 1200, "Product"),
  ];

export function compositeProfileDigest(profile: RecoveryCompositeProfile): string { return digestRecoveryCompositeProfile(profile, layoutDigest); }
