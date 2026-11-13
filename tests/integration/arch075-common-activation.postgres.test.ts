import assert from "node:assert/strict";
import {test,after} from "node:test";
import {randomUUID} from "node:crypto";
import {PrismaClient,type Prisma} from "@prisma/client";
import {layoutAst} from "../fixtures/arch075-common-layout.ts";
import {saveEnglishTemplate} from "../../src/lib/admin/whatsapp-templates/authoring/service.ts";
import {RECOVERY_SCENARIOS} from "../../src/lib/admin/whatsapp-templates/authoring/scenarios.ts";
import {readSavedCommonLayout} from "../../src/lib/admin/whatsapp-templates/authoring/common-layout-repository.ts";
import {compileTemplateAst} from "../../src/lib/admin/whatsapp-templates/authoring/compiler.ts";
import type {MetaTemplateAst} from "../../src/lib/admin/whatsapp-templates/authoring/types.ts";
import {templateHash} from "../../src/lib/admin/whatsapp-templates/authoring/identifiers.ts";
import {REVIEW_LANGUAGES} from "../../src/lib/admin/whatsapp-templates/compilation/language-codes.ts";
import {expectedProviderLanguageCode} from "../../src/lib/admin/whatsapp-templates/meta/languages.ts";
import {frozenLocaleSnapshot} from "../../src/lib/admin/whatsapp-templates/meta/snapshot.ts";
import {observedMetaContentHash} from "../../src/lib/admin/whatsapp-templates/publishing/validation.ts";
import {previewCommonActivation} from "../../src/lib/admin/whatsapp-templates/common-activation/preview.ts";
import {activateCommonRecoveryLayout} from "../../src/lib/admin/whatsapp-templates/common-activation/service.ts";
import {assertCommonSourceGate} from "../../src/lib/admin/whatsapp-templates/common-activation/gates.ts";
import {activateConversationWrapper} from "../../src/lib/admin/whatsapp-templates/wrappers/service.ts";
import {progressForOperation} from "../../src/lib/admin/whatsapp-templates/publishing/operation.ts";
if(process.env.ARCH047_DISPOSABLE_POSTGRES!=="1"||new URL(process.env.DATABASE_URL!).hostname!=="127.0.0.1")throw Error("Disposable localhost fixture required");
const db=new PrismaClient();after(()=>db.$disconnect());const waba="1234567890";process.env.WHATSAPP_BUSINESS_ACCOUNT_ID=waba;
const id="activation-"+randomUUID();const principal={id,role:"SUPER_ADMIN" as const,developmentBypass:false};
const json=(v:unknown)=>v as Prisma.InputJsonValue;
async function common(label="Welcome to "){
 const sourceAst=layoutAst();sourceAst.header[0]={type:"text",value:label};
 const saved=await saveEnglishTemplate({submissionId:randomUUID(),draft:sourceAst},{db,principal});
 for(const languageTag of REVIEW_LANGUAGES.filter(t=>t!=="en")){
  const ast=structuredClone(sourceAst);if(languageTag==="fr")ast.header[0]={type:"text",value:"Bienvenue chez "};const prepared=compileTemplateAst(ast);
  await db.whatsAppTemplateLocale.create({data:{definitionId:saved.id,languageTag,localeAst:json({schemaVersion:1,authoring:ast,prepared}),contentHash:templateHash(prepared),status:"REVIEWED",reviewedAt:new Date(),reviewedByAdminId:id}});
 }return saved.id;
}
async function meta(commonId?:string){
 const draft:MetaTemplateAst=structuredClone(RECOVERY_SCENARIOS.find(s=>s.draft.stage==="FOLLOW_UP"&&s.draft.offerType==="NO_OFFER")!.draft);
 if(commonId){draft.commonLayout=await readSavedCommonLayout(db,commonId,"en");draft.shopBrandMediaRole="LOGO";draft.header=[];}
 const saved=await saveEnglishTemplate({submissionId:randomUUID(),draft},{db,principal});
 for(const tag of REVIEW_LANGUAGES.filter(t=>t!=="en")){
  const ast=structuredClone(draft);if(commonId)ast.commonLayout=await readSavedCommonLayout(db,commonId,tag);const prepared=compileTemplateAst(ast);
  await db.whatsAppTemplateLocale.create({data:{definitionId:saved.id,languageTag:tag,providerLanguageCode:expectedProviderLanguageCode(tag),localeAst:json({schemaVersion:1,authoring:ast,prepared}),contentHash:templateHash(prepared),status:"REVIEWED",reviewedAt:new Date(),reviewedByAdminId:id}});
 }
 const definition=await db.whatsAppTemplateDefinition.findUniqueOrThrow({where:{id:saved.id},include:{locales:true}});
 for(const locale of definition.locales){const frozen=frozenLocaleSnapshot(locale,definition);await db.whatsAppTemplateMetaRegistration.create({data:{localeId:locale.id,wabaId:waba,providerTemplateName:definition.providerTemplateName!,providerLanguageCode:frozen.providerLanguageCode,category:"MARKETING",componentsSnapshot:json(frozen.components),parameterBindingsSnapshot:json(frozen.bindings),submittedContentHash:frozen.contentHash,providerTemplateId:String(Number.parseInt(templateHash(saved.id).slice(0, 12), 16) + REVIEW_LANGUAGES.indexOf(locale.languageTag)),providerStatus:"APPROVED",submissionState:"SUBMITTED",lastObservedContentHash:observedMetaContentHash(frozen.components),lastObservedCategory:"MARKETING",lastReconciledAt:new Date()}});}
 return definition;
}
test("complete conservative cohort commits with English review, rollback, CAS conflicts and immutable replay",async()=>{
 await db.platformAdmin.create({data:{id,provider:"fixture",providerSubject:id,email:id+"@example.invalid",displayName:"Fixture",role:"SUPER_ADMIN",active:true}});
 const commonId=await common();const original=await meta();const replacement=await meta(commonId);
 const shops=[id+"-active",id+"-inactive"];
 await db.shop.createMany({data:shops.map((shopId,i)=>({id:shopId,domain:`${shopId}.example.invalid`,platform:"SHOPIFY",status:i?"SUSPENDED":"ACTIVE"}))});
 const registrations=await db.whatsAppTemplateMetaRegistration.findMany({where:{locale:{definitionId:original.id}},include:{locale:true}});
 for(const shopId of shops)for(const reg of registrations)await db.whatsAppTemplateVariant.create({data:{shopId,providerAccountId:waba,purpose:"FOLLOW_UP_NO_OFFER",languageTag:reg.locale.languageTag,providerLanguageCode:reg.providerLanguageCode,providerTemplateName:reg.providerTemplateName,providerTemplateId:reg.providerTemplateId,metaRegistrationId:reg.id,status:"APPROVED",enabled:true}});
 const selection={commonDefinitionId:commonId,replacements:[{definitionId:replacement.id,shopIds:shops}]};
 const first=await previewCommonActivation(db,selection);assert.equal(first.variants.length,40);assert.equal(first.shops[1].status,"SUSPENDED");assert.equal(first.targetCount,40);assert.equal(first.missingScenarios.length,5);
 await assert.rejects(previewCommonActivation(db,{...selection,replacements:[{definitionId:replacement.id,shopIds:[shops[0]]}]}),/every shop/);
 const input={selection,issuedAt:first.issuedAt,fingerprint:first.fingerprint,operationKey:randomUUID(),reason:"Review exact English source and all immutable replacements",acknowledgeOverrides:true as const,consumerDeploymentConfirmed:true as const,englishContentReviewed:true as const};
 await db.whatsAppTemplateDefinition.update({where:{id:commonId},data:{status:"RETIRED",retiredAt:new Date()}});
 await assert.rejects(activateCommonRecoveryLayout(input,{db,principal}),/not ready/);
 assert.equal(await db.whatsAppTemplatePublicationOperation.count(),0);
 await db.whatsAppTemplateDefinition.update({where:{id:commonId},data:{status:"SAVED",retiredAt:null}});
 const french=await db.whatsAppTemplateLocale.findUniqueOrThrow({where:{definitionId_languageTag:{definitionId:commonId,languageTag:"fr"}}});
 // Corrupt stored hash only in this disposable fixture; never normalize it during activation.
 await db.whatsAppTemplateLocale.update({where:{id:french.id},data:{contentHash:"f".repeat(64)}});
 await assert.rejects(activateCommonRecoveryLayout(input,{db,principal}),/not ready/);
 assert.equal(await db.whatsAppTemplatePublicationOperation.count(),0);
 await db.whatsAppTemplateLocale.update({where:{id:french.id},data:{contentHash:french.contentHash}});
 const english=await db.whatsAppTemplateLocale.findUniqueOrThrow({where:{definitionId_languageTag:{definitionId:replacement.id,languageTag:"en"}}});assert.equal(english.status,"SOURCE_SAVED");
 // Late injected audit failure proves actual PostgreSQL rollback after English status and all assignments changed.
 const failDb={$transaction:<T>(work:(tx:Prisma.TransactionClient)=>Promise<T>,options:object)=>db.$transaction(tx=>work(new Proxy(tx,{get(target,key){if(key==="commerceAuditEvent")return {...target.commerceAuditEvent,create:async(args:Prisma.CommerceAuditEventCreateArgs)=>{if(args.data.action==="ACTIVATE_WHATSAPP_CONVERSATION_WRAPPER")throw Error("late audit failure");return target.commerceAuditEvent.create(args);}};return Reflect.get(target,key);}})),options)};
 await assert.rejects(activateCommonRecoveryLayout(input,{db:failDb as unknown as Pick<PrismaClient,"$transaction">,principal}),/late audit failure/);
 assert.equal(await db.whatsAppTemplatePublicationOperation.count(),0);assert.equal(await db.whatsAppConversationWrapperActiveSlot.count(),0);
 assert.equal(await db.whatsAppTemplateVariant.count({where:{enabled:true}}),40);assert.deepEqual(await db.whatsAppTemplateLocale.findUniqueOrThrow({where:{id:english.id}}),english);
 const selectedReg=await db.whatsAppTemplateMetaRegistration.findFirstOrThrow({where:{locale:{definitionId:replacement.id}}});
 await db.whatsAppTemplateMetaRegistration.update({where:{id:selectedReg.id},data:{providerStatus:"PAUSED"}});
 await assert.rejects(activateCommonRecoveryLayout(input,{db,principal}),/approval|registration/i);
 await db.whatsAppTemplateMetaRegistration.update({where:{id:selectedReg.id},data:{providerStatus:"APPROVED"}});
 const pending=await db.whatsAppTemplateMetaEvent.create({data:{eventIdentity:randomUUID(),registrationId:selectedReg.id,source:"META_WEBHOOK",eventType:"STATUS",outcome:"RECONCILIATION_PENDING",wabaId:waba}});
 await assert.rejects(previewCommonActivation(db,selection),/observation/);await db.whatsAppTemplateMetaEvent.delete({where:{id:pending.id}});
 const variant=await db.whatsAppTemplateVariant.findFirstOrThrow();
 await db.whatsAppTemplateVariant.update({where:{id:variant.id},data:{providerAccountId:"9999999999"}});
 await assert.rejects(previewCommonActivation(db,selection),/provider or legacy/);
 await db.whatsAppTemplateVariant.update({where:{id:variant.id},data:{providerAccountId:waba}});
 await assert.rejects(activateCommonRecoveryLayout(input,{db,principal}),/changed/);
 const fresh=await previewCommonActivation(db,selection);const next={...input,issuedAt:fresh.issuedAt,fingerprint:fresh.fingerprint};
 await assert.rejects(activateConversationWrapper({audience:"SHARED",definitionId:commonId,expectedDefinitionId:null,expectedVersion:null,reason:input.reason},{db,principal}),/coordinated/);
 const attempts=[next,{...next,operationKey:randomUUID()}];const outcomes=await Promise.allSettled(attempts.map(request=>activateCommonRecoveryLayout(request,{db,principal})));
 assert.equal(outcomes.filter(result=>result.status==="fulfilled").length,1);const winner=outcomes.findIndex(result=>result.status==="fulfilled");const result=(outcomes[winner] as PromiseFulfilledResult<Awaited<ReturnType<typeof activateCommonRecoveryLayout>>>).value;
 assert.equal(result.editVersion,1);assert.equal(await db.whatsAppTemplatePublicationTarget.count(),40);assert.equal(await db.whatsAppTemplateVariant.count({where:{enabled:true}}),40);
 const reviewed=await db.whatsAppTemplateLocale.findUniqueOrThrow({where:{id:english.id}});assert.equal(reviewed.status,"REVIEWED");assert.equal(reviewed.reviewedByAdminId,id);assert.deepEqual(reviewed.localeAst,english.localeAst);assert.equal(reviewed.contentHash,english.contentHash);
 assert.equal((await db.whatsAppTemplateLocale.findUniqueOrThrow({where:{definitionId_languageTag:{definitionId:commonId,languageTag:"en"}}})).status,"SOURCE_SAVED");
 assert.equal((await db.shop.findUniqueOrThrow({where:{id:shops[1]}})).status,"SUSPENDED");
 const auditCount=await db.commerceAuditEvent.count();assert.equal((await activateCommonRecoveryLayout(attempts[winner],{db,principal})).replay,true);assert.equal(await db.commerceAuditEvent.count(),auditCount);
 await assert.rejects(activateCommonRecoveryLayout({...attempts[winner],reason:"Different reviewed operation reason"},{db,principal}),/operation key/);
 await assert.rejects(progressForOperation(db,result.operationId),/snapshot/);
 await assert.rejects(db.$transaction(tx=>assertCommonSourceGate(tx,original.id,"submission")),/Clone|exact English/);
 await assert.rejects(db.$transaction(tx=>assertCommonSourceGate(tx,original.id,"assignment")),/Clone|exact English/);
 await db.$transaction(tx=>assertCommonSourceGate(tx,replacement.id,"assignment"));
 await db.whatsAppTemplateLocale.update({where:{id:english.id},data:{status:"SOURCE_SAVED",reviewedAt:null,reviewedByAdminId:null}});
 await assert.rejects(db.$transaction(tx=>assertCommonSourceGate(tx,replacement.id,"assignment")),/exact English/);
 await db.$transaction(tx=>assertCommonSourceGate(tx,replacement.id,"submission"));
 await db.whatsAppTemplateLocale.update({where:{id:english.id},data:{status:reviewed.status,reviewedAt:reviewed.reviewedAt,reviewedByAdminId:reviewed.reviewedByAdminId}});
});

