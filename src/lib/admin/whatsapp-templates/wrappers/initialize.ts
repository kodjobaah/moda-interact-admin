import { Prisma, type PrismaClient } from "@prisma/client";
import { ConversationProductImageBindingSchema } from "@modainteract/moda-interact-shared/commerce/presentation";
import { resolveDeploymentEnvironmentName } from "../../../auth/environment";
import { stableJson } from "../authoring/canonical";
import { makeImmutableAuthoringRecord } from "../authoring/compiler";
import { definitionIdForSubmit, templateHash } from "../authoring/identifiers";
import { insertTemplateRecordInTransaction } from "../authoring/repository";
import type { WrapperTemplateAst } from "../authoring/types";
import { REVIEW_LANGUAGES } from "../compilation/language-codes";
import type { WrapperDefinitionRow } from "./contracts";
import { checkWrapperEligibility } from "./eligibility";
import { activateConversationWrapperInTransaction } from "./service";

export const INITIALIZER_VERSION = "1";
export const INITIALIZER_SUBMISSION_ID = "e14e7967-05bb-4a5c-bacf-0663b42b37d5";
export type InitializationFailure = "INVALID_ARGUMENT" | "ENVIRONMENT_MISMATCH" | "ACTOR_DENIED" |
  "IMMUTABLE_CONFLICT" | "SLOT_OCCUPIED" | "CONCURRENT_STATE_CHANGE";
export class WrapperInitializationError extends Error {
  constructor(readonly code: InitializationFailure) { super(code); this.name = "WrapperInitializationError"; }
}
export type InitializeWrapperInput = {
  environment: "test" | "production";
  actorAdminId: string;
  reason: string;
  mode?: "DRY_RUN" | "APPLY";
};
export type InitializationResult = {
  status: "DRY_RUN" | "CREATED_AND_ACTIVATED" | "UNCHANGED";
  action: "CREATED_AND_ACTIVATED" | "UNCHANGED";
  environment: "test" | "production";
  plannedDefinitionId: string;
  definitionId: string;
  sourceHash: string;
  contentHash: string;
  localeCount: number;
  currentPointer: { definitionId: string; editVersion: number } | null;
};

export function canonicalConversationWrapper(): WrapperTemplateAst {
  return {
    schemaVersion: 1, family: "MODA_CONVERSATION_WRAPPER", sourceLanguageTag: "en", audience: "AI",
    header: [], body: [{ type: "slot", name: "response.body" }], footer: [], conditionals: [],
    productImage: ConversationProductImageBindingSchema.parse({ variable: "response.productImage", placement: "BEFORE_BODY", optional: true }),
  };
}

function validateInput(input: InitializeWrapperInput): void {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).some((key) => !["environment", "actorAdminId", "reason", "mode"].includes(key)) ||
      !["test", "production"].includes(input.environment) ||
      typeof input.actorAdminId !== "string" || !input.actorAdminId.trim() || input.actorAdminId.length > 256 ||
      /[\u0000-\u001f\u007f]/.test(input.actorAdminId) ||
      typeof input.reason !== "string" || input.reason.trim().length < 10 || input.reason.length > 500 ||
      (input.mode !== undefined && !["DRY_RUN", "APPLY"].includes(input.mode))) {
    throw new WrapperInitializationError("INVALID_ARGUMENT");
  }
}

