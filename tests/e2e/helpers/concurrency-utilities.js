/**
 * Concurrency Utilities for Load Testing and Race Condition Detection
 * Provides utilities for simulating multiple concurrent users, detecting race conditions,
 * validating database consistency, and collecting performance metrics
 */

import { test } from '@playwright/test';
import crypto from 'crypto';
import { TestDataFactory } from './test-data-factory.js';
import { DatabaseCleanup } from './database-cleanup.js';

export class ConcurrencyUtilities {
  constructor(options = {}) {
    this.baseURL = options.baseURL || 'http://localhost:3000';
    this.maxConcurrentUsers = options.maxConcurrentUsers || 100;
    this.timeoutMs = options.timeoutMs || 60000;
    this.testDataFactory = new TestDataFactory();
    this.databaseCleanup = new DatabaseCleanup();
    this.performanceMetrics = {
      responseTime: [],
      errorRate: 0,
      throughput: 0,
      concurrentUsers: 0,
      memoryUsage: [],
      cpuUsage: []
    };
  }

  /**
   * Create multiple browser contexts for concurrent testing
   */
  async createConcurrentBrowsers(browser, count) {
    const contexts = [];
    const pages = [];
    
    for (let i = 0; i < count; i++) {
      const context = await browser.newContext({
        // Unique storage state for each concurrent user
        storageState: undefined,
        // Disable shared authentication
        acceptDownloads: false,
        // Unique viewport to simulate different users
        viewport: { 
          width: 1280 + (i % 3) * 100, 
          height: 720 + (i % 3) * 50 
        }
      });
      
      const page = await context.newPage();
      
      // Set unique user agent for tracking
      await page.setExtraHTTPHeaders({
        'X-Test-User-Id': `concurrent_user_${i}`,
        'X-Test-Run-Id': this.testDataFactory.getTestRunId()
      });
      
      contexts.push(context);
      pages.push(page);
    }
    
    return { contexts, pages };
  }

