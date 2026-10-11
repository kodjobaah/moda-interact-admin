import { createLogger } from "@modainteract/moda-interact-shared/logging";
import {
  MerchantPricingPlanPublicationStatus,
  MerchantPricingTranslationEntityKind,
  MerchantPricingTranslationField,
  MerchantPricingTranslationItemStatus,
  MerchantPricingTranslationRunStatus,
  type CommerceEnvironment,
  type Prisma,
} from "@prisma/client";
import type { PlatformAdminPrincipal } from "../../auth/platform-admin.ts";
import { ensureDevelopmentPlatformAdmin } from "../../auth/development-platform-admin.ts";
import { resolveDeploymentEnvironmentName } from "../../auth/environment.ts";
import { resolveCommerceEnvironment } from "../openrouter-credential-environment.ts";
import { TRANSLATION_PROVIDER } from "../translation-configuration-validation.ts";
import {
  MERCHANT_PRICING_LOCALES,
  type MerchantPricingLocale,
} from "../merchant-pricing-locales.ts";
import {
  canonicalMerchantPricingTranslationSource,
  buildMerchantPricingTranslationItemSeeds,
  merchantPricingTranslationExpectedItemsPerLocale,
  merchantPricingTranslationSourceHash,
  parseMerchantPricingTranslationSourceSnapshot,
  type MerchantPricingAutomaticTranslationSourceInput,
  type MerchantPricingExistingTranslationState,
  type MerchantPricingTranslationSourceSnapshot,
} from "./merchant-pricing-automatic-translations.ts";
import {
  parseCompletedMerchantPricingTranslationPackage,
  type MerchantPricingTranslationExpected,
  type MerchantPricingTranslationPackage,
} from "./pricing-translations.ts";

const logger = createLogger({
  serviceNamespace: "moda-interact",
  serviceName: "moda-interact-admin",
  environment: resolveDeploymentEnvironmentName(),
});

const ACTIVE_RUN_STATUSES = [
  MerchantPricingTranslationRunStatus.PENDING,
  MerchantPricingTranslationRunStatus.PROCESSING,
  MerchantPricingTranslationRunStatus.READY_TO_APPLY,
] as const;

const DRAFT_PERSISTABLE_RUN_STATUSES:
  readonly MerchantPricingTranslationRunStatus[] = [
    ...ACTIVE_RUN_STATUSES,
    MerchantPricingTranslationRunStatus.FAILED,
  ];

const TRANSACTION_OPTIONS = {
  isolationLevel: "Serializable" as const,
  maxWait: 10_000,
  timeout: 20_000,
};

export const MERCHANT_PRICING_TRANSLATION_ERRORS = {
  superAdminRequired: "SUPER_ADMIN access is required.",
  automaticNotConfigured:
    "Automatic translation is not configured. Choose an automatic-default translation model in System Controls / Translations.",
  planNotFound: "MerchantPricing plan was not found.",
  planHandleMismatch: "MerchantPricing plan handle does not match the current draft.",
  existingPlanIdRequired:
    "An existing MerchantPricing plan must be edited using its plan id.",
  runNotFound: "Merchant Pricing translation run was not found.",
  runNotReady: "Merchant Pricing translations are not ready to apply.",
  runSourceMismatch:
    "Merchant Pricing translation run does not match the current plan content.",
  runAlreadyApplied:
    "Merchant Pricing translation run was already applied or changed. Reload the plan and try again.",
  runNotPersistable:
    "Merchant Pricing translation run cannot be saved with the current draft. Retry translations.",
  packageInvalid:
    "Merchant Pricing translation results are incomplete or invalid.",
  requestTimedOut:
    "The automatic translation request timed out while writing to PostgreSQL. Retry the request.",
} as const;

type TranslationDb = Prisma.TransactionClient;
type ReadDb = Pick<
  Prisma.TransactionClient,
  "merchantPricingTranslationRun" | "merchantPricingPlan"
