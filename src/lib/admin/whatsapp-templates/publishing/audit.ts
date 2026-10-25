import { createHash } from "node:crypto";

/**
 * CommerceAuditEvent.operationId has a unique index across all non-null rows.
 * The publication itself uses its durable operation ID; each effective shop +
 * language change therefore needs a *different*, stable audit operation ID.
 *
 * Cross-row reporting joins via metadata.publicationOperationId rather than
 * reusing the indexed CommerceAuditEvent.operationId value.
 */
export function assignmentAuditOperationId(
  publicationOperationId: string,
  shopId: string,
  languageTag: string,
): string {
  const digest = createHash("sha256")
    .update(JSON.stringify(["arch047-template-assignment-v1", publicationOperationId, shopId, languageTag]))
    .digest("hex");
  return `arch047-assignment-${digest}`;
}
