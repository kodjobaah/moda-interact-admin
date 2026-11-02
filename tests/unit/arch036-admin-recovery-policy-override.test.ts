import assert from "node:assert/strict";
import { test } from "node:test";
import type { PrismaClient } from "@prisma/client";
import {
  saveTenantRecoveryPolicyOverride,
} from "../../src/lib/admin/recovery-policy-override";
import type { RecoveryPolicySnapshot } from "../../src/lib/admin/recovery-policy";

const now = new Date("2026-11-02T12:00:00.000Z");

const policy: RecoveryPolicySnapshot = {
  recoveryDelayMinutes: 45,
  recoveryOfferMode: "FIXED",
  fixedShopifyDiscountId: "discount-1",
  followUpEnabled: false,
  followUpDelayMinutes: null,
};

function makeFixture(options: {
  platform?: "SHOPIFY" | "WOOCOMMERCE";
  catalogueStatus?: string;
  catalogueGeneration?: number;
  discountShopId?: string;
  discountPlatform?: "SHOPIFY" | "WOOCOMMERCE";
  discountSelected?: boolean;
  lastSeenSyncGeneration?: number;
  failAudit?: boolean;
  failOverrideWrite?: boolean;
} = {}) {
  const committed = {
    override: {
      shopId: "shop-1",
      recoveryDelayMinutes: 30,
      recoveryOfferMode: "NONE",
      fixedShopifyDiscountId: null,
      followUpEnabled: false,
      followUpDelayMinutes: null,
      expiresAt: null,
      reason: "previous reason",
    } as Record<string, unknown> | null,
    audits: [] as Array<Record<string, unknown>>,
  };
  const queries: Record<string, unknown>[] = [];
  let isolationLevel: string | undefined;

  const shop = { id: "shop-1", platform: options.platform ?? "WOOCOMMERCE" };
  const isWooDiscount = (options.discountPlatform ?? "WOOCOMMERCE") === "WOOCOMMERCE";
  const discount = {
    id: "discount-1",
    shopId: options.discountShopId ?? "shop-1",
    shopifyDiscountNodeId: isWooDiscount
      ? "woo:coupon:27"
      : "gid://shopify/Discount/1",
    providerType: isWooDiscount ? "WooCoupon:percent" : "ShopifyDiscountCode",
    method: "CODE",
    providerStatus: "ACTIVE",
    isAvailable: options.discountSelected ?? !isWooDiscount,
    fixedSelectable: true,
    startsAt: null,
    endsAt: null,
    unavailableAt: null,
    lastSeenSyncGeneration: options.lastSeenSyncGeneration ?? 4,
  };

  const database = {
    $transaction: async (
      callback: (transaction: unknown) => Promise<void>,
      transactionOptions: { isolationLevel?: string },
    ) => {
      isolationLevel = transactionOptions.isolationLevel;
      const working = structuredClone(committed);
      const transaction = {
        shop: {
          findUnique: async (query: unknown) => {
            queries.push({ kind: "shop", query });
            return shop;
          },
        },
        shopifyDiscountCatalogue: {
          findUnique: async (query: unknown) => {
            queries.push({ kind: "catalogue", query });
            return {
              status: options.catalogueStatus ?? "CURRENT",
              syncGeneration: options.catalogueGeneration ?? 4,
            };
          },
        },
        shopifyDiscount: {
          findFirst: async (query: unknown) => {
            queries.push({ kind: "discount", query });
            const where = (query as { where: { id: string; shopId: string } }).where;
            return where.id === discount.id && where.shopId === discount.shopId
              ? discount
              : null;
          },
        },
        shopRecoveryPolicyOverride: {
          findUnique: async (query: unknown) => {
            queries.push({ kind: "existing-override", query });
            return working.override;
          },
          upsert: async (query: unknown) => {
            queries.push({ kind: "override-write", query });
            if (options.failOverrideWrite) throw new Error("override write failed");
            const values = query as { create: Record<string, unknown> };
            working.override = values.create;
          },
        },
        shopRecoveryPolicyOverrideAuditEvent: {
          create: async (query: unknown) => {
            queries.push({ kind: "audit-write", query });
            if (options.failAudit) throw new Error("audit write failed");
            working.audits.push((query as { data: Record<string, unknown> }).data);
          },
        },
      };

      await callback(transaction);
      committed.override = working.override;
      committed.audits = working.audits;
    },
  };

  return {
    database: database as unknown as PrismaClient,
    committed,
    queries,
    get isolationLevel() {
      return isolationLevel;
    },
  };
}

