"""Refresh metrics cache job.

This job pre-aggregates data from system tables into Delta tables for fast dashboard loading.
Configuration is loaded from job_monitor/config.yaml, with CLI arguments as overrides.

Tables created:
- {catalog}.{schema}.job_health_cache: Pre-computed job health metrics
- {catalog}.{schema}.cost_cache: Pre-computed cost data by job and team
- {catalog}.{schema}.alerts_cache: Pre-computed alert conditions
"""

import argparse
from datetime import datetime
from pathlib import Path

import yaml
from pyspark.sql import SparkSession
from pyspark.sql import functions as F


def load_config() -> dict:
    """Load configuration from config.yaml file."""
    # Try multiple paths (job may run from different working directories)
    # Note: __file__ is not available in Spark context, so use try/except
    config_paths = [
        Path("job_monitor/config.yaml"),  # relative to workspace root
        Path("/Workspace/job_monitor/config.yaml"),  # workspace path
    ]

    # Try to add path relative to script location (only works locally)
    try:
        config_paths.insert(0, Path(__file__).parent.parent / "config.yaml")
    except NameError:
        pass  # __file__ not defined in Spark context

    for config_path in config_paths:
        try:
            if config_path.exists():
                print(f"[{datetime.now()}] Loading config from {config_path}")
                with open(config_path) as f:
                    return yaml.safe_load(f) or {}
        except Exception as e:
            print(f"[{datetime.now()}] Could not read {config_path}: {e}")

    print(f"[{datetime.now()}] No config.yaml found, using CLI arguments only")
    return {}


def get_spark() -> SparkSession:
    """Get or create SparkSession."""
    return SparkSession.builder.getOrCreate()


