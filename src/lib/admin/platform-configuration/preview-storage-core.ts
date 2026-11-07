/** Exact Commerce namespace; no browser-supplied environment, prefix, key or Redis URL. */
export const PREVIEW_STORAGE_MANAGEMENT_SCRIPT = `
local raw=redis.call('GET',KEYS[1]);if not raw then return cjson.encode({conversations=0,runs=0,bytes=0,active=0,purged=false}) end
if string.len(raw)>4194304 then return redis.error_reply('preview index exceeds management bound') end
local s=cjson.decode(raw);local conversations=0;local runs=0;local active=0;local bytes=string.len(raw);local keys={}
for _,kind in ipairs({'conversations','runs','toolTests'}) do
 for key,v in pairs(s[kind] or {}) do
  if kind=='conversations' then conversations=conversations+1 else runs=runs+1 end
  if v.status=='RUNNING' and tonumber(ARGV[2])-(v.reservedAt or v.createdAt)<120000 then active=active+1 end
  if s.schemaVersion==2 then local record=KEYS[1]..':'..kind..':'..key;table.insert(keys,record);bytes=bytes+redis.call('STRLEN',record) end
 end
end
if conversations>512 or runs>4096 then return redis.error_reply('preview record count exceeds management bound') end
local purged=false
if ARGV[1]=='purge' and active==0 then
 for _,key in ipairs(keys) do redis.call('DEL',key) end
 -- Preserve the independent hourly model-start quota when clearing preview data.
 if next(s.modelStarts or {}) then redis.call('SET',KEYS[1],cjson.encode({schemaVersion=2,conversations={},runs={},toolTests={},runKinds={},modelStarts=s.modelStarts,modelSlots={}}),'PX',3600000) else redis.call('DEL',KEYS[1]) end;purged=true
end
return cjson.encode({conversations=conversations,runs=runs,bytes=bytes,active=active,purged=purged})`;

export type PreviewStorageUsage = { conversations: number; runs: number; bytes: number; active: number; purged: boolean };
export async function managePreviewStorageWithDependencies(operation: 'read' | 'purge', input: unknown, deps: {
  principal: { id: string; role: string }; environment: string;
  eval: (script: string, key: string, operation: string, now: number) => Promise<unknown>;
  audit: (data: Record<string, unknown>) => void; now?: () => number;
}): Promise<PreviewStorageUsage> {
  if (deps.principal.role !== 'SUPER_ADMIN') throw new Error('Super-admin access is required.');
  if (!['local', 'development', 'test', 'staging', 'production'].includes(deps.environment)) throw new Error('Invalid deployment environment.');
  let reason = '';
  if (operation === 'purge') {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Confirmation and audit reason are required.');
    const value = input as Record<string, unknown>;
    if (Object.keys(value).some((key) => !['confirmation', 'reason'].includes(key)) || value.confirmation !== `PURGE ${deps.environment}` ||
        typeof value.reason !== 'string' || value.reason.trim().length < 1 || value.reason.trim().length > 1000) throw new Error('Enter the exact confirmation and an audit reason.');
    reason = value.reason.trim();
    // Record intent before deletion; a failed audit must prevent the operation.
    deps.audit({ actorId: deps.principal.id, environment: deps.environment, operation, outcome: 'REQUESTED', reason });
  }
  const raw = await deps.eval(PREVIEW_STORAGE_MANAGEMENT_SCRIPT, `commerce:preview:${deps.environment}:state`, operation, (deps.now ?? Date.now)());
  if (typeof raw !== 'string') throw new Error('Invalid storage response.');
  const value = JSON.parse(raw) as PreviewStorageUsage;
  if (![value.conversations, value.runs, value.bytes, value.active].every((entry) => Number.isSafeInteger(entry) && entry >= 0) || typeof value.purged !== 'boolean') throw new Error('Invalid storage response.');
  if (operation === 'purge') {
    deps.audit({ actorId: deps.principal.id, environment: deps.environment, operation, outcome: value.active ? 'BUSY' : 'PURGED', ...value, reason });
    if (value.active) throw new Error('A preview is running. Wait for it to finish or cancel it in Studio before purging.');
  }
  return value;
}

