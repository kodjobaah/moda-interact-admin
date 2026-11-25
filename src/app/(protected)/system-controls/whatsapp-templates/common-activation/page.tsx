import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { CommonActivationPanel } from "@/components/admin/whatsapp-templates/common-activation/panel";
import { requirePlatformAdminPage } from "@/lib/auth/platform-admin";
import { listCommonLayoutChoices } from "@/lib/admin/whatsapp-templates/authoring/common-layout-reads";
import { COMMON_ACTIVATION_LIMITS } from "@/lib/admin/whatsapp-templates/common-activation/contracts";
import { parseComponents, parseBindings } from "@/lib/admin/whatsapp-templates/publishing/validation";
import { prisma } from "@/lib/prisma";
export const dynamic="force-dynamic";
export default async function CommonActivationPage(){
 const principal=await requirePlatformAdminPage();if(principal.role!=="SUPER_ADMIN")notFound();
 const definitions=await prisma.whatsAppTemplateDefinition.findMany({where:{retiredAt:null,kind:"META_RECOVERY"},orderBy:{createdAt:"desc"},take:101,select:{id:true,purpose:true,offerType:true,providerTemplateName:true,createdAt:true,
  locales:{where:{languageTag:"en"},take:1,select:{localeAst:true}}}});
 const [common, defaults] = await Promise.all([
  listCommonLayoutChoices(),
  prisma.whatsAppRecoveryTemplateDefault.findMany({take:COMMON_ACTIVATION_LIMITS.defaults+1,orderBy:[{wabaId:"asc"},{purpose:"asc"},{format:"asc"}],
   select:{id:true,wabaId:true,purpose:true,format:true,definitionId:true,definition:{select:{providerTemplateName:true}}}}),
 ]);
 const variants=await prisma.whatsAppTemplateVariant.findMany({where:{enabled:true,status:"APPROVED"},take:1001,orderBy:{id:"asc"},select:{shopId:true,purpose:true,shop:{select:{domain:true}},metaRegistration:{select:{parameterBindingsSnapshot:true,componentsSnapshot:true}}}});
 const overflow=definitions.length>100||variants.length>1000||defaults.length>COMMON_ACTIVATION_LIMITS.defaults;
 const slots=[...new Map(variants.map(v=>{
  let dimension="Unverified legacy assignment";
  let format="UNKNOWN";
  try{const bindings=parseBindings(v.metaRegistration?.parameterBindingsSnapshot);format=parseComponents(v.metaRegistration?.componentsSnapshot).headerFormat==="IMAGE"?"IMAGE":"TEXT";dimension=`${format} · ${bindings.promotionTarget??(v.purpose.endsWith("NO_OFFER")?"No offer":"CHECKOUT")} · ${[...bindings.header,...bindings.body].some(b=>b.variable==="customer.firstName")?"personalized greeting":"general greeting"}`;}catch{/* The authoritative preview refuses unverified identity. */}
  return [`${v.shopId}:${v.purpose}:${dimension}`,{shopId:v.shopId,domain:v.shop.domain,purpose:v.purpose,format,dimension}] as const;
 })).values()];
 const options={common:common.map(d=>({id:d.definitionId,label:`${d.createdAt} · ${d.active?"Active · ":""}${d.definitionId.slice(-12)} · 20 reviewed languages`})),
  templates:definitions.map(d=>({id:d.id,purpose:`${d.purpose}_${d.offerType}`,format:(d.locales[0]?.localeAst as {authoring?:{shopBrandMediaRole?:string}}|null)?.authoring?.shopBrandMediaRole?"IMAGE":"TEXT",label:`${d.providerTemplateName} — ${d.createdAt.toISOString()}`,
   commonDefinitionId:(d.locales[0]?.localeAst as {authoring?:{commonLayout?:{definitionId?:string}}}|null)?.authoring?.commonLayout?.definitionId??null})),slots,
  defaults:defaults.map(d=>({id:d.id,wabaId:d.wabaId,purpose:d.purpose,format:d.format,definitionId:d.definitionId,name:d.definition.providerTemplateName}))};
 return <AdminShell active="whatsapp-templates"><div className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-8"><Link className="underline" href="/system-controls/whatsapp-templates">WhatsApp templates</Link><h1 className="my-4 text-2xl font-bold">Activate common recovery layout</h1>{overflow?<p>The catalogue exceeds this bounded review. Contact platform support; no partial activation is available.</p>:<CommonActivationPanel options={options}/>}</div></AdminShell>;
}
