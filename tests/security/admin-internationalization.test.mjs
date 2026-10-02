import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";
import {
  createInternationalizationRuntime,
  validateIcuCatalogue,
} from "@modainteract/moda-interact-shared/internationalization";

const catalogue = JSON.parse(
  await readFile(
    new URL("../../src/i18n/locales/en.json", import.meta.url),
    "utf8",
  ),
);
const adapterSource = await readFile(
  new URL("../../src/i18n/index.ts", import.meta.url),
  "utf8",
);
const requiredKeysSource = await readFile(
  new URL("../../src/i18n/required-keys.ts", import.meta.url),
  "utf8",
);
const packageJson = JSON.parse(
  await readFile(new URL("../../package.json", import.meta.url), "utf8"),
);
async function readQueueMonitorSources() {
  const moduleDirectory = new URL(
    "../../src/components/admin/queue-monitor/",
    import.meta.url,
  );
  const entries = await readdir(moduleDirectory, { withFileTypes: true });
  const moduleUrls = entries
    .filter((entry) => entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name))
    .map((entry) => new URL(entry.name, moduleDirectory))
    .sort((left, right) => (left.href < right.href ? -1 : left.href > right.href ? 1 : 0));
  const sources = await Promise.all(
    [
      new URL("../../src/components/admin/queue-monitor.tsx", import.meta.url),
      ...moduleUrls,
    ].map((url) => readFile(url, "utf8")),
  );
  return sources.join("\n");
}

const queueMonitorSource = await readQueueMonitorSources();
const adminSource = await Promise.all(
  [
    "src/app/layout.tsx",
    "src/app/loading.tsx",
    "src/app/error.tsx",
    "src/app/login/page.tsx",
    "src/app/login/page.tsx",
    "src/app/(protected)/page.tsx",
    "src/components/admin/tenant-table.tsx",
    "src/components/admin/customer-table.tsx",
    "src/components/admin/recovery-table.tsx",
    "src/components/admin/observability-panel.tsx",
    "src/lib/observability/grafana.ts",
  ].map((relativePath) =>
    readFile(new URL(`../../${relativePath}`, import.meta.url), "utf8"),
  ),
).then((sources) => [...sources, queueMonitorSource].join("\n"));

const requiredKeys = [...requiredKeysSource.matchAll(/"([^"]+)"/g)].map(
  ([, key]) => key,
);

test("Admin validates and consumes the published Shared ICU runtime", () => {
  validateIcuCatalogue(catalogue, requiredKeys, { locale: "en" });
  assert.match(
    adapterSource,
    /@modainteract\/moda-interact-shared\/internationalization/,
  );
  assert.doesNotMatch(adapterSource, /new Intl\.(NumberFormat|DateTimeFormat)/);
  assert.doesNotMatch(adapterSource, /IntlMessageFormat/);
  assert.equal(
    packageJson.dependencies["@modainteract/moda-interact-shared"],
    "1.0.1",
  );
});

test("Admin canonical catalogue keys are independent and intentionally aligned", () => {
  assert.deepEqual([...requiredKeys].sort(), Object.keys(catalogue).sort());

  const missingKeyCatalogue = { ...catalogue };
  delete missingKeyCatalogue[requiredKeys[0]];
  assert.throws(
    () => validateIcuCatalogue(missingKeyCatalogue, requiredKeys, { locale: "en" }),
    /missing required keys/i,
  );
});

test("known WhatsApp sender types use bounded catalogue labels with raw fallback", () => {
  const runtime = createInternationalizationRuntime({
    locale: "en",
    catalogue,
  });

  for (const [key, expected] of [
    ["sender.CUSTOMER", "Customer"],
    ["sender.AGENT", "Agent"],
    ["sender.AUTOMATION", "Automation"],
    ["sender.HUMAN", "Human"],
  ]) {
    assert.equal(runtime.t(key), expected);
  }
  assert.match(
    adapterSource,
    /adminSenderLabel/,
  );
  assert.match(
    adapterSource,
    /export function adminSenderLabel\(value: string \| null \| undefined\): string \{\s+if \(!value\) return "—";\s+return Object\.hasOwn\(catalogue, `sender\.\$\{value\}`\)\s+\? adminI18n\.t\(`sender\.\$\{value\}`\)\s+: value;\s+\}/,
  );
});

test("current Admin surfaces do not bypass the shared locale and currency boundary", () => {
  assert.doesNotMatch(adminSource, /en-GB|GBP|toLocaleString|toLocaleTimeString/);
  for (const key of [
    "tenant.platformSummary",
    "search.customerPlaceholder",
    "empty.noRecoveries",
    "queue.summary",
    "queue.jobDetails",
    "observability.dashboard",
    "auth.continueGoogle",
  ]) {
    assert.match(adminSource, new RegExp(key.replace(".", "\\.")));
  }
});

test("Admin catalogue supports ICU pluralisation and interpolation", () => {
  const runtime = createInternationalizationRuntime({
    locale: "en",
    catalogue,
  });

  assert.equal(runtime.t("pagination.items", { count: 1 }), "1 item");
  assert.equal(runtime.t("pagination.items", { count: 3 }), "3 items");
  assert.equal(
    runtime.t("pagination.page", { page: 2, totalPages: 4 }),
    "Page 2 of 4",
  );
});

test("Admin locale input is independent of currency and merchant content", () => {
  const runtime = createInternationalizationRuntime({
    locale: "fr-CA",
    catalogue,
  });

  assert.equal(runtime.locale, "fr-CA");
  assert.match(runtime.formatMoney(12.5, "EUR"), /12/);
  assert.doesNotMatch(
    adapterSource,
    /\bmerchant\b(?!-communications)|\bcustomer\b|currency.*locale|country.*locale/i,
  );
});

test("Admin catalogue validation rejects missing required keys", () => {
  assert.throws(
    () => validateIcuCatalogue(catalogue, ["nav.missing"]),
    /missing required keys/i,
  );
});
