/** Server-private credential/provider boundary. Never imported by Client Components. */
import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import {
  loadConfigUnsealKeyring,
  unsealSecret,
  type UnsealKeyring,
} from "./seal";
import { validateSecretPayload } from "./secret-validation";
import { SenderPoolError } from "./whatsapp-sender-pool-types";
import { poolFailure } from "./whatsapp-sender-pool-diagnostics";
export type SenderSnapshot = {
  version: number;
  providerAccountId: string;
  legacyPhoneNumberId: string;
  accessToken: string;
  sealedDigest: string;
};
export const sealedDigest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function decodeSenderSnapshot(
  row: { version: number; value: unknown },
  environment: string,
  wrapping: UnsealKeyring,
): SenderSnapshot {
  const plaintext = unsealSecret({
    environment,
    key: "messaging.sender",
    version: row.version,
    value: row.value,
    wrapping,
  });
  let decoded: unknown;
  try {
    decoded = JSON.parse(plaintext);
  } catch (cause) {
    throw new Error("Saved sender configuration JSON is invalid", { cause });
  }
  const values = validateSecretPayload("messaging.sender", decoded);
  return {
    version: row.version,
    providerAccountId: values.businessAccountId as string,
    legacyPhoneNumberId: values.phoneNumberId as string,
    accessToken: values.accessToken as string,
    sealedDigest: sealedDigest(row.value),
  };
}
export async function readSenderSnapshot(
  db: Pick<PrismaClient, "platformConfiguration">,
  environment: string,
  wrapping?: UnsealKeyring,
): Promise<SenderSnapshot> {
  try {
    const row = await db.platformConfiguration.findUnique({
      where: { environment_key: { environment, key: "messaging.sender" } },
    });
    if (!row) throw new Error("Saved sender configuration is missing");
    return decodeSenderSnapshot(
      row,
      environment,
      wrapping ?? loadConfigUnsealKeyring(),
    );
  } catch (cause) {
    poolFailure("read-configuration", cause);
    throw new SenderPoolError("CONFIGURATION_UNAVAILABLE", cause);
  }
}
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
/** One deadline covers every page, transport and JSON read; supplied next URLs are never followed. */
export async function verifyPhoneMembership(
  snapshot: SenderSnapshot,
  phoneId: string,
  fetcher: typeof fetch = fetch,
  deadlineMs = 10_000,
): Promise<void> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("Meta membership deadline exceeded"));
    }, deadlineMs);
  });
  const visited = new Set<string>();
  let after: string | undefined;
  try {
    for (;;) {
      const url = new URL(
        `https://graph.facebook.com/v25.0/${snapshot.providerAccountId}/phone_numbers`,
      );
      url.searchParams.set("fields", "id,status");
      url.searchParams.set("limit", "100");
      if (after) url.searchParams.set("after", after);
      const response = await Promise.race([
        fetcher(url, {
          method: "GET",
          headers: { Authorization: `Bearer ${snapshot.accessToken}` },
          cache: "no-store",
          redirect: "error",
          signal: controller.signal,
        }),
        deadline,
      ]);
      let body: unknown;
      try {
        body = await Promise.race([response.json(), deadline]);
      } catch (cause) {
        poolFailure("verify-membership", cause, [snapshot.accessToken], {
          status: response.status,
        });
        throw new SenderPoolError("PROVIDER_UNAVAILABLE", cause);
      }
      if (!response.ok) {
        const error = object(body) && object(body.error) ? body.error : {};
        const cause = new Error(
          typeof error.message === "string"
            ? error.message
            : "Meta phone membership request failed",
        );
        poolFailure("verify-membership", cause, [snapshot.accessToken], {
          status: response.status,
          ...(typeof error.code === "number" ? { metaCode: error.code } : {}),
          ...(typeof error.error_subcode === "number"
            ? { metaSubcode: error.error_subcode }
            : {}),
          ...(typeof error.message === "string"
            ? { metaMessage: error.message }
            : {}),
          requestId:
            typeof error.fbtrace_id === "string"
              ? error.fbtrace_id
              : (response.headers.get("x-fb-trace-id") ??
                response.headers.get("x-fb-request-id") ??
                undefined),
        });
        throw new SenderPoolError("PROVIDER_UNAVAILABLE", cause);
      }
      if (
        !object(body) ||
        !Array.isArray(body.data) ||
        body.data.length > 100 ||
        body.data.some(
          (item) =>
            !object(item) ||
            typeof item.id !== "string" ||
            !/^[0-9]{4,32}$/.test(item.id) ||
            (item.status !== undefined && typeof item.status !== "string"),
        )
      )
        throw new Error("Invalid Meta phone membership response shape");
      const match = body.data.find(
        (item) => (item as Record<string, unknown>).id === phoneId,
      ) as Record<string, unknown> | undefined;
      if (match) {
        if (match.status === "CONNECTED") return;
        throw new SenderPoolError("NOT_CONNECTED");
      }
      if (body.paging !== undefined && !object(body.paging))
        throw new Error("Invalid Meta paging envelope");
      const paging = body.paging as Record<string, unknown> | undefined;
      if (!paging || paging.next === undefined)
        throw new SenderPoolError("NOT_CONNECTED");
      if (
        typeof paging.next !== "string" ||
        !paging.next ||
        !object(paging.cursors) ||
        typeof paging.cursors.after !== "string" ||
        !paging.cursors.after ||
        paging.cursors.after.length > 4096 ||
        visited.has(paging.cursors.after)
      )
        throw new Error("Incomplete or repeated Meta paging cursor");
      after = paging.cursors.after;
      visited.add(after);
      if (visited.size > 100)
        throw new Error("Meta membership listing exceeds bounded page budget");
    }
  } catch (cause) {
    if (cause instanceof SenderPoolError) throw cause;
    poolFailure("verify-membership", cause, [snapshot.accessToken]);
    throw new SenderPoolError("PROVIDER_UNAVAILABLE", cause);
  } finally {
    clearTimeout(timer!);
  }
}
