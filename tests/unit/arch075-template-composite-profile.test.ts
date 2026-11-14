import assert from "node:assert/strict";
import test from "node:test";
import { RecoveryCompositeProfileSchema, assertRecoveryCompositeProfileSafety, readPreparedWrapper, stableJson } from "@modainteract/moda-interact-shared/commerce/presentation";
import { layoutAst } from "../fixtures/arch075-common-layout";
import { leftCompositeProfile as left, topCompositeProfile as top } from "../fixtures/arch075-composite-profile";
import { compositeProfileDigest, compositeProfileError } from "../../src/lib/admin/whatsapp-templates/authoring/composite-profile";
import { compileTemplateAst, makeImmutableAuthoringRecord } from "../../src/lib/admin/whatsapp-templates/authoring/compiler";
import { templateHash } from "../../src/lib/admin/whatsapp-templates/authoring/identifiers";
import { layoutDigest, requireCommonLayout } from "../../src/lib/admin/whatsapp-templates/authoring/common-layout";
import { validateTemplateAst } from "../../src/lib/admin/whatsapp-templates/authoring/validation";
import { verifyFrozenTemplateProjection } from "../../src/lib/admin/whatsapp-templates/authoring/frozen-projection";
import { cloneDraft, setWrapperAudience } from "../../src/lib/admin/whatsapp-templates/authoring/draft-operations";
import { makeTranslationSourceSnapshot } from "../../src/lib/admin/whatsapp-templates/translations/source-snapshot";
import { reconstructAndCompile } from "../../src/lib/admin/whatsapp-templates/compilation/reconstruction";
import { parseTranslatedSegments } from "../../src/lib/admin/whatsapp-templates/compilation/segments";

const definitionId = `wtdef_${"1".repeat(64)}`;
function withProfile(profile = left) { return { ...layoutAst(), compositeProfile: profile }; }

test("one saved common source binds either geometry to both source and prepared identity", () => {
  const absent = layoutAst(); delete absent.compositeProfile;
  assert.equal(validateTemplateAst(absent).ok, false);
  assert.throws(() => compileTemplateAst(absent), /requires a saved composite profile/);
  const baseline = makeImmutableAuthoringRecord(withProfile());
  const preparedHashes = [];
  for (const profile of [left, top]) {
    const record = makeImmutableAuthoringRecord(withProfile(profile));
    assert.equal(record.prepared.family, "MODA_CONVERSATION_WRAPPER");
    if (record.prepared.family !== "MODA_CONVERSATION_WRAPPER") throw Error("Wrong family");
    assert.deepEqual(record.prepared.compositeProfile, profile);
    assert.equal(record.prepared.compositeProfileSha256, compositeProfileDigest(profile));
    assert.notEqual(templateHash(record.authoring), templateHash(absent));
    const hash = templateHash(record.prepared); preparedHashes.push(hash);
    assert.deepEqual(verifyFrozenTemplateProjection(record, hash), record.prepared);
    const parsed = readPreparedWrapper({ schemaVersion: 1, prepared: record.prepared }, hash, layoutDigest);
    assert.equal(parsed.kind, "ok");
    const ref = requireCommonLayout({ schemaVersion: 1, definitionId, sourceHash: templateHash(record.authoring), localeId: "fixture-en", languageTag: "en", contentHash: hash, prepared: record.prepared });
    assert.deepEqual(ref.prepared.compositeProfile, profile);
    assert.equal("compositeProfile" in setWrapperAudience(withProfile(profile), "AI"), false);
    assert.deepEqual(cloneDraft(record.authoring), record.authoring);
    const tampered = structuredClone(record); if (tampered.prepared.family === "MODA_CONVERSATION_WRAPPER") tampered.prepared.compositeProfile = { ...tampered.prepared.compositeProfile!, fontSize: tampered.prepared.compositeProfile!.fontSize + 1 };
    assert.throws(() => verifyFrozenTemplateProjection(tampered, hash));
    assert.notEqual(readPreparedWrapper({ schemaVersion: 1, prepared: tampered.prepared }, templateHash(tampered.prepared), layoutDigest).kind, "ok");
  }
  assert.notEqual(preparedHashes[0], preparedHashes[1]);
  assert.equal(stableJson(compileTemplateAst(layoutAst())), stableJson(baseline.prepared));
});

test("Admin bounds and business rules remain outside structural wire parsing and technical safety", () => {
  for (const profile of [left, top]) assert.equal(compositeProfileError(profile), null);
  const small = { ...left, fontSize: 1 };
  assert.equal(RecoveryCompositeProfileSchema.safeParse(small).success, true);
  assert.doesNotThrow(() => assertRecoveryCompositeProfileSafety(small));
  assert.match(compositeProfileError(small)!, /font size/);
  const spacing = { ...left, textLineSpacingPt: 1 };
  assert.doesNotThrow(() => assertRecoveryCompositeProfileSafety(spacing));
  assert.match(compositeProfileError(spacing)!, /Line spacing/);
  for (const patch of [{ canvasWidth: 639 }, { fontSize: 44.5 }, { fontId: "CUSTOM" }, { logoLeft: 264 }, { productTop: 299 }, { textLeft: 1100 }, { caption: "x" }, { rendererId: "RECOVERY_COMPOSITE_V2" }]) {
    assert.equal(validateTemplateAst(withProfile({ ...left, ...patch } as typeof left)).ok, false, JSON.stringify(patch));
  }
  assert.equal(validateTemplateAst({ ...withProfile(), audience: "AI" }).ok, false);
  assert.equal(validateTemplateAst({ ...withProfile(), compositeProfileSha256: "f".repeat(64) }).ok, false);
});