>;

export type RequestMerchantPricingTranslationInput =
  MerchantPricingAutomaticTranslationSourceInput & {
    merchantPricingPlanId?: unknown;
  };

export type MerchantPricingTranslationRunStatusView = {
  runId: string;
  status: MerchantPricingTranslationRunStatus;
  modelDisplayName: string;
  completeLocaleCount: number;
  localeCount: number;
  pendingItemCount: number;
  failedItemCount: number;
  failureCode: string | null;
};

export type RequestMerchantPricingTranslationResult =
  MerchantPricingTranslationRunStatusView & {
    sourceHash: string;
    reused: boolean;
  };

function databaseCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  return typeof error.code === "string" ? error.code : undefined;
}

function parseOptionalPlanId(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !value.trim() || value.trim().length > 255) {
    throw new Error("MerchantPricing plan id is invalid.");
  }
  return value.trim();
}

async function resolveAutomaticModel(
  transaction: TranslationDb,
  environment: CommerceEnvironment,
) {
  const model = await transaction.commerceTranslationModelConfiguration.findFirst({
    where: {
      environment,
      provider: TRANSLATION_PROVIDER,
      enabled: true,
      automaticDefault: true,
    },
    select: {
      id: true,
      provider: true,
      providerModelId: true,
      displayName: true,
      editVersion: true,
      credential: { select: { id: true } },
    },
  });
  if (!model?.credential) {
    throw new Error(MERCHANT_PRICING_TRANSLATION_ERRORS.automaticNotConfigured);
  }
  return model;
}

function exactEnglish<T extends { locale: string }>(
  rows: T[],
  label: string,
): T {
  const row = rows.find((candidate) => candidate.locale === "en");
  if (!row) {
    throw new Error(`${label} does not contain the required English translation.`);
  }
  return row;
}

async function existingTranslationState(
  transaction: TranslationDb,
  merchantPricingPlanId: string | null,
  shopifyPlanHandle: string,
): Promise<MerchantPricingExistingTranslationState | undefined> {
  if (!merchantPricingPlanId) {
    const existing = await transaction.merchantPricingPlan.findUnique({
      where: { shopifyPlanHandle },
      select: { id: true },
    });
    if (existing) {
      throw new Error(MERCHANT_PRICING_TRANSLATION_ERRORS.existingPlanIdRequired);
    }
    return undefined;
  }

  const existing = await transaction.merchantPricingPlan.findUnique({
    where: { id: merchantPricingPlanId },
    select: {
      shopifyPlanHandle: true,
      publicationStatus: true,
      translations: {
        select: { locale: true, merchantDescription: true },
      },
      highlights: {
        select: {
          contentKey: true,
          translations: {
            select: {
              locale: true,
              merchantTitle: true,
              merchantDescription: true,
            },
          },
        },
      },
    },
  });
  if (!existing) throw new Error(MERCHANT_PRICING_TRANSLATION_ERRORS.planNotFound);
  if (existing.shopifyPlanHandle !== shopifyPlanHandle) {
    throw new Error(MERCHANT_PRICING_TRANSLATION_ERRORS.planHandleMismatch);
  }
  if (
    existing.publicationStatus !== MerchantPricingPlanPublicationStatus.READY
  ) {
    return undefined;
  }

  const englishPlan = exactEnglish(
    existing.translations,
    "Existing Merchant Pricing plan translations",
  );
  return {
    englishDescription: englishPlan.merchantDescription,
    translations: existing.translations,
    highlights: existing.highlights.map((highlight) => {
      const english = exactEnglish(
        highlight.translations,
        `Existing Merchant Pricing highlight ${highlight.contentKey} translations`,
      );
      return {
        contentKey: highlight.contentKey,
        englishTitle: english.merchantTitle,
        englishDescription: english.merchantDescription,
        translations: highlight.translations.map((translation) => ({
          locale: translation.locale,
          title: translation.merchantTitle,
          description: translation.merchantDescription,
        })),
      };
    }),
  };
}

