import assert from "node:assert/strict";
import test from "node:test";
import {
  parseCreateShopModelAvailabilityForm,
  parseSetModelAvailabilityEnabledForm,
} from "../../src/lib/admin/model-availability-validation.ts";

function form(values: Record<string, string>): FormData {
  const result = new FormData();
  for (const [name, value] of Object.entries(values)) result.set(name, value);
  return result;
}

test("Shop Availability creation trims and bounds canonical Shop identity and reason", () => {
  assert.deepEqual(
    parseCreateShopModelAvailabilityForm(
      form({ shopId: " shop-1 ", reason: " Configure Shop models " }),
    ),
    { shopId: "shop-1", reason: "Configure Shop models" },
  );
  assert.throws(
    () =>
      parseCreateShopModelAvailabilityForm(
        form({ shopId: " ", reason: "reason" }),
      ),
    /shopId must be between 1 and 128 characters/,
  );
  assert.throws(
    () =>
      parseCreateShopModelAvailabilityForm(
        form({ shopId: "x".repeat(129), reason: "reason" }),
      ),
    /shopId must be between 1 and 128 characters/,
  );
  assert.throws(
    () =>
      parseCreateShopModelAvailabilityForm(
        form({ shopId: "shop-1", reason: " " }),
      ),
    /reason must be between 1 and 1000 characters/,
  );
  assert.throws(
    () =>
      parseCreateShopModelAvailabilityForm(
        form({ shopId: "shop-1", reason: "x".repeat(1001) }),
      ),
    /reason must be between 1 and 1000 characters/,
  );
});

test("Shop Availability creation rejects caller-supplied identity or mutable state", () => {
  for (const key of ["scope", "id", "editVersion", "enabled"]) {
    assert.throws(
      () =>
        parseCreateShopModelAvailabilityForm(
          form({ shopId: "shop-1", reason: "create", [key]: "PLATFORM" }),
        ),
      /does not accept caller-supplied/,
    );
  }
});

test("enable form trims identity, parses a positive version, exact boolean and reason", () => {
  assert.deepEqual(
    parseSetModelAvailabilityEnabledForm(
      form({
        id: " availability-1 ",
        expectedEditVersion: "2",
        enabled: "false",
        reason: " Disable ",
      }),
    ),
    {
      id: "availability-1",
      expectedEditVersion: 2,
      enabled: false,
      reason: "Disable",
    },
  );
  for (const expectedEditVersion of [
    "0",
    "-1",
    "1.5",
    "x",
    "9007199254740992",
  ]) {
    assert.throws(
      () =>
        parseSetModelAvailabilityEnabledForm(
          form({
            id: "availability-1",
            expectedEditVersion,
            enabled: "true",
            reason: "change",
          }),
        ),
      /expectedEditVersion must be a positive integer/,
    );
  }
  for (const enabled of ["TRUE", "yes", "1", ""]) {
    assert.throws(
      () =>
        parseSetModelAvailabilityEnabledForm(
          form({
            id: "availability-1",
            expectedEditVersion: "1",
            enabled,
            reason: "change",
          }),
        ),
      /enabled must be true or false/,
    );
  }
});

test("enable form rejects scope and Shop identity mutation intents", () => {
  for (const key of ["scope", "shopId"]) {
    assert.throws(
      () =>
        parseSetModelAvailabilityEnabledForm(
          form({
            id: "availability-1",
            expectedEditVersion: "1",
            enabled: "true",
            reason: "change",
            [key]: "x",
          }),
        ),
      /scope and Shop are immutable/,
    );
  }
});
