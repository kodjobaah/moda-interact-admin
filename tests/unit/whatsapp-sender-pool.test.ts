import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { readFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { build } from "esbuild";
import { parsePoolAction, SenderPoolError } from "../../src/lib/admin/platform-configuration/whatsapp-sender-pool-types.ts";
import { verifyPhoneMembership, readSenderSnapshot, sealedDigest, type SenderSnapshot } from "../../src/lib/admin/platform-configuration/whatsapp-phone-membership.ts";
import { mutateSenderPoolWithDependencies, readSenderPoolWithDependencies, type PoolDependencies } from "../../src/lib/admin/platform-configuration/whatsapp-sender-pool-core.ts";
import { createConfigUnsealKeyring, sealSecret, DISABLED_SECRET } from "../../src/lib/admin/platform-configuration/seal.ts";
const proof: SenderSnapshot = { version: 1, providerAccountId: "10000", legacyPhoneNumberId: "20000", accessToken: "secret-provider-token", sealedDigest: "fixture" };
const response = (value: unknown, status=200) => new Response(JSON.stringify(value), { status });
const code = (expected: string) => (error: unknown) => error instanceof SenderPoolError && error.code === expected;

test("whitelisted action shapes, string resource IDs and full signed-positive integer priority", () => {
  assert.deepEqual(parsePoolAction({ op: "enrol", providerPhoneNumberId: "00001234", priority: 2147483647 }), { op: "enrol", providerPhoneNumberId: "00001234", priority: 2147483647 });
  for (const priority of [-1, 1.5, NaN, Infinity, "1", 2147483648]) assert.throws(() => parsePoolAction({ op: "enrol", providerPhoneNumberId: "1234", priority }), code("INVALID_INPUT"));
  for (const providerPhoneNumberId of [1234, "+441234", "123", "1".repeat(33)]) assert.throws(() => parsePoolAction({ op: "enrol", providerPhoneNumberId, priority: 0 }), code("INVALID_INPUT"));
  assert.throws(() => parsePoolAction({ op: "enrol", providerPhoneNumberId: "1234", priority: 0, providerAccountId: "spoof" }), code("INVALID_INPUT"));
  assert.throws(() => parsePoolAction({ op: "update", providerPhoneNumberId: "1234", expected: { priority: 0, allocationEnabled: false }, next: { priority: 0, allocationEnabled: true, accessToken: "spoof" } }), code("INVALID_INPUT"));
});
test("paged Meta verification builds only trusted URLs and encodes cursor without following hostile next", async () => {
  const urls: URL[] = []; const init: RequestInit[] = [];
  const fetcher = (async (input: URL, options: RequestInit) => { urls.push(input); init.push(options); return urls.length===1
    ? response({ data: [{ id: "99999", status: "CONNECTED" }], paging: { next: "https://evil.invalid/steal", cursors: { after: "cursor&token=hostile" } } })
    : response({ data: [{ id: "20000", status: "CONNECTED" }], paging: { next: "ignored" } }); }) as typeof fetch;
  await verifyPhoneMembership(proof, "20000", fetcher);
  assert.equal(urls.length,2); for (const url of urls) { assert.equal(url.origin,"https://graph.facebook.com"); assert.equal(url.pathname,"/v25.0/10000/phone_numbers"); assert.equal(url.searchParams.get("fields"),"id,status"); assert.equal(url.searchParams.get("limit"),"100"); }
  assert.equal(urls[1].searchParams.get("after"),"cursor&token=hostile");
  for (const options of init) { assert.equal(options.method,"GET"); assert.equal(options.redirect,"error"); assert.equal(options.cache,"no-store"); assert.equal((options.headers as {Authorization:string}).Authorization,"Bearer secret-provider-token"); }
});
test("unverified status and complete absence are NOT_CONNECTED; malformed/incomplete listings are unavailable", async () => {
  for (const body of [{ data: [] }, { data: [{id:"20000"}] }, { data: [{id:"20000",status:"DISCONNECTED"}] }]) await assert.rejects(verifyPhoneMembership(proof,"20000",(async()=>response(body)) as typeof fetch),code("NOT_CONNECTED"));
  for (const body of [null,{}, {data:{}}, {data:[{id:123}]}, {data:[],paging:"invalid"}, {data:[],paging:{next:"x"}}, {data:[],paging:{next:"x",cursors:{after:""}}}]) await assert.rejects(verifyPhoneMembership(proof,"20000",(async()=>response(body)) as typeof fetch),code("PROVIDER_UNAVAILABLE"));
  await assert.rejects(verifyPhoneMembership(proof,"20000",(async()=>response({data:[],paging:{next:"x",cursors:{after:"same"}}})) as typeof fetch),code("PROVIDER_UNAVAILABLE"));
});
test("one total deadline covers stalled transport and stalled JSON; original transport cause is retained", async () => {
  await assert.rejects(verifyPhoneMembership(proof,"20000",(()=>new Promise(()=>{})) as typeof fetch,10),code("PROVIDER_UNAVAILABLE"));
  await assert.rejects(verifyPhoneMembership(proof,"20000",(async()=>({ ok:true,status:200,json:()=>new Promise(()=>{}) })) as unknown as typeof fetch,10),code("PROVIDER_UNAVAILABLE"));
  const original = new Error("transport failed");
  await assert.rejects(verifyPhoneMembership(proof,"20000",(async()=>{throw original;}) as typeof fetch), error => code("PROVIDER_UNAVAILABLE")(error) && (error as Error).cause===original);
});
test("safe diagnostics preserve Meta code/subcode/message/trace and scrub credentials and pagination URLs", async () => {
  const lines: string[]=[]; const logger=mock.method(console,"error",(line:string)=>lines.push(line));
  try { await assert.rejects(verifyPhoneMembership(proof,"20000",(async()=>response({error:{message:"Denied secret-provider-token at https://graph.facebook.com/v25.0/10000/phone_numbers?after=private",code:190,error_subcode:463,fbtrace_id:"trace-123"}},401)) as typeof fetch),code("PROVIDER_UNAVAILABLE")); }
  finally {logger.mock.restore();}
  const text=lines.join("\n"); assert.match(text,/Denied/);assert.match(text,/190/);assert.match(text,/463/);assert.match(text,/trace-123/);assert.doesNotMatch(text,/secret-provider-token|after=private|Bearer/);
});
test("credential resolution uses saved environment/version/AAD only and no fallback token", async () => {
  const wrapping=createConfigUnsealKeyring(JSON.stringify({fixture:Buffer.alloc(32,7).toString("base64")}),"fixture");
  const payload={phoneNumberId:"20000",businessAccountId:"10000",accessToken:"secret-provider-token"};
  const value=sealSecret({environment:"test",key:"messaging.sender",version:3,plaintext:JSON.stringify(payload),wrapping});
  const db={platformConfiguration:{findUnique:async(input:unknown)=>{assert.deepEqual(input,{where:{environment_key:{environment:"test",key:"messaging.sender"}}});return {version:3,value};}}};
  assert.deepEqual(await readSenderSnapshot(db as never,"test",wrapping),{...proof,version:3,sealedDigest:sealedDigest(value)});
  for (const row of [null,{version:3,value:DISABLED_SECRET},{version:4,value}]) await assert.rejects(readSenderSnapshot({platformConfiguration:{findUnique:async()=>row}} as never,"test",wrapping),code("CONFIGURATION_UNAVAILABLE"));
  const invalid=sealSecret({environment:"test",key:"messaging.sender",version:3,plaintext:'{"accessToken":"private-malformed-token", invalid}',wrapping});
  const lines:string[]=[];const capture=mock.method(console,"error",(line:string)=>lines.push(line));
  try {await assert.rejects(readSenderSnapshot({platformConfiguration:{findUnique:async()=>({version:3,value:invalid})}} as never,"test",wrapping),code("CONFIGURATION_UNAVAILABLE"));} finally {capture.mock.restore();}
  assert.doesNotMatch(lines.join("\n"),/private-malformed-token/);
});
test("every injectable entry rejects lower roles and malformed mutations before DB/provider access", async () => {
  let touched=0;
  const deps={principal:{id:"actor",role:"PLATFORM_ADMIN",developmentBypass:false},environment:"test",db:new Proxy({}, {get(){touched++;throw new Error("DB should not be touched");}})} as unknown as PoolDependencies;
  await assert.rejects(readSenderPoolWithDependencies(deps),code("FORBIDDEN"));
  await assert.rejects(mutateSenderPoolWithDependencies({op:"enrol",providerPhoneNumberId:"20000",priority:0},deps),code("FORBIDDEN"));
  await assert.rejects(mutateSenderPoolWithDependencies({op:"enrol",providerPhoneNumberId:"20000",priority:0,environment:"production"},{...deps,principal:{...deps.principal,role:"SUPER_ADMIN"}}),code("INVALID_INPUT"));
  assert.equal(touched,0);
});
test("actual page/action authenticate and expose only typed DTOs; inventory has no Graph registration/send path", () => {
  const entry=readFileSync(new URL("../../src/lib/admin/platform-configuration/whatsapp-sender-pool.ts",import.meta.url),"utf8");
  assert.match(entry,/requirePlatformAdminRead\(\)/);assert.match(entry,/requirePlatformAdminMutation\(\)/);assert.equal((entry.match(/requireConfigurationSuperAdmin\(principal\)/g)??[]).length,2);
  const action=readFileSync(new URL("../../src/app/actions/whatsapp-sender-pool.ts",import.meta.url),"utf8");assert.match(action,/revalidatePath\("\/system-controls\/platform-configuration"\)/);assert.doesNotMatch(action,/cause\.message|accessToken|fetch\(/);
  const membership=readFileSync(new URL("../../src/lib/admin/platform-configuration/whatsapp-phone-membership.ts",import.meta.url),"utf8");assert.doesNotMatch(membership,/\/register|\/messages|process\.env\.(?:WHATSAPP|META)/);
});

test("real public service entrypoints invoke authentication and SUPER_ADMIN policy before trusted data workflows",async()=>{
 const state={role:"SUPER_ADMIN",deny:false,reads:0,mutations:0,dbCalls:0};
 const host=globalThis as unknown as {__adminSenderPoolEntry?:typeof state};host.__adminSenderPoolEntry=state;
 const generated=fileURLToPath(new URL("../../.generated/",import.meta.url));mkdirSync(generated,{recursive:true});const directory=mkdtempSync(join(generated,"sender-pool-entry-"));
 const outfile=join(directory,"entry.mjs");
 try {
  await build({entryPoints:[fileURLToPath(new URL("../../src/lib/admin/platform-configuration/whatsapp-sender-pool.ts",import.meta.url))],outfile,bundle:true,packages:"external",platform:"node",format:"esm",target:"node24",tsconfig:fileURLToPath(new URL("../../tsconfig.json",import.meta.url)),plugins:[{name:"entry-auth-fixture",setup(api){
   api.onResolve({filter:/^(?:server-only|@\/lib\/prisma|@\/lib\/auth\/platform-admin|\.\/environment)$/},args=>{
    if(args.path==="./environment"&&!args.importer.endsWith("/whatsapp-sender-pool.ts"))return;
    return {path:args.path,namespace:"entry-fixture"};
   });
   api.onLoad({filter:/.*/,namespace:"entry-fixture"},args=>({loader:"js",contents:args.path==="server-only"?"":args.path==="./environment"?'export const getConfigurationEnvironment=()=>"test";':args.path==="@/lib/prisma"?`const state=globalThis.__adminSenderPoolEntry;export const prisma={platformConfiguration:{findUnique:async()=>{state.dbCalls++;return null;}},$queryRaw:async()=>{state.dbCalls++;return [];}};`:`const state=globalThis.__adminSenderPoolEntry;const principal=()=>{if(state.deny)throw new Error("Unauthenticated fixture");return {id:"entry-actor",role:state.role,developmentBypass:false};};export const requirePlatformAdminRead=async()=>{state.reads++;return principal();};export const requirePlatformAdminMutation=async()=>{state.mutations++;return principal();};`}));
  }}]});
  const entry=await import(pathToFileURL(outfile).href) as {readWhatsAppSenderPool:()=>Promise<unknown>;mutateWhatsAppSenderPool:(input:unknown)=>Promise<unknown>};
  state.role="PLATFORM_ADMIN";
  await assert.rejects(entry.readWhatsAppSenderPool(),/SUPER_ADMIN/);await assert.rejects(entry.mutateWhatsAppSenderPool({}),/SUPER_ADMIN/);assert.equal(state.dbCalls,0);
  state.deny=true;await assert.rejects(entry.readWhatsAppSenderPool(),/Unauthenticated/);await assert.rejects(entry.mutateWhatsAppSenderPool({}),/Unauthenticated/);assert.equal(state.dbCalls,0);
  state.deny=false;state.role="SUPER_ADMIN";
  assert.deepEqual(await entry.readWhatsAppSenderPool(),{providerAccountId:null,rows:[]});const reads=state.dbCalls;
  await assert.rejects(entry.mutateWhatsAppSenderPool({op:"enrol",providerPhoneNumberId:"1234",priority:0,environment:"production"}),/INVALID_INPUT/);assert.equal(state.dbCalls,reads);
  assert.equal(state.reads,3);assert.equal(state.mutations,3);
 }finally{delete host.__adminSenderPoolEntry;rmSync(directory,{recursive:true,force:true});}
});
