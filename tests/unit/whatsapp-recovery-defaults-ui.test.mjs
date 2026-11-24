import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const routes = "src/app/(protected)/system-controls/whatsapp-templates";
const publishing = "src/components/admin/whatsapp-templates/publishing";

test("one publication workspace exposes both scopes and retains the defaults overview", () => {
  const catalogue = read("src/components/admin/whatsapp-templates/authoring/template-catalogue.tsx");
  const detail = read("src/components/admin/whatsapp-templates/authoring/template-saved-detail.tsx");
  const meta = read(`${routes}/[definitionId]/meta/page.tsx`);
  const publication = read(`${routes}/[definitionId]/publish/page.tsx`);
  const overview = read(`${routes}/defaults/page.tsx`);
  const scope = read(`${publishing}/publication-scope-selector.tsx`);
  assert.match(catalogue, /whatsapp-templates\/defaults/);
  assert.match(detail, /detail.kind === "META_RECOVERY"[\s\S]*Publish template/);
  assert.match(meta, /Publish template/);
  assert.equal(publication.match(/<TemplatePublicationWorkspace\b/g)?.length, 1);
  assert.doesNotMatch(publication, /RecoveryDefaultSelection/);
  assert.ok(!existsSync(new URL("../../src/components/admin/whatsapp-templates/recovery-defaults/default-selection.tsx", import.meta.url)));
  assert.match(overview, /principal.role !== "SUPER_ADMIN"/);
  assert.match(overview, /Not configured/);
  assert.match(scope, /All existing and future shops/);
  assert.match(scope, /Future shops only/);
  assert.match(scope, /Future inheritance is currently implemented for Shopify/);
  assert.match(read(`${publishing}/publication-override-confirmation.tsx`), /Confirm publication/);
});

test("one server mutation uses session actor, same default checks and structured errors", () => {
  const action = read("src/app/actions/whatsapp-template-publication.ts");
  const defaults = read("src/app/actions/whatsapp-recovery-template-defaults.ts");
  const service = read("src/lib/admin/whatsapp-templates/recovery-defaults/service.ts");
  const unified = read("src/lib/admin/whatsapp-templates/publishing/unified.ts");
  assert.match(action, /await requirePlatformAdminMutation\(\)/);
  assert.match(action, /requireTemplateSuperAdmin\(principal\)/);
  assert.match(action, /logger.error\([^\n]+\{ \.\.\.context, error \}/);
  assert.match(action, /confirmScopedPublication\(input/);
  assert.doesNotMatch(defaults, /confirmRecoveryTemplateDefault|reviewRecoveryTemplateDefault/);
  assert.match(service, /configuredSenderWaba\(tx\)/);
  assert.match(service, /lockCommonActivation\(tx\)/);
  assert.match(service, /requireDefaultEvidence: true/);
  assert.match(service, /assertCommonSourceGate\(tx, definitionId, "assignment"\)/);
  assert.match(unified, /TransactionIsolationLevel.Serializable/);
  assert.match(unified, /persistVerifiedDefault[\s\S]*createConfirmedOperation\(tx/);
  assert.doesNotMatch(service, /tx\.(?:shop|whatsAppTemplateVariant|whatsAppTemplatePublicationOperation|whatsAppTemplatePublicationTarget)\./);
});

test("review screen offers guarded lifecycle synchronisation and a direct next step", () => {
  const review = read("src/components/admin/whatsapp-templates/compilation/translation-review-workspace.tsx");
  const service = read("src/lib/admin/whatsapp-templates/compilation/service.ts");
  const action = read("src/app/actions/whatsapp-template-compilation.ts");
  assert.match(review, /workspace.canSynchroniseLifecycle[\s\S]*Synchronise translation status/);
  assert.match(review, /workspace.readyForPublication[\s\S]*Continue to Meta approvals/);
  assert.match(service, /input.decision === "APPROVE"[\s\S]*synchroniseCompletedTranslationLifecycle/);
  assert.match(action, /logger.error\("admin.whatsapp_translation_status.failed", \{ definitionId, error \}\)/);
});
