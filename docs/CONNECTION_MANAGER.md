# Database Connection Pool Manager

## Overview

The Database Connection Pool Manager provides enterprise-grade connection pooling for the A Lo Cubano Boulder Fest serverless application. It implements a production-ready resource leasing system with automatic cleanup, health monitoring, and graceful shutdown coordination.

## Key Features

### 🔗 Resource Leasing System
- **Connection Acquisition**: Thread-safe connection leasing with timeout protection
- **Lease Tracking**: Automatic cleanup of timed-out leases
- **Operation Tagging**: Track database operations for debugging and monitoring

### 🏊 Connection Pool Management
- **Serverless Optimized**: Default limits (Vercel: 2 connections, Local: 5 connections)
- **Connection Reuse**: Efficient connection lifecycle management
- **Health Monitoring**: Automatic connection health checks and recovery

### 🔄 State Machine Integration
- **Connection States**: IDLE → ACTIVE → DRAINING → SHUTDOWN
- **Atomic Transitions**: Thread-safe state management
- **Graceful Shutdown**: Coordinated cleanup across all active operations

### ⚡ Serverless Optimizations
- **Cold Start Mitigation**: Fast connection acquisition
- **Memory Pressure Handling**: Automatic resource cleanup
- **Vercel Timeout Awareness**: Optimized for serverless function limits

## Installation and Setup

### 1. Basic Integration

```javascript
import { acquireDbLease, getConnectionManager } from '../lib/connection-manager.js';

// Simple database operation
async function getUserRegistration(email) {
  const lease = await acquireDbLease('get-user-registration');

  try {
    const result = await lease.execute(
      'SELECT * FROM registrations WHERE email = ?',
      [email]
    );
    return result.rows[0];
  } finally {
    lease.release(); // Always release the lease
  }
}
```

### 2. Transaction Management

```javascript
async function createTicketPurchase(ticketData) {
  const lease = await acquireDbLease('create-ticket-purchase');

  try {
    const transaction = await lease.transaction();

    try {
      // Create ticket
      await transaction.execute(
        'INSERT INTO tickets (id, type, price) VALUES (?, ?, ?)',
        [ticketData.id, ticketData.type, ticketData.price]
      );

      // Update inventory
      await transaction.execute(
        'UPDATE inventory SET available = available - 1 WHERE type = ?',
        [ticketData.type]
      );

      await transaction.commit();
      return { success: true };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } finally {
    lease.release();
  }
}
```

### 3. Service Class Integration

```javascript
import { getConnectionManager } from '../lib/connection-manager.js';

class RegistrationService {
  constructor() {
    this.connectionManager = getConnectionManager();
  }

  async createRegistration(data) {
    const lease = await this.connectionManager.acquireLease(
      `registration-${data.email}`
    );

    try {
      // Your database operations here
      const result = await lease.execute(
        'INSERT INTO registrations (...) VALUES (...)',
        [...]
      );

      return result;
    } finally {
      lease.release();
    }
  }
}
```

## Configuration

### Environment-Specific Settings

The connection manager automatically optimizes for different environments:

```javascript
// Serverless (Vercel) - Conservative limits
const serverlessConfig = {
  maxConnections: 2,
  acquireTimeout: 5000,
  leaseTimeout: 30000
};

// Local Development - Higher limits
const localConfig = {
  maxConnections: 5,
  acquireTimeout: 10000,
  leaseTimeout: 30000
};

// Custom configuration
const manager = new DatabaseConnectionManager({
  maxConnections: 10,
  leaseTimeout: 60000,
  healthCheckInterval: 30000
});
```

### Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `maxConnections` | 2 (Vercel) / 5 (Local) | Maximum concurrent connections |
| `minConnections` | 1 | Minimum connections to maintain |
| `acquireTimeout` | 5000ms (Vercel) / 10000ms (Local) | Timeout for acquiring connections |
| `leaseTimeout` | 30000ms | Maximum lease duration |
| `shutdownTimeout` | 15000ms | Graceful shutdown timeout |
| `healthCheckInterval` | 60000ms | Health check frequency |

## API Reference

### Core Functions

#### `acquireDbLease(operationId?, timeout?)`
Acquire a database connection lease for operations.

```javascript
const lease = await acquireDbLease('user-lookup', 5000);
```

#### `getConnectionManager(options?)`
Get the singleton connection manager instance.

```javascript
const manager = getConnectionManager({
  maxConnections: 10
});
```

#### `resetConnectionManager()`
Reset the singleton instance (primarily for testing).

```javascript
await resetConnectionManager();
```

### Connection Lease Methods

#### `lease.execute(sql, params?)`
Execute a SQL query using the leased connection.

```javascript
const result = await lease.execute('SELECT * FROM users WHERE id = ?', [123]);
```

#### `lease.transaction(timeout?)`
Start a database transaction.

```javascript
const transaction = await lease.transaction(30000);
```

#### `lease.batch(statements)`
Execute multiple statements as a batch.

```javascript
const statements = [
  { sql: 'INSERT INTO ...', args: [...] },
  { sql: 'UPDATE ...', args: [...] }
];
const results = await lease.batch(statements);
```

#### `lease.release()`
Release the lease back to the pool.

```javascript
lease.release(); // Always call in finally block
```

#### `lease.getStats()`
Get lease statistics for monitoring.

