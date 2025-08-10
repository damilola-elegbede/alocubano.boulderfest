# Database Query Optimization System

Comprehensive database performance monitoring and optimization system for A Lo Cubano Boulder Fest application.

## Overview

This system provides real-time query performance monitoring, automatic optimization suggestions, and specialized optimizations for festival-specific query patterns. It's designed to work seamlessly with the existing SQLite database while preparing for future PostgreSQL migration.

## Features

### 🔍 Query Performance Analysis
- **Execution Time Tracking**: Monitor query execution times with <50ms slow query threshold
- **Query Pattern Recognition**: Automatically categorize queries (ticket lookups, analytics, etc.)
- **Complexity Analysis**: Evaluate query complexity and resource usage
- **Execution Plan Analysis**: Track query patterns and suggest optimizations

### ⚡ Automatic Optimization
- **Index Recommendations**: Suggest optimal indexes based on query patterns
- **Query Rewriting**: Provide better query alternatives
- **Connection Pool Optimization**: Manage database connections efficiently
- **Prepared Statement Caching**: Cache frequently used queries

### 📊 Real-time Monitoring
- **Performance Metrics**: Track query execution statistics
- **Performance Degradation Alerts**: Detect and alert on performance issues
- **Historical Tracking**: Maintain performance trends over time
- **Detailed Reporting**: Generate comprehensive performance reports

### 🎪 Festival-Specific Optimizations
- **Ticket Lookup Optimization**: Optimize QR code validation and ticket queries
- **Analytics Query Optimization**: Optimize dashboard and reporting queries  
- **Check-in Performance**: Optimize real-time check-in operations
- **Sales Report Optimization**: Optimize revenue and sales analytics

## Installation

```javascript
// Initialize the performance system
import { initializePerformanceMonitoring } from './lib/performance/index.js';

// Initialize on app startup
const performanceService = await initializePerformanceMonitoring();
```

## Configuration

### Environment Variables

```bash
# Enable automatic query optimization
AUTO_OPTIMIZE_QUERIES=true

# Enable automatic optimization on performance degradation
AUTO_OPTIMIZE_ON_DEGRADATION=true

# Enable performance reporting
ENABLE_PERFORMANCE_REPORTING=true

# Enable wallet generation (affects performance)
WALLET_ENABLE_GENERATION=true
```

### Performance Thresholds

```javascript
const PERFORMANCE_THRESHOLDS = {
  SLOW_QUERY: 50,        // 50ms - queries slower than this are flagged
  CRITICAL_QUERY: 100,   // 100ms - critical performance threshold
  TIMEOUT_WARNING: 1000, // 1 second - timeout warning
  CONNECTION_WARNING: 5000 // 5 seconds - connection warning
};
```

## Usage

### Basic Integration

The system automatically wraps existing database calls:

```javascript
import { getDatabase } from '../api/lib/database.js';
import { withQueryOptimization } from '../lib/performance/query-optimizer.js';

const db = getDatabase();
const optimizer = withQueryOptimization(db);

// All database calls are now automatically monitored
const tickets = await db.execute('SELECT * FROM tickets WHERE event_id = ?', ['boulder-fest-2026']);
```

### Festival-Specific Optimizations

```javascript
import FestivalQueryOptimizer from '../lib/performance/festival-query-optimizer.js';

const festivalOptimizer = new FestivalQueryOptimizer(db);

// Optimized ticket lookup
const ticket = await festivalOptimizer.optimizeTicketLookup('ticket-123');

// Optimized QR validation
const validation = await festivalOptimizer.optimizeQRValidation('qr-code-data');

// Optimized analytics
const stats = await festivalOptimizer.optimizeEventStatistics('boulder-fest-2026');
```

### Performance Monitoring APIs

#### Get Performance Metrics

```bash
GET /api/performance/database-metrics?type=summary
GET /api/performance/database-metrics?type=detailed
GET /api/performance/database-metrics?type=slow-queries
```

#### Monitoring Dashboard

```bash
GET /api/performance/monitoring-dashboard
```

#### Manual Optimization

```bash
GET /api/performance/database-metrics?type=optimize
```

## API Endpoints

### `/api/performance/database-metrics`

**Query Parameters:**
- `type`: Type of metrics to retrieve
  - `summary` - Quick performance overview
  - `detailed` - Comprehensive performance report  
  - `health` - Service health status
  - `alerts` - Recent performance alerts
  - `recommendations` - Optimization recommendations
  - `slow-queries` - Slow query analysis
  - `categories` - Query category breakdown
  - `export` - Export metrics (supports CSV)
  - `optimize` - Trigger manual optimization
  - `status` - System status
- `format`: Output format (`json` or `csv` for export type)

**Response Example:**
```json
{
  "type": "summary",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "data": {
    "status": "HEALTHY",
    "summary": {
      "totalAlerts": 0,
      "slowQueries": 2,
      "queryErrors": 0,
      "degradationEvents": 0
    },
    "issues": [],
    "recommendations": [
      {
        "type": "CREATE_INDEXES",
        "priority": "HIGH",
        "message": "3 index recommendations available"
      }
    ]
  }
}
```

### `/api/performance/monitoring-dashboard`

Real-time dashboard data including:
- Performance metrics overview
- Alert analysis and trends
- Query performance breakdown
- Optimization recommendations
- System metrics and health
- Executive summary with actionable insights

