import {
  PROMPT_TEMPLATE_KEY_PATTERN,
  STORE_CATEGORY_SLUG_PATTERN,
  type CreateStoreCategoryBundleInput,
} from "../../../lib/admin/store-category-validation.ts";

export const STORE_CATEGORY_AUTHORING_SCHEMA_VERSION = 1 as const;
export const STORE_CATEGORY_AUTHORING_STORAGE_KEY =
  "moda.admin.store-category-authoring.v1";

export type StoreCategoryAuthoringStep =
  | "category"
  | "template"
  | "mappings"
  | "review";

export type StoreCategoryAuthoringStatus =
  | "DRAFT"
  | "READY"
  | "SAVING"
  | "FAILED"
  | "COMPLETE";

export type StoreCategoryAuthoringMapping = {
  clientId: string;
  shopifyTaxonomyCategoryId: string;
  weight: number;
};

export type StoreCategoryAuthoringSession = {
  schemaVersion: typeof STORE_CATEGORY_AUTHORING_SCHEMA_VERSION;
  sessionId: string;
  mode: "CREATE";
  step: StoreCategoryAuthoringStep;
  status: StoreCategoryAuthoringStatus;
  category: {
    slug: string;
    displayName: string;
    description: string;
    displayOrder: number;
  };
  defaultTemplate: {
    key: string;
    displayName: string;
    description: string;
    promptText: string;
  };
  shopifyMappings: StoreCategoryAuthoringMapping[];
  dirty: {
    category: boolean;
    defaultTemplate: boolean;
    shopifyMappings: boolean;
  };
  validationRevision: number;
  reviewedRevision: number | null;
  auditReason: string;
  error: string | null;
  updatedAt: string;
};

export type StoreCategoryAuthoringAction =
  | { type: "session.started"; sessionId: string; now: string }
  | { type: "session.restored"; session: StoreCategoryAuthoringSession | null }
  | { type: "session.discarded" }
  | {
      type: "category.changed";
      patch: Partial<StoreCategoryAuthoringSession["category"]>;
      now: string;
    }
  | {
      type: "template.changed";
      patch: Partial<StoreCategoryAuthoringSession["defaultTemplate"]>;
      now: string;
    }
  | {
      type: "mapping.added";
      mapping: StoreCategoryAuthoringMapping;
      now: string;
    }
  | {
      type: "mapping.changed";
      clientId: string;
      patch: Partial<Omit<StoreCategoryAuthoringMapping, "clientId">>;
      now: string;
    }
  | { type: "mapping.removed"; clientId: string; now: string }
  | { type: "step.changed"; step: StoreCategoryAuthoringStep; now: string }
  | { type: "audit.changed"; auditReason: string; now: string }
  | { type: "save.started"; now: string }
  | { type: "save.failed"; error: string; now: string }
  | { type: "save.succeeded"; now: string };

export type StoreCategoryAuthoringValidation = {
  category: { valid: boolean; issues: string[] };
  defaultTemplate: { valid: boolean; issues: string[] };
  shopifyMappings: { valid: boolean; issues: string[] };
  auditReason: { valid: boolean; issues: string[] };
};

export function createStoreCategoryAuthoringSession(
  sessionId: string,
  now: string,
): StoreCategoryAuthoringSession {
  return {
    schemaVersion: STORE_CATEGORY_AUTHORING_SCHEMA_VERSION,
    sessionId,
    mode: "CREATE",
    step: "category",
    status: "DRAFT",
    category: {
      slug: "",
      displayName: "",
      description: "",
      displayOrder: 0,
    },
    defaultTemplate: {
      key: "",
      displayName: "",
      description: "",
      promptText: "",
    },
    shopifyMappings: [],
    dirty: {
      category: false,
      defaultTemplate: false,
      shopifyMappings: false,
    },
    validationRevision: 0,
    reviewedRevision: null,
    auditReason: "",
    error: null,
    updatedAt: now,
  };
}

function changed(
  session: StoreCategoryAuthoringSession,
  section: keyof StoreCategoryAuthoringSession["dirty"],
  now: string,
): StoreCategoryAuthoringSession {
  return {
    ...session,
    status: "DRAFT",
    dirty: { ...session.dirty, [section]: true },
    validationRevision: session.validationRevision + 1,
    error: null,
    updatedAt: now,
  };
}

