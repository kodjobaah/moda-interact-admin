"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requirePlatformAdminMutation } from "@/lib/auth/platform-admin";
import { prisma } from "@/lib/prisma";
import { McpPolicyConflict, parseMcpPolicyEdit, updateMcpPolicy } from "@/lib/admin/mcp-execution-policy";

export type McpPolicyActionResult =
  | { ok: true }
  | { ok: false; message: string; conflict?: boolean };

export async function mutateMcpExecutionPolicyAction(form: FormData): Promise<McpPolicyActionResult> {
  try {
    const principal = await requirePlatformAdminMutation();
    if (principal.role !== "SUPER_ADMIN") return { ok: false, message: "SUPER_ADMIN access is required." };
    const edit = parseMcpPolicyEdit(form);
    const actorId = principal.developmentBypass
      ? (await prisma.platformAdmin.findFirst({ where: { role: "SUPER_ADMIN", active: true }, select: { id: true } }))?.id
      : principal.id;
    if (!actorId) return { ok: false, message: "Provision a SUPER_ADMIN account before editing MCP policy." };

    await prisma.$transaction(
      async (tx) => updateMcpPolicy(tx, edit, actorId),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    revalidatePath("/system-controls/platform-policy");
    return { ok: true };
  } catch (cause) {
    if (cause instanceof McpPolicyConflict || (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2034")) {
      return { ok: false, conflict: true, message: "Platform policy changed. Reload the page and retry." };
    }
    if (cause instanceof Error && /^(Tool deadline|Provider response timeout|Maximum provider requests|Maximum response bytes|MCP execution policy|Unsupported MCP|Choose a valid|Invalid policy|An audit reason|Platform Billing Policy|This environment)/.test(cause.message)) {
      return { ok: false, message: cause.message };
    }
    return { ok: false, message: "MCP execution policy could not be updated. Reload and retry." };
  }
}
