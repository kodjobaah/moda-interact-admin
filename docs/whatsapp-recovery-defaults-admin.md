# Admin — recovery template publication and defaults

Prerequisite: Admin already contains the initial recovery-defaults implementation
and pins the database migration `20261124163000_whatsapp_recovery_template_defaults`
or a later descendant. This follow-up is Admin-only; no new database migration,
Shared version or Shopify change is required.

## Operator workflow

The existing WhatsApp Templates catalogue links to the six-slot **Recovery defaults**
overview. Open a recovery definition, or its Meta approvals page, and choose
**Publish template**. There is one publication screen and one review/confirmation:

- One shop / Selected shops: existing assignments only; leave defaults unchanged.
- All existing and future shops: set the explicit platform default and create the
  reviewed existing-shop publication operation. Works with zero shops.
- Future shops only: set the platform default; no shop discovery, assignments,
  publication operation or targets. Future inheritance is implemented for Shopify;
  WooCommerce onboarding does not yet consume defaults.

Alternative-product definitions retain existing-shop scopes only: the six-slot
platform default contract does not support them. The default overview remains
read-only. All existing gates, including matching active SHARED common layout,
provider approval and immutable reviewed content, remain mandatory. Defaults
require all twenty reviewed and reconciled Meta-approved locales, with the
existing exact content/identity verification. A different common revision still
requires the existing coordinated activation workflow. Do not change statuses
or registration evidence to bypass that workflow.

## Persistence and concurrency

The existing `(wabaId, purpose)` pointer references the existing definition. A
fully verified default is marked PUBLISHED, preserving the first publication
stamp. Default evidence is reviewed together with any existing-shop impact; the
fingerprint binds both the current pointer and frozen shop list. On confirmation,
lock the common activation fence and source/registration rows, revalidate in a
serializable transaction, and commit the pointer, lifecycle marker, default audit,
and (if any shops were selected) the durable shop operation together. If operation
creation fails, no default change commits. No fabricated zero-target operation.

Existing-shop operations retain the original durable scope snapshot (`mode: all`)
and processing/override safeguards. The additional `defaultConfigured` marker
reports that a default was saved at confirmation, not that it is still current.
Existing-shop processing remains resumable, independently revalidated and can
fail after confirmation; this does not undo the default. The UI reports these
outcomes separately. A replay of a combined operation uses its original key and
fingerprint. Selecting an already configured default with a fresh review is a
no-op; a lost default-only response can be refreshed and re-reviewed.

## Translation lifecycle

Background advances the translation run and items, not the definition lifecycle.
The catalogue projects the latest current-source run stage and shows the stored
stage when different. This is not a new approval state. On the translation review
screen, **Synchronise translation status** is offered when the latest completed
run matches the immutable definition and contains all nineteen distinct available
translation outputs, with no failures, outstanding batches or missing digests.
An approval of a locale also synchronises the lifecycle if eligible. The guarded
write changes only an unpublished, non-retired staging definition to
`READY_FOR_REVIEW`. It does not modify a translation run, locale, Meta registration,
merchant assignment, default pointer or publication timestamp. Content verification
and individual review remain the existing separate checks. After all twenty locale
contents are ready, **Continue to Meta approvals** leads to the existing provider
workflow and publication screen. Truly pending/failed runs are not advanced.

## Validation

```sh
npm run prisma:validate
npm run prisma:generate
npx tsc --noEmit
npm run test:whatsapp-recovery-defaults:unit
npm run test:whatsapp-recovery-defaults:postgres
npm run test:arch047-admin-publication:unit
node scripts/test-unit.mjs tests/unit/whatsapp-translation-lifecycle.test.ts
npm run test:arch047-admin-compilation:unit
npm run test:arch047-admin-compilation:components
npm run test:arch047-admin-compilation:postgres
npm run test:arch075-admin-common-activation
```

The integration harnesses start invocation-owned PostgreSQL/pgvector containers,
apply the database migrations, override DATABASE_URL, and clean up their own
containers. Never run the integration sources against production. The tests cover
zero shops, future-only, atomic combined operation creation and rollback, replay,
existing-only scope, stale/invalid confirmations, approval gates, and guarded
translation status repair/automatic progression. Verify the single publication
screen and the review-page next steps manually after deployment.
