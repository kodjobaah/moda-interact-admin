import { createHash, randomUUID } from "node:crypto";
import { Prisma, type PrismaClient, type CommerceEnvironment } from "@prisma/client";
import { ConfigurationError } from "./errors";
import { ROUTING_PROMPT_PURPOSE } from "./routing-prompt-purpose";

type Db = Pick<PrismaClient, "commerceAgentPrompt" | "commerceAgentPromptRevision" | "$transaction">;
export type RoutingPromptOptions = { latestRevisionNumber: number; revisions: { id: string; revisionNumber: number; contentHash: string | null; promptText: string }[] };
export async function readRoutingPromptOptions(db: Db): Promise<RoutingPromptOptions> {
  const lineages = await db.commerceAgentPrompt.findMany({ where: { scope: "PLATFORM", shopId: null }, take: 2, select: { id: true } });
  if (lineages.length > 1) throw new ConfigurationError("INVALID_INPUT", "Platform prompt lineage is ambiguous.");
  if (!lineages.length) return { latestRevisionNumber: 0, revisions: [] };
  const [latest, revisions] = await Promise.all([
    db.commerceAgentPromptRevision.findFirst({ where: { promptId: lineages[0].id }, orderBy: { revisionNumber: "desc" }, select: { revisionNumber: true } }),
    db.commerceAgentPromptRevision.findMany({ where: { promptId: lineages[0].id, status: "PUBLISHED", sourceContext: { path: ["purpose"], equals: ROUTING_PROMPT_PURPOSE } }, orderBy: { revisionNumber: "desc" }, take: 30,
      select: { id: true, revisionNumber: true, contentHash: true, promptText: true } }),
  ]);
  return { latestRevisionNumber: latest?.revisionNumber ?? 0, revisions };
}

export async function publishRoutingPromptWithDependencies(input: unknown, dependencies: {
  principal: { role: string }; actorId: string; environment: string; db: Db;
}) {
  if (dependencies.principal.role !== "SUPER_ADMIN") throw new ConfigurationError("FORBIDDEN", "SUPER_ADMIN access is required.");
  if (!/^[a-zA-Z0-9_-]{1,191}$/.test(dependencies.actorId)) throw new ConfigurationError("FORBIDDEN", "Verified actor is unavailable.");
  if (!["local", "test", "development", "staging", "production"].includes(dependencies.environment)) throw new ConfigurationError("INVALID_INPUT", "Unknown deployment environment.");
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((key) => !["promptText", "expectedLatestRevisionNumber", "reason"].includes(key))) throw new ConfigurationError("INVALID_INPUT", "Invalid routing prompt publication.");
  const data = input as Record<string, unknown>;
  if (typeof data.promptText !== "string" || !data.promptText.trim() || Array.from(data.promptText).length > 32000) throw new ConfigurationError("INVALID_INPUT", "Routing instructions must contain 1 to 32,000 characters.");
  if (typeof data.reason !== "string" || !data.reason.trim() || data.reason.trim().length > 1000) throw new ConfigurationError("INVALID_INPUT", "A publication reason is required (up to 1,000 characters).");
  if (typeof data.expectedLatestRevisionNumber !== "number" || !Number.isSafeInteger(data.expectedLatestRevisionNumber) || data.expectedLatestRevisionNumber < 0) throw new ConfigurationError("INVALID_INPUT", "Invalid prompt revision.");
  const promptText = data.promptText; const reason = data.reason.trim(); const expected = data.expectedLatestRevisionNumber;
  try {
    return await dependencies.db.$transaction(async (tx) => {
      const lineages = await tx.commerceAgentPrompt.findMany({ where: { scope: "PLATFORM", shopId: null }, take: 2, select: { id: true } });
      if (lineages.length > 1) throw new ConfigurationError("CONFLICT", "Platform prompt lineage is ambiguous.");
      const lineage = lineages[0] ?? await tx.commerceAgentPrompt.create({ data: { scope: "PLATFORM", shopId: null }, select: { id: true } });
      await tx.$queryRaw`SELECT "id" FROM "commerce"."CommerceAgentPrompt" WHERE "id" = ${lineage.id} FOR UPDATE`;
      const latest = await tx.commerceAgentPromptRevision.findFirst({ where: { promptId: lineage.id }, orderBy: { revisionNumber: "desc" }, select: { revisionNumber: true } });
      if ((latest?.revisionNumber ?? 0) !== expected) throw new ConfigurationError("CONFLICT", "Prompt history changed. Refresh before publishing.");
      const contentHash = createHash("sha256").update(promptText, "utf8").digest("hex");
      const revision = await tx.commerceAgentPromptRevision.create({ data: {
        promptId: lineage.id, revisionNumber: expected + 1, status: "PUBLISHED", editVersion: 1,
        promptText, contentHash, publishedAt: new Date(), sourceContext: { purpose: ROUTING_PROMPT_PURPOSE, schemaVersion: 1 },
      }, select: { id: true, revisionNumber: true, contentHash: true } });
      await tx.commerceAuditEvent.create({ data: {
        actorType: "PLATFORM_ADMIN", actorAdminId: dependencies.actorId,
        environment: dependencies.environment.toUpperCase() as CommerceEnvironment, action: "PUBLISH_AGENT_PROMPT_REVISION",
        operationId: randomUUID(), reason, agentPromptId: lineage.id, agentPromptRevisionId: revision.id,
        metadata: { purpose: ROUTING_PROMPT_PURPOSE, schemaVersion: 1, contentHash, revisionNumber: revision.revisionNumber, activatesCommerceAgent: false },
      } });
      // Deliberately no CommerceAgentConfiguration writes or normal activation.
      return revision;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof ConfigurationError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) throw new ConfigurationError("CONFLICT", "Prompt history changed. Refresh and retry.");
    throw new ConfigurationError("DB_UNAVAILABLE", "Routing prompt could not be published.");
  }
}
