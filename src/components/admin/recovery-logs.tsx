import type {
  CustomerListItem,
  PageResult,
  RecoveryListItem,
} from '@/lib/admin/types';
import { CustomerTable } from './customer-table';
import { RecoveryTable } from './recovery-table';

export function RecoveryLogs({
  customers,
  customerSearch,
  selectedCustomer,
  recoveries,
  params,
}: {
  customers: PageResult<CustomerListItem>;
  customerSearch: string;
  selectedCustomer: CustomerListItem | null;
  recoveries: PageResult<RecoveryListItem> | null;
  params: Record<string, string>;
}) {
  return (
    <div className="flex h-[430px] flex-col overflow-hidden rounded-lg border border-gray-200 bg-white">
      {selectedCustomer && recoveries ? (
        <RecoveryTable
          customer={selectedCustomer}
          recoveries={recoveries}
          params={params}
        />
      ) : (
        <CustomerTable
          customers={customers}
          params={params}
          search={customerSearch}
        />
      )}
    </div>
  );
}
