export type PageResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

export type PlatformKpis = {
  activeTenants: number;
  activeRecoveries: number;
  pendingRecoveries: number;
  recoveredCheckouts: number;
  recoveryConversations: number;
  recoveryMessages: number;
};

export type BillingOverview = {
  planDistribution: {
    free: number;
    paid: number;
    unmapped: number;
    syncError: number;
  };
  freeExhausted: number | null;
  paidRecoveryUsage: string;
  reportStates: Record<string, number>;
};

export type BillingLedgerItem = {
  id: string;
  shopId: string;
  shop: { domain: string };
  metric: string;
  quantity: string;
  occurredAt: Date;
  shopifyReportState: string;
  reportAttemptCount: number;
  lastReportAttemptAt: Date | null;
  reportedAt: Date | null;
  providerErrorCode: string | null;
  providerResponseSummary: string | null;
  shopifyEventHandle: string | null;
};

export type RecoveryCreditPurchaseItem = {
  id: string;
  shopId: string;
  shop: { domain: string; brandName: string | null };
  planName: string | null;
  shopifyPlanHandleSnapshot: string;
  shopifyEventHandleSnapshot: string;
  creditsGranted: number;
  status: string;
  activatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  usageEvent: {
    id: string;
    metric: string;
    quantity: string;
    occurredAt: Date;
    shopifyReportState: string;
    reportAttemptCount: number;
    lastReportAttemptAt: Date | null;
    reportedAt: Date | null;
    providerErrorCode: string | null;
    providerResponseSummary: string | null;
    shopifyEventHandle: string | null;
  };
};

export type RecoveryCreditRefundQueueStatus =
  | "ALL"
  | "REQUESTED"
  | "READY_FOR_REFUND_PROCESSING"
  | "WAITING_FOR_RESERVATIONS"
  | "PROVIDER_ACTION_REQUIRED"
  | "NEEDS_ATTENTION"
  | "COMPLETED"
  | "REJECTED"
  | "CANCELLED";

