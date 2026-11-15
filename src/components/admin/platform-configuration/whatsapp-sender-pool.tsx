"use client";
import { useState, useTransition } from "react";
import { tAdmin } from "@/i18n";
import type { PoolAction, PoolCode, PoolRow } from "@/lib/admin/platform-configuration/whatsapp-sender-pool-types";

type Result = { ok: true; row: PoolRow } | { ok: false; code: PoolCode };
export function WhatsAppSenderPool({ providerAccountId, rows: initialRows, mutateAction }: {
  providerAccountId: string | null; rows: PoolRow[]; mutateAction: (input: PoolAction) => Promise<Result>;
}) {
  const [rows, setRows] = useState(initialRows);
  const [phone, setPhone] = useState(""); const [priority, setPriority] = useState("0");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [error, setError] = useState<PoolCode | null>(null); const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const submit = (action: PoolAction) => startTransition(async () => {
    setError(null); setSaved(false);
    try {
      const result = await mutateAction(action);
      if (!result.ok) { setError(result.code); return; }
      setRows(current => [...current.filter(row => row.providerPhoneNumberId !== result.row.providerPhoneNumberId), result.row]
        .sort((a,b) => a.priority-b.priority || (a.providerPhoneNumberId < b.providerPhoneNumberId ? -1 : a.providerPhoneNumberId > b.providerPhoneNumberId ? 1 : 0)));
      setEdits(current => ({ ...current, [result.row.providerPhoneNumberId]: String(result.row.priority) }));
      setSaved(true);
    } catch { setError("DB_UNAVAILABLE"); }
  });
  return <section aria-label={tAdmin("senderPool.title")} className="space-y-4 rounded-xl border bg-white p-5">
    <h2 className="text-lg font-semibold">{tAdmin("senderPool.title")}</h2>
    <p>{tAdmin("senderPool.account")}: <strong>{providerAccountId ?? tAdmin("senderPool.configurationRequired")}</strong></p>
    <p className="text-sm text-slate-600">{tAdmin("senderPool.help")}</p>
    <p className="text-sm text-slate-600">{tAdmin("senderPool.cutover")}</p>
    {!providerAccountId && <p role="status" className="text-sm text-amber-800">{tAdmin("senderPool.missingConfiguration")}</p>}
    {error && <p role="alert" className="text-sm text-red-700">{tAdmin(`senderPool.error.${error}`)}</p>}
    {saved && <p role="status" className="text-sm text-green-800">{tAdmin("senderPool.saved")}</p>}
    <form className="flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); submit({ op: "enrol", providerPhoneNumberId: phone, priority: Number(priority) }); }}>
      <label className="text-sm">{tAdmin("senderPool.phoneId")}<input aria-label={tAdmin("senderPool.phoneId")} className="mt-1 block rounded border p-2" inputMode="numeric" pattern="[0-9]{4,32}" required maxLength={32} value={phone} onChange={event => setPhone(event.target.value)} /></label>
      <label className="text-sm">{tAdmin("senderPool.priority")}<input aria-label={tAdmin("senderPool.priority")} className="mt-1 block w-36 rounded border p-2" type="number" min={0} max={2147483647} step={1} required value={priority} onChange={event => setPriority(event.target.value)} /></label>
      <button disabled={pending || !providerAccountId} className="rounded bg-blue-800 px-4 py-2 text-white disabled:opacity-50">{tAdmin("senderPool.enrol")}</button>
    </form>
    <p className="text-xs text-slate-600">{tAdmin("senderPool.phoneIdHelp")}</p>
    {rows.length === 0 ? <p>{tAdmin("senderPool.empty")}</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm">
      <thead><tr><th>{tAdmin("senderPool.phoneId")}</th><th>{tAdmin("senderPool.account")}</th><th>{tAdmin("senderPool.priority")}</th><th>{tAdmin("senderPool.status")}</th><th>{tAdmin("senderPool.actions")}</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.providerPhoneNumberId} className="border-t">
        <td className="p-2 font-mono">{row.providerPhoneNumberId}</td><td className="p-2 font-mono">{row.providerAccountId}</td>
        <td className="p-2"><input aria-label={`${tAdmin("senderPool.priority")} ${row.providerPhoneNumberId}`} type="number" min={0} max={2147483647} step={1} value={edits[row.providerPhoneNumberId] ?? String(row.priority)} onChange={event => setEdits({ ...edits, [row.providerPhoneNumberId]: event.target.value })} className="w-28 rounded border p-1" /></td>
        <td className="p-2">{tAdmin(row.allocationEnabled ? "senderPool.enabled" : "senderPool.disabled")}</td>
        <td className="space-x-2 p-2"><button type="button" disabled={pending} className="rounded border p-2" onClick={() => submit({ op: "update", providerPhoneNumberId: row.providerPhoneNumberId, expected: { priority: row.priority, allocationEnabled: row.allocationEnabled }, next: { priority: Number(edits[row.providerPhoneNumberId] === "" ? NaN : edits[row.providerPhoneNumberId] ?? row.priority), allocationEnabled: row.allocationEnabled } })}>{tAdmin("senderPool.savePriority")}</button>
          <button type="button" disabled={pending || !row.allocationEnabled && (!providerAccountId || row.providerAccountId !== providerAccountId)} className="rounded border p-2" onClick={() => submit({ op: "update", providerPhoneNumberId: row.providerPhoneNumberId, expected: { priority: row.priority, allocationEnabled: row.allocationEnabled }, next: { priority: row.priority, allocationEnabled: !row.allocationEnabled } })}>{tAdmin(row.allocationEnabled ? "senderPool.disable" : "senderPool.enable")}</button>
        </td>
      </tr>)}</tbody>
    </table></div>}
    <p className="text-xs text-slate-600">{tAdmin("senderPool.activePoolHelp")}</p>
  </section>;
}
