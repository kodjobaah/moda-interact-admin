import assert from "node:assert/strict";
import test from "node:test";
import { layoutAst, commonRef } from "../fixtures/arch075-common-layout";
import { wrapperRow } from "../fixtures/arch047-wrapper-fixture";
import { makeImmutableAuthoringRecord, compileTemplateAst } from "../../src/lib/admin/whatsapp-templates/authoring/compiler";
import { templateHash } from "../../src/lib/admin/whatsapp-templates/authoring/identifiers";
import { requireCommonLayout } from "../../src/lib/admin/whatsapp-templates/authoring/common-layout";
import { prepareValidatedTemplateProjection } from "../../src/lib/admin/whatsapp-templates/authoring/projection";
import { validateTemplateAst } from "../../src/lib/admin/whatsapp-templates/authoring/validation";
import { commonPreparedExample, makeExamplePreview } from "../../src/lib/admin/whatsapp-templates/authoring/preview";
import { verifyFrozenTemplateProjection } from "../../src/lib/admin/whatsapp-templates/authoring/frozen-projection";
import { checkWrapperEligibility } from "../../src/lib/admin/whatsapp-templates/wrappers/eligibility";
import { readSavedCommonLayout, assertSavedCommonLayout } from "../../src/lib/admin/whatsapp-templates/authoring/common-layout-repository";
import { makeTranslationSourceSnapshot } from "../../src/lib/admin/whatsapp-templates/translations/source-snapshot";
import { reconstructAndCompile } from "../../src/lib/admin/whatsapp-templates/compilation/reconstruction";
import { RECOVERY_SCENARIOS } from "../../src/lib/admin/whatsapp-templates/authoring/scenarios";
import type { WrapperTemplateAst } from "../../src/lib/admin/whatsapp-templates/authoring/types";
const footerAst = (): WrapperTemplateAst => ({ ...layoutAst(), header: [{ type:"text",value:"Shop: " },{type:"variable",name:"shop.name"},{type:"text",value:"\n──────────"}], conditionals:[{when:"checkout.available",nodes:[{type:"text",value:"──────────\nWebsite: "},{type:"variable",name:"shop.websiteUrl"},{type:"text",value:"\nCheckout:\n"},{type:"variable",name:"checkout.url"}]}] });
function ref(ast=footerAst()) { const r=makeImmutableAuthoringRecord(ast); return requireCommonLayout({schemaVersion:1,definitionId:`wtdef_${"c".repeat(64)}`,sourceHash:templateHash(ast),localeId:"footer-en",languageTag:"en",contentHash:templateHash(r.prepared),prepared:r.prepared}); }

test("saved footer website is clickable caption content with exact immutable source/profile identities",async()=>{
 const ast=footerAst(), before=structuredClone(ast), record=makeImmutableAuthoringRecord(ast), selected=ref(ast);
 assert.deepEqual(verifyFrozenTemplateProjection(record,templateHash(record.prepared)),record.prepared);
 assert.deepEqual(record.authoring,before); assert.deepEqual(selected.prepared.compositeProfile,ast.compositeProfile);
 const example=commonPreparedExample(selected.prepared);
 assert.doesNotMatch(example.header,/example.com/); assert.match(example.footer,/Website: https:\/\/www.example.com\nCheckout:/);
 for(const body of [example.ai,example.human]) { assert.ok(body.indexOf("Website:")>body.indexOf("Example ")); assert.ok(body.endsWith("https://www.example.com/checkout/demo")); }
 const fixture=wrapperRow({ast}); const row={...fixture,locales:fixture.locales.map(locale=>({...locale,id:`footer-${locale.languageTag}`}))}; const eligible=checkWrapperEligibility(row,"SHARED"); assert.equal(eligible.eligible,true);
 const db={whatsAppTemplateDefinition:{findUnique:async()=>row}} as unknown as Parameters<typeof readSavedCommonLayout>[0];
 const saved=await readSavedCommonLayout(db,row.id,"en"); await assertSavedCommonLayout(db,saved);
 assert.equal(templateHash(saved.prepared),templateHash(record.prepared));
 // Existing reviewed website-in-header content retains its exact bytes, without a rewrite/adapter.
 assert.deepEqual(requireCommonLayout(commonRef()),commonRef());
});

test("Admin admission rejects missing/duplicate/untrusted bindings and ignored static footer for every common reference",()=>{
 const base=footerAst();
 const bad:WrapperTemplateAst[]=[
 {...base,header:[{type:"text",value:"Forged shop"}]},
 {...base,header:[...base.header,{type:"variable",name:"shop.websiteUrl"}]},
 {...base,body:[{type:"text",value:"extra"},...base.body]},
 {...base,footer:[{type:"text",value:"Ignored footer"}]},
 {...base,productImage:{variable:"response.productImage",placement:"BEFORE_BODY",optional:true}},
 {...base,conditionals:[]},
 {...base,conditionals:[{when:"checkout.available",nodes:[{type:"variable",name:"shop.websiteUrl"},{type:"text",value:" inline "},{type:"variable",name:"checkout.url"}]}]},
 {...base,conditionals:[{when:"checkout.available",nodes:[{type:"variable",name:"shop.websiteUrl"},{type:"variable",name:"checkout.url"},{type:"text",value:" trailing"}]}]},
 {...base,conditionals:[{when:"checkout.available",nodes:[{type:"variable",name:"customer.firstName"},{type:"variable",name:"checkout.url"}]}]},
 {...base,conditionals:[{when:"checkout.available",nodes:[{type:"variable",name:"checkout.url"}]}]},
 ];
 for(const ast of bad){assert.equal(validateTemplateAst(ast).ok,false,JSON.stringify(ast));assert.throws(()=>compileTemplateAst(ast));
 // Force the exact invalid source through internal projection to exercise the independent parsed-reference gate.
 const prepared=prepareValidatedTemplateProjection(ast,[]);
 assert.throws(()=>requireCommonLayout({...ref(),prepared,contentHash:templateHash(prepared)}));}
});

