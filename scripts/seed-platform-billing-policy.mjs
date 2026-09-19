#!/usr/bin/env node
"use strict";

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CONFIRM_FLAG = "--confirm-test-data";
const ALLOW_UNCONFIGURED_FLAG = "--allow-unconfigured";
const TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 20_000,
};

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ADMIN_ROOT = path.resolve(SCRIPT_DIR, "..");
const STATE_DIR = path.join(ADMIN_ROOT, ".seed-state");
const SNAPSHOT_PATH = path.join(STATE_DIR, "platform-billing-policy.json");

const CANONICAL_POLICY = Object.freeze({
  globalPauseNewRecoveries: false,
  globalPauseAutomatedWhatsapp: false,
  lifetimeFreeRecoveryAllowance: 5,
  minimumUpgradePremiumBps: 2000,
  absoluteOutboundHardLimit: 2000,
  defaultWarningPercent: 80,
  defaultOutboundSoftLimit: 1000,
  defaultOutboundHardLimit: 2000,
  terminalMessageReservedSlots: 1,
});

const PROFILES = Object.freeze({
  canonical: CANONICAL_POLICY,
  default: CANONICAL_POLICY,
  paused: {
    ...CANONICAL_POLICY,
    globalPauseNewRecoveries: true,
    globalPauseAutomatedWhatsapp: true,
  },
});