test("translation preserves exact geometry metadata, excludes it from text transport and rejects injections", () => {
  const english = makeImmutableAuthoringRecord(withProfile(top));
  const sourceHash = templateHash(english.authoring);
  const snapshot = makeTranslationSourceSnapshot({ definitionId, sourceHash, sourceLanguageTag: "en", englishLocaleAst: english, englishContentHash: templateHash(english.prepared) });
  assert.doesNotMatch(JSON.stringify(snapshot.segments), /compositeProfile|fontId|logoLeft/);
  const translated = { schemaVersion: 1, segments: snapshot.segments.map(s => ({ key: s.key, text: s.text })) };
  const candidate = reconstructAndCompile({ definitionId, definitionSourceHash: sourceHash, runSourceHash: sourceHash, languageTag: "fr", english: english.authoring, snapshot, translated });
  if (candidate.record.authoring.family !== "MODA_CONVERSATION_WRAPPER") throw Error("Wrong source family");
  assert.deepEqual(candidate.record.authoring.compositeProfile, top);
  if (candidate.record.prepared.family !== "MODA_CONVERSATION_WRAPPER") throw Error("Wrong family");
  assert.deepEqual(candidate.record.prepared.compositeProfile, top);
  assert.equal(candidate.record.prepared.compositeProfileSha256, compositeProfileDigest(top));
  assert.throws(() => parseTranslatedSegments({ ...translated, compositeProfile: left }), /metadata/);
  assert.throws(() => parseTranslatedSegments({ ...translated, compositeProfileSha256: "f".repeat(64) }), /metadata/);
  assert.throws(() => reconstructAndCompile({ definitionId, definitionSourceHash: sourceHash, runSourceHash: sourceHash, languageTag: "fr", english: withProfile(left), snapshot, translated }), /source hash/);
});

import { RECOVERY_SCENARIOS } from "../../src/lib/admin/whatsapp-templates/authoring/scenarios";
test("geometry-only common clone changes internal source identity but not native Meta components or bindings", () => {
  const projected = [left, top].map((profile, index) => {
    const record = makeImmutableAuthoringRecord(withProfile(profile));
    const ref = requireCommonLayout({ schemaVersion: 1, definitionId: `wtdef_${String(index + 1).repeat(64)}`, sourceHash: templateHash(record.authoring), localeId: `fixture-${index}`, languageTag: "en", contentHash: templateHash(record.prepared), prepared: record.prepared });
    return RECOVERY_SCENARIOS.map(scenario => ({ ast: { ...structuredClone(scenario.draft), commonLayout: ref, shopBrandMediaRole: "LOGO" as const, footer: [{ type: "text" as const, value: "Reply STOP to opt out." }] }, ref }));
  });
  for (let index = 0; index < RECOVERY_SCENARIOS.length; index++) {
    const a = projected[0][index], b = projected[1][index];
    assert.notEqual(templateHash(a.ref), templateHash(b.ref));
    assert.notEqual(templateHash(a.ast), templateHash(b.ast));
    assert.deepEqual(compileTemplateAst(a.ast), compileTemplateAst(b.ast), RECOVERY_SCENARIOS[index].id);
  }
});

import { wrapperRow } from "../fixtures/arch047-wrapper-fixture";
import { checkWrapperEligibility } from "../../src/lib/admin/whatsapp-templates/wrappers/eligibility";
test("current eligibility rejects historical profile absence and independently rehashed translated geometry", () => {
  const row = wrapperRow({ ast: withProfile(left) });
  const changed = structuredClone(row);
  const locale = changed.locales.find(item => item.languageTag === "fr")!;
  const translated = makeImmutableAuthoringRecord(withProfile(top));
  locale.localeAst = translated; locale.contentHash = templateHash(translated.prepared);
  assert.equal(checkWrapperEligibility(changed, "SHARED").eligible, false);
  const historical = structuredClone(row);
  for (const item of historical.locales) {
    const record = item.localeAst as ReturnType<typeof makeImmutableAuthoringRecord>;
    if (record.authoring.family !== "MODA_CONVERSATION_WRAPPER" || record.prepared.family !== "MODA_CONVERSATION_WRAPPER") throw Error("Wrong fixture family");
    delete record.authoring.compositeProfile; delete record.prepared.compositeProfile; delete record.prepared.compositeProfileSha256;
    item.contentHash = templateHash(record.prepared);
    if (item.languageTag === "en") historical.sourceHash = templateHash(record.authoring);
    assert.deepEqual(verifyFrozenTemplateProjection(record, item.contentHash), record.prepared, "historical bytes remain verifiable for audit display only");
  }
  assert.equal(checkWrapperEligibility(historical, "SHARED").eligible, false);
});
