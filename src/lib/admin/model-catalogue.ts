import {
  COMMERCE_MODEL_CONFIGURATION_SCHEMA_VERSION,
  CommerceModelAvailabilitySchema,
  CommerceModelCatalogueEntrySchema,
  type CommerceModelAvailability,
  type CommerceModelCatalogueEntry,
} from "@modainteract/moda-interact-shared/commerce/model";
import type { Prisma } from "@prisma/client";
import {
  parseModelCatalogueForm,
  type ParsedModelCatalogueInput,
} from "./model-catalogue-validation.ts";

export type ModelCatalogueAvailabilityOption = {
  availability: CommerceModelAvailability;
  label: string;
  shopDomain: string | null;
};

export type ModelCatalogueAdminRow = {
  model: CommerceModelCatalogueEntry;
  availability: CommerceModelAvailability;
  availabilityLabel: string;
  shopDomain: string | null;
  selectionCount: number;
};

export type ModelCatalogueStatusFilter = "all" | "enabled" | "disabled";

export type ModelCatalogueAdminPage = {
  rows: ModelCatalogueAdminRow[];
  availabilities: ModelCatalogueAvailabilityOption[];
  page: number;
  pageSize: 50;
  total: number;
};

export type ModelCatalogueMutation =
  | { kind: "create"; input: ParsedModelCatalogueInput }
  | {
      kind: "update";
      formData: FormData;
      id: string;
      expectedEditVersion: number;
    }
  | {
      kind: "set-enabled";
      id: string;
      expectedEditVersion: number;
      enabled: boolean;
    };

type CatalogueTransaction = Prisma.TransactionClient;

const pageSize = 50 as const;
const staleError = "Model catalogue entry changed. Refresh and try again.";
const duplicateError =
  "A model with this provider and model ID already exists in the selected availability.";

const catalogueSelect = {
  id: true,
  availabilityId: true,
  provider: true,
  providerModelId: true,
  displayName: true,
  description: true,
  configurationSchemaVersion: true,
  configuration: true,
  enabled: true,
  editVersion: true,
} satisfies Prisma.CommerceModelCatalogueEntrySelect;

const availabilitySelect = {
  id: true,
  scope: true,
  shopId: true,
  enabled: true,
  editVersion: true,
  shop: { select: { id: true, domain: true } },
} satisfies Prisma.CommerceModelAvailabilitySelect;

function parseAvailability(value: unknown): CommerceModelAvailability {
  return CommerceModelAvailabilitySchema.parse(value);
}

type AvailabilityRecord = {
  id: string;
  scope: string;
  shopId: string | null;
  enabled: boolean;
  editVersion: number;
  shop: { id: string; domain: string } | null;
};

function availabilityOption(
  record: AvailabilityRecord,
): ModelCatalogueAvailabilityOption {
  const availability = parseAvailability({
    id: record.id,
    scope: record.scope,
    shopId: record.shopId,
    enabled: record.enabled,
    editVersion: record.editVersion,
  });
  const shop = availability.scope === "SHOP" ? record.shop : null;
  if (
    availability.scope === "SHOP" &&
    (!shop || shop.id !== availability.shopId)
  ) {
    throw new Error("Shop Model Availability references an unavailable Shop.");
  }
  const shopDomain = shop?.domain ?? null;
  const label =
    availability.scope === "PLATFORM" ? "Platform" : `Shop · ${shopDomain}`;
  return {
    availability,
    label: `${label}${availability.enabled ? "" : " · Disabled"}`,
    shopDomain,
  };
}

