#!/bin/bash
# Job Monitor Deployment Script
# Usage: ./deploy.sh <target>
#
# Targets:
#   e2    - E2 workspace (DEFAULT profile)
#           https://job-monitor-1444828305810485.aws.databricksapps.com
#
#   prod  - DEMO WEST workspace (DEMO WEST profile)
#           https://job-monitor-2556758628403379.aws.databricksapps.com
#
#   dev   - Dev workspace (LPT_FREE_EDITION profile)
#           https://job-monitor-3704140105640043.aws.databricksapps.com

set -e

TARGET="${1:-e2}"

# Configuration per target
case "$TARGET" in
  e2)
    BUNDLE_FILE="databricks.e2.yml"
    PROFILE="DEFAULT"
    APP_YAML="app.e2.yaml"
    WORKSPACE_PATH="/Workspace/Users/laurent.prat@databricks.com/.bundle/job-monitor/e2/files"
    ;;
  prod)
    BUNDLE_FILE="databricks.prod.yml"
    PROFILE="DEMO WEST"
    APP_YAML="app.prod.yaml"
    WORKSPACE_PATH="/Workspace/Users/laurent.prat@databricks.com/.bundle/job-monitor/prod/files"
    ;;
  dev)
    BUNDLE_FILE="databricks.dev.yml"
    PROFILE="LPT_FREE_EDITION"
    APP_YAML="app.yaml"
    WORKSPACE_PATH="/Workspace/Users/laurent.prat@mailwatcher.net/.bundle/job-monitor/dev/files"
    ;;
  *)
    echo "Unknown target: $TARGET"
    echo "Valid targets: e2, prod, dev"
    exit 1
    ;;
esac

echo "=========================================="
echo "Deploying Job Monitor"
echo "=========================================="
echo "Target:    $TARGET"
echo "Profile:   $PROFILE"
echo "Bundle:    $BUNDLE_FILE"
echo "App YAML:  $APP_YAML"
echo "=========================================="

# Check if bundle file exists
if [ ! -f "$BUNDLE_FILE" ]; then
  echo "Error: Bundle file $BUNDLE_FILE not found"
  exit 1
fi

# Build frontend if dist doesn't exist or is older than source
if [ ! -d "job_monitor/ui/dist" ] || [ "$(find job_monitor/ui/src -newer job_monitor/ui/dist -print -quit)" ]; then
  echo ""
  echo "Building frontend..."
  cd job_monitor/ui
  npm run build
  cd ../..
fi

# Deploy bundle
echo ""
echo "Deploying bundle..."
databricks bundle deploy -t "$TARGET" --bundle-root . --config-file "$BUNDLE_FILE"

# Deploy app
echo ""
echo "Deploying app..."
databricks apps deploy job-monitor \
  --source-code-path "$WORKSPACE_PATH" \
  -p "$PROFILE"

# Enable OBO (only for non-dev targets)
if [ "$TARGET" != "dev" ]; then
  echo ""
  echo "Enabling OBO..."
  databricks apps update job-monitor --json '{"user_api_scopes": ["sql"]}' -p "$PROFILE"
fi

echo ""
echo "=========================================="
echo "Deployment complete!"
echo "=========================================="

# Get app URL
APP_INFO=$(databricks apps get job-monitor -p "$PROFILE" 2>/dev/null)
APP_URL=$(echo "$APP_INFO" | grep -o '"url":"[^"]*"' | cut -d'"' -f4)
APP_STATE=$(echo "$APP_INFO" | grep -o '"state":"[^"]*"' | head -1 | cut -d'"' -f4)

echo "App URL:   $APP_URL"
echo "Status:    $APP_STATE"
echo "=========================================="
