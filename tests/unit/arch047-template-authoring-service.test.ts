import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { newMetaDraft, newWrapperDraft } from "../../src/lib/admin/whatsapp-templates/authoring/draft-operations.ts";
import { saveEnglishTemplate } from "../../src/lib/admin/whatsapp-templates/authoring/service.ts";
import type { TemplateRepository } from "../../src/lib/admin/whatsapp-templates/authoring/repository.ts";
import type { PlatformAdminPrincipal } from "../../src/lib/auth/platform-admin.ts";

const admin = { id: "admin-fixture", role: "SUPER_ADMIN", developmentBypass: false } as PlatformAdminPrincipal;
function makeFixture() {
  const definitions: Array<Record<string, any>> = [];
  const locales: Array<Record<string, any>> = [];
  const audits: Array<Record<string, any>> = [];
  let failAudit = false;
  let rollbackAttempts = 0;
  const db = {
    whatsAppTemplateDefinition: { findUnique: async ({ where }: any) => definitions.find((d) => d.id === where.id) || null },
    $transaction: async (callback: any) => {
      const staged = { definitions: [] as Record<string, any>[], locales: [] as Record<string, any>[], audits: [] as Record<string, any>[] };
      const tx = {
        whatsAppTemplateDefinition: { create: async ({ data }: any) => {
          if ([...definitions, ...staged.definitions].some((d) => d.id === data.id)) throw { code: "P2002" };
          staged.definitions.push(data);
        } },
        whatsAppTemplateLocale: { create: async ({ data }: any) => staged.locales.push(data) },
        commerceAuditEvent: { create: async ({ data }: any) => {
          if (failAudit) throw new Error("Forced audit failure");
          staged.audits.push(data);
        } },
      };
      try { await callback(tx); }
      catch (error) { rollbackAttempts++; throw error; }
      definitions.push(...staged.definitions); locales.push(...staged.locales); audits.push(...staged.audits);
    },
  } as unknown as TemplateRepository;
  return { db, definitions, locales, audits, setFailAudit: (value: boolean) => { failAudit = value; }, get rollbackAttempts() { return rollbackAttempts; } };
}

test("atomic English Meta definition, prepared locale, exact audit, and safe replay", async () => {
  const fixture = makeFixture(); const submissionId = randomUUID(); const draft = newMetaDraft();
  const result = await saveEnglishTemplate({ submissionId, draft }, { db: fixture.db, principal: admin });
  assert.equal(result.replay, false); assert.equal(fixture.definitions.length, 1);
  assert.equal(fixture.locales.length, 1); assert.equal(fixture.audits.length, 1);
  assert.equal(fixture.definitions[0].status, "SAVED");
  assert.equal(fixture.locales[0].localeAst.schemaVersion, 1);
  assert.equal(fixture.locales[0].localeAst.authoring.sourceLanguageTag, "en");
  assert.equal(fixture.locales[0].localeAst.prepared.category, "MARKETING");
  const replay = await saveEnglishTemplate({ submissionId, draft }, { db: fixture.db, principal: admin });
  assert.deepEqual(replay, { id: result.id, replay: true });
  assert.equal(fixture.definitions.length, 1); assert.equal(fixture.audits.length, 1);
  await assert.rejects(saveEnglishTemplate({ submissionId, draft: newWrapperDraft() }, { db: fixture.db, principal: admin }), /already used/);
});
test("initial checkout multi-code revision saves as a distinct immutable approved-candidate identity", async () => {
  const fixture = makeFixture();
  const draft = newMetaDraft("INITIAL", "CODE_OFFER");
  draft.promotionTarget = "CHECKOUT";
  draft.body = [
    { type: "text", value: "Your basket " }, { type: "variable", name: "checkout.itemsSummary" },
    { type: "text", value: " may qualify for " }, { type: "variable", name: "offer.description" },
    { type: "text", value: ". Possible codes " }, { type: "variable", name: "offer.codes" },
    { type: "text", value: ", subject to checkout eligibility.\n\nFrom " }, { type: "variable", name: "shop.name" },
    { type: "text", value: ". Need help with this basket? Use WhatsApp's Reply option on this message, then type your question or send a voice note (up to 2 minutes)." },
  ];
  const result = await saveEnglishTemplate({ submissionId: randomUUID(), draft }, { db: fixture.db, principal: admin });
  assert.equal(result.replay, false);
  assert.deepEqual(fixture.locales[0].localeAst.prepared.parameterBindings.body.map((binding: any) => binding.variable),
    ["checkout.itemsSummary", "offer.description", "offer.codes", "shop.name"]);
  assert.ok(fixture.locales[0].localeAst.prepared.components.find((component: any) => component.type === "BODY").text.includes("{{3}}"));
});

