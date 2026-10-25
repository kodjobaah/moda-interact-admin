import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import type { PlatformAdminPrincipal } from "../../src/lib/auth/platform-admin.ts";
import type { ReviewRepository } from "../../src/lib/admin/whatsapp-templates/compilation/repository.ts";
import { makeImmutableAuthoringRecord } from "../../src/lib/admin/whatsapp-templates/authoring/compiler.ts";
import { templateHash } from "../../src/lib/admin/whatsapp-templates/authoring/identifiers.ts";
import { newMetaDraft } from "../../src/lib/admin/whatsapp-templates/authoring/draft-operations.ts";
import { reviewTranslation } from "../../src/lib/admin/whatsapp-templates/compilation/service.ts";
import { compilationFixture } from "../fixtures/arch047-translation-fixture.ts";

const definitionId = `wtdef_${"a".repeat(64)}`;
const principal = { id: "admin-001", role: "SUPER_ADMIN" } as PlatformAdminPrincipal;
const reviewInput = { definitionId, languageTag: "fr", runId: "run-001", decision: "APPROVE" as const };

function fixture() {
  const ast = newMetaDraft();
  const english = makeImmutableAuthoringRecord(ast);
  const translated = compilationFixture(ast);
  const row = { id: definitionId, status: "SAVED", sourceHash: templateHash(ast) };
  const run = { id: "run-001", definitionId, sourceHash: row.sourceHash,
    sourceSnapshot: translated.source, requestedAt: new Date("2026-10-25") };
  const item = { id: "item-001", runId: run.id, targetLanguageTag: "fr", status: "COMPLETED", failureCode: null,
    outputContentHash: templateHash(translated.translated), translatedAst: translated.translated, resultLocaleId: null as string | null };
  type Locale = { id: string; definitionId: string; languageTag: string; localeAst: unknown; contentHash: string | null;
    providerLanguageCode: string | null; status: string; reviewedAt?: Date; reviewedByAdminId?: string };
  const original: Locale[] = [{ id: "english-001", definitionId, languageTag: "en", localeAst: english,
    contentHash: templateHash(english.prepared), providerLanguageCode: "en", status: "SOURCE_SAVED" }];
  let persisted = structuredClone(original);
  let audits: Array<Record<string, any>> = [];
  let itemLink: string | null = null;
  let failAudit = false;
  let calls = 0;
  let serial = Promise.resolve();
  const db = {
    $transaction: async (fn: (tx: any) => Promise<any>) => {
      const prior = serial;
      let release!: () => void;
      serial = new Promise<void>((resolve) => { release = resolve; });
      await prior;
      const staged = structuredClone(persisted);
      const stagedAudits = structuredClone(audits);
      let stagedLink = itemLink;
      calls++;
      const tx = {
        $queryRaw: async () => row.id === definitionId ? [{ id: definitionId }] : [],
        whatsAppTemplateDefinition: { findUnique: async () => structuredClone(row) },
        whatsAppTemplateTranslationRun: { findFirst: async () => structuredClone(run) },
        whatsAppTemplateTranslationItem: {
          findUnique: async () => ({ ...structuredClone(item), resultLocaleId: stagedLink }),
          update: async ({ data }: any) => { stagedLink = data.resultLocaleId; },
        },
        whatsAppTemplateLocale: {
          findUnique: async ({ where }: any) => staged.find((l) => l.languageTag === where.definitionId_languageTag.languageTag) ?? null,
          create: async ({ data }: any) => {
            if (staged.some((l) => l.languageTag === data.languageTag)) throw { code: "P2002" };
            const created = { ...data, id: "french-001", localeAst: data.localeAst === Prisma.DbNull ? null : data.localeAst };
            staged.push(created); return created;
          },
          update: async ({ where, data }: any) => {
            const index = staged.findIndex((l) => l.id === where.id);
            staged[index] = { ...staged[index], ...data, localeAst: data.localeAst === Prisma.DbNull ? null : data.localeAst };
            return staged[index];
          },
        },
        commerceAuditEvent: { create: async ({ data }: any) => {
          if (failAudit) throw new Error("Forced audit failure");
          stagedAudits.push(data);
        } },
      };
      try {
        const result = await fn(tx);
        persisted = staged; audits = stagedAudits; itemLink = stagedLink;
        return result;
      } finally { release(); }
    },
  } as unknown as ReviewRepository;
  return { db, row, run, item, get locales() { return persisted; }, get audits() { return audits; },
    get itemLink() { return itemLink; }, get calls() { return calls; }, setFailAudit(value: boolean) { failAudit = value; } };
}

