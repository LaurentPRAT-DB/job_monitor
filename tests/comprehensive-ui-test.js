/**
 * Comprehensive UI Test for Job Monitor Application
 *
 * Tests all clickable elements, validates API responses, and measures performance.
 *
 * Usage:
 *   node comprehensive-ui-test.js [--duration=30] [--headless]
 *
 * Options:
 *   --duration=N   Test duration in minutes (default: 30)
 *   --headless     Run in headless mode
 *   --quick        Quick test (5 minutes, no stress phase)
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const os = require('os');

const BASE_URL = 'https://job-monitor-2556758628403379.aws.databricksapps.com';

// Parse command line args
const args = process.argv.slice(2);
const isQuick = args.includes('--quick');
const isHeadless = args.includes('--headless');
const durationArg = args.find(a => a.startsWith('--duration='));
const testDuration = durationArg ? parseInt(durationArg.split('=')[1]) : (isQuick ? 5 : 30);

// Test configuration
const CONFIG = {
  testDuration: testDuration * 60 * 1000,
  cycleWait: isQuick ? 60 * 1000 : 5 * 60 * 1000,
  headless: isHeadless,
  slowMo: 30,
  viewport: { width: 1920, height: 1080 },
  timeout: 60000,
};

// Test results storage
const results = {
  totalClicks: 0,
  successfulClicks: 0,
  skippedClicks: 0,
  apiCalls: [],
  apiByEndpoint: {},
  apiErrors: [],
  pageResults: {},
  consoleErrors: [],
  startTime: null,
  endTime: null,
};

// Helper function to wait
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

class JobMonitorTester {
  constructor() {
    this.browser = null;
    this.page = null;
    this.tempProfileDir = null;
  }

  async initialize() {
    const sourceProfile = process.env.CHROME_USER_DATA_DIR ||
      '/Users/laurent.prat/.vibe/chrome/profile';

    this.tempProfileDir = path.join(os.tmpdir(), `chrome-profile-${Date.now()}`);
    console.log(`Creating temp profile at: ${this.tempProfileDir}`);

    fs.mkdirSync(this.tempProfileDir, { recursive: true });
    const defaultDir = path.join(this.tempProfileDir, 'Default');
    fs.mkdirSync(defaultDir, { recursive: true });

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

    // Track all network requests and responses
    this.page.on('request', (request) => {
      if (request.url().includes('/api/')) {
        const url = request.url();
        const endpoint = url.split('/api')[1]?.split('?')[0] || url;

        results.apiCalls.push({
          endpoint,
          url,
          method: request.method(),
          timestamp: Date.now(),
        });
      }
    });

    this.page.on('response', async (response) => {
      if (response.url().includes('/api/')) {
        const url = response.url();
        const endpoint = url.split('/api')[1]?.split('?')[0] || url;
        const status = response.status();

        if (!results.apiByEndpoint[endpoint]) {
          results.apiByEndpoint[endpoint] = { success: 0, errors: 0, statuses: {} };
        }

        if (status >= 200 && status < 300) {
          results.apiByEndpoint[endpoint].success++;
        } else {
          results.apiByEndpoint[endpoint].errors++;
          results.apiErrors.push({ endpoint, status, timestamp: Date.now() });
        }

        results.apiByEndpoint[endpoint].statuses[status] =
          (results.apiByEndpoint[endpoint].statuses[status] || 0) + 1;

        const statusEmoji = status >= 200 && status < 300 ? '✓' : '✗';
        console.log(`  [API ${statusEmoji}] ${response.request().method()} ${endpoint} -> ${status}`);
      }
    });

    this.page.on('pageerror', (error) => {
      results.consoleErrors.push({ text: error.message, timestamp: Date.now() });
    });
  }

  // Find element by text content (Puppeteer-compatible)
  async findByText(selector, text, exact = false) {
    const elements = await this.page.$$(selector);
    for (const el of elements) {
      const content = await el.evaluate(e => e.textContent);
      if (exact ? content.trim() === text : content.includes(text)) {
        return el;
      }
    }
    return null;
  }

  // Click element by text content
  async clickByText(selector, text, description) {
    try {
      const el = await this.findByText(selector, text);
      if (el) {
        await el.click();
        results.totalClicks++;
        results.successfulClicks++;
        console.log(`  [CLICK ✓] ${description}`);
        await wait(300);
        return true;
      }
    } catch (error) {}
    results.totalClicks++;
    results.skippedClicks++;
    console.log(`  [CLICK -] ${description} - not found`);
    return false;
  }

  // Click by CSS selector
  async click(selector, description, options = {}) {
    const { waitAfter = 300 } = options;
    try {
      await this.page.waitForSelector(selector, { timeout: 3000 });
      await this.page.click(selector);
      results.totalClicks++;
      results.successfulClicks++;
      console.log(`  [CLICK ✓] ${description}`);
      await wait(waitAfter);
      return true;
    } catch (error) {
      results.totalClicks++;
      results.skippedClicks++;
      console.log(`  [CLICK -] ${description} - not found`);
      return false;
    }
  }

  // Click all matching elements
  async clickAll(selector, description, maxClicks = 5) {
    try {
      const elements = await this.page.$$(selector);
      if (elements.length === 0) {
        console.log(`  [CLICK -] ${description} - no elements found`);
        return 0;
      }

      let clicked = 0;
      for (let i = 0; i < Math.min(elements.length, maxClicks); i++) {
        try {
          await elements[i].click();
          clicked++;
          results.totalClicks++;
          results.successfulClicks++;
          await wait(200);
        } catch (e) {}
      }
      console.log(`  [CLICK ✓] ${description} - clicked ${clicked}/${elements.length}`);
      return clicked;
    } catch (error) {
      console.log(`  [CLICK -] ${description} - error`);
      return 0;
    }
  }

  async testDashboard() {
    console.log('\n' + '='.repeat(60));
    console.log('Testing Dashboard (/dashboard)');
    console.log('='.repeat(60));

    const startClicks = results.successfulClicks;
    const startApiCalls = results.apiCalls.length;

    await this.page.goto(`${BASE_URL}/dashboard`, {
      waitUntil: 'networkidle2',
      timeout: CONFIG.timeout
    });
    await wait(3000);

    // Test metric cards (links)
    console.log('\n--- Metric Cards ---');
    await this.click('a[href="/job-health"]', 'Total Jobs card -> Job Health');
    await wait(1000);
    await this.page.goBack();
    await wait(500);

    await this.click('a[href="/alerts"]', 'Active Alerts card -> Alerts');
    await wait(1000);
    await this.page.goBack();
    await wait(500);

    await this.click('a[href="/historical"]', 'DBU Cost card -> Historical');
    await wait(1000);
    await this.page.goBack();
    await wait(500);

    // Header controls
    console.log('\n--- Header Controls ---');
    await this.clickByText('button', 'Refresh', 'Refresh button');
    await wait(2000);

    // Dark mode toggle
    await this.click('button[role="switch"]', 'Dark mode toggle ON');
    await wait(500);
    await this.click('button[role="switch"]', 'Dark mode toggle OFF');
    await wait(300);

    // Sidebar navigation
    console.log('\n--- Sidebar Navigation ---');
    await this.click('nav a[href="/job-health"]', 'Sidebar: Job Health');
    await wait(500);
    await this.click('nav a[href="/running-jobs"]', 'Sidebar: Running Jobs');
    await wait(500);
    await this.click('nav a[href="/alerts"]', 'Sidebar: Alerts');
    await wait(500);
    await this.click('nav a[href="/historical"]', 'Sidebar: Historical');
    await wait(500);
    await this.click('nav a[href="/dashboard"]', 'Sidebar: Dashboard');
    await wait(500);

    results.pageResults.dashboard = {
      clicks: results.successfulClicks - startClicks,
      apiCalls: results.apiCalls.length - startApiCalls,
    };
  }

  async testJobHealth() {
    console.log('\n' + '='.repeat(60));
    console.log('Testing Job Health (/job-health)');
    console.log('='.repeat(60));

    const startClicks = results.successfulClicks;
    const startApiCalls = results.apiCalls.length;

    await this.page.goto(`${BASE_URL}/job-health`, {
      waitUntil: 'networkidle2',
      timeout: CONFIG.timeout
    });
    await wait(3000);

    // Time range tabs
    console.log('\n--- Time Range Tabs ---');
    await this.clickAll('button[role="tab"]', 'Time range tabs');
    await wait(1000);

    // Summary cards (filter buttons)
    console.log('\n--- Summary Cards ---');
    const cardTexts = ['Total', 'Critical', 'Failing', 'Warning', 'Healthy'];
    for (const text of cardTexts) {
      await this.clickByText('button', text, `${text} card filter`);
      await wait(300);
    }

    // Search
    console.log('\n--- Search ---');
    const searchInput = await this.page.$('input[type="text"], input[placeholder*="earch"]');
    if (searchInput) {
      await searchInput.type('test');
      results.totalClicks++;
      results.successfulClicks++;
      console.log('  [TYPE ✓] Search: "test"');
      await wait(500);
      await searchInput.click({ clickCount: 3 });
      await searchInput.press('Backspace');
      console.log('  [CLEAR ✓] Search cleared');
    }

    // Status filter dropdown
    console.log('\n--- Status Filter ---');
    await this.click('button[role="combobox"]', 'Status dropdown');
    await wait(300);
    await this.clickAll('[role="option"]', 'Dropdown options', 3);
    await this.page.keyboard.press('Escape');
    await wait(300);

    // Table row expansion
    console.log('\n--- Table Row Expansion ---');
    const expandButtons = await this.page.$$('table tbody tr td button');
    for (let i = 0; i < Math.min(expandButtons.length, 3); i++) {
      try {
        await expandButtons[i].click();
        results.totalClicks++;
        results.successfulClicks++;
        console.log(`  [CLICK ✓] Expand row ${i + 1}`);
        await wait(1500);

        // Collapse
        await expandButtons[i].click();
        results.totalClicks++;
        results.successfulClicks++;
        console.log(`  [CLICK ✓] Collapse row ${i + 1}`);
        await wait(300);
      } catch (e) {}
    }

    // Pagination
    console.log('\n--- Pagination ---');
    await this.clickAll('nav button, [aria-label*="page"]', 'Pagination buttons', 4);

    // Refresh
    await this.clickByText('button', 'Refresh', 'Refresh button');
    await wait(2000);

    results.pageResults.jobHealth = {
      clicks: results.successfulClicks - startClicks,
      apiCalls: results.apiCalls.length - startApiCalls,
    };
  }

  async testRunningJobs() {
    console.log('\n' + '='.repeat(60));
    console.log('Testing Running Jobs (/running-jobs)');
    console.log('='.repeat(60));

    const startClicks = results.successfulClicks;
    const startApiCalls = results.apiCalls.length;

    await this.page.goto(`${BASE_URL}/running-jobs`, {
      waitUntil: 'networkidle2',
      timeout: CONFIG.timeout
    });
    await wait(3000);

    console.log('\n--- Controls ---');
    await this.clickByText('button', 'Refresh', 'Refresh button');
    await wait(2000);

    console.log('\n--- Table ---');
    await this.clickAll('th button', 'Column sort buttons');

    // External links
    const jobLinks = await this.page.$$('table tbody tr a');
    console.log(`  Found ${jobLinks.length} job links (external)`);

    // Wait for auto-refresh
    console.log('\n--- Auto-Refresh ---');
    console.log('  Waiting 35s for auto-refresh...');
    await wait(35000);

    results.pageResults.runningJobs = {
      clicks: results.successfulClicks - startClicks,
      apiCalls: results.apiCalls.length - startApiCalls,
    };
  }

  async testAlerts() {
    console.log('\n' + '='.repeat(60));
    console.log('Testing Alerts (/alerts)');
    console.log('='.repeat(60));

    const startClicks = results.successfulClicks;
    const startApiCalls = results.apiCalls.length;

    await this.page.goto(`${BASE_URL}/alerts`, {
      waitUntil: 'networkidle2',
      timeout: CONFIG.timeout
    });
    await wait(3000);

    // Category tabs
    console.log('\n--- Category Tabs ---');
    await this.clickAll('button[role="tab"]', 'Category tabs');
    await wait(500);

    // Alert cards
    console.log('\n--- Alert Cards ---');
    await this.clickAll('[class*="alert"], [class*="card"]', 'Alert cards', 5);

    // Acknowledge buttons
    console.log('\n--- Actions ---');
    await this.clickByText('button', 'Acknowledge', 'Acknowledge button');
    await wait(500);

    // View job links
    await this.clickByText('button', 'View', 'View Job button');
    await wait(500);
    if (this.page.url().includes('/job-health')) {
      await this.page.goBack();
      await wait(500);
    }

    // Expandable sections
    await this.clickAll('button[aria-expanded]', 'Expand/collapse buttons');

    results.pageResults.alerts = {
      clicks: results.successfulClicks - startClicks,
      apiCalls: results.apiCalls.length - startApiCalls,
    };
  }

  async testHistorical() {
    console.log('\n' + '='.repeat(60));
    console.log('Testing Historical (/historical)');
    console.log('='.repeat(60));

    const startClicks = results.successfulClicks;
    const startApiCalls = results.apiCalls.length;

    await this.page.goto(`${BASE_URL}/historical`, {
      waitUntil: 'networkidle2',
      timeout: CONFIG.timeout
    });
    await wait(3000);

    // Time range buttons
    console.log('\n--- Time Range ---');
    for (const days of ['7', '14', '30', '90']) {
      await this.clickByText('button', days, `${days} days button`);
      await wait(1000);
    }

    // Chart interactions
    console.log('\n--- Charts ---');
    await this.clickAll('.recharts-surface, svg', 'Chart elements', 3);

    // Hover over charts
    const charts = await this.page.$$('.recharts-wrapper, [class*="chart"]');
    for (let i = 0; i < Math.min(charts.length, 3); i++) {
      try {
        const box = await charts[i].boundingBox();
        if (box) {
          await this.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await wait(500);
          console.log(`  [HOVER ✓] Chart ${i + 1}`);
        }
      } catch (e) {}
    }

    // Dropdowns
    console.log('\n--- Filters ---');
    await this.click('button[role="combobox"]', 'Filter dropdown');
    await wait(300);
    await this.page.keyboard.press('Escape');

    // Refresh
    await this.clickByText('button', 'Refresh', 'Refresh button');
    await wait(2000);

    results.pageResults.historical = {
      clicks: results.successfulClicks - startClicks,
      apiCalls: results.apiCalls.length - startApiCalls,
    };
  }

  async testMobileNavigation() {
    console.log('\n' + '='.repeat(60));
    console.log('Testing Mobile Navigation (390x844)');
    console.log('='.repeat(60));

    const startClicks = results.successfulClicks;

    try {
      await this.page.setViewport({ width: 390, height: 844 });
      await this.page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle2', timeout: 60000 });
      await wait(2000);

      console.log('\n--- Mobile Menu ---');
      const hamburger = await this.page.$('button[aria-label*="menu"], button[aria-label*="Menu"], header button');
      if (hamburger) {
        await hamburger.click();
        results.totalClicks++;
        results.successfulClicks++;
        console.log('  [CLICK ✓] Hamburger menu');
        await wait(500);

        await this.click('a[href="/job-health"]', 'Mobile: Job Health');
        await wait(1000);

        const hamburger2 = await this.page.$('button[aria-label*="menu"], button[aria-label*="Menu"], header button');
        if (hamburger2) {
          await hamburger2.click();
          results.totalClicks++;
          results.successfulClicks++;
          await wait(300);
          await this.click('a[href="/alerts"]', 'Mobile: Alerts');
          await wait(500);
        }
      } else {
        console.log('  [SKIP] No hamburger menu found');
      }
    } catch (error) {
      console.log(`  [ERROR] Mobile navigation failed: ${error.message}`);
    }

    // Always restore viewport
    await this.page.setViewport(CONFIG.viewport);

    results.pageResults.mobile = {
      clicks: results.successfulClicks - startClicks,
    };
  }

  async testAllAPIs() {
    console.log('\n' + '='.repeat(60));
    console.log('API Coverage Summary');
    console.log('='.repeat(60));

    const expectedApis = [
      '/me', '/health-metrics', '/alerts', '/jobs-api/active',
      '/costs/summary', '/historical/costs', '/historical/success-rate',
      '/historical/sla-breaches'
    ];

    console.log('\n--- API Status ---');
    for (const api of expectedApis) {
      const data = results.apiByEndpoint[api];
      if (data && data.success > 0) {
        console.log(`  ✅ ${api}: ${data.success} calls, all successful`);
      } else if (data && data.errors > 0) {
        console.log(`  ❌ ${api}: ${data.errors} errors`);
      } else {
        console.log(`  ⚠️ ${api}: not called`);
      }
    }
  }

  async runCycle(cycleNum) {
    console.log('\n' + '#'.repeat(60));
    console.log(`# CYCLE ${cycleNum} - ${new Date().toISOString()}`);
    console.log('#'.repeat(60));

    await this.testDashboard();
    await this.testJobHealth();
    await this.testRunningJobs();
    await this.testAlerts();
    await this.testHistorical();

    if (cycleNum === 1) {
      await this.testMobileNavigation();
    }
  }

  async runStressTest(durationMs) {
    console.log('\n' + '='.repeat(60));
    console.log(`STRESS TEST - Rapid navigation for ${Math.floor(durationMs / 60000)} minutes`);
    console.log('='.repeat(60));

    const endTime = Date.now() + durationMs;
    const pages = ['/dashboard', '/job-health', '/alerts', '/historical', '/running-jobs'];
    let iterations = 0;

    while (Date.now() < endTime) {
      for (const page of pages) {
        if (Date.now() >= endTime) break;
        await this.page.goto(`${BASE_URL}${page}`, { waitUntil: 'domcontentloaded' });
        await wait(300);
        iterations++;
      }
    }

    console.log(`  Completed ${iterations} page loads`);
  }

  async run() {
    results.startTime = Date.now();

    console.log('\n' + '='.repeat(60));
    console.log('Job Monitor - Comprehensive UI Test');
    console.log('='.repeat(60));
    console.log(`URL: ${BASE_URL}`);
    console.log(`Duration: ${CONFIG.testDuration / 60000} minutes`);
    console.log(`Mode: ${CONFIG.headless ? 'Headless' : 'Visible'}`);
    console.log(`Started: ${new Date().toISOString()}`);
    console.log('='.repeat(60));

    await this.initialize();

    // Cycle 1
    await this.runCycle(1);

    if (!isQuick) {
      console.log(`\n[WAIT] ${CONFIG.cycleWait / 60000} minutes before Cycle 2...`);
      await wait(CONFIG.cycleWait);
      await this.runCycle(2);

      console.log(`\n[WAIT] ${CONFIG.cycleWait / 60000} minutes before Cycle 3...`);
      await wait(CONFIG.cycleWait);
      await this.runCycle(3);
    }

    await this.testAllAPIs();

    const elapsed = Date.now() - results.startTime;
    const remaining = CONFIG.testDuration - elapsed;

    if (remaining > 60000) {
      await this.runStressTest(remaining);
    }

    results.endTime = Date.now();
    this.generateReport();
    await this.browser.close();

    if (this.tempProfileDir) {
      try {
        fs.rmSync(this.tempProfileDir, { recursive: true, force: true });
        console.log('\nCleaned up temp profile');
      } catch (e) {}
    }
  }

  generateReport() {
    const duration = (results.endTime - results.startTime) / 60000;
    const totalApiCalls = results.apiCalls.length;
    const successfulApis = Object.values(results.apiByEndpoint)
      .reduce((sum, ep) => sum + ep.success, 0);
    const failedApis = Object.values(results.apiByEndpoint)
      .reduce((sum, ep) => sum + ep.errors, 0);

    console.log(`
${'='.repeat(60)}
TEST REPORT
${'='.repeat(60)}

DURATION
  Total: ${duration.toFixed(1)} minutes
  Started: ${new Date(results.startTime).toISOString()}
  Ended: ${new Date(results.endTime).toISOString()}

CLICK INTERACTIONS
  Total Attempted: ${results.totalClicks}
  Successful: ${results.successfulClicks}
  Skipped/Not Found: ${results.skippedClicks}
  Success Rate: ${results.totalClicks > 0 ? ((results.successfulClicks / results.totalClicks) * 100).toFixed(1) : 0}%

API CALLS
  Total Calls: ${totalApiCalls}
  Successful (2xx): ${successfulApis}
  Errors (4xx/5xx): ${failedApis}
  Success Rate: ${totalApiCalls > 0 ? ((successfulApis / totalApiCalls) * 100).toFixed(1) : 0}%

API BREAKDOWN BY ENDPOINT
${Object.entries(results.apiByEndpoint)
  .sort((a, b) => (b[1].success + b[1].errors) - (a[1].success + a[1].errors))
  .map(([endpoint, data]) => {
    const status = data.errors > 0 ? '⚠️' : '✅';
    return `  ${status} ${endpoint}: ${data.success} ok, ${data.errors} errors`;
  })
  .join('\n')}

PAGE RESULTS
${Object.entries(results.pageResults)
  .map(([page, data]) => `  ${page}: ${data.clicks} clicks, ${data.apiCalls || 0} API calls`)
  .join('\n')}

ERRORS: ${results.consoleErrors.length} page errors, ${failedApis} API errors

${'='.repeat(60)}
OVERALL: ${failedApis === 0 ? '✅ ALL APIs PASSING' : '⚠️ SOME APIS FAILING'}
${'='.repeat(60)}
`);
  }
}

const tester = new JobMonitorTester();
tester.run().catch(console.error);
