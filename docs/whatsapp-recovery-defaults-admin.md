# Admin — platform recovery template defaults

Prerequisite: pin `database` to the accepted database migration
`20261124163000_whatsapp_recovery_template_defaults` (or a later descendant),
apply it to the target database before deploying Admin, and regenerate Prisma.
No change to the database submodule is embedded in this Admin patch.

## Operator workflow

1. System Controls → WhatsApp templates → Recovery defaults shows the six configured
   slots for the server's configured WABA. Missing rows are explicitly shown as
   not configured. A pointer is not evidence that Meta approval is still valid.
2. Open the chosen recovery definition (the existing saved immutable source or Meta
   approvals screen), then select **Set as default**. This opens the separate
   platform-default control on the publication page; it does not publish to shops.
3. **Review as default** checks the current WABA and all 20 locales using the
   existing approved-source and common-layout gates. It shows the exact proposed
   provider name, purpose, languages, header format and any current default.
4. Give the audit reason and select **Set as default** or **Replace default**.
   Confirmation revalidates the reviewed source and current pointer in a serializable
   transaction. It is safe with zero merchants. A stale review must be refreshed.

A default uses checkout recovery content, not `ALTERNATIVE_PRODUCT` promotion
content. Its 20 locale rows must be REVIEWED, have the existing reviewed-content
and provider identity checks, and have reconciled Meta APPROVED observations with
matching content and MARKETING category. A historical English source that has not
been reviewed, unverified registration, drift, retired definition or incompatible
common-layout revision cannot be selected. Use the existing review, Meta
reconciliation and coordinated common-layout workflow to address the reported
reason; do not manually change statuses or approval rows.

## Persistence and concurrency

The one `(wabaId, purpose)` pointer references the existing definition. The first
successful selection marks a fully verified definition PUBLISHED (preserving its
first `publishedAt` when present). It writes no frozen content, registrations,
shop variants, publication operations or publication targets. Replacement leaves
previous definitions and all current merchant assignments intact. Audit uses the
existing `PUBLISH_WHATSAPP_TEMPLATE_DEFINITION` action with metadata
`operation=SET_RECOVERY_TEMPLATE_DEFAULT`, `scopeMode=platform_default`, old/new
identity, source fingerprint and registration identities; its unique operation ID
is not a fabricated merchant publication ID.

The confirmation acquires the same global advisory lock as common-layout activation
and merchant publication, locks the candidate definition/locales/registrations,
and checks current sender, preview and active SUPER_ADMIN before writing. The
pointer, lifecycle marker and audit are atomic. A fresh repeat of an already
published default is a no-op. Unexpected failures are logged through the shared
structured logger and returned as safe client messages.

Default selection is deliberately not a merchant repair operation. Existing merchant
assignments remain unchanged, including a currently onboarded shop with missing
assignments. The subsequent Shopify consumer must read the pointer, revalidate the
same eligibility and common-layout compatibility at assignment time, and write
per-shop publication targets with truthful default provenance. If approval or the
shared layout changes after selection, the pointer remains configured, but must not
bypass that revalidation. An administrator can explicitly select a compatible
replacement; no automatic version selection occurs. Background is unchanged.

## Validation

```sh
npm run prisma:validate
npm run prisma:generate
npx tsc --noEmit
npm run test:whatsapp-recovery-defaults:unit
npm run test:whatsapp-recovery-defaults:postgres
npm run test:arch047-admin-publication:unit
npm run test:arch075-admin-common-activation
```

The PostgreSQL suite uses the existing disposable PostgreSQL/pgvector harness,
with an invocation-owned container and a loopback-only random port. It migrates
that database, overrides `DATABASE_URL`, runs the focused suite and cleans up its
container. Do not run the integration source against production. Tests cover zero
shops, replacement, unchanged assignments and registration bytes, audit rollback,
stale review, drift, required approval/review evidence and authorization. Manual UI
verification should also cover the six-slot overview, default confirmation and
retaining the existing merchant-publication control.
