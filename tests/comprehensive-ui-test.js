/**
 * Comprehensive UI Test for Job Monitor Application
 *
 * This script tests all clickable elements and validates caching behavior
 * over a 30-minute period.
 *
 * Usage:
 *   node comprehensive-ui-test.js
 *
 * Requirements:
 *   npm install puppeteer
 */

const puppeteer = require('puppeteer');

const BASE_URL = 'https://job-monitor-2556758628403379.aws.databricksapps.com';

// Test configuration
const CONFIG = {
  testDuration: 30 * 60 * 1000, // 30 minutes
  cycleWait: 5 * 60 * 1000, // 5 minutes between cycles
  headless: false, // Set to true for CI
  slowMo: 50, // Slow down actions for visibility
  viewport: { width: 1920, height: 1080 },
};

// Test results storage
const results = {
  totalClicks: 0,
  apiCalls: [],
  cacheHits: 0,
  cacheMisses: 0,
  errors: [],
  pageResults: {},
  startTime: null,
  endTime: null,
};

// Track API requests to detect cache behavior
const seenRequests = new Map();

// Helper function to wait
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

class JobMonitorTester {
  constructor() {
    this.browser = null;
    this.page = null;
    this.tempProfileDir = null;
  }

  async initialize() {
    // Create a temporary copy of the Chrome profile for isolated testing
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const { execSync } = require('child_process');

    const sourceProfile = process.env.CHROME_USER_DATA_DIR ||
      '/Users/laurent.prat/.vibe/chrome/profile';

    // Create temp directory for profile copy
    this.tempProfileDir = path.join(os.tmpdir(), `chrome-profile-${Date.now()}`);
    console.log(`Creating temp profile at: ${this.tempProfileDir}`);

    // Copy cookies and local storage (essential for auth)
    fs.mkdirSync(this.tempProfileDir, { recursive: true });
    const defaultDir = path.join(this.tempProfileDir, 'Default');
    fs.mkdirSync(defaultDir, { recursive: true });

    // Copy only essential files for auth
    const essentialFiles = ['Cookies', 'Login Data', 'Preferences'];
    const sourceDefault = path.join(sourceProfile, 'Default');

    for (const file of essentialFiles) {
      const src = path.join(sourceDefault, file);
      const dest = path.join(defaultDir, file);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
        console.log(`  Copied ${file}`);
      }
    }

    // Copy Local State from profile root
    const localState = path.join(sourceProfile, 'Local State');
    if (fs.existsSync(localState)) {
      fs.copyFileSync(localState, path.join(this.tempProfileDir, 'Local State'));
    }

    this.browser = await puppeteer.launch({
      headless: CONFIG.headless,
      slowMo: CONFIG.slowMo,
      args: [
        '--window-size=1920,1080',
        `--user-data-dir=${this.tempProfileDir}`,
        '--disable-features=IsolateOrigins,site-per-process',
      ],
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    });

    this.page = await this.browser.newPage();
    await this.page.setViewport(CONFIG.viewport);

    // Track all network requests
    this.page.on('request', (request) => {
      if (request.url().includes('/api/')) {
        const url = request.url();
        const now = Date.now();
        const key = url.split('?')[0];

        results.apiCalls.push({
          url,
          method: request.method(),
          timestamp: now,
          fromCache: false,
        });

        if (seenRequests.has(key)) {
          const lastCall = seenRequests.get(key);
          const timeSince = now - lastCall.timestamp;
          if (timeSince < 5 * 60 * 1000) {
            console.log(`  [CACHE CHECK] ${key.split('/api')[1]} - ${timeSince}ms since last`);
          }
        }
        seenRequests.set(key, { timestamp: now, url });
      }
    });

    this.page.on('response', async (response) => {
      if (response.url().includes('/api/')) {
        const url = response.url();
        const status = response.status();
        const fromCache = response.fromCache();

        if (fromCache) {
          results.cacheHits++;
        } else {
          results.cacheMisses++;
        }

        const endpoint = url.split('/api')[1]?.split('?')[0] || url;
        console.log(`  [API] ${response.request().method()} ${endpoint} - ${status} ${fromCache ? '(CACHE)' : '(FRESH)'}`);
      }
    });