async function relinkPersistedDraftRunIfUnchanged(
  transaction: TranslationDb,
  input: {
    merchantPricingPlanId: string | null;
    sourceHash: string;
    runId: string;
    runStatus: MerchantPricingTranslationRunStatus;
  },
): Promise<void> {
  if (!input.merchantPricingPlanId) return;

  const plan = await transaction.merchantPricingPlan.findUnique({
    where: { id: input.merchantPricingPlanId },
    select: {
      publicationStatus: true,
      shopifyPlanHandle: true,
      translations: {
        select: { locale: true, merchantDescription: true },
      },
      highlights: {
        select: {
          contentKey: true,
          translations: {
            select: {
              locale: true,
              merchantTitle: true,
              merchantDescription: true,
            },
          },
        },
      },
    },
  });
  if (
    !plan ||
    plan.publicationStatus === MerchantPricingPlanPublicationStatus.READY
  ) {
    return;
  }

  const englishPlan = exactEnglish(
    plan.translations,
    "Existing Merchant Pricing plan translations",
  );
  const persistedSource = canonicalMerchantPricingTranslationSource({
    shopifyPlanHandle: plan.shopifyPlanHandle,
    englishDescription: englishPlan.merchantDescription,
    highlights: plan.highlights.map((highlight) => {
      const english = exactEnglish(
        highlight.translations,
        `Existing Merchant Pricing highlight ${highlight.contentKey} translations`,
      );
      return {
        contentKey: highlight.contentKey,
        title: english.merchantTitle,
        description: english.merchantDescription,
      };
    }),
  });
  if (
    merchantPricingTranslationSourceHash(persistedSource) !== input.sourceHash
  ) {
    return;
  }

  await transaction.merchantPricingPlan.update({
    where: { id: input.merchantPricingPlanId },
    data: {
      currentTranslationRunId: input.runId,
      publicationStatus:
        input.runStatus === MerchantPricingTranslationRunStatus.FAILED
          ? MerchantPricingPlanPublicationStatus.TRANSLATION_FAILED
          : MerchantPricingPlanPublicationStatus.TRANSLATING,
      isActive: false,
    },
  });
}

function countsForItems(
  source: MerchantPricingTranslationSourceSnapshot,
  items: Array<{
    targetLanguageTag: string;
    status: MerchantPricingTranslationItemStatus;
  }>,
) {
  const expectedPerLocale = merchantPricingTranslationExpectedItemsPerLocale(source);
  const byLocale = new Map<string, { total: number; available: number }>();
  let pendingItemCount = 0;
  let failedItemCount = 0;
  for (const item of items) {
    const current = byLocale.get(item.targetLanguageTag) ?? {
      total: 0,
      available: 0,
    };
    current.total += 1;
    if (item.status === MerchantPricingTranslationItemStatus.AVAILABLE) {
      current.available += 1;
    } else if (item.status === MerchantPricingTranslationItemStatus.PENDING) {
      pendingItemCount += 1;
    } else if (item.status === MerchantPricingTranslationItemStatus.FAILED) {
      failedItemCount += 1;
    }
    byLocale.set(item.targetLanguageTag, current);
  }
  const completeLocaleCount = MERCHANT_PRICING_LOCALES.filter((locale) => {
    const value = byLocale.get(locale);
    return (
      value?.total === expectedPerLocale && value.available === expectedPerLocale
    );
  }).length;
  return { completeLocaleCount, pendingItemCount, failedItemCount };
}

