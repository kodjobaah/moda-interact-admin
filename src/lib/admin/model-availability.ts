import {
  CommerceModelAvailabilitySchema,
  CommerceModelAvailabilityScopeSchema,
  type CommerceModelAvailability,
} from "@modainteract/moda-interact-shared/commerce/model";
import type { Prisma } from "@prisma/client";
import type {
  CreateShopModelAvailabilityInput,
  SetModelAvailabilityEnabledInput,
} from "@/lib/admin/model-availability-validation";

export type ModelAvailabilityAdminItem = {
  availability: CommerceModelAvailability;
  shopDomain: string | null;
  shopStatus: string | null;
  modelCount: number;
  enabledModelCount: number;
  createdAt: Date;
  updatedAt: Date;
};

export type ModelAvailabilityCatalogue = {
  platform: ModelAvailabilityAdminItem;
  shops: ModelAvailabilityAdminItem[];
};

export type ModelAvailabilityShopCandidate = {
  id: string;
  domain: string;
  status: string;
};

export type ModelAvailabilityMutation =
  | { kind: "create-shop"; input: CreateShopModelAvailabilityInput }
  | { kind: "set-enabled"; input: SetModelAvailabilityEnabledInput };

type ModelAvailabilityTransaction = Prisma.TransactionClient;

function parseAvailability(value: {
  id: string;
  scope: string;
  shopId: string | null;
  enabled: boolean;
  editVersion: number;
}): CommerceModelAvailability {
  const scope = CommerceModelAvailabilityScopeSchema.parse(value.scope);
  return CommerceModelAvailabilitySchema.parse({
    id: value.id,
    scope,
    shopId: value.shopId,
    enabled: value.enabled,
    editVersion: value.editVersion,
  });
}

function compareText(left: string, right: string): number {
  const normalizedLeft = left.toLowerCase();
  const normalizedRight = right.toLowerCase();
  if (normalizedLeft < normalizedRight) return -1;
  if (normalizedLeft > normalizedRight) return 1;
  return 0;
}

function compareExactText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export async function getModelAvailabilityCatalogue(): Promise<ModelAvailabilityCatalogue> {
  const [{ requirePlatformAdminRead }, { prisma }] = await Promise.all([
    import("@/lib/auth/platform-admin"),
    import("@/lib/prisma"),
  ]);
  await requirePlatformAdminRead();

  const rows = await prisma.commerceModelAvailability.findMany({
    select: {
      id: true,
      scope: true,
      shopId: true,
      enabled: true,
      editVersion: true,
      createdAt: true,
      updatedAt: true,
      shop: { select: { id: true, domain: true, status: true } },
      entries: { select: { id: true, enabled: true } },
    },
  });

  const projectRow = (
    row: (typeof rows)[number],
  ): ModelAvailabilityAdminItem => {
    const availability = parseAvailability(row);
    const shop = availability.scope === "SHOP" ? row.shop : null;
    if (
      availability.scope === "SHOP" &&
      (!shop || shop.id !== availability.shopId)
    ) {
      throw new Error(
        "Shop Model Availability references an unavailable Shop.",
      );
    }
    return {
      availability,
      shopDomain: shop?.domain ?? null,
      shopStatus: shop?.status ?? null,
      modelCount: row.entries.length,
      enabledModelCount: row.entries.filter((entry) => entry.enabled).length,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  };

  const projectedRows = rows.map((row) => ({ row, item: projectRow(row) }));
  const platformRows = projectedRows.filter(
    ({ item }) => item.availability.scope === "PLATFORM",
  );
  if (platformRows.length !== 1) {
    throw new Error("Platform Model Availability is not configured correctly.");
  }
  const platform = platformRows[0]!.item;
  const shops = projectedRows
    .filter(({ item }) => item.availability.scope === "SHOP")
    .map(({ item }) => item)
    .sort((left, right) => {
      const domainOrder = compareText(left.shopDomain!, right.shopDomain!);
      if (domainOrder !== 0) return domainOrder;
      const shopIdOrder = compareExactText(
        left.availability.shopId!,
        right.availability.shopId!,
      );
      if (shopIdOrder !== 0) return shopIdOrder;
      return compareExactText(left.availability.id, right.availability.id);
    });

  return { platform, shops };
}

export async function searchModelAvailabilityShopCandidates(
  search: string,
): Promise<ModelAvailabilityShopCandidate[]> {
  const [{ requirePlatformAdminRead }, { prisma }] = await Promise.all([
    import("@/lib/auth/platform-admin"),
    import("@/lib/prisma"),
  ]);
  await requirePlatformAdminRead();
  const term = search.trim().slice(0, 120);
  if (term.length < 2) return [];

  return prisma.shop.findMany({
    where: {
      domain: { contains: term, mode: "insensitive" },
      commerceModelAvailability: { is: null },
    },
    orderBy: [{ domain: "asc" }, { id: "asc" }],
    take: 25,
    select: { id: true, domain: true, status: true },
  });
}

export async function mutateModelAvailability(
  transaction: ModelAvailabilityTransaction,
  mutation: ModelAvailabilityMutation,
  actorAdminId: string,
): Promise<void> {
  if (mutation.kind === "create-shop") {
    const shop = await transaction.shop.findUnique({
      where: { id: mutation.input.shopId },
      select: {
        id: true,
        domain: true,
        status: true,
        commerceModelAvailability: { select: { id: true } },
      },
    });
    if (!shop) throw new Error("Shop not found.");
    if (shop.commerceModelAvailability) {
      throw new Error("Model Availability already exists for this Shop.");
    }

    const created = await transaction.commerceModelAvailability.create({
      data: {
        scope: "SHOP",
        shopId: shop.id,
        enabled: true,
        editVersion: 1,
        createdByAdminId: actorAdminId,
        updatedByAdminId: actorAdminId,
      },
      select: { id: true },
    });
    await transaction.commerceAuditEvent.create({
      data: {
        action: "CREATE_MODEL_AVAILABILITY",
        actorAdminId,
        modelAvailabilityId: created.id,
        shopId: shop.id,
        reason: mutation.input.reason,
        metadata: { scope: "SHOP", shopDomain: shop.domain },
      },
    });
    return;
  }

  const existing = await transaction.commerceModelAvailability.findUnique({
    where: { id: mutation.input.id },
    select: {
      id: true,
      scope: true,
      shopId: true,
      enabled: true,
      editVersion: true,
    },
  });
  if (!existing) throw new Error("Model Availability not found.");
  const availability = parseAvailability(existing);
  if (availability.editVersion !== mutation.input.expectedEditVersion) {
    throw new Error("Model Availability changed; reload and retry.");
  }
  if (availability.enabled === mutation.input.enabled) {
    throw new Error(
      availability.enabled
        ? "Model Availability is already enabled."
        : "Model Availability is already disabled.",
    );
  }

  const updated = await transaction.commerceModelAvailability.updateMany({
    where: {
      id: mutation.input.id,
      editVersion: mutation.input.expectedEditVersion,
    },
    data: {
      enabled: mutation.input.enabled,
      editVersion: { increment: 1 },
      updatedByAdminId: actorAdminId,
    },
  });
  if (updated.count !== 1) {
    throw new Error("Model Availability changed; reload and retry.");
  }

  await transaction.commerceAuditEvent.create({
    data: {
      action: mutation.input.enabled
        ? "ENABLE_MODEL_AVAILABILITY"
        : "DISABLE_MODEL_AVAILABILITY",
      actorAdminId,
      modelAvailabilityId: availability.id,
      shopId: availability.shopId,
      reason: mutation.input.reason,
      metadata: { scope: availability.scope },
    },
  });
}
