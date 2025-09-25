/**
 * Database Performance Service
 * Integration service for query optimization in A Lo Cubano Boulder Fest
 *
 * This service acts as a bridge between the existing database service
 * and the query optimizer, providing seamless performance monitoring
 * without disrupting existing code.
 */

import { getDatabaseClient } from "../database.js";
import { createQueryOptimizer } from "./query-optimizer.js";
import { EventEmitter } from "events";

class DatabasePerformanceService extends EventEmitter {
  constructor() {
    super();
    // ✅ NEW WORKING PATTERN: Use getDatabaseClient() directly per operation
    // No longer store database instance in constructor to prevent hanging
    this.optimizer = null;
    this.isInitialized = false;
    this.performanceAlerts = [];
    this.reportingInterval = null;
  }

  /**
   * Initialize the performance monitoring system
   */
  async initialize() {
    if (this.isInitialized) return;

    try {
      // Get database client for optimizer
      const db = await getDatabaseClient();

      // Create query optimizer
      this.optimizer = createQueryOptimizer(db);

      // Set up event listeners
      this.setupEventHandlers();

      // Wrap database methods
      await this.wrapDatabaseMethods();

      // Start automatic reporting if enabled
      if (process.env.ENABLE_PERFORMANCE_REPORTING === "true") {
        this.startAutomaticReporting();
      }

      this.isInitialized = true;
      console.log("🚀 Database Performance Service initialized");

      // Run initial health check
      await this.runInitialOptimizations();
    } catch (error) {
      console.error(
        "❌ Failed to initialize Database Performance Service:",
        error,
      );
      throw error;
    }
  }

  /**
   * Set up event handlers for performance monitoring
   */
  setupEventHandlers() {
    // Handle slow query alerts
    this.optimizer.on("slow-query", (slowQuery) => {
      this.handleSlowQueryAlert(slowQuery);
    });

    // Handle performance degradation
    this.optimizer.on("performance-degradation", (performance) => {
      this.handlePerformanceDegradation(performance);
    });

    // Handle deep analysis results
    this.optimizer.on("deep-analysis", (analysis) => {
      this.handleDeepAnalysis(analysis);
    });

    // Handle query errors
    this.optimizer.on("query-error", (error) => {
      this.handleQueryError(error);
    });

    console.log("📊 Performance event handlers configured");
  }

  /**
   * Wrap database methods for automatic optimization
   */
  async wrapDatabaseMethods() {
    const db = await getDatabaseClient();
    const originalExecute = db.execute.bind(db);
    const originalBatch = db.batch ? db.batch.bind(db) : null;

    // Store the original execute method for the optimizer to use
    if (this.optimizer) {
      this.optimizer.originalExecute = originalExecute;
    }

    // Wrap execute method
    db.execute = async (queryOrObject, params = []) => {
      if (this.optimizer) {
        return this.optimizer.executeWithTracking(queryOrObject, params);
      }
      return originalExecute(queryOrObject, params);
    };

    // Wrap batch method if it exists
    if (originalBatch) {
      db.batch = async (statements) => {
        const startTime = Date.now();
        try {
          const result = await originalBatch(statements);
          const duration = Date.now() - startTime;

          this.emit("batch-completed", {
            statementCount: statements.length,
            duration,
            success: true,
          });

          return result;
        } catch (error) {
          const duration = Date.now() - startTime;
          this.emit("batch-failed", {
            statementCount: statements.length,
            duration,
            error: error.message,
          });
          throw error;
        }
      };
    }

    console.log("🔧 Database methods wrapped for performance monitoring");
  }

  /**
   * Handle slow query alerts
   */
  handleSlowQueryAlert(slowQuery) {
    const alert = {
      type: "SLOW_QUERY",
      severity: slowQuery.executionTime > 100 ? "HIGH" : "MEDIUM",
      timestamp: slowQuery.timestamp,
      details: {
        executionTime: slowQuery.executionTime,
        category: slowQuery.category,
        complexity: slowQuery.complexity,
        sql: slowQuery.sql.substring(0, 100) + "...",
        optimizationCount: slowQuery.optimizations.length,
      },
    };

    this.performanceAlerts.push(alert);
    this.emit("performance-alert", alert);

    // Log based on severity
    if (alert.severity === "HIGH") {
      console.warn("🚨 HIGH SEVERITY: Slow query detected", alert.details);
    } else {
      console.log("⚠️  MEDIUM SEVERITY: Slow query detected", alert.details);
    }

    // Limit alert history
    if (this.performanceAlerts.length > 500) {
      this.performanceAlerts.splice(0, 250);
    }
  }

