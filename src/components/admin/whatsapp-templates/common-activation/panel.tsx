"use client";
import { useState } from "react";
import {
  previewWhatsAppCommonActivation,
  confirmWhatsAppCommonActivation,
} from "@/app/actions/whatsapp-common-activation";
import type { CommonActivationPreview } from "@/lib/admin/whatsapp-templates/common-activation/contracts";
export type CommonActivationOptions = {
  common: Array<{ id: string; label: string }>;
  templates: Array<{
    id: string;
    label: string;
    purpose: string;
    format: string;
    commonDefinitionId: string | null;
  }>;
  slots: Array<{
    shopId: string;
    domain: string;
    purpose: string;
    format: string;
    dimension: string;
  }>;
  defaults: Array<{
    id: string;
    wabaId: string;
    purpose: string;
    format: string;
    definitionId: string;
    name: string | null;
  }>;
};
export function CommonActivationPanel({
  options,
}: {
  options: CommonActivationOptions;
}) {
  const [common, setCommon] = useState("");
  const [chosenDefaults, setChosenDefaults] = useState<Record<string, string>>(
    {},
  );
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<CommonActivationPreview | null>(null);
  const [reason, setReason] = useState("");
  const [approved, setApproved] = useState(false);
  const [deployed, setDeployed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [operationKey, setOperationKey] = useState("");
  const changed = () => {
    setPreview(null);
    setApproved(false);
    setDeployed(false);
    setOperationKey("");
  };
  async function review() {
    setBusy(true);
    setMessage("");
    try {
      const replacements = Object.entries(chosen).reduce<
        Array<{ definitionId: string; shopIds: string[] }>
      >((rows, [slotId, definitionId]) => {
        if (!definitionId) return rows;
        const slot = options.slots[Number(slotId)];
        const row = rows.find((r) => r.definitionId === definitionId);
        if (row) {
          if (!row.shopIds.includes(slot.shopId)) row.shopIds.push(slot.shopId);
        } else rows.push({ definitionId, shopIds: [slot.shopId] });
        return rows;
      }, []);
      const defaultReplacements = options.defaults.map((slot) => ({
        defaultId: slot.id,
        definitionId: chosenDefaults[slot.id],
      }));
      const result = await previewWhatsAppCommonActivation({
        commonDefinitionId: common,
        replacements,
        defaultReplacements,
      });
      if (result.ok) {
        setPreview(result.preview);
        setOperationKey(crypto.randomUUID());
      } else setMessage(result.message);
    } finally {
      setBusy(false);
    }
  }
  async function activate() {
    if (!preview || !approved || !deployed) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await confirmWhatsAppCommonActivation({
        selection: preview.selection,
        issuedAt: preview.issuedAt,
        fingerprint: preview.fingerprint,
        operationKey,
        reason,
        acknowledgeOverrides: true,
        consumerDeploymentConfirmed: true,
        englishContentReviewed: true,
      });
      setMessage(
        result.ok
          ? `Common layout activated for ${result.result.targetCount} language assignments${result.result.replay ? " (already completed)" : ""}.`
          : result.message,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-5">
      <p>
        Switch the common shop layout, configured platform defaults and every
        existing recovery template together. This does not register templates
        with Meta or add offer types. Inactive shops remain inactive.
      </p>
      <label className="block">
        Common shop layout
        <select
          className="mt-1 block w-full rounded border p-2"
          value={common}
          onChange={(e) => {
            setCommon(e.target.value);
            setChosen({});
            setChosenDefaults({});
            changed();
          }}
        >
          <option value="">Choose a reviewed revision</option>
          {options.common.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      {options.slots.map((slot, index) => (
        <label
          key={`${slot.shopId}:${slot.purpose}:${slot.dimension}`}
          className="block"
        >
          {slot.domain} — {slot.purpose.replaceAll("_", " ")} — {slot.dimension}
          <select
            className="mt-1 block w-full rounded border p-2"
            value={chosen[index] ?? ""}
            onChange={(e) => {
              setChosen({ ...chosen, [index]: e.target.value });
              changed();
            }}
          >
            <option value="">Choose an approved replacement</option>
            {options.templates
              .filter(
                (t) =>
                  t.purpose === slot.purpose &&
                  t.format === slot.format &&
                  t.commonDefinitionId === common,
              )
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
          </select>
        </label>
      ))}
      {!options.slots.length && (
        <p>
          No existing recovery templates are assigned. No merchant assignments
          will be created by this activation.
        </p>
      )}
      {options.defaults.length > 0 && (
        <section className="space-y-3 border-t pt-4">
          <h2 className="font-semibold">Configured platform defaults</h2>
          <p>
            Choose a compatible, Meta-approved replacement for each existing
            default. Defaults are switched in the same transaction even when
            there are no shops.
          </p>
          {options.defaults.map((slot) => (
            <label key={slot.id} className="block">
              {slot.purpose.replaceAll("_", " ")} · {slot.format} · WABA{" "}
              {slot.wabaId}
              <span className="block text-sm text-slate-600">
                Current: {slot.name ?? slot.definitionId}
              </span>
              <select
                className="mt-1 block w-full rounded border p-2"
                value={chosenDefaults[slot.id] ?? ""}
                onChange={(e) => {
                  setChosenDefaults({
                    ...chosenDefaults,
                    [slot.id]: e.target.value,
                  });
                  changed();
                }}
              >
                <option value="">Choose a replacement for this default</option>
                {options.templates
                  .filter(
                    (t) =>
                      t.purpose === slot.purpose &&
                      t.format === slot.format &&
                      t.commonDefinitionId === common,
                  )
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
              </select>
            </label>
          ))}
          <p className="text-sm text-slate-600">
            Only candidates linked to the selected revision are listed. Review
            validates all 20 registrations, exact locale content and WABA; a
            listed candidate is not proof of approval.
          </p>
        </section>
      )}
      {!options.slots.length && !options.defaults.length && (
        <p>
          This activation changes only the common layout; no new defaults,
          offers or assignments are created.
        </p>
      )}
      <button
        className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
        disabled={
          busy ||
          !common ||
          options.slots.some((_, i) => !chosen[i]) ||
          options.defaults.some((slot) => !chosenDefaults[slot.id])
        }
        onClick={review}
      >
        Review complete impact
      </button>
      {preview && (
        <div className="space-y-4 border-t pt-4">
          <h2 className="text-lg font-semibold">Complete activation review</h2>
          <p>
            {preview.shops.length} shops, {preview.variants.length} existing
            assignments and {preview.targetCount} replacement languages. The
            shared layout takes priority for recovery AI and human replies;
            historical audience layouts are retained.
          </p>
          <p>
            Current common revision:{" "}
            {preview.expectedSharedPointer
              ? `version ${preview.expectedSharedPointer.editVersion}`
              : "none"}
            . Supported scenarios not included:{" "}
            {preview.missingScenarios
              .map((s) => s.replaceAll("_", " "))
              .join(", ") || "none"}
            . Their eligibility is unchanged.
          </p>
          {(preview.defaults ?? []).length > 0 && (
            <section className="space-y-3">
              <h3 className="font-semibold">
                Platform default replacements ({preview.defaults?.length})
              </h3>
              {preview.defaults?.map((item) => (
                <details key={item.defaultId}>
                  <summary>
                    {item.purpose} · {item.format ?? "Historical"} · WABA{" "}
                    {item.wabaId}:{" "}
                    {item.previousTemplateName ?? item.previousDefinitionId} →{" "}
                    {item.source.name}
                  </summary>
                  {item.source.locales.map((locale) => (
                    <div
                      key={locale.languageTag}
                      className="my-3 rounded bg-slate-50 p-3"
                    >
                      <strong>
                        {locale.languageTag} · {item.source.headerKind}
                      </strong>
                      <pre className="whitespace-pre-wrap font-sans">
                        {[
                          locale.view.header,
                          locale.view.body,
                          locale.view.footer,
                        ]
                          .filter(Boolean)
                          .join("\n")}
                      </pre>
                    </div>
                  ))}
                </details>
              ))}
            </section>
          )}
          {preview.definitions.map((item) => (
            <details key={item.source.id}>
              <summary>
                {item.source.name} — {item.shopIds.length} shops, 20 languages
              </summary>
              {item.source.locales.map((locale) => (
                <div
                  key={locale.languageTag}
                  className="my-3 rounded bg-slate-50 p-3"
                >
                  <strong>{locale.languageTag}</strong>
                  <pre className="whitespace-pre-wrap font-sans">
                    {locale.view.body}
                  </pre>
                </div>
              ))}
            </details>
          ))}
          <details>
            <summary>
              Review every previous and replacement media/target slot
            </summary>
            <ul>
              {preview.variants.map((v) => (
                <li key={v.id}>
                  {preview.shops.find((s) => s.id === v.shopId)?.domain} ·{" "}
                  {v.purpose} · {v.languageTag} · {v.previousHeader} →{" "}
                  {v.proposedHeader} · {v.promotionTarget} ·{" "}
                  {v.customerName
                    ? "personalized greeting"
                    : "general greeting"}
                </li>
              ))}
            </ul>
          </details>
          <label className="block">
            <input
              type="checkbox"
              checked={approved}
              onChange={(e) => setApproved(e.target.checked)}
            />{" "}
            I reviewed the exact English content and approved registration for
            each replacement, all language replacements, media changes, platform
            default replacements and merchant overrides.
          </label>
          <label className="block">
            <input
              type="checkbox"
              checked={deployed}
              onChange={(e) => setDeployed(e.target.checked)}
            />{" "}
            Compatible message consumers are deployed and predecessor instances
            have drained.
          </label>
          <label className="block">
            Reason
            <textarea
              className="mt-1 block w-full rounded border p-2"
              value={reason}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button
            className="rounded bg-indigo-700 px-4 py-2 text-white disabled:opacity-50"
            disabled={
              busy || !approved || !deployed || reason.trim().length < 10
            }
            onClick={activate}
          >
            Activate reviewed common layout
          </button>
        </div>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
