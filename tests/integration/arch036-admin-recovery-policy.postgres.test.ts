import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { Prisma, PrismaClient } from "@prisma/client";
import type { PlatformAdminPrincipal } from "../../src/lib/auth/platform-admin";
import { readAdminDiscountCatalogue } from "../../src/lib/admin/discount-catalogue";
import {
  authorizeTenantRecoveryPolicyOverride,
  saveTenantRecoveryPolicyOverride,
} from "../../src/lib/admin/recovery-policy-override";
import type { RecoveryPolicySnapshot } from "../../src/lib/admin/recovery-policy";

if (process.env.ARCH036_DISPOSABLE_POSTGRES !== "1") {
  throw new Error("Refusing ARCH-036 PostgreSQL tests without a disposable database.");
}

const database = new PrismaClient();
const now = new Date();
const principalIds: string[] = [];

after(async () => {
  await database.$disconnect();
});

async function createShop(platform: "SHOPIFY" | "WOOCOMMERCE" = "SHOPIFY") {
  const suffix = randomUUID().replaceAll("-", "");
  const shop = await database.shop.create({
    data: {
      id: `arch036_${suffix}`,
      domain: `arch036-${suffix}.example.invalid`,
      platform,
      status: "ACTIVE",
    },
  });
  await database.shopifyDiscountCatalogue.create({
    data: { shopId: shop.id, status: "CURRENT", syncGeneration: 7 },
  });
  return shop.id;
}

async function createAdmin(
  role: "SUPER_ADMIN" | "ADMIN" = "SUPER_ADMIN",
  active = true,
): Promise<PlatformAdminPrincipal> {
  const id = `arch036_admin_${randomUUID().replaceAll("-", "")}`;
  principalIds.push(id);
  const admin = await database.platformAdmin.create({
    data: {
      id,
      provider: "arch036-integration",
      providerSubject: id,
      email: `${id}@example.invalid`,
      displayName: "ARCH-036 integration administrator",
      role,
      active,
    },
  });
  return { id: admin.id, role: admin.role, developmentBypass: false };
}

async function createDiscount(
  shopId: string,
  input: {
    identity: string;
    providerType: string;
    title: string;
    status?: string;
    selected?: boolean;
    fixedSelectable?: boolean;
    generation?: number;
    endsAt?: Date | null;
  },
) {
  return database.shopifyDiscount.create({
    data: {
      shopId,
      shopifyDiscountNodeId: input.identity,
      providerType: input.providerType,
      method: "CODE",
      providerStatus: input.status ?? "ACTIVE",
      title: input.title,
      codeCount: input.fixedSelectable === false ? null : 1,
      singleRedeemCode:
        input.fixedSelectable === false
          ? null
          : input.title.toUpperCase().replaceAll(" ", "-"),
      fixedSelectable: input.fixedSelectable ?? true,
      providerSnapshot: Prisma.JsonNull,
      isAvailable: input.selected ?? false,
      lastSeenSyncGeneration: input.generation ?? 7,
      lastSyncedAt: now,
      endsAt: input.endsAt ?? null,
    },
  });
}

const fixedPolicy = (discountId: string): RecoveryPolicySnapshot => ({
  recoveryDelayMinutes: 45,
  recoveryOfferMode: "FIXED",
  fixedShopifyDiscountId: discountId,
  followUpEnabled: false,
  followUpDelayMinutes: null,
});

function authorize(principal: PlatformAdminPrincipal) {
  return (transaction: Prisma.TransactionClient) =>
    authorizeTenantRecoveryPolicyOverride(transaction, principal);
}

test("seed a disposable tenant for the manual viewport check", async () => {
  const shopId = "arch036_visual_shop";
  const shop = await database.shop.create({
    data: {
      id: shopId,
      domain: "arch036-visual.example.invalid",
      platform: "SHOPIFY",
      status: "ACTIVE",
    },
  });
  await database.shopifyDiscountCatalogue.create({
    data: { shopId: shop.id, status: "CURRENT", syncGeneration: 7 },
  });
  const discount = await createDiscount(shopId, {
    identity: "gid://shopify/Discount/visual-preview",
    providerType: "ShopifyDiscountCode",
    title: "Desktop and mobile preview coupon",
  });
  assert.equal(discount.isAvailable, false);
});