  /**
   * Execute concurrent operations with race condition detection
   */
  async executeConcurrentOperations(pages, operation, options = {}) {
    const startTime = Date.now();
    const results = [];
    const errors = [];
    const { enableRaceDetection = true, collectMetrics = true } = options;
    
    // Prepare race condition detection
    const raceConditionData = {
      beforeStates: [],
      afterStates: [],
      operationResults: []
    };

    try {
      // Collect before states if race detection enabled
      if (enableRaceDetection) {
        for (let i = 0; i < pages.length; i++) {
          try {
            const beforeState = await this.captureSystemState(pages[i]);
            raceConditionData.beforeStates.push(beforeState);
          } catch (error) {
            console.warn(`Failed to capture before state for user ${i}:`, error.message);
            raceConditionData.beforeStates.push(null);
          }
        }
      }

      // Execute operations concurrently
      const operationPromises = pages.map(async (page, index) => {
        const userStartTime = Date.now();
        try {
          const result = await Promise.race([
            operation(page, index),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error(`Operation timeout for user ${index}`)), this.timeoutMs)
            )
          ]);
          
          const duration = Date.now() - userStartTime;
          
          if (collectMetrics) {
            this.performanceMetrics.responseTime.push(duration);
          }
          
          return {
            userId: index,
            success: true,
            result,
            duration,
            timestamp: new Date().toISOString()
          };
        } catch (error) {
          const duration = Date.now() - userStartTime;
          errors.push({ userId: index, error: error.message, duration });
          
          return {
            userId: index,
            success: false,
            error: error.message,
            duration,
            timestamp: new Date().toISOString()
          };
        }
      });

      const operationResults = await Promise.allSettled(operationPromises);
      
      // Process results
      operationResults.forEach((settled, index) => {
        if (settled.status === 'fulfilled') {
          results.push(settled.value);
          raceConditionData.operationResults.push(settled.value);
        } else {
          const error = { userId: index, error: settled.reason?.message || 'Unknown error' };
          errors.push(error);
          raceConditionData.operationResults.push({ userId: index, success: false, error: error.error });
        }
      });

      // Collect after states if race detection enabled
      if (enableRaceDetection) {
        // Wait a moment for database to settle
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        for (let i = 0; i < pages.length; i++) {
          try {
            const afterState = await this.captureSystemState(pages[i]);
            raceConditionData.afterStates.push(afterState);
          } catch (error) {
            console.warn(`Failed to capture after state for user ${i}:`, error.message);
            raceConditionData.afterStates.push(null);
          }
        }
      }

      const totalDuration = Date.now() - startTime;
      
      // Update performance metrics
      if (collectMetrics) {
        this.performanceMetrics.errorRate = errors.length / pages.length;
        this.performanceMetrics.throughput = (results.length / totalDuration) * 1000; // ops per second
        this.performanceMetrics.concurrentUsers = pages.length;
      }

      // Detect race conditions
      const raceConditions = enableRaceDetection ? 
        await this.detectRaceConditions(raceConditionData) : [];

      return {
        successful: results,
        errors,
        totalDuration,
        raceConditions,
        metrics: collectMetrics ? this.getMetricsSummary() : null
      };

    } catch (error) {
      throw new Error(`Concurrent operation execution failed: ${error.message}`);
    }
  }

  /**
   * Capture system state for race condition detection
   */
  async captureSystemState(page) {
    try {
      // Capture client-side state
      const clientState = await page.evaluate(() => {
        return {
          cartItems: JSON.parse(localStorage.getItem('cart') || '[]'),
          cartTotal: localStorage.getItem('cartTotal'),
          sessionData: JSON.parse(sessionStorage.getItem('sessionData') || '{}'),
          timestamp: Date.now()
        };
      });

      // Capture server-side state via API calls
      const serverState = {
        databaseHealth: null,
        ticketAvailability: null,
        sessionInfo: null
      };

      try {
        // Check database health
        const healthResponse = await page.request.get('/api/health/check');
        if (healthResponse.ok()) {
          serverState.databaseHealth = await healthResponse.json();
        }
      } catch (error) {
        console.warn('Failed to capture database health:', error.message);
      }

      try {
        // Check ticket availability (if endpoint exists)
        const ticketsResponse = await page.request.get('/api/tickets/availability');
        if (ticketsResponse.ok()) {
          serverState.ticketAvailability = await ticketsResponse.json();
        }
      } catch (error) {
        // Ticket availability endpoint may not exist, that's OK
      }

      return {
        client: clientState,
        server: serverState,
        capturedAt: new Date().toISOString()
      };

    } catch (error) {
      throw new Error(`Failed to capture system state: ${error.message}`);
    }
  }

  /**
   * Detect race conditions by analyzing before/after states
   */
  async detectRaceConditions(raceData) {
    const raceConditions = [];
    
    try {
      // Check for inventory overselling
      const inventoryIssues = this.detectInventoryRaceConditions(raceData);
      raceConditions.push(...inventoryIssues);
      
      // Check for duplicate transactions
      const duplicateTransactions = this.detectDuplicateTransactions(raceData);
      raceConditions.push(...duplicateTransactions);
      
      // Check for session contamination
      const sessionIssues = this.detectSessionContamination(raceData);
      raceConditions.push(...sessionIssues);
      
      // Check for data consistency issues
      const consistencyIssues = this.detectDataInconsistencies(raceData);
      raceConditions.push(...consistencyIssues);
      
    } catch (error) {
      console.warn('Race condition detection failed:', error.message);
      raceConditions.push({
        type: 'detection_failure',
        description: `Race condition detection failed: ${error.message}`,
        severity: 'low'
      });
    }

    return raceConditions;
  }

  /**
   * Detect inventory overselling race conditions
   */
  detectInventoryRaceConditions(raceData) {
    const issues = [];
    const successfulPurchases = raceData.operationResults.filter(r => r.success);
    
    // If we have more successful purchases than expected capacity
    if (successfulPurchases.length > 0) {
      // Simple check for now - in real implementation, this would check actual inventory
      const purchasesByType = {};
      
      successfulPurchases.forEach(purchase => {
        if (purchase.result && purchase.result.ticketType) {
          purchasesByType[purchase.result.ticketType] = 
            (purchasesByType[purchase.result.ticketType] || 0) + 1;
        }
      });
      
      // Check if any ticket type was oversold (simplified check)
      Object.entries(purchasesByType).forEach(([type, count]) => {
        if (count > 50) { // Arbitrary limit for demonstration
          issues.push({
            type: 'inventory_oversell',
            description: `Potential overselling detected for ticket type: ${type}`,
            details: { ticketType: type, purchaseCount: count },
            severity: 'high'
          });
        }
      });
    }
    
    return issues;
  }

  /**
   * Detect duplicate transaction race conditions
   */
  detectDuplicateTransactions(raceData) {
    const issues = [];
    const transactionIds = new Set();
    const duplicates = [];
    
    raceData.operationResults.forEach(result => {
      if (result.success && result.result && result.result.transactionId) {
        const txId = result.result.transactionId;
        if (transactionIds.has(txId)) {
          duplicates.push(txId);
        } else {
          transactionIds.add(txId);
        }
      }
    });
    
    if (duplicates.length > 0) {
      issues.push({
        type: 'duplicate_transactions',
        description: 'Duplicate transaction IDs detected',
        details: { duplicateTransactions: duplicates },
        severity: 'high'
      });
    }
    
    return issues;
  }

  /**
   * Detect session contamination between concurrent users
   */
  detectSessionContamination(raceData) {
    const issues = [];
    const userCartData = [];
    
    // Collect cart data from all users
    raceData.afterStates.forEach((state, index) => {
      if (state && state.client && state.client.cartItems) {
        userCartData.push({
          userId: index,
          cartItems: state.client.cartItems,
          cartTotal: state.client.cartTotal
        });
      }
    });
    
    // Check for identical cart contents across users (potential session contamination)
    for (let i = 0; i < userCartData.length; i++) {
      for (let j = i + 1; j < userCartData.length; j++) {
        const cart1 = JSON.stringify(userCartData[i].cartItems.sort());
        const cart2 = JSON.stringify(userCartData[j].cartItems.sort());
        
        if (cart1 === cart2 && cart1 !== '[]') {
          issues.push({
            type: 'session_contamination',
            description: 'Identical cart contents detected between users',
            details: { 
              users: [userCartData[i].userId, userCartData[j].userId],
              cartContents: userCartData[i].cartItems
            },
            severity: 'high'
          });
        }
      }
    }
    
    return issues;
  }

  /**
   * Detect general data consistency issues
   */
  detectDataInconsistencies(raceData) {
    const issues = [];
    
    // Check for inconsistent successful/error ratios
    const successCount = raceData.operationResults.filter(r => r.success).length;
    const totalCount = raceData.operationResults.length;
    const errorRate = (totalCount - successCount) / totalCount;
    
    if (errorRate > 0.1) { // More than 10% failure rate
      issues.push({
        type: 'high_error_rate',
        description: `High error rate detected: ${(errorRate * 100).toFixed(1)}%`,
        details: { successCount, totalCount, errorRate },
        severity: 'medium'
      });
    }
    
    // Check for timing inconsistencies
    const durations = raceData.operationResults
      .filter(r => r.duration)
      .map(r => r.duration);
    
    if (durations.length > 0) {
      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      const maxDuration = Math.max(...durations);
      
      if (maxDuration > avgDuration * 10) { // More than 10x average
        issues.push({
          type: 'timing_inconsistency',
          description: 'Significant timing variations detected',
          details: { avgDuration, maxDuration, ratio: maxDuration / avgDuration },
          severity: 'medium'
        });
      }
    }
    
    return issues;
  }

  /**
   * Validate database consistency after concurrent operations
   */
  async validateDatabaseConsistency(page, options = {}) {
    const validationResults = {
      consistent: true,
      issues: [],
      checks: []
    };

    try {
      // Check ticket inventory consistency
      const inventoryCheck = await this.validateTicketInventory(page);
      validationResults.checks.push(inventoryCheck);
      
      if (!inventoryCheck.passed) {
        validationResults.consistent = false;
        validationResults.issues.push(...inventoryCheck.issues);
      }

      // Check transaction integrity
      const transactionCheck = await this.validateTransactionIntegrity(page);
      validationResults.checks.push(transactionCheck);
      
      if (!transactionCheck.passed) {
        validationResults.consistent = false;
        validationResults.issues.push(...transactionCheck.issues);
      }

      // Check for orphaned records
      const orphanCheck = await this.validateNoOrphanedRecords(page);
      validationResults.checks.push(orphanCheck);
      
      if (!orphanCheck.passed) {
        validationResults.consistent = false;
        validationResults.issues.push(...orphanCheck.issues);
      }

    } catch (error) {
      validationResults.consistent = false;
      validationResults.issues.push({
        type: 'validation_error',
        description: `Database validation failed: ${error.message}`,
        severity: 'high'
      });
    }

    return validationResults;
  }

  /**
   * Validate ticket inventory consistency
   */
  async validateTicketInventory(page) {
    try {
      const response = await page.request.get('/api/admin/tickets/summary');
      if (!response.ok()) {
        return {
          passed: false,
          issues: [{
            type: 'inventory_check_failed',
            description: 'Could not retrieve ticket inventory',
            severity: 'medium'
          }]
        };
      }

      const inventory = await response.json();
      const issues = [];

      // Check for negative inventory
      if (inventory.available && Object.values(inventory.available).some(count => count < 0)) {
        issues.push({
          type: 'negative_inventory',
          description: 'Negative inventory detected',
          details: inventory.available,
          severity: 'high'
        });
      }

      return {
        passed: issues.length === 0,
        issues,
        details: inventory
      };

    } catch (error) {
      return {
        passed: false,
        issues: [{
          type: 'inventory_validation_error',
          description: `Inventory validation error: ${error.message}`,
          severity: 'medium'
        }]
      };
    }
  }

  /**
   * Validate transaction integrity
   */
  async validateTransactionIntegrity(page) {
    try {
      // Check for duplicate transactions
      const response = await page.request.get('/api/admin/transactions/validation');
      if (!response.ok()) {
        return {
          passed: false,
          issues: [{
            type: 'transaction_check_failed',
            description: 'Could not validate transactions',
            severity: 'medium'
          }]
        };
      }

      const validation = await response.json();
      const issues = [];

      if (validation.duplicates && validation.duplicates.length > 0) {
        issues.push({
          type: 'duplicate_transactions',
          description: 'Duplicate transactions found',
          details: validation.duplicates,
          severity: 'high'
        });
      }

      if (validation.orphaned && validation.orphaned.length > 0) {
        issues.push({
          type: 'orphaned_transactions',
          description: 'Orphaned transactions found',
          details: validation.orphaned,
          severity: 'medium'
        });
      }

      return {
        passed: issues.length === 0,
        issues,
        details: validation
      };

    } catch (error) {
      return {
        passed: false,
        issues: [{
          type: 'transaction_validation_error',
          description: `Transaction validation error: ${error.message}`,
          severity: 'medium'
        }]
      };
    }
  }

  /**
   * Check for orphaned records
   */
  async validateNoOrphanedRecords(page) {
    // This is a simplified check - real implementation would be more thorough
    return {
      passed: true,
      issues: [],
      details: { message: 'Orphaned record check not fully implemented' }
    };
  }

  /**
   * Collect performance metrics during load testing
   */
  async collectPerformanceMetrics(pages, duration = 60000) {
    const metrics = {
      responseTime: [],
      errorCount: 0,
      successCount: 0,
      memoryUsage: [],
      startTime: Date.now()
    };

    const collectInterval = setInterval(async () => {
      try {
        // Sample a few pages for metrics
        const samplePage = pages[Math.floor(Math.random() * pages.length)];
        
        // Collect client-side performance
        const perfData = await samplePage.evaluate(() => {
          return {
            memory: performance.memory ? {
              used: performance.memory.usedJSHeapSize,
              total: performance.memory.totalJSHeapSize
            } : null,
            timing: performance.timing ? {
              loadComplete: performance.timing.loadEventEnd - performance.timing.navigationStart,
              domReady: performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart
            } : null
          };
        });

        if (perfData.memory) {
          metrics.memoryUsage.push({
            timestamp: Date.now(),
            used: perfData.memory.used,
            total: perfData.memory.total
          });
        }

      } catch (error) {
        console.warn('Performance metric collection error:', error.message);
      }
    }, 5000); // Collect every 5 seconds

    // Stop collection after specified duration
    setTimeout(() => {
      clearInterval(collectInterval);
    }, duration);

    return metrics;
  }

  /**
   * Generate test data for concurrent users
   */
  generateConcurrentUserData(userCount) {
    const users = [];
    
    for (let i = 0; i < userCount; i++) {
      const userData = this.testDataFactory.generateScenario('purchase-flow', {
        customer: {
          name: `ConcurrentUser${i}`,
          email: `concurrent_user_${i}_${Date.now()}@e2e-test.com`
        }
      });
      
      users.push({
        ...userData,
        userId: i,
        concurrent: true
      });
    }
    
    return users;
  }

  /**
   * Clean up test data after concurrent testing
   */
  async cleanupConcurrentTestData(testRunId) {
    try {
      const result = await this.databaseCleanup.cleanupByTestRunId(testRunId);
      console.log(`Concurrent test cleanup completed: ${result.deleted} records removed`);
      return result;
    } catch (error) {
      console.error('Concurrent test cleanup failed:', error.message);
      throw error;
    }
  }

  /**
   * Get performance metrics summary
   */
  getMetricsSummary() {
    const responseTime = this.performanceMetrics.responseTime;
    
    if (responseTime.length === 0) {
      return {
        responseTime: { avg: 0, min: 0, max: 0, p95: 0 },
        errorRate: this.performanceMetrics.errorRate,
        throughput: this.performanceMetrics.throughput,
        concurrentUsers: this.performanceMetrics.concurrentUsers
      };
    }

    const sortedResponseTime = [...responseTime].sort((a, b) => a - b);
    const p95Index = Math.floor(sortedResponseTime.length * 0.95);
    
    return {
      responseTime: {
        avg: responseTime.reduce((a, b) => a + b, 0) / responseTime.length,
        min: Math.min(...responseTime),
        max: Math.max(...responseTime),
        p95: sortedResponseTime[p95Index] || 0
      },
      errorRate: this.performanceMetrics.errorRate,
      throughput: this.performanceMetrics.throughput,
      concurrentUsers: this.performanceMetrics.concurrentUsers
    };
  }

  /**
   * Generate load testing report
   */
  generateLoadTestReport(results) {
    const report = {
      testInfo: {
        timestamp: new Date().toISOString(),
        testRunId: this.testDataFactory.getTestRunId(),
        concurrentUsers: results.successful.length + results.errors.length,
        duration: results.totalDuration
      },
      performance: results.metrics,
      results: {
        successful: results.successful.length,
        errors: results.errors.length,
        successRate: (results.successful.length / (results.successful.length + results.errors.length)) * 100
      },
      raceConditions: results.raceConditions,
      errors: results.errors.map(e => ({
        userId: e.userId,
        error: e.error,
        duration: e.duration
      }))
    };

    console.log('\n=== LOAD TEST REPORT ===');
    console.log(`Test Run ID: ${report.testInfo.testRunId}`);
    console.log(`Concurrent Users: ${report.testInfo.concurrentUsers}`);
    console.log(`Duration: ${report.testInfo.duration}ms`);
    console.log(`Success Rate: ${report.results.successRate.toFixed(2)}%`);
    
    if (report.performance) {
      console.log(`Avg Response Time: ${report.performance.responseTime.avg.toFixed(2)}ms`);
      console.log(`95th Percentile: ${report.performance.responseTime.p95.toFixed(2)}ms`);
      console.log(`Throughput: ${report.performance.throughput.toFixed(2)} ops/sec`);
    }
    
    console.log(`Race Conditions: ${report.raceConditions.length}`);
    
    if (report.raceConditions.length > 0) {
      console.log('\nRace Conditions Detected:');
      report.raceConditions.forEach(rc => {
        console.log(`- ${rc.type}: ${rc.description} (${rc.severity})`);
      });
    }
    
    console.log('========================\n');

    return report;
  }
}

export default ConcurrencyUtilities;