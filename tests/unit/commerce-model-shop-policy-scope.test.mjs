import assert from 'node:assert/strict';
import test from 'node:test';
import { loadPolicyModule } from './helpers/commerce-model-policy-module-harness.mjs';
process.env.DEPLOYMENT_ENVIRONMENT_NAME ||= 'development';
const signer = loadPolicyModule('src/lib/admin/commerce-model-shop-policy-scope.ts', { 'node:crypto': await import('node:crypto') });
test('signed selected-tenant scope roundtrip is admin-bound and tamper resistant', () => {
  const now = Date.now();
  const issued = signer.issueLiveShopPolicyScope('shop-1', 'admin-1', now);
  assert.equal(signer.verifyLiveShopPolicyScope(issued, 'admin-1', now), 'shop-1');
  assert.throws(() => signer.verifyLiveShopPolicyScope(issued, 'admin-2', now), /invalid or expired/);
  assert.throws(() => signer.verifyLiveShopPolicyScope(issued, 'admin-1', now + 8 * 60 * 60 * 1000), /invalid or expired/);
  const [payload, signature] = issued.split('.');
  const forged = Buffer.from(JSON.stringify({ shopId: 'shop-2', adminId: 'admin-1', expiresAt: now + 1000 })).toString('base64url');
  assert.throws(() => signer.verifyLiveShopPolicyScope(`${forged}.${signature}`, 'admin-1', now), /scope is invalid/);
  assert.throws(() => signer.verifyLiveShopPolicyScope(`${payload}.AA`, 'admin-1', now), /scope is invalid/);
});
