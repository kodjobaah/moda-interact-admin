import assert from "node:assert/strict";
import { test } from "node:test";
import { commonRef, templateHash } from "../fixtures/arch075-common-layout.ts";
import { RECOVERY_SCENARIOS } from "../../src/lib/admin/whatsapp-templates/authoring/scenarios.ts";
import { makeImmutableAuthoringRecord } from "../../src/lib/admin/whatsapp-templates/authoring/compiler.ts";
import { validateTemplateAst } from "../../src/lib/admin/whatsapp-templates/authoring/validation.ts";
import { splitInitialReplyBody, standaloneInitialReplyText } from "../../src/lib/admin/whatsapp-templates/authoring/initial-reply-instructions.ts";
import type { ContentNode, MetaTemplateAst } from "../../src/lib/admin/whatsapp-templates/authoring/types.ts";
import { makeTranslationSourceSnapshot } from "../../src/lib/admin/whatsapp-templates/translations/source-snapshot.ts";
import { sourceLocations } from "../../src/lib/admin/whatsapp-templates/compilation/locations.ts";
import { reconstructAndCompile } from "../../src/lib/admin/whatsapp-templates/compilation/reconstruction.ts";
import { REVIEW_LANGUAGES, providerLanguageCode } from "../../src/lib/admin/whatsapp-templates/compilation/language-codes.ts";
import { frozenLocaleSnapshot } from "../../src/lib/admin/whatsapp-templates/meta/snapshot.ts";
import { approvedSource } from "../../src/lib/admin/whatsapp-templates/publishing/source.ts";
import { observedMetaContentHash } from "../../src/lib/admin/whatsapp-templates/publishing/validation.ts";

const id = `wtdef_${"b".repeat(64)}`;
const waba = "1234567890";
const admin = "admin-fixture";
const strict = { requireInitialReply: true, contentLanguageTag: "en" };

function commonInitial(scenario = RECOVERY_SCENARIOS[0], image = false): MetaTemplateAst {
  const ast = structuredClone(scenario.draft);
  const legacy = splitInitialReplyBody(ast.body, ast.promotionTarget, "en", false);
  assert.ok(legacy);
  ast.body = [...legacy.body, { type: "text", value: standaloneInitialReplyText("en", ast.promotionTarget) }];
  ast.commonLayout = commonRef();
  ast.footer = [{ type: "text", value: "Reply STOP to opt out." }];
  if (image) ast.shopBrandMediaRole = "LOGO";
  return ast;
}

function sourceFor(ast: MetaTemplateAst) {
  const record = makeImmutableAuthoringRecord(ast);
  return makeTranslationSourceSnapshot({ definitionId: id, sourceLanguageTag: "en", sourceHash: templateHash(ast),
    englishLocaleAst: record, englishContentHash: templateHash(record.prepared) });
}

function localeRecord(ast: MetaTemplateAst, languageTag: string) {
  if (languageTag === "en") return makeImmutableAuthoringRecord(ast);
  const snapshot = sourceFor(ast);
  return reconstructAndCompile({ definitionId: id, definitionSourceHash: snapshot.sourceHash,
    runSourceHash: snapshot.sourceHash, languageTag, english: ast, commonLayout: commonRef(languageTag), snapshot,
    // The reply segment is deliberately wrong: the reviewed local catalogue, not
    // arbitrary model copy, must supply the final instruction. Simulate trimming.
    translated: { schemaVersion: 1, segments: snapshot.segments.map(segment => ({ key: segment.key,
      text: segment.key === "body.replyInstruction.text" ? "Generic chat instruction" : segment.text.trimEnd() })) },
  }).record;
}

test("standalone Reply accepts merchant identity from the verified common frame for all initial purposes and both formats", () => {
  assert.equal(REVIEW_LANGUAGES.length, 20);
  for (const scenario of RECOVERY_SCENARIOS.filter(row => row.draft.stage === "INITIAL")) {
    for (const image of [false, true]) {
      const ast = commonInitial(scenario, image);
      // Same shape as the real editor, which can merge adjacent text nodes.
      const tail = ast.body.splice(-2);
      assert.ok(tail[0].type === "text" && tail[1].type === "text");
      ast.body.push({ type: "text", value: tail[0].value + tail[1].value });
      const original = templateHash(ast);
      assert.equal(validateTemplateAst(ast, strict).ok, true);
      const snapshot = sourceFor(ast);
      const reply = snapshot.segments.find(s => s.key === "body.replyInstruction.text");
      assert.ok(reply);
      assert.deepEqual(reply.protectedTokens, []);
      assert.equal(reply.text, standaloneInitialReplyText("en", ast.promotionTarget));
      assert.equal(snapshot.segments.flatMap(s => s.protectedTokens).some(t => t.variable === "shop.name"), false);
      for (const tag of REVIEW_LANGUAGES) {
        const record = localeRecord(ast, tag);
        assert.equal(record.authoring.family, "META_RECOVERY");
        assert.equal(record.prepared.family, "META_RECOVERY");
        if (record.authoring.family !== "META_RECOVERY" || record.prepared.family !== "META_RECOVERY") throw Error("Expected Meta record");
        assert.equal(validateTemplateAst(record.authoring, { requireInitialReply: true, contentLanguageTag: tag }).ok, true, tag);
        assert.equal(record.prepared.parameterBindings.body.filter(b => b.variable === "shop.name").length, 1, tag);
        assert.equal(record.prepared.parameterBindings.body.filter(b => b.variable === "checkout.itemsSummary").length, 1, tag);
        assert.equal(record.prepared.parameterBindings.body.filter(b => b.variable === "checkout.url").length, 1, tag);
        assert.equal(record.prepared.parameterBindings.headerMediaRole, image ? "LOGO" : undefined);
        const body = record.prepared.components.find(c => c.type === "BODY");
        assert.ok(String(body?.text).includes(standaloneInitialReplyText(tag, ast.promotionTarget)), tag);
        assert.ok(!String(body?.text).includes("Generic chat instruction"));
        assert.ok(String(body?.text).endsWith("Reply STOP to opt out."));
      }
      assert.equal(templateHash(ast), original);
    }
  }
});

