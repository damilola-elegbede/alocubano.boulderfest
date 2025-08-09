import Database from 'better-sqlite3';
import { getMemoryCache } from '../cache/memory-cache.js';
import { getRedisCache } from '../cache/redis-cache.js';

class QueryOptimizer {
  constructor(databasePath) {
    this.databasePath = databasePath;
    this.db = null;
    this.slowQueryThreshold = 50; // milliseconds
    this.queryStats = new Map();
    this.queryCache = getMemoryCache('database');
    this.redisCache = getRedisCache();
    this.connectionPool = [];
    this.maxConnections = 10;
    
    // Query patterns and their optimizations
    this.optimizationPatterns = new Map();
    this.setupOptimizationPatterns();
  }

  async initialize() {
    // Initialize primary connection
    this.db = new Database(this.databasePath, {
      readonly: false,
      fileMustExist: false,
      timeout: 5000,
      verbose: process.env.NODE_ENV === 'development' ? console.log : null,
    });

    // Enable WAL mode for better concurrency
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('cache_size = -64000'); // 64MB cache
    this.db.pragma('temp_store = MEMORY');
    
    // Initialize connection pool for read operations
    this.initializeConnectionPool();
    
    // Connect to Redis if available
    await this.redisCache.connect();
    
    // Analyze existing schema
    await this.analyzeSchema();
  }

  initializeConnectionPool() {
    for (let i = 0; i < this.maxConnections; i++) {
      const conn = new Database(this.databasePath, {
        readonly: true,
        fileMustExist: true,
        timeout: 5000,
      });
      
      conn.pragma('journal_mode = WAL');
      conn.pragma('cache_size = -32000'); // 32MB cache per connection
      
      this.connectionPool.push({
        connection: conn,
        inUse: false,
        lastUsed: Date.now(),
      });
    }
  }

  getReadConnection() {
    // Find available connection from pool
    const available = this.connectionPool.find(c => !c.inUse);
    if (available) {
      available.inUse = true;
      available.lastUsed = Date.now();
      return available;
    }
    
    // Fallback to main connection if pool exhausted
    return { connection: this.db, inUse: false };
  }

  releaseConnection(poolItem) {
    if (poolItem && poolItem !== this.db) {
      poolItem.inUse = false;
    }
  }

  setupOptimizationPatterns() {
    // Common query patterns and their optimizations
    this.optimizationPatterns.set('SELECT.*FROM tickets WHERE.*qr_code', {
      index: 'idx_tickets_qr_code',
      cache: true,
      ttl: 60,
    });
    
    this.optimizationPatterns.set('SELECT.*FROM tickets WHERE.*user_id', {
      index: 'idx_tickets_user_id',
      cache: true,
      ttl: 120,
    });
    
    this.optimizationPatterns.set('SELECT COUNT.*FROM tickets', {
      index: null,
      cache: true,
      ttl: 30,
    });
    
    this.optimizationPatterns.set('SELECT.*FROM analytics.*GROUP BY', {
      index: 'idx_analytics_composite',
      cache: true,
      ttl: 300,
    });
  }

  async analyzeQuery(sql, params = []) {
    const startTime = process.hrtime.bigint();
    const cacheKey = this.generateCacheKey(sql, params);
    
    // Check cache first
    const cached = await this.checkCache(cacheKey);
    if (cached) {
      this.recordQueryStats(sql, 0, true); // 0ms for cache hit
      return cached;
    }
    
    // Get read connection for SELECT queries
    const isSelect = sql.trim().toUpperCase().startsWith('SELECT');
    const poolItem = isSelect ? this.getReadConnection() : { connection: this.db };
    
    try {
      const stmt = poolItem.connection.prepare(sql);
      const result = params.length > 0 
        ? (isSelect ? stmt.all(...params) : stmt.run(...params))
        : (isSelect ? stmt.all() : stmt.run());
      
      const duration = Number(process.hrtime.bigint() - startTime) / 1000000; // Convert to ms
      
      // Record statistics
      await this.recordQueryStats(sql, duration, false);
      
      // Check for slow query
      if (duration > this.slowQueryThreshold) {
        await this.handleSlowQuery(sql, duration, params);
      }
      
      // Cache result if applicable
      if (isSelect && result && duration > 10) { // Cache queries taking >10ms
        await this.cacheResult(cacheKey, result, sql);
      }
      
      return result;
    } catch (error) {
      const duration = Number(process.hrtime.bigint() - startTime) / 1000000;
      await this.recordQueryError(sql, error, duration);
      throw error;
    } finally {
      if (isSelect) {
        this.releaseConnection(poolItem);
      }
    }
  }

  generateCacheKey(sql, params) {
    const normalizedSql = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    return `query:${normalizedSql}:${JSON.stringify(params)}`;
  }