  /**
   * Handle performance degradation
   */
  handlePerformanceDegradation(performance) {
    const alert = {
      type: "PERFORMANCE_DEGRADATION",
      severity: "HIGH",
      timestamp: new Date(),
      details: performance,
    };

    this.performanceAlerts.push(alert);
    this.emit("performance-alert", alert);

    console.error("🚨 PERFORMANCE DEGRADATION DETECTED:", {
      slowQueryPercentage: performance.slowQueryPercentage,
      errorRate: performance.errorRate,
      avgExecutionTime: performance.avgExecutionTime,
    });

    // Trigger immediate optimization if enabled
    if (process.env.AUTO_OPTIMIZE_ON_DEGRADATION === "true") {
      setTimeout(() => this.triggerEmergencyOptimization(), 1000);
    }
  }

  /**
   * Handle deep analysis results
   */
  handleDeepAnalysis(analysis) {
    this.emit("deep-analysis-completed", analysis);

    console.log("📈 Deep analysis completed:", {
      uniqueQueries: analysis.totalUniqueQueries,
      indexRecommendations: analysis.indexRecommendations.length,
      optimizationOpportunities: analysis.optimizationOpportunities.length,
    });

    // Store latest analysis
    this.latestAnalysis = analysis;
  }

  /**
   * Handle query errors
   */
  handleQueryError(error) {
    const alert = {
      type: "QUERY_ERROR",
      severity: "MEDIUM",
      timestamp: error.timestamp,
      details: {
        sql: error.sql,
        executionTime: error.executionTime,
        error: error.error,
      },
    };

    this.performanceAlerts.push(alert);
    this.emit("query-error-alert", alert);

    // Don't log every query error to avoid spam, but count them
    if (!this.errorCount) this.errorCount = 0;
    this.errorCount++;
  }

  /**
   * Run initial optimizations
   */
  async runInitialOptimizations() {
    console.log("🔍 Running initial database optimizations...");

    try {
      // Create essential indexes for A Lo Cubano Boulder Fest
      const essentialIndexes = [
        // Ticket lookups (most critical)
        "CREATE INDEX IF NOT EXISTS idx_tickets_ticket_id ON tickets(ticket_id)",
        "CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status)",
        "CREATE INDEX IF NOT EXISTS idx_tickets_attendee_email ON tickets(attendee_email)",
        "CREATE INDEX IF NOT EXISTS idx_tickets_event_id ON tickets(event_id)",

        // Transaction lookups
        "CREATE INDEX IF NOT EXISTS idx_transactions_uuid ON transactions(uuid)",
        "CREATE INDEX IF NOT EXISTS idx_transactions_customer_email ON transactions(customer_email)",
        "CREATE INDEX IF NOT EXISTS idx_transactions_stripe_session_id ON transactions(stripe_session_id)",
        "CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at)",

        // QR code validation (performance critical)
        "CREATE INDEX IF NOT EXISTS idx_tickets_validation_signature ON tickets(validation_signature)",
        "CREATE INDEX IF NOT EXISTS idx_tickets_qr_code_data ON tickets(qr_code_data)",

        // Admin dashboard queries
        "CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at)",
        "CREATE INDEX IF NOT EXISTS idx_tickets_checked_in_at ON tickets(checked_in_at)",

        // Analytics queries (covering indexes)
        "CREATE INDEX IF NOT EXISTS idx_transactions_status_created_at ON transactions(status, created_at)",
        "CREATE INDEX IF NOT EXISTS idx_tickets_event_status_created ON tickets(event_id, status, created_at)",
      ];

      const db = await getDatabaseClient();
      let createdCount = 0;
      for (const indexSql of essentialIndexes) {
        try {
          await db.execute(indexSql);
          createdCount++;
        } catch (error) {
          // Index might already exist
          if (!error.message.includes("already exists")) {
            console.warn(`⚠️  Failed to create index: ${error.message}`);
          }
        }
      }

      console.log(
        `✅ Initial optimization complete. Created ${createdCount} indexes.`,
      );

      // Update database statistics
      await this.updateDatabaseStatistics();
    } catch (error) {
      console.error("❌ Initial optimization failed:", error);
    }
  }

