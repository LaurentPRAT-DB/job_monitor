#!/bin/bash
# Deploy script - rebuilds frontend and deploys to specified target using DABs
# Usage: ./scripts/deploy.sh [target]
#   target: e2 (default) or dev

set -e

TARGET="${1:-e2}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "==> Deploying to target: $TARGET"

# Rebuild frontend to update build date
echo "==> Rebuilding frontend..."
cd "$PROJECT_DIR/job_monitor/ui"
npm run build

# Deploy using DABs
echo "==> Deploying bundle with DABs..."
cd "$PROJECT_DIR"
databricks bundle deploy -t "$TARGET"

# Run the app resource to trigger deployment
echo "==> Deploying app..."
databricks bundle run job-monitor -t "$TARGET"

echo "==> Deployment complete!"
