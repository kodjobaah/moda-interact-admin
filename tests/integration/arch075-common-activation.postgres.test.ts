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
import {readMetaStatus} from "../../src/lib/admin/whatsapp-templates/meta/status.ts";
import {hasMetaProviderDrift} from "../../src/lib/admin/whatsapp-templates/meta/contracts.ts";
import {NBSP_NORMALIZATION_KIND} from "../fixtures/arch075-meta-nbsp.ts";
import {progressForOperation} from "../../src/lib/admin/whatsapp-templates/publishing/operation.ts";
if(process.env.ARCH047_DISPOSABLE_POSTGRES!=="1"||new URL(process.env.DATABASE_URL!).hostname!=="127.0.0.1")throw Error("Disposable localhost fixture required");
const db=new PrismaClient();after(()=>db.$disconnect());const waba="1234567890";process.env.DEPLOYMENT_ENVIRONMENT_NAME="test";process.env.WHATSAPP_BUSINESS_ACCOUNT_ID=waba;
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
async function meta(commonId?:string, image=true){
 const draft:MetaTemplateAst=structuredClone(RECOVERY_SCENARIOS.find(s=>s.draft.stage==="FOLLOW_UP"&&s.draft.offerType==="NO_OFFER")!.draft);
 draft.footer=[{type:"text",value:"Reply STOP to opt out."}];
 if(commonId)draft.commonLayout=await readSavedCommonLayout(db,commonId,"en");
 if(image){draft.shopBrandMediaRole="LOGO";draft.header=[];}
 const saved=await saveEnglishTemplate({submissionId:randomUUID(),draft},{db,principal});
 for(const tag of REVIEW_LANGUAGES.filter(t=>t!=="en")){
  const ast=structuredClone(draft);if(tag==="fr")ast.body.unshift({type:"text",value:"Boutique\u00a0: Exemple\nPanier\u00a0: "});if(commonId)ast.commonLayout=await readSavedCommonLayout(db,commonId,tag);const prepared=compileTemplateAst(ast);
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
 // Simulate only the output receipt of BG017's separately tested bounded reconciliation.
 // Admin never proves equivalence or rewrites either immutable snapshot/hash.
 const fr=await db.whatsAppTemplateMetaRegistration.findFirstOrThrow({where:{locale:{definitionId:replacement.id,languageTag:"fr"}},include:{locale:true}});
 const immutable={components:fr.componentsSnapshot,bindings:fr.parameterBindingsSnapshot,submittedHash:fr.submittedContentHash,locale:fr.locale,sourceHash:replacement.sourceHash};
 const expectedRaw=observedMetaContentHash(fr.componentsSnapshot);
 const actualComponents=structuredClone(fr.componentsSnapshot) as Array<Record<string,unknown>>;
 const actualBody=actualComponents.find(c=>c.type==="BODY")!;assert.match(String(actualBody.text),/\u00a0/);
 actualBody.text=String(actualBody.text).replaceAll("\u00a0"," ");
 const actualRaw=observedMetaContentHash(actualComponents);assert.notEqual(actualRaw,expectedRaw);
 await db.whatsAppTemplateMetaRegistration.update({where:{id:fr.id},data:{lastObservedContentHash:actualRaw}});
 assert.equal(hasMetaProviderDrift((await readMetaStatus(replacement.id,{db,principal})).registrations.find(r=>r.languageTag==="fr")!),true);
 await assert.rejects(previewCommonActivation(db,selection),/approval|content/i);
 for(const data of [{lastObservedContentHash:expectedRaw,lastObservedCategory:"UTILITY"},
  {lastObservedContentHash:expectedRaw,lastObservedCategory:"MARKETING",driftDetectedAt:new Date()},
  {lastObservedContentHash:observedMetaContentHash([{type:"BODY",text:"Substantive changed offer"}]),lastObservedCategory:"MARKETING",driftDetectedAt:null}]){
  await db.whatsAppTemplateMetaRegistration.update({where:{id:fr.id},data});
  await assert.rejects(previewCommonActivation(db,selection),/approval|content/i);
 }
 await db.whatsAppTemplateMetaRegistration.update({where:{id:fr.id},data:{lastObservedContentHash:expectedRaw,lastObservedCategory:"MARKETING",driftDetectedAt:null,lastReconciledAt:new Date(Date.now()-2*60*60_000)}});
 await assert.rejects(previewCommonActivation(db,selection),/current provider reconciliation/i);
 const receipt=await db.whatsAppTemplateMetaEvent.create({data:{registrationId:fr.id,eventIdentity:randomUUID(),source:"BACKGROUND",eventType:"RECONCILE",outcome:"CURRENT",wabaId:waba,requestDigest:fr.submittedContentHash,processedAt:new Date(),evidence:{normalizationKind:NBSP_NORMALIZATION_KIND,rawObservedContentHash:actualRaw,expectedContentHash:expectedRaw}}});
 await db.whatsAppTemplateMetaRegistration.update({where:{id:fr.id},data:{lastReconciledAt:new Date()}});
 const status=await readMetaStatus(replacement.id,{db,principal});const frStatus=status.registrations.find(r=>r.languageTag==="fr")!;
 assert.equal(frStatus.expectedProviderContentHash,expectedRaw);assert.equal(frStatus.lastObservedContentHash,expectedRaw);assert.equal(hasMetaProviderDrift(frStatus),false);
 assert.ok(!JSON.stringify(status).includes(actualRaw),"Actual observation evidence remains server-side; status receives only the raw-domain representative");
 assert.deepEqual((await db.whatsAppTemplateMetaEvent.findUniqueOrThrow({where:{id:receipt.id}})).evidence,{normalizationKind:NBSP_NORMALIZATION_KIND,rawObservedContentHash:actualRaw,expectedContentHash:expectedRaw});
 const unchanged=await db.whatsAppTemplateMetaRegistration.findUniqueOrThrow({where:{id:fr.id},include:{locale:true}});
 assert.deepEqual({components:unchanged.componentsSnapshot,bindings:unchanged.parameterBindingsSnapshot,submittedHash:unchanged.submittedContentHash,locale:unchanged.locale,sourceHash:(await db.whatsAppTemplateDefinition.findUniqueOrThrow({where:{id:replacement.id}})).sourceHash},immutable);
 const first=await previewCommonActivation(db,selection);assert.equal(first.variants.length,40);assert.equal(first.shops[1].status,"SUSPENDED");assert.equal(first.targetCount,40);assert.equal(first.missingScenarios.length,5);
 assert.equal(first.definitions.find(d=>d.source.id===replacement.id)!.registrationFacts.find(r=>r.id===fr.id)!.observedHash,expectedRaw);
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

test("platform defaults require explicit compatible replacements even with no merchant assignments; commit and rollback with SHARED", async () => {
 const previous = await db.whatsAppConversationWrapperActiveSlot.findUniqueOrThrow({where:{audience:"SHARED"}});
 const old = await meta(previous.definitionId);
 const nextCommonId = await common("A new platform defaults layout for ");
 const next = await meta(nextCommonId);
 const oldText = await meta(previous.definitionId, false), nextText = await meta(nextCommonId, false);
 for (const definition of [old, next, oldText, nextText]) {
  await db.whatsAppTemplateLocale.updateMany({where:{definitionId:definition.id,languageTag:"en"},data:{status:"REVIEWED",reviewedAt:new Date(),reviewedByAdminId:id}});
 }
 await db.whatsAppTemplateDefinition.updateMany({where:{id:{in:[old.id,oldText.id]}},data:{status:"PUBLISHED",publishedAt:new Date()}});
 const pointer=await db.whatsAppRecoveryTemplateDefault.create({data:{wabaId:waba,purpose:"FOLLOW_UP_NO_OFFER",format:"IMAGE",definitionId:old.id,updatedByAdminId:id}});
 const textPointer=await db.whatsAppRecoveryTemplateDefault.create({data:{wabaId:waba,purpose:"FOLLOW_UP_NO_OFFER",format:"TEXT",definitionId:oldText.id,updatedByAdminId:id}});
 const bare={commonDefinitionId:nextCommonId,replacements:[]};
 await assert.rejects(previewCommonActivation(db,bare),/every configured platform default/);
 await assert.rejects(previewCommonActivation(db,{...bare,defaultReplacements:[{defaultId:pointer.id,definitionId:old.id},{defaultId:textPointer.id,definitionId:nextText.id}]}),/selected common revision/);
 await assert.rejects(previewCommonActivation(db,{...bare,defaultReplacements:[{defaultId:pointer.id,definitionId:nextText.id},{defaultId:textPointer.id,definitionId:nextText.id}]}),/same purpose, format and WABA/);
 const selection={...bare,defaultReplacements:[{defaultId:pointer.id,definitionId:next.id},{defaultId:textPointer.id,definitionId:nextText.id}]};
 const registration=await db.whatsAppTemplateMetaRegistration.findFirstOrThrow({where:{locale:{definitionId:next.id}}});
 await db.whatsAppTemplateMetaRegistration.update({where:{id:registration.id},data:{providerStatus:"PAUSED"}});
 await assert.rejects(previewCommonActivation(db,selection),/approval|registration/i);
 await db.whatsAppTemplateMetaRegistration.update({where:{id:registration.id},data:{providerStatus:"APPROVED"}});
 const preview=await previewCommonActivation(db,selection);
 assert.equal(preview.targetCount,0);assert.equal(preview.defaults?.length,2);
 assert.deepEqual(preview.defaults?.map(d=>[d.format,d.previousDefinitionId,d.source.id]).sort(),[["IMAGE",old.id,next.id],["TEXT",oldText.id,nextText.id]]);
 const input={selection,issuedAt:preview.issuedAt,fingerprint:preview.fingerprint,operationKey:randomUUID(),reason:"Reviewed all default locales and the new common revision",acknowledgeOverrides:true as const,consumerDeploymentConfirmed:true as const,englishContentReviewed:true as const};
 const count=await db.whatsAppTemplatePublicationOperation.count();
 const beforeTargets=await db.whatsAppTemplatePublicationTarget.count();
 const failDb={$transaction:<T>(work:(tx:Prisma.TransactionClient)=>Promise<T>,options:object)=>db.$transaction(tx=>work(new Proxy(tx,{get(target,key){if(key==="commerceAuditEvent")return {...target.commerceAuditEvent,create:async(args:Prisma.CommerceAuditEventCreateArgs)=>{if(args.data.action==="ACTIVATE_WHATSAPP_CONVERSATION_WRAPPER")throw Error("default rollback fixture");return target.commerceAuditEvent.create(args);}};return Reflect.get(target,key);}})),options)};
 await assert.rejects(activateCommonRecoveryLayout(input,{db:failDb as unknown as Pick<PrismaClient,"$transaction">,principal}),/default rollback fixture/);
 assert.deepEqual(await db.whatsAppRecoveryTemplateDefault.findUniqueOrThrow({where:{id:pointer.id}}),pointer);
 assert.deepEqual(await db.whatsAppRecoveryTemplateDefault.findUniqueOrThrow({where:{id:textPointer.id}}),textPointer);
 assert.deepEqual(await db.whatsAppConversationWrapperActiveSlot.findUniqueOrThrow({where:{audience:"SHARED"}}),previous);
 assert.equal(await db.whatsAppTemplatePublicationOperation.count(),count);
 const result=await activateCommonRecoveryLayout(input,{db,principal});
 assert.equal(result.targetCount,0);
 assert.equal((await db.whatsAppRecoveryTemplateDefault.findUniqueOrThrow({where:{id:pointer.id}})).definitionId,next.id);
 assert.equal((await db.whatsAppRecoveryTemplateDefault.findUniqueOrThrow({where:{id:textPointer.id}})).definitionId,nextText.id);
 assert.equal((await db.whatsAppTemplateDefinition.findUniqueOrThrow({where:{id:next.id}})).status,"PUBLISHED");
 assert.equal((await db.whatsAppConversationWrapperActiveSlot.findUniqueOrThrow({where:{audience:"SHARED"}})).definitionId,nextCommonId);
 assert.equal(await db.whatsAppTemplatePublicationTarget.count(),beforeTargets);assert.equal(await db.whatsAppTemplateVariant.count({where:{enabled:true}}),0);
 const audits=await db.commerceAuditEvent.count();
 assert.equal((await activateCommonRecoveryLayout(input,{db,principal})).replay,true);assert.equal(await db.commerceAuditEvent.count(),audits);
});
