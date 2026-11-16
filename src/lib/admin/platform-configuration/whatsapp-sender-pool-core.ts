/** Trusted injectable workflow. HTTP entrypoints authenticate before constructing dependencies. */
import { Prisma, type PrismaClient, type WhatsAppPoolSender } from "@prisma/client";
import type { PlatformAdminPrincipal } from "@/lib/auth/platform-admin";
import { requireConfigurationSuperAdmin } from "./configuration-authorization";
import { readSenderSnapshot, sealedDigest, verifyPhoneMembership, type SenderSnapshot } from "./whatsapp-phone-membership";
import { lockPoolConfiguration, guardFinalDrain } from "./whatsapp-pool-configuration-fence";
import { SenderPoolError, parsePoolAction, type PoolRow, type SenderSettings } from "./whatsapp-sender-pool-types";
import { logAdminSecurityEvent } from "@/lib/auth/audit";
import { poolFailure } from "./whatsapp-sender-pool-diagnostics";
import type { UnsealKeyring } from "./seal";
export type PoolDependencies = { db: PrismaClient; environment: string; principal: PlatformAdminPrincipal; wrapping?: UnsealKeyring;
  snapshot?: () => Promise<SenderSnapshot>; verify?: (snapshot: SenderSnapshot, phoneId: string) => Promise<void> };
