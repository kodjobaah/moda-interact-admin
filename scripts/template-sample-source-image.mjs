/**
 * Derive the three template-editor sample roles from one merchant-supplied image.
 * The resulting files are always PNGs, matching the existing R2 seed contract.
 * This is an offline developer CLI helper, never a merchant delivery path.
 */
import sharp from "sharp";
import { inspectPng } from "./template-sample-images.mjs";

const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_SOURCE_PIXELS = 40_000_000;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const SUPPORTED_INPUT_FORMATS = new Set(["png", "jpeg", "webp"]);

// The example supplied for this seed has branding in the upper-left corner.
// Preserve that region for the square example; keep the whole source for the
// horizontal logo preview, and fill the cover area for the hero example.
export const SINGLE_SOURCE_PRESETS = Object.freeze({
  LOGO: Object.freeze({ width: 1200, height: 630, fit: "contain", position: "centre" }),
  SQUARE_LOGO: Object.freeze({ width: 512, height: 512, fit: "cover", position: "northwest" }),
  COVER_IMAGE: Object.freeze({ width: 1200, height: 630, fit: "cover", position: "centre" }),
});

export async function deriveTemplateSamplesFromSource(sourceBytes) {
  if (!Buffer.isBuffer(sourceBytes) || sourceBytes.length === 0 || sourceBytes.length > MAX_SOURCE_BYTES) {
    throw new Error("--source-image must be a non-empty image file of at most 20 MiB.");
  }

  let metadata;
  try {
    metadata = await sharp(sourceBytes, { limitInputPixels: MAX_SOURCE_PIXELS, failOn: "error" }).metadata();
  } catch (error) {
    throw new Error(`Could not decode --source-image: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!SUPPORTED_INPUT_FORMATS.has(metadata.format) || !metadata.width || !metadata.height ||
      metadata.width * metadata.height > MAX_SOURCE_PIXELS || (metadata.pages ?? 1) !== 1) {
    throw new Error("--source-image must be a single-frame PNG, JPEG or WebP with at most 40 million pixels.");
  }

  const result = {};
  for (const [role, preset] of Object.entries(SINGLE_SOURCE_PRESETS)) {
    const bytes = await sharp(sourceBytes, { limitInputPixels: MAX_SOURCE_PIXELS, failOn: "error" })
      .rotate()
      .resize(preset.width, preset.height, {
        fit: preset.fit,
        position: preset.position,
        background: "#f4faf6",
      })
      .flatten({ background: "#f4faf6" })
      .png({ compressionLevel: 9, palette: false })
      .toBuffer();

    if (bytes.length > MAX_OUTPUT_BYTES) {
      throw new Error(`Derived ${role} is larger than 4 MiB; use a smaller/simpler source image.`);
    }
    const dimensions = inspectPng(bytes);
    if (dimensions.width !== preset.width || dimensions.height !== preset.height) {
      throw new Error(`Derived ${role} has unexpected dimensions.`);
    }
    result[role] = { bytes, ...dimensions };
  }
  return result;
}