test("empty exact Meta cohort switches only the common pointer with audit and replay",async()=>{
 await db.whatsAppTemplateVariant.updateMany({data:{enabled:false}});
 const commonId=await common("A different reviewed welcome to ");
 const selection={commonDefinitionId:commonId,replacements:[]};
 const preview=await previewCommonActivation(db,selection);assert.equal(preview.targetCount,0);assert.equal(preview.variants.length,0);assert.equal(preview.shops.length,0);
 const before=await db.whatsAppTemplatePublicationTarget.count();
 const input={selection,issuedAt:preview.issuedAt,fingerprint:preview.fingerprint,operationKey:randomUUID(),reason:"Reviewed common layout with no Meta assignments",acknowledgeOverrides:true as const,consumerDeploymentConfirmed:true as const,englishContentReviewed:true as const};
 const result=await activateCommonRecoveryLayout(input,{db,principal});assert.equal(result.editVersion,2);assert.equal(result.targetCount,0);
 assert.equal((await db.whatsAppConversationWrapperActiveSlot.findUniqueOrThrow({where:{audience:"SHARED"}})).definitionId,commonId);
 assert.equal(await db.whatsAppTemplatePublicationTarget.count(),before);assert.equal(await db.whatsAppTemplateVariant.count({where:{enabled:true}}),0);
 assert.equal((await activateCommonRecoveryLayout(input,{db,principal})).replay,true);
});
