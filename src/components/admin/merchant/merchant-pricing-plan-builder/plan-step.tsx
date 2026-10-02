import type {
  MerchantKnowledgeSourceTypeOption,
  MerchantPricingPlanWithChildren,
} from "@/lib/admin/merchant/pricing-plan";
import type { MerchantPricingPlanModelOption } from "@/lib/admin/merchant/pricing-plan-model";
import type { MerchantPricingPlanDraftController } from "./use-merchant-pricing-plan-draft";

const inputClass =
  "w-full rounded-md border border-gray-300 bg-white p-2 text-sm";

type Controller = MerchantPricingPlanDraftController;

type PlanStepProps = {
  plan?: MerchantPricingPlanWithChildren;
  commerceModelOptions: MerchantPricingPlanModelOption[];
  merchantKnowledgeSourceTypes: MerchantKnowledgeSourceTypeOption[];
  draft: Pick<
    Controller["draft"],
    | "name"
    | "handle"
    | "planKind"
    | "isActive"
    | "featured"
    | "commerceModelId"
    | "maxKnowledgeSources"
    | "maxContentUnitsPerSource"
    | "allowedSourceTypeKeys"
    | "credits"
  >;
  actions: Pick<
    Controller["actions"],
    | "setName"
    | "setHandle"
    | "handlePlanKindChange"
    | "setIsActive"
    | "setFeatured"
    | "setCommerceModelId"
    | "setMaxKnowledgeSources"
    | "setMaxContentUnitsPerSource"
    | "setSourceType"
    | "setCredits"
    | "setSupportedFeature"
  >;
  selectors: Pick<
    Controller["selectors"],
    | "freePlanAlreadyExists"
    | "unavailableCommerceModelId"
    | "supportedFeatureControls"
    | "merchantKnowledgeConfigurationValid"
    | "sourceTypeKey"
  >;
};

