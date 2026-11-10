# Moda Interact Admin

Internal Next.js administration console for Moda Interact. This implementation converts the supplied `ui-admin` mock-up into reusable React components and connects the screens to the shared Prisma/PostgreSQL data model.

## What is implemented

- Next.js App Router + TypeScript + Tailwind CSS
- server-side Prisma queries; the browser does not query PostgreSQL directly
- tenant directory with server-side brand/domain search
- paginated tenant list
- live KPI counts for active shops and currently active checkout recoveries
- expandable tenant administration panel
- server action for changing a shop status and recovery delay
- Recovery Logs drill-down: tenant → customer → checkout recovery
- paginated customer and recovery lists
- recovery detail drawer with Conversation, Cart Details and Lifecycle tabs
- paginated WhatsApp conversation messages
- observability page using the supplied Grafana dashboard visual
- reusable UI/data components under `src/components/admin` and `src/lib/admin`

The navigation/drill-down behaviour follows the interaction pattern demonstrated in the supplied Loom recording: list views remain the entry point, selecting a record reveals progressively more detail, and the current context is kept in URL query parameters so server-rendered pages remain shareable and reload-safe.

## Component structure

```text
src/
├── app/
│   ├── actions/
│   │   └── tenant.ts
│   ├── observability/
│   │   └── page.tsx
│   ├── error.tsx
│   ├── globals.css
│   ├── layout.tsx
│   ├── loading.tsx
│   └── page.tsx
├── components/admin/
│   ├── admin-shell.tsx
│   ├── customer-table.tsx
│   ├── empty-state.tsx
│   ├── icons.tsx
│   ├── kpi-card.tsx
│   ├── observability-panel.tsx
│   ├── pagination.tsx
│   ├── recovery-drawer.tsx
│   ├── recovery-logs.tsx
│   ├── recovery-table.tsx
│   ├── search-input.tsx
│   ├── sidebar.tsx
│   ├── status-badge.tsx
│   ├── tenant-administration.tsx
│   ├── tenant-detail-panel.tsx
│   └── tenant-table.tsx
└── lib/admin/
    ├── data.ts
    ├── format.ts
    ├── query.ts
    └── types.ts
```

## Prisma data used by the screens

The admin UI uses the supplied ERD and queries these models server-side:

- `Shop`, `ShopBrand`, `ShopSettings`
- `Subscription`, `BillingPlan`
- `Customer`, `CustomerPhone`
- `CheckoutRecovery`, `CheckoutRecoveryStatusHistory`
- `Conversation`, `ConversationMessage`

The supplied ERD includes `ShopSettings.recoveryDelayMinutes`; the Prisma schema in the uploaded project did not yet contain it, so this project adds that field plus migration `20260830143000_add_recovery_delay_minutes` to keep the code and supplied ERD aligned.

## Running locally

```bash
cp .env.example .env.local
```

Set `DATABASE_URL` to the shared Moda Interact PostgreSQL database. If the shared database does not already contain the ERD field `ShopSettings.recoveryDelayMinutes`, apply the included database migration using the database project's normal migration flow:

```bash
cd database
npm install
npm run migrate:deploy
cd ..
```

Then install and run the admin application:

```bash
npm install
npm run prisma:generate
npm run dev
```

Open `http://localhost:3000`.

## Platform-admin authentication

Local development uses the synthetic `SUPER_ADMIN` principal only when
`DEPLOYMENT_ENVIRONMENT_NAME=development` and `NODE_ENV` is not `production`.
Copy the environment template for local development:

```bash
cp .env.example .env.local
```

Test and production require `AUTH_SECRET`, `AUTH_GOOGLE_ID`,
`AUTH_GOOGLE_SECRET`, `AUTH_URL`, and `DEPLOYMENT_ENVIRONMENT_NAME`. Register
separate Google OAuth credentials, secrets, Admin hosts, and callback URLs for
test and production. The production callback URL is:

```text
https://admin.modainteract.com/api/auth/callback/google
```

The test callback must use the test Admin host, for example:

```text
https://admin-test.example.com/api/auth/callback/google
```

