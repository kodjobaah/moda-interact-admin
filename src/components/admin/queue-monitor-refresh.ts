export const REFRESH_OPTIONS = [
  { labelKey: 'queue.refreshPaused', value: 0 },
  { labelKey: 'queue.refreshSeconds', value: 2_000, count: 2 },
  { labelKey: 'queue.refreshSeconds', value: 5_000, count: 5 },
  { labelKey: 'queue.refreshSeconds', value: 10_000, count: 10 },
  { labelKey: 'queue.refreshSeconds', value: 30_000, count: 30 },
  { labelKey: 'queue.refreshSeconds', value: 60_000, count: 60 },
] as const;

export type QueueRefreshMs = (typeof REFRESH_OPTIONS)[number]["value"];

export const DEFAULT_REFRESH_MS: QueueRefreshMs = 5_000;
export const STORAGE_KEY = 'moda-admin.queue-monitor.refresh-ms';

export function isRefreshValue(value: number): value is QueueRefreshMs {
  return REFRESH_OPTIONS.some((option) => option.value === value);
}

export function getInitialRefreshMs() {
  if (typeof window === 'undefined') return DEFAULT_REFRESH_MS;
  const storedValue = window.localStorage.getItem(STORAGE_KEY);
  if (storedValue === null) return DEFAULT_REFRESH_MS;
  const stored = Number(storedValue);
  return isRefreshValue(stored) ? stored : DEFAULT_REFRESH_MS;
}