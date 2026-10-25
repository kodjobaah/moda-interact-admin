import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PublicationScopeSelector } from "../../src/components/admin/whatsapp-templates/publishing/publication-scope-selector.tsx";
import { PublicationEligibilitySummary } from "../../src/components/admin/whatsapp-templates/publishing/publication-eligibility-summary.tsx";
import { PublicationImpactList } from "../../src/components/admin/whatsapp-templates/publishing/publication-impact-list.tsx";
import { ShopLanguageComparison } from "../../src/components/admin/whatsapp-templates/publishing/shop-language-comparison.tsx";
import { PublicationOverrideConfirmation } from "../../src/components/admin/whatsapp-templates/publishing/publication-override-confirmation.tsx";
import { PublicationProgressSummary } from "../../src/components/admin/whatsapp-templates/publishing/publication-progress-summary.tsx";
import { CompiledTemplateReadOnly } from "../../src/components/admin/whatsapp-templates/publishing/compiled-template-read-only.tsx";
import type { LanguageComparison, PublicationPreview, PublicationProgress } from "../../src/lib/admin/whatsapp-templates/publishing/types.ts";

const on = () => {};
const preview: PublicationPreview = {
  definitionId: `wtdef_${"a".repeat(64)}`, fingerprint: "a".repeat(64), issuedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 300_000).toISOString(), totalShops: 100, totalTargets: 2000,
  excludedCount: 2, exclusionReasons: [{ reason: "WooCommerce installation is not ACTIVE", count: 2 }],
  page: 1, pageSize: 10, hasNext: true,
  shops: [{ shopId: "shop_0001", domain: "one.example", platform: "SHOPIFY", brand: [
    { key: "shopBrand.brandName", availability: "configured" }],
    counts: { new: 0, unchanged: 0, replaced: 19, override: 1, conflict: 0 } }],
  impactCounts: { new: 1980, unchanged: 0, replaced: 19, override: 1, conflict: 0 },
  brandFields: ["shopBrand.brandName"],
};
const absent = {
  provenance: "legacy" as const, label: "Historical content not preserved in this legacy assignment",
  providerTemplateName: "previous", providerLanguageCode: "en", status: "APPROVED",
  category: null, header: null, body: null, footer: null, buttons: null, bindings: null,
};
const proposed = {
  provenance: "moda" as const, label: "Moda-authored Meta registration",
  providerTemplateName: "proposed", providerLanguageCode: "en", status: "APPROVED", category: "MARKETING",
  header: "Hello {{1}}", body: "Your saved cart {{1}}", footer: "Terms and conditions",
  buttons: [{ type: "URL", text: "Return", url: "https://example.invalid/{{1}}" }],
  bindings: { header: [{ position: 1, variable: "shopBrand.brandName" }],
    body: [{ position: 1, variable: "checkout.url" }], buttons: [{ index: 0, variable: "checkout.url" }] },
};
const comparison: LanguageComparison = { shopId: "shop_0001", languageTag: "en", impact: "override",
  previous: absent, proposed, brand: [{ key: "shopBrand.brandName", availability: "missing" }] };

test("scope selector is accessible and bounded, preserving chosen selected shops", () => {
  const html = renderToStaticMarkup(<PublicationScopeSelector scope={{ mode: "selected", shopIds: ["shop_0001"] }}
    onChange={on} options={[{ id: "shop_0001", domain: "one.example", platform: "SHOPIFY" }]}
    search="one" onSearch={on} loading={false} error="" selectionPage={1} hasNext={true} onSelectionPage={on} />);
  assert.match(html, /Shop scope/);
  assert.match(html, /Search eligible shops by domain/);
  assert.match(html, /checked=""/);
  assert.match(html, /1 shops selected/);
  assert.match(html, /Next/);
  const loading = renderToStaticMarkup(<PublicationScopeSelector scope={{ mode: "one", shopId: "" }}
    onChange={on} options={[]} search="" onSearch={on} loading error="Backend is unavailable"
    selectionPage={1} hasNext={false} onSelectionPage={on} />);
  assert.match(loading, /role="alert"/); assert.match(loading, /role="status"/);
});

test("bounded impact table, exclusions and counts keep shop and shop-language metrics separate", () => {
  const html = renderToStaticMarkup(<><PublicationEligibilitySummary preview={preview} />
    <PublicationImpactList preview={preview} selectedShopId="shop_0001" onSelect={on} onPage={on} busy={false} /></>);
  assert.match(html, /Shop-language targets/); assert.match(html, /2000/);
  assert.match(html, /Included shops/); assert.match(html, /100/);
  assert.match(html, /excluded: WooCommerce installation is not ACTIVE/);
  assert.match(html, /aria-pressed="true"/); assert.match(html, /min-w-\[650px\]/);
  assert.match(html, /Shop brand fields/); assert.match(html, /shopBrand.brandName/);
  assert.match(html, /Next page/);
});

