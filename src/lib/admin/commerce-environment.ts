import type { CommerceEnvironment } from "@prisma/client";
import { resolveDeploymentEnvironmentName } from "../auth/environment.ts";

export function resolveAdminCommerceEnvironment(): CommerceEnvironment {
  switch (resolveDeploymentEnvironmentName()) {
    case "local":
      return "LOCAL";
    case "test":
      return "TEST";
    case "development":
      return "DEVELOPMENT";
    case "staging":
      return "STAGING";
    case "production":
      return "PRODUCTION";
    default:
      throw new Error("Commerce environment is unavailable.");
  }
}