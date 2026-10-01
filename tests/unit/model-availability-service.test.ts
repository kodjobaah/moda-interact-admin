import assert from "node:assert/strict";
import test from "node:test";
import { mutateModelAvailability } from "../../src/lib/admin/model-availability.ts";

const platformAvailability = {
  id: "arch024-platform-model-availability",
  scope: "PLATFORM",
  shopId: null,
  enabled: true,
  editVersion: 3,
};

const shopAvailability = {
  id: "availability-shop-1",
  scope: "SHOP",
  shopId: "shop-1",
  enabled: false,
  editVersion: 2,
};

function transactionFor(
  options: {
    shop?: Record<string, unknown> | null;
    availability?: Record<string, unknown> | null;
    updateCount?: number;
  } = {},
) {
  const calls: Array<{ model: string; method: string; args?: unknown }> = [];
  const audits: Array<Record<string, unknown>> = [];
  const shop =
    options.shop === undefined
      ? {
          id: "shop-1",
          domain: "shop.example",
          status: "ACTIVE",
          commerceModelAvailability: null,
        }
      : options.shop;
  const availability =
    options.availability === undefined
      ? { ...shopAvailability }
      : options.availability;
  const transaction = {
    shop: {
      findUnique: async (args: unknown) => {
        calls.push({ model: "shop", method: "findUnique", args });
        return shop;
      },
    },
    commerceModelAvailability: {
      create: async (args: unknown) => {
        calls.push({ model: "availability", method: "create", args });
        return { id: "availability-created" };
      },
      findUnique: async (args: unknown) => {
        calls.push({ model: "availability", method: "findUnique", args });
        return availability;
      },
      updateMany: async (args: unknown) => {
        calls.push({ model: "availability", method: "updateMany", args });
        return { count: options.updateCount ?? 1 };
      },
    },
    commerceAuditEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        calls.push({ model: "audit", method: "create", args: data });
        audits.push(data);
      },
    },
  };
  return { transaction: transaction as never, calls, audits };
}

test("Shop Availability creation fixes scope/state and audits canonical Shop identity", async () => {
  const fake = transactionFor();
  await mutateModelAvailability(
    fake.transaction,
    {
      kind: "create-shop",
      input: { shopId: "shop-1", reason: "Enable model options" },
    },
    "admin-1",
  );
  const create = fake.calls.find(
    (call) => call.model === "availability" && call.method === "create",
  );
  assert.deepEqual((create?.args as { data: unknown }).data, {
    scope: "SHOP",
    shopId: "shop-1",
    enabled: true,
    editVersion: 1,
    createdByAdminId: "admin-1",
    updatedByAdminId: "admin-1",
  });
  assert.deepEqual(fake.audits[0], {
    action: "CREATE_MODEL_AVAILABILITY",
    actorAdminId: "admin-1",
    modelAvailabilityId: "availability-created",
    shopId: "shop-1",
    reason: "Enable model options",
    metadata: { scope: "SHOP", shopDomain: "shop.example" },
  });
  assert.equal(
    fake.calls.some(
      (call) => call.model === "catalogue" || call.model === "configuration",
    ),
    false,
  );
});

test("Shop Availability creation rejects a missing Shop and any existing Availability", async () => {
  const missing = transactionFor({ shop: null });
  await assert.rejects(
    mutateModelAvailability(
      missing.transaction,
      { kind: "create-shop", input: { shopId: "missing", reason: "Create" } },
      "admin-1",
    ),
    /Shop not found\./,
  );
  const existing = transactionFor({
    shop: {
      id: "shop-1",
      domain: "shop.example",
      status: "ACTIVE",
      commerceModelAvailability: { id: "disabled-availability" },
    },
  });
  await assert.rejects(
    mutateModelAvailability(
      existing.transaction,
      { kind: "create-shop", input: { shopId: "shop-1", reason: "Create" } },
      "admin-1",
    ),
    /Model Availability already exists for this Shop\./,
  );
  assert.equal(
    existing.calls.some((call) => call.method === "create"),
    false,
  );
  assert.equal(existing.audits.length, 0);
});

test("enable and disable use edit-version CAS and audit the bounded target", async () => {
  const enable = transactionFor({
    availability: { ...shopAvailability, enabled: false },
  });
  await mutateModelAvailability(
    enable.transaction,
    {
      kind: "set-enabled",
      input: {
        id: shopAvailability.id,
        expectedEditVersion: 2,
        enabled: true,
        reason: "Enable",
      },
    },
    "admin-1",
  );
  const update = enable.calls.find(
    (call) => call.model === "availability" && call.method === "updateMany",
  );
  assert.deepEqual(update?.args, {
    where: { id: shopAvailability.id, editVersion: 2 },
    data: {
      enabled: true,
      editVersion: { increment: 1 },
      updatedByAdminId: "admin-1",
    },
  });
  assert.deepEqual(enable.audits[0], {
    action: "ENABLE_MODEL_AVAILABILITY",
    actorAdminId: "admin-1",
    modelAvailabilityId: shopAvailability.id,
    shopId: "shop-1",
    reason: "Enable",
    metadata: { scope: "SHOP" },
  });

  const disable = transactionFor({ availability: { ...platformAvailability } });
  await mutateModelAvailability(
    disable.transaction,
    {
      kind: "set-enabled",
      input: {
        id: platformAvailability.id,
        expectedEditVersion: 3,
        enabled: false,
        reason: "Disable",
      },
    },
    "admin-1",
  );
  assert.equal(disable.audits[0]?.action, "DISABLE_MODEL_AVAILABILITY");
  assert.equal(disable.audits[0]?.shopId, null);
  assert.deepEqual(disable.audits[0]?.metadata, { scope: "PLATFORM" });
});

test("missing, stale, same-state and CAS-race changes do not write audit events", async () => {
  const missing = transactionFor({ availability: null });
  await assert.rejects(
    mutateModelAvailability(
      missing.transaction,
      {
        kind: "set-enabled",
        input: {
          id: "missing",
          expectedEditVersion: 1,
          enabled: true,
          reason: "Change",
        },
      },
      "admin-1",
    ),
    /Model Availability not found\./,
  );

  const stale = transactionFor();
  await assert.rejects(
    mutateModelAvailability(
      stale.transaction,
      {
        kind: "set-enabled",
        input: {
          id: shopAvailability.id,
          expectedEditVersion: 1,
          enabled: true,
          reason: "Change",
        },
      },
      "admin-1",
    ),
    /Model Availability changed; reload and retry\./,
  );

  const same = transactionFor({
    availability: { ...shopAvailability, enabled: true },
  });
  await assert.rejects(
    mutateModelAvailability(
      same.transaction,
      {
        kind: "set-enabled",
        input: {
          id: shopAvailability.id,
          expectedEditVersion: 2,
          enabled: true,
          reason: "Change",
        },
      },
      "admin-1",
    ),
    /Model Availability is already enabled\./,
  );

  const race = transactionFor({ updateCount: 0 });
  await assert.rejects(
    mutateModelAvailability(
      race.transaction,
      {
        kind: "set-enabled",
        input: {
          id: shopAvailability.id,
          expectedEditVersion: 2,
          enabled: true,
          reason: "Change",
        },
      },
      "admin-1",
    ),
    /Model Availability changed; reload and retry\./,
  );
  assert.equal(
    missing.audits.length +
      stale.audits.length +
      same.audits.length +
      race.audits.length,
    0,
  );
});
