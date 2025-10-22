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

  const fcpValues = results.map(r => r.fcp).filter(Boolean).sort((a, b) => a - b);
  const lcpValues = results.map(r => r.lcp).filter(Boolean).sort((a, b) => a - b);
  const resourceCounts = results.map(r => r.resourceCount);

  return {
    name: pageDef.name,
    path: pageDef.path,
    fcp: {
      median: fcpValues[Math.floor(fcpValues.length / 2)],
      p95: fcpValues[Math.floor(fcpValues.length * 0.95)],
    },
    lcp: {
      median: lcpValues[Math.floor(lcpValues.length / 2)],
      p95: lcpValues[Math.floor(lcpValues.length * 0.95)],
    },
    resourceCount: {
      median: resourceCounts.sort((a, b) => a - b)[Math.floor(resourceCounts.length / 2)],
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
    console.log(`  FCP: ${result.fcp.median.toFixed(2)}ms (P95: ${result.fcp.p95.toFixed(2)}ms)`);
    console.log(`  LCP: ${result.lcp.median.toFixed(2)}ms (P95: ${result.lcp.p95.toFixed(2)}ms)`);
    console.log(`  Resources: ${result.resourceCount.median}`);
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
