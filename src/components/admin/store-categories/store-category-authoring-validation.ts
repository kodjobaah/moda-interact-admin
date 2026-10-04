import {
  PROMPT_TEMPLATE_KEY_PATTERN,
  STORE_CATEGORY_SLUG_PATTERN,
} from "../../../lib/admin/store-category-validation.ts";
import type {
  StoreCategoryAuthoringSession,
  StoreCategoryAuthoringStep,
  StoreCategoryAuthoringValidation,
} from "./store-category-authoring-types.ts";

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
    categoryIssues.push(
      "Display name is required and must be at most 255 characters.",
    );
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
    templateIssues.push(
      "Template display name is required and must be at most 255 characters.",
    );
  }
  if (session.defaultTemplate.description.trim().length > 2000) {
    templateIssues.push("Template description must be at most 2,000 characters.");
  }
  if (promptText.length < 1 || promptText.length > 100_000) {
    templateIssues.push(
      "Canonical English prompt is required and must be at most 100,000 characters.",
    );
  }

  const mappingIssues: string[] = [];
  const seenTaxonomyIds = new Set<string>();
  for (const mapping of session.shopifyMappings) {
    const taxonomyId = mapping.shopifyTaxonomyCategoryId.trim();
    if (taxonomyId.length < 1 || taxonomyId.length > 255) {
      mappingIssues.push("Every Shopify taxonomy mapping needs a category ID.");
    }
    if (seenTaxonomyIds.has(taxonomyId)) {
      mappingIssues.push(
        `Shopify taxonomy category ${taxonomyId} is mapped more than once.`,
      );
    }
    seenTaxonomyIds.add(taxonomyId);
    if (
      !Number.isSafeInteger(mapping.weight) ||
      mapping.weight < 1 ||
      mapping.weight > 1_000_000
    ) {
      mappingIssues.push(
        "Every Shopify taxonomy mapping weight must be between 1 and 1,000,000.",
      );
    }
  }

  const auditIssues: string[] = [];
  const auditReason = session.auditReason.trim();
  if (auditReason.length < 1 || auditReason.length > 1000) {
    auditIssues.push(
      "Audit reason is required and must be at most 1,000 characters.",
    );
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
