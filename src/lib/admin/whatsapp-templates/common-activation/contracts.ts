import type { CommonRecoveryLayoutReference } from "@modainteract/moda-interact-shared/commerce/presentation";
import type { ApprovedSource } from "../publishing/source";
import {
  isValidDefinitionId,
  isValidKey,
  reject,
} from "../publishing/validation";

export const COMMON_ACTIVATION_LIMITS = {
  definitions: 12,
  defaults: 12,
  shops: 50,
  targets: 1000,
  variants: 1000,
  bytes: 1024 * 1024,
} as const;
export type DefaultReplacementSelection = {
  defaultId: string;
  definitionId: string;
};
export type CommonActivationSelection = {
  commonDefinitionId: string;
  replacements: Array<{ definitionId: string; shopIds: string[] }>;
  defaultReplacements?: DefaultReplacementSelection[];
};
export type DefaultActivationImpact = {
  defaultId: string;
  wabaId: string;
  purpose: string;
  format: string;
  previousDefinitionId: string;
  previousTemplateName: string | null;
  previousUpdatedAt: string;
  source: Omit<ApprovedSource, "defaultLifecycle">;
  status: string;
  publishedAt: string | null;
  evidenceFingerprint: string;
};
export type CommonPointer = {
  definitionId: string;
  editVersion: number;
} | null;
export type CommonActivationPreview = {
  schemaVersion: 2;
  kind: "COMMON_RECOVERY_ACTIVATION";
  selection: CommonActivationSelection;
  issuedAt: string;
  fingerprint: string;
  wabaId: string;
  expectedSharedPointer: CommonPointer;
  commonRefs: CommonRecoveryLayoutReference[];
  definitions: Array<{
    source: ApprovedSource;
    shopIds: string[];
    registrationFacts: Array<{
      id: string;
      observedHash: string;
      reconciledAt: string;
    }>;
    englishReview: {
      localeId: string;
      contentHash: string;
      status: "SOURCE_SAVED" | "REVIEWED";
    };
  }>;
  shops: Array<{
    id: string;
    domain: string;
    status: string;
    platform: string;
    wooStatus: string | null;
  }>;
  variants: Array<{
    id: string;
    shopId: string;
    purpose: string;
    languageTag: string;
    registrationId: string;
    providerTemplateName: string;
    providerTemplateId: string | null;
    providerLanguageCode: string;
    updatedAt: string;
    previousRegistrationFingerprint: string;
    replacementDefinitionId: string;
    previousHeader: string;
    proposedHeader: string;
    promotionTarget: string;
    customerName: boolean;
  }>;
  audiencePointers: Array<{
    audience: string;
    definitionId: string;
    editVersion: number;
  }>;
  targetCount: number;
  missingScenarios: string[];
  // Optional only for historical v2 operation replay; every new preview supplies it.
  defaults?: DefaultActivationImpact[];
};
export type CommonActivationConfirmation = {
  selection: CommonActivationSelection;
  issuedAt: string;
  fingerprint: string;
  operationKey: string;
  reason: string;
  acknowledgeOverrides: true;
  consumerDeploymentConfirmed: true;
  englishContentReviewed: true;
};
export type CommonActivationResult = {
  operationId: string;
  replay: boolean;
  editVersion: number;
  targetCount: number;
};
export type CommonActivationSnapshot = {
  schemaVersion: 2;
  kind: "COMMON_RECOVERY_ACTIVATION";
  requestDigest: string;
  actorId: string;
  manifest: CommonActivationPreview;
  reason: string;
  acknowledgeOverrides: true;
  consumerDeploymentConfirmed: true;
  englishContentReviewed: true;
  editVersion: number;
};
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
export function parseCommonSelection(raw: unknown): CommonActivationSelection {
  if (
    !record(raw) ||
    ![
      "commonDefinitionId,replacements",
      "commonDefinitionId,defaultReplacements,replacements",
    ].includes(Object.keys(raw).sort().join()) ||
    !isValidDefinitionId(raw.commonDefinitionId) ||
    !Array.isArray(raw.replacements) ||
    raw.replacements.length > COMMON_ACTIVATION_LIMITS.definitions
  )
    return reject(
      "INPUT",
      "Choose a common revision and up to twelve existing format-specific scenario replacements.",
    );
  const replacements = raw.replacements
    .map((item) => {
      if (
        !record(item) ||
        Object.keys(item).sort().join() !== "definitionId,shopIds" ||
        !isValidDefinitionId(item.definitionId) ||
        !Array.isArray(item.shopIds) ||
        !item.shopIds.length ||
        item.shopIds.length > COMMON_ACTIVATION_LIMITS.shops ||
        !item.shopIds.every(isValidKey) ||
        new Set(item.shopIds).size !== item.shopIds.length
      )
        return reject(
          "INPUT",
          "Each replacement needs distinct existing shop assignments.",
        );
      return {
        definitionId: item.definitionId,
        shopIds: [...item.shopIds].sort(),
      };
    })
    .sort((a, b) => a.definitionId.localeCompare(b.definitionId));
  if (
    new Set(replacements.map((r) => r.definitionId)).size !==
      replacements.length ||
    new Set(replacements.flatMap((r) => r.shopIds)).size >
      COMMON_ACTIVATION_LIMITS.shops ||
    replacements.reduce((sum, r) => sum + r.shopIds.length * 20, 0) >
      COMMON_ACTIVATION_LIMITS.targets
  )
    return reject(
      "BOUNDED_SCOPE",
      "The complete activation exceeds its reviewed transaction bounds.",
    );
  if (!("defaultReplacements" in raw))
    return { commonDefinitionId: raw.commonDefinitionId, replacements };
  if (
    !Array.isArray(raw.defaultReplacements) ||
    raw.defaultReplacements.length > COMMON_ACTIVATION_LIMITS.defaults
  )
    return reject(
      "BOUNDED_SCOPE",
      "Review at most twelve configured platform defaults in one coordinated activation.",
    );
  const defaultReplacements = raw.defaultReplacements
    .map((item) => {
      if (
        !record(item) ||
        Object.keys(item).sort().join() !== "defaultId,definitionId" ||
        !isValidKey(item.defaultId) ||
        !isValidDefinitionId(item.definitionId)
      )
        return reject(
          "INPUT",
          "Choose a replacement for each configured platform default.",
        );
      return { defaultId: item.defaultId, definitionId: item.definitionId };
    })
    .sort((a, b) => a.defaultId.localeCompare(b.defaultId));
  if (
    new Set(defaultReplacements.map((item) => item.defaultId)).size !==
    defaultReplacements.length
  )
    return reject(
      "INPUT",
      "A platform default must have exactly one reviewed replacement.",
    );
  return {
    commonDefinitionId: raw.commonDefinitionId,
    replacements,
    defaultReplacements,
  };
}
export function assertSnapshotSize(value: unknown): void {
  if (
    Buffer.byteLength(JSON.stringify(value), "utf8") >
    COMMON_ACTIVATION_LIMITS.bytes
  )
    return reject(
      "BOUNDED_SCOPE",
      "The complete activation snapshot exceeds 1 MiB.",
    );
}

