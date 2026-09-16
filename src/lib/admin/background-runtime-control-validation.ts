export const RUNTIME_CONFLICT_MESSAGE =
  "Runtime controls changed since this page was loaded. Reload the current values and reapply your changes.";
export const RUNTIME_MISSING_MESSAGE =
  "Background runtime configuration is missing.";

export function runtimeControlsSuccessMessage(changedQueueConcurrency: boolean): string {
  const message = "Runtime controls updated. The committed values are shared by all worker replicas. Running work is not interrupted; workers adopt the new configuration automatically.";
  return changedQueueConcurrency
    ? `${message} Fleet-wide queue limits converge without redeploying workers.`
    : message;
}

export type RuntimeSection = "OPERATIONAL" | "ADVANCED" | "ABUSE_PROTECTION";
export type RuntimeConfigValues = Record<string, number> & {
  version: number;
};

export type RuntimeField = {
  key: string;
  label: string;
  guidance: string;
  unit: string;
  min: number;
  max: number;
  defaultValue: number;
  displayMultiplier?: number;
  displayStep?: string;
  displayUnit?: string;
  displayDefault?: string;
  displayMin?: string;
  displayMax?: string;
};

const integerField = (
  key: string,
  label: string,
  guidance: string,
  unit: string,
  min: number,
  max: number,
  defaultValue: number,
): RuntimeField => ({ key, label, guidance, unit, min, max, defaultValue });

const secondsField = (
  key: string,
  label: string,
  guidance: string,
  min: number,
  max: number,
  defaultValue: number,
  displayDefault?: string,
): RuntimeField => ({
  key,
  label,
  guidance,
  unit: "seconds",
  min,
  max,
  defaultValue,
  displayDefault,
});

const millisecondsField = (
  key: string,
  label: string,
  guidance: string,
  min: number,
  max: number,
  defaultValue: number,
): RuntimeField => ({
  key,
  label,
  guidance,
  unit: "seconds",
  min,
  max,
  defaultValue,
  displayMultiplier: 1000,
  displayStep: "0.001",
});