  async checkCache(key) {
    // Try memory cache first
    const memCached = this.queryCache.get(key);
    if (memCached) return memCached;
    
    // Try Redis cache
    if (this.redisCache.connected) {
      const redisCached = await this.redisCache.get(key, 'queries');
      if (redisCached) {
        // Populate memory cache
        this.queryCache.set(key, redisCached, 30);
        return redisCached;
      }
    }
    
    return null;
  }

  async cacheResult(key, result, sql) {
    // Determine TTL based on query pattern
    let ttl = 60; // Default 1 minute
    
    for (const [pattern, config] of this.optimizationPatterns) {
      if (new RegExp(pattern, 'i').test(sql)) {
        ttl = config.ttl;
        break;
      }
    }
    
    // Store in memory cache
    this.queryCache.set(key, result, ttl);
    
    // Store in Redis if available
    if (this.redisCache.connected) {
      await this.redisCache.set(key, result, ttl, 'queries');
    }
  }

  async recordQueryStats(sql, duration, cached) {
    const key = sql.replace(/\s+/g, ' ').trim();
    
    if (!this.queryStats.has(key)) {
      this.queryStats.set(key, {
        count: 0,
        totalTime: 0,
        avgTime: 0,
        maxTime: 0,
        minTime: Infinity,
        cacheHits: 0,
        lastExecuted: Date.now(),
      });
    }
    
    const stats = this.queryStats.get(key);
    stats.count++;
    
    if (cached) {
      stats.cacheHits++;
    } else {
      stats.totalTime += duration;
      stats.avgTime = stats.totalTime / (stats.count - stats.cacheHits);
      stats.maxTime = Math.max(stats.maxTime, duration);
      stats.minTime = Math.min(stats.minTime, duration);
    }
    
    stats.lastExecuted = Date.now();
  }

  async recordQueryError(sql, error, duration) {
    console.error(`Query error after ${duration.toFixed(2)}ms:`, sql);
    console.error('Error:', error.message);
    
    // Track error patterns
    const errorKey = `error:${sql.substring(0, 50)}`;
    if (!this.queryStats.has(errorKey)) {
      this.queryStats.set(errorKey, {
        count: 0,
        errors: [],
      });
    }
    
    const stats = this.queryStats.get(errorKey);
    stats.count++;
    stats.errors.push({
      message: error.message,
      timestamp: Date.now(),
      duration: duration,
    });
  }

  async handleSlowQuery(sql, duration, params) {
    console.warn(`Slow query detected (${duration.toFixed(2)}ms):`, sql.substring(0, 100));
    
    // Analyze query plan
    const explainResult = await this.explainQuery(sql, params);
    
    // Generate optimization suggestions
    const suggestions = this.generateOptimizationSuggestions(sql, explainResult);
    
    // Log to monitoring
    if (global.performanceTracker) {
      global.performanceTracker.recordSlowQuery({
        sql: sql,
        duration: duration,
        params: params,
        explain: explainResult,
        suggestions: suggestions,
      });
    }
  }

  async explainQuery(sql, params) {
    try {
      const explainSql = `EXPLAIN QUERY PLAN ${sql}`;
      const stmt = this.db.prepare(explainSql);
      return params.length > 0 ? stmt.all(...params) : stmt.all();
    } catch (error) {
      console.error('Failed to explain query:', error);
      return null;
    }
  }

  generateOptimizationSuggestions(sql, explainResult) {
    const suggestions = [];
    
    // Check for missing indexes
    if (explainResult) {
      for (const row of explainResult) {
        if (row.detail && row.detail.includes('SCAN TABLE')) {
          suggestions.push({
            type: 'INDEX',
            message: 'Consider adding an index to avoid full table scan',
            priority: 'HIGH',
          });
        }
      }
    }
    
    // Check for SELECT *
    if (/SELECT\s+\*/.test(sql)) {
      suggestions.push({
        type: 'QUERY',
        message: 'Avoid SELECT *, specify only needed columns',
        priority: 'MEDIUM',
      });
    }
    
    // Check for missing LIMIT in large result sets
    if (/SELECT/.test(sql) && !/LIMIT/.test(sql)) {
      suggestions.push({
        type: 'QUERY',
        message: 'Consider adding LIMIT clause for large result sets',
        priority: 'LOW',
      });
    }
    
    return suggestions;
  }

  async analyzeSchema() {
    // Get all tables
    const tables = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    
    for (const table of tables) {
      // Get table info
      const columns = this.db.prepare(`PRAGMA table_info(${table.name})`).all();
      
      // Get existing indexes
      const indexes = this.db.prepare(`PRAGMA index_list(${table.name})`).all();
      
      // Analyze and suggest optimizations
      await this.analyzeTableOptimizations(table.name, columns, indexes);
    }
  }

