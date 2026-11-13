import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { CommonActivationPanel } from "@/components/admin/whatsapp-templates/common-activation/panel";
import { requirePlatformAdminPage } from "@/lib/auth/platform-admin";
import { parseBindings } from "@/lib/admin/whatsapp-templates/publishing/validation";
import { prisma } from "@/lib/prisma";
export const dynamic="force-dynamic";
export default async function CommonActivationPage(){
 const principal=await requirePlatformAdminPage();if(principal.role!=="SUPER_ADMIN")notFound();
 const definitions=await prisma.whatsAppTemplateDefinition.findMany({where:{retiredAt:null},orderBy:{createdAt:"desc"},take:101,select:{id:true,kind:true,audience:true,purpose:true,offerType:true,providerTemplateName:true,createdAt:true}});
 const variants=await prisma.whatsAppTemplateVariant.findMany({where:{enabled:true,status:"APPROVED"},take:1001,orderBy:{id:"asc"},select:{shopId:true,purpose:true,shop:{select:{domain:true}},metaRegistration:{select:{parameterBindingsSnapshot:true}}}});
 const overflow=definitions.length>100||variants.length>1000;
 const slots=[...new Map(variants.map(v=>{
  let dimension="Unverified legacy assignment";
  try{const bindings=parseBindings(v.metaRegistration?.parameterBindingsSnapshot);dimension=`${bindings.promotionTarget??(v.purpose.endsWith("NO_OFFER")?"No offer":"CHECKOUT")} · ${[...bindings.header,...bindings.body].some(b=>b.variable==="customer.firstName")?"personalized greeting":"general greeting"}`;}catch{/* The authoritative preview refuses unverified identity. */}
  return [`${v.shopId}:${v.purpose}:${dimension}`,{shopId:v.shopId,domain:v.shop.domain,purpose:v.purpose,dimension}] as const;
 })).values()];
 const options={common:definitions.filter(d=>d.kind==="MODA_CONVERSATION_WRAPPER"&&d.audience==="SHARED").map(d=>({id:d.id,label:`Common layout — ${d.createdAt.toISOString()}`})),templates:definitions.filter(d=>d.kind==="META_RECOVERY").map(d=>({id:d.id,purpose:`${d.purpose}_${d.offerType}`,label:`${d.providerTemplateName} — ${d.createdAt.toISOString()}`})),slots};
 return <AdminShell active="whatsapp-templates"><div className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-8"><Link className="underline" href="/system-controls/whatsapp-templates">WhatsApp templates</Link><h1 className="my-4 text-2xl font-bold">Activate common recovery layout</h1>{overflow?<p>The catalogue exceeds this bounded review. Contact platform support; no partial activation is available.</p>:<CommonActivationPanel options={options}/>}</div></AdminShell>;
}
