import assert from "node:assert/strict";
import { test } from "node:test";
import { commonRef } from "../fixtures/arch075-common-layout.ts";
import { RECOVERY_SCENARIOS } from "../../src/lib/admin/whatsapp-templates/authoring/scenarios.ts";
import { compileTemplateAst } from "../../src/lib/admin/whatsapp-templates/authoring/compiler.ts";
import { validateTemplateAst } from "../../src/lib/admin/whatsapp-templates/authoring/validation.ts";
import type { MetaTemplateAst } from "../../src/lib/admin/whatsapp-templates/authoring/types.ts";

const draft = (): MetaTemplateAst => ({ ...structuredClone(RECOVERY_SCENARIOS[0].draft),
  commonLayout: commonRef(), shopBrandMediaRole: "LOGO", footer: [{ type: "text", value: "Reply STOP to opt out." }] });

test("common Meta BODY places the reviewed opt-out after the checkout link", () => {
  const input = draft();
  const prepared = compileTemplateAst(input);
  assert.equal(prepared.family, "META_RECOVERY");
  if (prepared.family !== "META_RECOVERY") return;
  const body = String(prepared.components.find(component => component.type === "BODY")?.text);
  assert.ok(body.endsWith("Reply STOP to opt out."));
  assert.match(body, /Continue when ready[^]*\{\{\d+\}\}\nReply STOP/);
  assert.equal(prepared.parameterBindings.body.filter(binding => binding.variable === "checkout.url").length, 1);
});

test("ordinary Meta BODY rejects parameters at either boundary before compilation", () => {
  for (const body of [
    [{ type: "variable", name: "shop.name" }, { type: "text", value: " has your basket." }],
    [{ type: "text", value: "Visit " }, { type: "variable", name: "checkout.url" }],
  ] as MetaTemplateAst["body"][]) {
    const input = { ...draft(), commonLayout: undefined, shopBrandMediaRole: undefined, body };
    assert.equal(validateTemplateAst(input).ok, false);
    assert.throws(() => compileTemplateAst(input), /BODY|body/);
  }
});

for (const side of ["leading", "trailing"] as const) {
  test(`${side} whitespace, punctuation and invisible formatting cannot hide a boundary parameter`, () => {
    for (const padding of ["", "  \n\t", ". — _*()", "\u200b\u2060\ufeff", "\u115f\u1160\u3164\uffa0", "12345"]) {
      const body: MetaTemplateAst["body"] = side === "leading"
        ? [{ type: "text", value: padding }, { type: "variable", name: "shop.name" }, { type: "text", value: " has your basket." }]
        : [{ type: "text", value: "Visit " }, { type: "variable", name: "checkout.url" }, { type: "text", value: padding }];
      const input = { ...draft(), commonLayout: undefined, shopBrandMediaRole: undefined, body };
      assert.equal(validateTemplateAst(input).ok, false, JSON.stringify(padding));
    }
  });
}

test("Unicode fixed text safely surrounding a variable remains valid without a variable-ratio rule", () => {
  for (const text of ["商店", "ร้าน", "店", "é", "가게", "العربية"]) {
    const input = { ...draft(), commonLayout: undefined, shopBrandMediaRole: undefined,
      body: [{ type: "text", value: text }, { type: "variable", name: "shop.name" }, { type: "text", value: text }] as MetaTemplateAst["body"] };
    assert.equal(validateTemplateAst(input).ok, true, text);
  }
});

test("common missing opt-out and invalid common header produce actionable final BODY issues", () => {
  assert.equal(validateTemplateAst({ ...draft(), footer: [] }).ok, false);
  assert.equal(validateTemplateAst({ ...draft(), footer: [{ type: "text", value: "..." }] }).ok, false);
});

import { readFileSync } from "node:fs";
import { layoutAst } from "../fixtures/arch075-common-layout.ts";
import { requireCommonLayout } from "../../src/lib/admin/whatsapp-templates/authoring/common-layout.ts";
import { templateHash } from "../../src/lib/admin/whatsapp-templates/authoring/identifiers.ts";
import { makeExamplePreview } from "../../src/lib/admin/whatsapp-templates/authoring/preview.ts";
import { INITIAL_REPLY_INSTRUCTIONS } from "../../src/lib/admin/whatsapp-templates/authoring/initial-reply-instructions.ts";
import { compileMetaLocale } from "../../src/lib/admin/whatsapp-templates/compilation/meta-compiler.ts";
import { makeMetaSubmissionPlan, type DefinitionForMeta, type LocaleForMeta } from "../../src/lib/admin/whatsapp-templates/meta/snapshot.ts";
import { META_LANGUAGES, expectedProviderLanguageCode } from "../../src/lib/admin/whatsapp-templates/meta/languages.ts";
import { localizedInitialCopy } from "../helpers/arch047-template-meta-fixture.ts";
import { VARIABLE_REGISTRY } from "../../src/lib/admin/whatsapp-templates/authoring/registry.ts";

