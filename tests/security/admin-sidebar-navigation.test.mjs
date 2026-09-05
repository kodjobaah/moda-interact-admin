import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { test } from "node:test";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const sourcePath = (relativePath) => path.join(repositoryRoot, relativePath);

async function readSource(relativePath) {
  return readFile(sourcePath(relativePath), "utf8");
}

test("sidebar exposes the approved nested Observability navigation", async () => {
  const sidebarSource = await readSource("src/components/admin/sidebar.tsx");
  const queuePageSource = await readSource(
    "src/app/(protected)/observability/queues/page.tsx",
  );

  assert.match(sidebarSource, /href="\/"/);
  assert.match(sidebarSource, /Tenant Directory/);
  assert.match(
    sidebarSource,
    /href="\/observability\/queues"\s+aria-current=\{observabilityActive \? "page" : undefined\}/,
  );
  assert.doesNotMatch(sidebarSource, /Overview/);
  assert.match(sidebarSource, /href="\/observability\/queues"/);
  assert.match(sidebarSource, /Shopify Queues/);
  assert.match(sidebarSource, /Grafana/);
  assert.match(sidebarSource, /active === ["']queues["']/);
  assert.match(
    sidebarSource,
    /active === ["']observability["'] \|\| active === ["']queues["']/,
  );
  assert.match(queuePageSource, /<AdminShell active="queues">/);
  assert.doesNotMatch(queuePageSource, /href="\/observability"/);
});

test("sidebar uses a stable desktop rail and bottom administrator treatment", async () => {
  const sidebarSource = await readSource("src/components/admin/sidebar.tsx");
  const shellSource = await readSource("src/components/admin/admin-shell.tsx");

  assert.match(sidebarSource, /w-60 shrink-0/);
  assert.match(sidebarSource, /administratorRole/);
  assert.match(sidebarSource, /roleLabel/);
  assert.match(sidebarSource, /border-t border-\[var\(--brand-200\)\]/);
  assert.match(sidebarSource, /<LogoutForm \/>/);
  assert.match(shellSource, /getPlatformAdminPrincipal/);
  assert.match(shellSource, /administratorRole=\{principal\?\.role/);
});

test("navigation does not add unavailable mockup destinations", async () => {
  const sidebarSource = await readSource("src/components/admin/sidebar.tsx");

  assert.doesNotMatch(sidebarSource, /href="\/(dashboard|billing|settings)"/);
  assert.doesNotMatch(sidebarSource, /Dashboard|Billing|Settings/);
});

test("Grafana navigation uses an existing validated destination or the overview route", async () => {
  const shellSource = await readSource("src/components/admin/admin-shell.tsx");
  const sidebarSource = await readSource("src/components/admin/sidebar.tsx");

  assert.match(shellSource, /getGrafanaNavigation/);
  assert.match(
    shellSource,
    /grafanaNavigation\.links\[0\]\?\.href \?\? ["']\/observability["']/,
  );
  assert.match(sidebarSource, /href=\{grafanaHref\}/);
  assert.match(sidebarSource, /noopener noreferrer/);
});
