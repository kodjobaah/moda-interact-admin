import type { Prisma } from "@prisma/client";

/** Bounded operational metadata only. No AST, sender tokens or customer data. */
export async function recordMetaControlAudit(tx: Prisma.TransactionClient, request: {
  actorAdminId: string; definitionId: string; operation: "submission" | "reconciliation" | "technical-retry";
  operationId: string; languageCount?: number; registrationId?: string;
}): Promise<void> {
  await tx.commerceAuditEvent.create({ data: {
    actorType: "PLATFORM_ADMIN", actorAdminId: request.actorAdminId,
    action: "REQUEST_WHATSAPP_TEMPLATE_META_SUBMISSION",
    operationId: request.operationId.slice(0, 128),
    reason: request.operation === "submission" ? "Confirmed immutable Meta template submission" :
      request.operation === "technical-retry" ? "Requested technical retry after confirmed provider absence" : "Requested Meta status reconciliation",
    metadata: { definitionId: request.definitionId, operation: request.operation,
      ...(request.languageCount !== undefined ? { languageCount: request.languageCount } : {}),
      ...(request.registrationId ? { registrationId: request.registrationId } : {}) },
  } });
}