const reviewed = JSON.parse(readFileSync("tests/fixtures/arch075-reviewed-meta-footers.json", "utf8")) as {
  fixtures: Array<{ scenario: string; languageTag: string; footer: MetaTemplateAst["footer"] }>;
};
function localizedCommon(languageTag: string) {
  const wrapper = layoutAst();
  // Reuse the reviewed localized "From" text; do not translate/inject runtime copy.
  wrapper.header[0] = { type: "text", value: INITIAL_REPLY_INSTRUCTIONS[languageTag as keyof typeof INITIAL_REPLY_INSTRUCTIONS].from };
  const prepared = compileTemplateAst(wrapper);
  assert.equal(prepared.family, "MODA_CONVERSATION_WRAPPER");
  return requireCommonLayout({ ...commonRef(languageTag), contentHash: templateHash(prepared), prepared });
}

test("all120 reviewed locale/scenario opt-outs remain exact in preview, confirmation and prepared components", () => {
  assert.equal(reviewed.fixtures.length, 120);
  assert.deepEqual(new Set(reviewed.fixtures.map(row => row.languageTag)), new Set(META_LANGUAGES));
  for (const scenario of RECOVERY_SCENARIOS) {
    const locales: LocaleForMeta[] = [];
    let english: MetaTemplateAst | undefined;
    for (const languageTag of META_LANGUAGES) {
      const row = reviewed.fixtures.find(row => row.scenario === scenario.id && row.languageTag === languageTag)!;
      assert.ok(row);
      const base = scenario.draft.stage === "INITIAL" ? localizedInitialCopy(scenario.draft, languageTag) : structuredClone(scenario.draft);
      const ast: MetaTemplateAst = { ...base, commonLayout: localizedCommon(languageTag), shopBrandMediaRole: "LOGO", footer: structuredClone(row.footer) };
      const candidate = compileMetaLocale(ast);
      const prepared = candidate.record.prepared;
      assert.equal(prepared.family, "META_RECOVERY");
      if (prepared.family !== "META_RECOVERY") throw new Error("Wrong family");
      const body = String(prepared.components.find(component => component.type === "BODY")?.text);
      const optOut = row.footer.map(node => node.value).join("");
      assert.ok(body.endsWith(optOut), `${scenario.id}/${languageTag}`);
      assert.equal(body.split(optOut).length - 1, 1);
      assert.equal(prepared.parameterBindings.body.filter(binding => binding.variable === "checkout.url").length, 1);
      assert.deepEqual(prepared.parameterBindings.body.map(binding => binding.position), prepared.parameterBindings.body.map((_, index) => index + 1));
      assert.equal(prepared.parameterBindings.headerMediaRole, "LOGO");
      const samples = prepared.parameterBindings.body.map(binding => VARIABLE_REGISTRY[binding.variable].sample);
      assert.deepEqual(prepared.components.find(component => component.type === "BODY")?.example, { body_text: [samples] });
      const rendered = prepared.parameterBindings.body.toReversed().reduce((text, binding) => text.replace(`{{${binding.position}}}`, VARIABLE_REGISTRY[binding.variable].sample), body);
      assert.equal(candidate.preview.body, rendered);
      assert.equal(candidate.contentHash, templateHash(compileTemplateAst(ast)));
      assert.deepEqual(candidate.preview, makeExamplePreview(prepared, ast.commonLayout));
      locales.push({ id: `locale-${languageTag}`, definitionId: `wtdef_${"b".repeat(64)}`, languageTag,
        providerLanguageCode: expectedProviderLanguageCode(languageTag), localeAst: candidate.record, contentHash: candidate.contentHash,
        status: languageTag === "en" ? "SOURCE_SAVED" : "REVIEWED", reviewedAt: languageTag === "en" ? null : new Date("2026-11-13T00:00:00Z"), reviewedByAdminId: languageTag === "en" ? null : "reviewer" });
      if (languageTag === "en") english = ast;
    }
    const definition: DefinitionForMeta = { id: `wtdef_${"b".repeat(64)}`, kind: "META_RECOVERY", purpose: scenario.draft.stage,
      offerType: scenario.draft.offerType, providerTemplateName: `moda_${scenario.id.toLowerCase()}_boundary`, category: "MARKETING",
      sourceHash: templateHash(english), sourceLanguageTag: "en", status: "SAVED" };
    const plan = makeMetaSubmissionPlan({ definition, locales, trustedWabaId: "123456789012" });
    for (const locale of plan.locales) {
      const stored = locales.find(row => row.languageTag === locale.languageTag)!;
      const record = stored.localeAst as { prepared: { components: unknown; parameterBindings: unknown } };
      assert.deepEqual(locale.components, record.prepared.components);
      assert.deepEqual(locale.bindings, record.prepared.parameterBindings);
      assert.equal(locale.contentHash, stored.contentHash);
    }
  }
});

