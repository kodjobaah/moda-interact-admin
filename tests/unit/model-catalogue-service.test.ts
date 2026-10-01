import assert from "node:assert/strict";
import test from "node:test";
import {
  mutateModelCatalogue,
  type ModelCatalogueMutation,
} from "../../src/lib/admin/model-catalogue.ts";
import { parseModelCatalogueForm } from "../../src/lib/admin/model-catalogue-validation.ts";

const availability = {
  id: "availability-1",
  scope: "PLATFORM",
  shopId: null,
  enabled: false,
  editVersion: 1,
  shop: null,
};

const model = {
  id: "model-1",
  availabilityId: "availability-1",
  provider: "openrouter",
  providerModelId: "vendor-model",
  displayName: "Model One",
  description: "",
  configurationSchemaVersion: 1,
  configuration: {},
  enabled: true,
  editVersion: 4,
};

function form(values: Record<string, string>): FormData {
  const result = new FormData();
  for (const [name, value] of Object.entries(values)) result.set(name, value);
  return result;
}

function validForm(overrides: Record<string, string> = {}): FormData {
  return form({
    availabilityId: "availability-1",
    provider: "openrouter",
    providerModelId: "vendor-model",
    displayName: "Model One",
    description: "",
    configuration: "{}",
    ...overrides,
  });
}

function validInput(overrides: Record<string, string> = {}) {
  return parseModelCatalogueForm(validForm(overrides), { mode: "create" });
}

