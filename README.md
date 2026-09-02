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
the Google callback URL as:

```text
https://admin.modainteract.com/api/auth/callback/google
```

Provision an allow-listed administrator after the database migration is
deployed:

```bash
npm run admin:provision -- --email admin@example.com --role SUPER_ADMIN
npm run admin:provision -- --email admin@example.com --disable
```

The provisioning command stores only administrator metadata. It does not store
passwords or OAuth credentials.

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