import { commonMetaBody, historicalCommonMetaBody } from "../../src/lib/admin/whatsapp-templates/authoring/common-layout.ts";
import { prepareValidatedTemplateProjection } from "../../src/lib/admin/whatsapp-templates/authoring/projection.ts";
import { verifyFrozenTemplateProjection } from "../../src/lib/admin/whatsapp-templates/authoring/frozen-projection.ts";
import { frozenLocaleSnapshot } from "../../src/lib/admin/whatsapp-templates/meta/snapshot.ts";
import { cloneDraft } from "../../src/lib/admin/whatsapp-templates/authoring/draft-operations.ts";
import { makeTranslationSourceSnapshot } from "../../src/lib/admin/whatsapp-templates/translations/source-snapshot.ts";
import { preparedMetaBodyIssues } from "../../src/lib/admin/whatsapp-templates/authoring/meta-body.ts";

test("exact historical common order remains readable without rewriting hash or admitting a new submission", () => {
  const ast = draft();
  const prepared = prepareValidatedTemplateProjection(ast, historicalCommonMetaBody(ast));
  const hash = templateHash(prepared);
  const record = { schemaVersion: 1 as const, authoring: ast, prepared };
  const before = JSON.stringify(record);
  assert.equal(verifyFrozenTemplateProjection(record, hash), prepared);
  assert.ok(preparedMetaBodyIssues(prepared.family === "META_RECOVERY" ? prepared.components : []).length);
  const definition: DefinitionForMeta = { id: `wtdef_${"b".repeat(64)}`, kind: "META_RECOVERY", purpose: ast.stage,
    offerType: ast.offerType, providerTemplateName: "moda_initial_no_offer_historical", category: "MARKETING",
    sourceHash: templateHash(ast), sourceLanguageTag: "en", status: "PUBLISHED" };
  const locales: LocaleForMeta[] = META_LANGUAGES.map(languageTag => {
    const authoring = localizedInitialCopy(ast, languageTag);
    authoring.commonLayout = commonRef(languageTag);
    const saved = prepareValidatedTemplateProjection(authoring, historicalCommonMetaBody(authoring));
    return { id: `historic-${languageTag}`, definitionId: definition.id, languageTag,
      providerLanguageCode: expectedProviderLanguageCode(languageTag), localeAst: { schemaVersion: 1, authoring, prepared: saved },
      contentHash: templateHash(saved), status: "APPROVED", reviewedAt: new Date("2026-11-13T00:00:00Z"), reviewedByAdminId: "reviewer" };
  });
  const english = locales.find(locale => locale.languageTag === "en")!;
  assert.deepEqual(frozenLocaleSnapshot(english, definition).components, prepared.family === "META_RECOVERY" ? prepared.components : []);
  assert.throws(() => makeMetaSubmissionPlan({ definition, locales, trustedWabaId: "123456789012" }), /meaningful fixed text|clone/);
  assert.throws(() => verifyFrozenTemplateProjection(record, "a".repeat(64)), /integrity/);
  const tampered = structuredClone(record);
  if (tampered.prepared.family === "META_RECOVERY") tampered.prepared.parameterBindings.body[0].variable = "customer.firstName";
  assert.throws(() => verifyFrozenTemplateProjection(tampered, templateHash(tampered.prepared)), /mapping/);
  const sourceTamper = structuredClone(record);
  sourceTamper.authoring.body[0] = { type: "text", value: "Forged text" };
  assert.throws(() => verifyFrozenTemplateProjection(sourceTamper, hash), /mapping/);
  assert.equal(JSON.stringify(record), before);
  assert.throws(() => makeTranslationSourceSnapshot({ definitionId: definition.id, sourceHash: definition.sourceHash,
    sourceLanguageTag: "en", englishLocaleAst: record, englishContentHash: hash }), /Clone as New/);
  const cloned = cloneDraft(ast);
  const fresh = compileTemplateAst(cloned);
  assert.notEqual(templateHash(fresh), hash);
  assert.doesNotThrow(() => makeTranslationSourceSnapshot({ definitionId: definition.id, sourceHash: templateHash(cloned),
    sourceLanguageTag: "en", englishLocaleAst: { schemaVersion: 1, authoring: cloned, prepared: fresh }, englishContentHash: templateHash(fresh) }));
  assert.equal(JSON.stringify(record), before);
});

