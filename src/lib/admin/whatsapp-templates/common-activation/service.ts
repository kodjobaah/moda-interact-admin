import { Prisma, type PrismaClient } from "@prisma/client";
import type { PlatformAdminPrincipal } from "../../../auth/platform-admin";
import { requireTemplateSuperAdmin } from "../authoring/service";
import { digest, isValidKey, isValidFingerprint, reject } from "../publishing/validation";
import { assertFreshPreview } from "../publishing/preview";
import { activateConversationWrapperInTransaction } from "../wrappers/service";
import { lockCommonActivation } from "./gates";
import { previewCommonActivation } from "./preview";
import { assertSnapshotSize, parseCommonSelection, readCommonActivationSnapshot, type CommonActivationConfirmation, type CommonActivationResult, type CommonActivationSnapshot } from "./contracts";

type Db=Pick<PrismaClient,"$transaction">;
/** No provider I/O, page commits or automatic transaction retries. The whole bounded cohort commits once. */
export async function activateCommonRecoveryLayout(input:CommonActivationConfirmation,deps:{db:Db;principal:PlatformAdminPrincipal;ensureActor?:(tx:Prisma.TransactionClient)=>Promise<void>}):Promise<CommonActivationResult>{
  requireTemplateSuperAdmin(deps.principal);
  if(!input||typeof input!=="object"||Object.keys(input).sort().join()!=="acknowledgeOverrides,consumerDeploymentConfirmed,englishContentReviewed,fingerprint,issuedAt,operationKey,reason,selection"||
    !isValidKey(input.operationKey)||input.operationKey.length>128||!isValidFingerprint(input.fingerprint)||input.acknowledgeOverrides!==true||input.consumerDeploymentConfirmed!==true||input.englishContentReviewed!==true||
    typeof input.reason!=="string"||input.reason.trim().length<10||input.reason.length>500)return reject("INPUT","Review the complete cohort, confirm compatible consumers are deployed, and provide an audit reason.");
  const selection=parseCommonSelection(input.selection);
  const requestDigest=digest({...input,selection,reason:input.reason.trim()});
  try{return await deps.db.$transaction(async tx=>{
    await lockCommonActivation(tx);
    const previous=await tx.whatsAppTemplatePublicationOperation.findUnique({where:{operationKey:input.operationKey}});
    if(previous){
      const saved=readCommonActivationSnapshot(previous.scopeSnapshot);
      const {fingerprint,...facts}=saved.manifest;
      if(previous.definitionId!==selection.commonDefinitionId||previous.requestedByAdminId!==deps.principal.id||previous.status!=="COMPLETE"||saved.actorId!==deps.principal.id||saved.requestDigest!==requestDigest||fingerprint!==digest(facts))return reject("COLLISION","The operation key belongs to a different or incomplete activation.");
      return {operationId:previous.id,replay:true,editVersion:saved.editVersion,targetCount:saved.manifest.targetCount};
    }
    assertFreshPreview(input.issuedAt,input.fingerprint);
    // Stable lock order: global advisory, shops, definitions, locales, registrations, variants, slot/config.
    // Row locks also fence non-Admin provider observations and privacy cascade deletes.
    const shopIds=[...new Set(selection.replacements.flatMap(r=>r.shopIds))].sort();
    if(shopIds.length) await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "commerce"."Shop" WHERE "id" IN (${Prisma.join(shopIds)}) ORDER BY "id" FOR UPDATE`);
    const definitionIds=[selection.commonDefinitionId,...selection.replacements.map(r=>r.definitionId)].sort();
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "whatsapp"."WhatsAppTemplateDefinition" WHERE "id" IN (${Prisma.join(definitionIds)}) ORDER BY "id" FOR UPDATE`);
    const lockedLocales = await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT "id" FROM "whatsapp"."WhatsAppTemplateLocale" WHERE "definitionId" IN (${Prisma.join(definitionIds)}) ORDER BY "id" LIMIT 141 FOR UPDATE`);
    if (lockedLocales.length > 140) return reject("BOUNDED_SCOPE", "Unexpected locale rows exceed the complete activation bound.");
    const lockedRegistrations = await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT r."id" FROM "whatsapp"."WhatsAppTemplateMetaRegistration" r JOIN "whatsapp"."WhatsAppTemplateLocale" l ON l."id"=r."localeId" WHERE l."definitionId" IN (${Prisma.join(definitionIds)}) OR r."id" IN (SELECT "metaRegistrationId" FROM "whatsapp"."WhatsAppTemplateVariant" WHERE "enabled"=true AND "status"='APPROVED') ORDER BY r."id" LIMIT 2001 FOR UPDATE OF r`);
    if (lockedRegistrations.length > 2000) return reject("BOUNDED_SCOPE", "Registration locks exceed the complete activation bound.");
    await tx.$queryRaw`SELECT "id" FROM "whatsapp"."WhatsAppTemplateVariant" WHERE "enabled"=true AND "status"='APPROVED' ORDER BY "id" LIMIT 1001 FOR UPDATE`;
    await tx.$queryRaw`SELECT "audience" FROM "whatsapp"."WhatsAppConversationWrapperActiveSlot" ORDER BY "audience" FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "public"."PlatformConfiguration" WHERE "key"='messaging.sender' FOR SHARE`;
    const manifest=await previewCommonActivation(tx,selection,input.issuedAt);
    if(manifest.fingerprint!==input.fingerprint)return reject("STALE_PREVIEW","The common source, cohort, sender or approvals changed. Review again; nothing was switched.");
    await deps.ensureActor?.(tx);
    const expected=manifest.expectedSharedPointer;
    const editVersion=expected?.definitionId===selection.commonDefinitionId?expected.editVersion:(expected?.editVersion??0)+1;
    const snapshot:CommonActivationSnapshot={schemaVersion:2,kind:"COMMON_RECOVERY_ACTIVATION",requestDigest,actorId:deps.principal.id,manifest,reason:input.reason.trim(),acknowledgeOverrides:true,consumerDeploymentConfirmed:true,englishContentReviewed:true,editVersion};
    assertSnapshotSize(snapshot);
    const coordinator=await tx.whatsAppTemplatePublicationOperation.create({data:{definitionId:selection.commonDefinitionId,requestedByAdminId:deps.principal.id,operationKey:input.operationKey,
      scopeSnapshot:snapshot as unknown as Prisma.InputJsonValue,status:"COMPLETE",totalTargets:manifest.targetCount,succeededTargets:manifest.targetCount,completedAt:new Date()}});
    for(const group of manifest.definitions){
      const source=group.source;
      if(group.englishReview.status==="SOURCE_SAVED"){
        const reviewed=await tx.whatsAppTemplateLocale.updateMany({where:{id:group.englishReview.localeId,definitionId:source.id,languageTag:"en",status:"SOURCE_SAVED",contentHash:group.englishReview.contentHash},data:{status:"REVIEWED",reviewedByAdminId:deps.principal.id,reviewedAt:new Date()}});
        if(reviewed.count!==1)return reject("STALE_PREVIEW","The reviewed English source changed.");
        await tx.commerceAuditEvent.create({data:{actorType:"PLATFORM_ADMIN",actorAdminId:deps.principal.id,action:"REVIEW_WHATSAPP_TEMPLATE_LOCALE",operationId:`common-english:${digest([coordinator.id,source.id])}`,reason:input.reason.trim(),metadata:{coordinatorId:coordinator.id,definitionId:source.id,languageTag:"en",contentHash:group.englishReview.contentHash,decision:"APPROVE"}}});
      }
      const child=await tx.whatsAppTemplatePublicationOperation.create({data:{definitionId:source.id,requestedByAdminId:deps.principal.id,operationKey:`common-child-${digest([coordinator.id,source.id])}`,
        scopeSnapshot:{schemaVersion:2,kind:"COMMON_RECOVERY_ACTIVATION_CHILD",coordinatorId:coordinator.id},status:"COMPLETE",totalTargets:group.shopIds.length*20,succeededTargets:group.shopIds.length*20,completedAt:new Date()}});
      for(const shopId of group.shopIds)for(const locale of source.locales){
        const old=manifest.variants.filter(v=>v.shopId===shopId&&v.languageTag===locale.languageTag&&v.replacementDefinitionId===source.id);
        const disabled=await tx.whatsAppTemplateVariant.updateMany({where:{id:{in:old.map(v=>v.id)},enabled:true,status:"APPROVED"},data:{enabled:false}});
        if(disabled.count!==old.length)return reject("STALE_PREVIEW","An assignment changed during activation.");
        const identity={shopId,providerAccountId:source.wabaId,purpose:source.purpose,providerTemplateName:locale.providerTemplateName,providerLanguageCode:locale.providerLanguageCode};
        const existing=await tx.whatsAppTemplateVariant.findUnique({where:{shopId_providerAccountId_purpose_providerTemplateName_providerLanguageCode:identity}});
        if(existing&&existing.metaRegistrationId!==locale.registrationId)return reject("CONFLICT","A different registration already owns the replacement provider identity.");
        const data={metaRegistrationId:locale.registrationId,providerTemplateId:locale.providerTemplateId,languageTag:locale.languageTag,status:"APPROVED" as const,enabled:true};
        const next=existing?await tx.whatsAppTemplateVariant.update({where:{id:existing.id},data}):await tx.whatsAppTemplateVariant.create({data:{...identity,...data}});
        await tx.whatsAppTemplatePublicationTarget.create({data:{operationId:child.id,shopId,languageTag:locale.languageTag,metaRegistrationId:locale.registrationId,previousVariantId:old[0]?.id,newVariantId:next.id,status:"SUCCEEDED",processedAt:new Date()}});
        await tx.commerceAuditEvent.create({data:{actorType:"PLATFORM_ADMIN",actorAdminId:deps.principal.id,shopId,action:"ASSIGN_WHATSAPP_TEMPLATE_DEFINITION",operationId:`common:${digest([coordinator.id,shopId,source.id,locale.languageTag])}`,reason:input.reason.trim(),metadata:{coordinatorId:coordinator.id,publicationOperationId:child.id,definitionId:source.id,languageTag:locale.languageTag,previousVariantIds:old.map(v=>v.id),newVariantId:next.id,metaRegistrationId:locale.registrationId}}});
      }
      await tx.whatsAppTemplateDefinition.updateMany({where:{id:source.id,publishedAt:null},data:{status:"PUBLISHED",publishedAt:new Date()}});
    }
    const activated=await activateConversationWrapperInTransaction({audience:"SHARED",definitionId:selection.commonDefinitionId,expectedDefinitionId:expected?.definitionId??null,expectedVersion:expected?.editVersion??null,reason:input.reason},
      {tx,principal:deps.principal,coordinatedCommonActivation:true,auditMetadata:{commonActivationCoordinatorId:coordinator.id,cohortFingerprint:manifest.fingerprint}});
    if(activated.editVersion!==editVersion)return reject("INTEGRITY","Common pointer version did not match the reviewed activation.");
    await tx.commerceAuditEvent.create({data:{actorType:"PLATFORM_ADMIN",actorAdminId:deps.principal.id,action:"PUBLISH_WHATSAPP_TEMPLATE_DEFINITION",operationId:coordinator.id,reason:input.reason.trim(),metadata:{coordinatorId:coordinator.id,commonDefinitionId:selection.commonDefinitionId,cohortFingerprint:manifest.fingerprint,targetCount:manifest.targetCount,consumerDeploymentConfirmed:true}}});
    return {operationId:coordinator.id,replay:false,editVersion,targetCount:manifest.targetCount};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,maxWait:10_000,timeout:30_000});}
  catch(error){if(error&&typeof error==="object"&&"code"in error&&["P2034","P2002","P2028"].includes(String(error.code)))return reject("CONFLICT","Activation conflicted or timed out. Review current state before retrying; the transaction was not partially committed.");throw error;}
}
