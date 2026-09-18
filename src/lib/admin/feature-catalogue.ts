import { requirePlatformAdminRead } from "@/lib/auth/platform-admin";
import { prisma } from "@/lib/prisma";

export const FEATURE_KEY_PATTERN = /^[a-z][a-z0-9_]{0,127}$/;

export async function getFeatureCatalogue() {
  await requirePlatformAdminRead();
  return prisma.feature.findMany({
    orderBy: [{ systemRequired: "desc" }, { displayName: "asc" }, { key: "asc" }],
  });
}
