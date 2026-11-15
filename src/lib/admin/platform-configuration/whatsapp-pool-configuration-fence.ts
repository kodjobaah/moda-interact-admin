import { Prisma } from "@prisma/client";
import { decodeSenderSnapshot } from "./whatsapp-phone-membership";
import { loadConfigUnsealKeyring, type UnsealKeyring } from "./seal";
import { SenderPoolError } from "./whatsapp-sender-pool-types";
import { ConfigurationError } from "./errors";

const disabled = (value: unknown) => !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 2 && (value as { kind?: unknown; schemaVersion?: unknown }).kind === "disabled" && (value as { schemaVersion?: unknown }).schemaVersion === 1;

/** Shared only within Admin: inventory and messaging.sender writes take this first. */
export async function lockPoolConfiguration(tx: Prisma.TransactionClient, environment: string): Promise<void> {
  await tx.$queryRaw`WITH locked AS MATERIALIZED (SELECT pg_advisory_xact_lock(hashtextextended(${'whatsapp-pool-configuration:' + environment}::text, 0))) SELECT count(*)::integer AS locked FROM locked`;
}
export async function guardFinalDrain(tx: Prisma.TransactionClient, environment: string, row: { providerPhoneNumberId: string; providerAccountId: string }, wrapping?: UnsealKeyring): Promise<void> {
  const others = await tx.whatsAppPoolSender.count({ where: { providerAccountId: row.providerAccountId, allocationEnabled: true, providerPhoneNumberId: { not: row.providerPhoneNumberId } } });
  if (others) return; // Graph/credentials are not required for non-final drains.
  const current = await tx.platformConfiguration.findUnique({ where: { environment_key: { environment, key: "messaging.sender" } } });
  if (!current || disabled(current.value)) return;
  let identity;
  try { identity = decodeSenderSnapshot(current, environment, wrapping ?? loadConfigUnsealKeyring()); }
  catch (cause) { throw new SenderPoolError("CONFIGURATION_UNAVAILABLE", cause); }
  if (identity.providerAccountId === row.providerAccountId) throw new SenderPoolError("INVALID_INPUT");
}
/** Called only inside the existing secret writer's fenced transaction. Explicit revoke permits bootstrap. */
export async function guardSenderWabaSwitch(tx: Prisma.TransactionClient, environment: string, existing: { version: number; value: unknown } | null, next: Record<string, string | number> | null, wrapping: UnsealKeyring): Promise<void> {
  if (!existing || !next || disabled(existing.value)) return;
  let current;
  try { current = decodeSenderSnapshot(existing, environment, wrapping); }
  catch { return; } // Existing secret workflow independently refuses an unreadable update/rotation.
  if (current.providerAccountId === next.businessAccountId) return;
  const active = await tx.whatsAppPoolSender.count({ where: { providerAccountId: current.providerAccountId, allocationEnabled: true } });
  if (!active) return;
  const target = await tx.whatsAppPoolSender.count({ where: { providerAccountId: String(next.businessAccountId), allocationEnabled: true } });
  if (!target) throw new ConfigurationError("INVALID_INPUT", "The active sender pool requires an enabled verified sender on the target WABA. Enrol and enable it first, or explicitly revoke before bootstrap.");
}
