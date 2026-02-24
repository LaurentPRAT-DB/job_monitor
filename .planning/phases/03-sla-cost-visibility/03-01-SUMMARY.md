---
phase: 03
plan: 01
status: complete
started: 2026-02-24
completed: 2026-02-24
duration_minutes: 8
---

# Summary: Backend APIs for SLA and Cost

## What Was Built

Two new backend routers providing SLA target management via job tags and comprehensive cost attribution with anomaly detection.

## Key Files

### Created
- `job_monitor/backend/routers/job_tags.py` — Job tag CRUD via Databricks Jobs API (GET/PATCH for SLA, team, owner tags)
- `job_monitor/backend/routers/cost.py` — Cost aggregation endpoints with SKU breakdown and anomaly detection

### Modified
- `job_monitor/backend/config.py` — Added sla_tag_key, team_tag_key, owner_tag_key, dbu_rate settings
- `job_monitor/backend/models.py` — Added TagUpdateRequest, TagUpdateResponse, JobTagsOut, JobCostOut, TeamCostOut, CostAnomalyOut, CostBySkuOut, CostSummaryOut
- `job_monitor/backend/app.py` — Registered job_tags and cost routers

## Endpoints Added

### Job Tags (`/api/jobs/{job_id}/tags`)
- `GET` — Read SLA target, team, owner tags; includes suggested_p90_minutes if no SLA defined
- `PATCH` — Update tags with merge behavior preserving existing job settings

### Cost (`/api/costs/`)
- `GET /summary` — Job costs with SKU breakdown, team rollups, total DBUs, dbu_rate
- `GET /by-team` — Team-level cost aggregation with trend
- `GET /anomalies` — Cost spikes (>2x p90) and zombie jobs with settings URL

## Technical Decisions

1. **Tag storage**: Uses Databricks job tags (native key-value on job settings) rather than separate storage
2. **SKU categorization**: Maps billing SKUs to 5 categories (Jobs Compute, All-Purpose, SQL Warehouse, Serverless, Other)
3. **RETRACTION handling**: Consistent use of `HAVING SUM(usage_quantity) != 0` pattern
4. **Zombie detection**: Conservative thresholds (>10 DBUs with <100 rows over 30 days)
5. **Cost spike threshold**: 2x p90 baseline for anomaly flagging

## Commits

1. `e50fc9b` — feat(03-01): add job tags router with SLA and team tag management
2. `dede881` — feat(03-01): add cost router with SKU breakdown and anomaly detection

## Self-Check: PASSED

- [x] job_tags.py router exists with GET and PATCH endpoints
- [x] cost.py router exists with summary, by-team, and anomalies endpoints
- [x] Config has sla_tag_key, team_tag_key, owner_tag_key, dbu_rate settings
- [x] All new Pydantic models defined in models.py
- [x] Both routers registered in app.py
- [x] RETRACTION handling used in cost queries (HAVING SUM != 0)
- [x] SKU categorization implemented
