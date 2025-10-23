/**
 * Master Benchmark Runner
 */

import { safeStringify } from '../../lib/bigint-serializer.js';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const BENCHMARKS = [
  { name: 'Database Queries', script: 'database-queries.js', critical: true },
  { name: 'Frontend Performance', script: 'frontend-performance.js', critical: true },
  { name: 'Cache Performance', script: 'cache-performance.js', critical: false },
  { name: 'Checkout Flow', script: 'checkout-flow.js', critical: false },
];

function runBenchmark(script) {
  return new Promise((resolve) => {
    console.log(`\nRunning: ${script}\n`);

    const child = spawn('node', [path.join('scripts', 'benchmarks', script)], {
      stdio: 'inherit',
      env: process.env,
    });

    child.on('close', (code) => {
      resolve({ script, success: code === 0, code });
    });

    child.on('error', (err) => {
      resolve({ script, success: false, error: err.message });
    });
  });
}

async function main() {
  console.log('Performance Optimization Benchmark Suite');
  console.log('Testing 11 optimizations across 2 waves\n');

  const results = [];

  for (const benchmark of BENCHMARKS) {
    const result = await runBenchmark(benchmark.script);
    results.push({ ...benchmark, ...result });

    if (!result.success && benchmark.critical) {
      console.error(`\nCritical benchmark failed: ${benchmark.name}\n`);
      break;
    }
  }

  console.log('\nBenchmark Suite Summary\n');
  results.forEach(result => {
    const status = result.success ? 'PASS' : 'FAIL';
    console.log(`  ${status} ${result.name}`);
  });

  const successCount = results.filter(r => r.success).length;
  console.log(`\n  Total: ${successCount}/${results.length} benchmarks completed\n`);

  const outputDir = path.join(process.cwd(), '.tmp', 'benchmarks');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const summary = {
    timestamp: new Date().toISOString(),
    totalBenchmarks: results.length,
    successfulBenchmarks: successCount,
    results,
  };

  fs.writeFileSync(
    path.join(outputDir, 'benchmark-suite-summary.json'),
    safeStringify(summary, 2)
  );

  const allSuccessful = successCount === results.length;
  process.exit(allSuccessful ? 0 : 1);
}

main().catch(err => {
  console.error('\nMaster benchmark runner failed:', err);
  process.exit(1);
});
