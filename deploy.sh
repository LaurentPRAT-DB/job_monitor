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
#
# Features:
#   - Validates warehouse ID before deployment
#   - Auto-selects serverless or running warehouse if configured one is invalid

set -e

TARGET="${1:-e2}"

# Configuration per target
case "$TARGET" in
  e2)
    BUNDLE_FILE="databricks.e2.yml"
    APP_CONFIG="app.e2.yaml"
    PROFILE="DEFAULT"
    ;;
  prod)
    BUNDLE_FILE="databricks.prod.yml"
    APP_CONFIG="app.prod.yaml"
    PROFILE="DEMO WEST"
    ;;
  dev)
    BUNDLE_FILE="databricks.dev.yml"
    APP_CONFIG="app.yaml"  # dev uses default app.yaml
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

# ============================================
# WAREHOUSE VALIDATION FUNCTION
# ============================================
validate_warehouse() {
  local config_file="$1"
  local profile="$2"

  # Extract configured warehouse ID from app config
  # Handle YAML format: value: "xxx" or value: xxx (with optional comments)
  CONFIGURED_WH=$(grep -A2 'name: WAREHOUSE_ID' "$config_file" | grep 'value:' | sed 's/.*value:[[:space:]]*"\([^"]*\)".*/\1/' | head -1)

  # If quoted extraction failed, try unquoted
  if [ -z "$CONFIGURED_WH" ]; then
    CONFIGURED_WH=$(grep -A2 'name: WAREHOUSE_ID' "$config_file" | grep 'value:' | sed 's/.*value:[[:space:]]*\([^[:space:]#]*\).*/\1/' | head -1)
  fi

  if [ -z "$CONFIGURED_WH" ]; then
    echo "  [WARN] No WAREHOUSE_ID found in $config_file"
    return 1
  fi

  echo "  Configured warehouse: $CONFIGURED_WH"

  # Verify warehouse exists and is accessible
  echo "  Verifying warehouse..."
  WH_INFO=$(databricks warehouses get "$CONFIGURED_WH" --profile "$profile" 2>&1) || {
    echo "  [FAIL] Warehouse $CONFIGURED_WH not found or not accessible"
    return 1
  }

  # Check warehouse state
  WH_STATE=$(echo "$WH_INFO" | grep -o '"state":"[^"]*"' | head -1 | cut -d'"' -f4)
  WH_NAME=$(echo "$WH_INFO" | grep -o '"name":"[^"]*"' | head -1 | cut -d'"' -f4)

  echo "  [OK] Warehouse found: $WH_NAME (state: $WH_STATE)"
  return 0
}

