import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { PrismaClient } from "@prisma/client";
import { mutateSenderPoolWithDependencies, readSenderPoolWithDependencies, type PoolDependencies } from "../../src/lib/admin/platform-configuration/whatsapp-sender-pool-core.ts";
import { createConfigUnsealKeyring, sealSecret, unsealSecret, DISABLED_SECRET } from "../../src/lib/admin/platform-configuration/seal.ts";
import { mutateSecretWithDependencies } from "../../src/lib/admin/platform-configuration/secret-service.ts";
import { SenderPoolError, type PoolRow } from "../../src/lib/admin/platform-configuration/whatsapp-sender-pool-types.ts";
if(process.env.ARCH076_SENDER_POOL_DISPOSABLE_POSTGRES!=="1")throw new Error("Refusing non-disposable database");
const db=new PrismaClient(); const principal={id:"sender-pool-admin",role:"SUPER_ADMIN" as const,developmentBypass:false};
const wrapping=createConfigUnsealKeyring(JSON.stringify({fixture:Buffer.alloc(32,9).toString("base64")}),"fixture");
let checks=0; const verify=async()=>{checks++;};
const deps:PoolDependencies={db,principal,environment:"test",wrapping,verify};
const code=(expected:string)=>(error:unknown)=>error instanceof SenderPoolError&&error.code===expected;
const enrol=(phone:string,priority=0,dependencies=deps)=>mutateSenderPoolWithDependencies({op:"enrol",providerPhoneNumberId:phone,priority},dependencies);
const update=(row:PoolRow,next:Partial<Pick<PoolRow,"priority"|"allocationEnabled">>,dependencies=deps)=>mutateSenderPoolWithDependencies({op:"update",providerPhoneNumberId:row.providerPhoneNumberId,expected:{priority:row.priority,allocationEnabled:row.allocationEnabled},next:{priority:row.priority,allocationEnabled:row.allocationEnabled,...next}},dependencies);
async function config(account:string,phone="20000",token="fixture-only-token"){
 const current=await db.platformConfiguration.findUnique({where:{environment_key:{environment:"test",key:"messaging.sender"}}}); const version=(current?.version??0)+1;
 const value=sealSecret({environment:"test",key:"messaging.sender",version,plaintext:JSON.stringify({businessAccountId:account,phoneNumberId:phone,accessToken:token}),wrapping});
 await db.platformConfiguration.upsert({where:{environment_key:{environment:"test",key:"messaging.sender"}},create:{environment:"test",key:"messaging.sender",version,value,updatedBy:principal.id},update:{version,value,updatedBy:principal.id}});
 return version;
}
async function disableConfig(){await db.platformConfiguration.update({where:{environment_key:{environment:"test",key:"messaging.sender"}},data:{value:DISABLED_SECRET,version:{increment:1}}});}
async function inventory(phone:string,account:string,enabled=true){return db.whatsAppPoolSender.create({data:{providerPhoneNumberId:phone,providerAccountId:account,allocationEnabled:enabled,verifiedAt:new Date()}});}
async function recovery(phone:string,account:string,ageMs:number,status:"DETECTED"|"MESSAGE_SENT"|"ENGAGED"|"COMPLETED"|"EXPIRED"|"CANCELLED"="ENGAGED",shopId?:string){
 const shop=shopId?{id:shopId}:await db.shop.create({data:{domain:`${randomUUID()}.example.invalid`}});
 const basket=await db.checkoutRecovery.create({data:{shopId:shop.id,checkoutToken:randomUUID(),lastExternalActivityAt:new Date(Date.now()-ageMs),status}});
 const conversation=await db.conversation.create({data:{type:"RECOVERY",checkoutRecoveryId:basket.id}});
 const message=await db.conversationMessage.create({data:{conversationId:conversation.id,direction:"OUTBOUND",senderType:"AUTOMATION",content:"fixture",status:"SENT",providerMessageId:randomUUID(),sentAt:new Date(),dispatchProviderAccountId:account,dispatchProviderPhoneNumberId:phone}});
 return {shop,basket,conversation,message};
}
async function general(phone:string,account:string,ageMs:number,inflight=false,unknownIdentity=false){
 const conversation=await db.conversation.create({data:{type:"PRODUCT_SUPPORT",lastInboundAt:new Date(Date.now()-ageMs)}});
 const message=await db.conversationMessage.create({data:{conversationId:conversation.id,direction:"OUTBOUND",senderType:"AGENT",content:"fixture",status:inflight?"PENDING":"SENT",providerDispatchKey:randomUUID(),providerDispatchControlRevision:0,providerDispatchAdmittedAt:new Date(Date.now()-ageMs),...(inflight?{}:{providerMessageId:randomUUID(),sentAt:new Date(Date.now()-ageMs)}),...(unknownIdentity?{}:{dispatchProviderAccountId:account,dispatchProviderPhoneNumberId:phone})}});
 return {conversation,message};
}
before(async()=>{await db.platformAdmin.create({data:{id:principal.id,email:"sender-pool@example.invalid",provider:"fixture",providerSubject:principal.id,role:"SUPER_ADMIN",active:true}});await db.backgroundRuntimeConfig.upsert({where:{id:"default"},create:{id:"default",checkoutRecoveryLifetimeDays:21},update:{checkoutRecoveryLifetimeDays:21}});});
after(async()=>db.$disconnect());

