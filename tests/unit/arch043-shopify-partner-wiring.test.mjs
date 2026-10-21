import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const source = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Partner subscription operations use a fresh purpose-scoped reader, not ambient credentials', () => {
  const contract = source('src/lib/admin/shopify-subscription-contract.ts');
  assert.match(contract, /await requireAdminShopifyPartnerCredentials\(\)/);
  assert.match(contract, /"x-shopify-access-token": config\.accessToken/);
  assert.doesNotMatch(contract, /process\.env\.SHOPIFY_PARTNER_/);
  assert.doesNotMatch(contract, /partnerConfig\(/);
});

test('Partner credentials resolve only from an environment-scoped sealed database revision', () => {
  const service = source('src/lib/admin/shopify-partner-configuration.ts');
  const resolver = source('src/lib/admin/shopify-partner-credentials.ts');
  assert.match(service, /platformConfiguration\.findUnique\(/);
  assert.match(service, /environment_key: \{ environment, key: "shopify\.partner" \}/);
  assert.match(service, /select: \{ value: true, version: true \}/);
  assert.match(service, /key: "shopify\.partner",\s*version: row\.version/);
  assert.match(service, /loadConfigUnsealKeyring\(\)/);
  assert.match(service, /validateSecretPayload\("shopify\.partner", payload\)/);
  assert.match(resolver, /if \(row === null\) \{\s*throw new Error\("Shopify Partner API is not configured\."\)/);
  assert.doesNotMatch(service + resolver, /MODA_SHOPIFY_PARTNER_CREDENTIAL_MODE|readLegacyShopifyPartner|environmentCredentials|mode: "transition"/);
  assert.doesNotMatch(service + resolver, /process\.env\.SHOPIFY_PARTNER_|process\.env\.SHOPIFY_APP_ID/);
});

test('Admin configuration example offers no legacy Partner credentials', () => {
  const example = source('.env.example');
  assert.doesNotMatch(example, /MODA_SHOPIFY_PARTNER_CREDENTIAL_MODE|SHOPIFY_PARTNER_API_TOKEN|SHOPIFY_PARTNER_ACCESS_TOKEN|SHOPIFY_PARTNER_ORGANIZATION_ID|SHOPIFY_PARTNER_ORG_ID|SHOPIFY_PARTNER_API_VERSION|SHOPIFY_APP_ID/);
});
