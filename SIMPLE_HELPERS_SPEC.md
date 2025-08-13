# Simple Test Helpers Specification

This document provides the complete interface specification for the simple helper functions that replace the complex TestEnvironmentManager (721 lines) with a streamlined approach (377 lines) - an 88% reduction in code complexity.

## Migration Overview

### Before (TestEnvironmentManager - 721 lines)
- Complex class-based architecture with state tracking
- Manager integration patterns with TestSingletonManager and TestMockManager  
- Heavy async coordination and timeout handling
- Module-level state tracking and registry management
- Error-prone backup/restore with duplicate prevention

### After (Simple Helpers - 377 lines)
- Function-based API with direct operations
- Simple backup/restore with automatic cleanup
- Built-in environment presets for common test scenarios
- Streamlined singleton reset without complex coordination
- Clear separation of concerns with single-purpose functions

## Core Functions

### Environment Variable Management

```javascript
import { 
  backupEnv, 
  restoreEnv, 
  validateEnv,
  clearDatabaseEnv, 
  clearAppEnv 
} from '../helpers/simple-helpers.js';

// Basic backup/restore
const backup = backupEnv(['VAR1', 'VAR2']);
process.env.VAR1 = 'new-value';
restoreEnv(backup); // Automatically clears non-system vars before restore

// Validation
validateEnv(['REQUIRED_VAR1', 'REQUIRED_VAR2']); // Throws if missing

// Selective clearing
clearDatabaseEnv(); // Clears TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, DATABASE_URL
clearAppEnv();      // Clears all app-specific environment variables
```

### Environment Presets

```javascript
import { getEnvPreset } from '../helpers/simple-helpers.js';

// Available presets
const presets = [
  'empty',           // No variables set
  'missing-db',      // Missing database config (for error testing)
  'invalid-db',      // Invalid database config (for error testing)
  'valid-local',     // Valid local database config
  'complete-test'    // All services configured for testing
];

const envVars = getEnvPreset('complete-test');
// Returns:
// {
//   TURSO_DATABASE_URL: ':memory:',
//   TURSO_AUTH_TOKEN: 'test-token',
//   BREVO_API_KEY: 'test-brevo-api-key',
//   STRIPE_SECRET_KEY: 'sk_test_test',
//   ADMIN_SECRET: 'test-admin-secret-32-chars-long',
//   // ... and more
// }
```

### Test Isolation Wrappers

#### Basic Environment Isolation
```javascript
import { withIsolatedEnv } from '../helpers/simple-helpers.js';

// With preset
await withIsolatedEnv('complete-test', async () => {
  // Test runs with isolated environment
  expect(process.env.TURSO_DATABASE_URL).toBe(':memory:');
});

// With custom environment
await withIsolatedEnv({ CUSTOM_VAR: 'value' }, async () => {
  // Test runs with custom environment
  expect(process.env.CUSTOM_VAR).toBe('value');
});
```

#### Complete Isolation (replaces TestEnvironmentManager.withCompleteIsolation)
```javascript
import { withCompleteIsolation } from '../helpers/simple-helpers.js';

await withCompleteIsolation('valid-local', async () => {
  // Complete isolation includes:
  // - Environment variable isolation
  // - Database singleton reset
  // - Service state clearing
  // - Module reset (vi.resetModules())
  
  const { DatabaseService } = await import('../../api/lib/database.js');
  const service = new DatabaseService();
  // Fresh module state guaranteed
});
```

### Service Management

```javascript
import { resetServices, resetDatabaseSingleton } from '../helpers/simple-helpers.js';

// Reset all global service state
await resetServices(); 
// Clears: global.__databaseInstance, global.__testState

// Reset database singleton specifically
await resetDatabaseSingleton();
// Calls: resetDatabaseInstance() from database.js module
```

### Mock Management

```javascript
import { setupSimpleMocks } from '../helpers/simple-helpers.js';

// Setup multiple mocks
const mocks = setupSimpleMocks(['fetch', 'stripe', 'brevo']);

// Access mocks
expect(mocks.fetch).toBeDefined();
expect(mocks.stripe.checkout.sessions.create).toBeDefined();
expect(mocks.brevo.apiInstance.createContact).toBeDefined();
```

