import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const routes = "src/app/(protected)/system-controls/whatsapp-templates";

test("platform defaults are discoverable and distinct from shop publication", () => {
  const catalogue = read("src/components/admin/whatsapp-templates/authoring/template-catalogue.tsx");
  const detail = read("src/components/admin/whatsapp-templates/authoring/template-saved-detail.tsx");
  const meta = read(`${routes}/[definitionId]/meta/page.tsx`);
  const publication = read(`${routes}/[definitionId]/publish/page.tsx`);
  const overview = read(`${routes}/defaults/page.tsx`);
  const selector = read("src/components/admin/whatsapp-templates/recovery-defaults/default-selection.tsx");
  assert.match(catalogue, /whatsapp-templates\/defaults/);
  assert.match(detail, /detail.kind === "META_RECOVERY"[\s\S]*Set as default/);
  assert.match(meta, /Set as default/);
  assert.match(publication, /<RecoveryDefaultSelection[\s\S]*<TemplatePublicationWorkspace/);
  assert.match(overview, /principal.role !== "SUPER_ADMIN"/);
  assert.match(overview, /Not configured/);
  assert.match(selector, /No merchant is required/);
  assert.match(selector, /Replace default/);
  assert.doesNotMatch(selector, /eligiblePublicationShops|confirmTemplatePublication|shopIds/);
});

test("server action uses session actor and safe errors; no supplied sender or shop identity", () => {
  const action = read("src/app/actions/whatsapp-recovery-template-defaults.ts");
  const service = read("src/lib/admin/whatsapp-templates/recovery-defaults/service.ts");
  assert.match(action, /await requirePlatformAdminMutation\(\)/);
  assert.match(action, /requireTemplateSuperAdmin\(principal\)/);
  assert.match(action, /logger.error\([^\n]+\{ operation, error \}/);
  assert.match(service, /configuredSenderWaba\(tx\)/);
  assert.match(service, /lockCommonActivation\(tx\)/);
  assert.match(service, /requireDefaultEvidence: true/);
  assert.match(service, /assertCommonSourceGate\(tx, definitionId, "assignment"\)/);
  assert.match(service, /TransactionIsolationLevel.Serializable/);
  assert.doesNotMatch(service, /tx\.(?:shop|whatsAppTemplateVariant|whatsAppTemplatePublicationOperation|whatsAppTemplatePublicationTarget)\./);
});