def refresh_job_health_cache(spark: SparkSession, catalog: str, schema: str) -> int:
    """Refresh job health metrics cache.

    Computes:
    - Success rates (7-day and 30-day windows)
    - Priority flags (P1/P2/P3)
    - Consecutive failure detection
    - Retry counts

    Returns number of jobs cached.
    """
    print(f"[{datetime.now()}] Refreshing job health cache...")

    # Query for 30-day window (covers both 7 and 30 day views)
    health_query = """
    WITH latest_jobs AS (
        SELECT *,
            ROW_NUMBER() OVER(
                PARTITION BY workspace_id, job_id
                ORDER BY change_time DESC
            ) as rn
        FROM system.lakeflow.jobs
        WHERE delete_time IS NULL
    ),
    run_stats_30d AS (
        SELECT
            job_id,
            COUNT(*) as total_runs_30d,
            COUNT(CASE WHEN result_state = 'SUCCESS' THEN 1 END) as success_count_30d,
            MAX(period_start_time) as last_run_time,
            MAX(CASE WHEN result_state IS NOT NULL THEN run_duration_seconds END) as last_duration
        FROM system.lakeflow.job_run_timeline
        WHERE period_start_time >= current_date() - INTERVAL 30 DAYS
        GROUP BY job_id
    ),
    run_stats_7d AS (
        SELECT
            job_id,
            COUNT(*) as total_runs_7d,
            COUNT(CASE WHEN result_state = 'SUCCESS' THEN 1 END) as success_count_7d
        FROM system.lakeflow.job_run_timeline
        WHERE period_start_time >= current_date() - INTERVAL 7 DAYS
        GROUP BY job_id
    ),
    consecutive_check AS (
        SELECT
            job_id,
            result_state,
            LAG(result_state) OVER (PARTITION BY job_id ORDER BY period_start_time DESC) as prev_state,
            ROW_NUMBER() OVER (PARTITION BY job_id ORDER BY period_start_time DESC) as rn
        FROM system.lakeflow.job_run_timeline
        WHERE period_start_time >= current_date() - INTERVAL 7 DAYS
    ),
    priority_flags AS (
        SELECT
            cc.job_id,
            CASE
                WHEN cc.result_state = 'FAILED' AND cc.prev_state = 'FAILED' THEN 'P1'
                WHEN cc.result_state = 'FAILED' THEN 'P2'
                ELSE NULL
            END as failure_priority
        FROM consecutive_check cc
        WHERE cc.rn = 1
    ),
    retry_counts AS (
        SELECT
            job_id,
            SUM(CASE WHEN run_count > 1 THEN run_count - 1 ELSE 0 END) as retry_count
        FROM (
            SELECT job_id, DATE(period_start_time) as run_date, COUNT(*) as run_count
            FROM system.lakeflow.job_run_timeline
            WHERE period_start_time >= current_date() - INTERVAL 7 DAYS
            GROUP BY job_id, DATE(period_start_time)
        )
        GROUP BY job_id
    ),
    duration_stats AS (
        SELECT
            job_id,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY run_duration_seconds) as median_duration,
            PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY run_duration_seconds) as p90_duration,
            AVG(run_duration_seconds) as avg_duration,
            MAX(run_duration_seconds) as max_duration
        FROM system.lakeflow.job_run_timeline
        WHERE period_start_time >= current_date() - INTERVAL 30 DAYS
          AND run_duration_seconds IS NOT NULL
          AND result_state IS NOT NULL
        GROUP BY job_id
    )
    SELECT
        rs30.job_id,
        lj.name as job_name,
        rs30.total_runs_30d,
        rs30.success_count_30d,
        ROUND(100.0 * rs30.success_count_30d / NULLIF(rs30.total_runs_30d, 0), 1) as success_rate_30d,
        COALESCE(rs7.total_runs_7d, 0) as total_runs_7d,
        COALESCE(rs7.success_count_7d, 0) as success_count_7d,
        ROUND(100.0 * COALESCE(rs7.success_count_7d, 0) / NULLIF(COALESCE(rs7.total_runs_7d, 0), 0), 1) as success_rate_7d,
        rs30.last_run_time,
        rs30.last_duration as last_duration_seconds,
        CASE
            WHEN pf.failure_priority IS NOT NULL THEN pf.failure_priority
            WHEN ROUND(100.0 * COALESCE(rs7.success_count_7d, 0) / NULLIF(COALESCE(rs7.total_runs_7d, 0), 0), 1) BETWEEN 70 AND 89.9 THEN 'P3'
            ELSE NULL
        END as priority,
        COALESCE(rc.retry_count, 0) as retry_count,
        ds.median_duration as median_duration_seconds,
        ds.p90_duration as p90_duration_seconds,
        ds.avg_duration as avg_duration_seconds,
        ds.max_duration as max_duration_seconds,
        current_timestamp() as refreshed_at
    FROM run_stats_30d rs30
    LEFT JOIN run_stats_7d rs7 ON rs30.job_id = rs7.job_id
    LEFT JOIN latest_jobs lj ON rs30.job_id = lj.job_id AND lj.rn = 1
    LEFT JOIN priority_flags pf ON rs30.job_id = pf.job_id
    LEFT JOIN retry_counts rc ON rs30.job_id = rc.job_id
    LEFT JOIN duration_stats ds ON rs30.job_id = ds.job_id
    """

    df = spark.sql(health_query)
    row_count = df.count()

    # Write to Delta table (overwrite for full refresh)
    table_name = f"{catalog}.{schema}.job_health_cache"
    df.write.format("delta").mode("overwrite").saveAsTable(table_name)

    print(f"[{datetime.now()}] Wrote {row_count} jobs to {table_name}")
    return row_count


