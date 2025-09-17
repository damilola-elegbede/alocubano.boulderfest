# Enterprise Feature E2E Tests

These tests validate enterprise-grade database features in a production-like environment with real Turso database connections.

## Prerequisites

- Requires Vercel Preview Deployment with Turso database
- Enterprise features must be ENABLED (FEATURE_ENABLE_CONNECTION_POOL=true)
- Only runs in E2E test environment with real production infrastructure

## Test Coverage

### database-reliability.test.js
- Circuit breaker functionality
- Connection pool management
- Failure recovery scenarios
- State machine transitions

### enterprise-database-integration.test.js
- Enterprise database service integration
- Connection manager behavior
- Resource cleanup and leak prevention

### migration-system-enterprise.test.js
- Enterprise-grade migration execution
- Connection pool usage during migrations
- Migration rollback with state management

## Running These Tests

These tests are automatically run as part of the E2E test suite:

```bash
npm run test:e2e
```

They will be skipped if enterprise features are disabled.