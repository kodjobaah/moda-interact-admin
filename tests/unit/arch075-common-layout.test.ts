import assert from "node:assert/strict";
import {test} from "node:test";
import {createHash} from "node:crypto";
import {renderToStaticMarkup} from "react-dom/server";
import {createElement} from "react";
import {renderPreparedWrapper} from "@modainteract/moda-interact-shared/commerce/presentation";
import {commonRef,commonDefinition,templateHash} from "../fixtures/arch075-common-layout.ts";
import {RECOVERY_SCENARIOS} from "../../src/lib/admin/whatsapp-templates/authoring/scenarios.ts";
import {validateTemplateAst} from "../../src/lib/admin/whatsapp-templates/authoring/validation.ts";
import {compileTemplateAst} from "../../src/lib/admin/whatsapp-templates/authoring/compiler.ts";
import {makeExamplePreview} from "../../src/lib/admin/whatsapp-templates/authoring/preview.ts";
import {readSavedCommonLayout,assertSavedCommonLayout} from "../../src/lib/admin/whatsapp-templates/authoring/common-layout-repository.ts";
import {requireCommonLayout,layoutDigest} from "../../src/lib/admin/whatsapp-templates/authoring/common-layout.ts";
import {extractTranslationSegments} from "../../src/lib/admin/whatsapp-templates/translations/source-snapshot.ts";
import {reconstructAndCompile} from "../../src/lib/admin/whatsapp-templates/compilation/reconstruction.ts";
import {scenarioCoverage} from "../../src/lib/admin/whatsapp-templates/authoring/coverage.ts";
import {TemplateReadOnlyPreview} from "../../src/components/admin/whatsapp-templates/authoring/template-read-only-preview.tsx";
import {ScenarioCoverageSummary} from "../../src/components/admin/whatsapp-templates/authoring/scenario-coverage.tsx";
import type {MetaTemplateAst} from "../../src/lib/admin/whatsapp-templates/authoring/types.ts";
const draft=():MetaTemplateAst=>({...structuredClone(RECOVERY_SCENARIOS[0].draft),commonLayout:commonRef(),shopBrandMediaRole:"LOGO",footer:[{type:"text",value:"Reply STOP to opt out."}]});

