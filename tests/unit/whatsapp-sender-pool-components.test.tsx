import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { WhatsAppSenderPool } from "../../src/components/admin/platform-configuration/whatsapp-sender-pool.tsx";
import { readFileSync } from "node:fs";
const row={providerPhoneNumberId:"20000",providerAccountId:"10000",priority:0,allocationEnabled:false,createdAt:new Date(0).toISOString(),updatedAt:new Date(0).toISOString()};
const action=async()=>({ok:true as const,row});
test("operator form identifies Meta resource ID, disabled default and safe cutover/drain semantics",()=>{
 const html=renderToStaticMarkup(<WhatsAppSenderPool providerAccountId="10000" rows={[row]} mutateAction={action}/>);
 assert.match(html,/Meta Phone Number ID/);assert.match(html,/not the displayed international phone number/);assert.match(html,/Verify and enrol \(disabled\)/);assert.match(html,/Draining \/ disabled for new routes/);assert.match(html,/existing routes and eligible new baskets/);assert.match(html,/priority/);assert.doesNotMatch(html,/accessToken|Authorization|Bearer|graph\.facebook/);
});
test("empty/missing credentials are explicit and do not remove existing drain/priority controls",()=>{
 const html=renderToStaticMarkup(<WhatsAppSenderPool providerAccountId={null} rows={[{...row,allocationEnabled:true}]} mutateAction={action}/>);
 assert.match(html,/Configuration required/);assert.match(html,/Save priority/);assert.match(html,/Disable new routes/);
 const empty=renderToStaticMarkup(<WhatsAppSenderPool providerAccountId={null} rows={[]} mutateAction={action}/>);assert.match(empty,/No registered pool senders/);assert.match(empty,/disabled=""/);
});
test("sender panel is restricted to messaging.sender and client imports no credential/provider boundary",()=>{
 const page=readFileSync(new URL("../../src/app/(protected)/system-controls/platform-configuration/page.tsx",import.meta.url),"utf8");assert.match(page,/if \(key === "messaging.sender"\)/);assert.match(page,/mutateAction=\{mutateWhatsAppSenderPoolAction\}/);
 const component=readFileSync(new URL("../../src/components/admin/platform-configuration/whatsapp-sender-pool.tsx",import.meta.url),"utf8");assert.doesNotMatch(component,/whatsapp-phone-membership|whatsapp-sender-pool-core|sealSecret|fetch\(/);assert.match(component,/senderPool\.error\.\$\{error\}/);
});
