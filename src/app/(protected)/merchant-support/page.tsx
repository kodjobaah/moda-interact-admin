import { AdminShell } from '@/components/admin/admin-shell';
import { requirePlatformAdminPage } from '@/lib/auth/platform-admin';
import {
  getMerchantSupportThread,
  getPendingMerchantSupportThreads,
  type PendingSupportFilter,
} from '@/lib/admin/merchant-support';
import { cleanSearch, firstParam, paramsToRecord, positiveInt, type SearchParamRecord } from '@/lib/admin/query';
import { MerchantSupportInbox } from '@/components/admin/merchant-support-inbox';
import { McpOperationalIssues } from '@/components/admin/mcp-operational-issues';
import { getOpenMcpOperationalIssues } from '@/lib/admin/mcp-operational-issues';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;
const FILTERS: PendingSupportFilter[] = ['all', 'unassigned', 'assigned-to-me', 'assigned-to-others'];

type PageProps = {
  searchParams: Promise<SearchParamRecord>;
};

export default async function MerchantSupportPage({ searchParams }: PageProps) {
  const principal = await requirePlatformAdminPage();
  const rawParams = await searchParams;
  const params = paramsToRecord(rawParams);
  const filterValue = firstParam(rawParams.filter);
  const filter: PendingSupportFilter = FILTERS.includes(filterValue as PendingSupportFilter)
    ? (filterValue as PendingSupportFilter)
    : 'all';
  const page = positiveInt(rawParams.page);
  const search = cleanSearch(rawParams.search);
  const threadId = firstParam(rawParams.thread);
  const pending = await getPendingMerchantSupportThreads({
    page,
    pageSize: PAGE_SIZE,
    filter,
    search,
  });
  const thread = threadId ? await getMerchantSupportThread(threadId) : null;
  const operationalIssues = await getOpenMcpOperationalIssues();

  return (
    <AdminShell active="merchant-support">
      <div className="flex-1 overflow-auto p-4 sm:p-8">
        <McpOperationalIssues issues={operationalIssues} />
        <MerchantSupportInbox
          principal={principal}
          pending={pending}
          thread={thread}
          filter={filter}
          search={search}
          params={params}
        />
      </div>
    </AdminShell>
  );
}