export const RUNTIME_FIELDS: Record<RuntimeSection, RuntimeField[]> = {
  OPERATIONAL: [
    integerField("billingReconciliationIntervalSeconds", "Reconciliation interval", "How often Moda checks Shopify billing state. Lower values detect changes sooner but increase Shopify and database activity.", "seconds", 10, 3600, 60),
    integerField("billingReconciliationShopBatchSize", "Shops per reconciliation cycle", "Maximum merchants checked during one reconciliation pass. Increase this as the merchant base grows, while watching provider and database load.", "shops", 1, 200, 50),
    integerField("shopifyUsagePublishBatchSize", "Usage events per publish cycle", "Maximum pending Shopify App Events submitted during one billing publish pass. Higher values drain backlog faster but create more provider traffic.", "events", 1, 200, 50),
    secondsField("recoveryRepairIntervalSeconds", "Repair interval", "How often Moda looks for recoveries blocked because recovery capacity was unavailable.", 30, 3600, 300, "5 min"),
    integerField("recoveryRepairShopBatchSize", "Shops per repair", "Maximum shops inspected during one recovery-capacity repair pass.", "shops", 1, 500, 100),
    integerField("recoveryResumeBatchSize", "Recoveries per resume job", "Maximum blocked baskets resumed by one job before Moda schedules continuation work.", "recoveries", 1, 100, 25),
    integerField("checkoutRecoveryLifetimeDays", "Checkout recovery lifetime", "Expire an active checkout recovery after this many days without checkout/customer activity. Expired history is retained; later checkout activity can start a new recovery generation.", "days", 1, 90, 21),
    secondsField("translationReconciliationIntervalSeconds", "Translation reconciliation interval", "How often Moda repairs missing or stale translation jobs. Lower values recover work sooner but increase database and queue activity.", 30, 3600, 300, "5 min"),
    integerField("translationBatchMaxRequests", "Translations per provider batch", "Maximum translation requests grouped into one provider batch. Larger batches reduce submission overhead but increase the size of each provider operation.", "requests", 1, 500, 100),
    millisecondsField("conversationQuietWindowMs", "Wait after customer message", "Moda waits this long after the most recent customer message before responding, so rapid follow-up messages can be handled as one turn.", 250, 10000, 3000),
    millisecondsField("conversationMaxSettleWindowMs", "Maximum message settle time", "The longest Moda waits for additional messages before responding. This value cannot be lower than the wait-after-message setting.", 1000, 30000, 10000),
  ],
  ADVANCED: [
    secondsField("billingFrozenRecheckSeconds", "Frozen subscription recheck", "How frequently Moda rechecks subscriptions currently reported as frozen.", 300, 86400, 3600, "60 min"),
    secondsField("billingProviderRetrySeconds", "Provider-state retry", "Delay before retrying when Shopify billing state cannot be confirmed.", 30, 3600, 300, "5 min"),
    secondsField("shopifyUsageRetryBaseSeconds", "Usage-event retry base", "Starting delay for retryable Shopify App Event failures before exponential backoff.", 10, 3600, 60),
    secondsField("shopifyUsageRetryMaxSeconds", "Usage-event maximum retry delay", "Upper bound on the usage-event exponential retry delay.", 60, 86400, 3600, "60 min"),
    integerField("translationReconciliationPageSize", "Reconciliation page size", "Maximum translation records inspected in one reconciliation page.", "translations", 1, 500, 100),
    secondsField("translationClaimTimeoutSeconds", "Translation claim timeout", "How long a claimed translation can remain active before it is eligible for recovery.", 60, 86400, 900, "15 min"),
    secondsField("translationSubmitRetrySeconds", "Translation submission retry", "Delay before retrying a failed translation-provider submission.", 30, 86400, 300, "5 min"),
    secondsField("translationInitialPollSeconds", "Initial provider poll", "Delay before the first status poll after a translation provider submission.", 30, 86400, 300, "5 min"),
    secondsField("translationPollIntervalSeconds", "Provider poll interval", "Delay between status polls while a translation provider operation is still in progress.", 30, 86400, 300, "5 min"),
    secondsField("translationResultRetrySeconds", "Translation result retry", "Delay before retrying application of a completed provider result. This is separate from provider polling.", 30, 86400, 300, "5 min"),
    integerField("translationSubmitMaxAttempts", "Translation submission attempts", "Maximum provider submission attempts for one translation batch.", "attempts", 1, 10, 3),
    integerField("translationMaxAutoRetries", "Translation automatic retries", "Maximum automatic retries after a translation operation fails.", "retries", 0, 10, 3),
    integerField("checkoutQueueGlobalConcurrency", "Checkout events", "Maximum simultaneous jobs across the fleet for checkout events.", "jobs across fleet", 1, 100, 10),
    integerField("orderQueueGlobalConcurrency", "Order events", "Maximum simultaneous jobs across the fleet for order events.", "jobs across fleet", 1, 100, 5),
    integerField("pendingRecoveryQueueGlobalConcurrency", "Pending recovery candidates", "Maximum simultaneous jobs across the fleet for pending recovery candidates.", "jobs across fleet", 1, 100, 10),
    integerField("recoveryResumeQueueGlobalConcurrency", "Recovery capacity resume", "Maximum simultaneous jobs across the fleet for recovery-capacity resume work.", "jobs across fleet", 1, 100, 10),
    integerField("whatsappQueueGlobalConcurrency", "WhatsApp events", "Maximum simultaneous jobs across the fleet for WhatsApp events.", "jobs across fleet", 1, 100, 20),
    integerField("merchantCommunicationsQueueGlobalConcurrency", "Merchant communications", "Maximum simultaneous jobs across the fleet for merchant communications.", "jobs across fleet", 1, 100, 10),
    integerField("billingSubscriptionQueueGlobalConcurrency", "Billing subscription reconcile", "Maximum simultaneous jobs across the fleet for billing subscription reconciliation.", "jobs across fleet", 1, 100, 10),
  ],
  ABUSE_PROTECTION: [
    integerField("rawSenderLimitPerMinute", "Sender limit — 1 minute", "Maximum incoming WhatsApp messages accepted from one sender during a one-minute window. Lower values provide stronger abuse protection but can suppress legitimate rapid conversations.", "messages", 1, 10000, 60),
    integerField("rawGlobalLimitPerMinute", "Global limit — 1 minute", "Maximum incoming WhatsApp messages accepted globally during a one-minute window.", "messages", 1, 1000000, 20000),
    integerField("turnSenderLimitPerMinute", "Sender limit — 1 minute", "Maximum conversation turns accepted from one sender during a one-minute window.", "turns", 1, 10000, 12),
    integerField("turnSenderLimitPerTenMinutes", "Sender limit — 10 minutes", "Maximum conversation turns accepted from one sender during a ten-minute window.", "turns", 1, 100000, 60),
    integerField("turnConversationLimitPerMinute", "Conversation limit — 1 minute", "Maximum conversation turns accepted in one conversation during a one-minute window.", "turns", 1, 10000, 12),
    integerField("turnConversationLimitPerTenMinutes", "Conversation limit — 10 minutes", "Maximum conversation turns accepted in one conversation during a ten-minute window.", "turns", 1, 100000, 60),
    integerField("turnShopLimitPerMinute", "Shop limit — 1 minute", "Maximum conversation turns accepted across one shop during a one-minute window.", "turns", 1, 100000, 600),
    integerField("turnGlobalLimitPerMinute", "Global limit — 1 minute", "Maximum conversation turns accepted globally during a one-minute window.", "turns", 1, 1000000, 5000),
    integerField("discoverySenderLimitPerMinute", "Sender limit — 1 minute", "Maximum new product-discovery turns accepted from one customer during a one-minute window. Lower values provide stronger abuse protection but can suppress legitimate rapid conversations.", "turns", 1, 10000, 4),
    integerField("discoverySenderLimitPerTenMinutes", "Sender limit — 10 minutes", "Maximum new product-discovery turns accepted from one customer during a ten-minute window.", "turns", 1, 100000, 12),
    integerField("discoveryConversationLimitPerMinute", "Conversation limit — 1 minute", "Maximum product-discovery turns accepted in one conversation during a one-minute window.", "turns", 1, 10000, 4),
    integerField("discoveryConversationLimitPerTenMinutes", "Conversation limit — 10 minutes", "Maximum product-discovery turns accepted in one conversation during a ten-minute window.", "turns", 1, 100000, 12),
  ],
};

