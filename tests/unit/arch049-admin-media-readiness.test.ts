import assert from "node:assert/strict";
import { test } from "node:test";
import { verifiedRoleMedia, projectShopBrandMedia, SHOP_BRAND_MEDIA_ROLES } from "../../src/lib/admin/whatsapp-templates/media/readiness.ts";

const SHA = "a".repeat(64);
const OTHER = "b".repeat(64);
const shopId = "shop_alpha";
const publicOrigin = "https://shop-brands.modainteract.com";
function role(roleName: string, override: Record<string, unknown> = {}) {
  return { source: { url: "https://merchant.example/original.png", reference: null,
    generation: 3, fingerprint: `sha256:${SHA}`, observedAt: "2026-10-27T00:00:00Z" },
    work: { status: "READY", attempts: 1, retryAfter: null, leaseUntil: null },
    ready: { sourceGeneration: 3, sourceFingerprint: `sha256:${SHA}`,
      objectKey: `shop-brands/${shopId}/${roleName.toLowerCase()}/sha256-${SHA}.jpg`,
      contentType: "image/jpeg", width: 1125, height: 600, sizeBytes: 180000,
      contentSha256: SHA, verifiedAt: "2026-10-27T00:00:00Z" }, ...override };
}
function media(overrides: Record<string, unknown> = {}) {
  return { schemaVersion: 1, roles: { LOGO: role("LOGO"), SQUARE_LOGO: role("SQUARE_LOGO"),
    COVER_IMAGE: role("COVER_IMAGE"), ...overrides } };
}
function check(raw: unknown, roleName: "LOGO" | "SQUARE_LOGO" | "COVER_IMAGE" = "LOGO", origin = publicOrigin) {
  return verifiedRoleMedia({ media: raw, shopId, role: roleName, publicOrigin: origin });
}

test("all three READY roles project real derivative metadata from immutable shop-scoped keys", () => {
  for (const name of SHOP_BRAND_MEDIA_ROLES) {
    const result = check(media(), name);
    assert.equal(result.status, "READY");
    if (result.status !== "READY") continue;
    assert.equal(result.url, `${publicOrigin}/shop-brands/${shopId}/${name.toLowerCase()}/sha256-${SHA}.jpg`);
    assert.equal(result.contentType, "image/jpeg");
    assert.equal(result.width, 1125);
    assert.ok(!JSON.stringify(result).includes("merchant.example"));
  }
  const view = projectShopBrandMedia({ media: media(), shopId, domain: "store.example.org", publicOrigin });
  assert.equal(view.domain, "store.example.org");
  assert.deepEqual(Object.keys(view.roles), [...SHOP_BRAND_MEDIA_ROLES]);
});

test("missing, pending, processing and failed roles are not exposed as ready", () => {
  assert.equal(check({}).status, "MISSING");
  assert.equal(check({ schemaVersion: 9, roles: {} }).status, "MISSING");
  assert.equal(check(media({ LOGO: null })).status, "MISSING");
  for (const status of ["MISSING", "PENDING", "PROCESSING", "FAILED"] as const) {
    const result = check(media({ LOGO: role("LOGO", { work: { status } }) }));
    assert.equal(result.status, status);
    assert.ok(!("url" in result));
  }
});

test("stale generation, source fingerprints, absent source and tampered metadata fail closed", () => {
  const candidates = [
    { ready: { ...role("LOGO").ready as object, sourceGeneration: 2 } },
    { ready: { ...role("LOGO").ready as object, sourceFingerprint: `sha256:${OTHER}` } },
    { source: { ...role("LOGO").source as object, generation: 4 } },
    { source: { ...role("LOGO").source as object, url: null } },
    { work: { status: "REVOKED" } },
    { ready: { ...role("LOGO").ready as object, objectKey: `shop-brands/shop_other/logo/sha256-${SHA}.jpg` } },
    { ready: { ...role("LOGO").ready as object, objectKey: `shop-brands/${shopId}/logo/../evil.jpg` } },
    { ready: { ...role("LOGO").ready as object, contentSha256: OTHER } },
    { ready: { ...role("LOGO").ready as object, contentType: "image/svg+xml" } },
    { ready: { ...role("LOGO").ready as object, contentType: "image/png" } },
    { ready: { ...role("LOGO").ready as object, sizeBytes: 5 * 1024 * 1024 } },
    { ready: { ...role("LOGO").ready as object, sizeBytes: 0 } },
    { ready: { ...role("LOGO").ready as object, width: 0 } },
    { ready: { ...role("LOGO").ready as object, height: 9999999 } },
    { ready: { ...role("LOGO").ready as object, verifiedAt: "invalid" } },
  ];
  for (const candidate of candidates) {
    const result = check(media({ LOGO: role("LOGO", candidate) }));
    assert.notEqual(result.status, "READY", JSON.stringify(candidate));
    assert.ok(!("url" in result));
  }
});

test("unsafe unconfigured public origins cannot create a browser/media URL", () => {
  for (const origin of ["http://shop-brands.modainteract.com", "https://evil.example/other/",
    "https://shop-brands.modainteract.com/?k=x", "https://user:pass@shop-brands.modainteract.com"] ) {
    assert.notEqual(check(media(), "LOGO", origin).status, "READY");
  }
});
