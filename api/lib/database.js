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
    // In strict test mode, be even more strict about environment validation
    const strictMode = process.env.DATABASE_TEST_STRICT_MODE === "true";
    
    if (!databaseUrl || databaseUrl.trim() === "" || (strictMode && !databaseUrl)) {
      throw new Error("TURSO_DATABASE_URL environment variable is required");
    }

    // Integration test specific handling
    if (process.env.TEST_TYPE === 'integration' || process.env.NODE_ENV === 'test') {
      // For integration tests, ensure we have a valid file path
      if (databaseUrl.startsWith('file:')) {
        // Ensure the database file path is absolute and accessible
        const dbPath = databaseUrl.replace('file:', '');
        if (!dbPath.startsWith('/') && !dbPath.match(/^[A-Za-z]:/)) {
          // Convert relative path to absolute for better reliability
          const path = await import('path');
          const absolutePath = path.resolve(process.cwd(), dbPath);
          databaseUrl = `file:${absolutePath}`;
          console.log(`✅ Converted relative database path to absolute: ${databaseUrl}`);
        }
      } else if (databaseUrl === ':memory:') {
        // In-memory database is fine for tests
        console.log(`✅ Using in-memory database for tests`);
      }
    }


    const config = {
      url: databaseUrl,
    };

    // Add auth token if provided (not needed for :memory: databases)
    if (authToken && databaseUrl !== ":memory:") {
      config.authToken = authToken;
    }

    // Add SQLite-specific configuration for busy timeout and WAL mode
    if (databaseUrl.startsWith('file:') || databaseUrl === ':memory:') {
      config.pragmas = [
        'PRAGMA busy_timeout = 30000',  // 30 second timeout
        'PRAGMA journal_mode = WAL',     // Write-Ahead Logging for better concurrency
        'PRAGMA synchronous = NORMAL',   // Balance safety and performance
        'PRAGMA temp_store = memory',    // Store temp tables in memory
        'PRAGMA mmap_size = 268435456',  // Enable memory mapping (256MB)
        'PRAGMA cache_size = -2000',     // 2MB cache
      ];
    }

    try {
      const createClient = await importLibSQLClient();
      const client = createClient(config);

      // Test connection to verify client is working
      const testResult = await client.execute("SELECT 1 as test");
      
      // Validate the client returns proper LibSQL response format
      if (!testResult || !testResult.rows || !Array.isArray(testResult.rows)) {
        throw new Error("Database client test query returned invalid response format");
      }

      // Integration test specific validation
      if (process.env.TEST_TYPE === 'integration' || process.env.NODE_ENV === 'test') {
        // Verify client has required methods for integration tests
        if (typeof client.execute !== 'function') {
          throw new Error("Database client missing execute method - invalid for integration tests");
        }
        
        // Test that we can get lastInsertRowid (required for transaction tests)
        try {
          const insertTest = await client.execute("CREATE TEMPORARY TABLE test_insert (id INTEGER PRIMARY KEY, value TEXT)");
          const insertResult = await client.execute("INSERT INTO test_insert (value) VALUES (?)", ["test"]);
          
          if (!insertResult.hasOwnProperty('lastInsertRowid')) {
            console.warn("⚠️ Database client may not support lastInsertRowid - some tests may fail");
          } else {
            console.log("✅ Database client supports lastInsertRowid for integration tests");
          }
          
          // Clean up test table
          await client.execute("DROP TABLE test_insert");
        } catch (insertTestError) {
          console.warn("⚠️ Could not test lastInsertRowid support:", insertTestError.message);
        }
      }

      this.client = client;
      this.initialized = true;
      
      // Track this connection
      this.activeConnections.add(client);

      console.log(`✅ Database client initialized successfully (${process.env.NODE_ENV || 'production'} mode)`);
      return this.client;
    } catch (error) {
      // Enhanced error reporting for debugging
      console.error("❌ Database initialization failed:", {
        error: error.message,
        databaseUrl: config.url ? config.url.substring(0, 20) + '...' : 'undefined',
        hasAuthToken: !!config.authToken,
        environment: process.env.NODE_ENV,
        testType: process.env.TEST_TYPE,
        timestamp: new Date().toISOString(),
      });
      
      // More specific error message based on error type
      if (error.message.includes('ENOENT') || error.message.includes('no such file')) {
        throw new Error(`Database file not found or inaccessible: ${error.message}`);
      } else if (error.message.includes('permission') || error.message.includes('EACCES')) {
        throw new Error(`Database file permission denied: ${error.message}`);
      } else if (error.message.includes('invalid response format')) {
        throw new Error(`Database client configuration error: ${error.message}`);
      } else {
        throw new Error(`Failed to initialize database client: ${error.message}`);
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
    if (databaseUrl.startsWith('file:') || databaseUrl === ':memory:') {
      config.pragmas = [
        'PRAGMA busy_timeout = 30000',  // 30 second timeout
        'PRAGMA journal_mode = WAL',     // Write-Ahead Logging for better concurrency
        'PRAGMA synchronous = NORMAL',   // Balance safety and performance
        'PRAGMA temp_store = memory',    // Store temp tables in memory
        'PRAGMA mmap_size = 268435456',  // Enable memory mapping (256MB)
        'PRAGMA cache_size = -2000',     // 2MB cache
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
            console.warn(`Failed to apply pragma: ${pragma}`, pragmaError.message);
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
      const closePromises = Array.from(this.activeConnections).map(async (connection) => {
        try {
          if (connection && typeof connection.close === 'function') {
            await Promise.race([
              connection.close(),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Connection close timeout')), timeout)
              )
            ]);
            closedCount++;
            return true;
          }
        } catch (error) {
          console.error("Error closing database connection:", error.message);
          errorCount++;
          return false;
        }
      });

      // Wait for all connections to close
      await Promise.allSettled(closePromises);

      // Clear the connections set
      this.activeConnections.clear();

      // Reset service state
      this.client = null;
      this.initialized = false;
      this.initializationPromise = null;

      const duration = Date.now() - startTime;
      console.log(`Database connections closed: ${closedCount} successful, ${errorCount} errors (${duration}ms)`);
      
      return errorCount === 0;
    } catch (error) {
      console.error("Error in close operation:", error.message);
      
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
      console.warn("Error during resetForTesting close operation:", error.message);
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
 * @returns {Promise<void>}
 */
export async function resetDatabaseInstance() {
  if (databaseServiceInstance) {
    await databaseServiceInstance.resetForTesting();
  }
  databaseServiceInstance = null;
}

export { DatabaseService };
