import type { Prisma } from "@prisma/client";
import { requireCommonLayout } from "../authoring/common-layout";
import { assertSavedCommonLayout } from "../authoring/common-layout-repository";
import { reject } from "../publishing/validation";
/** First lock in every Admin assignment/SHARED publication transaction. */
export async function lockCommonActivation(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$queryRaw`SELECT 1 AS acquired FROM pg_advisory_xact_lock(hashtextextended('moda:common-recovery-activation:v1'::text,0))`;
}
export async function assertCommonSourceGate(tx: Prisma.TransactionClient, definitionId: string, intent: "submission" | "assignment"): Promise<void> {
  const slot=await tx.whatsAppConversationWrapperActiveSlot.findUnique({where:{audience:"SHARED"},include:{definition:true}});
  const definition=await tx.whatsAppTemplateDefinition.findUnique({where:{id:definitionId},include:{locales:true}});
  if(!definition)return reject("NOT_FOUND","Template definition is unavailable.");
  const stamped=definition.locales.some(locale=>!!(locale.localeAst as {authoring?:{commonLayout?:unknown}}|null)?.authoring?.commonLayout);
  if(!slot&&!stamped)return;
  if(slot&&!stamped)return reject("COMMON_LAYOUT_REQUIRED","Clone this saved template with the common shop layout before submitting or publishing.");
  if(intent==="assignment"&&(!slot||slot.definition.status!=="PUBLISHED"||!slot.definition.publishedAt||slot.definition.retiredAt))return reject("COORDINATED_ACTIVATION_REQUIRED","Use the reviewed common-layout activation to switch templates and shared content together.");
  if(intent==="assignment" && definition.kind==="META_RECOVERY" && definition.locales.some(locale=>locale.status!=="REVIEWED"||!locale.reviewedByAdminId||!locale.reviewedAt))return reject("COORDINATED_ENGLISH_REVIEW_REQUIRED","Review the exact English content in coordinated activation before publishing this common-layout template. Every Meta language must be REVIEWED.");
  for(const locale of definition.locales){
    let ref;
    try{ref=requireCommonLayout((locale.localeAst as {authoring?:{commonLayout?:unknown}}|null)?.authoring?.commonLayout);}
    catch{return reject("COMMON_LAYOUT_REQUIRED","Clone this saved template with the common shop layout before submitting or publishing.");}
    if(ref.languageTag!==locale.languageTag)return reject("COMMON_LAYOUT_MISMATCH","Common layout language does not match this template.");
    await assertSavedCommonLayout(tx,ref);
    if(intent==="assignment"&&(ref.definitionId!==slot!.definitionId||ref.sourceHash!==slot!.definition.sourceHash))return reject("COORDINATED_ACTIVATION_REQUIRED","This replacement uses another common revision. Review a coordinated activation.");
  }
}