export function PlanStep({
  plan,
  commerceModelOptions,
  merchantKnowledgeSourceTypes,
  draft,
  actions,
  selectors,
}: PlanStepProps) {
  const { unavailableCommerceModelId } = selectors;

  return (
    <>
      <section className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-gray-700">
          Shopify plan handle
          <input
            className={inputClass}
            value={draft.handle}
            readOnly={Boolean(plan)}
            onChange={(event) => actions.setHandle(event.target.value)}
          />
        </label>
        <label className="text-sm font-medium text-gray-700">
          Display name
          <input
            className={inputClass}
            value={draft.name}
            onChange={(event) => actions.setName(event.target.value)}
          />
        </label>
        <label className="text-sm font-medium text-gray-700 sm:col-span-2">
          Commerce model
          <select
            className={inputClass}
            value={draft.commerceModelId}
            onChange={(event) =>
              actions.setCommerceModelId(event.target.value || "")
            }
          >
            <option value="">Use Platform default</option>
            {unavailableCommerceModelId ? (
              <option value={unavailableCommerceModelId}>
                Current model unavailable — {unavailableCommerceModelId}
              </option>
            ) : null}
            {commerceModelOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.displayName} ({option.provider}/
                {option.providerModelId})
              </option>
            ))}
          </select>
          {unavailableCommerceModelId ? (
            <span role="alert" className="mt-1 block text-sm text-amber-800">
              This saved model is no longer selectable. Choose an available
              Commerce model or Use Platform default to repair the assignment.
            </span>
          ) : null}
          <span className="mt-1 block text-xs font-normal text-gray-500">
            When a Shop has no explicit model override, a current subscription
            to this plan uses this model. Use Platform default leaves the plan
            without its own model override. The current billing plan is used
            on the next CommerceAgent turn; pending plan changes do not take
            effect early.
          </span>
        </label>
        <label className="text-sm font-medium text-gray-700">
          Plan kind
          <select
            className={inputClass}
            value={draft.planKind}
            onChange={(event) =>
              actions.handlePlanKindChange(
                event.target.value as "FREE" | "PAID_METERED",
              )
            }
          >
            <option value="FREE" disabled={selectors.freePlanAlreadyExists}>
              FREE
            </option>
            <option value="PAID_METERED">PAID_METERED</option>
          </select>
        </label>
        <label className="text-sm font-medium text-gray-700">
          Included recovery credits
          <input
            className={inputClass}
            type="number"
            min="0"
            value={draft.credits}
            onChange={(event) => actions.setCredits(Number(event.target.value))}
          />
        </label>
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <input
            type="checkbox"
            checked={draft.isActive}
            onChange={(event) => actions.setIsActive(event.target.checked)}
          />{" "}
          Active
        </label>
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <input
            type="checkbox"
            checked={draft.featured}
            onChange={(event) => actions.setFeatured(event.target.checked)}
          />{" "}
          Featured
        </label>
      </section>
      <section className="mt-4 space-y-3 rounded-md border border-gray-200 p-4">
        <div>
          <h3 className="font-semibold text-gray-900">Supported features</h3>
          <p className="text-sm text-gray-600">
            System-required features are always included. Inactive mapped
            features remain selected until the catalogue feature is reactivated.
          </p>
        </div>
        {selectors.supportedFeatureControls.map((control) =>
          control.includedByProductPolicy ? (
            <div key={control.key}>
              <label className="flex items-start gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={control.checked}
                  disabled={control.disabled}
                  readOnly
                />
                <span>
                  <span className="font-medium">{control.displayName}</span>
                  <span> (Included by product policy)</span>
                </span>
              </label>
              <div className="ml-6 space-y-4 border-l-2 border-[var(--brand-200)] pl-4">
                <div>
                  <h4 className="font-medium text-gray-900">
                    Merchant Knowledge configuration
                  </h4>
                  {!selectors.merchantKnowledgeConfigurationValid ? (
                    <p role="alert" className="mt-1 text-sm text-amber-800">
                      Merchant Knowledge configuration required. Enter explicit
                      limits and select currently active source types before
                      saving.
                    </p>
                  ) : null}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm font-medium text-gray-700">
                    Maximum knowledge sources
                    <input
                      className={inputClass}
                      type="number"
                      min={1}
                      max={100}
                      value={draft.maxKnowledgeSources}
                      onChange={(event) =>
                        actions.setMaxKnowledgeSources(event.target.value)
                      }
                    />
                  </label>
                  <label className="text-sm font-medium text-gray-700">
                    Maximum content units per source
                    <input
                      className={inputClass}
                      type="number"
                      min={1}
                      max={25000}
                      value={draft.maxContentUnitsPerSource}
                      onChange={(event) =>
                        actions.setMaxContentUnitsPerSource(event.target.value)
                      }
                    />
                  </label>
                </div>
                <div className="space-y-4">
                  {Array.from(
                    new Map(
                      merchantKnowledgeSourceTypes.map((sourceType) => [
                        sourceType.purposeKey,
                        sourceType.purposeDisplayName,
                      ]),
                    ),
                  ).map(([purposeKey, purposeDisplayName]) => (
                    <fieldset key={purposeKey} className="space-y-2">
                      <legend className="text-sm font-medium text-gray-800">
                        {purposeDisplayName}
                      </legend>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {merchantKnowledgeSourceTypes
                          .filter(
                            (sourceType) =>
                              sourceType.purposeKey === purposeKey,
                          )
                          .map((sourceType) => {
                            const key = selectors.sourceTypeKey(
                              sourceType.purposeKey,
                              sourceType.dataFormatKey,
                            );
                            return (
                              <label
                                key={key}
                                className="flex items-center gap-2 text-sm text-gray-700"
                              >
                                <input
                                  type="checkbox"
                                  checked={draft.allowedSourceTypeKeys.includes(
                                    key,
                                  )}
                                  onChange={(event) =>
                                    actions.setSourceType(
                                      key,
                                      event.target.checked,
                                    )
                                  }
                                />
                                {sourceType.dataFormatDisplayName}
                              </label>
                            );
                          })}
                      </div>
                    </fieldset>
                  ))}
                  {merchantKnowledgeSourceTypes.length === 0 ? (
                    <p className="text-sm text-gray-600">
                      No active Merchant Knowledge source types are available.
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : (
            <label
              key={control.key}
              className="flex items-start gap-2 text-sm text-gray-700"
            >
              <input
                type="checkbox"
                checked={control.checked}
                disabled={control.disabled}
                onChange={(event) =>
                  actions.setSupportedFeature(control.key, event.target.checked)
                }
              />
              <span>
                <span className="font-medium">{control.displayName}</span>
                {control.systemRequired
                  ? " (Required)"
                  : !control.active
                    ? " (Inactive globally)"
                    : ""}
                {control.description ? (
                  <span className="block text-xs text-gray-500">
                    {control.description}
                  </span>
                ) : null}
              </span>
            </label>
          ),
        )}
      </section>
    </>
  );
}