const dto = (row: WhatsAppPoolSender): PoolRow => ({ providerPhoneNumberId: row.providerPhoneNumberId, providerAccountId: row.providerAccountId,
  priority: row.priority, allocationEnabled: row.allocationEnabled, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
const same = (row: SenderSettings, settings: SenderSettings) => row.priority === settings.priority && row.allocationEnabled === settings.allocationEnabled;
function authorize(deps: PoolDependencies) {
  try { requireConfigurationSuperAdmin(deps.principal); }
  catch (cause) { throw new SenderPoolError("FORBIDDEN", cause); }
  if (!["local", "test", "development", "staging", "production"].includes(deps.environment)) throw new SenderPoolError("FORBIDDEN");
}
const snapshotFor = (deps: PoolDependencies) => deps.snapshot ? deps.snapshot() : readSenderSnapshot(deps.db, deps.environment, deps.wrapping);
async function lockVerifiedConfiguration(tx: Prisma.TransactionClient, environment: string, proof: SenderSnapshot) {
  const rows = await tx.$queryRaw<Array<{ version: number; value: unknown }>>`SELECT version,value FROM public."PlatformConfiguration" WHERE environment=${environment} AND key='messaging.sender' FOR SHARE`;
  const current = rows[0];
  if (!current || current.version !== proof.version || sealedDigest(current.value) !== proof.sealedDigest) throw new SenderPoolError("CONFIGURATION_CHANGED");
}
export async function readSenderPoolWithDependencies(deps: PoolDependencies): Promise<{ providerAccountId: string | null; rows: PoolRow[] }> {
  authorize(deps);
  try {
    let providerAccountId: string | null = null;
    try { providerAccountId = (await snapshotFor(deps)).providerAccountId; } catch (cause) { if (!(cause instanceof SenderPoolError) || cause.code !== "CONFIGURATION_UNAVAILABLE") throw cause; }
    const rows = await deps.db.$queryRaw<WhatsAppPoolSender[]>`SELECT * FROM whatsapp."WhatsAppPoolSender" ORDER BY priority ASC,"providerPhoneNumberId" COLLATE "C" ASC LIMIT 1001`;
    if (rows.length > 1000) throw new Error("Sender inventory exceeds the bounded console page size");
    logAdminSecurityEvent("admin.whatsapp_sender_pool.read", { adminId: deps.principal.id, role: deps.principal.role, resourceType: "whatsapp_pool_sender", outcome: "succeeded" });
    return { providerAccountId, rows: rows.map(dto) };
  } catch (cause) { if (cause instanceof SenderPoolError) throw cause; poolFailure("read-inventory", cause); throw new SenderPoolError("DB_UNAVAILABLE", cause); }
}
export async function mutateSenderPoolWithDependencies(raw: unknown, deps: PoolDependencies): Promise<PoolRow> {
  let proof: SenderSnapshot | undefined;
  let operation = "validate";
  let phoneId: string | undefined;
  try {
    authorize(deps);
    const action = parsePoolAction(raw); operation = action.op; phoneId = action.providerPhoneNumberId;
    const before = await deps.db.whatsAppPoolSender.findUnique({ where: { providerPhoneNumberId: phoneId } });
    if (action.op === "enrol") {
      proof = await snapshotFor(deps);
      if (before && before.providerAccountId !== proof.providerAccountId) throw new SenderPoolError("IDENTITY_CONFLICT");
      if (!before) await (deps.verify ?? verifyPhoneMembership)(proof, phoneId);
    } else {
      if (!before) throw new SenderPoolError("SENDER_NOT_FOUND");
      if (!same(before, action.next) && !same(before, action.expected)) throw new SenderPoolError("STALE_SETTINGS");
      if (!before.allocationEnabled && action.next.allocationEnabled) {
        proof = await snapshotFor(deps);
        if (before.providerAccountId !== proof.providerAccountId) throw new SenderPoolError("IDENTITY_CONFLICT");
        await (deps.verify ?? verifyPhoneMembership)(proof, phoneId);
      }
    }
    const row = await deps.db.$transaction(async tx => {
      await lockPoolConfiguration(tx, deps.environment);
      if (action.op === "enrol") await tx.$queryRaw`WITH locked AS MATERIALIZED (SELECT pg_advisory_xact_lock(hashtextextended('whatsapp-pool-membership:' || ${action.providerPhoneNumberId}::text, 0))) SELECT count(*)::integer AS locked FROM locked`;
      if (proof) await lockVerifiedConfiguration(tx, deps.environment, proof);
      const locked = await tx.$queryRaw<WhatsAppPoolSender[]>`SELECT * FROM whatsapp."WhatsAppPoolSender" WHERE "providerPhoneNumberId"=${action.providerPhoneNumberId} FOR UPDATE`;
      const current = locked[0];
      if (action.op === "enrol") {
        if (current) {
          if (current.providerAccountId !== proof!.providerAccountId) throw new SenderPoolError("IDENTITY_CONFLICT");
          return current;
        }
        const created = await tx.whatsAppPoolSender.createMany({ data: [{ providerPhoneNumberId: action.providerPhoneNumberId,
          providerAccountId: proof!.providerAccountId, priority: action.priority, allocationEnabled: false, verifiedAt: new Date() }], skipDuplicates: true });
        const existing = await tx.whatsAppPoolSender.findUniqueOrThrow({ where: { providerPhoneNumberId: action.providerPhoneNumberId } });
        if (existing.providerAccountId !== proof!.providerAccountId) throw new SenderPoolError("IDENTITY_CONFLICT");
        if (created.count !== 1 && !existing.verifiedAt) throw new SenderPoolError("CONFIGURATION_CHANGED");
        return existing;
      }
      if (!current) throw new SenderPoolError("SENDER_NOT_FOUND");
      if (same(current, action.next)) return current;
      if (!same(current, action.expected)) throw new SenderPoolError("STALE_SETTINGS");
      if (!current.allocationEnabled && action.next.allocationEnabled && (!proof || current.providerAccountId !== proof.providerAccountId)) throw new SenderPoolError("CONFIGURATION_CHANGED");
      if (current.allocationEnabled && !action.next.allocationEnabled) await guardFinalDrain(tx, deps.environment, current, deps.wrapping);
      return tx.whatsAppPoolSender.update({ where: { providerPhoneNumberId: action.providerPhoneNumberId }, data: {
        priority: action.next.priority, allocationEnabled: action.next.allocationEnabled,
        ...(!current.allocationEnabled && action.next.allocationEnabled ? { verifiedAt: new Date() } : {}),
      } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 10_000 });
    logAdminSecurityEvent("admin.whatsapp_sender_pool.mutated", { adminId: deps.principal.id, role: deps.principal.role,
      action: operation, resourceType: "whatsapp_pool_sender", resourceId: `${deps.environment}:${phoneId}`, outcome: "succeeded" });
    return dto(row);
  } catch (cause) {
    const code = cause instanceof SenderPoolError ? cause.code : "DB_UNAVAILABLE";
    logAdminSecurityEvent("admin.whatsapp_sender_pool.mutation_failed", { adminId: deps.principal.id, role: deps.principal.role,
      action: operation, resourceType: "whatsapp_pool_sender", outcome: code === "FORBIDDEN" ? "denied" : "failed", reasonCode: code });
    if (cause instanceof SenderPoolError) throw cause;
    poolFailure(operation, cause, proof ? [proof.accessToken] : []);
    throw new SenderPoolError("DB_UNAVAILABLE", cause);
  }
}
