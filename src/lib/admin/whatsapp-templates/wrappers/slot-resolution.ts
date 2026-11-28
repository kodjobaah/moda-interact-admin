import { checkWrapperEligibility } from "./eligibility";
import {
  WRAPPER_AUDIENCES,
  type Audience,
  type WrapperDefinitionRow,
  type WrapperSlot,
} from "./contracts";

type ActivePointer = {
  audience: string;
  definitionId: string;
  editVersion: number;
  updatedAt: Date;
};

/** An existing invalid pointer is a refusal, never an absent slot or a fallback opportunity. */
export function resolveWrapperSlots(
  active: ActivePointer[],
  definitions: WrapperDefinitionRow[],
): WrapperSlot[] {
  const byAudience = new Map(active.map((slot) => [slot.audience, slot]));
  const byId = new Map(
    definitions.map((definition) => [definition.id, definition]),
  );
  const shared = byAudience.get("SHARED");
  return WRAPPER_AUDIENCES.map((target) => {
    const own = byAudience.get(target);
    const fallbackAllowed = target === "AI" || target === "HUMAN";
    const effective = own ?? (fallbackAllowed ? shared : undefined);
    const effectiveFrom: Audience | null = own
      ? target
      : shared && fallbackAllowed
        ? "SHARED"
        : null;
    const definition = effective ? byId.get(effective.definitionId) : undefined;
    const eligibility =
      definition && effectiveFrom
        ? checkWrapperEligibility(definition, effectiveFrom)
        : null;
    const refusalReason = effective
      ? !eligibility
        ? "Configured definition is missing or unavailable."
        : !eligibility.eligible
          ? eligibility.reason
          : null
      : null;
    return {
      audience: target,
      definitionId: own?.definitionId ?? null,
      editVersion: own?.editVersion ?? null,
      updatedAt: own?.updatedAt.toISOString() ?? null,
      effectiveDefinitionId: effective?.definitionId ?? null,
      effectiveFrom,
      refusalReason,
    };
  });
}
