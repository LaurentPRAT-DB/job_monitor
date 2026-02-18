# Feature Research

**Domain:** Databricks Job Monitoring & Optimization
**Researched:** 2026-02-18
**Confidence:** MEDIUM (based on Databricks platform knowledge; web verification tools unavailable)

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Job Success/Failure Tracking | Basic visibility; any monitoring tool provides this | LOW | System tables (`system.workflow.jobs`, `system.workflow.job_run_timeline`) provide this data |
| Job Duration Metrics | Users need to know if jobs are taking longer than expected | LOW | Compare current run duration to historical averages |
| Alert on Job Failure | Without alerts, monitoring is just logging | LOW | Databricks native alerts or Slack webhooks |
| Historical Run Dashboard | Users need trends, not just current state | MEDIUM | Requires aggregation queries and visualization |
| Per-Job Status View | Drill down from overview to specific job | LOW | Standard UI pattern |
| Filtering by Team/Owner | Multi-team environments need scoping | LOW | Requires job tagging or metadata association |
| Run Log Access | When things fail, users need to see why | LOW | Link to Databricks run UI or embed logs |
| Basic Cost Visibility | DBU costs are always a concern | MEDIUM | Join system.billing.usage with job runs |
| SLA/Schedule Adherence | Users need to know if jobs run on time | MEDIUM | Compare actual start/end times to expected schedule |
| Cluster Utilization Summary | Basic resource efficiency view | MEDIUM | Requires system.compute.clusters data analysis |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Proactive SLA Breach Prediction | Alert BEFORE breach (at 80% of window) vs after | MEDIUM | Requires real-time or near-real-time run tracking; high value for preventing incidents |
| Actionable Remediation Suggestions | Don't just report problems, suggest fixes | HIGH | Requires domain knowledge encoded in rules (e.g., "low CPU utilization -> reduce cluster size") |
| Cost Attribution by Business Unit | Chargeback/showback for finance and governance | MEDIUM | Requires job-to-team mapping metadata and aggregation |
| Anomaly Detection (vs static thresholds) | Catch issues without manually tuning every threshold | HIGH | Statistical analysis (moving averages, percentile deviation) vs simple thresholds |
| Cluster Right-Sizing Recommendations | Specific recommendations: "reduce to 4 workers" vs "cluster underutilized" | HIGH | Analyze utilization patterns and map to specific SKU recommendations |
| Data Quality Integration | Connect pipeline health to data quality metrics | HIGH | Requires Lakehouse Monitoring or custom expectations framework |
| Small Files Detection & OPTIMIZE Tracking | Delta Lake specific optimization insights | MEDIUM | Track file counts per table, OPTIMIZE/VACUUM history |
| Cross-Job Dependency Visualization | See pipeline DAGs and failure propagation | HIGH | Requires job dependency metadata extraction |
| Trend Analysis with Regression Detection | "Job X is getting 2% slower per week" | MEDIUM | Time-series analysis on historical run data |
| Executive Cost Reporting | CFO-friendly summaries, not just dashboards | MEDIUM | Requires aggregation, formatting, automated delivery |
| Photon/GPU Upgrade Recommendations | Identify jobs that would benefit from runtime changes | HIGH | Requires workload analysis (query patterns for Photon, training patterns for GPU) |
| Zombie Job Detection | Find scheduled jobs doing minimal work | MEDIUM | Compare compute cost to actual output/work done |
| Spot Instance Interruption Analysis | Track preemption rates and reliability impact | LOW | Data available in system tables, requires correlation |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Real-time Streaming Metrics | "We need instant visibility" | Adds significant complexity (streaming infra), cost; most job monitoring is fine with 5-15 min latency | Near-real-time batch (5-min refresh) covers 95% of use cases at 10% complexity |
| Automated Remediation (kill/restart jobs) | "Automate away the problems" | Risk of runaway automation, cascading failures, lack of human judgment | Suggestions + one-click actions with human approval |
| External Dashboarding (Grafana/Datadog) | "We already use X for monitoring" | Data export complexity, sync issues, extra cost; fragments the monitoring story | Databricks-native dashboards with export capability for integration if needed |
| Per-Minute Granularity for All Metrics | "We need to see everything in detail" | Storage explosion, slow queries, rarely needed; 1000+ jobs x 1440 datapoints/day = 1.4M rows/day minimum | Hourly/daily aggregates with drill-down to run-level on demand |
| Full Query Text Logging | "We need to see exactly what ran" | Privacy/security concerns, storage costs, rarely actionable | Query fingerprints + link to Databricks Query History |
| Custom Machine Learning for Anomalies | "AI-powered monitoring" | Requires data science team maintenance, black-box predictions hard to trust | Simple statistical methods (percentile deviation, moving averages) are interpretable and sufficient |
| Mobile Push Notifications | "I want alerts on my phone" | Extra platform (mobile app), Slack/Email already reach phones | Slack mobile app provides push notifications for alerts |
| Historical Retention Beyond 90 Days | "We need years of history" | Diminishing returns; job configurations change, historical comparisons become meaningless | 90-day detailed + monthly aggregates for long-term trends |

