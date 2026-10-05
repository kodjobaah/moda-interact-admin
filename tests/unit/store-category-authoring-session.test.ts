import assert from "node:assert/strict";
import test from "node:test";
import {
  canCreateStoreCategoryFromSession,
  createStoreCategoryAuthoringSession,
  restoreStoreCategoryAuthoringSession,
  storeCategoryAuthoringReducer,
  validateStoreCategoryAuthoringSession,
} from "../../src/components/admin/store-categories/store-category-authoring-session.ts";

const T0 = "2026-10-04T18:00:00.000Z";

const TOP_LEVEL = {
  source: "SHOPIFY_STANDARD_PRODUCT_TAXONOMY" as const,
  version: "2026-08",
  categoryId: "gid://shopify/TaxonomyCategory/aa",
  name: "Apparel & Accessories",
  fullName: "Apparel & Accessories",
};

const SUBCATEGORY = {
  source: "SHOPIFY_STANDARD_PRODUCT_TAXONOMY" as const,
  version: "2026-08",
  categoryId: "gid://shopify/TaxonomyCategory/aa-1",
  name: "Clothing",
  fullName: "Apparel & Accessories > Clothing",
};

function completeSession() {
  let session = createStoreCategoryAuthoringSession("session-1", T0);
  session = storeCategoryAuthoringReducer(session, {
    type: "category.changed",
    patch: {
      referenceTaxonomy: TOP_LEVEL,
      slug: "fashion-apparel",
      displayName: "Fashion & Apparel",
      description: "Clothing and accessories",
      displayOrder: 10,
    },
    now: T0,
  })!;
  session = storeCategoryAuthoringReducer(session, {
    type: "template.changed",
    patch: {
      key: "fashion_apparel_default",
      displayName: "Fashion default",
      description: "Default prompt",
      promptText: "Help customers with fashion questions.",
    },
    now: T0,
  })!;
  session = storeCategoryAuthoringReducer(session, {
    type: "step.changed",
    step: "review",
    now: T0,
  })!;
  session = storeCategoryAuthoringReducer(session, {
    type: "audit.changed",
    auditReason: "Initial category configuration",
    now: T0,
  })!;
  return session;
}

test("authoring session blocks progression until required category and default-template state is valid", () => {
  let session = createStoreCategoryAuthoringSession("session-1", T0);
  session = storeCategoryAuthoringReducer(session, {
    type: "step.changed",
    step: "template",
    now: T0,
  })!;
  assert.equal(session.step, "category");

  session = storeCategoryAuthoringReducer(session, {
    type: "category.changed",
    patch: {
      referenceTaxonomy: TOP_LEVEL,
      slug: "fashion-apparel",
      displayName: "Fashion & Apparel",
    },
    now: T0,
  })!;
  session = storeCategoryAuthoringReducer(session, {
    type: "step.changed",
    step: "template",
    now: T0,
  })!;
  assert.equal(session.step, "template");

  session = storeCategoryAuthoringReducer(session, {
    type: "step.changed",
    step: "review",
    now: T0,
  })!;
  assert.equal(session.step, "template");
});

test("entering the template step derives editable defaults from the selected category identity", () => {
  let session = createStoreCategoryAuthoringSession("session-1", T0);
  session = storeCategoryAuthoringReducer(session, {
    type: "category.changed",
    patch: {
      referenceTaxonomy: {
        ...TOP_LEVEL,
        categoryId: "gid://shopify/TaxonomyCategory/ap",
        name: "Animals & Pet Supplies",
        fullName: "Animals & Pet Supplies",
      },
      slug: "animals-pet-supplies",
      displayName: "Animals & Pet Supplies",
    },
    now: T0,
  })!;

  session = storeCategoryAuthoringReducer(session, {
    type: "step.changed",
    step: "template",
    now: T0,
  })!;

  assert.equal(session.defaultTemplate.key, "animals_pet_supplies_default");
  assert.equal(
    session.defaultTemplate.displayName,
    "Animals & Pet Supplies default",
  );
  assert.equal(session.dirty.defaultTemplate, false);

  session = storeCategoryAuthoringReducer(session, {
    type: "step.changed",
    step: "category",
    now: T0,
  })!;
  session = storeCategoryAuthoringReducer(session, {
    type: "category.changed",
    patch: {
      slug: "pet-care",
      displayName: "Pet Care",
    },
    now: T0,
  })!;
  session = storeCategoryAuthoringReducer(session, {
    type: "step.changed",
    step: "template",
    now: T0,
  })!;

  assert.equal(session.defaultTemplate.key, "pet_care_default");
  assert.equal(session.defaultTemplate.displayName, "Pet Care default");

  session = storeCategoryAuthoringReducer(session, {
    type: "template.changed",
    patch: {
      key: "pet_support_default",
      displayName: "Pet support default",
    },
    now: T0,
  })!;
  session = storeCategoryAuthoringReducer(session, {
    type: "step.changed",
    step: "category",
    now: T0,
  })!;
  session = storeCategoryAuthoringReducer(session, {
    type: "category.changed",
    patch: {
      slug: "animal-care",
      displayName: "Animal Care",
    },
    now: T0,
  })!;
  session = storeCategoryAuthoringReducer(session, {
    type: "step.changed",
    step: "template",
    now: T0,
  })!;

  assert.equal(session.defaultTemplate.key, "pet_support_default");
  assert.equal(session.defaultTemplate.displayName, "Pet support default");
  assert.equal(session.dirty.defaultTemplate, true);
});

