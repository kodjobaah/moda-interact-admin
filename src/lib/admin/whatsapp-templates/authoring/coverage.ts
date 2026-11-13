import { RECOVERY_SCENARIOS } from "./scenarios";
export type ScenarioCoverage = { id: string; label: string; definitions: number; reviewedLocales: number; approvedRegistrations: number; assignedVariants: number; targets: string[] };
export type CoverageRow = { purpose: string | null; offerType: string | null; definitions: number; reviewedLocales: number; approvedRegistrations: number; assignedVariants: number; targets: string[] | null };
/** Versions never count as new scenarios; saved sources are not proof of provider approval or tenant assignment. */
export function scenarioCoverage(rows: CoverageRow[]): ScenarioCoverage[] {
  return RECOVERY_SCENARIOS.map(scenario => {
    const row = rows.find(item => `${item.purpose}_${item.offerType}` === scenario.id);
    return { id: scenario.id, label: scenario.label, definitions: row?.definitions ?? 0, reviewedLocales: row?.reviewedLocales ?? 0,
      approvedRegistrations: row?.approvedRegistrations ?? 0, assignedVariants: row?.assignedVariants ?? 0, targets: row?.targets?.filter(Boolean) ?? [] };
  });
}