export type RecoveryCreditRefundItem = {
  id: string;
  shopId: string;
  shop: { domain: string; brandName: string | null };
  source: string;
  requestedByShopifyUserId: string | null;
  status: string;
  queueStatus: RecoveryCreditRefundQueueStatus;
  purchase: {
    id: string;
    status: string;
    creditsGranted: number;
    currentAmount: number;
    reservedAmount: number;
    createdAt: Date;
    activatedAt: Date | null;
    providerPurchaseAmount: string | null;
    providerPurchaseCurrency: string | null;
  };
  purchaseCreditsGrantedSnapshot: number;
  currentAmountAtRequestSnapshot: number;
  reservedAmountAtRequestSnapshot: number;
  availableAmountAtRequestSnapshot: number;
  billingPeriodIdSnapshot: string;
  providerSubscriptionIdSnapshot: string;
  planHandleSnapshot: string;
  eventHandleSnapshot: string;
  purchaseProviderAmountSnapshot: string;
  purchaseProviderCurrencySnapshot: string;
  finalCreditQuantity: number | null;
  expectedProviderAmount: string | null;
  expectedProviderCurrency: string | null;
  automaticCorrectionUsageEventId: string | null;
  providerUsageQuantityBeforeCorrection: string | null;
  providerUsageCostBeforeCorrection: string | null;
  expectedProviderUsageQuantityAfterCorrection: string | null;
  expectedProviderUsageCostAfterCorrection: string | null;
  automaticCorrection: {
    id: string;
    quantity: string;
    shopifyReportState: string;
    shopifyEventHandle: string | null;
    shopifyIdempotencyKey: string | null;
    reportAttemptCount: number;
    lastReportAttemptAt: Date | null;
    reportedAt: Date | null;
  } | null;
  providerReference: string | null;
  providerActionKind: string | null;
  providerAmount: string | null;
  providerCurrency: string | null;
  reason: string | null;
  sourceMessageId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type RecoveryCreditRefundDetail = RecoveryCreditRefundItem & {
  purchase: RecoveryCreditRefundItem["purchase"] & {
    planName: string | null;
    shopifyPlanHandleSnapshot: string;
    shopifyEventHandleSnapshot: string;
    providerSubscriptionIdSnapshot: string;
    providerUsageQuantityBeforeSnapshot: string;
    providerUsageCostBeforeSnapshot: string;
    providerUsageCostCurrencyBeforeSnapshot: string;
    providerUsageQuantityAfterSnapshot: string | null;
    providerUsageCostAfterSnapshot: string | null;
    providerUsageCostCurrencyAfterSnapshot: string | null;
    providerValuationConfirmedAt: Date | null;
    providerPriceSnapshot: unknown;
    billingPeriod: {
      id: string;
      periodStart: Date;
      periodEnd: Date;
      planNameSnapshot: string | null;
      planKindSnapshot: string | null;
    };
  };
  approvedAt: Date | null;
  holdAppliedAt: Date | null;
  providerConfirmedAt: Date | null;
  completedAt: Date | null;
  sourceMessage: {
    id: string;
    createdAt: Date;
    shopifyUserId: string | null;
    systemCode: string | null;
  } | null;
  reservations: Array<{
    id: string;
    quantity: number;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }>;
  refundHistory: Array<{
    id: string;
    status: string;
    source: string;
    reason: string | null;
    finalCreditQuantity: number | null;
    providerAmount: string | null;
    providerCurrency: string | null;
    createdAt: Date;
    completedAt: Date | null;
  }>;
};

export type TenantBilling = {
  subscription: {
    observedShopifyPlanHandle: string | null;
    status: string;
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
    trialEndsAt: Date | null;
    cancelAtPeriodEnd: boolean;
    pendingShopifyPlanHandle: string | null;
    pendingEffectiveAt: Date | null;
    lastSyncedAt: Date | null;
    lastSyncErrorCode: string | null;
    plan: {
      name: string;
      kind: string;
      shopifyUsageEventHandle: string | null;
      defaultOutboundHardLimit: number;
    } | null;
    pendingPlan: { name: string } | null;
    billingPeriod: {
      id: string;
      periodStart: Date;
      periodEnd: Date;
      status: string;
    } | null;
  };
  allowance: {
    base: number;
    committed: number;
    reserved: number;
    remaining: number;
  };
  paidRecoveryUsage: string;
  currentPeriodAutomatedMessageQuantity: string | null;
  planDefaultOutboundHardLimit: number | null;
  platformAbsoluteOutboundHardLimit: number | null;
  effectiveOutboundHardCap: number | null;
  overrideState: "ACTIVE" | "EXPIRED" | null;
  overrideReason: string | null;
  pauseNewRecoveries: boolean | null;
  pauseAutomatedWhatsapp: boolean | null;
  override: {
    outboundSoftLimit: number | null;
    outboundHardLimit: number | null;
    pauseNewRecoveries: boolean | null;
    pauseAutomatedWhatsapp: boolean | null;
    recoverySafetyCeiling: number | null;
    reason: string;
    expiresAt: Date | null;
  } | null;
  ledger: PageResult<BillingLedgerItem>;
  discrepancy: {
    modaQuantity: string;
    shopifyQuantity: string;
    meterHandle: string;
  } | null;
};

export type TenantListItem = {
  id: string;
  domain: string;
  status: string;
  installedAt: Date;
  brandName: string | null;
  logoUrl: string | null;
  planName: string | null;
  planHandle: string | null;
};

export type TenantDetail = TenantListItem & {
  uninstalledAt: Date | null;
  recoveryDelayMinutes: number | null;
  recoveryPolicy: TenantRecoveryPolicy;
  onboardingCompleted: boolean;
  subscriptionStatus: string | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  defaultOutboundSoftLimit: number;
  defaultOutboundHardLimit: number;
  billingControls: TenantBillingControls;
};

export type RecoveryPolicyValues = {
  recoveryDelayMinutes: number;
  recoveryOfferMode: "NONE" | "FIXED" | "AI_BEST_APPLICABLE";
  fixedShopifyDiscountId: string | null;
  followUpEnabled: boolean;
  followUpDelayMinutes: number | null;
};

export type TenantRecoveryPolicy = {
  merchant: RecoveryPolicyValues;
  override: RecoveryPolicyValues | null;
  effective: RecoveryPolicyValues & { source: "MERCHANT" | "ADMIN_OVERRIDE" };
  overrideExpiresAt: Date | null;
  overrideExpired: boolean;
  overrideReason: string | null;
  catalogue: {
    status: string;
    lastSuccessfulSyncAt: Date | null;
    runningDiscountCount: number;
    fixedSelectableCount: number;
    selectableDiscounts: Array<{ id: string; title: string }>;
  };
};

export type TenantBillingControls = {
  override: {
    outboundSoftLimit: number | null;
    outboundHardLimit: number | null;
    pauseNewRecoveries: boolean | null;
    pauseAutomatedWhatsapp: boolean | null;
    recoverySafetyCeiling: number | null;
    reason: string;
    expiresAt: Date | null;
  } | null;
  allowance: {
    grantedAllowance: number | null;
    committed: number;
    reserved: number;
    remaining: number | null;
  };
};

export type CustomerListItem = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  recoveryCount: number;
};

export type RecoveryListItem = {
  id: string;
  detectedAt: Date;
  totalPrice: string | null;
  currency: string | null;
  status: string;
  outcome: string | null;
};

export type RecoveryMessage = {
  id: string;
  direction: string;
  senderType: string;
  status: string;
  content: string;
  createdAt: Date;
  sentAt: Date | null;
  deliveredAt: Date | null;
  readAt: Date | null;
};

export type RecoveryLifecycleEvent = {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  reason: string | null;
  source: string | null;
  occurredAt: Date;
};

export type RecoveryLineItem = {
  title: string;
  variant: string | null;
  quantity: number;
  price: string | null;
  currency: string | null;
  imageUrl: string | null;
};

export type RecoveryDetail = {
  id: string;
  shopId: string;
  checkoutToken: string;
  checkoutUrl: string | null;
  detectedAt: Date;
  generation: number;
  lastExternalActivityAt: Date;
  totalPrice: string | null;
  currency: string | null;
  status: string;
  outcome: string | null;
  conversationId: string | null;
  customer: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
  } | null;
  messages: PageResult<RecoveryMessage>;
  lifecycle: RecoveryLifecycleEvent[];
  lineItems: RecoveryLineItem[];
};
