import { Prisma, type PrismaClient } from "@prisma/client";
import { templateHash } from "../authoring/identifiers";
import { MetaSubmissionError, type MetaLocaleSnapshot, type MetaSubmissionPlan } from "./contracts";
import { makeMetaSubmissionPlan } from "./snapshot";

export type MetaDatabase = Pick<PrismaClient, "whatsAppTemplateDefinition" | "whatsAppTemplateMetaRegistration" | "whatsAppTemplateMetaEvent" | "platformConfiguration" | "$transaction">;
export type MetaTransaction = Prisma.TransactionClient;

/** Rebuild the preview from durable state INSIDE the serializable commit transaction. */
export async function readMetaPlan(db: Pick<MetaTransaction, "whatsAppTemplateDefinition">, id: string, wabaId: string): Promise<MetaSubmissionPlan> {
  const definition = await db.whatsAppTemplateDefinition.findUnique({ where: { id },
    include: { locales: true } });
  if (!definition) throw new MetaSubmissionError("NOT_FOUND", "Template definition was not found.");
  return makeMetaSubmissionPlan({ definition, locales: definition.locales, trustedWabaId: wabaId });
}

function sameSnapshots(actual: {
  localeId: string; wabaId: string; providerTemplateName: string; providerLanguageCode: string;
  category: string; componentsSnapshot: unknown; parameterBindingsSnapshot: unknown; submittedContentHash: string;
}, planned: MetaLocaleSnapshot, plan: MetaSubmissionPlan): boolean {
  return actual.localeId === planned.localeId && actual.wabaId === plan.wabaId &&
    actual.providerTemplateName === plan.providerTemplateName &&
    actual.providerLanguageCode === planned.providerLanguageCode && actual.category === plan.category &&
    actual.submittedContentHash === planned.contentHash &&
    templateHash(actual.componentsSnapshot) === templateHash(planned.components) &&
    templateHash(actual.parameterBindingsSnapshot) === templateHash(planned.bindings);
}

/** Enforce one local-version/WABA and provider name/language identity; no partial backfill. */
export async function examineExistingRegistrations(db: Pick<MetaTransaction, "whatsAppTemplateMetaRegistration">, plan: MetaSubmissionPlan): Promise<"empty" | "identical"> {
  const existing = await db.whatsAppTemplateMetaRegistration.findMany({
    where: { OR: [
      { localeId: { in: plan.locales.map((locale) => locale.localeId) } },
      { wabaId: plan.wabaId, providerTemplateName: plan.providerTemplateName },
    ] },
  });
  if (!existing.length) return "empty";
  if (existing.length !== plan.locales.length ||
      !plan.locales.every((locale) => existing.some((row) => sameSnapshots(row, locale, plan)))) {
    throw new MetaSubmissionError("IDENTITY_COLLISION", "A different or partial Meta registration exists. Reconcile it; do not create another version.");
  }
  return "identical";
}

export async function insertRegistrations(db: Pick<MetaTransaction, "whatsAppTemplateMetaRegistration">, plan: MetaSubmissionPlan): Promise<void> {
  const result = await db.whatsAppTemplateMetaRegistration.createMany({
    data: plan.locales.map((locale) => ({
      localeId: locale.localeId, wabaId: plan.wabaId,
      providerTemplateName: plan.providerTemplateName, providerLanguageCode: locale.providerLanguageCode,
      category: plan.category, componentsSnapshot: locale.components as unknown as Prisma.InputJsonValue,
      parameterBindingsSnapshot: locale.bindings as unknown as Prisma.InputJsonValue,
      submittedContentHash: locale.contentHash, submissionState: "READY_TO_SUBMIT",
    })),
  });
  if (result.count !== plan.locales.length) throw new MetaSubmissionError("PARTIAL_INSERT", "All languages must be registered atomically.");
}
