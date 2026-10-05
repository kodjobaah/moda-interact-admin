import type {
  CommerceEnvironment,
  Prisma,
} from "@prisma/client";
import { resolveCommerceEnvironment } from "./openrouter-credential-environment.ts";
import { TRANSLATION_PROVIDER } from "./translation-configuration-validation.ts";

export type TranslationProviderCredentialStatus = {
  environment: CommerceEnvironment;
  provider: typeof TRANSLATION_PROVIDER;
  configured: boolean;
  editVersion: number | null;
  updatedAt: string | null;
  updatedByAdminId: string | null;
  modelCount: number;
};

export type TranslationModelConfigurationView = {
  id: string;
  environment: CommerceEnvironment;
  provider: typeof TRANSLATION_PROVIDER;
  providerModelId: string;
  displayName: string;
  enabled: boolean;
  editVersion: number;
  createdAt: string;
  updatedAt: string;
  createdByAdminId: string;
  updatedByAdminId: string;
};

export type TranslationConfigurationAdminData = {
  environment: CommerceEnvironment;
  credential: TranslationProviderCredentialStatus;
  models: TranslationModelConfigurationView[];
};

export const TRANSLATION_CONFIGURATION_ERRORS = {
  superAdminRequired: "SUPER_ADMIN access is required.",
  credentialAlreadyConfigured:
    "OpenAI translation credential is already configured. Use Replace.",
  credentialNotConfigured:
    "OpenAI translation credential is not configured. Configure it first.",
  credentialChanged:
    "OpenAI translation credential changed. Refresh and try again.",
  credentialInUse:
    "OpenAI translation credential cannot be removed while translation model configurations exist. Replace the credential instead.",
  modelNotFound: "Translation model configuration was not found.",
  modelChanged:
    "Translation model configuration changed. Refresh and try again.",
  modelDuplicate:
    "A translation model with this display name or provider model ID already exists in this environment.",
} as const;

export const translationCredentialStatusSelect = {
  editVersion: true,
  updatedAt: true,
  updatedByAdminId: true,
  _count: { select: { models: true } },
} satisfies Prisma.CommerceTranslationProviderCredentialSelect;

export const translationModelSelect = {
  id: true,
  environment: true,
  provider: true,
  providerModelId: true,
  displayName: true,
  enabled: true,
  editVersion: true,
  createdAt: true,
  updatedAt: true,
  createdByAdminId: true,
  updatedByAdminId: true,
} satisfies Prisma.CommerceTranslationModelConfigurationSelect;

export function translationCredentialStatus(
  environment: CommerceEnvironment,
  row:
    | {
        editVersion: number;
        updatedAt: Date;
        updatedByAdminId: string;
        _count: { models: number };
      }
    | null,
): TranslationProviderCredentialStatus {
  return {
    environment,
    provider: TRANSLATION_PROVIDER,
    configured: row !== null,
    editVersion: row?.editVersion ?? null,
    updatedAt: row?.updatedAt.toISOString() ?? null,
    updatedByAdminId: row?.updatedByAdminId ?? null,
    modelCount: row?._count.models ?? 0,
  };
}

export function translationModelView(row: {
  id: string;
  environment: CommerceEnvironment;
  provider: string;
  providerModelId: string;
  displayName: string;
  enabled: boolean;
  editVersion: number;
  createdAt: Date;
  updatedAt: Date;
  createdByAdminId: string;
  updatedByAdminId: string;
}): TranslationModelConfigurationView {
  if (row.provider !== TRANSLATION_PROVIDER) {
    throw new Error("Unsupported translation provider configuration exists.");
  }
  return {
    ...row,
    provider: TRANSLATION_PROVIDER,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getTranslationConfigurationAdminData(): Promise<TranslationConfigurationAdminData> {
  const [{ requirePlatformAdminRead }, { prisma }] = await Promise.all([
    import("@/lib/auth/platform-admin"),
    import("@/lib/prisma"),
  ]);
  await requirePlatformAdminRead();
  const environment = resolveCommerceEnvironment() as CommerceEnvironment;
  const [credential, models] = await Promise.all([
    prisma.commerceTranslationProviderCredential.findUnique({
      where: {
        environment_provider: {
          environment,
          provider: TRANSLATION_PROVIDER,
        },
      },
      select: translationCredentialStatusSelect,
    }),
    prisma.commerceTranslationModelConfiguration.findMany({
      where: { environment, provider: TRANSLATION_PROVIDER },
      orderBy: [
        { displayName: "asc" },
        { providerModelId: "asc" },
        { id: "asc" },
      ],
      select: translationModelSelect,
    }),
  ]);
  return {
    environment,
    credential: translationCredentialStatus(environment, credential),
    models: models.map(translationModelView),
  };
}
