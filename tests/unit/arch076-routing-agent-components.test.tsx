import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  RoutingAgentFields,
  RoutingPolicyPreview,
  routingDraft,
  routingDraftPayload,
  ROUTING_NUMERIC_FIELDS,
} from "../../src/components/admin/platform-configuration/routing-agent-fields";
import {
  validateRoutingAgentPolicy,
  type RoutingAgentPolicy,
} from "../../src/lib/admin/platform-configuration/routing-agent-contract";

test("every configurable budget/history/retry field is present without business defaults", () => {
  const html = renderToStaticMarkup(
    <RoutingAgentFields
      draft={routingDraft(null)}
      onChange={() => {}}
      errors={{ "budget.outputTokens": "Enter a token budget" }}
    />,
  );
  for (const [name] of ROUTING_NUMERIC_FIELDS)
    assert.ok(html.includes(`name="${name}"`), name);
  assert.match(html, /name="promptRevisionId"/);
  assert.match(html, /name="modelBinding.kind"/);
  assert.match(html, /Enter a token budget/);
  assert.match(html, /ROUTER — the independently published neutral template/);
  assert.doesNotMatch(html, /value="(?:80|240|10000)"/);
  assert.equal(
    validateRoutingAgentPolicy(routingDraftPayload(routingDraft(null))).ok,
    false,
  );
});

test("model selection controls and preview keep provider parameters in catalogue and make no model request", () => {
  const html = renderToStaticMarkup(
    <RoutingAgentFields
      draft={{ "modelBinding.kind": "FIXED_CATALOGUE" }}
      onChange={() => {}}
    />,
  );
  assert.match(html, /modelBinding.modelCatalogueEntryId/);
  assert.match(html, /commerce-models\/catalogue/);
  assert.match(html, /No credentials/);
  assert.doesNotMatch(html, /type="password"/);
  const preview = renderToStaticMarkup(
    <RoutingPolicyPreview
      policy={
        {
          enabled: false,
          confidenceThreshold: 90,
          modelBinding: { kind: "VERIFIED_SHOP_INHERIT" },
          budget: { outputTokens: 400, deadlineMs: 9000 },
          retry: { maxAttempts: 2 },
          input: { maxCandidates: 8 },
          decisionTTLms: 60000,
          retentionMs: 120000,
        } as RoutingAgentPolicy
      }
    />,
  );
  assert.match(preview, /disabled/);
  assert.match(preview, /does not invoke a model/);
});
