import { AdminShell } from "@/components/admin/admin-shell";
import { QueueMonitor } from "@/components/admin/queue-monitor";
import { requirePlatformAdminPage } from "@/lib/auth/platform-admin";
import { adminI18n } from "@/i18n";

export default async function PlatformQueuesPage() {
  await requirePlatformAdminPage();

  return (
    <AdminShell active="queues">
      <div className="flex-1 overflow-auto bg-gray-50 p-5 sm:p-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6">
            <h1 className="text-3xl font-bold tracking-tight text-gray-950">
              {adminI18n.t("nav.platformQueues")}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
              {adminI18n.t("queue.pageDescription")}
            </p>
          </div>
          <QueueMonitor />
        </div>
      </div>
    </AdminShell>
  );
}
