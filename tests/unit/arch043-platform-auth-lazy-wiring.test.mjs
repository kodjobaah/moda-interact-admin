import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
const src = (name) => readFileSync(new URL(`../../${name}`, import.meta.url), "utf8");
test("Auth.js uses a lazy async request-time factory, not credentials at module startup", () => {
  const auth = src("src/auth.ts");
  assert.match(auth, /NextAuth\(async \(\) =>/);
  assert.match(auth, /await resolveAdminAuthCredentials\(\)/);
  assert.match(auth, /Google\(\{ clientId: credentials\.googleClientId/);
  assert.doesNotMatch(auth, /providers:\s*\[Google\]/);
});
test("login and principal resolution validate only routing before lazy auth config", () => {
  assert.match(src("src/app/login/page.tsx"), /assertPlatformAdminAuthRoutingConfiguration/);
  assert.match(src("src/lib/auth/platform-admin.ts"), /assertPlatformAdminAuthRoutingConfiguration/);
  const resolver = src("src/lib/auth/platform-auth-credentials.ts");
  assert.match(resolver, /platformConfiguration\.findUnique/);
  assert.match(resolver, /key: "auth.admin"/);
  assert.match(resolver, /unsealSecret/);
});
