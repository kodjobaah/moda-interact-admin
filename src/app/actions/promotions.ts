"use server";

import {
  PromotionCampaignEventType,
  PromotionCampaignStatus,
  PromotionTargetScope,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePlatformAdminMutation } from "@/lib/auth/platform-admin";
import {
  DEVELOPMENT_PLATFORM_ADMIN,
  ensureDevelopmentPlatformAdmin,
} from "@/lib/auth/development-platform-admin";
import { prisma } from "@/lib/prisma";
import { mutatePromotionCampaignLifecycle } from "@/lib/admin/promotions/lifecycle";
import {
  parsePromotionCampaignForm,
  validatePromotionCampaignTerms,
  validatePromotionTarget,
  type PromotionCampaignFormValues,
} from "@/lib/admin/promotions/validation";
import {
  NEW_PROMOTION_TRANSLATION_CAMPAIGN_ID,
  parseCompletedPromotionTranslationPackage,
} from "@/lib/admin/promotions/translations";
import { TRANSLATION_WORKBOOK_LOCALES } from "@/lib/admin/translation-workbook-common";

async function auditAdminId(
  principal: Awaited<ReturnType<typeof requirePlatformAdminMutation>>,
): Promise<string> {
  if (!principal.developmentBypass) return principal.id;

  return prisma.$transaction(async (transaction) => {
    await ensureDevelopmentPlatformAdmin(transaction, principal);
    const developmentAdmin = await transaction.platformAdmin.findUnique({
      where: { id: DEVELOPMENT_PLATFORM_ADMIN.id },
      select: { id: true },
    });
    if (!developmentAdmin)
      throw new Error(
        "A provisioned SUPER_ADMIN is required for campaign mutations.",
      );
    return developmentAdmin.id;
  });
}

function requireSuperAdmin(
  principal: Awaited<ReturnType<typeof requirePlatformAdminMutation>>,
): void {
  if (principal.role !== "SUPER_ADMIN")
    throw new Error("SUPER_ADMIN access is required.");
}

export type PromotionCampaignReactivationActionState =
  | { ok: true }
  | { ok: false; message: string }
  | null;

export async function reactivatePromotionCampaignAction(
  _previousState: PromotionCampaignReactivationActionState,
  formData: FormData,
): Promise<PromotionCampaignReactivationActionState> {
  try {
    await mutatePromotionCampaignAction(formData);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Promotion campaign could not be reactivated.",
    };
  }
}

async function resolveTarget(
  transaction: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  values: PromotionCampaignFormValues,
): Promise<void> {
  validatePromotionTarget(
    values.scope,
    values.targetPlanId,
    values.targetShopId,
  );
  if (values.scope === "PLAN") {
    const plan = await transaction.billingPlan.findUnique({
      where: { id: values.targetPlanId! },
      select: { id: true },
    });
    if (!plan) throw new Error("Billing plan target was not found.");
  }
  if (values.scope === "SHOP") {
    const shop = await transaction.shop.findUnique({
      where: { id: values.targetShopId! },
      select: { id: true },
    });
    if (!shop) throw new Error("Shop target was not found.");
  }
}

function campaignData(values: PromotionCampaignFormValues) {
  return {
    name: values.name,
    scope: values.scope as PromotionTargetScope,
    quantity: values.quantity,
    targetPlanId: values.targetPlanId,
    targetShopId: values.targetShopId,
    startsAt: values.startsAt,
    expiresAt: values.expiresAt,
  };
}

function completeTranslationCount(
  translations: Array<{
    locale: string;
    merchantTitle: string;
    merchantDescription: string;
  }>,
) {
  return translations.filter(
    (translation) =>
      translation.merchantTitle.trim() &&
      translation.merchantDescription.trim(),
  ).length;
}