export const ALL_RUNTIME_FIELDS = Object.values(RUNTIME_FIELDS).flat();
export const RUNTIME_FIELD_KEYS = ALL_RUNTIME_FIELDS.map(({ key }) => key);
export type RuntimeFieldKey = (typeof ALL_RUNTIME_FIELDS)[number]["key"];

const CROSS_FIELD_RULES: Array<[string, string, string]> = [
  ["conversationMaxSettleWindowMs", "conversationQuietWindowMs", "must be at least the wait-after-customer-message value"],
  ["shopifyUsageRetryMaxSeconds", "shopifyUsageRetryBaseSeconds", "must be at least the usage-event retry base"],
  ["rawGlobalLimitPerMinute", "rawSenderLimitPerMinute", "must be at least the sender limit"],
  ["turnSenderLimitPerTenMinutes", "turnSenderLimitPerMinute", "must be at least the one-minute sender limit"],
  ["turnConversationLimitPerTenMinutes", "turnConversationLimitPerMinute", "must be at least the one-minute conversation limit"],
  ["turnGlobalLimitPerMinute", "turnShopLimitPerMinute", "must be at least the shop limit"],
  ["turnShopLimitPerMinute", "turnSenderLimitPerMinute", "must be at least the sender limit"],
  ["discoverySenderLimitPerTenMinutes", "discoverySenderLimitPerMinute", "must be at least the one-minute sender limit"],
  ["discoveryConversationLimitPerTenMinutes", "discoveryConversationLimitPerMinute", "must be at least the one-minute conversation limit"],
];

const UPPER_BOUND_RULES: Array<[string, string, string]> = [
  ["discoverySenderLimitPerMinute", "turnSenderLimitPerMinute", "must not exceed the conversation-turn sender limit"],
  ["discoverySenderLimitPerTenMinutes", "turnSenderLimitPerTenMinutes", "must not exceed the conversation-turn sender limit"],
  ["discoveryConversationLimitPerMinute", "turnConversationLimitPerMinute", "must not exceed the conversation-turn limit"],
  ["discoveryConversationLimitPerTenMinutes", "turnConversationLimitPerTenMinutes", "must not exceed the conversation-turn limit"],
];

