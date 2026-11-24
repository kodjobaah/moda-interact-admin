#!/usr/bin/env bash
# Remove Shopify merchant-owned Moda test data after a full lifecycle rehearsal.
# Default deletion is restricted to disposable dev/test databases. The explicit
# prelaunch mode is for a non-live production infrastructure test ONLY.
# Run from moda-interact-admin, beside package.json.
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

case "${1:---preview}" in
    --preview) mode=preview; prelaunch=false ;;
    --execute) mode=execute; prelaunch=false ;;
    --prelaunch-preview) mode=preview; prelaunch=true ;;
    --prelaunch-execute) mode=execute; prelaunch=true ;;
    *) printf 'Usage: %s [--preview|--execute|--prelaunch-preview|--prelaunch-execute]\n' "$0" >&2; exit 2 ;;
esac
if (( $# > 1 )); then
    printf 'Unexpected arguments. Usage: %s [--preview|--execute|--prelaunch-preview|--prelaunch-execute]\n' "$0" >&2
    exit 2
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
    printf 'DATABASE_URL must point to the intended disposable development/test database.\n' >&2
    exit 1
fi
for required_command in psql npm node; do
    if ! command -v "$required_command" >/dev/null 2>&1; then
        printf 'Required command not found: %s\n' "$required_command" >&2
        exit 1
    fi
done
if [[ ! -f package.json ]] || ! grep -q '"admin:delete-merchant-data"' package.json; then
    printf 'Place this script in moda-interact-admin beside package.json (which must define admin:delete-merchant-data).\n' >&2
    exit 1
fi

# Verify the actual database rather than trusting the URL/database name alone.
database_identity="$(psql "$DATABASE_URL" -X -qAt -v ON_ERROR_STOP=1 \
    -c "SELECT current_database() || E'\\t' || COALESCE(inet_server_addr()::text, 'local socket');")"
IFS=$'\t' read -r database_name database_host <<< "$database_identity"
if [[ "$prelaunch" == true ]]; then
    # Never allow this mode on a different production DB without a new review.
    if [[ "$database_name" != moda_interact_postgres_production ]]; then
        printf 'Refused: prelaunch reset is only authorised for the exact reviewed database.\n' >&2
        exit 1
    fi
else
    if [[ ! "$database_name" =~ (^|[_-])(dev|development|test|testing)([_-]|$) ]] || \
       [[ "$database_name" =~ (^|[_-])(prod|production)([_-]|$) ]]; then
        printf 'Refused: database name must explicitly identify a non-production dev/test database: %s\n' "$database_name" >&2
        exit 1
    fi
    for variable in NODE_ENV MODA_ENVIRONMENT DEPLOYMENT_ENVIRONMENT_NAME DEPLOYMENT_ENVIRONMENT RENDER_ENV; do
        value="${!variable:-}"
        value_lower="$(printf '%s' "$value" | LC_ALL=C tr '[:upper:]' '[:lower:]')"
        if [[ "$value_lower" == production || "$value_lower" == prod ]]; then
            printf 'Refused: %s indicates production.\n' "$variable" >&2
            exit 1
        fi
    done
fi

printf 'Mode: %s%s\nDatabase: %s (server: %s)\n' "$mode" \
    "$( [[ "$prelaunch" == true ]] && printf ' (PRELAUNCH)' || true )" "$database_name" "$database_host"
printf 'Scope: Moda database rows for commerce.Shop.platform = SHOPIFY only.\n'
printf 'WooCommerce shops and shared catalogue/settings will not be selected.\n'
printf 'External Shopify stores, Redis jobs, R2 objects, and provider resources are NOT removed.\n'

woo_before="$(psql "$DATABASE_URL" -X -qAt -F '|' -v ON_ERROR_STOP=1 -c \
    "SELECT \"id\", \"domain\" FROM \"commerce\".\"Shop\" WHERE \"platform\" = 'WOOCOMMERCE' ORDER BY \"id\";" )"
shops="$(psql "$DATABASE_URL" -X -qAt -F '|' -v ON_ERROR_STOP=1 -c '
    SELECT shop."domain", shop."id"
    FROM "commerce"."Shop" AS shop
    WHERE shop."platform" = '\''SHOPIFY'\''
    ORDER BY shop."domain", shop."id";
')"
if [[ -z "$shops" ]]; then
    printf 'No Shopify shops found. Nothing to do.\n'
    exit 0
fi
printf '\nShopify shops targeted:\n%s\n' "$shops"

# Separate production authorisation from the existing dev/test delete path.
flags=(--confirm-test-data --confirm-workers-stopped)
backup_path=''
restore_container=''
backup_partial=''
cleanup() {
    if [[ -n "$restore_container" ]]; then
        docker rm -f "$restore_container" >/dev/null 2>&1 || true
    fi
    if [[ -n "$backup_partial" ]]; then
        rm -f -- "$backup_partial"
    fi
}
trap cleanup EXIT

if [[ "$mode" == execute ]]; then
    if [[ ! -r /dev/tty || ! -w /dev/tty ]]; then
        printf 'Deletion requires an interactive terminal.\n' >&2
        exit 1
    fi
    printf '\nDESTRUCTIVE: Stop ALL API, Shopify, Admin, Background, Commerce and messaging/queue writers first.\n'
    printf 'No external Shopify subscription, Redis job or R2 object is automatically removed.\n'
    if [[ "$prelaunch" == true ]]; then
        printf 'PRE-LAUNCH ONLY: this deletes ALL currently observed SHOPIFY merchants and their complete merchant-owned Moda DB history.\n'
        read -r -p 'Type PRELAUNCH-TEST-ONLY (never use after launch): ' answer </dev/tty
        [[ "$answer" == PRELAUNCH-TEST-ONLY ]] || { printf 'Cancelled.\n'; exit 0; }
    fi
    read -r -p 'Type the exact database name to continue: ' answer </dev/tty
    [[ "$answer" == "$database_name" ]] || { printf 'Cancelled.\n'; exit 0; }
    read -r -p 'Type STOPPED after stopping all relevant processes and queue workers: ' answer </dev/tty
    [[ "$answer" == STOPPED ]] || { printf 'Cancelled.\n'; exit 0; }
    read -r -p 'Type DELETE-ALL-SHOPIFY to authorize this Shopify-only cleanup: ' answer </dev/tty
    [[ "$answer" == DELETE-ALL-SHOPIFY ]] || { printf 'Cancelled.\n'; exit 0; }

    url_hostname="$(node -e 'const url = new URL(process.env.DATABASE_URL); if (!["postgres:", "postgresql:"].includes(url.protocol)) process.exit(2); process.stdout.write(url.hostname)')"
    if [[ "$prelaunch" == true ]]; then
        read -r -p 'Type EXTERNAL-STATE-REVIEWED after reviewing Shopify subscriptions, scoped Redis jobs and R2 assets: ' answer </dev/tty
        [[ "$answer" == EXTERNAL-STATE-REVIEWED ]] || { printf 'Cancelled.\n'; exit 0; }
        # Preflight every merchant BEFORE any deletion; malformed inventories
        # and missing tables must not cause a partial production reset.
        printf 'Running read-only prelaunch preview of ALL Shopify merchants...\n'
        bash "$0" --prelaunch-preview || { printf 'Preview failed; no deletion performed.\n' >&2; exit 1; }
        # Never back up a live database while writers are still active. Colima
        # or another Docker-compatible local engine is used ONLY for restoring
        # a disposable copy without any network or published ports.
        for required_command in pg_dump pg_restore docker shasum; do
            command -v "$required_command" >/dev/null 2>&1 || { printf 'Missing %s; refusing deletion.\n' "$required_command" >&2; exit 1; }
        done
        docker info >/dev/null 2>&1 || { printf 'Colima/Docker is unavailable; refusing deletion.\n' >&2; exit 1; }
        umask 077
        backup_dir="$HOME/moda-backups"
        mkdir -p -- "$backup_dir"
        chmod 700 "$backup_dir"
        backup_path="$backup_dir/moda-production-$(date +%Y%m%d-%H%M%S)-$$.dump"
        backup_partial="$backup_path.partial"
        printf '\nCreating FULL PostgreSQL database backup at %s\n' "$backup_path"
        pg_dump "$DATABASE_URL" --format=custom --file="$backup_partial"
        [[ -s "$backup_partial" ]] || { printf 'Empty backup; refusing deletion.\n' >&2; exit 1; }
        pg_restore --list "$backup_partial" >/dev/null
        mv -- "$backup_partial" "$backup_path"
        backup_partial=''
        shasum -a 256 "$backup_path" > "$backup_path.sha256"
        # A readable archive alone does not prove restore. Actually restore it
        # into an isolated ephemeral PostgreSQL with matching major version.
        pg_version="$(psql "$DATABASE_URL" -X -qAt -v ON_ERROR_STOP=1 -c 'SHOW server_version_num;')"
        [[ "$pg_version" =~ ^[0-9]+$ ]] || { printf 'Could not determine PostgreSQL major version.\n' >&2; exit 1; }
        pg_major=$((pg_version / 10000))
        restore_image="pgvector/pgvector:pg${pg_major}"
        restore_container="moda-prelaunch-restore-$$"
        printf 'Verifying FULL restore in disposable %s container (no network)...\n' "$restore_image"
        docker run -d --rm --network none --name "$restore_container" \
            -e POSTGRES_HOST_AUTH_METHOD=trust "$restore_image" >/dev/null
        ready=false
        for _ in $(seq 1 60); do
            if docker exec "$restore_container" pg_isready -q -U postgres -d postgres; then
                ready=true; break
            fi
            sleep 1
        done
        [[ "$ready" == true ]] || { printf 'Restore PostgreSQL did not become ready. No deletion performed.\n' >&2; exit 1; }
        docker cp "$backup_path" "$restore_container:/tmp/prelaunch.dump" >/dev/null
        docker exec "$restore_container" pg_restore --exit-on-error --no-owner \
            --no-acl -U postgres -d postgres /tmp/prelaunch.dump
        docker rm -f "$restore_container" >/dev/null
        restore_container=''
        printf 'Verified actual disposable PostgreSQL restore; backup saved at %s\n' "$backup_path"
        shops_now="$(psql "$DATABASE_URL" -X -qAt -F '|' -v ON_ERROR_STOP=1 -c '
            SELECT shop."domain", shop."id"
            FROM "commerce"."Shop" AS shop
            WHERE shop."platform" = '\''SHOPIFY'\''
            ORDER BY shop."domain", shop."id";
        ')"
        [[ "$shops_now" == "$shops" ]] || { printf 'Shopify shop inventory changed since preview; no deletion performed.\n' >&2; exit 1; }
        flags+=(--prelaunch-production-reset --confirm-database "$database_name" --backup-file "$backup_path")
    else
        case "$url_hostname" in
            localhost|127.0.0.1|'[::1]') ;;
            *)
                read -r -p 'Remote DB detected. Type REMOTE-DEV-ONLY if verified non-production: ' answer </dev/tty
                [[ "$answer" == REMOTE-DEV-ONLY ]] || { printf 'Cancelled.\n'; exit 0; }
                flags+=(--allow-remote-development-db)
                ;;
        esac
    fi
