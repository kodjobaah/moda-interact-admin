import { formatDateTime } from "@/lib/admin/format";
import type { RecoveryDetail } from "@/lib/admin/types";
import { EmptyState } from "./empty-state";
import { Pagination } from "./pagination";
import { adminI18n, adminSenderLabel, adminStatusLabel } from "@/i18n";

export function RecoveryConversationTab({
  recovery,
  params,
}: {
  recovery: RecoveryDetail;
  params: Record<string, string>;
}) {
  if (!recovery.messages.items.length) {
    return (
      <EmptyState title="empty.noConversationMessages">
        {adminI18n.t("empty.noWhatsAppMessages")}
      </EmptyState>
    );
  }

  return (
    <div>
      <div className="space-y-5">
        {recovery.messages.items.map((message) => {
          const outbound = message.direction === "OUTBOUND";
          return (
            <div
              key={message.id}
              className={`flex flex-col ${outbound ? "items-end" : "items-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl p-3 text-sm shadow-sm ${outbound ? "rounded-br-none bg-[var(--brand-600)] text-white" : "rounded-bl-none bg-gray-100 text-gray-800"}`}
              >
                {message.content}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
                <span>{adminSenderLabel(message.senderType)}</span>
                <span>·</span>
                <span>{adminStatusLabel(message.status)}</span>
                <span>·</span>
                <span>{formatDateTime(message.createdAt)}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-6 overflow-hidden rounded-lg border border-gray-100">
        <Pagination
          pathname="/"
          params={params}
          page={recovery.messages.page}
          totalPages={recovery.messages.totalPages}
          totalItems={recovery.messages.totalItems}
          pageParam="messagePage"
          countKey="pagination.messages"
        />
      </div>
    </div>
  );
}