    this.page.on('console', (msg) => {
      if (msg.type() === 'error') {
        results.errors.push({ text: msg.text(), timestamp: Date.now() });
      }
    });

    this.page.on('pageerror', (error) => {
      results.errors.push({ text: error.message, timestamp: Date.now() });
    });
  }

  async click(selector, description) {
    try {
      await this.page.waitForSelector(selector, { timeout: 3000 });
      await this.page.click(selector);
      results.totalClicks++;
      console.log(`  [CLICK] ${description}`);
      await wait(300);
    } catch (error) {
      console.log(`  [SKIP] ${description} - not found`);
    }
  }

  async testDashboard() {
    console.log('\n=== Testing Dashboard ===');
    results.pageResults.dashboard = { clicks: 0, apiCalls: 0 };
    const startCalls = results.apiCalls.length;
    const startClicks = results.totalClicks;

    await this.page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle2', timeout: 30000 });
    await wait(3000);

    // Click metric cards using Link components
    await this.click('a[href="/job-health"]', 'Total Jobs card');
    await wait(1000);
    await this.page.goBack();
    await wait(500);

    await this.click('a[href="/alerts"]', 'Active Alerts card');
    await wait(1000);
    await this.page.goBack();
    await wait(500);

    await this.click('a[href="/historical"]', 'DBU Cost card');
    await wait(1000);
    await this.page.goBack();
    await wait(500);

    // Click Refresh button
    await this.click('button:has-text("Refresh")', 'Refresh button');
    await wait(2000);

    // Toggle dark mode
    await this.click('button[role="switch"]', 'Dark mode ON');
    await wait(300);
    await this.click('button[role="switch"]', 'Dark mode OFF');

    // Sidebar navigation
    await this.click('nav a[href="/running-jobs"]', 'Sidebar: Running Jobs');
    await wait(500);
    await this.click('nav a[href="/dashboard"]', 'Sidebar: Dashboard');
    await wait(500);

    // Expand filters
    await this.click('button:has-text("Filters")', 'Expand Filters');
    await wait(500);
    await this.click('button:has-text("Filters")', 'Collapse Filters');

    results.pageResults.dashboard.clicks = results.totalClicks - startClicks;
    results.pageResults.dashboard.apiCalls = results.apiCalls.length - startCalls;
  }

  async testJobHealth() {
    console.log('\n=== Testing Job Health ===');
    results.pageResults.jobHealth = { clicks: 0, apiCalls: 0 };
    const startCalls = results.apiCalls.length;
    const startClicks = results.totalClicks;

    await this.page.goto(`${BASE_URL}/job-health`, { waitUntil: 'networkidle2', timeout: 30000 });
    await wait(3000);

    // Time range tabs
    await this.click('button[role="tab"]:has-text("30 Days")', '30 Days tab');
    await wait(2000);
    await this.click('button[role="tab"]:has-text("7 Days")', '7 Days tab');
    await wait(1000);

    // Summary filter cards
    await this.click('button:has-text("Total Jobs")', 'Total Jobs card');
    await wait(300);
    await this.click('button:has-text("Critical")', 'Critical card');
    await wait(300);
    await this.click('button:has-text("Failing")', 'Failing card');
    await wait(300);
    await this.click('button:has-text("Warning")', 'Warning card');
    await wait(300);

    // Search box
    const searchBox = await this.page.$('input[placeholder*="Search"]');
    if (searchBox) {
      await searchBox.type('test');
      results.totalClicks++;
      console.log('  [INPUT] Search: test');
      await wait(500);
      await searchBox.click({ clickCount: 3 });
      await searchBox.press('Backspace');
    }

    // Status dropdown
    await this.click('button[role="combobox"]', 'Status dropdown');
    await wait(300);

    // Pagination
    await this.click('button:has-text("Next page")', 'Next page');
    await wait(300);
    await this.click('button:has-text("Previous page")', 'Previous page');
    await wait(300);

    // Rows per page
    await this.click('button:has-text("10")', 'Rows dropdown');
    await wait(200);

    // Expand first job row
    const expandBtn = await this.page.$('table tbody tr:first-child button');
    if (expandBtn) {
      await expandBtn.click();
      results.totalClicks++;
      console.log('  [CLICK] Expand row');
      await wait(1000);
      await expandBtn.click();
      results.totalClicks++;
      console.log('  [CLICK] Collapse row');
    }

    // Refresh
    await this.click('button:has-text("Refresh")', 'Refresh');
    await wait(2000);

    results.pageResults.jobHealth.clicks = results.totalClicks - startClicks;
    results.pageResults.jobHealth.apiCalls = results.apiCalls.length - startCalls;
  }

  async testRunningJobs() {
    console.log('\n=== Testing Running Jobs ===');
    results.pageResults.runningJobs = { clicks: 0, apiCalls: 0 };
    const startCalls = results.apiCalls.length;
    const startClicks = results.totalClicks;

    await this.page.goto(`${BASE_URL}/running-jobs`, { waitUntil: 'networkidle2', timeout: 30000 });
    await wait(3000);

    // Refresh button
    await this.click('button:has-text("Refresh")', 'Refresh');
    await wait(2000);

    // Wait for auto-refresh
    console.log('  [WAIT] 35s for auto-refresh...');
    await wait(35000);

    results.pageResults.runningJobs.clicks = results.totalClicks - startClicks;
    results.pageResults.runningJobs.apiCalls = results.apiCalls.length - startCalls;
  }

  async testAlerts() {
    console.log('\n=== Testing Alerts ===');
    results.pageResults.alerts = { clicks: 0, apiCalls: 0 };
    const startCalls = results.apiCalls.length;
    const startClicks = results.totalClicks;

    await this.page.goto(`${BASE_URL}/alerts`, { waitUntil: 'networkidle2', timeout: 30000 });
    await wait(3000);

    // Category tabs
    await this.click('button[role="tab"][value="failure"]', 'Failure tab');
    await wait(500);
    await this.click('button[role="tab"][value="sla"]', 'SLA tab');
    await wait(500);
    await this.click('button[role="tab"][value="cost"]', 'Cost tab');
    await wait(500);
    await this.click('button[role="tab"][value="cluster"]', 'Cluster tab');
    await wait(500);
    await this.click('button[role="tab"][value="all"]', 'All tab');
    await wait(500);

    // Acknowledge button
    await this.click('button:has-text("Acknowledge")', 'Acknowledge');
    await wait(500);

    results.pageResults.alerts.clicks = results.totalClicks - startClicks;
    results.pageResults.alerts.apiCalls = results.apiCalls.length - startCalls;
  }

  async testHistorical() {
    console.log('\n=== Testing Historical ===');
    results.pageResults.historical = { clicks: 0, apiCalls: 0 };
    const startCalls = results.apiCalls.length;
    const startClicks = results.totalClicks;

    await this.page.goto(`${BASE_URL}/historical`, { waitUntil: 'networkidle2', timeout: 30000 });
    await wait(3000);

    results.pageResults.historical.clicks = results.totalClicks - startClicks;
    results.pageResults.historical.apiCalls = results.apiCalls.length - startCalls;
  }

  async testMobileNav() {
    console.log('\n=== Testing Mobile Navigation ===');

    await this.page.setViewport({ width: 390, height: 844 });
    await this.page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle2' });
    await wait(2000);

    await this.click('button[aria-label="Open navigation menu"]', 'Hamburger');
    await wait(500);
    await this.click('a[href="/job-health"]', 'Mobile: Job Health');
    await wait(1000);

    await this.page.setViewport(CONFIG.viewport);
  }

  async runCycle(num) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`CYCLE ${num} - ${new Date().toISOString()}`);
    console.log(`${'='.repeat(60)}`);

    await this.testDashboard();
    await this.testJobHealth();
    await this.testRunningJobs();
    await this.testAlerts();
    await this.testHistorical();

    if (num === 1) await this.testMobileNav();
  }

  async run() {
    results.startTime = Date.now();
    console.log('Starting Job Monitor Comprehensive UI Test');
    console.log(`URL: ${BASE_URL}`);
    console.log(`Duration: ${CONFIG.testDuration / 60000} minutes`);
    console.log(`Started: ${new Date().toISOString()}`);

    await this.initialize();

    // Cycle 1
    await this.runCycle(1);

    // Wait 5 min
    console.log('\n[WAIT] 5 minutes before Cycle 2...');
    await wait(CONFIG.cycleWait);

    // Cycle 2
    await this.runCycle(2);

    // Wait 5 min
    console.log('\n[WAIT] 5 minutes before Cycle 3...');
    await wait(CONFIG.cycleWait);

    // Cycle 3
    await this.runCycle(3);

    // Stress test remaining time
    const elapsed = Date.now() - results.startTime;
    const remaining = CONFIG.testDuration - elapsed;

    if (remaining > 60000) {
      console.log(`\n[STRESS] Rapid navigation for ${Math.floor(remaining / 60000)} min...`);
      const endTime = Date.now() + remaining;

      while (Date.now() < endTime) {
        await this.page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' });
        await wait(300);
        await this.page.goto(`${BASE_URL}/job-health`, { waitUntil: 'domcontentloaded' });
        await wait(300);
        await this.page.goto(`${BASE_URL}/alerts`, { waitUntil: 'domcontentloaded' });
        await wait(300);
        await this.page.goto(`${BASE_URL}/historical`, { waitUntil: 'domcontentloaded' });
        await wait(300);
      }
    }

    results.endTime = Date.now();
    this.generateReport();
    await this.browser.close();

    // Clean up temp profile
    if (this.tempProfileDir) {
      const fs = require('fs');
      try {
        fs.rmSync(this.tempProfileDir, { recursive: true, force: true });
        console.log('Cleaned up temp profile');
      } catch (e) {
        console.log('Note: Could not clean up temp profile');
      }
    }
  }

  generateReport() {
    const duration = (results.endTime - results.startTime) / 60000;
    const total = results.apiCalls.length;
    const hitRate = total > 0 ? ((results.cacheHits / total) * 100).toFixed(1) : 0;

    const callsByEndpoint = {};
    for (const call of results.apiCalls) {
      const ep = call.url.split('/api')[1]?.split('?')[0] || 'unknown';
      callsByEndpoint[ep] = (callsByEndpoint[ep] || 0) + 1;
    }

    const apiSummary = Object.entries(callsByEndpoint)
      .sort((a, b) => b[1] - a[1])
      .map(([ep, cnt]) => `  ${ep}: ${cnt}`)
      .join('\n');

    console.log(`
${'='.repeat(60)}
TEST REPORT
${'='.repeat(60)}

Duration: ${duration.toFixed(1)} minutes
Total Clicks: ${results.totalClicks}
Total API Calls: ${total}
Cache Hits: ${results.cacheHits} (${hitRate}%)
Cache Misses: ${results.cacheMisses}
Errors: ${results.errors.length}

Page Results:
${Object.entries(results.pageResults).map(([p, d]) =>
  `  ${p}: ${d.clicks} clicks, ${d.apiCalls} API calls`
).join('\n')}

API Call Summary:
${apiSummary}

Cache Efficiency: ${hitRate >= 50 ? 'PASS' : 'NEEDS WORK'} (target: 50%+)

${results.errors.length > 0 ? `
Errors:
${results.errors.slice(0, 5).map(e => `  - ${e.text.substring(0, 100)}`).join('\n')}
` : 'No errors.'}
${'='.repeat(60)}
`);
  }
}

const tester = new JobMonitorTester();
tester.run().catch(console.error);
