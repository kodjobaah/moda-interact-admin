/** Existing prompt lineage is shared storage; purpose is an application-owned binding. */
export const ROUTING_PROMPT_PURPOSE = "RECOVERY_ROUTING";
export function isRoutingPromptRevision(revision: {
  sourceContext?: unknown;
}): boolean {
  const context = revision.sourceContext;
  return Boolean(
    context &&
    typeof context === "object" &&
    !Array.isArray(context) &&
    (context as Record<string, unknown>).purpose === ROUTING_PROMPT_PURPOSE,
  );
}
