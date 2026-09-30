"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { mutateAgentInstructionsAction } from "@/app/actions/agent-instructions";
import type { getAgentInstructionsData } from "@/lib/admin/agent-instructions";

type Data = Awaited<ReturnType<typeof getAgentInstructionsData>>;
type ScopeData = NonNullable<Data["platform"]>;

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
          <label className="block text-sm font-medium text-gray-700">
            Draft prompt, canonical English
            <textarea
              className={inputClass}
              name="promptText"
              rows={14}
              maxLength={100_000}
              value={promptText}
              onChange={(event) => setPromptText(event.currentTarget.value)}
              required
            />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Audit reason
            <input className={inputClass} name="reason" maxLength={1000} required />
          </label>
          <button className="rounded-md bg-[var(--brand-700)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-800)]" type="submit">
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

export function AgentInstructionsConsole({ data }: { data: Data }) {
  const selected = data.selectedShop;
  const configurationVersion = data.shopData?.configuration?.promptEditVersion ?? 1;
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--brand-900)]">Agent Instructions</h1>
        <p className="mt-1 text-sm text-gray-600">Canonical-English Platform and Shop prompt revisions for {data.environment}.</p>
      </div>
      <div className="grid gap-8 xl:grid-cols-2">
        <section className="min-w-0">
          <h2 className="text-lg font-semibold text-gray-900">Platform Instructions</h2>
          <p className="mt-1 text-xs text-gray-500">Active revision: {data.platform?.active?.revisionNumber ?? "None"} · Configuration edit version: {data.platform?.configuration?.promptEditVersion ?? 1}</p>
          {data.platform ? <PromptEditor key={`${data.platform.draft?.id ?? "none"}:${data.platform.draft?.editVersion ?? 0}`} data={data.platform} configurationVersion={data.platform.configuration?.promptEditVersion ?? 1} /> : null}
        </section>
        <section className="min-w-0">
          <h2 className="text-lg font-semibold text-gray-900">Shop Instructions</h2>
          <form className="my-4 grid gap-3 border-y border-gray-200 py-4 sm:grid-cols-[minmax(0,1fr)_auto]" action="/system-controls/agent-instructions" method="get">
            <label className="text-sm font-medium text-gray-700">Search shops by domain or exact ID
              <input className={inputClass} name="q" defaultValue="" list="agent-instructions-shops" />
              <datalist id="agent-instructions-shops">{data.shops.map((shop) => <option key={shop.id} value={shop.domain}>{shop.id}</option>)}</datalist>
            </label>
            <label className="text-sm font-medium text-gray-700">Selected Shop
              <select className={inputClass} name="shop" defaultValue={selected?.id ?? ""}>
                {data.shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.domain}</option>)}
                {selected && !data.shops.some((shop) => shop.id === selected.id) ? <option value={selected.id}>{selected.domain}</option> : null}
              </select>
            </label>
            <button className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold sm:col-span-2 sm:justify-self-end" type="submit">Load Shop</button>
          </form>
          {selected && data.shopData ? <>
            <p className="mb-3 text-xs text-gray-500">{selected.domain} · Configuration edit version: {configurationVersion}</p>
            <PromptEditor key={`${selected.id}:${data.shopData.draft?.id ?? "none"}:${data.shopData.draft?.editVersion ?? 0}`} data={data.shopData} configurationVersion={configurationVersion} />
          </> : <p className="border-y border-gray-200 py-6 text-sm text-gray-600">Search for and select a Shop to manage Shop Instructions.</p>}
        </section>
      </div>
    </>
  );
}