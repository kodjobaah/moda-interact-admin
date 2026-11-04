#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ -z "${DATABASE_URL:-}" ]]; then
    printf 'DATABASE_URL must point to the intended development/test database.\n' >&2
    exit 1
fi
if [[ ! -r /dev/tty || ! -w /dev/tty ]]; then
    printf 'An interactive terminal is required; run this script directly in a terminal.\n' >&2
    exit 1
fi

for required_command in psql npm node; do
    if ! command -v "$required_command" >/dev/null 2>&1; then
        printf 'Required command not found: %s\n' "$required_command" >&2
        exit 1
    fi
done

database_identity="$(psql "$DATABASE_URL" -X -qAt -v ON_ERROR_STOP=1 \
    -c "SELECT current_database() || E'\\t' || COALESCE(inet_server_addr()::text, 'local socket');")"
IFS=$'\t' read -r database_name database_host <<< "$database_identity"
printf 'Target database: %s (server: %s)\n' "$database_name" "$database_host"
printf 'This removes Moda database records for selected WooCommerce shops only.\n'
printf 'It does not delete WooCommerce-side products, orders, customers, or media.\n'
printf 'Back up the database and stop API/worker processes before proceeding.\n'
read -r -p "Type the database name to continue: " database_confirmation </dev/tty
if [[ "$database_confirmation" != "$database_name" ]]; then
    printf 'Database confirmation did not match; no merchants were changed.\n'
    exit 0
fi
read -r -p "Type STOPPED after backing up and stopping relevant workers: " readiness_confirmation </dev/tty
if [[ "$readiness_confirmation" != "STOPPED" ]]; then
    printf 'Readiness confirmation did not match; no merchants were changed.\n'
    exit 0
fi

delete_flags=(--confirm-test-data --confirm-workers-stopped)
case "$(node -e 'process.stdout.write(new URL(process.env.DATABASE_URL).hostname)')" in
    localhost|127.0.0.1|'[::1]') ;;
    *)
        read -r -p "Remote database detected. Type REMOTE-DEV-ONLY only after verifying it is non-production: " remote_confirmation </dev/tty
        if [[ "$remote_confirmation" != "REMOTE-DEV-ONLY" ]]; then
            printf 'Remote database was not explicitly approved; no merchants were changed.\n'
            exit 0
        fi
        delete_flags+=(--allow-remote-development-db)
        ;;
esac

shops="$(psql "$DATABASE_URL" -X -qAt -F '|' -v ON_ERROR_STOP=1 -c '
    SELECT shop."domain", shop."id"
    FROM "commerce"."Shop" AS shop
    INNER JOIN "woocommerce"."WooCommerceInstallation" AS installation
        ON installation."shopId" = shop."id"
    WHERE shop."platform" = '\''WOOCOMMERCE'\''
    ORDER BY shop."domain";
')"

if [[ -z "$shops" ]]; then
    printf 'No WooCommerce installations found.\n'
    exit 0
fi

deleted_count=0
skipped_count=0
failed_count=0
while IFS='|' read -r domain shop_id; do
    [[ -n "$domain" ]] || continue
    printf '\n------------------------------------------------------------\n'
    printf 'WooCommerce shop: %s\nShop ID: %s\n' "$domain" "$shop_id"

    if ! preview="$(npm run --silent admin:delete-merchant-data -- status --shop "$domain" 2>&1)"; then
        printf '%s\n' "$preview" >&2
        printf 'Could not load preview for %s; skipping.\n' "$domain" >&2
        failed_count=$((failed_count + 1))
        continue
    fi
    printf '%s\n' "$preview"

    if ! read -r asset_count prompt_count audit_count external_audit_count < <(
        node -e '
            const report = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
            const inventory = report.inventory;
            process.stdout.write([
                inventory.merchantKnowledgeUploadedAssets || 0,
                inventory.commerceAgentPrompts || 0,
                inventory.commerceAuditEvents || 0,
                inventory.commerceExternalConnectionAudits || 0,
            ].join(" ") + "\n");
        ' <<< "$preview"
    ); then
        printf 'Could not read preview counts for %s; skipping.\n' "$domain" >&2
        failed_count=$((failed_count + 1))
        continue
    fi

    shop_flags=("${delete_flags[@]}")
    if (( asset_count > 0 )); then
        read -r -p "Handle/retain this shop's R2 assets separately, then type ASSETS-HANDLED to continue: " assets_confirmation </dev/tty
        if [[ "$assets_confirmation" != "ASSETS-HANDLED" ]]; then
            printf 'Skipped %s; uploaded assets were not confirmed handled.\n' "$domain"
            skipped_count=$((skipped_count + 1))
            continue
        fi
        shop_flags+=(--external-assets-handled)
    fi
    if (( prompt_count > 0 )); then
        read -r -p "Type PURGE-PROMPTS to authorize removing this shop's immutable prompt history: " prompt_confirmation </dev/tty
        if [[ "$prompt_confirmation" != "PURGE-PROMPTS" ]]; then
            printf 'Skipped %s; immutable prompt purge was not authorized.\n' "$domain"
            skipped_count=$((skipped_count + 1))
            continue
        fi
        shop_flags+=(--confirm-immutable-prompt-purge)
    fi
    if (( audit_count > 0 || external_audit_count > 0 )); then
        read -r -p "Type PURGE-AUDIT to authorize removing this shop's immutable audit history: " audit_confirmation </dev/tty
        if [[ "$audit_confirmation" != "PURGE-AUDIT" ]]; then
            printf 'Skipped %s; immutable audit purge was not authorized.\n' "$domain"
            skipped_count=$((skipped_count + 1))
            continue
        fi
        shop_flags+=(--confirm-immutable-audit-purge)
    fi
    consent_count="$(node -e '
        const report = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
        process.stdout.write(String(report.inventory.whatsAppConsentEvidence || 0));
    ' <<< "$preview")"
    read -r -p "Consent evidence preview count: $consent_count. Type PURGE-CONSENT to authorize removing any consent history for this shop: " consent_confirmation </dev/tty
    if [[ "$consent_confirmation" != "PURGE-CONSENT" ]]; then
        printf 'Skipped %s; consent-history purge was not authorized.\n' "$domain"
        skipped_count=$((skipped_count + 1))
        continue
    fi
    shop_flags+=(--confirm-immutable-consent-purge)

    read -r -p "Type the exact shop domain ($domain) to delete its Moda database records: " shop_confirmation </dev/tty
    if [[ "$shop_confirmation" != "$domain" ]]; then
        printf 'Skipped %s; shop confirmation did not match.\n' "$domain"
        skipped_count=$((skipped_count + 1))
        continue
    fi

    if npm run admin:delete-merchant-data -- delete \
        --shop "$domain" --confirm-shop "$domain" "${shop_flags[@]}"; then
        printf 'Deleted Moda database records for %s.\n' "$domain"
        deleted_count=$((deleted_count + 1))
    else
        printf 'Deletion failed for %s; the per-shop utility should have rolled back its transaction.\n' "$domain" >&2
        failed_count=$((failed_count + 1))
    fi
done <<< "$shops"

printf '\nFinished. Deleted: %d; skipped: %d; failed: %d.\n' \
    "$deleted_count" "$skipped_count" "$failed_count"
(( failed_count == 0 ))

