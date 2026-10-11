import type { getOpenMcpOperationalIssues } from './mcp-operational-issues';

export type AwaitedReturnOpenIssues = Awaited<ReturnType<typeof getOpenMcpOperationalIssues>>;
