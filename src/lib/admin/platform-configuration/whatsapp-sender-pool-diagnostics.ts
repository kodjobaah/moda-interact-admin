import { createLogger } from "@modainteract/moda-interact-shared/logging";
import { resolveDeploymentEnvironmentName } from "@/lib/auth/environment";
const logger = createLogger({
  serviceName: "moda-interact-admin",
  environment: resolveDeploymentEnvironmentName(),
});
/** Domain adapter only: the shared logger owns serialization, bounds and sink isolation. */
export function poolFailure(
  operation: string,
  cause: unknown,
  secrets: string[] = [],
  detail: {
    status?: number;
    metaCode?: number;
    metaSubcode?: number;
    metaMessage?: string;
    requestId?: string;
  } = {},
) {
  const scrub = (text: string) => {
    let value = text;
    for (const secret of secrets
      .filter(Boolean)
      .flatMap((value) => [value, encodeURIComponent(value)]))
      value = value.split(secret).join("[REDACTED]");
    return value
      .replace(
        /https:\/\/graph\.facebook\.com\/[^\s"'<>]+/gi,
        "[Meta endpoint]",
      )
      .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
      .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi, "$1[REDACTED]@")
      .replace(/("accessToken"\s*:\s*")[^"]*/gi, "$1[REDACTED]")
      .replace(/access_token[=:\s]+[^\s&]+/gi, "access_token=[REDACTED]")
      .slice(0, 1500);
  };
  logger.error("admin.whatsapp_sender_pool.failed", {
    operation,
    errorMessage: scrub(
      cause instanceof Error
        ? cause.message
        : "Unknown sender inventory failure",
    ),
    ...(detail.status ? { status: detail.status } : {}),
    ...(detail.metaCode !== undefined ? { metaCode: detail.metaCode } : {}),
    ...(detail.metaSubcode !== undefined
      ? { metaSubcode: detail.metaSubcode }
      : {}),
    ...(detail.metaMessage ? { metaMessage: scrub(detail.metaMessage) } : {}),
    ...(detail.requestId ? { requestId: scrub(detail.requestId) } : {}),
  });
}
