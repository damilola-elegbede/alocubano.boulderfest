/**
 * Database Client Module
 * Handles LibSQL database connections and provides connection management
 * Supports both Node.js and Edge runtime environments
 */

import { logger } from './logger.js';

// Create a LibSQL-compatible wrapper for better-sqlite3 (unit tests only)
async function createSQLiteWrapper() {
  try {
    const { default: Database } = await import('better-sqlite3');

    // Return a factory function that creates LibSQL-compatible client
    return function createClient(config) {
      // Use the URL directly (already normalized to :memory: by test config)
      const db = new Database(config.url, {
        // No memory option in v7+ - just pass the URL
        verbose: process.env.DEBUG === 'true' ? console.log : null
      });

      // Apply pragmas for better concurrency (WAL mode, busy timeout, etc.)
      if (config.pragmas && Array.isArray(config.pragmas)) {
        for (const pragma of config.pragmas) {
          try {
            db.exec(pragma);
          } catch (error) {
            console.warn(`Failed to apply pragma: ${pragma}`, error.message);
          }
        }
      }

      // Create LibSQL-compatible wrapper
      const wrapper = {
        closed: false,

        // LibSQL-compatible execute method
        execute: async (sql, params = []) => {
          try {
            // Handle both string queries and object format
            const query = typeof sql === 'string' ? sql : sql.sql;
            const values = typeof sql === 'string' ? params : sql.args || [];

            // Determine if it's a SELECT query (including CTEs)
            const queryUpper = query.trim().toUpperCase();
            const isSelect = queryUpper.startsWith('SELECT') ||
                             queryUpper.startsWith('WITH') ||
                             queryUpper.startsWith('EXPLAIN');

            if (isSelect) {
              const stmt = db.prepare(query);
              const rows = stmt.all(...values);
              return {
                rows,
                columns: rows.length > 0 ? Object.keys(rows[0]) : [],
                rowsAffected: 0,
                lastInsertRowid: null
              };
            } else {
              const stmt = db.prepare(query);
              const result = stmt.run(...values);
              return {
                rows: [],
                columns: [],
                rowsAffected: result.changes,
                lastInsertRowid: result.lastInsertRowid
              };
            }
          } catch (error) {
            // Wrap error to match LibSQL error format
            const wrappedError = new Error(error.message);
            wrappedError.code = error.code || 'SQLITE_ERROR';
            throw wrappedError;
          }
        },

        // LibSQL-compatible batch method
        batch: async (statements) => {
          const results = [];
          for (const stmt of statements) {
            results.push(await wrapper.execute(stmt));
          }
          return results;
        },

        // Close method
        close: () => {
          if (!db.open) return;
          db.close();
          wrapper.closed = true;
        }
      };

      return wrapper;
    };
  } catch (error) {
    logger.warn('Failed to load better-sqlite3 for unit tests:', error.message);
    throw error;
  }
}

// Dynamic import based on environment for LibSQL client compatibility
async function importLibSQLClient() {
  // Check if this is a test that needs SQLite (unit or integration)
  const isUnitTest = process.env.UNIT_ONLY_MODE === 'true' ||
                     (process.env.NODE_ENV === 'test' &&
                      process.env.DATABASE_URL?.includes('memory'));

  const isIntegrationTest = process.env.INTEGRATION_TEST_MODE === 'true' ||
                            process.env.TEST_TYPE === 'integration' ||
                            process.env.DATABASE_URL === ':memory:';

  if (isUnitTest || isIntegrationTest) {
    // Use better-sqlite3 wrapper for both unit and integration tests (no native binary issues)
    logger.log('Using SQLite wrapper for tests (unit or integration)');
    return createSQLiteWrapper();
  }

  try {
    // Check if we're in a Node.js environment
    if (
      typeof process !== "undefined" &&
      process.versions &&
      process.versions.node
    ) {
      // Use Node.js client
      const { createClient } = await import("@libsql/client");
      return createClient;
    } else {
      // Use Web/Edge client
      const { createClient } = await import("@libsql/client/web");
      return createClient;
    }
  } catch (error) {
    logger.warn(
      "Failed to import LibSQL client, falling back to web client:",
      error.message,
    );
    // Fallback to web client
    const { createClient } = await import("@libsql/client/web");
    return createClient;
  }
}

class DatabaseService {
  constructor() {
    this.client = null;
    this.initialized = false;
    this.initializationPromise = null;
    this.maxRetries = 2; // Reduced retries for faster failures
    this.retryDelay = 500; // Reduced to 0.5 seconds for faster recovery
    this.activeConnections = new Set(); // Track active connections
    this.isClosing = false; // Prevent operations during shutdown
    this.connectionId = 0; // Track connection instances
    this.lastActivity = Date.now(); // Track last activity for connection recycling
    this.connectionMaxAge = 3 * 60 * 1000; // Reduced to 3 minutes for serverless
    this.connectionRecycleTimer = null; // Timer for connection recycling
    this.connectionPool = new Map(); // Connection pooling for serverless
    this.healthCheckCache = { result: null, timestamp: 0, ttl: 30000 }; // 30s cache
  }

