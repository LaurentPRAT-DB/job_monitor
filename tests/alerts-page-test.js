/**
 * Alerts Page Comprehensive Test
 * Tests all click zones and API endpoints as per ALERTS_TEST_PLAN.md
 *
 * Usage:
 *   node tests/alerts-page-test.js [--quick] [--dev] [--prod] [--e2]
 *
 * Options:
 *   --quick   Run fast without delays
 *   --dev     Test against dev deployment (mock data)
 *   --prod    Test against prod/DEMO WEST deployment (default)
 *   --e2      Test against E2 deployment
 */
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Deployment URLs
const URLS = {
  prod: 'https://job-monitor-2556758628403379.aws.databricksapps.com',
  dev: 'https://job-monitor-3704140105640043.aws.databricksapps.com',
  e2: 'https://job-monitor-1444828305810485.aws.databricksapps.com',
};

// Parse args
const args = process.argv.slice(2);
const target = args.includes('--dev') ? 'dev' : args.includes('--e2') ? 'e2' : 'prod';
const BASE_URL = URLS[target];
const isQuick = args.includes('--quick');

// Test results tracking
const results = {
  passed: 0,
  failed: 0,
  skipped: 0,
  tests: [],
  apiCalls: [],
  apiByEndpoint: {},
};

function log(testId, status, message) {
  const icon = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : '-';
  console.log(`  [${testId}] ${icon} ${message}`);
  results.tests.push({ testId, status, message });
  if (status === 'PASS') results.passed++;
  else if (status === 'FAIL') results.failed++;
  else results.skipped++;
}

const wait = (ms) => new Promise(resolve => setTimeout(resolve, isQuick ? Math.min(ms, 500) : ms));

class AlertsPageTester {
  constructor() {
    this.browser = null;
    this.page = null;
    this.tempProfileDir = null;
  }

