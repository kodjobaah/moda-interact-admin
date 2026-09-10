import Link from "next/link";
import type { ReactNode } from "react";
import { adminI18n } from "@/i18n";

export function AdminDetailDrawer({
  title,
  closeHref,
  children,
}: {
  title: string;
  closeHref: string;
  children: ReactNode;
}) {
  return (
    <>
      <Link
        href={closeHref}
        aria-label={adminI18n.t("billing.closeDetails")}
        className="fixed inset-0 z-40 bg-gray-900/30"
      />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[520px] flex-col border-l border-gray-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-6 py-5">
          <h2 className="text-lg font-bold text-gray-900">{title}</h2>
          <Link
            href={closeHref}
            aria-label={adminI18n.t("billing.closeDetails")}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-white"
          >
            {adminI18n.t("billing.closeDetails")}
          </Link>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-6">{children}</div>
      </aside>
    </>
  );
}
