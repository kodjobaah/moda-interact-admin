import { prisma } from "../../../prisma";
import { requirePlatformAdminRead } from "../../../auth/platform-admin";
import { requireTemplateSuperAdmin } from "./super-admin";
import { listReviewedCommonLayouts } from "./common-layout-repository";
import type { CommonRecoveryLayoutReference } from "@modainteract/moda-interact-shared/commerce/presentation";

export async function listCommonLayoutChoices(): Promise<CommonRecoveryLayoutReference[]> {
  requireTemplateSuperAdmin(await requirePlatformAdminRead());
  return listReviewedCommonLayouts(prisma);
}
