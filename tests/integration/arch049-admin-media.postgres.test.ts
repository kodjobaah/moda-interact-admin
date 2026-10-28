import assert from "node:assert/strict";
import { test, after } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { readShopBrandMedia } from "../../src/lib/admin/whatsapp-templates/media/reader.ts";

if (process.env.ARCH049_DISPOSABLE_POSTGRES !== "1") throw new Error("A disposable PostgreSQL is required for ARCH-049 integration tests.");
const db = new PrismaClient();
const idSuffix = randomUUID().replaceAll("-", "");
const one = `media_shop_${idSuffix}`;
const two = `other_shop_${idSuffix}`;
const digest = "a".repeat(64);
const origin = "https://shop-brands.modainteract.com";
const mediaFor = (domain: string) => ({ schemaVersion: 1, roles: { LOGO: {
  source: { url: "https://merchant.example.net/raw.png", fingerprint: `sha256:${digest}`, generation: 1 },
  work: { status: "READY" }, ready: { sourceGeneration: 1, sourceFingerprint: `sha256:${digest}`,
    objectKey: `shop-brands/${domain}/logo/sha256-${digest}.jpg`, contentType: "image/jpeg",
    contentSha256: digest, width: 1125, height: 600, sizeBytes: 123456, verifiedAt: "2026-10-27T00:00:00Z" },
} } });
const principal = { id: "admin-local", role: "SUPER_ADMIN" as const, developmentBypass: false };

after(async () => { await db.$disconnect(); });

test("actual migrated commerce.ShopBrand joins and verified role scoping", async () => {
  const domainOne = `one-${idSuffix}.example.org`;
  const domainTwo = `two-${idSuffix}.example.org`;
  await db.shop.create({ data: { id: one, domain: domainOne } });
  await db.shop.create({ data: { id: two, domain: domainTwo } });
  try {
    await db.shopBrand.create({ data: { shopId: one, brandName: "First shop", logoUrl: "https://merchant.example.net/raw.png",
      whatsAppMedia: mediaFor(domainOne) } });
    await db.shopBrand.create({ data: { shopId: two, brandName: "Second shop", logoUrl: "https://merchant.example.net/raw2.png",
      whatsAppMedia: mediaFor(domainTwo) } });
    const shopOne = await readShopBrandMedia({ db, shopId: one, principal, environment: "test" });
    const shopTwo = await readShopBrandMedia({ db, shopId: two, principal, environment: "test" });
    assert.equal(shopOne.roles.LOGO.status, "READY");
    assert.equal(shopTwo.roles.LOGO.status, "READY");
    if (shopOne.roles.LOGO.status === "READY" && shopTwo.roles.LOGO.status === "READY") {
      assert.ok(shopOne.roles.LOGO.url.includes(domainOne));
      assert.ok(shopTwo.roles.LOGO.url.includes(domainTwo));
      assert.ok(!shopOne.roles.LOGO.url.includes(domainTwo));
      assert.ok(!shopTwo.roles.LOGO.url.includes(domainOne));
      assert.match(shopOne.roles.LOGO.url, /^https:\/\/shop-brands\.modainteract\.com\//);
    }
    // Cannot borrow other tenant's immutable image key, even when the row is READY.
    await db.shopBrand.update({ where: { shopId: one }, data: { whatsAppMedia: mediaFor(domainTwo) } });
    assert.equal((await readShopBrandMedia({ db, shopId: one, principal, environment: "test" })).roles.LOGO.status, "STALE");
    const rawRows = await db.$queryRawUnsafe<Array<{ shopId: string }>>(
      'SELECT "shopId" FROM "commerce"."ShopBrand" WHERE "shopId" = $1', one);
    assert.equal(rawRows[0]?.shopId, one);
  } finally {
    await db.shopBrand.deleteMany({ where: { shopId: { in: [one, two] } } });
    await db.shop.deleteMany({ where: { id: { in: [one, two] } } });
  }
});