  async analyzeTableOptimizations(tableName, columns, indexes) {
    const recommendations = [];
    
    // Check for primary key
    const hasPrimaryKey = columns.some(col => col.pk > 0);
    if (!hasPrimaryKey) {
      recommendations.push({
        table: tableName,
        type: 'PRIMARY_KEY',
        message: `Table ${tableName} lacks a primary key`,
        priority: 'HIGH',
      });
    }
    
    // Check for commonly queried columns without indexes
    const indexedColumns = new Set();
    for (const index of indexes) {
      const indexInfo = this.db.prepare(`PRAGMA index_info(${index.name})`).all();
      indexInfo.forEach(info => indexedColumns.add(info.name));
    }
    
    // Suggest indexes for foreign keys and commonly filtered columns
    for (const column of columns) {
      if (column.name.endsWith('_id') && !indexedColumns.has(column.name)) {
        recommendations.push({
          table: tableName,
          type: 'INDEX',
          message: `Consider adding index on ${tableName}.${column.name}`,
          sql: `CREATE INDEX idx_${tableName}_${column.name} ON ${tableName}(${column.name})`,
          priority: 'HIGH',
        });
      }
    }
    
    return recommendations;
  }

  async optimizeDatabase() {
    console.log('Starting database optimization...');
    
    const optimizations = {
      analyzed: [],
      vacuumed: false,
      indexesCreated: [],
      recommendations: [],
    };
    
    // Run ANALYZE to update statistics
    this.db.exec('ANALYZE');
    optimizations.analyzed.push('Updated database statistics');
    
    // Get optimization recommendations
    const tables = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    
    for (const table of tables) {
      const columns = this.db.prepare(`PRAGMA table_info(${table.name})`).all();
      const indexes = this.db.prepare(`PRAGMA index_list(${table.name})`).all();
      const recommendations = await this.analyzeTableOptimizations(table.name, columns, indexes);
      
      // Apply safe optimizations
      for (const rec of recommendations) {
        if (rec.priority === 'HIGH' && rec.sql) {
          try {
            this.db.exec(rec.sql);
            optimizations.indexesCreated.push(rec.sql);
            console.log(`Created index: ${rec.sql}`);
          } catch (error) {
            console.error(`Failed to create index: ${error.message}`);
            optimizations.recommendations.push(rec);
          }
        } else {
          optimizations.recommendations.push(rec);
        }
      }
    }
    
    // Vacuum database to reclaim space (do this last as it locks the database)
    if (process.env.NODE_ENV !== 'production') {
      this.db.exec('VACUUM');
      optimizations.vacuumed = true;
    }
    
    return optimizations;
  }

  async generatePerformanceReport() {
    const report = {
      timestamp: new Date().toISOString(),
      database: this.databasePath,
      statistics: {
        totalQueries: 0,
        slowQueries: 0,
        cacheHitRate: 0,
        avgQueryTime: 0,
      },
      topSlowQueries: [],
      topFrequentQueries: [],
      recommendations: [],
    };
    
    // Calculate statistics
    let totalQueries = 0;
    let totalTime = 0;
    let totalCacheHits = 0;
    let slowQueries = [];
    
    for (const [sql, stats] of this.queryStats) {
      if (sql.startsWith('error:')) continue;
      
      totalQueries += stats.count;
      totalTime += stats.totalTime || 0;
      totalCacheHits += stats.cacheHits || 0;
      
      if (stats.avgTime > this.slowQueryThreshold) {
        slowQueries.push({
          sql: sql.substring(0, 200),
          avgTime: stats.avgTime,
          count: stats.count,
          totalTime: stats.totalTime,
        });
      }
    }
    
    report.statistics.totalQueries = totalQueries;
    report.statistics.slowQueries = slowQueries.length;
    report.statistics.cacheHitRate = totalQueries > 0 ? totalCacheHits / totalQueries : 0;
    report.statistics.avgQueryTime = totalQueries > 0 ? totalTime / totalQueries : 0;
    
    // Get top slow queries
    report.topSlowQueries = slowQueries
      .sort((a, b) => b.totalTime - a.totalTime)
      .slice(0, 10);
    
    // Get top frequent queries
    report.topFrequentQueries = Array.from(this.queryStats.entries())
      .filter(([sql]) => !sql.startsWith('error:'))
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([sql, stats]) => ({
        sql: sql.substring(0, 200),
        count: stats.count,
        avgTime: stats.avgTime,
        cacheHits: stats.cacheHits,
      }));
    
    // Add cache statistics
    report.cacheStatistics = {
      memory: this.queryCache.getCacheStats(),
      redis: this.redisCache.getCacheStats(),
    };
    
    return report;
  }

  close() {
    // Close connection pool
    for (const poolItem of this.connectionPool) {
      poolItem.connection.close();
    }
    
    // Close main connection
    if (this.db) {
      this.db.close();
    }
    
    // Close cache connections
    this.queryCache.close();
    this.redisCache.disconnect();
  }
}

export default QueryOptimizer;