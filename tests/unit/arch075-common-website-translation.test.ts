import assert from "node:assert/strict";
import { test } from "node:test";
import { layoutAst } from "../fixtures/arch075-common-layout.ts";
import { makeImmutableAuthoringRecord } from "../../src/lib/admin/whatsapp-templates/authoring/compiler.ts";
import { templateHash } from "../../src/lib/admin/whatsapp-templates/authoring/identifiers.ts";
import { extractTranslationSegments, makeTranslationSourceSnapshot, validateSegments } from "../../src/lib/admin/whatsapp-templates/translations/source-snapshot.ts";
import { reconstructAndCompile } from "../../src/lib/admin/whatsapp-templates/compilation/reconstruction.ts";
import { parseSourceSnapshot } from "../../src/lib/admin/whatsapp-templates/compilation/segments.ts";

const definitionId = `wtdef_${"a".repeat(64)}`;
const expectedTokens = [
  { marker: "⟦moda_50b1263685ac954d8019ab2e⟧", variable: "shop.name" },
  { marker: "⟦moda_f38527e6ca5de6fe7d430962⟧", variable: "shop.websiteUrl" },
  { marker: "⟦moda_5a559bd3cc8ba005a179265a⟧", variable: "checkout.url" },
];
function fixture() {
  const english = layoutAst();
  const record = makeImmutableAuthoringRecord(english);
  const sourceHash = templateHash(english);
  const source = { definitionId, sourceHash, sourceLanguageTag: "en",
    englishLocaleAst: record, englishContentHash: templateHash(record.prepared) };
  const snapshot = makeTranslationSourceSnapshot(source);
  const translated = { schemaVersion: 1 as const, segments: snapshot.segments.map(segment => ({
    key: segment.key, text: segment.text.replace("Welcome to ", "Bienvenue chez ")
      .replace("Continue when ready", "Continuez quand vous voulez"),
  })) };
  const input = { definitionId, definitionSourceHash: sourceHash, runSourceHash: sourceHash,
    languageTag: "fr", english, snapshot, translated, outputContentHash: templateHash(translated) };
  return { english, record, sourceHash, source, snapshot, translated, input };
}

test("canonical common wrapper extracts website and checkout as exact protected occurrences", () => {
  const f = fixture();
  assert.deepEqual(f.snapshot.segments.map(segment => segment.key), ["header.text", "conditionals.0.nodes.text"]);
  assert.deepEqual(f.snapshot.segments.flatMap(segment => segment.protectedTokens), expectedTokens);
  assert.equal(f.snapshot.sourceHash, f.sourceHash);
  assert.equal(f.snapshot.schemaVersion, 1);
  assert.deepEqual(extractTranslationSegments(definitionId, f.english), f.snapshot.segments);
  assert.ok(!JSON.stringify(f.snapshot).includes("response.body"));
  assert.equal(templateHash(f.record.authoring), f.sourceHash);
  assert.equal(templateHash(f.record.prepared), f.source.englishContentHash);
});

test("actual reconstruction preserves website identity, structural response slot and final checkout variable", () => {
  const f = fixture();
  const original = structuredClone(f.record);
  const candidate = reconstructAndCompile(f.input);
  const ast = candidate.record.authoring;
  const prepared = candidate.record.prepared;
  assert.equal(ast.family, "MODA_CONVERSATION_WRAPPER");
  assert.equal(prepared.family, "MODA_CONVERSATION_WRAPPER");
  if (ast.family !== "MODA_CONVERSATION_WRAPPER" || prepared.family !== "MODA_CONVERSATION_WRAPPER") throw Error("Expected wrapper");
  assert.deepEqual(ast.header.filter(node => node.type === "variable").map(node => node.name), ["shop.name", "shop.websiteUrl"]);
  assert.deepEqual(ast.body, f.english.body);
  assert.deepEqual(ast.conditionals[0].nodes.at(-1), { type: "variable", name: "checkout.url" });
  assert.deepEqual(prepared.body, [{ kind: "responseSlot", name: "response.body" }]);
  assert.equal(candidate.contentHash, templateHash(prepared));
  assert.deepEqual(f.record, original);
  assert.equal(templateHash(f.english), f.sourceHash);
});

test("unknown semantic names remain rejected by both snapshot and reconstruction parsers", () => {
  const f = fixture();
  for (const variable of ["shop.websiteURL", "shop.untrustedUrl", "customer.secret"]) {
    const segments = structuredClone(f.snapshot.segments);
    segments[0].protectedTokens[1].variable = variable;
    assert.throws(() => validateSegments(segments), /Unknown protected semantic variable/);
    assert.throws(() => parseSourceSnapshot({ ...f.snapshot, segments }), /unknown or unsafe protected marker/);
  }
});

test("missing, duplicate and unregistered website markers refuse before reconstruction", () => {
  const f = fixture();
  const marker = expectedTokens[1].marker;
  for (const corrupt of [(text: string) => text.replace(marker, ""), (text: string) => text + marker,
    (text: string) => text + "⟦moda_000000000000000000000000⟧"]) {
    const segments = structuredClone(f.snapshot.segments);
    segments[0].text = corrupt(segments[0].text);
    assert.throws(() => validateSegments(segments), /marker/i);
    const translated = structuredClone(f.translated);
    translated.segments[0].text = corrupt(translated.segments[0].text);
    assert.throws(() => reconstructAndCompile({ ...f.input, translated, outputContentHash: templateHash(translated) }), /marker/i);
  }
});

test("source, prepared and output hash drift and malformed snapshot remain rejected", () => {
  const f = fixture();
  assert.throws(() => makeTranslationSourceSnapshot({ ...f.source, sourceHash: "f".repeat(64) }), /has changed/);
  assert.throws(() => makeTranslationSourceSnapshot({ ...f.source, englishContentHash: "f".repeat(64) }), /has changed/);
  assert.throws(() => reconstructAndCompile({ ...f.input, runSourceHash: "f".repeat(64) }), /stale/);
  assert.throws(() => reconstructAndCompile({ ...f.input, outputContentHash: "f".repeat(64) }), /output digest/);
  assert.throws(() => reconstructAndCompile({ ...f.input, snapshot: { ...f.snapshot, schemaVersion: 2 } }), /snapshot or version/);
  const snapshot = structuredClone(f.snapshot);
  snapshot.segments[0].text += "Changed source text";
  assert.throws(() => reconstructAndCompile({ ...f.input, snapshot }), /differ from immutable English/);
});

test("legacy name and checkout bindings keep their existing marker bytes without website", () => {
  const english = layoutAst();
  english.header = english.header.filter(node => node.type !== "variable" || node.name !== "shop.websiteUrl");
  const record = makeImmutableAuthoringRecord(english);
  const snapshot = makeTranslationSourceSnapshot({ definitionId, sourceHash: templateHash(english), sourceLanguageTag: "en",
    englishLocaleAst: record, englishContentHash: templateHash(record.prepared) });
  assert.deepEqual(snapshot.segments.flatMap(segment => segment.protectedTokens), [expectedTokens[0], expectedTokens[2]]);
});
