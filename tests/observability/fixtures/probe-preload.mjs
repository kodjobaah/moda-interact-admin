// Test-only preload fixture for the focused observability bootstrap tests.
//
// The real production preload (`observability.mjs`) initializes the shared Node
// observability runtime before the Next.js CLI is imported. That runtime
// enables Undici/fetch instrumentation, but the production admin service has no
// application HTTP endpoint whose only purpose is to prove fetch
// instrumentation. This fixture imports the real production preload and then
// fires a short, bounded burst of outbound fetches to the test OTLP receiver so
// the focused tests can observe Undici/fetch client spans end to end.
//
// This fixture is referenced only by the test suite. `npm start` still runs the
// exact production command:
//
//   node --import ./observability.mjs ./node_modules/next/dist/bin/next start

import '../../../observability.mjs';

const probeTarget = process.env.TELEMETRY_PROBE_TARGET;

if (probeTarget) {
  const fire = () => {
    fetch(probeTarget).catch(() => {
      // The receiver/endpoint is optional for tests that do not exercise it.
    });
  };
  // The shared NodeSDK registers instrumentation synchronously but installs the
  // global tracer provider asynchronously. A short retry window guarantees at
  // least one outbound fetch is recorded by Undici instrumentation after the
  // provider is ready.
  for (let attempt = 0; attempt < 16; attempt += 1) {
    setTimeout(fire, attempt * 200);
  }
}
