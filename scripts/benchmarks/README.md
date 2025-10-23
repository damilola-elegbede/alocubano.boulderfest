# Performance Benchmark Suite

Comprehensive benchmarking tools for measuring the actual performance gains from 11 optimizations across 2 waves.

## Optimizations Being Measured

### Wave 1 (10 optimizations)

1. **Font Loading Optimization** - Target: 100-200ms FCP improvement
2. **Database Performance Indexes** - Target: 10-50ms per query
3. **API Cache Headers** - Target: 80ms per cache hit @ 60-70% hit rate
4. **Async Reminder Scheduling** - Target: 200-500ms faster checkout
5. **Fire-and-Forget Reservation Fulfillment** - Target: 50-100ms faster webhook
6. **Async Email Sending** - Target: 1,000-2,000ms improvement (BIGGEST WIN)
7. **Parallelize Webhook Operations** - Actual: 154ms (measured)
8. **Batch Ticket Validation** - Actual: 85% faster, 17.25ms (measured)
9. **CSS Bundle Consolidation** - Target: 300-500ms FCP (108 fewer HTTP requests)
10. **JavaScript Deferral** - Target: 50-75ms FCP

### Wave 2 (1 optimization)

11. **Database Query Consolidation** - Target: 160-400ms improvement (70-80% reduction)

## Expected Cumulative Gains

- **Frontend (FCP)**: 450-775ms improvement (font + CSS + JS)
- **Backend (Dashboard)**: 160-400ms improvement (query consolidation)
- **Checkout Flow**: 1,400-2,800ms improvement (async email + reminders + fulfillment)
- **Webhook Processing**: 200-300ms improvement (parallelization + fulfillment)
- **Database Queries**: 10-50ms per query (indexes)
- **Admin API Calls**: 80ms per cache hit @ 60-70% hit rate

## Benchmark Scripts

### Individual Benchmarks

- **database-queries.js** - Measures database query performance (optimizations 2, 11)
- **frontend-performance.js** - Measures FCP, LCP, TTI (optimizations 1, 9, 10)
- **cache-performance.js** - Measures API cache effectiveness (optimization 3)
- **checkout-flow.js** - Measures checkout flow performance (optimizations 4, 5, 6)

### Master Runner

- **run-all.js** - Runs all benchmarks sequentially and generates summary

### Report Generation

- **generate-reports.js** - Creates markdown reports from benchmark results

## Usage

### Run All Benchmarks

```bash
node scripts/benchmarks/run-all.js
```

### Run Individual Benchmark

```bash
# Database queries
node scripts/benchmarks/database-queries.js

# Frontend performance (requires Playwright)
node scripts/benchmarks/frontend-performance.js

# Cache performance
node scripts/benchmarks/cache-performance.js

# Checkout flow
node scripts/benchmarks/checkout-flow.js
```

### Generate Reports

```bash
node scripts/benchmarks/generate-reports.js
```

## Output Files

All results are saved to `.tmp/benchmarks/` and `.tmp/reports/`:

### Benchmark Results (JSON)

- `.tmp/benchmarks/database-queries-results.json`
- `.tmp/benchmarks/frontend-performance-results.json`
- `.tmp/benchmarks/cache-performance-results.json`
- `.tmp/benchmarks/checkout-flow-results.json`
- `.tmp/benchmarks/benchmark-suite-summary.json`

### Reports (Markdown)

- `.tmp/reports/performance-benchmark-summary.md` - Executive summary with scorecard
- `.tmp/reports/performance-benchmark-detailed.md` - Detailed metrics for all tests

## Prerequisites

### Environment Variables

```bash
# Required for Vercel deployment benchmarks
VERCEL_BASE_URL=http://localhost:3000  # or your Vercel preview URL

# Required for admin endpoint benchmarks
TEST_ADMIN_TOKEN=<your-test-admin-jwt>

# Required for database benchmarks
TURSO_DATABASE_URL=<your-database-url>
TURSO_AUTH_TOKEN=<your-auth-token>
```

### Dependencies

All dependencies are already in package.json:

- Playwright (for frontend benchmarks)
- Node.js built-in modules (perf_hooks, fs, path)

## Benchmark Methodology

### Database Queries

- **Iterations**: 100 (with 10 warmup)
- **Metrics**: Mean, Median, P95, P99, Min, Max
- **Method**: Direct database client queries
- **Targets**: Specific thresholds for each optimization

### Frontend Performance

- **Iterations**: 10 per page
- **Metrics**: FCP, LCP, Resource Count, Transfer Size
- **Method**: Playwright + Performance API
- **Pages**: Home, Tickets, Gallery, Admin Dashboard

### Cache Performance

- **Iterations**: 50 per endpoint
- **Metrics**: Response time, Cache hit rate
- **Method**: HTTP requests with cache header analysis
- **Target**: 60-70% hit rate, 80ms savings per hit

### Checkout Flow

- **Iterations**: 20
- **Metrics**: Total duration, Component timings
- **Method**: Simulated checkout + actual webhook calls
- **Target**: 1,400ms+ cumulative improvement

## Interpreting Results

### Status Indicators

- ✅ **Green (MET)**: Target met or exceeded
- 🟡 **Yellow (PARTIAL)**: 50-90% of target achieved
- 🔵 **Blue (TESTED)**: Benchmark executed successfully
- ⚪ **White (NOT_TESTED)**: Benchmark not executed

### Performance Targets

Each optimization has specific performance targets based on expected gains:

- **Critical targets** (must meet): Dashboard query <200ms, FCP improvements
- **Secondary targets** (should meet): Cache hit rates, async operation speedups
- **Measured targets** (already validated): Webhook parallelization, batch validation

## Troubleshooting

### Database Connection Errors

Ensure environment variables are set:

```bash
export TURSO_DATABASE_URL=<url>
export TURSO_AUTH_TOKEN=<token>
```

### Frontend Benchmark Fails

Install Playwright browsers:

```bash
npx playwright install chromium
```

### Admin Endpoint Tests Skipped

Set TEST_ADMIN_TOKEN:

```bash
# Get token from admin login
export TEST_ADMIN_TOKEN=<jwt-token>
```

## Notes

- Benchmarks should be run against a consistent environment (local dev or preview)
- Database should have production-like data volumes for accurate results
- Frontend benchmarks require a running Vercel dev server or deployed preview
- Some optimizations (webhook parallelization, batch validation) already have measured results

## Next Steps

After running benchmarks:

1. Review `.tmp/reports/performance-benchmark-summary.md` for executive summary
2. Check `.tmp/reports/performance-benchmark-detailed.md` for detailed metrics
3. Identify optimizations that need tuning (yellow/red status)
4. Re-run specific benchmarks after adjustments
5. Update optimization implementation if targets not met

## Contributing

When adding new benchmarks:

1. Create script in `scripts/benchmarks/`
2. Follow naming convention: `<category>-<name>.js`
3. Save results to `.tmp/benchmarks/<name>-results.json`
4. Update `run-all.js` to include new benchmark
5. Update `generate-reports.js` to process new results
6. Document in this README

---

Last Updated: 2025-10-22
