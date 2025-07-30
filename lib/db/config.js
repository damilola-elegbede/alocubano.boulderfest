/**
 * Database Configuration for Vercel Postgres
 * Optimized for serverless environment with connection pooling
 */

import { Pool } from 'pg';

// Database configuration for different environments
const dbConfig = {
  production: {
    connectionString: process.env.POSTGRES_URL,
    ssl: { rejectUnauthorized: false },
    max: 20, // Maximum connections in pool
    idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
    connectionTimeoutMillis: 2000, // Connection timeout
    statement_timeout: 30000, // Statement timeout (30 seconds)
    query_timeout: 30000, // Query timeout (30 seconds)
  },
  development: {
    connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
    statement_timeout: 30000,
    query_timeout: 30000,
  },
  test: {
    connectionString: process.env.POSTGRES_URL_TEST || process.env.DATABASE_URL_TEST,
    ssl: false,
    max: 5,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 1000,
  }
};

// Get configuration based on environment
const getDbConfig = () => {
  const env = process.env.NODE_ENV || 'development';
  return dbConfig[env] || dbConfig.development;
};

// Global connection pool (singleton pattern for serverless)
let pool = null;

/**
 * Get or create database connection pool
 * Uses singleton pattern to prevent multiple pools in serverless environment
 */
export const getPool = () => {
  if (!pool) {
    const config = getDbConfig();
    
    if (!config.connectionString) {
      throw new Error('Database connection string not found. Please set POSTGRES_URL environment variable.');
    }

    pool = new Pool(config);

    // Handle pool errors
    pool.on('error', (err) => {
      console.error('Database pool error:', err);
      // Don't exit the process, just log the error
    });

    // Handle pool connection events
    pool.on('connect', (client) => {
      console.log('New database connection established');
    });

    pool.on('remove', (client) => {
      console.log('Database connection removed from pool');
    });
  }

  return pool;
};

/**
 * Close database pool
 * Should be called when shutting down the application
 */
export const closePool = async () => {
  if (pool) {
    await pool.end();
    pool = null;
  }
};

/**
 * Get database configuration for current environment
 */
export const getDatabaseConfig = () => getDbConfig();

/**
 * Test database connection
 */
export const testConnection = async () => {
  const testPool = getPool();
  try {
    const client = await testPool.connect();
    const result = await client.query('SELECT NOW() as current_time, version() as version');
    client.release();
    return {
      success: true,
      timestamp: result.rows[0].current_time,
      version: result.rows[0].version,
    };
  } catch (error) {
    console.error('Database connection test failed:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

// Export the pool instance
export { pool };