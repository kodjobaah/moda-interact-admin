import assert from "node:assert/strict";
import { test } from "node:test";
import { readShopBrandMedia, ShopBrandMediaReadError, type MediaReadDatabase } from "../../src/lib/admin/whatsapp-templates/media/reader.ts";

const admin = { id: "admin-1", role: "SUPER_ADMIN", developmentBypass: false } as const;
const environment = "test";
const shopId = "shop_test_1";
const DEFAULT = { publicOrigin: "https://shop-brands.modainteract.com", bucketName: "moda-interact-shop-brands" };
function stubMedia() {
  const observed: { shop: unknown[]; brand: unknown[]; config: unknown[] } = { shop: [], brand: [], config: [] };
  let shop = { id: shopId, domain: "store.example.com" };
  let value: unknown = {};
  let config: unknown = null;
  const db = {
    shop: { findUnique: async (args: unknown) => { observed.shop.push(args); return shop; } },
    shopBrand: { findUnique: async (args: unknown) => { observed.brand.push(args); return { whatsAppMedia: value }; } },
    platformConfiguration: { findUnique: async (args: unknown) => { observed.config.push(args); return config === null ? null : { value: config }; } },
  } as unknown as MediaReadDatabase;
  return { observed, db, setShop: (v: typeof shop) => { shop = v; }, setMedia: (v: unknown) => { value = v; },
    setConfig: (v: unknown) => { config = v; } };
}

test("SUPER_ADMIN exact shop read projects only role states and uses current environment", async () => {
  const stub = stubMedia();
  const result = await readShopBrandMedia({ shopId, principal: admin, db: stub.db, environment });
  assert.equal(result.shopId, shopId);
  assert.equal(result.roles.LOGO.status, "MISSING");
  assert.deepEqual(stub.observed.shop, [{ where: { id: shopId }, select: { id: true, domain: true } }]);
  assert.deepEqual(stub.observed.brand, [{ where: { shopId }, select: { whatsAppMedia: true } }]);
  assert.deepEqual(stub.observed.config, [{ where: { environment_key: { environment, key: "shopBrand.publicMedia" } }, select: { value: true } }]);
  assert.equal(JSON.stringify(result).includes("original"), false);
});

test("non-superadmins and invalid identifiers cannot query tenants or config", async () => {
  const stub = stubMedia();
  for (const principal of [{ id: "admin-2", role: "ADMIN", developmentBypass: false },
    { id: "", role: "SUPER_ADMIN", developmentBypass: false }] as any[]) {
    await assert.rejects(() => readShopBrandMedia({ shopId, principal, db: stub.db, environment }), /SUPER_ADMIN/);
  }
  await assert.rejects(() => readShopBrandMedia({ shopId: "../../another-shop", principal: admin, db: stub.db, environment }),
    (err: unknown) => err instanceof ShopBrandMediaReadError && err.code === "INVALID_SHOP");
  assert.equal(stub.observed.shop.length, 0);
  assert.equal(stub.observed.config.length, 0);
});

test("an invalid saved origin fails closed instead of falling back to defaults", async () => {
  const stub = stubMedia();
  stub.setConfig({ ...DEFAULT, publicOrigin: "http://insecure.example.com" });
  await assert.rejects(() => readShopBrandMedia({ shopId, principal: admin, db: stub.db, environment }),
    (err: unknown) => err instanceof ShopBrandMediaReadError && err.code === "CONFIG_UNAVAILABLE");
  assert.equal(stub.observed.brand.length, 0);
});

test("a missing shop does not read another tenant's media", async () => {
  const stub = stubMedia();
  // Prisma null means no row; use a direct mock with no shop.
  const db = { ...stub.db, shop: { findUnique: async () => null } } as unknown as MediaReadDatabase;
  await assert.rejects(() => readShopBrandMedia({ shopId, principal: admin, db, environment }),
    (err: unknown) => err instanceof ShopBrandMediaReadError && err.code === "NOT_FOUND");
  assert.equal(stub.observed.brand.length, 0);
});
