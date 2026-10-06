import type { StoreCategoryTaxonomyReference } from "../../../lib/admin/store-category-taxonomy-reference.ts";

export type StoreCategoryAuthoringStep =
  | "category"
  | "mappings"
  | "template"
  | "review";

export type StoreCategoryAuthoringStatus =
  | "DRAFT"
  | "READY"
  | "SAVING"
  | "FAILED"
  | "COMPLETE";

export type StoreCategoryAuthoringMapping = {
  clientId: string;
  taxonomy: StoreCategoryTaxonomyReference | null;
  conditionKey: string;
  displayName: string;
  weight: number;
};

export type AssignedReferenceTaxonomyCategory = {
  categoryId: string;
  storeCategoryDisplayName: string;
};

export type StoreCategoryAuthoringSession = {
  schemaVersion: 3;
  sessionId: string;
  mode: "CREATE";
  step: StoreCategoryAuthoringStep;
  status: StoreCategoryAuthoringStatus;
  category: {
    referenceTaxonomy: StoreCategoryTaxonomyReference | null;
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
      type: "category.reference.changed";
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
