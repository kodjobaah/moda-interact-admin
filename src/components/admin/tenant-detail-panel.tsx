import Link from 'next/link';
import { withParamUpdates } from '@/lib/admin/query';
import type {
  CustomerListItem,
  PageResult,
  RecoveryListItem,
  TenantDetail,
} from '@/lib/admin/types';
import { RecoveryLogs } from './recovery-logs';
import { TenantAdministration } from './tenant-administration';

export function TenantDetailPanel({
  tenant,
  tab,
  customers,
  customerSearch,
  selectedCustomer,
  recoveries,
  params,
  returnTo,
  saved,
}: {
  tenant: TenantDetail;
  tab: 'admin' | 'logs';
  customers: PageResult<CustomerListItem> | null;
  customerSearch: string;
  selectedCustomer: CustomerListItem | null;
  recoveries: PageResult<RecoveryListItem> | null;
  params: Record<string, string>;
  returnTo: string;
  saved?: boolean;
}) {
  const adminHref = withParamUpdates('/', params, {
    tab: 'admin',
    customerId: null,
    customerPage: null,
    customerSearch: null,
    recoveryPage: null,
    recoveryId: null,
    drawerTab: null,
    messagePage: null,
    saved: null,
  });
  const logsHref = withParamUpdates('/', params, {
    tab: 'logs',
    customerPage: 1,
    saved: null,
  });
  const activeClass =
    'border-b-2 border-[var(--brand-700)] pb-2 font-semibold text-[var(--brand-700)]';
  const idleClass =
    'border-b-2 border-transparent pb-2 font-medium text-gray-500 hover:text-gray-700';

  return (
    <div className="px-6 py-6 sm:px-10">
      <div className="mb-6 flex gap-6 border-b border-gray-200 pb-2">
        <Link
          href={adminHref}
          className={tab === 'admin' ? activeClass : idleClass}
        >
          Administration
        </Link>
        <Link
          href={logsHref}
          className={tab === 'logs' ? activeClass : idleClass}
        >
          Recovery Logs
        </Link>
      </div>
      {tab === 'admin' ? (
        <TenantAdministration
          tenant={tenant}
          returnTo={returnTo}
          saved={saved}
        />
      ) : customers ? (
        <RecoveryLogs
          customers={customers}
          customerSearch={customerSearch}
          selectedCustomer={selectedCustomer}
          recoveries={recoveries}
          params={params}
        />
      ) : null}
    </div>
  );
}
