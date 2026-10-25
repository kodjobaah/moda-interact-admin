import assert from "node:assert/strict";
import test from "node:test";
import {
  PLATFORM_POLICY_REGISTRY,
  validateConfiguration,
} from "../../src/lib/admin/platform-configuration/contracts.ts";
import { mutateConfigurationWithDependencies } from "../../src/lib/admin/platform-configuration/mutate.ts";
import {
  readConfiguration,
  type ConfigurationDatabase,
} from "../../src/lib/admin/platform-configuration/repository.ts";
import { PLATFORM_SECRET_CONTRACTS } from "../../src/lib/admin/platform-configuration/secrets-contracts.ts";

const KEY = "shopBrand.publicMedia";
const DEFAULTS = {
  publicOrigin: "https://shop-brands.modainteract.com",
  bucketName: "moda-interact-shop-brands",
};
const contract = PLATFORM_POLICY_REGISTRY.get(KEY)!;

function createDatabase() {
  let row: {
    value: Record<string, unknown>;
    version: number;
    updatedAt: Date;
    updatedBy: string;
  } | null = null;
  let writes = 0;
  const db = {
    platformConfiguration: {
      findUnique: async () => row,
      create: async ({
        data,
      }: {
        data: {
          value: Record<string, unknown>;
          version: number;
          updatedBy: string;
        };
      }) => {
        writes += 1;
        row = { ...data, updatedAt: new Date("2026-10-25T00:00:00.000Z") };
        return row;
      },
      updateMany: async () => {
        writes += 1;
        return { count: 0 };
      },
    },
    platformConfigurationAudit: { create: async () => ({}) },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(db),
  } as unknown as ConfigurationDatabase;
  return { db, writes: () => writes };
}

test("missing public-media setting reads the agreed defaults without persistence", async () => {
  const { db, writes } = createDatabase();
  const snapshot = await readConfiguration(
    db,
    "test",
    KEY,
    PLATFORM_POLICY_REGISTRY,
  );
  assert.deepEqual(snapshot, {
    key: KEY,
    value: DEFAULTS,
    version: 0,
    updatedAt: null,
    updatedBy: null,
    invalidStoredValue: false,
  });
  assert.equal(writes(), 0);
});

test("explicit SUPER_ADMIN save persists the distinct policy and reads it back", async () => {
  const { db, writes } = createDatabase();
  const saved = await mutateConfigurationWithDependencies(
    { key: KEY, expectedVersion: 0, values: DEFAULTS },
    "save",
    {
      principal: { role: "SUPER_ADMIN" },
      environment: "test",
      actorId: "admin-1",
      db,
      registry: PLATFORM_POLICY_REGISTRY,
    },
  );
  assert.deepEqual(saved, { key: KEY, version: 1 });
  assert.equal(writes(), 1);
  assert.deepEqual(
    (await readConfiguration(db, "test", KEY, PLATFORM_POLICY_REGISTRY)).value,
    DEFAULTS,
  );
  assert.deepEqual(
    PLATFORM_SECRET_CONTRACTS.find(
      (item) => item.key === "merchant.knowledge.r2",
    )?.fields.map((field) => field.name),
    [
      "endpoint",
      "bucket",
      "accessKeyId",
      "secretAccessKey",
      "maxUploadBytes",
      "maxXlsxUncompressedBytes",
    ],
  );
  assert.equal(PLATFORM_POLICY_REGISTRY.has("merchant.knowledge.r2"), false);
});

test("invalid origin and bucket values fail validation and mutations", async () => {
  for (const values of [
    { ...DEFAULTS, publicOrigin: null },
    { ...DEFAULTS, publicOrigin: "http://shop-brands.modainteract.com" },
    { ...DEFAULTS, publicOrigin: "https://shop-brands.modainteract.com/media" },
    { ...DEFAULTS, bucketName: "Invalid_Bucket" },
  ]) {
    assert.equal(validateConfiguration(contract, values).ok, false);
    const { db, writes } = createDatabase();
    await assert.rejects(() =>
      mutateConfigurationWithDependencies(
        { key: KEY, expectedVersion: 0, values },
        "save",
        {
          principal: { role: "SUPER_ADMIN" },
          environment: "test",
          actorId: "admin-1",
          db,
          registry: PLATFORM_POLICY_REGISTRY,
        },
      ),
    );
    assert.equal(writes(), 0);
  }
});

test("non-SUPER_ADMIN save is rejected without mutation", async () => {
  const { db, writes } = createDatabase();
  await assert.rejects(() =>
    mutateConfigurationWithDependencies(
      { key: KEY, expectedVersion: 0, values: DEFAULTS },
      "save",
      {
        principal: { role: "ADMIN" },
        environment: "test",
        actorId: "admin-1",
        db,
        registry: PLATFORM_POLICY_REGISTRY,
      },
    ),
  );
  assert.equal(writes(), 0);
});
