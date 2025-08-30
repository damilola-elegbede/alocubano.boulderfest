# Database Reset Mechanism Guide

The database reset mechanism ensures clean, deterministic starting state for all test runs in the A Lo Cubano Boulder Fest project.

## Overview

The database reset system provides three reset modes with comprehensive safety checks:

- **Full Reset**: Drop all tables and recreate schema from migrations
- **Soft Reset**: Truncate data but preserve schema (faster)
- **Snapshot Reset**: Restore from a known good database snapshot

## Safety Features

### Environment Protection
- Only allows reset in `test` and `development` environments
- Blocks operations on production-like database URLs
- Requires explicit `TEST_DATABASE_RESET_ALLOWED=true` flag
- Multiple safety checks prevent accidental production resets

### Production URL Detection
Automatically blocks reset operations on URLs containing:
- `libsql://alocubano`
- `https://alocubano`
- `libsql://prod-`
- `https://prod-`

## Usage

### Command Line Interface

```bash
# Soft reset (default) - fastest option
npm run db:reset

# Full reset - drop and recreate all tables
npm run db:reset:full

# Restore from snapshot
npm run db:reset:snapshot

# Create baseline snapshot
npm run db:reset:baseline

# Database health check
npm run db:reset:health

# Direct script usage with options
node scripts/reset-test-database.js soft --no-seed
node scripts/reset-test-database.js full --snapshot --snapshot-name my-snapshot
node scripts/reset-test-database.js snapshot baseline-20231201
```

### Programmatic Usage

```javascript
import { resetTestDatabase, setupTestDatabase } from './scripts/reset-test-database.js';

// Quick setup for tests
await setupTestDatabase();

// Soft reset with seed data
await resetTestDatabase('soft', { seedData: true });

// Full reset with snapshot creation
await resetTestDatabase('full', { 
  createSnapshot: true, 
  snapshotName: 'after-migration.json' 
});

// Restore from specific snapshot
await resetTestDatabase('snapshot', { 
  snapshotName: 'baseline-clean.json' 
});
```

## Test Integration

### Unit Tests (Vitest)
The reset mechanism is automatically integrated with unit tests:

```javascript
// In tests/setup.js - runs automatically
import { setupTestDatabase } from '../scripts/reset-test-database.js';

// Auto-setup before unit tests
await setupTestDatabase(); // Uses soft reset for speed
```

### E2E Tests (Playwright)
Integrated with E2E global setup:

```javascript
// In tests/e2e/global-setup.js - runs before E2E suite
import { setupTestDatabase } from '../../scripts/reset-test-database.js';

await setupTestDatabase(); // Uses snapshot restore or soft reset
```

## Reset Modes Comparison

| Mode | Speed | Use Case | Schema | Data | Migrations |
|------|-------|----------|--------|------|------------|
| **Soft** | Fast | Unit tests | ✅ Preserved | ❌ Cleared | ✅ Kept |
| **Full** | Medium | Major changes | ❌ Recreated | ❌ Cleared | ✅ Re-run |
| **Snapshot** | Fast | Deterministic state | ✅ Restored | ✅ Restored | ✅ From snapshot |

## Seed Data

The reset mechanism can optionally seed deterministic test data:

### Admin Test Data
- Test admin session for admin panel testing
- Credentials from `TEST_ADMIN_PASSWORD` environment variable

### Sample Tickets
- Pre-created transactions and tickets
- QR codes for validation testing
- Multiple ticket types (weekend, saturday, sunday)

### Newsletter Subscribers
- Active and unsubscribed test subscribers
- Various consent sources and statuses

### Controlling Seed Data

```bash
# Reset without seed data
node scripts/reset-test-database.js soft --no-seed

# Reset with seed data (default)
node scripts/reset-test-database.js soft
```

## Snapshots

Snapshots provide fast restoration to known database states.

### Creating Snapshots

```bash
# Create baseline snapshot with clean schema + seed data
npm run db:reset:baseline

# Create custom snapshot
node scripts/reset-test-database.js soft --snapshot --snapshot-name my-state

# Create snapshot after specific setup
npm run db:reset:soft
# ... perform setup ...
node scripts/reset-test-database.js soft --snapshot --snapshot-name after-setup
```

### Snapshot Contents
- Complete table schemas (CREATE statements)
- All table data (limited to 10,000 rows per table for performance)
- Timestamp and environment metadata
- SHA256 checksum for integrity verification

### Snapshot Storage
- Stored in `.tmp/db-snapshots/` directory (gitignored)
- JSON format for easy inspection and debugging
- Automatic compression for large datasets

## Performance

### Benchmarks (typical times)
- **Soft Reset**: 100-500ms 
- **Full Reset**: 1-3 seconds (includes migration run)
- **Snapshot Restore**: 200-800ms (depends on data size)
- **Snapshot Creation**: 300-1000ms

