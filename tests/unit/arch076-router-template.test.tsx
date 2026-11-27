import { verifyFrozenTemplateProjection } from "../../src/lib/admin/whatsapp-templates/authoring/frozen-projection.ts";
import { makeDraftExamplePreview } from "../../src/lib/admin/whatsapp-templates/authoring/preview.ts";
import { templateHash } from "../../src/lib/admin/whatsapp-templates/authoring/identifiers.ts";
import { resolveWrapperSlots } from "../../src/lib/admin/whatsapp-templates/wrappers/slot-resolution.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  newWrapperDraft,
  setWrapperAudience,
} from "../../src/lib/admin/whatsapp-templates/authoring/draft-operations.ts";
import { validateTemplateAst } from "../../src/lib/admin/whatsapp-templates/authoring/validation.ts";
import { eligibleVariables } from "../../src/lib/admin/whatsapp-templates/authoring/registry.ts";
import { compileTemplateAst } from "../../src/lib/admin/whatsapp-templates/authoring/compiler.ts";
import { checkWrapperEligibility } from "../../src/lib/admin/whatsapp-templates/wrappers/eligibility.ts";
import { renderWrapperPreview } from "../../src/lib/admin/whatsapp-templates/wrappers/preview.ts";
import { WrapperBeforeAfterPreview } from "../../src/components/admin/whatsapp-templates/wrappers/wrapper-before-after-preview.tsx";
import { WrapperStructureEditor } from "../../src/components/admin/whatsapp-templates/authoring/wrapper-structure-editor.tsx";
import { WrapperActiveSlotSummary } from "../../src/components/admin/whatsapp-templates/wrappers/wrapper-active-slot-summary.tsx";
import {
  wrapperRow,
  brandedWrapper,
} from "../fixtures/arch047-wrapper-fixture.ts";

const draft = () => ({
  ...newWrapperDraft("ROUTER"),
  header: [{ type: "text" as const, value: "How can we help?" }],
  footer: [
    {
      type: "text" as const,
      value: "Reply to the store's message to select it.",
    },
  ],
});
test("neutral router compiles and all 20 reviewed locales are eligible without Shared changes", () => {
  const ast = draft();
  assert.equal(validateTemplateAst(ast).ok, true);
  assert.deepEqual(eligibleVariables(ast), []);
  const checked = checkWrapperEligibility(
    wrapperRow({ audience: "ROUTER", ast }),
    "ROUTER",
  );
  assert.equal(checked.eligible, true);
  if (checked.eligible)
    assert.equal(Object.keys(checked.projections).length, 20);
});
test("router refuses variables in every section, every conditional, media, hashes, and extra or missing slots", () => {
  for (const section of ["header", "body", "footer"] as const)
    for (const name of [
      "shop.name",
      "shop.websiteUrl",
      "shop.categoryName",
      "shopBrand.logoUrl",
      "customer.firstName",
      "checkout.url",
      "checkout.itemsSummary",
      "offer.code",
      "promotion.productName",
    ]) {
      const ast = structuredClone(draft()) as unknown as Record<
        string,
        unknown
      >;
      ast[section] = [
        ...(ast[section] as unknown[]),
        { type: "variable", name },
      ];
      assert.equal(validateTemplateAst(ast).ok, false, `${section}: ${name}`);
    }
  for (const patch of [
    { conditionals: [{ when: "checkout.available", nodes: [] }] },
    {
      productImage: {
        variable: "response.productImage",
        placement: "BEFORE_BODY",
        optional: true,
      },
    },
    { compositeProfile: newWrapperDraft("SHARED").compositeProfile },
    { compositeProfileSha256: "a".repeat(64) },
    { body: [] },
    { header: [{ type: "slot", name: "response.body" }] },
    { footer: [{ type: "text", value: "{{shop.name}}" }] },
    {
      body: [
        { type: "slot", name: "response.body" },
        { type: "slot", name: "response.body" },
      ],
    },
  ])
    assert.equal(validateTemplateAst({ ...draft(), ...patch }).ok, false);
  const unsafe = brandedWrapper("AI");
  const switched = setWrapperAudience(unsafe, "ROUTER");
  assert.deepEqual(
    switched.header,
    unsafe.header,
    "audience selection never silently strips unsafe content",
  );
  assert.equal(validateTemplateAst(switched).ok, false);
});
test("router refuses tampered reviewed projections, review gaps and inactive definitions", () => {
  for (const mutate of [
    (row: ReturnType<typeof wrapperRow>) => {
      row.retiredAt = new Date();
    },
    (row: ReturnType<typeof wrapperRow>) => {
      row.locales.pop();
    },
    (row: ReturnType<typeof wrapperRow>) => {
      row.locales[1].reviewedAt = null;
    },
    (row: ReturnType<typeof wrapperRow>) => {
      (
        row.locales[1].localeAst as { prepared: { header: unknown[] } }
      ).prepared.header.push({ kind: "variable", name: "shop.name" });
    },
    (row: ReturnType<typeof wrapperRow>) => {
      (
        row.locales[1].localeAst as { prepared: Record<string, unknown> }
      ).prepared.compositeProfileSha256 = "a".repeat(64);
    },
  ]) {
    const row = wrapperRow({ audience: "ROUTER", ast: draft() });
    mutate(row);
    assert.equal(checkWrapperEligibility(row, "ROUTER").eligible, false);
  }
});
test("neutral preview and editor expose no tenant fixtures, palette, media or checkout controls", () => {
  const ast = draft();
  const row = wrapperRow({ audience: "ROUTER", ast });
  const checked = checkWrapperEligibility(row, "ROUTER");
  assert.equal(checked.eligible, true);
  if (!checked.eligible) return;
  const definition = {
    id: row.id,
    audience: "ROUTER" as const,
    sourceHash: row.sourceHash,
    publishedAt: null,
    projections: checked.projections,
  };
  const html = renderToStaticMarkup(
    <>
      <WrapperBeforeAfterPreview
        audience="ROUTER"
        current={null}
        proposed={definition}
        languageTag="en"
        checkoutAvailable
      />
      <WrapperStructureEditor draft={ast} onChange={() => {}} />
    </>,
  );
  assert.match(html, /Neutral router example/);
  assert.match(html, /Which store is your question about/);
  assert.doesNotMatch(
    html,
    /Example Brand|example\.com|Customer&#x27;s first|Include checkout-aware message|Optional product image/,
  );
  const result = renderWrapperPreview(compileTemplateAst(ast) as never, {
    response: "Which store?",
    checkoutAvailable: true,
    context: { kind: "NEUTRAL" },
  });
  assert.equal(result.conditional, null);
  assert.deepEqual(result.disclosures, []);
  assert.throws(
    () =>
      renderWrapperPreview(compileTemplateAst(brandedWrapper("AI")) as never, {
        response: "?",
        checkoutAvailable: false,
        context: { kind: "NEUTRAL" },
      }),
    /unsafe router/,
  );
  const status = renderToStaticMarkup(
    <WrapperActiveSlotSummary
      history={[]}
      slots={[
        {
          audience: "ROUTER",
          definitionId: null,
          editVersion: null,
          updatedAt: null,
          effectiveDefinitionId: null,
          effectiveFrom: null,
        },
        {
          audience: "ROUTER",
          definitionId: row.id,
          editVersion: 1,
          updatedAt: null,
          effectiveDefinitionId: row.id,
          effectiveFrom: "ROUTER",
          refusalReason: "Hash mismatch",
        },
      ]}
    />,
  );
  assert.match(status, /Not configured/);
  assert.match(status, /Configured template refused: Hash mismatch/);
});

