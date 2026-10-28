/** Small S3 Signature V4 adapter for the operator-owned seed CLI.
 * No R2 credentials or signing requests are included in browser/runtime code.
 */
import { createHash, createHmac } from "node:crypto";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const hmac = (key, value) => createHmac("sha256", key).update(value).digest();

export function validateR2Endpoint(raw) {
  if (typeof raw !== "string" || !/^https:\/\/[0-9a-f]{32}\.r2\.cloudflarestorage\.com\/?$/i.test(raw)) {
    throw new Error("Invalid Cloudflare R2 S3 endpoint in database configuration.");
  }
  return new URL(raw).origin;
}
export function signR2Request({ method, endpoint, bucket, objectKey, accessKeyId, secretAccessKey, payload = Buffer.alloc(0), now = new Date() }) {
  const origin = validateR2Endpoint(endpoint);
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) ||
      !/^template-samples\/(?:test|development)\/(?:logo|square_logo|cover_image)\/sha256-[a-f0-9]{64}\.png$/.test(objectKey)) {
    throw new Error("Invalid sample bucket or object key.");
  }
  if (!["PUT", "HEAD"].includes(method) || !accessKeyId || !secretAccessKey) {
    throw new Error("Invalid R2 request credentials or method.");
  }
  const url = new URL(`${origin}/${encodeURIComponent(bucket)}/${objectKey.split("/").map(encodeURIComponent).join("/")}`);
  const date = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const stamp = date.slice(0, 8);
  const payloadHash = hash(payload);
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalHeaders = `host:${url.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${date}\n`;
  const canonicalRequest = [method, url.pathname, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${stamp}/auto/s3/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", date, scope, hash(canonicalRequest)].join("\n");
  const key = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, stamp), "auto"), "s3"), "aws4_request");
  const signature = createHmac("sha256", key).update(toSign).digest("hex");
  return {
    url: url.href,
    headers: {
      "x-amz-date": date,
      "x-amz-content-sha256": payloadHash,
      Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
}
export async function r2Request({ method, endpoint, bucket, objectKey, accessKeyId, secretAccessKey, payload }) {
  const args = { method, endpoint, bucket, objectKey, accessKeyId, secretAccessKey, payload };
  const signed = signR2Request(args);
  const response = await fetch(signed.url, { method, headers: {
    ...signed.headers, ...(method === "PUT" ? { "content-type": "image/png" } : {}),
  }, ...(method === "PUT" ? { body: payload } : {}), signal: AbortSignal.timeout(20_000) });
  if (!response.ok) {
    const message = (await response.text()).slice(0, 1200);
    throw new Error(`Cloudflare R2 ${method} failed: HTTP ${response.status}: ${message}`);
  }
  return response;
}
