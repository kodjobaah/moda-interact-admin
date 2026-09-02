import Link from 'next/link';
import { withParamUpdates } from '@/lib/admin/query';
import type { DrawerTab } from './recovery-drawer';

export function RecoveryDrawerTabLink({
  label,
  value,
  current,
  params,
}: {
  label: string;
  value: DrawerTab;
  current: DrawerTab;
  params: Record<string, string>;
}) {
  return (
    <Link
      href={withParamUpdates('/', params, { drawerTab: value })}
      className={`mt-2 border-b-2 pt-3 pb-3 text-sm ${current === value ? 'border-[var(--brand-700)] font-semibold text-[var(--brand-700)]' : 'border-transparent font-medium text-gray-500 hover:text-gray-700'}`}
    >
      {label}
    </Link>
  );
}
