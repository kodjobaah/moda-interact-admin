import type { ReactNode } from 'react';
import Link from 'next/link';
import { initials } from '@/lib/admin/format';
import type { TenantListItem } from '@/lib/admin/types';
import { Icon } from './icons';
import { StatusBadge } from './status-badge';

export function TenantRow({
  tenant,
  name,
  href,
  selected,
  detail,
}: {
  tenant: TenantListItem;
  name: string;
  href: string;
  selected: boolean;
  detail: ReactNode;
}) {
  return (
    <>
      <tr
        className={`transition-colors hover:bg-gray-50 ${selected ? 'bg-[var(--brand-50)]' : ''}`}
      >
        <td className="px-6 py-4 whitespace-nowrap">
          <Link href={href} className="flex items-center">
            <Icon
              name={selected ? 'chevron-down' : 'chevron-right'}
              className={`mr-4 h-4 w-4 ${selected ? 'text-[var(--brand-500)]' : 'text-gray-400'}`}
            />
            <div className="flex h-10 w-10 items-center justify-center rounded bg-[var(--brand-100)] font-bold text-[var(--brand-800)]">
              {initials(name)}
            </div>
            <div className="ml-4">
              <div className="text-sm font-bold text-gray-900">{name}</div>
              <div className="text-sm text-gray-500">{tenant.domain}</div>
            </div>
          </Link>
        </td>
        <td className="px-6 py-4">
          <Link href={href} className="block">
            <StatusBadge value={tenant.status} />
          </Link>
        </td>
        <td className="px-6 py-4 text-sm text-gray-700">
          <Link href={href} className="block">
            {tenant.planName ?? tenant.planHandle ?? 'No plan'}
          </Link>
        </td>
      </tr>
      {selected ? (
        <tr className="border-b-2 border-gray-200 bg-gray-50 shadow-inner">
          <td colSpan={3} className="p-0">
            {detail}
          </td>
        </tr>
      ) : null}
    </>
  );
}
