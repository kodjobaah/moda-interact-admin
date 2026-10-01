import {
  CommerceModelAvailabilitySchema,
  CommerceModelCatalogueEntrySchema,
} from "@modainteract/moda-interact-shared/commerce/model";
import type { Prisma, PrismaClient } from "@prisma/client";

export type MerchantPricingPlanModelOption = {
  id: string;
  displayName: string;
  provider: string;
  providerModelId: string;
};

const merchantPricingPlanModelSelect = {
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
  availability: {
    select: {
      id: true,
      scope: true,
      shopId: true,
      enabled: true,
      editVersion: true,
    },
  },
} satisfies Prisma.CommerceModelCatalogueEntrySelect;

type PricingPlanModelDatabase = PrismaClient | Prisma.TransactionClient;

async function getDatabase(
  db?: PricingPlanModelDatabase,
): Promise<PricingPlanModelDatabase> {
  if (db) return db;
  return (await import("../../prisma.ts")).prisma;
}

function projectValidatedModel(row: {
  id: string;
  availabilityId: string;
  provider: string;
  providerModelId: string;
  displayName: string;
  description: string;
  configurationSchemaVersion: number;
  configuration: Prisma.JsonValue;
  enabled: boolean;
  editVersion: number;
  availability: {
    id: string;
    scope: string;
    shopId: string | null;
    enabled: boolean;
    editVersion: number;
  } | null;
}): MerchantPricingPlanModelOption {
  const availability = CommerceModelAvailabilitySchema.safeParse(
    row.availability,
  );
  const model = CommerceModelCatalogueEntrySchema.safeParse({
    id: row.id,
    availabilityId: row.availabilityId,
    provider: row.provider,
    providerModelId: row.providerModelId,
    displayName: row.displayName,
    description: row.description,
    configurationSchemaVersion: row.configurationSchemaVersion,
    configuration: row.configuration,
    enabled: row.enabled,
    editVersion: row.editVersion,
  });

  if (!availability.success || !model.success) {
    throw new Error("Commerce model catalogue data is invalid.");
  }

  if (
    !model.data.enabled ||
    !availability.data.enabled ||
    availability.data.scope !== "PLATFORM" ||
    availability.data.shopId !== null
  ) {
    throw new Error(
      "The selected Commerce model is unavailable for Platform pricing plans.",
    );
  }

  return {
    id: model.data.id,
    displayName: model.data.displayName,
    provider: model.data.provider,
    providerModelId: model.data.providerModelId,
  };
}

export async function listMerchantPricingPlanModelOptions(input?: {
  db?: PrismaClient | Prisma.TransactionClient;
}): Promise<MerchantPricingPlanModelOption[]> {
  const db = await getDatabase(input?.db);
  const rows = await db.commerceModelCatalogueEntry.findMany({
    where: {
      enabled: true,
      availability: {
        is: { enabled: true, scope: "PLATFORM", shopId: null },
      },
    },
    select: merchantPricingPlanModelSelect,
    orderBy: [
      { displayName: "asc" },
      { provider: "asc" },
      { providerModelId: "asc" },
      { id: "asc" },
    ],
  });

  return rows.map(projectValidatedModel);
}

export async function assertMerchantPricingPlanModelSelectable(input: {
  db: PrismaClient | Prisma.TransactionClient;
  modelId: string;
}): Promise<MerchantPricingPlanModelOption> {
  const row = await input.db.commerceModelCatalogueEntry.findUnique({
    where: { id: input.modelId },
    select: merchantPricingPlanModelSelect,
  });

  if (!row) {
    throw new Error(
      "The selected Commerce model is unavailable for Platform pricing plans.",
    );
  }

  return projectValidatedModel(row);
}