fi

deleted_count=0
skipped_count=0
failed_count=0
preview_count=0
while IFS='|' read -r domain shop_id; do
    [[ -n "$domain" && -n "$shop_id" ]] || continue
    printf '\n------------------------------------------------------------\nShopify: %s\nShop ID: %s\n' "$domain" "$shop_id"

    if ! preview="$(npm run --silent admin:delete-merchant-data -- status --shop "$domain" 2>&1)"; then
        printf '%s\nPreview failed for %s; skipped.\n' "$preview" "$domain" >&2
        failed_count=$((failed_count + 1))
        [[ "$prelaunch" == true && "$mode" == execute ]] && break
        continue
    fi
    printf '%s\n' "$preview"

    # Fail closed if the preview no longer identifies the exact Shopify row, or
    # if deletion-risk counts are missing or invalid.
    if ! inventory_fields="$(PREVIEW_DOMAIN="$domain" PREVIEW_SHOP_ID="$shop_id" node -e '
      const fs = require("node:fs");
      const report = JSON.parse(fs.readFileSync(0, "utf8"));
      if (report.action !== "status" || report.shop?.platform !== "SHOPIFY" ||
          report.shop.domain !== process.env.PREVIEW_DOMAIN ||
          report.shop.id !== process.env.PREVIEW_SHOP_ID) {
        throw new Error("Shop identity/platform changed or does not match Shopify preview");
      }
      const keys = ["merchantKnowledgeUploadedAssets", "commerceAgentPrompts",
        "commerceAuditEvents", "commerceExternalConnectionAudits", "whatsAppConsentEvidence"];
      const counts = keys.map(key => {
        const count = report.inventory?.[key];
        if (!Number.isSafeInteger(count) || count < 0) throw new Error(`Invalid inventory count: ${key}`);
        return count;
      });
      process.stdout.write(counts.join(" "));
    ' <<< "$preview")"; then
        printf 'Preview data invalid for %s; skipped.\n' "$domain" >&2
        failed_count=$((failed_count + 1))
        [[ "$prelaunch" == true && "$mode" == execute ]] && break
        continue
    fi
    read -r asset_count prompt_count audit_count external_audit_count consent_count <<< "$inventory_fields"
    preview_count=$((preview_count + 1))
    [[ "$mode" == execute ]] || continue

    shop_flags=("${flags[@]}")
    if (( asset_count > 0 )); then
        read -r -p "Shop has $asset_count uploaded R2 assets. Type ASSETS-HANDLED after handling them: " answer </dev/tty
        [[ "$answer" == ASSETS-HANDLED ]] || { printf 'Skipped %s.\n' "$domain"; skipped_count=$((skipped_count + 1)); continue; }
        shop_flags+=(--external-assets-handled)
    fi
    if (( prompt_count > 0 )); then
        read -r -p "Shop has $prompt_count immutable prompts. Type PURGE-PROMPTS: " answer </dev/tty
        [[ "$answer" == PURGE-PROMPTS ]] || { printf 'Skipped %s.\n' "$domain"; skipped_count=$((skipped_count + 1)); continue; }
        shop_flags+=(--confirm-immutable-prompt-purge)
    fi
    if (( audit_count > 0 || external_audit_count > 0 )); then
        read -r -p 'Shop has immutable commerce audit records. Type PURGE-AUDIT: ' answer </dev/tty
        [[ "$answer" == PURGE-AUDIT ]] || { printf 'Skipped %s.\n' "$domain"; skipped_count=$((skipped_count + 1)); continue; }
        shop_flags+=(--confirm-immutable-audit-purge)
    fi
    read -r -p "Consent evidence count: $consent_count. Type PURGE-CONSENT to authorize its removal: " answer </dev/tty
    [[ "$answer" == PURGE-CONSENT ]] || { printf 'Skipped %s.\n' "$domain"; skipped_count=$((skipped_count + 1)); continue; }
    shop_flags+=(--confirm-immutable-consent-purge)

    read -r -p "Type exact Shopify shop domain ($domain) to delete it: " answer </dev/tty
    [[ "$answer" == "$domain" ]] || { printf 'Skipped %s.\n' "$domain"; skipped_count=$((skipped_count + 1)); continue; }

    if [[ "$prelaunch" == true ]]; then
        # Never let an unsupervised CLI invocation inherit this authorisation.
        export MODA_PRELAUNCH_RESET_AUTHORIZATION='PRELAUNCH_TEST_DATA_ONLY'
    fi
    if npm run admin:delete-merchant-data -- delete --shop "$domain" --confirm-shop "$domain" "${shop_flags[@]}"; then
        unset MODA_PRELAUNCH_RESET_AUTHORIZATION || true
        printf 'Deleted Moda database records for %s.\n' "$domain"
        deleted_count=$((deleted_count + 1))
    else
        unset MODA_PRELAUNCH_RESET_AUTHORIZATION || true
        printf 'Deletion failed for %s; per-shop database transaction should have rolled back.\n' "$domain" >&2
        failed_count=$((failed_count + 1))
        # Production deletion is per-shop transactional, not globally atomic.
        # Stop on first failure so no additional merchant is affected.
        [[ "$prelaunch" == true ]] && break
    fi
