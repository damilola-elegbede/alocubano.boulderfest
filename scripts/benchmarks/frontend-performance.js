/**
 * Frontend Performance Benchmark
 * 
 * Measures performance gains from:
 * - Wave 1, Optimization 1: Font loading (100-200ms FCP improvement)
 * - Wave 1, Optimization 9: CSS bundling (300-500ms FCP, 108 fewer HTTP requests)
 * - Wave 1, Optimization 10: JavaScript deferral (50-75ms FCP)
 * 
 * Expected combined improvement: 450-775ms FCP
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE_URL = process.env.VERCEL_BASE_URL || 'http://localhost:3000';
const TEST_ITERATIONS = 10;

const PAGES = [
  { name: 'Home', path: '/pages/core/home.html' },
  { name: 'Tickets', path: '/pages/core/tickets.html' },
  { name: 'Gallery', path: '/pages/events/boulder-fest-2026/gallery.html' },
  { name: 'Admin Dashboard', path: '/pages/admin/dashboard.html' },
];

/**
 * Safely format metric value
 * @param {number|null|undefined} value - Metric value
 * @param {number} decimals - Decimal places (default: 2)
 * @returns {string} Formatted value or 'N/A'
 */
function formatMetric(value, decimals = 2) {
  if (value === null || value === undefined || !isFinite(value)) {
    return 'N/A';
  }
  return value.toFixed(decimals);
}

/**
 * Calculate median from sorted array
 * @param {number[]} values - Sorted array of values
 * @returns {number|null} Median value or null if empty
 */
function calculateMedian(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }
  return values[Math.floor(values.length / 2)];
}

/**
 * Calculate percentile from sorted array
 * @param {number[]} values - Sorted array of values
 * @param {number} percentile - Percentile to calculate (0-1)
 * @returns {number|null} Percentile value or null if empty
 */
function calculatePercentile(values, percentile) {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }
  const index = Math.floor(values.length * percentile);
  return values[Math.min(index, values.length - 1)];
}

/**
 * Measure performance metrics for a single page load
 * @param {import('playwright').Page} page - Playwright page instance
 * @param {string} url - URL to measure
 * @returns {Promise<Object>} Performance metrics object
 * @property {number|null} fcp - First Contentful Paint time in ms
 * @property {number|null} lcp - Largest Contentful Paint time in ms
 * @property {number|null} domContentLoaded - DOMContentLoaded event time in ms
 * @property {number|null} loadComplete - Load event completion time in ms
 * @property {number} resourceCount - Total number of resources loaded
 * @property {number} transferSize - Total transfer size in bytes
 * @example
 * const metrics = await measurePagePerformance(page, 'http://localhost:3000/pages/core/home.html');
 * console.log(`FCP: ${metrics.fcp}ms, LCP: ${metrics.lcp}ms`);
 */
async function measurePagePerformance(page, url) {
  await page.goto(url, { waitUntil: 'networkidle' });

  const metrics = await page.evaluate(() => {
    const paint = performance.getEntriesByType('paint');
    const fcp = paint.find(entry => entry.name === 'first-contentful-paint');
    const lcp = performance.getEntriesByType('largest-contentful-paint').slice(-1)[0];
    
    const navigation = performance.getEntriesByType('navigation')[0];
    const resources = performance.getEntriesByType('resource');

    return {
      fcp: fcp ? fcp.startTime : null,
      lcp: lcp ? lcp.startTime : null,
      domContentLoaded: navigation ? navigation.domContentLoadedEventEnd - navigation.fetchStart : null,
      loadComplete: navigation ? navigation.loadEventEnd - navigation.fetchStart : null,
      resourceCount: resources.length,
      transferSize: resources.reduce((sum, r) => sum + (r.transferSize || 0), 0),
    };
  });

  return metrics;
}

