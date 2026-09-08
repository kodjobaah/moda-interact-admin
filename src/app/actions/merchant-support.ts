'use server';

import {
  composeAdministrativeMessage,
  getMerchantSupportShopSuggestions,
  releaseMerchantSupportThreadOwnership,
  reassignMerchantSupportThreadOwnership,
  requestAdditionalTranslation,
  requestFailedTranslationReconciliation,
  requestFailedTranslationsReconciliation,
  takeMerchantSupportThreadOwnership,
} from '@/lib/admin/merchant-support';

export async function getMerchantSupportShopSuggestionsAction(input: {
  query: string;
}) {
  return getMerchantSupportShopSuggestions({ query: input.query, limit: 8 });
}

export async function composeAdministrativeMessageAction(input: {
  threadId: string;
  body: string;
}) {
  return composeAdministrativeMessage(input);
}

export async function requestTranslationReconciliationAction(input: {
  translationId: string;
}) {
  return requestFailedTranslationReconciliation(input);
}

export async function requestAdditionalTranslationAction(input: {
  messageId: string;
  targetLanguageTag: string;
}) {
  return requestAdditionalTranslation(input);
}

export async function requestFailedTranslationsReconciliationAction() {
  return requestFailedTranslationsReconciliation({});
}

export async function takeMerchantSupportThreadOwnershipAction(input: {
  threadId: string;
}) {
  return takeMerchantSupportThreadOwnership(input.threadId);
}

export async function releaseMerchantSupportThreadOwnershipAction(input: {
  threadId: string;
}) {
  return releaseMerchantSupportThreadOwnership(input.threadId);
}

export async function reassignMerchantSupportThreadOwnershipAction(input: {
  threadId: string;
  targetPlatformAdminId: string;
}) {
  return reassignMerchantSupportThreadOwnership(input);
}
