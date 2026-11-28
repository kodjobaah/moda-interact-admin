import type { Prisma } from "@prisma/client";
import { requireCommonLayout } from "../authoring/common-layout";
import {
  readSavedCommonLayoutSet,
  SavedCommonLayoutError,
} from "../authoring/common-layout-repository";
import { templateHash } from "../authoring/identifiers";
import { reject, PublicationError } from "../publishing/validation";
/** First lock in every Admin assignment/SHARED publication transaction. */
export async function lockCommonActivation(
  tx: Prisma.TransactionClient,
): Promise<void> {
  await tx.$queryRaw`SELECT 1 AS acquired FROM pg_advisory_xact_lock(hashtextextended('moda:common-recovery-activation:v1'::text,0))`;
}
export async function assertCommonSourceGate(
  tx: Prisma.TransactionClient,
  definitionId: string,
  intent: "submission" | "assignment",
): Promise<void> {
  const slot = await tx.whatsAppConversationWrapperActiveSlot.findUnique({
    where: { audience: "SHARED" },
    include: { definition: true },
  });
  const definition = await tx.whatsAppTemplateDefinition.findUnique({
    where: { id: definitionId },
    include: { locales: true },
  });
  if (!definition)
    return reject("NOT_FOUND", "Template definition is unavailable.");
  const reference = (locale: (typeof definition.locales)[number]) =>
    (
      locale.localeAst as {
        authoring?: {
          commonLayout?: { definitionId?: unknown; sourceHash?: unknown };
        };
      } | null
    )?.authoring?.commonLayout;
  const stamped = definition.locales.some((locale) => !!reference(locale));
  const context = (locale?: (typeof definition.locales)[number]) => {
    const raw = locale ? reference(locale) : undefined;
    return {
      definitionId,
      providerTemplateName: definition.providerTemplateName,
      languageTag: locale?.languageTag ?? null,
      referencedCommonDefinitionId:
        typeof raw?.definitionId === "string"
          ? raw.definitionId.slice(0, 80)
          : null,
      activeCommonDefinitionId: slot?.definitionId ?? null,
    };
  };
  if (!slot && !stamped) return;
  if (slot && !stamped)
    throw new PublicationError(
      "COMMON_LAYOUT_REQUIRED",
      "Clone this saved template with the common shop layout before submitting or publishing.",
      context(),
    );
  if (
    intent === "assignment" &&
    (!slot ||
      slot.definition.status !== "PUBLISHED" ||
      !slot.definition.publishedAt ||
      slot.definition.retiredAt)
  )
    throw new PublicationError(
      "COORDINATED_ACTIVATION_REQUIRED",
      "Use the reviewed common-layout activation to switch templates and shared content together.",
      context(),
    );
  if (intent === "assignment") {
    // Reject a historical revision before invoking the current authoring parser or recompiling any wrapper.
    const mismatch = definition.locales.find(
      (locale) =>
        typeof reference(locale)?.definitionId === "string" &&
        reference(locale)?.definitionId !== slot!.definitionId,
    );
    if (mismatch)
      throw new PublicationError(
        "COORDINATED_ACTIVATION_REQUIRED",
        "This template uses an older or different common revision. Clone it using the active common layout, or review a coordinated activation.",
        context(mismatch),
      );
  }
  if (
    intent === "assignment" &&
    definition.kind === "META_RECOVERY" &&
    definition.locales.some(
      (locale) =>
        locale.status !== "REVIEWED" ||
        !locale.reviewedByAdminId ||
        !locale.reviewedAt,
    )
  )
    throw new PublicationError(
      "COORDINATED_ENGLISH_REVIEW_REQUIRED",
      "Review the exact English content in coordinated activation before publishing this common-layout template. Every Meta language must be REVIEWED.",
      context(),
    );
  const savedRevisions = new Map<
    string,
    Awaited<ReturnType<typeof readSavedCommonLayoutSet>>
  >();
  for (const locale of definition.locales) {
    const raw = reference(locale);
    let ref;
    try {
      ref = requireCommonLayout(raw);
    } catch (error) {
      throw new PublicationError(
        "COMMON_LAYOUT_REQUIRED",
        "Clone this saved template with the common shop layout before submitting or publishing.",
        context(locale),
        { cause: error },
      );
    }
    if (
      ref.languageTag !== locale.languageTag ||
      (intent === "assignment" &&
        ref.sourceHash !== slot!.definition.sourceHash)
    ) {
      throw new PublicationError(
        "COMMON_LAYOUT_MISMATCH",
        "The saved common layout language or source hash does not match the required revision.",
        context(locale),
      );
    }
    try {
      const key = `${ref.definitionId}:${ref.sourceHash}`;
      let saved = savedRevisions.get(key);
      if (!saved) {
        saved = await readSavedCommonLayoutSet(
          tx,
          ref.definitionId,
          ref.sourceHash,
        );
        savedRevisions.set(key, saved);
      }
      const expected = saved.find(
        (item) => item.languageTag === ref.languageTag,
      );
      if (!expected || templateHash(expected) !== templateHash(ref))
        throw new SavedCommonLayoutError(
          "Common layout snapshot differs from its saved immutable locale. Refresh the selection.",
        );
    } catch (error) {
      if (!(error instanceof SavedCommonLayoutError)) throw error;
      throw new PublicationError(
        "COMMON_LAYOUT_INVALID",
        error.message,
        context(locale),
        { cause: error },
      );
    }
  }
}
