import assert from "node:assert/strict";
import test from "node:test";
import { CommerceModelPolicyConflict } from "../../src/lib/admin/commerce-model-platform-policy.ts";
import { loadLivePlanPolicyDashboard, mutateLivePlanPolicy } from "../../src/lib/admin/commerce-model-plan-policy.ts";

type Event = { kind: string; params?: any };
function fixture({ existing = { id: "arch038-live-plan-development-plan-1", editVersion: 2, budget: { deadlineMs: 90000 }, budgetSchemaVersion: 1 }, auditFails = false, updated = 1, planFound = true } : {existing?: any; auditFails?:boolean;updated?:number;planFound?:boolean}={}) {
  const events:Event[] = [];
  const tx = {
    merchantPricingPlan: { findUnique: async (params:any) => { events.push({ kind: "plan", params }); return planFound ? { id: "plan-1" } : null; } },
    commerceModelPolicy: {
      findMany: async (params:any) => {
        events.push({kind:"find",params});
        return params.where.scope === "PLATFORM" ? [{id:"live-platform",budget:{deadlineMs:60000, outputTokens:800},budgetSchemaVersion:1}] : existing ? [existing] : [];
      },
      create: async (params:any) => {events.push({kind:"create",params});},
      updateMany: async (params:any) => {events.push({kind:"update",params}); return { count:updated };},
      deleteMany: async (params:any) => {events.push({kind:"delete",params}); return {count:updated};},
    },
    commerceAuditEvent: {
      create: async (params:any) => {events.push({kind:"audit",params});if(auditFails)throw Error("audit failed");},
      findMany: async (params:any) => {events.push({kind:"history",params});return [];},
    },
  };
  return {tx:tx as never,events};
}
const input = {planId:"plan-1",expectedEditVersion:2,reason:"Plan budget change",budget:{outputTokens:2000}};
test("Plan budget updates only a matching LIVE PRICE_PLAN row with CAS and paired audit", async () => {
  const {tx,events}=fixture();
  await mutateLivePlanPolicy(tx,input,"DEVELOPMENT","admin-1");
  const update=events.find(e=>e.kind==="update")!.params;
  assert.equal(update.where.merchantPricingPlanId,"plan-1");
  assert.equal(update.where.context,"LIVE");
  assert.equal(update.where.editVersion,2);
  assert.deepEqual(update.data.budget,{outputTokens:2000});
  const audit=events.find(e=>e.kind==="audit")!.params.data;
  assert.equal(audit.action,"SET_LIVE_PLAN_BUDGET_OVERRIDE");
  assert.equal(audit.actorAdminId,"admin-1");
  assert.deepEqual(audit.metadata.previousBudget,{deadlineMs:90000});
  assert.deepEqual(audit.metadata.nextBudget,{outputTokens:2000});
});
test("Updating output tokens retains a separately overridden deadline when both toggles are saved", async () => {
  const {tx,events}=fixture();
  const budget={deadlineMs:90000,outputTokens:1200};
  await mutateLivePlanPolicy(tx,{...input,budget},"DEVELOPMENT","admin-1");
  assert.deepEqual(events.find(e=>e.kind==="update")!.params.data.budget,budget);
});
test("Clear deletes an empty override while retaining its durable audit identity", async () => {
  const {tx,events}=fixture();
  await mutateLivePlanPolicy(tx,{...input,budget:{}},"DEVELOPMENT","admin-1");
  assert.equal(events.filter(e=>e.kind==="delete").length,1);
  const audit=events.find(e=>e.kind==="audit")!.params.data;
  assert.equal(audit.metadata.operation,"CLEAR");
  assert.equal(audit.modelPolicyId,"arch038-live-plan-development-plan-1");
});
test("Create starts at version one and records initial audit", async () => {
  const {tx,events}=fixture({existing:null});
  await mutateLivePlanPolicy(tx,{...input,expectedEditVersion:0},"DEVELOPMENT","admin-1");
  const created=events.find(e=>e.kind==="create")!.params.data;
  assert.equal(created.merchantPricingPlanId,"plan-1");
  assert.equal(created.budgetSchemaVersion,1);
  assert.equal(events.find(e=>e.kind==="audit")!.params.data.metadata.nextEditVersion,1);
});
test("Stale version, CAS races, missing plan and audit failures are rejected", async () => {
  const tests = [
    {f: fixture(), input: {...input,expectedEditVersion:1}, reason: CommerceModelPolicyConflict},
    {f: fixture({updated:0}), input, reason: CommerceModelPolicyConflict},
    {f: fixture({planFound:false}), input, reason: /no longer exists/},
    {f: fixture({auditFails:true}), input, reason: /audit failed/},
  ];
  for (const item of tests) {
    await assert.rejects(mutateLivePlanPolicy(item.f.tx,item.input,"DEVELOPMENT","admin-1"),item.reason);
  }
});
test("Plan history is filtered by stable policy identity and environment after deletion", async () => {
  const {tx,events}=fixture({existing:null});
  const result=await loadLivePlanPolicyDashboard(tx,"DEVELOPMENT","plan-1",1);
  assert.deepEqual(result.policy.effective,{deadlineMs:60000,outputTokens:800});
  assert.deepEqual(result.policy.sources,{deadlineMs:"PLATFORM",outputTokens:"PLATFORM"});
  const history=events.find(e=>e.kind==="history")!.params;
  assert.equal(history.where.modelPolicyId,"arch038-live-plan-development-plan-1");
  assert.equal(history.where.environment,"DEVELOPMENT");
  assert.equal(history.skip,10);
});
