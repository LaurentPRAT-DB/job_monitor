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
 */

const CDP = require('chrome-remote-interface');
const fs = require('fs');

// Configuration
const BASE_URL = 'https://job-monitor-2556758628403379.aws.databricksapps.com';
const DURATION_HOURS = parseFloat(process.argv[2]) || 1;
const DURATION_MS = DURATION_HOURS * 60 * 60 * 1000;
const REPORT_INTERVAL_MS = 5 * 60 * 1000; // Report every 5 minutes
const CLICK_DELAY_MS = 2000; // Delay between actions
const API_POLL_INTERVAL_MS = 30000; // Poll APIs every 30 seconds

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

  // Recommendations
  report += `${'─'.repeat(80)}\n`;
  report += `RECOMMENDATIONS\n`;
  report += `${'─'.repeat(80)}\n`;

  const recommendations = [];

  // Check for slow endpoints
  for (const [name, data] of Object.entries(metrics.apiCalls)) {
    const avg = data.count > 0 ? data.totalTime / data.count : 0;
    const p95 = percentile(data.times, 95);
    if (avg > 2000) {
      recommendations.push(`⚠️  ${name}: Average response time ${formatDuration(avg)} is high. Consider caching or query optimization.`);
    }
    if (p95 > 5000) {
      recommendations.push(`⚠️  ${name}: P95 response time ${formatDuration(p95)} indicates occasional slowdowns.`);
    }
    if (data.errors > 0) {
      const errorRate = ((data.errors / data.count) * 100).toFixed(1);
      recommendations.push(`❌ ${name}: ${errorRate}% error rate (${data.errors}/${data.count} calls failed).`);
    }
  }

  // Check cache effectiveness
  if (parseFloat(overallCacheRate) < 30) {
    recommendations.push(`⚠️  Low cache hit rate (${overallCacheRate}%). Consider increasing staleTime or cacheTime in TanStack Query.`);
  } else if (parseFloat(overallCacheRate) > 70) {
    recommendations.push(`✅ Good cache hit rate (${overallCacheRate}%). Client-side caching is working effectively.`);
  }

  // Check error rate
  const overallErrorRate = totalApiCalls > 0 ? ((totalApiErrors / totalApiCalls) * 100).toFixed(2) : 0;
  if (parseFloat(overallErrorRate) > 1) {
    recommendations.push(`❌ Overall API error rate is ${overallErrorRate}%. Investigate failing endpoints.`);
  } else if (totalApiErrors === 0) {
    recommendations.push(`✅ No API errors recorded. System is stable.`);
  }

  if (recommendations.length === 0) {
    recommendations.push(`✅ No significant issues detected. System is performing well.`);
  }

  for (const rec of recommendations) {
    report += `${rec}\n`;
  }

  report += `\n${'='.repeat(80)}\n`;

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

  const reportFile = `tests/load-test-report-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
  saveReport(finalReport, reportFile);

  // Also save JSON metrics for further analysis
  const jsonFile = reportFile.replace('.txt', '.json');
  fs.writeFileSync(jsonFile, JSON.stringify(metrics, null, 2));
  console.log(`JSON metrics saved to: ${jsonFile}`);
}

// Run the test
runLoadTest().catch(console.error);
