#!/bin/bash
# API Benchmark Script for Job Monitor
#
# Quick API performance benchmark without Chrome/browser.
# Can be run in CI/CD or after deployment.
#
# Usage:
#   ./tests/api-benchmark.sh [app_url]
#
# Exit codes:
#   0 - All benchmarks passed
#   1 - Some benchmarks have warnings
#   2 - Critical benchmarks failed

set -e

APP_URL="${1:-https://job-monitor-1444828305810485.aws.databricksapps.com}"
ITERATIONS="${2:-3}"

echo "=========================================="
echo "API Benchmark for Job Monitor"
echo "=========================================="
echo "URL:        $APP_URL"
echo "Iterations: $ITERATIONS"
echo "=========================================="

# Benchmark thresholds (in milliseconds)
declare -A THRESHOLDS_WARN
declare -A THRESHOLDS_FAIL

# Fast endpoints
THRESHOLDS_WARN["/api/me"]=500
THRESHOLDS_FAIL["/api/me"]=2000
THRESHOLDS_WARN["/api/health/live"]=200
THRESHOLDS_FAIL["/api/health/live"]=1000
THRESHOLDS_WARN["/api/filter-presets"]=1000
THRESHOLDS_FAIL["/api/filter-presets"]=3000

# Medium endpoints
THRESHOLDS_WARN["/api/health-metrics?days=7"]=5000
THRESHOLDS_FAIL["/api/health-metrics?days=7"]=15000
THRESHOLDS_WARN["/api/jobs-api/active"]=3000
THRESHOLDS_FAIL["/api/jobs-api/active"]=10000

# Slow endpoints
THRESHOLDS_WARN["/api/health-metrics?days=30"]=10000
THRESHOLDS_FAIL["/api/health-metrics?days=30"]=30000
THRESHOLDS_WARN["/api/costs/summary"]=15000
THRESHOLDS_FAIL["/api/costs/summary"]=45000
THRESHOLDS_WARN["/api/alerts"]=15000
THRESHOLDS_FAIL["/api/alerts"]=45000

# Endpoints to test
ENDPOINTS=(
  "/api/health/live"
  "/api/me"
  "/api/filter-presets"
  "/api/jobs-api/active"
  "/api/health-metrics?days=7"
  "/api/health-metrics?days=30"
  "/api/costs/summary?include_teams=false"
  "/api/alerts?category=sla"
)

# Results storage
declare -A RESULTS_AVG
declare -A RESULTS_MIN
declare -A RESULTS_MAX
declare -A RESULTS_STATUS

PASSED=0
WARNINGS=0
FAILURES=0
ERRORS=0

# Test each endpoint
for endpoint in "${ENDPOINTS[@]}"; do
  echo ""
  echo "Testing: $endpoint"

  total_time=0
  min_time=999999
  max_time=0
  success=0

  for ((i=1; i<=ITERATIONS; i++)); do
    # Make request and measure time
    start_time=$(python3 -c 'import time; print(int(time.time() * 1000))')

    http_code=$(curl -s -o /dev/null -w "%{http_code}" "${APP_URL}${endpoint}" 2>/dev/null) || http_code="000"

    end_time=$(python3 -c 'import time; print(int(time.time() * 1000))')
    duration=$((end_time - start_time))

    if [ "$http_code" = "200" ]; then
      success=$((success + 1))
      total_time=$((total_time + duration))

      if [ "$duration" -lt "$min_time" ]; then
        min_time=$duration
      fi
      if [ "$duration" -gt "$max_time" ]; then
        max_time=$duration
      fi

      echo "  Iteration $i: ${duration}ms (HTTP $http_code)"
    else
      echo "  Iteration $i: FAILED (HTTP $http_code)"
    fi
  done

  # Calculate average
  if [ "$success" -gt 0 ]; then
    avg=$((total_time / success))
    RESULTS_AVG[$endpoint]=$avg
    RESULTS_MIN[$endpoint]=$min_time
    RESULTS_MAX[$endpoint]=$max_time

    # Get base endpoint for threshold lookup
    base_endpoint="${endpoint%%\?*}"
    if [ "$base_endpoint" != "$endpoint" ]; then
      # Has query params, try with common params
      base_endpoint="${endpoint}"
    fi

    # Check against thresholds
    warn_threshold=${THRESHOLDS_WARN[$base_endpoint]:-5000}
    fail_threshold=${THRESHOLDS_FAIL[$base_endpoint]:-15000}

    if [ "$avg" -gt "$fail_threshold" ]; then
      RESULTS_STATUS[$endpoint]="FAIL"
      FAILURES=$((FAILURES + 1))
      echo "  ❌ FAIL: Avg ${avg}ms > threshold ${fail_threshold}ms"
    elif [ "$avg" -gt "$warn_threshold" ]; then
      RESULTS_STATUS[$endpoint]="WARN"
      WARNINGS=$((WARNINGS + 1))
      echo "  ⚠️  WARN: Avg ${avg}ms > threshold ${warn_threshold}ms"
    else
      RESULTS_STATUS[$endpoint]="PASS"
      PASSED=$((PASSED + 1))
      echo "  ✅ PASS: Avg ${avg}ms"
    fi
  else
    RESULTS_STATUS[$endpoint]="ERROR"
    ERRORS=$((ERRORS + 1))
    echo "  ❌ ERROR: All requests failed"
  fi
done

# Summary
echo ""
echo "=========================================="
echo "BENCHMARK SUMMARY"
echo "=========================================="
printf "%-45s %10s %10s %10s %8s\n" "Endpoint" "Avg" "Min" "Max" "Status"
echo "-----------------------------------------------------------------------------------------------------------"

for endpoint in "${ENDPOINTS[@]}"; do
  avg=${RESULTS_AVG[$endpoint]:-"N/A"}
  min=${RESULTS_MIN[$endpoint]:-"N/A"}
  max=${RESULTS_MAX[$endpoint]:-"N/A"}
  status=${RESULTS_STATUS[$endpoint]:-"ERROR"}

  if [ "$avg" != "N/A" ]; then
    printf "%-45s %9sms %9sms %9sms %8s\n" "$endpoint" "$avg" "$min" "$max" "$status"
  else
    printf "%-45s %10s %10s %10s %8s\n" "$endpoint" "N/A" "N/A" "N/A" "$status"
  fi
done

echo "-----------------------------------------------------------------------------------------------------------"
echo ""
echo "Results: $PASSED passed, $WARNINGS warnings, $FAILURES failures, $ERRORS errors"
echo ""

# Determine exit code
if [ "$FAILURES" -gt 0 ] || [ "$ERRORS" -gt 0 ]; then
  echo "❌ BENCHMARK FAILED"
  exit 2
elif [ "$WARNINGS" -gt 0 ]; then
  echo "⚠️  BENCHMARK PASSED WITH WARNINGS"
  exit 1
else
  echo "✅ BENCHMARK PASSED"
  exit 0
fi
