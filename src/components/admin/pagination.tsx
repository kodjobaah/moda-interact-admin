import Link from "next/link";
import { Icon } from "./icons";
import { withParamUpdates } from "@/lib/admin/query";
import { adminI18n } from "@/i18n";

export function Pagination({
  pathname,
  params,
  page,
  totalPages,
  totalItems,
  pageParam = "page",
  countKey = "pagination.items",
  resetParams = [],
}: {
  pathname: string;
  params: Record<string, string>;
  page: number;
  totalPages: number;
  totalItems: number;
  pageParam?: string;
  countKey?: string;
  resetParams?: string[];
}) {
  if (totalItems === 0) return null;

  const previous = Math.max(1, page - 1);
  const next = Math.min(totalPages, page + 1);
  const navigationParams = Object.fromEntries(
    Object.entries(params).filter(([key]) => !resetParams.includes(key)),
  );

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-4 py-3 text-xs text-gray-500">
      <span>
        {adminI18n.t(countKey, { count: totalItems })} ·{" "}
        {adminI18n.t("pagination.page", { page, totalPages })}
      </span>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link
            href={withParamUpdates(pathname, navigationParams, {
              [pageParam]: previous,
            })}
            className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-50"
          >
            <Icon name="arrow-left" className="h-3.5 w-3.5" />{" "}
            {adminI18n.t("pagination.previous")}
          </Link>
        ) : (
          <span className="inline-flex cursor-not-allowed items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-gray-300">
            <Icon name="arrow-left" className="h-3.5 w-3.5" />{" "}
            {adminI18n.t("pagination.previous")}
          </span>
        )}
        {page < totalPages ? (
          <Link
            href={withParamUpdates(pathname, navigationParams, {
              [pageParam]: next,
            })}
            className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-50"
          >
            {adminI18n.t("pagination.next")}{" "}
            <Icon name="arrow-right" className="h-3.5 w-3.5" />
          </Link>
        ) : (
          <span className="inline-flex cursor-not-allowed items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-gray-300">
            {adminI18n.t("pagination.next")}{" "}
            <Icon name="arrow-right" className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
    </div>
  );
}