test("catalogue read scopes rows to one shop and separates Shopify selection from validity", async () => {
  const shopId = await createShop("SHOPIFY");
  const otherShopId = await createShop("SHOPIFY");
  const validUnchecked = await createDiscount(shopId, {
    identity: "gid://shopify/Discount/valid-unchecked",
    providerType: "ShopifyDiscountCode",
    title: "A valid unchecked discount",
  });
  await createDiscount(shopId, {
    identity: "gid://shopify/Discount/expired",
    providerType: "ShopifyDiscountCode",
    title: "Expired discount",
    selected: true,
    endsAt: new Date(now.getTime() - 60_000),
  });
  await createDiscount(shopId, {
    identity: "gid://shopify/Discount/removed",
    providerType: "ShopifyDiscountCode",
    title: "Removed discount",
    status: "REMOVED",
  });
  await createDiscount(shopId, {
    identity: "woo:coupon:27",
    providerType: "WooCoupon:percent",
    title: "Wrong provider",
    selected: true,
  });
  await createDiscount(otherShopId, {
    identity: "gid://shopify/Discount/foreign",
    providerType: "ShopifyDiscountCode",
    title: "Foreign discount",
  });

  const current = await readAdminDiscountCatalogue(database, {
    shopId,
    platform: "SHOPIFY",
    catalogueStatus: "CURRENT",
    catalogueGeneration: 7,
    now,
  });
  assert.equal(current.knownDiscountCount, 4);
  assert.equal(current.runningDiscountCount, 1);
  assert.equal(current.fixedSelectableCount, 1);
  assert.equal(current.discounts.find((row) => row.id === validUnchecked.id)?.isAvailable, false);
  assert.equal(current.discounts.find((row) => row.id === validUnchecked.id)?.assignable, true);
  assert.equal(current.discounts.some((row) => row.title === "Foreign discount"), false);
  assert.equal(current.discounts.find((row) => row.title === "Wrong provider")?.assignable, false);

  const stale = await readAdminDiscountCatalogue(database, {
    shopId,
    platform: "SHOPIFY",
    catalogueStatus: "ERROR",
    catalogueGeneration: 7,
    now,
  });
  assert.equal(stale.knownDiscountCount, 4);
  assert.equal(stale.runningDiscountCount, 0);
  assert.equal(stale.fixedSelectableCount, 0);
  assert.ok(stale.discounts.every((row) => !row.assignable));
});

test("Shopify fixed override persists with a real same-Shop FK and audit despite unchecked selection", async () => {
  const shopId = await createShop("SHOPIFY");
  const discount = await createDiscount(shopId, {
    identity: "gid://shopify/Discount/fixed-override",
    providerType: "ShopifyDiscountCode",
    title: "Unchecked Shopify discount",
    selected: false,
  });
  const admin = await createAdmin();

  await saveTenantRecoveryPolicyOverride(database, {
    shopId,
    policy: fixedPolicy(discount.id),
    expiresAt: null,
    reason: "ARCH-036 Shopify integration override",
    authorize: authorize(admin),
  });

  const override = await database.shopRecoveryPolicyOverride.findUniqueOrThrow({
    where: { shopId },
  });
  const audit = await database.shopRecoveryPolicyOverrideAuditEvent.findMany({
    where: { shopId },
  });
  assert.equal(override.fixedShopifyDiscountId, discount.id);
  assert.equal(override.updatedByPlatformAdminId, admin.id);
  assert.equal(audit.length, 1);
  assert.equal(audit[0]?.platformAdminId, admin.id);
  assert.equal(audit[0]?.reason, "ARCH-036 Shopify integration override");
});

test("database-backed authorization denies non-SUPER_ADMIN and inactive admins before writes", async () => {
  const shopId = await createShop("SHOPIFY");
  const discount = await createDiscount(shopId, {
    identity: "gid://shopify/Discount/denied-override",
    providerType: "ShopifyDiscountCode",
    title: "Denied override discount",
  });
  const deniedPrincipals = [
    await createAdmin("ADMIN"),
    await createAdmin("SUPER_ADMIN", false),
  ];

  for (const principal of deniedPrincipals) {
    await assert.rejects(
      saveTenantRecoveryPolicyOverride(database, {
        shopId,
        policy: fixedPolicy(discount.id),
        expiresAt: null,
        reason: "must not be written",
        authorize: authorize(principal),
      }),
      /SUPER_ADMIN access is required/,
    );
  }
  assert.equal(
    await database.shopRecoveryPolicyOverrideAuditEvent.count({ where: { shopId } }),
    0,
  );
  assert.equal(await database.shopRecoveryPolicyOverride.count({ where: { shopId } }), 0);
});

test("PostgreSQL rolls back the inserted audit when the override upsert fails", async () => {
  const shopId = await createShop("SHOPIFY");
  const discount = await createDiscount(shopId, {
    identity: "gid://shopify/Discount/rollback-override",
    providerType: "ShopifyDiscountCode",
    title: "Rollback override discount",
  });
  const admin = await createAdmin();
  const suffix = randomUUID().replaceAll("-", "");
  const functionName = `arch036_fail_override_${suffix}`;
  const triggerName = `arch036_fail_override_${suffix}`;

  await database.$executeRawUnsafe(`
    CREATE FUNCTION shopify."${functionName}"() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW."shopId" = '${shopId}' THEN
        RAISE EXCEPTION 'ARCH-036 forced override write failure';
      END IF;
      RETURN NEW;
    END;
    $$
  `);
  await database.$executeRawUnsafe(`
    CREATE TRIGGER "${triggerName}"
    BEFORE INSERT OR UPDATE ON shopify."ShopRecoveryPolicyOverride"
    FOR EACH ROW EXECUTE FUNCTION shopify."${functionName}"()
  `);

  try {
    await assert.rejects(
      saveTenantRecoveryPolicyOverride(database, {
        shopId,
        policy: fixedPolicy(discount.id),
        expiresAt: null,
        reason: "must roll back with failed override write",
        authorize: authorize(admin),
      }),
      /ARCH-036 forced override write failure/,
    );
    assert.equal(
      await database.shopRecoveryPolicyOverrideAuditEvent.count({ where: { shopId } }),
      0,
    );
    assert.equal(await database.shopRecoveryPolicyOverride.count({ where: { shopId } }), 0);
  } finally {
    await database.$executeRawUnsafe(
      `DROP TRIGGER IF EXISTS "${triggerName}" ON shopify."ShopRecoveryPolicyOverride"`,
    );
    await database.$executeRawUnsafe(
      `DROP FUNCTION IF EXISTS shopify."${functionName}"()`,
    );
  }
});