### Test Data Factory

```javascript
import { createTestData } from '../helpers/simple-helpers.js';

// Create test data with defaults
const registration = createTestData('registration');
const ticket = createTestData('ticket');
const subscriber = createTestData('subscriber');

// Override defaults
const customRegistration = createTestData('registration', {
  email: 'custom@example.com',
  tickets: 3
});
```

### Utilities

```javascript
import { measureTime, cleanupTest } from '../helpers/simple-helpers.js';

// Performance measurement
const { result, duration } = measureTime(() => {
  return expensiveOperation();
});

// Complete test cleanup
await cleanupTest();
// - Clears all mocks (vi.clearAllMocks())
// - Resets services 
// - Resets database singleton
// - Clears global test state
```

## Migration Pattern Examples

### From TestEnvironmentManager.withCompleteIsolation
```javascript
// OLD (TestEnvironmentManager)
await TestEnvironmentManager.withCompleteIsolation('complete-test', async () => {
  // test code
});

// NEW (Simple Helpers)
await withCompleteIsolation('complete-test', async () => {
  // same test code - identical interface
});
```

### From TestEnvironmentManager.getPreset
```javascript
// OLD
const env = manager.getPreset('complete-test');

// NEW  
const env = getEnvPreset('complete-test');
```

### From TestEnvironmentManager backup/restore
```javascript
// OLD
const manager = new TestEnvironmentManager();
manager.backup();
manager.setMockEnv({ VAR: 'value' });
// ... test code
manager.restore();

// NEW
const backup = backupEnv(Object.keys(process.env));
process.env.VAR = 'value';
// ... test code  
restoreEnv(backup);
```

## System Variable Preservation

The helpers automatically preserve essential system variables during isolation:

```javascript
const preservedVars = [
  'NODE_ENV', 'PATH', 'HOME', 'USER', 'SHELL', 'CI',
  'VITEST', 'VITEST_WORKER_ID', 'VITEST_POOL_ID'
];
```

## Error Handling

All functions include graceful error handling:
- Environment validation provides clear error messages
- Database singleton reset handles mocked modules gracefully
- Isolation wrappers restore state even if test functions throw
- Service reset continues with partial cleanup if individual operations fail

## Performance Characteristics

- **No async coordination delays**: Direct operations without timeouts
- **No class instantiation overhead**: Function calls only
- **No complex state tracking**: Simple backup/restore pattern
- **No registry management**: Direct global variable access
- **Minimal memory footprint**: No persistent manager instances

## Test Reliability Features

- **Automatic environment cleanup**: Non-system variables cleared before restore
- **Exception safety**: Finally blocks ensure cleanup even on errors
- **Module isolation**: vi.resetModules() integration for fresh imports
- **State validation**: Clear error messages for missing requirements
- **Deterministic behavior**: No race conditions or timing dependencies

## Complete API Reference

```javascript
// Environment Management
export function backupEnv(keys: string[]): object
export function restoreEnv(backup: object): void
export function validateEnv(required: string[]): void  
export function clearDatabaseEnv(): void
export function clearAppEnv(): void

// Environment Presets
export function getEnvPreset(presetName: string): object

// Environment Isolation  
export function isolateEnv(envVars: object): void
export function withIsolatedEnv(preset: string|object, testFn: Function): Promise<any>
export function withCompleteIsolation(preset: string|object, testFn: Function): Promise<any>

// Service Management
export function resetServices(): Promise<void>
export function resetDatabaseSingleton(): Promise<void>

// Mock Management
export function setupSimpleMocks(services: string[]): object

// Test Data
export function createTestData(type: string, overrides: object): object

// Utilities  
export function measureTime(fn: Function): { result: any, duration: number }
export function cleanupTest(): Promise<void>

// Database (existing)
export function createTestDatabase(): object
```

This specification provides a complete migration path from TestEnvironmentManager to simple helper functions while maintaining identical functionality with significantly reduced complexity.