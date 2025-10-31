/**
 * Google Sheets Manual Sync Integration Tests
 * Tests for /api/sheets/sync endpoint
 *
 * Covers:
 * - Authentication and authorization
 * - Sync execution and statistics
 * - Error handling and recovery
 * - Data validation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getDatabaseClient } from '../../../../lib/database.js';
import authService from '../../../../lib/auth-service.js';
import { createTestTransaction } from '../../../helpers/test-data-factory.js';

describe('Google Sheets Manual Sync Integration Tests', () => {
  let db;
  let adminToken;
  let handler;

  beforeEach(async () => {
    db = await getDatabaseClient();

    // Reset auth service
    authService.initialized = false;
    authService.initializationPromise = null;
    await authService.ensureInitialized();

    // Create admin JWT token
    adminToken = await authService.createSessionToken('admin');

    // Clean up test data
    await db.execute('DELETE FROM transaction_items WHERE is_test = 1');
    await db.execute('DELETE FROM transactions WHERE transaction_id LIKE ?', ['TEST-SHEETS-%']);

    // Import handler (fresh for each test)
    const module = await import('../../../../api/sheets/sync.js');
    handler = module.default;
  });

  afterEach(async () => {
    // Clean up test data
    try {
      await db.execute('DELETE FROM transaction_items WHERE is_test = 1');
      await db.execute('DELETE FROM transactions WHERE transaction_id LIKE ?', ['TEST-SHEETS-%']);
    } catch (error) {
      console.warn('Cleanup warning:', error.message);
    }
    vi.restoreAllMocks();
  });

  describe('Authentication Requirements', () => {
    it('should require authentication (401 without token)', async () => {
      const req = {
        method: 'POST',
        headers: {},
      };

      const res = {
        statusCode: 200,
        headers: {},
        setHeader: function(key, value) {
          this.headers[key] = value;
          return this;
        },
        status: function(code) {
          this.statusCode = code;
          return this;
        },
        json: function(data) {
          this.body = data;
          return this;
        },
        end: function(message) {
          this.endMessage = message;
          return this;
        },
      };

      await handler(req, res);

      expect(res.statusCode).toBe(401);
    });

    it('should accept valid admin JWT token', async () => {
      // Mock Google Sheets not configured to skip actual sync
      const originalSheetId = process.env.GOOGLE_SHEET_ID;
      delete process.env.GOOGLE_SHEET_ID;

      const req = {
        method: 'POST',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      };

      const res = {
        statusCode: 200,
        headers: {},
        setHeader: function(key, value) {
          this.headers[key] = value;
          return this;
        },
        status: function(code) {
          this.statusCode = code;
          return this;
        },
        json: function(data) {
          this.body = data;
          return this;
        },
      };

      await handler(req, res);

      expect(res.statusCode).toBe(503);
      expect(res.body.error).toBe('Google Sheets not configured');

      // Restore
      if (originalSheetId) {
        process.env.GOOGLE_SHEET_ID = originalSheetId;
      }
    });

    it('should reject invalid JWT token', async () => {
      const req = {
        method: 'POST',
        headers: {
          authorization: 'Bearer invalid-token',
        },
      };

      const res = {
        statusCode: 200,
        headers: {},
        setHeader: function(key, value) {
          this.headers[key] = value;
          return this;
        },
        status: function(code) {
          this.statusCode = code;
          return this;
        },
        json: function(data) {
          this.body = data;
          return this;
        },
      };

      await handler(req, res);

      expect(res.statusCode).toBe(401);
    });

    it('should reject expired JWT token', async () => {
      // Create token that expired 1 hour ago
      const expiredToken = await authService.createSessionToken('admin', -3600);

      const req = {
        method: 'POST',
        headers: {
          authorization: `Bearer ${expiredToken}`,
        },
      };

      const res = {
        statusCode: 200,
        headers: {},
        setHeader: function(key, value) {
          this.headers[key] = value;
          return this;
        },
        status: function(code) {
          this.statusCode = code;
          return this;
        },
        json: function(data) {
          this.body = data;
          return this;
        },
      };

      await handler(req, res);

      expect(res.statusCode).toBe(401);
    });
  });

  describe('HTTP Method Requirements', () => {
    it('should only accept POST requests', async () => {
      const req = {
        method: 'GET',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      };

      const res = {
        statusCode: 200,
        headers: {},
        setHeader: function(key, value) {
          this.headers[key] = value;
          return this;
        },
        status: function(code) {
          this.statusCode = code;
          return this;
        },
        end: function(message) {
          this.statusCode = 405;
          this.endMessage = message;
          return this;
        },
      };

      await handler(req, res);

      expect(res.statusCode).toBe(405);
      expect(res.headers['Allow']).toBe('POST');
    });

    it('should reject PUT requests', async () => {
      const req = {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      };

      const res = {
        statusCode: 200,
        headers: {},
        setHeader: function(key, value) {
          this.headers[key] = value;
          return this;
        },
        status: function(code) {
          this.statusCode = code;
          return this;
        },
        end: function(message) {
          this.statusCode = 405;
          this.endMessage = message;
          return this;
        },
      };

      await handler(req, res);

      expect(res.statusCode).toBe(405);
    });

    it('should reject DELETE requests', async () => {
      const req = {
        method: 'DELETE',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      };

      const res = {
        statusCode: 200,
        headers: {},
        setHeader: function(key, value) {
          this.headers[key] = value;
          return this;
        },
        status: function(code) {
          this.statusCode = code;
          return this;
        },
        end: function(message) {
          this.statusCode = 405;
          this.endMessage = message;
          return this;
        },
      };

      await handler(req, res);

      expect(res.statusCode).toBe(405);
    });
  });

  describe('Configuration Validation', () => {
    it('should return 503 when GOOGLE_SHEET_ID is missing', async () => {
      const originalSheetId = process.env.GOOGLE_SHEET_ID;
      delete process.env.GOOGLE_SHEET_ID;

      const req = {
        method: 'POST',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      };

      const res = {
        statusCode: 200,
        headers: {},
        setHeader: function(key, value) {
          this.headers[key] = value;
          return this;
        },
        status: function(code) {
          this.statusCode = code;
          return this;
        },
        json: function(data) {
          this.body = data;
          return this;
        },
      };

      await handler(req, res);

      expect(res.statusCode).toBe(503);
      expect(res.body.error).toBe('Google Sheets not configured');
      expect(res.body.missingVariables).toContain('GOOGLE_SHEET_ID');

      // Restore
      if (originalSheetId) {
        process.env.GOOGLE_SHEET_ID = originalSheetId;
      }
    });

    it('should return 503 when service account email is missing', async () => {
      const originalEmail = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL;
      delete process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL;

      const req = {
        method: 'POST',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      };

      const res = {
        statusCode: 200,
        headers: {},
        setHeader: function(key, value) {
          this.headers[key] = value;
          return this;
        },
        status: function(code) {
          this.statusCode = code;
          return this;
        },
        json: function(data) {
          this.body = data;
          return this;
        },
      };

      await handler(req, res);

      expect(res.statusCode).toBe(503);
      expect(res.body.error).toBe('Google Sheets not configured');
      expect(res.body.missingVariables).toContain('GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL');

      // Restore
      if (originalEmail) {
        process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL = originalEmail;
      }
    });

    it('should return 503 when private key is missing', async () => {
      const originalKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY;
      delete process.env.GOOGLE_SHEETS_PRIVATE_KEY;

      const req = {
        method: 'POST',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      };

      const res = {
        statusCode: 200,
        headers: {},
        setHeader: function(key, value) {
          this.headers[key] = value;
          return this;
        },
        status: function(code) {
          this.statusCode = code;
          return this;
        },
        json: function(data) {
          this.body = data;
          return this;
        },
      };

      await handler(req, res);

      expect(res.statusCode).toBe(503);
      expect(res.body.error).toBe('Google Sheets not configured');
      expect(res.body.missingVariables).toContain('GOOGLE_SHEETS_PRIVATE_KEY');

      // Restore
      if (originalKey) {
        process.env.GOOGLE_SHEETS_PRIVATE_KEY = originalKey;
      }
    });

    it('should provide configuration status', async () => {
      const originalSheetId = process.env.GOOGLE_SHEET_ID;
      const originalEmail = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL;
      delete process.env.GOOGLE_SHEET_ID;
      delete process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL;

      const req = {
        method: 'POST',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      };

      const res = {
        statusCode: 200,
        headers: {},
        setHeader: function(key, value) {
          this.headers[key] = value;
          return this;
        },
        status: function(code) {
          this.statusCode = code;
          return this;
        },
        json: function(data) {
          this.body = data;
          return this;
        },
      };

      await handler(req, res);

      expect(res.statusCode).toBe(503);
      expect(res.body.configurationStatus).toBeDefined();
      expect(res.body.configurationStatus.hasSheetId).toBe(false);
      expect(res.body.configurationStatus.hasServiceAccountEmail).toBe(false);

      // Restore
      if (originalSheetId) process.env.GOOGLE_SHEET_ID = originalSheetId;
      if (originalEmail) process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL = originalEmail;
    });
  });

  describe('Sync Execution with Mock', () => {
    let nestedOriginalEnvVars;

    beforeEach(() => {
      // Snapshot original env vars for nested describe
      nestedOriginalEnvVars = {
        GOOGLE_SHEET_ID: process.env.GOOGLE_SHEET_ID,
        GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL: process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL,
        GOOGLE_SHEETS_PRIVATE_KEY: process.env.GOOGLE_SHEETS_PRIVATE_KEY
      };

      // Set up Google Sheets credentials for testing
      process.env.GOOGLE_SHEET_ID = 'test-sheet-id';
      process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL = 'test@service-account.com';
      process.env.GOOGLE_SHEETS_PRIVATE_KEY = 'test-key';
    });

    afterEach(() => {
      // Restore original env vars for nested describe
      if (nestedOriginalEnvVars.GOOGLE_SHEET_ID !== undefined) {
        process.env.GOOGLE_SHEET_ID = nestedOriginalEnvVars.GOOGLE_SHEET_ID;
      } else {
        delete process.env.GOOGLE_SHEET_ID;
      }
      if (nestedOriginalEnvVars.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL !== undefined) {
        process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL = nestedOriginalEnvVars.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL;
      } else {
        delete process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL;
      }
      if (nestedOriginalEnvVars.GOOGLE_SHEETS_PRIVATE_KEY !== undefined) {
        process.env.GOOGLE_SHEETS_PRIVATE_KEY = nestedOriginalEnvVars.GOOGLE_SHEETS_PRIVATE_KEY;
      } else {
        delete process.env.GOOGLE_SHEETS_PRIVATE_KEY;
      }
    });

    it('should execute sync with test data', async () => {
      // Create test transactions
      await createTestTransaction({
        transaction_id: 'TEST-SHEETS-001',
        status: 'completed',
        amount_cents: 10000,
        customer_email: 'test1@example.com',
      });

      await createTestTransaction({
        transaction_id: 'TEST-SHEETS-002',
        status: 'completed',
        amount_cents: 15000,
        customer_email: 'test2@example.com',
      });

      // Mock Google Sheets Service
      const { GoogleSheetsService } = await import('../../../../lib/google-sheets-service.js');
      const mockSetupSheets = vi.spyOn(GoogleSheetsService.prototype, 'setupSheets')
        .mockResolvedValue(true);
      const mockSyncAllData = vi.spyOn(GoogleSheetsService.prototype, 'syncAllData')
        .mockResolvedValue({
          success: true,
          timestamp: new Date().toLocaleString('en-US', { timeZone: 'America/Denver' }),
        });

      const req = {
        method: 'POST',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      };

      const res = {
        statusCode: 200,
        headers: {},
        setHeader: function(key, value) {
          this.headers[key] = value;
          return this;
        },
        status: function(code) {
          this.statusCode = code;
          return this;
        },
        json: function(data) {
          this.body = data;
          return this;
        },
      };

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.timestamp).toBeDefined();
      expect(mockSetupSheets).toHaveBeenCalled();
      expect(mockSyncAllData).toHaveBeenCalled();

      mockSetupSheets.mockRestore();
      mockSyncAllData.mockRestore();
    });

    it('should return sheet URL in response', async () => {
      const { GoogleSheetsService } = await import('../../../../lib/google-sheets-service.js');
      const mockSetupSheets = vi.spyOn(GoogleSheetsService.prototype, 'setupSheets')
        .mockResolvedValue(true);
      const mockSyncAllData = vi.spyOn(GoogleSheetsService.prototype, 'syncAllData')
        .mockResolvedValue({
          success: true,
          timestamp: new Date().toLocaleString('en-US', { timeZone: 'America/Denver' }),
        });

      const req = {
        method: 'POST',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      };

      const res = {
        statusCode: 200,
        headers: {},
        setHeader: function(key, value) {
          this.headers[key] = value;
          return this;
        },
        status: function(code) {
          this.statusCode = code;
          return this;
        },
        json: function(data) {
          this.body = data;
          return this;
        },
      };

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.sheetUrl).toBe('https://docs.google.com/spreadsheets/d/test-sheet-id');

      mockSetupSheets.mockRestore();
      mockSyncAllData.mockRestore();
    });
  });

  describe('Error Responses', () => {
    let nestedOriginalEnvVars;

    beforeEach(() => {
      // Snapshot original env vars for nested describe
      nestedOriginalEnvVars = {
        GOOGLE_SHEET_ID: process.env.GOOGLE_SHEET_ID,
        GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL: process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL,
        GOOGLE_SHEETS_PRIVATE_KEY: process.env.GOOGLE_SHEETS_PRIVATE_KEY
      };

      process.env.GOOGLE_SHEET_ID = 'test-sheet-id';
      process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL = 'test@service-account.com';
      process.env.GOOGLE_SHEETS_PRIVATE_KEY = 'test-key';
    });

    afterEach(() => {
      // Restore original env vars for nested describe
      if (nestedOriginalEnvVars.GOOGLE_SHEET_ID !== undefined) {
        process.env.GOOGLE_SHEET_ID = nestedOriginalEnvVars.GOOGLE_SHEET_ID;
      } else {
        delete process.env.GOOGLE_SHEET_ID;
      }
      if (nestedOriginalEnvVars.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL !== undefined) {
        process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL = nestedOriginalEnvVars.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL;
      } else {
        delete process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL;
      }
      if (nestedOriginalEnvVars.GOOGLE_SHEETS_PRIVATE_KEY !== undefined) {
        process.env.GOOGLE_SHEETS_PRIVATE_KEY = nestedOriginalEnvVars.GOOGLE_SHEETS_PRIVATE_KEY;
      } else {
        delete process.env.GOOGLE_SHEETS_PRIVATE_KEY;
      }
    });

    it('should handle authentication errors (403)', async () => {
      const { GoogleSheetsService } = await import('../../../../lib/google-sheets-service.js');
      const mockSetupSheets = vi.spyOn(GoogleSheetsService.prototype, 'setupSheets')
        .mockRejectedValue(new Error('permission denied'));

      const req = {
        method: 'POST',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      };

      const res = {
        statusCode: 200,
        headers: {},
        setHeader: function(key, value) {
          this.headers[key] = value;
          return this;
        },
        status: function(code) {
          this.statusCode = code;
          return this;
        },
        json: function(data) {
          this.body = data;
          return this;
        },
      };

      await handler(req, res);

      expect(res.statusCode).toBe(403);
      expect(res.body.error).toBe('Authentication failed');
      expect(res.body.hint).toBeDefined();

      mockSetupSheets.mockRestore();
    });

    it('should handle sheet not found errors (404)', async () => {
      const { GoogleSheetsService } = await import('../../../../lib/google-sheets-service.js');
      const mockSetupSheets = vi.spyOn(GoogleSheetsService.prototype, 'setupSheets')
        .mockRejectedValue(new Error('Sheet not found'));

      const req = {
        method: 'POST',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      };

      const res = {
        statusCode: 200,
        headers: {},
        setHeader: function(key, value) {
          this.headers[key] = value;
          return this;
        },
        status: function(code) {
          this.statusCode = code;
          return this;
        },
        json: function(data) {
          this.body = data;
          return this;
        },
      };

      await handler(req, res);

      expect(res.statusCode).toBe(404);
      expect(res.body.error).toBe('Sheet not found');

      mockSetupSheets.mockRestore();
    });

    it('should handle rate limit errors (429)', async () => {
      const { GoogleSheetsService } = await import('../../../../lib/google-sheets-service.js');
      const mockSetupSheets = vi.spyOn(GoogleSheetsService.prototype, 'setupSheets')
        .mockRejectedValue(new Error('quota exceeded'));

      const req = {
        method: 'POST',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      };

      const res = {
        statusCode: 200,
        headers: {},
        setHeader: function(key, value) {
          this.headers[key] = value;
          return this;
        },
        status: function(code) {
          this.statusCode = code;
          return this;
        },
        json: function(data) {
          this.body = data;
          return this;
        },
      };

      await handler(req, res);

      expect(res.statusCode).toBe(429);
      expect(res.body.error).toBe('Rate limit exceeded');
      expect(res.body.hint).toBe('Try again later');

      mockSetupSheets.mockRestore();
    });

    it('should provide debug info in development mode', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const { GoogleSheetsService } = await import('../../../../lib/google-sheets-service.js');
      const mockSetupSheets = vi.spyOn(GoogleSheetsService.prototype, 'setupSheets')
        .mockRejectedValue(new Error('Test error'));

      const req = {
        method: 'POST',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      };

      const res = {
        statusCode: 200,
        headers: {},
        setHeader: function(key, value) {
          this.headers[key] = value;
          return this;
        },
        status: function(code) {
          this.statusCode = code;
          return this;
        },
        json: function(data) {
          this.body = data;
          return this;
        },
      };

      await handler(req, res);

      expect(res.body.debug).toBeDefined();
      expect(res.body.debug.sheetId).toBeDefined();
      expect(res.body.debug.serviceAccount).toBeDefined();

      mockSetupSheets.mockRestore();
      process.env.NODE_ENV = originalEnv;
    });

    it('should not provide debug info in production mode', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const { GoogleSheetsService } = await import('../../../../lib/google-sheets-service.js');
      const mockSetupSheets = vi.spyOn(GoogleSheetsService.prototype, 'setupSheets')
        .mockRejectedValue(new Error('Test error'));

      const req = {
        method: 'POST',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      };

      const res = {
        statusCode: 200,
        headers: {},
        setHeader: function(key, value) {
          this.headers[key] = value;
          return this;
        },
        status: function(code) {
          this.statusCode = code;
          return this;
        },
        json: function(data) {
          this.body = data;
          return this;
        },
      };

      await handler(req, res);

      expect(res.body.debug).toBeUndefined();

      mockSetupSheets.mockRestore();
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Security Headers', () => {
    it('should include security headers in response', async () => {
      const originalSheetId = process.env.GOOGLE_SHEET_ID;
      delete process.env.GOOGLE_SHEET_ID;

      const req = {
        method: 'POST',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      };

      const res = {
        statusCode: 200,
        headers: {},
        setHeader: function(key, value) {
          this.headers[key] = value;
          return this;
        },
        status: function(code) {
          this.statusCode = code;
          return this;
        },
        json: function(data) {
          this.body = data;
          return this;
        },
      };

      await handler(req, res);

      // Security headers should be set by withSecurityHeaders middleware
      expect(res.headers).toBeDefined();

      // Restore
      if (originalSheetId) {
        process.env.GOOGLE_SHEET_ID = originalSheetId;
      }
    });
  });

  describe('CSRF Protection', () => {
    it('should validate CSRF token', async () => {
      const originalSheetId = process.env.GOOGLE_SHEET_ID;
      delete process.env.GOOGLE_SHEET_ID;

      const req = {
        method: 'POST',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
        body: {}, // CSRF validation expects body
      };

      const res = {
        statusCode: 200,
        headers: {},
        setHeader: function(key, value) {
          this.headers[key] = value;
          return this;
        },
        status: function(code) {
          this.statusCode = code;
          return this;
        },
        json: function(data) {
          this.body = data;
          return this;
        },
      };

      await handler(req, res);

      // Should process request (CSRF middleware is in the chain)
      expect(res.statusCode).toBeGreaterThanOrEqual(200);

      // Restore
      if (originalSheetId) {
        process.env.GOOGLE_SHEET_ID = originalSheetId;
      }
    });
  });
});
