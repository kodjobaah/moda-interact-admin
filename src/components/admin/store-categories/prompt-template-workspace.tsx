import type { StoreCategoryCatalogue } from "@/lib/admin/store-categories";
import { PromptTemplateEditor } from "./prompt-template-editor";
import { PromptTemplateList } from "./prompt-template-list";

type Category = StoreCategoryCatalogue["categories"][number];

export function PromptTemplateWorkspace({
  category,
  selectedTemplateId,
}: {
  category: Category;
  selectedTemplateId?: string;
}) {
  const selectedTemplate =
    selectedTemplateId && selectedTemplateId !== "new"
      ? category.templates.find((template) => template.id === selectedTemplateId)
      : undefined;
  const creating =
    selectedTemplateId === "new" ||
    (category.templates.length === 0 && !selectedTemplateId);
  const effectiveTemplate =
    selectedTemplate ?? (creating ? undefined : category.templates[0]);
  const effectiveTemplateId = effectiveTemplate?.id;

  return (
    <section aria-labelledby="store-category-templates-title">
      <div className="mb-5">
        <h3 id="store-category-templates-title" className="text-lg font-semibold text-gray-950">
          Prompt templates
        </h3>
        <p className="mt-1 text-sm text-gray-600">
          Maintain one template at a time. The category default is identified in the template list.
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[18rem_minmax(0,1fr)]">
        <PromptTemplateList
          category={category}
          selectedTemplateId={creating ? "new" : effectiveTemplateId}
        />
        <div className="min-w-0 rounded-lg border border-gray-200 bg-white p-5">
          <PromptTemplateEditor
            categoryId={category.id}
            template={effectiveTemplate}
            heading={creating ? "Create prompt template" : undefined}
          />
        </div>
      </div>
    </section>
  );
}
