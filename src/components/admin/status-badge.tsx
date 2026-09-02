const tones: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-800',
  SUSPENDED: 'bg-amber-100 text-amber-800',
  UNINSTALLED: 'bg-gray-200 text-gray-700',
  DETECTED: 'bg-slate-100 text-slate-700',
  MESSAGE_SENT: 'bg-blue-100 text-blue-800',
  ENGAGED: 'bg-violet-100 text-violet-800',
  COMPLETED: 'bg-green-100 text-green-800',
  RECOVERED: 'bg-green-100 text-green-800',
  IN_PROGRESS: 'bg-blue-100 text-blue-800',
  NO_RESPONSE: 'bg-gray-100 text-gray-700',
  DECLINED: 'bg-red-100 text-red-800',
  EXPIRED: 'bg-orange-100 text-orange-800',
  CANCELLED: 'bg-gray-200 text-gray-700',
  FAILED: 'bg-red-100 text-red-800',
  DELIVERED: 'bg-green-100 text-green-800',
  READ: 'bg-emerald-100 text-emerald-800',
  SENT: 'bg-blue-100 text-blue-800',
  PENDING: 'bg-amber-100 text-amber-800',
};

export function StatusBadge({
  value,
  compact = false,
}: {
  value: string | null | undefined;
  compact?: boolean;
}) {
  if (!value) return <span className="text-sm text-gray-400">—</span>;
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 font-semibold ${compact ? 'text-[11px]' : 'text-xs'} ${tones[value] ?? 'bg-gray-100 text-gray-700'}`}
    >
      {value}
    </span>
  );
}
