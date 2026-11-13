import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import { fixture } from "../helpers/arch047-template-meta-fixture.ts";
import { confirmMetaSubmission } from "../../src/lib/admin/whatsapp-templates/meta/submission.ts";
import { readMetaStatus } from "../../src/lib/admin/whatsapp-templates/meta/status.ts";
import { requestMetaReconciliation } from "../../src/lib/admin/whatsapp-templates/meta/reconcile.ts";
import { makeMetaSubmissionPlan } from "../../src/lib/admin/whatsapp-templates/meta/snapshot.ts";
import { insertRegistrations } from "../../src/lib/admin/whatsapp-templates/meta/repository.ts";
import type { MetaDatabase } from "../../src/lib/admin/whatsapp-templates/meta/repository.ts";

if (process.env.ARCH047_DISPOSABLE_POSTGRES !== "1") throw new Error("Refusing non-disposable PostgreSQL integration execution.");
const db = new PrismaClient();
after(async () => { await db.$disconnect(); });
const actorId = `arch047_meta_${randomUUID()}`;
const principal = { id: actorId, role: "SUPER_ADMIN" as const, developmentBypass: false };

async function seed() {
  const f = fixture();
  // Template names and definition IDs are unique for this disposable test instance.
  const suffix = randomUUID().replace(/-/g, "");
  f.definition.id = `wtdef_${suffix.repeat(2)}`;
  f.definition.providerTemplateName = `moda_initial_no_offer_${suffix}`;
  f.locales.forEach((locale) => { locale.definitionId = f.definition.id; });
  await db.platformAdmin.upsert({ where: { id: actorId }, update: {}, create: {
    id: actorId, provider: "arch047-integration", providerSubject: actorId,
    email: `${actorId}@example.invalid`, displayName: "ARCH-047 Meta administrator", role: "SUPER_ADMIN", active: true,
  } });
  await db.whatsAppTemplateDefinition.create({ data: {
    id: f.definition.id, kind: f.definition.kind, purpose: f.definition.purpose,
    offerType: f.definition.offerType, category: f.definition.category,
    sourceLanguageTag: "en", astSchemaVersion: 1, sourceHash: f.definition.sourceHash,
    status: "SAVED", providerTemplateName: f.definition.providerTemplateName,
    createdByAdminId: actorId,
  } });
  await db.whatsAppTemplateLocale.createMany({ data: f.locales.map((row) => ({
    id: row.id + suffix, definitionId: f.definition.id, languageTag: row.languageTag,
    providerLanguageCode: row.providerLanguageCode,
    localeAst: row.localeAst as unknown as Prisma.InputJsonValue, contentHash: row.contentHash,
    status: row.status, reviewedByAdminId: row.reviewedByAdminId && actorId,
    reviewedAt: row.reviewedAt,
  })) });
  f.locales.forEach((row) => { row.id += suffix; });
  return f;
}

const args = (f: ReturnType<typeof fixture>) => {
  const plan = makeMetaSubmissionPlan({ definition: f.definition, locales: f.locales, trustedWabaId: "123456789012" });
  return { definitionId: f.definition.id, expectedDigest: plan.digest, confirmation: "SUBMIT_TO_META" as const };
};
const dependencies = { db, principal, trustedWabaId: "123456789012" };

