# ARCH-049-ADMIN-002 — verified IMAGE-header authoring handoff

## Ownership and rollout gate

This Admin implementation consumes the **migrated** `commerce."ShopBrand"` table, the
`ShopBrand.whatsAppMedia` JSONB derivative state from ARCH-049-DATABASE-001, and the
validated `shopBrand.publicMedia` public origin configured by ARCH-049-ADMIN-001. The
three existing merchant-support SQL queries also reference the `commerce` schema.
The DATABASE-001 migration and all old-schema consumers must be coordinated in one
compatible rollout; do not deploy this version while its target table is absent,
nor move the table while a live consumer still queries `shopify."ShopBrand"`.

The editor is **read-only** with respect to ShopBrand media. Authenticated
`SUPER_ADMIN` requests read a specified shop and its one ShopBrand row by `shopId`.
They project only the safe status and verified derivative metadata for `LOGO`,
`SQUARE_LOGO` and `COVER_IMAGE`. The source URL, worker lease/retry metadata, R2
credentials, source bytes, and raw media JSONB are never returned to browser code.

A role is selectable only when the stored source generation/fingerprint equals the
READY record, the immutable object key is exactly the shop/role/digest key under
`shop-brands/`, the derivative is JPEG/PNG with validated dimensions and size below
5 MiB, and the origin is a configured, well-formed HTTPS **origin**. The selected
role is a semantic binding; the particular preview shop and URL are not persisted
in the template. ARCH-049-BACKGROUND-004 must independently verify the *destination*
shop's READY derivative again at send time and must never fall back to an original
merchant URL when it is missing or stale.

## Frozen IMAGE-header contract

The existing ARCH-047 Admin compiler remains the single source of truth. A role-
bound Meta template has an empty `header` AST array and one provider `HEADER`
component with `format: "IMAGE"`; the stored immutable registration binding
contains exactly:

```json
{"schemaVersion":1,"headerMediaRole":"LOGO","header":[],"body":[{"position":1,"variable":"customer.firstName"},{"position":2,"variable":"shop.name"}],"buttons":[]}
```

`headerMediaRole` is one of `LOGO`, `SQUARE_LOGO`, `COVER_IMAGE`. TEXT headers do not
store this binding and existing TEXT snapshots keep their audit metadata. There
must be no stored original media URL and no invented Meta media handle. The
cross-service canonical fingerprint vector in
`tests/fixtures/arch049-admin-media-header-projection.json` fixes one complete
IMAGE projection for Background-004. Change its hash only with explicit
architectural review of both producer and consumer contracts.

A sample **Meta image upload handle** for `HEADER.example.header_handle` is a
separate provider-registration requirement from the destination merchant's READY
R2 image. Admin does not own a provider media upload flow. Therefore **saving,
previewing, translating and reviewing** an IMAGE definition are supported, but
**submitting the IMAGE definition to Meta is intentionally blocked** by
`IMAGE_SAMPLE_HANDLE_REQUIRED`. This is a real cross-service/provider capability gap
for the architect, not permission to improvise a sample from an arbitrary URL or
use client-side Meta credentials. Keep ARCH-047 immutable new-template semantics.

## Validation commands

From `moda-interact-admin` after installing pinned dependencies and generating its
Prisma client:

```bash
npm ci
npm run prisma:generate
npm run prisma:validate
npm run test:arch049-admin-media:unit
npm run test:arch049-admin-media:postgres
npm run test:arch047-admin-authoring:unit
npm run test:arch047-admin-meta:unit
npm run lint
npx tsc --noEmit
```

The PostgreSQL test requires Docker and starts/removes its own disposable pgvector
PostgreSQL container. It **must not** be pointed at production or another existing
database. The component test uses accessible native radio inputs and responsive
Tailwind grids. Browser-level keyboard/multi-viewport manual smoke verification
should accompany final integrated review because static markup tests cannot
reproduce real user interaction or layout.

## Review notes

- Source of truth for ARCH-049 task status is the *parent* task-file YAML; the
  implementation patch does not mark its own task Complete.
- Do not implement Meta media-upload mechanics or Background send-time verification
  in this Admin task. Those require their own owning boundaries and validation.
- Shared runtime logging is used by the new server action. Sensitive values and
  untrusted external URLs must not enter log fields or exception messages.
