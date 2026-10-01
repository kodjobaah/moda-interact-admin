import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import {
  assertMerchantPricingPlanModelSelectable,
  listMerchantPricingPlanModelOptions,
} from "../../src/lib/admin/merchant/pricing-plan-model.ts";

function model(
  id: string,
  options: {
    displayName?: string;
    provider?: string;
    providerModelId?: string;
    enabled?: boolean;
    availabilityEnabled?: boolean;
    scope?: "PLATFORM" | "SHOP";
    shopId?: string | null;
  } = {},
) {
  const scope = options.scope ?? "PLATFORM";
  return {
    id,
    availabilityId: `availability-${id}`,
    provider: options.provider ?? "openrouter",
    providerModelId: options.providerModelId ?? `model-${id}`,
    displayName: options.displayName ?? id,
    description: "",
    configurationSchemaVersion: 1,
    configuration: {},
    enabled: options.enabled ?? true,
    editVersion: 1,
    availability: {
      id: `availability-${id}`,
      scope,
      shopId:
        options.shopId === undefined
          ? scope === "SHOP"
            ? "shop-1"
            : null
          : options.shopId,
      enabled: options.availabilityEnabled ?? true,
      editVersion: 1,
    },
  };
}

function fakeDatabase(rows: ReturnType<typeof model>[]) {
  const calls: Array<{ method: string; args: Record<string, unknown> }> = [];
  const db = {
    commerceModelCatalogueEntry: {
      findMany: async (args: Record<string, unknown>) => {
        calls.push({ method: "findMany", args });
        return rows
          .filter(
            (entry) =>
              entry.enabled &&
              entry.availability.enabled &&
              entry.availability.scope === "PLATFORM" &&
              entry.availability.shopId === null,
          )
          .sort(
            (left, right) =>
              left.displayName.localeCompare(right.displayName) ||
              left.provider.localeCompare(right.provider) ||
              left.providerModelId.localeCompare(right.providerModelId) ||
              left.id.localeCompare(right.id),
          );
      },
      findUnique: async (args: Record<string, unknown>) => {
        calls.push({ method: "findUnique", args });
        const where = args.where as { id: string };
        return rows.find((entry) => entry.id === where.id) ?? null;
      },
    },
  } as unknown as PrismaClient;

  return { db, calls };
}

test("lists only enabled Platform models and projects in deterministic order", async () => {
  const { db, calls } = fakeDatabase([
    model("z", { displayName: "Alpha", provider: "b", providerModelId: "2" }),
    model("a", { displayName: "Alpha", provider: "a", providerModelId: "2" }),
    model("b", { displayName: "Alpha", provider: "a", providerModelId: "1" }),
    model("disabled-model", { enabled: false }),
    model("disabled-availability", { availabilityEnabled: false }),
    model("shop-model", { scope: "SHOP" }),
  ]);

  const options = await listMerchantPricingPlanModelOptions({ db });

  assert.deepEqual(
    options.map(({ id }) => id),
    ["b", "a", "z"],
  );
  assert.deepEqual(Object.keys(options[0]).sort(), [
    "displayName",
    "id",
    "provider",
    "providerModelId",
  ]);
  assert.deepEqual(calls[0].args.orderBy, [
    { displayName: "asc" },
    { provider: "asc" },
    { providerModelId: "asc" },
    { id: "asc" },
  ]);
  assert.deepEqual(calls[0].args.where, {
    enabled: true,
    availability: {
      is: { enabled: true, scope: "PLATFORM", shopId: null },
    },
  });
});

test("validates selectable model assignments and rejects unavailable targets", async () => {
  const { db } = fakeDatabase([
    model("enabled"),
    model("disabled", { enabled: false }),
    model("disabled-availability", { availabilityEnabled: false }),
    model("shop", { scope: "SHOP" }),
  ]);

  assert.deepEqual(
    await assertMerchantPricingPlanModelSelectable({ db, modelId: "enabled" }),
    {
      id: "enabled",
      displayName: "enabled",
      provider: "openrouter",
      providerModelId: "model-enabled",
    },
  );
  for (const modelId of [
    "missing",
    "disabled",
    "disabled-availability",
    "shop",
  ]) {
    await assert.rejects(
      assertMerchantPricingPlanModelSelectable({ db, modelId }),
      /unavailable for Platform pricing plans/,
    );
  }
});

test("rejects persisted catalogue data that fails shared schema validation", async () => {
  const invalidModel = { ...model("invalid"), configurationSchemaVersion: 2 };
  const { db } = fakeDatabase([invalidModel]);

  await assert.rejects(
    listMerchantPricingPlanModelOptions({ db }),
    /Commerce model catalogue data is invalid/,
  );
});
