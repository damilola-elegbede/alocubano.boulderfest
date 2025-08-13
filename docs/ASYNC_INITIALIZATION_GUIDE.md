# Async Initialization Guide

<guide-metadata>
  <title>Promise-Based Singleton Patterns and Async Initialization</title>
  <scope>Production code patterns and best practices</scope>
  <audience>Developers implementing services and database connections</audience>
  <complexity>Intermediate to Advanced</complexity>
</guide-metadata>

## Overview

<problem-statement priority="critical">
  <challenge>Async services need initialization before use, creating potential race conditions</challenge>
  <impact>Multiple concurrent requests could trigger duplicate initialization</impact>
  <solution>Promise-based singleton pattern ensures single initialization</solution>
</problem-statement>

This guide covers the async initialization patterns used throughout the A Lo Cubano Boulder Fest codebase, focusing on the **Promise-Based Lazy Singleton Pattern** that prevents race conditions and ensures reliable service initialization.

## Core Problem

Traditional singleton patterns fail with async initialization:

```javascript
// ❌ BROKEN: Race condition possible
class DatabaseService {
  constructor() {
    this.client = null;
    this.initialized = false;
  }

  async initialize() {
    if (!this.initialized) {
      // Multiple calls can reach here simultaneously
      this.client = await createClient();
      this.initialized = true;
    }
    return this.client;
  }
}
```

**Problems:**

- Multiple concurrent calls can trigger duplicate initialization
- No guarantee of single instance creation
- Potential for undefined behavior during initialization

## Solution: Promise-Based Lazy Singleton

<implementation-pattern name="promise-singleton">
  <description>Caches initialization promise, not just the result</description>
  <benefits>
    <benefit>Eliminates race conditions</benefit>
    <benefit>Ensures single initialization attempt</benefit>
    <benefit>Handles failures gracefully</benefit>
  </benefits>
</implementation-pattern>

### Pattern Implementation

```javascript
class AsyncService {
  constructor() {
    this.instance = null;
    this.initialized = false;
    this.initializationPromise = null; // Key: Cache the promise
  }

  async ensureInitialized() {
    // Fast path: already initialized
    if (this.initialized && this.instance) {
      return this.instance;
    }

    // If initialization is in progress, return existing promise
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    // Start new initialization
    this.initializationPromise = this._performInitialization();

    try {
      const result = await this.initializationPromise;
      return result;
    } catch (error) {
      // Clear failed promise so next call can retry
      this.initializationPromise = null;
      throw error;
    }
  }

  async _performInitialization() {
    // Actual initialization logic
    const instance = await createInstance();
    this.instance = instance;
    this.initialized = true;
    return this.instance;
  }
}
```

## Database Service Implementation

<service-implementation component="database">
  <file>api/lib/database.js</file>
  <pattern>Promise-based lazy singleton with retry logic</pattern>
</service-implementation>

The `DatabaseService` class implements this pattern with additional features:

### Key Features

```javascript
class DatabaseService {
  constructor() {
    this.client = null;
    this.initialized = false;
    this.initializationPromise = null;
    this.maxRetries = 3;
    this.retryDelay = 1000;
  }

  async ensureInitialized() {
    if (this.initialized && this.client) {
      return this.client; // Fast path
    }

    if (this.initializationPromise) {
      return this.initializationPromise; // Wait for existing
    }

    this.initializationPromise = this._initializeWithRetry();

    try {
      return await this.initializationPromise;
    } catch (error) {
      this.initializationPromise = null; // Enable retry
      throw error;
    }
  }

  async _initializeWithRetry(retryCount = 0) {
    try {
      return await this._performInitialization();
    } catch (error) {
      if (retryCount < this.maxRetries) {
        const delay = this.retryDelay * Math.pow(2, retryCount);
        await this._delay(delay);
        return this._initializeWithRetry(retryCount + 1);
      }
      throw error;
    }
  }
}
```

### Enhancement: Retry Logic

<retry-strategy>
  <approach>Exponential backoff with maximum attempts</approach>
  <parameters>
    <max-retries>3 attempts</max-retries>
    <base-delay>1000ms</base-delay>
    <backoff>Exponential (1s, 2s, 4s)</backoff>
  </parameters>
  <use-cases>Network failures, temporary database unavailability</use-cases>
</retry-strategy>

