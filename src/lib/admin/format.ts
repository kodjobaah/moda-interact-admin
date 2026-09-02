const dateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'UTC',
});

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

export function formatDateTime(value: Date | null | undefined): string {
  return value ? `${dateTimeFormatter.format(value)} UTC` : '—';
}

export function formatDate(value: Date | null | undefined): string {
  return value ? dateFormatter.format(value) : '—';
}

export function formatMoney(
  value: string | null | undefined,
  currency = 'GBP',
): string {
  if (!value) return '—';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return value;

  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: currency || 'GBP',
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export function tenantName(brandName: string | null, domain: string): string {
  if (brandName?.trim()) return brandName.trim();
  const raw = domain.replace(/\.myshopify\.com$/i, '').replace(/[-_]+/g, ' ');
  return raw.replace(/\b\w/g, (char) => char.toUpperCase());
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'MI';
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export function customerName(
  firstName: string | null,
  lastName: string | null,
  email: string | null,
): string {
  const name = [firstName, lastName].filter(Boolean).join(' ').trim();
  return name || email || 'Unnamed customer';
}
