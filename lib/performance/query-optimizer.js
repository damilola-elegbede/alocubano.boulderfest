/**
 * Query Optimizer for Festival Database
 * Provides advanced query optimization and performance monitoring
 *
 * Features:
 * - Query pattern recognition and categorization
 * - Performance tracking and metrics collection
 * - Slow query detection and logging
 * - Index recommendation generation
 * - Connection pool optimization
 * - Prepared statement caching
 * - Real-time performance monitoring
 * - Festival-specific query optimizations
 */

import { EventEmitter } from "events";
import { performance } from "perf_hooks";
import crypto from "node:crypto";

// Query categories for festival system
const QUERY_CATEGORIES = {
  TICKET_LOOKUP: "TICKET_LOOKUP",
  TICKET_VALIDATION: "TICKET_VALIDATION",
  TICKET_PURCHASE: "TICKET_PURCHASE",
  CHECK_IN: "CHECK_IN",
  EVENT_STATISTICS: "EVENT_STATISTICS",
  USER_PROFILE: "USER_PROFILE",
  INVENTORY_CHECK: "INVENTORY_CHECK",
  REPORTING: "REPORTING",
  QR_VALIDATION: "QR_VALIDATION",
  GENERAL: "GENERAL",
};

// Performance thresholds (in ms)
const PERFORMANCE_THRESHOLDS = {
  FAST_QUERY: 10,
  NORMAL_QUERY: 50,
  SLOW_QUERY: 100,
  CRITICAL_QUERY: 500,
};

// Query patterns for categorization
const QUERY_PATTERNS = {
  [QUERY_CATEGORIES.TICKET_LOOKUP]: [
    /tickets.*where.*id\s*=/i,
    /tickets.*where.*order_id\s*=/i,
    /tickets.*join.*orders/i,
  ],
  [QUERY_CATEGORIES.TICKET_VALIDATION]: [
    /tickets.*where.*qr_code\s*=/i,
    /tickets.*validation_token/i,
    /is_valid\s*=\s*true/i,
  ],
  [QUERY_CATEGORIES.QR_VALIDATION]: [
    /qr_code\s*=/i,
    /validation.*qr/i,
    /scan.*validation/i,
  ],
  [QUERY_CATEGORIES.CHECK_IN]: [
    /update.*tickets.*set.*checked_in/i,
    /check_in_time\s*=/i,
    /attendee.*status/i,
  ],
  [QUERY_CATEGORIES.EVENT_STATISTICS]: [
    /count.*tickets/i,
    /group by.*event/i,
    /aggregate.*attendance/i,
    /statistics.*report/i,
  ],
  [QUERY_CATEGORIES.INVENTORY_CHECK]: [
    /tickets_available/i,
    /capacity.*remaining/i,
    /sold_count/i,
  ],
};

// Index recommendations by category
const INDEX_RECOMMENDATIONS = {
  [QUERY_CATEGORIES.TICKET_LOOKUP]: [
    "CREATE INDEX idx_tickets_id ON tickets(id)",
    "CREATE INDEX idx_tickets_order_id ON tickets(order_id)",
  ],
  [QUERY_CATEGORIES.QR_VALIDATION]: [
    "CREATE INDEX idx_tickets_qr_code ON tickets(qr_code)",
    "CREATE INDEX idx_tickets_validation ON tickets(validation_token, is_valid)",
  ],
  [QUERY_CATEGORIES.CHECK_IN]: [
    "CREATE INDEX idx_tickets_checkin ON tickets(checked_in, check_in_time)",
    "CREATE INDEX idx_tickets_event_checkin ON tickets(event_id, checked_in)",
  ],
  [QUERY_CATEGORIES.EVENT_STATISTICS]: [
    "CREATE INDEX idx_tickets_event_stats ON tickets(event_id, ticket_type, created_at)",
  ],
};

/**
 * Main QueryOptimizer class
 */