export function validateStoreCategoryAuthoringSession(
  session: StoreCategoryAuthoringSession,
): StoreCategoryAuthoringValidation {
  const categoryIssues: string[] = [];
  const slug = session.category.slug.trim();
  const displayName = session.category.displayName.trim();
  if (!STORE_CATEGORY_SLUG_PATTERN.test(slug)) {
    categoryIssues.push(
      "Stable slug must start with a letter and contain only lowercase letters, numbers, or hyphens.",
    );
  }
  if (displayName.length < 1 || displayName.length > 255) {
    categoryIssues.push("Display name is required and must be at most 255 characters.");
  }
  if (session.category.description.trim().length > 2000) {
    categoryIssues.push("Description must be at most 2,000 characters.");
  }
  if (
    !Number.isSafeInteger(session.category.displayOrder) ||
    session.category.displayOrder < 0 ||
    session.category.displayOrder > 1_000_000
  ) {
    categoryIssues.push("Display order must be between 0 and 1,000,000.");
  }

  const templateIssues: string[] = [];
  const templateKey = session.defaultTemplate.key.trim();
  const templateDisplayName = session.defaultTemplate.displayName.trim();
  const promptText = session.defaultTemplate.promptText.trim();
  if (!PROMPT_TEMPLATE_KEY_PATTERN.test(templateKey)) {
    templateIssues.push(
      "Template key must start with a letter and contain only lowercase letters, numbers, or underscores.",
    );
  }
  if (templateDisplayName.length < 1 || templateDisplayName.length > 255) {
    templateIssues.push("Template display name is required and must be at most 255 characters.");
  }
  if (session.defaultTemplate.description.trim().length > 2000) {
    templateIssues.push("Template description must be at most 2,000 characters.");
  }
  if (promptText.length < 1 || promptText.length > 100_000) {
    templateIssues.push("Canonical English prompt is required and must be at most 100,000 characters.");
  }

  const mappingIssues: string[] = [];
  const seenTaxonomyIds = new Set<string>();
  for (const mapping of session.shopifyMappings) {
    const taxonomyId = mapping.shopifyTaxonomyCategoryId.trim();
    if (taxonomyId.length < 1 || taxonomyId.length > 255) {
      mappingIssues.push("Every Shopify taxonomy mapping needs a category ID.");
    }
    if (seenTaxonomyIds.has(taxonomyId)) {
      mappingIssues.push(`Shopify taxonomy category ${taxonomyId} is mapped more than once.`);
    }
    seenTaxonomyIds.add(taxonomyId);
    if (
      !Number.isSafeInteger(mapping.weight) ||
      mapping.weight < 1 ||
      mapping.weight > 1_000_000
    ) {
      mappingIssues.push("Every Shopify taxonomy mapping weight must be between 1 and 1,000,000.");
    }
  }

  const auditIssues: string[] = [];
  const auditReason = session.auditReason.trim();
  if (auditReason.length < 1 || auditReason.length > 1000) {
    auditIssues.push("Audit reason is required and must be at most 1,000 characters.");
  }

  return {
    category: { valid: categoryIssues.length === 0, issues: categoryIssues },
    defaultTemplate: {
      valid: templateIssues.length === 0,
      issues: templateIssues,
    },
    shopifyMappings: {
      valid: mappingIssues.length === 0,
      issues: mappingIssues,
    },
    auditReason: { valid: auditIssues.length === 0, issues: auditIssues },
  };
}

export function canEnterStoreCategoryAuthoringStep(
  session: StoreCategoryAuthoringSession,
  step: StoreCategoryAuthoringStep,
): boolean {
  const validation = validateStoreCategoryAuthoringSession(session);
  if (step === "category") return true;
  if (step === "template") return validation.category.valid;
  if (step === "mappings") {
    return validation.category.valid && validation.defaultTemplate.valid;
  }
  return (
    validation.category.valid &&
    validation.defaultTemplate.valid &&
    validation.shopifyMappings.valid
  );
}

export function isStoreCategoryReviewCurrent(
  session: StoreCategoryAuthoringSession,
): boolean {
  return (
    session.reviewedRevision !== null &&
    session.reviewedRevision === session.validationRevision
  );
}

export function canCreateStoreCategoryFromSession(
  session: StoreCategoryAuthoringSession,
): boolean {
  const validation = validateStoreCategoryAuthoringSession(session);
  return (
    session.status === "READY" &&
    isStoreCategoryReviewCurrent(session) &&
    validation.category.valid &&
    validation.defaultTemplate.valid &&
    validation.shopifyMappings.valid &&
    validation.auditReason.valid
  );
}

