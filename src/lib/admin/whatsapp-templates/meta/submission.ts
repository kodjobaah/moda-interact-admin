import { Prisma } from "@prisma/client";
import type { PlatformAdminPrincipal } from "../../../auth/platform-admin";
import { requireTemplateSuperAdmin } from "../authoring/service";
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
const dbCode = (cause: unknown): string | undefined => cause && typeof cause === "object" && "code" in cause
  ? String(cause.code) : undefined;

/** No Graph API, Redis or network access. Transactions only record durable intent. */
export async function confirmMetaSubmission(input: ConfirmMetaInput, deps: {
  principal: PlatformAdminPrincipal; db: MetaDatabase; trustedWabaId: string;
  ensureActor?: (tx: Prisma.TransactionClient) => Promise<void>;
}): Promise<ConfirmMetaResult> {
  requireTemplateSuperAdmin(deps.principal);
  assertInput(input);
  const attempt = async () => deps.db.$transaction(async (tx) => {
    const plan = await readMetaPlan(tx, input.definitionId, deps.trustedWabaId);
    if (plan.digest !== input.expectedDigest) throw new MetaSubmissionError("STALE_PREVIEW", "The submitted content or sender changed. Refresh and review again.");
    const existing = await examineExistingRegistrations(tx, plan);
    if (existing === "identical") return { replay: true, registered: plan.locales.length };
    await deps.ensureActor?.(tx);
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
      // Competing confirmations may commit while this transaction retries. A
      // genuine different-identity collision must never be treated as success.
      const plan = await readMetaPlan(deps.db, input.definitionId, deps.trustedWabaId);
      if (plan.digest !== input.expectedDigest) throw new MetaSubmissionError("STALE_PREVIEW", "Refresh the changed template preview.");
      const state = await examineExistingRegistrations(deps.db, plan);
      if (state === "identical") return { replay: true, registered: plan.locales.length };
      if (dbCode(cause) !== "P2034" || retries === 2) {
        throw new MetaSubmissionError("IDENTITY_COLLISION", "The provider registration identity was claimed concurrently. Refresh before retrying.");
      }
    }
  }
  throw new MetaSubmissionError("CONFLICT", "Could not confirm this registration.");
}