# ============================================
# FIND FALLBACK WAREHOUSE FUNCTION
# ============================================
find_fallback_warehouse() {
  local profile="$1"

  echo "  Searching for available warehouses..."

  # List all warehouses
  WH_LIST=$(databricks warehouses list --profile "$profile" 2>/dev/null) || {
    echo "  [ERROR] Cannot list warehouses"
    return 1
  }

  # Try to find a serverless warehouse first (preferred)
  SERVERLESS_WH=$(echo "$WH_LIST" | grep -i 'serverless' | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  if [ -n "$SERVERLESS_WH" ]; then
    SERVERLESS_NAME=$(echo "$WH_LIST" | grep -B5 "\"id\":\"$SERVERLESS_WH\"" | grep -o '"name":"[^"]*"' | head -1 | cut -d'"' -f4)
    echo "  [FOUND] Serverless warehouse: $SERVERLESS_NAME ($SERVERLESS_WH)"
    echo "$SERVERLESS_WH"
    return 0
  fi

  # Try to find a RUNNING warehouse
  RUNNING_WH=$(echo "$WH_LIST" | grep -B10 '"state":"RUNNING"' | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  if [ -n "$RUNNING_WH" ]; then
    RUNNING_NAME=$(echo "$WH_LIST" | grep -B5 "\"id\":\"$RUNNING_WH\"" | grep -o '"name":"[^"]*"' | head -1 | cut -d'"' -f4)
    echo "  [FOUND] Running warehouse: $RUNNING_NAME ($RUNNING_WH)"
    echo "$RUNNING_WH"
    return 0
  fi

  # Fall back to any warehouse
  ANY_WH=$(echo "$WH_LIST" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  if [ -n "$ANY_WH" ]; then
    ANY_NAME=$(echo "$WH_LIST" | grep -B5 "\"id\":\"$ANY_WH\"" | grep -o '"name":"[^"]*"' | head -1 | cut -d'"' -f4)
    echo "  [FOUND] Available warehouse: $ANY_NAME ($ANY_WH)"
    echo "$ANY_WH"
    return 0
  fi

  echo "  [ERROR] No warehouses available in workspace"
  return 1
}

# ============================================
# UPDATE APP CONFIG WITH NEW WAREHOUSE
# ============================================
update_warehouse_in_config() {
  local config_file="$1"
  local new_wh_id="$2"

  echo "  Updating $config_file with warehouse: $new_wh_id"

  # Use sed to replace the warehouse ID value
  if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS sed
    sed -i '' "s/\(name: WAREHOUSE_ID\)/\1/; /name: WAREHOUSE_ID/{n;s/value:.*/value: \"$new_wh_id\"/;}" "$config_file"
  else
    # GNU sed
    sed -i "s/\(name: WAREHOUSE_ID\)/\1/; /name: WAREHOUSE_ID/{n;s/value:.*/value: \"$new_wh_id\"/;}" "$config_file"
  fi
}

# Build frontend if dist doesn't exist or is older than source
if [ ! -d "job_monitor/ui/dist" ] || [ "$(find job_monitor/ui/src -newer job_monitor/ui/dist -print -quit 2>/dev/null)" ]; then
  echo ""
  echo "Building frontend..."
  cd job_monitor/ui
  npm run build
  cd ../..
fi

# Backup existing configs and use target-specific files
echo ""
echo "Step 1: Setting up config files for $TARGET..."

# Backup and swap databricks.yml
if [ -f "databricks.yml" ]; then
  cp databricks.yml databricks.yml.bak
fi
cp "$BUNDLE_FILE" databricks.yml

# Backup and swap app.yaml (for correct env vars like WAREHOUSE_ID)
if [ -f "app.yaml" ]; then
  cp app.yaml app.yaml.bak
fi
if [ -f "$APP_CONFIG" ] && [ "$APP_CONFIG" != "app.yaml" ]; then
  echo "Using app config: $APP_CONFIG"
  cp "$APP_CONFIG" app.yaml
fi

# ============================================
# STEP 1.5: VALIDATE WAREHOUSE
# ============================================
echo ""
echo "Step 1.5: Validating warehouse configuration..."

if ! validate_warehouse "app.yaml" "$PROFILE"; then
  echo ""
  echo "  Warehouse validation failed. Looking for fallback..."

  FALLBACK_WH=$(find_fallback_warehouse "$PROFILE")

  if [ -n "$FALLBACK_WH" ] && [ "$FALLBACK_WH" != "" ]; then
    echo ""
    read -p "  Use fallback warehouse $FALLBACK_WH? [Y/n] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
      update_warehouse_in_config "app.yaml" "$FALLBACK_WH"
      # Also update the source config file for future deployments
      if [ "$APP_CONFIG" != "app.yaml" ]; then
        update_warehouse_in_config "$APP_CONFIG" "$FALLBACK_WH"
        echo "  [INFO] Also updated $APP_CONFIG for future deployments"
      fi
    else
      echo "  [ABORT] Deployment cancelled. Please fix warehouse ID manually."
      # Restore backups before exiting
      [ -f "databricks.yml.bak" ] && mv databricks.yml.bak databricks.yml
      [ -f "app.yaml.bak" ] && mv app.yaml.bak app.yaml
      exit 1
    fi
  else
    echo "  [ERROR] No fallback warehouse found. Deployment cannot proceed."
    # Restore backups before exiting
    [ -f "databricks.yml.bak" ] && mv databricks.yml.bak databricks.yml
    [ -f "app.yaml.bak" ] && mv app.yaml.bak app.yaml
    exit 1
  fi
else
  echo "  [OK] Warehouse validation passed"
fi

# Deploy bundle using DABs
echo ""
echo "Step 2: Deploying bundle via DABs..."
databricks bundle deploy --target "$TARGET"

# Get the source code path from bundle
SOURCE_PATH=$(databricks bundle summary --target "$TARGET" 2>/dev/null | grep -o 'file_path[^,]*' | head -1 | cut -d'"' -f3)

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

# Deploy app code
echo ""
echo "Step 3: Deploying app..."
databricks apps deploy job-monitor \
  --source-code-path "$SOURCE_PATH" \
  --profile "$PROFILE"

# Enable OBO (only for non-dev targets that support it)
if [ "$TARGET" != "dev" ]; then
  echo ""
  echo "Step 4: Enabling OBO authentication..."
  databricks apps update job-monitor \
    --json '{"user_api_scopes": ["sql"]}' \
    --profile "$PROFILE"
fi

# Restore original config files
if [ -f "databricks.yml.bak" ]; then
  mv databricks.yml.bak databricks.yml
fi
if [ -f "app.yaml.bak" ]; then
  mv app.yaml.bak app.yaml
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