def refresh_cost_cache(spark: SparkSession, catalog: str, schema: str) -> int:
    """Refresh cost cache with per-job and per-team breakdowns.

    Returns number of jobs cached.
    """
    print(f"[{datetime.now()}] Refreshing cost cache...")

    cost_query = """
    WITH job_costs AS (
        SELECT
            usage_metadata.job_id as job_id,
            sku_name,
            SUM(usage_quantity) as total_dbus,
            SUM(CASE WHEN usage_date >= current_date() - INTERVAL 7 DAYS THEN usage_quantity ELSE 0 END) as current_7d,
            SUM(CASE WHEN usage_date >= current_date() - INTERVAL 14 DAYS AND usage_date < current_date() - INTERVAL 7 DAYS THEN usage_quantity ELSE 0 END) as prev_7d
        FROM system.billing.usage
        WHERE usage_date >= current_date() - INTERVAL 30 DAYS
          AND usage_metadata.job_id IS NOT NULL
        GROUP BY usage_metadata.job_id, sku_name
        HAVING SUM(usage_quantity) != 0
    ),
    job_totals AS (
        SELECT
            job_id,
            SUM(total_dbus) as total_dbus_30d,
            SUM(current_7d) as current_7d_dbus,
            SUM(prev_7d) as prev_7d_dbus,
            CONCAT_WS(',', COLLECT_LIST(CONCAT(sku_name, ':', CAST(total_dbus AS STRING)))) as sku_breakdown
        FROM job_costs
        GROUP BY job_id
    ),
    job_p90 AS (
        SELECT
            job_id,
            PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY daily_dbus) as p90_dbus
        FROM (
            SELECT
                usage_metadata.job_id as job_id,
                usage_date,
                SUM(usage_quantity) as daily_dbus
            FROM system.billing.usage
            WHERE usage_date >= current_date() - INTERVAL 30 DAYS
              AND usage_metadata.job_id IS NOT NULL
            GROUP BY usage_metadata.job_id, usage_date
            HAVING SUM(usage_quantity) != 0
        )
        GROUP BY job_id
        HAVING COUNT(*) >= 5
    ),
    job_names AS (
        SELECT job_id, name,
            ROW_NUMBER() OVER(PARTITION BY workspace_id, job_id ORDER BY change_time DESC) as rn
        FROM system.lakeflow.jobs
        WHERE delete_time IS NULL
    )
    SELECT
        jt.job_id,
        COALESCE(jn.name, CONCAT('job-', jt.job_id)) as job_name,
        jt.total_dbus_30d,
        jt.current_7d_dbus,
        jt.prev_7d_dbus,
        ROUND(
            CASE
                WHEN jt.prev_7d_dbus > 0 THEN ((jt.current_7d_dbus - jt.prev_7d_dbus) / jt.prev_7d_dbus) * 100
                WHEN jt.current_7d_dbus > 0 THEN 100.0
                ELSE 0.0
            END, 1
        ) as trend_7d_percent,
        jt.sku_breakdown,
        jp.p90_dbus as baseline_p90_dbus,
        CASE WHEN jp.p90_dbus IS NOT NULL AND jt.current_7d_dbus > (2 * jp.p90_dbus) THEN true ELSE false END as is_anomaly,
        current_timestamp() as refreshed_at
    FROM job_totals jt
    LEFT JOIN job_names jn ON jt.job_id = jn.job_id AND jn.rn = 1
    LEFT JOIN job_p90 jp ON jt.job_id = jp.job_id
    ORDER BY jt.total_dbus_30d DESC
    """

    df = spark.sql(cost_query)
    row_count = df.count()

    table_name = f"{catalog}.{schema}.cost_cache"
    df.write.format("delta").mode("overwrite").saveAsTable(table_name)

    print(f"[{datetime.now()}] Wrote {row_count} jobs to {table_name}")
    return row_count


