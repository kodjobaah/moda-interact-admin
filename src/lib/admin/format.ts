import { adminI18n, tAdmin } from "@/i18n";

export function formatDateTime(value: Date | null | undefined): string {
  return value
    ? `${adminI18n.formatDateTime(value, {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })} UTC`
    : "—";
}

export function formatDate(value: Date | null | undefined): string {
  return value
    ? adminI18n.formatDateTime(value, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";
}

export function formatMoney(
  value: string | null | undefined,
  currency: string | null | undefined,
): string {
  if (!value || !currency) return tAdmin("empty.unavailable");
  const amount = Number(value);
  if (!Number.isFinite(amount)) return tAdmin("empty.unavailable");

  try {
    return adminI18n.formatMoney(amount, currency);
  } catch {
    return tAdmin("empty.unavailable");
  }
}

export function tenantName(brandName: string | null, domain: string): string {
  if (brandName?.trim()) return brandName.trim();
  const raw = domain.replace(/\.myshopify\.com$/i, "").replace(/[-_]+/g, " ");
  return raw.replace(/\b\w/g, (char) => char.toUpperCase());
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "MI";
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function customerName(
  firstName: string | null,
  lastName: string | null,
  email: string | null,
): string {
  const name = [firstName, lastName].filter(Boolean).join(" ").trim();
  return name || email || tAdmin("customer.unnamed");
}
