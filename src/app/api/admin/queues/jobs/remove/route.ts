import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createLogger } from "@modainteract/moda-interact-shared/logging";

import {
  PlatformAdminUnauthorizedError,
  requirePlatformAdminMutation,
} from "@/lib/auth/platform-admin";
import { resolveDeploymentEnvironmentName } from "@/lib/auth/environment";
import { logAdminSecurityEvent } from "@/lib/auth/audit";
import {
  QueueJobRemovalError,
  removeFailedQueueJob,
} from "@/lib/admin/queue-job-removal";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const HEADERS = { "Cache-Control": "no-store" };
const logger = createLogger({
  serviceNamespace: "moda-interact",
  serviceName: "moda-interact-admin",
  environment: resolveDeploymentEnvironmentName(),
});

function json(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: HEADERS });
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;
  try {
    const supplied = new URL(origin);
    return (
      (supplied.protocol === "https:" || supplied.hostname === "localhost") &&
      supplied.host === host
    );
  } catch {
    return false;
  }
}

function parseRemovalRequest(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).sort().join(",") !==
      "confirmJobId,jobId,jobName,queueName" ||
    typeof record.queueName !== "string" ||
    typeof record.jobName !== "string" ||
    typeof record.jobId !== "string" ||
    typeof record.confirmJobId !== "string" ||
    record.confirmJobId !== record.jobId
  )
    return null;
  return {
    queueName: record.queueName,
    jobName: record.jobName,
    jobId: record.jobId,
  };
}

export async function POST(request: Request) {
  let principal;
  try {
    principal = await requirePlatformAdminMutation();
  } catch (error) {
    if (error instanceof PlatformAdminUnauthorizedError)
      return json("unauthorized", 401);
    logger.error("admin.queue_job.authorization_failed", { error });
    return json("unavailable", 503);
  }
  if (principal.role !== "SUPER_ADMIN" || principal.developmentBypass)
    return json("forbidden", 403);
  if (!sameOrigin(request)) return json("forbidden", 403);
  if (
    request.headers.get("content-type")?.split(";", 1)[0]?.trim() !==
    "application/json"
  ) {
    return json("invalid_request", 400);
  }
  const raw = await request.text();
  if (raw.length > 2_048) return json("invalid_request", 400);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return json("invalid_request", 400);
  }
  const input = parseRemovalRequest(parsed);
  if (!input) return json("invalid_request", 400);
  const resourceId = createHash("sha256")
    .update(`${input.queueName}\u0000${input.jobId}`)
    .digest("hex");
  try {
    await removeFailedQueueJob(input);
    logAdminSecurityEvent("admin.queue_job.removed", {
      adminId: principal.id,
      role: principal.role,
      action: "remove-failed-job",
      resourceType: "bullmq-job",
      resourceId,
      outcome: "succeeded",
    });
    return NextResponse.json({ result: "removed" }, { headers: HEADERS });
  } catch (error) {
    const code =
      error instanceof QueueJobRemovalError ? error.code : "unavailable";
    logger.error("admin.queue_job.removal_failed", {
      queueName: input.queueName,
      jobIdentityHash: resourceId,
      error,
    });
    logAdminSecurityEvent("admin.queue_job.removal_denied", {
      adminId: principal.id,
      role: principal.role,
      action: "remove-failed-job",
      resourceType: "bullmq-job",
      resourceId,
      outcome: "failed",
      reasonCode: code,
    });
    const status =
      code === "invalid"
        ? 400
        : code === "not_found"
          ? 404
          : code === "conflict"
            ? 409
            : 503;
    return json(code, status);
  }
}
