import type { Prisma } from "@prisma/client";
import { readSavedCommonLayout } from "../authoring/common-layout-repository";
import { requireCommonLayout } from "../authoring/common-layout";
import { approvedSource } from "../publishing/source";
import { configuredSenderWaba } from "../publishing/sender";
import { digest, LANGUAGES, parseBindings, parseComponents, observedMetaContentHash, reject } from "../publishing/validation";
import { COMMON_ACTIVATION_LIMITS as LIMITS, parseCommonSelection, assertSnapshotSize, type CommonActivationPreview } from "./contracts";

type Reader = Pick<Prisma.TransactionClient, "whatsAppTemplateDefinition" | "whatsAppTemplateVariant" | "whatsAppConversationWrapperActiveSlot" | "shop" | "platformConfiguration" | "whatsAppTemplateMetaEvent">;
const scenarios = ["INITIAL", "FOLLOW_UP"].flatMap(stage=>["NO_OFFER","CODE_OFFER","AUTOMATIC_OFFER"].map(offer=>`${stage}_${offer}`));
const customerName = (bindings: ReturnType<typeof parseBindings>) => [...bindings.header,...bindings.body].some(b=>b.variable==="customer.firstName");
export async function previewCommonActivation(db: Reader, raw: unknown, issuedAt = new Date().toISOString()): Promise<CommonActivationPreview> {
  const selection = parseCommonSelection(raw);
  const wabaId = await configuredSenderWaba(db);
  const audiencePointers = await db.whatsAppConversationWrapperActiveSlot.findMany({ orderBy: { audience: "asc" }, select: { audience:true,definitionId:true,editVersion:true } });
  const shared = audiencePointers.find(s=>s.audience==="SHARED");
  const commonRefs = [];
  for (const tag of LANGUAGES) commonRefs.push(await readSavedCommonLayout(db, selection.commonDefinitionId, tag));
  const definitions: CommonActivationPreview["definitions"] = [];
  for (const replacement of selection.replacements) {
    const source = await approvedSource(db, replacement.definitionId, wabaId);
    const definition = await db.whatsAppTemplateDefinition.findUniqueOrThrow({ where:{id:replacement.definitionId},include:{locales:{include:{metaRegistrations:{where:{wabaId}}}}} });
    const registrationFacts=definition.locales.map(locale=>{
      const reg=locale.metaRegistrations[0];
      const now=Date.now();
      if(!reg||reg.lastObservedCategory!=="MARKETING"||reg.lastObservedContentHash!==observedMetaContentHash(reg.componentsSnapshot)||!reg.lastReconciledAt||now<reg.lastReconciledAt.getTime()||now-reg.lastReconciledAt.getTime()>60*60_000)return reject("APPROVAL_PENDING","Every replacement needs current provider reconciliation and exact observed content (within one hour).");
      return {id:reg.id,observedHash:reg.lastObservedContentHash,reconciledAt:reg.lastReconciledAt.toISOString()};
    }).sort((a,b)=>a.id.localeCompare(b.id));
    const english=definition.locales.find(locale=>locale.languageTag==="en");
    if(!english||!english.contentHash||!["SOURCE_SAVED","REVIEWED"].includes(english.status)||(english.status==="REVIEWED"&&(!english.reviewedAt||!english.reviewedByAdminId))||definition.locales.some(locale=>locale.languageTag!=="en"&&locale.status!=="REVIEWED"))return reject("NOT_READY","English must be saved or reviewed and every translated Meta locale must be REVIEWED for runtime eligibility.");
    for (const locale of definition.locales) {
      const rawAst = locale.localeAst as { authoring?: { commonLayout?: unknown } } | null;
      let ref;
      try { ref=requireCommonLayout(rawAst?.authoring?.commonLayout); } catch { return reject("COMMON_LAYOUT_REQUIRED","Clone this template with the reviewed common layout before activation."); }
      const expected=commonRefs.find(item=>item.languageTag===locale.languageTag);
      if(!expected||digest(ref)!==digest(expected))return reject("COMMON_LAYOUT_MISMATCH","Every replacement language must reference the exact reviewed common revision.");
    }
    const pending=await db.whatsAppTemplateMetaEvent.findFirst({where:{registrationId:{in:source.locales.map(l=>l.registrationId)},source:"META_WEBHOOK",outcome:"RECONCILIATION_PENDING",processedAt:null},select:{id:true}});
    if(pending)return reject("APPROVAL_PENDING","A provider status observation still needs reconciliation.");
    definitions.push({source,shopIds:replacement.shopIds,registrationFacts,englishReview:{localeId:english.id,contentHash:english.contentHash,status:english.status as "SOURCE_SAVED" | "REVIEWED"}});
  }
  // Conservatively include inactive shops and old senders: later reactivation/rotation must not expose mixed frames.
  // Complete enabled+approved cohort, never a caller-filtered subset. Bound+1 detects overflow.
  const current = await db.whatsAppTemplateVariant.findMany({where:{enabled:true,status:"APPROVED"},
    take:LIMITS.variants+1,orderBy:{id:"asc"},include:{metaRegistration:true}});
  if(current.length>LIMITS.variants)return reject("BOUNDED_SCOPE","The complete active template cohort exceeds 1,000 variants.");
  const shopIds=[...new Set(current.map(row=>row.shopId))].sort();
  const requestedIds=[...new Set(definitions.flatMap(item=>item.shopIds))].sort();
  if(shopIds.length>LIMITS.shops||digest(shopIds)!==digest(requestedIds))return reject("COHORT_MISMATCH","Review every shop affected by the global common layout; subsets and new offer assignments are not permitted.");
  const shopRows=await db.shop.findMany({where:{id:{in:shopIds}},take:LIMITS.shops+1,orderBy:{id:"asc"},select:{id:true,domain:true,status:true,platform:true,wooCommerceInstallation:{select:{status:true}}}});
  if(shopRows.length!==shopIds.length)return reject("COHORT_MISMATCH","An affected shop changed during review.");
  const shops=shopRows.map(({wooCommerceInstallation,...row})=>({...row,wooStatus:wooCommerceInstallation?.status??null}));
  const variants:CommonActivationPreview["variants"]=[];
  const covered=new Set<string>();
  for(const row of current){
    if(row.providerAccountId!==wabaId||!scenarios.includes(row.purpose)||!LANGUAGES.includes(row.languageTag as typeof LANGUAGES[number])||!row.metaRegistration)return reject("UNSUPPORTED_COHORT","An active provider or legacy slot cannot be safely mapped. Review and resolve it before a global switch.");
    const old=parseBindings(row.metaRegistration.parameterBindingsSnapshot);
    const oldComponents=parseComponents(row.metaRegistration.componentsSnapshot);
    const oldTarget=old.promotionTarget??(row.purpose.endsWith("NO_OFFER")?"NONE":"CHECKOUT");
    const matches=definitions.filter(item=>item.shopIds.includes(row.shopId)&&item.source.purpose===row.purpose&&
      (item.source.promotionTarget??"NONE")===oldTarget&&customerName(item.source.locales[0].view.bindings!)===customerName(old));
    if(matches.length!==1)return reject("COHORT_MISMATCH","Every current target and greeting must map to exactly one reviewed equivalent replacement; offer eligibility cannot be widened.");
    const replacement=matches[0];
    covered.add(`${replacement.source.id}|${row.shopId}|${row.languageTag}`);
    variants.push({id:row.id,shopId:row.shopId,purpose:row.purpose,languageTag:row.languageTag,registrationId:row.metaRegistration.id,
      providerTemplateName:row.providerTemplateName,providerTemplateId:row.providerTemplateId,providerLanguageCode:row.providerLanguageCode,
      updatedAt:row.updatedAt.toISOString(),previousRegistrationFingerprint:digest({status:row.metaRegistration.providerStatus,submission:row.metaRegistration.submissionState,failure:row.metaRegistration.failureCode,observed:row.metaRegistration.lastObservedContentHash,category:row.metaRegistration.lastObservedCategory,drift:row.metaRegistration.driftDetectedAt?.toISOString()??null,reconciled:row.metaRegistration.lastReconciledAt?.toISOString()??null,components:row.metaRegistration.componentsSnapshot,bindings:row.metaRegistration.parameterBindingsSnapshot}),replacementDefinitionId:replacement.source.id,
      previousHeader:old.headerMediaRole??(oldComponents.headerFormat==="IMAGE"?"IMAGE":oldComponents.header?"TEXT":"NONE"),
      proposedHeader:replacement.source.locales[0].view.bindings?.headerMediaRole??replacement.source.headerKind,promotionTarget:oldTarget,customerName:customerName(old)});
  }
  // No missing locale or new shop/scenario eligibility is manufactured by activation.
  for(const item of definitions)for(const shopId of item.shopIds)for(const tag of LANGUAGES)
    if(!covered.has(`${item.source.id}|${shopId}|${tag}`))return reject("COHORT_MISMATCH","The existing assignment must cover all 20 reviewed locales. Missing slots require a separate reviewed repair.");
  const manifest={schemaVersion:2 as const,kind:"COMMON_RECOVERY_ACTIVATION" as const,selection,issuedAt,wabaId,
    expectedSharedPointer:shared?{definitionId:shared.definitionId,editVersion:shared.editVersion}:null,
    commonRefs,definitions,shops,variants,audiencePointers,targetCount:definitions.reduce((n,item)=>n+item.shopIds.length*LANGUAGES.length,0),
    missingScenarios:scenarios.filter(purpose=>!definitions.some(item=>item.source.purpose===purpose))};
  const result={...manifest,fingerprint:digest(manifest)};
  assertSnapshotSize(result);
  return result;
}
