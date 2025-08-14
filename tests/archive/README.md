# Test Infrastructure Archive

This directory contains test infrastructure files that have been superseded by the simplified test helper system implemented in Phase 2.4-2.6.

## Archived Files

### test-initialization-orchestrator.js (515 lines)
**Archived**: 2025-08-14  
**Reason**: Replaced by `tests/helpers/setup.js` (~170 lines)  
**Status**: DEPRECATED - Use `setupTest()` and `teardownTest()` instead

Complex orchestration system with:
- Comprehensive initialization sequence
- Service dependency management  
- Transaction stacking
- Environment snapshots
- Mock registry management

**Migration Path**: Use `setupTest(options)` from `tests/helpers/setup.js`

### enhanced-test-setup.js (376 lines)
**Archived**: 2025-08-14  
**Reason**: Replaced by `tests/helpers/setup.js` and `tests/helpers/index.js`  
**Status**: DEPRECATED - Use new helper functions

Enhanced setup patterns for integration tests with:
- Complex service initialization
- Database helper integration
- API test configuration
- Isolated test environments

**Migration Path**: Use `setupIntegrationTest()` or `apiTestSetup()` from `tests/helpers/index.js`

### database-test-utils.js (500+ lines estimated)
**Archived**: 2025-08-14  
**Reason**: Replaced by `tests/helpers/db.js` (~180 lines)  
**Status**: UNUSED - No active references found

Database test management with:
- Database isolation
- Test helpers
- Transaction management
- SQLite and Turso support

**Migration Path**: Use database functions from `tests/helpers/db.js`

### test-database-fix.js
**Archived**: 2025-08-14  
**Reason**: One-off verification script, no longer needed  
**Status**: OBSOLETE - Was used for database architecture verification

Integration test script for database architecture validation.

### verify-database-fix.js  
**Archived**: 2025-08-14  
**Reason**: One-off verification script, no longer needed  
**Status**: OBSOLETE - Was used for database architecture verification

Verification script for database access patterns.

## Replacement System

The new simplified system consists of:

1. **`tests/helpers/setup.js`** - Main setup/teardown functions
2. **`tests/helpers/db.js`** - Database test utilities  
3. **`tests/helpers/mocks.js`** - Service mocking
4. **`tests/helpers/simple-helpers.js`** - Environment and utilities
5. **`tests/helpers/index.js`** - Consolidated exports

## Key Improvements

- **Reduced complexity**: ~2000+ lines → ~800 lines total
- **Direct function calls**: No orchestration overhead
- **Predictable behavior**: Simple, linear execution
- **Better debugging**: Clear error messages and flow
- **Easier maintenance**: Modular, focused responsibilities

## Usage Examples

### Old Pattern (Orchestrator)
```javascript
import { testOrchestrator } from '../utils/test-initialization-orchestrator.js';

const context = await testOrchestrator.setupTest();
// ... test logic
await context.cleanup(); // or teardownTest(context) from the orchestrator
```

### New Pattern (Simplified)
```javascript
import { setupTest, teardownTest } from '../helpers/index.js';

const setup = await setupTest({ database: true, mocks: ['brevo'] });
// ... test logic  
await teardownTest(setup);
```

### Convenience Functions
```javascript
import { quickSetup, integrationSetup, apiTestSetup } from '../helpers/index.js';

// Most common pattern
const setup = await quickSetup();

// Integration tests
const setup = await integrationSetup();

// API tests with all services mocked
const setup = await apiTestSetup();
```

## Recovery Instructions

If you need to restore any of these files temporarily:

1. Copy the file from this archive back to its original location
2. Update any import paths as needed
3. File a bug report explaining why the new system doesn't meet your needs
4. Plan migration strategy to new helpers

## Archive Maintenance

These files should be deleted after:
- All tests confirm working with new system (✅ completed)
- 30-day observation period (target: 2025-09-14)
- No regression reports filed

## Related Documentation

- [Testing Strategy](/docs/testing/TESTING_STRATEGY.md)
- [Phase 2.4-2.6 Migration Summary](/MIGRATION_SUMMARY.md)
- [Test Infrastructure Metrics](/docs/infrastructure-metrics.json)
- [Cleanup Summary](./CLEANUP_SUMMARY.md)