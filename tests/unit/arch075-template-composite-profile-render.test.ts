import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRecoveryCompositeImageRendererV2, RecoveryCompositeRenderError, verifyEncodedBrandImage } from "@modainteract/moda-interact-shared/commerce/presentation/node";
import { RecoveryCompositeProvenanceV2Schema, assertRecoveryCompositeProvenanceIdentityV2, type RecoveryCompositeProvenanceV2 } from "@modainteract/moda-interact-shared/commerce/presentation";
import { leftCompositeProfile as left, topCompositeProfile as top } from "../fixtures/arch075-composite-profile";
import { compositeProfileDigest } from "../../src/lib/admin/whatsapp-templates/authoring/composite-profile";

const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
test("same installed package renders both saved geometries with contained distinct logo/product slots", async () => {
  const logoBytes = await sharp({ create: { width: 1125, height: 600, channels: 3, background: "#e00000" } }).png().toBuffer();
  const productBytes = await sharp({ create: { width: 1125, height: 600, channels: 3, background: "#0000e0" } }).jpeg().toBuffer();
  const digests = [];
  for (const profile of [left, top]) {
    const profileSha256 = compositeProfileDigest(profile);
    const renderer = createRecoveryCompositeImageRendererV2({ profile, profileSha256 });
    const provenance: RecoveryCompositeProvenanceV2 = {
      schemaVersion: 2, shopId: "fixture-shop",
      logo: { origin: { kind: "SHOP_BRAND", shopId: "fixture-shop", shopDomain: "fixture.myshopify.com", role: "LOGO", sourceGeneration: 1, sourceFingerprint: `sha256:${"1".repeat(64)}` }, contentSha256: sha(logoBytes) },
      product: { shopId: "fixture-shop", platform: "SHOPIFY", productId: "fixture-product", variantId: null, contentSha256: sha(productBytes) },
      headerText: "Example Shop\nexample.com\n──────────", commonReferenceHash: "2".repeat(64),
      layoutVersion: "RECOVERY_COMPOSITE_V2", rendererVersion: "RECOVERY_COMPOSITE_V2", profile, profileSha256,
      fontResourceSha256: renderer.identity.fontResourceSha256, runtimeSha256: renderer.identity.runtimeSha256,
    };
    RecoveryCompositeProvenanceV2Schema.parse(provenance);
    assertRecoveryCompositeProvenanceIdentityV2(provenance, text => createHash("sha256").update(text).digest("hex"));
    await verifyEncodedBrandImage(logoBytes, "image/png");
    await verifyEncodedBrandImage(productBytes, "image/jpeg");
    const rendered = await renderer.render({ provenance, logoBytes, productBytes });
    assert.equal(rendered.image.width, profile.canvasWidth); assert.equal(rendered.image.height, profile.withProductHeight);
    assert.equal(rendered.profileSha256, profileSha256);
    assert.ok(rendered.textBounds.width <= profile.textWidth); assert.ok(rendered.textBounds.height <= profile.textHeight);
    const pixel = async (left: number, top: number) => [...await sharp(rendered.image.bytes).extract({ left, top, width: 1, height: 1 }).removeAlpha().raw().toBuffer()];
    const logo = await pixel(profile.logoLeft + Math.floor(profile.logoWidth / 2), profile.logoTop + Math.floor(profile.logoHeight / 2));
    assert.ok(logo[0] > 150 && logo[2] < 80, "logo slot contains only red fixture logo");
    const product = await pixel(profile.productLeft + Math.floor(profile.productWidth / 2), profile.productTop + Math.floor(profile.productHeight / 2));
    assert.ok(product[2] > 150 && product[0] < 80, "product slot remains separate and blue");
    const letterbox = await pixel(profile.logoLeft + Math.floor(profile.logoWidth / 2), profile.logoTop + 2);
    assert.ok(letterbox.every(value => value > 230), "wide logo is contained uncropped with white letterbox");
    const headerOnly = await renderer.render({ provenance: { ...provenance, product: null }, logoBytes });
    assert.equal(headerOnly.image.height, profile.headerOnlyHeight);
    await assert.rejects(renderer.render({ provenance: { ...provenance, headerText: "Long header ".repeat(100) }, logoBytes, productBytes }), error => error instanceof RecoveryCompositeRenderError);
    await assert.rejects(renderer.render({ provenance: { ...provenance, headerText: "\u{10FFFF}" }, logoBytes, productBytes }), error => error instanceof RecoveryCompositeRenderError);
    mkdirSync(".generated", { recursive: true });
    writeFileSync(`.generated/arch075-composite-profile-${profile === left ? "left" : "top"}.jpg`, rendered.image.bytes);
    console.info(`Composite fixture ${profile === left ? "left" : "top"}: ${rendered.image.width}x${rendered.image.height}, sha256=${rendered.image.contentSha256}`);
    digests.push(rendered.image.contentSha256);
  }
  assert.notEqual(digests[0], digests[1]);
  assert.throws(() => createRecoveryCompositeImageRendererV2({ profile: left, profileSha256: compositeProfileDigest(top) }));
});
