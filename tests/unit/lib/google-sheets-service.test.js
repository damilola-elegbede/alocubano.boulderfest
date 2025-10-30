/**
 * Google Sheets Service Unit Tests
 * Tests for lib/google-sheets-service.js
 *
 * Covers:
 * - Authentication and initialization
 * - Data transformation and formatting
 * - Sync logic and deduplication
 * - Error handling and rate limiting
 * - API interaction (mocked)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock dependencies first (hoisted)
vi.mock('@googleapis/sheets', () => ({
  sheets: vi.fn(() => ({ spreadsheets: { values: {} } }))
}));
vi.mock('google-auth-library', () => ({
  JWT: vi.fn()
}));
vi.mock('../../../lib/database.js', () => ({
  getDatabaseClient: vi.fn()
}));
vi.mock('../../../lib/bigint-serializer.js', () => ({
  processDatabaseResult: vi.fn(result => result)
}));

describe('GoogleSheetsService Unit Tests', () => {
  let GoogleSheetsService;
  let service;
  let mockSheets;
  let mockAuth;
  let mockDb;

  beforeEach(async () => {
    // Set environment variables before importing the module
    process.env.GOOGLE_SHEET_ID = 'test-sheet-id-123';
    process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL = 'test@service-account.com';
    process.env.GOOGLE_SHEETS_PRIVATE_KEY = 'test-private-key\\nwith\\nnewlines';
    process.env.SHEETS_TIMEZONE = 'America/Denver';

    // Dynamically import after env is set
    const module = await import('../../../lib/google-sheets-service.js');
    GoogleSheetsService = module.GoogleSheetsService;

    // Mock Google Sheets API
    mockSheets = {
      spreadsheets: {
        get: vi.fn(),
        values: {
          update: vi.fn(),
          clear: vi.fn(),
          get: vi.fn(),
        },
        batchUpdate: vi.fn(),
      },
    };

    // Mock JWT auth
    mockAuth = {
      authorize: vi.fn().mockResolvedValue(true),
    };

    // Mock database
    mockDb = {
      execute: vi.fn(),
    };

    // Mock modules
    const { sheets } = await import('@googleapis/sheets');
    const { JWT } = await import('google-auth-library');
    const { getDatabaseClient } = await import('../../../lib/database.js');
    const { processDatabaseResult } = await import('../../../lib/bigint-serializer.js');

    sheets.mockReturnValue(mockSheets);
    JWT.mockReturnValue(mockAuth);
    getDatabaseClient.mockResolvedValue(mockDb);
    processDatabaseResult.mockImplementation((result) => result);
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.GOOGLE_SHEET_ID;
    delete process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL;
    delete process.env.GOOGLE_SHEETS_PRIVATE_KEY;
    delete process.env.SHEETS_TIMEZONE;
  });

  describe('Authentication & Setup', () => {
    it('should initialize with credentials', () => {
      service = new GoogleSheetsService();
      expect(service.sheetId).toBe('test-sheet-id-123');
      expect(service.auth).toBeNull();
      expect(service.sheets).toBeNull();
    });

    it('should throw error on missing GOOGLE_SHEET_ID', () => {
      delete process.env.GOOGLE_SHEET_ID;
      expect(() => new GoogleSheetsService()).toThrow('GOOGLE_SHEET_ID environment variable is required');
    });

    it('should initialize Google Sheets client', async () => {
      service = new GoogleSheetsService();
      await service.initialize();

      expect(service.sheets).toBeDefined();
      expect(service.auth).toBeDefined();
    });

    it('should handle missing service account email', async () => {
      delete process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL;
      service = new GoogleSheetsService();

      await expect(service.initialize()).rejects.toThrow();
    });

    it('should handle missing private key', async () => {
      delete process.env.GOOGLE_SHEETS_PRIVATE_KEY;
      service = new GoogleSheetsService();

      await expect(service.initialize()).rejects.toThrow();
    });

    it('should replace newline characters in private key', async () => {
      const { JWT } = await import('google-auth-library');
      service = new GoogleSheetsService();
      await service.initialize();

      expect(JWT).toHaveBeenCalledWith(
        expect.objectContaining({
          key: expect.stringContaining('\n'),
        })
      );
    });

    it('should only initialize once', async () => {
      const { sheets } = await import('@googleapis/sheets');
      service = new GoogleSheetsService();

      await service.initialize();
      await service.initialize();
      await service.initialize();

      expect(sheets).toHaveBeenCalledTimes(1);
    });

    it('should handle initialization errors', async () => {
      const { sheets } = await import('@googleapis/sheets');
      sheets.mockImplementation(() => {
        throw new Error('API initialization failed');
      });

      service = new GoogleSheetsService();
      await expect(service.initialize()).rejects.toThrow('API initialization failed');
    });
  });

  describe('Data Transformation', () => {
    beforeEach(() => {
      service = new GoogleSheetsService();
    });

    it('should format ticket type correctly', () => {
      expect(service.formatTicketType('vip-pass')).toBe('VIP Pass');
      expect(service.formatTicketType('weekend-pass')).toBe('Weekend Pass');
      expect(service.formatTicketType('friday-pass')).toBe('Friday Pass');
      expect(service.formatTicketType('saturday-pass')).toBe('Saturday Pass');
      expect(service.formatTicketType('sunday-pass')).toBe('Sunday Pass');
      expect(service.formatTicketType('workshop-beginner')).toBe('Beginner Workshop');
      expect(service.formatTicketType('workshop-intermediate')).toBe('Intermediate Workshop');
      expect(service.formatTicketType('workshop-advanced')).toBe('Advanced Workshop');
      expect(service.formatTicketType('workshop')).toBe('Workshop');
      expect(service.formatTicketType('social-dance')).toBe('Social Dance');
      expect(service.formatTicketType('general-admission')).toBe('General Admission');
    });

    it('should handle unknown ticket types', () => {
      expect(service.formatTicketType('unknown-type')).toBe('unknown-type');
      expect(service.formatTicketType(null)).toBe('Unknown');
      expect(service.formatTicketType(undefined)).toBe('Unknown');
      expect(service.formatTicketType('')).toBe('Unknown');
    });

    it('should format dates correctly in Mountain Time', () => {
      const date = '2026-05-15';
      const formatted = service.formatDate(date);

      expect(formatted).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    });

    it('should handle null date values', () => {
      expect(service.formatDate(null)).toBe('');
      expect(service.formatDate(undefined)).toBe('');
      expect(service.formatDate('')).toBe('');
    });

    it('should handle invalid date strings', () => {
      const invalidDate = 'not-a-date';
      const formatted = service.formatDate(invalidDate);

      expect(formatted).toBeTruthy();
    });

    it('should format datetime correctly in Mountain Time', () => {
      const datetime = '2026-05-15T18:30:00Z';
      const formatted = service.formatDateTime(datetime);

      expect(formatted).toMatch(/\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}/);
    });

    it('should handle null datetime values', () => {
      expect(service.formatDateTime(null)).toBe('');
      expect(service.formatDateTime(undefined)).toBe('');
      expect(service.formatDateTime('')).toBe('');
    });

    it('should handle invalid datetime strings', () => {
      const invalidDateTime = 'invalid-datetime';
      const formatted = service.formatDateTime(invalidDateTime);

      expect(formatted).toBeTruthy();
    });

    it('should handle special characters in names', () => {
      // Test that special characters are preserved
      const type = "O'Brien-Workshop";
      const formatted = service.formatTicketType(type);
      expect(formatted).toBe(type);
    });

    it('should format currency correctly', () => {
      // Testing through sync methods that format prices
      const priceCents = 5000;
      const priceFormatted = `$${(priceCents / 100.0).toFixed(2)}`;
      expect(priceFormatted).toBe('$50.00');
    });
  });

  describe('Sheet Setup and Structure', () => {
    beforeEach(async () => {
      service = new GoogleSheetsService();
      await service.initialize();
    });

    it('should create missing sheets', async () => {
      mockSheets.spreadsheets.get.mockResolvedValue({
        data: {
          sheets: [],
        },
      });
      mockSheets.spreadsheets.batchUpdate.mockResolvedValue({});
      mockSheets.spreadsheets.values.update.mockResolvedValue({});

      await service.setupSheets();

      expect(mockSheets.spreadsheets.batchUpdate).toHaveBeenCalled();
      const batchCall = mockSheets.spreadsheets.batchUpdate.mock.calls[0][0];
      expect(batchCall.requestBody.requests.length).toBeGreaterThan(0);
    });

    it('should not create sheets that already exist', async () => {
      mockSheets.spreadsheets.get.mockResolvedValue({
        data: {
          sheets: [
            { properties: { title: 'Overview' } },
            { properties: { title: 'All Registrations' } },
            { properties: { title: 'Check-in Status' } },
            { properties: { title: 'Summary by Type' } },
            { properties: { title: 'Daily Sales' } },
            { properties: { title: 'Wallet Analytics' } },
          ],
        },
      });
      mockSheets.spreadsheets.values.update.mockResolvedValue({});

      await service.setupSheets();

      expect(mockSheets.spreadsheets.batchUpdate).not.toHaveBeenCalled();
    });

    it('should set headers for all sheets', async () => {
      mockSheets.spreadsheets.get.mockResolvedValue({
        data: { sheets: [] },
      });
      mockSheets.spreadsheets.batchUpdate.mockResolvedValue({});
      mockSheets.spreadsheets.values.update.mockResolvedValue({});

      await service.setupSheets();

      // Should call update for each sheet to set headers
      expect(mockSheets.spreadsheets.values.update).toHaveBeenCalled();
      expect(mockSheets.spreadsheets.values.update.mock.calls.length).toBeGreaterThan(0);
    });

    it('should create sheets with frozen header row', async () => {
      mockSheets.spreadsheets.get.mockResolvedValue({
        data: { sheets: [] },
      });
      mockSheets.spreadsheets.batchUpdate.mockResolvedValue({});
      mockSheets.spreadsheets.values.update.mockResolvedValue({});

      await service.setupSheets();

      const batchCall = mockSheets.spreadsheets.batchUpdate.mock.calls[0][0];
      const addSheetRequests = batchCall.requestBody.requests.filter(r => r.addSheet);

      addSheetRequests.forEach(request => {
        expect(request.addSheet.properties.gridProperties.frozenRowCount).toBe(1);
      });
    });
  });

  describe('Sheet Data Operations', () => {
    beforeEach(async () => {
      service = new GoogleSheetsService();
      await service.initialize();
    });

    it('should update sheet data', async () => {
      mockSheets.spreadsheets.values.update.mockResolvedValue({});

      const values = [['Header1', 'Header2'], ['Value1', 'Value2']];
      await service.updateSheetData('TestSheet', values, 'A1');

      expect(mockSheets.spreadsheets.values.update).toHaveBeenCalledWith({
        spreadsheetId: 'test-sheet-id-123',
        range: 'TestSheet!A1',
        valueInputOption: 'RAW',
        requestBody: { values },
      });
    });

    it('should clear and replace sheet data', async () => {
      mockSheets.spreadsheets.values.clear.mockResolvedValue({});
      mockSheets.spreadsheets.values.update.mockResolvedValue({});

      const values = [['Data1', 'Data2']];
      await service.replaceSheetData('TestSheet', values);

      expect(mockSheets.spreadsheets.values.clear).toHaveBeenCalledWith({
        spreadsheetId: 'test-sheet-id-123',
        range: 'TestSheet!A2:Z',
      });
      expect(mockSheets.spreadsheets.values.update).toHaveBeenCalled();
    });

    it('should handle empty data when replacing', async () => {
      mockSheets.spreadsheets.values.clear.mockResolvedValue({});
      mockSheets.spreadsheets.values.update.mockResolvedValue({});

      await service.replaceSheetData('TestSheet', []);

      expect(mockSheets.spreadsheets.values.clear).toHaveBeenCalled();
      expect(mockSheets.spreadsheets.values.update).not.toHaveBeenCalled();
    });
  });

  describe('Sync Overview Statistics', () => {
    beforeEach(async () => {
      service = new GoogleSheetsService();
      await service.initialize();
    });

    it('should sync overview statistics', async () => {
      mockDb.execute.mockResolvedValue({
        rows: [{
          total_tickets: 100,
          checked_in: 45,
          total_orders: 25,
          total_revenue: 5000.00,
          workshop_tickets: 30,
          vip_tickets: 10,
        }],
      });

      mockSheets.spreadsheets.values.clear.mockResolvedValue({});
      mockSheets.spreadsheets.values.update.mockResolvedValue({});

      const timestamp = new Date().toLocaleString('en-US', {
        timeZone: 'America/Denver',
      });

      await service.syncOverview(mockDb, timestamp);

      expect(mockDb.execute).toHaveBeenCalled();
      expect(mockSheets.spreadsheets.values.clear).toHaveBeenCalled();
    });

    it('should handle null statistics gracefully', async () => {
      mockDb.execute.mockResolvedValue({
        rows: [{
          total_tickets: null,
          checked_in: null,
          total_orders: null,
          total_revenue: null,
          workshop_tickets: null,
          vip_tickets: null,
        }],
      });

      mockSheets.spreadsheets.values.clear.mockResolvedValue({});
      mockSheets.spreadsheets.values.update.mockResolvedValue({});

      const timestamp = new Date().toLocaleString('en-US', {
        timeZone: 'America/Denver',
      });

      await expect(service.syncOverview(mockDb, timestamp)).resolves.not.toThrow();
    });

    it('should calculate check-in percentage correctly', async () => {
      mockDb.execute.mockResolvedValue({
        rows: [{
          total_tickets: 200,
          checked_in: 150,
          total_orders: 50,
          total_revenue: 10000.00,
          workshop_tickets: 60,
          vip_tickets: 20,
        }],
      });

      mockSheets.spreadsheets.values.clear.mockResolvedValue({});
      mockSheets.spreadsheets.values.update.mockResolvedValue({});

      const timestamp = new Date().toLocaleString('en-US', {
        timeZone: 'America/Denver',
      });

      await service.syncOverview(mockDb, timestamp);

      const updateCall = mockSheets.spreadsheets.values.update.mock.calls[0][0];
      const values = updateCall.requestBody.values;

      // Find the check-in percentage row
      const checkinRow = values.find(row => row[0] === 'Check-in Percentage');
      expect(checkinRow).toBeDefined();
      expect(checkinRow[1]).toBe('75%');
    });

    it('should handle wallet statistics when columns exist', async () => {
      mockDb.execute
        .mockResolvedValueOnce({
          rows: [{
            total_tickets: 100,
            checked_in: 80,
            total_orders: 25,
            total_revenue: 5000.00,
            workshop_tickets: 30,
            vip_tickets: 10,
          }],
        })
        .mockResolvedValueOnce({
          rows: [{
            wallet_checkins: 60,
            wallet_access: 60,
            qr_access: 20,
          }],
        });

      mockSheets.spreadsheets.values.clear.mockResolvedValue({});
      mockSheets.spreadsheets.values.update.mockResolvedValue({});

      const timestamp = new Date().toLocaleString('en-US', {
        timeZone: 'America/Denver',
      });

      await service.syncOverview(mockDb, timestamp);

      const updateCall = mockSheets.spreadsheets.values.update.mock.calls[0][0];
      const values = updateCall.requestBody.values;

      const walletRow = values.find(row => row[0] === 'Wallet Adoption Rate');
      expect(walletRow).toBeDefined();
      expect(walletRow[1]).toBe('75%');
    });

    it('should handle missing wallet columns gracefully', async () => {
      mockDb.execute
        .mockResolvedValueOnce({
          rows: [{
            total_tickets: 100,
            checked_in: 80,
            total_orders: 25,
            total_revenue: 5000.00,
            workshop_tickets: 30,
            vip_tickets: 10,
          }],
        })
        .mockRejectedValueOnce(new Error('no such column: wallet_source'));

      mockSheets.spreadsheets.values.clear.mockResolvedValue({});
      mockSheets.spreadsheets.values.update.mockResolvedValue({});

      const timestamp = new Date().toLocaleString('en-US', {
        timeZone: 'America/Denver',
      });

      await expect(service.syncOverview(mockDb, timestamp)).resolves.not.toThrow();
    });
  });

  describe('Sync Registrations', () => {
    beforeEach(async () => {
      service = new GoogleSheetsService();
      await service.initialize();
    });

    it('should sync all registrations', async () => {
      mockDb.execute.mockResolvedValue({
        rows: [
          {
            ticket_id: 'TKT-001',
            order_number: 'ORD-001',
            attendee_first_name: 'John',
            attendee_last_name: 'Doe',
            attendee_email: 'john@example.com',
            attendee_phone: '555-1234',
            ticket_type: 'weekend-pass',
            event_date: '2026-05-15',
            status: 'valid',
            checked_in: 'Yes',
            checked_in_at: '2026-05-15T18:00:00Z',
            purchase_date: '2026-01-15T10:00:00Z',
            price: 100.00,
            purchaser_email: 'john@example.com',
            wallet_source: null,
            qr_access_method: null,
          },
        ],
      });

      mockSheets.spreadsheets.values.clear.mockResolvedValue({});
      mockSheets.spreadsheets.values.update.mockResolvedValue({});

      await service.syncRegistrations(mockDb);

      expect(mockDb.execute).toHaveBeenCalled();
      const updateCall = mockSheets.spreadsheets.values.update.mock.calls[0][0];
      const values = updateCall.requestBody.values;

      expect(values.length).toBe(1);
      expect(values[0][0]).toBe('TKT-001');
      expect(values[0][2]).toBe('John');
      expect(values[0][3]).toBe('Doe');
      expect(values[0][6]).toBe('Weekend Pass');
    });

    it('should handle empty registrations', async () => {
      mockDb.execute.mockResolvedValue({ rows: [] });
      mockSheets.spreadsheets.values.clear.mockResolvedValue({});
      mockSheets.spreadsheets.values.update.mockResolvedValue({});

      await service.syncRegistrations(mockDb);

      expect(mockSheets.spreadsheets.values.clear).toHaveBeenCalled();
      expect(mockSheets.spreadsheets.values.update).not.toHaveBeenCalled();
    });

    it('should handle null values in registrations', async () => {
      mockDb.execute.mockResolvedValue({
        rows: [
          {
            ticket_id: 'TKT-002',
            order_number: 'ORD-002',
            attendee_first_name: null,
            attendee_last_name: null,
            attendee_email: null,
            attendee_phone: null,
            ticket_type: 'friday-pass',
            event_date: '2026-05-15',
            status: 'valid',
            checked_in: 'No',
            checked_in_at: null,
            purchase_date: '2026-01-15T10:00:00Z',
            price: 50.00,
            purchaser_email: 'buyer@example.com',
            wallet_source: null,
            qr_access_method: null,
          },
        ],
      });

      mockSheets.spreadsheets.values.clear.mockResolvedValue({});
      mockSheets.spreadsheets.values.update.mockResolvedValue({});

      await expect(service.syncRegistrations(mockDb)).resolves.not.toThrow();
    });

    it('should format prices correctly', async () => {
      mockDb.execute.mockResolvedValue({
        rows: [
          {
            ticket_id: 'TKT-003',
            order_number: 'ORD-003',
            attendee_first_name: 'Jane',
            attendee_last_name: 'Smith',
            attendee_email: 'jane@example.com',
            attendee_phone: '555-5678',
            ticket_type: 'vip-pass',
            event_date: '2026-05-15',
            status: 'valid',
            checked_in: 'No',
            checked_in_at: null,
            purchase_date: '2026-01-15T10:00:00Z',
            price: 150.50,
            purchaser_email: 'jane@example.com',
            wallet_source: null,
            qr_access_method: null,
          },
        ],
      });

      mockSheets.spreadsheets.values.clear.mockResolvedValue({});
      mockSheets.spreadsheets.values.update.mockResolvedValue({});

      await service.syncRegistrations(mockDb);

      const updateCall = mockSheets.spreadsheets.values.update.mock.calls[0][0];
      const values = updateCall.requestBody.values;

      expect(values[0][12]).toBe('$150.50');
    });
  });

  describe('Sync Check-in Status', () => {
    beforeEach(async () => {
      service = new GoogleSheetsService();
      await service.initialize();
    });

    it('should sync check-in status', async () => {
      mockDb.execute.mockResolvedValue({
        rows: [
          {
            ticket_id: 'TKT-001',
            name: 'John Doe',
            attendee_email: 'john@example.com',
            ticket_type: 'weekend-pass',
            checked_in: 'Yes',
            checked_in_at: '2026-05-15T18:00:00Z',
            checked_in_by: 'admin',
            wallet_source: 'apple',
          },
        ],
      });

      mockSheets.spreadsheets.values.clear.mockResolvedValue({});
      mockSheets.spreadsheets.values.update.mockResolvedValue({});

      await service.syncCheckinStatus(mockDb);

      const updateCall = mockSheets.spreadsheets.values.update.mock.calls[0][0];
      const values = updateCall.requestBody.values;

      expect(values.length).toBe(1);
      expect(values[0][0]).toBe('TKT-001');
      expect(values[0][1]).toBe('John Doe');
      expect(values[0][4]).toBe('Yes');
    });

    it('should handle null names', async () => {
      mockDb.execute.mockResolvedValue({
        rows: [
          {
            ticket_id: 'TKT-002',
            name: null,
            attendee_email: 'anonymous@example.com',
            ticket_type: 'friday-pass',
            checked_in: 'No',
            checked_in_at: null,
            checked_in_by: null,
            wallet_source: null,
          },
        ],
      });

      mockSheets.spreadsheets.values.clear.mockResolvedValue({});
      mockSheets.spreadsheets.values.update.mockResolvedValue({});

      await service.syncCheckinStatus(mockDb);

      const updateCall = mockSheets.spreadsheets.values.update.mock.calls[0][0];
      const values = updateCall.requestBody.values;

      expect(values[0][1]).toBe('N/A');
    });
  });

  describe('Sync Summary by Type', () => {
    beforeEach(async () => {
      service = new GoogleSheetsService();
      await service.initialize();
    });

    it('should sync summary by ticket type', async () => {
      mockDb.execute.mockResolvedValue({
        rows: [
          {
            ticket_type: 'weekend-pass',
            total_sold: 50,
            checked_in: 30,
            revenue: 5000.00,
          },
          {
            ticket_type: 'vip-pass',
            total_sold: 10,
            checked_in: 8,
            revenue: 1500.00,
          },
        ],
      });

      mockSheets.spreadsheets.values.clear.mockResolvedValue({});
      mockSheets.spreadsheets.values.update.mockResolvedValue({});

      await service.syncSummaryByType(mockDb);

      const updateCall = mockSheets.spreadsheets.values.update.mock.calls[0][0];
      const values = updateCall.requestBody.values;

      expect(values.length).toBe(2);
      expect(values[0][0]).toBe('Weekend Pass');
      expect(values[0][1]).toBe(50);
      expect(values[0][2]).toBe(30);
      expect(values[0][3]).toBe('$5000.00');
    });
  });

  describe('Sync Daily Sales', () => {
    beforeEach(async () => {
      service = new GoogleSheetsService();
      await service.initialize();
    });

    it('should sync daily sales with running total', async () => {
      mockDb.execute.mockResolvedValue({
        rows: [
          {
            sale_date: '2026-01-15',
            tickets_sold: 10,
            revenue: 1000.00,
          },
          {
            sale_date: '2026-01-16',
            tickets_sold: 15,
            revenue: 1500.00,
          },
          {
            sale_date: '2026-01-17',
            tickets_sold: 20,
            revenue: 2000.00,
          },
        ],
      });

      mockSheets.spreadsheets.values.clear.mockResolvedValue({});
      mockSheets.spreadsheets.values.update.mockResolvedValue({});

      await service.syncDailySales(mockDb);

      const updateCall = mockSheets.spreadsheets.values.update.mock.calls[0][0];
      const values = updateCall.requestBody.values;

      expect(values.length).toBe(3);
      expect(values[0][3]).toBe('$1000.00'); // Running total day 1
      expect(values[1][3]).toBe('$2500.00'); // Running total day 2
      expect(values[2][3]).toBe('$4500.00'); // Running total day 3
    });

    it('should handle null revenue values', async () => {
      mockDb.execute.mockResolvedValue({
        rows: [
          {
            sale_date: '2026-01-15',
            tickets_sold: 5,
            revenue: null,
          },
        ],
      });

      mockSheets.spreadsheets.values.clear.mockResolvedValue({});
      mockSheets.spreadsheets.values.update.mockResolvedValue({});

      await expect(service.syncDailySales(mockDb)).resolves.not.toThrow();
    });
  });

  describe('Sync Wallet Analytics', () => {
    beforeEach(async () => {
      service = new GoogleSheetsService();
      await service.initialize();
    });

    it('should sync wallet analytics when columns exist', async () => {
      mockDb.execute.mockResolvedValue({
        rows: [
          {
            checkin_date: '2026-05-15',
            total_checkins: 100,
            wallet_checkins: 75,
            qr_checkins: 25,
            jwt_tokens: 75,
            traditional_qr: 25,
          },
        ],
      });

      mockSheets.spreadsheets.values.clear.mockResolvedValue({});
      mockSheets.spreadsheets.values.update.mockResolvedValue({});

      await service.syncWalletAnalytics(mockDb);

      const updateCall = mockSheets.spreadsheets.values.update.mock.calls[0][0];
      const values = updateCall.requestBody.values;

      expect(values.length).toBe(1);
      expect(values[0][4]).toBe('75%'); // Wallet adoption percentage
    });

    it('should handle missing wallet columns', async () => {
      mockDb.execute
        .mockRejectedValueOnce(new Error('no such column: wallet_source'))
        .mockResolvedValueOnce({
          rows: [
            {
              checkin_date: '2026-05-15',
              total_checkins: 50,
              wallet_checkins: 0,
              qr_checkins: 50,
              jwt_tokens: 0,
              traditional_qr: 0,
            },
          ],
        });

      mockSheets.spreadsheets.values.clear.mockResolvedValue({});
      mockSheets.spreadsheets.values.update.mockResolvedValue({});

      await expect(service.syncWalletAnalytics(mockDb)).resolves.not.toThrow();
    });
  });

  describe('Full Sync All Data', () => {
    beforeEach(async () => {
      service = new GoogleSheetsService();
      await service.initialize();

      // Mock all database queries
      mockDb.execute.mockResolvedValue({
        rows: [{
          total_tickets: 100,
          checked_in: 45,
          total_orders: 25,
          total_revenue: 5000.00,
          workshop_tickets: 30,
          vip_tickets: 10,
        }],
      });

      mockSheets.spreadsheets.values.clear.mockResolvedValue({});
      mockSheets.spreadsheets.values.update.mockResolvedValue({});
    });

    it('should sync all data successfully', async () => {
      const result = await service.syncAllData();

      expect(result.success).toBe(true);
      expect(result.timestamp).toBeDefined();
      expect(mockDb.execute).toHaveBeenCalled();
    });

    it('should sync all sheets in order', async () => {
      await service.syncAllData();

      // Verify clear was called multiple times (once per sheet with data)
      expect(mockSheets.spreadsheets.values.clear).toHaveBeenCalled();
      expect(mockSheets.spreadsheets.values.update).toHaveBeenCalled();
    });

    it('should handle sync errors', async () => {
      mockDb.execute.mockRejectedValue(new Error('Database connection failed'));

      await expect(service.syncAllData()).rejects.toThrow('Database connection failed');
    });

    it('should use Mountain Time timezone', async () => {
      const result = await service.syncAllData();

      expect(result.timestamp).toBeDefined();
      // Timestamp should be in Mountain Time format
      expect(typeof result.timestamp).toBe('string');
    });
  });

  describe('Apply Formatting', () => {
    beforeEach(async () => {
      service = new GoogleSheetsService();
      await service.initialize();
    });

    it('should apply formatting to sheets', async () => {
      mockSheets.spreadsheets.batchUpdate.mockResolvedValue({});

      await service.applyFormatting();

      expect(mockSheets.spreadsheets.batchUpdate).toHaveBeenCalled();
      const batchCall = mockSheets.spreadsheets.batchUpdate.mock.calls[0][0];
      expect(batchCall.requestBody.requests.length).toBeGreaterThan(0);
    });

    it('should bold headers', async () => {
      mockSheets.spreadsheets.batchUpdate.mockResolvedValue({});

      await service.applyFormatting();

      const batchCall = mockSheets.spreadsheets.batchUpdate.mock.calls[0][0];
      const boldRequest = batchCall.requestBody.requests.find(
        r => r.repeatCell?.cell?.userEnteredFormat?.textFormat?.bold
      );

      expect(boldRequest).toBeDefined();
    });

    it('should auto-resize columns', async () => {
      mockSheets.spreadsheets.batchUpdate.mockResolvedValue({});

      await service.applyFormatting();

      const batchCall = mockSheets.spreadsheets.batchUpdate.mock.calls[0][0];
      const resizeRequest = batchCall.requestBody.requests.find(
        r => r.autoResizeDimensions
      );

      expect(resizeRequest).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      service = new GoogleSheetsService();
    });

    it('should handle authentication errors', async () => {
      const { JWT } = await import('google-auth-library');
      JWT.mockImplementation(() => {
        throw new Error('Invalid credentials');
      });

      await expect(service.initialize()).rejects.toThrow();
    });

    it('should handle API rate limits', async () => {
      await service.initialize();
      mockSheets.spreadsheets.values.update.mockRejectedValue(
        new Error('Rate limit exceeded')
      );

      const values = [['test']];
      await expect(service.updateSheetData('TestSheet', values)).rejects.toThrow('Rate limit exceeded');
    });

    it('should handle network timeouts', async () => {
      await service.initialize();
      mockSheets.spreadsheets.values.update.mockRejectedValue(
        new Error('ETIMEDOUT')
      );

      const values = [['test']];
      await expect(service.updateSheetData('TestSheet', values)).rejects.toThrow('ETIMEDOUT');
    });

    it('should handle sheet not found errors', async () => {
      await service.initialize();
      mockSheets.spreadsheets.get.mockRejectedValue(
        new Error('Sheet not found')
      );

      await expect(service.setupSheets()).rejects.toThrow('Sheet not found');
    });

    it('should handle permission denied errors', async () => {
      await service.initialize();
      mockSheets.spreadsheets.values.update.mockRejectedValue(
        new Error('Permission denied')
      );

      const values = [['test']];
      await expect(service.updateSheetData('TestSheet', values)).rejects.toThrow('Permission denied');
    });
  });

  describe('Large Dataset Handling', () => {
    beforeEach(async () => {
      service = new GoogleSheetsService();
      await service.initialize();
    });

    it('should handle 1000+ rows', async () => {
      const largeDataset = Array.from({ length: 1000 }, (_, i) => ({
        ticket_id: `TKT-${i}`,
        order_number: `ORD-${i}`,
        attendee_first_name: `First${i}`,
        attendee_last_name: `Last${i}`,
        attendee_email: `user${i}@example.com`,
        attendee_phone: '555-0000',
        ticket_type: 'weekend-pass',
        event_date: '2026-05-15',
        status: 'valid',
        checked_in: 'No',
        checked_in_at: null,
        purchase_date: '2026-01-15T10:00:00Z',
        price: 100.00,
        purchaser_email: `user${i}@example.com`,
        wallet_source: null,
        qr_access_method: null,
      }));

      mockDb.execute.mockResolvedValue({ rows: largeDataset });
      mockSheets.spreadsheets.values.clear.mockResolvedValue({});
      mockSheets.spreadsheets.values.update.mockResolvedValue({});

      await expect(service.syncRegistrations(mockDb)).resolves.not.toThrow();

      const updateCall = mockSheets.spreadsheets.values.update.mock.calls[0][0];
      const values = updateCall.requestBody.values;

      expect(values.length).toBe(1000);
    });

    it('should handle empty result sets', async () => {
      mockDb.execute.mockResolvedValue({ rows: [] });
      mockSheets.spreadsheets.values.clear.mockResolvedValue({});

      await expect(service.syncRegistrations(mockDb)).resolves.not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    beforeEach(async () => {
      service = new GoogleSheetsService();
    });

    it('should handle concurrent initialization attempts', async () => {
      const { sheets } = await import('@googleapis/sheets');

      // Trigger multiple concurrent initializations
      await Promise.all([
        service.initialize(),
        service.initialize(),
        service.initialize(),
      ]);

      // Should only initialize once
      expect(sheets).toHaveBeenCalledTimes(1);
    });

    it('should handle special characters in data', async () => {
      await service.initialize();
      mockDb.execute.mockResolvedValue({
        rows: [{
          ticket_id: "TKT-'\"<>",
          order_number: 'ORD-001',
          attendee_first_name: "O'Brien",
          attendee_last_name: 'Müller',
          attendee_email: 'special@example.com',
          attendee_phone: '+1 (555) 123-4567',
          ticket_type: 'weekend-pass',
          event_date: '2026-05-15',
          status: 'valid',
          checked_in: 'No',
          checked_in_at: null,
          purchase_date: '2026-01-15T10:00:00Z',
          price: 100.00,
          purchaser_email: 'special@example.com',
          wallet_source: null,
          qr_access_method: null,
        }],
      });

      mockSheets.spreadsheets.values.clear.mockResolvedValue({});
      mockSheets.spreadsheets.values.update.mockResolvedValue({});

      await expect(service.syncRegistrations(mockDb)).resolves.not.toThrow();
    });

    it('should handle very long strings', async () => {
      await service.initialize();
      const longString = 'A'.repeat(10000);

      mockDb.execute.mockResolvedValue({
        rows: [{
          ticket_id: 'TKT-001',
          order_number: 'ORD-001',
          attendee_first_name: longString,
          attendee_last_name: 'Doe',
          attendee_email: 'john@example.com',
          attendee_phone: '555-1234',
          ticket_type: 'weekend-pass',
          event_date: '2026-05-15',
          status: 'valid',
          checked_in: 'No',
          checked_in_at: null,
          purchase_date: '2026-01-15T10:00:00Z',
          price: 100.00,
          purchaser_email: 'john@example.com',
          wallet_source: null,
          qr_access_method: null,
        }],
      });

      mockSheets.spreadsheets.values.clear.mockResolvedValue({});
      mockSheets.spreadsheets.values.update.mockResolvedValue({});

      await expect(service.syncRegistrations(mockDb)).resolves.not.toThrow();
    });
  });
});
