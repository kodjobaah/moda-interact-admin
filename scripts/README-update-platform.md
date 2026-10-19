# Import development and test PlatformConfiguration from an env file

The `update_platform` maintenance command imports only **approved ARCH-043**
configuration fields into the current PostgreSQL database. Every recognised
configuration group is written twice: `environment=development` and
`environment=test`. It **never** writes `environment=production`, but the
operator must still verify the selected database connection.

## Run

From the **dedicated Admin implementation worktree** with dependencies installed
and Prisma client generated (`npm ci` and `npm run prisma:generate` when needed):

```bash
./scripts/update_platform /path/to/settings.env --dry-run
./scripts/update_platform /path/to/settings.env
./scripts/update_platform /path/to/settings.env --update
./scripts/update_platform ~/.zshenv --dry-run
```

To use the bare command `update_platform <env_file>` in that shell:

```bash
export PATH="$PWD/scripts:$PATH"
update_platform /path/to/settings.env
update_platform /path/to/settings.env --update
```

The equivalent npm form is `npm run update_platform -- /path/to/settings.env --update`.

Both launchers explicitly set Node's `--conditions=import` when loading the
TypeScript Admin configuration helpers through `tsx`. Those helpers use the
published ESM-only Shared credential entrypoint
`@modainteract/moda-interact-shared/security/credentials/node`; without the
condition, a CommonJS transformation can incorrectly resolve its `require`
path and report `ERR_PACKAGE_PATH_NOT_EXPORTED` despite the entrypoint being
installed. If invoking the Node module directly, use:

```bash
node --conditions=import --import tsx scripts/update_platform.mjs /path/to/settings.env --dry-run
```

No manual change to Shared's export map or credential implementation is needed.

- **Default (no `--update`):** insert missing `(environment,key)` records;
  skip every existing record, including disabled secret records.
- **`--update`:** insert missing records and update existing ones using values
  present in the file. Unspecified policy fields remain unchanged. For existing
  secrets, unspecified fields are preserved by decrypting the current revision,
  validating the merged bundle, and sealing the next revision. If the resulting
  values have not changed, no revision or audit entry is added.
- **`--dry-run`:** query the selected database and describe planned actions
  without performing any writes. A secret update may be reported as
  `would-update` even if its plaintext is unchanged, because dry-run does not
  decrypt existing secret records.

The file supports both formats, optionally with comments or quoted values:

```dotenv
export WOO_COUPON_SYNC_DISPATCH_BATCH_SIZE=100
WOO_COUPON_SYNC_REFRESH_MINUTES=30
export GROQ_TRANSCRIPTION_MODEL=whisper-large-v3-turbo
WHATSAPP_TRANSCRIPTION_PROVIDER=groq
```

The file is **parsed, not sourced or evaluated**. Bash expansions, `$(...)`,
backticks and variable interpolation are never executed. Repeated variables use
the last assignment; conflicting values for recognised aliases cause an error.

### Shell startup files (`~/.zshenv`, `~/.zshrc`, etc.)

Shell startup files such as `.zshenv`, `.zshrc`, `.zprofile`, `.zlogin`,
`.bashrc`, `.bash_profile`, `.bash_login` and `.profile` are automatically
recognised. The importer **skips non-assignment shell statements** (such as
`source`, `if`, `fi`, `eval`, `PATH` manipulation or function definitions) rather
than rejecting the entire file. Use `--shell-file` when the file contains shell
statements but has another name:

```bash
./scripts/update_platform /path/to/custom-shell-file --shell-file --dry-run
```

Only standalone literal `KEY=value` or `export KEY=value` assignments are
imported. **The shell file is never executed.** If a known configuration key
uses shell expansion (`$NAME`, `${NAME}`, `$(...)`, backticks) or unsupported
shell syntax, import fails with a key and line number, not an incorrect literal
value. Place resolved, literal values in a dedicated `.env` file if needed.
Assignments inside shell conditionals are read as text regardless of whether
those branches would execute; prefer a flat env-only file if this matters.
Ordinary `.env` files remain strict: malformed non-comment lines still fail.
Never paste the unredacted contents of a shell configuration file into issue
reports or chat. Report only the failing line's syntax with secret values redacted.

## Database and encryption configuration

Supply `DATABASE_URL` through the invoking process environment or in the input
file. The existing process environment takes precedence. All records go to
**that one database**, not to two independent databases.

Secret groups require the existing ARCH-043 configuration-unseal root:
`MODA_CONFIG_UNSEAL_KEY` and `MODA_CONFIG_UNSEAL_ACTIVE_KEY_ID` (also resolved
from the process environment first, then the input file). Use the **same root
used by the application readers**. The importer never inserts either root into
PostgreSQL. Secret payloads are validated with the Admin secret contract and
sealed independently for each `(environment,key,version)` with the canonical
AAD. Audit rows are redacted, not plaintext or ciphertext copies.

