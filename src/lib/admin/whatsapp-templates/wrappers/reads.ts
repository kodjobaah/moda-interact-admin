import { requirePlatformAdminRead } from "../../../auth/platform-admin";
import { prisma } from "../../../prisma";
import { requireTemplateSuperAdmin } from "../authoring/service";
import { checkWrapperEligibility } from "./eligibility";
import { WRAPPER_AUDIENCES, WRAPPER_DEFINITION_ID, type Audience, type WrapperActivationHistory,
  type WrapperCandidate, type WrapperDefinitionRow, type WrapperPreviewDefinition, type WrapperPublicationWorkspace,
  type WrapperSlot } from "./contracts";

const asMetadata = (input: unknown): Record<string, unknown> =>
  input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
const isAudience = (input: unknown): input is Audience =>
  typeof input === "string" && WRAPPER_AUDIENCES.includes(input as Audience);

/** Restrict reads to SUPER_ADMIN; no shop/checkout/customer data enters this global catalogue. */
export async function getWrapperPublicationWorkspace(options: {
  selectedDefinitionId?: string;
  audience?: Audience;
} = {}): Promise<WrapperPublicationWorkspace> {
  requireTemplateSuperAdmin(await requirePlatformAdminRead());
  const audience = options.audience && isAudience(options.audience) ? options.audience : "SHARED";
  const requestedId = options.selectedDefinitionId && WRAPPER_DEFINITION_ID.test(options.selectedDefinitionId)
    ? options.selectedDefinitionId : null;
  const [recent, active, audited] = await Promise.all([
    prisma.whatsAppTemplateDefinition.findMany({
      where: { kind: "MODA_CONVERSATION_WRAPPER" }, orderBy: { createdAt: "desc" }, take: 40,
      include: { locales: true },
    }),
    prisma.whatsAppConversationWrapperActiveSlot.findMany(),
    prisma.commerceAuditEvent.findMany({
      where: { action: "ACTIVATE_WHATSAPP_CONVERSATION_WRAPPER" }, orderBy: { createdAt: "desc" }, take: 25,
      select: { createdAt: true, actorAdminId: true, reason: true, metadata: true },
    }),
  ]);
  const history: WrapperActivationHistory[] = audited.flatMap((entry) => {
    const meta = asMetadata(entry.metadata);
    if (!isAudience(meta.audience) || typeof meta.newDefinitionId !== "string" ||
        !WRAPPER_DEFINITION_ID.test(meta.newDefinitionId) || !Number.isSafeInteger(meta.editVersion)) return [];
    return [{ audience: meta.audience, createdAt: entry.createdAt.toISOString(), actorId: entry.actorAdminId,
      previousDefinitionId: typeof meta.previousDefinitionId === "string" && WRAPPER_DEFINITION_ID.test(meta.previousDefinitionId)
        ? meta.previousDefinitionId : null,
      newDefinitionId: meta.newDefinitionId, editVersion: meta.editVersion as number, reason: entry.reason }];
  });
  const ids = new Set([...(requestedId ? [requestedId] : []), ...active.map((slot) => slot.definitionId),
    ...history.flatMap((item) => [item.newDefinitionId, ...(item.previousDefinitionId ? [item.previousDefinitionId] : [])])]);
  const existing = new Set(recent.map((definition) => definition.id));
  const missing = [...ids].filter((id) => !existing.has(id));
  const older = missing.length ? await prisma.whatsAppTemplateDefinition.findMany({
    where: { id: { in: missing }, kind: "MODA_CONVERSATION_WRAPPER" }, include: { locales: true },
  }) : [];
  const all = [...recent, ...older] as WrapperDefinitionRow[];
  const byId = new Map(all.map((definition) => [definition.id, definition]));
  const summaries: WrapperCandidate[] = all.filter((definition) => isAudience(definition.audience)).map((definition) => {
    const checked = checkWrapperEligibility(definition, definition.audience as Audience);
    return { id: definition.id, audience: definition.audience as Audience,
      sourceHash: definition.sourceHash, createdAt: definition.createdAt.toISOString(),
      publishedAt: definition.publishedAt?.toISOString() ?? null,
      eligible: checked.eligible, reason: checked.eligible ? null : checked.reason };
  });
  const selectedId = requestedId ?? summaries.find((candidate) => candidate.audience === audience && candidate.eligible)?.id ??
    summaries.find((candidate) => candidate.audience === audience)?.id ?? null;
  const preview = (id: string | null): WrapperPreviewDefinition | null => {
    const definition = id ? byId.get(id) : null;
    if (!definition || !isAudience(definition.audience)) return null;
    const checked = checkWrapperEligibility(definition, definition.audience);
    return checked.eligible ? { id: definition.id, audience: definition.audience,
      sourceHash: definition.sourceHash, publishedAt: definition.publishedAt?.toISOString() ?? null,
      projections: checked.projections } : null;
  };
  const byAudience = new Map<Audience, { definitionId: string; editVersion: number; updatedAt: Date }>(
    active.filter((slot) => isAudience(slot.audience)).map((slot) => [slot.audience as Audience, slot]),
  );
  const shared = byAudience.get("SHARED");
  const slots: WrapperSlot[] = WRAPPER_AUDIENCES.map((target) => {
    const own = byAudience.get(target);
    const effective = own ?? (target === "SHARED" ? undefined : shared);
    return { audience: target, definitionId: own?.definitionId ?? null,
      editVersion: own?.editVersion ?? null, updatedAt: own?.updatedAt?.toISOString() ?? null,
      effectiveDefinitionId: effective?.definitionId ?? null,
      effectiveFrom: own ? target : shared && target !== "SHARED" ? "SHARED" : null };
  });
  const currentId = slots.find((slot) => slot.audience === audience)?.effectiveDefinitionId ?? null;
  return { candidates: summaries, slots, selectedDefinitionId: selectedId,
    proposed: preview(selectedId), current: preview(currentId), history };
}
