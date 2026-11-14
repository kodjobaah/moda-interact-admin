import { COMPOSITE_PROFILE_DEFAULTS } from "../../src/lib/admin/whatsapp-templates/authoring/composite-profile.ts";
import { wrapperRow } from "./arch047-wrapper-fixture.ts";
import { compileTemplateAst } from "../../src/lib/admin/whatsapp-templates/authoring/compiler.ts";
import { templateHash } from "../../src/lib/admin/whatsapp-templates/authoring/identifiers.ts";
import type { WrapperTemplateAst } from "../../src/lib/admin/whatsapp-templates/authoring/types.ts";
import { requireCommonLayout } from "../../src/lib/admin/whatsapp-templates/authoring/common-layout.ts";
export function layoutAst(): WrapperTemplateAst {
 return {schemaVersion:1,family:"MODA_CONVERSATION_WRAPPER",sourceLanguageTag:"en",audience:"SHARED",compositeProfile:{...COMPOSITE_PROFILE_DEFAULTS},
 header:[{type:"text",value:"Welcome to "},{type:"variable",name:"shop.name"},{type:"text",value:"\n"},{type:"variable",name:"shop.websiteUrl"},{type:"text",value:"\n── Custom shop divider ──"}],
 body:[{type:"slot",name:"response.body"}],footer:[],conditionals:[{when:"checkout.available",nodes:[{type:"text",value:"── Continue when ready ──\n"},{type:"variable",name:"checkout.url"}]}]};
}
export function commonDefinition(){
 const row=wrapperRow({ast:layoutAst()});
 return {...row,locales:row.locales.map(l=>{
  const ast=layoutAst();if(l.languageTag==="fr")ast.header[0]={type:"text",value:"Bienvenue chez "};
  const prepared=compileTemplateAst(ast);
  return {...l,id:`common-${l.languageTag}`,localeAst:{schemaVersion:1,authoring:ast,prepared},contentHash:templateHash(prepared)};
 })};
}
export function commonRef(languageTag="en") {const definition=commonDefinition();const locale=definition.locales.find(l=>l.languageTag===languageTag)!;return requireCommonLayout({schemaVersion:1,definitionId:definition.id,sourceHash:definition.sourceHash,localeId:locale.id,languageTag,contentHash:locale.contentHash,prepared:locale.localeAst.prepared});}
export {templateHash};
