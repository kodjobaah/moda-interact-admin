import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
const read = path => readFileSync(new URL(`../../${path}`,import.meta.url),'utf8');
const components='src/components/admin/whatsapp-templates/';
const lib='src/lib/admin/whatsapp-templates/';
const routes='src/app/(protected)/system-controls/whatsapp-templates/';
test('dashboard separates defaults from assigned versions and retains all four publication intents',()=>{
 const dashboard=read(components+'workflow/recovery-scenarios-dashboard.tsx');
 assert.match(dashboard,/RECOVERY_SCENARIOS\.map/); assert.match(dashboard,/Default for future shops/); assert.match(dashboard,/Existing shop assignments/); assert.match(dashboard,/View shop assignments/); assert.match(dashboard,/Version history/);
 const scope=read(components+'publishing/publication-scope-selector.tsx');
 for(const value of ['one','selected','all_future','future']) assert.ok(scope.includes(`"${value}"`));
 const assignments=read(lib+'workflow/shop-assignments.ts'); assert.match(assignments,/requireTemplateSuperAdmin/); assert.match(assignments,/configuredSenderWaba/); assert.match(assignments,/providerAccountId/); assert.doesNotMatch(assignments,/\$executeRaw|\.create\(|\.update\(|\.delete\(/);
});
test('workspace resumes actual stages and publication operations are explicit, scoped and authorised',()=>{
 const route=read(routes+'[definitionId]/workflow/page.tsx');
 for(const component of ['TemplateSavedDetail','TranslationReviewWorkspace','TemplateTranslationWorkspace','MetaTemplateDashboard','TemplatePublicationWorkspace']) assert.ok(route.includes(`<${component}`));
 assert.match(route,/principal\.role !== "SUPER_ADMIN"/); assert.match(route,/operation\.definitionId !== definitionId/); assert.match(route,/automatedOnboarding/);
});
test('bulk review is explicit and binds each candidate; combined publication acknowledges existing versions',()=>{
 const review=read(components+'workflow/consolidated-translation-review.tsx'); assert.match(review,/I have reviewed the selected translations/); assert.match(review,/!valid\|\|!ack/); assert.match(review,/contentHash: locale\.contentHash/);
 const service=read(lib+'compilation/service.ts'); assert.match(service,/candidate\?\.contentHash !== options\.expectedContentHash/); assert.match(service,/isolationLevel: Prisma\.TransactionIsolationLevel\.Serializable/); assert.match(service,/for \(const locale of input\.locales\)/);
 const publication=read(lib+'publishing/unified.ts'); assert.match(publication,/intent\.mode === "all_future" && state\.impactCounts\.replaced/); assert.match(publication,/!input\.acknowledgeOverrides/);
});
