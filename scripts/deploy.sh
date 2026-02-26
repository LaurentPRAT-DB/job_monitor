#!/bin/bash
# Deploy script - rebuilds frontend and deploys to specified target
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

# Deploy bundle
echo "==> Deploying bundle..."
cd "$PROJECT_DIR"
databricks bundle deploy -t "$TARGET"

# Deploy app
echo "==> Deploying app..."
if [ "$TARGET" = "e2" ]; then
    databricks apps deploy job-monitor \
        --source-code-path /Workspace/Users/laurent.prat@databricks.com/.bundle/job-monitor/e2/files \
        -p DEFAULT
elif [ "$TARGET" = "dev" ]; then
    databricks apps deploy job-monitor \
        --source-code-path /Workspace/Users/laurent.prat@mailwatcher.net/.bundle/job-monitor/dev/files \
        -p LPT_FREE_EDITION
else
    echo "Unknown target: $TARGET"
    exit 1
fi

echo "==> Deployment complete!"