test("changing the reference category resets the authored template and mappings for the previous category", () => {
  let session = createStoreCategoryAuthoringSession("session-1", T0);
  session = storeCategoryAuthoringReducer(session, {
    type: "category.reference.changed",
    patch: {
      referenceTaxonomy: TOP_LEVEL,
      slug: "apparel-accessories",
      displayName: "Apparel & Accessories",
    },
    now: T0,
  })!;
  session = storeCategoryAuthoringReducer(session, {
    type: "step.changed",
    step: "template",
    now: T0,
  })!;
  session = storeCategoryAuthoringReducer(session, {
    type: "template.changed",
    patch: {
      description: "Apparel prompt",
      promptText: "Help customers with apparel questions.",
    },
    now: T0,
  })!;
  session = storeCategoryAuthoringReducer(session, {
    type: "mapping.added",
    mapping: { clientId: "m1", taxonomy: SUBCATEGORY, weight: 2 },
    now: T0,
  })!;
  session = storeCategoryAuthoringReducer(session, {
    type: "step.changed",
    step: "category",
    now: T0,
  })!;

  const previousRevision = session.validationRevision;
  session = storeCategoryAuthoringReducer(session, {
    type: "category.reference.changed",
    patch: {
      referenceTaxonomy: {
        ...TOP_LEVEL,
        categoryId: "gid://shopify/TaxonomyCategory/ap",
        name: "Animals & Pet Supplies",
        fullName: "Animals & Pet Supplies",
      },
      slug: "animals-pet-supplies",
      displayName: "Animals & Pet Supplies",
    },
    now: "2026-10-04T18:03:00.000Z",
  })!;

  assert.equal(
    session.category.referenceTaxonomy?.categoryId,
    "gid://shopify/TaxonomyCategory/ap",
  );
  assert.equal(session.category.slug, "animals-pet-supplies");
  assert.equal(session.category.displayName, "Animals & Pet Supplies");
  assert.deepEqual(session.defaultTemplate, {
    key: "",
    displayName: "",
    description: "",
    promptText: "",
  });
  assert.deepEqual(session.shopifyMappings, []);
  assert.equal(session.dirty.category, true);
  assert.equal(session.dirty.defaultTemplate, false);
  assert.equal(session.dirty.shopifyMappings, false);
  assert.equal(session.validationRevision, previousRevision + 1);
  assert.equal(session.status, "DRAFT");

  session = storeCategoryAuthoringReducer(session, {
    type: "step.changed",
    step: "template",
    now: "2026-10-04T18:04:00.000Z",
  })!;
  assert.equal(session.defaultTemplate.key, "animals_pet_supplies_default");
  assert.equal(
    session.defaultTemplate.displayName,
    "Animals & Pet Supplies default",
  );
});

test("review readiness becomes stale whenever reviewed category configuration changes", () => {
  let session = completeSession();
  assert.equal(session.status, "READY");
  assert.equal(canCreateStoreCategoryFromSession(session), true);
  const reviewedRevision = session.reviewedRevision;

  session = storeCategoryAuthoringReducer(session, {
    type: "template.changed",
    patch: { promptText: "Changed prompt" },
    now: "2026-10-04T18:01:00.000Z",
  })!;
  assert.equal(session.status, "DRAFT");
  assert.equal(session.reviewedRevision, reviewedRevision);
  assert.notEqual(session.reviewedRevision, session.validationRevision);
  assert.equal(canCreateStoreCategoryFromSession(session), false);

  session = storeCategoryAuthoringReducer(session, {
    type: "step.changed",
    step: "review",
    now: "2026-10-04T18:02:00.000Z",
  })!;
  assert.equal(session.status, "READY");
  assert.equal(canCreateStoreCategoryFromSession(session), true);
});

test("category mappings are optional but every supplied mapping must be complete and unique", () => {
  let session = completeSession();
  assert.equal(validateStoreCategoryAuthoringSession(session).shopifyMappings.valid, true);

  session = storeCategoryAuthoringReducer(session, {
    type: "mapping.added",
    mapping: { clientId: "m1", taxonomy: null, weight: 1 },
    now: T0,
  })!;
  assert.equal(validateStoreCategoryAuthoringSession(session).shopifyMappings.valid, false);

  session = storeCategoryAuthoringReducer(session, {
    type: "mapping.changed",
    clientId: "m1",
    patch: { taxonomy: SUBCATEGORY },
    now: T0,
  })!;
  session = storeCategoryAuthoringReducer(session, {
    type: "mapping.added",
    mapping: {
      clientId: "m2",
      taxonomy: SUBCATEGORY,
      weight: 2,
    },
    now: T0,
  })!;
  assert.equal(validateStoreCategoryAuthoringSession(session).shopifyMappings.valid, false);
});

test("browser session restoration rejects incompatible state and derives readiness from the reviewed revision", () => {
  assert.equal(restoreStoreCategoryAuthoringSession("{}"), null);
  const session = completeSession();

  for (const persistedStatus of ["SAVING", "FAILED", "DRAFT"] as const) {
    const restored = restoreStoreCategoryAuthoringSession(
      JSON.stringify({ ...session, status: persistedStatus }),
    );
    assert.equal(restored?.status, "READY");
    assert.equal(restored?.sessionId, "session-1");
    assert.equal(restored && canCreateStoreCategoryFromSession(restored), true);
  }
});

test("creation readiness is derived from validation and the current review rather than a stale browser status", () => {
  const session = completeSession();
  const staleStatus = { ...session, status: "DRAFT" as const };

  assert.equal(staleStatus.reviewedRevision, staleStatus.validationRevision);
  assert.equal(canCreateStoreCategoryFromSession(staleStatus), true);
});
