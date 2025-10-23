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
  if (!values || values.length === 0) {
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
  if (!values || values.length === 0) {
    return null;
  }
  const index = Math.floor(values.length * percentile);
  return values[Math.min(index, values.length - 1)];
}

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

async function benchmarkPage(browser, pageDef) {
  console.log(`\nBenchmarking ${pageDef.name}...`);
  
  const results = [];

  for (let i = 0; i < TEST_ITERATIONS; i++) {
    const page = await browser.newPage();
    const metrics = await measurePagePerformance(page, `${BASE_URL}${pageDef.path}`);
    results.push(metrics);
    await page.close();
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

async function main() {
  console.log('Frontend Performance Benchmark');
  console.log('===============================');
  console.log(`Base URL: ${BASE_URL}\n`);

  const browser = await chromium.launch();

  const pageResults = [];

  for (const pageDef of PAGES) {
    const result = await benchmarkPage(browser, pageDef);
    console.log(`  FCP: ${formatMetric(result.fcp.median)}ms (P95: ${formatMetric(result.fcp.p95)}ms)`);
    console.log(`  LCP: ${formatMetric(result.lcp.median)}ms (P95: ${formatMetric(result.lcp.p95)}ms)`);
    console.log(`  Resources: ${result.resourceCount.median !== null ? result.resourceCount.median : 'N/A'}`);
    pageResults.push(result);
  }

  await browser.close();

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
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Benchmark failed:', err);
    process.exit(1);
  });
