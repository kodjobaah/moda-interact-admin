import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const page = await readFile(
  new URL("../../src/app/(protected)/merchant-support/page.tsx", import.meta.url),
  "utf8",
);
const inbox = await readFile(
  new URL("../../src/components/admin/merchant-support-inbox.tsx", import.meta.url),
  "utf8",
);

test("merchant support route requires a platform admin and invokes first-read detail capability", () => {
  assert.match(page, /requirePlatformAdminPage/);
  assert.match(page, /getMerchantSupportThread\(threadId\)/);
  assert.match(page, /getPendingMerchantSupportThreads/);
});

test("merchant support UI routes mutations through accepted server actions", () => {
  assert.match(inbox, /composeAdministrativeMessageAction/);
  assert.match(inbox, /takeMerchantSupportThreadOwnershipAction/);
  assert.match(inbox, /requestTranslationReconciliationAction/);
  assert.match(inbox, /requestFailedTranslationsReconciliationAction/);
  assert.doesNotMatch(inbox, /new Queue\(|fetch\([^)]*redis|openai/i);
});

test("merchant support UI uses shared body validation and plain text rendering", () => {
  assert.match(inbox, /AuthoredSupportBodySchema/);
  assert.match(inbox, /countUnicodeGraphemes/);
  assert.doesNotMatch(inbox, /countGraphemes|Intl\.Segmenter/);
  assert.match(inbox, /whitespace-pre-wrap break-words/);
  assert.doesNotMatch(inbox, /dangerouslySetInnerHTML|marked\(|ReactMarkdown/);
});

test("merchant support UI separates read state and exposes every translation view", () => {
  assert.match(inbox, /Read by support/);
  assert.match(inbox, /Unread by support/);
  assert.match(inbox, /Read by merchant/);
  assert.match(inbox, /Unread by merchant/);
  assert.match(inbox, /message\.translations\.map/);
  assert.match(inbox, /translation\.status === 'AVAILABLE'/);
  assert.match(inbox, /translation\.status === 'FAILED'/);
  assert.match(inbox, /requestTranslationReconciliationAction\(\{ translationId: translation\.id \}\)/);
  assert.match(inbox, /setSelectedTranslationId\(null\)/);
  assert.doesNotMatch(inbox, /latestTranslation|translationId: message\.translationId/);
});

test("global reconciliation and reassignment controls are SUPER_ADMIN gated", () => {
  assert.match(inbox, /principal\.role === 'SUPER_ADMIN'/);
  assert.match(inbox, /reassignMerchantSupportThreadOwnershipAction/);
  assert.match(inbox, /requestFailedTranslationsReconciliationAction/);
});

test('merchant support search is a bounded accessible autocomplete', () => {
  assert.match(inbox, /getMerchantSupportShopSuggestionsAction/);
  assert.match(inbox, /setTimeout\(async \(\) =>/);
  assert.match(inbox, /}, 250\)/);
  assert.match(inbox, /query\.length < 2/);
  assert.match(inbox, /suggestionRequestSequence/);
  assert.match(inbox, /slice\(0, 8\)/);
  assert.match(inbox, /tenantName\(suggestion\.brandName, suggestion\.domain\)/);
  assert.match(inbox, /role="combobox"/);
  assert.match(inbox, /aria-autocomplete="list"/);
  assert.match(inbox, /role="listbox"/);
  assert.match(inbox, /role="option"/);
  assert.match(inbox, /event\.key === 'ArrowDown'/);
  assert.match(inbox, /event\.key === 'ArrowUp'/);
  assert.match(inbox, /event\.key === 'Enter'/);
  assert.match(inbox, /event\.key === 'Escape'/);
  assert.match(inbox, /thread: suggestion\.threadId/);
  assert.match(inbox, /page: 1/);
  assert.match(inbox, /search: null/);
  assert.doesNotMatch(inbox, /placeholder="Language tag"/);
});

test('translation language selector exposes the exact supported product languages', () => {
  const values = [...inbox.matchAll(/\{ value: '([^']+)', label: '([^']+)' \}/g)];
  assert.deepEqual(values.map(([, value]) => value), [
    'cs', 'da', 'de', 'en', 'es', 'fi', 'fr', 'it', 'ja', 'ko',
    'nb', 'nl', 'pl', 'pt-BR', 'pt-PT', 'sv', 'th', 'tr', 'zh-Hans', 'zh-Hant',
  ]);
  assert.deepEqual(values.map(([, , label]) => label), [
    'Czech', 'Danish', 'German', 'English', 'Spanish', 'Finnish', 'French',
    'Italian', 'Japanese', 'Korean', 'Norwegian Bokmål', 'Dutch', 'Polish',
    'Portuguese (Brazil)', 'Portuguese (Portugal)', 'Swedish', 'Thai', 'Turkish',
    'Chinese (Simplified)', 'Chinese (Traditional)',
  ]);
  assert.match(inbox, /SUPPORTED_TRANSLATION_LANGUAGE_OPTIONS/);
  assert.match(inbox, /<option value="">Select language…<\/option>/);
  assert.match(inbox, /requestAdditionalTranslationAction\(\{ messageId: message\.id, targetLanguageTag \}\)/);
  assert.doesNotMatch(inbox, /PLATFORM_SUPPORT_LANGUAGE_TAG|Intl\.DisplayNames|__other__|Other language|Custom BCP-47/);
});
