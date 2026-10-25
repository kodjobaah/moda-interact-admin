"use client";

import { SHOP_BRAND_VARIABLES, VARIABLE_REGISTRY } from "@/lib/admin/whatsapp-templates/authoring/registry";
import type { SemanticVariable } from "@/lib/admin/whatsapp-templates/authoring/types";

/** A focused inline palette; brand fields live in an expandable group to avoid overwhelming the composer. */
export function TemplateVariablePalette({ variables, onInsert }: {
  variables: readonly SemanticVariable[];
  onInsert: (name: SemanticVariable) => void;
}) {
  if (!variables.length) return null;
  const brandNames = new Set<SemanticVariable>(SHOP_BRAND_VARIABLES);
  const primary = variables.filter((name) => !brandNames.has(name));
  const brand = variables.filter((name) => brandNames.has(name));
  const buttons = (values: readonly SemanticVariable[]) => values.map((name) => <button key={name} type="button"
    title={`${name}${VARIABLE_REGISTRY[name].sourceField ? ` · ${VARIABLE_REGISTRY[name].sourceField}` : ""}`}
    onMouseDown={(event) => event.preventDefault()}
    onClick={() => onInsert(name)}
    className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-800 hover:bg-blue-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700">
    + {VARIABLE_REGISTRY[name].label}
  </button>);
  return <div className="space-y-2" aria-label="Insert a variable at cursor">
    {!!primary.length && <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-slate-600">Insert variable:</span>
      {buttons(primary)}
    </div>}
    {!!brand.length && <details className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <summary className="cursor-pointer text-xs font-semibold text-slate-700">ShopBrand fields ({brand.length})</summary>
      <p className="my-2 text-xs text-slate-600">Merchant-specific values are substituted when sending. Image URLs appear as text links, not attached images; fields without a value cannot be sent.</p>
      <div className="flex flex-wrap gap-2">{buttons(brand)}</div>
    </details>}
  </div>;
}
