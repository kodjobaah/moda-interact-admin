'use server';

import { resolveMcpOperationalIssue } from '@/lib/admin/mcp-operational-issues';

export async function resolveMcpOperationalIssueAction(incidentKey: string): Promise<void> {
  return resolveMcpOperationalIssue(incidentKey);
}
