import assert from "node:assert/strict";
import test from "node:test";
import {
  CommerceEnvironment,
  MerchantPricingPlanPublicationStatus,
  MerchantPricingTranslationEntityKind,
  MerchantPricingTranslationField,
  MerchantPricingTranslationItemStatus,
  MerchantPricingTranslationRunStatus,
} from "@prisma/client";
import { MERCHANT_PRICING_LOCALES } from "../../src/lib/admin/merchant-pricing-locales.ts";
import {
  canonicalMerchantPricingTranslationSource,
  merchantPricingTranslationSourceHash,
} from "../../src/lib/admin/merchant/merchant-pricing-automatic-translations.ts";
import {
  MERCHANT_PRICING_TRANSLATION_ERRORS,
  markMerchantPricingTranslationRunApplied,
  reconstructReadyMerchantPricingTranslationPackage,
  requestMerchantPricingTranslationInTransaction,
  validateMerchantPricingTranslationRunForDraft,
} from "../../src/lib/admin/merchant/merchant-pricing-translation-runs.ts";

process.env.DEPLOYMENT_ENVIRONMENT_NAME = "test";

function translationSource() {
  return canonicalMerchantPricingTranslationSource({
    shopifyPlanHandle: "starter",
    englishDescription: "English description",
    highlights: [],
  });
}

function fakeTransaction(options: {
  reusable?: boolean;
  model?: boolean;
} = {}) {
  const calls: Array<{ method: string; args: unknown }> = [];
  let runData: Record<string, unknown> | null = null;
  let itemData: Array<Record<string, unknown>> = [];
  const model = options.model === false
    ? null
    : {
        id: "model-1",
        provider: "openai",
        providerModelId: "gpt-test",
        displayName: "Automatic model",
        editVersion: 7,
        credential: { id: "credential-1" },
      };
  const reusable = options.reusable
    ? {
        id: "run-reused",
        status: MerchantPricingTranslationRunStatus.PROCESSING,
        failureCode: null,
        sourceSnapshot: translationSource(),
        translationModel: { displayName: "Automatic model" },
        items: MERCHANT_PRICING_LOCALES.map((locale) => ({
          targetLanguageTag: locale,
          status:
            locale === "en"
              ? MerchantPricingTranslationItemStatus.AVAILABLE
              : MerchantPricingTranslationItemStatus.PENDING,
        })),
      }
    : null;
  const transaction = {
    commerceTranslationModelConfiguration: {
      findFirst: async (args: unknown) => {
        calls.push({ method: "model.findFirst", args });
        return model;
      },
    },
    merchantPricingPlan: {
      findUnique: async (args: unknown) => {
        calls.push({ method: "plan.findUnique", args });
        return null;
      },
    },
    merchantPricingTranslationRun: {
      findFirst: async (args: unknown) => {
        calls.push({ method: "run.findFirst", args });
        return reusable;
      },
      updateMany: async (args: unknown) => {
        calls.push({ method: "run.updateMany", args });
        return { count: 0 };
      },
      create: async (args: { data: Record<string, unknown> }) => {
        calls.push({ method: "run.create", args });
        runData = args.data;
        return { id: "run-created" };
      },
      findUniqueOrThrow: async () => ({
        id: "run-created",
        status: MerchantPricingTranslationRunStatus.PENDING,
        failureCode: null,
        sourceSnapshot: runData!.sourceSnapshot,
        translationModel: { displayName: "Automatic model" },
        items: itemData.map((item) => ({
          targetLanguageTag: item.targetLanguageTag,
          status: item.status,
        })),
      }),
    },
    merchantPricingTranslationItem: {
      createMany: async (args: { data: Array<Record<string, unknown>> }) => {
        calls.push({ method: "item.createMany", args });
        itemData = args.data;
        return { count: itemData.length };
      },
    },
  };
  return { transaction: transaction as never, calls, getItems: () => itemData };
}

test("request transaction resolves only the enabled automatic default and stages a new plan", async () => {
  const fake = fakeTransaction();
  const source = translationSource();
  const result = await requestMerchantPricingTranslationInTransaction(
    fake.transaction,
    {
      merchantPricingPlanId: null,
      source,
      sourceHash: merchantPricingTranslationSourceHash(source),
      environment: CommerceEnvironment.TEST,
      principalId: "admin-1",
      now: new Date("2026-10-10T10:00:00.000Z"),
    },
  );
  assert.equal(result.reused, false);
  assert.equal(result.runId, "run-created");
  assert.equal(fake.getItems().length, MERCHANT_PRICING_LOCALES.length);
  const modelCall = fake.calls.find(({ method }) => method === "model.findFirst");
  assert.deepEqual(
    (modelCall?.args as { where: Record<string, unknown> }).where,
    {
      environment: CommerceEnvironment.TEST,
      provider: "openai",
      enabled: true,
      automaticDefault: true,
    },
  );
  const create = fake.calls.find(({ method }) => method === "run.create")!;
  assert.equal(
    (create.args as { data: Record<string, unknown> }).data
      .translationModelConfigurationId,
    "model-1",
  );
});

test("identical active work is reused without creating another run or item set", async () => {
  const fake = fakeTransaction({ reusable: true });
  const source = translationSource();
  const result = await requestMerchantPricingTranslationInTransaction(
    fake.transaction,
    {
      merchantPricingPlanId: null,
      source,
      sourceHash: merchantPricingTranslationSourceHash(source),
      environment: CommerceEnvironment.TEST,
      principalId: "admin-1",
    },
  );
  assert.equal(result.reused, true);
  assert.equal(result.runId, "run-reused");
  assert.equal(fake.calls.some(({ method }) => method === "run.create"), false);
  assert.equal(fake.calls.some(({ method }) => method === "item.createMany"), false);
});