```javascript
async _initializeWithRetry(retryCount = 0) {
  try {
    return await this._performInitialization();
  } catch (error) {
    if (retryCount < this.maxRetries) {
      const delay = this.retryDelay * Math.pow(2, retryCount);
      console.warn(`Init failed, retrying in ${delay}ms (${retryCount + 1}/${this.maxRetries})`);
      await this._delay(delay);
      return this._initializeWithRetry(retryCount + 1);
    }
    throw error;
  }
}
```

## Service Factory Pattern

<factory-pattern>
  <purpose>Provide global access while maintaining singleton behavior</purpose>
  <implementation>Module-level instance management</implementation>
</factory-pattern>

```javascript
// Singleton instance management
let databaseServiceInstance = null;

export function getDatabase() {
  if (!databaseServiceInstance) {
    databaseServiceInstance = new DatabaseService();
  }
  return databaseServiceInstance;
}

export async function getDatabaseClient() {
  const service = getDatabase();
  return await service.getClient();
}
```

### Usage in Production Code

<usage-examples>
  <scenario>API endpoint requiring database access</scenario>
  <scenario>Service initialization in serverless functions</scenario>
  <scenario>Health checks and monitoring</scenario>
</usage-examples>

```javascript
// In API endpoints
import { getDatabaseClient } from "./lib/database.js";

export default async function handler(req, res) {
  try {
    // Guaranteed initialized client
    const client = await getDatabaseClient();
    const result = await client.execute("SELECT * FROM tickets");
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: "Database unavailable" });
  }
}
```

## Migration Guide for Existing Code

<migration-guide>
  <from>Traditional sync singleton or manual initialization</from>
  <to>Promise-based lazy singleton</to>
  <complexity>Medium - requires async/await updates</complexity>
</migration-guide>

### Step 1: Identify Current Pattern

```javascript
// ❌ BEFORE: Sync singleton
class OldService {
  constructor() {
    this.instance = this.createInstance(); // Sync
  }

  getInstance() {
    return this.instance;
  }
}

// ❌ BEFORE: Manual async init
class OldAsyncService {
  constructor() {
    this.instance = null;
  }

  async init() {
    if (!this.instance) {
      this.instance = await createInstance();
    }
  }
}
```

### Step 2: Apply Promise-Based Pattern

```javascript
// ✅ AFTER: Promise-based lazy singleton
class NewService {
  constructor() {
    this.instance = null;
    this.initialized = false;
    this.initializationPromise = null;
  }

  async ensureInitialized() {
    if (this.initialized && this.instance) {
      return this.instance;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._performInitialization();

    try {
      return await this.initializationPromise;
    } catch (error) {
      this.initializationPromise = null;
      throw error;
    }
  }

  async _performInitialization() {
    const instance = await createInstance();
    this.instance = instance;
    this.initialized = true;
    return instance;
  }
}
```

### Step 3: Update Service Usage

```javascript
// ❌ BEFORE: Manual initialization
const service = new OldAsyncService();
await service.init();
const result = service.getInstance().doSomething();

// ✅ AFTER: Lazy initialization
const service = new NewService();
const instance = await service.ensureInitialized();
const result = instance.doSomething();
```

## Best Practices

<best-practices>
  <practice priority="high">Always cache the initialization promise, not just the result</practice>
  <practice priority="high">Clear failed promises to enable retry attempts</practice>
  <practice priority="medium">Implement exponential backoff for retry logic</practice>
  <practice priority="medium">Use fast-path checks for already initialized instances</practice>
  <practice priority="low">Add comprehensive logging for debugging initialization issues</practice>
</best-practices>

### 1. Fast-Path Optimization

```javascript
async ensureInitialized() {
  // Check both flags for maximum performance
  if (this.initialized && this.instance) {
    return this.instance; // Immediate return, no async overhead
  }

  // Continue with async initialization
  if (this.initializationPromise) {
    return this.initializationPromise;
  }

  // ... rest of logic
}
```

### 2. Error Handling Strategy

```javascript
async ensureInitialized() {
  // ... initialization logic ...

  try {
    const result = await this.initializationPromise;
    return result;
  } catch (error) {
    // Critical: Clear failed promise
    this.initializationPromise = null;

    // Log for debugging
    console.error('Service initialization failed:', {
      error: error.message,
      timestamp: new Date().toISOString()
    });

    throw error;
  }
}
```

### 3. Health Checking

<health-checks>
  <purpose>Verify service availability and configuration</purpose>
  <implementation>Simple connectivity tests with error reporting</implementation>
</health-checks>

```javascript
async healthCheck() {
  try {
    const instance = await this.ensureInitialized();

    // Perform basic functionality test
    const result = await instance.ping();

    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      details: result
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}
```

## Common Pitfalls

