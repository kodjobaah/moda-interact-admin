/**
 * Local-only ARCH-043 import mechanics. Never evaluate/source the supplied file or
 * write arbitrary env names to the allowlisted configuration table.
 * The caller owns Prisma connectivity, canonical validation and Shared encryption.
 */
import { isDeepStrictEqual } from "node:util";

export const IMPORT_ENVIRONMENTS = Object.freeze(["development", "test"]);
export const IMPORT_ACTOR = "platform-env-import";

/** Environment names correspond to inspected ARCH-043 Admin contracts and legacy readers. */
export const PLATFORM_ENV_MAPPINGS = Object.freeze([
  { key: "woo.couponSync", fields: {
    dispatchBatchSize: ["WOO_COUPON_SYNC_DISPATCH_BATCH_SIZE"],
    refreshIntervalMinutes: ["WOO_COUPON_SYNC_REFRESH_MINUTES"],
    dispatchCooldownMinutes: ["WOO_COUPON_SYNC_DISPATCH_COOLDOWN_MINUTES"],
    unavailableRecheckMinutes: ["WOO_COUPON_SYNC_UNAVAILABLE_RECHECK_MINUTES"],
    staleScanMinutes: ["WOO_COUPON_SYNC_STALE_SCAN_MINUTES"],
    maxPages: ["WOO_COUPON_SYNC_MAX_PAGES"],
    requestTimeoutMs: ["WOO_COUPON_SYNC_REQUEST_TIMEOUT_MS"],
    maxResponseBytes: ["WOO_COUPON_SYNC_MAX_RESPONSE_BYTES"],
    maxScanDurationMs: ["WOO_COUPON_SYNC_MAX_SCAN_DURATION_MS"],
    workerConcurrency: ["WOO_COUPON_SYNC_WORKER_CONCURRENCY"],
  } },
  { key: "speech.transcription", fields: {
    provider: ["WHATSAPP_TRANSCRIPTION_PROVIDER"],
    groqModelId: ["GROQ_TRANSCRIPTION_MODEL"],
    openaiModelId: ["OPENAI_TRANSCRIPTION_MODEL"],
  } },
  { key: "admin.grafana", fields: {
    baseUrl: ["GRAFANA_BASE_URL"], logsUrl: ["GRAFANA_LOGS_URL"],
    metricsUrl: ["GRAFANA_METRICS_URL"], tracesUrl: ["GRAFANA_TRACES_URL"],
    platformDashboardUrl: ["GRAFANA_PLATFORM_DASHBOARD_URL"],
  } },
  { key: "omini.moderation", fields: {
    baseUrl: ["OPENAI_MODERATION_BASE_URL"], modelId: ["OPENAI_MODERATION_MODEL_ID"],
  } },
  { key: "commerce.connectionKeys", fields: {
    connectionKeysJson: ["COMMERCE_CONNECTION_KEYS_JSON"],
    activeKeyId: ["COMMERCE_CONNECTION_ACTIVE_KEY_ID"],
    commandHmacKey: ["COMMERCE_CONNECTION_COMMAND_HMAC_KEY"],
  } },
  ...["auth.admin", "auth.commerce"].map((key) => ({ key, fields: {
    authSecret: ["AUTH_SECRET"], googleClientId: ["AUTH_GOOGLE_ID"],
    googleClientSecret: ["AUTH_GOOGLE_SECRET"],
  } })),
  { key: "commerce.bootstrap", fields: {
    adminEmail: ["COMMERCE_BOOTSTRAP_ADMIN_EMAIL"],
  } },
  { key: "merchant.knowledge.r2", fields: {
    endpoint: ["MERCHANT_KNOWLEDGE_R2_ENDPOINT"],
    bucket: ["MERCHANT_KNOWLEDGE_R2_BUCKET"],
    accessKeyId: ["MERCHANT_KNOWLEDGE_R2_ACCESS_KEY_ID"],
    secretAccessKey: ["MERCHANT_KNOWLEDGE_R2_SECRET_ACCESS_KEY"],
    maxUploadBytes: ["MERCHANT_KNOWLEDGE_MAX_UPLOAD_BYTES"],
    maxXlsxUncompressedBytes: ["MERCHANT_KNOWLEDGE_MAX_XLSX_UNCOMPRESSED_BYTES"],
  } },
  { key: "woocommerce.auth", fields: {
    consumerKey: ["WOOCOMMERCE_CUSTOMER_KEY"],
    consumerSecret: ["WOOCOMMERCE_CUSTOMER_SECRET"],
  } },
  { key: "shopify.oauth", fields: {
    apiKey: ["SHOPIFY_API_KEY"], apiSecret: ["SHOPIFY_API_SECRET"],
  } },
  { key: "messaging.meta", fields: {
    appSecret: ["META_APP_SECRET"], verifyToken: ["WHATSAPP_VERIFY_TOKEN"],
  } },
  { key: "woocommerce.billing", fields: {
    apiKey: ["WOO_BILLING_API_KEY"], apiSecret: ["WOO_BILLING_API_SECRET"],
  } },
  { key: "shopify.partner", fields: {
    accessToken: ["SHOPIFY_PARTNER_ACCESS_TOKEN", "SHOPIFY_PARTNER_API_TOKEN"],
    organizationId: ["SHOPIFY_PARTNER_ORG_ID", "SHOPIFY_PARTNER_ORGANIZATION_ID"],
    appId: ["SHOPIFY_APP_ID"], apiVersion: ["SHOPIFY_PARTNER_API_VERSION"],
  } },
  { key: "shopify.appEvents", fields: {
    clientId: ["SHOPIFY_APP_EVENTS_CLIENT_ID"], clientSecret: ["SHOPIFY_APP_EVENTS_CLIENT_SECRET"],
  } },
  { key: "messaging.sender", fields: {
    accessToken: ["WHATSAPP_ACCESS_TOKEN"],
    phoneNumberId: ["WHATSAPP_PHONE_NUMBER_ID"],
    businessAccountId: ["WHATSAPP_BUSINESS_ACCOUNT_ID"],
  } },
  { key: "ai.providers", fields: {
    groqApiKey: ["GROQ_API_KEY"],
    openAiApiKey: ["OPENAI_API_KEY", "WHATSAPP_OPENAI_API_KEY"],
  } },
]);