test("legacy ordinary valid projection is byte-identical; invalid legacy is display-only until corrected clone", () => {
  const valid = structuredClone(RECOVERY_SCENARIOS[0].draft);
  const before = prepareValidatedTemplateProjection(valid, valid.body);
  assert.deepEqual(compileTemplateAst(valid), before);
  const invalid = { ...valid, body: [{ type: "variable", name: "shop.name" }, { type: "text", value: " has a basket." }] as MetaTemplateAst["body"] };
  const old = prepareValidatedTemplateProjection(invalid, invalid.body);
  const record = { schemaVersion: 1 as const, authoring: invalid, prepared: old };
  assert.equal(verifyFrozenTemplateProjection(record, templateHash(old)), old);
  assert.throws(() => compileTemplateAst(cloneDraft(invalid)), /meaningful fixed text/);
  const fixed = cloneDraft(invalid);
  fixed.body.unshift({ type: "text", value: "Shop: " });
  assert.equal(compileTemplateAst(fixed).family, "META_RECOVERY");
});

test("common header itself needs meaningful fixed prefix; whitespace/static punctuation does not qualify", () => {
  for (const prefix of ["", "\n ", "───"] ) {
    const wrapper = layoutAst(); wrapper.header[0] = { type: "text", value: prefix };
    const prepared = compileTemplateAst(wrapper);
    const ref = requireCommonLayout({ ...commonRef(), contentHash: templateHash(prepared), prepared });
    const checked = validateTemplateAst({ ...draft(), commonLayout: ref });
    assert.equal(checked.ok, false);
    if (!checked.ok) assert.match(checked.issues[0].message, /common layout|shop header/);
  }
});

test("final1024characters and10parameters include all common fields and never truncate", () => {
  const input = draft();
  const emptyBody = { ...input, body: [] };
  const overhead = String(prepareValidatedTemplateProjection(emptyBody, commonMetaBody(emptyBody)).family === "META_RECOVERY"
    ? (prepareValidatedTemplateProjection(emptyBody, commonMetaBody(emptyBody)) as import("../../src/lib/admin/whatsapp-templates/authoring/types.ts").MetaPrepared).components.find(component => component.type === "BODY")?.text : "").length;
  const atLimit = { ...input, body: [{ type: "text", value: "x".repeat(1024 - overhead) }] } as MetaTemplateAst;
  assert.equal(validateTemplateAst(atLimit).ok, true);
  assert.equal(validateTemplateAst({ ...atLimit, body: [{ type: "text", value: "x".repeat(1025 - overhead) }] }).ok, false);
  const variables = (count: number): MetaTemplateAst => ({ ...input, body: Array.from({ length: count }, () => ({ type: "variable", name: "shop.name" })) });
  assert.equal(validateTemplateAst(variables(7)).ok, true); //2header+7body+1checkout
  assert.equal(validateTemplateAst(variables(8)).ok, false);
  assert.throws(() => compileTemplateAst(variables(8)), /10-parameter/);
});


test("common checkout binding is never duplicated or silently stripped", () => {
  const input = draft();
  input.body.push({ type: "variable", name: "checkout.url" });
  const before = JSON.stringify(input);
  const checked = validateTemplateAst(input);
  assert.equal(checked.ok, false);
  if (!checked.ok) assert.ok(checked.issues.some(issue => issue.message.includes("exactly once")));
  assert.equal(JSON.stringify(input), before);
});


test("the exact historical omitted empty TEXT-header binding remains readable without adding it", () => {
  const ast = structuredClone(RECOVERY_SCENARIOS[0].draft);
  const prepared = compileTemplateAst(ast);
  if (prepared.family !== "META_RECOVERY") throw new Error("Wrong family");
  delete prepared.parameterBindings.header;
  const record = { schemaVersion: 1 as const, authoring: ast, prepared };
  const before = JSON.stringify(record);
  assert.equal(verifyFrozenTemplateProjection(record, templateHash(prepared)), prepared);
  assert.equal(JSON.stringify(record), before);
  assert.equal(Object.hasOwn(prepared.parameterBindings, "header"), false);
});