export function storeCategoryAuthoringReducer(
  session: StoreCategoryAuthoringSession | null,
  action: StoreCategoryAuthoringAction,
): StoreCategoryAuthoringSession | null {
  if (action.type === "session.started") {
    return createStoreCategoryAuthoringSession(action.sessionId, action.now);
  }
  if (action.type === "session.restored") return action.session;
  if (action.type === "session.discarded") return null;
  if (!session) return session;

  switch (action.type) {
    case "category.changed": {
      const next = changed(session, "category", action.now);
      return { ...next, category: { ...session.category, ...action.patch } };
    }
    case "template.changed": {
      const next = changed(session, "defaultTemplate", action.now);
      return {
        ...next,
        defaultTemplate: { ...session.defaultTemplate, ...action.patch },
      };
    }
    case "mapping.added": {
      const next = changed(session, "shopifyMappings", action.now);
      return {
        ...next,
        shopifyMappings: [...session.shopifyMappings, action.mapping],
      };
    }
    case "mapping.changed": {
      const next = changed(session, "shopifyMappings", action.now);
      return {
        ...next,
        shopifyMappings: session.shopifyMappings.map((mapping) =>
          mapping.clientId === action.clientId
            ? { ...mapping, ...action.patch }
            : mapping,
        ),
      };
    }
    case "mapping.removed": {
      const next = changed(session, "shopifyMappings", action.now);
      return {
        ...next,
        shopifyMappings: session.shopifyMappings.filter(
          (mapping) => mapping.clientId !== action.clientId,
        ),
      };
    }
    case "step.changed": {
      if (!canEnterStoreCategoryAuthoringStep(session, action.step)) return session;
      if (action.step === "review") {
        return {
          ...session,
          step: action.step,
          status: "READY",
          reviewedRevision: session.validationRevision,
          error: null,
          updatedAt: action.now,
        };
      }
      return { ...session, step: action.step, updatedAt: action.now };
    }
    case "audit.changed":
      return {
        ...session,
        auditReason: action.auditReason,
        error: null,
        updatedAt: action.now,
      };
    case "save.started":
      return { ...session, status: "SAVING", error: null, updatedAt: action.now };
    case "save.failed":
      return {
        ...session,
        status: isStoreCategoryReviewCurrent(session) ? "READY" : "DRAFT",
        error: action.error,
        updatedAt: action.now,
      };
    case "save.succeeded":
      return { ...session, status: "COMPLETE", error: null, updatedAt: action.now };
    default:
      return session;
  }
}

export function restoreStoreCategoryAuthoringSession(
  raw: string | null,
): StoreCategoryAuthoringSession | null {
  if (!raw) return null;
  try {
    const candidate = JSON.parse(raw) as Partial<StoreCategoryAuthoringSession>;
    if (
      candidate.schemaVersion !== STORE_CATEGORY_AUTHORING_SCHEMA_VERSION ||
      candidate.mode !== "CREATE" ||
      typeof candidate.sessionId !== "string" ||
      !candidate.category ||
      !candidate.defaultTemplate ||
      !Array.isArray(candidate.shopifyMappings) ||
      !candidate.dirty ||
      typeof candidate.validationRevision !== "number" ||
      !(candidate.reviewedRevision === null || typeof candidate.reviewedRevision === "number") ||
      typeof candidate.auditReason !== "string" ||
      typeof candidate.updatedAt !== "string"
    ) {
      return null;
    }
    const session = candidate as StoreCategoryAuthoringSession;
    if (session.status === "COMPLETE") return null;
    if (session.status === "SAVING" || session.status === "FAILED") {
      return {
        ...session,
        status: isStoreCategoryReviewCurrent(session) ? "READY" : "DRAFT",
        error: null,
      };
    }
    return session;
  } catch {
    return null;
  }
}

export function createStoreCategoryBundlePayload(
  session: StoreCategoryAuthoringSession,
): CreateStoreCategoryBundleInput {
  return {
    category: {
      slug: session.category.slug.trim(),
      displayName: session.category.displayName.trim(),
      description: session.category.description.trim(),
      displayOrder: session.category.displayOrder,
    },
    defaultTemplate: {
      key: session.defaultTemplate.key.trim(),
      displayName: session.defaultTemplate.displayName.trim(),
      description: session.defaultTemplate.description.trim(),
      promptText: session.defaultTemplate.promptText.trim(),
    },
    shopifyMappings: session.shopifyMappings.map((mapping) => ({
      shopifyTaxonomyCategoryId: mapping.shopifyTaxonomyCategoryId.trim(),
      weight: mapping.weight,
    })),
    reason: session.auditReason.trim(),
  };
}