`AUTH_SECRET`, `AUTH_GOOGLE_SECRET`, and `DATABASE_URL` are secrets and remain
environment-provided. `DEPLOYMENT_ENVIRONMENT_NAME`, `AUTH_URL`, and
`AUTH_GOOGLE_ID` identify the non-secret deployment configuration. The public
`/health`, `/ready`, and `/api/health/*` endpoints return only bounded health
data and do not require Admin authentication. `/health` is a dependency-free
liveness check returning `200` with `{"status":"ok"}`. `/ready` performs a
bounded, non-mutating PostgreSQL `SELECT 1` check and returns `200` with
`{"status":"ready"}` when available or `503` with
`{"status":"unavailable"}` when unavailable or timed out.

Provision an allow-listed administrator after the database migration is
deployed:

```bash
npm run admin:provision -- --email admin@example.com --role SUPER_ADMIN
npm run admin:provision -- --email admin@example.com --disable
```

The provisioning command stores only administrator metadata. It does not store
passwords or OAuth credentials.

## Grafana observability access

`/observability` is available only to authorised platform administrators. It
provides external links to the private Grafana Cloud workspace; Grafana keeps
its own authentication session and no Grafana credentials are sent to the
browser.

Render test and production services must set these non-secret variables
independently, using destinations belonging to the matching environment:

```text
DEPLOYMENT_ENVIRONMENT_NAME=test|production
GRAFANA_BASE_URL=https://<environment-stack>.grafana.net
GRAFANA_PLATFORM_DASHBOARD_URL=https://<environment-stack>.grafana.net/d/<dashboard>
GRAFANA_LOGS_URL=https://<environment-stack>.grafana.net/explore
GRAFANA_TRACES_URL=https://<environment-stack>.grafana.net/explore
GRAFANA_METRICS_URL=https://<environment-stack>.grafana.net/explore
```

The Logs, Traces, and Metrics destinations are optional. Values are rendered
only after HTTPS URL validation; HTTP is accepted only for localhost or
127.0.0.1 in development. Missing or invalid destinations produce an
unavailable state without affecting other Admin functionality. Do not put
tokens, passwords, cookies, authorization headers, or other Grafana secrets in
these variables.

## Validation

```bash
npm run prisma:validate
npm run lint
npm run build
```

`next build` runs Prisma Client generation first via the existing `build` script.

## Pagination query parameters

The app uses URL-driven server-side pagination so pages can be refreshed or shared without losing context:

- `page` – tenant directory
- `customerPage` – customers for the selected tenant
- `recoveryPage` – recoveries for the selected customer
- `messagePage` – messages in the recovery drawer

Search is server-side as well (`q` for tenants and `customerSearch` for customers).

## Production access control

Google authentication is restricted to active, pre-provisioned `PlatformAdmin`
records. Full page and privileged mutation coverage remains part of the
follow-up `ADMIN-005` and `ADMIN-006` tasks.


## Optional conversation product image (ARCH-068)

The conversation wrapper editor offers **Optional product image** for AI response
wrappers only, disabled by default. Enabling it stores the Shared structured
`response.productImage` binding with `BEFORE_BODY` placement and `optional: true`.
The image appears above the entire wrapped response. If a verified image is
unavailable, or the full response exceeds the 1024-code-point image-caption limit,
the complete reply is text-only. Existing text URL variables keep their meaning.
Meta recovery, HUMAN and SHARED wrappers do not accept this binding.

Authoring, locale review and before/after previews use a local SVG illustration;
they do not fetch merchant products/images or read R2 credentials. Compilation,
cloning and translation preserve the binding and include it in immutable source
and prepared digests. All canonical reviewed languages must have the same binding
as English. Existing wrappers that omit it retain their old prepared shapes and
hashes.

The Admin pins published `@modainteract/moda-interact-shared@5.12.0`; its lockfile
records the accepted registry integrity. Browser authoring imports only
`/commerce/presentation`, never the Node media preparation entrypoint.

Before activating a wrapper with this binding, verify that deployed Commerce and
Background both support it and have passed their binding fixtures. Saving or
reviewing an Admin definition does not establish consumer deployment readiness.
The separate ADMIN-002 initializer remains an explicit operator workflow; this
change does not run it or activate a wrapper.

Run `npm run test:arch068-admin-authoring` for the deterministic contract and
component checks. The runner bundles repository test modules to ESM while leaving
npm packages external, so Shared is consumed via its published import exports.

## Initialize the structural AI conversation wrapper (ARCH-068)

