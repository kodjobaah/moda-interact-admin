import type { PrismaClient } from "@prisma/client";
import type { PlatformAdminPrincipal } from "../../../auth/platform-admin";
import { requireTemplateSuperAdmin } from "../authoring/service";
import { DEFINITION_ID, MetaSubmissionError, type MetaSubmissionPlan, type MetaStatusView } from "./contracts";
import { readMetaPlan } from "./repository";
import { readMetaStatus } from "./status";

export type MetaDashboardData = {
  definitionId: string; status: MetaStatusView;
  plan: MetaSubmissionPlan | null; previewIssue: string | null;
};

export async function readMetaDashboard(definitionId: string, deps: {
  db: PrismaClient; principal: PlatformAdminPrincipal; trustedWabaId: string;
}): Promise<MetaDashboardData> {
  requireTemplateSuperAdmin(deps.principal);
  if (!DEFINITION_ID.test(definitionId)) throw new MetaSubmissionError("INVALID_INPUT", "Invalid definition ID.");
  const status = await readMetaStatus(definitionId, deps);
  try {
    const plan = await readMetaPlan(deps.db, definitionId, deps.trustedWabaId);
    return { definitionId, status, plan, previewIssue: null };
  } catch (cause) {
    if (!(cause instanceof MetaSubmissionError)) throw cause;
    return { definitionId, status, plan: null, previewIssue: cause.message };
  }
}
