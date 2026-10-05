import type { CreateStoreCategoryBundleInput } from "../../../lib/admin/store-category-validation.ts";
import { isStoreCategoryTaxonomyReference } from "../../../lib/admin/store-category-taxonomy-reference.ts";
import {
  canEnterStoreCategoryAuthoringStep,
  isStoreCategoryReviewCurrent,
} from "./store-category-authoring-validation.ts";
import type {
  StoreCategoryAuthoringAction,
  StoreCategoryAuthoringSession,
} from "./store-category-authoring-types.ts";

export {
  canCreateStoreCategoryFromSession,
  canEnterStoreCategoryAuthoringStep,
  isStoreCategoryReviewCurrent,
  validateStoreCategoryAuthoringSession,
} from "./store-category-authoring-validation.ts";
export type {
  StoreCategoryAuthoringAction,
  StoreCategoryAuthoringMapping,
  StoreCategoryAuthoringSession,
  StoreCategoryAuthoringStatus,
  StoreCategoryAuthoringStep,
  StoreCategoryAuthoringValidation,
} from "./store-category-authoring-types.ts";

export const STORE_CATEGORY_AUTHORING_SCHEMA_VERSION = 2 as const;
export const STORE_CATEGORY_AUTHORING_STORAGE_KEY =
  "moda.admin.store-category-authoring.v2";

function createEmptyDefaultTemplate():
  StoreCategoryAuthoringSession["defaultTemplate"] {
  return {
    key: "",
    displayName: "",
    description: "",
    promptText: "",
  };
}

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
      referenceTaxonomy: null,
      slug: "",
      displayName: "",
      description: "",
      displayOrder: 0,
    },
    defaultTemplate: createEmptyDefaultTemplate(),
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

const DEFAULT_TEMPLATE_KEY_SUFFIX = "_default";

function suggestedDefaultTemplate(
  session: StoreCategoryAuthoringSession,
): Pick<
  StoreCategoryAuthoringSession["defaultTemplate"],
  "key" | "displayName"
> {
  const keyBaseLength = 128 - DEFAULT_TEMPLATE_KEY_SUFFIX.length;
  const keyBase = session.category.slug
    .trim()
    .replace(/-+/g, "_")
    .slice(0, keyBaseLength)
    .replace(/_+$/g, "");

  return {
    key: keyBase ? `${keyBase}${DEFAULT_TEMPLATE_KEY_SUFFIX}` : "",
    displayName: `${session.category.displayName.trim()} default`.slice(0, 255),
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
    case "category.reference.changed": {
      const next = changed(session, "category", action.now);
      return {
        ...next,
        category: { ...session.category, ...action.patch },
        defaultTemplate: createEmptyDefaultTemplate(),
        shopifyMappings: [],
        dirty: {
          ...next.dirty,
          defaultTemplate: false,
          shopifyMappings: false,
        },
      };
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
      if (!canEnterStoreCategoryAuthoringStep(session, action.step)) {
        return session;
      }
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
      if (action.step === "template" && !session.dirty.defaultTemplate) {
        return {
          ...session,
          step: action.step,
          defaultTemplate: {
            ...session.defaultTemplate,
            ...suggestedDefaultTemplate(session),
          },
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
      return {
        ...session,
        status: "SAVING",
        error: null,
        updatedAt: action.now,
      };
    case "save.failed":
      return {
        ...session,
        status: isStoreCategoryReviewCurrent(session) ? "READY" : "DRAFT",
        error: action.error,
        updatedAt: action.now,
      };
    case "save.succeeded":
      return {
        ...session,
        status: "COMPLETE",
        error: null,
        updatedAt: action.now,
      };
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
      !(
        candidate.reviewedRevision === null ||
        typeof candidate.reviewedRevision === "number"
      ) ||
      typeof candidate.auditReason !== "string" ||
      typeof candidate.updatedAt !== "string"
    ) {
      return null;
    }
    const session = candidate as StoreCategoryAuthoringSession;
    if (session.status === "COMPLETE") return null;

    // Readiness is derived from the reviewed configuration, not trusted from
    // persisted browser state. This keeps older/in-flight browser drafts from
    // leaving the Review screen visually current while the Create button is
    // silently disabled because a stale status value survived a refresh.
    return {
      ...session,
      status: isStoreCategoryReviewCurrent(session) ? "READY" : "DRAFT",
      error: null,
    };
  } catch {
    return null;
  }
}

export function createStoreCategoryBundlePayload(
  session: StoreCategoryAuthoringSession,
): CreateStoreCategoryBundleInput {
  const referenceTaxonomy = session.category.referenceTaxonomy;
  if (!isStoreCategoryTaxonomyReference(referenceTaxonomy)) {
    throw new Error("Store category reference taxonomy is incomplete.");
  }

  const shopifyMappings = session.shopifyMappings.map((mapping) => {
    if (!isStoreCategoryTaxonomyReference(mapping.taxonomy)) {
      throw new Error("Store category mapping taxonomy is incomplete.");
    }
    return { taxonomy: mapping.taxonomy, weight: mapping.weight };
  });

  return {
    category: {
      referenceTaxonomy,
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
    shopifyMappings,
    reason: session.auditReason.trim(),
  };
}