async function statusViewFromRun(
  run: {
    id: string;
    status: MerchantPricingTranslationRunStatus;
    failureCode: string | null;
    sourceSnapshot: Prisma.JsonValue;
    translationModel: { displayName: string };
    items: Array<{
      targetLanguageTag: string;
      status: MerchantPricingTranslationItemStatus;
    }>;
  },
): Promise<MerchantPricingTranslationRunStatusView> {
  const source = parseMerchantPricingTranslationSourceSnapshot(run.sourceSnapshot);
  const counts = countsForItems(source, run.items);
  return {
    runId: run.id,
    status: run.status,
    modelDisplayName: run.translationModel.displayName,
    completeLocaleCount: counts.completeLocaleCount,
    localeCount: MERCHANT_PRICING_LOCALES.length,
    pendingItemCount: counts.pendingItemCount,
    failedItemCount: counts.failedItemCount,
    failureCode: run.failureCode,
  };
}

const runStatusSelect = {
  id: true,
  status: true,
  failureCode: true,
  sourceSnapshot: true,
  translationModel: { select: { displayName: true } },
  items: {
    select: { targetLanguageTag: true, status: true },
  },
} satisfies Prisma.MerchantPricingTranslationRunSelect;

export async function requestMerchantPricingTranslationInTransaction(
  transaction: TranslationDb,
  input: {
    merchantPricingPlanId: string | null;
    source: MerchantPricingTranslationSourceSnapshot;
    sourceHash: string;
    environment: CommerceEnvironment;
    principalId: string;
    now?: Date;
  },
) {
  const model = await resolveAutomaticModel(transaction, input.environment);
  const existing = await existingTranslationState(
    transaction,
    input.merchantPricingPlanId,
    input.source.shopifyPlanHandle,
  );

  const reusable = await transaction.merchantPricingTranslationRun.findFirst({
    where: {
      shopifyPlanHandle: input.source.shopifyPlanHandle,
      environment: input.environment,
      sourceHash: input.sourceHash,
      status: { in: [...ACTIVE_RUN_STATUSES] },
    },
    select: runStatusSelect,
  });
  if (reusable) {
    await relinkPersistedDraftRunIfUnchanged(transaction, {
      merchantPricingPlanId: input.merchantPricingPlanId,
      sourceHash: input.sourceHash,
      runId: reusable.id,
      runStatus: reusable.status,
    });
    return {
      ...(await statusViewFromRun(reusable)),
      sourceHash: input.sourceHash,
      reused: true,
      modelConfigurationId: model.id,
    };
  }

  const now = input.now ?? new Date();
  await transaction.merchantPricingTranslationRun.updateMany({
    where: {
      shopifyPlanHandle: input.source.shopifyPlanHandle,
      environment: input.environment,
      sourceHash: { not: input.sourceHash },
      status: { in: [...ACTIVE_RUN_STATUSES] },
    },
    data: {
      status: MerchantPricingTranslationRunStatus.STALE,
      completedAt: now,
      failureCode: "SOURCE_CHANGED",
    },
  });

  const run = await transaction.merchantPricingTranslationRun.create({
    data: {
      shopifyPlanHandle: input.source.shopifyPlanHandle,
      environment: input.environment,
      translationModelConfigurationId: model.id,
      provider: model.provider,
      providerModelId: model.providerModelId,
      modelConfigurationVersion: model.editVersion,
      sourceSchemaVersion: input.source.schemaVersion,
      sourceHash: input.sourceHash,
      sourceSnapshot: input.source as Prisma.InputJsonObject,
      status: MerchantPricingTranslationRunStatus.PENDING,
      requestedByAdminId: input.principalId,
    },
    select: { id: true },
  });
  const seeds = buildMerchantPricingTranslationItemSeeds({
    source: input.source,
    previous: existing,
    now,
  });
  await transaction.merchantPricingTranslationItem.createMany({
    data: seeds.map((seed) => ({
      runId: run.id,
      sourceEntityKind:
        seed.sourceEntityKind === "PLAN"
          ? MerchantPricingTranslationEntityKind.PLAN
          : MerchantPricingTranslationEntityKind.HIGHLIGHT,
      sourceContentKey: seed.sourceContentKey,
      sourceField:
        seed.sourceField === "TITLE"
          ? MerchantPricingTranslationField.TITLE
          : MerchantPricingTranslationField.DESCRIPTION,
      sourceLanguageTag: seed.sourceLanguageTag,
      targetLanguageTag: seed.targetLanguageTag,
      sourceText: seed.sourceText,
      translatedText: seed.translatedText,
      status:
        seed.status === "AVAILABLE"
          ? MerchantPricingTranslationItemStatus.AVAILABLE
          : MerchantPricingTranslationItemStatus.PENDING,
      completedAt: seed.completedAt,
    })),
  });

  await relinkPersistedDraftRunIfUnchanged(transaction, {
    merchantPricingPlanId: input.merchantPricingPlanId,
    sourceHash: input.sourceHash,
    runId: run.id,
    runStatus: MerchantPricingTranslationRunStatus.PENDING,
  });

  const created =
    await transaction.merchantPricingTranslationRun.findUniqueOrThrow({
      where: { id: run.id },
      select: runStatusSelect,
    });
  return {
    ...(await statusViewFromRun(created)),
    sourceHash: input.sourceHash,
    reused: false,
    modelConfigurationId: model.id,
  };
}