function transactionFor(
  options: {
    existing?: Record<string, unknown> | null;
    availability?: Record<string, unknown> | null;
    updateCount?: number;
    createError?: Error & { code?: string };
  } = {},
) {
  const calls: Array<{ model: string; method: string; args: unknown }> = [];
  const audits: Array<Record<string, unknown>> = [];
  const existing = options.existing === undefined ? model : options.existing;
  const targetAvailability =
    options.availability === undefined ? availability : options.availability;
  const transaction = {
    commerceModelAvailability: {
      findUnique: async (args: unknown) => {
        calls.push({ model: "availability", method: "findUnique", args });
        return targetAvailability;
      },
    },
    commerceModelCatalogueEntry: {
      create: async (args: unknown) => {
        calls.push({ model: "catalogue", method: "create", args });
        if (options.createError) throw options.createError;
        const data = (args as { data: Record<string, unknown> }).data;
        return {
          id: "model-new",
          availabilityId: data.availabilityId,
          provider: data.provider,
          providerModelId: data.providerModelId,
          displayName: data.displayName,
          description: data.description,
          configurationSchemaVersion: data.configurationSchemaVersion,
          configuration: data.configuration,
          enabled: data.enabled,
          editVersion: data.editVersion,
        };
      },
      findUnique: async (args: unknown) => {
        calls.push({ model: "catalogue", method: "findUnique", args });
        return existing;
      },
      updateMany: async (args: unknown) => {
        calls.push({ model: "catalogue", method: "updateMany", args });
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

test("create writes validated configuration, enabled state, version and provenance under a disabled Availability", async () => {
  const fake = transactionFor();
  await mutateModelCatalogue(
    fake.transaction,
    { kind: "create", input: validInput() },
    "admin-1",
  );
  const create = fake.calls.find(
    (call) => call.model === "catalogue" && call.method === "create",
  );
  const data = (create?.args as { data: Record<string, unknown> }).data;
  assert.equal(data.availabilityId, "availability-1");
  assert.equal(data.provider, "openrouter");
  assert.equal(data.providerModelId, "vendor-model");
  assert.equal(data.configurationSchemaVersion, 1);
  assert.deepEqual(data.configuration, {});
  assert.equal(data.enabled, true);
  assert.equal(data.editVersion, 1);
  assert.equal(data.createdByAdminId, "admin-1");
  assert.equal(data.updatedByAdminId, "admin-1");
  assert.equal(fake.audits[0]?.action, "CREATE_MODEL_CATALOGUE_ENTRY");
  assert.equal(fake.audits[0]?.modelCatalogueEntryId, "model-new");
  assert.equal(fake.audits[0]?.modelAvailabilityId, "availability-1");
  assert.deepEqual(fake.audits[0]?.metadata, {
    provider: "openrouter",
    providerModelId: "vendor-model",
    availabilityId: "availability-1",
    enabled: true,
    configurationSchemaVersion: 1,
  });
});

test("create rejects missing Availability and scoped identity conflicts with bounded errors", async () => {
  const missing = transactionFor({ availability: null });
  await assert.rejects(
    mutateModelCatalogue(
      missing.transaction,
      { kind: "create", input: validInput() },
      "admin-1",
    ),
    { message: "Model Availability not found." },
  );

  const conflict = transactionFor({
    createError: Object.assign(new Error("db details"), { code: "P2002" }),
  });
  await assert.rejects(
    mutateModelCatalogue(
      conflict.transaction,
      { kind: "create", input: validInput() },
      "admin-1",
    ),
    {
      message:
        "A model with this provider and model ID already exists in the selected availability.",
    },
  );
  assert.equal(conflict.audits.length, 0);
});

test("update keeps immutable identity, uses edit-version CAS and preserves entry ID on reassignment", async () => {
  const fake = transactionFor({
    availability: {
      ...availability,
      id: "availability-2",
      enabled: true,
    },
  });
  const updateForm = form({
    intent: "update",
    id: "model-1",
    expectedEditVersion: "4",
    availabilityId: "availability-2",
    displayName: "Renamed",
    description: "Updated description",
    configuration: '{"temperature":0.2}',
  });
  const mutation: ModelCatalogueMutation = {
    kind: "update",
    formData: updateForm,
    id: "model-1",
    expectedEditVersion: 4,
  };
  await mutateModelCatalogue(fake.transaction, mutation, "admin-1");
  const update = fake.calls.find((call) => call.method === "updateMany");
  assert.deepEqual(update?.args, {
    where: { id: "model-1", editVersion: 4 },
    data: {
      availabilityId: "availability-2",
      displayName: "Renamed",
      description: "Updated description",
      configurationSchemaVersion: 1,
      configuration: { temperature: 0.2 },
      editVersion: 5,
      updatedByAdminId: "admin-1",
    },
  });
  assert.equal(fake.audits.length, 2);
  assert.equal(fake.audits[0]?.action, "UPDATE_MODEL_CATALOGUE_ENTRY");
  assert.equal(fake.audits[0]?.modelCatalogueEntryId, "model-1");
  assert.equal(
    fake.audits[1]?.action,
    "ASSIGN_MODEL_CATALOGUE_ENTRY_AVAILABILITY",
  );
  assert.deepEqual(fake.audits[1]?.metadata, {
    previousAvailabilityId: "availability-1",
    newAvailabilityId: "availability-2",
  });
  assert.equal(
    fake.calls.some((call) => call.model === "configuration"),
    false,
  );
  for (const audit of fake.audits) {
    assert.equal(
      "configuration" in (audit.metadata as Record<string, unknown>),
      false,
    );
  }
});

test("stale update and failed CAS both reject without writing audit events", async () => {
  const stale = transactionFor();
  await assert.rejects(
    mutateModelCatalogue(
      stale.transaction,
      {
        kind: "update",
        id: "model-1",
        expectedEditVersion: 3,
        formData: form({
          availabilityId: "availability-1",
          displayName: "x",
          description: "",
          configuration: "{}",
        }),
      },
      "admin-1",
    ),
    { message: "Model catalogue entry changed. Refresh and try again." },
  );

  const raced = transactionFor({ updateCount: 0 });
  await assert.rejects(
    mutateModelCatalogue(
      raced.transaction,
      {
        kind: "update",
        id: "model-1",
        expectedEditVersion: 4,
        formData: form({
          availabilityId: "availability-1",
          displayName: "x",
          description: "",
          configuration: "{}",
        }),
      },
      "admin-1",
    ),
    { message: "Model catalogue entry changed. Refresh and try again." },
  );
  assert.equal(raced.audits.length, 0);
});

test("disabling a selected model uses CAS and does not clear Agent Configuration", async () => {
  const fake = transactionFor();
  await mutateModelCatalogue(
    fake.transaction,
    {
      kind: "set-enabled",
      id: "model-1",
      expectedEditVersion: 4,
      enabled: false,
    },
    "admin-1",
  );
  const update = fake.calls.find((call) => call.method === "updateMany");
  assert.deepEqual(update?.args, {
    where: { id: "model-1", editVersion: 4 },
    data: { enabled: false, editVersion: 5, updatedByAdminId: "admin-1" },
  });
  assert.equal(fake.audits[0]?.action, "DISABLE_MODEL_CATALOGUE_ENTRY");
  assert.equal(fake.audits[0]?.modelAvailabilityId, "availability-1");
  assert.equal(
    fake.calls.some((call) => call.model === "configuration"),
    false,
  );
});

test("lifecycle rejects unchanged state and emits the matching enable audit", async () => {
  const alreadyEnabled = transactionFor();
  await assert.rejects(
    mutateModelCatalogue(
      alreadyEnabled.transaction,
      {
        kind: "set-enabled",
        id: "model-1",
        expectedEditVersion: 4,
        enabled: true,
      },
      "admin-1",
    ),
    { message: "Model catalogue entry is already enabled." },
  );
  assert.equal(alreadyEnabled.audits.length, 0);

  const enable = transactionFor({ existing: { ...model, enabled: false } });
  await mutateModelCatalogue(
    enable.transaction,
    {
      kind: "set-enabled",
      id: "model-1",
      expectedEditVersion: 4,
      enabled: true,
    },
    "admin-1",
  );
  assert.equal(enable.audits[0]?.action, "ENABLE_MODEL_CATALOGUE_ENTRY");
});
