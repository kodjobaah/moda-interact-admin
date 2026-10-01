export const CREDENTIAL_ENCRYPTION_UNAVAILABLE =
  "OpenRouter credential encryption is unavailable.";

export type CredentialKeyring = Readonly<Record<string, Uint8Array>>;

export type ActiveCredentialKeyring = {
  keyring: CredentialKeyring;
  activeKeyId: string;
};

function unavailable(): never {
  throw new Error(CREDENTIAL_ENCRYPTION_UNAVAILABLE);
}

function decodeKeyring(raw: string | undefined): Record<string, Uint8Array> {
  if (!raw) return unavailable();
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return unavailable();
  }
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).length === 0
  ) {
    return unavailable();
  }

  const keyring: Record<string, Uint8Array> = Object.create(null) as Record<
    string,
    Uint8Array
  >;
  for (const [keyId, encoded] of Object.entries(value)) {
    if (
      !keyId.trim() ||
      keyId.length > 64 ||
      typeof encoded !== "string" ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        encoded,
      )
    ) {
      return unavailable();
    }
    const bytes = Buffer.from(encoded, "base64");
    if (bytes.byteLength !== 32 || bytes.toString("base64") !== encoded) {
      return unavailable();
    }
    keyring[keyId] = new Uint8Array(bytes);
  }
  return keyring;
}

export function loadActiveCredentialKeyring(): ActiveCredentialKeyring {
  const keyring = decodeKeyring(process.env.COMMERCE_CONNECTION_KEYS_JSON);
  const activeKeyId = process.env.COMMERCE_CONNECTION_ACTIVE_KEY_ID?.trim();
  if (!activeKeyId || !keyring[activeKeyId]) return unavailable();
  return { keyring, activeKeyId };
}
