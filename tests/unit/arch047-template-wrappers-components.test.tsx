import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { WrapperAudienceSelector } from "../../src/components/admin/whatsapp-templates/wrappers/wrapper-audience-selector.tsx";
import { WrapperActiveSlotSummary } from "../../src/components/admin/whatsapp-templates/wrappers/wrapper-active-slot-summary.tsx";
import { WrapperBeforeAfterPreview } from "../../src/components/admin/whatsapp-templates/wrappers/wrapper-before-after-preview.tsx";
import { WrapperActivationConfirmation } from "../../src/components/admin/whatsapp-templates/wrappers/wrapper-activation-confirmation.tsx";
import { checkWrapperEligibility } from "../../src/lib/admin/whatsapp-templates/wrappers/eligibility.ts";
import { wrapperRow, FIXTURE_ID } from "../fixtures/arch047-wrapper-fixture.ts";

const noop = () => {};
const slots = [
  { audience: "SHARED" as const, definitionId: FIXTURE_ID, editVersion: 3, updatedAt: "2026-10-25T12:00:00Z", effectiveDefinitionId: FIXTURE_ID, effectiveFrom: "SHARED" as const },
  { audience: "AI" as const, definitionId: null, editVersion: null, updatedAt: null, effectiveDefinitionId: FIXTURE_ID, effectiveFrom: "SHARED" as const },
  { audience: "HUMAN" as const, definitionId: null, editVersion: null, updatedAt: null, effectiveDefinitionId: FIXTURE_ID, effectiveFrom: "SHARED" as const },
];

test("audience buttons and fallback / audit history are accessible", () => {
  const html = renderToStaticMarkup(<><WrapperAudienceSelector selected="AI" onSelect={noop} />
    <WrapperActiveSlotSummary slots={slots} history={[{ createdAt: "2026-10-25T12:00:00Z", actorId: "a",
      audience: "SHARED", newDefinitionId: FIXTURE_ID, previousDefinitionId: null,
      editVersion: 3, reason: "Manual reviewed activation" }]} /></>);
  assert.equal((html.match(/aria-pressed=/g) ?? []).length, 3);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /Using SHARED fallback/);
  assert.match(html, /Activation history/);
  assert.match(html, /Manual reviewed activation/);
});

test("before/after preview shows header, response insertion, footer, conditional URL, nullable disclosures and first published", () => {
  const row = wrapperRow();
  const eligible = checkWrapperEligibility(row, "SHARED");
  assert.equal(eligible.eligible, true);
  if (!eligible.eligible) return;
  const proposal = { id: row.id, audience: "SHARED" as const, sourceHash: row.sourceHash,
    publishedAt: null, projections: eligible.projections };
  const html = renderToStaticMarkup(<WrapperBeforeAfterPreview current={proposal} proposed={proposal}
    languageTag="fr" checkoutAvailable={true} audience="AI" />);
  assert.match(html, /Currently effective/);
  assert.match(html, /Proposed activation/);
  assert.match(html, /Example AI reply/);
  assert.match(html, /Fictional example only/);
  assert.match(html, /Checkout conditional/);
  assert.match(html, /checkout\.url/);
  assert.match(html, /shopBrand\.coverImageUrl/);
  assert.match(html, /Nullable fields are unknown/);
  assert.match(html, /Not yet activated/);
  const noCheckout = renderToStaticMarkup(<WrapperBeforeAfterPreview current={null} proposed={proposal}
    languageTag="fr" checkoutAvailable={false} audience="HUMAN" />);
  assert.match(noCheckout, /Omitted — checkout unavailable or stale/);
  assert.doesNotMatch(noCheckout, /https:\/\/www\.example\.com\/checkout\/demo/);
});

test("confirmation requires deliberate review and reason; stale conflict disables action", () => {
  const base = { audience: "SHARED" as const, slot: slots[0], candidateId: FIXTURE_ID,
    eligible: true, busy: false, reason: "Reviewed all 20 languages", onReason: noop,
    confirmed: true, onConfirm: noop, onSubmit: noop, onRefresh: noop, conflict: false, message: null };
  const unchanged = renderToStaticMarkup(<WrapperActivationConfirmation {...base} />);
  assert.match(unchanged, /already directly active/);
  assert.match(unchanged, /disabled=""/);
  const stale = renderToStaticMarkup(<WrapperActivationConfirmation {...base} candidateId={`wtdef_${"b".repeat(64)}`}
    conflict={true} message="Refresh to compare" />);
  assert.match(stale, /Stale activation\/version conflict/);
  assert.match(stale, /role="alert"/);
  assert.match(stale, /disabled=""/);
});
