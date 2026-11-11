"use client";

import { useState, type ReactNode } from "react";

const tabs = [
  ["billing", "Recovery & billing"],
  ["commerce", "Commerce execution"],
  ["mcp", "MCP service"],
] as const;
type Tab = (typeof tabs)[number][0];

export function PlatformPolicyTabs({ billing, commerce, mcp }: {
  billing: ReactNode;
  commerce: ReactNode;
  mcp: ReactNode;
}) {
  const [active, setActive] = useState<Tab>("billing");
  const panels: Record<Tab, ReactNode> = { billing, commerce, mcp };
  return <div className="space-y-5">
    <div role="tablist" aria-label="Platform policy sections" className="flex flex-wrap gap-2 border-b border-gray-200 pb-3">
      {tabs.map(([key, label]) => <button key={key} type="button" role="tab" id={`platform-policy-tab-${key}`}
        aria-controls={`platform-policy-panel-${key}`} aria-selected={active === key} tabIndex={active === key ? 0 : -1}
        onClick={() => setActive(key)} className={`rounded-md px-4 py-2 text-sm font-semibold ${active === key ? "bg-[var(--brand-700)] text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>
        {label}
      </button>)}
    </div>
    {tabs.map(([key]) => <div key={key} role="tabpanel" id={`platform-policy-panel-${key}`}
      aria-labelledby={`platform-policy-tab-${key}`} hidden={active !== key}>
      {panels[key]}
    </div>)}
  </div>;
}