export class QueryOptimizer extends EventEmitter {
  constructor(databaseService, options = {}) {
    super();
    this.db = databaseService;
    this.options = {
      enableMonitoring: true,
      cacheQueries: true,
      maxPreparedStatements: 100,
      connectionPoolSize: 10,
      ...options,
    };

    // Query metrics storage
    this.queryMetrics = new Map();
    this.slowQueryLog = [];
    this.performanceHistory = [];
    this.indexRecommendations = new Set();

    // Prepared statement cache
    this.preparedStatements = new Map();

    // Connection pool info
    this.connectionPool = {
      size: this.options.connectionPoolSize,
      active: 0,
      idle: this.options.connectionPoolSize,
      waiting: 0,
    };

    // Initialize monitoring
    this.isMonitoring = false;
    if (this.options.enableMonitoring) {
      this.startPerformanceMonitoring();
    }

    // Detect database type
    this.dbType = this.detectDatabaseType();
  }

  /**
   * Start performance monitoring
   */
  startPerformanceMonitoring() {
    if (this.isMonitoring) return;

    this.isMonitoring = true;

    // Monitor every 30 seconds
    this.monitoringInterval = setInterval(() => {
      this.analyzePerformance();
      this.cleanupOldMetrics();
    }, 30000);

    // Deep analysis every 5 minutes
    this.deepAnalysisInterval = setInterval(() => {
      this.performDeepAnalysis();
    }, 300000);

    console.log("🔍 Query optimization monitoring started");
  }

  /**
   * Stop performance monitoring
   */
  stopPerformanceMonitoring() {
    if (!this.isMonitoring) return;

    this.isMonitoring = false;
    clearInterval(this.monitoringInterval);
    clearInterval(this.deepAnalysisInterval);

    console.log("🛑 Query optimization monitoring stopped");
  }

  /**
   * Wrap database execute method with performance tracking
   */
  async executeWithTracking(queryOrObject, params = [], options = {}) {
    const startTime = performance.now();
    const queryId = this.generateQueryId(queryOrObject);
    const sql =
      typeof queryOrObject === "string" ? queryOrObject : queryOrObject.sql;
    const args =
      typeof queryOrObject === "string" ? params : queryOrObject.args;

    // Analyze query before execution
    const analysis = this.analyzeQuery(sql);

    try {
      // Check for cached prepared statement
      const prepared = this.getPreparedStatement(sql);

      // Execute query
      let result;
      if (prepared && this.dbType === "postgresql") {
        result = await this.db.execute(prepared.query, args);
      } else {
        result = await this.db.execute(queryOrObject, params);
      }

      const executionTime = performance.now() - startTime;

      // Record metrics
      this.recordQueryMetrics(queryId, sql, executionTime, analysis, true);

      // Check for performance issues
      if (executionTime > PERFORMANCE_THRESHOLDS.SLOW_QUERY) {
        this.handleSlowQuery(sql, executionTime, analysis);
      }

      return result;
    } catch (error) {
      const executionTime = performance.now() - startTime;
      this.recordQueryMetrics(
        queryId,
        sql,
        executionTime,
        analysis,
        false,
        error,
      );

      // Emit error event for monitoring
      this.emit("query-error", {
        sql: sql.substring(0, 100),
        executionTime,
        error: error.message,
        timestamp: new Date(),
      });

      throw error;
    }
  }

  /**
   * Generate unique query ID for tracking
   */
  generateQueryId(queryOrObject) {
    const sql =
      typeof queryOrObject === "string" ? queryOrObject : queryOrObject.sql;
    return crypto
      .createHash("md5")
      .update(sql.trim().toLowerCase())
      .digest("hex")
      .substring(0, 8);
  }

