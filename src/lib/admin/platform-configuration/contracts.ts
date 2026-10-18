/** ARCH-043 Admin-owned, closed policy authoring contracts. No browser-supplied contract is trusted. */
export type FieldContract =
  | { name: string; kind: "integer"; label: string; description: string; min: number; max: number; unit?: string }
  | { name: string; kind: "boolean"; label: string; description: string }
  | { name: string; kind: "string"; label: string; description: string; maxLength: number; optional?: boolean; pattern?: "model-id" | "bucket" }
  | { name: string; kind: "enum"; label: string; description: string; options: readonly string[] }
  | { name: string; kind: "nullable-https-url"; label: string; description: string; maxLength: number; purpose?: "r2" }
  | { name: string; kind: "secret"; label: string; description: string; revealable: true; optional?: boolean };

export type ConfigurationContract = Readonly<{
  key: string; title: string; description: string; kind: "policy" | "secret";
  fields: readonly FieldContract[]; defaults?: Readonly<Record<string, unknown>>;
  canReset: boolean; requiredRole: "SUPER_ADMIN";
  /** A single, server-owned cross-field predicate. Never serialised for browser execution. */
  refine?: (values: Readonly<Record<string, unknown>>) => string | null;
}>;
export type PublicContract = Omit<ConfigurationContract, "refine">;
export type Registry = ReadonlyMap<string, ConfigurationContract>;
export type ValidationResult = { ok: true; values: Record<string, unknown> } |
  { ok: false; fieldErrors: Record<string, string>; message: string };

/** Environment names are documentation hints only; PostgreSQL is the configuration store. */
const withEnvironmentReference = (field: FieldContract, name: string): FieldContract => ({
  ...field, description: `${field.description} Environment variable: ${name}.`,
});

const integer = (name: string, label: string, min: number, max: number, unit?: string): FieldContract =>
  ({ name, label, kind: "integer", min, max, unit, description: `Whole number from ${min} to ${max}${unit ? ` ${unit}` : ""}.` });
const model = (name: string, label: string): FieldContract =>
  ({ name, label, kind: "string", maxLength: 128, pattern: "model-id", description: "Required model identifier (up to 128 characters)." });
const grafana = (name: string, label: string): FieldContract =>
  ({ name, label, kind: "nullable-https-url", maxLength: 2048, description: "Optional HTTPS URL without credentials, query parameters or fragments." });
const httpsUrl = (name: string, label: string, description: string): FieldContract =>
  ({ name, label, kind: "nullable-https-url", maxLength: 2048, description });

/** The 120-second preview reservation is defined by Commerce src/commerce/preview/store.ts.
 * Commerce's run-budgets.ts preserves a 30-second terminal-commit margin. */
export const APPROVED_PREVIEW_SLOT_MS = 120_000;

