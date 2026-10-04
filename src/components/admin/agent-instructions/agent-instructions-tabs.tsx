"use client";

export type AgentInstructionsTab = "platform" | "shop";

type AgentInstructionsTabsProps = {
  activeTab: AgentInstructionsTab;
  onChange: (tab: AgentInstructionsTab) => void;
};

const tabs: Array<{
  id: AgentInstructionsTab;
  label: string;
  description: string;
}> = [
  {
    id: "platform",
    label: "Platform Instructions",
    description: "Default instructions shared across the platform.",
  },
  {
    id: "shop",
    label: "Shop Instructions",
    description: "Instructions scoped to an individual shop.",
  },
];

export function AgentInstructionsTabs({
  activeTab,
  onChange,
}: AgentInstructionsTabsProps) {
  return (
    <div className="border-b border-gray-200" role="tablist" aria-label="Agent Instructions scope">
      <div className="flex flex-wrap gap-1">
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`agent-instructions-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`agent-instructions-panel-${tab.id}`}
              tabIndex={active ? 0 : -1}
              className={`min-w-0 border-b-2 px-4 py-3 text-left transition-colors ${
                active
                  ? "border-[var(--brand-700)] text-[var(--brand-900)]"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-800"
              }`}
              onClick={() => onChange(tab.id)}
            >
              <span className="block text-sm font-semibold">{tab.label}</span>
              <span className="mt-0.5 block text-xs font-normal text-gray-500">
                {tab.description}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
