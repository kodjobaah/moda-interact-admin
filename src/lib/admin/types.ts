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
      freeLifetimeConversationAllowance: number | null;
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
    adjustments: number;
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
  onboardingCompleted: boolean;
  subscriptionStatus: string | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  defaultOutboundSoftLimit: number;
  defaultOutboundHardLimit: number;
  billingControls: TenantBillingControls;
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
    baseAllowance: number | null;
    totalAdjustments: number;
    committed: number;
    reserved: number;
    effectiveAllowance: number | null;
    effectiveRemaining: number | null;
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
