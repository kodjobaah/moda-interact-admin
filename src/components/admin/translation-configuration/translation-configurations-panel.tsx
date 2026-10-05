import type { TranslationConfigurationAdminData } from "@/lib/admin/translation-configuration";
import { TranslationProviderCredential } from "./translation-provider-credential";
import { TranslationModelConfigurations } from "./translation-model-configurations";

export function TranslationConfigurationsPanel({
  data,
  canMutate,
}: {
  data: TranslationConfigurationAdminData;
  canMutate: boolean;
}) {
  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--brand-900)]">
          Translations
        </h1>
        <p className="mt-1 max-w-4xl text-sm text-gray-600">
          Configure the provider credential and selectable translation models
          used by Store Category localisation. This page manages configuration
          only; translation execution is introduced by later ARCH-029 tasks.
        </p>
      </div>
      <TranslationProviderCredential
        status={data.credential}
        canMutate={canMutate}
      />
      <TranslationModelConfigurations
        models={data.models}
        canMutate={canMutate}
        credentialConfigured={data.credential.configured}
      />
    </div>
  );
}
