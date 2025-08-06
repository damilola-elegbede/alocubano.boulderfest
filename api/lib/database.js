/**
 * Database Client Module
 * Handles LibSQL database connections and provides connection management
 */

import { createClient } from "@libsql/client/web";

class DatabaseService {
  constructor() {
    this.client = null;
    this.initialized = false;
  }

  /**
   * Initialize database client with environment variables
   */
  initializeClient() {
    if (this.initialized) {
      return this.client;
    }

    const databaseUrl = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;

    if (!databaseUrl) {
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
      this.client = createClient(config);
      this.initialized = true;
      return this.client;
    } catch (error) {
      // Log error without exposing sensitive config details or original error message
      throw new Error("Failed to initialize database client due to configuration error");
    }
  }

  /**
   * Get database client instance
   */
  getClient() {
    if (!this.client) {
      this.initializeClient();
    }
    return this.client;
  }

  /**
   * Test database connection
   * @returns {Promise<boolean>} True if connection is successful
   */
  async testConnection() {
    try {
      const client = this.getClient();

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
  async execute(sql, params = []) {
    try {
      const client = this.getClient();
      return await client.execute({ sql, args: params });
    } catch (error) {
      console.error("Database query execution failed:", {
        sql: sql.substring(0, 100) + (sql.length > 100 ? "..." : ""),
        error: error.message,
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }

  /**
   * Execute multiple SQL statements in a transaction
   */
  async batch(statements) {
    try {
      const client = this.getClient();
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
 * @returns {Object} LibSQL client instance
 */
export function getDatabaseClient() {
  const service = getDatabase();
  return service.getClient();
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
