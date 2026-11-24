import assert from "node:assert/strict";
import { test } from "node:test";
import type { Prisma } from "@prisma/client";
import { commonDefinition, commonRef } from "../fixtures/arch075-common-layout";
import { RECOVERY_SCENARIOS } from "../../src/lib/admin/whatsapp-templates/authoring/scenarios";
import { applyCommonLayoutChoice } from "../../src/lib/admin/whatsapp-templates/authoring/draft-operations";
import { assertCommonSourceGate } from "../../src/lib/admin/whatsapp-templates/common-activation/gates";
import { parseCommonSelection, COMMON_ACTIVATION_LIMITS } from "../../src/lib/admin/whatsapp-templates/common-activation/contracts";
import { previewDefaultReplacements } from "../../src/lib/admin/whatsapp-templates/common-activation/defaults";
import { PublicationError } from "../../src/lib/admin/whatsapp-templates/publishing/validation";
import { checkWrapperEligibility } from "../../src/lib/admin/whatsapp-templates/wrappers/eligibility";

const templateId = `wtdef_${"b".repeat(64)}`;
const historicalId = `wtdef_${"c".repeat(64)}`;
const templateName = "moda_follow_up_code_offer_fixture";
const reviewedAt = new Date("2026-11-24T12:00:00Z");
function gateFixture() {
  const wrapper = commonDefinition();
  wrapper.status = "PUBLISHED";
  wrapper.publishedAt = reviewedAt;
  const template = { id: templateId, kind: "META_RECOVERY", providerTemplateName: templateName,
    locales: wrapper.locales.map(locale => ({ languageTag: locale.languageTag, status: "REVIEWED",
      reviewedAt, reviewedByAdminId: "fixture-admin", localeAst: { authoring: { commonLayout: commonRef(locale.languageTag) } } })) };
  const reads: string[] = [];
  const state: { failure?: Error } = {};
  const tx = { whatsAppConversationWrapperActiveSlot: { findUnique: async () => ({ definitionId: wrapper.id, definition: wrapper }) },
    whatsAppTemplateDefinition: { findUnique: async ({ where }: { where: { id: string } }) => {
      reads.push(where.id);
      if (where.id === template.id) return template;
      if (state.failure) throw state.failure;
      if (where.id === wrapper.id) return wrapper;
      throw Error("Historical layout must not be read");
    } } } as unknown as Prisma.TransactionClient;
  return { tx, template, wrapper, reads, state };
}

test("historical revision is rejected before parsing or loading even a malformed historical reference", async () => {
  const { tx, template, wrapper, reads } = gateFixture();
  // One historical language in a mixed cohort must be detected before any wrapper load.
  template.locales.at(-1)!.localeAst.authoring.commonLayout = { definitionId: historicalId } as ReturnType<typeof commonRef>;
  await assert.rejects(assertCommonSourceGate(tx, templateId, "assignment"), (error: unknown) => {
    assert.ok(error instanceof PublicationError);
    assert.equal(error.code, "COORDINATED_ACTIVATION_REQUIRED");
    assert.equal(error.context?.definitionId, templateId);
    assert.equal(error.context?.providerTemplateName, templateName);
    assert.equal(error.context?.referencedCommonDefinitionId, historicalId);
    assert.equal(error.context?.activeCommonDefinitionId, wrapper.id);
    assert.match(error.message, /Clone.*active common layout/);
    return true;
  });
  assert.deepEqual(reads, [templateId]);
});

test("valid active references verify all 20 locales with one saved layout read", async () => {
  const { tx, wrapper, reads } = gateFixture();
  await assertCommonSourceGate(tx, templateId, "assignment");
  assert.deepEqual(reads, [templateId, wrapper.id]);
});