test("one selected language stacks complete frozen previous/proposed projections on mobile", () => {
  const html = renderToStaticMarkup(<ShopLanguageComparison shopId="shop_0001" language="en"
    onLanguage={on} result={comparison} loading={false} error="" />);
  assert.match(html, /grid-cols-1/); assert.match(html, /lg:grid-cols-2/);
  assert.match(html, /Previous shop template/); assert.match(html, /Proposed Moda-authored template/);
  assert.match(html, /Historical content unavailable/); assert.match(html, /Historical bindings unavailable/);
  assert.match(html, /Terms and conditions/); assert.match(html, /shopBrand.brandName/);
  assert.match(html, /checkout.url/); assert.match(html, /button 0/);
  assert.match(html, /Missing\/null \(warning\)/);
  const loading = renderToStaticMarkup(<ShopLanguageComparison shopId="shop_0001" language="fr" onLanguage={on}
    result={null} loading error="Content query failed" />);
  assert.match(loading, /role="status"/); assert.match(loading, /role="alert"/);
});

test("confirmation explicitly blocks overrides, conflicting slots, stale preview and insufficient reason", () => {
  const render = (p = preview, approved = false, acknowledged = false, reason = "Reviewed all changes") => renderToStaticMarkup(
    <PublicationOverrideConfirmation preview={p} reviewedImpact={approved} onReviewedImpact={on}
      acknowledgeOverrides={acknowledged} onAcknowledgement={on} reason={reason} onReason={on}
      busy={false} clockNowMs={Date.parse("2026-10-25T16:00:00Z")} onConfirm={on} />);
  assert.match(render(), /I explicitly authorise replacing existing shop-specific overrides/);
  assert.match(render(), /disabled=""/);
  assert.doesNotMatch(render(preview, true, true), /disabled=""/);
  assert.match(render({ ...preview, impactCounts: { ...preview.impactCounts, conflict: 1 } }, true, true), /Resolve 1 ambiguous slots/);
  assert.match(render({ ...preview, expiresAt: "2020-01-01T00:00:00Z" }, true, true), /Preview has expired/);
});

test("progress separates durable shop counts from language target counts and shows retry state", () => {
  const progress: PublicationProgress = { operationId: "operation_1", status: "PARTIAL", totalShops: 100,
    succeededShops: 99, failedShops: 1, pendingShops: 0,
    totalTargets: 2000, succeededTargets: 1980, failedTargets: 20, pendingTargets: 0,
    nextPageCursor: "100", failureCode: "PARTIAL_PUBLICATION" };
  const html = renderToStaticMarkup(<PublicationProgressSummary progress={progress} busy={false} onContinue={on} onRetry={on} />);
  assert.match(html, /Shops \(100\)/); assert.match(html, /Shop-language targets \(2000\)/);
  assert.match(html, /Succeeded 99/); assert.match(html, /Succeeded 1980/); assert.match(html, /Retry transient failures/);
  assert.match(html, /role="alert"/);
  const full = renderToStaticMarkup(<CompiledTemplateReadOnly title="Proposed" view={proposed} />);
  assert.match(full, /Header|header/); assert.match(full, /Frozen positional variable bindings/);
  assert.match(full, /MARKETING/);
});

/** Direct child-handler checks, without a browser/DOM: stateful controller integration
 * is separately covered by server/action contracts and targeted operation tests. */
function visit(node: unknown, predicate: (el: { type: unknown; props: Record<string, any> }) => boolean): Array<{ type: unknown; props: Record<string, any> }> {
  if (Array.isArray(node)) return node.flatMap((child) => visit(child, predicate));
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const item = node as { type: unknown; props: Record<string, any> };
  return [...(predicate(item) ? [item] : []), ...visit(item.props.children, predicate)];
}

test("shop selection and language selector callbacks address the selected shop/language only", () => {
  let chosen: unknown;
  const scopeView = PublicationScopeSelector({ scope: { mode: "selected", shopIds: ["shop_0001"] },
    onChange: (value) => { chosen = value; },
    options: [{ id: "shop_0001", domain: "one.example", platform: "SHOPIFY" },
      { id: "shop_0002", domain: "two.example", platform: "WOOCOMMERCE" }],
    search: "", onSearch: on, loading: false, error: "", selectionPage: 1, hasNext: false, onSelectionPage: on });
  const inputs = visit(scopeView, (el) => el.type === "input" && el.props.type === "checkbox");
  assert.equal(inputs.length, 2);
  inputs[1].props.onChange({ target: { checked: true } });
  assert.deepEqual(chosen, { mode: "selected", shopIds: ["shop_0001", "shop_0002"] });
  inputs[0].props.onChange({ target: { checked: false } });
  assert.deepEqual(chosen, { mode: "selected", shopIds: [] });
  let chosenLanguage = "";
  const languageView = ShopLanguageComparison({ shopId: "shop_0001", language: "en",
    onLanguage: (tag) => { chosenLanguage = tag; }, result: comparison, loading: false, error: "" });
  const languageSelect = visit(languageView, (el) => el.type === "select");
  assert.equal(languageSelect.length, 1);
  languageSelect[0].props.onChange({ target: { value: "fr" } });
  assert.equal(chosenLanguage, "fr");
});