## Query Categories

The system recognizes and optimizes these query patterns:

- **TICKET_LOOKUP**: Ticket lookups by ID, email, or QR code
- **USER_LOOKUP**: User and customer queries
- **EVENT_LOOKUP**: Event-specific queries
- **ANALYTICS_AGGREGATION**: COUNT, SUM, AVG aggregations
- **SEARCH_OPERATIONS**: Full-text and LIKE searches
- **SALES_REPORTS**: Transaction and sales analytics
- **CHECKIN_REPORTS**: Check-in status and reporting
- **ADMIN_DASHBOARD**: Admin dashboard queries
- **QR_VALIDATION**: QR code validation queries
- **TRANSACTION_LOOKUP**: Transaction lookups

## Index Recommendations

### Essential Indexes (Auto-created)

```sql
-- Critical performance indexes
CREATE INDEX IF NOT EXISTS idx_tickets_ticket_id ON tickets(ticket_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_attendee_email ON tickets(attendee_email);

-- QR validation indexes
CREATE INDEX IF NOT EXISTS idx_tickets_validation_signature ON tickets(validation_signature);
CREATE INDEX IF NOT EXISTS idx_tickets_qr_code_data ON tickets(qr_code_data);

-- Analytics indexes
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_tickets_event_status_created ON tickets(event_id, status, created_at);
```

### Festival-Specific Indexes

```sql
-- Covering indexes for common patterns
CREATE INDEX IF NOT EXISTS idx_tickets_covering_lookup ON tickets(ticket_id, attendee_first_name, attendee_last_name, attendee_email, status, event_id);

-- Check-in optimization
CREATE INDEX IF NOT EXISTS idx_tickets_covering_checkin ON tickets(event_id, status, checked_in_at, ticket_type) WHERE status IN ('valid', 'used');
```

## Performance Monitoring

### Real-time Alerts

The system monitors for:
- **Slow Queries**: Queries taking >50ms
- **Critical Queries**: Queries taking >100ms  
- **Performance Degradation**: >10% slow queries or >5% error rate
- **Connection Issues**: Connection timeouts or pool exhaustion

### Metrics Tracking

- Query execution times (min, max, average)
- Query execution counts
- Success/failure rates
- Index usage statistics  
- Cache hit rates
- Memory usage

### Event Emissions

```javascript
optimizer.on('slow-query', (slowQuery) => {
  // Handle slow query detection
});

optimizer.on('performance-degradation', (performance) => {
  // Handle performance issues
});

optimizer.on('deep-analysis', (analysis) => {
  // Handle optimization analysis results
});
```

## Testing

Run the comprehensive test suite:

```bash
npm test tests/unit/query-optimizer.test.js
```

Tests cover:
- Query analysis and categorization
- Performance tracking and metrics
- Optimization suggestions
- Error handling
- Festival-specific optimizations
- Integration testing

## Database Support

### SQLite (Current)
- Full optimization support
- Automatic index creation
- Query analysis and caching
- Performance monitoring

### PostgreSQL (Future)
- Prepared statement optimization
- Advanced query planning
- Connection pool management
- All SQLite features plus advanced PostgreSQL optimizations

## Best Practices

### Query Optimization
1. **Avoid SELECT \***: Specify only needed columns
2. **Use WHERE clauses**: Always filter large tables
3. **Add LIMIT clauses**: Limit result sets for lookups
4. **Use covering indexes**: Include all needed columns in indexes
5. **Optimize JOINs**: Use appropriate JOIN types and conditions

### Performance Monitoring
1. **Monitor slow queries**: Review queries >50ms regularly
2. **Create recommended indexes**: Apply index suggestions promptly
3. **Review alerts**: Investigate performance degradation alerts
4. **Clean up regularly**: Remove unused indexes and optimize table structure

### Festival-Specific
1. **Optimize ticket lookups**: Use ticket ID indexes for QR validation
2. **Cache analytics**: Cache dashboard queries for 5 minutes
3. **Batch operations**: Use batch operations for bulk updates
4. **Index check-ins**: Optimize check-in queries with covering indexes

## Troubleshooting

### High Memory Usage
- Check cache size and cleanup frequency
- Review long-running query metrics
- Reduce monitoring history retention

### Slow Performance
- Review slow query log
- Apply recommended indexes
- Check for missing WHERE clauses
- Optimize complex queries

### Alert Fatigue
- Adjust performance thresholds
- Implement alert aggregation
- Focus on high-impact optimizations

## Architecture

```
lib/performance/
├── index.js                      # Main entry point
├── query-optimizer.js            # Core optimization engine
├── database-performance-service.js # Service integration
├── festival-query-optimizer.js   # Festival-specific optimizations
└── README.md                     # This documentation

api/performance/
├── database-metrics.js           # Metrics API endpoint
└── monitoring-dashboard.js       # Dashboard API endpoint

tests/unit/
└── query-optimizer.test.js       # Comprehensive test suite
```

## Contributing

When adding new optimizations:

1. **Add query patterns** to `QUERY_PATTERNS` in `query-optimizer.js`
2. **Create index recommendations** in `INDEX_RECOMMENDATIONS`
3. **Add festival-specific optimizations** to `festival-query-optimizer.js`
4. **Write tests** for new functionality
5. **Update documentation** with new features

## License

This query optimization system is part of the A Lo Cubano Boulder Fest application and follows the same license terms.