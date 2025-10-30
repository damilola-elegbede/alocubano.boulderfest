/**
 * Google Sheets Sync Error Scenarios Integration Tests
 * Tests comprehensive error handling for Google Sheets sync
 *
 * Covers:
 * - Rate limiting (429)
 * - Authentication failures (401)
 * - Permission denied (403)
 * - Resource not found (404)
 * - Network timeouts
 * - Partial batch failures
 * - Invalid data formats
 * - Quota exceeded
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getDatabaseClient } from '../../../../lib/database.js';
import authService from '../../../../lib/auth-service.js';
import { createTestTransaction } from '../../../helpers/test-data-factory.js';

describe('Google Sheets Sync Error Scenarios', () => {
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

    // Set up Google Sheets credentials
    process.env.GOOGLE_SHEET_ID = 'test-sheet-id';
    process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL = 'test@service-account.com';
    process.env.GOOGLE_SHEETS_PRIVATE_KEY = 'test-key';

    // Clean up test data
    await db.execute('DELETE FROM transaction_items WHERE is_test = 1');
    await db.execute('DELETE FROM transactions WHERE transaction_id LIKE ?', ['TEST-ERROR-%']);

    // Import handler (fresh for each test)
    const module = await import('../../../../api/sheets/sync.js');
    handler = module.default;
  });

  afterEach(async () => {
    // Clean up test data
    try {
      await db.execute('DELETE FROM transaction_items WHERE is_test = 1');
      await db.execute('DELETE FROM transactions WHERE transaction_id LIKE ?', ['TEST-ERROR-%']);
    } catch (error) {
      console.warn('Cleanup warning:', error.message);
    }

    delete process.env.GOOGLE_SHEET_ID;
    delete process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL;
    delete process.env.GOOGLE_SHEETS_PRIVATE_KEY;

    vi.restoreAllMocks();
  });

  describe('Rate Limiting (429)', () => {
    it('should handle rate limit exceeded error', async () => {
      const { GoogleSheetsService } = await import('../../../../lib/google-sheets-service.js');
      const mockSetupSheets = vi.spyOn(GoogleSheetsService.prototype, 'setupSheets')
        .mockRejectedValue(new Error('Rate limit exceeded'));

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

    it('should handle quota exceeded error', async () => {
      const { GoogleSheetsService } = await import('../../../../lib/google-sheets-service.js');
      const mockSetupSheets = vi.spyOn(GoogleSheetsService.prototype, 'setupSheets')
        .mockRejectedValue(new Error('Quota exceeded'));

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

      mockSetupSheets.mockRestore();
    });

    it('should handle API limit reached error', async () => {
      const { GoogleSheetsService } = await import('../../../../lib/google-sheets-service.js');
      const mockSetupSheets = vi.spyOn(GoogleSheetsService.prototype, 'setupSheets')
        .mockRejectedValue(new Error('API rate limit reached'));

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
      expect(res.body.hint).toBe('Try again later');

      mockSetupSheets.mockRestore();
    });
  });

  describe('Authentication Failures (401/403)', () => {
    it('should handle invalid credentials', async () => {
      const { GoogleSheetsService } = await import('../../../../lib/google-sheets-service.js');
      const mockSetupSheets = vi.spyOn(GoogleSheetsService.prototype, 'setupSheets')
        .mockRejectedValue(new Error('Invalid authentication credentials'));

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
      expect(res.body.hint).toContain('credentials');

      mockSetupSheets.mockRestore();
    });

    it('should handle permission denied', async () => {
      const { GoogleSheetsService } = await import('../../../../lib/google-sheets-service.js');
      const mockSetupSheets = vi.spyOn(GoogleSheetsService.prototype, 'setupSheets')
        .mockRejectedValue(new Error('Permission denied to access sheet'));

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

      mockSetupSheets.mockRestore();
    });

    it('should handle expired service account credentials', async () => {
      const { GoogleSheetsService } = await import('../../../../lib/google-sheets-service.js');
      const mockSetupSheets = vi.spyOn(GoogleSheetsService.prototype, 'setupSheets')
        .mockRejectedValue(new Error('Token expired or invalid auth'));

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
      expect(res.body.hint).toBeDefined();

      mockSetupSheets.mockRestore();
    });

    it('should handle insufficient scope error', async () => {
      const { GoogleSheetsService } = await import('../../../../lib/google-sheets-service.js');
      const mockSetupSheets = vi.spyOn(GoogleSheetsService.prototype, 'setupSheets')
        .mockRejectedValue(new Error('Insufficient permission for this scope'));

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

      mockSetupSheets.mockRestore();
    });
  });

  describe('Resource Not Found (404)', () => {
    it('should handle sheet not found', async () => {
      const { GoogleSheetsService } = await import('../../../../lib/google-sheets-service.js');
      const mockSetupSheets = vi.spyOn(GoogleSheetsService.prototype, 'setupSheets')
        .mockRejectedValue(new Error('Spreadsheet not found'));

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
      expect(res.body.hint).toContain('GOOGLE_SHEET_ID');

      mockSetupSheets.mockRestore();
    });

    it('should handle deleted sheet', async () => {
      const { GoogleSheetsService } = await import('../../../../lib/google-sheets-service.js');
      const mockSetupSheets = vi.spyOn(GoogleSheetsService.prototype, 'setupSheets')
        .mockRejectedValue(new Error('Sheet has been deleted'));

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

    it('should handle invalid sheet ID', async () => {
      const { GoogleSheetsService } = await import('../../../../lib/google-sheets-service.js');
      const mockSetupSheets = vi.spyOn(GoogleSheetsService.prototype, 'setupSheets')
        .mockRejectedValue(new Error('Invalid sheet ID format'));

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

      mockSetupSheets.mockRestore();
    });
  });

  describe('Network Errors', () => {
    it('should handle connection timeout', async () => {
      const { GoogleSheetsService } = await import('../../../../lib/google-sheets-service.js');
      const mockSetupSheets = vi.spyOn(GoogleSheetsService.prototype, 'setupSheets')
        .mockRejectedValue(new Error('ETIMEDOUT: Connection timed out'));

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

      expect(res.statusCode).toBe(500);
      expect(res.body.message).toContain('ETIMEDOUT');

      mockSetupSheets.mockRestore();
    });

    it('should handle network unreachable', async () => {
      const { GoogleSheetsService } = await import('../../../../lib/google-sheets-service.js');
      const mockSetupSheets = vi.spyOn(GoogleSheetsService.prototype, 'setupSheets')
        .mockRejectedValue(new Error('ENETUNREACH: Network is unreachable'));

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

      expect(res.statusCode).toBe(500);

      mockSetupSheets.mockRestore();
    });

    it('should handle connection refused', async () => {
      const { GoogleSheetsService } = await import('../../../../lib/google-sheets-service.js');
      const mockSetupSheets = vi.spyOn(GoogleSheetsService.prototype, 'setupSheets')
        .mockRejectedValue(new Error('ECONNREFUSED: Connection refused'));

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

      expect(res.statusCode).toBe(500);

      mockSetupSheets.mockRestore();
    });

    it('should handle DNS lookup failure', async () => {
      const { GoogleSheetsService } = await import('../../../../lib/google-sheets-service.js');
      const mockSetupSheets = vi.spyOn(GoogleSheetsService.prototype, 'setupSheets')
        .mockRejectedValue(new Error('ENOTFOUND: DNS lookup failed'));

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

      expect(res.statusCode).toBe(500);

      mockSetupSheets.mockRestore();
    });

    it('should handle socket hang up', async () => {
      const { GoogleSheetsService } = await import('../../../../lib/google-sheets-service.js');
      const mockSetupSheets = vi.spyOn(GoogleSheetsService.prototype, 'setupSheets')
        .mockRejectedValue(new Error('ECONNRESET: Socket hang up'));

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

      expect(res.statusCode).toBe(500);

      mockSetupSheets.mockRestore();
    });
  });

  describe('Data Validation Errors', () => {
    it('should handle invalid data format', async () => {
      const { GoogleSheetsService } = await import('../../../../lib/google-sheets-service.js');
      const mockSetupSheets = vi.spyOn(GoogleSheetsService.prototype, 'setupSheets')
        .mockResolvedValue(true);
      const mockSyncAllData = vi.spyOn(GoogleSheetsService.prototype, 'syncAllData')
        .mockRejectedValue(new Error('Invalid data format for sheet'));

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

      expect(res.statusCode).toBe(500);
      expect(res.body.message).toContain('Invalid data format');

      mockSetupSheets.mockRestore();
      mockSyncAllData.mockRestore();
    });

    it('should handle database query errors', async () => {
      const { GoogleSheetsService } = await import('../../../../lib/google-sheets-service.js');
      const mockSetupSheets = vi.spyOn(GoogleSheetsService.prototype, 'setupSheets')
        .mockResolvedValue(true);
      const mockSyncAllData = vi.spyOn(GoogleSheetsService.prototype, 'syncAllData')
        .mockRejectedValue(new Error('Database connection failed'));

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

      expect(res.statusCode).toBe(500);

      mockSetupSheets.mockRestore();
      mockSyncAllData.mockRestore();
    });

    it('should handle malformed row data', async () => {
      const { GoogleSheetsService } = await import('../../../../lib/google-sheets-service.js');
      const mockSetupSheets = vi.spyOn(GoogleSheetsService.prototype, 'setupSheets')
        .mockResolvedValue(true);
      const mockSyncAllData = vi.spyOn(GoogleSheetsService.prototype, 'syncAllData')
        .mockRejectedValue(new Error('Cannot read property of undefined'));

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

      expect(res.statusCode).toBe(500);

      mockSetupSheets.mockRestore();
      mockSyncAllData.mockRestore();
    });
  });

  describe('Partial Batch Failures', () => {
    it('should handle batch update failures', async () => {
      const { GoogleSheetsService } = await import('../../../../lib/google-sheets-service.js');
      const mockSetupSheets = vi.spyOn(GoogleSheetsService.prototype, 'setupSheets')
        .mockResolvedValue(true);
      const mockSyncAllData = vi.spyOn(GoogleSheetsService.prototype, 'syncAllData')
        .mockRejectedValue(new Error('Batch update failed'));

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

      expect(res.statusCode).toBe(500);

      mockSetupSheets.mockRestore();
      mockSyncAllData.mockRestore();
    });

    it('should handle cell format errors', async () => {
      const { GoogleSheetsService } = await import('../../../../lib/google-sheets-service.js');
      const mockSetupSheets = vi.spyOn(GoogleSheetsService.prototype, 'setupSheets')
        .mockResolvedValue(true);
      const mockSyncAllData = vi.spyOn(GoogleSheetsService.prototype, 'syncAllData')
        .mockRejectedValue(new Error('Invalid cell format'));

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

      expect(res.statusCode).toBe(500);

      mockSetupSheets.mockRestore();
      mockSyncAllData.mockRestore();
    });
  });

  describe('Service Quota Errors', () => {
    it('should handle daily quota exceeded', async () => {
      const { GoogleSheetsService } = await import('../../../../lib/google-sheets-service.js');
      const mockSetupSheets = vi.spyOn(GoogleSheetsService.prototype, 'setupSheets')
        .mockRejectedValue(new Error('Daily quota exceeded'));

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
      expect(res.body.hint).toBe('Try again later');

      mockSetupSheets.mockRestore();
    });

    it('should handle per-user quota exceeded', async () => {
      const { GoogleSheetsService } = await import('../../../../lib/google-sheets-service.js');
      const mockSetupSheets = vi.spyOn(GoogleSheetsService.prototype, 'setupSheets')
        .mockRejectedValue(new Error('User rate limit exceeded'));

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

      mockSetupSheets.mockRestore();
    });

    it('should handle write limit exceeded', async () => {
      const { GoogleSheetsService } = await import('../../../../lib/google-sheets-service.js');
      const mockSetupSheets = vi.spyOn(GoogleSheetsService.prototype, 'setupSheets')
        .mockRejectedValue(new Error('Write requests limit exceeded'));

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

      mockSetupSheets.mockRestore();
    });
  });

  describe('Concurrent Access', () => {
    it('should handle concurrent modification conflict', async () => {
      const { GoogleSheetsService } = await import('../../../../lib/google-sheets-service.js');
      const mockSetupSheets = vi.spyOn(GoogleSheetsService.prototype, 'setupSheets')
        .mockRejectedValue(new Error('Concurrent modification detected'));

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

      expect(res.statusCode).toBe(500);

      mockSetupSheets.mockRestore();
    });

    it('should handle lock timeout', async () => {
      const { GoogleSheetsService } = await import('../../../../lib/google-sheets-service.js');
      const mockSetupSheets = vi.spyOn(GoogleSheetsService.prototype, 'setupSheets')
        .mockRejectedValue(new Error('Sheet is locked by another process'));

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

      expect(res.statusCode).toBe(500);

      mockSetupSheets.mockRestore();
    });
  });

  describe('Recovery and Logging', () => {
    it('should log all error details', async () => {
      const { GoogleSheetsService } = await import('../../../../lib/google-sheets-service.js');
      const mockSetupSheets = vi.spyOn(GoogleSheetsService.prototype, 'setupSheets')
        .mockRejectedValue(new Error('Test error for logging'));

      const consoleSpy = vi.spyOn(console, 'error');

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

      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
      mockSetupSheets.mockRestore();
    });

    it('should provide actionable error messages', async () => {
      const { GoogleSheetsService } = await import('../../../../lib/google-sheets-service.js');
      const mockSetupSheets = vi.spyOn(GoogleSheetsService.prototype, 'setupSheets')
        .mockRejectedValue(new Error('Permission denied to access sheet'));

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

      expect(res.body.hint).toBeDefined();
      expect(res.body.hint).toBeTruthy();

      mockSetupSheets.mockRestore();
    });
  });
});
