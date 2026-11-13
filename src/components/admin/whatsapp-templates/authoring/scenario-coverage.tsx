import type { ScenarioCoverage } from "@/lib/admin/whatsapp-templates/authoring/coverage";
export function ScenarioCoverageSummary({ rows, dynamicLayouts = [] }: { rows: ScenarioCoverage[]; dynamicLayouts?: Array<{ audience: string; selection: string }> }) {
  return <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5" aria-label="Recovery scenario coverage">
    <h2 className="text-lg font-semibold">Recovery scenarios</h2>
    <p className="text-sm text-slate-600">Initial and follow-up messages need Meta approval and a shop assignment. Follow-up templates also serve eligible human messages outside the reply window. Several saved versions still represent one scenario.</p>
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>Scenario</th><th>Saved versions</th><th>Reviewed locales</th><th>Meta approvals</th><th>Shop assignments</th></tr></thead><tbody>
      {rows.map(row => <tr key={row.id} className="border-t"><th className="py-3 font-medium">{row.label}<span className="block text-xs font-normal text-slate-500">{row.targets.map(target => target === "NONE" ? "No offer" : target === "CHECKOUT" ? "Checkout" : target === "ALTERNATIVE_PRODUCT" ? "Different product" : target).join(", ") || "No saved target"}</span></th>
        <td>{row.definitions || "Missing"}</td><td>{row.reviewedLocales}</td><td>{row.approvedRegistrations}</td><td>{row.assignedVariants || "Not assigned"}</td></tr>)}
    </tbody></table></div>
    <p className="text-xs text-slate-500">Counts span versions, languages and shops; they do not mean every shop has every language. Review each publication before assigning it.</p>
    <h3 className="font-semibold">AI and human conversations</h3>
    <p className="text-sm text-slate-600">Product answers, ordinary replies and service outcomes use the common dynamic layout within the permitted reply window. They are not additional Meta recovery scenarios.</p>
    <ul className="text-sm">{dynamicLayouts.map(row => <li key={row.audience}>{row.audience === "SHARED" ? "Shared" : row.audience === "HUMAN" ? "Human" : "AI"}: {row.selection}</li>)}</ul>
    <a className="text-sm text-blue-800 underline" href="/system-controls/whatsapp-templates/wrappers">Review active AI, human and shared layouts</a>
  </section>;
}
