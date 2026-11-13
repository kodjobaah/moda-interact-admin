import test from "node:test";
import assert from "node:assert/strict";
import { parseCommonSelection, assertSnapshotSize } from "../../src/lib/admin/whatsapp-templates/common-activation/contracts.ts";
import { parseBindings } from "../../src/lib/admin/whatsapp-templates/publishing/validation.ts";
const id=(letter:string)=>`wtdef_${letter.repeat(64)}`;
const selection=()=>({commonDefinitionId:id("a"),replacements:[{definitionId:id("b"),shopIds:["shop-b","shop-a"]}]});
test("cohort selection is canonical and refuses ambiguous or widened input",()=>{
 assert.deepEqual(parseCommonSelection(selection()).replacements[0].shopIds,["shop-a","shop-b"]);
 assert.throws(()=>parseCommonSelection({...selection(),wabaId:"12345"}));
 assert.throws(()=>parseCommonSelection({...selection(),replacements:[selection().replacements[0],selection().replacements[0]]}));
 assert.throws(()=>parseCommonSelection({...selection(),replacements:[{definitionId:id("b"),shopIds:["same","same"]}]}));
 assert.throws(()=>parseCommonSelection({...selection(),replacements:[{definitionId:id("b"),shopIds:Array.from({length:51},(_,i)=>`shop-${i}`)}]}));
 assert.throws(()=>parseCommonSelection({...selection(),replacements:[{definitionId:id("b"),shopIds:Array.from({length:50},(_,i)=>`shop-${i}`)},{definitionId:id("c"),shopIds:["shop-0"]}]}));
});
test("coordinator payload has an explicit byte bound",()=>{assertSnapshotSize({small:true});assert.throws(()=>assertSnapshotSize({text:"a".repeat(1024*1024)}));});
test("publication accepts canonical common website binding without widening unknown keys",()=>{
 const bindings={schemaVersion:1,header:[],body:[{position:1,variable:"shop.websiteUrl"}],buttons:[]};
 assert.equal(parseBindings(bindings).body[0].variable,"shop.websiteUrl");
 assert.throws(()=>parseBindings({...bindings,body:[{position:1,variable:"shop.secretUrl"}]}));
});
