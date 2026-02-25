-- ============================================================================
-- Grant System Table Access to Job Monitor App Service Principal
-- ============================================================================
--
-- This script grants the job-monitor app's service principal access to the
-- system tables required for monitoring job health, run history, and costs.
--
-- REQUIREMENTS:
--   - Must be run by a metastore admin (account admin)
--   - Run against a SQL warehouse in this workspace
--
-- SERVICE PRINCIPAL: c9546fcb-f8dd-4d69-89a8-0af12157dd06
--   (app-2nl67p job-monitor)
--
-- ============================================================================

-- Verify current user has admin access (informational)
SELECT current_user() AS executing_user, current_timestamp() AS execution_time;

-- ============================================================================
-- SYSTEM.LAKEFLOW - Job run history and metadata
-- ============================================================================
-- Tables used:
--   - system.lakeflow.job_run_timeline (job runs, durations, statuses)
--   - system.lakeflow.jobs (job definitions, names, tags)

GRANT USE SCHEMA ON SCHEMA system.lakeflow TO `c9546fcb-f8dd-4d69-89a8-0af12157dd06`;
GRANT SELECT ON SCHEMA system.lakeflow TO `c9546fcb-f8dd-4d69-89a8-0af12157dd06`;

-- ============================================================================
-- SYSTEM.BILLING - Cost and usage data
-- ============================================================================
-- Tables used:
--   - system.billing.usage (DBU consumption by job, SKU breakdown)

GRANT USE SCHEMA ON SCHEMA system.billing TO `c9546fcb-f8dd-4d69-89a8-0af12157dd06`;
GRANT SELECT ON SCHEMA system.billing TO `c9546fcb-f8dd-4d69-89a8-0af12157dd06`;

-- ============================================================================
-- Verification - Test that grants were applied
-- ============================================================================

-- Check grants on system.lakeflow
SHOW GRANTS ON SCHEMA system.lakeflow;

-- Check grants on system.billing
SHOW GRANTS ON SCHEMA system.billing;

-- ============================================================================
-- Done! The job-monitor app should now be able to query real data.
-- Restart the app or wait for the next API request to see live data.
-- ============================================================================