test("new initial revisions reject missing merchant identity or a generic chat reply", async () => {
  for (const mutate of [
    (draft: ReturnType<typeof newMetaDraft>) => {
      draft.body = draft.body.filter((node) => node.type !== "variable" || node.name !== "shop.name");
    },
    (draft: ReturnType<typeof newMetaDraft>) => {
      draft.body = draft.body.map((node) => node.type === "text"
        ? { ...node, value: node.value.replace("Reply option on this message", "message this number") } : node);
    },
  ]) {
    const fixture = makeFixture(); const draft = newMetaDraft(); mutate(draft);
    await assert.rejects(saveEnglishTemplate({ submissionId: randomUUID(), draft }, { db: fixture.db, principal: admin }), /body/);
    assert.equal(fixture.definitions.length, 0);
    assert.equal(fixture.locales.length, 0);
  }
});

test("Clone as New yields independent identity and provider template name without source edits", async () => {
  const fixture = makeFixture(); const a = await saveEnglishTemplate({ submissionId: randomUUID(), draft: newMetaDraft() }, { db: fixture.db, principal: admin });
  const cloned = await saveEnglishTemplate({ submissionId: randomUUID(), draft: newMetaDraft("FOLLOW_UP") , cloneFromDefinitionId: a.id }, { db: fixture.db, principal: admin });
  assert.notEqual(cloned.id, a.id);
  assert.equal(fixture.definitions[1].clonedFromDefinitionId, a.id);
  assert.notEqual(fixture.definitions[1].providerTemplateName, fixture.definitions[0].providerTemplateName);
  assert.equal(fixture.audits[1].action, "CLONE_WHATSAPP_TEMPLATE_DEFINITION");
  assert.equal(fixture.definitions[0].purpose, "INITIAL");
});
test("rollback on failing audit leaves no definition or locale", async () => {
  const fixture = makeFixture(); fixture.setFailAudit(true);
  await assert.rejects(saveEnglishTemplate({ submissionId: randomUUID(), draft: newMetaDraft() }, { db: fixture.db, principal: admin }), /audit failure/);
  assert.equal(fixture.definitions.length, 0); assert.equal(fixture.locales.length, 0); assert.equal(fixture.rollbackAttempts, 1);
});
test("forged actor and unsupported payload are rejected before any write", async () => {
  const fixture = makeFixture();
  await assert.rejects(saveEnglishTemplate({ submissionId: randomUUID(), draft: newMetaDraft() }, { db: fixture.db,
    principal: { id: "not-admin", role: "ADMIN", developmentBypass: false } as PlatformAdminPrincipal }), /SUPER_ADMIN/);
  await assert.rejects(saveEnglishTemplate({ submissionId: randomUUID(), draft: newMetaDraft(), actorAdminId: "forged" } as any,
    { db: fixture.db, principal: admin }), /Unexpected/);
  assert.equal(fixture.definitions.length, 0);
});
test("wrapper save creates no provider name or Meta registration", async () => {
  const fixture = makeFixture(); await saveEnglishTemplate({ submissionId: randomUUID(), draft: newWrapperDraft("AI") }, { db: fixture.db, principal: admin });
  assert.equal(fixture.definitions[0].kind, "MODA_CONVERSATION_WRAPPER");
  assert.equal(fixture.definitions[0].providerTemplateName, null);
  assert.equal(fixture.definitions[0].audience, "AI");
  assert.equal(fixture.locales[0].providerLanguageCode, null);
});

test("actor provisioning executes inside the same atomic save transaction", async () => {
  const fixture = makeFixture();
  await assert.rejects(saveEnglishTemplate({ submissionId: randomUUID(), draft: newMetaDraft() }, {
    db: fixture.db, principal: admin,
    ensureActor: async () => { throw new Error("actor unavailable"); },
  }), /actor unavailable/);
  assert.equal(fixture.definitions.length, 0);
  assert.equal(fixture.audits.length, 0);
});
