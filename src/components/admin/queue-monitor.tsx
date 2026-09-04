'use client';

import { useEffect, useRef, useState } from 'react';

type QueueMonitorSnapshot = {
  observedAt: string;
  queues: Array<{
    queueName: string;
    jobNames: string[];
    counts: {
      waiting: number;
      active: number;
      delayed: number;
      failed: number;
      workers: number;
    };
    lastActivity: { event: string; observedAt: string } | null;
  }>;
};

const REFRESH_OPTIONS = [
  { label: 'Paused', value: 0 },
  { label: '2 seconds', value: 2_000 },
  { label: '5 seconds', value: 5_000 },
  { label: '10 seconds', value: 10_000 },
  { label: '30 seconds', value: 30_000 },
  { label: '60 seconds', value: 60_000 },
] as const;
const DEFAULT_REFRESH_MS = 5_000;
const STORAGE_KEY = 'moda-admin.queue-monitor.refresh-ms';

function isRefreshValue(value: number): value is (typeof REFRESH_OPTIONS)[number]['value'] {
  return REFRESH_OPTIONS.some((option) => option.value === value);
}

function getInitialRefreshMs() {
  if (typeof window === 'undefined') return DEFAULT_REFRESH_MS;
  const stored = Number(window.localStorage.getItem(STORAGE_KEY));
  return isRefreshValue(stored) ? stored : DEFAULT_REFRESH_MS;
}

function formatTime(value: string | null) {
  if (!value) return 'None observed';
  return new Date(value).toLocaleTimeString('en-GB');
}

export function QueueMonitor() {
  const [refreshMs, setRefreshMs] = useState(getInitialRefreshMs);
  const [snapshot, setSnapshot] = useState<QueueMonitorSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const requestRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);

  async function refresh() {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);

    try {
      const response = await fetch('/api/admin/queues', {
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('Queue data unavailable');
      const nextSnapshot = (await response.json()) as QueueMonitorSnapshot;
      setSnapshot(nextSnapshot);
      setError(null);
    } catch (fetchError) {
      if (!(fetchError instanceof DOMException && fetchError.name === 'AbortError')) {
        setError('Queue data is unavailable. The last successful snapshot is shown when available.');
      }
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
      inFlightRef.current = false;
      setLoading(false);
    }
  }

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => void refresh(), 0);

    return () => {
      window.clearTimeout(initialRefresh);
      requestRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, String(refreshMs));
    if (refreshMs === 0) return undefined;
    const timer = window.setInterval(() => void refresh(), refreshMs);
    return () => window.clearInterval(timer);
  }, [refreshMs]);

  return (
    <section className="mb-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm" aria-labelledby="queue-monitor-title">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <h2 id="queue-monitor-title" className="text-lg font-semibold text-[var(--brand-900)]">
            Shopify Queue Activity
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Read-only operational view. Completed jobs may disappear immediately after processing.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-gray-600" htmlFor="queue-refresh-rate">Refresh</label>
          <select
            id="queue-refresh-rate"
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700"
            value={refreshMs}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (isRefreshValue(value)) setRefreshMs(value);
            }}
          >
            {REFRESH_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <button
            type="button"
            className="rounded-md bg-[var(--brand-700)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--brand-900)] disabled:opacity-50"
            onClick={() => void refresh()}
            disabled={loading}
          >
            Refresh now
          </button>
        </div>
      </div>

      <p className={`mt-4 text-sm ${error ? 'text-amber-700' : 'text-gray-500'}`} role={error ? 'status' : undefined}>
        {error ?? (snapshot ? `Last updated: ${formatTime(snapshot.observedAt)}` : 'Loading queue data...')}
      </p>

      {snapshot ? (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {snapshot.queues.map((queue) => (
            <article key={queue.queueName} className="rounded-lg border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900">{queue.queueName}</h3>
              <p className="mt-1 text-sm text-gray-500">Jobs: {queue.jobNames.join(', ')}</p>
              <dl className="mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-5">
                {Object.entries(queue.counts).map(([label, value]) => (
                  <div key={label}>
                    <dt className="capitalize text-gray-500">{label}</dt>
                    <dd className="mt-1 text-xl font-semibold text-gray-900">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-5 text-sm text-gray-500">
                Last Redis activity: {queue.lastActivity?.event ?? 'None observed'} at {formatTime(queue.lastActivity?.observedAt ?? null)}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-5 rounded-lg border border-dashed border-gray-300 p-6 text-sm text-gray-500">
          {loading ? 'Waiting for the first queue snapshot...' : 'No queue snapshot is available.'}
        </p>
      )}
    </section>
  );
}