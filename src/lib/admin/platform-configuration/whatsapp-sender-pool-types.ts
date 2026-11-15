/** Admin-local inventory DTOs; credentials and provider proof never enter this contract. */
export type SenderSettings = { priority: number; allocationEnabled: boolean };
export type PoolAction = { op: "enrol"; providerPhoneNumberId: string; priority: number }
  | { op: "update"; providerPhoneNumberId: string; expected: SenderSettings; next: SenderSettings };
export type PoolRow = SenderSettings & { providerPhoneNumberId: string; providerAccountId: string; createdAt: string; updatedAt: string };
export type PoolCode = "INVALID_INPUT" | "FORBIDDEN" | "CONFIGURATION_UNAVAILABLE" | "CONFIGURATION_CHANGED" | "PROVIDER_UNAVAILABLE" | "NOT_CONNECTED" | "LEGACY_SENDER_IN_USE" | "SENDER_NOT_FOUND" | "IDENTITY_CONFLICT" | "STALE_SETTINGS" | "DB_UNAVAILABLE";
export class SenderPoolError extends Error {
  constructor(readonly code: PoolCode, cause?: unknown) { super(code, cause === undefined ? undefined : { cause }); this.name = "SenderPoolError"; }
}
const record = (value: unknown, keys: string[]): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const priority = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 2147483647;
const settings = (value: unknown): value is SenderSettings => record(value, ["priority", "allocationEnabled"]) && priority(value.priority) && typeof value.allocationEnabled === "boolean";
export function parsePoolAction(raw: unknown): PoolAction {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new SenderPoolError("INVALID_INPUT");
  const value = raw as Record<string, unknown>;
  if (typeof value.providerPhoneNumberId !== "string" || !/^[0-9]{4,32}$/.test(value.providerPhoneNumberId)) throw new SenderPoolError("INVALID_INPUT");
  if (value.op === "enrol" && record(value, ["op", "providerPhoneNumberId", "priority"]) && priority(value.priority)) return value as PoolAction;
  if (value.op === "update" && record(value, ["op", "providerPhoneNumberId", "expected", "next"]) && settings(value.expected) && settings(value.next)) return value as PoolAction;
  throw new SenderPoolError("INVALID_INPUT");
}
