export function KpiCard({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border border-gray-200 bg-white p-6 shadow-sm ${accent ? 'border-l-4 border-l-[var(--brand-500)]' : ''}`}
    >
      <p className="mb-1 text-sm font-medium text-gray-500">{label}</p>
      <h3
        className={`text-3xl font-bold ${accent ? 'text-[var(--brand-700)]' : 'text-gray-900'}`}
      >
        {value}
      </h3>
    </div>
  );
}