test("missing automatic-default configuration fails before a run is created", async () => {
  const fake = fakeTransaction({ model: false });
  const source = translationSource();
  await assert.rejects(
    requestMerchantPricingTranslationInTransaction(fake.transaction, {
      merchantPricingPlanId: null,
      source,
      sourceHash: merchantPricingTranslationSourceHash(source),
      environment: CommerceEnvironment.TEST,
      principalId: "admin-1",
    }),
    new RegExp(MERCHANT_PRICING_TRANSLATION_ERRORS.automaticNotConfigured),
  );
  assert.equal(fake.calls.some(({ method }) => method === "run.create"), false);
});

test("ready package reconstruction verifies exact run source and all locale items", async () => {
  const source = translationSource();
  const items = MERCHANT_PRICING_LOCALES.map((locale) => ({
    sourceEntityKind: MerchantPricingTranslationEntityKind.PLAN,
    sourceContentKey: null,
    sourceField: MerchantPricingTranslationField.DESCRIPTION,
    sourceText: "English description",
    targetLanguageTag: locale,
    translatedText:
      locale === "en" ? "English description" : `translated-${locale}`,
    status: MerchantPricingTranslationItemStatus.AVAILABLE,
  }));
  const db = {
    merchantPricingTranslationRun: {
      findFirst: async () => ({
        id: "run-ready",
        shopifyPlanHandle: "starter",
        sourceHash: merchantPricingTranslationSourceHash(source),
        sourceSnapshot: source,
        status: MerchantPricingTranslationRunStatus.READY_TO_APPLY,
        items,
      }),
    },
  } as never;
  const result = await reconstructReadyMerchantPricingTranslationPackage(db, {
    runId: "run-ready",
    expected: {
      planHandle: "starter",
      planName: "Starter",
      englishDescription: "English description",
      highlights: [],
    },
  });
  assert.equal(result.translations.en.description, "English description");
  assert.equal(result.translations.fr.description, "translated-fr");
});

test("ready package reconstruction rejects stale source identity", async () => {
  const source = translationSource();
  const db = {
    merchantPricingTranslationRun: {
      findFirst: async () => ({
        id: "run-ready",
        shopifyPlanHandle: "starter",
        sourceHash: merchantPricingTranslationSourceHash(source),
        sourceSnapshot: source,
        status: MerchantPricingTranslationRunStatus.READY_TO_APPLY,
        items: [],
      }),
    },
  } as never;
  await assert.rejects(
    reconstructReadyMerchantPricingTranslationPackage(db, {
      runId: "run-ready",
      expected: {
        planHandle: "starter",
        planName: "Starter",
        englishDescription: "Changed description",
        highlights: [],
      },
    }),
    new RegExp(MERCHANT_PRICING_TRANSLATION_ERRORS.runSourceMismatch),
  );
});


test("ready translation run application is compare-and-set and records plan provenance", async () => {
  const calls: unknown[] = [];
  const db = {
    merchantPricingTranslationRun: {
      updateMany: async (args: unknown) => {
        calls.push(args);
        return { count: 1 };
      },
    },
  } as never;
  const now = new Date("2026-10-10T12:00:00.000Z");
  await markMerchantPricingTranslationRunApplied(db, {
    runId: "run-ready",
    merchantPricingPlanId: "plan-1",
    now,
  });
  const call = calls[0] as {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  };
  assert.equal(call.where.id, "run-ready");
  assert.equal(call.where.status, MerchantPricingTranslationRunStatus.READY_TO_APPLY);
  assert.equal(call.data.status, MerchantPricingTranslationRunStatus.APPLIED);
  assert.equal(call.data.appliedMerchantPricingPlanId, "plan-1");
  assert.equal(call.data.appliedAt, now);
  assert.equal(call.data.completedAt, now);
});

test("already consumed translation run fails closed", async () => {
  const db = {
    merchantPricingTranslationRun: {
      updateMany: async () => ({ count: 0 }),
    },
  } as never;
  await assert.rejects(
    markMerchantPricingTranslationRunApplied(db, {
      runId: "run-ready",
      merchantPricingPlanId: "plan-1",
    }),
    new RegExp(MERCHANT_PRICING_TRANSLATION_ERRORS.runAlreadyApplied),
  );
});

test("draft run validation accepts in-progress and failed matching work but rejects stale work", async () => {
  const source = translationSource();
  const sourceHash = merchantPricingTranslationSourceHash(source);
  const expected = {
    planHandle: "starter",
    planName: "Starter",
    englishDescription: "English description",
    highlights: [],
  };
  const dbFor = (status: MerchantPricingTranslationRunStatus) => ({
    merchantPricingTranslationRun: {
      findFirst: async () => ({
        id: "run-draft",
        shopifyPlanHandle: "starter",
        sourceHash,
        status,
      }),
    },
  }) as never;

  const processing = await validateMerchantPricingTranslationRunForDraft(
    dbFor(MerchantPricingTranslationRunStatus.PROCESSING),
    { runId: "run-draft", expected },
  );
  assert.equal(
    processing.publicationStatus,
    MerchantPricingPlanPublicationStatus.TRANSLATING,
  );

  const failed = await validateMerchantPricingTranslationRunForDraft(
    dbFor(MerchantPricingTranslationRunStatus.FAILED),
    { runId: "run-draft", expected },
  );
  assert.equal(
    failed.publicationStatus,
    MerchantPricingPlanPublicationStatus.TRANSLATION_FAILED,
  );

  await assert.rejects(
    validateMerchantPricingTranslationRunForDraft(
      dbFor(MerchantPricingTranslationRunStatus.STALE),
      { runId: "run-draft", expected },
    ),
    new RegExp(MERCHANT_PRICING_TRANSLATION_ERRORS.runNotPersistable),
  );
});
