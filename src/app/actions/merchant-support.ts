'use server';

import {
  composeAdministrativeMessage,
  requestAdditionalTranslation,
  requestFailedTranslationReconciliation,
  requestFailedTranslationsReconciliation,
} from '@/lib/admin/merchant-support';

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
