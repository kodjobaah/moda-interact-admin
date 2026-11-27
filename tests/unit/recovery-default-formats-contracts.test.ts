import assert from "node:assert/strict";
import { test } from "node:test";
import {
  recoveryFormat,
  RECOVERY_DEFAULT_FORMATS,
  RECOVERY_DEFAULT_PURPOSES,
} from "../../src/lib/admin/whatsapp-templates/recovery-defaults/contracts.ts";

test("one TEXT family includes text and headerless templates; IMAGE remains independent", () => {
  assert.equal(recoveryFormat("NONE"), "TEXT");
  assert.equal(recoveryFormat("TEXT"), "TEXT");
  assert.equal(recoveryFormat("IMAGE"), "IMAGE");
  const slots = RECOVERY_DEFAULT_PURPOSES.flatMap((purpose) =>
    RECOVERY_DEFAULT_FORMATS.map((format) => `${purpose}:${format}`),
  );
  assert.equal(new Set(slots).size, 12);
});
