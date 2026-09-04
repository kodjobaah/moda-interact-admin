export const REFRESH_OPTIONS = [
  { label: 'Paused', value: 0 },
  { label: '2 seconds', value: 2_000 },
  { label: '5 seconds', value: 5_000 },
  { label: '10 seconds', value: 10_000 },
  { label: '30 seconds', value: 30_000 },
  { label: '60 seconds', value: 60_000 },
] as const;

export const DEFAULT_REFRESH_MS = 5_000;
export const STORAGE_KEY = 'moda-admin.queue-monitor.refresh-ms';

export function isRefreshValue(value: number): value is (typeof REFRESH_OPTIONS)[number]['value'] {
  return REFRESH_OPTIONS.some((option) => option.value === value);
}

export function getInitialRefreshMs() {
  if (typeof window === 'undefined') return DEFAULT_REFRESH_MS;
  const storedValue = window.localStorage.getItem(STORAGE_KEY);
  if (storedValue === null) return DEFAULT_REFRESH_MS;
  const stored = Number(storedValue);
  return isRefreshValue(stored) ? stored : DEFAULT_REFRESH_MS;
}