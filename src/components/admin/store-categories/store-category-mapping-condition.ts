import { StoreCategoryPromptConditionKeySchema } from "@modainteract/moda-interact-shared/commerce";

const MAX_CONDITION_KEY_LENGTH = 128;

function normalizedBase(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^[^a-z]+/, "");
  return normalized.slice(0, MAX_CONDITION_KEY_LENGTH).replace(/_+$/g, "");
}

export function suggestStoreCategoryMappingConditionKey(
  label: string,
  usedKeys: Iterable<string>,
): string {
  const used = new Set(Array.from(usedKeys, (entry) => entry.trim()).filter(Boolean));
  let base = normalizedBase(label);
  if (!base || !StoreCategoryPromptConditionKeySchema.safeParse(base).success) {
    base = "mapping";
  }

  if (!used.has(base)) return base;
  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const suffixText = `_${suffix}`;
    const candidate = `${base.slice(0, MAX_CONDITION_KEY_LENGTH - suffixText.length).replace(/_+$/g, "")}${suffixText}`;
    if (
      !used.has(candidate) &&
      StoreCategoryPromptConditionKeySchema.safeParse(candidate).success
    ) {
      return candidate;
    }
  }
  throw new Error("Unable to generate a unique mapping condition key.");
}
