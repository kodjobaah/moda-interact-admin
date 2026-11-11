import assert from 'node:assert/strict';
import test from 'node:test';
import { createComponentHarness, loadPolicyModule } from './helpers/commerce-model-policy-module-harness.mjs';

function fixture() {
  const h = createComponentHarness();
  const requests = [];
  let effect;
  const { useShopBrandMediaRole } = loadPolicyModule('src/components/admin/whatsapp-templates/media/use-shop-brand-media-role.ts', {
    react: { ...h.react, useCallback: fn => fn, useEffect: fn => { effect ??= fn; } },
    '@/app/actions/template-sample-media': { loadTemplateSampleMedia: () => new Promise(resolve => requests.push(resolve)) },
  });
  return { requests, render: () => h.render(useShopBrandMediaRole, {}), mount: () => effect() };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('media preview starts pending and only accepts the newest request', async () => {
  const f = fixture();
  assert.equal(f.render().pending, true);
  const cleanup = f.mount();
  await flush();
  const refresh = f.render().load();
  f.requests[1]({ ok: true, media: { id: 'new' } });
  await refresh;
  f.requests[0]({ ok: true, media: { id: 'stale' } });
  await flush();
  assert.deepEqual(f.render().media, { id: 'new' });
  assert.equal(f.render().pending, false);
  cleanup();
});

test('unmount before scheduled load prevents the initial media request', async () => {
  const f = fixture();
  f.render();
  f.mount()();
  await flush();
  assert.equal(f.requests.length, 0);
});