test("missing, wrong-language or forged common frames and unsafe Reply/basket changes still fail closed", () => {
  const ast = commonInitial();
  const invalid: MetaTemplateAst[] = [
    { ...ast, commonLayout: undefined },
    { ...ast, commonLayout: commonRef("fr") },
    { ...ast, commonLayout: { ...commonRef(), contentHash: "f".repeat(64) } },
    { ...ast, commonLayout: undefined, header: [{ type: "variable", name: "shop.name" }] },
    { ...ast, body: ast.body.filter(n => n.type !== "variable" || n.name !== "checkout.itemsSummary") },
    { ...ast, body: [...ast.body.slice(0, -1), { type: "variable", name: "checkout.itemsSummary" }, { type: "text", value: "\n\n" + standaloneInitialReplyText("en", undefined) }] },
  ];
  for (const wording of ["Type your question", "Reply to this number", "Need help with this basket? Use WhatsApp's Reply option on this message, then type your question or send a voice note (up to 5 minutes).",
    standaloneInitialReplyText("en", "ALTERNATIVE_PRODUCT")]) {
    invalid.push({ ...ast, body: [...ast.body.slice(0, -1), { type: "text", value: wording }] });
  }
  for (const bad of invalid) assert.equal(validateTemplateAst(bad, strict).ok, false, JSON.stringify(bad));
  const unseparated: ContentNode[] = [...ast.body.slice(0, -2), { type: "text", value: "Prefix" + standaloneInitialReplyText("en", undefined) }];
  assert.equal(validateTemplateAst({ ...ast, body: unseparated }, strict).ok, false);
});

test("legacy merchant-bound source keeps the historical Reply segment and marker identity", () => {
  const legacy = structuredClone(RECOVERY_SCENARIOS[0].draft);
  const snapshot = sourceFor(legacy);
  const reply = snapshot.segments.find(s => s.key === "body.replyInstruction.text");
  assert.ok(reply);
  assert.deepEqual(reply.protectedTokens.map(t => t.variable), ["shop.name"]);
  assert.equal(reply.text, `From ${reply.protectedTokens[0].marker}. ${standaloneInitialReplyText("en", undefined)}`);
  assert.equal(sourceLocations(legacy).find(s => s.key === "body.replyInstruction")?.nodes?.length, 3);
  const withCommon = { ...legacy, commonLayout: commonRef(), footer: [{ type: "text" as const, value: "Reply STOP to opt out." }] };
  assert.equal(validateTemplateAst(withCommon, strict).ok, true);
  assert.deepEqual(sourceFor(withCommon).segments.find(s => s.key === reply.key), reply);
});

test("Meta snapshot and publication admission accept the new standalone Reply format without weakening frozen evidence", async () => {
  const ast = commonInitial();
  const definition = { id, kind: "META_RECOVERY", purpose: "INITIAL", offerType: "NO_OFFER", providerTemplateName: "moda_initial_common_reply_fixture",
    category: "MARKETING", sourceHash: templateHash(ast), sourceLanguageTag: "en", astSchemaVersion: 1, status: "READY_FOR_REVIEW",
    retiredAt: null, publishedAt: null };
  const locales = REVIEW_LANGUAGES.map((languageTag, i) => {
    const localeAst = localeRecord(ast, languageTag);
    const locale = { id: `locale-${i}`, definitionId: id, languageTag, providerLanguageCode: providerLanguageCode(languageTag, "META_RECOVERY"),
      localeAst, contentHash: templateHash(localeAst.prepared), status: "REVIEWED", reviewedAt: new Date("2026-11-24T00:00:00Z"), reviewedByAdminId: admin };
    const frozen = frozenLocaleSnapshot(locale, definition);
    return { ...locale, metaRegistrations: [{ id: `reg-${i}`, localeId: locale.id, wabaId: waba,
      providerLanguageCode: locale.providerLanguageCode, providerTemplateName: definition.providerTemplateName, category: "MARKETING",
      providerTemplateId: String(1000+i), componentsSnapshot: frozen.components, parameterBindingsSnapshot: frozen.bindings,
      submittedContentHash: locale.contentHash, providerStatus: "APPROVED", submissionState: "SUBMITTED", driftDetectedAt: null,
      lastObservedContentHash: observedMetaContentHash(frozen.components), lastObservedCategory: "MARKETING", lastReconciledAt: new Date("2026-11-24T01:00:00Z"), failureCode: null }] };
  });
  const db = { whatsAppTemplateDefinition: { findUnique: async () => ({ ...definition, locales }) } } as unknown as Parameters<typeof approvedSource>[0];
  const source = await approvedSource(db, id, waba, { requireDefaultEvidence: true });
  assert.equal(source.locales.length, 20);
  assert.equal(source.headerKind, "NONE");
  locales[1].metaRegistrations[0].submittedContentHash = "0".repeat(64);
  await assert.rejects(approvedSource(db, id, waba, { requireDefaultEvidence: true }));
});
