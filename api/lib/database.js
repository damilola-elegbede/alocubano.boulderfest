/**
 * Database Client Module
 * Handles LibSQL database connections and provides connection management
 * Supports both Node.js and Edge runtime environments
 */

import { logger } from './logger.js';

// Dynamic import based on environment for LibSQL client compatibility
async function importLibSQLClient() {
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
    this.maxRetries = 3;
    this.retryDelay = 1000; // 1 second
    this.activeConnections = new Set(); // Track active connections
  }

  /**
   * Ensure database client is initialized with promise-based lazy singleton pattern
   * @returns {Promise<Object>} The raw LibSQL client instance
   */
  async ensureInitialized() {
    // Return immediately if already initialized (fast path)
    if (this.initialized && this.client) {
      return this.client; // ALWAYS return the raw client
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
   * Create a timeout promise to prevent hanging during initialization
   */
  _createTimeoutPromise() {
    const timeoutMs = process.env.DATABASE_INIT_TIMEOUT || 10000; // 10 seconds default
    
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Database initialization timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    });
  }

  /**
   * Initialize database client with retry logic
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
    if (isE2ETest) {
      // E2E tests MUST use Turso
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
      
    } else if (isTest && !isVercel) {
      // Unit and Integration tests (local only) can use DATABASE_URL (SQLite files)
      databaseUrl = cleanDatabaseUrl(process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL);
      
      if (!databaseUrl || databaseUrl.trim() === "") {
        const error = new Error("DATABASE_URL environment variable is required for unit/integration tests");
        error.code = "DB_CONFIG_ERROR";
        error.context = "unit-integration-tests";
        throw error;
      }
      
      logger.log(`✅ Using database for unit/integration tests: ${databaseUrl}`);
      
    } else if (isDevelopment) {
      // Local development: Require proper database configuration
      databaseUrl = cleanDatabaseUrl(process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL);
      
      if (!databaseUrl || databaseUrl.trim() === "") {
        const error = new Error("❌ FATAL: TURSO_DATABASE_URL secret not configured - SQLite fallback removed for reliability");
        error.code = "DB_CONFIG_ERROR";
        error.context = "development";
        throw error;
      }
      
      logger.log(`✅ Using configured database for local development: ${databaseUrl.substring(0, 30)}...`);
      
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
    if (databaseUrl.startsWith("file:") || databaseUrl === ":memory:") {
      config.pragmas = [
        "PRAGMA busy_timeout = 30000", // 30 second timeout
        "PRAGMA journal_mode = WAL", // Write-Ahead Logging for better concurrency
        "PRAGMA synchronous = NORMAL", // Balance safety and performance
        "PRAGMA temp_store = memory", // Store temp tables in memory
        "PRAGMA mmap_size = 268435456", // Enable memory mapping (256MB)
        "PRAGMA cache_size = -2000", // 2MB cache
      ];
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

      this.client = client;
      this.initialized = true;

      // Track this connection
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
   * Initialize database client with environment variables
   */
  async initializeClient() {
    // Use the full promise-based initialization with retry logic
    return this.ensureInitialized();
  }

  /**
   * Create database client with configuration
   * @private
   */
  async _createDatabaseClient(databaseUrl, authToken) {
    const config = {
      url: databaseUrl,
    };

    // Add auth token if provided (not needed for :memory: databases)
    if (authToken && databaseUrl !== ":memory:") {
      config.authToken = authToken;
    }

    // Add SQLite-specific configuration for busy timeout and WAL mode
    if (databaseUrl.startsWith("file:") || databaseUrl === ":memory:") {
      config.pragmas = [
        "PRAGMA busy_timeout = 30000", // 30 second timeout
        "PRAGMA journal_mode = WAL", // Write-Ahead Logging for better concurrency
        "PRAGMA synchronous = NORMAL", // Balance safety and performance
        "PRAGMA temp_store = memory", // Store temp tables in memory
        "PRAGMA mmap_size = 268435456", // Enable memory mapping (256MB)
        "PRAGMA cache_size = -2000", // 2MB cache
      ];
    }

    try {
      const createClient = await importLibSQLClient();
      this.client = createClient(config);

      // Track this connection
      this.activeConnections.add(this.client);

      // Apply pragmas if configured
      if (config.pragmas && Array.isArray(config.pragmas)) {
        for (const pragma of config.pragmas) {
          try {
            await this.client.execute(pragma);
          } catch (pragmaError) {
            logger.warn(
              `Failed to apply pragma: ${pragma}`,
              pragmaError.message,
            );
          }
        }
      }

      this.initialized = true;
      return this.client;
    } catch (error) {
      throw new Error(
        "Failed to initialize database client due to configuration error",
      );
    }
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
   * Test database connection
   * @returns {Promise<boolean>} True if connection is successful
   */
  async testConnection() {
    try {
      const client = await this.ensureInitialized();

      // Test connection with a simple query
      const result = await client.execute("SELECT 1 as test");

      if (result && result.rows && result.rows.length > 0) {
        logger.debug("Database connection test successful");
        return true;
      }

      logger.error(
        "Database connection test failed: unexpected result",
        result,
      );
      return false;
    } catch (error) {
      logger.error("Database connection test failed:", {
        error: error.message,
        code: error.code,
        timestamp: new Date().toISOString(),
      });
      return false;
    }
  }

  /**
   * Execute a SQL query
   */
  async execute(queryOrObject, params = []) {
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

      logger.error("Database query execution failed:", {
        sql:
          sqlString.substring(0, 100) + (sqlString.length > 100 ? "..." : ""),
        error: error.message,
        timestamp: new Date().toISOString(),
      });

      // Still throw the error even if we don't log it
      throw error;
    }
  }

  /**
   * Execute multiple SQL statements in a transaction
   */
  async batch(statements) {
    try {
      const client = await this.ensureInitialized();
      return await client.batch(statements);
    } catch (error) {
      logger.error("Database batch execution failed:", {
        statementCount: statements.length,
        error: error.message,
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
    const startTime = Date.now();
    let closedCount = 0;
    let errorCount = 0;

    try {
      // Create an array of promises for closing all active connections
      const closePromises = Array.from(this.activeConnections).map(
        async (connection) => {
          try {
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
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Health check - verify database connectivity and basic functionality
   */
  async healthCheck() {
    try {
      const isConnected = await this.testConnection();
      const stats = this.getConnectionStats();

      if (!isConnected) {
        return {
          status: "unhealthy",
          error: "Connection test failed",
          connectionStats: stats,
          timestamp: new Date().toISOString(),
        };
      }

      return {
        status: "healthy",
        connectionStats: stats,
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

/**
 * Get database service singleton instance
 * @returns {DatabaseService} Database service instance
 */
export function getDatabase() {
  if (!databaseServiceInstance) {
    databaseServiceInstance = new DatabaseService();
  }
  return databaseServiceInstance;
}

/**
 * Get database client directly
 * @returns {Promise<Object>} LibSQL client instance
 *
 * This is the PRIMARY method for getting a database client.
 * It ALWAYS returns the raw LibSQL client with execute() method.
 */
export async function getDatabaseClient() {
  const service = getDatabase();
  const client = await service.getClient();

  // Verify we're returning the raw client, not the service
  if (!client || typeof client.execute !== "function") {
    throw new Error(
      "Database client initialization failed - invalid client returned",
    );
  }

  return client;
}

/**
 * Test database connection
 * @returns {Promise<boolean>} True if connection is successful
 */
export async function testConnection() {
  const service = getDatabase();
  return service.testConnection();
}

/**
 * Reset singleton instance for testing
 * @returns {Promise<void>}
 */
export async function resetDatabaseInstance() {
  if (databaseServiceInstance) {
    await databaseServiceInstance.resetForTesting();
  }
  databaseServiceInstance = null;
}

export { DatabaseService };