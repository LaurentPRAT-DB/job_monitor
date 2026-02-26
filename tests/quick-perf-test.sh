#!/bin/bash
# Quick Performance Test for Job Monitor
# Tests API response times with response caching

BASE_URL="${1:-https://job-monitor-1444828305810485.aws.databricksapps.com}"
echo "Testing: $BASE_URL"
echo ""
echo "============================================"
echo "PERFORMANCE TEST WITH RESPONSE CACHING"
echo "============================================"
echo ""

# Function to test endpoint
test_endpoint() {
    local name=$1
    local path=$2

    echo "Testing $name..."

    # First request (cold)
    start=$(date +%s%N)
    status1=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL$path" 2>/dev/null)
    end=$(date +%s%N)
    time1=$(( (end - start) / 1000000 ))

    # Wait 1 second
    sleep 1

    # Second request (should hit response cache)
    start=$(date +%s%N)
    status2=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL$path" 2>/dev/null)
    end=$(date +%s%N)
    time2=$(( (end - start) / 1000000 ))

    # Calculate speedup
    if [ $time1 -gt 0 ] && [ $time2 -gt 0 ]; then
        speedup=$(echo "scale=1; $time1 / $time2" | bc)
    else
        speedup="N/A"
    fi

    echo "  Cold:   ${time1}ms (HTTP $status1)"
    echo "  Cached: ${time2}ms (HTTP $status2)"
    echo "  Speedup: ${speedup}x"
    echo ""
}

echo "Note: These tests require browser authentication."
echo "If you get 401, open the app in browser first."
echo ""
echo "--- Testing endpoints ---"
echo ""

# Test main slow endpoints
test_endpoint "Health Check" "/api/health"
test_endpoint "Cache Status" "/api/cache/status"

echo "============================================"
echo "Test complete!"
echo ""
echo "For full tests with authentication, run:"
echo "  1. Start Chrome: /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222"
echo "  2. Log in to: $BASE_URL"
echo "  3. Run: cd tests && node load-test.js 0.1"
echo "============================================"
