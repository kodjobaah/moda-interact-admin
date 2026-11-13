import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { hasMetaProviderDrift, type MetaRegistrationView } from "../../src/lib/admin/whatsapp-templates/meta/contracts.ts";
import { observedMetaContentHash } from "../../src/lib/admin/whatsapp-templates/publishing/validation.ts";
import { templateHash } from "../../src/lib/admin/whatsapp-templates/authoring/identifiers.ts";
import { MetaApprovalSummary } from "../../src/components/admin/whatsapp-templates/meta/meta-approval-summary.tsx";
import { MetaDriftNotice } from "../../src/components/admin/whatsapp-templates/meta/meta-drift-notice.tsx";

const components = [
  { type: "HEADER", format: "TEXT", text: "Your shop" },
  { type: "BODY", text: "Hello {{1}}, your basket is ready.", example: { body_text: [["Example"]] } },
  { type: "BUTTONS", buttons: [{ type: "URL", text: "Return", url: "https://shop.example/checkout/" }] },
];
const providerHash = observedMetaContentHash(components);
const preparedHash = templateHash({ schemaVersion: 1, family: "META_RECOVERY", components, parameterBindings: { body: [{ position: 1, variable: "customer.firstName" }] } });
function row(patch: Partial<MetaRegistrationView> = {}): MetaRegistrationView {
  return { id: "fixture-registration", localeId: "fixture-locale", languageTag: "en", providerLanguageCode: "en", wabaId: "1234567890",
    submittedContentHash: preparedHash, expectedProviderContentHash: providerHash,
    submissionState: "SUBMITTED", providerStatus: "APPROVED", failureCode: null, providerTemplateId: "1234567891",
    lastSubmittedAt: "2026-11-13T00:00:00Z", nextRetryAt: null, lastReconciledAt: "2026-11-13T00:01:00Z",
    driftDetectedAt: null, lastObservedContentHash: providerHash, lastObservedCategory: "MARKETING", events: [], ...patch };
}

test("matching provider observation does not drift against a legitimately different prepared identity", () => {
  assert.notEqual(providerHash, preparedHash);
  assert.equal(hasMetaProviderDrift(row()), false);
  const status = { definitionId: "fixture-definition", registrations: [row()], updatedAt: "2026-11-13T00:02:00Z" };
  assert.equal(renderToStaticMarkup(<MetaDriftNotice status={status} />), "");
  const html = renderToStaticMarkup(<MetaApprovalSummary status={status} />);
  assert.match(html, /1<\/strong><span>Meta approved \/ no drift/);
  assert.match(html, /0<\/strong><span>Content drift/);
});

import { readMetaStatus } from "../../src/lib/admin/whatsapp-templates/meta/status.ts";
import { createComponentHarness, loadPolicyModule, elementText, findElement } from "./helpers/commerce-model-policy-module-harness.mjs";

async function projected(snapshot: unknown = components, patch: Partial<MetaRegistrationView> = {}) {
  const stored = { ...row(patch), componentsSnapshot: snapshot, parameterBindingsSnapshot: { private: "not in DTO" },
    locale: { languageTag: "en" }, lastSubmittedAt: new Date("2026-11-13T00:00:00Z"), nextRetryAt: null,
    lastReconciledAt: new Date("2026-11-13T00:01:00Z"), driftDetectedAt: patch.driftDetectedAt ? new Date(patch.driftDetectedAt) : null };
  const db = { whatsAppTemplateDefinition: { findUnique: async () => ({ id: "fixture", kind: "META_RECOVERY" }) },
    whatsAppTemplateMetaRegistration: { findMany: async (query: { take: number; include: { events: { take: number } } }) => {
      assert.equal(query.take, 21); assert.equal(query.include.events.take, 8); return [stored];
    } } } as unknown as Parameters<typeof readMetaStatus>[1]["db"];
  const principal = { id: "admin-fixture", role: "SUPER_ADMIN", developmentBypass: false } as Parameters<typeof readMetaStatus>[1]["principal"];
  return readMetaStatus(`wtdef_${"a".repeat(64)}`, { db, principal });
}

test("safe server DTO derives the canonical component hash without changing submitted identity or exposing JSON", async () => {
  const status = await projected();
  assert.equal(status.registrations[0].expectedProviderContentHash, providerHash);
  assert.equal(status.registrations[0].submittedContentHash, preparedHash);
  assert.equal(hasMetaProviderDrift(status.registrations[0]), false);
  const json = JSON.stringify(status);
  for (const text of ["componentsSnapshot", "parameterBindingsSnapshot", "Hello", "shop.example", "not in DTO"]) assert.ok(!json.includes(text));
});

