import { formatEditorNodes } from "@/lib/admin/whatsapp-templates/authoring/draft-operations";
import type { TemplateAst, PreparedTemplate, WrapperNode } from "@/lib/admin/whatsapp-templates/authoring/types";
import type { ReviewLocaleDTO } from "@/lib/admin/whatsapp-templates/compilation/contracts";

function sections(ast: TemplateAst): Array<{ key: string; text: string }> {
  const values = [
    { key: "Header", text: formatEditorNodes(ast.header) },
    { key: "Body", text: formatEditorNodes(ast.body) },
    { key: "Footer", text: formatEditorNodes(ast.footer) },
  ];
  if (ast.family === "META_RECOVERY") return [...values, ...ast.buttons.map((b, i) => ({ key: `Button ${i + 1}`,
    text: `${b.label} | ${b.urlPrefix}${b.variable ? `{{${b.variable}}}` : ""}` }))];
  return [...values, ...ast.conditionals.map((c, i) => ({ key: `Conditional ${i + 1} (${c.when})`, text: formatEditorNodes(c.nodes) }))];
}

function names(ast: TemplateAst): Array<{ place: string; name: string }> {
  const locations: Array<{ place: string; nodes: WrapperNode[] }> = [
    { place: "Header", nodes: ast.header }, { place: "Body", nodes: ast.body }, { place: "Footer", nodes: ast.footer },
    ...(ast.family === "MODA_CONVERSATION_WRAPPER" ? ast.conditionals.map((c, i) => ({ place: `Conditional ${i + 1}`, nodes: c.nodes })) : []),
  ];
  return locations.flatMap((entry) => entry.nodes.filter((node) => node.type === "variable").map((node) => ({ place: entry.place, name: node.name })));
}

function bindings(prepared: PreparedTemplate | null): string[] {
  if (!prepared) return [];
  if (prepared.family === "MODA_CONVERSATION_WRAPPER") {
    return ["header", "body", "footer", ...prepared.conditionals.map((_, i) => `conditional.${i}`)].flatMap((field) => {
      const tokens = field === "header" ? prepared.header : field === "body" ? prepared.body : field === "footer" ? prepared.footer
        : prepared.conditionals[Number(field.split(".")[1])].tokens;
      return tokens.flatMap((token) => token.kind === "variable" ? [`${field}: ${token.name}`] : []);
    });
  }
  return [...(prepared.parameterBindings.header ?? []).map((v) => `header {{${v.position}}} = ${v.variable}`),
    ...prepared.parameterBindings.body.map((v) => `body {{${v.position}}} = ${v.variable}`),
    ...prepared.parameterBindings.buttons.map((v) => `button ${v.index + 1} = ${v.variable}`)];
}

export function ComponentAndVariableDiff({ source, translation }: { source: ReviewLocaleDTO; translation: ReviewLocaleDTO }) {
  const english = source.authoring ? sections(source.authoring) : [];
  const target = translation.authoring ? sections(translation.authoring) : [];
  return <section className="space-y-4 rounded-lg border bg-white p-4" aria-label="Components and protected variable comparison">
    <h2 className="font-semibold">Component and protected-variable comparison</h2>
    {english.map(({ key, text }) => <div key={key} className="grid gap-2 border-t pt-3 text-sm md:grid-cols-2">
      <div><p className="font-semibold">{key} — English</p><pre className="mt-1 whitespace-pre-wrap break-all font-sans">{text || "(empty)"}</pre></div>
      <div><p className="font-semibold">{key} — {translation.languageTag}</p><pre className="mt-1 whitespace-pre-wrap break-all font-sans">{target.find((v) => v.key === key)?.text ?? "Not available"}</pre></div>
    </div>)}
    <div className="grid gap-4 border-t pt-3 text-sm md:grid-cols-2">
      <div><h3 className="font-semibold">Source semantic keys</h3>
        <ul className="mt-1 list-disc pl-5">{source.authoring && names(source.authoring).map((v, i) => <li key={i}>{v.place}: <code>{v.name}</code></li>)}</ul></div>
      <div><h3 className="font-semibold">Compiled target bindings</h3>
        <ul className="mt-1 list-disc pl-5">{bindings(translation.prepared).map((v, i) => <li key={i}><code className="break-all">{v}</code></li>)}</ul>
        {translation.contentHash && <p className="mt-3 break-all text-xs text-slate-600">Content SHA-256: {translation.contentHash}</p>}</div>
    </div>
  </section>;
}
