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

    // Start new initialization with retry logic
    this.initializationPromise = this._initializeWithRetry();

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
   * Initialize database client with retry logic
   */
  async _initializeWithRetry(retryCount = 0) {
    try {
      return await this._performInitialization();
    } catch (error) {
      if (retryCount < this.maxRetries) {
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
    let databaseUrl = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;

    // Check for empty string as well as undefined first (before any transformation)
    if (!databaseUrl || databaseUrl.trim() === "") {
      throw new Error("TURSO_DATABASE_URL environment variable is required");
    }


    const config = {
      url: databaseUrl,
    };

    // Add auth token if provided (not needed for :memory: databases)
    if (authToken && databaseUrl !== ":memory:") {
      config.authToken = authToken;
    }

    try {
      const createClient = await importLibSQLClient();
      const client = createClient(config);

      // Test connection to verify client is working
      await client.execute("SELECT 1 as test");

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

      console.error("Database query execution failed:", {
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
   * Reset the database service state for testing
   * This clears the cached client and initialization state
   */
  resetForTesting() {
    this.client = null;
    this.initialized = false;
    this.initializationPromise = null;
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
 * 
 * This is the PRIMARY method for getting a database client.
 * It ALWAYS returns the raw LibSQL client with execute() method.
 */
export async function getDatabaseClient() {
  const service = getDatabase();
  const client = await service.getClient();
  
  // Verify we're returning the raw client, not the service
  if (!client || typeof client.execute !== 'function') {
    throw new Error('Database client initialization failed - invalid client returned');
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
 */
export function resetDatabaseInstance() {
  if (databaseServiceInstance) {
    databaseServiceInstance.resetForTesting();
  }
  databaseServiceInstance = null;
}

export { DatabaseService };