test("BODY, HEADER and URL button changes remain genuine observed drift", async () => {
  const variants = [
    [{ ...components[0], text: "Changed shop" }, ...components.slice(1)],
    [components[0], { ...components[1], text: "Changed body" }, components[2]],
    [components[0], components[1], { type: "BUTTONS", buttons: [{ type: "URL", text: "Return", url: "https://other.example/" }] }],
  ];
  for (const changed of variants) {
    assert.equal(hasMetaProviderDrift(row({ lastObservedContentHash: observedMetaContentHash(changed) })), true);
    assert.equal(hasMetaProviderDrift((await projected(changed)).registrations[0]), true);
  }
});

test("submission-only examples do not create provider drift or change the server expected fingerprint", async () => {
  const changed = structuredClone(components);
  changed[1].example = { body_text: [["A different example"]] };
  assert.notEqual(templateHash(changed), templateHash(components));
  assert.equal(observedMetaContentHash(changed), providerHash);
  assert.equal(hasMetaProviderDrift((await projected(changed)).registrations[0]), false);
});

test("explicit drift, category changes and malformed/missing fingerprints fail closed", () => {
  for (const patch of [
    { driftDetectedAt: "2026-11-13T00:02:00Z" }, { driftDetectedAt: "" },
    { lastObservedCategory: "UTILITY" }, { lastObservedCategory: "" },
    { expectedProviderContentHash: null }, { expectedProviderContentHash: "bad" },
    { lastObservedContentHash: "bad" }, { lastObservedContentHash: "" },
  ]) assert.equal(hasMetaProviderDrift(row(patch)), true, JSON.stringify(patch));
});

test("malformed persisted components give an unavailable safe hash and never a permissive observed match", async () => {
  for (const malformed of [null, {}, [], [{ type: "BODY", text: 123 }], [{ type: "BODY", text: "" }],
    [{ type: "BODY", text: "Text" }, { type: "BODY", text: "Duplicate" }],
    [{ type: "HEADER", format: "IMAGE", url: "https://untrusted.example/" }, components[1]],
    [{ type: "BODY", text: "Text" }, { type: "BUTTONS", buttons: [{ type: "URL", text: "Bad" }] }]]) {
    const status = await projected(malformed);
    assert.equal(status.registrations[0].expectedProviderContentHash, null);
    assert.equal(hasMetaProviderDrift(status.registrations[0]), true);
  }
});

test("unobserved pending/uncertain states preserve independent approval and retry presentation", async () => {
  const pending = row({ providerStatus: null, providerTemplateId: null, submissionState: "READY_TO_SUBMIT",
    expectedProviderContentHash: null, lastObservedContentHash: null, lastObservedCategory: null });
  assert.equal(hasMetaProviderDrift(pending), false);
  const status = { definitionId: "fixture-definition", registrations: [pending], updatedAt: "2026-11-13T00:02:00Z" };
  assert.match(renderToStaticMarkup(<MetaApprovalSummary status={status} />), /0<\/strong><span>Meta approved \/ no drift/);
  const malformedUnobserved = (await projected(null, { lastObservedContentHash: null, lastObservedCategory: null })).registrations[0];
  assert.equal(hasMetaProviderDrift(malformedUnobserved), false);
});

test("client status table uses the same drift predicate while keeping retry lifecycle gates", () => {
  const h = createComponentHarness();
  const module = loadPolicyModule("src/components/admin/whatsapp-templates/meta/meta-locale-status-table.tsx", {
    react: h.react, "react/jsx-runtime": h.jsxRuntime,
    "@/app/actions/whatsapp-template-meta-control": { reconcileWhatsAppMetaTemplate() {}, retryWhatsAppMetaTechnicalSubmission() {} },
    "@/lib/admin/whatsapp-templates/meta/contracts": { hasMetaProviderDrift },
  }, { workspaceRoot: process.cwd() }) as { MetaLocaleStatusTable(props: Record<string, unknown>): unknown };
  const render = (registration: MetaRegistrationView) => h.render(module.MetaLocaleStatusTable, {
    status: { definitionId: "fixture", registrations: [registration], updatedAt: "fixture" }, selectedId: null, onSelect() {}, async onChanged() {},
  });
  assert.match(elementText(render(row())), /None reported/);
  assert.ok(!elementText(render(row())).includes("Request technical retry"));
  assert.match(elementText(render(row({ lastObservedCategory: "UTILITY" }))), /Mismatch/);
  const uncertain = row({ providerStatus: "UNKNOWN", providerTemplateId: null, submissionState: "SUBMISSION_UNCERTAIN",
    lastObservedContentHash: null, lastObservedCategory: null });
  assert.ok(findElement(render(uncertain), (element: { type: string; props: { children?: unknown } }) => element.type === "button" && elementText(element).includes("Request technical retry")));
  assert.ok(!elementText(render({ ...uncertain, driftDetectedAt: "2026-11-13T00:02:00Z" })).includes("Request technical retry"));
});
