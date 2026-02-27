/**
 * Comprehensive Load Test for Job Monitor Application
 *
 * Covers all API endpoints, simulates user workload, measures:
 * - Response times (avg, p50, p95, p99)
 * - Cache hit rates
 * - Error rates
 * - Throughput
 *
 * Usage:
 *   1. Start Chrome with remote debugging:
 *      /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
 *   2. Log in to the app manually
 *   3. Run: node tests/load-test.js [duration_hours]
 *
 * Default duration: 1 hour
 *
 * Exit codes:
 *   0 - All benchmarks passed
 *   1 - Some benchmarks failed (warnings)
 *   2 - Critical benchmarks failed
 */

const CDP = require('chrome-remote-interface');
const fs = require('fs');
const path = require('path');

// Configuration
// E2 workspace (DEFAULT profile)
const BASE_URL = process.env.TEST_URL || 'https://job-monitor-1444828305810485.aws.databricksapps.com';
const DURATION_HOURS = parseFloat(process.argv[2]) || 1;
const DURATION_MS = DURATION_HOURS * 60 * 60 * 1000;
const REPORT_INTERVAL_MS = 5 * 60 * 1000; // Report every 5 minutes
const CLICK_DELAY_MS = 2000; // Delay between actions
const API_POLL_INTERVAL_MS = 30000; // Poll APIs every 30 seconds

// ============================================
// BENCHMARK THRESHOLDS
// ============================================
// These define pass/warn/fail criteria for performance
const BENCHMARKS = {
  // Response time thresholds (in milliseconds)
  responseTime: {
    // Fast endpoints (auth, simple lookups)
    fast: {
      p95_warn: 1000,    // Warn if P95 > 1s
      p95_fail: 3000,    // Fail if P95 > 3s
      avg_warn: 500,     // Warn if avg > 500ms
      avg_fail: 2000,    // Fail if avg > 2s
      endpoints: ['User Info', 'Filter Presets', 'Active Jobs'],
    },
    // Medium endpoints (aggregated data)
    medium: {
      p95_warn: 5000,    // Warn if P95 > 5s
      p95_fail: 15000,   // Fail if P95 > 15s
      avg_warn: 3000,    // Warn if avg > 3s
      avg_fail: 10000,   // Fail if avg > 10s
      endpoints: ['Health Metrics 7d', 'Historical Runs 7d'],
    },
    // Slow endpoints (complex queries, large datasets)
    slow: {
      p95_warn: 15000,   // Warn if P95 > 15s
      p95_fail: 45000,   // Fail if P95 > 45s
      avg_warn: 10000,   // Warn if avg > 10s
      avg_fail: 30000,   // Fail if avg > 30s
      endpoints: ['Health Metrics 30d', 'Historical Runs 30d', 'Cost Summary', 'Alerts'],
    },
  },
  // Cache hit rate thresholds (percentage)
  cacheHitRate: {
    warn: 30,   // Warn if cache hit rate < 30%
    target: 50, // Target cache hit rate
    good: 70,   // Good if cache hit rate > 70%
  },
  // Error rate thresholds (percentage)
  errorRate: {
    warn: 1,    // Warn if error rate > 1%
    fail: 5,    // Fail if error rate > 5%
  },
  // Page load thresholds (milliseconds)
  pageLoad: {
    p95_warn: 5000,   // Warn if P95 > 5s
    p95_fail: 15000,  // Fail if P95 > 15s
  },
};

// Metrics storage
const metrics = {
  startTime: null,
  endTime: null,
  apiCalls: {},
  pageLoads: {},
  clicks: {},
  errors: [],
  networkRequests: [],
  cacheHits: 0,
  cacheMisses: 0,
};