/**
 * Known input names must never be silently discarded in a shell startup file:
 * an unsupported assignment can change credentials, URLs or policy.
 */
const PLATFORM_INPUT_NAMES = new Set([
  ...PLATFORM_ENV_MAPPINGS.flatMap((mapping) => Object.values(mapping.fields).flat()),
  "DATABASE_URL", "MODA_CONFIG_UNSEAL_KEY", "MODA_CONFIG_UNSEAL_ACTIVE_KEY_ID",
]);

function unsupportedKnownShellAssignment(line) {
  // Detect an attempted, but unsupported, simple assignment/declaration.
  // Arbitrary shell commands mentioning a key (e.g. `echo "$KEY"`) are ignored.
  const declaration = /^(?:export|declare|typeset|readonly)\s+(?:-[A-Za-z]+\s+)*([A-Za-z_][A-Za-z0-9_]*)\b/.exec(line);
  const bare = /^([A-Za-z_][A-Za-z0-9_]*)\s/.exec(line);
  return [declaration?.[1], bare?.[1]].find((name) => PLATFORM_INPUT_NAMES.has(name));
}

function containsActiveShellExpansion(value) {
  for (let position = 0; position < value.length; position++) {
    if (value[position] === "\\") { position++; continue; }
    if (value[position] === "`") return true;
    if (value[position] === "$" && /[A-Za-z_0-9{(@?$#!*\-'"]/.test(value[position + 1] ?? "")) return true;
  }
  return false;
}

/**
 * Parse literal dotenv/export assignments without evaluating the input.
 * `shellFile` skips unrelated shell statements (for .zshenv/.zshrc, etc.) but
 * rejects unsupported declarations and expansions of PlatformConfiguration keys.
 */
export function parseEnvironmentFile(text, { shellFile = false } = {}) {
  if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > 2 * 1024 * 1024) {
    throw new Error("Environment file exceeds the 2 MiB limit.");
  }
  const entries = Object.create(null);
  for (const [index, original] of text.replace(/^\uFEFF/, "").split(/\r?\n/).entries()) {
    const line = original.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)(\s*)=(\s*)(.*)$/.exec(line);
    if (!match) {
      if (shellFile) {
        const name = unsupportedKnownShellAssignment(line);
        if (name) throw new Error(`Unsupported shell assignment for ${name} at line ${index + 1}. Use a literal KEY=value assignment.`);
        continue;
      }
      throw new Error(`Invalid environment assignment at line ${index + 1}.`);
    }
    const [, name, beforeEquals, afterEquals, rhs] = match;
    const known = PLATFORM_INPUT_NAMES.has(name);
    if (shellFile && known && (beforeEquals || afterEquals)) {
      throw new Error(`Unsupported shell assignment for ${name} at line ${index + 1}. Remove spaces around =.`);
    }
    let value;
    if (rhs.startsWith('"') || rhs.startsWith("'")) {
      const quote = rhs[0];
      let close = 1;
      while (close < rhs.length) {
        if (quote === '"' && rhs[close] === "\\" && close + 1 < rhs.length) { close += 2; continue; }
        if (rhs[close] === quote) break;
        close++;
      }
      if (close === rhs.length || !/^(?:\s*(?:#.*)?)?$/.test(rhs.slice(close + 1))) {
        if (shellFile && !known) continue;
        throw new Error(`Invalid quoted assignment at line ${index + 1}.`);
      }
      const rawValue = rhs.slice(1, close);
      if (shellFile && known && quote === '"' && containsActiveShellExpansion(rawValue)) {
        throw new Error(`Shell expansion is not supported for ${name} at line ${index + 1}. Supply a literal value.`);
      }
      value = quote === '"'
        ? rawValue.replace(shellFile ? /\\(["\\$`])/g : /\\(["\\])/g, "$1")
        : rawValue;
    } else {
      const rawValue = rhs.replace(/\s+#.*$/, "").trimEnd();
      if (shellFile && known) {
        if (containsActiveShellExpansion(rawValue) || /[;|&<>\s]/.test(rawValue) ||
            /^~(?:\/|$)/.test(rawValue) || /\\(?![\\$`])/.test(rawValue)) {
          throw new Error(`Unsupported shell syntax for ${name} at line ${index + 1}. Supply a literal value.`);
        }
        value = rawValue.replace(/\\([\\$`])/g, "$1");
      } else {
        value = rawValue;
      }
    }
    entries[name] = value;
  }
  return entries;
}

const own = (record, name) => Object.prototype.hasOwnProperty.call(record, name);

/** Resolve known names through the canonical registry; unknown/deployment-only names are ignored. */
export function planPlatformImport(variables, registry) {
  const recognised = new Set();
  const groups = [];
  for (const mapping of PLATFORM_ENV_MAPPINGS) {
    const contract = registry.get(mapping.key);
    if (!contract || !["policy", "secret"].includes(contract.kind)) {
      throw new Error(`PlatformConfiguration contract is missing: ${mapping.key}.`);
    }
    const fields = new Map(contract.fields.map((field) => [field.name, field]));
    const values = {};
    for (const [name, aliases] of Object.entries(mapping.fields)) {
      const field = fields.get(name);
      if (!field) throw new Error(`Configuration field is missing: ${mapping.key}.${name}.`);
      for (const alias of aliases) recognised.add(alias);
      const present = aliases.filter((alias) => own(variables, alias));
      if (present.length === 0) continue;
      if (present.some((alias) => variables[alias] !== variables[present[0]])) {
        throw new Error(`Conflicting environment aliases: ${present.join(", ")}.`);
      }
      const raw = variables[present[0]];
      if (field.kind === "integer") {
        if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) {
          throw new Error(`Expected a non-negative integer for ${present[0]}.`);
        }
        values[name] = Number(raw);
      } else if (field.kind === "nullable-https-url" && raw === "") {
        values[name] = null;
      } else if (field.optional && raw === "") {
        // An empty optional field never erases an existing value.
        continue;
      } else {
        values[name] = raw;
      }
    }
    if (Object.keys(values).length > 0) groups.push({ key: mapping.key, kind: contract.kind, contract, values });
  }
  return { groups, ignoredCount: Object.keys(variables).filter((name) => !recognised.has(name)).length };
}

function completeSecret(values, contract) {
  return contract.fields.filter((field) => !field.optional && !own(values, field.name)).map((field) => field.name);
}
function disabled(value) {
  return value && typeof value === "object" && !Array.isArray(value) && value.kind === "disabled" && value.schemaVersion === 1 && Object.keys(value).length === 2;
}
const redacted = (configured) => ({ redacted: true, configured });

// These are fixed, non-sensitive messages emitted by Admin's canonical
// validateSecretPayload implementation. Never print an arbitrary exception
// message: another validator/runtime failure could contain credential values.
const SAFE_SECRET_VALIDATION_REASONS = new Set([
  "Unsupported or incomplete secret configuration.",
  "Invalid R2 size limit.",
  "Invalid Cloudflare R2 location.",
  "Uncompressed XLSX limit cannot be lower than upload limit.",
  "Invalid Commerce connection configuration.",
  "Auth.js signing secret must have at least 32 bytes.",
  "Invalid bootstrap administrator email.",
  "Invalid Shopify Partner organisation ID.",
  "Invalid Shopify application ID.",
  "Invalid Shopify Partner API version.",
  "Invalid WhatsApp sender identifiers.",
  "Configure at least one approved AI provider key.",
  "Invalid WooCommerce consumer key pair.",
  "Secret payload exceeds the supported size.",
]);

function secretValidationFailure(key, cause) {
  const reason = cause instanceof Error && cause.name === "ConfigurationError" &&
    cause.code === "INVALID_INPUT" && SAFE_SECRET_VALIDATION_REASONS.has(cause.message)
    ? `: ${cause.message}` : "";
  return new Error(`Invalid secret fields for ${key}${reason}; no records were written.`);
}

/** Run inside one SERIALIZABLE database transaction (or a read-only dry run). */
export async function applyPlatformImport(tx, plan, options) {
  const { update, dryRun, validatePolicy, validateSecret, seal, unseal, dbNull } = options;
  const outcome = [];
  for (const environment of IMPORT_ENVIRONMENTS) {
    for (const group of plan.groups) {
      const { key, contract, kind, values } = group;
      const existing = await tx.platformConfiguration.findUnique({ where: { environment_key: { environment, key } } });
      if (existing && !update) { outcome.push({ environment, key, status: "skipped-existing" }); continue; }
      const currentVersion = existing?.version ?? 0;
      if (!Number.isSafeInteger(currentVersion) || currentVersion < 0 || currentVersion >= 2147483647) {
        throw new Error(`Invalid revision for ${environment}:${key}.`);
      }
      let next;
      let configuredBefore = false;
      if (kind === "policy") {
        const candidate = { ...(existing?.value ?? contract.defaults ?? {}), ...values };
        const valid = validatePolicy(contract, candidate);
        if (!valid.ok) {
          throw new Error(`Invalid policy ${key}: ${Object.keys(valid.fieldErrors).join(", ") || "invalid payload"}.`);
        }
        next = valid.values;
        if (existing && isDeepStrictEqual(existing.value, next)) {
          outcome.push({ environment, key, status: "unchanged" }); continue;
        }
      } else {
        const missing = completeSecret(values, contract);
        if (!existing && missing.length) {
          outcome.push({ environment, key, status: "skipped-incomplete", missing }); continue;
        }
        if (dryRun) {
          // No decryption/encryption or writes in dry-run mode. An existing secret
          // might compare equal; the dry run conservatively labels it would-update.
          // A partial update must be combined with current ciphertext to validate
          // completely; only the actual run decrypts. A complete create can be
          // validated here without needing the configuration-unseal root.
          if (!existing) {
            try { validateSecret(key, values); }
            catch (cause) { throw secretValidationFailure(key, cause); }
          }
          outcome.push({ environment, key, status: existing ? "would-update" : "would-create" });
          continue;
        }
        let previous = {};
        if (existing) {
          if (disabled(existing.value)) {
            if (missing.length) {
              outcome.push({ environment, key, status: "skipped-incomplete", missing }); continue;
            }
          } else {
            const plaintext = unseal({ environment, key, version: existing.version, value: existing.value });
            try { previous = validateSecret(key, JSON.parse(plaintext)); }
            catch { throw new Error(`Cannot decode existing secret configuration: ${environment}:${key}.`); }
            configuredBefore = true;
          }
        }
        try { next = validateSecret(key, { ...previous, ...values }); }
        catch (cause) { throw secretValidationFailure(key, cause); }
        if (existing && configuredBefore && isDeepStrictEqual(previous, next)) {
          outcome.push({ environment, key, status: "unchanged" }); continue;
        }
        next = seal({ environment, key, version: currentVersion + 1, plaintext: JSON.stringify(next) });
      }
      if (dryRun) {
        outcome.push({ environment, key, status: existing ? "would-update" : "would-create" });
        continue;
      }
      const version = currentVersion + 1;
      if (existing) {
        const result = await tx.platformConfiguration.updateMany({
          where: { environment, key, version: currentVersion },
          data: { value: next, version: { increment: 1 }, updatedBy: IMPORT_ACTOR },
        });
        if (result.count !== 1) throw new Error(`Concurrent configuration change: ${environment}:${key}.`);
      } else {
        await tx.platformConfiguration.create({ data: { environment, key, value: next, version, updatedBy: IMPORT_ACTOR } });
      }
      await tx.platformConfigurationAudit.create({ data: {
        environment, key, expectedVersion: currentVersion, resultingVersion: version,
        actorId: IMPORT_ACTOR,
        reason: kind === "secret" ? existing ? "scheduled-rotation" : "initial-setup" : "environment-file-import",
        beforeValue: existing ? kind === "secret" ? redacted(configuredBefore) : existing.value : dbNull,
        afterValue: kind === "secret" ? redacted(true) : next,
      } });
      outcome.push({ environment, key, status: existing ? "updated" : "created" });
    }
  }
  return outcome;
}