  /**
   * Update database statistics for better query planning
   */
  async updateDatabaseStatistics() {
    try {
      const dbType = this.optimizer?.dbType || "sqlite";

      const db = await getDatabaseClient();
      if (dbType === "sqlite") {
        await db.execute("ANALYZE");
        console.log("✅ Updated SQLite statistics");
      } else if (dbType === "postgresql") {
        await db.execute("ANALYZE");
        console.log("✅ Updated PostgreSQL statistics");
      }
    } catch (error) {
      console.warn("⚠️  Failed to update database statistics:", error.message);
    }
  }

  /**
   * Trigger emergency optimization during performance issues
   */
  async triggerEmergencyOptimization() {
    console.log("🚨 Triggering emergency optimization...");

    try {
      // Force deep analysis
      await this.optimizer.performDeepAnalysis();

      // Apply critical optimizations immediately
      if (
        this.latestAnalysis &&
        this.latestAnalysis.indexRecommendations.length > 0
      ) {
        const db = await getDatabaseClient();
        for (const indexSql of this.latestAnalysis.indexRecommendations.slice(
          0,
          5,
        )) {
          try {
            await db.execute(indexSql);
            console.log(
              `🔧 Emergency index created: ${indexSql.substring(0, 50)}...`,
            );
          } catch (error) {
            // Continue with other optimizations
          }
        }
      }

      // Update statistics
      await this.updateDatabaseStatistics();

      console.log("✅ Emergency optimization completed");
    } catch (error) {
      console.error("❌ Emergency optimization failed:", error);
    }
  }

  /**
   * Start automatic performance reporting
   */
  startAutomaticReporting() {
    // Report every 5 minutes
    this.reportingInterval = setInterval(() => {
      const report = this.generateQuickReport();
      this.emit("performance-report", report);

      // Log significant issues
      if (report.issues.length > 0) {
        console.log("📊 Performance Report:", report.summary);
      }
    }, 300000); // 5 minutes

    console.log("📋 Automatic performance reporting started");
  }

  /**
   * Stop automatic performance reporting
   */
  stopAutomaticReporting() {
    if (this.reportingInterval) {
      clearInterval(this.reportingInterval);
      this.reportingInterval = null;
      console.log("📋 Automatic performance reporting stopped");
    }
  }

  /**
   * Generate quick performance report
   */
  generateQuickReport() {
    if (!this.optimizer) {
      return {
        status: "OPTIMIZER_NOT_AVAILABLE",
        timestamp: new Date().toISOString(),
      };
    }

    const recentAlerts = this.performanceAlerts.filter(
      (alert) => Date.now() - alert.timestamp < 300000, // Last 5 minutes
    );

    const slowQueryAlerts = recentAlerts.filter(
      (alert) => alert.type === "SLOW_QUERY",
    );
    const errorAlerts = recentAlerts.filter(
      (alert) => alert.type === "QUERY_ERROR",
    );
    const degradationAlerts = recentAlerts.filter(
      (alert) => alert.type === "PERFORMANCE_DEGRADATION",
    );

    const issues = [];
    if (slowQueryAlerts.length > 5) {
      issues.push(`${slowQueryAlerts.length} slow queries in last 5 minutes`);
    }
    if (errorAlerts.length > 0) {
      issues.push(`${errorAlerts.length} query errors in last 5 minutes`);
    }
    if (degradationAlerts.length > 0) {
      issues.push("Performance degradation detected");
    }

    const status =
      issues.length === 0
        ? "HEALTHY"
        : issues.length < 3
          ? "WARNING"
          : "CRITICAL";

    return {
      status,
      timestamp: new Date().toISOString(),
      summary: {
        totalAlerts: recentAlerts.length,
        slowQueries: slowQueryAlerts.length,
        queryErrors: errorAlerts.length,
        degradationEvents: degradationAlerts.length,
      },
      issues,
      recommendations: this.getQuickRecommendations(),
    };
  }