export function fieldsForSection(section: RuntimeSection): RuntimeField[] {
  return RUNTIME_FIELDS[section];
}

export function runtimeFieldDisplayValue(field: RuntimeField, storedValue: number): string {
  const value = field.displayMultiplier ? storedValue / field.displayMultiplier : storedValue;
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

export function runtimeFieldDisplayDefault(field: RuntimeField): string {
  return field.displayDefault ?? runtimeFieldDisplayValue(field, field.defaultValue);
}

export function runtimeFieldDisplayRange(field: RuntimeField): string {
  const min = field.displayMin ?? runtimeFieldDisplayValue(field, field.min);
  const max = field.displayMax ?? runtimeFieldDisplayValue(field, field.max);
  return `${min}–${max} ${field.displayUnit ?? field.unit}`;
}

export function runtimeFieldInputStep(field: RuntimeField): string {
  return field.displayStep ?? "1";
}

function parseInteger(value: unknown, label: string): number {
  if (typeof value !== "string" || !/^-?\d+$/.test(value.trim())) {
    throw new Error(`${label} must be a whole number.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${label} is invalid.`);
  return parsed;
}

function parseDisplayValue(field: RuntimeField, value: unknown): number {
  if (field.displayMultiplier) {
    if (typeof value !== "string" || !/^\d+(\.\d{1,3})?$/.test(value.trim())) {
      throw new Error(`${field.label} must be a valid number of seconds.`);
    }
    const parsed = Number(value) * field.displayMultiplier;
    if (!Number.isSafeInteger(parsed)) throw new Error(`${field.label} must resolve to whole milliseconds.`);
    return parsed;
  }
  return parseInteger(value, field.label);
}

export function validateRuntimeConfig(values: Record<string, number>): void {
  for (const field of ALL_RUNTIME_FIELDS) {
    const value = values[field.key];
    if (!Number.isSafeInteger(value) || value < field.min || value > field.max) {
      const min = field.displayMin ?? runtimeFieldDisplayValue(field, field.min);
      const max = field.displayMax ?? runtimeFieldDisplayValue(field, field.max);
      const unit = field.displayUnit ?? field.unit;
      throw new Error(`${field.label} must be between ${min} and ${max} ${unit}.`);
    }
  }
  for (const [left, right, message] of CROSS_FIELD_RULES) {
    if (values[left] < values[right]) {
      const field = ALL_RUNTIME_FIELDS.find(({ key }) => key === left);
      throw new Error(`${field?.label ?? left} ${message}.`);
    }
  }
  for (const [left, right, message] of UPPER_BOUND_RULES) {
    if (values[left] > values[right]) {
      const field = ALL_RUNTIME_FIELDS.find(({ key }) => key === left);
      throw new Error(`${field?.label ?? left} ${message}.`);
    }
  }
}

export function parseRuntimeControlsForm(
  formData: FormData,
  section: RuntimeSection,
  current: Record<string, number>,
): Record<string, number> {
  const values = { ...current };
  for (const field of fieldsForSection(section)) {
    values[field.key] = parseDisplayValue(field, formData.get(field.key));
  }
  validateRuntimeConfig(values);
  return values;
}

export function parseExpectedVersion(value: FormDataEntryValue | null): number {
  const version = parseInteger(value, "Expected version");
  if (version < 0) throw new Error("Expected version must be non-negative.");
  return version;
}

export function parseRuntimeSection(value: FormDataEntryValue | null): RuntimeSection {
  if (value === "OPERATIONAL" || value === "ADVANCED" || value === "ABUSE_PROTECTION") return value;
  throw new Error("A valid runtime controls section is required.");
}

export function parseReason(value: FormDataEntryValue | null): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("A reason is required.");
  const reason = value.trim();
  if (reason.length > 1000) throw new Error("Reason must be 1000 characters or fewer.");
  return reason;
}

export function defaultsForSection(section: RuntimeSection): Record<string, number> {
  return Object.fromEntries(fieldsForSection(section).map((field) => [field.key, field.defaultValue]));
}