test("all six reviewed scenario ASTs pass actual INITIAL semantics and final common composition",()=>{
 assert.equal(RECOVERY_SCENARIOS.length,6);
 for(const s of RECOVERY_SCENARIOS){assert.deepEqual(validateTemplateAst(s.draft,{requireInitialReply:true,contentLanguageTag:"en"}),{ok:true,value:s.draft});
 const a={...structuredClone(s.draft),commonLayout:commonRef(),shopBrandMediaRole:"LOGO" as const,footer:[{type:"text" as const,value:"Reply STOP to opt out."}]};const p=compileTemplateAst(a);assert.equal(p.family,"META_RECOVERY");if(p.family!=="META_RECOVERY")return;
 assert.ok(p.parameterBindings.body.length<=10);assert.ok(String(p.components.find(c=>c.type==="BODY")?.text).length<=1024);
 assert.equal(p.parameterBindings.body.at(-1)?.variable,"checkout.url");assert.equal(p.components.some(c=>c.type==="FOOTER"),false);}
});
test("custom frozen header/footer match real Shared rendering while body and opt-out bytes remain unchanged",()=>{
 const a=draft(),before=JSON.stringify(a);const p=compileTemplateAst(a);const preview=makeExamplePreview(p,a.commonLayout);
 const bare=makeExamplePreview(compileTemplateAst({...a,commonLayout:undefined,shopBrandMediaRole:undefined}));
 const rendered=renderPreparedWrapper({prepared:commonRef().prepared,context:{conversationId:"example",shopId:"example",conversationLanguageTag:"en",merchantLanguageTag:"en",checkoutAvailable:true,variables:{"shop.name":"Example Shop","shop.websiteUrl":"https://www.example.com","checkout.url":"https://www.example.com/checkout/demo"}},responseBody:bare.body});
 assert.equal(rendered.kind,"rendered");if(rendered.kind!=="rendered")return;assert.equal(preview.body,rendered.body+"\n"+bare.footer);assert.equal(JSON.stringify(a),before);
 assert.match(preview.body,/Continue when ready[^]*https:\/\/www.example.com\/checkout\/demo\nReply STOP/);assert.ok(preview.body.endsWith("Reply STOP to opt out."));
 const html=renderToStaticMarkup(createElement(TemplateReadOnlyPreview,{preview}));for(const label of ["Common shop header","Common checkout footer","AI answer","Human reply","Custom shop divider"])assert.ok(html.includes(label));
});
test("hash tamper, illegal media, locale mismatch and final composed limits fail closed",()=>{
 const a=draft();const tamper={...commonRef(),prepared:{...commonRef().prepared,header:[{kind:"text",value:"Forged"}]}};assert.throws(()=>requireCommonLayout(tamper));
 assert.equal(validateTemplateAst({...a,shopBrandMediaRole:"CHECKOUT_PRODUCT"}).ok,false);
 assert.equal(validateTemplateAst({...a,commonLayout:commonRef("fr")},{contentLanguageTag:"en"}).ok,false);
 assert.throws(()=>compileTemplateAst({...a,body:[{type:"text",value:"x".repeat(1000)}]}),/1024/);
 assert.throws(()=>compileTemplateAst({...a,body:Array.from({length:9},()=>({type:"variable" as const,name:"shop.name" as const}))}),/10-parameter/);
 assert.notEqual(templateHash(a),templateHash({...a,commonLayout:undefined}));
});
test("database authority rejects plausible caller snapshot, stale source, retired/incomplete or wrong-audience rows",async()=>{
 const row=commonDefinition();const reader={whatsAppTemplateDefinition:{findUnique:async()=>row}} as unknown as Parameters<typeof readSavedCommonLayout>[0];
 assert.deepEqual(await readSavedCommonLayout(reader,row.id,"en"),commonRef());await assertSavedCommonLayout(reader,commonRef());
 await assert.rejects(readSavedCommonLayout(reader,row.id,"en","a".repeat(64)),/changed/);
 await assert.rejects(assertSavedCommonLayout(reader,{...commonRef(),localeId:"forged-locale"}),/differs/);
 row.status="RETIRED";await assert.rejects(assertSavedCommonLayout(reader,commonRef()),/not ready/);row.status="SAVED";row.audience="AI";await assert.rejects(assertSavedCommonLayout(reader,commonRef()),/not ready/);row.audience="SHARED";row.locales.pop();await assert.rejects(assertSavedCommonLayout(reader,commonRef()),/20/);
});
test("translation keeps common text out of body jobs and requires the same immutable revision's localized ref",()=>{
 const a={...draft(),stage:"FOLLOW_UP" as const,body:[{type:"text" as const,value:"Your basket is waiting."}]};const id="wtdef_"+"b".repeat(64);const sourceHash=templateHash(a);const segments=extractTranslationSegments(id,a);
 assert.ok(!JSON.stringify(segments).includes("Custom shop divider"));assert.ok(!JSON.stringify(segments).includes("Continue when ready"));
 const input={definitionId:id,definitionSourceHash:sourceHash,runSourceHash:sourceHash,languageTag:"fr",english:a,snapshot:{schemaVersion:1,definitionId:id,sourceHash,sourceLanguageTag:"en",segments},translated:{schemaVersion:1,segments:segments.map(s=>({key:s.key,text:s.text}))}};
 assert.throws(()=>reconstructAndCompile(input),/common shop layout/);
 assert.throws(()=>reconstructAndCompile({...input,commonLayout:commonRef()}),/target language/);
 const compiled=reconstructAndCompile({...input,commonLayout:commonRef("fr")});assert.ok(compiled.preview.body.startsWith("Bienvenue chez "));assert.equal(compiled.record.authoring.family,"META_RECOVERY");if(compiled.record.authoring.family==="META_RECOVERY")assert.equal(compiled.record.authoring.commonLayout?.localeId,"common-fr");
 assert.throws(()=>reconstructAndCompile({...input,runSourceHash:"0".repeat(64),commonLayout:commonRef("fr")}),/stale/);
});
test("legacy immutable records retain identical compilation and scenario coverage never counts duplicate versions as scenarios",()=>{
 const a=RECOVERY_SCENARIOS[0].draft;const p=compileTemplateAst(a);assert.equal(p.family,"META_RECOVERY");if(p.family!=="META_RECOVERY")return;
 assert.deepEqual(p.parameterBindings.body.map(b=>b.variable),["checkout.itemsSummary","shop.name"]);
 const rows=scenarioCoverage([{purpose:"INITIAL",offerType:"NO_OFFER",definitions:4,reviewedLocales:20,approvedRegistrations:20,assignedVariants:20,targets:["NONE"]},{purpose:"FOLLOW_UP",offerType:"NO_OFFER",definitions:1,reviewedLocales:20,approvedRegistrations:20,assignedVariants:20,targets:["NONE"]}]);
 assert.equal(rows.length,6);assert.equal(rows.filter(r=>r.definitions>0).length,2);assert.equal(rows.filter(r=>r.assignedVariants===0).length,4);
 const html=renderToStaticMarkup(createElement(ScenarioCoverageSummary,{rows}));assert.ok(html.includes("Missing"));assert.ok(html.includes("outside the reply window"));assert.ok(html.includes("AI and human conversations"));
});

test("browser-safe SHA256 matches Node for custom multilingual layout bytes",()=>{ for(const text of ["", "shop 🌍 café 中文", JSON.stringify(commonRef().prepared)]) assert.equal(layoutDigest(text),createHash("sha256").update(text).digest("hex")); });

test("unavailable common source produces a bounded Meta preview issue, preserving the historical status dashboard",async()=>{
 const {readMetaPlan}=await import("../../src/lib/admin/whatsapp-templates/meta/repository.ts");
 const {MetaSubmissionError}=await import("../../src/lib/admin/whatsapp-templates/meta/contracts.ts");
 const reader={whatsAppTemplateDefinition:{findUnique:async({where}:{where:{id:string}})=>where.id==="meta-fixture"?{locales:[{localeAst:{authoring:{commonLayout:commonRef()}}}]}:null}} as unknown as Parameters<typeof readMetaPlan>[0];
 await assert.rejects(readMetaPlan(reader,"meta-fixture","fixture-waba"),error=>error instanceof MetaSubmissionError&&error.message.includes("registration history is preserved"));
});
