import assert from "node:assert/strict";
import {test} from "node:test";
import {newWrapperDraft,cloneDraft,parseEditorNodes} from "../../src/lib/admin/whatsapp-templates/authoring/draft-operations.ts";
import {compileTemplateAst} from "../../src/lib/admin/whatsapp-templates/authoring/compiler.ts";
import {templateHash,commonDefinition,layoutAst} from "../fixtures/arch075-common-layout.ts";
import {checkWrapperEligibility} from "../../src/lib/admin/whatsapp-templates/wrappers/eligibility.ts";

test("editor new and cloned drafts canonicalize only exactly empty optional footer; immutable compiler remains unchanged",()=>{
 assert.deepEqual(newWrapperDraft().footer,[]);
 assert.deepEqual(parseEditorNodes("",{variables:[]}),[]);
 const old=layoutAst();old.footer=[{type:"text",value:""}];const before=JSON.stringify(old);const prepared=compileTemplateAst(old);const digest=templateHash(prepared);
 const next=cloneDraft(old);assert.deepEqual(next.footer,[]);assert.equal(JSON.stringify(old),before);
 assert.deepEqual(compileTemplateAst(old),prepared);assert.equal(templateHash(compileTemplateAst(old)),digest);assert.notEqual(templateHash(next),templateHash(old));
 for(const footer of [[{type:"text" as const,value:" \n"}],[{type:"text" as const,value:"Keep this"}],[{type:"variable" as const,name:"shop.name" as const}]]){const a={...old,footer};assert.deepEqual(cloneDraft(a).footer,footer);}
});
test("fully reviewed staged definitions retain strict identity, review and hash requirements",()=>{
 for(const status of ["SAVED","TRANSLATION_QUEUED","TRANSLATING","PARTIALLY_FAILED","READY_FOR_REVIEW","PUBLISHED"]){const row=commonDefinition();row.status=status;assert.equal(checkWrapperEligibility(row,"SHARED").eligible,true,status);}
 const mutations: Array<(row: ReturnType<typeof commonDefinition>) => void> = [(r)=>{r.status="UNKNOWN";},r=>{r.retiredAt=new Date();},r=>{r.locales.pop();},r=>{r.locales[1].contentHash="f".repeat(64);},r=>{r.locales[1].reviewedByAdminId=null;},r=>{r.locales[1].status="SOURCE_SAVED";},r=>{r.sourceHash="0".repeat(64);}];
 for(const alter of mutations){const row=commonDefinition();row.status="TRANSLATION_QUEUED";alter(row);assert.equal(checkWrapperEligibility(row,"SHARED").eligible,false);}
});
