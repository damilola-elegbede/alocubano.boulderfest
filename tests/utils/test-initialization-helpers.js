/**
 * Test Initialization Helpers
 * Comprehensive utilities for handling async initialization in tests
 */

import { vi } from "vitest";

export class TestInitializationHelpers {
  constructor() {
    this.initialized = false;
    this.services = new Map();
    this.cleanupTasks = [];
  }

  /**
   * Ensure all async services are initialized before tests run
   */
  async initializeServices(serviceDefinitions = {}) {
    if (this.initialized) {
      return this.services;
    }

    console.log("🔧 Initializing test services...");

    // Initialize services in dependency order
    for (const [name, definition] of Object.entries(serviceDefinitions)) {
      try {
        const service = await this.initializeService(name, definition);
        this.services.set(name, service);
        console.log(`✅ ${name} service initialized`);
      } catch (error) {
        console.error(`❌ Failed to initialize ${name}:`, error.message);
        throw new Error(`Service initialization failed: ${name}`);
      }
    }

    this.initialized = true;
    console.log("🎯 All test services initialized successfully");
    return this.services;
  }

  /**
   * Initialize individual service with proper error handling
   */
  async initializeService(name, definition) {
    const { factory, dependencies = [], timeout = 10000 } = definition;

    // Wait for dependencies
    for (const dep of dependencies) {
      await this.waitForService(dep, timeout);
    }

    // Create service with timeout
    return Promise.race([
      factory(),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`Service ${name} initialization timeout`)),
          timeout,
        ),
      ),
    ]);
  }

  /**
   * Wait for a service to become available
   */
  async waitForService(serviceName, timeout = 10000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (this.services.has(serviceName)) {
        return this.services.get(serviceName);
      }
      await this.sleep(100);
    }

    throw new Error(`Service ${serviceName} not available within timeout`);
  }

  /**
   * Wait for database to be ready
   */
  async waitForDatabase(dbService, timeout = 15000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        await dbService.execute("SELECT 1");
        return true;
      } catch (error) {
        if (Date.now() - startTime > timeout - 1000) {
          throw new Error(`Database not ready: ${error.message}`);
        }
        await this.sleep(500);
      }
    }

    return false;
  }

  /**
   * Ensure environment variables are set before initialization
   */
  setupTestEnvironment(envVars = {}) {
    const defaultEnvVars = {
      NODE_ENV: "test",
      TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL || ":memory:",
      TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN || "",
      BREVO_API_KEY: process.env.BREVO_API_KEY || "xkeysib-test123",
      BREVO_NEWSLETTER_LIST_ID: process.env.BREVO_NEWSLETTER_LIST_ID || "123",
      BREVO_WEBHOOK_SECRET:
        process.env.BREVO_WEBHOOK_SECRET || "webhook_secret_123",
    };

    Object.assign(process.env, defaultEnvVars, envVars);

    // Ensure critical environment variables exist
    const required = ["TURSO_DATABASE_URL", "BREVO_API_KEY"];
    const missing = required.filter((key) => !process.env[key]);

    if (missing.length > 0) {
      throw new Error(
        `Missing required environment variables: ${missing.join(", ")}`,
      );
    }
  }

  /**
   * Register cleanup task to run after tests
   */
  registerCleanup(cleanupFn) {
    this.cleanupTasks.push(cleanupFn);
  }

  /**
   * Execute all cleanup tasks
   */
  async cleanup() {
    console.log("🧹 Running test cleanup tasks...");

    for (const cleanup of this.cleanupTasks) {
      try {
        await cleanup();
      } catch (error) {
        console.error("Cleanup error:", error.message);
      }
    }

    this.cleanupTasks = [];
    this.services.clear();
    this.initialized = false;
  }

  /**
   * Create mock services with proper initialization patterns
   */
  createMockServices() {
    const mockDatabase = {
      execute: vi.fn().mockResolvedValue({ rows: [], lastInsertRowid: 1 }),
      close: vi.fn(),
      initialized: true,
    };

    const mockBrevoService = {
      subscribeToNewsletter: vi.fn().mockResolvedValue({ id: "brevo_123" }),
      unsubscribeContact: vi.fn().mockResolvedValue({ success: true }),
      healthCheck: vi.fn().mockResolvedValue({ status: "healthy" }),
    };

    return {
      database: mockDatabase,
      brevoService: mockBrevoService,
    };
  }

  /**
   * Wait for multiple async operations to complete
   */
  async waitForAll(promises, timeout = 10000) {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("Timeout waiting for operations")),
        timeout,
      ),
    );

    return Promise.race([Promise.all(promises), timeoutPromise]);
  }

  /**
   * Retry operation with exponential backoff
   */
  async retry(operation, maxAttempts = 3, baseDelay = 1000) {
    let lastError;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        if (attempt === maxAttempts) {
          throw error;
        }

        const delay = baseDelay * Math.pow(2, attempt - 1);
        console.log(
          `Retry attempt ${attempt} failed, retrying in ${delay}ms...`,
        );
        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Create test Express app with proper service initialization
   */
  async createTestApp(handlers = {}) {
    const express = await import("express");
    const app = express.default();

    // Middleware
    app.use(express.json());
    app.use(express.raw({ type: "application/json" }));

    // Wait for services to be ready
    await this.waitForService("database", 15000);

    // Add routes
    Object.entries(handlers).forEach(([route, handler]) => {
      const [method, path] = route.split(" ");
      app[method.toLowerCase()](path, handler);
    });

    return app;
  }

  /**
   * Validate test prerequisites
   */
  validatePrerequisites() {
    const checks = [
      {
        name: "Environment Variables",
        check: () =>
          process.env.TURSO_DATABASE_URL && process.env.BREVO_API_KEY,
      },
      {
        name: "Node.js Version",
        check: () => process.versions.node >= "18.0.0",
      },
    ];

    const failures = checks.filter((check) => !check.check());

    if (failures.length > 0) {
      throw new Error(
        `Test prerequisites not met: ${failures.map((f) => f.name).join(", ")}`,
      );
    }
  }
}

// Export singleton instance
export const testInit = new TestInitializationHelpers();

// Export helper functions
export async function withInitializedServices(serviceDefinitions, testFn) {
  const helpers = new TestInitializationHelpers();

  try {
    helpers.setupTestEnvironment();
    helpers.validatePrerequisites();
    const services = await helpers.initializeServices(serviceDefinitions);
    return await testFn(services);
  } finally {
    await helpers.cleanup();
  }
}

export async function waitForAsyncInit(initFn, timeout = 10000) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const result = await initFn();
      if (result) return result;
    } catch (error) {
      if (Date.now() - startTime > timeout - 1000) {
        throw new Error(`Async initialization failed: ${error.message}`);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error("Async initialization timeout");
}
