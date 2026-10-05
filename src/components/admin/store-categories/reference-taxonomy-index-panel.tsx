"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";

import {
  clearReferenceTaxonomyIndexAction,
  syncReferenceTaxonomyIndexAction,
} from "@/app/actions/reference-taxonomy-index";
import type { ReferenceTaxonomyIndexStatus } from "@/lib/admin/shopify-taxonomy-index-management";

const statePresentation: Record<
  ReferenceTaxonomyIndexStatus["state"],
  { label: string; className: string; description: string }
> = {
  READY: {
    label: "Ready",
    className: "bg-emerald-50 text-emerald-700",
    description:
      "The Redis search index matches the current Reference Taxonomy embedding configuration.",
  },
  NOT_LOADED: {
    label: "Not loaded",
    className: "bg-gray-100 text-gray-700",
    description:
      "The taxonomy search index is not currently loaded in Redis. Sync it before creating categories or mappings.",
  },
  REQUIRES_SYNC: {
    label: "Re-sync required",
    className: "bg-amber-50 text-amber-800",
    description:
      "The loaded taxonomy index does not match the current embedding configuration, or an incomplete index remains in Redis.",
  },
  EMBEDDING_NOT_CONFIGURED: {
    label: "Embedding configuration required",
    className: "bg-amber-50 text-amber-800",
    description:
      "Configure the Reference Taxonomy embedding purpose before synchronizing the search index.",
  },
  REDIS_UNAVAILABLE: {
    label: "Redis unavailable",
    className: "bg-red-50 text-red-700",
    description:
      "The Admin service cannot inspect the reference taxonomy Redis index.",
  },
};

export function ReferenceTaxonomyIndexPanel({
  status,
  canManage,
}: {
  status: ReferenceTaxonomyIndexStatus;
  canManage: boolean;
}) {
  const router = useRouter();
  const inFlight = useRef(false);
  const [pending, setPending] = useState<"sync" | "clear" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const presentation = statePresentation[status.state];
  const canSync =
    canManage &&
    status.embedding !== null &&
    status.state !== "REDIS_UNAVAILABLE";
  const canClear =
    canManage &&
    status.redisIndexPresent &&
    status.state !== "REDIS_UNAVAILABLE";

  async function sync() {
    if (inFlight.current || !canSync) return;
    inFlight.current = true;
    flushSync(() => {
      setPending("sync");
      setMessage(null);
    });
    try {
      const result = await syncReferenceTaxonomyIndexAction();
      if (result.ok) {
        setMessage("Reference taxonomy search index synchronized.");
        router.refresh();
      } else {
        setMessage(result.message);
      }
    } catch {
      setMessage("Reference taxonomy synchronization could not be completed.");
    } finally {
      inFlight.current = false;
      setPending(null);
    }
  }

  async function clear() {
    if (inFlight.current || !canClear) return;
    if (
      !window.confirm(
        "Clear the temporary reference taxonomy search index from Redis? Existing Store Categories and Category Mappings stored in PostgreSQL will not be deleted.",
      )
    ) {
      return;
    }
    inFlight.current = true;
    flushSync(() => {
      setPending("clear");
      setMessage(null);
    });
    try {
      const result = await clearReferenceTaxonomyIndexAction();
      if (result.ok) {
        setMessage("Reference taxonomy search index cleared from Redis.");
        router.refresh();
      } else {
        setMessage(result.message);
      }
    } catch {
      setMessage("Reference taxonomy search index could not be cleared.");
    } finally {
      inFlight.current = false;
      setPending(null);
    }
  }

  return (
    <section className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-gray-950">
              Reference taxonomy search index
            </h2>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${presentation.className}`}
            >
              {presentation.label}
            </span>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">
            {presentation.description}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            This Redis index is temporary authoring infrastructure. Clearing it
            does not remove Store Categories or Category Mappings from PostgreSQL.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/system-controls/embeddings"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Embedding settings
          </Link>
          {canManage ? (
            <button
              type="button"
              onClick={() => void sync()}
              disabled={!canSync || pending !== null}
              className="rounded-md bg-[var(--brand-700)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-800)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pending === "sync"
                ? "Synchronizing…"
                : status.state === "READY"
                  ? "Re-sync taxonomy"
                  : "Sync taxonomy"}
            </button>
          ) : null}
          {canManage && status.redisIndexPresent ? (
            <button
              type="button"
              onClick={() => void clear()}
              disabled={!canClear || pending !== null}
              className="rounded-md border border-red-300 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pending === "clear" ? "Clearing…" : "Clear search index"}
            </button>
          ) : null}
        </div>
      </div>

      <dl className="mt-5 grid gap-4 border-t border-gray-200 pt-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-xs font-semibold text-gray-500">Environment</dt>
          <dd className="mt-1 font-medium text-gray-900">{status.environment}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-gray-500">Embedding model</dt>
          <dd className="mt-1 text-gray-900">
            {status.embedding?.model ?? "Not configured"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-gray-500">Dimensions</dt>
          <dd className="mt-1 text-gray-900">
            {status.embedding?.dimensions ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-gray-500">Index version</dt>
          <dd className="mt-1 break-all text-gray-900">
            {status.embedding?.indexVersion ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-gray-500">Taxonomy version</dt>
          <dd className="mt-1 text-gray-900">
            {status.index?.taxonomyVersion ?? "Not loaded"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-gray-500">Top-level categories</dt>
          <dd className="mt-1 text-gray-900">{status.index?.topLevelCount ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-gray-500">Subcategories</dt>
          <dd className="mt-1 text-gray-900">{status.index?.subcategoryCount ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-gray-500">Last synchronized</dt>
          <dd className="mt-1 text-gray-900">{status.index?.syncedAt ?? "—"}</dd>
        </div>
      </dl>

      {!canManage ? (
        <p className="mt-4 text-xs text-gray-500">
          SUPER_ADMIN access is required to synchronize or clear the taxonomy search index.
        </p>
      ) : null}
      <p role="status" aria-live="polite" className="mt-3 min-h-5 text-sm text-gray-700">
        {message}
      </p>
    </section>
  );
}
