export function KpiCard({
  label,
  value,
  accent = false,
  status = false,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
  status?: boolean;
}) {
  return (
    <div
      className={`min-w-0 rounded-xl border border-gray-200 bg-white p-6 shadow-sm ${accent ? 'border-l-4 border-l-[var(--brand-500)]' : ''}`}
    >
      <p className="mb-1 text-sm font-medium text-gray-500">{label}</p>
      <h3
        className={status
          ? 'break-words text-sm font-semibold leading-5 text-gray-600'
          : `text-3xl font-bold ${accent ? 'text-[var(--brand-700)]' : 'text-gray-900'}`}
      >
        {value}
      </h3>
    </div>
  );
}