// API endpoints to test
const API_ENDPOINTS = [
  { path: '/api/me', name: 'User Info', method: 'GET' },
  { path: '/api/alerts', name: 'Alerts', method: 'GET' },
  { path: '/api/jobs-api/active', name: 'Active Jobs', method: 'GET' },
  { path: '/api/health-metrics?days=7', name: 'Health Metrics 7d', method: 'GET' },
  { path: '/api/health-metrics?days=30', name: 'Health Metrics 30d', method: 'GET' },
  { path: '/api/historical/runs?days=7', name: 'Historical Runs 7d', method: 'GET' },
  { path: '/api/historical/runs?days=30', name: 'Historical Runs 30d', method: 'GET' },
  { path: '/api/costs/summary', name: 'Cost Summary', method: 'GET' },
  { path: '/api/filters/presets', name: 'Filter Presets', method: 'GET' },
];

// Pages and click targets - text is the actual element text to search for
// Use partial: true for buttons with dynamic counts (e.g., "Total Jobs 234")
const PAGES = [
  {
    path: '/dashboard',
    name: 'Dashboard',
    clicks: [
      { text: 'Refresh', name: 'Refresh button' },
    ],
  },
  {
    path: '/running-jobs',
    name: 'Running Jobs',
    clicks: [
      { text: 'Refresh', name: 'Refresh button' },
    ],
  },
  {
    path: '/job-health',
    name: 'Job Health',
    clicks: [
      { text: '7 Days', name: '7 Days tab' },
      { text: '30 Days', name: '30 Days tab' },
      { text: 'Total Jobs', name: 'Total Jobs filter', partial: true },
      { text: 'Critical', name: 'Critical filter', partial: true },
      { text: 'Failing', name: 'Failing filter', partial: true },
      { text: 'Warning', name: 'Warning filter', partial: true },
      { text: 'Filters', name: 'Filters toggle' },
      { text: '7D', name: 'Time 7D' },
      { text: '30D', name: 'Time 30D' },
      { text: '90D', name: 'Time 90D' },
      { text: 'Refresh', name: 'Refresh button' },
    ],
  },
  {
    path: '/alerts',
    name: 'Alerts',
    clicks: [
      { text: 'All', name: 'All tab' },
      { text: 'Failure', name: 'Failure tab' },
      { text: 'SLA', name: 'SLA tab' },
      { text: 'Cost', name: 'Cost tab' },
      { text: 'Cluster', name: 'Cluster tab' },
      { text: 'Total', name: 'Total filter', partial: true },
      { text: 'P1', name: 'P1 filter', partial: true },
      { text: 'P2', name: 'P2 filter', partial: true },
      { text: 'P3', name: 'P3 filter', partial: true },
    ],
  },
  {
    path: '/historical',
    name: 'Historical',
    clicks: [
      { text: 'Cost Trends', name: 'Cost Trends tab' },
      { text: 'Success Rate', name: 'Success Rate tab' },
      { text: 'Failures', name: 'Failures tab' },
      { text: 'Refresh', name: 'Refresh button' },
    ],
  },
];

// Initialize metrics for an endpoint/action
function initMetric(category, name) {
  if (!metrics[category][name]) {
    metrics[category][name] = {
      count: 0,
      totalTime: 0,
      times: [],
      errors: 0,
      cacheHits: 0,
    };
  }
}

// Record a timing
function recordTiming(category, name, duration, fromCache = false) {
  initMetric(category, name);
  const m = metrics[category][name];
  m.count++;
  m.totalTime += duration;
  m.times.push(duration);
  if (fromCache) {
    m.cacheHits++;
    metrics.cacheHits++;
  } else {
    metrics.cacheMisses++;
  }
}

// Record an error
function recordError(category, name, error) {
  initMetric(category, name);
  metrics[category][name].errors++;
  metrics.errors.push({
    timestamp: new Date().toISOString(),
    category,
    name,
    error: error.message || error,
  });
}

