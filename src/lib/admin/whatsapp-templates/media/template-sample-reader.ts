import type { PrismaClient } from "@prisma/client";
import type { PlatformAdminPrincipal } from "../../../auth/platform-admin";
import { PLATFORM_POLICY_REGISTRY, validateConfiguration } from "../../platform-configuration/contracts";
import { requireTemplateSuperAdmin } from "../authoring/super-admin";
import { projectTemplateSamples, TEMPLATE_SAMPLE_MEDIA_KEY, type TemplateSampleMediaView } from "./template-samples";

export class TemplateSampleReadError extends Error {
  constructor(readonly code: "CONFIG_UNAVAILABLE") { super(code); this.name = "TemplateSampleReadError"; }
}

/** One environment-scoped settings record, never a query over merchant ShopBrand rows. */
export async function readTemplateSampleMedia(input: {
  principal: PlatformAdminPrincipal;
  db: Pick<PrismaClient, "platformConfiguration">;
  environment: string;
}): Promise<TemplateSampleMediaView> {
  requireTemplateSuperAdmin(input.principal);
  const policy = PLATFORM_POLICY_REGISTRY.get("shopBrand.publicMedia");
  if (!policy?.defaults || policy.kind !== "policy") throw new TemplateSampleReadError("CONFIG_UNAVAILABLE");
  const [publicSettings, savedSamples] = await Promise.all([
    input.db.platformConfiguration.findUnique({
      where: { environment_key: { environment: input.environment, key: policy.key } }, select: { value: true },
    }),
    input.db.platformConfiguration.findUnique({
      where: { environment_key: { environment: input.environment, key: TEMPLATE_SAMPLE_MEDIA_KEY } }, select: { value: true },
    }),
  ]);
  const checked = validateConfiguration(policy, publicSettings?.value ?? policy.defaults);
  if (!checked.ok || typeof checked.values.publicOrigin !== "string") {
    throw new TemplateSampleReadError("CONFIG_UNAVAILABLE");
  }
  return projectTemplateSamples(savedSamples?.value, input.environment, checked.values.publicOrigin);
}
