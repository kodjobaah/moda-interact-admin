import Image from 'next/image';

export function ObservabilityPanel() {
  return (
    <div className="flex-1 overflow-auto bg-gray-900 p-5 sm:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">
            System Observability
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            Live metrics and telemetry dashboards.
          </p>
        </div>
      </div>
      <div className="rounded-xl border border-gray-800 bg-[#111217] p-4 shadow-2xl">
        <Image
          src="/grafana-dashboard.png"
          alt="Grafana observability dashboard"
          width={1600}
          height={900}
          className="h-auto w-full rounded-lg shadow-md"
          priority
        />
      </div>
    </div>
  );
}
