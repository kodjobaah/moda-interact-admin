import type { PrismaClient } from "@prisma/client";
import { getConfigurationEnvironment } from "../../platform-configuration/service";
import { loadConfigUnsealKeyring, unsealSecret } from "../../platform-configuration/seal";
import { validateSecretPayload } from "../../platform-configuration/secret-validation";
import { reject } from "./validation";

/** Resolve the server's sender identity, not a caller-provided WABA or phone-number ID.
 * The sealed ARCH-043 sender record is authoritative over legacy environment fallback.
 * Neither tokens nor decrypted secret payloads reach a client prop or audit. */
export async function configuredSenderWaba(db: Pick<PrismaClient, "platformConfiguration">): Promise<string> {
  const environment = getConfigurationEnvironment();
  const row = await db.platformConfiguration.findUnique({
    where: { environment_key: { environment, key: "messaging.sender" } },
    select: { value: true, version: true },
  });
  if (row) {
    const plain = unsealSecret({ environment, key: "messaging.sender", version: row.version,
      value: row.value, wrapping: loadConfigUnsealKeyring() });
    const sender = validateSecretPayload("messaging.sender", JSON.parse(plain));
    return String(sender.businessAccountId);
  }
  const fallback = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  if (!fallback || !/^\d{4,32}$/.test(fallback)) return reject("CONFIGURATION", "A verified WhatsApp Business Account ID is not configured.");
  return fallback;
}
