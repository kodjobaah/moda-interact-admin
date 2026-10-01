import assert from "node:assert/strict";
import test from "node:test";
import {
  validateOpenRouterCredentialMutation,
  validateOpenRouterCredentialSecret,
} from "../../src/lib/admin/openrouter-credential-validation.ts";

test("secret validation preserves exact UTF-8 input and checks byte length", () => {
  const secret = "  credential-é  ";
  assert.equal(validateOpenRouterCredentialSecret(secret), secret);
  assert.equal(
    validateOpenRouterCredentialSecret("x".repeat(8192)).length,
    8192,
  );
  for (const value of ["", "x".repeat(8193), "a\rb", "a\nb", "a\0b"]) {
    assert.throws(() => validateOpenRouterCredentialSecret(value), {
      message: "OpenRouter credential is invalid.",
    });
  }
  assert.throws(() => validateOpenRouterCredentialSecret("secret-marker\n"), {
    message: "OpenRouter credential is invalid.",
  });
});

test("mutation metadata is trimmed and edit versions must be positive integers", () => {
  assert.deepEqual(
    validateOpenRouterCredentialMutation({
      operationId: " op-1 ",
      reason: " reason ",
      expectedEditVersion: 2,
      secret: " secret ",
    }),
    {
      operationId: "op-1",
      reason: "reason",
      expectedEditVersion: 2,
      secret: " secret ",
    },
  );
  for (const version of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "1"]) {
    assert.throws(() =>
      validateOpenRouterCredentialMutation({
        operationId: "op-1",
        reason: "reason",
        expectedEditVersion: version,
      }),
    );
  }
});