test("invalid active source reports exact composite profile field and retains the original error", async () => {
  const { tx, wrapper } = gateFixture();
  const english = wrapper.locales.find(locale => locale.languageTag === "en")!;
  delete english.localeAst.authoring.compositeProfile;
  const eligibility = checkWrapperEligibility(wrapper, "SHARED");
  assert.equal(eligibility.eligible, false);
  if (!eligibility.eligible) assert.match(eligibility.reason, /en: compositeProfile:.*saved composite profile/);
  await assert.rejects(assertCommonSourceGate(tx, templateId, "assignment"), (error: unknown) => {
    assert.ok(error instanceof PublicationError);
    assert.equal(error.code, "COMMON_LAYOUT_INVALID");
    assert.match(error.message, /compositeProfile/);
    assert.ok(error.cause instanceof Error);
    assert.equal(error.context?.activeCommonDefinitionId, wrapper.id);
    return true;
  });
});

test("matching revision cannot admit a different frozen locale identity", async () => {
  const { tx, template } = gateFixture();
  template.locales[0].localeAst.authoring.commonLayout = { ...template.locales[0].localeAst.authoring.commonLayout, localeId: "other-locale" };
  await assert.rejects(assertCommonSourceGate(tx, templateId, "assignment"), /snapshot differs/);
});

test("infrastructure failures retain original error instead of being reported as content validation", async () => {
  const { tx, state } = gateFixture();
  state.failure = new Error("database connection unavailable");
  await assert.rejects(assertCommonSourceGate(tx, templateId, "assignment"), (error: unknown) => error === state.failure);
});

test("clone changes only the common reference; UI metadata never becomes immutable source content", () => {
  const draft = { ...structuredClone(RECOVERY_SCENARIOS.find(item => item.draft.offerType === "CODE_OFFER")!.draft),
    shopBrandMediaRole: "SQUARE_LOGO" as const, commonLayout: { ...commonRef(), definitionId: historicalId } };
  const before = structuredClone(draft);
  const choice = { ...commonRef(), createdAt: reviewedAt.toISOString(), active: true };
  const changed = applyCommonLayoutChoice(draft, choice);
  assert.deepEqual(draft, before);
  assert.deepEqual(changed, { ...before, commonLayout: commonRef() });
  assert.ok(!("active" in changed.commonLayout!) && !("createdAt" in changed.commonLayout!));
});

test("configured defaults are explicit, canonical, bounded and cannot silently disappear from a review", async () => {
  const old = { commonDefinitionId: commonRef().definitionId, replacements: [] };
  assert.deepEqual(parseCommonSelection(old), old, "historical replay identity stays canonical");
  const requests = [{ defaultId: "default-b", definitionId: templateId }, { defaultId: "default-a", definitionId: templateId }];
  assert.deepEqual(parseCommonSelection({ ...old, defaultReplacements: requests }).defaultReplacements, [...requests].reverse());
  assert.throws(() => parseCommonSelection({ ...old, defaultReplacements: [requests[0], requests[0]] }), /exactly one/);
  assert.throws(() => parseCommonSelection({ ...old, defaultReplacements: [{ ...requests[0], wabaId: "1234" }] }), /Choose a replacement/);
  assert.throws(() => parseCommonSelection({ ...old, defaultReplacements: Array.from({ length: COMMON_ACTIVATION_LIMITS.defaults + 1 }, (_, i) => ({ defaultId: `default-${i}`, definitionId: templateId })) }), /twelve/);
  const db = { whatsAppRecoveryTemplateDefault: { findMany: async () => [{ id: "default-a" }] } } as unknown as Parameters<typeof previewDefaultReplacements>[0];
  await assert.rejects(previewDefaultReplacements(db, old, []), (error: unknown) => error instanceof PublicationError && error.code === "DEFAULT_COHORT_MISMATCH");
  const empty = { whatsAppRecoveryTemplateDefault: { findMany: async () => [] } } as unknown as Parameters<typeof previewDefaultReplacements>[0];
  assert.deepEqual(await previewDefaultReplacements(empty, old, []), []);
});
