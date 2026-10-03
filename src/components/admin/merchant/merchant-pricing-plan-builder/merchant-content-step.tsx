import type { MerchantPricingPlanDraftController } from "./use-merchant-pricing-plan-draft";

type Controller = MerchantPricingPlanDraftController;

type MerchantContentStepProps = Pick<
  Controller["draft"],
  "description" | "highlights"
> &
  Pick<
    Controller["actions"],
    | "setDescription"
    | "addHighlight"
    | "removeHighlight"
    | "moveHighlight"
    | "updateHighlight"
  > &
  Pick<Controller["selectors"], "merchantContentValid">;

const inputClass =
  "w-full rounded-md border border-gray-300 bg-white p-2 text-sm";

export function MerchantContentStep({
  description,
  highlights,
  setDescription,
  addHighlight,
  removeHighlight,
  moveHighlight,
  updateHighlight,
  merchantContentValid,
}: MerchantContentStepProps) {
  return (
    <section className="space-y-5">
      <label className="block text-sm font-medium text-gray-700">
        English merchant description
        <textarea
          className={`${inputClass} mt-1`}
          rows={6}
          maxLength={2000}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>
      {highlights.map((highlight, index) => (
        <div
          key={highlight.contentKey}
          className="space-y-3 rounded-md border border-gray-200 p-3"
        >
          <label className="block text-sm font-medium text-gray-700">
            Highlight title
            <input
              className={inputClass}
              maxLength={120}
              value={highlight.title}
              onChange={(event) =>
                updateHighlight(index, { title: event.target.value })
              }
            />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Highlight description
            <textarea
              className={inputClass}
              maxLength={500}
              rows={3}
              value={highlight.description}
              onChange={(event) =>
                updateHighlight(index, { description: event.target.value })
              }
            />
          </label>
          <div className="flex flex-wrap gap-3 text-sm font-semibold">
            <button
              type="button"
              disabled={index === 0}
              onClick={() => moveHighlight(index, -1)}
            >
              Move up
            </button>
            <button
              type="button"
              disabled={index === highlights.length - 1}
              onClick={() => moveHighlight(index, 1)}
            >
              Move down
            </button>
            <button
              type="button"
              className="text-red-700"
              onClick={() => removeHighlight(index)}
            >
              Remove
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={addHighlight}
        className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold"
      >
        + Add highlight
      </button>

      {!merchantContentValid ? (
        <p className="text-sm font-medium text-red-700">
          Enter the English merchant description. If you add a highlight, both
          its title and description are required before continuing.
        </p>
      ) : null}
    </section>
  );
}