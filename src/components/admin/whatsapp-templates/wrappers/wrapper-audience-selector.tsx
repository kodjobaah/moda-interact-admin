import { WRAPPER_AUDIENCES, type Audience } from "@/lib/admin/whatsapp-templates/wrappers/contracts";

const descriptions: Record<Audience, string> = {
  SHARED: "Default for AI and human replies without an override",
  AI: "Optional AI-only override; otherwise uses SHARED",
  HUMAN: "Optional human-only override; otherwise uses SHARED",
};

export function WrapperAudienceSelector({ selected, onSelect }: {
  selected: Audience; onSelect: (audience: Audience) => void;
}) {
  return <section aria-label="Wrapper audience" className="rounded-lg border bg-white p-4">
    <h2 className="mb-3 font-semibold">Activation audience</h2>
    <div className="grid gap-2 sm:grid-cols-3">{WRAPPER_AUDIENCES.map((audience) =>
      <button key={audience} type="button" aria-pressed={audience === selected} onClick={() => onSelect(audience)}
        className={`rounded-md border p-3 text-left ${audience === selected ? "border-blue-700 bg-blue-50" : "border-slate-200"}`}>
        <span className="block font-semibold">{audience}</span><span className="text-xs text-slate-600">{descriptions[audience]}</span>
      </button>)}</div>
  </section>;
}