/** Coordinator rows cannot enter the legacy per-definition/page processor. */
export function readCommonActivationSnapshot(
  raw: unknown,
): CommonActivationSnapshot {
  if (
    !record(raw) ||
    Object.keys(raw).sort().join() !==
      "acknowledgeOverrides,actorId,consumerDeploymentConfirmed,editVersion,englishContentReviewed,kind,manifest,reason,requestDigest,schemaVersion" ||
    raw.schemaVersion !== 2 ||
    raw.kind !== "COMMON_RECOVERY_ACTIVATION" ||
    !isValidKey(raw.actorId) ||
    typeof raw.requestDigest !== "string" ||
    !/^[a-f0-9]{64}$/.test(raw.requestDigest) ||
    raw.acknowledgeOverrides !== true ||
    raw.consumerDeploymentConfirmed !== true ||
    raw.englishContentReviewed !== true ||
    typeof raw.reason !== "string" ||
    raw.reason.length < 10 ||
    raw.reason.length > 500 ||
    !Number.isSafeInteger(raw.editVersion) ||
    Number(raw.editVersion) < 1 ||
    !record(raw.manifest) ||
    raw.manifest.schemaVersion !== 2 ||
    raw.manifest.kind !== "COMMON_RECOVERY_ACTIVATION" ||
    typeof raw.manifest.fingerprint !== "string" ||
    !/^[a-f0-9]{64}$/.test(raw.manifest.fingerprint) ||
    !Array.isArray(raw.manifest.definitions) ||
    !Array.isArray(raw.manifest.variants) ||
    !Array.isArray(raw.manifest.commonRefs) ||
    !Array.isArray(raw.manifest.shops) ||
    !Array.isArray(raw.manifest.audiencePointers) ||
    raw.manifest.definitions.length > COMMON_ACTIVATION_LIMITS.definitions ||
    raw.manifest.variants.length > COMMON_ACTIVATION_LIMITS.variants ||
    (raw.manifest.defaults !== undefined &&
      (!Array.isArray(raw.manifest.defaults) ||
        raw.manifest.defaults.length > COMMON_ACTIVATION_LIMITS.defaults)) ||
    raw.manifest.shops.length > COMMON_ACTIVATION_LIMITS.shops ||
    raw.manifest.commonRefs.length !== 20 ||
    !Number.isSafeInteger(raw.manifest.targetCount) ||
    Number(raw.manifest.targetCount) < 0 ||
    Number(raw.manifest.targetCount) > COMMON_ACTIVATION_LIMITS.targets
  )
    return reject("INTEGRITY", "Invalid common activation snapshot.");
  parseCommonSelection(raw.manifest.selection);
  assertSnapshotSize(raw);
  return raw as unknown as CommonActivationSnapshot;
}