export const PLATFORM_POLICY_CONTRACTS: readonly ConfigurationContract[] = Object.freeze([
  {
    key: "woo.couponSync", title: "WooCommerce coupon sync", kind: "policy", requiredRole: "SUPER_ADMIN",
    description: "Background coupon polling and dispatch policy. Worker concurrency changes require worker recreation/restart.",
    canReset: true,
    fields: [
      integer("dispatchBatchSize", "Dispatch batch size", 1, 500),
      integer("refreshIntervalMinutes", "Refresh interval", 1, 1440, "minutes"),
      integer("dispatchCooldownMinutes", "Dispatch cooldown", 1, 120, "minutes"),
      integer("unavailableRecheckMinutes", "Unavailable recheck", 1, 1440, "minutes"),
      integer("staleScanMinutes", "Stale scan", 1, 120, "minutes"),
      integer("maxPages", "Maximum pages", 1, 200),
      integer("requestTimeoutMs", "Request timeout", 1000, 30000, "ms"),
      integer("maxResponseBytes", "Response size limit", 16384, 4194304, "bytes"),
      integer("maxScanDurationMs", "Maximum scan duration", 30000, 600000, "ms"),
      withEnvironmentReference(integer("workerConcurrency", "Worker concurrency", 1, 32), "WOO_COUPON_SYNC_WORKER_CONCURRENCY"),
    ],
    defaults: {
      dispatchBatchSize: 500, refreshIntervalMinutes: 30, dispatchCooldownMinutes: 5,
      unavailableRecheckMinutes: 30, staleScanMinutes: 15, maxPages: 50,
      requestTimeoutMs: 8000, maxResponseBytes: 1048576, maxScanDurationMs: 120000, workerConcurrency: 4,
    },
  },
  {
    key: "speech.transcription", title: "Speech transcription", kind: "policy", requiredRole: "SUPER_ADMIN",
    description: "Background speech provider and model selection; API keys are managed separately.",
    canReset: true,
    fields: [
      withEnvironmentReference({ name: "provider", label: "Provider", description: "Speech-to-text provider.", kind: "enum", options: ["groq", "openai"] }, "WHATSAPP_TRANSCRIPTION_PROVIDER"),
      withEnvironmentReference(model("groqModelId", "Groq model ID"), "GROQ_TRANSCRIPTION_MODEL"), withEnvironmentReference(model("openaiModelId", "OpenAI model ID"), "OPENAI_TRANSCRIPTION_MODEL"),
    ],
    defaults: { provider: "groq", groqModelId: "whisper-large-v3-turbo", openaiModelId: "gpt-4o-mini-transcribe" },
  },
  {
    key: "commerce.preview", title: "Commerce Studio preview", kind: "policy", requiredRole: "SUPER_ADMIN",
    description: "Studio-only execution budget; does not change production conversations.",
    canReset: true,
    fields: [
      integer("deadlineMs", "Deadline", 1, APPROVED_PREVIEW_SLOT_MS - 30_000, "ms"),
      integer("outputTokens", "Output tokens", 1, 32768),
    ],
    defaults: { deadlineMs: 60_000, outputTokens: 1200 },
  },
  {
    key: "admin.grafana", title: "Grafana navigation", kind: "policy", requiredRole: "SUPER_ADMIN",
    description: "Optional Admin navigation links only; telemetry exporters and credentials remain unchanged.",
    canReset: true,
    fields: [
      withEnvironmentReference(grafana("baseUrl", "Grafana base URL"), "GRAFANA_BASE_URL"), withEnvironmentReference(grafana("logsUrl", "Logs URL"), "GRAFANA_LOGS_URL"),
      withEnvironmentReference(grafana("metricsUrl", "Metrics URL"), "GRAFANA_METRICS_URL"), withEnvironmentReference(grafana("tracesUrl", "Traces URL"), "GRAFANA_TRACES_URL"),
      withEnvironmentReference(grafana("platformDashboardUrl", "Platform dashboard URL"), "GRAFANA_PLATFORM_DASHBOARD_URL"),
    ],
    defaults: { baseUrl: null, logsUrl: null, metricsUrl: null, tracesUrl: null, platformDashboardUrl: null },
  },
  {
    key: "omini.moderation", title: "OpenAI SDK moderation", kind: "policy", requiredRole: "SUPER_ADMIN",
    description: "OpenAI SDK moderation settings",
    canReset: true,
    fields: [
      withEnvironmentReference(httpsUrl("baseUrl", "OpenAI moderation base URL", "Optional HTTPS base URL without credentials, query parameters or fragments."), "OPENAI_MODERATION_BASE_URL"),
      withEnvironmentReference(model("modelId", "OpenAI SDK OpenAI Moderation model ID"), "OPENAI_MODERATION_MODEL_ID"),
    ],
    defaults: { baseUrl: 'https://api.openai.com/v1/moderations', modelId: 'omni-moderation-latest' },
  },
]);

/** Dependency injection here is for isolated tests only; production callers use the closed registry. */
export function createConfigurationRegistry(definitions: readonly ConfigurationContract[]): Registry {
  const registry = new Map<string, ConfigurationContract>();
  for (const definition of definitions) {
    if (!/^[a-z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*)+$/.test(definition.key) || registry.has(definition.key)) {
      throw new Error("Invalid or duplicate server-owned configuration key");
    }
    if (definition.canReset && !definition.defaults) throw new Error("Reset requires reviewed defaults");
    if (definition.kind === "secret" && definition.defaults) throw new Error("Secret defaults are forbidden");
    if (new Set(definition.fields.map((field) => field.name)).size !== definition.fields.length) {
      throw new Error("Duplicate configuration field");
    }
    registry.set(definition.key, definition);
  }
  return registry;
}
export const PLATFORM_POLICY_REGISTRY = createConfigurationRegistry(PLATFORM_POLICY_CONTRACTS);
// ADMIN-002 reuses the same registry architecture; the non-secret entrypoint remains policy-only.
import { PLATFORM_SECRET_CONTRACTS } from "./secrets-contracts";
export const PLATFORM_CONFIGURATION_REGISTRY = createConfigurationRegistry([...PLATFORM_POLICY_CONTRACTS, ...PLATFORM_SECRET_CONTRACTS]);