test("provider-verified concurrent enrolment is disabled/idempotent, identity immutable, C order and strict priority",async()=>{
 await config("91001"); checks=0;
 const results=await Promise.all([enrol("001234",5),enrol("001234",99)]);assert.equal(results[0].priority,results[1].priority);assert.equal(results[0].allocationEnabled,false);assert.equal(await db.whatsAppPoolSender.count({where:{providerPhoneNumberId:"001234"}}),1);
 const saved=results[0];assert.deepEqual(await enrol("001234",2147483647),saved);
 await enrol("12340",0);await enrol("01234",0);
 const read=await readSenderPoolWithDependencies(deps);assert.deepEqual(read.rows.filter(row=>row.priority===0).map(row=>row.providerPhoneNumberId),["01234","12340"]);assert.equal(read.providerAccountId,"91001");assert.doesNotMatch(JSON.stringify(read),/token|verifiedAt|ciphertext|wrappingKey/);
 for(const priority of [-1,0.5,2147483648])await assert.rejects(enrol("99991",priority),code("INVALID_INPUT"));
 await config("91002");await assert.rejects(enrol("001234"),code("IDENTITY_CONFLICT"));
 await assert.rejects(db.whatsAppPoolSender.update({where:{providerPhoneNumberId:"001234"},data:{providerAccountId:"91002"}}),/SENDER_INVENTORY_IDENTITY_IMMUTABLE/);
});
test("re-enable gets fresh verification, exact replay and settings CAS; non-final drains work with credentials/provider down",async()=>{
 await config("92001");let a=await enrol("22001");let b=await enrol("22002");a=await update(a,{allocationEnabled:true});b=await update(b,{allocationEnabled:true});
 const priorChecks=checks;const unavailable={...deps,verify:async()=>{throw new SenderPoolError("PROVIDER_UNAVAILABLE");},snapshot:async()=>{throw new SenderPoolError("CONFIGURATION_UNAVAILABLE");}};
 a=await update(a,{allocationEnabled:false},unavailable);assert.equal(checks,priorChecks);
 a=await update(a,{priority:2147483647},unavailable);assert.equal(a.priority,2147483647);assert.equal(checks,priorChecks);
 await assert.rejects(update(a,{allocationEnabled:true},{...deps,verify:async()=>{throw new SenderPoolError("PROVIDER_UNAVAILABLE");}}),code("PROVIDER_UNAVAILABLE"));
 const enabled=await update(a,{allocationEnabled:true});assert.equal(checks,priorChecks+1);assert.deepEqual(await update(enabled,{}),enabled);assert.equal(checks,priorChecks+1);
 const race=await Promise.allSettled([update(enabled,{priority:2}),update(enabled,{priority:3})]);assert.equal(race.filter(x=>x.status==="fulfilled").length,1);assert.equal(race.filter(x=>x.status==="rejected").length,1);
});
test("rotation during Graph lookup fences both enrolment and enable with no stale write",async()=>{
 await config("93001");await assert.rejects(enrol("23001",0,{...deps,verify:async()=>{await config("93001","20000","rotated-token");}}),code("CONFIGURATION_CHANGED"));assert.equal(await db.whatsAppPoolSender.count({where:{providerPhoneNumberId:"23001"}}),0);
 let row=await enrol("23002");await assert.rejects(update(row,{allocationEnabled:true},{...deps,verify:async()=>{await config("93001","20000","rotated-again");}}),code("CONFIGURATION_CHANGED"));assert.equal((await db.whatsAppPoolSender.findUniqueOrThrow({where:{providerPhoneNumberId:row.providerPhoneNumberId}})).allocationEnabled,false);
});
test("active-pool fence rejects racing final drains and active WABA switch to empty; revoke permits explicit bootstrap",async()=>{
 await config("94001");let a=await enrol("24001"),b=await enrol("24002");a=await update(a,{allocationEnabled:true});b=await update(b,{allocationEnabled:true});
 const outcomes=await Promise.allSettled([update(a,{allocationEnabled:false}),update(b,{allocationEnabled:false})]);assert.equal(outcomes.filter(x=>x.status==="fulfilled").length,1);assert.equal(await db.whatsAppPoolSender.count({where:{providerAccountId:"94001",allocationEnabled:true}}),1);
 const current=await db.platformConfiguration.findUniqueOrThrow({where:{environment_key:{environment:"test",key:"messaging.sender"}}});
 await assert.rejects(mutateSecretWithDependencies({key:"messaging.sender",operation:"update",expectedVersion:current.version,values:{businessAccountId:"94002"}},{db,environment:"test",principal,wrapping}),/enabled verified sender/);
 const last=await db.whatsAppPoolSender.findFirstOrThrow({where:{providerAccountId:"94001",allocationEnabled:true}});
 await db.platformConfiguration.update({where:{environment_key:{environment:"test",key:"messaging.sender"}},data:{value:{kind:"corrupt"},version:{increment:1}}});
 await assert.rejects(update({...last,createdAt:last.createdAt.toISOString(),updatedAt:last.updatedAt.toISOString()},{allocationEnabled:false}),code("CONFIGURATION_UNAVAILABLE"));
 await update({...last,createdAt:last.createdAt.toISOString(),updatedAt:last.updatedAt.toISOString()},{priority:10});
 await disableConfig();const latest=await db.whatsAppPoolSender.findUniqueOrThrow({where:{providerPhoneNumberId:last.providerPhoneNumberId}});await update({...latest,createdAt:latest.createdAt.toISOString(),updatedAt:latest.updatedAt.toISOString()},{allocationEnabled:false});
 await config("94002");let bootstrap=await enrol("24003");bootstrap=await update(bootstrap,{allocationEnabled:true});assert.equal(bootstrap.allocationEnabled,true);
});
test("WABA switch vs target drain serializes on the shared environment fence",async()=>{
 await config("95001");await inventory("25001","95001");const target=await inventory("25002","95002");
 const old=await db.platformConfiguration.findUniqueOrThrow({where:{environment_key:{environment:"test",key:"messaging.sender"}}});
 const outcomes=await Promise.allSettled([
  mutateSecretWithDependencies({key:"messaging.sender",operation:"update",expectedVersion:old.version,values:{businessAccountId:"95002"}},{db,environment:"test",principal,wrapping}),
  update({...target,createdAt:target.createdAt.toISOString(),updatedAt:target.updatedAt.toISOString()},{allocationEnabled:false}),
 ]);assert.equal(outcomes.filter(x=>x.status==="fulfilled").length,1);
 const snapshot=await readSenderPoolWithDependencies(deps);assert.ok(snapshot.rows.some(row=>row.providerAccountId===snapshot.providerAccountId&&row.allocationEnabled));
});
test("pre-launch enrolment accepts historical recoveries regardless of status, receipt evidence or lifetime",async()=>{
 await config("96001","26001");const active=await recovery("26001","96001",1000);
 const enrolled=await enrol("26001");assert.equal(enrolled.allocationEnabled,false);
 assert.equal((await db.checkoutRecovery.findUniqueOrThrow({where:{id:active.basket.id}})).status,"ENGAGED");
 assert.equal((await db.conversationMessage.findUniqueOrThrow({where:{id:active.message.id}})).status,"SENT");
 assert.equal((await enrol("26002")).allocationEnabled,false);
 const expired=await recovery("26003","96001",22*86400000);await enrol("26003");await db.checkoutRecovery.update({where:{id:expired.basket.id},data:{status:"EXPIRED"}});
 assert.equal((await enrol("26003")).providerPhoneNumberId,"26003");
 try {
  await db.backgroundRuntimeConfig.update({where:{id:"default"},data:{checkoutRecoveryLifetimeDays:0}});
  await recovery("26004","96001",1000);assert.equal((await enrol("26004")).allocationEnabled,false);
  await db.backgroundRuntimeConfig.update({where:{id:"default"},data:{checkoutRecoveryLifetimeDays:2147483647}});
  await recovery("26005","96001",100*86400000);assert.equal((await enrol("26005")).allocationEnabled,false);
 } finally {await db.backgroundRuntimeConfig.update({where:{id:"default"},data:{checkoutRecoveryLifetimeDays:21}});}
 const pending=await recovery("26006","96001",1000);
 await db.conversationMessage.delete({where:{id:pending.message.id}});
 await db.conversationMessage.create({data:{conversationId:pending.conversation.id,direction:"OUTBOUND",senderType:"AUTOMATION",content:"not dispatched",status:"PENDING",dispatchProviderAccountId:"96001",dispatchProviderPhoneNumberId:"26006"}});
 assert.equal((await enrol("26006")).allocationEnabled,false);
 assert.equal(await db.conversationMessage.count({where:{conversationId:pending.conversation.id,status:"PENDING"}}),1);
});
test("pre-launch enrolment accepts historical standalone messages without rewriting them",async()=>{
 await config("97001","27001");const legacy=await general("27001","97001",1000,false,true);
 assert.equal((await enrol("27001")).allocationEnabled,false);
 assert.equal((await db.conversation.findUniqueOrThrow({where:{id:legacy.conversation.id}})).outcome,"IN_PROGRESS");
 const flight=await general("27003","97001",30*86400000,true);
 assert.equal((await enrol("27003")).allocationEnabled,false);
 assert.equal((await db.conversationMessage.findUniqueOrThrow({where:{id:flight.message.id}})).status,"PENDING");
 await general("27004","97001",25*3600000);assert.equal((await enrol("27004")).allocationEnabled,false);
 const matched=await general("27005","97001",1000);assert.equal((await enrol("27005")).allocationEnabled,false);
 assert.ok(await db.conversationMessage.findUnique({where:{id:matched.message.id}}));
});
test("enrolment retains the membership lock without rejecting a committed pre-launch dispatch",async()=>{
 await config("98001");const conversation=await db.conversation.create({data:{type:"PRODUCT_SUPPORT"}});
 let release!:()=>void,admitted!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);const ready=new Promise<void>(resolve=>admitted=resolve);
 const permit=db.$transaction(async tx=>{await tx.$queryRaw`WITH locked AS MATERIALIZED (SELECT pg_advisory_xact_lock(hashtextextended('whatsapp-pool-membership:' || ${"28001"}::text,0))) SELECT count(*)::integer AS locked FROM locked`;await tx.conversationMessage.create({data:{conversationId:conversation.id,direction:"OUTBOUND",senderType:"AGENT",content:"fixture permit",status:"PENDING",providerDispatchKey:randomUUID(),providerDispatchControlRevision:0,providerDispatchAdmittedAt:new Date(),dispatchProviderAccountId:"98001",dispatchProviderPhoneNumberId:"28001"}});admitted();await gate;},{timeout:10000});
 await ready;const request=enrol("28001");await delay(50);release();await permit;
 const enrolled=await request;assert.equal(enrolled.allocationEnabled,false);
 assert.equal(await db.whatsAppPoolSender.count({where:{providerPhoneNumberId:"28001"}}),1);
 assert.equal(await db.conversationMessage.count({where:{conversationId:conversation.id,status:"PENDING"}}),1);
 await enrol("28002");await db.$transaction(async tx=>{await tx.$queryRaw`WITH locked AS MATERIALIZED (SELECT pg_advisory_xact_lock(hashtextextended('whatsapp-pool-membership:' || ${"28002"}::text,0))) SELECT count(*)::integer AS locked FROM locked`;assert.ok(await tx.whatsAppPoolSender.findUnique({where:{providerPhoneNumberId:"28002"}}));});
});
test("priority and drain preserve the same-shop shared route, both basket memberships and pending clarification",async()=>{
 await config("99001");let sender=await enrol("29001");sender=await update(sender,{allocationEnabled:true});await inventory("29002","99001");
 const one=await recovery("29001","99001",0);const two=await recovery("29001","99001",0,"ENGAGED",one.shop.id);
 const thread=await db.recoverySenderThread.create({data:{canonicalRecipient:"447000000001",providerPhoneNumberId:"29001"}});
 const route=await db.recoverySenderRoute.create({data:{shopId:one.shop.id,threadId:thread.id,canonicalRecipient:thread.canonicalRecipient,providerPhoneNumberId:"29001"}});
 await db.recoverySenderAssignment.createMany({data:[one,two].map(item=>({conversationId:item.conversation.id,routeId:route.id}))});
 await db.recoveryBasketRoutingTurn.create({data:{inboundProviderMessageId:"sender-pool-pending",threadId:thread.id,occurredAt:new Date(),expiresAt:new Date(Date.now()+3600000),state:"RECEIVED",inputJson:{fixture:true}}});
 const before={thread:await db.recoverySenderThread.findUnique({where:{id:thread.id}}),route:await db.recoverySenderRoute.findUnique({where:{id:route.id}}),members:await db.recoverySenderAssignment.findMany({where:{routeId:route.id},orderBy:{conversationId:"asc"}}),turn:await db.recoveryBasketRoutingTurn.findUnique({where:{inboundProviderMessageId:"sender-pool-pending"}})};
 sender=await update(sender,{priority:20});await update(sender,{allocationEnabled:false});
 assert.deepEqual({thread:await db.recoverySenderThread.findUnique({where:{id:thread.id}}),route:await db.recoverySenderRoute.findUnique({where:{id:route.id}}),members:await db.recoverySenderAssignment.findMany({where:{routeId:route.id},orderBy:{conversationId:"asc"}}),turn:await db.recoveryBasketRoutingTurn.findUnique({where:{inboundProviderMessageId:"sender-pool-pending"}})},before);
 assert.equal(before.members.length,2);
});

