/**
 * Database Client
 * Enhanced database client with error handling, logging, and query optimization
 * Optimized for Vercel serverless environment
 */

import { getPool } from './config.js';

/**
 * Database error types for better error handling
 */
export class DatabaseError extends Error {
  constructor(message, code, query, params) {
    super(message);
    this.name = 'DatabaseError';
    this.code = code;
    this.query = query;
    this.params = params;
  }
}

export class ConnectionError extends DatabaseError {
  constructor(message, originalError) {
    super(message, 'CONNECTION_ERROR');
    this.originalError = originalError;
  }
}

export class QueryError extends DatabaseError {
  constructor(message, code, query, params, originalError) {
    super(message, code, query, params);
    this.originalError = originalError;
  }
}

/**
 * Database Client Class
 * Provides enhanced query execution with error handling and logging
 */
class DbClient {
  constructor() {
    this.pool = null;
  }

  /**
   * Initialize database connection
   */
  async init() {
    try {
      this.pool = getPool();
      return this;
    } catch (error) {
      throw new ConnectionError('Failed to initialize database connection', error);
    }
  }

  /**
   * Execute a query with automatic error handling and logging
   * @param {string} query - SQL query
   * @param {Array} params - Query parameters
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Query result
   */
  async query(query, params = [], options = {}) {
    const startTime = Date.now();
    const queryId = Math.random().toString(36).substring(7);
    
    // Ensure pool is initialized
    if (!this.pool) {
      await this.init();
    }

    let client;
    try {
      // Get client from pool
      client = await this.pool.connect();

      // Log query in development
      if (process.env.NODE_ENV === 'development' || options.debug) {
        console.log(`[DB Query ${queryId}] Executing:`, {
          query: query.trim(),
          params: this.sanitizeParams(params),
        });
      }

      // Execute query with timeout
      const result = await client.query({
        text: query,
        values: params,
        rowMode: options.rowMode || 'array',
      });

      const duration = Date.now() - startTime;

      // Log performance in development
      if (process.env.NODE_ENV === 'development' || options.debug) {
        console.log(`[DB Query ${queryId}] Completed in ${duration}ms, returned ${result.rowCount} rows`);
      }

      // Log slow queries in production
      if (duration > 1000) {
        console.warn(`[DB Slow Query ${queryId}] Query took ${duration}ms:`, {
          query: query.trim(),
          duration,
          rowCount: result.rowCount,
        });
      }

      return {
        rows: result.rows,
        rowCount: result.rowCount,
        fields: result.fields,
        command: result.command,
        duration,
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      
      console.error(`[DB Error ${queryId}] Query failed after ${duration}ms:`, {
        error: error.message,
        code: error.code,
        query: query.trim(),
        params: this.sanitizeParams(params),
      });

      // Classify error types
      let dbError;
      if (error.code === '23505') {
        dbError = new QueryError('Duplicate entry', 'DUPLICATE_ENTRY', query, params, error);
      } else if (error.code === '23503') {
        dbError = new QueryError('Foreign key violation', 'FOREIGN_KEY_VIOLATION', query, params, error);
      } else if (error.code === '23502') {
        dbError = new QueryError('Not null violation', 'NOT_NULL_VIOLATION', query, params, error);
      } else if (error.code === '42P01') {
        dbError = new QueryError('Table does not exist', 'TABLE_NOT_FOUND', query, params, error);
      } else if (error.code === '42703') {
        dbError = new QueryError('Column does not exist', 'COLUMN_NOT_FOUND', query, params, error);
      } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        dbError = new ConnectionError('Database connection refused', error);
      } else {
        dbError = new QueryError(error.message, error.code || 'UNKNOWN_ERROR', query, params, error);
      }

      throw dbError;

    } finally {
      // Always release the client back to the pool
      if (client) {
        client.release();
      }
    }
  }

  /**
   * Execute a query and return a single row
   * @param {string} query - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<Object|null>} Single row or null
   */
  async queryOne(query, params = []) {
    const result = await this.query(query, params);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Execute a query and return multiple rows
   * @param {string} query - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<Array>} Array of rows
   */
  async queryMany(query, params = []) {
    const result = await this.query(query, params);
    return result.rows;
  }

  /**
   * Execute multiple queries in a transaction
   * @param {Function} callback - Function that receives the transaction client
   * @returns {Promise<any>} Transaction result
   */
  async transaction(callback) {
    if (!this.pool) {
      await this.init();
    }

    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Create transaction-specific query methods
      const txClient = {
        query: async (query, params = []) => {
          const result = await client.query(query, params);
          return {
            rows: result.rows,
            rowCount: result.rowCount,
            fields: result.fields,
            command: result.command,
          };
        },
        queryOne: async (query, params = []) => {
          const result = await client.query(query, params);
          return result.rows.length > 0 ? result.rows[0] : null;
        },
        queryMany: async (query, params = []) => {
          const result = await client.query(query, params);
          return result.rows;
        }
      };

      const result = await callback(txClient);
      await client.query('COMMIT');
      return result;

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Transaction failed, rolling back:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Check if database is healthy
   * @returns {Promise<boolean>} Health status
   */
  async isHealthy() {
    try {
      const result = await this.query('SELECT 1 as health_check');
      return result.rows.length === 1 && result.rows[0].health_check === 1;
    } catch (error) {
      console.error('Database health check failed:', error);
      return false;
    }
  }

  /**
   * Get database statistics
   * @returns {Promise<Object>} Database stats
   */
  async getStats() {
    try {
      const poolStats = {
        totalCount: this.pool.totalCount,
        idleCount: this.pool.idleCount,
        waitingCount: this.pool.waitingCount,
      };

      const dbStats = await this.queryOne(`
        SELECT 
          count(*) as connection_count,
          pg_database_size(current_database()) as database_size,
          version() as version
        FROM pg_stat_activity 
        WHERE datname = current_database()
      `);

      return {
        pool: poolStats,
        database: dbStats,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Failed to get database stats:', error);
      return null;
    }
  }

  /**
   * Sanitize parameters for logging (remove sensitive data)
   * @private
   */
  sanitizeParams(params) {
    if (!Array.isArray(params)) return params;
    
    return params.map((param, index) => {
      // Don't log potential sensitive data
      if (typeof param === 'string' && (
        param.includes('@') || // emails
        param.length > 50 || // long strings that might be sensitive
        param.startsWith('sk_') || // Stripe keys
        param.startsWith('pk_') // Stripe keys
      )) {
        return `[REDACTED_${index}]`;
      }
      return param;
    });
  }
}

// Export singleton instance
const dbClient = new DbClient();

export default dbClient;

// Export convenience methods
export const query = (sql, params, options) => dbClient.query(sql, params, options);
export const queryOne = (sql, params) => dbClient.queryOne(sql, params);
export const queryMany = (sql, params) => dbClient.queryMany(sql, params);
export const transaction = (callback) => dbClient.transaction(callback);
export const isHealthy = () => dbClient.isHealthy();
export const getStats = () => dbClient.getStats();