export async function requestMerchantPricingTranslation(
  rawInput: RequestMerchantPricingTranslationInput,
  principal: PlatformAdminPrincipal,
): Promise<RequestMerchantPricingTranslationResult> {
  if (principal.role !== "SUPER_ADMIN") {
    throw new Error(MERCHANT_PRICING_TRANSLATION_ERRORS.superAdminRequired);
  }
  const merchantPricingPlanId = parseOptionalPlanId(rawInput.merchantPricingPlanId);
  const source = canonicalMerchantPricingTranslationSource(rawInput);
  const sourceHash = merchantPricingTranslationSourceHash(source);
  const environment = resolveCommerceEnvironment() as CommerceEnvironment;
  const { prisma } = await import("@/lib/prisma");
  const startedAt = Date.now();

  try {
    await ensureDevelopmentPlatformAdmin(prisma, principal);
    const result = await prisma.$transaction(
      (transaction) =>
        requestMerchantPricingTranslationInTransaction(transaction, {
          merchantPricingPlanId,
          source,
          sourceHash,
          environment,
          principalId: principal.id,
        }),
      TRANSACTION_OPTIONS,
    );

    logger.info("admin.merchant_pricing.translation_requested", {
      translationRunId: result.runId,
      shopifyPlanHandle: source.shopifyPlanHandle,
      sourceHash,
      translationModelConfigurationId: result.modelConfigurationId,
      reused: result.reused,
      completeLocaleCount: result.completeLocaleCount,
      localeCount: result.localeCount,
      durationMs: Date.now() - startedAt,
    });
    return {
      runId: result.runId,
      status: result.status,
      modelDisplayName: result.modelDisplayName,
      completeLocaleCount: result.completeLocaleCount,
      localeCount: result.localeCount,
      pendingItemCount: result.pendingItemCount,
      failedItemCount: result.failedItemCount,
      failureCode: result.failureCode,
      sourceHash: result.sourceHash,
      reused: result.reused,
    };
  } catch (cause) {
    if (databaseCode(cause) === "P2002") {
      const reusable = await prisma.merchantPricingTranslationRun.findFirst({
        where: {
          shopifyPlanHandle: source.shopifyPlanHandle,
          environment,
          sourceHash,
          status: { in: [...ACTIVE_RUN_STATUSES] },
        },
        select: runStatusSelect,
      });
      if (reusable) {
        logger.info("admin.merchant_pricing.translation_requested", {
          translationRunId: reusable.id,
          shopifyPlanHandle: source.shopifyPlanHandle,
          sourceHash,
          reused: true,
          concurrentRequest: true,
          durationMs: Date.now() - startedAt,
        });
        return {
          ...(await statusViewFromRun(reusable)),
          sourceHash,
          reused: true,
        };
      }
    }
    logger.error("admin.merchant_pricing.translation_request_failed", {
      shopifyPlanHandle: source.shopifyPlanHandle,
      sourceHash,
      databaseCode: databaseCode(cause) ?? null,
      durationMs: Date.now() - startedAt,
    });
    if (databaseCode(cause) === "P2034") {
      throw new Error("Merchant Pricing translation state changed; retry the request.");
    }
    if (databaseCode(cause) === "P2028") {
      throw new Error(MERCHANT_PRICING_TRANSLATION_ERRORS.requestTimedOut);
    }
    throw cause;
  }
}