The CLI creates its opaque Shared keyring descriptor through the Admin sealing
module, which also performs encryption and decryption. Do not import Shared's
keyring parser separately in the CLI and pass that descriptor to Admin: under
mixed Node/tsx loading, Shared's private key storage can belong to a different
module instance and produce `Credential encryption key is unavailable`. The
sealing regression test exercises the actual Shared cryptography with disposable
keys in both `development` and `test`. Failed keyring loads log only a bounded
reason code, never the environment variable content or the key ID.

An initial secret group needs all its required fields. If only a subset is
present and the record does not exist, the group is reported as
`skipped-incomplete` for both environments. `--update` can apply a subset to an
existing *active* secret only when it can decrypt and validate the saved
bundle. A disabled record requires a complete bundle to reactivate.

Policy fields are validated using the Admin policy registry. A new partial
policy starts from the corresponding approved policy defaults. Writes and
append-only audit insertions are wrapped in one serializable transaction, so
an error does not intentionally leave one environment half-imported.

### Resolving a Merchant Knowledge R2 validation failure

A failure reported as `Invalid secret fields for merchant.knowledge.r2`
comes from the Admin canonical secret validator. The importer now includes its
approved, non-sensitive rejection reason (when available), without printing the
supplied values or a stack trace. For example:

```text
Invalid secret fields for merchant.knowledge.r2: Invalid Cloudflare R2 location.; no records were written.
```

Check `MERCHANT_KNOWLEDGE_R2_ENDPOINT` is a Cloudflare R2 endpoint of the form
`https://<32-hex-character-account-id>.r2.cloudflarestorage.com` and
`MERCHANT_KNOWLEDGE_R2_BUCKET` is a valid bucket name. The two numeric limits
must be positive integers, `MERCHANT_KNOWLEDGE_MAX_UPLOAD_BYTES` must be no
more than 26214400, `MERCHANT_KNOWLEDGE_MAX_XLSX_UNCOMPRESSED_BYTES` no more
than 2147483647, and the XLSX limit must not be smaller than the upload limit.
Do not disclose R2 access keys, secret keys, or unredacted shell files in reports.
Do not bypass the validation to force a malformed secret into PostgreSQL.

### Resolving a Shopify Partner configuration failure

`SHOPIFY_PARTNER_API_VERSION=2026-10` is **valid** under the Admin
validator. The importer now identifies separately whether the invalid field is
`shopify.partner.organizationId` (`SHOPIFY_PARTNER_ORG_ID` or
`SHOPIFY_PARTNER_ORGANIZATION_ID`), `shopify.partner.appId`
(`SHOPIFY_APP_ID`), or `shopify.partner.apiVersion`
(`SHOPIFY_PARTNER_API_VERSION`). Neither the importer nor the canonical
validator logs the supplied identifier or access token.

The organisation ID must be 1–128 characters containing letters, digits,
underscores or hyphens. The application ID may use that existing short-ID format
or a canonical Shopify App GraphQL GID such as
`gid://shopify/App/413747675137` (positive decimal identifier, at most 20
digits). Other GID resource types, extra path segments and query strings are
rejected. The optional API version must match `20YY-01`, `20YY-04`,
`20YY-07` or `20YY-10`.
The script stores a valid App GID **unchanged**, so consumers must also accept
it; it does not silently strip a prefix, coerce the ID to a number or rewrite
the Shopify Partner identity. No identifiers or access tokens are logged.

## What is imported

Recognised env names are explicitly mapped to the Admin-owned fields of:
`woo.couponSync`, `speech.transcription`, `admin.grafana`, `omini.moderation`,
`commerce.connectionKeys`, `auth.admin`, `auth.commerce`, `commerce.bootstrap`,
`merchant.knowledge.r2`, `woocommerce.auth`, `shopify.oauth`, `messaging.meta`,
`woocommerce.billing`, `shopify.partner`, `shopify.appEvents`,
`messaging.sender`, and `ai.providers`.

For example, `SHOPIFY_PARTNER_ACCESS_TOKEN` and `SHOPIFY_PARTNER_API_TOKEN` map
to the same `shopify.partner.accessToken`; `OPENAI_API_KEY` and
`WHATSAPP_OPENAI_API_KEY` map to `ai.providers.openAiApiKey`. The historical
`merchantKnowledge.upload` name is **not** the canonical R2 key; the importer
uses `merchant.knowledge.r2`.

Other variables (e.g. `HOST`, `DATABASE_URL`, `REDIS_URL`, `OTEL_*`, deployment
identity, and unseal-root keys) are not stored as PlatformConfiguration.
`commerce.preview` has no approved source environment-variable mapping, so no
record is created for it by this importer. Unknown variables are counted and
ignored; they are **not** converted into arbitrary configuration rows.

The command uses `platform-env-import` as its audit actor, with per-record
version increments and redacted secret audit values. It is an **operator
maintenance tool** relying on direct database credentials, not an unauthenticated
HTTP endpoint. Never put actual secrets into Git or application logs.

## Focused verification

```bash
npm run test:update-platform
```

The focused tests exercise env parsing, mapping, two-environment insert/skip,
policy and secret updates, revision/audit behavior, alias conflicts, and
read-only dry runs. Live database execution should additionally be checked
against the intended development PostgreSQL instance before general use.
