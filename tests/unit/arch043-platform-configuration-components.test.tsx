import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ConfigurationNavigation } from "../../src/components/admin/platform-configuration/configuration-navigation";
import { ConfigurationField } from "../../src/components/admin/platform-configuration/configuration-field";
import { createConfigurationRegistry, publicContracts, PLATFORM_POLICY_CONTRACTS, type ConfigurationContract } from "../../src/lib/admin/platform-configuration/contracts";

const contract: ConfigurationContract = {
  key: "fixture.sample", title: "Dynamic fixture", description: "Test only", kind: "policy", requiredRole: "SUPER_ADMIN", canReset: false,
  fields: [
    { name: "enabled", kind: "boolean", label: "Enabled", description: "Toggle" },
    { name: "retryLimit", kind: "integer", label: "Retry limit", description: "Range", min: 1, max: 5 },
    { name: "label", kind: "string", label: "Label", description: "Metadata", maxLength: 20 },
  ],
};

test("a registered policy group renders automatically in selector", () => {
  const contracts = publicContracts(createConfigurationRegistry([...PLATFORM_POLICY_CONTRACTS, contract]));
  const html = renderToStaticMarkup(<ConfigurationNavigation contracts={contracts} selectedKey="fixture.sample" />);
  assert.equal((html.match(/href=/g) || []).length, contracts.length);
  assert.match(html, /Dynamic fixture/);
  assert.match(html, /aria-current="page"/);
});
test("adding one field renders a new control and accessible validation error automatically", () => {
  const controls = contract.fields.map((field) => renderToStaticMarkup(<ConfigurationField
    field={field} value={field.kind === "integer" ? 3 : field.kind === "boolean" ? false : "value"}
    onChange={() => {}} disabled={false} error={field.name === "retryLimit" ? "Invalid retry limit" : undefined} />)).join("");
  assert.match(controls, /config-enabled/);
  assert.match(controls, /config-retryLimit/);
  assert.match(controls, /config-label/);
  assert.match(controls, /type="number"/);
  assert.match(controls, /Invalid retry limit/);
  assert.match(controls, /aria-invalid="true"/);
});
