# Admin — common layout workflow corrections

Prerequisites: accepted platform recovery defaults database migration
`20261124163000_whatsapp_recovery_template_defaults`, and the preceding Admin
recovery defaults and unified publication/lifecycle patches. Regenerate Prisma
against the accepted database gitlink. There is no new migration or gitlink edit.

## Operator behaviour

- Publication rejects references to a different active SHARED revision before
  parsing or recompiling the historical wrapper. It explains how to clone with
  the active layout or review coordinated activation. Matching references are
  still checked against the exact immutable saved locale, and all review,
  provider approval, content and assignment checks still apply. A valid
  reviewed staging layout remains available for **submission** (preparing a
  future activation); it cannot be assigned before activation.
- Validation returns specific fields and messages for invalid wrapper authoring.
  Structured server logs include operation and definition/operation ID; common
  validation failures include provider template name, language, active and
  referenced revision IDs and original validation error when present. Unexpected
  database/provider errors are not presented as authoring failures. Per-shop
  publication failures retain their safe failure codes and log original errors.
- A recovery clone preselects the reviewed active layout if available. Its
  original body, offer target, variables, footer and media settings are kept;
  a layout requiring an incompatible header or duplicate checkout link still
  needs an explicit editor correction. Nothing is saved until the administrator
  reviews and saves the new immutable source. The dropdown shows UTC creation
  time, active marker, short ID and reviewed-language count. If no reviewed active
  layout is available, the UI says so rather than choosing a different revision.
- The catalogue displays reference coverage for the active layout, **not**
  guaranteed Meta eligibility. The translation review links to the existing
  translation request/progress page. It does not create a second translation run.

## Coordinated activation including platform defaults

The global SHARED pointer affects future onboarding as well as existing assigned
shops. The review now requires one explicit replacement selection for every
configured default (all WABAs, not merely the current merchant cohort). A default
may retain its current definition only if its complete reviewed Meta-approved
cohort matches the chosen revision. No default is created for a previously
unconfigured purpose. Each replacement is checked for the same WABA/purpose,
checkout target, all twenty exact saved references, immutable content, reviewed
English and translations, current reconciled Meta evidence (one hour, matching
existing coordinated activation policy) and no pending provider observation.

Preview records old/new definition identities and reviewed evidence. Confirmation
re-reads the complete bounded cohort under the existing global lock and row
locks, checks the fingerprint and active SUPER_ADMIN, and updates existing shop
assignments, configured defaults, lifecycle markers, SHARED pointer and audit
records in the same serializable transaction. A stale or incomplete review,
failed approval or write rolls back the whole activation. Direct non-coordinated
SHARED changes are refused when defaults exist. Historical v2 activation snapshots
without default metadata remain readable/replayable; their old request digest
is not rewritten. No templates are re-submitted and no provider work is triggered.

The existing shop bounds remain 6 replacement definitions, 50 shops and 1,000
variants/targets; the new explicit default bound is 12 configured pointers across
WABAs, with at most 380 locked locale rows and the existing 2,000-registration and
1 MiB manifest bounds. Exceeding any bound fails closed. The activation catalogue
still has its bounded candidate list; a large catalogue must not partially switch.

## Validation

```sh
npm run prisma:generate
npx tsc --noEmit
node scripts/test-unit.mjs tests/unit/whatsapp-common-layout-workflow.test.ts tests/unit/whatsapp-common-layout-workflow-ui.test.mjs tests/unit/arch047-template-wrappers-service.test.ts
npm run test:whatsapp-recovery-defaults:unit
npm run test:arch047-admin-publication:unit
npm run test:arch047-admin-authoring:unit
npm run test:arch047-admin-compilation:components
npm run test:arch075-admin-common-layout
npm run test:arch075-admin-common-activation
npm run test:arch075-admin-common-layout:postgres
npm run test:arch075-admin-common-activation:postgres
npm run test:whatsapp-recovery-defaults:postgres
```

PostgreSQL integration uses the existing disposable localhost Docker harness,
never a production connection. Review the catalogue, clone preselection and
translation link in the deployed Admin. Historical templates must report a
revision mismatch, not temporary unavailability. An already published template
using the current common revision remains unchanged by this patch. Do not
activate another common layout just to test the error message in production.
