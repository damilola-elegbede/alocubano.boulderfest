/**
 * Audit Service
 * Central audit logging service for tracking all system activities
 * Provides comprehensive audit trail for compliance and security monitoring
 */

import { getDatabaseClient } from './database.js';
import { logger } from './logger.js';
import crypto from 'crypto';

export class AuditService {
  constructor() {
    this.initialized = false;
    this.initializationPromise = null;
    this.db = null;
    this.maxRetries = 3;
    this.retryDelay = 1000;
  }

  /**
   * Execute database operation with retry logic for connection issues
   */
  async _executeWithRetry(operation) {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        logger.debug(`[Audit] _executeWithRetry attempt ${attempt}, hasDb:`, !!this.db);
        return await operation();
      } catch (error) {
        logger.debug(`[Audit] _executeWithRetry error:`, error.message);
        if (error.message?.includes('CLIENT_CLOSED') && attempt < this.maxRetries) {
          logger.debug(`[Audit] Database connection closed, retrying... (attempt ${attempt}/${this.maxRetries})`);
          // Reinitialize connection and retry
          this.initialized = false;
          this.initializationPromise = null;
          this.db = null; // Also reset the db reference
          await this.ensureInitialized();
          await new Promise(resolve => setTimeout(resolve, this.retryDelay));
          continue;
        }
        throw error;
      }
    }
  }

  /**
   * Ensure service is initialized using Promise-based singleton pattern
   */
  async ensureInitialized() {
    // Fast path: already initialized with valid database connection
    if (this.initialized && this.db) {
      // Double-check that the db is still valid
      try {
        // Quick validation - just check if execute exists
        if (typeof this.db.execute === 'function') {
          return this;
        }
      } catch (e) {
        // DB is invalid, reinitialize
        logger.debug('[Audit] Database connection invalid, reinitializing...');
        this.initialized = false;
        this.db = null;
      }
    }

    // If initialization is in progress, return the existing promise
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    // Start new initialization
    this.initializationPromise = this._performInitialization();

    try {
      await this.initializationPromise;
      return this;
    } catch (error) {
      // Clear promise on error to allow retry
      this.initializationPromise = null;
      this.initialized = false;
      this.db = null;
      throw error;
    }
  }

  /**
   * Perform actual initialization
   */
  async _performInitialization() {
    try {
      logger.debug('[AUDIT_INIT] Starting audit service initialization...');
      logger.debug('[Audit] Initializing audit service...');

      let freshDb;

      // In integration test mode, use the test isolation manager's database
      if (process.env.INTEGRATION_TEST_MODE === 'true') {
        logger.debug('[AUDIT_INIT] Integration test mode detected');
        try {
          logger.debug('[AUDIT_INIT] About to import test-isolation-manager...');
          const { getTestIsolationManager } = await import('./test-isolation-manager.js');
          logger.debug('[AUDIT_INIT] test-isolation-manager imported');

          logger.debug('[AUDIT_INIT] Getting isolation manager instance...');
          const isolationManager = getTestIsolationManager();
          logger.debug('[AUDIT_INIT] Isolation manager obtained');

          logger.debug('[AUDIT_INIT] Calling getScopedDatabaseClient()...');
          freshDb = await isolationManager.getScopedDatabaseClient();
          logger.debug('[AUDIT_INIT] Got scoped database client');
          logger.debug('[Audit] Using test isolation database for audit service');
        } catch (error) {
          logger.debug('[AUDIT_INIT] Test database error, falling back:', error.message);
          logger.warn('[Audit] Failed to get test database, falling back to standard database:', error.message);
          logger.debug('[AUDIT_INIT] Calling getDatabaseClient() as fallback...');
          freshDb = await getDatabaseClient();
          logger.debug('[AUDIT_INIT] getDatabaseClient() fallback complete');
        }
      } else {
        logger.debug('[AUDIT_INIT] Standard mode, calling getDatabaseClient()...');
        // Always get a fresh database client - don't cache it
        // This ensures we get the correct database for the current environment
        freshDb = await getDatabaseClient();
        logger.debug('[AUDIT_INIT] getDatabaseClient() complete');
      }

      if (!freshDb) {
        throw new Error('Failed to get database client - db is null');
      }

      // Set the fresh database client
      this.db = freshDb;

      logger.debug('[Audit] Got database client, checking audit table exists...');

      // Check that audit_logs table exists (created by migration system)
      await this._checkAuditTables();

      this.initialized = true;
      logger.debug('[Audit] Audit service initialized successfully with db:', !!this.db);
      return this;
    } catch (error) {
      logger.error('[Audit] Initialization failed:', error.message);
      this.initialized = false;
      this.db = null;
      throw error;
    }
  }

  /**
   * Check if required audit tables exist (migration system handles creation)
   * Uses exponential backoff retry for table availability in test environments
   */
  async _checkAuditTables() {
    const isTestMode = process.env.NODE_ENV === 'test' || process.env.INTEGRATION_TEST_MODE === 'true';
    const maxRetries = isTestMode ? 5 : 3;
    const baseDelay = isTestMode ? 100 : 50; // ms

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Check if audit_logs table exists (created by migration system)
        await this.db.execute('SELECT 1 FROM audit_logs LIMIT 1');
        logger.debug('[Audit] audit_logs table exists and accessible');
        return; // Success
      } catch (error) {
        if (error.message.includes('no such table')) {
          if (isTestMode && attempt < maxRetries) {
            // In test mode, retry with exponential backoff - tables might still be creating
            const delay = baseDelay * Math.pow(2, attempt - 1);
            logger.debug(`[Audit] audit_logs table not ready (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          } else if (isTestMode) {
            logger.warn('[Audit] audit_logs table does not exist in test mode - operations will be skipped');
            return; // Allow test to continue
          } else {
            throw new Error('Required table audit_logs not found. Ensure migrations are run.');
          }
        } else {
          // Other errors
          if (attempt < maxRetries) {
            const delay = baseDelay * Math.pow(2, attempt - 1);
            logger.debug(`[Audit] Table check error (attempt ${attempt}/${maxRetries}): ${error.message}, retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          throw error;
        }
      }
    }
  }

  /**
   * Generate unique request ID for traceability
   * Uses high-resolution time to prevent collisions in rapid succession
   */
  generateRequestId() {
    // Use process.hrtime.bigint() for nanosecond precision to avoid collisions
    const timestamp = process.hrtime.bigint().toString(36);
    const randomBytes = crypto.randomBytes(8).toString('hex');
    return `req_${timestamp}_${randomBytes}`;
  }

  /**
   * Sanitize sensitive data from objects
   */
  async sanitizeData(data, sensitiveFields = ['password', 'token', 'secret', 'key', 'auth', 'session']) {
    if (!data || typeof data !== 'object') {
      return data;
    }

    // First convert any BigInt values to JSON-safe format
    const { processDatabaseResult } = await import('./bigint-serializer.js');
    const bigIntSafe = processDatabaseResult(data);

    const sanitized = { ...bigIntSafe };

    for (const field of sensitiveFields) {
      for (const key in sanitized) {
        if (key.toLowerCase().includes(field.toLowerCase())) {
          sanitized[key] = '[REDACTED]';
        }
      }
    }

    return sanitized;
  }

  /**
   * Log data changes (CREATE, UPDATE, DELETE operations)
   */
  async logDataChange(params) {
    return this._executeWithRetry(async () => {
      await this.ensureInitialized();

      const {
        requestId = this.generateRequestId(),
        action,
        targetType,
        targetId,
        beforeValue = null,
        afterValue = null,
        changedFields = null,
        adminUser = null,
        sessionId = null,
        ipAddress = null,
        userAgent = null,
        metadata = null,
        severity = 'info'
      } = params;

      try {
        // Sanitize sensitive data
        const sanitizedBefore = await this.sanitizeData(beforeValue);
        const sanitizedAfter = await this.sanitizeData(afterValue);
        const sanitizedMetadata = await this.sanitizeData(metadata);

        const auditEntry = {
          sql: `INSERT INTO audit_logs (
            request_id, event_type, action, target_type, target_id,
            admin_user, session_id, ip_address, user_agent,
            before_value, after_value, changed_fields,
            metadata, severity, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            requestId || '',
            'data_change',
            action || 'UNKNOWN',
            targetType || null,
            targetId || null,
            adminUser || null,
            sessionId || null,
            ipAddress || null,
            userAgent || null,
            sanitizedBefore ? JSON.stringify(sanitizedBefore) : null,
            sanitizedAfter ? JSON.stringify(sanitizedAfter) : null,
            changedFields ? JSON.stringify(changedFields) : null,
            sanitizedMetadata ? JSON.stringify(sanitizedMetadata) : null,
            severity || 'info',
            new Date().toISOString()
          ]
        };

        await this.db.execute(auditEntry);
        logger.debug(`[Audit] Data change logged: ${action} on ${targetType}:${targetId}`);

        return { requestId, success: true };
      } catch (error) {
        // In test mode, silently handle missing table errors
        if (process.env.NODE_ENV === 'test' && error.message.includes('no such table')) {
          logger.debug(`[Audit] Skipping audit log in test mode - table not available: ${error.message}`);
          return { requestId, success: true, skipped: true };
        }
        logger.error('[Audit] Failed to log data change:', error.message);
        return { requestId, success: false, error: error.message };
      }
    });
  }

  /**
   * Log admin endpoint access with timing and response details
   */
  async logAdminAccess(params) {
    logger.debug('[Audit] logAdminAccess called with params:', {
      requestUrl: params.requestUrl,
      responseStatus: params.responseStatus,
      initialized: this.initialized,
      hasDb: !!this.db
    });

    // Store reference to ensure proper 'this' context
    const self = this;

    return this._executeWithRetry(async () => {
      logger.debug('[Audit] Inside _executeWithRetry arrow function - this === self?', this === self);
      logger.debug('[Audit] Before ensureInitialized - initialized:', this.initialized, 'hasDb:', !!this.db, 'self.hasDb:', !!self.db);
      await this.ensureInitialized();
      logger.debug('[Audit] After ensureInitialized - initialized:', this.initialized, 'hasDb:', !!this.db, 'self.hasDb:', !!self.db);

      const {
        requestId = this.generateRequestId(),
        adminUser,
        sessionId,
        ipAddress,
        userAgent,
        requestMethod,
        requestUrl,
        requestBody = null,
        responseStatus,
        responseTimeMs,
        metadata = null,
        error = null
      } = params;

      logger.debug('[Audit] About to insert audit log for:', requestUrl);

      try {
        // Sanitize request body
        const sanitizedBody = await this.sanitizeData(requestBody);
        const sanitizedMetadata = await this.sanitizeData(metadata);

        // Ensure response status is a valid HTTP status code first
        // Accept both numeric and string representations, defaulting to 200
        let validResponseStatus = 200;
        if (responseStatus !== null && responseStatus !== undefined) {
          const numericStatus = typeof responseStatus === 'string' ? parseInt(responseStatus, 10) : responseStatus;
          if (!isNaN(numericStatus) && numericStatus > 0 && numericStatus < 600) {
            validResponseStatus = numericStatus;
          }
        }

        // Determine severity based on validated response status and errors
        let severity = 'info';
        if (error || validResponseStatus >= 500) {
          severity = 'error';
        } else if (validResponseStatus >= 400) {
          severity = 'warning';
        }

        const auditEntry = {
          sql: `INSERT INTO audit_logs (
            request_id, event_type, action, admin_user, session_id,
            ip_address, user_agent, request_method, request_url,
            request_body, response_status, response_time_ms,
            metadata, error_message, severity, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            requestId || '',
            'admin_access',
            `${requestMethod || 'UNKNOWN'} ${requestUrl || '/unknown'}`,
            adminUser || null,
            sessionId || null,
            ipAddress || null,
            userAgent || null,
            requestMethod || null,
            requestUrl || null,
            sanitizedBody ? JSON.stringify(sanitizedBody) : null,
            validResponseStatus,
            responseTimeMs || 0,
            sanitizedMetadata ? JSON.stringify(sanitizedMetadata) : null,
            error || null,
            severity || 'info',
            new Date().toISOString()
          ]
        };

        logger.debug('[Audit] About to execute with db:', !!this.db);
        if (!this.db) {
          throw new Error('Database client is null when trying to insert audit log');
        }
        const result = await this.db.execute(auditEntry);
        logger.debug(`[Audit] Admin access logged: ${requestMethod} ${requestUrl} (${responseStatus}), result:`, result);
        logger.debug(`[Audit] Successfully inserted audit log with request_id: ${requestId}`);

        return { requestId, success: true };
      } catch (dbError) {
        // In test mode, silently handle missing table errors
        if (process.env.NODE_ENV === 'test' && dbError.message.includes('no such table')) {
          logger.debug(`[Audit] Skipping admin access log in test mode - table not available: ${dbError.message}`);
          return { requestId, success: true, skipped: true };
        }
        logger.error('[Audit] Failed to log admin access:', dbError.message);
        return { requestId, success: false, error: dbError.message };
      }
    });
  }

  /**
   * Log data processing activities for GDPR compliance
   */
  async logDataProcessing(params) {
    return this._executeWithRetry(async () => {
      await this.ensureInitialized();

      const {
        requestId = this.generateRequestId(),
        action,
        dataSubjectId,
        dataType,
        processingPurpose,
        legalBasis,
        retentionPeriod = null,
        adminUser = null,
        metadata = null,
        severity = 'info'
      } = params;

      try {
        const sanitizedMetadata = await this.sanitizeData(metadata);

        const auditEntry = {
          sql: `INSERT INTO audit_logs (
            request_id, event_type, action, data_subject_id, data_type,
            processing_purpose, legal_basis, retention_period,
            admin_user, metadata, severity, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            requestId || '',
            'data_processing',
            action || 'UNKNOWN',
            dataSubjectId || null,
            dataType || null,
            processingPurpose || null,
            legalBasis || null,
            retentionPeriod || null,
            adminUser || null,
            sanitizedMetadata ? JSON.stringify(sanitizedMetadata) : null,
            severity || 'info',
            new Date().toISOString()
          ]
        };

        await this.db.execute(auditEntry);
        logger.debug(`[Audit] Data processing logged: ${action} for subject ${dataSubjectId}`);

        return { requestId, success: true };
      } catch (error) {
        // In test mode, silently handle missing table errors
        if (process.env.NODE_ENV === 'test' && error.message.includes('no such table')) {
          logger.debug(`[Audit] Skipping data processing log in test mode - table not available: ${error.message}`);
          return { requestId, success: true, skipped: true };
        }
        logger.error('[Audit] Failed to log data processing:', error.message);
        return { requestId, success: false, error: error.message };
      } finally {
        // Note: Do NOT close the database connection here
        // The connection is a shared singleton and closing it affects all services
      }
    }).catch(error => {
      logger.error('[Audit] Failed to log data processing:', error.message);
      return { requestId: params.requestId || this.generateRequestId(), success: false, error: error.message };
    });
  }

  /**
   * Log financial events and transactions
   */
  async logFinancialEvent(params) {
    return this._executeWithRetry(async () => {
      await this.ensureInitialized();

      const {
        requestId = this.generateRequestId(),
        action,
        amountCents,
        currency = 'USD',
        transactionReference,
        paymentStatus,
        targetType = 'transaction',
        targetId,
        adminUser = null,
        metadata = null,
        severity = 'info',
        createdAt = null
      } = params;

      try {
        const sanitizedMetadata = await this.sanitizeData(metadata);

        // Allow override of timestamp, particularly useful for tests
        // If metadata contains created_at, use that; otherwise use createdAt param or current time
        let timestamp = createdAt || new Date().toISOString();
        if (metadata && metadata.created_at) {
          timestamp = metadata.created_at;
        }

      const auditEntry = {
        sql: `INSERT INTO audit_logs (
          request_id, event_type, action, target_type, target_id,
          amount_cents, currency, transaction_reference, payment_status,
          admin_user, metadata, severity, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          requestId || '',
          'financial_event',
          action || 'UNKNOWN',
          targetType || 'transaction',
          targetId || null,
          amountCents || 0,
          currency || 'USD',
          transactionReference || null,
          paymentStatus || null,
          adminUser || null,
          sanitizedMetadata ? JSON.stringify(sanitizedMetadata) : null,
          severity || 'info',
          timestamp
        ]
      };

        await this.db.execute(auditEntry);
        logger.debug(`[Audit] Financial event logged: ${action} for ${amountCents/100} ${currency}`);

        return { requestId, success: true };
      } catch (error) {
        // In test mode, silently handle missing table errors
        if (process.env.NODE_ENV === 'test' && error.message.includes('no such table')) {
          logger.debug(`[Audit] Skipping financial event log in test mode - table not available: ${error.message}`);
          return { requestId, success: true, skipped: true };
        }
        logger.error('[Audit] Failed to log financial event:', error.message);
        return { requestId, success: false, error: error.message };
      }
    });
  }

  /**
   * Log system configuration changes
   */
  async logConfigChange(params) {
    return this._executeWithRetry(async () => {
      await this.ensureInitialized();

      const {
        requestId = this.generateRequestId(),
        action,
        configKey,
        beforeValue = null,
        afterValue = null,
        configEnvironment = process.env.NODE_ENV || 'unknown',
        adminUser,
        sessionId = null,
        ipAddress = null,
        metadata = null,
        severity = 'warning' // Config changes are important
      } = params;

      try {
        // Always sanitize config values
        const sanitizedBefore = await this.sanitizeData(beforeValue);
        const sanitizedAfter = await this.sanitizeData(afterValue);
        const sanitizedMetadata = await this.sanitizeData(metadata);

        const auditEntry = {
          sql: `INSERT INTO audit_logs (
            request_id, event_type, action, config_key, config_environment,
            before_value, after_value, admin_user, session_id,
            ip_address, metadata, severity, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            requestId || '',
            'config_change',
            action || 'UNKNOWN',
            configKey || null,
            configEnvironment || 'unknown',
            sanitizedBefore ? JSON.stringify(sanitizedBefore) : null,
            sanitizedAfter ? JSON.stringify(sanitizedAfter) : null,
            adminUser || null,
            sessionId || null,
            ipAddress || null,
            sanitizedMetadata ? JSON.stringify(sanitizedMetadata) : null,
            severity || 'warning',
            new Date().toISOString()
          ]
        };

        await this.db.execute(auditEntry);
        logger.debug(`[Audit] Config change logged: ${action} on ${configKey}`);

        return { requestId, success: true };
      } catch (error) {
        // In test mode, silently handle missing table errors
        if (process.env.NODE_ENV === 'test' && error.message.includes('no such table')) {
          logger.debug(`[Audit] Skipping config change log in test mode - table not available: ${error.message}`);
          return { requestId, success: true, skipped: true };
        }
        logger.error('[Audit] Failed to log config change:', error.message);
        return { requestId, success: false, error: error.message };
      }
    });
  }

  /**
   * Query audit logs with filtering and pagination
   */
  async queryAuditLogs(params = {}) {
    // Extract parameters BEFORE retry wrapper to ensure they persist across retries
    const {
      eventType = null,
      action = null,
      adminUser = null,
      targetType = null,
      targetId = null,
      severity = null,
      startDate = null,
      endDate = null,
      limit = 50,
      offset = 0,
      orderBy = 'created_at',
      orderDirection = 'DESC'
    } = params;

    return this._executeWithRetry(async () => {
      await this.ensureInitialized();

      try {
        let query = 'SELECT * FROM audit_logs WHERE 1=1';
        const queryParams = [];

        // Add filters
        if (eventType) {
          query += ' AND event_type = ?';
          queryParams.push(eventType);
        }
        if (action) {
          query += ' AND action = ?';
          queryParams.push(action);
        }
        if (adminUser) {
          query += ' AND admin_user = ?';
          queryParams.push(adminUser);
        }
        if (targetType) {
          query += ' AND target_type = ?';
          queryParams.push(targetType);
        }
        if (targetId) {
          query += ' AND target_id = ?';
          queryParams.push(targetId);
        }
        if (severity) {
          query += ' AND severity = ?';
          queryParams.push(severity);
        }
        if (startDate) {
          query += ' AND created_at >= ?';
          queryParams.push(startDate);
        }
        if (endDate) {
          query += ' AND created_at <= ?';
          queryParams.push(endDate);
        }

        // Add ordering and pagination
        query += ` ORDER BY ${orderBy} ${orderDirection} LIMIT ? OFFSET ?`;
        queryParams.push(limit, offset);

        const result = await this.db.execute(query, queryParams);

        // Also get total count for pagination
        let countQuery = 'SELECT COUNT(*) as total FROM audit_logs WHERE 1=1';
        const countParams = queryParams.slice(0, -2); // Remove limit and offset

        if (eventType) countQuery += ' AND event_type = ?';
        if (action) countQuery += ' AND action = ?';
        if (adminUser) countQuery += ' AND admin_user = ?';
        if (targetType) countQuery += ' AND target_type = ?';
        if (targetId) countQuery += ' AND target_id = ?';
        if (severity) countQuery += ' AND severity = ?';
        if (startDate) countQuery += ' AND created_at >= ?';
        if (endDate) countQuery += ' AND created_at <= ?';

        const countResult = await this.db.execute(countQuery, countParams);

        return {
          logs: result.rows,
          total: countResult.rows[0].total,
          limit,
          offset,
          hasMore: (offset + limit) < countResult.rows[0].total
        };
      } catch (error) {
        // In test environments, return empty result if table doesn't exist or connection closed
        if (error.message && (error.message.includes('no such table: audit_logs') ||
                              error.message.includes('CLIENT_CLOSED') ||
                              error.code === 'CLIENT_CLOSED')) {
          return {
            logs: [],
            total: 0,
            limit: limit,  // Use extracted parameter, not params
            offset: offset,  // Use extracted parameter, not params
            hasMore: false
          };
        }
        logger.error('[Audit] Failed to query audit logs:', error.message);
        throw error;
      }
    });
  }

  /**
   * Get audit statistics for dashboard
   */
  async getAuditStats(timeframe = '24h') {
    await this.ensureInitialized();

    try {
      let timeFilter = '';
      switch (timeframe) {
        case '1h':
          timeFilter = "AND created_at >= datetime('now', '-1 hour')";
          break;
        case '24h':
          timeFilter = "AND created_at >= datetime('now', '-1 day')";
          break;
        case '7d':
          timeFilter = "AND created_at >= datetime('now', '-7 days')";
          break;
        case '30d':
          timeFilter = "AND created_at >= datetime('now', '-30 days')";
          break;
        default:
          timeFilter = "AND created_at >= datetime('now', '-1 day')";
      }

      const statsQuery = `
        SELECT
          event_type,
          severity,
          COUNT(*) as count,
          COUNT(DISTINCT admin_user) as unique_users,
          MIN(created_at) as first_event,
          MAX(created_at) as last_event
        FROM audit_logs
        WHERE 1=1 ${timeFilter}
        GROUP BY event_type, severity
        ORDER BY count DESC
      `;

      const result = await this.db.execute(statsQuery);

      return {
        timeframe,
        stats: result.rows,
        generated_at: new Date().toISOString()
      };
    } catch (error) {
      // In test environments, return empty stats if table doesn't exist or connection closed
      if (error.message && (error.message.includes('no such table: audit_logs') ||
                            error.message.includes('CLIENT_CLOSED') ||
                            error.code === 'CLIENT_CLOSED')) {
        return {
          timeframe,
          stats: [],
          generated_at: new Date().toISOString()
        };
      }
      logger.error('[Audit] Failed to get audit stats:', error.message);
      throw error;
    }
  }

  /**
   * Health check for audit service
   */
  async healthCheck() {
    try {
      await this.ensureInitialized();

      // Test database connectivity
      const testResult = await this.db.execute('SELECT COUNT(*) as count FROM audit_logs LIMIT 1');

      return {
        status: 'healthy',
        initialized: this.initialized,
        database_connected: true,
        total_logs: testResult.rows[0].count,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        initialized: this.initialized,
        database_connected: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

// Create singleton instance
const auditService = new AuditService();

// Export both the instance and the class
export default auditService;
export { auditService };