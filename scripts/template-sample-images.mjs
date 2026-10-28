/** Self-contained PNG examples; no external image service, fonts or assets required. */
import { deflateSync } from "node:zlib";

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let i = 0; i < 8; i++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}
function png(width, height, pixel) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 2; // 8-bit true-colour RGB
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixel(x / width, y / height);
      const offset = row + 1 + x * 3;
      raw[offset] = Math.max(0, Math.min(255, Math.round(r)));
      raw[offset + 1] = Math.max(0, Math.min(255, Math.round(g)));
      raw[offset + 2] = Math.max(0, Math.min(255, Math.round(b)));
    }
  }
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"), chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
  ]);
}
function pixelFor(role, x, y) {
  // Neutral, original design-language patterns. No merchant logo or protected artwork.
  if (role === "SQUARE_LOGO") {
    const inside = (x - 0.5) ** 2 + (y - 0.5) ** 2 < 0.28 ** 2;
    const cutout = (x - 0.5) ** 2 + (y - 0.5) ** 2 < 0.15 ** 2;
    if (inside && !cutout) return [255, 255, 255];
    return [12 + x * 24, 83 + y * 48, 66 + x * 16];
  }
  if (role === "COVER_IMAGE") {
    const ribbon = Math.abs(y - (0.25 + 0.34 * x)) < 0.105;
    const ribbon2 = Math.abs(y - (0.76 - 0.28 * x)) < 0.08;
    if (ribbon) return [245, 225, 172];
    if (ribbon2) return [172, 210, 190];
    return [11 + x * 32, 68 + y * 45, 67 + x * 36];
  }
  // LOGO: a wide horizontal mark with geometric bands.
  const stripe = y > 0.32 && y < 0.7 && x > 0.11 && x < 0.89;
  const badge = (x - 0.27) ** 2 / 0.072 ** 2 + (y - 0.51) ** 2 / 0.15 ** 2 < 1;
  if (badge) return [15, 97, 75];
  if (stripe && x > 0.39) return [31, 105 + x * 34, 94];
  return [245, 250, 248];
}
const DIMENSIONS = Object.freeze({ LOGO: [1200, 630], SQUARE_LOGO: [512, 512], COVER_IMAGE: [1200, 630] });
export function generateTemplateSamples() {
  return Object.fromEntries(Object.entries(DIMENSIONS).map(([role, [width, height]]) => [role, {
    bytes: png(width, height, (x, y) => pixelFor(role, x, y)), width, height,
  }]));
}
/** Validate optional user-supplied PNGs without trusting file extensions or ImageMagick. */
export function inspectPng(bytes) {
  if (bytes.length < 45 || !bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")) ||
      bytes.toString("ascii", 12, 16) !== "IHDR" || bytes.readUInt32BE(8) !== 13 ||
      bytes[24] !== 8 || ![2, 6].includes(bytes[25])) throw new Error("Expected an 8-bit RGB/RGBA PNG (not JPEG/SVG).");
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (width < 1 || height < 1 || width * height > 40_000_000 || bytes.length > 4 * 1024 * 1024) {
    throw new Error("Sample image dimensions or bytes exceed approved limits.");
  }
  return { width, height };
}
