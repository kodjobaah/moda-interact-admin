# ARCH-043-ADMIN-002 — Admin authentication acceptance evidence

## Scope and status

This is an execution checklist, **not evidence of a completed OAuth run**. Run it
against the actual Admin worktree and deployed/local development instance with a
fresh development database. Do not attach secrets, OAuth codes, cookies or signed
JWTs to the Completion Report. Record only observed outcomes and sanitised logs.

ADMIN-002's agreed policy is **authentication-time PostgreSQL first**, then the
complete environment credential bundle **only when `auth.admin` is absent**.
Auth.js is configured lazily per authentication/session operation, not at process
startup. Missing `AUTH_URL` is still a routing/configuration error.

Session rotation policy: the installed Auth.js JWT mechanism uses the current
`authSecret` to encrypt/decrypt the session token. **Rotating `AUTH_SECRET` logs
out existing sessions**, and users sign in again. Rotating only Google OAuth
client credentials while retaining the signing secret does not, by itself,
invalidate JWT signatures. No undocumented grace keys are introduced.

## Automated checks

From `moda-interact-admin/`:

```bash
npm run test:arch043-admin-auth:unit
npm run test:arch043-admin-auth:rotation
npm run test:arch043-admin-secrets:unit
npm run test:arch043-admin-config:postgres
npx tsc --noEmit
npm run build
```

`test:arch043-admin-auth:rotation` uses **the actual installed Auth.js JWT
encode/decode implementation**. It checks session continuity across OAuth-only
rotation, session invalidation across signing-secret rotation, an expired JWT,
and the change from environment to database credentials. It does **not** emulate
Google's OAuth servers or prove a real browser login.

## Real browser / Google OAuth matrix

Prerequisites: development deployment identity, an authorised Google OAuth test
client whose redirect URI matches `AUTH_URL`, a provisioned and active Google
`SUPER_ADMIN` in `PlatformAdmin`, the approved ARCH-043 unseal keyring, and
`ADMIN_DEVELOPMENT_AUTH_BYPASS=false`. Ensure a fresh test database and use a
private test browser profile. When manually manipulating records or credentials,
use the authorised Admin editor; do not log or paste decrypted secrets.

| Case | Action | Required observed result |
|---|---|---|
| Environment fallback | Leave `auth.admin` absent; configure complete env credentials; sign in with Google | Active SUPER_ADMIN signs in and gets authenticated session |
| Database precedence | Save valid, distinct `auth.admin` Google OAuth client credentials; leave intentionally non-working but complete env Google client values in the test deployment | New sign-in succeeds using the DB credentials; environment is not used |
| Lazy startup | With no `auth.admin` record, restart Admin; before navigating to login/auth routes check startup logs | No Admin-auth secret lookup is required to start serving unauthenticated routes |
| Database outage | Simulate a database read failure during a new authentication operation | Authentication fails; no environment fallback; no secrets in logs |
| Invalid sealed record / wrong unseal key | In isolated test environment supply invalid sealed configuration or invalid unseal root, then attempt login | Authentication fails; does not fall back to env |
| Revoked `auth.admin` | Revoke the DB record through Admin while an independently authorised test session still permits configuration | Subsequent authentication fails; revoked is not interpreted as absent |
| Google credentials rotation | Rotate only the Google client fields, retaining `authSecret`; sign in using the new Google client; inspect an existing session | New sign-in uses new client; prior JWT remains valid if the admin remains authorised |
| `AUTH_SECRET` rotation | Rotate the signing secret and retry an existing session, then sign in again | Existing JWT is rejected; a new Google sign-in establishes a valid session |
| Session expiry and admin suspension | Wait for session expiry or disable the test admin before its next authorised request | Expired session is rejected; disabled admin cannot access protected routes |
| Development bypass isolation | Enable bypass in development, then test with `NODE_ENV=production` | Bypass only works in development, never in production |

Do not run the adverse cases against live production credentials or production
sessions. Use a disposable development environment and coordinate session-secret
rotation with anyone else using it.

## Evidence template

Record only nonsecret observations:

```text
Task: ARCH-043-ADMIN-002
Implementation commit:
Deployment / environment:
Node / NextAuth package versions:
Automated auth resolver:
Auth.js JWT rotation tests:
Focused PostgreSQL tests:
TypeScript / build:
Real Google env-fallback login (PASS/FAIL/NOT RUN):
Real Google DB-first login (PASS/FAIL/NOT RUN):
Database-unavailable / invalid / revoked cases (PASS/FAIL/NOT RUN):
Google OAuth client rotation (PASS/FAIL/NOT RUN):
AUTH_SECRET session invalidation and re-login (PASS/FAIL/NOT RUN):
Admin disable / expiry (PASS/FAIL/NOT RUN):
Development bypass isolation (PASS/FAIL/NOT RUN):
Sanitised evidence location:
Blocking gaps:
```

The overall task must not be marked accepted solely because the focused automated
unit/JWT tests pass. The real OAuth/session behaviour needs separate recorded
outcomes, or an explicit architect decision about any unverified acceptance case.
