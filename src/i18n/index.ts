import {
  createInternationalizationRuntime,
  validateIcuCatalogue,
  type IcuMessageValues,
  type InternationalizationRuntime,
} from "@modainteract/moda-interact-shared/internationalization";
import catalogue from "./locales/en.json";
import { ADMIN_REQUIRED_I18N_KEYS } from "./required-keys";
import { localizedReportStateLabel } from "@/lib/admin/billing-presentation.mjs";

validateIcuCatalogue(catalogue, ADMIN_REQUIRED_I18N_KEYS, { locale: "en" });

export function getAdminI18n(locale = "en"): InternationalizationRuntime {
  return createInternationalizationRuntime({
    locale,
    catalogue,
    timeZone: "UTC",
  });
}

export const adminI18n = getAdminI18n();

export function tAdmin(key: string, values?: IcuMessageValues): string {
  return adminI18n.t(key, values);
}

export function translateAdminText(
  value: string,
  values?: IcuMessageValues,
): string {
  return Object.hasOwn(catalogue, value) ? adminI18n.t(value, values) : value;
}

export function adminStatusLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return Object.hasOwn(catalogue, `status.${value}`)
    ? adminI18n.t(`status.${value}`)
    : value;
}

export function adminBillingReportStateLabel(
  value: string | null | undefined,
): string {
  return localizedReportStateLabel(value, (key: string) =>
    Object.hasOwn(catalogue, key) ? adminI18n.t(key) : undefined,
  );
}

export function adminRoleLabel(value: string): string {
  return Object.hasOwn(catalogue, `role.${value}`)
    ? adminI18n.t(`role.${value}`)
    : value.toLowerCase().replaceAll("_", " ");
}

export function adminSenderLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return Object.hasOwn(catalogue, `sender.${value}`)
    ? adminI18n.t(`sender.${value}`)
    : value;
}

export function adminEnvironmentLabel(value: string): string {
  return Object.hasOwn(catalogue, `environment.${value}`)
    ? adminI18n.t(`environment.${value}`)
    : adminI18n.t("environment.unknown");
}

export function adminQueueLabel(queueName: string): string {
  const keys: Record<string, string> = {
    "checkout-events": "queue.checkoutEvents",
    "order-events": "queue.orderEvents",
    "pending-recovery-candidates": "queue.pendingRecoveries",
    "recovery-capacity-resume": "queue.recoveryCapacityResume",
    "recovery-outreach-follow-up": "queue.recoveryOutreachFollowUp",
    "shopify-discount-sync": "queue.shopifyDiscountSync",
    "billing-subscription-reconcile": "queue.billingSubscriptionReconcile",
    "whatsapp-events": "queue.whatsappEvents",
    "merchant-communications": "queue.merchantCommunications",
    "merchant-knowledge": "queue.merchantKnowledge",
  };
  return keys[queueName] ? adminI18n.t(keys[queueName]) : queueName;
}

export function adminQueueWorkloadLabel(queueName: string): string {
  const keys: Record<string, string> = {
    "checkout-events": "queue.workloadShopifyEvents",
    "order-events": "queue.workloadShopifyEvents",
    "pending-recovery-candidates": "queue.workloadRecovery",
    "recovery-capacity-resume": "queue.workloadRecovery",
    "recovery-outreach-follow-up": "queue.workloadRecovery",
    "shopify-discount-sync": "queue.workloadShopifyDiscounts",
    "billing-subscription-reconcile": "queue.workloadBilling",
    "whatsapp-events": "queue.workloadMessaging",
    "merchant-communications": "queue.workloadMerchantCommunications",
    "merchant-knowledge": "queue.workloadMerchantKnowledge",
  };
  return keys[queueName] ? adminI18n.t(keys[queueName]) : queueName;
}

export function adminQueueJobLabel(jobName: string): string {
  const keys: Record<string, string> = {
    "cart-activity": "queue.cartActivityJob",
    "evaluate-pending-recovery": "queue.pendingRecoveryCandidates",
    "resume-capacity-blocked-recoveries": "queue.resumeCapacityBlockedRecoveriesJob",
    "recovery-outreach-follow-up": "queue.recoveryOutreachFollowUpJob",
    "reconcile-shopify-discounts": "queue.reconcileShopifyDiscountsJob",
    "reconcile-subscription": "queue.reconcileSubscriptionJob",
    "message-received": "queue.messageReceivedJob",
    "message-status": "queue.messageStatusJob",
    "process-conversation-turn": "queue.processConversationTurnJob",
    "process-source-revision": "queue.processSourceRevisionJob",
    "whatsapp-events": "queue.whatsappEventsJob",
    "translation-dispatch": "queue.translationDispatchJob",
    "translation-batch-submit": "queue.translationBatchSubmitJob",
    "translation-batch-poll": "queue.translationBatchPollJob",
    "translation-batch-results": "queue.translationBatchResultsJob",
    "translation-reconcile": "queue.translationReconcileJob",
    "Pending recovery candidates": "queue.pendingRecoveryCandidates",
    "WhatsApp events": "queue.whatsappEventsJob",
  };
  return keys[jobName] ? adminI18n.t(keys[jobName]) : jobName;
}
