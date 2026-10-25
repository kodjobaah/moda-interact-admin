"use client";

import type { WrapperNode } from "@/lib/admin/whatsapp-templates/authoring/types";
import { removeNode, replaceNode } from "@/lib/admin/whatsapp-templates/authoring/draft-operations";

export function TemplateNodeEditor<T extends WrapperNode>({ title, nodes, onChange, allowedText = true }: {
  title: string; nodes: T[]; onChange: (nodes: T[]) => void; allowedText?: boolean;
}) {
  return <section className="space-y-2" aria-label={`${title} nodes`}>
    <div className="flex items-center justify-between gap-2"><h3 className="font-medium">{title}</h3>
      {allowedText && <button type="button" className="rounded border px-2 py-1 text-xs hover:bg-gray-50" onClick={() => onChange([...nodes, { type: "text", value: "" } as T])}>+ Text</button>}
    </div>
    {nodes.length === 0 && <p className="text-xs text-gray-500">No {title.toLowerCase()} content.</p>}
    {nodes.map((node, index) => <div key={`${title}-${index}`} className="flex min-w-0 items-start gap-2">
      {node.type === "text" ? <textarea aria-label={`${title} text ${index + 1}`} rows={2} value={node.value} className="min-w-0 flex-1 rounded border p-2 text-sm" onChange={(e) => onChange(replaceNode(nodes, index, { type: "text", value: e.target.value } as T))} />
        : <div className="min-w-0 flex-1 rounded-md bg-blue-50 px-3 py-2 text-sm font-medium text-blue-900" aria-label={`${node.type === "slot" ? "Response slot" : "Variable"}: ${node.name}`}>
          {node.type === "slot" ? "Response: response.body (required)" : `Variable: ${node.name}`}
        </div>}
      {node.type !== "slot" && <button type="button" aria-label={`Remove ${title} node ${index + 1}`} className="rounded border px-2 py-1 text-xs text-red-700" onClick={() => onChange(removeNode(nodes, index))}>Remove</button>}
    </div>)}
  </section>;
}
