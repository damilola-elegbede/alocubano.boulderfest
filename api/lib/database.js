/**
 * Database Client Module
 * Handles LibSQL database connections and provides connection management
 * Supports both Node.js and Edge runtime environments
 */

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
    console.warn(
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
  }

  /**
   * Ensure database client is initialized with promise-based lazy singleton pattern
   * Prevents race conditions by caching the initialization promise
   */
  async ensureInitialized() {
    // Return immediately if already initialized (fast path)
    if (this.initialized && this.client) {
      return this.client;
    }

    // If initialization is already in progress, return the existing promise
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    // Start new initialization with retry logic
    this.initializationPromise = this._initializeWithRetry();

    try {
      const client = await this.initializationPromise;
      return client;
    } catch (error) {
      // Clear the failed promise so next call can retry
      this.initializationPromise = null;
      throw error;
    }
  }

  /**
   * Initialize database client with retry logic
   */
  async _initializeWithRetry(retryCount = 0) {
    try {
      return await this._performInitialization();
    } catch (error) {
      // Only retry in production, not in tests
      if (
        retryCount < this.maxRetries &&
        process.env.NODE_ENV !== "test" &&
        !process.env.VITEST
      ) {
        console.warn(
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
    const databaseUrl = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;

    // Check for empty string as well as undefined
    if (!databaseUrl || databaseUrl.trim() === "") {
      throw new Error("TURSO_DATABASE_URL environment variable is required");
    }

    const config = {
      url: databaseUrl,
    };

    // Add auth token if provided (required for Turso)
    if (authToken) {
      config.authToken = authToken;
    }

    try {
      const createClient = await importLibSQLClient();
      const client = createClient(config);

      // Only test connection in production environment
      // Skip connection test in tests to maintain backward compatibility
      if (process.env.NODE_ENV !== "test" && !process.env.VITEST) {
        await client.execute("SELECT 1 as test");
      }

      this.client = client;
      this.initialized = true;

      return this.client;
    } catch (error) {
      // Log error without exposing sensitive config details
      console.error("Database initialization failed:", {
        error: error.message,
        timestamp: new Date().toISOString(),
      });
      throw new Error(
        "Failed to initialize database client due to configuration error",
      );
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
   * Maintains backward compatibility with synchronous behavior in tests
   */
  async initializeClient() {
    // Allow tests to force strict environment validation
    const strictMode = process.env.DATABASE_TEST_STRICT_MODE === "true";

    // In test environment, maintain synchronous-like behavior for backward compatibility
    // unless strict mode is enabled for testing error conditions
    if (
      (process.env.NODE_ENV === "test" || process.env.VITEST) &&
      !strictMode
    ) {
      if (this.initialized && this.client) {
        return this.client;
      }

      const databaseUrl = process.env.TURSO_DATABASE_URL;
      const authToken = process.env.TURSO_AUTH_TOKEN;

      // Check for empty string as well as undefined
      if (!databaseUrl || databaseUrl.trim() === "") {
        throw new Error("TURSO_DATABASE_URL environment variable is required");
      }

      const config = {
        url: databaseUrl,
      };

      if (authToken) {
        config.authToken = authToken;
      }

      try {
        const createClient = await importLibSQLClient();
        this.client = createClient(config);
        this.initialized = true;
        return this.client;
      } catch (error) {
        throw new Error(
          "Failed to initialize database client due to configuration error",
        );
      }
    }

    // In production or strict test mode, use the full promise-based initialization with retry logic
    return this.ensureInitialized();
  }

  /**
   * Get database client instance
   */
  async getClient() {
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
        console.log("Database connection test successful");
        return true;
      }

      console.error(
        "Database connection test failed: unexpected result",
        result,
      );
      return false;
    } catch (error) {
      console.error("Database connection test failed:", {
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

      // Don't log rollback errors in test environments - they're expected during cleanup
      const isRollbackError =
        sqlString === "ROLLBACK" && error.message?.includes("cannot rollback");
      if (!isRollbackError || process.env.NODE_ENV !== "test") {
        console.error("Database query execution failed:", {
          sql:
            sqlString.substring(0, 100) + (sqlString.length > 100 ? "..." : ""),
          error: error.message,
          timestamp: new Date().toISOString(),
        });
      }

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
      console.error("Database batch execution failed:", {
        statementCount: statements.length,
        error: error.message,
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }

  /**
   * Close database connection
   */
  close() {
    if (this.client) {
      try {
        this.client.close();
        console.log("Database connection closed");
      } catch (error) {
        console.error("Error closing database connection:", error.message);
      } finally {
        this.client = null;
        this.initialized = false;
        this.initializationPromise = null;
      }
    }
  }

  /**
   * Health check - verify database connectivity and basic functionality
   */
  async healthCheck() {
    try {
      const isConnected = await this.testConnection();

      if (!isConnected) {
        return {
          status: "unhealthy",
          error: "Connection test failed",
          timestamp: new Date().toISOString(),
        };
      }

      return {
        status: "healthy",
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: "unhealthy",
        error: error.message,
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
 */
export async function getDatabaseClient() {
  const service = getDatabase();
  return await service.getClient();
}

/**
 * Test database connection
 * @returns {Promise<boolean>} True if connection is successful
 */
export async function testConnection() {
  const service = getDatabase();
  return service.testConnection();
}

export { DatabaseService };
