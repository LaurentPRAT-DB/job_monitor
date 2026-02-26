#!/bin/bash
# Job Monitor Deployment Script (DABs-based)
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
    ;;
  prod)
    BUNDLE_FILE="databricks.prod.yml"
    PROFILE="DEMO WEST"
    ;;
  dev)
    BUNDLE_FILE="databricks.dev.yml"
    PROFILE="LPT_FREE_EDITION"
    ;;
  *)
    echo "Unknown target: $TARGET"
    echo "Valid targets: e2, prod, dev"
    exit 1
    ;;
esac

echo "=========================================="
echo "Deploying Job Monitor via DABs"
echo "=========================================="
echo "Target:    $TARGET"
echo "Profile:   $PROFILE"
echo "Bundle:    $BUNDLE_FILE"
echo "=========================================="

# Check if bundle file exists
if [ ! -f "$BUNDLE_FILE" ]; then
  echo "Error: Bundle file $BUNDLE_FILE not found"
  exit 1
fi

# Build frontend if dist doesn't exist or is older than source
if [ ! -d "job_monitor/ui/dist" ] || [ "$(find job_monitor/ui/src -newer job_monitor/ui/dist -print -quit 2>/dev/null)" ]; then
  echo ""
  echo "Building frontend..."
  cd job_monitor/ui
  npm run build
  cd ../..
fi

# Deploy bundle using DABs (this uploads files and updates resources)
echo ""
echo "Step 1: Deploying bundle via DABs..."
databricks bundle deploy \
  --target "$TARGET" \
  --config-file "$BUNDLE_FILE"

# Get the source code path from bundle output
SOURCE_PATH=$(databricks bundle summary --target "$TARGET" --config-file "$BUNDLE_FILE" 2>/dev/null | grep -o '/Workspace[^"]*files' | head -1)

if [ -z "$SOURCE_PATH" ]; then
  # Fallback: construct path based on target
  case "$TARGET" in
    e2|prod)
      SOURCE_PATH="/Workspace/Users/laurent.prat@databricks.com/.bundle/job-monitor/$TARGET/files"
      ;;
    dev)
      SOURCE_PATH="/Workspace/Users/laurent.prat@mailwatcher.net/.bundle/job-monitor/$TARGET/files"
      ;;
  esac
fi

# Deploy app code via DABs app deployment
echo ""
echo "Step 2: Deploying app via DABs..."
databricks apps deploy job-monitor \
  --source-code-path "$SOURCE_PATH" \
  --profile "$PROFILE"

# Enable OBO (only for non-dev targets that support it)
if [ "$TARGET" != "dev" ]; then
  echo ""
  echo "Step 3: Enabling OBO authentication..."
  databricks apps update job-monitor \
    --json '{"user_api_scopes": ["sql"]}' \
    --profile "$PROFILE"
fi

echo ""
echo "=========================================="
echo "Deployment complete!"
echo "=========================================="

# Get app info
APP_INFO=$(databricks apps get job-monitor --profile "$PROFILE" 2>/dev/null || echo "{}")
APP_URL=$(echo "$APP_INFO" | grep -o '"url":"[^"]*"' | cut -d'"' -f4)
APP_STATE=$(echo "$APP_INFO" | grep -o '"state":"[^"]*"' | head -1 | cut -d'"' -f4)

echo "App URL:   $APP_URL"
echo "Status:    $APP_STATE"
echo ""
echo "View logs: ${APP_URL}/logz"
echo "=========================================="
