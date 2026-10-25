import assert from "node:assert/strict";
import { test } from "node:test";
import { activateConversationWrapper, WrapperRequestError } from "../../src/lib/admin/whatsapp-templates/wrappers/service.ts";
import { WrapperConflictError, type WrapperRepository } from "../../src/lib/admin/whatsapp-templates/wrappers/repository.ts";
import { wrapperRow, FIXTURE_ID, ANOTHER_ID } from "../fixtures/arch047-wrapper-fixture.ts";

function fake() {
  const definitions = [wrapperRow(), wrapperRow({ id: ANOTHER_ID })];
  type Slot = { audience: string; definitionId: string; editVersion: number; updatedByAdminId: string };
  const state = { slots: [] as Slot[], audits: [] as unknown[], definitionPublication: [] as string[], auditFails: false };
  const db = { $transaction: async (execute: (tx: unknown) => Promise<unknown>) => {
    const snapshot = structuredClone(state);
    const tx = {
      whatsAppTemplateDefinition: {
        findUnique: async ({ where }: {where:{id:string}}) => definitions.find((row) => row.id === where.id) ?? null,
        updateMany: async ({ where, data }: { where:{id:string;publishedAt:null}; data:{publishedAt:Date;status:string} }) => {
          const row = definitions.find((item) => item.id === where.id);
          if (row && row.publishedAt === where.publishedAt) {
            row.publishedAt = data.publishedAt; row.status = data.status; state.definitionPublication.push(where.id);
          }
          return { count: row ? 1 : 0 };
        },
      },
      whatsAppConversationWrapperActiveSlot: {
        findUnique: async ({ where }: {where:{audience:string}}) => state.slots.find((item) => item.audience === where.audience) ?? null,
        create: async ({ data }: { data: Slot }) => {
          if (state.slots.some((slot) => slot.audience === data.audience)) throw { code: "P2002" };
          state.slots.push(data);
        },
        updateMany: async ({ where, data }: {where: Slot;data:{definitionId:string; editVersion:{increment:number};updatedByAdminId:string}}) => {
          const slot = state.slots.find((item) => item.audience === where.audience &&
            item.editVersion === where.editVersion && item.definitionId === where.definitionId);
          if (!slot) return { count: 0 };
          slot.definitionId = data.definitionId; slot.editVersion += data.editVersion.increment;
          slot.updatedByAdminId = data.updatedByAdminId;
          return { count: 1 };
        },
      },
      commerceAuditEvent: { create: async ({data}:{data:unknown}) => {
        if (state.auditFails) throw new Error("forced audit failure");
        state.audits.push(data);
      } },
    };
    try { return await execute(tx); } catch (error) {
      Object.assign(state, snapshot);
      definitions.forEach((row) => { const old = row.id === FIXTURE_ID ? savedFirst : savedSecond; row.publishedAt = old.publishedAt; row.status = old.status; });
      throw error;
    }
    // Capture the definition states to model database rollback without Prisma.
  } } as unknown as WrapperRepository;
  // Before the first operation both definitions are unpublished. Each test owns a fresh fixture.
  const savedFirst = { publishedAt: null, status: "SAVED" };
  const savedSecond = { publishedAt: null, status: "SAVED" };
  return { db, state, definitions };
}

const principal = { id: "fixture-admin", role: "SUPER_ADMIN" as const };
const request = (definitionId = FIXTURE_ID, expectedVersion: number | null = null,
  expectedDefinitionId: string | null = null) => ({ audience: "SHARED" as const, definitionId,
    expectedVersion, expectedDefinitionId, reason: "Reviewed 20 locales and approved this activation." });

test("new pointer, audited replacement, old-version reactivation and replay only update active state", async () => {
  const f = fake();
  const frozenLocales = JSON.stringify(f.definitions.map((row) => row.locales));
  const first = await activateConversationWrapper(request(), { db: f.db, principal });
  assert.deepEqual(first, { replay: false, editVersion: 1 });
  assert.equal(f.state.audits.length, 1);
  assert.equal(f.definitions[0].publishedAt !== null, true);
  assert.equal(f.definitions[0].status, "PUBLISHED");
  const replay = await activateConversationWrapper(request(FIXTURE_ID, 1, FIXTURE_ID), { db: f.db, principal });
  assert.deepEqual(replay, { replay: true, editVersion: 1 });
  assert.equal(f.state.audits.length, 1);
  assert.deepEqual(await activateConversationWrapper(request(ANOTHER_ID, 1, FIXTURE_ID), { db: f.db, principal }),
    { replay: false, editVersion: 2 });
  assert.deepEqual(await activateConversationWrapper(request(FIXTURE_ID, 2, ANOTHER_ID), { db: f.db, principal }),
    { replay: false, editVersion: 3 });
  assert.equal(f.state.audits.length, 3);
  assert.equal(f.state.slots.length, 1);
  assert.equal(f.state.slots[0].definitionId, FIXTURE_ID);
  assert.equal(JSON.stringify(f.definitions.map((row) => row.locales)), frozenLocales, "Activations never edit locale content");
  assert.ok(!JSON.stringify(f.state.audits).includes("Example Brand"), "Audit never contains example/merchant template content");
});

test("stale CAS, mismatched audience and non-SUPER_ADMIN fail with no pointer/audit mutation", async () => {
  const f = fake();
  await assert.rejects(activateConversationWrapper(request(), { db: f.db, principal: { id: "x", role: "PLATFORM_ADMIN" as never } }), /SUPER_ADMIN/);
  assert.equal(f.state.slots.length, 0);
  await activateConversationWrapper(request(), { db: f.db, principal });
  await assert.rejects(activateConversationWrapper(request(ANOTHER_ID), { db: f.db, principal }), WrapperConflictError);
  await assert.rejects(activateConversationWrapper({ ...request(), audience: "AI" }, { db: f.db, principal }), WrapperRequestError);
  await assert.rejects(activateConversationWrapper({ ...request(), reason: "oops" }, { db: f.db, principal }), WrapperRequestError);
  assert.equal(f.state.slots[0].definitionId, FIXTURE_ID);
  assert.equal(f.state.audits.length, 1);
});

test("failed audit leaves pointer and publication untouched", async () => {
  const f = fake(); f.state.auditFails = true;
  await assert.rejects(activateConversationWrapper(request(), { db: f.db, principal }), /forced audit failure/);
  assert.equal(f.state.slots.length, 0);
  assert.equal(f.state.audits.length, 0);
  assert.equal(f.definitions[0].publishedAt, null);
});