test("sender credential rotation preserves CAS/redacted audit and explicit revoke-set bootstrap",async()=>{
 await config("99901");const originalSender=await inventory("29901","99901");
 const current=await db.platformConfiguration.findUniqueOrThrow({where:{environment_key:{environment:"test",key:"messaging.sender"}}});
 const before=await db.platformConfigurationAudit.count();
 const rotated=await mutateSecretWithDependencies({key:"messaging.sender",operation:"rotate",expectedVersion:current.version,values:{accessToken:"rotated-fixture-token"},reason:"scheduled-rotation",confirmation:"ROTATE"},{db,environment:"test",principal,wrapping});
 assert.equal(rotated.version,current.version+1);assert.equal(await db.platformConfigurationAudit.count(),before+1);
 const saved=await db.platformConfiguration.findUniqueOrThrow({where:{environment_key:{environment:"test",key:"messaging.sender"}}});
 assert.deepEqual(JSON.parse(unsealSecret({environment:"test",key:"messaging.sender",version:saved.version,value:saved.value,wrapping})),{accessToken:"rotated-fixture-token",phoneNumberId:"20000",businessAccountId:"99901"});
 assert.deepEqual(await db.whatsAppPoolSender.findUniqueOrThrow({where:{providerPhoneNumberId:"29901"}}),originalSender);
 const audit=await db.platformConfigurationAudit.findFirstOrThrow({where:{resultingVersion:rotated.version,key:"messaging.sender"},orderBy:{createdAt:"desc"}});
 assert.equal(audit.actorId,principal.id);assert.equal(audit.reason,"scheduled-rotation");assert.doesNotMatch(JSON.stringify(audit),/rotated-fixture-token|fixture-only-token|accessToken|businessAccountId/);
 await assert.rejects(mutateSecretWithDependencies({key:"messaging.sender",operation:"update",expectedVersion:current.version,values:{businessAccountId:"99902"}},{db,environment:"test",principal,wrapping}),/Configuration changed/);
 assert.equal(await db.platformConfigurationAudit.count(),before+1);
 const revoked=await mutateSecretWithDependencies({key:"messaging.sender",operation:"revoke",expectedVersion:rotated.version,reason:"decommission",confirmation:"REVOKE"},{db,environment:"test",principal,wrapping});
 await mutateSecretWithDependencies({key:"messaging.sender",operation:"set",expectedVersion:revoked.version,values:{accessToken:"bootstrap-fixture-token",phoneNumberId:"29902",businessAccountId:"99902"}},{db,environment:"test",principal,wrapping});
 assert.equal((await readSenderPoolWithDependencies(deps)).providerAccountId,"99902");assert.equal(await db.whatsAppPoolSender.count({where:{providerAccountId:"99902",allocationEnabled:true}}),0);
});