  /**
   * Ensure database client is initialized with promise-based lazy singleton pattern
   * @returns {Promise<Object>} The raw LibSQL client instance
   */
  async ensureInitialized() {
    // Reject operations during shutdown to prevent race conditions
    if (this.isClosing) {
      throw new Error("Database service is shutting down - no new operations allowed");
    }

    // Check if connection needs recycling (for Vercel serverless)
    const isVercel = process.env.VERCEL === "1";
    if (isVercel && this.initialized && this.client) {
      const connectionAge = Date.now() - this.lastActivity;
      if (connectionAge > this.connectionMaxAge) {
        logger.log("Connection age exceeded, recycling connection...");
        await this._recycleConnection();
      }
    }

    // CRITICAL FIX: Validate existing client is still open before returning
    if (this.initialized && this.client) {
      const isValid = await this._validateConnection();
      if (isValid) {
        this.lastActivity = Date.now(); // Update last activity
        this._scheduleConnectionRecycle(); // Schedule future recycle
        return this.client; // ALWAYS return the raw client
      } else {
        // Connection is closed, force reinitialization
        logger.warn("Database connection closed unexpectedly, reinitializing...");
        this.initialized = false;
        this.client = null;
        this.initializationPromise = null;
      }
    }

    // If initialization is already in progress, return the existing promise
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    // Start new initialization with timeout protection
    this.initializationPromise = Promise.race([
      this._initializeWithRetry(),
      this._createTimeoutPromise()
    ]);

    try {
      const client = await this.initializationPromise;
      return client; // ALWAYS return the raw client
    } catch (error) {
      // Clear the failed promise so next call can retry
      this.initializationPromise = null;
      throw error;
    }
  }

  /**
   * Validate that the database connection is still open and functional
   * @returns {Promise<boolean>} True if connection is valid, false if closed
   */
  async _validateConnection() {
    if (!this.client) {
      return false;
    }

    try {
      // Check if connection has a closed property
      if (this.client.closed === true) {
        return false;
      }

      // Try a simple query to verify connection is functional
      await this.client.execute("SELECT 1");
      return true;
    } catch (error) {
      // Connection is likely closed or invalid
      if (error.message?.includes('CLIENT_CLOSED') ||
          error.message?.includes('closed') ||
          error.code === 'CLIENT_CLOSED') {
        return false;
      }

      // For other errors, assume connection is still valid but there's a different issue
      logger.warn("Connection validation error (assuming valid):", error.message);
      return true;
    }
  }

