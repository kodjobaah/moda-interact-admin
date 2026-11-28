import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  parseOptions,
  validateDeletion,
} from "../../scripts/merchant-data-deletion-core.mjs";

const shop = {
  id: "test-shop",
  platform: "SHOPIFY",
  domain: "demo-store-test-plus-prod.myshopify.com",
};
const env = {
  NODE_ENV: "production",
  DATABASE_URL:
    "postgresql://admin:secret@db.example.com:5432/moda_interact_postgres_production",
  MODA_PRELAUNCH_RESET_AUTHORIZATION: "PRELAUNCH_TEST_DATA_ONLY",
};

function flags(path) {
  return parseOptions([
    "delete",
    "--shop",
    shop.domain,
    "--confirm-shop",
    shop.domain,
    "--confirm-test-data",
    "--confirm-workers-stopped",
    "--prelaunch-production-reset",
    "--confirm-database",
    "moda_interact_postgres_production",
    "--backup-file",
    path,
  ]);
}

test("prelaunch flags are explicit; ordinary mode rejects the production database even if NODE_ENV lies", () => {
  const base = parseOptions([
    "delete",
    "--shop",
    shop.domain,
    "--confirm-shop",
    shop.domain,
    "--confirm-test-data",
    "--confirm-workers-stopped",
    "--allow-remote-development-db",
  ]);
  assert.equal(base.prelaunchProductionReset, undefined);
  assert.throws(
    () => validateDeletion(base, shop, {}, { ...env, NODE_ENV: "development" }),
    /Production/,
  );
  assert.throws(
    () =>
      parseOptions([
        "delete",
        "--shop",
        shop.domain,
        "--prelaunch-production-reset",
        "--prelaunch-production-reset",
      ]),
    /Duplicate option/,
  );
});

test("prelaunch is denied for missing authorisation, wrong database, Woo shops and missing backup", () => {
  const opts = flags("/tmp/missing-prelaunch-backup.dump");
  assert.throws(
    () =>
      validateDeletion(
        opts,
        shop,
        {},
        { ...env, MODA_PRELAUNCH_RESET_AUTHORIZATION: "" },
      ),
    /authorisation mismatch/,
  );
  assert.throws(
    () => validateDeletion(opts, { ...shop, platform: "WOOCOMMERCE" }, {}, env),
    /mismatch/,
  );
  assert.throws(
    () =>
      validateDeletion({ ...opts, confirmDatabase: "another" }, shop, {}, env),
    /mismatch/,
  );
  assert.throws(
    () =>
      validateDeletion(
        opts,
        shop,
        {},
        {
          ...env,
          DATABASE_URL: "postgresql://admin:secret@db.example.com/another",
        },
      ),
    /mismatch/,
  );
  assert.throws(
    () => validateDeletion(opts, shop, {}, env),
    /backup file is unavailable/,
  );
  assert.throws(
    () =>
      validateDeletion({ ...opts, backupFile: "relative.dump" }, shop, {}, env),
    /absolute --backup-file/,
  );
});

test("prelaunch allows a Shopify test tenant only with a readable archive identifying the exact database", () => {
  const folder = mkdtempSync(join(tmpdir(), "moda-prelaunch-test-"));
  const file = join(folder, "database.dump");
  const restore = join(folder, "pg_restore");
  const oldPath = process.env.PATH;
  try {
    writeFileSync(file, Buffer.alloc(2048));
    writeFileSync(
      restore,
      '#!/bin/sh\nprintf ";     dbname: moda_interact_postgres_production\\n"\n',
    );
    chmodSync(restore, 0o700);
    process.env.PATH = `${folder}:${oldPath}`;
    const opts = flags(file);
    assert.doesNotThrow(() => validateDeletion(opts, shop, {}, env));
    assert.throws(
      () =>
        validateDeletion(
          { ...opts, confirmShop: "other.myshopify.com" },
          shop,
          {},
          env,
        ),
      /exactly match/,
    );
    assert.throws(
      () =>
        validateDeletion(
          { ...opts, confirmWorkersStopped: false },
          shop,
          {},
          env,
        ),
      /--confirm-workers-stopped/,
    );
    writeFileSync(
      restore,
      '#!/bin/sh\nprintf ";     dbname: another_database\\n"\n',
    );
    assert.throws(
      () => validateDeletion(opts, shop, {}, env),
      /exact target database/,
    );
  } finally {
    process.env.PATH = oldPath;
    rmSync(folder, { recursive: true, force: true });
  }
});
