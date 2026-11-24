import assert from "node:assert/strict";
import { test } from "node:test";
import { initialPublicationScope, resumeStage, stageHint, workflowHref, type RecoveryWorkflowFacts } from "../../src/lib/admin/whatsapp-templates/workflow/contracts";
import { saveAndStartRecoveryWorkflow } from "../../src/lib/admin/whatsapp-templates/workflow/save-and-start";
import { parseReviewedTranslationBatch } from "../../src/lib/admin/whatsapp-templates/compilation/batch-selection";
import { REVIEW_LANGUAGES } from "../../src/lib/admin/whatsapp-templates/compilation/language-codes";

const id = `wtdef_${"a".repeat(64)}`;
const facts: RecoveryWorkflowFacts = { definitionId:id, purpose:"INITIAL_NO_OFFER", providerTemplateName:"example", status:"SAVED", createdAt:new Date(), retired:false, checkoutTarget:true, activeLayoutId:"active", sourceMatchesActive:true, localeCount:1, matchingCount:1, reviewedCount:1, translatedCount:0, translationRunStatus:null, registeredCount:0, approvedCount:0, defaultDefinitionId:null, latestCandidate:true, assignedShops:0, otherAssignedShops:0, publicationId:null, publicationStatus:null };

test("resumption follows persisted progress, historical definitions cannot imply readiness", () => {
  assert.equal(resumeStage(facts),"translate");
  assert.equal(resumeStage({...facts, reviewedCount:20}),"meta");
  assert.equal(resumeStage({...facts, reviewedCount:20, approvedCount:20}),"publish");
  assert.equal(resumeStage({...facts, reviewedCount:20, approvedCount:20, sourceMatchesActive:false}),"compose");
  assert.equal(resumeStage({...facts, retired:true}),"compose");
  assert.equal(stageHint({...facts, translatedCount:19}),"Review translations");
  assert.equal(stageHint({...facts, reviewedCount:20, approvedCount:20, publicationStatus:"PARTIAL"}),"Resume publication");
});

test("default-only is conservative; shop-only and explicit combined scopes remain distinct", () => {
  assert.deepEqual(initialPublicationScope(undefined,true),{mode:"future"});
  assert.deepEqual(initialPublicationScope("one",true),{mode:"one",shopId:""});
  assert.deepEqual(initialPublicationScope("selected",true),{mode:"selected",shopIds:[]});
  assert.deepEqual(initialPublicationScope("all_future",true),{mode:"all_future"});
  assert.deepEqual(initialPublicationScope("future",false),{mode:"all"});
  assert.match(workflowHref(id,"publish",false,"one"),/stage=publish&scope=one$/);
  assert.match(workflowHref(id,"publish",false,undefined,"op"),/operation=op$/);
});

test("save commits before translation, failed start retains identity and original error",async()=>{
  const sequence:string[]=[];
  const error=new Error("model missing");
  const result=await saveAndStartRecoveryWorkflow({save:async()=>{sequence.push("save");return{id};},start:async definitionId=>{assert.equal(definitionId,id);sequence.push("start");throw error;},onStartFailure:(definitionId,cause)=>{assert.equal(definitionId,id);assert.equal(cause,error);sequence.push("logged");}});
  assert.deepEqual(result,{id,translationsRequested:false}); assert.deepEqual(sequence,["save","start","logged"]);
  assert.deepEqual(await saveAndStartRecoveryWorkflow({save:async()=>({id}),start:async()=>{},onStartFailure:()=>assert.fail()}),{id,translationsRequested:true});
  await assert.rejects(saveAndStartRecoveryWorkflow({save:async()=>{throw error;},start:async()=>assert.fail(),onStartFailure:()=>assert.fail()}),/model missing/);
});

test("bulk review accepts only explicitly acknowledged canonical selected preview digests",()=>{
  const valid={definitionId:id,runId:"run",acknowledged:true,locales:REVIEW_LANGUAGES.filter(tag=>tag!=="en").map(languageTag=>({languageTag,contentHash:"b".repeat(64)}))};
  assert.equal(parseReviewedTranslationBatch(valid)?.locales.length,19);
  for(const invalid of [{...valid,acknowledged:false},{...valid,actorId:"forged"},{...valid,locales:[]},{...valid,locales:[valid.locales[0],valid.locales[0]]},{...valid,locales:[{...valid.locales[0],languageTag:"en"}]},{...valid,locales:[{...valid.locales[0],contentHash:"bad"}]},{...valid,locales:[{...valid.locales[0],text:"forged"}]}]) assert.equal(parseReviewedTranslationBatch(invalid),null);
});
