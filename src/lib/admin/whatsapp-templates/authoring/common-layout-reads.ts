import { prisma } from "../../../prisma";
import { requirePlatformAdminRead } from "../../../auth/platform-admin";
import { requireTemplateSuperAdmin } from "./super-admin";
import {
  listReviewedCommonLayouts,
  readSavedCommonLayout,
  SavedCommonLayoutError,
} from "./common-layout-repository";
import type { CommonRecoveryLayoutReference } from "@modainteract/moda-interact-shared/commerce/presentation";

export type CommonLayoutChoice = CommonRecoveryLayoutReference & {
  createdAt: string;
  active: boolean;
};

export async function listCommonLayoutChoices(): Promise<CommonLayoutChoice[]> {
  requireTemplateSuperAdmin(await requirePlatformAdminRead());
  const [refs, slot] = await Promise.all([
    listReviewedCommonLayouts(prisma),
    prisma.whatsAppConversationWrapperActiveSlot.findUnique({
      where: { audience: "SHARED" },
      select: { definitionId: true },
    }),
  ]);
  if (slot && !refs.some((ref) => ref.definitionId === slot.definitionId)) {
    try {
      refs.unshift(
        await readSavedCommonLayout(prisma, slot.definitionId, "en"),
      );
    } catch (error) {
      if (!(error instanceof SavedCommonLayoutError)) throw error;
    }
  }
  const dates = await prisma.whatsAppTemplateDefinition.findMany({
    where: { id: { in: refs.map((ref) => ref.definitionId) } },
    select: { id: true, createdAt: true },
  });
  return refs.flatMap((ref) => {
    const date = dates.find((row) => row.id === ref.definitionId);
    return date
      ? [
          {
            ...ref,
            createdAt: date.createdAt.toISOString(),
            active: slot?.definitionId === ref.definitionId,
          },
        ]
      : [];
  });
}