export async function getMerchantPricingTranslationRunStatus(
  runId: string,
  db?: ReadDb,
): Promise<MerchantPricingTranslationRunStatusView> {
  const id = runId.trim();
  if (!id || id.length > 255) {
    throw new Error(MERCHANT_PRICING_TRANSLATION_ERRORS.runNotFound);
  }
  const environment = resolveCommerceEnvironment() as CommerceEnvironment;
  const database = db ?? (await import("@/lib/prisma")).prisma;
  const run = await database.merchantPricingTranslationRun.findFirst({
    where: { id, environment },
    select: runStatusSelect,
  });
  if (!run) throw new Error(MERCHANT_PRICING_TRANSLATION_ERRORS.runNotFound);
  return statusViewFromRun(run);
}

type DraftRunDb = Pick<
  Prisma.TransactionClient,
  "merchantPricingTranslationRun"
>;

export async function validateMerchantPricingTranslationRunForDraft(
  db: DraftRunDb,
  input: {
    runId: string;
    expected: MerchantPricingTranslationExpected;
  },
): Promise<{
  runId: string;
  status: MerchantPricingTranslationRunStatus;
  publicationStatus: MerchantPricingPlanPublicationStatus;
}> {
  const source = canonicalMerchantPricingTranslationSource({
    shopifyPlanHandle: input.expected.planHandle,
    englishDescription: input.expected.englishDescription,
    highlights: input.expected.highlights ?? [],
  });
  const sourceHash = merchantPricingTranslationSourceHash(source);
  const environment = resolveCommerceEnvironment() as CommerceEnvironment;
  const run = await db.merchantPricingTranslationRun.findFirst({
    where: { id: input.runId, environment },
    select: {
      id: true,
      shopifyPlanHandle: true,
      sourceHash: true,
      status: true,
    },
  });
  if (!run) throw new Error(MERCHANT_PRICING_TRANSLATION_ERRORS.runNotFound);
  if (
    run.shopifyPlanHandle !== source.shopifyPlanHandle ||
    run.sourceHash !== sourceHash
  ) {
    throw new Error(MERCHANT_PRICING_TRANSLATION_ERRORS.runSourceMismatch);
  }
  if (!DRAFT_PERSISTABLE_RUN_STATUSES.includes(run.status)) {
    throw new Error(
      run.status === MerchantPricingTranslationRunStatus.APPLIED
        ? MERCHANT_PRICING_TRANSLATION_ERRORS.runAlreadyApplied
        : MERCHANT_PRICING_TRANSLATION_ERRORS.runNotPersistable,
    );
  }
  return {
    runId: run.id,
    status: run.status,
    publicationStatus:
      run.status === MerchantPricingTranslationRunStatus.FAILED
        ? MerchantPricingPlanPublicationStatus.TRANSLATION_FAILED
        : MerchantPricingPlanPublicationStatus.TRANSLATING,
  };
}