  /**
   * Analyze query characteristics and categorize
   */
  analyzeQuery(sql) {
    // Handle null/undefined input gracefully
    if (!sql || typeof sql !== "string") {
      return {
        queryType: "OTHER",
        category: "GENERAL",
        complexity: "LOW",
        optimizations: [],
        hasSubqueries: false,
        hasJoins: false,
        hasAggregations: false,
        usesWildcard: false,
        estimatedRows: 0,
      };
    }

    const normalizedSql = sql.trim().toLowerCase();

    // Determine query type
    let queryType = "OTHER";
    if (normalizedSql.startsWith("select")) queryType = "SELECT";
    else if (normalizedSql.startsWith("insert")) queryType = "INSERT";
    else if (normalizedSql.startsWith("update")) queryType = "UPDATE";
    else if (normalizedSql.startsWith("delete")) queryType = "DELETE";

    // Categorize query
    let category = QUERY_CATEGORIES.GENERAL;
    for (const [cat, patterns] of Object.entries(QUERY_PATTERNS)) {
      if (patterns.some((pattern) => pattern.test(sql))) {
        category = cat;
        break;
      }
    }

    // Analyze complexity
    const hasSubqueries = /\(\s*select/i.test(sql);
    const hasJoins = /join/i.test(sql);
    const hasAggregations = /count|sum|avg|max|min|group by/i.test(sql);
    const usesWildcard = /select\s+\*/i.test(sql);

    // Estimate complexity
    let complexity = "LOW";
    const complexityScore =
      (hasSubqueries ? 3 : 0) +
      (hasJoins ? 2 : 0) +
      (hasAggregations ? 2 : 0) +
      (usesWildcard ? 1 : 0);

    if (complexityScore >= 5) complexity = "HIGH";
    else if (complexityScore >= 3) complexity = "MEDIUM";

    // Suggest optimizations
    const optimizations = [];
    if (usesWildcard) {
      optimizations.push("Specify exact columns instead of SELECT *");
    }
    if (hasSubqueries) {
      optimizations.push("Consider using JOINs instead of subqueries");
    }
    if (!normalizedSql.includes("limit") && queryType === "SELECT") {
      optimizations.push("Add LIMIT clause to prevent large result sets");
    }

    return {
      queryType,
      category,
      complexity,
      optimizations,
      hasSubqueries,
      hasJoins,
      hasAggregations,
      usesWildcard,
      estimatedRows: this.estimateRowCount(sql, category),
    };
  }

  /**
   * Estimate row count based on query category
   */
  estimateRowCount(sql, category) {
    // Festival-specific estimations
    const estimations = {
      [QUERY_CATEGORIES.TICKET_LOOKUP]: 1, // Single ticket lookup
      [QUERY_CATEGORIES.QR_VALIDATION]: 1, // Single QR validation
      [QUERY_CATEGORIES.CHECK_IN]: 1, // Single check-in update
      [QUERY_CATEGORIES.EVENT_STATISTICS]: 100, // Statistics aggregation
      [QUERY_CATEGORIES.INVENTORY_CHECK]: 10, // Inventory summary
      [QUERY_CATEGORIES.TICKET_VALIDATION]: 1, // Single validation
      [QUERY_CATEGORIES.TICKET_PURCHASE]: 5, // Average cart size
      [QUERY_CATEGORIES.USER_PROFILE]: 20, // User's tickets
      [QUERY_CATEGORIES.REPORTING]: 1000, // Large reports
      [QUERY_CATEGORIES.GENERAL]: 50, // Default estimate
    };

    return estimations[category] || 50;
  }

  /**
   * Create optimized query for common patterns
   */
  optimizeQuery(sql, category) {
    const optimizations = {
      [QUERY_CATEGORIES.TICKET_LOOKUP]: (query) => {
        // Add index hint for ticket lookups
        if (this.dbType === "postgresql") {
          return query.replace(
            /FROM tickets/i,
            "FROM tickets /*+ INDEX(idx_tickets_id) */",
          );
        }
        return query;
      },
      [QUERY_CATEGORIES.QR_VALIDATION]: (query) => {
        // Ensure QR validation uses index
        if (this.dbType === "postgresql") {
          return query.replace(
            /FROM tickets/i,
            "FROM tickets /*+ INDEX(idx_tickets_qr_code) */",
          );
        }
        return query;
      },
      [QUERY_CATEGORIES.EVENT_STATISTICS]: (query) => {
        // Add sampling for large statistics queries
        if (query.toLowerCase().includes("count(*)") && !query.includes("TABLESAMPLE")) {
          return query.replace(/FROM tickets/i, "FROM tickets TABLESAMPLE SYSTEM (10)");
        }
        return query;
      },
    };

    const optimizer = optimizations[category];
    return optimizer ? optimizer(sql) : sql;
  }

  /**
   * Record query execution metrics
   */
  recordQueryMetrics(
    queryId,
    sql,
    executionTime,
    analysis,
    success,
    error = null,
  ) {
    const timestamp = new Date();

    if (!this.queryMetrics.has(queryId)) {
      this.queryMetrics.set(queryId, {
        sql: sql.substring(0, 200),
        category: analysis.category,
        queryType: analysis.queryType,
        complexity: analysis.complexity,
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        totalTime: 0,
        minTime: Infinity,
        maxTime: 0,
        avgTime: 0,
        lastExecuted: null,
        optimizations: analysis.optimizations,
        firstSeen: timestamp,
      });
    }

    const metrics = this.queryMetrics.get(queryId);
    metrics.totalExecutions++;
    metrics.totalTime += executionTime;
    metrics.minTime = Math.min(metrics.minTime, executionTime);
    metrics.maxTime = Math.max(metrics.maxTime, executionTime);
    metrics.avgTime = metrics.totalTime / metrics.totalExecutions;
    metrics.lastExecuted = timestamp;

    if (success) {
      metrics.successfulExecutions++;
    } else {
      metrics.failedExecutions++;
      metrics.lastError = error?.message;
    }

    // Add to performance history
    this.performanceHistory.push({
      queryId,
      executionTime,
      timestamp,
      success,
      category: analysis.category,
    });

    // Limit history size
    if (this.performanceHistory.length > 10000) {
      this.performanceHistory.splice(0, 5000);
    }
  }

  /**
   * Handle slow query detection
   */
  handleSlowQuery(sql, executionTime, analysis) {
    const slowQuery = {
      sql: sql.substring(0, 500),
      executionTime,
      category: analysis.category,
      complexity: analysis.complexity,
      optimizations: analysis.optimizations,
      timestamp: new Date(),
    };

    this.slowQueryLog.push(slowQuery);

    // Limit slow query log size
    if (this.slowQueryLog.length > 1000) {
      this.slowQueryLog.splice(0, 500);
    }

    // Add index recommendations
    if (INDEX_RECOMMENDATIONS[analysis.category]) {
      INDEX_RECOMMENDATIONS[analysis.category].forEach((idx) => {
        this.indexRecommendations.add(idx);
      });
    }

    // Emit slow query event
    this.emit("slow-query", slowQuery);

    // Log critical queries
    if (executionTime > PERFORMANCE_THRESHOLDS.CRITICAL_QUERY) {
      console.warn(`🐌 Critical slow query (${executionTime.toFixed(2)}ms):`, {
        category: analysis.category,
        complexity: analysis.complexity,
        sql: sql.substring(0, 100) + "...",
      });
    }
  }

  /**
   * Get or create prepared statement
   */
  getPreparedStatement(sql) {
    const hash = crypto.createHash("md5").update(sql).digest("hex");

    if (this.preparedStatements.has(hash)) {
      const prepared = this.preparedStatements.get(hash);
      prepared.useCount++;
      prepared.lastUsed = new Date();
      return prepared;
    }

    // Only prepare frequently used queries
    const metrics = Array.from(this.queryMetrics.values()).find(
      (m) => m.sql === sql.substring(0, 200),
    );

    if (metrics && metrics.totalExecutions > 10) {
      const prepared = {
        query: sql,
        hash,
        useCount: 1,
        created: new Date(),
        lastUsed: new Date(),
      };

      // Limit prepared statement cache size
      if (this.preparedStatements.size >= this.options.maxPreparedStatements) {
        // Remove least recently used
        const lru = Array.from(this.preparedStatements.entries()).sort(
          (a, b) => a[1].lastUsed - b[1].lastUsed,
        )[0];
        this.preparedStatements.delete(lru[0]);
      }

      this.preparedStatements.set(hash, prepared);
      return prepared;
    }

    return null;
  }

  /**
   * Analyze overall performance
   */
  analyzePerformance() {
    const analysis = {
      timestamp: new Date(),
      totalQueries: this.queryMetrics.size,
      recentQueries: this.performanceHistory.filter(
        (h) => Date.now() - h.timestamp < 60000,
      ).length,
      slowQueries: this.slowQueryLog.length,
      recommendations: Array.from(this.indexRecommendations),
    };

    // Calculate performance by category
    const categoryPerformance = {};
    for (const [, metrics] of this.queryMetrics) {
      if (!categoryPerformance[metrics.category]) {
        categoryPerformance[metrics.category] = {
          count: 0,
          avgTime: 0,
          totalTime: 0,
        };
      }
      const cat = categoryPerformance[metrics.category];
      cat.count++;
      cat.totalTime += metrics.totalTime;
      cat.avgTime = cat.totalTime / cat.count;
    }

    analysis.categoryPerformance = categoryPerformance;

    // Identify problematic queries
    const problematicQueries = Array.from(this.queryMetrics.entries())
      .filter(([, m]) => m.avgTime > PERFORMANCE_THRESHOLDS.SLOW_QUERY)
      .sort((a, b) => b[1].avgTime - a[1].avgTime)
      .slice(0, 10)
      .map(([id, m]) => ({
        queryId: id,
        category: m.category,
        avgTime: m.avgTime,
        executions: m.totalExecutions,
        sql: m.sql.substring(0, 50) + "...",
      }));

    analysis.problematicQueries = problematicQueries;

    // Emit performance analysis
    this.emit("performance-analysis", analysis);

    return analysis;
  }

  /**
   * Perform deep analysis for optimization opportunities
   */
  performDeepAnalysis() {
    const analysis = {
      timestamp: new Date(),
      optimizationOpportunities: [],
    };

    // Find queries that could benefit from caching
    const cacheableCandidates = Array.from(this.queryMetrics.entries())
      .filter(
        ([, m]) =>
          m.queryType === "SELECT" &&
          m.totalExecutions > 100 &&
          m.complexity === "LOW",
      )
      .map(([id, m]) => ({
        queryId: id,
        category: m.category,
        executions: m.totalExecutions,
        avgTime: m.avgTime,
        potentialTimeSaved: m.totalTime * 0.9, // Assume 90% reduction with cache
      }));

    if (cacheableCandidates.length > 0) {
      analysis.optimizationOpportunities.push({
        type: "CACHING",
        description: "Queries that would benefit from caching",
        candidates: cacheableCandidates,
      });
    }

    // Find queries that need indexes
    const indexCandidates = Array.from(this.queryMetrics.entries())
      .filter(
        ([, m]) =>
          m.avgTime > PERFORMANCE_THRESHOLDS.NORMAL_QUERY &&
          INDEX_RECOMMENDATIONS[m.category],
      )
      .map(([id, m]) => ({
        queryId: id,
        category: m.category,
        avgTime: m.avgTime,
        recommendations: INDEX_RECOMMENDATIONS[m.category],
      }));

    if (indexCandidates.length > 0) {
      analysis.optimizationOpportunities.push({
        type: "INDEXING",
        description: "Queries that need indexes",
        candidates: indexCandidates,
      });
    }

    // Find N+1 query patterns
    const recentQueries = this.performanceHistory
      .filter((h) => Date.now() - h.timestamp < 60000)
      .map((h) => this.queryMetrics.get(h.queryId));

    const similarQueries = {};
    recentQueries.forEach((m) => {
      if (m) {
        const pattern = m.sql.replace(/\d+/g, "?").substring(0, 50);
        if (!similarQueries[pattern]) {
          similarQueries[pattern] = 0;
        }
        similarQueries[pattern]++;
      }
    });

    const nplusOnePatterns = Object.entries(similarQueries)
      .filter(([, count]) => count > 10)
      .map(([pattern, count]) => ({
        pattern,
        count,
        recommendation: "Consider batch loading or JOIN operations",
      }));

    if (nplusOnePatterns.length > 0) {
      analysis.optimizationOpportunities.push({
        type: "N+1_QUERIES",
        description: "Potential N+1 query patterns detected",
        patterns: nplusOnePatterns,
      });
    }

    // Emit deep analysis results
    this.emit("deep-analysis", analysis);

    return analysis;
  }

  /**
   * Get query statistics by category
   */
  getQueryCategoryBreakdown() {
    const breakdown = {};

    for (const [, metrics] of this.queryMetrics) {
      if (!breakdown[metrics.category]) {
        breakdown[metrics.category] = {
          count: 0,
          totalTime: 0,
          avgTime: 0,
          minTime: Infinity,
          maxTime: 0,
          successRate: 0,
        };
      }

      const cat = breakdown[metrics.category];
      cat.count += metrics.totalExecutions;
      cat.totalTime += metrics.totalTime;
      cat.minTime = Math.min(cat.minTime, metrics.minTime);
      cat.maxTime = Math.max(cat.maxTime, metrics.maxTime);
      cat.avgTime = cat.totalTime / cat.count;
      cat.successRate =
        (metrics.successfulExecutions / metrics.totalExecutions) * 100;
    }

    return breakdown;
  }

  /**
   * Get top slow queries
   */
  getTopSlowQueries(limit = 10) {
    return this.slowQueryLog
      .sort((a, b) => b.executionTime - a.executionTime)
      .slice(0, limit)
      .map((q) => ({
        ...q,
        sql: q.sql.substring(0, 100) + "...",
      }));
  }

  /**
   * Get optimization opportunities summary
   */
  getOptimizationOpportunities() {
    const opportunities = [];

    // Check for missing indexes
    if (this.indexRecommendations.size > 0) {
      opportunities.push({
        type: "MISSING_INDEXES",
        severity: "HIGH",
        recommendations: Array.from(this.indexRecommendations),
      });
    }

    // Check for slow queries
    const slowQueryCount = this.slowQueryLog.length;
    if (slowQueryCount > 10) {
      opportunities.push({
        type: "SLOW_QUERIES",
        severity: "MEDIUM",
        count: slowQueryCount,
        topCategories: this.getSlowQueryCategories(),
      });
    }

    // Check for inefficient patterns
    const inefficientQueries = Array.from(this.queryMetrics.values()).filter(
      (m) => m.optimizations.length > 0,
    );

    if (inefficientQueries.length > 0) {
      opportunities.push({
        type: "INEFFICIENT_PATTERNS",
        severity: "LOW",
        count: inefficientQueries.length,
        commonIssues: this.getCommonIssues(inefficientQueries),
      });
    }

    return opportunities;
  }

  /**
   * Get slow query categories
   */
  getSlowQueryCategories() {
    const categories = {};
    this.slowQueryLog.forEach((q) => {
      categories[q.category] = (categories[q.category] || 0) + 1;
    });
    return Object.entries(categories)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([cat, count]) => ({ category: cat, count }));
  }