/**
 * Run performance benchmark for a specific page
 * @param {import('playwright').Browser} browser - Playwright browser instance
 * @param {Object} pageDef - Page definition object
 * @param {string} pageDef.name - Display name of the page
 * @param {string} pageDef.path - Relative path to the page
 * @returns {Promise<Object>} Benchmark results object
 * @property {string} name - Page name
 * @property {string} path - Page path
 * @property {Object} fcp - First Contentful Paint statistics
 * @property {number|null} fcp.median - Median FCP time in ms
 * @property {number|null} fcp.p95 - 95th percentile FCP time in ms
 * @property {Object} lcp - Largest Contentful Paint statistics
 * @property {number|null} lcp.median - Median LCP time in ms
 * @property {number|null} lcp.p95 - 95th percentile LCP time in ms
 * @property {Object} resourceCount - Resource count statistics
 * @property {number|null} resourceCount.median - Median resource count
 * @property {Array<Object>} results - Raw measurement results
 * @example
 * const result = await benchmarkPage(browser, { name: 'Home', path: '/pages/core/home.html' });
 * console.log(`Median FCP: ${result.fcp.median}ms`);
 */
async function benchmarkPage(browser, pageDef) {
  console.log(`\nBenchmarking ${pageDef.name}...`);
  
  const results = [];

  for (let i = 0; i < TEST_ITERATIONS; i++) {
    let page;
    try {
      page = await browser.newPage();
      const metrics = await measurePagePerformance(page, `${BASE_URL}${pageDef.path}`);
      results.push(metrics);
    } finally {
      // FIX: Always close page resource, even if error occurs
      if (page) {
        await page.close();
      }
    }
  }

  // Filter out null values and sort
  const fcpValues = results.map(r => r.fcp).filter(v => v !== null && isFinite(v)).sort((a, b) => a - b);
  const lcpValues = results.map(r => r.lcp).filter(v => v !== null && isFinite(v)).sort((a, b) => a - b);
  const resourceCounts = results.map(r => r.resourceCount).filter(v => v !== null && isFinite(v)).sort((a, b) => a - b);

  return {
    name: pageDef.name,
    path: pageDef.path,
    fcp: {
      median: calculateMedian(fcpValues),
      p95: calculatePercentile(fcpValues, 0.95),
    },
    lcp: {
      median: calculateMedian(lcpValues),
      p95: calculatePercentile(lcpValues, 0.95),
    },
    resourceCount: {
      median: calculateMedian(resourceCounts),
    },
    results,
  };
}

/**
 * Main benchmark execution function
 * Launches browser, runs benchmarks for all defined pages, and saves results
 * @returns {Promise<Object>} Benchmark results object
 * @property {string} timestamp - ISO 8601 timestamp of benchmark execution
 * @property {string} baseUrl - Base URL used for testing
 * @property {Array<Object>} pages - Array of page benchmark results
 * @throws {Error} When browser launch fails or page benchmarking errors occur
 * @example
 * const results = await main();
 * console.log(`Benchmarked ${results.pages.length} pages`);
 */
async function main() {
  console.log('Frontend Performance Benchmark');
  console.log('===============================');
  console.log(`Base URL: ${BASE_URL}\n`);

  let browser;
  try {
    browser = await chromium.launch();

    const pageResults = [];
  
    for (const pageDef of PAGES) {
      const result = await benchmarkPage(browser, pageDef);
      console.log(`  FCP: ${formatMetric(result.fcp.median)}ms (P95: ${formatMetric(result.fcp.p95)}ms)`);
      console.log(`  LCP: ${formatMetric(result.lcp.median)}ms (P95: ${formatMetric(result.lcp.p95)}ms)`);
      console.log(`  Resources: ${result.resourceCount.median !== null ? result.resourceCount.median : 'N/A'}`);
      pageResults.push(result);
    }
  

    // FIX: Validate pageResults array before using it
    if (!Array.isArray(pageResults) || pageResults.length === 0) {
      console.error('No benchmark results collected');
      process.exit(1);
    }
  
    const outputDir = path.join(process.cwd(), '.tmp', 'benchmarks');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
  
    const output = {
      timestamp: new Date().toISOString(),
      baseUrl: BASE_URL,
      pages: pageResults,
    };
  
    fs.writeFileSync(
      path.join(outputDir, 'frontend-performance-results.json'),
      JSON.stringify(output, null, 2)
    );
  
    console.log('\nResults saved to .tmp/benchmarks/frontend-performance-results.json');
    return output;
  } finally {
    // FIX: Always close browser resource, even if error occurs
    if (browser) {
      await browser.close();
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Benchmark failed:', err);
    process.exit(1);
  });