export async function ensureMerchantPricingTranslationRunForDraftSave(
  transaction: TranslationDb,
  input: {
    merchantPricingPlanId: string | null;
    runId: string | null;
    expected: MerchantPricingTranslationExpected;
    principalId: string;
  },
): Promise<{
  runId: string;
  status: MerchantPricingTranslationRunStatus;
  publicationStatus: MerchantPricingPlanPublicationStatus;
}> {
  if (input.runId) {
    return validateMerchantPricingTranslationRunForDraft(transaction, {
      runId: input.runId,
      expected: input.expected,
    });
  }

  const source = canonicalMerchantPricingTranslationSource({
    shopifyPlanHandle: input.expected.planHandle,
    englishDescription: input.expected.englishDescription,
    highlights: input.expected.highlights ?? [],
  });
  const requested = await requestMerchantPricingTranslationInTransaction(
    transaction,
    {
      merchantPricingPlanId: input.merchantPricingPlanId,
      source,
      sourceHash: merchantPricingTranslationSourceHash(source),
      environment: resolveCommerceEnvironment() as CommerceEnvironment,
      principalId: input.principalId,
    },
  );

  return {
    runId: requested.runId,
    status: requested.status,
    publicationStatus:
      requested.status === MerchantPricingTranslationRunStatus.FAILED
        ? MerchantPricingPlanPublicationStatus.TRANSLATION_FAILED
        : MerchantPricingPlanPublicationStatus.TRANSLATING,
  };
}

type ReadyPackageDb = Pick<Prisma.TransactionClient, "merchantPricingTranslationRun">;

function itemIdentity(item: {
  sourceEntityKind: MerchantPricingTranslationEntityKind;
  sourceContentKey: string | null;
  sourceField: MerchantPricingTranslationField;
  targetLanguageTag: string;
}) {
  return [
    item.sourceEntityKind,
    item.sourceContentKey ?? "-",
    item.sourceField,
    item.targetLanguageTag,
  ].join(":");
}

