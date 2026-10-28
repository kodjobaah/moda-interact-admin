#!/usr/bin/env node
/** Explicit, repeatable development/test-only seed for platform-level IMAGE template examples.
 * Uses the existing database-backed merchant.knowledge.r2 sealed credentials, but
 * uploads to the dedicated ShopBrand public bucket. The credential must have
 * permission to write that bucket. No real merchant ShopBrand is modified.
 */
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { generateTemplateSamples, inspectPng } from "./template-sample-images.mjs";
import { r2Request } from "./template-sample-r2.mjs";

const KEY = "whatsapp.templateSamples";
const CREDS_KEY = "merchant.knowledge.r2";
const ROLES = ["LOGO", "SQUARE_LOGO", "COVER_IMAGE"];
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const wait = (delay) => new Promise((resolve) => setTimeout(resolve, delay));

export function parseArguments(args) {
  if (args.length === 1 && args[0] === "--help") return { help: true };
  const input = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (key === "--confirm") { if (input.confirm) throw Error("Duplicate --confirm"); input.confirm = true; continue; }
    if (!["--environment", "--logo", "--square-logo", "--cover-image"].includes(key) ||
        typeof args[i + 1] !== "string" || args[i + 1].startsWith("--") || input[key]) {
      throw Error("Usage: --environment test|development --confirm [--logo FILE.png --square-logo FILE.png --cover-image FILE.png]");
    }
    input[key] = args[++i];
  }
  if (!["test", "development"].includes(input["--environment"]) || !input.confirm) {
    throw Error("Explicit --environment test|development and --confirm are required; production is not supported.");
  }
  return { environment: input["--environment"], paths: {
    LOGO: input["--logo"], SQUARE_LOGO: input["--square-logo"], COVER_IMAGE: input["--cover-image"],
  } };
}

export async function loadSampleBytes(paths) {
  const generated = generateTemplateSamples();
  const output = {};
  for (const role of ROLES) {
    const bytes = paths[role] ? await readFile(paths[role]) : generated[role].bytes;
    const { width, height } = inspectPng(bytes);
    output[role] = { bytes, width, height, sha256: sha(bytes) };
  }
  return output;
}

export async function verifyPublicObject({ origin, objectKey, expectedHash }) {
  const url = new URL(objectKey.split("/").map(encodeURIComponent).join("/"), origin);
  for (let i = 0; i < 4; i++) {
    try {
      const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (response.headers.get("content-length") && Number(response.headers.get("content-length")) >= 5 * 1024 * 1024) {
        throw Error("Public media exceeds size limit");
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length >= 5 * 1024 * 1024 || sha(bytes) !== expectedHash) {
        throw Error("Public media contents differ from uploaded bytes");
      }
      return;
    } catch (error) {
      if (i === 3) throw new Error(`Public example unavailable or mismatched at ${url}: ${error instanceof Error ? error.message : String(error)}`);
      await wait(1_000);
    }
  }
}

