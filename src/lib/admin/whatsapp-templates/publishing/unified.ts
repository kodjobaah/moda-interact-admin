import { Prisma, type PrismaClient } from "@prisma/client";
import type { PlatformAdminPrincipal } from "../../../auth/platform-admin";
import { requireTemplateSuperAdmin } from "../authoring/super-admin";
import {
  lockCommonActivation,
  assertCommonSourceGate,
} from "../common-activation/gates";
import {
  lockCandidate,
  persistVerifiedDefault,
  verifiedPreview,
} from "../recovery-defaults/service";
import {
  confirmPublication,
  createConfirmedOperation,
  operationSnapshot,
  progressForOperation,
} from "./operation";
import { assertFreshPreview, computePreview, publicPreview } from "./preview";
import { configuredSenderWaba } from "./sender";
import {
  isValidDefinitionId,
  isValidKey,
  parseScope,
  reasonText,
  reject,
} from "./validation";
import type {
  PublicationIntent,
  PublicationIntentRequest,
  PublicationConfirmation,
  PublicationScope,
} from "./types";

export function parsePublicationIntent(value: unknown): PublicationIntent {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    "mode" in value &&
    (value.mode === "all_future" || value.mode === "future")
  )
    return { mode: value.mode };
  return parseScope(value);
}
export function includesFuture(
  intent: PublicationIntent,
): intent is { mode: "all_future" } | { mode: "future" } {
  return intent.mode === "all_future" || intent.mode === "future";
}
export function merchantScope(intent: PublicationIntent): PublicationScope {
  if (intent.mode === "future")
    return reject("INPUT", "Future-only publication has no shop scope.");
  return intent.mode === "all_future" ? { mode: "all" } : intent;
}
async function defaultScopePreview(
  tx: Prisma.TransactionClient,
  definitionId: string,
  intent: { mode: "all_future" } | { mode: "future" },
  wabaId: string,
  issuedAt: string,
  page = 1,
) {
  const verified = await verifiedPreview(tx, definitionId, wabaId, issuedAt);
  const state = await computePreview(
    tx,
    definitionId,
    { mode: "all" },
    wabaId,
    issuedAt,
    page,
    {
      source: verified.source,
      allowEmpty: true,
      futureOnly: intent.mode === "future",
      defaultFingerprint: verified.preview.fingerprint,
    },
  );
  return {
    verified,
    state,
    preview: {
      ...publicPreview(state, definitionId, page, issuedAt),
      defaultImpact: {
        purpose: verified.preview.purpose,
        format: verified.preview.format,
        currentTemplateName:
          verified.preview.current?.providerTemplateName ?? null,
        proposedTemplateName: verified.preview.providerTemplateName,
      },
    },
  };
}

/** One review for shop assignments and/or the platform default. The future-only
 * branch never discovers shops; all+future tolerates an empty merchant set. */
export async function previewScopedPublication(
  db: PrismaClient,
  principal: PlatformAdminPrincipal,
  input: { definitionId: string; scope: PublicationIntent; page: number },
) {
  requireTemplateSuperAdmin(principal);
  if (!isValidDefinitionId(input?.definitionId))
    return reject("INPUT", "Invalid definition.");
  const intent = parsePublicationIntent(input.scope);
  const issuedAt = new Date().toISOString();
  return db.$transaction(
    async (tx) => {
      const wabaId = await configuredSenderWaba(tx);
      if (includesFuture(intent))
        return (
          await defaultScopePreview(
            tx,
            input.definitionId,
            intent,
            wabaId,
            issuedAt,
            input.page,
          )
        ).preview;
      await assertCommonSourceGate(tx, input.definitionId, "assignment");
      const state = await computePreview(
        tx,
        input.definitionId,
        intent,
        wabaId,
        issuedAt,
        input.page,
      );
      return publicPreview(state, input.definitionId, input.page, issuedAt);
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      timeout: 30_000,
    },
  );
}

type Dependencies = {
  db: PrismaClient;
  principal: PlatformAdminPrincipal;
  ensureActor?: (tx: Prisma.TransactionClient) => Promise<void>;
};

