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
  tab: "admin" | "logs" | "billing";
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
  const adminHref = withParamUpdates("/", params, {
    tab: "admin",
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
  });
  const logsHref = withParamUpdates("/", params, {
    tab: "logs",
    customerPage: 1,
    billingView: null,
    billingPage: null,
    packPage: null,
    purchaseId: null,
    eventId: null,
    saved: null,
  });
  const billingHref = withParamUpdates("/", params, {
    tab: "billing",
    billingView: "overview",
    billingPage: null,
    packPage: null,
    purchaseId: null,
    eventId: null,
    saved: null,
  });
  const activeClass =
    "border-b-2 border-[var(--brand-700)] pb-2 font-semibold text-[var(--brand-700)]";
  const idleClass =
    "border-b-2 border-transparent pb-2 font-medium text-gray-500 hover:text-gray-700";

  return (
    <div className="px-6 py-6 sm:px-10">
      <div className="mb-6 flex gap-6 border-b border-gray-200 pb-2">
        <Link
          href={adminHref}
          className={tab === "admin" ? activeClass : idleClass}
        >
          {adminI18n.t("tenant.administration")}
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
      ) : tab === "billing" && billing ? (
        <TenantBillingView
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
