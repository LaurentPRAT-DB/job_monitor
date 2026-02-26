-- Create catalog and schema for cache tables
-- Values should match config.yaml: cache.catalog and cache.schema
-- Default: job_monitor.cache
--
-- Prerequisites:
--   User must have CREATE CATALOG permission on metastore, or
--   Use an existing catalog where user has CREATE SCHEMA permission
--
-- To run: Execute in Databricks SQL Editor or via CLI:
--   databricks sql execute --warehouse-id YOUR_WAREHOUSE_ID --statement "$(cat job_monitor/jobs/create_cache_schema.sql)"

-- Create catalog (requires metastore admin)
CREATE CATALOG IF NOT EXISTS job_monitor;

-- Create schema
CREATE SCHEMA IF NOT EXISTS job_monitor.cache;

-- Grant usage to app service principal (replace with actual SP ID)
-- GRANT USE CATALOG ON CATALOG job_monitor TO `app-service-principal`;
-- GRANT USE SCHEMA ON SCHEMA job_monitor.cache TO `app-service-principal`;
-- GRANT SELECT ON SCHEMA job_monitor.cache TO `app-service-principal`;
