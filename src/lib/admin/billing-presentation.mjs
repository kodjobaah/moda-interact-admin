export function billingDateBoundary(value, endOfDay = false) {
  if (!value) return undefined;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`)
    : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function effectiveOutboundHardCap(
  configuredHardLimit,
  platformAbsoluteHardLimit,
) {
  if (configuredHardLimit === null || platformAbsoluteHardLimit === null) {
    return null;
  }
  return Math.min(configuredHardLimit, platformAbsoluteHardLimit);
}

export function billingOverrideState(override, now) {
  if (!override) return null;
  return override.expiresAt === null || override.expiresAt > now
    ? "ACTIVE"
    : "EXPIRED";
}

export function localizedReportStateLabel(value, translate) {
  if (!value) return translate("empty.notRecorded");
  return translate(`billing.state.${value}`) ?? value;
}

export function tenantBillingLedgerPresentation(item, formatters) {
  return {
    occurredAt: formatters.formatDateTime(item.occurredAt),
    metric: item.metric,
    quantity: formatters.formatNumber(Number(item.quantity)),
    reportState: formatters.reportStateLabel(item.shopifyReportState),
    providerErrorCode: item.providerErrorCode ?? formatters.empty,
    providerResponseSummary: item.providerResponseSummary ?? formatters.empty,
    reportAttemptCount: formatters.formatNumber(item.reportAttemptCount),
    lastReportAttemptAt: item.lastReportAttemptAt
      ? formatters.formatDateTime(item.lastReportAttemptAt)
      : formatters.empty,
    reportedAt: item.reportedAt
      ? formatters.formatDateTime(item.reportedAt)
      : formatters.empty,
    shopifyEventHandle: item.shopifyEventHandle ?? formatters.empty,
  };
}
