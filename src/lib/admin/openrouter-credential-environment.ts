import {
  CommerceEnvironmentSchema,
  type CommerceEnvironment,
} from "@modainteract/moda-interact-shared/commerce/model";

export function resolveCommerceEnvironment(): CommerceEnvironment {
  const configured = process.env.DEPLOYMENT_ENVIRONMENT_NAME?.trim();
  const fallback = process.env.NODE_ENV?.trim();
  const name = (configured || fallback || "").toLowerCase();
  const environments: Record<string, CommerceEnvironment> = {
    local: "LOCAL",
    test: "TEST",
    development: "DEVELOPMENT",
    staging: "STAGING",
    production: "PRODUCTION",
  };
  const environment = environments[name];
  if (
    !environment ||
    !CommerceEnvironmentSchema.safeParse(environment).success
  ) {
    throw new Error("Commerce deployment environment is invalid.");
  }
  return environment;
}
