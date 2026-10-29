import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateTemplateSamples, inspectPng } from "../../scripts/template-sample-images.mjs";
import { signR2Request, validateR2Endpoint } from "../../scripts/template-sample-r2.mjs";
import { parseArguments, loadSampleBytes, matchingAssets } from "../../scripts/seed-template-example-media.mjs";

const digest = (b) => createHash("sha256").update(b).digest("hex");
test("all three sample images are deterministic, valid RGB PNGs with supported dimensions and sizes", async () => {
  const a = generateTemplateSamples(), b = generateTemplateSamples();
  for (const role of ["LOGO", "SQUARE_LOGO", "COVER_IMAGE"]) {
    assert.deepEqual(inspectPng(a[role].bytes), { width: a[role].width, height: a[role].height });
    assert.equal(digest(a[role].bytes), digest(b[role].bytes));
    assert.ok(a[role].bytes.length < 5 * 1024 * 1024);
    const generated = await loadSampleBytes({});
    assert.equal(digest(generated[role].bytes), digest(a[role].bytes));
  }
});
test("seed CLI requires explicit non-production environment and confirmation", () => {
  for (const args of [[], ["--environment", "production", "--confirm"], ["--environment", "test"],
    ["--environment", "test", "--confirm", "--unexpected"], ["--environment", "test", "--confirm", "--confirm"],
    ["--environment", "test", "--confirm", "--source-image", "source.png", "--logo", "logo.png"],
    ["--environment", "test", "--confirm", "--source-image", "source.png", "--cover-image", "cover.png"]]) {
    assert.throws(() => parseArguments(args));
  }
  assert.equal(parseArguments(["--environment", "test", "--confirm"]).environment, "test");
  const single = parseArguments(["--environment", "test", "--confirm", "--source-image", "sample.jpeg"]);
  assert.equal(single.sourceImage, "sample.jpeg");
  assert.equal(single.paths.LOGO, undefined);
  assert.equal(single.paths.SQUARE_LOGO, undefined);
  assert.equal(single.paths.COVER_IMAGE, undefined);
});
test("R2 V4 signature is stable and rejects wrong hosts or keys", () => {
  const args = { method: "PUT", endpoint: `https://${"a".repeat(32)}.r2.cloudflarestorage.com`, bucket: "moda-interact-shop-brands",
    objectKey: `template-samples/test/logo/sha256-${"b".repeat(64)}.png`, accessKeyId: "exampleAccess", secretAccessKey: "exampleSecret",
    payload: Buffer.from("abc"), now: new Date("2026-10-28T16:00:00.000Z") };
  const first = signR2Request(args);
  assert.equal(first.headers.Authorization, signR2Request(args).headers.Authorization);
  assert.match(first.headers.Authorization, /Credential=exampleAccess\/20261028\/auto\/s3\/aws4_request/);
  assert.match(first.headers.Authorization, /Signature=[0-9a-f]{64}$/);
  assert.match(first.url, /\/moda-interact-shop-brands\/template-samples\/test\/logo\//);
  assert.throws(() => validateR2Endpoint("https://evil.example.com"));
  assert.throws(() => signR2Request({ ...args, objectKey: "shop-brands/merchant/logo/other.png" }));
});
test("identical object hashes are idempotent even when verification timestamps differ", () => {
  const now = { schemaVersion: 1, environment: "test", assets: Object.fromEntries(
    ["LOGO", "SQUARE_LOGO", "COVER_IMAGE"].map((role) => [role, { objectKey: `test/${role}`, contentSha256: "abc", verifiedAt: "2026-10-28" }])
  ) };
  assert.equal(matchingAssets({ ...now, assets: Object.fromEntries(Object.entries(now.assets).map(([role, value]) => [role, { ...value, verifiedAt: "old" }])) }, now), true);
  assert.equal(matchingAssets({ ...now, environment: "development" }, now), false);
});


test("one source image derives valid, reproducible PNGs with role-specific dimensions", async () => {
  const folder = await mkdtemp(join(tmpdir(), "moda-template-samples-"));
  const sourceFile = join(folder, "example.png");
  try {
    await writeFile(sourceFile, generateTemplateSamples().LOGO.bytes);
    const first = await loadSampleBytes({}, sourceFile);
    const second = await loadSampleBytes({}, sourceFile);
    assert.deepEqual(inspectPng(first.LOGO.bytes), { width: 1200, height: 630 });
    assert.deepEqual(inspectPng(first.SQUARE_LOGO.bytes), { width: 512, height: 512 });
    assert.deepEqual(inspectPng(first.COVER_IMAGE.bytes), { width: 1200, height: 630 });
    for (const role of ["LOGO", "SQUARE_LOGO", "COVER_IMAGE"]) {
      assert.equal(first[role].sha256, digest(first[role].bytes));
      assert.equal(first[role].sha256, second[role].sha256);
      assert.ok(first[role].bytes.length > 0 && first[role].bytes.length < 4 * 1024 * 1024);
    }
    assert.notEqual(first.LOGO.sha256, first.SQUARE_LOGO.sha256);
    await writeFile(sourceFile, Buffer.from("not an image"));
    await assert.rejects(loadSampleBytes({}, sourceFile), /decode --source-image/);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