def refresh_alerts_cache(spark: SparkSession, catalog: str, schema: str) -> int:
    """Refresh alerts cache with pre-computed alert conditions.

    Returns number of alerts cached.
    """
    print(f"[{datetime.now()}] Refreshing alerts cache...")

    alerts_query = """
    WITH run_stats AS (
        SELECT
            job_id,
            COUNT(*) as total_runs,
            COUNT(CASE WHEN result_state = 'SUCCESS' THEN 1 END) as success_count,
            MAX(period_start_time) as last_run_time
        FROM system.lakeflow.job_run_timeline
        WHERE period_start_time >= current_date() - INTERVAL 7 DAYS
        GROUP BY job_id
    ),
    consecutive_check AS (
        SELECT
            job_id,
            result_state,
            LAG(result_state) OVER (PARTITION BY job_id ORDER BY period_start_time DESC) as prev_state,
            ROW_NUMBER() OVER (PARTITION BY job_id ORDER BY period_start_time DESC) as rn
        FROM system.lakeflow.job_run_timeline
        WHERE period_start_time >= current_date() - INTERVAL 7 DAYS
    ),
    failure_reasons AS (
        SELECT job_id, COLLECT_SET(termination_code) as reasons
        FROM system.lakeflow.job_run_timeline
        WHERE period_start_time >= current_date() - INTERVAL 7 DAYS
          AND result_state = 'FAILED'
          AND termination_code IS NOT NULL
        GROUP BY job_id
    ),
    job_names AS (
        SELECT job_id, name,
            ROW_NUMBER() OVER(PARTITION BY workspace_id, job_id ORDER BY change_time DESC) as rn
        FROM system.lakeflow.jobs
        WHERE delete_time IS NULL
    ),
    cost_anomalies AS (
        SELECT
            usage_metadata.job_id as job_id,
            SUM(usage_quantity) as current_7d_dbus
        FROM system.billing.usage
        WHERE usage_date >= current_date() - INTERVAL 7 DAYS
          AND usage_metadata.job_id IS NOT NULL
        GROUP BY usage_metadata.job_id
        HAVING SUM(usage_quantity) > 0
    ),
    cost_baselines AS (
        SELECT
            job_id,
            PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY daily_dbus) as p90_dbus
        FROM (
            SELECT
                usage_metadata.job_id as job_id,
                usage_date,
                SUM(usage_quantity) as daily_dbus
            FROM system.billing.usage
            WHERE usage_date >= current_date() - INTERVAL 30 DAYS
              AND usage_metadata.job_id IS NOT NULL
            GROUP BY usage_metadata.job_id, usage_date
            HAVING SUM(usage_quantity) != 0
        )
        GROUP BY job_id
        HAVING COUNT(*) >= 5
    )
    -- Failure alerts
    SELECT
        CONCAT('failure_', rs.job_id, '_',
            CASE
                WHEN cc.result_state = 'FAILED' AND cc.prev_state = 'FAILED' THEN 'p1'
                WHEN cc.result_state = 'FAILED' THEN 'p2'
                ELSE 'p3'
            END
        ) as alert_id,
        rs.job_id,
        COALESCE(jn.name, CONCAT('job-', rs.job_id)) as job_name,
        'failure' as category,
        CASE
            WHEN cc.result_state = 'FAILED' AND cc.prev_state = 'FAILED' THEN 'P1'
            WHEN cc.result_state = 'FAILED' THEN 'P2'
            ELSE 'P3'
        END as severity,
        CASE
            WHEN cc.result_state = 'FAILED' AND cc.prev_state = 'FAILED' THEN '2+ consecutive failures'
            WHEN cc.result_state = 'FAILED' THEN 'Recent failure'
            ELSE CONCAT('Success rate at ', ROUND(100.0 * rs.success_count / NULLIF(rs.total_runs, 0), 1), '%')
        END as title,
        CASE
            WHEN cc.result_state = 'FAILED' AND cc.prev_state = 'FAILED' THEN CONCAT('Job failed 2+ times in a row. Last failure at ', rs.last_run_time)
            WHEN cc.result_state = 'FAILED' THEN CONCAT('Job failed at ', rs.last_run_time, '. Success rate: ', ROUND(100.0 * rs.success_count / NULLIF(rs.total_runs, 0), 1), '%')
            ELSE 'Job is in yellow zone (70-89% success rate). May need attention.'
        END as description,
        CAST(fr.reasons AS STRING) as failure_reasons,
        NULL as current_dbus,
        NULL as baseline_p90_dbus,
        NULL as cost_multiplier,
        current_timestamp() as refreshed_at
    FROM run_stats rs
    LEFT JOIN job_names jn ON rs.job_id = jn.job_id AND jn.rn = 1
    LEFT JOIN consecutive_check cc ON rs.job_id = cc.job_id AND cc.rn = 1
    LEFT JOIN failure_reasons fr ON rs.job_id = fr.job_id
    WHERE cc.result_state = 'FAILED'
       OR ROUND(100.0 * rs.success_count / NULLIF(rs.total_runs, 0), 1) BETWEEN 70 AND 89.9

    UNION ALL

    -- Cost spike alerts
    SELECT
        CONCAT('cost_', ca.job_id, '_spike') as alert_id,
        ca.job_id,
        COALESCE(jn.name, CONCAT('job-', ca.job_id)) as job_name,
        'cost' as category,
        'P2' as severity,
        CONCAT('Cost spike (', ROUND(ca.current_7d_dbus / cb.p90_dbus, 1), 'x baseline)') as title,
        CONCAT('Current 7-day cost (', ROUND(ca.current_7d_dbus, 1), ' DBUs) is ', ROUND(ca.current_7d_dbus / cb.p90_dbus, 1), 'x higher than p90 baseline (', ROUND(cb.p90_dbus, 1), ' DBUs).') as description,
        NULL as failure_reasons,
        ca.current_7d_dbus as current_dbus,
        cb.p90_dbus as baseline_p90_dbus,
        ROUND(ca.current_7d_dbus / cb.p90_dbus, 2) as cost_multiplier,
        current_timestamp() as refreshed_at
    FROM cost_anomalies ca
    JOIN cost_baselines cb ON ca.job_id = cb.job_id
    LEFT JOIN job_names jn ON ca.job_id = jn.job_id AND jn.rn = 1
    WHERE ca.current_7d_dbus > (cb.p90_dbus * 2)
    """

    df = spark.sql(alerts_query)
    row_count = df.count()

    table_name = f"{catalog}.{schema}.alerts_cache"
    df.write.format("delta").mode("overwrite").saveAsTable(table_name)

    print(f"[{datetime.now()}] Wrote {row_count} alerts to {table_name}")
    return row_count


