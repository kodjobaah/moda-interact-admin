import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { TemplateContentEditor } from "../../src/components/admin/whatsapp-templates/authoring/template-content-editor.tsx";
import { TemplateReadOnlyPreview } from "../../src/components/admin/whatsapp-templates/authoring/template-read-only-preview.tsx";
import { ShopBrandMediaRolePicker } from "../../src/components/admin/whatsapp-templates/media/shop-brand-media-role-picker.tsx";
import { ShopBrandMediaReadinessMessage } from "../../src/components/admin/whatsapp-templates/media/shop-brand-media-readiness-message.tsx";
import { ShopBrandMediaPreview } from "../../src/components/admin/whatsapp-templates/media/shop-brand-media-preview.tsx";
import { newMetaDraft } from "../../src/lib/admin/whatsapp-templates/authoring/draft-operations.ts";
import type { ShopBrandMediaView, ReadyMedia } from "../../src/lib/admin/whatsapp-templates/media/readiness.ts";

const roleMedia = (role: ReadyMedia["role"]): ReadyMedia => ({
  role, status: "READY", url: `https://shop-brands.modainteract.com/shop-brands/shop_a/${role.toLowerCase()}/sha256-${"a".repeat(64)}.jpg`,
  contentType: "image/jpeg", width: 1125, height: 600, sizeBytes: 185000,
});
const media: ShopBrandMediaView = {
  shopId: "shop_a", domain: "shop.example.com", roles: {
    LOGO: roleMedia("LOGO"), SQUARE_LOGO: { role: "SQUARE_LOGO", status: "PROCESSING" },
    COVER_IMAGE: { role: "COVER_IMAGE", status: "FAILED" },
  },
};

test("role picker uses labelled, keyboard-accessible radio inputs and disables non-READY assets", () => {
  const html = renderToStaticMarkup(<ShopBrandMediaRolePicker media={media} onSelect={() => {}} />);
  assert.equal((html.match(/type="radio"/g) ?? []).length, 3);
  assert.equal((html.match(/disabled=""/g) ?? []).length, 2);
  assert.match(html, /aria-label="Logo IMAGE header \(ready\)"/);
  assert.match(html, /aria-label="Square logo IMAGE header \(processing\)"/);
  assert.match(html, /aria-label="Cover image IMAGE header \(failed\)"/);
  assert.match(html, /grid-cols-1/); assert.match(html, /sm:grid-cols-2/); assert.match(html, /xl:grid-cols-3/);
  assert.match(html, /max-w-full/); assert.match(html, /object-contain/);
  assert.match(html, /185000|181 KiB/); assert.match(html, /1125/);
});

test("no shop and missing processing assets never render a live image", () => {
  const missing = renderToStaticMarkup(<ShopBrandMediaRolePicker media={null} onSelect={() => {}} />);
  assert.equal((missing.match(/disabled=""/g) ?? []).length, 3);
  assert.ok(!missing.includes("<img"));
  const failed = renderToStaticMarkup(<ShopBrandMediaReadinessMessage media={{ role: "LOGO", status: "STALE" }}/>)
  assert.match(failed, /does not match/);
});

test("processed IMAGE preview shows verified image dimensions; missing role shows safe placeholder", () => {
  const complete = renderToStaticMarkup(<TemplateReadOnlyPreview preview={{ family: "META_RECOVERY", header: "",
    body: "Hello", footer: "", buttons: [], headerMediaRole: "LOGO" }}
    verifiedMedia={roleMedia("LOGO")} mediaDomain="shop.example.com"/>);
  assert.match(complete, /IMAGE header preview/);
  assert.match(complete, /<img/);
  assert.match(complete, /Processed logo for shop.example.com/);
  const absent = renderToStaticMarkup(<TemplateReadOnlyPreview preview={{ family: "META_RECOVERY", header: "",
    body: "Hello", footer: "", buttons: [], headerMediaRole: "LOGO" }}
    verifiedMedia={{ role: "LOGO", status: "PENDING" }} mediaDomain="shop.example.com"/>);
  assert.ok(!absent.includes("<img"));
  assert.match(absent, /no verified shop preview/i);
});

test("Meta text variable palette remains separate from actual media-image binding", () => {
  const markup = renderToStaticMarkup(<TemplateContentEditor draft={newMetaDraft()} onChange={() => {}} />);
  assert.match(markup, /Text or no header/);
  assert.match(markup, /Logo URL \(text\)/);
  assert.ok(!markup.includes('name="shopBrandMediaRole"'));
});

test("media image component metadata and alt labels are accessible", () => {
  const markup = renderToStaticMarkup(<ShopBrandMediaPreview media={roleMedia("COVER_IMAGE")} domain="shop.example.com"/>);
  assert.match(markup, /<figure/); assert.match(markup, /<figcaption/);
  assert.match(markup, /alt="Processed cover image for shop.example.com"/);
  assert.match(markup, /JPEG/);
});