test("serializable 20-row registration, no-op replay, provider event status and reconciliation audit", async () => {
  const f = await seed();
  const input = args(f);
  const results = await Promise.all([1, 2, 3].map(() => confirmMetaSubmission(input, dependencies)));
  assert.equal(results.filter((r) => !r.replay).length, 1);
  const rows = await db.whatsAppTemplateMetaRegistration.findMany({ where: { locale: { definitionId: f.definition.id } } });
  assert.equal(rows.length, 20);
  const english = await db.whatsAppTemplateLocale.findFirstOrThrow({ where: { definitionId: f.definition.id, languageTag: "en" } });
  assert.equal(english.status, "REVIEWED"); assert.equal(english.reviewedByAdminId, actorId); assert.ok(english.reviewedAt);
  assert.deepEqual(english.localeAst, f.locales.find(l => l.languageTag === "en")!.localeAst);
  assert.equal(english.contentHash, f.locales.find(l => l.languageTag === "en")!.contentHash);
  assert.equal(await db.commerceAuditEvent.count({ where: { action: "REVIEW_WHATSAPP_TEMPLATE_LOCALE", operationId: `${f.definition.id}:en` } }), 1);
  assert.equal(new Set(rows.map((r) => r.providerLanguageCode)).size, 20);
  assert.ok(rows.every((r) => r.providerStatus === null && r.submissionState === "READY_TO_SUBMIT"));
  assert.equal(await db.commerceAuditEvent.count({ where: { actorAdminId: actorId, action: "REQUEST_WHATSAPP_TEMPLATE_META_SUBMISSION" } }), 1);
  await db.whatsAppTemplateMetaRegistration.update({ where: { id: rows[0].id },
    data: { submissionState: "SUBMITTED", providerStatus: "REJECTED", failureCode: "META_REJECTED" } });
  await db.whatsAppTemplateMetaRegistration.update({ where: { id: rows[1].id },
    data: { submissionState: "SUBMITTED", providerStatus: "APPROVED" } });
  await db.whatsAppTemplateMetaRegistration.update({ where: { id: rows[2].id },
    data: { submissionState: "SUBMITTED", providerStatus: "PAUSED", driftDetectedAt: new Date() } });
  await db.whatsAppTemplateMetaEvent.create({ data: {
    eventIdentity: `evt-${randomUUID()}`, registrationId: rows[0].id, source: "WEBHOOK",
    eventType: "message_template_status_update", wabaId: rows[0].wabaId,
    providerTemplateName: rows[0].providerTemplateName, providerLanguageCode: rows[0].providerLanguageCode,
    providerStatus: "REJECTED", reasonCode: "POLICY_REJECTION",
  } });
  const status = await readMetaStatus(f.definition.id, dependencies);
  assert.equal(status.registrations.length, 20);
  assert.equal(status.registrations.find((r) => r.id === rows[0].id)?.events[0].reasonCode, "POLICY_REJECTION");
  assert.equal(status.registrations.find((r) => r.id === rows[1].id)?.providerStatus, "APPROVED");
  assert.ok(status.registrations.find((r) => r.id === rows[2].id)?.driftDetectedAt);
  const reconciliation = { definitionId: f.definition.id, registrationId: rows[0].id };
  assert.deepEqual(await requestMetaReconciliation(reconciliation, dependencies), { queued: true });
  assert.deepEqual(await requestMetaReconciliation(reconciliation, dependencies), { queued: false });
  assert.equal(await db.whatsAppTemplateMetaEvent.count({ where: { registrationId: rows[0].id, source: "ADMIN", eventType: "RECONCILE_REQUESTED" } }), 1);
  assert.equal(await db.commerceAuditEvent.count({ where: { actorAdminId: actorId, action: "REQUEST_WHATSAPP_TEMPLATE_META_SUBMISSION" } }), 2);
  const frozen = await db.whatsAppTemplateMetaRegistration.findUniqueOrThrow({ where: { id: rows[0].id } });
  assert.deepEqual(frozen.componentsSnapshot, rows[0].componentsSnapshot);
  assert.deepEqual(frozen.parameterBindingsSnapshot, rows[0].parameterBindingsSnapshot);
  await assert.rejects(requestMetaReconciliation(reconciliation, { ...dependencies, trustedWabaId: "99999999999" }), /does not belong/);
});

test("forced audit failure leaves no registration; stale digest denies all writes", async () => {
  const f = await seed();
  const enBefore = await db.whatsAppTemplateLocale.findFirstOrThrow({where:{definitionId:f.definition.id,languageTag:"en"}});
  const failing: MetaDatabase = {
    // Prisma model delegates are client properties, not reliably enumerable via
    // object spread. Supply the complete injected database port explicitly.
    whatsAppTemplateDefinition: db.whatsAppTemplateDefinition,
    whatsAppTemplateMetaRegistration: db.whatsAppTemplateMetaRegistration,
    whatsAppTemplateMetaEvent: db.whatsAppTemplateMetaEvent,
    platformConfiguration: db.platformConfiguration,
    $transaction: ((callback: (tx: Prisma.TransactionClient) => Promise<unknown>, options?: unknown) => db.$transaction(async (tx) => callback(new Proxy(tx, {
      get(target, prop, receiver) {
        if (prop === "commerceAuditEvent") return { create: async (args: Prisma.CommerceAuditEventCreateArgs) => { if(args.data.action === "REQUEST_WHATSAPP_TEMPLATE_META_SUBMISSION") throw new Error("forced meta audit failure"); return target.commerceAuditEvent.create(args); } };
        return Reflect.get(target, prop, receiver);
      },
    }) as Prisma.TransactionClient), options as any)) as MetaDatabase["$transaction"],
  };
  await assert.rejects(confirmMetaSubmission(args(f), { ...dependencies, db: failing }), /forced meta audit failure/);
  assert.deepEqual(await db.whatsAppTemplateLocale.findUniqueOrThrow({where:{id:enBefore.id}}),enBefore);
  assert.equal(await db.commerceAuditEvent.count({where:{operationId:`${f.definition.id}:en`}}),0);
  assert.equal(await db.whatsAppTemplateMetaRegistration.count({ where: { locale: { definitionId: f.definition.id } } }), 0);
  await assert.rejects(confirmMetaSubmission({ ...args(f), expectedDigest: "0".repeat(64) }, dependencies), /sender changed/);
  assert.equal(await db.whatsAppTemplateMetaRegistration.count({ where: { locale: { definitionId: f.definition.id } } }), 0);
});