def ensure_schema_exists(spark: SparkSession, catalog: str, schema: str):
    """Create catalog and schema if they don't exist."""
    # Skip catalog creation for 'main' - it's a system catalog that always exists
    if catalog.lower() != "main":
        spark.sql(f"CREATE CATALOG IF NOT EXISTS {catalog}")
    spark.sql(f"CREATE SCHEMA IF NOT EXISTS {catalog}.{schema}")
    print(f"[{datetime.now()}] Ensured {catalog}.{schema} exists")


def main():
    # Load config from YAML file first
    config = load_config()
    cache_config = config.get("cache", {})

    # CLI args override config file values
    parser = argparse.ArgumentParser(description="Refresh job monitor metrics cache")
    parser.add_argument(
        "--catalog",
        default=cache_config.get("catalog", "job_monitor"),
        help="Catalog name for cache tables (default from config.yaml)"
    )
    parser.add_argument(
        "--schema",
        default=cache_config.get("schema", "cache"),
        help="Schema name for cache tables (default from config.yaml)"
    )
    args = parser.parse_args()

    spark = get_spark()

    print(f"[{datetime.now()}] Starting metrics cache refresh")
    print(f"[{datetime.now()}] Target: {args.catalog}.{args.schema}")
    print(f"[{datetime.now()}] Config: catalog={cache_config.get('catalog')}, schema={cache_config.get('schema')}, cron={cache_config.get('refresh_cron')}")

    # Ensure schema exists
    ensure_schema_exists(spark, args.catalog, args.schema)

    # Refresh all caches
    health_count = refresh_job_health_cache(spark, args.catalog, args.schema)
    cost_count = refresh_cost_cache(spark, args.catalog, args.schema)
    alerts_count = refresh_alerts_cache(spark, args.catalog, args.schema)

    print(f"[{datetime.now()}] Cache refresh complete!")
    print(f"  - Job health: {health_count} jobs")
    print(f"  - Cost data: {cost_count} jobs")
    print(f"  - Alerts: {alerts_count} alerts")


if __name__ == "__main__":
    main()
