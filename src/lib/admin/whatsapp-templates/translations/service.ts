import type { Prisma } from "@prisma/client";
import type { PlatformAdminPrincipal } from "../../../auth/platform-admin";
import { requireTemplateSuperAdmin } from "../authoring/service";
import {
  insertTranslationRun, readTranslationWorkspace, requestFailedTranslationRetry,
  type TranslationDatabase,
} from "./repository";
import type { TranslationWorkspaceState } from "./progress";

export type TranslationServices = {
  db: TranslationDatabase;
  principal: PlatformAdminPrincipal;
  ensureActor?: (tx: Prisma.TransactionClient) => Promise<void>;
};

export async function startWhatsAppTemplateTranslation(definitionId: string, services: TranslationServices): Promise<{
  runId: string; reused: boolean; state: TranslationWorkspaceState;
}> {
  requireTemplateSuperAdmin(services.principal);
  const result = await insertTranslationRun(services.db, { definitionId,
    actorId: services.principal.id, ensureActor: services.ensureActor });
  return { ...result, state: await readTranslationWorkspace(services.db, definitionId) };
}

export async function retryWhatsAppTemplateTranslation(definitionId: string, services: TranslationServices): Promise<{
  runId: string; retryRequested: number; state: TranslationWorkspaceState;
}> {
  requireTemplateSuperAdmin(services.principal);
  const result = await requestFailedTranslationRetry(services.db, { definitionId,
    actorId: services.principal.id, ensureActor: services.ensureActor });
  return { ...result, state: await readTranslationWorkspace(services.db, definitionId) };
}

export async function getWhatsAppTemplateTranslationState(definitionId: string, services: Omit<TranslationServices, "ensureActor">): Promise<TranslationWorkspaceState> {
  requireTemplateSuperAdmin(services.principal);
  return readTranslationWorkspace(services.db, definitionId);
}