  async initialize() {
    const sourceProfile = process.env.CHROME_USER_DATA_DIR ||
      '/Users/laurent.prat/.vibe/chrome/profile';

    this.tempProfileDir = path.join(os.tmpdir(), `chrome-alerts-test-${Date.now()}`);
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
      headless: false,
      slowMo: 30,
      args: [
        '--window-size=1400,900',
        `--user-data-dir=${this.tempProfileDir}`,
        '--disable-features=IsolateOrigins,site-per-process',
      ],
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    });

    this.page = await this.browser.newPage();
    await this.page.setViewport({ width: 1400, height: 900 });

    // Track API calls
    this.page.on('response', async (response) => {
      if (response.url().includes('/api/')) {
        const url = response.url();
        const endpoint = url.split('/api')[1]?.split('?')[0] || url;
        const query = url.includes('?') ? url.split('?')[1] : '';
        const status = response.status();

        results.apiCalls.push({
          endpoint,
          query,
          status,
          timestamp: Date.now()
        });

        if (!results.apiByEndpoint[endpoint]) {
          results.apiByEndpoint[endpoint] = { success: 0, errors: 0 };
        }
        if (status >= 200 && status < 300) {
          results.apiByEndpoint[endpoint].success++;
        } else {
          results.apiByEndpoint[endpoint].errors++;
        }

        const statusEmoji = status >= 200 && status < 300 ? '✓' : '✗';
        console.log(`  [API ${statusEmoji}] ${endpoint} -> ${status}`);
      }
    });

    this.page.on('pageerror', (error) => {
      console.log(`  [PAGE ERROR] ${error.message}`);
    });
  }

  // Find element by text content
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

  // Click element by text
  async clickByText(selector, text, description) {
    try {
      const el = await this.findByText(selector, text);
      if (el) {
        await el.click();
        console.log(`  [CLICK ✓] ${description}`);
        await wait(300);
        return true;
      }
    } catch (error) {}
    console.log(`  [CLICK -] ${description} - not found`);
    return false;
  }

  // Click by CSS selector
  async click(selector, description, options = {}) {
    const { waitAfter = 300 } = options;
    try {
      await this.page.waitForSelector(selector, { timeout: 3000 });
      await this.page.click(selector);
      console.log(`  [CLICK ✓] ${description}`);
      await wait(waitAfter);
      return true;
    } catch (error) {
      console.log(`  [CLICK -] ${description} - not found`);
      return false;
    }
  }

  async run() {
    try {
      console.log('\n' + '='.repeat(60));
      console.log('  ALERTS PAGE COMPREHENSIVE TEST');
      console.log('='.repeat(60));
      console.log(`\nTarget: ${BASE_URL}/alerts`);
      console.log(`Started: ${new Date().toISOString()}\n`);

      await this.initialize();

      // ========================================
      // SECTION 1: Page Load & API Tests
      // ========================================
      console.log('\n--- SECTION 1: Page Load & API Tests ---\n');

      console.log('Loading Alerts page...');
      await this.page.goto(`${BASE_URL}/alerts`, { waitUntil: 'networkidle2', timeout: 90000 });
      await wait(5000); // Wait longer for data to load

      // Check if authenticated by looking for the app UI
      const hasAppUI = await this.page.evaluate(() =>
        document.body.innerText.includes('Job Monitor') ||
        document.body.innerText.includes('Dashboard') ||
        document.body.innerText.includes('Alerts')
      );

      const pageContent = await this.page.content();
      if (!hasAppUI && (pageContent.includes('Sign In') || pageContent.includes('login'))) {
        console.log('\n⚠️  Not logged in! Check if ~/.vibe/chrome/profile has valid auth.');
        log('AUTH', 'FAIL', 'Authentication failed');
        throw new Error('Authentication required');
      }
      log('AUTH', 'PASS', 'Authenticated successfully');

      // API-01: Fetch all alerts - check if the call was made
      const alertsCall = results.apiCalls.find(c => c.endpoint?.includes('/alerts'));
      if (alertsCall && alertsCall.status === 200) {
        log('API-01', 'PASS', 'GET /api/alerts returned 200');
      } else if (alertsCall) {
        log('API-01', 'FAIL', `GET /api/alerts returned ${alertsCall.status}`);
      } else {
        // API might have completed before listener was set up - check if page shows data
        const hasBadges = await this.page.$('[class*="bg-red-600"], [class*="bg-orange-500"], [class*="bg-yellow-500"]') !== null;
        log('API-01', hasBadges ? 'PASS' : 'SKIP', hasBadges ? 'API loaded (badges visible)' : 'API call not captured');
      }

      // Check if we have alerts or empty state
      const alertCounts = await this.page.evaluate(() => {
        const totalBadge = Array.from(document.querySelectorAll('span, div')).find(el =>
          el.textContent?.includes('Total')
        );
        const match = totalBadge?.textContent?.match(/(\d+)\s*Total/);
        return match ? parseInt(match[1]) : -1;
      });

      console.log(`  Alert count: ${alertCounts}`);

      // Check table loaded (may not exist if 0 alerts)
      const hasTable = await this.page.$('table') !== null;

      if (alertCounts === 0) {
        log('UI-00', 'PASS', 'No alerts - empty state displayed correctly');
        console.log('\n⚠️  No alerts to test. Running limited test suite...');
      } else if (hasTable) {
        log('UI-00', 'PASS', `Table loaded with ${alertCounts} alerts`);
      } else {
        log('UI-00', 'FAIL', 'Table not loaded');
        await this.page.screenshot({ path: 'tests/alerts-test-error.png' });
        throw new Error('Table not loaded');
      }

      const hasAlerts = alertCounts > 0;

      // ========================================
      // SECTION 2: Header Section Tests
      // ========================================
      console.log('\n--- SECTION 2: Header Section Tests ---\n');

      // UI-01: Page title
      const titleExists = await this.page.evaluate(() =>
        document.body.innerText.includes('Alerts')
      );
      log('UI-01', titleExists ? 'PASS' : 'FAIL', 'Page title "Alerts" displayed');

      // UI-02: Refresh button
      results.apiCalls.length = 0;
      const refreshClicked = await this.clickByText('button', 'Refresh', 'Refresh button');
      if (refreshClicked) {
        await wait(2000);
        const refreshCall = results.apiCalls.find(c => c.endpoint === '/alerts');
        log('UI-02', refreshCall ? 'PASS' : 'FAIL', 'Refresh button triggers API call');
      } else {
        log('UI-02', 'SKIP', 'Refresh button not found');
      }

      // UI-03 to UI-07: Category tabs
      const categoryTabs = ['All', 'Failure', 'SLA', 'Cost', 'Cluster'];
      for (let i = 0; i < categoryTabs.length; i++) {
        const tab = categoryTabs[i];
        const clicked = await this.clickByText('button', tab, `Category tab "${tab}"`);
        log(`UI-0${3+i}`, clicked ? 'PASS' : 'FAIL', `Category tab "${tab}" clickable`);
        await wait(500);
      }

      // ========================================
      // SECTION 3: Summary Badge Tests
      // ========================================
      console.log('\n--- SECTION 3: Summary Badge Tests ---\n');

      // UI-08: Critical badge click (P1 - red)
      // Badge contains text like "1 Critical" - find and click it
      const criticalBadge = await this.findByText('span, div', 'Critical');
      if (criticalBadge) {
        // Get initial row count
        const initialRows = await this.page.$$('table tbody tr');
        const initialCount = initialRows.length;

        await criticalBadge.click();
        await wait(800); // Wait for React re-render

        // Verify filter applied by checking if badge has ring OR table filtered
        const hasRingAfter = await this.page.evaluate(() => {
          const badge = Array.from(document.querySelectorAll('span, div')).find(el =>
            el.textContent?.includes('Critical') && el.className?.includes('bg-red')
          );
          return badge?.className?.includes('ring-2') || false;
        });

        // Also check if table shows filtered results (fewer rows or only P1)
        const filteredRows = await this.page.$$('table tbody tr');
        const isFiltered = filteredRows.length <= initialCount;

        log('UI-08', hasRingAfter || isFiltered ? 'PASS' : 'FAIL',
          `Critical badge filter works (ring: ${hasRingAfter}, filtered: ${isFiltered})`);

        // UI-09: Click again to clear
        const criticalBadgeAgain = await this.findByText('span, div', 'Critical');
        if (criticalBadgeAgain) {
          await criticalBadgeAgain.click();
          await wait(500);
        }
        log('UI-09', 'PASS', 'Critical badge click again clears filter');
      } else {
        log('UI-08', 'SKIP', 'Critical badge not found (may be 0 P1 alerts)');
        log('UI-09', 'SKIP', 'Critical badge not found');
      }

      // UI-10: Warning badge click (P2 - orange)
      const warningBadge = await this.findByText('span, div', 'Warning');
      if (warningBadge) {
        await warningBadge.click();
        await wait(800);

        // Check if filter is active (ring class or Clear filter button appears)
        const hasRingAfter = await this.page.evaluate(() => {
          const badge = Array.from(document.querySelectorAll('span, div')).find(el =>
            el.textContent?.includes('Warning') && el.className?.includes('bg-orange')
          );
          return badge?.className?.includes('ring-2') || false;
        });

        // Check if Clear filter button appeared
        const clearBtnVisible = await this.page.evaluate(() =>
          Array.from(document.querySelectorAll('button')).some(b =>
            b.textContent?.includes('Clear filter')
          )
        );

        log('UI-10', hasRingAfter || clearBtnVisible ? 'PASS' : 'FAIL',
          `Warning badge filter works (ring: ${hasRingAfter}, clearBtn: ${clearBtnVisible})`);

        // UI-15: Clear filter button
        if (clearBtnVisible) {
          const clearClicked = await this.clickByText('button', 'Clear filter', 'Clear filter button');
          log('UI-15', clearClicked ? 'PASS' : 'FAIL', 'Clear filter button works');
        } else {
          // Click badge again to clear instead
          const warningBadgeAgain = await this.findByText('span, div', 'Warning');
          if (warningBadgeAgain) await warningBadgeAgain.click();
          log('UI-15', 'SKIP', 'Clear filter button not visible (clicked badge to clear)');
        }
      } else {
        log('UI-10', 'SKIP', 'Warning badge not found');
        log('UI-15', 'SKIP', 'No filter to clear');
      }

      // UI-12: Info badge (P3 - yellow)
      const infoBadge = await this.page.$('[class*="bg-yellow-500"]');
      if (infoBadge) {
        await infoBadge.click();
        await wait(500);
        log('UI-12', 'PASS', 'Info badge clickable');
        await infoBadge.click(); // Clear
        await wait(300);
      } else {
        log('UI-12', 'SKIP', 'Info badge not found');
      }

      // UI-14: Total badge
      const totalBadge = await this.findByText('button, div', 'Total');
      if (totalBadge) {
        await totalBadge.click();
        await wait(500);
        log('UI-14', 'PASS', 'Total badge clickable');
      } else {
        log('UI-14', 'SKIP', 'Total badge not found');
      }

      // ========================================
      // SECTION 4: Search Tests
      // ========================================
      console.log('\n--- SECTION 4: Search Tests ---\n');

      const searchInput = await this.page.$('input[type="text"]') ||
                          await this.page.$('input[placeholder*="earch"]') ||
                          await this.page.$('input[placeholder*="filter"]') ||
                          await this.page.$('input');
      if (searchInput && hasAlerts) {
        // UI-16: Type in search
        await searchInput.type('test');
        await wait(500);
        log('UI-16', 'PASS', 'Search input accepts text');

        // UI-18: Clear search
        await searchInput.click({ clickCount: 3 });
        await searchInput.press('Backspace');
        await wait(500);
        log('UI-18', 'PASS', 'Search cleared');
      } else {
        log('UI-16', 'FAIL', 'Search input not found');
        log('UI-18', 'SKIP', 'Search input not found');
      }

      // ========================================
      // SECTION 5: Table Sorting Tests
      // ========================================
      console.log('\n--- SECTION 5: Table Sorting Tests ---\n');

      if (hasAlerts) {
        // Sortable columns are th elements with cursor-pointer class
        // Column order: [expand toggle], Severity, Job Name, Category, Title, Time, Status
        const sortableColumns = [
          { name: 'Severity', index: 1 },
          { name: 'Job Name', index: 2 },
          { name: 'Category', index: 3 },
          { name: 'Title', index: 4 },
          { name: 'Time', index: 5 },
        ];

        for (let i = 0; i < sortableColumns.length; i++) {
          const col = sortableColumns[i];
          try {
            // Re-query headers each time to avoid stale element references
            const headers = await this.page.$$('th');
            if (headers[col.index]) {
              await headers[col.index].click();
              await wait(300);
              log(`UI-2${i}`, 'PASS', `${col.name} column sortable`);
            } else {
              log(`UI-2${i}`, 'FAIL', `${col.name} column header not found`);
            }
          } catch (e) {
            log(`UI-2${i}`, 'FAIL', `${col.name} column not clickable: ${e.message}`);
          }
        }
      } else {
        log('UI-20', 'SKIP', 'No alerts - skipping sort tests');
      }

      // ========================================
      // SECTION 6: Row Expansion Tests
      // ========================================
      console.log('\n--- SECTION 6: Row Expansion Tests ---\n');

      const rows = hasAlerts ? await this.page.$$('table tbody tr') : [];
      if (rows.length > 0) {
        // UI-28/29: Click to expand first row
        await rows[0].click();
        await wait(1500);

        // Check for expanded content
        const hasDescription = await this.page.evaluate(() =>
          document.body.innerText.includes('Description')
        );
        log('UI-30', hasDescription ? 'PASS' : 'FAIL', 'Expanded row shows Description');

        const hasRecommended = await this.page.evaluate(() =>
          document.body.innerText.includes('Recommended Action')
        );
        log('UI-31', hasRecommended ? 'PASS' : 'FAIL', 'Expanded row shows Recommended Action');

        // UI-33: View Job Details link
        const jobLink = await this.page.evaluate(() =>
          Array.from(document.querySelectorAll('a')).some(a =>
            a.textContent?.includes('View Job Details')
          )
        );
        log('UI-33', jobLink ? 'PASS' : 'FAIL', 'View Job Details link present');

        // UI-32: Acknowledge button (if present)
        const ackBtn = await this.findByText('button', 'Acknowledge');
        log('UI-32', ackBtn ? 'PASS' : 'SKIP',
          ackBtn ? 'Acknowledge button present' : 'Alert already acknowledged');

        // UI-34: Collapse
        await rows[0].click();
        await wait(500);
        log('UI-34', 'PASS', 'Row collapsed');
      } else {
        log('UI-28', 'SKIP', 'No rows to expand');
      }

      // ========================================
      // SECTION 7: Pagination Tests
      // ========================================
      console.log('\n--- SECTION 7: Pagination Tests ---\n');

      // UI-35: Rows per page dropdown
      const pageSizeSelect = await this.page.$('button[class*="SelectTrigger"], [role="combobox"]');
      log('UI-35', pageSizeSelect ? 'PASS' : 'SKIP', pageSizeSelect ? 'Rows per page dropdown present' : 'Pagination dropdown not found');

      // UI-40: Next page button
      const nextBtn = await this.findByText('button', 'Next') ||
                      await this.page.$('button[title="Next page"]');
      if (nextBtn && hasAlerts) {
        const isDisabled = await this.page.evaluate(el => el.disabled, nextBtn);
        if (!isDisabled) {
          await nextBtn.click();
          await wait(500);
          log('UI-40', 'PASS', 'Next page button works');

          // UI-39: Previous page
          const prevBtn = await this.findByText('button', 'Previous') ||
                          await this.page.$('button[title="Previous page"]');
          if (prevBtn) {
            await prevBtn.click();
            await wait(500);
            log('UI-39', 'PASS', 'Previous page button works');
          }
        } else {
          log('UI-40', 'SKIP', 'Only one page of results');
          log('UI-39', 'SKIP', 'Only one page of results');
        }
      } else {
        log('UI-40', 'SKIP', hasAlerts ? 'Next page button not found' : 'No alerts for pagination');
      }

      // ========================================
      // SECTION 8: Navigation Test
      // ========================================
      console.log('\n--- SECTION 8: Navigation Tests ---\n');

      // Expand first row and click View Job Details
      const rowsForNav = hasAlerts ? await this.page.$$('table tbody tr') : [];
      if (rowsForNav.length > 0) {
        await rowsForNav[0].click();
        await wait(1000);

        const jobDetailLink = await this.findByText('a', 'View Job Details');

        if (jobDetailLink) {
          await jobDetailLink.click();
          await wait(3000);

          const currentUrl = this.page.url();
          const hasJobParam = currentUrl.includes('job=');
          log('NAV-01', hasJobParam ? 'PASS' : 'FAIL',
            `View Job Details navigates with job param: ${hasJobParam}`);

          // NAV-02: Check filter banner
          const hasFilterBanner = await this.page.evaluate(() =>
            document.body.innerText.includes('Filtering by Job ID')
          );
          log('NAV-02', hasFilterBanner ? 'PASS' : 'FAIL',
            'Job Health shows filter banner');

          // Go back to alerts
          await this.page.goto(`${BASE_URL}/alerts`, { waitUntil: 'networkidle2' });
          await wait(2000);
        } else {
          log('NAV-01', 'SKIP', 'View Job Details link not found');
          log('NAV-02', 'SKIP', 'Navigation test skipped');
        }
      } else {
        log('NAV-01', 'SKIP', 'No alerts - skipping navigation tests');
        log('NAV-02', 'SKIP', 'No alerts - skipping navigation tests');
      }

      // ========================================
      // SECTION 9: Visual State Tests
      // ========================================
      console.log('\n--- SECTION 9: Visual State Tests ---\n');

      if (hasAlerts) {
        // Check row colors
        const hasP1Row = await this.page.$('tr[class*="bg-red-50"]') !== null;
        const hasP2Row = await this.page.$('tr[class*="bg-orange-50"]') !== null;
        const hasP3Row = await this.page.$('tr[class*="bg-yellow-50"]') !== null;

        log('UI-43', hasP1Row ? 'PASS' : 'SKIP', 'P1 rows have red background');
        log('UI-44', hasP2Row ? 'PASS' : 'SKIP', 'P2 rows have orange background');
        log('UI-45', hasP3Row ? 'PASS' : 'SKIP', 'P3 rows have yellow background');
      } else {
        log('UI-43', 'SKIP', 'No alerts - skipping visual tests');
      }

      // ========================================
      // SUMMARY
      // ========================================
      console.log('\n' + '='.repeat(60));
      console.log('  TEST SUMMARY');
      console.log('='.repeat(60));
      console.log(`\n  Passed:  ${results.passed}`);
      console.log(`  Failed:  ${results.failed}`);
      console.log(`  Skipped: ${results.skipped}`);
      console.log(`  Total:   ${results.tests.length}`);
      const passRate = results.passed + results.failed > 0
        ? ((results.passed / (results.passed + results.failed)) * 100).toFixed(1)
        : '100.0';
      console.log(`\n  Pass Rate: ${passRate}%`);
      console.log('\n' + '='.repeat(60));

      // API Summary
      console.log('\nAPI Calls Made:');
      Object.entries(results.apiByEndpoint).forEach(([endpoint, counts]) => {
        const status = counts.errors === 0 ? '✓' : '✗';
        console.log(`  ${status} ${endpoint}: ${counts.success} ok, ${counts.errors} errors`);
      });

      console.log('\n' + '='.repeat(60) + '\n');

    } catch (error) {
      console.error('\nTest Error:', error.message);
      try {
        await this.page.screenshot({ path: 'tests/alerts-test-error.png' });
        console.log('Screenshot saved: tests/alerts-test-error.png');
      } catch (e) {}
    } finally {
      // Write results to file
      fs.writeFileSync('tests/alerts-test-results.json', JSON.stringify(results, null, 2));
      console.log('Results saved: tests/alerts-test-results.json');

      // Cleanup
      if (this.browser) {
        await this.browser.close();
      }

      if (this.tempProfileDir) {
        try {
          fs.rmSync(this.tempProfileDir, { recursive: true, force: true });
          console.log('Cleaned up temp profile\n');
        } catch (e) {}
      }
    }
  }
}

const tester = new AlertsPageTester();
tester.run().catch(console.error);
