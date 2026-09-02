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
