import { createHash } from "node:crypto";
import { stableJson } from "./canonical";
import type { TemplateAst } from "./types";

export function templateHash(value: unknown): string {
  return createHash("sha256").update(stableJson(value), "utf8").digest("hex");
}
export function definitionIdForSubmit(actorId: string, submissionId: string): string {
  if (!/^[a-f0-9-]{36}$/i.test(submissionId) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(submissionId)) {
    throw new Error("A valid submission UUID is required.");
  }
  return `wtdef_${createHash("sha256").update(`${actorId}\u0000${submissionId}`).digest("hex")}`;
}
export function providerTemplateName(draft: TemplateAst, id: string): string | null {
  if (draft.family !== "META_RECOVERY") return null;
  return `moda_${draft.stage.toLowerCase()}_${draft.offerType.toLowerCase()}_${id.slice(-20)}`;
}