/** Confirmation is atomic for the default pointer, its audit and creation of the
 * durable existing-shop operation. Shop processing remains separately resumable. */
export async function confirmScopedPublication(
  input: PublicationIntentRequest,
  deps: Dependencies,
): Promise<PublicationConfirmation> {
  requireTemplateSuperAdmin(deps.principal);
  if (
    !input ||
    typeof input !== "object" ||
    Object.keys(input).sort().join() !==
      "acknowledgeOverrides,definitionId,operationKey,previewFingerprint,previewIssuedAt,reason,scope" ||
    !isValidDefinitionId(input.definitionId) ||
    !isValidKey(input.operationKey) ||
    input.operationKey.length > 128 ||
    typeof input.acknowledgeOverrides !== "boolean"
  )
    return reject("INPUT", "Invalid publication request.");
  assertFreshPreview(input.previewIssuedAt, input.previewFingerprint);
  const intent = parsePublicationIntent(input.scope);
  if (!includesFuture(intent)) {
    const progress = await confirmPublication(
      { ...input, scope: intent },
      deps,
    );
    return {
      kind: "operation",
      progress,
      defaultConfigured: !!progress.defaultConfigured,
    };
  }
  const reason = reasonText(input.reason);
  const result = await deps.db.$transaction(
    async (tx) => {
      await lockCommonActivation(tx);
      const previous =
        intent.mode === "all_future"
          ? await tx.whatsAppTemplatePublicationOperation.findUnique({
              where: { operationKey: input.operationKey },
            })
          : null;
      if (previous) {
        const old = operationSnapshot(previous.scopeSnapshot);
        if (
          !old.defaultConfigured ||
          old.scope.mode !== "all" ||
          previous.definitionId !== input.definitionId ||
          previous.requestedByAdminId !== deps.principal.id ||
          old.previewFingerprint !== input.previewFingerprint ||
          old.reason !== reason ||
          old.acknowledgeOverrides !== input.acknowledgeOverrides
        ) {
          return reject(
            "COLLISION",
            "Operation key already belongs to another publication.",
          );
        }
        return { operationId: previous.id } as const;
      }
      const wabaId = await configuredSenderWaba(tx);
      await lockCandidate(tx, input.definitionId, wabaId);
      if ((await configuredSenderWaba(tx)) !== wabaId)
        return reject(
          "STALE_PREVIEW",
          "Configured sender changed. Review again.",
        );
      const { verified, state } = await defaultScopePreview(
        tx,
        input.definitionId,
        intent,
        wabaId,
        input.previewIssuedAt,
      );
      assertFreshPreview(input.previewIssuedAt, input.previewFingerprint);
      if (state.previewFingerprint !== input.previewFingerprint)
        return reject(
          "STALE_PREVIEW",
          "Default, approval or shop assignments changed. Review current impact again.",
        );
      if (state.impactCounts.conflict)
        return reject(
          "CONFLICT",
          "Ambiguous approved slots must be resolved before publishing.",
        );
      if (
        (state.impactCounts.override ||
          (intent.mode === "all_future" && state.impactCounts.replaced)) &&
        !input.acknowledgeOverrides
      ) {
        return reject(
          "OVERRIDE_CONFIRMATION",
          "Explicitly confirm replacement of existing merchant template versions, including shop-specific assignments.",
        );
      }
      const selected = await persistVerifiedDefault(tx, verified, reason, deps);
      if (!state.shopIds.length) return { purpose: selected.purpose } as const;
      const scope = { mode: "all" } as const;
      const operation = await createConfirmedOperation(
        tx,
        { ...input, scope },
        deps.principal,
        state,
        scope,
        wabaId,
        reason,
        true,
      );
      return { operationId: operation.id } as const;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 30_000,
    },
  );
  if ("operationId" in result && result.operationId)
    return {
      kind: "operation",
      progress: await progressForOperation(deps.db, result.operationId),
      defaultConfigured: true,
    };
  if ("purpose" in result && result.purpose)
    return { kind: "default_only", purpose: result.purpose };
  return reject("INTEGRITY", "Publication confirmation result unavailable.");
}
