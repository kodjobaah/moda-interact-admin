import type { ConfigurationContract, ValidationResult } from "./contracts";

export const ROUTING_AGENT_KEY = "recovery.routingAgent";
export type RoutingAgentPolicy = {
  schemaVersion: 1;
  enabled: boolean;
  modelBinding: { kind: "FIXED_CATALOGUE"; modelCatalogueEntryId: string } | { kind: "VERIFIED_SHOP_INHERIT" };
  promptRevisionId: string;
  wrapperAudience: "ROUTER";
  confidenceThreshold: number;
  budget: { deadlineMs: number; outputTokens: number; toolCalls: number };
  retry: { maxAttempts: number; backoffMs: number };
  input: { maxHistoryMessages: number; maxInputCharacters: number; maxCandidates: number };
  decisionTTLms: number;
  retentionMs: number;
};

/** Admin-owned business authoring policy. Missing values never acquire runtime defaults. */
export function validateRoutingAgentPolicy(input: unknown): ValidationResult {
  const errors: Record<string, string> = {};
  const object = (value: unknown, fields: readonly string[], path: string): Record<string, unknown> => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      errors[path || "_form"] = "A complete settings object is required.";
      return {};
    }
    for (const key of Object.keys(value)) if (!fields.includes(key)) errors[path ? `${path}.${key}` : key] = "Unsupported field; credentials and provider overrides are not accepted here.";
    return value as Record<string, unknown>;
  };
  const integer = (value: unknown, path: string, minimum: number, maximum = 2_147_483_647) => {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) errors[path] = `Enter a whole number from ${minimum} to ${maximum}.`;
  };
  const id = (value: unknown, path: string) => {
    if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,191}$/.test(value)) errors[path] = "Enter a valid saved record ID.";
  };
  const root = object(input, ["schemaVersion", "enabled", "modelBinding", "promptRevisionId", "wrapperAudience", "confidenceThreshold", "budget", "retry", "input", "decisionTTLms", "retentionMs"], "");
  if (root.schemaVersion !== 1) errors.schemaVersion = "Unsupported schema version.";
  if (typeof root.enabled !== "boolean") errors.enabled = "Choose enabled or disabled.";
  if (root.wrapperAudience !== "ROUTER") errors.wrapperAudience = "Routing uses the neutral ROUTER template only.";
  id(root.promptRevisionId, "promptRevisionId");
  integer(root.confidenceThreshold, "confidenceThreshold", 0, 100);
  const binding = object(root.modelBinding, ["kind", "modelCatalogueEntryId"], "modelBinding");
  if (binding.kind === "FIXED_CATALOGUE") id(binding.modelCatalogueEntryId, "modelBinding.modelCatalogueEntryId");
  else if (binding.kind !== "VERIFIED_SHOP_INHERIT") errors["modelBinding.kind"] = "Choose a fixed platform model or verified-shop inheritance.";
  else if (Object.hasOwn(binding, "modelCatalogueEntryId")) errors["modelBinding.modelCatalogueEntryId"] = "Inherited routing must not contain a fixed model ID.";
  const budget = object(root.budget, ["deadlineMs", "outputTokens", "toolCalls"], "budget");
  integer(budget.deadlineMs, "budget.deadlineMs", 1);
  integer(budget.outputTokens, "budget.outputTokens", 1);
  integer(budget.toolCalls, "budget.toolCalls", 0);
  const retry = object(root.retry, ["maxAttempts", "backoffMs"], "retry");
  integer(retry.maxAttempts, "retry.maxAttempts", 1);
  integer(retry.backoffMs, "retry.backoffMs", 0);
  const context = object(root.input, ["maxHistoryMessages", "maxInputCharacters", "maxCandidates"], "input");
  integer(context.maxHistoryMessages, "input.maxHistoryMessages", 0);
  integer(context.maxInputCharacters, "input.maxInputCharacters", 1);
  integer(context.maxCandidates, "input.maxCandidates", 1);
  integer(root.decisionTTLms, "decisionTTLms", 1);
  integer(root.retentionMs, "retentionMs", 1);
  if (typeof root.retentionMs === "number" && typeof root.decisionTTLms === "number" && root.retentionMs < root.decisionTTLms) errors.retentionMs = "Request retention must cover the decision lifetime.";
  return Object.keys(errors).length
    ? { ok: false, fieldErrors: errors, message: "Complete all routing settings and correct the highlighted fields." }
    : { ok: true, values: structuredClone(root) };
}

export const ROUTING_AGENT_CONTRACT: ConfigurationContract = {
  key: ROUTING_AGENT_KEY, title: "Checkout routing agent", kind: "policy", requiredRole: "SUPER_ADMIN",
  description: "Independent routing decisions. Missing or invalid settings disable semantic selection; neutral clarification remains the safe path. These settings never change the normal commerce agent.",
  canReset: false, fields: [], editor: "routing-agent", validate: validateRoutingAgentPolicy,
};