export async function mutatePromotionCampaignAction(
  formData: FormData,
): Promise<void> {
  const principal = await requirePlatformAdminMutation();
  requireSuperAdmin(principal);
  const adminId = await auditAdminId(principal);
  const intent = formData.get("intent");

  if (intent === "activate") {
    const id =
      typeof formData.get("id") === "string"
        ? String(formData.get("id")).trim()
        : "";
    if (!id) throw new Error("A campaign id is required.");

    await prisma.$transaction(async (transaction) => {
      const existing = await transaction.promotionCampaign.findUnique({
        where: { id },
      });
      if (!existing) throw new Error("Promotion campaign not found.");
      if (existing.status !== PromotionCampaignStatus.DRAFT) {
        throw new Error("Only draft campaigns can be activated.");
      }
      const translations =
        await transaction.promotionCampaignTranslation.findMany({
          where: { promotionCampaignId: id },
          select: {
            locale: true,
            merchantTitle: true,
            merchantDescription: true,
          },
        });
      if (
        translations.length !== TRANSLATION_WORKBOOK_LOCALES.length ||
        completeTranslationCount(translations) !==
          TRANSLATION_WORKBOOK_LOCALES.length ||
        TRANSLATION_WORKBOOK_LOCALES.some(
          ({ locale }) =>
            !translations.some((translation) => translation.locale === locale),
        )
      ) {
        throw new Error(
          "Complete all 20 merchant translations before activating this campaign.",
        );
      }
      const english = translations.find(
        (translation) => translation.locale === "en",
      );
      const currentValues: PromotionCampaignFormValues = {
        id: existing.id,
        intent: "activate",
        name: existing.name,
        merchantTitle: english?.merchantTitle ?? "",
        merchantDescription: english?.merchantDescription ?? null,
        scope: existing.scope,
        quantity: existing.quantity,
        targetPlanId: existing.targetPlanId,
        targetShopId: existing.targetShopId,
        startsAt: existing.startsAt,
        expiresAt: existing.expiresAt,
      };
      validatePromotionCampaignTerms(currentValues);
      await resolveTarget(transaction, currentValues);
      const result = await transaction.promotionCampaign.updateMany({
        where: {
          id: existing.id,
          status: PromotionCampaignStatus.DRAFT,
          version: existing.version,
        },
        data: {
          status: PromotionCampaignStatus.ACTIVE,
          version: { increment: 1 },
        },
      });
      if (result.count !== 1)
        throw new Error("Promotion campaign changed; reload and retry.");
      await transaction.promotionCampaignEvent.create({
        data: {
          campaignId: existing.id,
          kind: PromotionCampaignEventType.ACTIVATED,
          platformAdminId: adminId,
        },
      });
    });
    revalidatePath("/promotions");
    return;
  }

  if (intent === "close" || intent === "reopen") {
    const id =
      typeof formData.get("id") === "string"
        ? String(formData.get("id")).trim()
        : "";
    if (!id) throw new Error("A campaign id is required.");

    await prisma.$transaction(async (transaction) => {
      const rawExpiresAt =
        typeof formData.get("expiresAt") === "string"
          ? String(formData.get("expiresAt"))
          : "";
      const expiresAt = rawExpiresAt ? new Date(rawExpiresAt) : undefined;
      if (expiresAt && Number.isNaN(expiresAt.getTime())) {
        throw new Error("Expiry time is invalid.");
      }
      await mutatePromotionCampaignLifecycle(transaction, {
        id,
        intent,
        adminId,
        expiresAt,
      });
    });
    revalidatePath("/promotions");
    if (intent === "reopen") {
      const returnTo = formData.get("returnTo");
      if (
        typeof returnTo === "string" &&
        returnTo.startsWith("/promotions") &&
        !returnTo.startsWith("//")
      ) {
        redirect(returnTo);
      }
    }
    return;
  }

  const values = parsePromotionCampaignForm(formData);
  const rawTranslation = formData.get("translationJson");
  const translationCampaignId =
    values.intent === "create"
      ? NEW_PROMOTION_TRANSLATION_CAMPAIGN_ID
      : values.id;
  if (!translationCampaignId || typeof rawTranslation !== "string") {
    throw new Error(
      "Complete and upload all 20 merchant translations before saving this campaign.",
    );
  }
  const parsedTranslations = parseCompletedPromotionTranslationPackage(
    rawTranslation,
    {
      campaignId: translationCampaignId,
      campaignInternalName: values.name,
      sourceMerchantTitle: values.merchantTitle,
      sourceMerchantDescription: values.merchantDescription ?? "",
    },
  );
  if (!parsedTranslations.valid || !parsedTranslations.package) {
    throw new Error(
      parsedTranslations.issues.map((entry) => entry.message).join("; ") ||
        "Complete and upload all 20 merchant translations before saving this campaign.",
    );
  }
  const completedTranslations = parsedTranslations.package.translations;
  let createdId: string | null = null;

  await prisma.$transaction(async (transaction) => {
    await resolveTarget(transaction, values);
    if (values.intent === "create") {
      const campaign = await transaction.promotionCampaign.create({
        data: {
          ...campaignData(values),
          translations: {
            create: Object.entries(completedTranslations).map(
              ([locale, value]) => ({
                locale,
                merchantTitle: value.merchantTitle,
                merchantDescription: value.merchantDescription,
              }),
            ),
          },
          status: PromotionCampaignStatus.DRAFT,
          createdByPlatformAdminId: adminId,
        },
      });
      createdId = campaign.id;
      await transaction.promotionCampaignEvent.create({
        data: {
          campaignId: campaign.id,
          kind: PromotionCampaignEventType.CREATED,
          platformAdminId: adminId,
        },
      });
      return;
    }

    if (!values.id) throw new Error("A campaign id is required.");
    const existing = await transaction.promotionCampaign.findUnique({
      where: { id: values.id },
      select: { id: true, status: true, version: true },
    });
    if (!existing) throw new Error("Promotion campaign not found.");
    if (existing.status !== PromotionCampaignStatus.DRAFT) {
      throw new Error(
        "Activated campaign terms are immutable; create a new campaign.",
      );
    }
    const result = await transaction.promotionCampaign.updateMany({
      where: {
        id: existing.id,
        status: PromotionCampaignStatus.DRAFT,
        version: existing.version,
      },
      data: { ...campaignData(values), version: { increment: 1 } },
    });
    if (result.count !== 1)
      throw new Error("Promotion campaign changed; reload and retry.");

    await transaction.promotionCampaignTranslation.deleteMany({
      where: { promotionCampaignId: existing.id },
    });
    await transaction.promotionCampaignTranslation.createMany({
      data: Object.entries(completedTranslations).map(([locale, value]) => ({
        promotionCampaignId: existing.id,
        locale,
        merchantTitle: value.merchantTitle,
        merchantDescription: value.merchantDescription,
      })),
    });
  });
  revalidatePath("/promotions");
  if (createdId) redirect(`/promotions?campaignId=${encodeURIComponent(createdId)}`);
}
