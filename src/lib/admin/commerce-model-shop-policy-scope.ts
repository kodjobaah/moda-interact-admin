import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Hosted Admin requires AUTH_SECRET. Development bypass may use an ephemeral
// process key: restarting the server invalidates outstanding edit forms.
const developmentKey = randomBytes(32);
const SCOPE_LIFETIME_MS = 8 * 60 * 60 * 1000;

type ShopScope = { shopId: string; adminId: string; expiresAt: number };

function signingKey(): string | Buffer {
  const configured = process.env.AUTH_SECRET?.trim();
  if (configured) return configured;
  const deployment = (process.env.DEPLOYMENT_ENVIRONMENT_NAME ?? process.env.NODE_ENV)?.trim().toLowerCase();
  if (deployment !== "development" || process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET is required for Merchant policy authorization.");
  }
  return developmentKey;
}

function signature(payload: string) {
  return createHmac("sha256", signingKey()).update("arch038-live-shop-policy.v1:").update(payload).digest();
}

/** Mint only after the server has resolved the selected Tenant and authenticated the administrator. */
export function issueLiveShopPolicyScope(shopId: string, adminId: string, now = Date.now()): string {
  if (!shopId || !adminId) throw new Error("Merchant policy scope is unavailable.");
  const encoded = Buffer.from(JSON.stringify({ shopId, adminId, expiresAt: now + SCOPE_LIFETIME_MS } satisfies ShopScope)).toString("base64url");
  return `${encoded}.${signature(encoded).toString("base64url")}`;
}

/** Fail closed on tampering, scope substitution, expiry, or a different authenticated Admin. */
export function verifyLiveShopPolicyScope(token: unknown, adminId: string, now = Date.now()): string {
  if (typeof token !== "string" || token.length > 4096) throw new Error("Merchant scope is invalid. Reload the selected tenant.");
  const pieces = token.split(".");
  if (pieces.length !== 2 || !pieces[0] || !pieces[1]) throw new Error("Merchant scope is invalid. Reload the selected tenant.");
  const [encoded, supplied] = pieces as [string, string];
  const expected = signature(encoded);
  const provided = Buffer.from(supplied, "base64url");
  if (provided.length !== expected.length || !timingSafeEqual(expected, provided)) {
    throw new Error("Merchant scope is invalid. Reload the selected tenant.");
  }
  let record: unknown;
  try { record = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")); }
  catch { throw new Error("Merchant scope is invalid. Reload the selected tenant."); }
  if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error("Merchant scope is invalid. Reload the selected tenant.");
  const scope = record as Partial<ShopScope>;
  if (typeof scope.shopId !== "string" || !scope.shopId || scope.shopId.length > 128 ||
      scope.adminId !== adminId || typeof scope.expiresAt !== "number" ||
      !Number.isSafeInteger(scope.expiresAt) || scope.expiresAt <= now ||
      scope.expiresAt > now + SCOPE_LIFETIME_MS) {
    throw new Error("Merchant scope is invalid or expired. Reload the selected tenant.");
  }
  return scope.shopId;
}