test("APPROVE is atomic, frozen, audited once and idempotent across repeated/concurrent requests", async () => {
  const f = fixture();
  const results = await Promise.all(Array.from({ length: 5 }, () => reviewTranslation(reviewInput, { db: f.db, principal })));
  assert.equal(results.filter((r) => !r.replay).length, 1);
  assert.equal(f.locales.length, 2);
  assert.equal(f.locales[1].status, "REVIEWED");
  assert.equal(f.locales[1].providerLanguageCode, "fr");
  assert.ok(f.locales[1].localeAst);
  assert.ok(f.locales[1].contentHash);
  assert.equal(f.locales[1].reviewedByAdminId, principal.id);
  assert.equal(f.audits.length, 1);
  assert.equal(f.audits[0].action, "REVIEW_WHATSAPP_TEMPLATE_LOCALE");
  assert.equal(f.itemLink, "french-001");
  await assert.rejects(reviewTranslation({ ...reviewInput, decision: "REJECT" }, { db: f.db, principal }), /already finalised/);
  assert.equal(f.locales[1].status, "REVIEWED");
});

test("rejection never stores authoring content or alters a live Meta registration and is idempotent", async () => {
  const f = fixture();
  const reject = { ...reviewInput, decision: "REJECT" as const };
  assert.deepEqual(await reviewTranslation(reject, { db: f.db, principal }), { replay: false });
  assert.deepEqual(await reviewTranslation(reject, { db: f.db, principal }), { replay: true });
  assert.equal(f.locales.length, 2);
  assert.equal(f.locales[1].status, "REJECTED");
  assert.equal(f.locales[1].localeAst, null);
  assert.equal(f.locales[1].contentHash, null);
  assert.equal(f.audits.length, 1);
  assert.equal(f.itemLink, null);
  await assert.rejects(reviewTranslation(reviewInput, { db: f.db, principal }), /Clone as New/);
  assert.equal(f.locales[1].status, "REJECTED");
  assert.equal(f.audits.length, 1);
});

test("failing audit rolls back both locale finalisation and translation-item link", async () => {
  const f = fixture(); f.setFailAudit(true);
  await assert.rejects(reviewTranslation(reviewInput, { db: f.db, principal }), /Forced audit failure/);
  assert.equal(f.locales.length, 1);
  assert.equal(f.itemLink, null);
  assert.equal(f.audits.length, 0);
  f.setFailAudit(false);
  await reviewTranslation(reviewInput, { db: f.db, principal });
  assert.equal(f.locales.length, 2);
});

test("SUPER_ADMIN, run identity, source hash and item success are enforced in the service", async () => {
  const f = fixture();
  await assert.rejects(reviewTranslation(reviewInput, { db: f.db, principal: { ...principal, role: "ADMIN" } }), /SUPER_ADMIN/);
  await assert.rejects(reviewTranslation({ ...reviewInput, runId: "old-run" }, { db: f.db, principal }), /stale/);
  await assert.rejects(reviewTranslation({ ...reviewInput, actorId: "forged" } as any, { db: f.db, principal }), /Invalid translation review/);
  await assert.rejects(reviewTranslation({ ...reviewInput, languageTag: "en" }, { db: f.db, principal }), /Invalid translation review/);
  f.row.sourceHash = "b".repeat(64);
  await assert.rejects(reviewTranslation(reviewInput, { db: f.db, principal }), /stale/);
  assert.equal(f.locales.length, 1);
  f.row.sourceHash = f.run.sourceHash;
  f.item.status = "FAILED";
  await assert.rejects(reviewTranslation(reviewInput, { db: f.db, principal }), /not complete/);
  assert.equal(f.audits.length, 0);
});

test("invalid marker output may be rejected but never approved", async () => {
  const f = fixture();
  const result = f.item.translatedAst as { schemaVersion: 1; segments: Array<{ key: string; text: string }> };
  f.item.translatedAst = { ...result, segments: result.segments.map((s) => s.key === "body" ? { ...s, text: "broken {{999}}" } : s) };
  f.item.outputContentHash = templateHash(f.item.translatedAst);
  await assert.rejects(reviewTranslation(reviewInput, { db: f.db, principal }), /marker/i);
  assert.equal(f.locales.length, 1);
  await reviewTranslation({ ...reviewInput, decision: "REJECT" }, { db: f.db, principal });
  assert.equal(f.locales[1].status, "REJECTED");
});