done <<< "$shops"

printf '\nFinished. Previewed: %d; deleted: %d; skipped: %d; failed: %d.\n' \
    "$preview_count" "$deleted_count" "$skipped_count" "$failed_count"
if [[ "$mode" == execute ]]; then
    woo_after="$(psql "$DATABASE_URL" -X -qAt -F '|' -v ON_ERROR_STOP=1 -c \
        "SELECT \"id\", \"domain\" FROM \"commerce\".\"Shop\" WHERE \"platform\" = 'WOOCOMMERCE' ORDER BY \"id\";" )"
    if [[ "$woo_before" != "$woo_after" ]]; then
        printf 'CRITICAL: WooCommerce shop identities differ from the pre-reset snapshot. Investigate immediately.\n' >&2
        exit 1
    fi
    if [[ "$prelaunch" == true ]]; then
        remaining="$(psql "$DATABASE_URL" -X -qAt -v ON_ERROR_STOP=1 -c \
            "SELECT count(*) FROM \"commerce\".\"Shop\" WHERE \"platform\" = 'SHOPIFY';")"
        printf 'Shopify merchants remaining in Moda DB: %s\n' "$remaining"
        printf 'Backup: %s (sha256 in adjacent .sha256)\n' "$backup_path"
        printf 'External Shopify/Meta subscriptions, Redis and R2 remain operator-owned follow-up checks.\n'
        [[ "$remaining" == 0 ]] || exit 1
    fi
fi
(( failed_count == 0 && skipped_count == 0 ))
