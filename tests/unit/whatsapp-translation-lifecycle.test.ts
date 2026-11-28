import assert from "node:assert/strict";
import { test } from "node:test";
import type { Prisma } from "@prisma/client";
import { REVIEW_LANGUAGES } from "../../src/lib/admin/whatsapp-templates/compilation/language-codes";
import {
  canSynchroniseTranslationLifecycle,
  synchroniseCompletedTranslationLifecycle,
} from "../../src/lib/admin/whatsapp-templates/compilation/translation-lifecycle";

function fixture() {
  const definition = {
    id: "definition",
    status: "TRANSLATION_QUEUED",
    sourceHash: "a".repeat(64),
    retiredAt: null as Date | null,
    publishedAt: null as Date | null,
  };
  const run = {
    status: "COMPLETED",
    sourceHash: definition.sourceHash,
    items: REVIEW_LANGUAGES.filter((tag) => tag !== "en").map(
      (targetLanguageTag) => ({
        targetLanguageTag,
        status: "AVAILABLE",
        failureCode: null as string | null,
        outputContentHash: "b".repeat(64) as string | null,
        currentBatchId: null as string | null,
        translatedAst: { schemaVersion: 1, segments: [] } as unknown,
      }),
    ),
  };
  const writes: unknown[] = [];
  const tx = {
    whatsAppTemplateDefinition: {
      updateMany: async (input: unknown) => {
        writes.push(input);
        definition.status = "READY_FOR_REVIEW";
        return { count: 1 };
      },
    },
  } as unknown as Prisma.TransactionClient;
  return { definition, run, writes, tx };
}

test("completed current-source run repairs stale queued status exactly once without touching approvals", async () => {
  const { definition, run, writes, tx } = fixture();
  const unchangedRun = structuredClone(run);
  assert.equal(canSynchroniseTranslationLifecycle(definition, run), true);
  assert.equal(
    await synchroniseCompletedTranslationLifecycle(tx, definition, run),
    true,
  );
  assert.equal(definition.status, "READY_FOR_REVIEW");
  assert.deepEqual(run, unchangedRun);
  assert.equal(
    await synchroniseCompletedTranslationLifecycle(tx, definition, run),
    false,
  );
  assert.deepEqual(writes, [
    {
      where: {
        id: definition.id,
        status: "TRANSLATION_QUEUED",
        sourceHash: definition.sourceHash,
        publishedAt: null,
        retiredAt: null,
      },
      data: { status: "READY_FOR_REVIEW" },
    },
  ]);
});

for (const [name, mutate] of [
  [
    "pending run",
    (f: ReturnType<typeof fixture>) => {
      f.run.status = "PROCESSING";
    },
  ],
  [
    "stale source",
    (f: ReturnType<typeof fixture>) => {
      f.run.sourceHash = "c".repeat(64);
    },
  ],
  [
    "missing language",
    (f: ReturnType<typeof fixture>) => {
      f.run.items.pop();
    },
  ],
  [
    "duplicate language",
    (f: ReturnType<typeof fixture>) => {
      f.run.items[0].targetLanguageTag = f.run.items[1].targetLanguageTag;
    },
  ],
  [
    "failed item",
    (f: ReturnType<typeof fixture>) => {
      f.run.items[0].failureCode = "FAILED";
    },
  ],
  [
    "pending item",
    (f: ReturnType<typeof fixture>) => {
      f.run.items[0].status = "PENDING";
    },
  ],
  [
    "missing payload",
    (f: ReturnType<typeof fixture>) => {
      f.run.items[0].translatedAst = null;
    },
  ],
  [
    "active batch",
    (f: ReturnType<typeof fixture>) => {
      f.run.items[0].currentBatchId = "batch";
    },
  ],
  [
    "missing digest",
    (f: ReturnType<typeof fixture>) => {
      f.run.items[0].outputContentHash = null;
    },
  ],
  [
    "published definition",
    (f: ReturnType<typeof fixture>) => {
      f.definition.status = "PUBLISHED";
      f.definition.publishedAt = new Date();
    },
  ],
  [
    "retired definition",
    (f: ReturnType<typeof fixture>) => {
      f.definition.status = "RETIRED";
      f.definition.retiredAt = new Date();
    },
  ],
] as const) {
  test(`status repair refuses ${name}`, async () => {
    const f = fixture();
    mutate(f);
    assert.equal(
      canSynchroniseTranslationLifecycle(f.definition, f.run),
      false,
    );
    assert.equal(
      await synchroniseCompletedTranslationLifecycle(f.tx, f.definition, f.run),
      false,
    );
    assert.equal(f.writes.length, 0);
  });
}