test("router absence never falls back, and invalid configured pointers remain explicit refusals", () => {
  const ai = wrapperRow({ audience: "AI" });
  const pointer = {
    audience: "SHARED",
    definitionId: ai.id,
    editVersion: 1,
    updatedAt: new Date(),
  };
  const slots = resolveWrapperSlots([pointer], [ai]);
  const absent = slots.find((slot) => slot.audience === "ROUTER")!;
  assert.equal(absent.effectiveDefinitionId, null);
  assert.equal(absent.refusalReason, null);
  assert.equal(
    slots.find((slot) => slot.audience === "AI")!.effectiveFrom,
    "SHARED",
  );
  const bad = resolveWrapperSlots(
    [pointer, { ...pointer, audience: "ROUTER" }],
    [ai],
  ).find((slot) => slot.audience === "ROUTER")!;
  assert.equal(bad.effectiveFrom, "ROUTER");
  assert.match(bad.refusalReason!, /selected audience/);
  const missing = resolveWrapperSlots(
    [{ ...pointer, audience: "ROUTER" }],
    [],
  ).find((slot) => slot.audience === "ROUTER")!;
  assert.match(missing.refusalReason!, /missing or unavailable/);
});

test("draft preview never substitutes tenant samples and immutable review rejects unsafe prepared payloads", () => {
  const unsafe = setWrapperAudience(brandedWrapper("AI"), "ROUTER");
  const preview = makeDraftExamplePreview(unsafe);
  assert.doesNotMatch(JSON.stringify(preview), /Example Brand|example.com/);
  const ast = draft();
  const prepared = compileTemplateAst(ast);
  const record = { schemaVersion: 1 as const, authoring: ast, prepared };
  assert.deepEqual(
    verifyFrozenTemplateProjection(record, templateHash(prepared)),
    prepared,
  );
  const tampered = {
    ...prepared,
    productImage: {
      variable: "response.productImage",
      placement: "BEFORE_BODY",
      optional: true,
    },
  };
  assert.throws(
    () =>
      verifyFrozenTemplateProjection(
        { ...record, prepared: tampered as never },
        templateHash(tampered),
      ),
    /not neutral/,
  );
});
