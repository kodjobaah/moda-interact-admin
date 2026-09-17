import Link from "next/link";
import { withParamUpdates } from "@/lib/admin/query";
import type {
  CustomerListItem,
  PageResult,
  RecoveryListItem,
  TenantDetail,
  TenantBilling,
  BillingLedgerItem,
  RecoveryCreditPurchaseItem,
} from "@/lib/admin/types";
import { RecoveryLogs } from "./recovery-logs";
import { TenantAdministration } from "./tenant-administration";
import { TenantBillingView } from "./tenant-billing";
import { TenantRecoverySettings } from "./tenant-recovery-settings";
import { adminI18n } from "@/i18n";

export function TenantDetailPanel({
  tenant,
  tab,
  customers,
  customerSearch,
  selectedCustomer,
  recoveries,
  params,
  returnTo,
  saved,
  billing,
  billingView,
  billingPacks,
  billingEvents,
  selectedPurchase,
  selectedEvent,
}: {
  tenant: TenantDetail;
  tab: "admin" | "recovery" | "logs" | "billing";
  customers: PageResult<CustomerListItem> | null;
  customerSearch: string;
  selectedCustomer: CustomerListItem | null;
  recoveries: PageResult<RecoveryListItem> | null;
  params: Record<string, string>;
  returnTo: string;
  saved?: boolean;
  billing: TenantBilling | null;
  billingView: "overview" | "usage" | "shopify" | "activity";
  billingPacks: PageResult<RecoveryCreditPurchaseItem> | null;
  billingEvents: PageResult<BillingLedgerItem> | null;
  selectedPurchase: RecoveryCreditPurchaseItem | null;
  selectedEvent: BillingLedgerItem | null;
}) {
  const commonReset = {
    customerId: null,
    customerPage: null,
    customerSearch: null,
    recoveryPage: null,
    recoveryId: null,
    drawerTab: null,
    messagePage: null,
    billingView: null,
    billingPage: null,
    packPage: null,
    purchaseId: null,
    eventId: null,
    saved: null,
  } as const;

  const adminHref = withParamUpdates("/", params, {
    ...commonReset,
    tab: "admin",
  });
  const recoveryHref = withParamUpdates("/", params, {
    ...commonReset,
    tab: "recovery",
  });
  const logsHref = withParamUpdates("/", params, {
    ...commonReset,
    tab: "logs",
    customerPage: 1,
  });
  const billingHref = withParamUpdates("/", params, {
    ...commonReset,
    tab: "billing",
    billingView: "overview",
  });
  const activeClass =
    "border-b-2 border-[var(--brand-700)] pb-2 font-semibold text-[var(--brand-700)]";
  const idleClass =
    "border-b-2 border-transparent pb-2 font-medium text-gray-500 hover:text-gray-700";

  return (
    <div className="px-6 py-6 sm:px-10">
      <div className="mb-6 flex flex-wrap gap-x-6 gap-y-3 border-b border-gray-200 pb-2">
        <Link
          href={adminHref}
          className={tab === "admin" ? activeClass : idleClass}
        >
          {adminI18n.t("tenant.overview")}
        </Link>
        <Link
          href={recoveryHref}
          className={tab === "recovery" ? activeClass : idleClass}
        >
          {adminI18n.t("tenant.recoverySettings")}
        </Link>
        <Link
          href={logsHref}
          className={tab === "logs" ? activeClass : idleClass}
        >
          {adminI18n.t("tenant.recoveryLogs")}
        </Link>
        <Link
          href={billingHref}
          className={tab === "billing" ? activeClass : idleClass}
        >
          {adminI18n.t("tenant.billing")}
        </Link>
      </div>
      {tab === "admin" ? (
        <TenantAdministration
          tenant={tenant}
          returnTo={returnTo}
          saved={saved}
        />
      ) : tab === "recovery" ? (
        <TenantRecoverySettings
          tenant={tenant}
          returnTo={returnTo}
          saved={saved}
        />
      ) : tab === "billing" && billing ? (
        <TenantBillingView
          tenant={tenant}
          billing={billing}
          params={params}
          billingView={billingView}
          packs={billingPacks}
          events={billingEvents}
          selectedPurchase={selectedPurchase}
          selectedEvent={selectedEvent}
        />
      ) : customers ? (
        <RecoveryLogs
          customers={customers}
          customerSearch={customerSearch}
          selectedCustomer={selectedCustomer}
          recoveries={recoveries}
          params={params}
        />
      ) : null}
    </div>
  );
}
