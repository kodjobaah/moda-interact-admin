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
