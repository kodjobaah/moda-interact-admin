import {
  createCommerceTranslationProviderCredentialAad,
  type CommerceEnvironment,
} from "@modainteract/moda-interact-shared/commerce/model";
import {
  encryptCredential,
  type CredentialEnvelope,
  type CredentialKeyring,
} from "@modainteract/moda-interact-shared/security/credentials/node";
import { validateTranslationCredentialSecret } from "./translation-configuration-validation.ts";

export const TRANSLATION_CREDENTIAL_ENCRYPTION_UNAVAILABLE =
  "Translation provider credential encryption is unavailable.";

export type SealedTranslationProviderCredential = CredentialEnvelope;

export function sealTranslationProviderCredential(input: {
  environment: CommerceEnvironment;
  provider: string;
  secret: string;
  keyring: CredentialKeyring;
  activeKeyId: string;
}): SealedTranslationProviderCredential {
  const secret = validateTranslationCredentialSecret(input.secret);
  try {
    const aad = createCommerceTranslationProviderCredentialAad({
      environment: input.environment,
      provider: input.provider,
      keyId: input.activeKeyId,
    });
    return encryptCredential({
      keyring: input.keyring,
      activeKeyId: input.activeKeyId,
      plaintext: secret,
      aad,
    });
  } catch {
    throw new Error(TRANSLATION_CREDENTIAL_ENCRYPTION_UNAVAILABLE);
  }
}