  /**
   * Get common issues from queries
   */
  getCommonIssues(queries) {
    const issues = {};
    queries.forEach((q) => {
      q.optimizations.forEach((opt) => {
        issues[opt] = (issues[opt] || 0) + 1;
      });
    });
    return Object.entries(issues)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([issue, count]) => ({ issue, count }));
  }

  /**
   * Clean up old metrics to prevent memory leaks
   */
  cleanupOldMetrics() {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago

    // Clean old query metrics that haven't been executed recently
    for (const [queryId, metrics] of this.queryMetrics) {
      // Remove entries that are old or don't have lastExecuted timestamp
      if (!metrics.lastExecuted || metrics.lastExecuted < cutoff) {
        this.queryMetrics.delete(queryId);
      }
    }

    // Clean prepared statements that haven't been used recently
    for (const [hash, prepared] of this.preparedStatements) {
      if (prepared.lastUsed < cutoff && prepared.useCount < 10) {
        this.preparedStatements.delete(hash);
      }
    }

    // Clean old slow query logs
    this.slowQueryLog = this.slowQueryLog.filter((q) => q.timestamp > cutoff);

    // Clean old performance history
    this.performanceHistory = this.performanceHistory.filter(
      (p) => p.timestamp > cutoff,
    );
  }

  /**
   * Generate performance report
   */
  generatePerformanceReport() {
    const report = {
      generatedAt: new Date().toISOString(),
      monitoring: {
        isActive: this.isMonitoring,
        totalQueriesTracked: this.queryMetrics.size,
        performanceHistoryEntries: this.performanceHistory.length,
      },
      queryBreakdown: this.getQueryCategoryBreakdown(),
      slowQueries: this.getTopSlowQueries(20),
      indexRecommendations: Array.from(this.indexRecommendations),
      optimizationOpportunities: this.getOptimizationOpportunities(),
      connectionPool: { ...this.connectionPool },
      preparedStatements: {
        total: this.preparedStatements.size,
        memoryUsage: this.estimateMemoryUsage(),
      },
    };

    return report;
  }

  /**
   * Estimate memory usage
   */
  estimateMemoryUsage() {
    let bytes = 0;

    // Estimate query metrics memory
    bytes += this.queryMetrics.size * 500; // ~500 bytes per metric entry

    // Estimate performance history memory
    bytes += this.performanceHistory.length * 100; // ~100 bytes per history entry

    // Estimate slow query log memory
    bytes += this.slowQueryLog.length * 600; // ~600 bytes per slow query

    // Estimate prepared statements memory
    bytes += this.preparedStatements.size * 300; // ~300 bytes per prepared statement

    return {
      bytes,
      mb: (bytes / 1024 / 1024).toFixed(2),
    };
  }

  /**
   * Export metrics for external analysis
   */
  exportMetrics() {
    return {
      queryMetrics: Array.from(this.queryMetrics.entries()).map(
        ([id, metrics]) => ({
          queryId: id,
          ...metrics,
        }),
      ),
      slowQueryLog: this.slowQueryLog,
      performanceHistory: this.performanceHistory.slice(-1000), // Last 1000 entries
      indexRecommendations: Array.from(this.indexRecommendations),
    };
  }

  /**
   * Import metrics from external source
   */
  importMetrics(data) {
    if (data.queryMetrics) {
      data.queryMetrics.forEach((metric) => {
        const { queryId, ...rest } = metric;
        this.queryMetrics.set(queryId, rest);
      });
    }

    if (data.slowQueryLog) {
      this.slowQueryLog.push(...data.slowQueryLog);
    }

    if (data.performanceHistory) {
      this.performanceHistory.push(...data.performanceHistory);
    }

    if (data.indexRecommendations) {
      data.indexRecommendations.forEach((rec) =>
        this.indexRecommendations.add(rec),
      );
    }
  }

  /**
   * Reset all metrics
   */
  resetMetrics() {
    this.queryMetrics.clear();
    this.slowQueryLog = [];
    this.performanceHistory = [];
    this.indexRecommendations.clear();
    this.preparedStatements.clear();

    console.log("📊 Query optimizer metrics reset");
  }

  /**
   * Detect database type
   */
  detectDatabaseType() {
    // Try to detect from connection string or driver
    if (this.db.connectionString) {
      if (this.db.connectionString.includes("postgres")) return "postgresql";
      if (this.db.connectionString.includes("mysql")) return "mysql";
      if (this.db.connectionString.includes("sqlite")) return "sqlite";
    }

    // Default to sqlite for local development
    return "sqlite";
  }
}

/**
 * Factory function to create optimizer instance
 */
export function createQueryOptimizer(databaseService, options = {}) {
  return new QueryOptimizer(databaseService, options);
}

/**
 * Wrapper to add query optimization to existing database service
 */
export function withQueryOptimization(databaseService, options = {}) {
  const optimizer = createQueryOptimizer(databaseService, options);

  // Wrap the execute method
  const originalExecute = databaseService.execute.bind(databaseService);
  databaseService.execute = async function (query, params, opts) {
    return optimizer.executeWithTracking.call(
      optimizer,
      query,
      params,
      opts,
    );
  };

  // Add optimizer methods to database service
  databaseService.getPerformanceReport = () =>
    optimizer.generatePerformanceReport();
  databaseService.getQueryOptimizer = () => optimizer;
  databaseService.resetPerformanceMetrics = () => optimizer.resetMetrics();

  return databaseService;
}

export default QueryOptimizer;