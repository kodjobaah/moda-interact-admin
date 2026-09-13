import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { requirePlatformAdminPage } from "@/lib/auth/platform-admin";
import { getPromotionReport } from "@/lib/admin/promotion-report";

export const dynamic = "force-dynamic";

export default async function PromotionReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ campaignId: string }>;
  searchParams: Promise<{ page?: string; search?: string; status?: string }>;
}) {
  const principal = await requirePlatformAdminPage();
  if (principal.role !== "SUPER_ADMIN") redirect("/");
  const [{ campaignId }, query] = await Promise.all([params, searchParams]);
  const status = query.status === "SELECTED" || query.status === "USED" || query.status === "EXHAUSTED" ? query.status : "ALL";
  const report = await getPromotionReport(campaignId, {
    page: Number(query.page),
    search: query.search,
    status,
  });
  if (!report) notFound();

  return (
    <AdminShell active="promotions">
      <div className="flex-1 overflow-auto p-4 sm:p-8">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href="/promotions" className="text-sm font-semibold text-gray-600">Back to campaigns</Link>
            <h1 className="mt-2 text-2xl font-bold text-[var(--brand-900)]">{report.campaign.name} usage</h1>
            <p className="mt-1 text-sm text-gray-500">Merchant grant history from exact campaign allocations.</p>
          </div>
        </div>
        <div className="mb-6 grid gap-3 sm:grid-cols-4">
          <Summary label="Merchants selected" value={report.summary.merchantsSelected} />
          <Summary label="Merchants used" value={report.summary.merchantsUsed} />
          <Summary label="Merchants exhausted" value={report.summary.merchantsExhausted} />
          <Summary label="Credits committed" value={report.summary.totalCreditsCommitted} />
        </div>
        <form className="mb-6 grid gap-3 rounded-lg border border-gray-200 bg-white p-4 sm:grid-cols-3" method="get">
          <label className="text-xs font-semibold text-gray-600">Merchant<input name="search" defaultValue={query.search} maxLength={255} className="mt-1 w-full rounded-md border border-gray-300 p-2 text-sm" /></label>
          <label className="text-xs font-semibold text-gray-600">Usage status<select name="status" defaultValue={status} className="mt-1 w-full rounded-md border border-gray-300 p-2 text-sm"><option value="ALL">All</option><option value="SELECTED">Selected</option><option value="USED">Used</option><option value="EXHAUSTED">Exhausted</option></select></label>
          <button type="submit" className="self-end rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">Filter</button>
        </form>
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-[1050px] w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-600"><tr><th className="p-3">Merchant</th><th className="p-3">Selected</th><th className="p-3">Granted</th><th className="p-3">Reserved</th><th className="p-3">Committed</th><th className="p-3">Remaining</th><th className="p-3">Used</th><th className="p-3">Status</th></tr></thead>
            <tbody>{report.merchants.map((merchant) => <tr key={merchant.shopId} className="border-b border-gray-100 last:border-0"><td className="p-3 font-medium text-gray-950">{merchant.shopLabel}</td><td className="p-3">{merchant.firstSelectedAt?.toLocaleString() ?? "-"}<br /><span className="text-xs text-gray-500">{merchant.selectionCount} selection(s){merchant.currentlySelected ? " · current" : ""}</span></td><td className="p-3">{merchant.quantityGranted}</td><td className="p-3">{merchant.reserved}</td><td className="p-3">{merchant.committed}</td><td className="p-3">{merchant.remainingAllocation}</td><td className="p-3">{merchant.firstUsedAt?.toLocaleString() ?? "-"}</td><td className="p-3">{merchant.exhaustedAt ? `Exhausted ${merchant.exhaustedAt.toLocaleString()}` : merchant.currentlySelected ? "Selected" : "Not current"}</td></tr>)}</tbody>
          </table>
          {report.merchants.length === 0 ? <p className="p-8 text-sm text-gray-600">No merchants match this report filter.</p> : null}
        </div>
        <p className="mt-4 text-sm text-gray-500">Page {report.page} of {report.totalPages} · {report.totalMerchants} merchant grants</p>
      </div>
    </AdminShell>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg border border-gray-200 bg-white p-4"><p className="text-xs font-semibold text-gray-500">{label}</p><p className="mt-2 text-2xl font-bold text-gray-950">{value}</p></div>;
}