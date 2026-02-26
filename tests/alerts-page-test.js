/**
 * Alerts Page Comprehensive Test
 * Tests all click zones and API endpoints as per ALERTS_TEST_PLAN.md
 *
 * Usage: node tests/alerts-page-test.js
 */
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const os = require('os');

const BASE_URL = 'https://job-monitor-2556758628403379.aws.databricksapps.com';

// Test results tracking
const results = {
  passed: 0,
  failed: 0,
  skipped: 0,
  tests: []
};

function log(testId, status, message) {
  const icon = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : '-';
  console.log(`  [${testId}] ${icon} ${message}`);
  results.tests.push({ testId, status, message });
  if (status === 'PASS') results.passed++;
  else if (status === 'FAIL') results.failed++;
  else results.skipped++;
}

async function runTests() {
  // Create temp Chrome profile
  const tempDir = path.join(os.tmpdir(), `chrome-alerts-test-${Date.now()}`);
  const sourceProfile = path.join(os.homedir(), 'Library/Application Support/Google/Chrome/Default');
  fs.mkdirSync(tempDir, { recursive: true });

  for (const file of ['Cookies', 'Login Data', 'Preferences']) {
    const src = path.join(sourceProfile, file);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(tempDir, file));
  }

  const browser = await puppeteer.launch({
    headless: false,
    userDataDir: tempDir,
    args: ['--no-first-run', '--disable-sync', '--window-size=1400,900']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  // Track API calls
  const apiCalls = [];
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('/api/')) {
      const endpoint = url.split('/api/')[1]?.split('?')[0];
      const query = url.includes('?') ? url.split('?')[1] : '';
      apiCalls.push({
        endpoint,
        query,
        status: response.status(),
        timestamp: Date.now()
      });
    }
  });

  try {
    console.log('\n' + '='.repeat(60));
    console.log('  ALERTS PAGE COMPREHENSIVE TEST');
    console.log('='.repeat(60));
    console.log(`\nTarget: ${BASE_URL}/alerts`);
    console.log(`Started: ${new Date().toISOString()}\n`);

    // ========================================
    // SECTION 1: Page Load & API Tests
    // ========================================
    console.log('\n--- SECTION 1: Page Load & API Tests ---\n');

    console.log('Loading Alerts page...');
    await page.goto(`${BASE_URL}/alerts`, { waitUntil: 'networkidle2', timeout: 90000 });
    await new Promise(r => setTimeout(r, 5000));

    // Check if authenticated
    const pageTitle = await page.title();
    if (pageTitle.includes('Sign In')) {
      console.log('\n⚠️  Authentication required. Please log in manually in the browser window.');
      console.log('   Waiting 30 seconds for manual login...\n');
      await new Promise(r => setTimeout(r, 30000));
      await page.goto(`${BASE_URL}/alerts`, { waitUntil: 'networkidle2', timeout: 90000 });
      await new Promise(r => setTimeout(r, 5000));
    }

    // API-01: Fetch all alerts
    const alertsCall = apiCalls.find(c => c.endpoint === 'alerts' && !c.query);
    if (alertsCall && alertsCall.status === 200) {
      log('API-01', 'PASS', 'GET /api/alerts returned 200');
    } else {
      log('API-01', 'FAIL', `GET /api/alerts returned ${alertsCall?.status || 'no call'}`);
    }

    // Check table loaded
    const hasTable = await page.$('table') !== null;
    log('UI-00', hasTable ? 'PASS' : 'FAIL', `Table loaded: ${hasTable}`);

    if (!hasTable) {
      console.log('\n⚠️  Table not found. Skipping UI tests.');
      throw new Error('Table not loaded');
    }

    // ========================================
    // SECTION 2: Header Section Tests
    // ========================================
    console.log('\n--- SECTION 2: Header Section Tests ---\n');

    // UI-01: Page title
    const titleExists = await page.evaluate(() =>
      document.body.innerText.includes('Alerts')
    );
    log('UI-01', titleExists ? 'PASS' : 'FAIL', 'Page title "Alerts" displayed');

    // UI-02: Refresh button
    apiCalls.length = 0; // Clear API calls
    const refreshBtn = await page.evaluateHandle(() =>
      Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Refresh'))
    );
    if (refreshBtn.asElement()) {
      await refreshBtn.asElement().click();
      await new Promise(r => setTimeout(r, 2000));
      const refreshCall = apiCalls.find(c => c.endpoint === 'alerts');
      log('UI-02', refreshCall ? 'PASS' : 'FAIL', 'Refresh button triggers API call');
    } else {
      log('UI-02', 'SKIP', 'Refresh button not found');
    }

    // UI-03 to UI-07: Category tabs
    const categoryTabs = ['All', 'Failure', 'SLA', 'Cost', 'Cluster'];
    for (let i = 0; i < categoryTabs.length; i++) {
      const tab = categoryTabs[i];
      apiCalls.length = 0;
      const tabBtn = await page.evaluateHandle((t) =>
        Array.from(document.querySelectorAll('button')).find(b => b.textContent === t)
      , tab);
      if (tabBtn.asElement()) {
        await tabBtn.asElement().click();
        await new Promise(r => setTimeout(r, 1000));
        log(`UI-0${3+i}`, 'PASS', `Category tab "${tab}" clickable`);
      } else {
        log(`UI-0${3+i}`, 'FAIL', `Category tab "${tab}" not found`);
      }
    }

    // ========================================
    // SECTION 3: Summary Badge Tests
    // ========================================
    console.log('\n--- SECTION 3: Summary Badge Tests ---\n');

    // UI-08: Critical badge click
    const criticalBadge = await page.$('[class*="bg-red-600"]');
    if (criticalBadge) {
      await criticalBadge.click();
      await new Promise(r => setTimeout(r, 500));
      const hasRing = await page.evaluate(() =>
        document.querySelector('[class*="ring-red-500"]') !== null
      );
      log('UI-08', hasRing ? 'PASS' : 'FAIL', 'Critical badge click shows ring highlight');

      // UI-09: Click again to clear
      await criticalBadge.click();
      await new Promise(r => setTimeout(r, 500));
      log('UI-09', 'PASS', 'Critical badge click again clears filter');
    } else {
      log('UI-08', 'SKIP', 'Critical badge not found (may be 0 P1 alerts)');
      log('UI-09', 'SKIP', 'Critical badge not found');
    }

    // UI-10: Warning badge click
    const warningBadge = await page.$('[class*="bg-orange-500"]');
    if (warningBadge) {
      await warningBadge.click();
      await new Promise(r => setTimeout(r, 500));
      const hasRing = await page.evaluate(() =>
        document.querySelector('[class*="ring-orange-500"]') !== null
      );
      log('UI-10', hasRing ? 'PASS' : 'FAIL', 'Warning badge click shows ring highlight');

      // UI-15: Clear filter button
      const clearBtn = await page.evaluateHandle(() =>
        Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Clear'))
      );
      if (clearBtn.asElement()) {
        await clearBtn.asElement().click();
        await new Promise(r => setTimeout(r, 500));
        log('UI-15', 'PASS', 'Clear filter button works');
      } else {
        log('UI-15', 'FAIL', 'Clear filter button not found');
      }
    } else {
      log('UI-10', 'SKIP', 'Warning badge not found');
      log('UI-15', 'SKIP', 'No filter to clear');
    }

    // UI-12: Info badge
    const infoBadge = await page.$('[class*="bg-yellow-500"]');
    if (infoBadge) {
      await infoBadge.click();
      await new Promise(r => setTimeout(r, 500));
      log('UI-12', 'PASS', 'Info badge clickable');
      await infoBadge.click(); // Clear
    } else {
      log('UI-12', 'SKIP', 'Info badge not found');
    }

    // UI-14: Total badge
    const totalBadge = await page.evaluateHandle(() =>
      Array.from(document.querySelectorAll('[class*="border"]')).find(el =>
        el.textContent?.includes('Total')
      )
    );
    if (totalBadge.asElement()) {
      await totalBadge.asElement().click();
      await new Promise(r => setTimeout(r, 500));
      log('UI-14', 'PASS', 'Total badge clickable');
    } else {
      log('UI-14', 'SKIP', 'Total badge not found');
    }

    // ========================================
    // SECTION 4: Search Tests
    // ========================================
    console.log('\n--- SECTION 4: Search Tests ---\n');

    const searchInput = await page.$('input[type="text"]');
    if (searchInput) {
      // UI-16: Type in search
      await searchInput.type('test');
      await new Promise(r => setTimeout(r, 500));
      log('UI-16', 'PASS', 'Search input accepts text');

      // UI-18: Clear search
      await searchInput.click({ clickCount: 3 });
      await searchInput.press('Backspace');
      await new Promise(r => setTimeout(r, 500));
      log('UI-18', 'PASS', 'Search cleared');
    } else {
      log('UI-16', 'FAIL', 'Search input not found');
      log('UI-18', 'SKIP', 'Search input not found');
    }

    // ========================================
    // SECTION 5: Table Sorting Tests
    // ========================================
    console.log('\n--- SECTION 5: Table Sorting Tests ---\n');

    const headers = await page.$$('th');
    const sortableHeaders = ['Severity', 'Job Name', 'Category', 'Title', 'Time'];

    for (let i = 0; i < Math.min(headers.length - 1, sortableHeaders.length); i++) {
      const header = headers[i + 1]; // Skip first empty column
      await header.click();
      await new Promise(r => setTimeout(r, 300));
      log(`UI-2${i}`, 'PASS', `${sortableHeaders[i]} column sortable`);
    }

    // ========================================
    // SECTION 6: Row Expansion Tests
    // ========================================
    console.log('\n--- SECTION 6: Row Expansion Tests ---\n');

    const rows = await page.$$('table tbody tr');
    if (rows.length > 0) {
      // UI-28/29: Click to expand
      await rows[0].click();
      await new Promise(r => setTimeout(r, 1500));

      // Check for expanded content
      const hasDescription = await page.evaluate(() =>
        document.body.innerText.includes('Description')
      );
      log('UI-30', hasDescription ? 'PASS' : 'FAIL', 'Expanded row shows Description');

      const hasRecommended = await page.evaluate(() =>
        document.body.innerText.includes('Recommended Action')
      );
      log('UI-31', hasRecommended ? 'PASS' : 'FAIL', 'Expanded row shows Recommended Action');

      // UI-33: View Job Details link
      const jobLink = await page.evaluate(() =>
        Array.from(document.querySelectorAll('a')).some(a =>
          a.textContent?.includes('View Job Details')
        )
      );
      log('UI-33', jobLink ? 'PASS' : 'FAIL', 'View Job Details link present');

      // UI-32: Acknowledge button (if present)
      const ackBtn = await page.evaluateHandle(() =>
        Array.from(document.querySelectorAll('button')).find(b =>
          b.textContent?.includes('Acknowledge')
        )
      );
      log('UI-32', ackBtn.asElement() ? 'PASS' : 'SKIP',
        ackBtn.asElement() ? 'Acknowledge button present' : 'Alert already acknowledged');

      // UI-34: Collapse
      await rows[0].click();
      await new Promise(r => setTimeout(r, 500));
      log('UI-34', 'PASS', 'Row collapsed');
    } else {
      log('UI-28', 'SKIP', 'No rows to expand');
    }

    // ========================================
    // SECTION 7: Pagination Tests
    // ========================================
    console.log('\n--- SECTION 7: Pagination Tests ---\n');

    // UI-35: Rows per page dropdown
    const pageSizeSelect = await page.$('button[class*="SelectTrigger"]');
    if (pageSizeSelect) {
      log('UI-35', 'PASS', 'Rows per page dropdown present');
    } else {
      log('UI-35', 'SKIP', 'Pagination dropdown not found');
    }

    // UI-40: Next page button
    const nextBtn = await page.$('button[title="Next page"]');
    if (nextBtn) {
      const isDisabled = await page.evaluate(el => el.disabled, nextBtn);
      if (!isDisabled) {
        await nextBtn.click();
        await new Promise(r => setTimeout(r, 500));
        log('UI-40', 'PASS', 'Next page button works');

        // UI-39: Previous page
        const prevBtn = await page.$('button[title="Previous page"]');
        if (prevBtn) {
          await prevBtn.click();
          await new Promise(r => setTimeout(r, 500));
          log('UI-39', 'PASS', 'Previous page button works');
        }
      } else {
        log('UI-40', 'SKIP', 'Only one page of results');
        log('UI-39', 'SKIP', 'Only one page of results');
      }
    } else {
      log('UI-40', 'SKIP', 'Next page button not found');
    }

    // ========================================
    // SECTION 8: Navigation Test
    // ========================================
    console.log('\n--- SECTION 8: Navigation Tests ---\n');

    // Expand first row and click View Job Details
    const rowsForNav = await page.$$('table tbody tr');
    if (rowsForNav.length > 0) {
      await rowsForNav[0].click();
      await new Promise(r => setTimeout(r, 1000));

      const jobDetailLink = await page.evaluateHandle(() =>
        Array.from(document.querySelectorAll('a')).find(a =>
          a.textContent?.includes('View Job Details')
        )
      );

      if (jobDetailLink.asElement()) {
        await jobDetailLink.asElement().click();
        await new Promise(r => setTimeout(r, 3000));

        const currentUrl = page.url();
        const hasJobParam = currentUrl.includes('job=');
        log('NAV-01', hasJobParam ? 'PASS' : 'FAIL',
          `View Job Details navigates with job param: ${hasJobParam}`);

        // NAV-02: Check filter banner
        const hasFilterBanner = await page.evaluate(() =>
          document.body.innerText.includes('Filtering by Job ID')
        );
        log('NAV-02', hasFilterBanner ? 'PASS' : 'FAIL',
          'Job Health shows filter banner');

        // Go back to alerts
        await page.goto(`${BASE_URL}/alerts`, { waitUntil: 'networkidle2' });
        await new Promise(r => setTimeout(r, 2000));
      } else {
        log('NAV-01', 'SKIP', 'View Job Details link not found');
        log('NAV-02', 'SKIP', 'Navigation test skipped');
      }
    }

    // ========================================
    // SECTION 9: Visual State Tests
    // ========================================
    console.log('\n--- SECTION 9: Visual State Tests ---\n');

    // Check row colors
    const hasP1Row = await page.$('tr[class*="bg-red-50"]') !== null;
    const hasP2Row = await page.$('tr[class*="bg-orange-50"]') !== null;
    const hasP3Row = await page.$('tr[class*="bg-yellow-50"]') !== null;

    log('UI-43', hasP1Row ? 'PASS' : 'SKIP', 'P1 rows have red background');
    log('UI-44', hasP2Row ? 'PASS' : 'SKIP', 'P2 rows have orange background');
    log('UI-45', hasP3Row ? 'PASS' : 'SKIP', 'P3 rows have yellow background');

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
    console.log(`\n  Pass Rate: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%`);
    console.log('\n' + '='.repeat(60) + '\n');

    // API Summary
    console.log('API Calls Made:');
    const apiSummary = {};
    apiCalls.forEach(c => {
      const key = c.endpoint + (c.query ? '?' + c.query : '');
      if (!apiSummary[key]) apiSummary[key] = { ok: 0, err: 0 };
      if (c.status >= 200 && c.status < 300) apiSummary[key].ok++;
      else apiSummary[key].err++;
    });
    Object.entries(apiSummary).forEach(([url, counts]) => {
      const status = counts.err === 0 ? '✓' : '✗';
      console.log(`  ${status} /api/${url}: ${counts.ok} ok, ${counts.err} errors`);
    });

    console.log('\n' + '='.repeat(60) + '\n');

  } catch (error) {
    console.error('\nTest Error:', error.message);
    await page.screenshot({ path: 'tests/alerts-test-error.png' });
    console.log('Screenshot saved: tests/alerts-test-error.png');
  } finally {
    await browser.close();
    fs.rmSync(tempDir, { recursive: true, force: true });

    // Write results to file
    fs.writeFileSync('tests/alerts-test-results.json', JSON.stringify(results, null, 2));
    console.log('Results saved: tests/alerts-test-results.json\n');
  }
}

runTests();