export function matchingAssets(previous, next) {
  if (!previous || typeof previous !== "object" || previous.schemaVersion !== 1 || previous.environment !== next.environment) return false;
  return ROLES.every((role) => previous.assets?.[role]?.objectKey === next.assets[role].objectKey &&
    previous.assets?.[role]?.contentSha256 === next.assets[role].contentSha256);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log("Usage: npm run admin:seed-template-media -- --environment test --confirm [--logo FILE.png --square-logo FILE.png --cover-image FILE.png]");
    console.log("Omitted images are generated deterministically. Requires DATABASE_URL and MODA_CONFIG_UNSEAL_KEY in the process environment.");
    return;
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || !/(?:test|development)/i.test(decodeURIComponent(new URL(databaseUrl).pathname))) {
    throw new Error("DATABASE_URL must name a disposable test/development database. No production writes are supported.");
  }
  const [{ Prisma, PrismaClient }, { PLATFORM_POLICY_REGISTRY, validateConfiguration }, { loadConfigUnsealKeyring, unsealSecret }] = await Promise.all([
    import("@prisma/client"),
    import("../src/lib/admin/platform-configuration/contracts.ts"),
    import("../src/lib/admin/platform-configuration/seal.ts"),
  ]);
  const db = new PrismaClient();
  try {
    const environment = options.environment;
    const publicPolicy = PLATFORM_POLICY_REGISTRY.get("shopBrand.publicMedia");
    if (!publicPolicy?.defaults) throw Error("ShopBrand public-media policy unavailable.");
    const [policyRow, secret] = await Promise.all([
      db.platformConfiguration.findUnique({ where: { environment_key: { environment, key: publicPolicy.key } } }),
      db.platformConfiguration.findUnique({ where: { environment_key: { environment, key: CREDS_KEY } } }),
    ]);
    const policy = validateConfiguration(publicPolicy, policyRow?.value ?? publicPolicy.defaults);
    if (!policy.ok || typeof policy.values.bucketName !== "string" || typeof policy.values.publicOrigin !== "string") {
      throw Error("ShopBrand public-media bucket or origin is invalid.");
    }
    if (!secret) throw Error(`${CREDS_KEY} is not configured for ${environment}.`);
    const decrypted = JSON.parse(unsealSecret({ environment, key: CREDS_KEY, version: secret.version,
      value: secret.value, wrapping: loadConfigUnsealKeyring() }));
    const { endpoint, accessKeyId, secretAccessKey } = decrypted;
    if (![endpoint, accessKeyId, secretAccessKey].every((v) => typeof v === "string" && !!v)) {
      throw Error("Database R2 credential configuration is incomplete.");
    }
    const samples = await loadSampleBytes(options.paths);
    const assets = {};
    for (const role of ROLES) {
      const asset = samples[role];
      const objectKey = `template-samples/${environment}/${role.toLowerCase()}/sha256-${asset.sha256}.png`;
      const request = { endpoint, bucket: policy.values.bucketName, objectKey, accessKeyId, secretAccessKey };
      await r2Request({ ...request, method: "PUT", payload: asset.bytes });
      const head = await r2Request({ ...request, method: "HEAD" });
      if (Number(head.headers.get("content-length")) !== asset.bytes.length) throw Error(`R2 HEAD byte-size mismatch for ${role}.`);
      await verifyPublicObject({ origin: policy.values.publicOrigin, objectKey, expectedHash: asset.sha256 });
      assets[role] = { objectKey, contentSha256: asset.sha256, contentType: "image/png", width: asset.width,
        height: asset.height, sizeBytes: asset.bytes.length, verifiedAt: new Date().toISOString() };
      console.log(`${role}: uploaded, checked via R2 and public URL: ${objectKey}`);
    }
    const value = { schemaVersion: 1, environment, assets };
    const result = await db.$transaction(async (tx) => {
      const previous = await tx.platformConfiguration.findUnique({ where: { environment_key: { environment, key: KEY } } });
      if (matchingAssets(previous?.value, value)) return "unchanged";
      const before = previous?.version ?? 0;
      if (previous) await tx.platformConfiguration.update({ where: { environment_key: { environment, key: KEY }, version: before },
        data: { value, version: { increment: 1 }, updatedBy: "template-sample-seed" } });
      else await tx.platformConfiguration.create({ data: { environment, key: KEY, value, updatedBy: "template-sample-seed" } });
      await tx.platformConfigurationAudit.create({ data: { environment, key: KEY, expectedVersion: before,
        resultingVersion: before + 1, beforeValue: previous?.value ?? Prisma.DbNull, afterValue: value,
        actorId: "template-sample-seed", reason: "seed-template-example-media" } });
      return "published";
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    console.log(`PostgreSQL ${environment}/${KEY}: ${result}. Only sample metadata was stored; no merchant ShopBrand was changed.`);
  } finally { await db.$disconnect(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(`Sample media seed failed: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
}