function compareFolded(left: string, right: string): number {
  const a = left.toLocaleLowerCase("en");
  const b = right.toLocaleLowerCase("en");
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareExact(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareAvailabilityOptions(
  left: ModelCatalogueAvailabilityOption,
  right: ModelCatalogueAvailabilityOption,
): number {
  const scopeOrder =
    (left.availability.scope === "PLATFORM" ? 0 : 1) -
    (right.availability.scope === "PLATFORM" ? 0 : 1);
  if (scopeOrder !== 0) return scopeOrder;
  const domainOrder = compareFolded(
    left.shopDomain ?? "",
    right.shopDomain ?? "",
  );
  if (domainOrder !== 0) return domainOrder;
  const shopIdOrder = compareExact(
    left.availability.shopId ?? "",
    right.availability.shopId ?? "",
  );
  if (shopIdOrder !== 0) return shopIdOrder;
  return compareExact(left.availability.id, right.availability.id);
}

function pageNumber(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 1;
  return Math.min(
    Math.max(1, Math.floor(value)),
    Math.floor(Number.MAX_SAFE_INTEGER / pageSize),
  );
}

export async function getModelCatalogueAdminPage(input: {
  availabilityId?: string;
  query?: string;
  status?: ModelCatalogueStatusFilter;
  page?: number;
}): Promise<ModelCatalogueAdminPage> {
  const [{ requirePlatformAdminRead }, { prisma }] = await Promise.all([
    import("@/lib/auth/platform-admin"),
    import("@/lib/prisma"),
  ]);
  await requirePlatformAdminRead();

  const query = input.query?.trim() ?? "";
  if (query.length > 128)
    throw new Error("Search must be 128 characters or fewer.");
  const status = input.status ?? "all";
  if (!["all", "enabled", "disabled"].includes(status)) {
    throw new Error("Model catalogue status filter is invalid.");
  }
  if (input.availabilityId !== undefined) {
    const selectedAvailability =
      await prisma.commerceModelAvailability.findUnique({
        where: { id: input.availabilityId },
        select: { id: true },
      });
    if (!selectedAvailability) throw new Error("Model Availability not found.");
  }

  const where: Prisma.CommerceModelCatalogueEntryWhereInput = {
    ...(input.availabilityId ? { availabilityId: input.availabilityId } : {}),
    ...(status === "all" ? {} : { enabled: status === "enabled" }),
    ...(query
      ? {
          OR: [
            { displayName: { contains: query, mode: "insensitive" } },
            { provider: { contains: query, mode: "insensitive" } },
            { providerModelId: { contains: query, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const currentPage = pageNumber(input.page);
  const [availabilityRecords, total, records] = await Promise.all([
    prisma.commerceModelAvailability.findMany({
      select: availabilitySelect,
      orderBy: [
        { scope: "asc" },
        { shop: { domain: "asc" } },
        { shopId: "asc" },
        { id: "asc" },
      ],
    }),
    prisma.commerceModelCatalogueEntry.count({ where }),
    prisma.commerceModelCatalogueEntry.findMany({
      where,
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
      orderBy: [
        { availability: { scope: "asc" } },
        {
          availability: { shop: { domain: "asc" } },
        },
        { displayName: "asc" },
        { provider: "asc" },
        { providerModelId: "asc" },
        { id: "asc" },
      ],
      select: {
        ...catalogueSelect,
        availability: { select: availabilitySelect },
        _count: { select: { configurations: true } },
      },
    }),
  ]);

  const availabilities = availabilityRecords
    .map((record) => availabilityOption(record as AvailabilityRecord))
    .sort(compareAvailabilityOptions);
  const availabilityById = new Map(
    availabilities.map((option) => [option.availability.id, option]),
  );
  const rows: ModelCatalogueAdminRow[] = records.map((record) => {
    const model = CommerceModelCatalogueEntrySchema.parse({
      id: record.id,
      availabilityId: record.availabilityId,
      provider: record.provider,
      providerModelId: record.providerModelId,
      displayName: record.displayName,
      description: record.description,
      configurationSchemaVersion: record.configurationSchemaVersion,
      configuration: record.configuration,
      enabled: record.enabled,
      editVersion: record.editVersion,
    });
    const availability = availabilityById.get(model.availabilityId);
    if (!availability) throw new Error("Model Availability not found.");
    return {
      model,
      availability: availability.availability,
      availabilityLabel: availability.label,
      shopDomain: availability.shopDomain,
      selectionCount: record._count.configurations,
    };
  });

  rows.sort((left, right) => {
    const scopeOrder =
      (left.availability.scope === "PLATFORM" ? 0 : 1) -
      (right.availability.scope === "PLATFORM" ? 0 : 1);
    if (scopeOrder !== 0) return scopeOrder;
    if (left.shopDomain === null && right.shopDomain !== null) return -1;
    if (left.shopDomain !== null && right.shopDomain === null) return 1;
    const domainOrder = compareFolded(
      left.shopDomain ?? "",
      right.shopDomain ?? "",
    );
    if (domainOrder !== 0) return domainOrder;
    const nameOrder = compareFolded(
      left.model.displayName,
      right.model.displayName,
    );
    if (nameOrder !== 0) return nameOrder;
    const providerOrder = compareExact(
      left.model.provider,
      right.model.provider,
    );
    if (providerOrder !== 0) return providerOrder;
    const modelIdOrder = compareExact(
      left.model.providerModelId,
      right.model.providerModelId,
    );
    if (modelIdOrder !== 0) return modelIdOrder;
    return compareExact(left.model.id, right.model.id);
  });

  return { rows, availabilities, page: currentPage, pageSize, total };
}

type TargetAvailability = {
  id: string;
  scope: string;
  shopId: string | null;
  enabled: boolean;
  editVersion: number;
  shop: { id: string; domain: string } | null;
};

async function requireAvailability(
  transaction: CatalogueTransaction,
  availabilityId: string,
): Promise<CommerceModelAvailability> {
  const target = await transaction.commerceModelAvailability.findUnique({
    where: { id: availabilityId },
    select: availabilitySelect,
  });
  if (!target) throw new Error("Model Availability not found.");
  return availabilityOption(target as TargetAvailability).availability;
}

function catalogueRow(value: unknown): CommerceModelCatalogueEntry {
  return CommerceModelCatalogueEntrySchema.parse(value);
}

function createAudit(
  transaction: CatalogueTransaction,
  data: Prisma.CommerceAuditEventUncheckedCreateInput,
) {
  return transaction.commerceAuditEvent.create({ data });
}

async function createCatalogueEntry(
  transaction: CatalogueTransaction,
  input: ParsedModelCatalogueInput,
  actorAdminId: string,
): Promise<void> {
  await requireAvailability(transaction, input.availabilityId);
  const created = await transaction.commerceModelCatalogueEntry.create({
    data: createData(input, actorAdminId),
    select: catalogueSelect,
  });
  const model = catalogueRow(created);
  await createAudit(transaction, {
    action: "CREATE_MODEL_CATALOGUE_ENTRY",
    actorAdminId,
    modelCatalogueEntryId: model.id,
    modelAvailabilityId: model.availabilityId,
    reason: `Created Commerce model catalogue entry ${model.provider}/${model.providerModelId}`,
    metadata: {
      provider: model.provider,
      providerModelId: model.providerModelId,
      availabilityId: model.availabilityId,
      enabled: true,
      configurationSchemaVersion: COMMERCE_MODEL_CONFIGURATION_SCHEMA_VERSION,
    },
  });
}

function createData(
  input: ParsedModelCatalogueInput,
  actorAdminId: string,
): Prisma.CommerceModelCatalogueEntryUncheckedCreateInput {
  return {
    availabilityId: input.availabilityId,
    provider: input.provider,
    providerModelId: input.providerModelId,
    displayName: input.displayName,
    description: input.description,
    configurationSchemaVersion: COMMERCE_MODEL_CONFIGURATION_SCHEMA_VERSION,
    configuration: input.configuration as Prisma.InputJsonValue,
    enabled: true,
    editVersion: 1,
    createdByAdminId: actorAdminId,
    updatedByAdminId: actorAdminId,
  };
}

async function updateCatalogueEntry(
  transaction: CatalogueTransaction,
  mutation: Extract<ModelCatalogueMutation, { kind: "update" }>,
  actorAdminId: string,
): Promise<void> {
  const existingValue =
    await transaction.commerceModelCatalogueEntry.findUnique({
      where: { id: mutation.id },
      select: catalogueSelect,
    });
  if (!existingValue) throw new Error("Model catalogue entry not found.");
  const existing = catalogueRow(existingValue);
  if (existing.editVersion !== mutation.expectedEditVersion) {
    throw new Error(staleError);
  }
  const input = parseModelCatalogueForm(mutation.formData, {
    mode: "update",
    identity: {
      provider: existing.provider,
      providerModelId: existing.providerModelId,
    },
  });
  await requireAvailability(transaction, input.availabilityId);
  const updated = await transaction.commerceModelCatalogueEntry.updateMany({
    where: { id: existing.id, editVersion: mutation.expectedEditVersion },
    data: {
      availabilityId: input.availabilityId,
      displayName: input.displayName,
      description: input.description,
      configurationSchemaVersion: COMMERCE_MODEL_CONFIGURATION_SCHEMA_VERSION,
      configuration: input.configuration as Prisma.InputJsonValue,
      editVersion: mutation.expectedEditVersion + 1,
      updatedByAdminId: actorAdminId,
    },
  });
  if (updated.count !== 1) throw new Error(staleError);

  await createAudit(transaction, {
    action: "UPDATE_MODEL_CATALOGUE_ENTRY",
    actorAdminId,
    modelCatalogueEntryId: existing.id,
    modelAvailabilityId: input.availabilityId,
    reason: "Updated Commerce model catalogue entry",
    metadata: {
      availabilityId: input.availabilityId,
      configurationSchemaVersion: COMMERCE_MODEL_CONFIGURATION_SCHEMA_VERSION,
    },
  });
  if (existing.availabilityId !== input.availabilityId) {
    await createAudit(transaction, {
      action: "ASSIGN_MODEL_CATALOGUE_ENTRY_AVAILABILITY",
      actorAdminId,
      modelCatalogueEntryId: existing.id,
      modelAvailabilityId: input.availabilityId,
      reason: "Reassigned Commerce model catalogue entry availability",
      metadata: {
        previousAvailabilityId: existing.availabilityId,
        newAvailabilityId: input.availabilityId,
      },
    });
  }
}

async function setCatalogueEntryEnabled(
  transaction: CatalogueTransaction,
  mutation: Extract<ModelCatalogueMutation, { kind: "set-enabled" }>,
  actorAdminId: string,
): Promise<void> {
  const existingValue =
    await transaction.commerceModelCatalogueEntry.findUnique({
      where: { id: mutation.id },
      select: catalogueSelect,
    });
  if (!existingValue) throw new Error("Model catalogue entry not found.");
  const existing = catalogueRow(existingValue);
  if (existing.editVersion !== mutation.expectedEditVersion) {
    throw new Error(staleError);
  }
  if (existing.enabled === mutation.enabled) {
    throw new Error(
      mutation.enabled
        ? "Model catalogue entry is already enabled."
        : "Model catalogue entry is already disabled.",
    );
  }
  const updated = await transaction.commerceModelCatalogueEntry.updateMany({
    where: { id: existing.id, editVersion: mutation.expectedEditVersion },
    data: {
      enabled: mutation.enabled,
      editVersion: mutation.expectedEditVersion + 1,
      updatedByAdminId: actorAdminId,
    },
  });
  if (updated.count !== 1) throw new Error(staleError);
  await createAudit(transaction, {
    action: mutation.enabled
      ? "ENABLE_MODEL_CATALOGUE_ENTRY"
      : "DISABLE_MODEL_CATALOGUE_ENTRY",
    actorAdminId,
    modelCatalogueEntryId: existing.id,
    modelAvailabilityId: existing.availabilityId,
    reason: mutation.enabled
      ? "Enabled Commerce model catalogue entry"
      : "Disabled Commerce model catalogue entry",
    metadata: { enabled: mutation.enabled },
  });
}

function databaseCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  return typeof error.code === "string" ? error.code : undefined;
}

export async function mutateModelCatalogue(
  transaction: CatalogueTransaction,
  mutation: ModelCatalogueMutation,
  actorAdminId: string,
): Promise<void> {
  try {
    if (mutation.kind === "create") {
      await createCatalogueEntry(transaction, mutation.input, actorAdminId);
    } else if (mutation.kind === "update") {
      await updateCatalogueEntry(transaction, mutation, actorAdminId);
    } else {
      await setCatalogueEntryEnabled(transaction, mutation, actorAdminId);
    }
  } catch (error) {
    const code = databaseCode(error);
    if (code === "P2002") throw new Error(duplicateError);
    if (code === "P2034") throw new Error(staleError);
    throw error;
  }
}
