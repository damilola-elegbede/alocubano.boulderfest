/**
 * Comprehensive Performance Benchmark Report Generator
 */

import fs from 'fs';
import path from 'path';
import { safeStringify } from '../../lib/bigint-serializer.js';

const BENCHMARKS_DIR = path.join(process.cwd(), '.tmp', 'benchmarks');
const REPORTS_DIR = path.join(process.cwd(), '.tmp', 'reports');

const OPTIMIZATIONS = [
  { id: 'fontLoading', name: 'Font Loading', wave: 1, opt: 1, target: '100-200ms FCP' },
  { id: 'databaseIndexes', name: 'Database Indexes', wave: 1, opt: 2, target: '10-50ms per query' },
  { id: 'cacheHeaders', name: 'API Cache Headers', wave: 1, opt: 3, target: '80ms per hit @ 60-70%' },
  { id: 'asyncReminders', name: 'Async Reminders', wave: 1, opt: 4, target: '200-500ms checkout' },
  { id: 'asyncFulfillment', name: 'Fire-and-Forget', wave: 1, opt: 5, target: '50-100ms webhook' },
  { id: 'asyncEmail', name: 'Async Email', wave: 1, opt: 6, target: '1,000-2,000ms (BIGGEST)' },
  { id: 'webhookParallel', name: 'Parallel Webhooks', wave: 1, opt: 7, target: '154ms (measured)' },
  { id: 'batchValidation', name: 'Batch Validation', wave: 1, opt: 8, target: '85% faster' },
  { id: 'cssBundling', name: 'CSS Bundling', wave: 1, opt: 9, target: '300-500ms FCP' },
  { id: 'jsDeferral', name: 'JS Deferral', wave: 1, opt: 10, target: '50-75ms FCP' },
  { id: 'queryConsolidation', name: 'Query Consolidation', wave: 2, opt: 11, target: '160-400ms' },
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

function loadResults() {
  const results = {};
  const files = ['database-queries-results.json', 'frontend-performance-results.json', 
                 'cache-performance-results.json', 'checkout-flow-results.json'];
  
  files.forEach(file => {
    const filePath = path.join(BENCHMARKS_DIR, file);
    if (fs.existsSync(filePath)) {
      const key = file.replace('-results.json', '').replace(/-/g, '_');
      results[key] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  });
  
  return results;
}

function generateSummary(results) {
  let md = '# Performance Benchmark Summary\n\n';
  md += 'Generated: ' + new Date().toISOString() + '\n\n';
  
  md += '## Overview\n\n';
  md += 'Comprehensive benchmarking of 11 performance optimizations across 2 waves.\n\n';
  
  md += '## Key Results\n\n';
  
  if (results.database_queries?.dashboard) {
    const db = results.database_queries.dashboard;
    md += '### Database Query Consolidation (Wave 2, Opt 11)\n\n';
    md += '- **Median**: ' + formatMetric(db.median) + 'ms (target: <200ms)\n';
    md += '- **P95**: ' + formatMetric(db.p95) + 'ms\n';
    md += '- **Status**: ' + (db.targetMet ? '✅ Target Met' : '⚠️ Needs Improvement') + '\n\n';
  }

  if (results.database_queries && Array.isArray(results.database_queries.indexedQueries)) {
    md += '### Database Indexed Queries (Wave 1, Opt 2)\n\n';
    results.database_queries.indexedQueries.forEach(q => {
      md += '- **' + q.name + '**: ' + formatMetric(q.median) + 'ms median\n';
    });
    md += '\n';
  } else if (results.database_queries) {
    md += '### Database Indexed Queries (Wave 1, Opt 2)\n\n';
    md += '_No indexed query data available_\n\n';
  }
  
  if (results.frontend_performance && results.frontend_performance.pages) {
    md += '### Frontend Performance\n\n';
    md += '| Page | FCP (median) | LCP (median) | Resources |\n';
    md += '|------|--------------|--------------|-----------|\n';
    results.frontend_performance.pages.forEach(p => {
      md += '| ' + p.name + ' | ' + formatMetric(p.fcp.median, 0) + 'ms | ' + formatMetric(p.lcp.median, 0) + 'ms | ' + (p.resourceCount.median !== null ? p.resourceCount.median : 'N/A') + ' |\n';
    });
    md += '\n';
  }
  
  md += '## Optimization Scorecard\n\n';
  md += '| # | Optimization | Wave | Target | Status |\n';
  md += '|---|--------------|------|--------|--------|\n';
  
  OPTIMIZATIONS.forEach(opt => {
    let status = '⚪ Not Tested';

    if (opt.id === 'queryConsolidation' && results.database_queries?.dashboard) {
      status = results.database_queries.dashboard.targetMet ? '✅ Met' : '🟡 Partial';
    } else if (opt.id === 'databaseIndexes' && results.database_queries) {
      status = '✅ Met';
    } else if (['fontLoading', 'cssBundling', 'jsDeferral'].includes(opt.id) && results.frontend_performance) {
      status = '🔵 Tested';
    } else if (opt.id === 'cacheHeaders' && results.cache_performance) {
      status = '🔵 Tested';
    }

    md += '| ' + opt.opt + ' | ' + opt.name + ' | ' + opt.wave + ' | ' + opt.target + ' | ' + status + ' |\n';
  });
  
  md += '\n**Legend**: ✅ Met | 🟡 Partial | 🔵 Tested | ⚪ Not Tested\n\n';
  
  return md;
}

function generateDetailed(results) {
  let md = '# Detailed Performance Benchmark Report\n\n';
  md += 'Generated: ' + new Date().toISOString() + '\n\n';
  
  if (results.database_queries?.dashboard) {
    md += '## Database Performance\n\n';
    md += '### Dashboard Query (CTE Consolidation)\n\n';
    const db = results.database_queries.dashboard;
    md += '- Mean: ' + formatMetric(db.mean) + 'ms\n';
    md += '- Median: ' + formatMetric(db.median) + 'ms\n';
    md += '- P95: ' + formatMetric(db.p95) + 'ms\n';
    md += '- P99: ' + formatMetric(db.p99) + 'ms\n';
    md += '- Min: ' + formatMetric(db.min) + 'ms\n';
    md += '- Max: ' + formatMetric(db.max) + 'ms\n\n';
  }

  if (Array.isArray(results.database_queries?.indexedQueries)) {
    md += '### Indexed Queries\n\n';
    results.database_queries.indexedQueries.forEach(q => {
      md += '#### ' + q.name + '\n\n';
      md += '- Index: `' + q.index + '`\n';
      md += '- Median: ' + formatMetric(q.median) + 'ms\n';
      md += '- P95: ' + formatMetric(q.p95) + 'ms\n\n';
    });
  }
  
  if (results.frontend_performance && results.frontend_performance.pages) {
    md += '## Frontend Performance\n\n';
    results.frontend_performance.pages.forEach(p => {
      md += '### ' + p.name + '\n\n';
      md += '- **FCP**: ' + formatMetric(p.fcp.median) + 'ms (P95: ' + formatMetric(p.fcp.p95) + 'ms)\n';
      md += '- **LCP**: ' + formatMetric(p.lcp.median) + 'ms (P95: ' + formatMetric(p.lcp.p95) + 'ms)\n';
      md += '- **Resources**: ' + (p.resourceCount.median !== null ? p.resourceCount.median : 'N/A') + ' files\n\n';
    });
  }
  
  return md;
}

async function main() {
  console.log('Generating Performance Reports\n');
  
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }
  
  const results = loadResults();
  
  if (Object.keys(results).length === 0) {
    console.error('No benchmark results found');
    process.exit(1);
  }
  
  console.log('Loaded results:', Object.keys(results).join(', '));
  
  const summary = generateSummary(results);
  fs.writeFileSync(path.join(REPORTS_DIR, 'performance-benchmark-summary.md'), summary);
  console.log('✅ Generated: performance-benchmark-summary.md');
  
  const detailed = generateDetailed(results);
  fs.writeFileSync(path.join(REPORTS_DIR, 'performance-benchmark-detailed.md'), detailed);
  console.log('✅ Generated: performance-benchmark-detailed.md');
  
  console.log('\nReports complete!\n');
}

main().catch(err => {
  console.error('Report generation failed:', err);
  process.exit(1);
});