### Optimization Tips
1. Use **soft reset** for unit tests (fastest)
2. Use **snapshot restore** for E2E tests (deterministic)
3. Create snapshots once, restore many times
4. Limit seed data size for faster resets

## Database Support

### SQLite (Development/Unit Tests)
- In-memory databases (`:memory:`)
- File-based databases (`file:path/to/db.sqlite`)
- Full transaction support
- Fast reset operations

### Turso (Production-like/E2E Tests)
- Remote LibSQL databases
- Authentication via `TURSO_AUTH_TOKEN`
- Network-aware timeout handling
- Production-like testing environment

## Configuration

Environment variables:

```bash
# Required for production-like testing
TURSO_DATABASE_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=your-auth-token

# Required for test environment
NODE_ENV=test
TEST_DATABASE_RESET_ALLOWED=true

# Optional - seed data credentials
TEST_ADMIN_PASSWORD=admin-test-password
ADMIN_PASSWORD=bcrypt-hashed-password
ADMIN_SECRET=jwt-signing-secret

# Optional - performance tuning
DATABASE_INIT_TIMEOUT=10000
DATABASE_TEST_STRICT_MODE=true
```

## Error Handling

### Common Issues

**"Database reset not allowed in environment"**
```bash
# Solution: Set test environment
export NODE_ENV=test
export TEST_DATABASE_RESET_ALLOWED=true
```

**"Potential production database detected"**
```bash
# Solution: Verify you're not using production database URLs
echo $TURSO_DATABASE_URL
# Should not contain: alocubano, prod-, etc.
```

**"Migration system failed"**
```bash
# Solution: Check migration files and database connectivity
npm run migrate:status
npm run db:reset:health
```

**"Snapshot not found"**
```bash
# Solution: Create baseline snapshot
npm run db:reset:baseline
```

### Debugging

Enable detailed logging:
```bash
NODE_ENV=development node scripts/reset-test-database.js soft
```

Health check:
```bash
npm run db:reset:health
```

Verify database state:
```bash
npm run migrate:status
npm run db:shell  # For SQLite
```

## Best Practices

### Test Setup
1. **Unit Tests**: Use soft reset in test setup
2. **E2E Tests**: Use snapshot restore in global setup
3. **Integration Tests**: Use full reset to ensure clean schema

### Continuous Integration
1. **Fast Feedback**: Start with soft reset
2. **Comprehensive**: Use full reset for critical pipelines
3. **Reliability**: Create snapshots in setup, restore in tests

### Development Workflow
1. **Daily Development**: Use soft reset
2. **Schema Changes**: Use full reset
3. **Test Data Changes**: Update and recreate snapshots
4. **Debugging**: Use health checks and status commands

### Snapshot Management
1. **Regular Updates**: Recreate snapshots after schema changes
2. **Version Control**: Don't commit snapshots (they're in .tmp/)
3. **Naming Convention**: Use descriptive names with dates
4. **Cleanup**: Remove old snapshots periodically

## Troubleshooting

### Performance Issues
- Use soft reset instead of full reset when possible
- Limit seed data size
- Use in-memory databases for unit tests
- Create snapshots for repeated test runs

### Connection Issues
- Verify `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`
- Check network connectivity to Turso
- Increase `DATABASE_INIT_TIMEOUT` for slow connections
- Use SQLite fallback for offline development

### Data Issues
- Verify seed data configuration
- Check migration status after reset
- Use health check to validate database state
- Inspect snapshot contents for debugging

## Integration Examples

### Vitest Global Setup
```javascript
// vitest.config.js
export default defineConfig({
  test: {
    globalSetup: ['./tests/setup.js'],
    setupFiles: ['./tests/setup.js']
  }
});
```

### Playwright Global Setup
```javascript
// playwright.config.js
export default defineConfig({
  globalSetup: require.resolve('./tests/e2e/global-setup.js'),
  globalTeardown: require.resolve('./tests/e2e/global-teardown.js')
});
```

### CI/CD Pipeline
```yaml
# GitHub Actions example
- name: Reset Test Database
  run: npm run db:reset:baseline

- name: Run Unit Tests
  run: npm test

- name: Run E2E Tests  
  run: npm run test:e2e
```

## Security Considerations

- Never run reset on production databases
- Environment variables protect against accidents
- URL pattern matching prevents production access
- Explicit flags required for dangerous operations
- Audit logging for reset operations
- Snapshot data should not contain sensitive information

## Future Enhancements

- Parallel snapshot creation for large databases
- Compressed snapshot format
- Incremental snapshot updates
- Database schema diffing
- Automatic snapshot cleanup
- Integration with test reporting
- Performance monitoring and alerts