export async function reconstructReadyMerchantPricingTranslationPackage(
  db: ReadyPackageDb,
  input: {
    runId: string;
    expected: MerchantPricingTranslationExpected;
  },
): Promise<MerchantPricingTranslationPackage> {
  const source = canonicalMerchantPricingTranslationSource({
    shopifyPlanHandle: input.expected.planHandle,
    englishDescription: input.expected.englishDescription,
    highlights: input.expected.highlights ?? [],
  });
  const sourceHash = merchantPricingTranslationSourceHash(source);
  const environment = resolveCommerceEnvironment() as CommerceEnvironment;
  const run = await db.merchantPricingTranslationRun.findFirst({
    where: { id: input.runId, environment },
    select: {
      id: true,
      shopifyPlanHandle: true,
      sourceHash: true,
      sourceSnapshot: true,
      status: true,
      items: {
        select: {
          sourceEntityKind: true,
          sourceContentKey: true,
          sourceField: true,
          sourceText: true,
          targetLanguageTag: true,
          translatedText: true,
          status: true,
        },
      },
    },
  });
  if (!run) throw new Error(MERCHANT_PRICING_TRANSLATION_ERRORS.runNotFound);
  if (run.status !== MerchantPricingTranslationRunStatus.READY_TO_APPLY) {
    throw new Error(MERCHANT_PRICING_TRANSLATION_ERRORS.runNotReady);
  }
  const storedSource = parseMerchantPricingTranslationSourceSnapshot(
    run.sourceSnapshot,
  );
  if (
    run.shopifyPlanHandle !== source.shopifyPlanHandle ||
    run.sourceHash !== sourceHash ||
    merchantPricingTranslationSourceHash(storedSource) !== sourceHash
  ) {
    throw new Error(MERCHANT_PRICING_TRANSLATION_ERRORS.runSourceMismatch);
  }

  const translations = Object.fromEntries(
    MERCHANT_PRICING_LOCALES.map((locale) => [
      locale,
      {
        description: "",
        highlights: Object.fromEntries(
          source.highlights.map((highlight) => [
            highlight.contentKey,
            { title: "", description: "" },
          ]),
        ),
      },
    ]),
  ) as MerchantPricingTranslationPackage["translations"];

  const expectedIdentities = new Map<string, string>();
  for (const locale of MERCHANT_PRICING_LOCALES) {
    expectedIdentities.set(
      [
        MerchantPricingTranslationEntityKind.PLAN,
        "-",
        MerchantPricingTranslationField.DESCRIPTION,
        locale,
      ].join(":"),
      source.englishDescription,
    );
    for (const highlight of source.highlights) {
      expectedIdentities.set(
        [
          MerchantPricingTranslationEntityKind.HIGHLIGHT,
          highlight.contentKey,
          MerchantPricingTranslationField.TITLE,
          locale,
        ].join(":"),
        highlight.title,
      );
      expectedIdentities.set(
        [
          MerchantPricingTranslationEntityKind.HIGHLIGHT,
          highlight.contentKey,
          MerchantPricingTranslationField.DESCRIPTION,
          locale,
        ].join(":"),
        highlight.description,
      );
    }
  }

  const seen = new Set<string>();
  for (const item of run.items) {
    const identity = itemIdentity(item);
    const expectedSourceText = expectedIdentities.get(identity);
    if (
      seen.has(identity) ||
      expectedSourceText === undefined ||
      item.sourceText.trim() !== expectedSourceText ||
      item.status !== MerchantPricingTranslationItemStatus.AVAILABLE ||
      typeof item.translatedText !== "string" ||
      !item.translatedText.trim() ||
      !MERCHANT_PRICING_LOCALES.includes(
        item.targetLanguageTag as MerchantPricingLocale,
      )
    ) {
      throw new Error(MERCHANT_PRICING_TRANSLATION_ERRORS.packageInvalid);
    }
    seen.add(identity);
    const locale = item.targetLanguageTag as MerchantPricingLocale;
    const text = item.translatedText;
    if (item.sourceEntityKind === MerchantPricingTranslationEntityKind.PLAN) {
      translations[locale].description = text;
    } else {
      const value = translations[locale].highlights[item.sourceContentKey!];
      if (!value) {
        throw new Error(MERCHANT_PRICING_TRANSLATION_ERRORS.packageInvalid);
      }
      if (item.sourceField === MerchantPricingTranslationField.TITLE) {
        value.title = text;
      } else {
        value.description = text;
      }
    }
  }
  if (seen.size !== expectedIdentities.size) {
    throw new Error(MERCHANT_PRICING_TRANSLATION_ERRORS.packageInvalid);
  }

  const candidate: MerchantPricingTranslationPackage = {
    _meta: {
      schemaVersion: 2,
      planHandle: source.shopifyPlanHandle,
      planName: input.expected.planName.trim(),
      sourceLocale: "en",
    },
    translations,
  };
  const parsed = parseCompletedMerchantPricingTranslationPackage(
    JSON.stringify(candidate),
    input.expected,
  );
  if (!parsed.valid || !parsed.package) {
    throw new Error(MERCHANT_PRICING_TRANSLATION_ERRORS.packageInvalid);
  }
  return parsed.package;
}

export async function markMerchantPricingTranslationRunApplied(
  transaction: Pick<Prisma.TransactionClient, "merchantPricingTranslationRun">,
  input: {
    runId: string;
    merchantPricingPlanId: string;
    now?: Date;
  },
): Promise<void> {
  const environment = resolveCommerceEnvironment() as CommerceEnvironment;
  const appliedAt = input.now ?? new Date();
  const updated = await transaction.merchantPricingTranslationRun.updateMany({
    where: {
      id: input.runId,
      environment,
      status: MerchantPricingTranslationRunStatus.READY_TO_APPLY,
    },
    data: {
      status: MerchantPricingTranslationRunStatus.APPLIED,
      appliedAt,
      completedAt: appliedAt,
      appliedMerchantPricingPlanId: input.merchantPricingPlanId,
      failureCode: null,
    },
  });
  if (updated.count !== 1) {
    throw new Error(MERCHANT_PRICING_TRANSLATION_ERRORS.runAlreadyApplied);
  }
}
