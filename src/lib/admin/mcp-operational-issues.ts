import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { prisma } from '../prisma';
import { requirePlatformAdminRead, requirePlatformAdminMutation } from '../auth/platform-admin';

/** Operational cases are distinct from merchant-originated threads requiring a reply. */
export async function getOpenMcpOperationalIssues() {
  await requirePlatformAdminRead();
  const issues = await prisma.mcpOperationalIncident.findMany({
    where: { status: 'OPEN' }, orderBy: { lastOccurredAt: 'desc' }, take: 50,
    select: { incidentKey: true, shopId: true, capabilityKey: true, reasonCode: true,
      occurrenceCount: true, lastOccurredAt: true, lastErrorId: true,
      shop: { select: { domain: true,
        merchantSupportThread: { select: { id: true } },
      } },
    },
  });
  return issues.map(issue => ({
    incidentKey: issue.incidentKey, shopDomain: issue.shop.domain,
    shopId: issue.shopId, threadId: issue.shop.merchantSupportThread?.id ?? null,
    capabilityKey: issue.capabilityKey, reasonCode: issue.reasonCode,
    occurrenceCount: issue.occurrenceCount, lastOccurredAt: issue.lastOccurredAt,
    lastErrorId: issue.lastErrorId,
  }));
}

/** Manual acknowledgement after support verifies recovery. No credential data is used. */
export async function resolveMcpOperationalIssue(incidentKey: string): Promise<void> {
  const principal = await requirePlatformAdminMutation();
  if (!/^[a-f0-9]{64}$/.test(incidentKey)) throw new Error('Invalid issue identifier');
  await prisma.$transaction(async transaction => {
    const issue = await transaction.mcpOperationalIncident.findUnique({
      where: { incidentKey },
      select: { shopId: true, capabilityKey: true, reasonCode: true, status: true },
    });
    if (!issue) throw new Error('Operational issue not found');
    if (issue.status !== 'OPEN') return;
    const now = new Date();
    const changed = await transaction.mcpOperationalIncident.updateMany({
      where: { incidentKey, status: 'OPEN' },
      data: { status: 'RESOLVED', resolvedAt: now },
    });
    if (changed.count !== 1) return;
    await transaction.mcpOperationalEvent.create({ data: {
      id: randomUUID(), shopId: issue.shopId, incidentKey,
      capabilityKey: issue.capabilityKey, reasonCode: issue.reasonCode,
      eventType: 'MCP_TOOL_EXECUTION_RESOLVED', occurredAt: now,
      actorAdminId: principal.id,
    } });
  });
  revalidatePath('/merchant-support');
}