## Feature Dependencies

```
[Job Success/Failure Tracking]
    |
    +--requires--> [Job Run Data Ingestion]
    |                  |
    |                  +--requires--> [System Tables Access]
    |
    +--enables--> [Alert on Job Failure]
    |                  |
    |                  +--enables--> [Slack Integration]
    |                  +--enables--> [Email Integration]
    |
    +--enables--> [Historical Run Dashboard]
                       |
                       +--enables--> [Trend Analysis]
                       +--enables--> [Anomaly Detection]

[Job Duration Metrics]
    |
    +--enables--> [SLA Monitoring]
                       |
                       +--enables--> [Proactive SLA Breach Prediction]

[Basic Cost Visibility]
    |
    +--requires--> [Billing Data Ingestion] (system.billing.usage)
    |
    +--enables--> [Cost Attribution by Business Unit]
    |                  |
    |                  +--requires--> [Job-to-Team Metadata Mapping]
    |
    +--enables--> [Budget Thresholds & Alerts]
    |
    +--enables--> [Executive Cost Reporting]

[Cluster Utilization Summary]
    |
    +--requires--> [Compute Data Ingestion] (system.compute.*)
    |
    +--enables--> [Cluster Right-Sizing Recommendations]
    +--enables--> [Spot Instance Interruption Analysis]

[Data Pipeline Integrity]
    |
    +--requires--> [Delta Table Metadata Access]
    +--requires--> [Data Quality Framework]
    |
    +--enables--> [Small Files Detection]
    +--enables--> [Schema Drift Alerts]
    +--enables--> [Row Count Anomaly Detection]
```

### Dependency Notes

- **Alerting requires Job Run Data:** Cannot alert without first collecting and processing run data
- **Cost Attribution requires Team Mapping:** Must establish job ownership metadata before cost rollups work
- **SLA Prediction requires Duration History:** Need baseline data before predicting breaches
- **Right-sizing requires Utilization Data:** Must collect cluster metrics before generating recommendations
- **Data Quality features are semi-independent:** Can be added as a separate track after core monitoring

## MVP Definition

### Launch With (v1)

Minimum viable product: what's needed to prove value to platform team.

- [x] **Job Success/Failure Tracking** - Foundation for all other monitoring
- [x] **Alert on Job Failure** - Shift from reactive to proactive (core value prop)
- [x] **Consecutive Failure Detection** - Distinguishes from noise (2+ failures = real problem)
- [x] **Job Duration Metrics + SLA Adherence** - SLA monitoring is a key requirement
- [x] **Basic Cost per Job** - Cost visibility is always requested
- [x] **Historical Dashboard (7/30 day)** - Need trends to identify patterns
- [x] **Slack Integration** - Alerts need to reach humans

### Add After Validation (v1.x)

Features to add once core is working and adopted.

