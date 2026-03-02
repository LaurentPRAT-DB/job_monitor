# Changelog

All notable changes to the Databricks Job Monitor project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.3.2] - 2026-03-01

### Fixed
- **IndexedDB DataCloneError**: Fixed Promise serialization error when persisting TanStack Query cache to IndexedDB. Pending queries containing Promises were being serialized, causing `DataCloneError`. Added `status === 'success'` filter to `shouldDehydrateQuery`.
- **Delta schema evolution**: Added `.option("overwriteSchema", "true")` to cache refresh job to handle schema changes (like adding `workspace_id` column to alerts_cache).

### Added
- **Cost anomalies caching**: Added response caching to `/api/costs/anomalies` endpoint with 10-minute TTL, reducing latency from 13+ seconds to <1s for cached responses.

### Changed
- Updated documentation with v1.3.2 fixes and optimization details.

---

## [1.3.1] - 2026-03-01

### Added
- **workspace_id in alerts_cache**: Added `workspace_id` column to the pre-computed alerts cache table, enabling filtered queries at the Delta layer.

### Performance
- **35x faster alerts with workspace filter**: Queries with `workspace_id` filter now use Delta cache directly, reducing latency from 46s to 1.3s.

---

## [1.3.0] - 2026-02-28

### Added
- **IndexedDB cache persistence**: TanStack Query cache now persists to IndexedDB, surviving page refreshes for instant loading.
- **Extended route prefetching**: Added prefetching for `/alerts` and `/cost` routes when visiting Active Jobs page.
- **Selective alert category queries**: Backend now only queries alert categories requested by the frontend, significantly reducing query time.

### Changed
- Tiered cache presets for TanStack Query based on data volatility (static, semiLive, slow, live, session).

---

## [1.2.0] - 2026-02-27

### Added
- **Table virtualization**: Implemented `@tanstack/react-virtual` for health metrics and alerts tables, rendering only visible rows.
- **Alert cache sharing**: Alerts page now shares cache with Active Jobs sidebar badge.
- **Architecture diagrams**: Added Mermaid diagrams to documentation (data flow, caching strategy).

### Performance
- Virtual scrolling enables smooth rendering of 4000+ job rows without DOM bloat.

---

## [1.1.0] - 2026-02-26

### Added
- **Delta cache tables**: Pre-computed cache tables (`job_health_cache`, `cost_cache`, `alerts_cache`) for fast dashboard loading.
- **Backend response cache**: In-memory TTL-based cache for API responses (60-600s depending on endpoint).
- **GZip compression**: Enabled gzip compression for responses >500 bytes.
- **Route prefetching**: Active Jobs page prefetches health metrics data.

### Performance
- Health metrics: 11-16s → <2s (8x faster)
- Costs summary: 30-40s → <3s (10x faster)
- Alerts: 5-10s → <2s (3x faster)

---

## [1.0.0] - 2026-02-25

### Added
- **Initial production release**
- Job health monitoring with priority flags (P1/P2/P3)
- Active jobs real-time view with recent run history
- Cost analysis with per-job and per-team breakdowns
- Cost anomaly detection (>2x P90 baseline)
- Dynamic alert generation (failure, SLA, cost, cluster categories)
- Alert acknowledgment with 24-hour TTL
- Historical batch runs analysis
- Multi-workspace support via OBO authentication
- Mock data fallback for permission-restricted environments

### Technical
- FastAPI backend with Databricks SDK
- React frontend with TanStack Router and TanStack Query
- Recharts for data visualization
- Unity Catalog system tables as data source
- Databricks App deployment via DABs

---

## [0.9.0] - 2026-02-20 (Beta)

### Added
- Beta release for internal testing
- Core monitoring features
- Basic alerting system
- Cost tracking prototype

---

## Deployment Targets

| Version | E2 | DEMO WEST | Dev |
|---------|----|-----------|----|
| 1.3.2 | Deployed | Deployed | Deployed |
| 1.3.1 | Deployed | - | - |
| 1.3.0 | Deployed | - | - |
| 1.2.0 | Deployed | - | - |
| 1.1.0 | Deployed | - | - |
| 1.0.0 | Deployed | Deployed | - |

---

## Migration Notes

### 1.3.1 → 1.3.2
No migration required. Cache tables are refreshed automatically.

### 1.3.0 → 1.3.1
The `alerts_cache` table schema changed to add `workspace_id`. The cache refresh job handles this automatically with `overwriteSchema: true`.

### 1.2.0 → 1.3.0
No migration required. IndexedDB cache is created automatically on first visit.

### 1.0.0 → 1.1.0
**Cache table setup required:**
1. Run the cache refresh job to create tables
2. Grant permissions:
   ```sql
   GRANT USE CATALOG ON CATALOG job_monitor TO `account users`;
   GRANT USE SCHEMA ON SCHEMA job_monitor.cache TO `account users`;
   GRANT SELECT ON SCHEMA job_monitor.cache TO `account users`;
   ```

---

*For detailed technical documentation, see [DEVELOPER.md](DEVELOPER.md) and [docs/](docs/).*
