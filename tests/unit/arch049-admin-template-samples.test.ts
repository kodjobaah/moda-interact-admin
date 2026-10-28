import assert from "node:assert/strict";
import { test } from "node:test";
import { projectTemplateSamples, TEMPLATE_SAMPLE_MEDIA_KEY } from "../../src/lib/admin/whatsapp-templates/media/template-samples.ts";
import { readTemplateSampleMedia, TemplateSampleReadError } from "../../src/lib/admin/whatsapp-templates/media/template-sample-reader.ts";
import type { PrismaClient } from "@prisma/client";

const origin = "https://shop-brands.modainteract.com";
const environment = "test";
const principal = { id: "admin-1", role: "SUPER_ADMIN" as const, developmentBypass: false };
const sha = "a".repeat(64);
const role = (name: string) => ({
  objectKey: `template-samples/test/${name.toLowerCase()}/sha256-${sha}.png`,
  contentSha256: sha, contentType: "image/png", sizeBytes: 1024,
  width: 512, height: 512, verifiedAt: "2026-10-28T16:00:00Z",
});
const manifest = { schemaVersion: 1, environment, assets: { LOGO: role("LOGO"), SQUARE_LOGO: role("SQUARE_LOGO"), COVER_IMAGE: role("COVER_IMAGE") } };

test("three verified example URLs are projected without needing a merchant Shop", () => {
  const view = projectTemplateSamples(manifest, environment, origin);
  assert.equal(view.label, "Moda template example");
  for (const name of ["LOGO", "SQUARE_LOGO", "COVER_IMAGE"] as const) {
    const media = view.roles[name];
    assert.equal(media.status, "READY");
    if (media.status === "READY") assert.equal(media.url, `${origin}/${manifest.assets[name].objectKey}`);
  }
});
test("tampered keys, wrong environment, poisoned origins or unverified media are not rendered", () => {
  for (const altered of [
    { ...manifest, environment: "production" },
    { ...manifest, assets: { ...manifest.assets, LOGO: { ...role("LOGO"), objectKey: `shop-brands/store.example/logo/sha256-${sha}.png` } } },
    { ...manifest, assets: { ...manifest.assets, LOGO: { ...role("LOGO"), contentSha256: "bad" } } },
    { ...manifest, assets: { ...manifest.assets, LOGO: { ...role("LOGO"), contentType: "image/svg+xml" } } },
  ]) assert.notEqual(projectTemplateSamples(altered, environment, origin).roles.LOGO.status, "READY");
  assert.notEqual(projectTemplateSamples(manifest, environment, "http://shop-brands.modainteract.com").roles.LOGO.status, "READY");
});

test("reader is SUPER_ADMIN-only and reads only environment-scoped configuration", async () => {
  const calls: unknown[] = [];
  const db = { platformConfiguration: { findUnique: async (args: { where: { environment_key: { key: string } } }) => {
    calls.push(args);
    return { value: args.where.environment_key.key === TEMPLATE_SAMPLE_MEDIA_KEY ? manifest :
      { publicOrigin: origin, bucketName: "moda-interact-shop-brands" } };
  } } } as unknown as Pick<PrismaClient, "platformConfiguration">;
  const view = await readTemplateSampleMedia({ principal, db, environment });
  assert.equal(view.roles.LOGO.status, "READY");
  assert.equal(calls.length, 2);
  assert.ok(calls.every((arg) => JSON.stringify(arg).includes('"environment":"test"')));
  await assert.rejects(() => readTemplateSampleMedia({ principal: { ...principal, role: "ADMIN" }, db, environment }), /SUPER_ADMIN/);
  assert.equal(calls.length, 2);
  const broken = { platformConfiguration: { findUnique: async (args: { where: { environment_key: { key: string } } }) => ({
    value: args.where.environment_key.key === TEMPLATE_SAMPLE_MEDIA_KEY ? manifest : { publicOrigin: "http://evil.example", bucketName: "moda-interact-shop-brands" },
  }) } } as unknown as Pick<PrismaClient, "platformConfiguration">;
  await assert.rejects(() => readTemplateSampleMedia({ principal, db: broken, environment }),
    (error: unknown) => error instanceof TemplateSampleReadError && error.code === "CONFIG_UNAVAILABLE");
});
