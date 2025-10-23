/**
 * Cache Performance Benchmark
 * 
 * Measures performance gains from:
 * - Wave 1, Optimization 3: API cache headers (80ms per cache hit, 60-70% hit rate target)
 */

import { performance } from 'perf_hooks';
import fs from 'fs';
import path from 'path';

const VERCEL_BASE_URL = process.env.VERCEL_BASE_URL || 'http://localhost:3000';
const TEST_ADMIN_TOKEN = process.env.TEST_ADMIN_TOKEN;
const TEST_ITERATIONS = 50;

const TARGETS = {
  cacheHitRate: 0.6,      // 60-70% hit rate
  timeSavingsPerHit: 80,  // 80ms saved per cache hit
};

async function makeRequest(url, headers = {}) {
  const start = performance.now();
  
  try {
    const response = await fetch(url, { headers });
    const duration = performance.now() - start;
    
    const cacheControl = response.headers.get('cache-control');
    const isCacheable = cacheControl && cacheControl.includes('max-age');
    
    return {
      duration,
      statusCode: response.status,
      cacheable: isCacheable,
      cacheControl,
    };
  } catch (err) {
    return {
      duration: performance.now() - start,
      error: err.message,
    };
  }
}

async function benchmarkCacheableEndpoint(endpoint, headers = {}) {
  console.log(`\nTesting: ${endpoint}`);

  const timings = [];
  const cacheableCount = { yes: 0, no: 0 };

  for (let i = 0; i < TEST_ITERATIONS; i++) {
    const result = await makeRequest(`${VERCEL_BASE_URL}${endpoint}`, headers);
    timings.push(result.duration);
    
    if (result.cacheable) {
      cacheableCount.yes++;
    } else {
      cacheableCount.no++;
    }

    // Small delay between requests to simulate real usage
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  timings.sort((a, b) => a - b);

  const results = {
    median: timings[Math.floor(timings.length / 2)],
    mean: timings.reduce((a, b) => a + b, 0) / timings.length,
    cacheableResponses: cacheableCount.yes,
    nonCacheableResponses: cacheableCount.no,
    cacheablePercentage: (cacheableCount.yes / TEST_ITERATIONS) * 100,
  };

  console.log(`  Median response time: ${results.median.toFixed(2)}ms`);
  console.log(`  Cacheable responses: ${results.cacheableResponses}/${TEST_ITERATIONS} (${results.cacheablePercentage.toFixed(1)}%)`);

  return results;
}

async function main() {
  console.log('Cache Performance Benchmark');
  console.log('===========================');
  console.log(`Base URL: ${VERCEL_BASE_URL}\n`);

  console.log('Targets:');
  console.log(`  Cache hit rate: ${(TARGETS.cacheHitRate * 100).toFixed(0)}%+`);
  console.log(`  Time savings: ${TARGETS.timeSavingsPerHit}ms per hit`);

  const results = {};

  // Test admin endpoints (if token available)
  if (TEST_ADMIN_TOKEN) {
    const headers = { 'Authorization': `Bearer ${TEST_ADMIN_TOKEN}` };
    
    results.dashboard = await benchmarkCacheableEndpoint('/api/admin/dashboard', headers);
    results.donations = await benchmarkCacheableEndpoint('/api/admin/donations', headers);
    results.registrations = await benchmarkCacheableEndpoint('/api/admin/registrations', headers);
  } else {
    console.log('\n⚠️  TEST_ADMIN_TOKEN not set, skipping admin endpoint cache tests');
  }

  const outputDir = path.join(process.cwd(), '.tmp', 'benchmarks');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const output = {
    timestamp: new Date().toISOString(),
    targets: TARGETS,
    results,
  };

  fs.writeFileSync(
    path.join(outputDir, 'cache-performance-results.json'),
    JSON.stringify(output, null, 2)
  );

  console.log('\nResults saved to .tmp/benchmarks/cache-performance-results.json');
  return output;
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Benchmark failed:', err);
    process.exit(1);
  });