<common-pitfalls>
  <pitfall severity="critical">
    <problem>Not caching the initialization promise</problem>
    <result>Race conditions and duplicate initialization</result>
    <solution>Always cache `initializationPromise`</solution>
  </pitfall>
  <pitfall severity="high">
    <problem>Not clearing failed promises</problem>
    <result>Permanent initialization failure</result>
    <solution>Set `initializationPromise = null` on error</solution>
  </pitfall>
  <pitfall severity="medium">
    <problem>Exposing sensitive config in error messages</problem>
    <result>Security vulnerabilities in logs</result>
    <solution>Sanitize error messages before logging</solution>
  </pitfall>
</common-pitfalls>

### Race Condition Example

```javascript
// ❌ BROKEN: Multiple init attempts possible
async badInitialization() {
  if (!this.initialized) {
    // Gap here allows race conditions
    this.instance = await createInstance();
    this.initialized = true;
  }
  return this.instance;
}

// ✅ CORRECT: Single init attempt guaranteed
async goodInitialization() {
  if (this.initializationPromise) {
    return this.initializationPromise; // Reuse existing promise
  }

  this.initializationPromise = this._performInit();
  return this.initializationPromise;
}
```

## Environment Considerations

<environment-config>
  <development>Use local databases, shorter timeouts</development>
  <testing>Mock services, synchronous initialization where possible</testing>
  <production>Remote databases, robust retry logic, comprehensive logging</production>
</environment-config>

### Development Environment

```javascript
// Environment-specific configuration
const config = {
  maxRetries: process.env.NODE_ENV === "development" ? 1 : 3,
  retryDelay: process.env.NODE_ENV === "development" ? 500 : 1000,
  timeout: process.env.NODE_ENV === "development" ? 5000 : 10000,
};
```

### Testing Environment

```javascript
// Test-friendly initialization with mocks
async _performInitialization() {
  if (process.env.NODE_ENV === 'test') {
    // Use mock instance for testing
    return mockInstance;
  }

  return await createRealInstance();
}
```

## Monitoring and Observability

<monitoring-strategy>
  <metrics>Initialization time, failure rate, retry attempts</metrics>
  <alerts>Failed initializations, excessive retry attempts</alerts>
  <logging>Structured logs with timing and context</logging>
</monitoring-strategy>

### Instrumented Implementation

```javascript
async _performInitialization() {
  const startTime = Date.now();

  try {
    console.log('Service initialization started');

    const instance = await createInstance();
    const duration = Date.now() - startTime;

    console.log('Service initialization completed', {
      duration,
      timestamp: new Date().toISOString()
    });

    this.instance = instance;
    this.initialized = true;

    return instance;
  } catch (error) {
    const duration = Date.now() - startTime;

    console.error('Service initialization failed', {
      error: error.message,
      duration,
      timestamp: new Date().toISOString()
    });

    throw error;
  }
}
```

## Performance Considerations

<performance-notes>
  <initialization>Front-load expensive operations during app startup</initialization>
  <caching>Cache results aggressively once initialized</caching>
  <monitoring>Track initialization times and optimize bottlenecks</monitoring>
</performance-notes>

### Lazy vs. Eager Initialization

```javascript
// Lazy: Initialize on first use (recommended for most cases)
class LazyService {
  async ensureInitialized() {
    // Initialize only when needed
    if (!this.initializationPromise) {
      this.initializationPromise = this._performInit();
    }
    return this.initializationPromise;
  }
}

// Eager: Initialize immediately (for critical services)
class EagerService {
  constructor() {
    this.initializationPromise = this._performInit();
  }

  async ensureInitialized() {
    return this.initializationPromise;
  }
}
```

## Next Steps

<next-steps>
  <immediate>Apply pattern to existing services with race conditions</immediate>
  <short-term>Add comprehensive monitoring and alerting</short-term>
  <long-term>Consider service mesh patterns for complex initialization chains</long-term>
</next-steps>

1. **Audit existing services** for race condition vulnerabilities
2. **Implement health checks** for all async services
3. **Add retry logic** with exponential backoff
4. **Set up monitoring** for initialization metrics
5. **Create alerting** for persistent initialization failures

## Related Documentation

<related-docs>
  <doc>/tests/README_TEST_PATTERNS.md</doc>
  <doc>/docs/development/TESTING_STRATEGY.md</doc>
  <doc>/docs/api/API_DOCUMENTATION.md</doc>
</related-docs>

---

_For testing patterns and async initialization in tests, see [Test Patterns Guide](/tests/README_TEST_PATTERNS.md)._