export function publicContracts(registry: Registry = PLATFORM_POLICY_REGISTRY, includeSecrets = false): PublicContract[] {
  return [...registry.values()].filter((contract) => includeSecrets || contract.kind === "policy").map((contract) => ({
    key: contract.key,
    title: contract.title,
    description: contract.description,
    kind: contract.kind,
    fields: contract.fields.map((field) => ({ ...field })),
    defaults: contract.defaults ? { ...contract.defaults } : undefined,
    canReset: contract.canReset,
    requiredRole: contract.requiredRole,
  }));
}

/** Only fully qualified, public HTTPS destinations without embedded secrets. */
export function isSafeHttpsUrl(input: string, purpose?: "r2"): boolean {
  try {
    if (input.length > 2048 || input.trim() !== input || /[\s\x00-\x1f]/.test(input)) return false;
    const url = new URL(input);
    if (url.protocol !== "https:" || url.username || url.password || url.hash || url.search || url.port && url.port !== "443") return false;
    const host = url.hostname.toLowerCase();
    if (!host.includes(".") || host === "localhost" || /\.(?:local|localhost|test|invalid|example|internal)$/.test(host)) return false;
    if (/^(?:127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(?:1[6-9]|2[0-9]|3[01])\.)/.test(host)) return false;
    if (host.startsWith("[") || /^\d+(?:\.\d+){3}$/.test(host)) return false;
    if (purpose === "r2" && (url.pathname !== "/" || /(?:^|\.)example\.(?:com|net|org)$/.test(host))) return false;
    return true;
  } catch { return false; }
}

export function validateConfiguration(contract: ConfigurationContract, input: unknown): ValidationResult {
  const errors: Record<string, string> = {};
  if (contract.kind !== "policy" || !input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, fieldErrors: {}, message: "A supported non-secret policy object is required." };
  }
  const record = input as Record<string, unknown>;
  const fields = new Map(contract.fields.map((field) => [field.name, field]));
  for (const key of Object.keys(record)) if (!fields.has(key)) errors[key] = "Unrecognised field.";
  const values: Record<string, unknown> = {};
  for (const field of contract.fields) {
    const value = record[field.name];
    if (field.kind === "secret") { errors[field.name] = "Secrets cannot be written with the policy editor."; continue; }
    switch (field.kind) {
      case "integer":
        if (typeof value !== "number" || !Number.isSafeInteger(value) || value < field.min || value > field.max) errors[field.name] = `Enter a whole number from ${field.min} to ${field.max}.`;
        else values[field.name] = value;
        break;
      case "boolean":
        if (typeof value !== "boolean") errors[field.name] = "Choose true or false.";
        else values[field.name] = value;
        break;
      case "enum":
        if (typeof value !== "string" || !field.options.includes(value)) errors[field.name] = "Select an approved value.";
        else values[field.name] = value;
        break;
      case "string":
        if (typeof value !== "string" || !value.trim() || value.length > field.maxLength || value.trim() !== value || /[\x00-\x1f]/.test(value)) errors[field.name] = `Enter text up to ${field.maxLength} characters.`;
        else if (field.pattern === "model-id" && !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value)) errors[field.name] = "Invalid model identifier.";
        else if (field.pattern === "bucket" && (!/^(?!.*\.\.)(?!.*\.-|.*-\.)[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(value) || /^\d+\.\d+\.\d+\.\d+$/.test(value) || ["configured-bucket", "example-bucket", "your-bucket", "bucket-name"].includes(value))) errors[field.name] = "Invalid or placeholder bucket name.";
        else values[field.name] = value;
        break;
      case "nullable-https-url":
        if (field.purpose === "r2" && (typeof value !== "string" || !isSafeHttpsUrl(value, "r2"))) errors[field.name] = "A valid, non-placeholder public HTTPS R2 endpoint is required.";
        else if (field.purpose !== "r2" && value !== null && (typeof value !== "string" || !isSafeHttpsUrl(value))) errors[field.name] = "Use an HTTPS URL without credentials, query parameters or fragments, or leave blank.";
        else if (typeof value === "string" && value.length > field.maxLength) errors[field.name] = `Maximum ${field.maxLength} characters.`;
        else values[field.name] = value;
        break;
    }
  }
  if (Object.keys(errors).length === 0 && contract.refine) {
    const message = contract.refine(values);
    if (message) errors._form = message;
  }
  return Object.keys(errors).length ? { ok: false, fieldErrors: errors, message: "Correct the highlighted fields." } : { ok: true, values };
}