function usage() {
  return `
PlatformBillingPolicy manual seed utility

Usage:
  node scripts/seed-platform-billing-policy.mjs status
  node scripts/seed-platform-billing-policy.mjs seed canonical --confirm-test-data
  node scripts/seed-platform-billing-policy.mjs seed paused --confirm-test-data
  node scripts/seed-platform-billing-policy.mjs restore --confirm-test-data
  node scripts/seed-platform-billing-policy.mjs delete --confirm-test-data --allow-unconfigured

Profiles:
  canonical   Canonical development defaults from prisma/seed.mjs.
  default     Alias of canonical.
  paused      Canonical values with both global pause switches enabled.

Optional seed overrides:
  --lifetime-free <N>
  --minimum-upgrade-premium-bps <N>
  --absolute-hard <N>
  --warning-percent <0..100>
  --default-soft <N>
  --default-hard <N>
  --terminal-reserved <N>
  --pause-new-recoveries <true|false>
  --pause-automated-whatsapp <true|false>

Examples:
  npm run admin:seed-platform-billing-policy -- \\
    seed canonical \\
    --lifetime-free 5 \\
    --confirm-test-data

  npm run admin:seed-platform-billing-policy -- \\
    seed canonical \\
    --absolute-hard 200 \\
    --default-soft 50 \\
    --default-hard 100 \\
    --terminal-reserved 1 \\
    --warning-percent 80 \\
    --confirm-test-data

Safety:
  - The first seed/delete mutation snapshots the existing singleton policy.
  - Repeated seeds do NOT replace that original snapshot.
  - restore returns to the pre-test policy and removes the snapshot file.
  - delete requires --allow-unconfigured because a missing platform policy can
    intentionally block/alter billing behaviour across all shops.
`.trim();
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function argument(name) {
  const exact = process.argv.find((value) => value.startsWith(`${name}=`));
  if (exact) return exact.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requireConfirmation() {
  if (!hasFlag(CONFIRM_FLAG)) {
    throw new Error(
      `Mutation refused. Re-run with ${CONFIRM_FLAG} to confirm this is disposable development/test state.`,
    );
  }
}

function parseIntegerOverride(flag, fallback) {
  const raw = argument(flag);
  if (raw === undefined) return fallback;
  if (!/^-?\d+$/.test(raw.trim())) {
    throw new Error(`${flag} must be a whole number.`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${flag} is outside the safe integer range.`);
  }
  return value;
}

function parseBooleanOverride(flag, fallback) {
  const raw = argument(flag);
  if (raw === undefined) return fallback;
  const normalized = raw.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new Error(`${flag} must be true or false.`);
}

function buildPolicy(profileName) {
  const profile = PROFILES[profileName];
  if (!profile) {
    throw new Error(
      `Unknown profile "${profileName}". Expected canonical, default, or paused.`,
    );
  }

  const policy = {
    globalPauseNewRecoveries: parseBooleanOverride(
      "--pause-new-recoveries",
      profile.globalPauseNewRecoveries,
    ),
    globalPauseAutomatedWhatsapp: parseBooleanOverride(
      "--pause-automated-whatsapp",
      profile.globalPauseAutomatedWhatsapp,
    ),
    lifetimeFreeRecoveryAllowance: parseIntegerOverride(
      "--lifetime-free",
      profile.lifetimeFreeRecoveryAllowance,
    ),
    minimumUpgradePremiumBps: parseIntegerOverride(
      "--minimum-upgrade-premium-bps",
      profile.minimumUpgradePremiumBps,
    ),
    absoluteOutboundHardLimit: parseIntegerOverride(
      "--absolute-hard",
      profile.absoluteOutboundHardLimit,
    ),
    defaultWarningPercent: parseIntegerOverride(
      "--warning-percent",
      profile.defaultWarningPercent,
    ),
    defaultOutboundSoftLimit: parseIntegerOverride(
      "--default-soft",
      profile.defaultOutboundSoftLimit,
    ),
    defaultOutboundHardLimit: parseIntegerOverride(
      "--default-hard",
      profile.defaultOutboundHardLimit,
    ),
    terminalMessageReservedSlots: parseIntegerOverride(
      "--terminal-reserved",
      profile.terminalMessageReservedSlots,
    ),
  };

  validatePolicy(policy);
  return policy;
}

function validatePolicy(policy) {
  if (policy.absoluteOutboundHardLimit <= 0) {
    throw new Error("Absolute outbound hard limit must be positive.");
  }
  if (policy.defaultOutboundSoftLimit < 1) {
    throw new Error("Default outbound soft limit must be at least 1.");
  }
  if (policy.defaultOutboundHardLimit < 2) {
    throw new Error("Default outbound hard limit must be at least 2.");
  }
  if (policy.defaultOutboundSoftLimit > policy.defaultOutboundHardLimit) {
    throw new Error("Default outbound soft limit must not exceed the hard limit.");
  }
  if (policy.defaultOutboundHardLimit > policy.absoluteOutboundHardLimit) {
    throw new Error("Default outbound hard limit must not exceed the absolute hard limit.");
  }
  if (policy.terminalMessageReservedSlots < 1) {
    throw new Error("Terminal message reserved slots must be at least 1.");
  }
  if (policy.terminalMessageReservedSlots >= policy.defaultOutboundHardLimit) {
    throw new Error("Terminal message reserved slots must be lower than the default outbound hard limit.");
  }
  if (
    policy.defaultWarningPercent < 0 ||
    policy.defaultWarningPercent > 100
  ) {
    throw new Error("Warning threshold must be between 0 and 100 percent.");
  }
  if (policy.lifetimeFreeRecoveryAllowance < 0) {
    throw new Error("Lifetime Free recovery allowance must be non-negative.");
  }
  if (
    policy.minimumUpgradePremiumBps < 0 ||
    policy.minimumUpgradePremiumBps > 10_000
  ) {
    throw new Error("Minimum upgrade premium must be between 0 and 10000 bps.");
  }
}

function serializablePolicy(policy) {
  if (!policy) return null;
  return {
    id: policy.id,
    globalPauseNewRecoveries: policy.globalPauseNewRecoveries,
    globalPauseAutomatedWhatsapp: policy.globalPauseAutomatedWhatsapp,
    lifetimeFreeRecoveryAllowance: policy.lifetimeFreeRecoveryAllowance,
    minimumUpgradePremiumBps: policy.minimumUpgradePremiumBps,
    absoluteOutboundHardLimit: policy.absoluteOutboundHardLimit,
    defaultWarningPercent: policy.defaultWarningPercent,
    defaultOutboundSoftLimit: policy.defaultOutboundSoftLimit,
    defaultOutboundHardLimit: policy.defaultOutboundHardLimit,
    terminalMessageReservedSlots: policy.terminalMessageReservedSlots,
    version: policy.version,
    createdAt: policy.createdAt?.toISOString?.() ?? policy.createdAt ?? null,
    updatedAt: policy.updatedAt?.toISOString?.() ?? policy.updatedAt ?? null,
  };
}

async function readSnapshot() {
  try {
    return JSON.parse(await fs.readFile(SNAPSHOT_PATH, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function ensureSnapshot() {
  const existingSnapshot = await readSnapshot();
  if (existingSnapshot) return existingSnapshot;

  const current = await prisma.platformBillingPolicy.findUnique({
    where: { id: "default" },
  });
  const snapshot = {
    capturedAt: new Date().toISOString(),
    existed: Boolean(current),
    policy: serializablePolicy(current),
  };

  await fs.mkdir(STATE_DIR, { recursive: true });
  await fs.writeFile(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  return snapshot;
}

async function seed(profileName) {
  requireConfirmation();
  await ensureSnapshot();
  const values = buildPolicy(profileName);

  return prisma.$transaction(
    async (transaction) => {
      const before = await transaction.platformBillingPolicy.findUnique({
        where: { id: "default" },
      });

      const after = await transaction.platformBillingPolicy.upsert({
        where: { id: "default" },
        create: {
          id: "default",
          ...values,
          version: 0,
        },
        update: {
          ...values,
          version: { increment: 1 },
        },
      });

      return {
        before: serializablePolicy(before),
        after: serializablePolicy(after),
      };
    },
    TRANSACTION_OPTIONS,
  );
}

async function restore() {
  requireConfirmation();
  const snapshot = await readSnapshot();
  if (!snapshot) {
    throw new Error(
      `No snapshot exists at ${SNAPSHOT_PATH}. Nothing can be restored safely.`,
    );
  }

  const result = await prisma.$transaction(
    async (transaction) => {
      const before = await transaction.platformBillingPolicy.findUnique({
        where: { id: "default" },
      });

      if (!snapshot.existed) {
        await transaction.platformBillingPolicy.deleteMany({
          where: { id: "default" },
        });
        return {
          before: serializablePolicy(before),
          after: null,
        };
      }

      if (!snapshot.policy) {
        throw new Error("Snapshot says a policy existed but contains no policy data.");
      }

      const original = snapshot.policy;
      const restoreValues = {
        globalPauseNewRecoveries: original.globalPauseNewRecoveries,
        globalPauseAutomatedWhatsapp: original.globalPauseAutomatedWhatsapp,
        lifetimeFreeRecoveryAllowance: original.lifetimeFreeRecoveryAllowance,
        minimumUpgradePremiumBps: original.minimumUpgradePremiumBps,
        absoluteOutboundHardLimit: original.absoluteOutboundHardLimit,
        defaultWarningPercent: original.defaultWarningPercent,
        defaultOutboundSoftLimit: original.defaultOutboundSoftLimit,
        defaultOutboundHardLimit: original.defaultOutboundHardLimit,
        terminalMessageReservedSlots: original.terminalMessageReservedSlots,
        version: original.version,
      };
      validatePolicy(restoreValues);

      const after = await transaction.platformBillingPolicy.upsert({
        where: { id: "default" },
        create: {
          id: "default",
          ...restoreValues,
          ...(original.createdAt ? { createdAt: new Date(original.createdAt) } : {}),
          ...(original.updatedAt ? { updatedAt: new Date(original.updatedAt) } : {}),
        },
        update: {
          ...restoreValues,
          ...(original.createdAt ? { createdAt: new Date(original.createdAt) } : {}),
          ...(original.updatedAt ? { updatedAt: new Date(original.updatedAt) } : {}),
        },
      });

      return {
        before: serializablePolicy(before),
        after: serializablePolicy(after),
      };
    },
    TRANSACTION_OPTIONS,
  );

  await fs.rm(SNAPSHOT_PATH, { force: true });
  return result;
}

async function deletePolicy() {
  requireConfirmation();
  if (!hasFlag(ALLOW_UNCONFIGURED_FLAG)) {
    throw new Error(
      `Deletion refused. Re-run with ${ALLOW_UNCONFIGURED_FLAG} to confirm you intentionally want PlatformBillingPolicy to be unconfigured.`,
    );
  }

  await ensureSnapshot();
  return prisma.$transaction(
    async (transaction) => {
      const before = await transaction.platformBillingPolicy.findUnique({
        where: { id: "default" },
      });
      const deleted = await transaction.platformBillingPolicy.deleteMany({
        where: { id: "default" },
      });
      return {
        deleted: deleted.count,
        before: serializablePolicy(before),
      };
    },
    TRANSACTION_OPTIONS,
  );
}

function printPolicy(title, policy) {
  console.log("");
  console.log(title);
  console.log("=".repeat(title.length));
  if (!policy) {
    console.log("PlatformBillingPolicy is not configured.");
    return;
  }

  console.table([
    {
      id: policy.id,
      pauseRecoveries: policy.globalPauseNewRecoveries,
      pauseWhatsapp: policy.globalPauseAutomatedWhatsapp,
      lifetimeFree: policy.lifetimeFreeRecoveryAllowance,
      upgradePremiumBps: policy.minimumUpgradePremiumBps,
      absoluteHard: policy.absoluteOutboundHardLimit,
      warningPercent: policy.defaultWarningPercent,
      defaultSoft: policy.defaultOutboundSoftLimit,
      defaultHard: policy.defaultOutboundHardLimit,
      terminalReserved: policy.terminalMessageReservedSlots,
      version: policy.version,
    },
  ]);
}

async function status() {
  const [policy, snapshot] = await Promise.all([
    prisma.platformBillingPolicy.findUnique({ where: { id: "default" } }),
    readSnapshot(),
  ]);

  printPolicy("Current PlatformBillingPolicy", serializablePolicy(policy));
  console.log("");
  if (snapshot) {
    console.log(`Baseline snapshot: ${SNAPSHOT_PATH}`);
    console.log(`Captured at: ${snapshot.capturedAt}`);
    console.log(`Original policy existed: ${snapshot.existed ? "yes" : "no"}`);
  } else {
    console.log("Baseline snapshot: none");
  }
}

async function main() {
  const [command, target] = process.argv.slice(2);

  if (!command || command === "--help" || command === "-h") {
    console.log(usage());
    return;
  }

  if (command === "status") {
    await status();
    return;
  }

  if (command === "seed") {
    const profileName = target ?? "canonical";
    const result = await seed(profileName);
    printPolicy("Seeded PlatformBillingPolicy", result.after);
    console.log("");
    console.log(`Original baseline preserved at: ${SNAPSHOT_PATH}`);
    console.log(
      "Use `node scripts/seed-platform-billing-policy.mjs restore --confirm-test-data` when manual testing is complete.",
    );
    return;
  }

  if (command === "restore") {
    const result = await restore();
    printPolicy("Restored PlatformBillingPolicy", result.after);
    console.log("");
    console.log("Baseline snapshot removed after successful restore.");
    return;
  }

  if (command === "delete") {
    const result = await deletePolicy();
    console.log("");
    console.log("PlatformBillingPolicy deleted");
    console.log("=============================");
    console.log(`Rows deleted: ${result.deleted}`);
    console.log(`Original baseline preserved at: ${SNAPSHOT_PATH}`);
    return;
  }

  throw new Error(`Unknown command "${command}".\n\n${usage()}`);
}

main()
  .catch((error) => {
    console.error(
      `seed-platform-billing-policy: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