`whatsapp:initialize-conversation-wrapper` prepares the canonical AI-only wrapper:
empty header/footer, the complete `response.body` slot, and the optional verified
product image above the response. It uses the existing compiler, immutable hashes,
locale eligibility, versioned activation and audit services. It creates no Meta
registration, translation run, model call or send.

Before running locally, run `npm ci` and `npm run prisma:generate` so the installed
Shared package and generated database client match this checkout. A stale Shared
installation can lack the required `commerce/presentation` export.

The command defaults to **dry-run**. Supply an existing, active `SUPER_ADMIN` email
and an audit reason of 10–500 characters. The requested environment must exactly
match the Admin's existing trusted runtime environment selection
(`DEPLOYMENT_ENVIRONMENT_NAME`, otherwise `NODE_ENV`); the command never sets it
from `--environment`. Use the deployment's existing database configuration. The email is trimmed and
lowercased, then resolved to the existing administrator ID inside the transaction;
that ID remains the audit actor and definition identity. No administrator is created.
Only `test` and `production` are supported; missing, duplicate and unknown arguments
are refused. `--dry-run` and `--apply` are mutually exclusive.

```bash
npm run whatsapp:initialize-conversation-wrapper -- \
  --environment=test --actor-admin-email=admin@example.com \
  --dry-run --reason="Review structural AI conversation wrapper initialization"
```

Dry-run writes nothing to the database. It reports the stable planned definition ID, source and
prepared hashes, canonical locale count and the observed current AI pointer.
`action` states whether apply would create/activate or be unchanged. The stable
submission UUID is `e14e7967-05bb-4a5c-bacf-0663b42b37d5`; the normal authoring
identity helper derives the definition ID from the operator ID and that UUID.

Before applying, record **deployed Commerce and Background commit/package
versions and successful binding fixture smoke for the target environment**.
Both deployed consumers must support the optional binding, with the required
message-field migration deployed before Background uses it. Accepted local source
or Admin authoring completion does not prove deployed compatibility. The script
has no deployment API and cannot verify this operator prerequisite.

```bash
npm run whatsapp:initialize-conversation-wrapper -- \
  --environment=test --actor-admin-email=admin@example.com \
  --apply --reason="Approve structural wrapper after deployed consumer checks"
```

Production uses the same explicit syntax with `--environment=production`, only
in its matching configured runtime and after the same deployment checks. No
initializer command is run automatically on deployment or by the application.

Apply creates the immutable definition, all languages from `REVIEW_LANGUAGES`,
the AI pointer and audits in **one SERIALIZABLE transaction**. English is
`SOURCE_SAVED`; every other locale is `REVIEWED` by the supplied operator at one
transaction timestamp, with identical structural source/prepared content and no
provider language code. This is explicit operator approval of language-invariant
structure, not a fabricated translation review. Audit metadata identifies the
script/version, structural locales, hashes and previous slot; output excludes
credentials and customer data.

An empty slot returns `CREATED_AND_ACTIVATED`. An eligible occupied slot with the
identical canonical prepared binding returns `UNCHANGED`, including when it was
created by another operator, without writes. Same-operator repeats verify the
immutable source and prepared content. Different content or incomplete/invalid
records are never repaired, overwritten or forced. A race rolls back the losing
transaction without a partial definition, locales, pointer or audit. There is no
automatic retry.

Failures return a bounded code: `INVALID_ARGUMENT`, `ENVIRONMENT_MISMATCH`,
`ACTOR_DENIED`, `IMMUTABLE_CONFLICT`, `SLOT_OCCUPIED` or
`CONCURRENT_STATE_CHANGE`. Database text, stack traces and supplied argument
values are not printed. `currentPointer` describes the snapshot observed before
any apply.

```bash
npm run test:arch068-admin-initializer:unit
npm run test:arch068-admin-initializer:postgres
```

The PostgreSQL command creates a fresh loopback-only Docker fixture, applies the
repository's recorded migrations, validates the real CLI and atomic failure/race
paths, then removes the container. It refuses external database overrides and
never initializes a deployed test/production environment. Production initialization
is not executed by these tests.

The CLI uses the existing esbuild tool to load the server core as native ESM,
leaving installed npm dependencies external through their public exports. It
removes its temporary local-code artifact on exit; no package-wide module-mode
change or global Node import-condition override is required.
