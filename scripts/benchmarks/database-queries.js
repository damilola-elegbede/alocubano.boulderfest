/**
 * Database Query Performance Benchmark
 * 
 * Measures performance gains from:
 * - Wave 1, Optimization 2: Database indexes (10-50ms per query)
 * - Wave 2, Optimization 11: Query consolidation (160-400ms improvement)
 */

import { getDatabaseClient } from '../../lib/database.js';
import { safeStringify } from '../../lib/bigint-serializer.js';
import { performance } from 'perf_hooks';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BENCHMARK_ITERATIONS = 100;
const WARMUP_ITERATIONS = 10;

const TARGETS = {
  dashboardQuery: {
    before: 500,
    after: 200,
    improvement: 160,
  },
  indexedQuery: {
    improvement: 10,
  },
};

async function benchmarkQuery(db, query, params, iterations) {
  const timings = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await db.execute(query, params);
    const duration = performance.now() - start;
    timings.push(duration);
  }

  timings.sort((a, b) => a - b);
  
  return {
    mean: timings.reduce((a, b) => a + b, 0) / timings.length,
    median: timings[Math.floor(timings.length / 2)],
    p95: timings[Math.floor(timings.length * 0.95)],
    p99: timings[Math.floor(timings.length * 0.99)],
    min: timings[0],
    max: timings[timings.length - 1],
    timings,
  };
}

async function benchmarkDashboardQuery(db) {
  console.log('\n=== Benchmarking Dashboard Query (Wave 2, Optimization 11) ===');
  console.log('Target: 160-400ms improvement (70-80% reduction)\n');

  const optimizedQuery = `
    WITH ticket_stats AS (
      SELECT
        COUNT(*) FILTER (WHERE status = 'valid') as total_tickets,
        COUNT(DISTINCT transaction_id) as total_orders
      FROM tickets
    ),
    revenue_stats AS (
      SELECT
        COALESCE(SUM(t.price_cents), 0) / 100.0 as total_revenue
      FROM tickets t
      JOIN transactions tr ON t.transaction_id = tr.id
    )
    SELECT ts.*, rev.*
    FROM ticket_stats ts, revenue_stats rev
  `;

  console.log('Warming up...');
  await benchmarkQuery(db, optimizedQuery, [], WARMUP_ITERATIONS);

  console.log(`Running ${BENCHMARK_ITERATIONS} iterations...`);
  const results = await benchmarkQuery(db, optimizedQuery, [], BENCHMARK_ITERATIONS);

  console.log('\nDashboard Query Results:');
  console.log(`  Mean:   ${results.mean.toFixed(2)}ms`);
  console.log(`  Median: ${results.median.toFixed(2)}ms`);
  console.log(`  P95:    ${results.p95.toFixed(2)}ms`);
  console.log(`  P99:    ${results.p99.toFixed(2)}ms`);

  const targetMet = results.median <= TARGETS.dashboardQuery.after;
  const emoji = targetMet ? '✅' : '⚠️ ';
  console.log(`\n${emoji} Performance: ${results.median.toFixed(2)}ms (target: <${TARGETS.dashboardQuery.after}ms)`);

  return {
    name: 'Dashboard Query (CTE Consolidation)',
    ...results,
    targetMet,
  };
}

async function benchmarkIndexedQueries(db) {
  console.log('\n=== Benchmarking Indexed Queries (Wave 1, Optimization 2) ===\n');

  const queries = [
    {
      name: 'Tickets by status',
      query: 'SELECT * FROM tickets WHERE status = ? LIMIT 100',
      params: ['valid'],
      index: 'idx_tickets_status_created',
    },
    {
      name: 'Transactions by status',
      query: 'SELECT * FROM transactions WHERE status = ? LIMIT 100',
      params: ['completed'],
      index: 'idx_transactions_status',
    },
  ];

  const results = [];

  for (const queryDef of queries) {
    console.log(`${queryDef.name} (Index: ${queryDef.index})`);

    await benchmarkQuery(db, queryDef.query, queryDef.params, WARMUP_ITERATIONS);
    const timing = await benchmarkQuery(db, queryDef.query, queryDef.params, BENCHMARK_ITERATIONS);

    console.log(`  Median: ${timing.median.toFixed(2)}ms\n`);

    results.push({
      name: queryDef.name,
      index: queryDef.index,
      ...timing,
    });
  }

  return results;
}

async function main() {
  console.log('Database Query Performance Benchmark');
  console.log('=====================================\n');

  const db = await getDatabaseClient();

  const dashboardResults = await benchmarkDashboardQuery(db);
  const indexResults = await benchmarkIndexedQueries(db);

  const outputDir = path.join(process.cwd(), '.tmp', 'benchmarks');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const output = {
    timestamp: new Date().toISOString(),
    dashboard: dashboardResults,
    indexedQueries: indexResults,
  };

  fs.writeFileSync(
    path.join(outputDir, 'database-queries-results.json'),
    safeStringify(output, 2)
  );

  console.log('\nResults saved to .tmp/benchmarks/database-queries-results.json');
  return output;
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Benchmark failed:', err);
    process.exit(1);
  });
