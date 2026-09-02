import Link from 'next/link';
import { customerName } from '@/lib/admin/format';
import { withParamUpdates } from '@/lib/admin/query';
import type { PageResult, CustomerListItem } from '@/lib/admin/types';
import { EmptyState } from './empty-state';
import { Icon } from './icons';
import { Pagination } from './pagination';

export function CustomerTable({
  customers,
  params,
  search,
}: {
  customers: PageResult<CustomerListItem>;
  params: Record<string, string>;
  search: string;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-gray-200 bg-gray-50 p-4">
        <form action="/" method="get" className="relative w-full max-w-md">
          {Object.entries(params)
            .filter(
              ([key]) =>
                ![
                  'customerSearch',
                  'customerPage',
                  'customerId',
                  'recoveryPage',
                  'recoveryId',
                  'drawerTab',
                  'messagePage',
                  'saved',
                ].includes(key),
            )
            .map(([key, value]) => (
              <input key={key} type="hidden" name={key} value={value} />
            ))}
          <Icon
            name="search"
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400"
          />
          <input
            type="search"
            name="customerSearch"
            defaultValue={search}
            className="w-full rounded-md border border-gray-300 py-1.5 pr-4 pl-9 text-sm outline-none focus:border-[var(--brand-500)] focus:ring-2 focus:ring-[var(--brand-200)]"
            placeholder="Search customer by name, email, or phone..."
          />
        </form>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {customers.items.length ? (
          <table className="min-w-full divide-y divide-gray-100">
            <thead>
              <tr>
                <th className="pb-2 text-left text-xs font-medium text-gray-500">
                  Customer Name
                </th>
                <th className="pb-2 text-left text-xs font-medium text-gray-500">
                  Contact
                </th>
                <th className="pb-2 text-right text-xs font-medium text-gray-500">
                  Abandoned Carts
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {customers.items.map((customer) => {
                const href = withParamUpdates('/', params, {
                  customerId: customer.id,
                  recoveryPage: 1,
                  recoveryId: null,
                  drawerTab: null,
                  messagePage: null,
                });
                return (
                  <tr
                    key={customer.id}
                    className="group transition-colors hover:bg-[var(--brand-100)]"
                  >
                    <td className="py-3 pr-3 text-sm font-medium text-[var(--brand-700)] group-hover:text-[var(--brand-900)]">
                      <Link href={href} className="block">
                        {customerName(
                          customer.firstName,
                          customer.lastName,
                          customer.email,
                        )}
                      </Link>
                    </td>
                    <td className="py-3 pr-3 text-sm text-gray-500">
                      <Link href={href} className="block">
                        <span className="block">{customer.email ?? '—'}</span>
                        <span className="block">{customer.phone ?? '—'}</span>
                      </Link>
                    </td>
                    <td className="py-3 text-right text-sm text-gray-700">
                      <Link href={href} className="block">
                        {customer.recoveryCount}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <EmptyState title="No customers found">
            Try another customer search or wait for recovery activity.
          </EmptyState>
        )}
      </div>
      <Pagination
        pathname="/"
        params={params}
        page={customers.page}
        totalPages={customers.totalPages}
        totalItems={customers.totalItems}
        pageParam="customerPage"
        label="customers"
        resetParams={[
          'customerId',
          'recoveryPage',
          'recoveryId',
          'drawerTab',
          'messagePage',
        ]}
      />
    </div>
  );
}
