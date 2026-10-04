export const STORE_CATEGORY_AUTHORING_INPUT_CLASS =
  "mt-1 w-full rounded-md border border-gray-300 bg-white p-2 text-sm outline-none focus:border-[var(--brand-500)] focus:ring-2 focus:ring-[var(--brand-200)]";

export function StoreCategoryAuthoringErrorList({
  issues,
}: {
  issues: string[];
}) {
  if (issues.length === 0) return null;
  return (
    <ul className="mt-3 space-y-1 text-sm text-amber-800" role="status">
      {issues.map((issue) => (
        <li key={issue}>• {issue}</li>
      ))}
    </ul>
  );
}

export function StoreCategoryAuthoringSectionStatus({
  valid,
}: {
  valid: boolean;
}) {
  return (
    <span
      className={`rounded-full px-2 py-1 text-xs font-medium ${
        valid ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
      }`}
    >
      {valid ? "Complete" : "Needs attention"}
    </span>
  );
}
