/**
 * Google Sheets Scheduled Sync Integration Tests
 * Tests for /api/sheets/scheduled-sync endpoint
 *
 * Covers:
 * - CRON_SECRET authentication
 * - Automated sync execution
 * - Incremental sync logic
 * - Error handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getDatabaseClient } from '../../../../lib/database.js';
import { createTestTransaction } from '../../../helpers/test-data-factory.js';

describe('Google Sheets Scheduled Sync Integration Tests', () => {
  let db;
  let handler;
  const originalCronSecret = process.env.CRON_SECRET;

  beforeEach(async () => {
    db = await getDatabaseClient();

    // Set CRON_SECRET for testing
    process.env.CRON_SECRET = 'test-cron-secret-12345';

    // Clean up test data
    await db.execute('DELETE FROM transaction_items WHERE is_test = 1');
    await db.execute('DELETE FROM transactions WHERE transaction_id LIKE ?', ['TEST-CRON-%']);

    // Import handler (fresh for each test)
    const module = await import('../../../../api/sheets/scheduled-sync.js');
    handler = module.default;
  });

  afterEach(async () => {
    // Clean up test data
    try {
      await db.execute('DELETE FROM transaction_items WHERE is_test = 1');
      await db.execute('DELETE FROM transactions WHERE transaction_id LIKE ?', ['TEST-CRON-%']);
    } catch (error) {
      console.warn('Cleanup warning:', error.message);
    }

    // Restore CRON_SECRET
    if (originalCronSecret) {
      process.env.CRON_SECRET = originalCronSecret;
    } else {
      delete process.env.CRON_SECRET;
    }

    vi.restoreAllMocks();
  });

  describe('CRON_SECRET Authentication', () => {
    it('should require CRON_SECRET in Authorization header', async () => {
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
      };

      await handler(req, res);

      expect(res.statusCode).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('should accept valid CRON_SECRET', async () => {
      // Mock Google Sheets not configured to skip actual sync
      const originalSheetId = process.env.GOOGLE_SHEET_ID;
      delete process.env.GOOGLE_SHEET_ID;

      const req = {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-cron-secret-12345',
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
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Google Sheets not configured');

      // Restore
      if (originalSheetId) {
        process.env.GOOGLE_SHEET_ID = originalSheetId;
      }
    });

    it('should reject invalid CRON_SECRET', async () => {
      const req = {
        method: 'POST',
        headers: {
          authorization: 'Bearer wrong-secret',
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
      expect(res.body.error).toBe('Unauthorized');
    });

    it('should reject missing Bearer prefix', async () => {
      const req = {
        method: 'POST',
        headers: {
          authorization: 'test-cron-secret-12345',
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

    it('should handle missing CRON_SECRET environment variable', async () => {
      delete process.env.CRON_SECRET;

      const req = {
        method: 'POST',
        headers: {
          authorization: 'Bearer any-secret',
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

  describe('Configuration Handling', () => {
    it('should skip sync when Google Sheets not configured', async () => {
      const originalSheetId = process.env.GOOGLE_SHEET_ID;
      const originalEmail = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL;
      const originalKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY;

      delete process.env.GOOGLE_SHEET_ID;
      delete process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL;
      delete process.env.GOOGLE_SHEETS_PRIVATE_KEY;

      const req = {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-cron-secret-12345',
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
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Google Sheets not configured');

      // Restore
      if (originalSheetId) process.env.GOOGLE_SHEET_ID = originalSheetId;
      if (originalEmail) process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL = originalEmail;
      if (originalKey) process.env.GOOGLE_SHEETS_PRIVATE_KEY = originalKey;
    });

    it('should skip sync when GOOGLE_SHEET_ID is missing', async () => {
      const originalSheetId = process.env.GOOGLE_SHEET_ID;
      delete process.env.GOOGLE_SHEET_ID;

      process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL = 'test@service-account.com';
      process.env.GOOGLE_SHEETS_PRIVATE_KEY = 'test-key';

      const req = {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-cron-secret-12345',
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
      expect(res.body.success).toBe(false);

      // Restore
      if (originalSheetId) process.env.GOOGLE_SHEET_ID = originalSheetId;
    });

    it('should log when skipping due to missing configuration', async () => {
      const originalSheetId = process.env.GOOGLE_SHEET_ID;
      delete process.env.GOOGLE_SHEET_ID;

      const consoleSpy = vi.spyOn(console, 'log');

      const req = {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-cron-secret-12345',
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

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Google Sheets not configured')
      );

      consoleSpy.mockRestore();
      if (originalSheetId) process.env.GOOGLE_SHEET_ID = originalSheetId;
    });
  });

  describe('Sync Execution with Mock', () => {
    beforeEach(() => {
      process.env.GOOGLE_SHEET_ID = 'test-sheet-id';
      process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL = 'test@service-account.com';
      process.env.GOOGLE_SHEETS_PRIVATE_KEY = 'test-key';
    });

    afterEach(() => {
      delete process.env.GOOGLE_SHEET_ID;
      delete process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL;
      delete process.env.GOOGLE_SHEETS_PRIVATE_KEY;
    });

    it('should execute scheduled sync successfully', async () => {
      // Create test data
      await createTestTransaction({
        transaction_id: 'TEST-CRON-001',
        status: 'completed',
        amount_cents: 10000,
      });

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
          authorization: 'Bearer test-cron-secret-12345',
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

    it('should log sync completion', async () => {
      const { GoogleSheetsService } = await import('../../../../lib/google-sheets-service.js');
      const mockSetupSheets = vi.spyOn(GoogleSheetsService.prototype, 'setupSheets')
        .mockResolvedValue(true);
      const mockSyncAllData = vi.spyOn(GoogleSheetsService.prototype, 'syncAllData')
        .mockResolvedValue({
          success: true,
          timestamp: '2026-01-15 10:00:00',
        });

      const consoleSpy = vi.spyOn(console, 'log');

      const req = {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-cron-secret-12345',
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

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Scheduled sync completed')
      );

      consoleSpy.mockRestore();
      mockSetupSheets.mockRestore();
      mockSyncAllData.mockRestore();
    });

    it('should setup sheets before syncing', async () => {
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
          authorization: 'Bearer test-cron-secret-12345',
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

      // Verify setupSheets was called before syncAllData
      expect(mockSetupSheets).toHaveBeenCalled();
      expect(mockSyncAllData).toHaveBeenCalled();

      // Check call order
      const setupCallOrder = mockSetupSheets.mock.invocationCallOrder[0];
      const syncCallOrder = mockSyncAllData.mock.invocationCallOrder[0];
      expect(setupCallOrder).toBeLessThan(syncCallOrder);

      mockSetupSheets.mockRestore();
      mockSyncAllData.mockRestore();
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      process.env.GOOGLE_SHEET_ID = 'test-sheet-id';
      process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL = 'test@service-account.com';
      process.env.GOOGLE_SHEETS_PRIVATE_KEY = 'test-key';
    });

    afterEach(() => {
      delete process.env.GOOGLE_SHEET_ID;
      delete process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL;
      delete process.env.GOOGLE_SHEETS_PRIVATE_KEY;
    });

    it('should handle sync failures gracefully', async () => {
      const { GoogleSheetsService } = await import('../../../../lib/google-sheets-service.js');
      const mockSetupSheets = vi.spyOn(GoogleSheetsService.prototype, 'setupSheets')
        .mockRejectedValue(new Error('Sync failed'));

      const req = {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-cron-secret-12345',
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
      expect(res.body.error).toBe('Sync failed');
      expect(res.body.message).toBeDefined();

      mockSetupSheets.mockRestore();
    });

    it('should log sync errors', async () => {
      const { GoogleSheetsService } = await import('../../../../lib/google-sheets-service.js');
      const mockSetupSheets = vi.spyOn(GoogleSheetsService.prototype, 'setupSheets')
        .mockRejectedValue(new Error('Test sync error'));

      const consoleSpy = vi.spyOn(console, 'error');

      const req = {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-cron-secret-12345',
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

      expect(consoleSpy).toHaveBeenCalledWith(
        'Scheduled sync failed:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
      mockSetupSheets.mockRestore();
    });

    it('should handle authentication errors', async () => {
      const { GoogleSheetsService } = await import('../../../../lib/google-sheets-service.js');
      const mockSetupSheets = vi.spyOn(GoogleSheetsService.prototype, 'setupSheets')
        .mockRejectedValue(new Error('Invalid credentials'));

      const req = {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-cron-secret-12345',
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
      expect(res.body.message).toBe('Invalid credentials');

      mockSetupSheets.mockRestore();
    });

    it('should handle network errors', async () => {
      const { GoogleSheetsService } = await import('../../../../lib/google-sheets-service.js');
      const mockSetupSheets = vi.spyOn(GoogleSheetsService.prototype, 'setupSheets')
        .mockRejectedValue(new Error('ETIMEDOUT'));

      const req = {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-cron-secret-12345',
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
      expect(res.body.message).toBe('ETIMEDOUT');

      mockSetupSheets.mockRestore();
    });

    it('should handle rate limiting errors', async () => {
      const { GoogleSheetsService } = await import('../../../../lib/google-sheets-service.js');
      const mockSetupSheets = vi.spyOn(GoogleSheetsService.prototype, 'setupSheets')
        .mockRejectedValue(new Error('Rate limit exceeded'));

      const req = {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-cron-secret-12345',
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
      expect(res.body.message).toBe('Rate limit exceeded');

      mockSetupSheets.mockRestore();
    });
  });

  describe('Incremental Sync Logic', () => {
    beforeEach(() => {
      process.env.GOOGLE_SHEET_ID = 'test-sheet-id';
      process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL = 'test@service-account.com';
      process.env.GOOGLE_SHEETS_PRIVATE_KEY = 'test-key';
    });

    afterEach(() => {
      delete process.env.GOOGLE_SHEET_ID;
      delete process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL;
      delete process.env.GOOGLE_SHEETS_PRIVATE_KEY;
    });

    it('should sync all data on each run', async () => {
      // Note: Current implementation syncs ALL data, not incremental
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
          authorization: 'Bearer test-cron-secret-12345',
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

      expect(mockSyncAllData).toHaveBeenCalled();

      mockSetupSheets.mockRestore();
      mockSyncAllData.mockRestore();
    });
  });

  describe('HTTP Methods', () => {
    it('should accept GET requests (for cron)', async () => {
      const originalSheetId = process.env.GOOGLE_SHEET_ID;
      delete process.env.GOOGLE_SHEET_ID;

      const req = {
        method: 'GET',
        headers: {
          authorization: 'Bearer test-cron-secret-12345',
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

      if (originalSheetId) process.env.GOOGLE_SHEET_ID = originalSheetId;
    });

    it('should accept POST requests', async () => {
      const originalSheetId = process.env.GOOGLE_SHEET_ID;
      delete process.env.GOOGLE_SHEET_ID;

      const req = {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-cron-secret-12345',
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

      if (originalSheetId) process.env.GOOGLE_SHEET_ID = originalSheetId;
    });
  });
});