  /**
   * Create a timeout promise to prevent hanging during initialization
   */
  _createTimeoutPromise() {
    // Optimized timeout for serverless environments - shorter for faster failures
    const isVercel = process.env.VERCEL === "1";
    const isTest = process.env.NODE_ENV === "test";

    // Much shorter timeouts for better serverless performance
    let defaultTimeout;
    if (isTest) {
      defaultTimeout = 5000; // 5s for tests
    } else if (isVercel) {
      defaultTimeout = 15000; // Reduced from 30s to 15s for Vercel
    } else {
      defaultTimeout = 10000; // 10s for other environments
    }

    const timeoutMs = process.env.DATABASE_INIT_TIMEOUT || defaultTimeout;

    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Database initialization timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    });
  }

  /**
   * Initialize database client with retry logic
   * PERFORMANCE: Skip migrations in unit test mode for speed
   */
  async _initializeWithRetry(retryCount = 0) {
    try {
      return await this._performInitialization();
    } catch (error) {
      if (retryCount < this.maxRetries) {
        logger.warn(
          `Database initialization failed, retrying... (attempt ${retryCount + 1}/${this.maxRetries})`,
        );
        await this._delay(this.retryDelay * Math.pow(2, retryCount)); // Exponential backoff
        return this._initializeWithRetry(retryCount + 1);
      }
      throw error;
    }
  }

  /**
   * Perform the actual database initialization
   */
  async _performInitialization() {
    // Detect environment context - simplified and more reliable
    const isVercelProduction = process.env.VERCEL === "1" && process.env.VERCEL_ENV === "production";
    const isVercelPreview = process.env.VERCEL === "1" && process.env.VERCEL_ENV === "preview";
    const isVercel = process.env.VERCEL === "1";
    const isDevelopment = process.env.NODE_ENV === "development" && !isVercel;
    const isTest = process.env.NODE_ENV === "test";
    const isCI = process.env.CI === "true";

    // Simplified E2E test detection - only for actual E2E test runs
    const isIntegrationTest = process.env.INTEGRATION_TEST_MODE === "true" || process.env.TEST_TYPE === "integration";
    const isE2ETest = process.env.E2E_TEST_MODE === "true" || process.env.PLAYWRIGHT_BROWSER;

    // NOTE: Test isolation mode is now handled at the getDatabaseClient() level
    // This ensures consistent behavior across all database access patterns

    // Log environment detection for debugging
    logger.log(`🔍 Environment detection:`, {
      isVercelProduction,
      isVercelPreview,
      isVercel,
      isDevelopment,
      isTest,
      isCI,
      isIntegrationTest,
      isE2ETest,
      VERCEL_ENV: process.env.VERCEL_ENV,
      NODE_ENV: process.env.NODE_ENV
    });

    let databaseUrl;
    // Clean and normalize auth token (remove any quotes)
    let authToken = process.env.TURSO_AUTH_TOKEN;
    if (authToken) {
      authToken = authToken.replace(/^["']|["']$/g, '').trim();
    }

    // Helper function to clean database URL (remove any surrounding quotes)
    const cleanDatabaseUrl = (url) => {
      if (!url) return url;
      return url.replace(/^["']|["']$/g, '').trim();
    };

    // Database URL selection logic - simplified and clearer
    // CRITICAL FIX: Check integration tests FIRST, before E2E tests
    // Integration tests may temporarily set E2E_TEST_MODE=true to test MFA bypass behavior,
    // but they should ALWAYS use local SQLite, never Turso
    if (isIntegrationTest || (isTest && !isVercel)) {
      // Unit and Integration tests (local only) can use DATABASE_URL (SQLite files)
      databaseUrl = cleanDatabaseUrl(process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL);

      if (!databaseUrl || databaseUrl.trim() === "") {
        const error = new Error("DATABASE_URL environment variable is required for unit/integration tests");
        error.code = "DB_CONFIG_ERROR";
        error.context = "unit-integration-tests";
        throw error;
      }

      // For tests, prefer SQLite for speed and isolation
      if (databaseUrl.startsWith("libsql://") || databaseUrl.startsWith("https://")) {
        logger.log(`⚠️ Test using remote database - consider using local SQLite for speed: ${databaseUrl.substring(0, 30)}...`);
      } else {
        logger.log(`✅ Using SQLite database for tests: ${databaseUrl}`);
      }

    } else if (isE2ETest) {
      // Real E2E tests (Playwright) MUST use Turso
      databaseUrl = cleanDatabaseUrl(process.env.TURSO_DATABASE_URL);

      if (!databaseUrl || databaseUrl.trim() === "") {
        const error = new Error("❌ FATAL: TURSO_DATABASE_URL secret not configured");
        error.code = "DB_CONFIG_ERROR";
        error.context = "e2e-tests";
        throw error;
      }

      // Validate that E2E tests use actual Turso URLs
      if (!databaseUrl.startsWith("libsql://") && !databaseUrl.startsWith("https://")) {
        const error = new Error("E2E tests must use Turso database - local file or memory databases not allowed");
        error.code = "DB_CONFIG_ERROR";
        error.context = "e2e-tests-turso-required";
        throw error;
      }

      logger.log(`✅ Using Turso database for E2E tests: ${databaseUrl.substring(0, 30)}...`);

    } else if (isDevelopment) {
      // Local development and vercel dev: Require Turso database
      databaseUrl = cleanDatabaseUrl(process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL);

      if (!databaseUrl || databaseUrl.trim() === "") {
        const error = new Error("❌ FATAL: TURSO_DATABASE_URL not configured. Run 'vercel env pull' to sync environment variables from Vercel Dashboard.");
        error.code = "DB_CONFIG_ERROR";
        error.context = "development";
        throw error;
      }

      logger.log(`✅ Using Turso database for development: ${databaseUrl.substring(0, 30)}...`);

    } else if (isVercelProduction) {
      // Vercel production: Require Turso
      databaseUrl = cleanDatabaseUrl(process.env.TURSO_DATABASE_URL);

      if (!databaseUrl || databaseUrl.trim() === "") {
        const error = new Error("❌ FATAL: TURSO_DATABASE_URL secret not configured");
        error.code = "DB_CONFIG_ERROR";
        error.context = "vercel-production";
        throw error;
      }

      logger.log(`✅ Using Turso database for Vercel production: ${databaseUrl.substring(0, 30)}...`);

    } else if (isVercelPreview) {
      // Vercel preview deployments: Require Turso
      databaseUrl = cleanDatabaseUrl(process.env.TURSO_DATABASE_URL);

      if (!databaseUrl || databaseUrl.trim() === "") {
        const error = new Error("❌ FATAL: TURSO_DATABASE_URL secret not configured");
        error.code = "DB_CONFIG_ERROR";
        error.context = "vercel-preview";
        throw error;
      }

      logger.log(`✅ Using Turso database for Vercel preview: ${databaseUrl.substring(0, 30)}...`);

    } else if (isVercel) {
      // Generic Vercel deployment: Require Turso
      databaseUrl = cleanDatabaseUrl(process.env.TURSO_DATABASE_URL);

      if (!databaseUrl || databaseUrl.trim() === "") {
        const error = new Error("❌ FATAL: TURSO_DATABASE_URL secret not configured");
        error.code = "DB_CONFIG_ERROR";
        error.context = "vercel-generic";
        throw error;
      }

      logger.log(`✅ Using Turso database for Vercel deployment: ${databaseUrl.substring(0, 30)}...`);

    } else {
      // Any other production-like environment: Require Turso
      databaseUrl = cleanDatabaseUrl(process.env.TURSO_DATABASE_URL);

      if (!databaseUrl || databaseUrl.trim() === "") {
        const error = new Error("❌ FATAL: TURSO_DATABASE_URL secret not configured");
        error.code = "DB_CONFIG_ERROR";
        error.context = "generic-production";
        throw error;
      }

      logger.log(`✅ Using Turso database for production environment: ${databaseUrl.substring(0, 30)}...`);
    }

    const config = {
      url: databaseUrl,
    };

    // Add auth token if provided (not needed for :memory: databases)
    if (authToken && databaseUrl !== ":memory:") {
      config.authToken = authToken;
      logger.log(`✅ Using auth token for remote database connection`);
    } else if (!authToken && databaseUrl !== ":memory:" && !databaseUrl.startsWith("file:")) {
      // Auth token is required for remote Turso databases - FAIL IMMEDIATELY
      if (isE2ETest) {
        const error = new Error("❌ FATAL: TURSO_AUTH_TOKEN secret not configured");
        error.code = "DB_AUTH_ERROR";
        error.context = "e2e-tests";
        throw error;
      } else if (isIntegrationTest) {
        const error = new Error("❌ FATAL: TURSO_AUTH_TOKEN secret not configured - integration tests should not use remote databases");
        error.code = "DB_AUTH_ERROR";
        error.context = "integration-tests";
        throw error;
      } else if (isVercelProduction || isVercelPreview || isVercel) {
        // All Vercel deployments require auth tokens for remote databases
        const error = new Error("❌ FATAL: TURSO_AUTH_TOKEN secret not configured");
        error.code = "DB_AUTH_ERROR";
        error.context = "vercel-deployment";
        throw error;
      } else if (isDevelopment) {
        const error = new Error("❌ FATAL: TURSO_AUTH_TOKEN secret not configured");
        error.code = "DB_AUTH_ERROR";
        error.context = "development";
        throw error;
      } else {
        // For any other production-like environment, fail immediately
        const error = new Error("❌ FATAL: TURSO_AUTH_TOKEN secret not configured");
        error.code = "DB_AUTH_ERROR";
        error.context = "production";
        throw error;
      }
    } else if (databaseUrl.startsWith("file:") || databaseUrl === ":memory:") {
      logger.log(`✅ Using local database (no auth token required): ${databaseUrl}`);
    }

    // Add SQLite-specific configuration for busy timeout and WAL mode
    // WAL mode only applies to file-backed databases, not :memory: databases
    if (databaseUrl.startsWith("file:")) {
      config.pragmas = [
        "PRAGMA foreign_keys = ON", // Enable foreign key enforcement
        "PRAGMA busy_timeout = 30000", // 30 second timeout
        "PRAGMA journal_mode = WAL", // Write-Ahead Logging for better concurrency
        "PRAGMA synchronous = NORMAL", // Balance safety and performance
        "PRAGMA temp_store = memory", // Store temp tables in memory
        "PRAGMA mmap_size = 268435456", // Enable memory mapping (256MB)
        "PRAGMA cache_size = -2000", // 2MB cache
      ];
    }

    // Optimized serverless and Turso-specific connection settings
    if (isVercel || isVercelProduction || isVercelPreview || databaseUrl.startsWith("libsql://")) {
      // CRITICAL: Use "number" intMode to avoid BigInt serialization issues
      config.intMode = "number"; // Use regular JavaScript numbers to avoid BigInt issues

      // Enhanced fetch configuration for better edge runtime compatibility
      if (typeof globalThis.fetch !== 'undefined') {
        config.fetch = globalThis.fetch;
      }

      // Turso-optimized connection settings for remote databases only
      if (!config.url.startsWith("file:") && config.url !== ":memory:") {
        // Turso-specific optimizations
        config.syncUrl = config.url; // Enable sync for better reliability
        config.syncInterval = 45; // More frequent sync for serverless (reduced from 60s)

        // Connection timeout optimizations
        config.connectTimeout = 8000; // 8s connection timeout (reasonable for cold starts)
        config.requestTimeout = 12000; // 12s request timeout for complex queries

        // Enable HTTP/2 multiplexing if available
        config.httpVersion = '2';

        // Connection pooling hints for Turso
        config.maxIdleConnections = 2; // Minimal idle connections in serverless
        config.keepAlive = false; // Disable keep-alive in serverless to reduce memory

        logger.log("✅ Configured optimized Turso connection settings (intMode: number, timeouts: 8s/12s)");
      }
    }

    try {
      const createClient = await importLibSQLClient();
      const client = createClient(config);

      // Test connection to verify client is working
      const testResult = await client.execute("SELECT 1 as test");

      // Validate the client returns proper LibSQL response format
      if (!testResult || !testResult.rows || !Array.isArray(testResult.rows)) {
        throw new Error(
          "Database client test query returned invalid response format",
        );
      }

      // E2E test specific validation
      if (isTest) {
        // Verify client has required methods for E2E tests
        if (typeof client.execute !== "function") {
          throw new Error(
            "Database client missing execute method - invalid for E2E tests",
          );
        }

        // Test that we can execute basic queries (Turso validation)
        try {
          const versionTest = await client.execute("SELECT sqlite_version() as version");

          if (versionTest.rows && versionTest.rows.length > 0) {
            logger.log(`✅ Turso database connected successfully (SQLite version: ${versionTest.rows[0].version})`);
          } else {
            throw new Error("Invalid response from Turso database");
          }
        } catch (versionTestError) {
          logger.error("❌ Failed to validate Turso database connection:", versionTestError.message);
          throw new Error(`Turso database validation failed: ${versionTestError.message}`);
        }
      }

      // Apply pragmas if configured (MUST happen before marking as initialized)
      if (config.pragmas && Array.isArray(config.pragmas)) {
        for (const pragma of config.pragmas) {
          try {
            await client.execute(pragma);
          } catch (pragmaError) {
            logger.warn(
              `Failed to apply pragma: ${pragma}`,
              pragmaError.message,
            );
          }
        }
      }

      this.client = client;
      this.initialized = true;
      this.connectionId++;

      // Track this connection - store only the raw client
      // Metadata tracking caused connection closure issues
      this.activeConnections.add(client);

      logger.log(
        `✅ Database client initialized successfully (${process.env.NODE_ENV || "production"} mode)`,
      );
      return this.client;
    } catch (error) {
      // Enhanced error reporting for debugging with more detail
      const errorContext = {
        error: error.message,
        errorCode: error.code,
        databaseUrl: config.url ? config.url.substring(0, 20) + "..." : "undefined",
        databaseType: config.url ? (config.url.startsWith("file:") ? "sqlite-file" :
                     config.url.startsWith("libsql://") ? "turso-remote" :
                     config.url === ":memory:" ? "sqlite-memory" : "unknown") : "no-url",
        hasAuthToken: !!config.authToken,
        hasTursoUrl: !!process.env.TURSO_DATABASE_URL,
        hasTursoToken: !!process.env.TURSO_AUTH_TOKEN,
        environment: process.env.NODE_ENV,
        vercelEnv: process.env.VERCEL_ENV,
        isVercel: !!process.env.VERCEL,
        testType: process.env.TEST_TYPE,
        e2eTestMode: process.env.E2E_TEST_MODE,
        playwrightBrowser: process.env.PLAYWRIGHT_BROWSER,
        integrationTestMode: process.env.INTEGRATION_TEST_MODE,
        timestamp: new Date().toISOString(),
      };

      logger.error("❌ Database initialization failed:", errorContext);

      // More specific error message based on error type
      if (
        error.message.includes("ENOENT") ||
        error.message.includes("no such file")
      ) {
        throw new Error(
          `Database file not found or inaccessible: ${error.message}`,
        );
      } else if (
        error.message.includes("permission") ||
        error.message.includes("EACCES")
      ) {
        throw new Error(`Database file permission denied: ${error.message}`);
      } else if (error.message.includes("invalid response format")) {
        throw new Error(
          `Database client configuration error: ${error.message}`,
        );
      } else if (error.code === "DB_CONFIG_ERROR" || error.code === "DB_AUTH_ERROR") {
        // Re-throw configuration errors with additional context
        error.message = `${error.message} (context: ${error.context})`;
        throw error;
      } else {
        throw new Error(
          `Failed to initialize database client: ${error.message}`,
        );
      }
    }
  }

  /**
   * Utility method for delay in retry logic
   */
  async _delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Schedule connection recycling for Vercel serverless
   */
  _scheduleConnectionRecycle() {
    // Only schedule recycling in Vercel environments
    if (process.env.VERCEL !== "1") {
      return;
    }

    // Clear existing timer
    if (this.connectionRecycleTimer) {
      clearTimeout(this.connectionRecycleTimer);
    }

    // Schedule recycling after max age
    this.connectionRecycleTimer = setTimeout(() => {
      logger.log("Scheduled connection recycle triggered");
      this._recycleConnection().catch(error => {
        logger.error("Failed to recycle connection:", error);
      });
    }, this.connectionMaxAge);
  }

  /**
   * Recycle the database connection
   */
  async _recycleConnection() {
    logger.log("Recycling database connection...");

    // Close existing connection
    if (this.client) {
      try {
        if (typeof this.client.close === "function") {
          await this.client.close();
        }
      } catch (error) {
        logger.warn("Error closing connection during recycle:", error.message);
      }
    }

    // Clear connection state
    this.client = null;
    this.initialized = false;
    this.initializationPromise = null;
    this.activeConnections.clear();

    // Clear recycle timer
    if (this.connectionRecycleTimer) {
      clearTimeout(this.connectionRecycleTimer);
      this.connectionRecycleTimer = null;
    }

    logger.log("Connection recycled, will reinitialize on next use");
  }

  /**
   * Initialize database client with environment variables
   */
  async initializeClient() {
    // Use the full promise-based initialization with retry logic
    return this.ensureInitialized();
  }

  /**
   * Get database client instance
   * @returns {Promise<Object>} The raw LibSQL client instance
   */
  async getClient() {
    // Always return the raw LibSQL client for consistency
    return this.ensureInitialized();
  }

  /**
   * Test database connection with enhanced caching for serverless environments
   * @returns {Promise<boolean>} True if connection is successful
   */
  async testConnection() {
    try {
      // Check cached health result first (important for serverless performance)
      const now = Date.now();
      if (this.healthCheckCache.result !== null &&
          (now - this.healthCheckCache.timestamp) < this.healthCheckCache.ttl) {
        logger.debug("Using cached database health check result");
        return this.healthCheckCache.result;
      }

      const client = await this.ensureInitialized();

      // Test connection with a simple, fast query
      const result = await client.execute("SELECT 1 as test");

      const isHealthy = result && result.rows && result.rows.length > 0;

      // Cache the health check result
      this.healthCheckCache = {
        result: isHealthy,
        timestamp: now,
        ttl: this.healthCheckCache.ttl
      };

      if (isHealthy) {
        logger.debug("Database connection test successful");
        return true;
      }

      logger.error(
        "Database connection test failed: unexpected result",
        result,
      );
      return false;
    } catch (error) {
      // Cache negative results for shorter duration to allow faster recovery
      this.healthCheckCache = {
        result: false,
        timestamp: Date.now(),
        ttl: 5000 // Only cache failures for 5 seconds
      };

      logger.error("Database connection test failed:", {
        error: error.message,
        code: error.code,
        timestamp: new Date().toISOString(),
      });
      return false;
    }
  }

  /**
   * Execute a SQL query with automatic reconnection on CLIENT_CLOSED errors
   */
  async execute(queryOrObject, params = [], retryCount = 0) {
    const maxRetries = 1; // Only retry once to avoid infinite loops

    try {
      const client = await this.ensureInitialized();

      // Handle both string and object formats
      if (typeof queryOrObject === "string") {
        return await client.execute({ sql: queryOrObject, args: params });
      } else {
        // queryOrObject is already an object with sql and args
        return await client.execute(queryOrObject);
      }
    } catch (error) {
      const sqlString =
        typeof queryOrObject === "string" ? queryOrObject : queryOrObject.sql;

      // CRITICAL FIX: Handle CLIENT_CLOSED errors with automatic reconnection
      if ((error.message?.includes('CLIENT_CLOSED') || error.code === 'CLIENT_CLOSED')
          && retryCount < maxRetries) {

        logger.warn(`Database connection closed during operation, reconnecting... (attempt ${retryCount + 1}/${maxRetries + 1})`);

        // Force reinitialization
        this.initialized = false;
        this.client = null;
        this.initializationPromise = null;

        // Clear from active connections to prevent stale references
        if (this.client) {
          this.activeConnections.delete(this.client);
        }

        // Retry the operation with fresh connection
        return await this.execute(queryOrObject, params, retryCount + 1);
      }

      logger.error("Database query execution failed:", {
        sql:
          sqlString.substring(0, 100) + (sqlString.length > 100 ? "..." : ""),
        error: error.message,
        retryCount,
        timestamp: new Date().toISOString(),
      });

      // Still throw the error even if we don't log it
      throw error;
    }
  }

  /**
   * Execute multiple SQL statements in a transaction with automatic reconnection
   */
  async batch(statements, retryCount = 0) {
    const maxRetries = 1; // Only retry once to avoid infinite loops

    try {
      const client = await this.ensureInitialized();
      return await client.batch(statements);
    } catch (error) {
      // CRITICAL FIX: Handle CLIENT_CLOSED errors with automatic reconnection
      if ((error.message?.includes('CLIENT_CLOSED') || error.code === 'CLIENT_CLOSED')
          && retryCount < maxRetries) {

        logger.warn(`Database connection closed during batch operation, reconnecting... (attempt ${retryCount + 1}/${maxRetries + 1})`);

        // Force reinitialization
        this.initialized = false;
        this.client = null;
        this.initializationPromise = null;

        // Clear from active connections to prevent stale references
        if (this.client) {
          this.activeConnections.delete(this.client);
        }

        // Retry the operation with fresh connection
        return await this.batch(statements, retryCount + 1);
      }

      logger.error("Database batch execution failed:", {
        statementCount: statements.length,
        error: error.message,
        retryCount,
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }

  /**
   * Create a database transaction
   * @param {number} timeoutMs - Transaction timeout in milliseconds (default: 30000)
   * @returns {Promise<Object>} Transaction object with execute, commit, and rollback methods
   */
  async transaction(timeoutMs = 30000) {
    try {
      const client = await this.ensureInitialized();

      // Check if client has transaction support
      if (typeof client.transaction === "function") {
        try {
          const nativeTransaction = await client.transaction();
          logger.debug("✅ Using native LibSQL transaction support");
          // Wrap native transaction with timeout protection
          return this._wrapTransactionWithTimeout(nativeTransaction, timeoutMs);
        } catch (transactionError) {
          logger.warn(
            "⚠️  Native transaction creation failed, falling back to explicit SQL:",
            transactionError.message
          );
          // Fall through to the explicit SQL fallback
        }
      }

      // Fallback for clients without native transaction support:
      // emulate a transaction boundary with explicit SQL
      logger.warn(
        "Database client lacks native transactions; using explicit BEGIN/COMMIT/ROLLBACK fallback",
      );
      let started = false;
      let completed = false;
      let hasError = false;

      const fallbackTransaction = {
        execute: async (sql, params = []) => {
          if (completed) throw new Error("Transaction already completed");

          if (!started) {
            try {
              // Use IMMEDIATE to acquire a write lock early and reduce deadlocks
              await client.execute({ sql: "BEGIN IMMEDIATE", args: [] });
              started = true;
            } catch (error) {
              hasError = true;
              throw new Error(`Failed to begin transaction: ${error.message}`);
            }
          }

          try {
            // Execute within the explicit transaction using proper object format
            return await client.execute({ sql, args: params });
          } catch (error) {
            hasError = true;
            throw error;
          }
        },
        commit: async () => {
          if (completed) throw new Error("Transaction already completed");

          if (!started) {
            completed = true;
            return true; // Nothing to commit
          }

          try {
            if (!hasError) {
              await client.execute({ sql: "COMMIT", args: [] });
            } else {
              // If there were errors, rollback instead of commit
              await client.execute({ sql: "ROLLBACK", args: [] });
              throw new Error("Transaction had errors, rolled back instead of commit");
            }
          } catch (error) {
            hasError = true;
            // Try to rollback if commit failed
            try {
              await client.execute({ sql: "ROLLBACK", args: [] });
            } catch (rollbackError) {
              logger.error("Failed to rollback after commit failure:", rollbackError.message);
            }
            throw new Error(`Failed to commit transaction: ${error.message}`);
          } finally {
            completed = true;
          }

          return true;
        },
        rollback: async () => {
          if (completed) throw new Error("Transaction already completed");

          if (!started) {
            completed = true;
            return true; // Nothing to rollback
          }

          try {
            await client.execute({ sql: "ROLLBACK", args: [] });
          } catch (error) {
            logger.error("Failed to rollback transaction:", error.message);
            throw new Error(`Failed to rollback transaction: ${error.message}`);
          } finally {
            completed = true;
            hasError = true;
          }

          return true;
        },
      };

      // Wrap fallback transaction with timeout protection too
      return this._wrapTransactionWithTimeout(fallbackTransaction, timeoutMs);
    } catch (error) {
      logger.error("Database transaction creation failed:", {
        error: error.message,
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }

  /**
   * Wrap transaction with timeout protection to prevent hanging
   * @private
   */
  _wrapTransactionWithTimeout(transaction, timeoutMs) {
    let isTimedOut = false;
    const timeoutId = setTimeout(() => {
      isTimedOut = true;
      logger.error(`⏰ Transaction timed out after ${timeoutMs}ms - attempting rollback`);
      // Attempt to rollback the timed-out transaction
      transaction.rollback().catch(error => {
        logger.error("Failed to rollback timed-out transaction:", error.message);
      });
    }, timeoutMs);

    const clearTimeoutAndCheck = () => {
      clearTimeout(timeoutId);
      if (isTimedOut) {
        throw new Error(`Transaction timed out after ${timeoutMs}ms`);
      }
    };

    return {
      execute: async (sql, params = []) => {
        clearTimeoutAndCheck();
        try {
          return await transaction.execute(sql, params);
        } catch (error) {
          clearTimeout(timeoutId);
          throw error;
        }
      },
      commit: async () => {
        clearTimeoutAndCheck();
        try {
          const result = await transaction.commit();
          clearTimeout(timeoutId);
          return result;
        } catch (error) {
          clearTimeout(timeoutId);
          throw error;
        }
      },
      rollback: async () => {
        try {
          const result = await transaction.rollback();
          clearTimeout(timeoutId);
          return result;
        } catch (error) {
          clearTimeout(timeoutId);
          throw error;
        }
      }
    };
  }

  /**
   * Close database connections with proper cleanup and timeout protection
   * @param {number} timeout - Timeout in milliseconds for closing connections (default: 5000)
   * @returns {Promise<boolean>} True if all connections closed successfully
   */
  async close(timeout = 5000) {
    // Prevent multiple concurrent close operations
    if (this.isClosing) {
      logger.debug("Database service already closing - waiting for completion");
      // Wait for existing close operation to complete
      while (this.isClosing) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return !this.initialized; // Return true if successfully closed
    }

    this.isClosing = true;
    const startTime = Date.now();
    let closedCount = 0;
    let errorCount = 0;

    try {
      logger.debug(`Starting database cleanup - ${this.activeConnections.size} connections to close`);

      // Create an array of promises for closing all active connections
      const closePromises = Array.from(this.activeConnections).map(
        async (connection) => {
          try {
            // activeConnections now stores raw clients only
            if (connection && typeof connection.close === "function") {
              await Promise.race([
                connection.close(),
                new Promise((_, reject) =>
                  setTimeout(
                    () => reject(new Error("Connection close timeout")),
                    timeout,
                  ),
                ),
              ]);
              closedCount++;
              return true;
            }
          } catch (error) {
            logger.error("Error closing database connection:", error.message);
            errorCount++;
            return false;
          }
        },
      );

      // Wait for all connections to close
      await Promise.allSettled(closePromises);

      // Clear the connections set
      this.activeConnections.clear();

      // Reset service state
      this.client = null;
      this.initialized = false;
      this.initializationPromise = null;

      const duration = Date.now() - startTime;
      logger.debug(
        `Database connections closed: ${closedCount} successful, ${errorCount} errors (${duration}ms)`,
      );

      return errorCount === 0;
    } catch (error) {
      logger.error("Error in close operation:", error.message);

      // Force reset even if close failed
      this.activeConnections.clear();
      this.client = null;
      this.initialized = false;
      this.initializationPromise = null;

      return false;
    } finally {
      this.isClosing = false;
    }
  }

  /**
   * Reset the database service state for testing
   * This clears the cached client and initialization state
   * @returns {Promise<void>}
   */
  async resetForTesting() {
    try {
      // Close all active connections first
      await this.close();
    } catch (error) {
      logger.warn(
        "Error during resetForTesting close operation:",
        error.message,
      );
    }

    // Force clear all state even if close failed
    this.activeConnections.clear();
    this.client = null;
    this.initialized = false;
    this.initializationPromise = null;
  }

  /**
   * Get connection statistics for monitoring and debugging
   * @returns {Object} Connection statistics
   */
  getConnectionStats() {
    return {
      activeConnections: this.activeConnections.size,
      initialized: this.initialized,
      hasClient: !!this.client,
      hasInitPromise: !!this.initializationPromise,
      isClosing: this.isClosing,
      connectionId: this.connectionId,
      connections: Array.from(this.activeConnections).map(conn => ({
        id: conn.id || 'legacy',
        createdAt: conn.createdAt || 'unknown'
      })),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Verify batch operation support for Turso
   * @returns {Promise<boolean>} True if batch operations are supported
   */
  async verifyBatchSupport() {
    try {
      const client = await this.ensureInitialized();

      // Check if client has batch method
      if (typeof client.batch !== "function") {
        logger.warn("Database client does not support batch operations");
        return false;
      }

      // Test with a simple batch operation
      const testStatements = [
        { sql: "SELECT 1 as test", args: [] },
        { sql: "SELECT 2 as test", args: [] }
      ];

      const results = await client.batch(testStatements);

      const isValid = Array.isArray(results) &&
                     results.length === 2 &&
                     results.every(r => r.rows && r.rows.length > 0);

      logger.debug(isValid ? "✅ Batch operations verified" : "❌ Batch operation verification failed");
      return isValid;
    } catch (error) {
      logger.warn("Batch operation verification failed:", error.message);
      return false;
    }
  }

  /**
   * Enhanced health check with batch support verification and circuit breaker integration
   */
  async healthCheck() {
    try {
      const startTime = Date.now();
      const isConnected = await this.testConnection();
      const stats = this.getConnectionStats();

      if (!isConnected) {
        return {
          status: "unhealthy",
          error: "Connection test failed",
          connectionStats: stats,
          responseTime: `${Date.now() - startTime}ms`,
          timestamp: new Date().toISOString(),
        };
      }

      // Test batch operations support for Turso
      const batchSupported = await this.verifyBatchSupport();

      // Connection health metrics
      const connectionAge = Date.now() - this.lastActivity;
      const needsRecycling = connectionAge > this.connectionMaxAge;

      return {
        status: "healthy",
        connectionStats: stats,
        features: {
          batchOperations: batchSupported,
          connectionPooling: this.connectionPool.size > 0,
          healthCache: this.healthCheckCache.result !== null
        },
        performance: {
          connectionAge: `${Math.round(connectionAge / 1000)}s`,
          needsRecycling,
          responseTime: `${Date.now() - startTime}ms`
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: "unhealthy",
        error: error.message,
        connectionStats: this.getConnectionStats(),
        timestamp: new Date().toISOString(),
      };
    }
  }
}

// Export singleton instance
let databaseServiceInstance = null;

// ❌ REMOVED: getDatabase() export - this pattern was causing connection hangs
// All services MUST use getDatabaseClient() directly for proper connection management

// Cache for the database client to reuse in serverless environment
let cachedClient = null;
let clientCreationPromise = null;

/**
 * Get database client directly
 * @returns {Promise<Object>} LibSQL client instance
 *
 * This is the PRIMARY method for getting a database client.
 * It ALWAYS returns the raw LibSQL client with execute() method.
 *
 * SIMPLIFIED: Now directly creates LibSQL client without DatabaseService overhead
 * This eliminates the timeout issues in serverless environments
 */
export async function getDatabaseClient() {
  console.log('[GET_DB_CLIENT] Entry - INTEGRATION_TEST_MODE:', process.env.INTEGRATION_TEST_MODE);

  // CRITICAL PRIORITY: Check for test isolation mode FIRST
  // This ensures all services get the correct database in integration tests
  if (process.env.INTEGRATION_TEST_MODE === 'true') {
    console.log('[GET_DB_CLIENT] Entering integration test mode branch');
    try {
      console.log('[GET_DB_CLIENT] About to import test-isolation-manager...');
      const { getTestIsolationManager } = await import('./test-isolation-manager.js');
      console.log('[GET_DB_CLIENT] test-isolation-manager imported successfully');

      console.log('[GET_DB_CLIENT] Calling getTestIsolationManager()...');
      const isolationManager = getTestIsolationManager();
      console.log('[GET_DB_CLIENT] Got isolation manager:', !!isolationManager);

      // Get the worker database that has migrations already run
      console.log('[GET_DB_CLIENT] About to call getWorkerDatabase()...');
      const testClient = await isolationManager.getWorkerDatabase();
      console.log('[GET_DB_CLIENT] getWorkerDatabase() returned:', !!testClient);

      if (testClient && typeof testClient.execute === "function") {
        console.log('[GET_DB_CLIENT] Test client is valid, verifying tables...');
        console.log('✅ getDatabaseClient() returning worker database from test isolation manager');

        // Verify the database has tables
        try {
          const result = await testClient.execute('SELECT COUNT(*) as count FROM tickets');
          console.log(`✅ getDatabaseClient() worker database has tickets table with ${result.rows[0].count} rows`);
        } catch (err) {
          console.error('❌ getDatabaseClient() worker database missing tickets table:', err.message);
        }

        console.log('[GET_DB_CLIENT] Returning test client');
        return testClient;
      }
      console.log('[GET_DB_CLIENT] Test client is invalid or missing execute method');
    } catch (error) {
      console.error('[GET_DB_CLIENT] Error in integration test mode:', error.message, error.stack);
      logger.warn('⚠️ Failed to get test isolation database, falling back to standard initialization:', error.message);
      // Fall through to standard initialization
    }
  }

  console.log('[GET_DB_CLIENT] Exited integration test mode check, proceeding to standard initialization');

  // CRITICAL: In integration test mode with in-memory database,
  // we should NEVER reach here. If we do, it means the worker database wasn't found,
  // which would create a NEW empty database - causing test failures.
  if (process.env.INTEGRATION_TEST_MODE === 'true' && process.env.DATABASE_URL === ':memory:') {
    console.error('❌ CRITICAL ERROR: Integration test mode but no worker database available!');
    console.error('   This would create a NEW empty database, breaking tests.');
    throw new Error('Integration test mode requires worker database - cannot create new database');
  }

  // Return cached client if available and valid
  if (cachedClient) {
    try {
      // Quick validation that connection is still alive
      await cachedClient.execute("SELECT 1");
      return cachedClient;
    } catch (error) {
      // Connection is dead, clear cache and recreate
      logger.warn("Cached database connection invalid, recreating:", error.message);
      cachedClient = null;
      clientCreationPromise = null;
    }
  }

  // If already creating, wait for that promise
  if (clientCreationPromise) {
    return clientCreationPromise;
  }

  // Create new client directly without DatabaseService overhead
  clientCreationPromise = createDirectDatabaseClient();

  try {
    cachedClient = await clientCreationPromise;
    return cachedClient;
  } catch (error) {
    // Clear promise on error so next call can retry
    clientCreationPromise = null;
    throw error;
  }
}

/**
 * Create database client directly without DatabaseService wrapper
 * This eliminates timeout issues in serverless environments
 */
async function createDirectDatabaseClient() {
  const isVercel = process.env.VERCEL === "1";
  const isTest = process.env.NODE_ENV === "test";

  // Get database URL and auth token (remove any surrounding quotes)
  let databaseUrl = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL;
  const originalUrl = databaseUrl;
  if (databaseUrl) {
    databaseUrl = databaseUrl.replace(/^["']+|["']+$/g, '').trim();
  }
  const authToken = process.env.TURSO_AUTH_TOKEN?.replace(/^["']+|["']+$/g, '').trim();

  try {

    if (!databaseUrl) {
      throw new Error("Database URL not configured");
    }

    // Log the cleaned URL for debugging (mask sensitive parts)
    if (process.env.VERCEL === "1") {
      const maskedOriginal = originalUrl?.substring(0, 40) + "...";
      const maskedUrl = databaseUrl.substring(0, 40) + "...";
      logger.log(`Original URL: ${maskedOriginal}`);
      logger.log(`Cleaned URL: ${maskedUrl}`);
      logger.log(`Creating database client with URL: ${maskedUrl}`);
    }

    // Import the appropriate client based on environment
    const createClient = await importLibSQLClient();

    // Create client with optimized settings for serverless
    const config = {
      url: databaseUrl,
      intMode: "bigint"
    };

    // Add auth token for remote databases
    if (authToken && (databaseUrl.startsWith("libsql://") || databaseUrl.startsWith("https://"))) {
      config.authToken = authToken;
    }

    // Create the client
    const client = createClient(config);

    // Quick validation
    await client.execute("SELECT 1 as test");

    logger.log("✅ Direct database client created successfully");
    return client;

  } catch (error) {
    logger.error("Failed to create direct database client:", error);
    throw error;
  }
}

/**
 * Test database connection
 * @returns {Promise<boolean>} True if connection is successful
 */
export async function testConnection() {
  try {
    const client = await getDatabaseClient();
    const result = await client.execute("SELECT 1 as test");
    return result && result.rows && result.rows.length > 0;
  } catch (error) {
    logger.error("Database connection test failed:", error);
    return false;
  }
}

/**
 * Reset singleton instance for testing
 * @returns {Promise<void>}
 */
export async function resetDatabaseInstance() {
  // For in-memory databases used in tests, don't close the connection
  // because it would destroy the database. Just clear the cache references.
  const dbUrl = process.env.DATABASE_URL || '';
  const isInMemoryDb =
    dbUrl === ':memory:' ||
    dbUrl.includes('memory') ||
    dbUrl.includes('file::memory:');

  // Only close connections for non-memory databases
  if (!isInMemoryDb && cachedClient && typeof cachedClient.close === 'function') {
    try {
      await cachedClient.close();
    } catch (error) {
      logger.warn('Error closing cached client during reset:', error.message);
    }
  }

  // Clear cached client to force recreation on next call
  cachedClient = null;
  clientCreationPromise = null;
  // Clear the old DatabaseService instance if it exists
  databaseServiceInstance = null;
}

export { DatabaseService };
