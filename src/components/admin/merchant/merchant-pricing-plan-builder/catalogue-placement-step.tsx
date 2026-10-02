import type { MerchantPricingPlanWithChildren } from "@/lib/admin/merchant/pricing-plan";
import type { MerchantPricingPlanDraftController } from "./use-merchant-pricing-plan-draft";

const inputClass =
  "w-full rounded-md border border-gray-300 bg-white p-2 text-sm";

type Controller = MerchantPricingPlanDraftController;

type CataloguePlacementStepProps = {
  cataloguePlans: Array<Pick<MerchantPricingPlanWithChildren, "id" | "displayName">>;
  isEditing: boolean;
  cataloguePosition: number | null;
  planKind: Controller["draft"]["planKind"];
  effectivePlacement: Controller["selectors"]["effectivePlacement"];
  setPlacement: Controller["actions"]["setPlacement"];
};

export function CataloguePlacementStep({
  cataloguePlans,
  isEditing,
  cataloguePosition,
  planKind,
  effectivePlacement,
  setPlacement,
}: CataloguePlacementStepProps) {
  return (
    <section className="space-y-3">
      <label className="text-sm font-medium text-gray-700">
        Where should this plan appear?
        <p className="mt-1 font-normal text-gray-600">
          Choose where this plan should appear in the pricing list merchants
          see. This order is also used when Moda compares this plan with the
          other plans.
        </p>
      </label>
      <select
        className={inputClass}
        value={effectivePlacement}
        disabled={isEditing || planKind === "FREE"}
        onChange={(event) => setPlacement(event.target.value)}
      >
        {isEditing ? (
          <option value="UNCHANGED">Keep current position</option>
        ) : !cataloguePlans.length ? (
          <option value="ONLY">This will be the first plan.</option>
        ) : planKind === "FREE" ? (
          <option value={`BEFORE:${cataloguePlans[0].id}`}>
            First — before {cataloguePlans[0].displayName}
          </option>
        ) : (
          cataloguePlans.map((cataloguePlan) => (
            <option
              key={cataloguePlan.id}
              value={`AFTER:${cataloguePlan.id}`}
            >
              After {cataloguePlan.displayName}
            </option>
          ))
        )}
      </select>
      {!isEditing && planKind === "FREE" && cataloguePlans.length ? (
        <p className="text-sm text-gray-600">
          The FREE plan must be the first plan in the catalogue, so it will
          be inserted before {cataloguePlans[0].displayName}.
        </p>
      ) : null}
      {isEditing ? (
        <p className="text-sm text-gray-600">
          Current position: {cataloguePosition}
        </p>
      ) : null}
    </section>
  );
}