import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { executeOperationalIncidentTransition as transition, IncidentTransitionConflict } from '../../src/lib/admin/operational-incident-actions.ts';

const prisma = new PrismaClient();
const key = 'b'.repeat(64);
const alice = { id: 'arch033-admin-alice', role: 'ADMIN' };
const bob = { id: 'arch033-admin-bob', role: 'ADMIN' };
const boss = { id: 'arch033-admin-boss', role: 'SUPER_ADMIN' };
const call = (principal: typeof alice, action: 'TAKE'|'RELEASE'|'REASSIGN'|'RESOLVE', extra: Record<string,string> = {}) =>
  transition(prisma, principal, { incidentKey: key, action, ...extra });
const incident = () => prisma.operationalIncident.findUniqueOrThrow({where:{incidentKey:key}});
const events = () => prisma.operationalIncidentEvent.findMany({where:{incident:{incidentKey:key}},orderBy:{occurredAt:'asc'}});

test('real PostgreSQL: concurrency, ownership, reassignment, resolution, audit and rollback', async () => {
  try {
    const now = new Date();
    await prisma.platformAdmin.createMany({data:[alice,bob,boss].map((admin)=>({id:admin.id,email:`${admin.id}@example.invalid`,role:admin.role as 'ADMIN'|'SUPER_ADMIN',active:true,updatedAt:now}))});
    await prisma.operationalIncident.create({data:{id:'arch033-admin-incident',incidentKey:key,sourceService:'background',environment:'test',category:'INTEGRATION_ACCESS',reasonCode:'SHOPIFY_ACCESS_REVOKED',resourceKey:'test-resource',severity:'HIGH',firstOccurredAt:now,lastOccurredAt:now,lastCorrelationId:'arch033-test'}});
    const results = await Promise.allSettled([call(alice,'TAKE'),call(bob,'TAKE')]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1,'exactly one concurrent claim succeeds');
    const owner = (await incident()).ownerPlatformAdminId;
    assert.ok(owner===alice.id||owner===bob.id);
    const current = owner===alice.id?alice:bob;
    const other = owner===alice.id?bob:alice;
    await assert.rejects(call(other,'RELEASE'),/Take ownership/);
    await assert.rejects(call(other,'RESOLVE',{resolutionNote:'Fixed'}),/Take ownership/);
    await assert.rejects(call(current,'RESOLVE',{resolutionNote:' '}),/Resolution rationale/);
    await assert.rejects(call(alice,'REASSIGN',{targetAdminId:other.id}),/Only super administrators/);
    await call(current,'RELEASE');
    assert.equal((await incident()).ownerPlatformAdminId,null);
    await call(alice,'TAKE');
    await call(boss,'REASSIGN',{targetAdminId:bob.id});
    assert.equal((await incident()).ownerPlatformAdminId,bob.id);
    await assert.rejects(call(alice,'RESOLVE',{resolutionNote:'Not owner'}),/Take ownership/);
    await call(bob,'RESOLVE',{resolutionNote:'Restored provider access'});
    const final = await incident();
    assert.equal(final.status,'RESOLVED');
    assert.equal(final.resolvedByPlatformAdminId,bob.id);
    assert.equal(final.resolutionNote,'Restored provider access');
    assert.deepEqual((await events()).map(e=>e.eventType),['CLAIMED','RELEASED','CLAIMED','REASSIGNED','RESOLVED']);
    assert.ok((await events()).every(e=>e.actorPlatformAdminId));
    await assert.rejects(call(bob,'RELEASE'),/Only open incidents/);
    const before = await events();
    // A failed audit insert must roll back the incident mutation.
    await prisma.operationalIncident.update({where:{incidentKey:key},data:{status:'OPEN',resolvedAt:null,resolvedByPlatformAdminId:null,resolutionNote:null}});
    await assert.rejects(transition(prisma,bob,{incidentKey:key,action:'RELEASE'},()=> 'not-a-uuid'));
    assert.equal((await incident()).ownerPlatformAdminId,bob.id,'failed audit write rolls back ownership change');
    assert.equal((await events()).length,before.length,'failed audit leaves no event');
  } finally {
    await prisma.$disconnect();
  }
});
