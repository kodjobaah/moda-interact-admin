export type SearchParamValue = string | string[] | undefined;
export type SearchParamRecord = Record<string, SearchParamValue>;

export function firstParam(value: SearchParamValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function positiveInt(value: SearchParamValue, fallback = 1): number {
  const raw = firstParam(value);
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function cleanSearch(value: SearchParamValue): string {
  return (firstParam(value) ?? '').trim().slice(0, 120);
}

export function paramsToRecord(
  params: SearchParamRecord,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(params)
      .map(([key, value]) => [key, firstParam(value)] as const)
      .filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
}

export function buildUrl(
  pathname: string,
  params: Record<string, string | number | null | undefined>,
): string {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') return;
    query.set(key, String(value));
  });

  const queryString = query.toString();
  return queryString ? `${pathname}?${queryString}` : pathname;
}

export function withParamUpdates(
  pathname: string,
  current: Record<string, string>,
  updates: Record<string, string | number | null | undefined>,
): string {
  const next: Record<string, string | number | null | undefined> = {
    ...current,
  };

  Object.entries(updates).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') {
      delete next[key];
    } else {
      next[key] = value;
    }
  });

  return buildUrl(pathname, next);
}