test("six native Meta projections and their submitted preview consume the exact website/checkout conditional",()=>{
 for(const scenario of RECOVERY_SCENARIOS){const ast={...structuredClone(scenario.draft),commonLayout:ref(),shopBrandMediaRole:"LOGO" as const,footer:[{type:"text" as const,value:"Reply STOP to opt out."}]};
 const prepared=compileTemplateAst(ast);if(prepared.family!=="META_RECOVERY")throw Error("Wrong family");
 const bindings=prepared.parameterBindings.body;assert.deepEqual(bindings.slice(-2).map(b=>b.variable),["shop.websiteUrl","checkout.url"]);
 const preview=makeExamplePreview(prepared,ast.commonLayout);assert.match(preview.body,/Website: https:\/\/www.example.com\nCheckout:\nhttps:\/\/www.example.com\/checkout\/demo\nReply STOP/);
 assert.ok(preview.body.startsWith("Shop: Example Shop\n"));assert.equal(prepared.components.some(c=>c.type==="FOOTER"),false);
 }});

test("translation preserves footer variable placement/profile and rehashed locale relocation fails eligibility",()=>{
 const ast=footerAst(),record=makeImmutableAuthoringRecord(ast),definitionId=`wtdef_${"d".repeat(64)}`,sourceHash=templateHash(ast);
 const snapshot=makeTranslationSourceSnapshot({definitionId,sourceHash,sourceLanguageTag:"en",englishLocaleAst:record,englishContentHash:templateHash(record.prepared)});
 const compiled=reconstructAndCompile({definitionId,definitionSourceHash:sourceHash,runSourceHash:sourceHash,languageTag:"fr",english:ast,snapshot,translated:{schemaVersion:1,segments:snapshot.segments.map(s=>({key:s.key,text:s.text}))}});
 assert.deepEqual(compiled.record.authoring,ast);assert.deepEqual(compiled.record.prepared,record.prepared);
 const row=wrapperRow({ast}); const locale=row.locales.find(l=>l.languageTag==="fr")!;const changed=makeImmutableAuthoringRecord(layoutAst());locale.localeAst=changed;locale.contentHash=templateHash(changed.prepared);
 assert.equal(checkWrapperEligibility(row,"SHARED").eligible,false);
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WrapperStructureEditor } from "../../src/components/admin/whatsapp-templates/authoring/wrapper-structure-editor";
import { eligibleVariables } from "../../src/lib/admin/whatsapp-templates/authoring/registry";
import { createComponentHarness, loadPolicyModule, findElement } from "./helpers/commerce-model-policy-module-harness.mjs";

test("SHARED editor exposes the dynamic footer, retains invalid static content for correction and authors trusted bindings explicitly",()=>{
 const draft=footerAst();draft.conditionals=[];
 const html=renderToStaticMarkup(createElement(WrapperStructureEditor,{draft,onChange:()=>{}}));
 assert.match(html,/Website and checkout footer/);assert.match(html,/Add website and checkout footer/);
 assert.match(html,/common template has no static footer/);assert.doesNotMatch(html,/Include checkout-aware message/);
 const invalid={...footerAst(),footer:[{type:"text" as const,value:"Static content needing correction"}]};
 const retained=renderToStaticMarkup(createElement(WrapperStructureEditor,{draft:invalid,onChange:()=>{}}));
 assert.match(retained,/Static content needing correction/);assert.match(retained,/will not be silently discarded/);
 const check=validateTemplateAst(invalid);assert.equal(check.ok,false);if(!check.ok)assert.ok(check.issues.some(i=>i.path==="footer"));
 const h=createComponentHarness();let updated:WrapperTemplateAst|undefined;
 const mocks:Record<string,unknown>={"react/jsx-runtime":h.jsxRuntime,
 "@/lib/admin/whatsapp-templates/authoring/draft-operations":{setWrapperProductImage:()=>{throw Error("Not the SHARED binding");}},
 "@/lib/admin/whatsapp-templates/authoring/registry":{eligibleVariables}};
 for(const [path,name] of [["./template-composite-profile-editor","TemplateCompositeProfileEditor"],["./template-header-editor","TemplateHeaderEditor"],["./template-body-editor","TemplateBodyEditor"],["./template-footer-editor","TemplateFooterEditor"],["./template-inline-editor","TemplateInlineEditor"]])mocks[path]={[name]:()=>null};
 const mod=loadPolicyModule("src/components/admin/whatsapp-templates/authoring/wrapper-structure-editor.tsx",mocks,{workspaceRoot:process.cwd()}) as {WrapperStructureEditor(props:Record<string,unknown>):unknown};
 const tree=h.render(mod.WrapperStructureEditor,{draft,onChange:(next:WrapperTemplateAst)=>{updated=next;}});
 findElement(tree,(e:{type:string})=>e.type==="button").props.onClick();assert.ok(updated);
 assert.deepEqual(updated.header,draft.header);assert.deepEqual(updated.body,draft.body);assert.deepEqual(updated.footer,[]);
 assert.deepEqual(updated.conditionals[0].nodes.filter(n=>n.type==="variable").map(n=>n.name),["shop.websiteUrl","checkout.url"]);
 assert.equal(validateTemplateAst(updated).ok,true);assert.deepEqual(draft.conditionals,[]);
});
