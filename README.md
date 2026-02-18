# Job Monitor

Databricks Job Monitoring Framework - A real-time operational monitoring dashboard for Databricks jobs, clusters, and resources.

## Features

- Job execution monitoring with SLA tracking
- Cluster utilization and cost analysis
- Real-time alerts for failures and anomalies
- User-attributed cost reporting

## Development

```bash
# Install dependencies
pip install -e ".[dev]"

# Run locally
uvicorn job_monitor.backend.app:app --reload
```

## Deployment

This project is designed to be deployed as a Databricks App using Asset Bundles:

```bash
databricks bundle deploy
databricks bundle run job-monitor
```