  /**
   * Get quick optimization recommendations
   */
  getQuickRecommendations() {
    if (!this.latestAnalysis) return [];

    const recommendations = [];

    // Index recommendations
    if (this.latestAnalysis.indexRecommendations.length > 0) {
      recommendations.push({
        type: "CREATE_INDEXES",
        priority: "HIGH",
        message: `${this.latestAnalysis.indexRecommendations.length} index recommendations available`,
        action: "Review and apply recommended indexes",
      });
    }

    // Query optimization opportunities
    if (this.latestAnalysis.optimizationOpportunities.length > 0) {
      const highImpactOps =
        this.latestAnalysis.optimizationOpportunities.filter(
          (op) => op.impact > 7,
        ).length;

      if (highImpactOps > 0) {
        recommendations.push({
          type: "OPTIMIZE_QUERIES",
          priority: "MEDIUM",
          message: `${highImpactOps} high-impact query optimization opportunities`,
          action: "Review and optimize slow queries",
        });
      }
    }

    return recommendations;
  }

  /**
   * Get detailed performance report
   */
  getDetailedReport() {
    if (!this.optimizer) {
      return {
        error: "Query optimizer not initialized",
        timestamp: new Date().toISOString(),
      };
    }

    const report = this.optimizer.generatePerformanceReport();

    // Add service-specific metrics
    report.alerts = {
      total: this.performanceAlerts.length,
      recent: this.performanceAlerts.filter(
        (alert) => Date.now() - alert.timestamp < 3600000, // Last hour
      ).length,
      byType: this.getAlertsByType(),
    };

    report.serviceHealth = this.getServiceHealth();

    return report;
  }

  /**
   * Get alerts grouped by type
   */
  getAlertsByType() {
    const byType = {};

    for (const alert of this.performanceAlerts) {
      if (!byType[alert.type]) {
        byType[alert.type] = 0;
      }
      byType[alert.type]++;
    }

    return byType;
  }

  /**
   * Get service health status
   */
  getServiceHealth() {
    const memoryUsage = this.optimizer
      ? this.optimizer.estimateMemoryUsage()
      : { mb: 0 };
    const issues = [];

    if (!this.isInitialized) {
      issues.push("Service not initialized");
    }

    if (memoryUsage.mb > 100) {
      issues.push("High memory usage");
    }

    if (this.performanceAlerts.length > 1000) {
      issues.push("Too many alerts in memory");
    }

    return {
      status: issues.length === 0 ? "HEALTHY" : "WARNING",
      issues,
      memoryUsage: memoryUsage.mb,
      alertCount: this.performanceAlerts.length,
      isMonitoring: this.optimizer?.isMonitoring || false,
    };
  }

  /**
   * Manual optimization trigger
   */
  async optimizeNow() {
    console.log("🔧 Manual optimization triggered...");

    if (!this.optimizer) {
      throw new Error("Query optimizer not initialized");
    }

    try {
      // Force deep analysis
      await this.optimizer.performDeepAnalysis();

      // Apply automatic optimizations
      if (this.latestAnalysis) {
        await this.optimizer.applyAutomaticOptimizations(this.latestAnalysis);
      }

      // Update statistics
      await this.updateDatabaseStatistics();

      console.log("✅ Manual optimization completed");

      return {
        success: true,
        timestamp: new Date().toISOString(),
        message: "Optimization completed successfully",
      };
    } catch (error) {
      console.error("❌ Manual optimization failed:", error);
      throw error;
    }
  }

  /**
   * Shutdown the performance service
   */
  shutdown() {
    if (this.optimizer) {
      this.optimizer.stopPerformanceMonitoring();
    }

    this.stopAutomaticReporting();
    this.removeAllListeners();

    console.log("🛑 Database Performance Service shutdown");
  }
}

// Singleton instance
let performanceServiceInstance = null;

/**
 * Get database performance service singleton
 */
export function getDatabasePerformanceService() {
  if (!performanceServiceInstance) {
    performanceServiceInstance = new DatabasePerformanceService();
  }
  return performanceServiceInstance;
}

/**
 * Initialize performance monitoring (call this in app startup)
 */
export async function initializePerformanceMonitoring() {
  const service = getDatabasePerformanceService();
  await service.initialize();
  return service;
}

export default DatabasePerformanceService;