- [ ] **Proactive SLA Breach Prediction** - Add after baseline SLA tracking proves useful
- [ ] **Cluster Utilization + Right-Sizing Suggestions** - High value but needs core stable first
- [ ] **Cost Attribution by Team** - Requires metadata setup, often takes organizational work
- [ ] **Anomaly Detection (statistical)** - Needs historical data to calibrate baselines
- [ ] **Weekly/Monthly Reports** - After daily operations are working

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] **Data Pipeline Integrity (schema drift, row counts)** - Requires Delta table access setup
- [ ] **Cross-Job Dependency Visualization** - Complex, needs DAG extraction
- [ ] **Photon/GPU Upgrade Recommendations** - Specialized analysis, needs benchmarking
- [ ] **Executive Reporting** - After operational reporting is stable
- [ ] **Custom Thresholds per Job** - Start with defaults, add customization based on feedback

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Job Success/Failure Tracking | HIGH | LOW | P1 |
| Alert on Job Failure (Slack) | HIGH | LOW | P1 |
| Consecutive Failure Detection | HIGH | LOW | P1 |
| Job Duration Metrics | HIGH | LOW | P1 |
| SLA Adherence Tracking | HIGH | MEDIUM | P1 |
| Basic Cost per Job | HIGH | MEDIUM | P1 |
| Historical Dashboard | HIGH | MEDIUM | P1 |
| Filtering by Team/Owner | MEDIUM | LOW | P1 |
| Proactive SLA Prediction | HIGH | MEDIUM | P2 |
| Cluster Utilization Summary | MEDIUM | MEDIUM | P2 |
| Right-Sizing Recommendations | HIGH | HIGH | P2 |
| Cost Attribution by Team | MEDIUM | MEDIUM | P2 |
| Anomaly Detection | MEDIUM | HIGH | P2 |
| Weekly Cost Reports | MEDIUM | LOW | P2 |
| Data Quality Integration | MEDIUM | HIGH | P3 |
| Dependency Visualization | LOW | HIGH | P3 |
| Photon/GPU Recommendations | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for launch - core monitoring capabilities
- P2: Should have, add after v1 - optimization and advanced features
- P3: Nice to have, future consideration - specialized/complex features

## Competitor Feature Analysis

| Feature | Databricks Native (Lakeview + Alerts) | Monte Carlo / Datadog | Custom Framework (This Project) |
|---------|--------------------------------------|----------------------|--------------------------------|
| Job Status Tracking | Basic via system tables + dashboards | Full coverage | Full coverage with customization |
| Alerting | Native alerts (limited customization) | Rich alerting rules | Custom rules + Slack/Email |
| Cost Attribution | Manual queries on billing tables | Often requires separate setup | Integrated with job metadata |
| SLA Monitoring | Not built-in | Often supported | First-class feature |
| Right-Sizing | Not automated | Some ML-based suggestions | Rule-based recommendations |
| Data Quality | Lakehouse Monitoring (separate feature) | Core product | Integrated with job monitoring |
| Multi-Team Support | Manual filtering | Built-in RBAC | Custom team mapping |
| Remediation Suggestions | None | Some automation | Context-aware suggestions |

**Our Approach Differentiation:**
1. **Databricks-native:** No data export, uses existing compute, familiar tools
2. **Platform team focused:** Designed for operators managing 1000+ jobs, not just individual job owners
3. **Integrated cost + health:** Single view of reliability AND cost, not separate dashboards
4. **Actionable alerts:** Suggestions with alerts, not just problem notifications
5. **Configurable per business needs:** Team mapping, custom SLAs, budget thresholds

## Databricks System Tables Reference

Key data sources for feature implementation (MEDIUM confidence - verify against current Databricks docs):

| System Table | Features Enabled | Notes |
|--------------|------------------|-------|
| `system.workflow.jobs` | Job metadata, schedule info | Job definitions |
| `system.workflow.job_run_timeline` | Run history, status, duration | Primary monitoring source |
| `system.workflow.job_task_run_timeline` | Task-level details | Drill-down capability |
| `system.billing.usage` | DBU consumption, cost | Cost attribution |
| `system.billing.list_prices` | SKU pricing | Cost calculation |
| `system.compute.clusters` | Cluster configurations | Right-sizing analysis |
| `system.compute.node_types` | Available node specs | Recommendations |
| `system.access.audit` | Access logs | Security/audit features |

## Sources

- Databricks documentation (training data - verify current state)
- Databricks system tables schema (training data - MEDIUM confidence)
- Enterprise observability patterns (training data)
- Platform engineering practices (training data)

**Verification needed:**
- Current system table schemas (may have changed)
- Lakehouse Monitoring feature availability
- Alert API capabilities
- Dashboard (Lakeview) capabilities

---
*Feature research for: Databricks Job Monitoring & Optimization*
*Researched: 2026-02-18*
*Note: Web verification tools unavailable during research. Confidence levels reflect training data without current verification.*