/** Explicit operator approval of structural-only locales; never invokes translation or Meta. */
export async function initializeConversationWrapper(input: InitializeWrapperInput, deps: {
  db: Pick<PrismaClient, "$transaction">;
  resolveEnvironment?: () => string;
}): Promise<InitializationResult> {
  validateInput(input);
  if ((deps.resolveEnvironment ?? resolveDeploymentEnvironmentName)() !== input.environment) {
    throw new WrapperInitializationError("ENVIRONMENT_MISMATCH");
  }
  const ast = canonicalConversationWrapper();
  const record = makeImmutableAuthoringRecord(ast);
  const sourceHash = templateHash(ast);
  const contentHash = templateHash(record.prepared);
  const plannedDefinitionId = definitionIdForSubmit(input.actorAdminId, INITIALIZER_SUBMISSION_ID);
  const canonical = (definition: WrapperDefinitionRow | null): boolean => {
    if (!definition || !checkWrapperEligibility(definition, "AI").eligible) return false;
    return definition.locales.every((locale) => {
      const saved = locale.localeAst as { prepared?: unknown };
      return locale.contentHash === contentHash && stableJson(saved.prepared) === stableJson(record.prepared);
    });
  };
  try {
    return await deps.db.$transaction(async (tx) => {
      const actor = await tx.platformAdmin.findUnique({ where: { id: input.actorAdminId }, select: { id: true, role: true, active: true } });
      if (!actor || !actor.active || actor.role !== "SUPER_ADMIN") throw new WrapperInitializationError("ACTOR_DENIED");
      const own = await tx.whatsAppTemplateDefinition.findUnique({ where: { id: plannedDefinitionId }, include: { locales: true } });
      if (own && (!canonical(own) || own.createdByAdminId !== actor.id || own.sourceHash !== sourceHash ||
          own.providerTemplateName !== null || own.category !== null || own.purpose !== null || own.offerType !== null ||
          own.locales.some((locale) => stableJson(locale.localeAst) !== stableJson(record)))) {
        throw new WrapperInitializationError("IMMUTABLE_CONFLICT");
      }
      const slot = await tx.whatsAppConversationWrapperActiveSlot.findUnique({ where: { audience: "AI" } });
      const currentPointer = slot ? { definitionId: slot.definitionId, editVersion: slot.editVersion } : null;
      let active = own?.id === slot?.definitionId ? own : null;
      if (slot && !active) active = await tx.whatsAppTemplateDefinition.findUnique({ where: { id: slot.definitionId }, include: { locales: true } });
      if (slot && !canonical(active)) throw new WrapperInitializationError("SLOT_OCCUPIED");
      const result: InitializationResult = {
        status: input.mode === "APPLY" ? (slot ? "UNCHANGED" : "CREATED_AND_ACTIVATED") : "DRY_RUN",
        action: slot ? "UNCHANGED" : "CREATED_AND_ACTIVATED", environment: input.environment,
        plannedDefinitionId, definitionId: slot?.definitionId ?? plannedDefinitionId,
        sourceHash, contentHash, localeCount: REVIEW_LANGUAGES.length, currentPointer,
      };
      if (slot || input.mode !== "APPLY") return result;
      const timestamps = await tx.$queryRaw<Array<{ now: Date }>>(Prisma.sql`SELECT transaction_timestamp() AS "now"`);
      const now = timestamps[0].now;
      const auditMetadata: Prisma.InputJsonObject = {
        script: "initialize-conversation-wrapper", version: INITIALIZER_VERSION, environment: input.environment,
        structuralOnlyLocales: [...REVIEW_LANGUAGES], sourceHash, contentHash, previousDefinitionId: null,
        structuralApproval: "Operator-approved language-invariant response slot and optional image binding; no translated prose.",
      };
      if (!own) {
        await insertTemplateRecordInTransaction(tx, {
          id: plannedDefinitionId, actorAdminId: actor.id, sourceHash, contentHash, providerName: null,
          clonedFromDefinitionId: null, draft: ast, record, auditReason: input.reason.trim(), auditMetadata,
        });
        for (const languageTag of REVIEW_LANGUAGES.filter((tag) => tag !== "en")) {
          await tx.whatsAppTemplateLocale.create({ data: {
            definitionId: plannedDefinitionId, languageTag, providerLanguageCode: null,
            localeAst: record as unknown as Prisma.InputJsonValue, contentHash, status: "REVIEWED",
            reviewedAt: now, reviewedByAdminId: actor.id,
          } });
        }
      }
      await activateConversationWrapperInTransaction({ audience: "AI", definitionId: plannedDefinitionId,
        expectedDefinitionId: null, expectedVersion: null, reason: input.reason }, {
        tx, principal: actor, now, auditMetadata,
      });
      return result;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
  } catch (error) {
    if (error instanceof WrapperInitializationError) throw error;
    // No retry or replacement after a stale snapshot, uniqueness race, or failed commit.
    // Never expose database text, credentials or an uncertain transaction outcome.
    throw new WrapperInitializationError("CONCURRENT_STATE_CHANGE");
  }
}