function input(overrides: Partial<Parameters<typeof saveTenantRecoveryPolicyOverride>[1]> = {}) {
  return {
    shopId: "shop-1",
    policy,
    expiresAt: null,
    reason: "approved recovery override",
    authorize: async () => "admin-1",
    ...overrides,
  };
}

test("FIXED override accepts an unchecked valid Woo coupon and writes an audited same-Shop FK", async () => {
  const fixture = makeFixture();
  await saveTenantRecoveryPolicyOverride(fixture.database, input());

  assert.equal(fixture.committed.override?.fixedShopifyDiscountId, "discount-1");
  assert.equal(fixture.committed.override?.updatedByPlatformAdminId, "admin-1");
  assert.equal(fixture.committed.audits.length, 1);
  assert.equal(fixture.committed.audits[0]?.platformAdminId, "admin-1");
  assert.equal(fixture.committed.audits[0]?.reason, "approved recovery override");
  assert.equal(fixture.isolationLevel, "Serializable");
  assert.deepEqual(
    (fixture.queries.find((entry) => entry.kind === "discount")?.query as { where: unknown }).where,
    { id: "discount-1", shopId: "shop-1" },
  );
});

test("stale or foreign-Shop choices are rejected before audit or override writes", async () => {
  for (const options of [
    { lastSeenSyncGeneration: 3 },
    { catalogueGeneration: 5 },
    { catalogueStatus: "ERROR" },
    { discountShopId: "shop-2" },
  ]) {
    const fixture = makeFixture(options);
    await assert.rejects(
      saveTenantRecoveryPolicyOverride(fixture.database, input()),
      /discount catalogue must be current|current\/selectable/,
    );
    assert.equal(fixture.committed.audits.length, 0);
    assert.equal(fixture.queries.some((entry) => entry.kind === "override-write"), false);
  }
});

test("Shopify override rejects a Woo provider row even when it is marked available", async () => {
  const fixture = makeFixture({
    platform: "SHOPIFY",
    discountPlatform: "WOOCOMMERCE",
    discountSelected: true,
  });
  await assert.rejects(
    saveTenantRecoveryPolicyOverride(fixture.database, input()),
    /current\/selectable/,
  );
  assert.equal(fixture.committed.audits.length, 0);
  assert.equal(fixture.queries.some((entry) => entry.kind === "override-write"), false);
});

test("audit and override writes roll back together when the override write fails", async () => {
  const fixture = makeFixture({ failOverrideWrite: true });
  const originalOverride = structuredClone(fixture.committed.override);

  await assert.rejects(
    saveTenantRecoveryPolicyOverride(fixture.database, input()),
    /override write failed/,
  );

  assert.deepEqual(fixture.committed.override, originalOverride);
  assert.deepEqual(fixture.committed.audits, []);
  assert.equal(fixture.queries.some((entry) => entry.kind === "audit-write"), true);
});

test("audit failure propagates without changing the existing override", async () => {
  const fixture = makeFixture({ failAudit: true });
  const originalOverride = structuredClone(fixture.committed.override);

  await assert.rejects(
    saveTenantRecoveryPolicyOverride(fixture.database, input()),
    /audit write failed/,
  );

  assert.deepEqual(fixture.committed.override, originalOverride);
  assert.deepEqual(fixture.committed.audits, []);
  assert.equal(fixture.queries.some((entry) => entry.kind === "override-write"), false);
});