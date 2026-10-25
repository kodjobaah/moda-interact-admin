import type { PrismaClient } from "@prisma/client";
import { getConfigurationEnvironment } from "../../platform-configuration/service";
import { loadConfigUnsealKeyring, unsealSecret } from "../../platform-configuration/seal";
import { MetaSubmissionError } from "./contracts";

const IDENTIFIER = /^\d{4,32}$/;

/** Only returns a WABA identifier, never an access token or decrypted sender bundle. */
export async function resolveTrustedMetaWaba(db: Pick<PrismaClient, "platformConfiguration">): Promise<string> {
  const environment = getConfigurationEnvironment();
  const saved = await db.platformConfiguration.findUnique({
    where: { environment_key: { environment, key: "messaging.sender" } },
    select: { value: true, version: true },
  });
  let wabaId: unknown;
  if (saved) {
    // A disabled, corrupt or undecryptable saved configuration must fail closed.
    let raw: string;
    try {
      raw = unsealSecret({ environment, key: "messaging.sender", version: saved.version,
        value: saved.value, wrapping: loadConfigUnsealKeyring() });
    } catch {
      // Keep provider configuration and keyring diagnostics out of the page.
      throw new MetaSubmissionError("SENDER_UNAVAILABLE", "Trusted sender configuration is unavailable.");
    }
    let config: unknown;
    try { config = JSON.parse(raw); } catch { throw new MetaSubmissionError("SENDER_UNAVAILABLE", "Sender configuration is invalid."); }
    wabaId = config && typeof config === "object" && !Array.isArray(config) &&
      (config as Record<string, unknown>).businessAccountId;
  } else {
    // Matches Background's deploy-owned environment fallback when no saved record exists.
    wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  }
  if (typeof wabaId !== "string" || !IDENTIFIER.test(wabaId)) {
    throw new MetaSubmissionError("SENDER_UNAVAILABLE", "Configure a trusted WhatsApp Business Account before submission.");
  }
  return wabaId;
}