import { loadPolicyModule, createComponentHarness } from "./helpers/commerce-model-policy-module-harness.mjs";
import * as draftOperations from "../../src/lib/admin/whatsapp-templates/authoring/draft-operations.ts";
import * as compiler from "../../src/lib/admin/whatsapp-templates/authoring/compiler.ts";
import * as previewFunctions from "../../src/lib/admin/whatsapp-templates/authoring/preview.ts";
import * as validation from "../../src/lib/admin/whatsapp-templates/authoring/validation.ts";

test("valid authoring hook uses the compiled common BODY preview rather than the invalid-draft fallback", () => {
  const input = draft();
  const prepared = compileTemplateAst(input);
  const h = createComponentHarness();
  const module = loadPolicyModule("src/components/admin/whatsapp-templates/authoring/use-template-authoring-draft.ts", {
    react: { ...h.react, useMemo: (factory: () => unknown) => factory() },
    "next/navigation": { useRouter: () => ({ push() {}, refresh() {} }) },
    "@/app/actions/whatsapp-template-authoring": { saveWhatsAppTemplateDraft() { throw new Error("No save in preview test"); } },
    "@/lib/admin/whatsapp-templates/authoring/draft-operations": draftOperations,
    "@/lib/admin/whatsapp-templates/authoring/compiler": compiler,
    "@/lib/admin/whatsapp-templates/authoring/preview": { ...previewFunctions, makeDraftExamplePreview() { throw new Error("Valid input must use compiled preview"); } },
    "@/lib/admin/whatsapp-templates/authoring/validation": validation,
  }, { workspaceRoot: process.cwd() }) as { useTemplateAuthoringDraft(source: unknown): unknown };
  const tree = h.render(() => h.jsxRuntime.jsx("preview", { controller: module.useTemplateAuthoringDraft({ id: `wtdef_${"b".repeat(64)}`, english: { schemaVersion: 1, authoring: input, prepared } }) }), {});
  const controller = tree.props.controller;
  assert.equal(controller.checked.ok, true);
  assert.equal(controller.preview.body, compileMetaLocale(input).preview.body);
  assert.ok(controller.preview.body.endsWith("Reply STOP to opt out."));
});

test("cloning an old invalid common source retains its body and becomes valid only after explicit layout selection", () => {
  const wrapper = layoutAst(); wrapper.header[0] = { type: "text", value: "" };
  const oldCommon = compileTemplateAst(wrapper);
  const oldReference = requireCommonLayout({ ...commonRef(), contentHash: templateHash(oldCommon), prepared: oldCommon });
  const input = { ...draft(), commonLayout: oldReference };
  const saved = prepareValidatedTemplateProjection(input, historicalCommonMetaBody(input));
  const h = createComponentHarness();
  const module = loadPolicyModule("src/components/admin/whatsapp-templates/authoring/use-template-authoring-draft.ts", {
    react: { ...h.react, useMemo: (factory: () => unknown) => factory() },
    "next/navigation": { useRouter: () => ({ push() {}, refresh() {} }) },
    "@/app/actions/whatsapp-template-authoring": { saveWhatsAppTemplateDraft() { throw new Error("No save in clone preview test"); } },
    "@/lib/admin/whatsapp-templates/authoring/draft-operations": draftOperations,
    "@/lib/admin/whatsapp-templates/authoring/compiler": compiler,
    "@/lib/admin/whatsapp-templates/authoring/preview": previewFunctions,
    "@/lib/admin/whatsapp-templates/authoring/validation": validation,
  }, { workspaceRoot: process.cwd() }) as { useTemplateAuthoringDraft(source: unknown): unknown };
  const source = { id: `wtdef_${"b".repeat(64)}`, english: { schemaVersion: 1, authoring: input, prepared: saved } };
  const render = () => h.render(() => h.jsxRuntime.jsx("preview", { controller: module.useTemplateAuthoringDraft(source) }), {}).props.controller;
  const first = render();
  assert.equal(first.checked.ok, false);
  assert.deepEqual(first.draft.body, input.body);
  assert.deepEqual(first.draft.footer, input.footer);
  first.updateDraft({ ...first.draft, commonLayout: commonRef() });
  const corrected = render();
  assert.equal(corrected.checked.ok, true);
  assert.deepEqual(corrected.draft.body, input.body);
  assert.deepEqual(corrected.draft.footer, input.footer);
  assert.ok(corrected.preview.body.endsWith("Reply STOP to opt out."));
  assert.deepEqual(source.english.authoring.commonLayout, oldReference);
});
