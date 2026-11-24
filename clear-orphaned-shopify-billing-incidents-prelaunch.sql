-- ONE-TIME, PRE-LAUNCH-ONLY CLEANUP FOR THE FOUR REVIEWED ORPHANED
-- SHOPIFY BILLING INCIDENTS. Requires a VERIFIED PostgreSQL backup.
-- First run the read-only SELECT from the accompanying instructions and
-- inspect every returned incident. Do not run against a live customer tenant.
-- Execute with: psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f THIS_FILE
-- All modifications run in a single transaction. No FK triggers are disabled.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

CREATE TEMP TABLE prelaunch_shopify_incident_target ON COMMIT DROP AS
SELECT "id", "reasonCode", "resourceKey"
FROM support."OperationalIncident"
WHERE "environment" = 'production'
  AND "sourceService" = 'moda-billing-worker'
  AND "category" = 'SHOPIFY_SUBSCRIPTION_BILLING'
  AND "shopId" IS NULL
  AND "reasonCode" IN ('UNMAPPED_PLAN_HANDLE', 'INTERNAL_RECONCILIATION_ERROR');

SELECT "id", "reasonCode", "resourceKey"
FROM prelaunch_shopify_incident_target ORDER BY "reasonCode", "id";

DO $guard$
DECLARE
  target_count bigint;
  approved_count bigint;
BEGIN
  IF current_database() <> 'moda_interact_postgres_production' THEN
    RAISE EXCEPTION 'Unexpected database: %', current_database();
  END IF;
  SELECT COUNT(*) INTO target_count FROM prelaunch_shopify_incident_target;
  IF target_count <> 4 THEN
    RAISE EXCEPTION 'Refusing incident purge: expected exactly four reviewed orphans, found %', target_count;
  END IF;
  SELECT COUNT(*) INTO approved_count
    FROM pg_catalog.pg_trigger t
    JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'support' AND c.relname = 'OperationalIncidentEvent'
      AND t.tgname = 'OperationalIncidentEvent_immutable'
      AND t.tgenabled = 'O' AND NOT t.tgisinternal;
  IF approved_count <> 1 THEN
    RAISE EXCEPTION 'Incident-event immutability trigger absent or altered; no deletion performed';
  END IF;
END
$guard$;

-- The trigger blocks deletes normally. Temporarily disable ONLY this known
-- application trigger inside the transaction; PostgreSQL will restore the
-- previous state if anything fails and the transaction rolls back.
ALTER TABLE support."OperationalIncidentEvent"
  DISABLE TRIGGER "OperationalIncidentEvent_immutable";

DELETE FROM support."OperationalIncidentEvent" e
USING prelaunch_shopify_incident_target t
WHERE e."incidentId" = t."id";

ALTER TABLE support."OperationalIncidentEvent"
  ENABLE TRIGGER "OperationalIncidentEvent_immutable";

DELETE FROM support."OperationalIncident" i
USING prelaunch_shopify_incident_target t
WHERE i."id" = t."id";

DO $verify$
BEGIN
  IF EXISTS (
    SELECT 1 FROM support."OperationalIncident" i
    JOIN prelaunch_shopify_incident_target t ON t."id" = i."id"
  ) THEN
    RAISE EXCEPTION 'Target incident remained; rolling back';
  END IF;
END
$verify$;
COMMIT;