test("historical identical registrations gain explicit English review without provider recreation or state changes", async () => {
  const f = await seed();
  // Actual frozen intents created by the historical Admin path; no provider calls.
  await insertRegistrations(db, makeMetaSubmissionPlan({definition:f.definition,locales:f.locales,trustedWabaId:dependencies.trustedWabaId}));
  await db.whatsAppTemplateMetaRegistration.updateMany({where:{locale:{definitionId:f.definition.id}},data:{submissionState:"BLOCKED",failureCode:"META_APP_ID_MISSING"}});
  const before=await db.whatsAppTemplateMetaRegistration.findMany({where:{locale:{definitionId:f.definition.id}},orderBy:{id:"asc"}});
  const enBefore=await db.whatsAppTemplateLocale.findFirstOrThrow({where:{definitionId:f.definition.id,languageTag:"en"}});
  assert.equal(enBefore.status,"SOURCE_SAVED");
  const result=await confirmMetaSubmission(args(f),dependencies);assert.equal(result.replay,true);
  const enAfter=await db.whatsAppTemplateLocale.findUniqueOrThrow({where:{id:enBefore.id}});assert.equal(enAfter.status,"REVIEWED");assert.equal(enAfter.reviewedByAdminId,actorId);assert.ok(enAfter.reviewedAt);
  assert.deepEqual(enAfter.localeAst,enBefore.localeAst);assert.equal(enAfter.contentHash,enBefore.contentHash);
  assert.deepEqual(await db.whatsAppTemplateMetaRegistration.findMany({where:{locale:{definitionId:f.definition.id}},orderBy:{id:"asc"}}),before);
  assert.equal((await confirmMetaSubmission(args(f),dependencies)).replay,true);
  assert.deepEqual(await db.whatsAppTemplateLocale.findUniqueOrThrow({where:{id:enBefore.id}}),enAfter);
  assert.equal(await db.commerceAuditEvent.count({where:{action:"REVIEW_WHATSAPP_TEMPLATE_LOCALE",operationId:`${f.definition.id}:en`}}),1);
});


test("unauthorized/inactive actor, stale hash and malformed reviewed English never create review or registrations",async()=>{
 const f=await seed();const input=args(f);const en=await db.whatsAppTemplateLocale.findFirstOrThrow({where:{definitionId:f.definition.id,languageTag:"en"}});
 await assert.rejects(confirmMetaSubmission(input,{...dependencies,principal:{...principal,role:"ADMIN"}}),/SUPER_ADMIN/);
 await db.platformAdmin.update({where:{id:actorId},data:{active:false}});
 await assert.rejects(confirmMetaSubmission(input,dependencies),/active SUPER_ADMIN/);
 await db.platformAdmin.update({where:{id:actorId},data:{active:true}});
 await db.whatsAppTemplateLocale.update({where:{id:en.id},data:{contentHash:"0".repeat(64)}});
 await assert.rejects(confirmMetaSubmission(input,dependencies),/digest|mapping|source/i);
 await db.whatsAppTemplateLocale.update({where:{id:en.id},data:{contentHash:en.contentHash,status:"REVIEWED",reviewedAt:null,reviewedByAdminId:null}});
 await assert.rejects(confirmMetaSubmission(input,dependencies),/attribution/);
 assert.equal(await db.whatsAppTemplateMetaRegistration.count({where:{locale:{definitionId:f.definition.id}}}),0);
 assert.equal(await db.commerceAuditEvent.count({where:{operationId:`${f.definition.id}:en`}}),0);
});
