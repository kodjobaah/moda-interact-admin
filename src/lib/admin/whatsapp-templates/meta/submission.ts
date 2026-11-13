import { lockCommonActivation, assertCommonSourceGate } from "../common-activation/gates";
import { Prisma } from "@prisma/client";
import type { PlatformAdminPrincipal } from "../../../auth/platform-admin";
import { requireTemplateSuperAdmin } from "../authoring/service";
import { reviewConfirmedEnglish } from "./english-review";
import { recordMetaControlAudit } from "./audit";
import { DEFINITION_ID, DIGEST, MetaSubmissionError } from "./contracts";
import { examineExistingRegistrations, insertRegistrations, readMetaPlan, type MetaDatabase } from "./repository";

export type ConfirmMetaInput = { definitionId: string; expectedDigest: string; confirmation: "SUBMIT_TO_META" };
export type ConfirmMetaResult = { replay: boolean; registered: number };

function assertInput(input: ConfirmMetaInput): void {
  if (!input || typeof input !== "object" || Object.keys(input).sort().join("|") !== "confirmation|definitionId|expectedDigest" ||
      !DEFINITION_ID.test(input.definitionId) || !DIGEST.test(input.expectedDigest) ||
      input.confirmation !== "SUBMIT_TO_META") {
    throw new MetaSubmissionError("INVALID_INPUT", "Explicit confirmation of a current submission preview is required.");
  }
}
const dbCode = (cause: unknown): string | undefined => {
  if (!cause || typeof cause !== "object" || !("code" in cause)) return undefined;
  // Prisma exposes serialization conflicts from explicit row locks as P2010/40001.
  if (cause.code === "P2010" && "meta" in cause && cause.meta && typeof cause.meta === "object" &&
      "code" in cause.meta && cause.meta.code === "40001") return "P2034";
  return String(cause.code);
};

/** No Graph API, Redis or network access. Transactions only record durable intent. */
export async function confirmMetaSubmission(input: ConfirmMetaInput, deps: {
  principal: PlatformAdminPrincipal; db: MetaDatabase; trustedWabaId: string;
  ensureActor?: (tx: Prisma.TransactionClient) => Promise<void>;
}): Promise<ConfirmMetaResult> {
  requireTemplateSuperAdmin(deps.principal);
  assertInput(input);
  const attempt = async () => deps.db.$transaction(async (tx) => {
    await lockCommonActivation(tx);
    await tx.$queryRaw`SELECT "id" FROM "whatsapp"."WhatsAppTemplateDefinition" WHERE "id"=${input.definitionId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "whatsapp"."WhatsAppTemplateLocale" WHERE "definitionId"=${input.definitionId} AND "languageTag"='en' FOR UPDATE`;
    await assertCommonSourceGate(tx, input.definitionId, "submission");
    const plan = await readMetaPlan(tx, input.definitionId, deps.trustedWabaId);
    if (plan.digest !== input.expectedDigest) throw new MetaSubmissionError("STALE_PREVIEW", "The submitted content or sender changed. Refresh and review again.");
    const existing = await examineExistingRegistrations(tx, plan);
    await deps.ensureActor?.(tx);
    await reviewConfirmedEnglish(tx, plan, deps.principal.id);
    if (existing === "identical") return { replay: true, registered: plan.locales.length };
    await insertRegistrations(tx, plan);
    await recordMetaControlAudit(tx, { actorAdminId: deps.principal.id, definitionId: plan.definitionId,
      operation: "submission", operationId: `meta-submit:${plan.digest}`, languageCount: plan.locales.length });
    return { replay: false, registered: plan.locales.length };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  for (let retries = 0; retries < 3; retries++) {
    try { return await attempt(); }
    catch (cause) {
      if (cause instanceof MetaSubmissionError) throw cause;
      if (!["P2002", "P2034"].includes(dbCode(cause) ?? "")) throw cause;
      // Re-enter the same locked confirmation transaction. An out-of-transaction
      // identity match cannot prove that the English review committed.
      if (retries === 2) throw new MetaSubmissionError("IDENTITY_COLLISION", "The provider registration identity changed concurrently. Refresh before retrying.");
    }
  }
  throw new MetaSubmissionError("CONFLICT", "Could not confirm this registration.");
}
