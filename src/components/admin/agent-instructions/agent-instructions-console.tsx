"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { mutateAgentInstructionsAction } from "@/app/actions/agent-instructions";
import type { AgentInstructionsScopeConflict, getAgentInstructionsData } from "@/lib/admin/agent-instructions";
import { AgentInstructionsTabs, type AgentInstructionsTab } from "./agent-instructions-tabs";
import { PromptCodeEditor } from "./prompt-code-editor";

type Data = Awaited<ReturnType<typeof getAgentInstructionsData>>;
type ScopeResult = NonNullable<Data["platform"]>;
type ScopeData = Exclude<ScopeResult, AgentInstructionsScopeConflict>;

function isScopeConflict(data: ScopeResult): data is AgentInstructionsScopeConflict {
  return "kind" in data && data.kind === "configuration-conflict";
}

function ConflictDetails({ conflict }: { conflict: AgentInstructionsScopeConflict }) {
  const detailRows = Object.entries(conflict.details).filter(([, value]) => {
    if (Array.isArray(value)) return value.length > 0;
    return value !== null && value !== "";
  });

  return (
    <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-4" role="alert">
      <h3 className="font-semibold text-amber-950">Agent Instructions configuration conflict</h3>
      <p className="mt-2 text-sm text-amber-900">{conflict.message}</p>
      <p className="mt-2 text-sm text-amber-900">
        This scope is read-only until the persisted configuration is reconciled. No prompt revision was selected or changed automatically.
      </p>
      <dl className="mt-3 grid gap-2 text-xs text-amber-950 sm:grid-cols-2">
        <div>
          <dt className="font-semibold uppercase tracking-wide">Conflict code</dt>
          <dd className="mt-1 break-all font-mono">{conflict.code}</dd>
        </div>
        <div>
          <dt className="font-semibold uppercase tracking-wide">Scope</dt>
          <dd className="mt-1">{conflict.scope}{conflict.shopId ? ` · ${conflict.shopId}` : ""}</dd>
        </div>
        {detailRows.map(([key, value]) => (
          <div key={key} className="min-w-0">
            <dt className="font-semibold uppercase tracking-wide">{key}</dt>
            <dd className="mt-1 break-all font-mono">{Array.isArray(value) ? value.join(", ") : String(value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

const inputClass = "mt-1 w-full rounded-md border border-gray-300 bg-white p-2 text-sm outline-none focus:border-[var(--brand-500)] focus:ring-2 focus:ring-[var(--brand-200)]";

function PromptEditor({ data, configurationVersion }: { data: ScopeData; configurationVersion: number }) {
  const router = useRouter();
  const draft = data.draft;
  const [promptText, setPromptText] = useState(draft?.promptText ?? "");
  const [savedText, setSavedText] = useState(draft?.promptText ?? "");
  const saveAction = async (formData: FormData) => {
    await mutateAgentInstructionsAction(formData);
    setSavedText(promptText);
    router.refresh();
  };
  return (
    <section className="space-y-5">
      {data.pendingCategory ? (
        <div className="border-l-4 border-amber-500 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-semibold">Publishing this draft will activate the pending Store Category.</p>
          <p className="mt-1">Pending Store Category: {data.pendingCategory.displayName}</p>
          <p>Seed template: {data.pendingCategory.templateDisplayName ?? data.pendingCategory.templateKey ?? "Unavailable"}</p>
          <p>Seed template edit version: {data.pendingCategory.sourceTemplateEditVersion}</p>
        </div>
      ) : null}
      {draft ? (
        <form action={saveAction} className="space-y-4 border-y border-gray-200 py-5">
          <input type="hidden" name="intent" value="update-draft" />
          <input type="hidden" name="revisionId" value={draft.id} />
          <input type="hidden" name="expectedEditVersion" value={draft.editVersion} />
          <div className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-gray-700">
                Draft prompt, canonical English
              </span>
              <span className="text-xs text-gray-500" aria-live="polite">
                {promptText.length.toLocaleString()} / 32,000 characters
              </span>
            </div>
            <PromptCodeEditor
              value={promptText}
              onChange={setPromptText}
              maxLength={32_000}
              ariaLabel="Draft prompt, canonical English"
            />
            <input type="hidden" name="promptText" value={promptText} />
            <p className="text-xs text-gray-500">
              CodeMirror editor with Markdown-aware highlighting, line numbers, search, and keyboard navigation.
            </p>
          </div>
          <label className="block text-sm font-medium text-gray-700">
            Audit reason
            <input className={inputClass} name="reason" maxLength={1000} required />
          </label>
          <button
            className="rounded-md bg-[var(--brand-700)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-800)] disabled:cursor-not-allowed disabled:opacity-50"
            type="submit"
            disabled={!promptText.trim()}
          >
            Save Draft
          </button>
        </form>
      ) : (
        <form action={mutateAgentInstructionsAction} className="my-5 flex flex-wrap items-end gap-3 border-y border-gray-200 py-5">
          <input type="hidden" name="intent" value="create-draft" />
          <input type="hidden" name="scope" value={data.scope} />
          <input type="hidden" name="shopId" value={data.shopId ?? ""} />
          <label className="min-w-64 flex-1 text-sm font-medium text-gray-700">
            Audit reason
            <input className={inputClass} name="reason" maxLength={1000} required />
          </label>
          <button className="rounded-md bg-[var(--brand-700)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-800)]" type="submit">
            Create Draft
          </button>
        </form>
      )}
      {draft ? (
        <form action={mutateAgentInstructionsAction} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="intent" value="publish" />
          <input type="hidden" name="revisionId" value={draft.id} />
          <input type="hidden" name="expectedRevisionEditVersion" value={draft.editVersion} />
          <input type="hidden" name="expectedConfigurationPromptEditVersion" value={configurationVersion} />
          <label className="min-w-64 flex-1 text-sm font-medium text-gray-700">
            Publish reason
            <input className={inputClass} name="reason" maxLength={1000} required />
          </label>
          <button
            className="rounded-md border border-[var(--brand-700)] px-4 py-2 text-sm font-semibold text-[var(--brand-800)] hover:bg-[var(--brand-100)] disabled:cursor-not-allowed disabled:opacity-50"
            type="submit"
            disabled={!promptText.trim() || promptText !== savedText}
            title={promptText !== savedText ? "Save the draft before publishing." : undefined}
          >
            Publish and Activate
          </button>
        </form>
      ) : null}
      <div className="mt-8">
        <h3 className="text-sm font-semibold text-gray-900">Revision History</h3>
        <div className="mt-2 overflow-x-auto border-y border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
            <thead className="text-xs uppercase text-gray-500"><tr><th className="px-3 py-2">Revision</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Edit</th><th className="px-3 py-2">Published</th><th className="px-3 py-2">Hash / provenance</th><th className="px-3 py-2">Prompt</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {data.history.map((revision) => (
                <tr key={revision.id}>
                  <td className="px-3 py-2">{revision.revisionNumber}</td>
                  <td className="px-3 py-2">{revision.id === data.active?.id ? "ACTIVE · " : ""}{revision.status}</td>
                  <td className="px-3 py-2">{revision.editVersion}</td>
                  <td className="px-3 py-2">{revision.publishedAt?.toLocaleString() ?? "—"}</td>
                  <td className="max-w-xs break-all px-3 py-2 text-xs text-gray-600">
                    {revision.contentHash ?? "—"}
                    {revision.sourceTemplateId ? <span className="block">Template {revision.sourceTemplateId} · edit {revision.sourceTemplateEditVersion}</span> : null}
                  </td>
                  <td className="px-3 py-2">
                    <details><summary className="cursor-pointer text-[var(--brand-800)]">View</summary><pre className="mt-2 max-h-64 max-w-xl overflow-auto whitespace-pre-wrap rounded-md bg-gray-50 p-3 text-xs">{revision.promptText}</pre></details>
                    {revision.status === "PUBLISHED" && revision.id !== data.active?.id ? (
                      <form action={mutateAgentInstructionsAction} className="mt-2 space-y-2">
                        <input type="hidden" name="intent" value="activate" />
                        <input type="hidden" name="promptRevisionId" value={revision.id} />
                        <input type="hidden" name="scope" value={data.scope} />
                        <input type="hidden" name="shopId" value={data.shopId ?? ""} />
                        <input type="hidden" name="expectedConfigurationPromptEditVersion" value={configurationVersion} />
                        <input className={inputClass} name="reason" maxLength={1000} placeholder="Activation reason" required />
                        <button className="text-xs font-semibold text-[var(--brand-800)] underline" type="submit">Activate published revision</button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export function AgentInstructionsConsole({
  data,
  initialTab = "platform",
}: {
  data: Data;
  initialTab?: AgentInstructionsTab;
}) {
  const selected = data.selectedShop;
  const [activeTab, setActiveTab] = useState<AgentInstructionsTab>(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--brand-900)]">Agent Instructions</h1>
          <p className="mt-1 text-sm text-gray-600">
            Manage canonical-English Platform and Shop prompt revisions.
          </p>
        </div>
        <span className="w-fit rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold tracking-wide text-gray-700">
          {data.environment}
        </span>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="px-5 pt-2 sm:px-6">
          <AgentInstructionsTabs activeTab={activeTab} onChange={setActiveTab} />
        </div>

        {activeTab === "platform" ? (
          <section
            id="agent-instructions-panel-platform"
            role="tabpanel"
            aria-labelledby="agent-instructions-tab-platform"
            className="p-5 sm:p-6"
          >
            {isScopeConflict(data.platform) ? (
              <ConflictDetails conflict={data.platform} />
            ) : (
              <>
                <div className="mb-5 flex flex-wrap gap-x-6 gap-y-2 rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-700">
                  <span>
                    <span className="font-medium text-gray-900">Active revision:</span>{" "}
                    {data.platform.active?.revisionNumber ?? "None"}
                  </span>
                  <span>
                    <span className="font-medium text-gray-900">Configuration edit version:</span>{" "}
                    {data.platform.configuration?.promptEditVersion ?? 1}
                  </span>
                </div>
                <PromptEditor
                  key={`${data.platform.draft?.id ?? "none"}:${data.platform.draft?.editVersion ?? 0}`}
                  data={data.platform}
                  configurationVersion={data.platform.configuration?.promptEditVersion ?? 1}
                />
              </>
            )}
          </section>
        ) : (
          <section
            id="agent-instructions-panel-shop"
            role="tabpanel"
            aria-labelledby="agent-instructions-tab-shop"
            className="p-5 sm:p-6"
          >
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <h2 className="text-sm font-semibold text-gray-900">Select shop</h2>
              <p className="mt-1 text-xs text-gray-600">
                Search by shop domain or exact internal ID, then load its instruction history.
              </p>
              <form
                className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.8fr)_auto] lg:items-end"
                action="/system-controls/agent-instructions"
                method="get"
              >
                <input type="hidden" name="tab" value="shop" />
                <label className="text-sm font-medium text-gray-700">
                  Search shops
                  <input
                    className={inputClass}
                    name="q"
                    defaultValue=""
                    list="agent-instructions-shops"
                    placeholder="example.myshopify.com or exact shop ID"
                  />
                  <datalist id="agent-instructions-shops">
                    {data.shops.map((shop) => (
                      <option key={shop.id} value={shop.domain}>
                        {shop.id}
                      </option>
                    ))}
                  </datalist>
                </label>
                <label className="text-sm font-medium text-gray-700">
                  Selected shop
                  <select className={inputClass} name="shop" defaultValue={selected?.id ?? ""}>
                    {data.shops.map((shop) => (
                      <option key={shop.id} value={shop.id}>
                        {shop.domain}
                      </option>
                    ))}
                    {selected && !data.shops.some((shop) => shop.id === selected.id) ? (
                      <option value={selected.id}>{selected.domain}</option>
                    ) : null}
                  </select>
                </label>
                <button
                  className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100"
                  type="submit"
                >
                  Load Shop
                </button>
              </form>
            </div>

            <div className="mt-5">
              {selected && data.shopData ? (
                isScopeConflict(data.shopData) ? (
                  <>
                    <p className="text-sm font-medium text-gray-900">{selected.domain}</p>
                    <ConflictDetails conflict={data.shopData} />
                  </>
                ) : (
                  <>
                    <div className="mb-5 flex flex-wrap gap-x-6 gap-y-2 rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-700">
                      <span className="font-medium text-gray-900">{selected.domain}</span>
                      <span>
                        <span className="font-medium text-gray-900">Configuration edit version:</span>{" "}
                        {data.shopData.configuration?.promptEditVersion ?? 1}
                      </span>
                    </div>
                    <PromptEditor
                      key={`${selected.id}:${data.shopData.draft?.id ?? "none"}:${data.shopData.draft?.editVersion ?? 0}`}
                      data={data.shopData}
                      configurationVersion={data.shopData.configuration?.promptEditVersion ?? 1}
                    />
                  </>
                )
              ) : (
                <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-600">
                  Search for and select a Shop to manage Shop Instructions.
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
