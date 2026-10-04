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

function completeSession() {
  let session = createStoreCategoryAuthoringSession("session-1", T0);
  session = storeCategoryAuthoringReducer(session, {
    type: "category.changed",
    patch: {
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
    patch: { slug: "fashion-apparel", displayName: "Fashion & Apparel" },
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

test("Shopify mappings are optional but every supplied mapping must be valid and unique", () => {
  let session = completeSession();
  assert.equal(validateStoreCategoryAuthoringSession(session).shopifyMappings.valid, true);

  session = storeCategoryAuthoringReducer(session, {
    type: "mapping.added",
    mapping: { clientId: "m1", shopifyTaxonomyCategoryId: "", weight: 1 },
    now: T0,
  })!;
  assert.equal(validateStoreCategoryAuthoringSession(session).shopifyMappings.valid, false);

  session = storeCategoryAuthoringReducer(session, {
    type: "mapping.changed",
    clientId: "m1",
    patch: { shopifyTaxonomyCategoryId: "gid://shopify/TaxonomyCategory/aa" },
    now: T0,
  })!;
  session = storeCategoryAuthoringReducer(session, {
    type: "mapping.added",
    mapping: {
      clientId: "m2",
      shopifyTaxonomyCategoryId: "gid://shopify/TaxonomyCategory/aa",
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