// Calculate percentile
function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// Format duration
function formatDuration(ms) {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

// Get endpoint category (fast, medium, slow)
function getEndpointCategory(name) {
  for (const [category, config] of Object.entries(BENCHMARKS.responseTime)) {
    if (config.endpoints && config.endpoints.includes(name)) {
      return category;
    }
  }
  return 'slow'; // Default to slow for unknown endpoints
}

// Evaluate benchmarks and return results
function evaluateBenchmarks() {
  const results = {
    passed: [],
    warnings: [],
    failures: [],
    summary: {
      totalChecks: 0,
      passed: 0,
      warnings: 0,
      failures: 0,
    },
  };

  // Evaluate API endpoint response times
  for (const [name, data] of Object.entries(metrics.apiCalls)) {
    if (data.count === 0) continue;

    const category = getEndpointCategory(name);
    const thresholds = BENCHMARKS.responseTime[category];
    const avg = data.totalTime / data.count;
    const p95 = percentile(data.times, 95);

    results.summary.totalChecks += 2; // avg and p95

    // Check P95
    if (p95 > thresholds.p95_fail) {
      results.failures.push({
        check: `${name} P95`,
        value: formatDuration(p95),
        threshold: formatDuration(thresholds.p95_fail),
        message: `P95 response time exceeds failure threshold`,
      });
      results.summary.failures++;
    } else if (p95 > thresholds.p95_warn) {
      results.warnings.push({
        check: `${name} P95`,
        value: formatDuration(p95),
        threshold: formatDuration(thresholds.p95_warn),
        message: `P95 response time exceeds warning threshold`,
      });
      results.summary.warnings++;
    } else {
      results.passed.push({ check: `${name} P95`, value: formatDuration(p95) });
      results.summary.passed++;
    }

    // Check average
    if (avg > thresholds.avg_fail) {
      results.failures.push({
        check: `${name} Avg`,
        value: formatDuration(avg),
        threshold: formatDuration(thresholds.avg_fail),
        message: `Average response time exceeds failure threshold`,
      });
      results.summary.failures++;
    } else if (avg > thresholds.avg_warn) {
      results.warnings.push({
        check: `${name} Avg`,
        value: formatDuration(avg),
        threshold: formatDuration(thresholds.avg_warn),
        message: `Average response time exceeds warning threshold`,
      });
      results.summary.warnings++;
    } else {
      results.passed.push({ check: `${name} Avg`, value: formatDuration(avg) });
      results.summary.passed++;
    }
  }

  // Evaluate cache hit rate
  const totalCacheOps = metrics.cacheHits + metrics.cacheMisses;
  if (totalCacheOps > 0) {
    const cacheHitRate = (metrics.cacheHits / totalCacheOps) * 100;
    results.summary.totalChecks++;

    if (cacheHitRate < BENCHMARKS.cacheHitRate.warn) {
      results.warnings.push({
        check: 'Cache Hit Rate',
        value: `${cacheHitRate.toFixed(1)}%`,
        threshold: `${BENCHMARKS.cacheHitRate.warn}%`,
        message: `Cache hit rate below warning threshold`,
      });
      results.summary.warnings++;
    } else if (cacheHitRate >= BENCHMARKS.cacheHitRate.good) {
      results.passed.push({
        check: 'Cache Hit Rate',
        value: `${cacheHitRate.toFixed(1)}%`,
        note: 'Excellent',
      });
      results.summary.passed++;
    } else {
      results.passed.push({
        check: 'Cache Hit Rate',
        value: `${cacheHitRate.toFixed(1)}%`,
      });
      results.summary.passed++;
    }
  }

  // Evaluate overall error rate
  let totalCalls = 0;
  let totalErrors = 0;
  for (const data of Object.values(metrics.apiCalls)) {
    totalCalls += data.count;
    totalErrors += data.errors;
  }

  if (totalCalls > 0) {
    const errorRate = (totalErrors / totalCalls) * 100;
    results.summary.totalChecks++;

    if (errorRate > BENCHMARKS.errorRate.fail) {
      results.failures.push({
        check: 'Error Rate',
        value: `${errorRate.toFixed(2)}%`,
        threshold: `${BENCHMARKS.errorRate.fail}%`,
        message: `Error rate exceeds failure threshold`,
      });
      results.summary.failures++;
    } else if (errorRate > BENCHMARKS.errorRate.warn) {
      results.warnings.push({
        check: 'Error Rate',
        value: `${errorRate.toFixed(2)}%`,
        threshold: `${BENCHMARKS.errorRate.warn}%`,
        message: `Error rate exceeds warning threshold`,
      });
      results.summary.warnings++;
    } else {
      results.passed.push({
        check: 'Error Rate',
        value: `${errorRate.toFixed(2)}%`,
      });
      results.summary.passed++;
    }
  }

  // Evaluate page load times
  for (const [name, data] of Object.entries(metrics.pageLoads)) {
    if (data.count === 0) continue;

    const p95 = percentile(data.times, 95);
    results.summary.totalChecks++;

    if (p95 > BENCHMARKS.pageLoad.p95_fail) {
      results.failures.push({
        check: `${name} Page Load P95`,
        value: formatDuration(p95),
        threshold: formatDuration(BENCHMARKS.pageLoad.p95_fail),
        message: `Page load P95 exceeds failure threshold`,
      });
      results.summary.failures++;
    } else if (p95 > BENCHMARKS.pageLoad.p95_warn) {
      results.warnings.push({
        check: `${name} Page Load P95`,
        value: formatDuration(p95),
        threshold: formatDuration(BENCHMARKS.pageLoad.p95_warn),
        message: `Page load P95 exceeds warning threshold`,
      });
      results.summary.warnings++;
    } else {
      results.passed.push({ check: `${name} Page Load P95`, value: formatDuration(p95) });
      results.summary.passed++;
    }
  }

  return results;
}

// Generate report
function generateReport(interim = false) {
  const now = Date.now();
  const elapsed = now - metrics.startTime;
  const remaining = Math.max(0, DURATION_MS - elapsed);

  let report = `\n${'='.repeat(80)}\n`;
  report += `JOB MONITOR LOAD TEST REPORT ${interim ? '(INTERIM)' : '(FINAL)'}\n`;
  report += `${'='.repeat(80)}\n\n`;

  report += `Test Duration: ${formatDuration(elapsed)} / ${formatDuration(DURATION_MS)}\n`;
  report += `Remaining: ${formatDuration(remaining)}\n`;
  report += `Report Time: ${new Date().toISOString()}\n\n`;

  // API Calls Summary
  report += `${'─'.repeat(80)}\n`;
  report += `API ENDPOINT PERFORMANCE\n`;
  report += `${'─'.repeat(80)}\n`;
  report += `${'Endpoint'.padEnd(30)} ${'Calls'.padStart(8)} ${'Avg'.padStart(10)} ${'P50'.padStart(10)} ${'P95'.padStart(10)} ${'P99'.padStart(10)} ${'Errors'.padStart(8)} ${'Cache%'.padStart(8)}\n`;
  report += `${'-'.repeat(94)}\n`;

  let totalApiCalls = 0;
  let totalApiTime = 0;
  let totalApiErrors = 0;

  for (const [name, data] of Object.entries(metrics.apiCalls)) {
    const avg = data.count > 0 ? data.totalTime / data.count : 0;
    const p50 = percentile(data.times, 50);
    const p95 = percentile(data.times, 95);
    const p99 = percentile(data.times, 99);
    const cacheRate = data.count > 0 ? ((data.cacheHits / data.count) * 100).toFixed(1) : '0.0';

    report += `${name.padEnd(30)} ${String(data.count).padStart(8)} ${formatDuration(avg).padStart(10)} ${formatDuration(p50).padStart(10)} ${formatDuration(p95).padStart(10)} ${formatDuration(p99).padStart(10)} ${String(data.errors).padStart(8)} ${cacheRate.padStart(7)}%\n`;

    totalApiCalls += data.count;
    totalApiTime += data.totalTime;
    totalApiErrors += data.errors;
  }

  report += `${'-'.repeat(94)}\n`;
  const overallAvg = totalApiCalls > 0 ? totalApiTime / totalApiCalls : 0;
  const overallCacheRate = (metrics.cacheHits + metrics.cacheMisses) > 0
    ? ((metrics.cacheHits / (metrics.cacheHits + metrics.cacheMisses)) * 100).toFixed(1)
    : '0.0';
  report += `${'TOTAL'.padEnd(30)} ${String(totalApiCalls).padStart(8)} ${formatDuration(overallAvg).padStart(10)} ${' '.repeat(20)} ${String(totalApiErrors).padStart(8)} ${overallCacheRate.padStart(7)}%\n\n`;

  // Page Loads Summary
  report += `${'─'.repeat(80)}\n`;
  report += `PAGE LOAD PERFORMANCE\n`;
  report += `${'─'.repeat(80)}\n`;
  report += `${'Page'.padEnd(20)} ${'Loads'.padStart(8)} ${'Avg'.padStart(10)} ${'P50'.padStart(10)} ${'P95'.padStart(10)} ${'Errors'.padStart(8)}\n`;
  report += `${'-'.repeat(66)}\n`;

  for (const [name, data] of Object.entries(metrics.pageLoads)) {
    const avg = data.count > 0 ? data.totalTime / data.count : 0;
    const p50 = percentile(data.times, 50);
    const p95 = percentile(data.times, 95);
    report += `${name.padEnd(20)} ${String(data.count).padStart(8)} ${formatDuration(avg).padStart(10)} ${formatDuration(p50).padStart(10)} ${formatDuration(p95).padStart(10)} ${String(data.errors).padStart(8)}\n`;
  }
  report += '\n';

  // Click Actions Summary
  report += `${'─'.repeat(80)}\n`;
  report += `UI INTERACTION PERFORMANCE\n`;
  report += `${'─'.repeat(80)}\n`;
  report += `${'Action'.padEnd(35)} ${'Count'.padStart(8)} ${'Avg'.padStart(10)} ${'Errors'.padStart(8)}\n`;
  report += `${'-'.repeat(61)}\n`;

  let totalClicks = 0;
  for (const [name, data] of Object.entries(metrics.clicks)) {
    const avg = data.count > 0 ? data.totalTime / data.count : 0;
    report += `${name.padEnd(35)} ${String(data.count).padStart(8)} ${formatDuration(avg).padStart(10)} ${String(data.errors).padStart(8)}\n`;
    totalClicks += data.count;
  }
  report += `${'-'.repeat(61)}\n`;
  report += `${'TOTAL CLICKS'.padEnd(35)} ${String(totalClicks).padStart(8)}\n\n`;

  // Cache Statistics
  report += `${'─'.repeat(80)}\n`;
  report += `CACHE STATISTICS\n`;
  report += `${'─'.repeat(80)}\n`;
  report += `Cache Hits:   ${metrics.cacheHits}\n`;
  report += `Cache Misses: ${metrics.cacheMisses}\n`;
  report += `Hit Rate:     ${overallCacheRate}%\n\n`;

  // Error Summary
  if (metrics.errors.length > 0) {
    report += `${'─'.repeat(80)}\n`;
    report += `ERRORS (${metrics.errors.length} total)\n`;
    report += `${'─'.repeat(80)}\n`;
    const recentErrors = metrics.errors.slice(-10);
    for (const err of recentErrors) {
      report += `[${err.timestamp}] ${err.category}/${err.name}: ${err.error}\n`;
    }
    if (metrics.errors.length > 10) {
      report += `... and ${metrics.errors.length - 10} more errors\n`;
    }
    report += '\n';
  }

  // Benchmark Results
  const benchmarkResults = evaluateBenchmarks();

  report += `${'─'.repeat(80)}\n`;
  report += `BENCHMARK RESULTS\n`;
  report += `${'─'.repeat(80)}\n`;

  const { summary } = benchmarkResults;
  const passRate = summary.totalChecks > 0
    ? ((summary.passed / summary.totalChecks) * 100).toFixed(1)
    : '0.0';

  report += `Total Checks: ${summary.totalChecks}\n`;
  report += `Passed:       ${summary.passed} (${passRate}%)\n`;
  report += `Warnings:     ${summary.warnings}\n`;
  report += `Failures:     ${summary.failures}\n\n`;

  if (benchmarkResults.failures.length > 0) {
    report += `FAILURES:\n`;
    for (const f of benchmarkResults.failures) {
      report += `  ❌ ${f.check}: ${f.value} (threshold: ${f.threshold})\n`;
      report += `     ${f.message}\n`;
    }
    report += '\n';
  }

  if (benchmarkResults.warnings.length > 0) {
    report += `WARNINGS:\n`;
    for (const w of benchmarkResults.warnings) {
      report += `  ⚠️  ${w.check}: ${w.value} (threshold: ${w.threshold})\n`;
      report += `     ${w.message}\n`;
    }
    report += '\n';
  }

  // Overall status
  let overallStatus;
  if (summary.failures > 0) {
    overallStatus = '❌ FAILED';
  } else if (summary.warnings > 0) {
    overallStatus = '⚠️  PASSED WITH WARNINGS';
  } else {
    overallStatus = '✅ PASSED';
  }

  report += `Overall Status: ${overallStatus}\n\n`;

  // Recommendations
  report += `${'─'.repeat(80)}\n`;
  report += `RECOMMENDATIONS\n`;
  report += `${'─'.repeat(80)}\n`;

  const recommendations = [];

  // Add recommendations based on benchmark failures
  for (const f of benchmarkResults.failures) {
    if (f.check.includes('P95')) {
      recommendations.push(`❌ ${f.check}: Consider query optimization, caching, or pagination.`);
    } else if (f.check.includes('Error Rate')) {
      recommendations.push(`❌ Investigate API errors. Check logs at /logz for details.`);
    }
  }

  for (const w of benchmarkResults.warnings) {
    if (w.check.includes('Cache Hit Rate')) {
      recommendations.push(`⚠️  Low cache hit rate. Increase staleTime in TanStack Query presets.`);
    } else if (w.check.includes('P95') || w.check.includes('Avg')) {
      const category = getEndpointCategory(w.check.split(' ')[0]);
      if (category === 'slow') {
        recommendations.push(`⚠️  ${w.check}: Consider using cache tables for pre-aggregated data.`);
      } else {
        recommendations.push(`⚠️  ${w.check}: Investigate query performance.`);
      }
    }
  }

  // Check cache effectiveness
  if (parseFloat(overallCacheRate) < 30) {
    if (!recommendations.some(r => r.includes('cache'))) {
      recommendations.push(`⚠️  Low cache hit rate (${overallCacheRate}%). Consider increasing staleTime or cacheTime in TanStack Query.`);
    }
  } else if (parseFloat(overallCacheRate) > 70) {
    recommendations.push(`✅ Excellent cache hit rate (${overallCacheRate}%). Client-side caching is working effectively.`);
  }

  // Check error rate
  const overallErrorRate = totalApiCalls > 0 ? ((totalApiErrors / totalApiCalls) * 100).toFixed(2) : 0;
  if (parseFloat(overallErrorRate) === 0 && totalApiErrors === 0) {
    recommendations.push(`✅ No API errors recorded. System is stable.`);
  }

  if (recommendations.length === 0) {
    recommendations.push(`✅ No significant issues detected. System is performing well.`);
  }

  for (const rec of recommendations) {
    report += `${rec}\n`;
  }

  report += `\n${'='.repeat(80)}\n`;

  // Store benchmark results for JSON export
  metrics.benchmarks = benchmarkResults;

  return report;
}

// Save report to file
function saveReport(report, filename) {
  fs.writeFileSync(filename, report);
  console.log(`Report saved to: ${filename}`);
}

// Main test runner
async function runLoadTest() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`JOB MONITOR LOAD TEST`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Target: ${BASE_URL}`);
  console.log(`Duration: ${DURATION_HOURS} hour(s)`);
  console.log(`Started: ${new Date().toISOString()}`);
  console.log(`${'='.repeat(60)}\n`);

  metrics.startTime = Date.now();

  let client;
  try {
    // Connect to Chrome
    client = await CDP({ port: 9222 });
    const { Page, Runtime, Network } = client;

    await Network.enable();
    await Page.enable();

    // Track network requests
    Network.responseReceived(({ response, requestId }) => {
      if (response.url.includes('/api/')) {
        const fromCache = response.fromDiskCache || response.fromServiceWorker;
        metrics.networkRequests.push({
          url: response.url,
          status: response.status,
          fromCache,
          timing: response.timing,
        });
      }
    });

    const endTime = metrics.startTime + DURATION_MS;
    let lastReportTime = metrics.startTime;
    let iteration = 0;

    // Main test loop
    while (Date.now() < endTime) {
      iteration++;
      console.log(`\n--- Iteration ${iteration} (${formatDuration(Date.now() - metrics.startTime)} elapsed) ---`);

      // Test each page
      for (const page of PAGES) {
        const url = `${BASE_URL}${page.path}`;
        console.log(`\nNavigating to ${page.name}...`);

        const pageStart = Date.now();
        try {
          await Page.navigate({ url });
          await Page.loadEventFired();
          const pageTime = Date.now() - pageStart;
          recordTiming('pageLoads', page.name, pageTime);
          console.log(`  ✓ Page loaded in ${formatDuration(pageTime)}`);

          // Wait for React to hydrate
          await new Promise(r => setTimeout(r, 1500));

          // Perform clicks on this page
          for (const click of page.clicks) {
            try {
              const clickStart = Date.now();

              // Try to find and click the element
              const searchText = click.text.replace(/'/g, "\\'");
              const usePartial = click.partial || false;
              const result = await Runtime.evaluate({
                expression: `
                  (function() {
                    const searchText = '${searchText}';
                    const usePartial = ${usePartial};
                    const elements = document.querySelectorAll('button, [role="tab"], [role="option"], [role="tabpanel"] button, [data-state]');
                    for (const el of elements) {
                      const text = el.textContent?.trim() || '';
                      const ariaLabel = el.getAttribute('aria-label') || '';
                      // For partial matches (buttons with counts), check if text starts with search text
                      // For exact matches, require exact text or text contains search text
                      const isMatch = usePartial
                        ? text.startsWith(searchText) || ariaLabel.includes(searchText)
                        : text === searchText || text.includes(searchText) || ariaLabel.includes(searchText);
                      if (isMatch) {
                        if (!el.disabled && !el.hasAttribute('disabled')) {
                          el.click();
                          return 'clicked';
                        }
                        return 'disabled';
                      }
                    }
                    return 'not_found';
                  })()
                `,
                returnByValue: true,
              });

              const clickTime = Date.now() - clickStart;

              if (result.result.value === 'clicked') {
                recordTiming('clicks', `${page.name}: ${click.name}`, clickTime);
                console.log(`    ✓ ${click.name} (${formatDuration(clickTime)})`);
              } else {
                // Element not found or disabled - not an error, just skip
                console.log(`    - ${click.name} (${result.result.value})`);
              }

              await new Promise(r => setTimeout(r, CLICK_DELAY_MS));

            } catch (err) {
              recordError('clicks', `${page.name}: ${click.name}`, err);
              console.log(`    ✗ ${click.name}: ${err.message}`);
            }
          }

        } catch (err) {
          recordError('pageLoads', page.name, err);
          console.log(`  ✗ Page load failed: ${err.message}`);
        }

        // Wait between pages
        await new Promise(r => setTimeout(r, 1000));
      }

      // Direct API tests
      console.log('\nTesting API endpoints directly...');
      for (const endpoint of API_ENDPOINTS) {
        try {
          const apiStart = Date.now();
          const result = await Runtime.evaluate({
            expression: `
              fetch('${endpoint.path}')
                .then(r => ({ status: r.status, ok: r.ok }))
                .catch(e => ({ error: e.message }))
            `,
            awaitPromise: true,
            returnByValue: true,
          });

          const apiTime = Date.now() - apiStart;

          if (result.result.value.ok) {
            // Check if this was a cache hit (fast response)
            const fromCache = apiTime < 50;
            recordTiming('apiCalls', endpoint.name, apiTime, fromCache);
            console.log(`  ✓ ${endpoint.name}: ${formatDuration(apiTime)}${fromCache ? ' (cache)' : ''}`);
          } else {
            recordError('apiCalls', endpoint.name, `HTTP ${result.result.value.status}`);
            console.log(`  ✗ ${endpoint.name}: HTTP ${result.result.value.status}`);
          }

        } catch (err) {
          recordError('apiCalls', endpoint.name, err);
          console.log(`  ✗ ${endpoint.name}: ${err.message}`);
        }
      }

      // Generate interim report every REPORT_INTERVAL_MS
      if (Date.now() - lastReportTime >= REPORT_INTERVAL_MS) {
        const interimReport = generateReport(true);
        console.log(interimReport);
        saveReport(interimReport, `tests/load-test-interim-${Date.now()}.txt`);
        lastReportTime = Date.now();
      }

      // Wait before next iteration
      const waitTime = Math.max(0, API_POLL_INTERVAL_MS - (Date.now() % API_POLL_INTERVAL_MS));
      console.log(`\nWaiting ${formatDuration(waitTime)} before next iteration...`);
      await new Promise(r => setTimeout(r, waitTime));
    }

  } catch (err) {
    console.error('Test error:', err);
    metrics.errors.push({
      timestamp: new Date().toISOString(),
      category: 'system',
      name: 'test_runner',
      error: err.message,
    });
  } finally {
    if (client) {
      await client.close();
    }
  }

  // Generate final report
  metrics.endTime = Date.now();
  const finalReport = generateReport(false);
  console.log(finalReport);

  // Create reports directory if it doesn't exist
  const reportsDir = path.join(__dirname, 'reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportFile = path.join(reportsDir, `load-test-${timestamp}.txt`);
  saveReport(finalReport, reportFile);

  // Also save JSON metrics for further analysis
  const jsonFile = reportFile.replace('.txt', '.json');
  fs.writeFileSync(jsonFile, JSON.stringify(metrics, null, 2));
  console.log(`JSON metrics saved to: ${jsonFile}`);

  // Save latest results for CI/CD integration
  const latestFile = path.join(reportsDir, 'latest.json');
  fs.writeFileSync(latestFile, JSON.stringify({
    timestamp: new Date().toISOString(),
    duration: DURATION_HOURS,
    url: BASE_URL,
    benchmarks: metrics.benchmarks,
    summary: {
      totalApiCalls: Object.values(metrics.apiCalls).reduce((sum, d) => sum + d.count, 0),
      totalErrors: Object.values(metrics.apiCalls).reduce((sum, d) => sum + d.errors, 0),
      cacheHitRate: (metrics.cacheHits + metrics.cacheMisses) > 0
        ? ((metrics.cacheHits / (metrics.cacheHits + metrics.cacheMisses)) * 100).toFixed(1)
        : '0.0',
    },
  }, null, 2));
  console.log(`Latest results saved to: ${latestFile}`);

  // Return exit code based on benchmark results
  return metrics.benchmarks;
}

// Run the test and exit with appropriate code
runLoadTest()
  .then((benchmarks) => {
    if (!benchmarks) {
      console.error('No benchmark results available');
      process.exit(2);
    }

    if (benchmarks.summary.failures > 0) {
      console.log(`\n❌ Load test FAILED: ${benchmarks.summary.failures} benchmark(s) failed`);
      process.exit(2);
    } else if (benchmarks.summary.warnings > 0) {
      console.log(`\n⚠️  Load test PASSED with ${benchmarks.summary.warnings} warning(s)`);
      process.exit(1);
    } else {
      console.log(`\n✅ Load test PASSED: All ${benchmarks.summary.passed} benchmarks passed`);
      process.exit(0);
    }
  })
  .catch((err) => {
    console.error('Load test error:', err);
    process.exit(2);
  });