```javascript
const stats = lease.getStats();
// { id, operationId, createdAt, lastUsed, ageMs, idleMs, isReleased }
```

### Manager Methods

#### `manager.acquireLease(operationId?, timeout?)`
Acquire a connection lease.

#### `manager.releaseLease(leaseId)`
Release a specific lease.

#### `manager.gracefulShutdown(timeout?)`
Perform graceful shutdown of all connections.

```javascript
const success = await manager.gracefulShutdown(10000);
```

#### `manager.getPoolStatistics()`
Get comprehensive pool statistics.

```javascript
const stats = manager.getPoolStatistics();
```

#### `manager.getHealthStatus()`
Get current health status of the connection pool.

```javascript
const health = await manager.getHealthStatus();
```

## Monitoring and Health Checks

### Pool Statistics

```javascript
import { getPoolStatistics } from '../lib/connection-manager.js';

const stats = getPoolStatistics();
console.log('Pool utilization:',
  (stats.pool.activeLeases / stats.pool.maxConnections) * 100 + '%'
);
```

### Health Monitoring

```javascript
import { getPoolHealthStatus } from '../lib/connection-manager.js';

const health = await getPoolHealthStatus();
if (health.status === 'unhealthy') {
  console.error('Pool issues:', health.issues);
}
```

### API Endpoint for Monitoring

A monitoring endpoint is available at `/api/admin/connection-pool-status`:

```bash
curl http://localhost:3000/api/admin/connection-pool-status
```

Response includes:
- Pool health status
- Connection statistics
- Performance metrics
- Optimization recommendations

## Integration Patterns

### 1. API Handler Pattern

```javascript
export default async function handler(req, res) {
  const lease = await acquireDbLease(`api-${req.url}`);

  try {
    const result = await lease.execute('SELECT ...');
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  } finally {
    lease.release();
  }
}
```

### 2. Service Layer Pattern

```javascript
class DataService {
  async getData(id) {
    const lease = await acquireDbLease(`get-data-${id}`);
    try {
      return await lease.execute('SELECT * FROM data WHERE id = ?', [id]);
    } finally {
      lease.release();
    }
  }
}
```

### 3. Batch Processing Pattern

```javascript
async function processBatch(items) {
  const lease = await acquireDbLease('batch-processing');

  try {
    const statements = items.map(item => ({
      sql: 'INSERT INTO processed (data) VALUES (?)',
      args: [item]
    }));

    return await lease.batch(statements);
  } finally {
    lease.release();
  }
}
```

## Error Handling

### Connection Acquisition Errors

```javascript
try {
  const lease = await acquireDbLease('operation');
  // ... use lease
} catch (error) {
  if (error.message.includes('timeout')) {
    // Handle timeout
  } else if (error.message.includes('shutting down')) {
    // Handle shutdown
  }
}
```

### Query Execution Errors

```javascript
const lease = await acquireDbLease('query');
try {
  await lease.execute('SELECT ...');
} catch (error) {
  // Query failed - lease will be released in finally
  console.error('Query failed:', error.message);
} finally {
  lease.release();
}
```

## Best Practices

### ✅ Do

1. **Always release leases** in finally blocks
2. **Use meaningful operation IDs** for debugging
3. **Set appropriate timeouts** for long-running operations
4. **Monitor pool health** in production
5. **Use transactions** for multi-statement operations

### ❌ Don't

1. **Don't forget to release leases** - causes connection leaks
2. **Don't share leases** between operations
3. **Don't hold leases** longer than necessary
4. **Don't ignore timeout errors** - they indicate performance issues
5. **Don't bypass the pool** - always use leases for consistency

### Performance Tips

1. **Short operations**: Keep database operations brief
2. **Connection reuse**: Release leases promptly for reuse
3. **Batch operations**: Use batch() for multiple related statements
4. **Monitor metrics**: Watch for high utilization or error rates
5. **Optimize queries**: Reduce operation time to improve throughput

## Testing

### Unit Testing

```javascript
import { resetConnectionManager, getConnectionManager } from '../lib/connection-manager.js';

describe('Database Operations', () => {
  afterEach(async () => {
    await resetConnectionManager();
  });

  it('should handle database operations', async () => {
    // Your tests here
  });
});
```

### Integration Testing

The connection manager integrates seamlessly with existing test suites and provides proper cleanup in test environments.

## Troubleshooting

### Common Issues

1. **Connection timeouts**: Increase `acquireTimeout` or optimize queries
2. **Lease timeouts**: Increase `leaseTimeout` or break up long operations
3. **Pool exhaustion**: Increase `maxConnections` or fix connection leaks
4. **Memory issues**: Monitor active leases and ensure proper cleanup

### Debug Information

Enable debug logging:
```javascript
process.env.DEBUG = 'true';
```

Get detailed statistics:
```javascript
const stats = manager.getPoolStatistics();
console.log('Active leases:', stats.activeLeases);
```

## Migration from Database Service

### Before (Direct Database Service)
```javascript
import { getDatabaseClient } from '../lib/database.js';

const client = await getDatabaseClient();
const result = await client.execute('SELECT ...');
```

### After (Connection Pool Manager)
```javascript
import { acquireDbLease } from '../lib/connection-manager.js';

const lease = await acquireDbLease('operation');
try {
  const result = await lease.execute('SELECT ...');
} finally {
  lease.release();
}
```

The connection manager is fully compatible with the existing database service and can be adopted incrementally across the codebase.