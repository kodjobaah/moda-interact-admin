import {
  createCommerceOpenRouterCredentialAad,
  type CommerceEnvironment,
} from "@modainteract/moda-interact-shared/commerce/model";
import {
  encryptCredential,
  type CredentialEnvelope,
  type CredentialKeyring,
} from "@modainteract/moda-interact-shared/security/credentials/node";
import { CREDENTIAL_ENCRYPTION_UNAVAILABLE } from "./shared-credential-keyring.ts";
import { validateOpenRouterCredentialSecret } from "./openrouter-credential-validation.ts";

export type SealedOpenRouterCredential = CredentialEnvelope;

export function sealOpenRouterCredential(input: {
  environment: CommerceEnvironment;
  secret: string;
  keyring: CredentialKeyring;
  activeKeyId: string;
}): SealedOpenRouterCredential {
  const secret = validateOpenRouterCredentialSecret(input.secret);
  try {
    const aad = createCommerceOpenRouterCredentialAad({
      environment: input.environment,
      keyId: input.activeKeyId,
    });
    return encryptCredential({
      keyring: input.keyring,
      activeKeyId: input.activeKeyId,
      plaintext: secret,
      aad,
    });
  } catch {
    throw new Error(CREDENTIAL_ENCRYPTION_UNAVAILABLE);
  }
}
