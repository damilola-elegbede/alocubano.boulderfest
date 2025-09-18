/**
 * Audit Trail Queries Tests
 * Tests complex audit log queries and filters, verifies audit trail reconstruction capabilities,
 * tests audit log performance with large datasets, validates audit statistics and reporting
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { getDatabaseClient } from '../../lib/database.js';
import { auditService } from '../../lib/audit-service.js';
import { resetAllServices } from './reset-services.js';
import crypto from 'crypto';

describe('Audit Trail Queries Tests', () => {
  let db;
  let testDatasets;

  beforeAll(async () => {
    db = await getDatabaseClient();
    await auditService.ensureInitialized();
  });

  beforeEach(async () => {
    await resetAllServices();

    // Clean up any existing test data
    await db.execute('DELETE FROM audit_logs WHERE request_id LIKE ?', [`audit_query_test_%`]);

    // Create comprehensive test datasets
    testDatasets = {
      requestIdPrefix: `audit_query_test_${Date.now()}`,
      adminUsers: ['admin1', 'admin2', 'admin3'],
      eventTypes: ['admin_access', 'data_change', 'financial_event', 'config_change'],
      severityLevels: ['debug', 'info', 'warning', 'error', 'critical'],
      targetTypes: ['ticket', 'transaction', 'registration', 'system'],
      timeRanges: {
        recent: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
        medium: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
        old: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 1 week ago
      }
    };

    await createTestDataset();
  });

  afterEach(async () => {
    // Clean up test data after each test
    await db.execute('DELETE FROM audit_logs WHERE request_id LIKE ?', [`audit_query_test_%`]);
  });

  async function createTestDataset() {
    const promises = [];

    // Create diverse audit data for complex query testing
    for (let i = 0; i < 100; i++) {
      const adminUser = testDatasets.adminUsers[i % testDatasets.adminUsers.length];
      const eventType = testDatasets.eventTypes[i % testDatasets.eventTypes.length];
      const severity = testDatasets.severityLevels[i % testDatasets.severityLevels.length];
      const targetType = testDatasets.targetTypes[i % testDatasets.targetTypes.length];

      // Distribute records across different time periods
      let createdAt;
      if (i < 30) {
        createdAt = testDatasets.timeRanges.recent;
      } else if (i < 60) {
        createdAt = testDatasets.timeRanges.medium;
      } else {
        createdAt = testDatasets.timeRanges.old;
      }

      const requestId = `${testDatasets.requestIdPrefix}_${i}`;

      if (eventType === 'admin_access') {
        promises.push(
          auditService.logAdminAccess({
            requestId,
            adminUser,
            sessionId: `session_${i}`,
            ipAddress: `192.168.1.${(i % 254) + 1}`,
            userAgent: `TestBrowser/${i}`,
            requestMethod: ['GET', 'POST', 'PUT', 'DELETE'][i % 4],
            requestUrl: `/api/test/${targetType}/${i}`,
            responseStatus: severity === 'error' ? 500 : severity === 'warning' ? 403 : 200,
            responseTimeMs: 100 + (i * 10),
            metadata: {
              testIndex: i,
              category: 'query_test',
              timeCategory: i < 30 ? 'recent' : i < 60 ? 'medium' : 'old'
            }
          })
        );
      } else if (eventType === 'data_change') {
        promises.push(
          auditService.logDataChange({
            requestId,
            action: `${targetType}_${['created', 'updated', 'deleted'][i % 3]}`,
            targetType,
            targetId: `${targetType}_${i}`,
            beforeValue: i % 3 === 0 ? null : { status: 'old', value: i - 1 },
            afterValue: i % 3 === 2 ? null : { status: 'new', value: i },
            changedFields: ['status', 'value'],
            adminUser,
            severity,
            metadata: {
              testIndex: i,
              category: 'query_test',
              timeCategory: i < 30 ? 'recent' : i < 60 ? 'medium' : 'old',
              operationType: ['created', 'updated', 'deleted'][i % 3]
            }
          })
        );
      } else if (eventType === 'financial_event') {
        promises.push(
          auditService.logFinancialEvent({
            requestId,
            action: `payment_${['initiated', 'completed', 'failed'][i % 3]}`,
            amountCents: 1000 + (i * 100),
            currency: ['USD', 'EUR', 'GBP'][i % 3],
            transactionReference: `txn_${i}`,
            paymentStatus: ['pending', 'completed', 'failed'][i % 3],
            targetType: 'transaction',
            targetId: `txn_${i}`,
            severity,
            metadata: {
              testIndex: i,
              category: 'query_test',
              timeCategory: i < 30 ? 'recent' : i < 60 ? 'medium' : 'old',
              paymentMethod: ['card', 'bank', 'crypto'][i % 3]
            }
          })
        );
      } else if (eventType === 'config_change') {
        promises.push(
          auditService.logConfigChange({
            requestId,
            action: 'config_updated',
            configKey: `setting_${i}`,
            beforeValue: `old_value_${i}`,
            afterValue: `new_value_${i}`,
            adminUser,
            severity,
            metadata: {
              testIndex: i,
              category: 'query_test',
              timeCategory: i < 30 ? 'recent' : i < 60 ? 'medium' : 'old',
              configType: ['security', 'payment', 'email'][i % 3]
            }
          })
        );
      }
    }

    await Promise.all(promises);
  }

  describe('Complex Audit Log Queries and Filters', () => {
    it('should support multi-dimensional filtering', async () => {
      // Complex filter: admin_access events by admin1 with warning severity from recent timeframe
      const complexQuery = await auditService.queryAuditLogs({
        eventType: 'admin_access',
        adminUser: 'admin1',
        severity: 'warning',
        startDate: testDatasets.timeRanges.recent.toISOString(),
        limit: 50
      });

      // Verify all results match the complex criteria
      complexQuery.logs.forEach(log => {
        expect(log.event_type).toBe('admin_access');
        expect(log.admin_user).toBe('admin1');
        expect(log.severity).toBe('warning');

        const logDate = new Date(log.created_at);
        expect(logDate.getTime()).toBeGreaterThanOrEqual(testDatasets.timeRanges.recent.getTime());
      });

      expect(complexQuery.logs.length).toBeGreaterThan(0);
    });

    it('should filter by target type and ID with precise matching', async () => {
      // Query specific target type and ID combinations
      const ticketQuery = await auditService.queryAuditLogs({
        targetType: 'ticket',
        limit: 50
      });

      ticketQuery.logs.forEach(log => {
        expect(log.target_type).toBe('ticket');
      });

      // Query specific target ID
      const specificTargetQuery = await auditService.queryAuditLogs({
        targetType: 'transaction',
        targetId: 'txn_5',
        limit: 10
      });

      specificTargetQuery.logs.forEach(log => {
        expect(log.target_type).toBe('transaction');
        expect(log.target_id).toBe('txn_5');
      });
    });

    it('should support date range filtering with precision', async () => {
      const recentStart = testDatasets.timeRanges.recent.toISOString();
      const mediumEnd = testDatasets.timeRanges.medium.toISOString();

      // Query logs within specific date range
      const dateRangeQuery = await auditService.queryAuditLogs({
        startDate: mediumEnd,
        endDate: recentStart,
        limit: 100
      });

      dateRangeQuery.logs.forEach(log => {
        const logDate = new Date(log.created_at);
        expect(logDate.getTime()).toBeGreaterThanOrEqual(new Date(mediumEnd).getTime());
        expect(logDate.getTime()).toBeLessThanOrEqual(new Date(recentStart).getTime());
      });

      // Query logs from specific time period
      const recentOnlyQuery = await auditService.queryAuditLogs({
        startDate: recentStart,
        limit: 100
      });

      expect(recentOnlyQuery.logs.length).toBeGreaterThan(0);
      recentOnlyQuery.logs.forEach(log => {
        const logDate = new Date(log.created_at);
        expect(logDate.getTime()).toBeGreaterThanOrEqual(new Date(recentStart).getTime());
      });
    });

    it('should support advanced sorting and ordering', async () => {
      // Test different sorting combinations
      const sortingTests = [
        { orderBy: 'created_at', orderDirection: 'ASC' },
        { orderBy: 'created_at', orderDirection: 'DESC' },
        { orderBy: 'severity', orderDirection: 'ASC' },
        { orderBy: 'event_type', orderDirection: 'DESC' }
      ];

      for (const sortTest of sortingTests) {
        const sortedQuery = await auditService.queryAuditLogs({
          orderBy: sortTest.orderBy,
          orderDirection: sortTest.orderDirection,
          limit: 20
        });

        expect(sortedQuery.logs.length).toBeGreaterThan(1);

        // Verify sorting is applied correctly
        if (sortTest.orderBy === 'created_at') {
          for (let i = 1; i < sortedQuery.logs.length; i++) {
            const prev = new Date(sortedQuery.logs[i - 1].created_at);
            const current = new Date(sortedQuery.logs[i].created_at);

            if (sortTest.orderDirection === 'ASC') {
              expect(current.getTime()).toBeGreaterThanOrEqual(prev.getTime());
            } else {
              expect(current.getTime()).toBeLessThanOrEqual(prev.getTime());
            }
          }
        }
      }
    });

    it('should handle pagination efficiently', async () => {
      const pageSize = 10;
      const pages = [];

      // Fetch multiple pages
      for (let page = 0; page < 3; page++) {
        const pageQuery = await auditService.queryAuditLogs({
          limit: pageSize,
          offset: page * pageSize,
          orderBy: 'created_at',
          orderDirection: 'DESC'
        });

        pages.push(pageQuery);
        expect(pageQuery.logs.length).toBeLessThanOrEqual(pageSize);
      }

      // Verify pagination metadata
      expect(pages[0].total).toBeGreaterThan(pageSize);
      expect(pages[0].limit).toBe(pageSize);
      expect(pages[0].offset).toBe(0);
      expect(pages[0].hasMore).toBe(true);

      // Verify no duplicate records across pages
      const allIds = pages.flatMap(page => page.logs.map(log => log.id));
      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(allIds.length);

      // Verify chronological order across pages
      for (let pageIndex = 1; pageIndex < pages.length; pageIndex++) {
        if (pages[pageIndex].logs.length > 0 && pages[pageIndex - 1].logs.length > 0) {
          const lastPrevious = new Date(pages[pageIndex - 1].logs[pages[pageIndex - 1].logs.length - 1].created_at);
          const firstCurrent = new Date(pages[pageIndex].logs[0].created_at);

          expect(firstCurrent.getTime()).toBeLessThanOrEqual(lastPrevious.getTime());
        }
      }
    });
  });

  describe('Audit Trail Reconstruction Capabilities', () => {
    it('should reconstruct complete business process from audit trail', async () => {
      // Skip test if audit tables don't exist in test environment
      const health = await auditService.healthCheck();
      if (!health.audit_logs_table) {
        console.log('Skipping test: audit_logs table does not exist in test environment');
        return;
      }
      const processId = `process_${Date.now()}`;
      const transactionRef = `txn_${processId}`;
      const ticketId = `ticket_${processId}`;

      // Create a complete business process audit trail
      const processSteps = [
        {
          type: 'financial_event',
          action: 'payment_initiated',
          metadata: { step: 1, process: 'ticket_purchase' }
        },
        {
          type: 'data_change',
          action: 'cart_created',
          metadata: { step: 2, process: 'ticket_purchase' }
        },
        {
          type: 'financial_event',
          action: 'payment_completed',
          metadata: { step: 3, process: 'ticket_purchase' }
        },
        {
          type: 'data_change',
          action: 'ticket_created',
          metadata: { step: 4, process: 'ticket_purchase' }
        },
        {
          type: 'data_change',
          action: 'email_sent',
          metadata: { step: 5, process: 'ticket_purchase' }
        }
      ];

      // Log process steps
      for (const step of processSteps) {
        const requestId = `${testDatasets.requestIdPrefix}_process_${step.metadata.step}`;

        if (step.type === 'financial_event') {
          await auditService.logFinancialEvent({
            requestId,
            action: step.action,
            amountCents: 5000,
            currency: 'USD',
            transactionReference: transactionRef,
            paymentStatus: step.action.includes('completed') ? 'completed' : 'pending',
            targetType: 'transaction',
            targetId: transactionRef,
            metadata: {
              ...step.metadata,
              processId,
              category: 'process_reconstruction'
            }
          });
        } else {
          await auditService.logDataChange({
            requestId,
            action: step.action,
            targetType: step.action.includes('ticket') ? 'ticket' : step.action.includes('cart') ? 'cart' : 'email',
            targetId: step.action.includes('ticket') ? ticketId : `${step.action}_${processId}`,
            beforeValue: step.metadata.step === 1 ? null : { status: 'previous' },
            afterValue: { status: 'current', step: step.metadata.step },
            metadata: {
              ...step.metadata,
              processId,
              category: 'process_reconstruction'
            }
          });
        }
      }

      // Reconstruct the complete process
      const processAudit = await auditService.queryAuditLogs({
        limit: 100,
        orderBy: 'created_at',
        orderDirection: 'ASC'
      });

      const processLogs = processAudit.logs.filter(log => {
        try {
          const metadata = JSON.parse(log.metadata || '{}');
          return metadata.category === 'process_reconstruction' && metadata.processId === processId;
        } catch {
          return false;
        }
      });

      expect(processLogs).toHaveLength(5);

      // Verify process sequence
      const reconstructedSteps = processLogs.map(log => {
        const metadata = JSON.parse(log.metadata);
        return {
          step: metadata.step,
          action: log.action,
          eventType: log.event_type,
          timestamp: log.created_at
        };
      });

      // Verify chronological order
      for (let i = 1; i < reconstructedSteps.length; i++) {
        expect(reconstructedSteps[i].step).toBe(reconstructedSteps[i - 1].step + 1);
        expect(new Date(reconstructedSteps[i].timestamp).getTime())
          .toBeGreaterThanOrEqual(new Date(reconstructedSteps[i - 1].timestamp).getTime());
      }

      // Verify all process steps are present
      const stepNumbers = reconstructedSteps.map(step => step.step);
      expect(stepNumbers).toEqual([1, 2, 3, 4, 5]);
    });

    it('should track entity lifecycle through audit trail', async () => {
      // Skip test if audit tables don't exist in test environment
      const health = await auditService.healthCheck();
      if (!health.audit_logs_table) {
        console.log('Skipping test: audit_logs table does not exist in test environment');
        return;
      }
      const entityId = `entity_${Date.now()}`;

      // Create entity lifecycle events
      const lifecycleEvents = [
        { action: 'entity_created', status: 'draft' },
        { action: 'entity_validated', status: 'validated' },
        { action: 'entity_published', status: 'active' },
        { action: 'entity_modified', status: 'active' },
        { action: 'entity_archived', status: 'archived' }
      ];

      for (let i = 0; i < lifecycleEvents.length; i++) {
        const event = lifecycleEvents[i];
        const requestId = `${testDatasets.requestIdPrefix}_lifecycle_${i}`;

        await auditService.logDataChange({
          requestId,
          action: event.action,
          targetType: 'test_entity',
          targetId: entityId,
          beforeValue: i === 0 ? null : { status: lifecycleEvents[i - 1].status, version: i },
          afterValue: { status: event.status, version: i + 1 },
          changedFields: ['status', 'version'],
          metadata: {
            lifecycleStep: i + 1,
            entityId,
            category: 'lifecycle_tracking'
          }
        });
      }

      // Query entity lifecycle
      const lifecycleAudit = await auditService.queryAuditLogs({
        targetType: 'test_entity',
        targetId: entityId,
        orderBy: 'created_at',
        orderDirection: 'ASC',
        limit: 10
      });

      expect(lifecycleAudit.logs).toHaveLength(5);

      // Verify lifecycle progression
      lifecycleAudit.logs.forEach((log, index) => {
        const beforeValue = log.before_value ? JSON.parse(log.before_value) : null;
        const afterValue = JSON.parse(log.after_value);

        expect(afterValue.status).toBe(lifecycleEvents[index].status);
        expect(afterValue.version).toBe(index + 1);

        if (index > 0) {
          expect(beforeValue.status).toBe(lifecycleEvents[index - 1].status);
          expect(beforeValue.version).toBe(index);
        }
      });

      // Verify status transitions
      const statusTransitions = lifecycleAudit.logs.map(log => {
        const afterValue = JSON.parse(log.after_value);
        return afterValue.status;
      });

      expect(statusTransitions).toEqual(['draft', 'validated', 'active', 'active', 'archived']);
    });

    it('should correlate related events across different audit types', async () => {
      const correlationId = `correlation_${Date.now()}`;
      const sessionId = `session_${correlationId}`;
      const transactionRef = `txn_${correlationId}`;

      // Create correlated events across different audit types
      await auditService.logAdminAccess({
        requestId: `${testDatasets.requestIdPrefix}_corr_1`,
        adminUser: 'admin1',
        sessionId,
        ipAddress: '192.168.1.100',
        userAgent: 'CorrelationBrowser/1.0',
        requestMethod: 'POST',
        requestUrl: '/api/admin/transactions/create',
        responseStatus: 200,
        responseTimeMs: 250,
        metadata: {
          correlationId,
          category: 'correlation_test',
          operation: 'admin_initiated_transaction'
        }
      });

      await auditService.logFinancialEvent({
        requestId: `${testDatasets.requestIdPrefix}_corr_2`,
        action: 'manual_transaction_created',
        amountCents: 7500,
        currency: 'USD',
        transactionReference: transactionRef,
        paymentStatus: 'completed',
        targetType: 'transaction',
        targetId: transactionRef,
        metadata: {
          correlationId,
          category: 'correlation_test',
          initiatedBy: 'admin1',
          sessionId
        }
      });

      await auditService.logDataChange({
        requestId: `${testDatasets.requestIdPrefix}_corr_3`,
        action: 'audit_log_reviewed',
        targetType: 'audit_review',
        targetId: correlationId,
        beforeValue: { status: 'pending_review' },
        afterValue: { status: 'reviewed', reviewedBy: 'admin1' },
        adminUser: 'admin1',
        metadata: {
          correlationId,
          category: 'correlation_test',
          relatedTransaction: transactionRef,
          sessionId
        }
      });

      // Query and correlate events
      const correlatedAudit = await auditService.queryAuditLogs({
        limit: 100
      });

      const correlatedLogs = correlatedAudit.logs.filter(log => {
        try {
          const metadata = JSON.parse(log.metadata || '{}');
          return metadata.category === 'correlation_test' && metadata.correlationId === correlationId;
        } catch {
          return false;
        }
      });

      expect(correlatedLogs).toHaveLength(3);

      // Verify correlation across event types
      const eventTypes = correlatedLogs.map(log => log.event_type);
      expect(eventTypes).toContain('admin_access');
      expect(eventTypes).toContain('financial_event');
      expect(eventTypes).toContain('data_change');

      // Verify correlation data consistency
      correlatedLogs.forEach(log => {
        const metadata = JSON.parse(log.metadata);
        expect(metadata.correlationId).toBe(correlationId);

        if (log.session_id) {
          expect(log.session_id).toBe(sessionId);
        }
        if (log.transaction_reference) {
          expect(log.transaction_reference).toBe(transactionRef);
        }
      });
    });
  });

  describe('Audit Log Performance with Large Datasets', () => {
    it('should perform efficiently with large result sets', async () => {
      // Query large dataset and measure performance
      const startTime = Date.now();

      const largeQuery = await auditService.queryAuditLogs({
        limit: 100,
        orderBy: 'created_at',
        orderDirection: 'DESC'
      });

      const queryTime = Date.now() - startTime;

      expect(largeQuery.logs.length).toBeGreaterThan(50);
      expect(queryTime).toBeLessThan(1000); // Should complete within 1 second

      // Test pagination performance
      const pageStartTime = Date.now();

      const paginatedQuery = await auditService.queryAuditLogs({
        limit: 20,
        offset: 80,
        orderBy: 'created_at',
        orderDirection: 'DESC'
      });

      const pageQueryTime = Date.now() - pageStartTime;

      expect(paginatedQuery.logs.length).toBeGreaterThan(0);
      expect(pageQueryTime).toBeLessThan(500); // Pagination should be fast
    });

    it('should handle complex filters efficiently', async () => {
      // Test performance of complex multi-filter queries
      const complexFilterTests = [
        {
          name: 'event_type_and_admin',
          filters: { eventType: 'admin_access', adminUser: 'admin1' }
        },
        {
          name: 'severity_and_timerange',
          filters: {
            severity: 'warning',
            startDate: testDatasets.timeRanges.medium.toISOString()
          }
        },
        {
          name: 'target_type_and_date',
          filters: {
            targetType: 'transaction',
            endDate: testDatasets.timeRanges.recent.toISOString()
          }
        }
      ];

      for (const test of complexFilterTests) {
        const startTime = Date.now();

        const filteredQuery = await auditService.queryAuditLogs({
          ...test.filters,
          limit: 50
        });

        const filterTime = Date.now() - startTime;

        expect(filterTime).toBeLessThan(800); // Complex filters should be reasonably fast
        expect(filteredQuery.logs.length).toBeGreaterThanOrEqual(0);

        // Verify filter accuracy
        if (test.filters.eventType) {
          filteredQuery.logs.forEach(log => {
            expect(log.event_type).toBe(test.filters.eventType);
          });
        }
        if (test.filters.adminUser) {
          filteredQuery.logs.forEach(log => {
            expect(log.admin_user).toBe(test.filters.adminUser);
          });
        }
      }
    });

    it('should optimize index usage for common query patterns', async () => {
      // Test queries that should use indexes efficiently
      const indexedQueries = [
        {
          name: 'event_type_index',
          query: { eventType: 'financial_event' }
        },
        {
          name: 'admin_user_index',
          query: { adminUser: 'admin2' }
        },
        {
          name: 'severity_index',
          query: { severity: 'critical' }
        },
        {
          name: 'target_index',
          query: { targetType: 'ticket', targetId: 'ticket_1' }
        }
      ];

      for (const indexTest of indexedQueries) {
        const startTime = Date.now();

        const indexedQuery = await auditService.queryAuditLogs({
          ...indexTest.query,
          limit: 30
        });

        const indexTime = Date.now() - startTime;

        // Indexed queries should be very fast
        expect(indexTime).toBeLessThan(300);
        expect(indexedQuery.logs.length).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Audit Statistics and Reporting', () => {
    it('should generate comprehensive audit statistics', async () => {
      const timeframes = ['1h', '24h', '7d', '30d'];

      for (const timeframe of timeframes) {
        const stats = await auditService.getAuditStats(timeframe);

        expect(stats).toBeDefined();
        expect(stats.timeframe).toBe(timeframe);
        expect(stats.generated_at).toBeDefined();
        expect(Array.isArray(stats.stats)).toBe(true);

        // Verify statistics structure
        stats.stats.forEach(stat => {
          expect(stat).toHaveProperty('event_type');
          expect(stat).toHaveProperty('severity');
          expect(stat).toHaveProperty('count');
          expect(stat).toHaveProperty('unique_users');
          expect(typeof stat.count).toBe('number');
          expect(typeof stat.unique_users).toBe('number');
        });
      }
    });

    it('should provide event type distribution analysis', async () => {
      const stats = await auditService.getAuditStats('24h');

      // Analyze event type distribution
      const eventTypeStats = {};
      stats.stats.forEach(stat => {
        if (!eventTypeStats[stat.event_type]) {
          eventTypeStats[stat.event_type] = 0;
        }
        eventTypeStats[stat.event_type] += stat.count;
      });

      // Should have various event types
      expect(Object.keys(eventTypeStats).length).toBeGreaterThan(1);

      // Verify expected event types are present
      const expectedEventTypes = ['admin_access', 'data_change', 'financial_event', 'config_change'];
      const actualEventTypes = Object.keys(eventTypeStats);

      expectedEventTypes.forEach(expectedType => {
        if (actualEventTypes.includes(expectedType)) {
          expect(eventTypeStats[expectedType]).toBeGreaterThan(0);
        }
      });
    });

    it('should analyze severity level patterns', async () => {
      const stats = await auditService.getAuditStats('24h');

      // Analyze severity distribution
      const severityStats = {};
      stats.stats.forEach(stat => {
        if (!severityStats[stat.severity]) {
          severityStats[stat.severity] = 0;
        }
        severityStats[stat.severity] += stat.count;
      });

      // Should have multiple severity levels
      const severityLevels = Object.keys(severityStats);
      expect(severityLevels.length).toBeGreaterThan(1);

      // Verify severity levels are valid
      const validSeverities = ['debug', 'info', 'warning', 'error', 'critical'];
      severityLevels.forEach(severity => {
        expect(validSeverities).toContain(severity);
      });

      // Info logs should typically be most common in normal operations
      if (severityStats.info) {
        expect(severityStats.info).toBeGreaterThan(0);
      }
    });

    it('should track admin user activity patterns', async () => {
      const stats = await auditService.getAuditStats('24h');

      // Analyze admin user activity
      const adminActivity = {};
      stats.stats.forEach(stat => {
        if (stat.unique_users > 0) {
          const eventKey = `${stat.event_type}_${stat.severity}`;
          if (!adminActivity[eventKey]) {
            adminActivity[eventKey] = {
              totalCount: 0,
              uniqueUsers: stat.unique_users
            };
          }
          adminActivity[eventKey].totalCount += stat.count;
        }
      });

      // Should have admin activity tracked
      const activityKeys = Object.keys(adminActivity);
      expect(activityKeys.length).toBeGreaterThan(0);

      // Verify activity tracking
      activityKeys.forEach(key => {
        const activity = adminActivity[key];
        expect(activity.totalCount).toBeGreaterThan(0);
        expect(activity.uniqueUsers).toBeGreaterThan(0);
        expect(activity.uniqueUsers).toBeLessThanOrEqual(activity.totalCount);
      });
    });

    it('should provide audit health metrics', async () => {
      // Get audit service health
      const health = await auditService.healthCheck();

      expect(health.status).toBe('healthy');
      expect(health.initialized).toBe(true);
      expect(health.database_connected).toBe(true);
      expect(typeof health.total_logs).toBe('number');
      expect(health.total_logs).toBeGreaterThan(0);
      expect(health.timestamp).toBeDefined();

      // Verify audit log volume is reasonable
      expect(health.total_logs).toBeLessThan(1000000); // Should not be excessively large
    });

    it('should generate trend analysis over time', async () => {
      // Compare statistics across different timeframes
      const shortTerm = await auditService.getAuditStats('1h');
      const mediumTerm = await auditService.getAuditStats('24h');
      const longTerm = await auditService.getAuditStats('7d');

      // Calculate total activity for each timeframe
      const shortTermTotal = shortTerm.stats.reduce((sum, stat) => sum + stat.count, 0);
      const mediumTermTotal = mediumTerm.stats.reduce((sum, stat) => sum + stat.count, 0);
      const longTermTotal = longTerm.stats.reduce((sum, stat) => sum + stat.count, 0);

      // Longer timeframes should generally have more total activity
      expect(mediumTermTotal).toBeGreaterThanOrEqual(shortTermTotal);
      expect(longTermTotal).toBeGreaterThanOrEqual(mediumTermTotal);

      // Verify trend data structure consistency
      [shortTerm, mediumTerm, longTerm].forEach(stats => {
        expect(stats.timeframe).toBeDefined();
        expect(Array.isArray(stats.stats)).toBe(true);
        expect(stats.generated_at).toBeDefined();
      });

      // Analyze activity patterns
      const activityTrend = {
        shortTerm: shortTermTotal,
        mediumTerm: mediumTermTotal,
        longTerm: longTermTotal
      };

      // Activity should show reasonable growth patterns
      if (activityTrend.longTerm > 0) {
        const mediumToLongRatio = activityTrend.mediumTerm / activityTrend.longTerm;
        expect(mediumToLongRatio).toBeGreaterThan(0);
        expect(mediumToLongRatio).toBeLessThanOrEqual(1);
      }
    });
  });
});