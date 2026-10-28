#!/bin/bash

# Configuration - update if your connection details differ
DB_NAME="moda_interact_postgres_test"
DB_USER="postgres"

echo "Fetching merchant data from database..."

# 1. Fetch data from PostgreSQL formatted as "canonicalSiteUrl|shopId"
# Using -t (tuples only) and -A (unaligned output) to make parsing easy
SHOPS=$(psql "$DATABASE_URL" -t -A -c 'SELECT "canonicalSiteUrl", "shopId" FROM woocommerce."WooCommerceInstallation";')

if [ -z "$SHOPS" ]; then
    echo "No shops found or database connection failed."
    exit 1
fi

# 2. Iterate through each line and ask for confirmation
IFS=$'\n'
for row in $SHOPS; do
    # Split row by the pipe delimiter
    url=$(echo "$row" | cut -d '|' -f 1)
    id=$(echo "$row" | cut -d '|' -f 2)
    
    echo "--------------------------------------------------------"
    echo "Found Shop ID: $id"
    echo "URL:          $url"
    echo "--------------------------------------------------------"
    
    # 3. Interactive prompt
    read -p "Do you want to delete data for this merchant? (y/N): " confirm
    
    if [[ "$confirm" =~ ^[Yy]$ ]]; then
        echo "Proceeding with deletion for: $url"
        
        # 4. Execute your command dynamically injecting the target URL
        npm run admin:delete-merchant-data -- delete \
            --shop "$url" \
            --confirm-shop "$url" \
            --confirm-workers-stopped \
            --confirm-test-data \
            --allow-remote-development-db \
            --external-assets-handled \
            --confirm-immutable-audit-purge
            
        echo "Command executed for $url."
    else
        echo "Skipped deletion for $url."
    fi
    echo ""
done

echo "Finished processing all rows."

