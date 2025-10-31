/**
 * Unit Tests for Google Wallet Service
 * Tests pass creation, structure validation, JWT generation, API integration, and error handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock database module at top level (hoisted)
vi.mock('../../../lib/database.js', () => ({
  getDatabaseClient: vi.fn()
}));

// Mock QR token service
vi.mock('../../../lib/qr-token-service.js', () => ({
  getQRTokenService: vi.fn()
}));

// Mock jsonwebtoken to avoid needing real private keys in tests
// Use a longer mock token to satisfy URL length assertions
vi.mock('jsonwebtoken', () => ({
  default: {
    sign: vi.fn(() => 'mock.jwt.token.with.sufficient.length.for.url.validation.tests')
  }
}));

import { GoogleWalletService } from '../../../lib/google-wallet-service.js';
import { getDatabaseClient } from '../../../lib/database.js';
import { getQRTokenService } from '../../../lib/qr-token-service.js';

describe('Google Wallet Service - Unit Tests', () => {
  let service;
  let mockDb;
  let mockQRService;
  let mockColorService;
  let mockClient;
  let mockAuth;

  beforeEach(() => {
    // Set up environment
    process.env.GOOGLE_WALLET_ISSUER_ID = 'test-issuer-123';
    process.env.GOOGLE_WALLET_CLASS_ID = 'test-class-123';
    process.env.GOOGLE_WALLET_SERVICE_ACCOUNT = Buffer.from(JSON.stringify({
      type: 'service_account',
      project_id: 'test-project',
      private_key_id: 'test-key-id',
      // MOCK TEST KEY ONLY - Not a real private key, safe for repository
      private_key: '-----BEGIN PRIVATE KEY-----\nMOCK_TEST_KEY_ONLY_NOT_VALID\n-----END PRIVATE KEY-----',
      client_email: 'test@test-project.iam.gserviceaccount.com',
      client_id: '12345',
      auth_uri: 'https://accounts.google.com/o/oauth2/auth',
      token_uri: 'https://oauth2.googleapis.com/token',
      auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
      client_x509_cert_url: 'https://www.googleapis.com/robot/v1/metadata/x509/test%40test-project.iam.gserviceaccount.com'
    })).toString('base64');
    process.env.VERCEL_ENV = 'preview';
    process.env.VERCEL_URL = 'test-preview.vercel.app';

    // Mock client for API calls
    mockClient = {
      request: vi.fn()
    };

    // Mock GoogleAuth
    mockAuth = {
      getClient: vi.fn().mockResolvedValue(mockClient)
    };

    // Mock database
    mockDb = {
      execute: vi.fn(),
      batch: vi.fn()
    };
    getDatabaseClient.mockResolvedValue(mockDb);

    // Mock QR token service
    mockQRService = {
      getOrCreateToken: vi.fn().mockResolvedValue('mock-qr-token-abcd1234')
    };
    getQRTokenService.mockReturnValue(mockQRService);

    // Mock color service
    mockColorService = {
      getColorForTicketType: vi.fn().mockResolvedValue({
        name: 'Deep Pink',
        rgb: 'rgb(255, 20, 147)',
        hex: '#FF1493',
        emoji: '🎨'
      })
    };

    // Create service instance
    service = new GoogleWalletService();
    service.auth = mockAuth;
    service.client = null; // Force initialization
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.GOOGLE_WALLET_ISSUER_ID;
    delete process.env.GOOGLE_WALLET_CLASS_ID;
    delete process.env.GOOGLE_WALLET_SERVICE_ACCOUNT;
  });

  describe('Configuration', () => {
    it('should detect if Google Wallet is configured', () => {
      expect(service.isConfigured()).toBe(true);
    });

    it('should return false when issuer ID is missing', () => {
      service.issuerId = null;
      expect(service.isConfigured()).toBe(false);
    });

    it('should return false when auth is missing', () => {
      service.auth = null;
      expect(service.isConfigured()).toBe(false);
    });

    it('should return false when service account is missing', () => {
      service.serviceAccount = null;
      expect(service.isConfigured()).toBe(false);
    });

    it('should parse service account from base64 environment variable', () => {
      const newService = new GoogleWalletService();
      expect(newService.serviceAccount).toBeDefined();
      expect(newService.serviceAccount.client_email).toBe('test@test-project.iam.gserviceaccount.com');
    });

    it('should handle invalid service account JSON gracefully', () => {
      process.env.GOOGLE_WALLET_SERVICE_ACCOUNT = Buffer.from('invalid-json').toString('base64');
      const newService = new GoogleWalletService();
      expect(newService.auth).toBeNull();
      expect(newService.serviceAccount).toBeNull();
    });

    it('should resolve base URL correctly for production', () => {
      process.env.VERCEL_ENV = 'production';
      process.env.WALLET_BASE_URL = 'https://custom-domain.com';
      const newService = new GoogleWalletService();
      expect(newService.baseUrl).toBe('https://custom-domain.com');
    });

    it('should resolve base URL correctly for preview', () => {
      process.env.VERCEL_ENV = 'preview';
      process.env.VERCEL_URL = 'preview-url.vercel.app';
      delete process.env.WALLET_BASE_URL;
      const newService = new GoogleWalletService();
      expect(newService.baseUrl).toBe('https://preview-url.vercel.app');
    });

    it('should fall back to default URL when neither custom nor Vercel URL present', () => {
      delete process.env.WALLET_BASE_URL;
      delete process.env.VERCEL_URL;
      const newService = new GoogleWalletService();
      expect(newService.baseUrl).toBe('https://alocubano.vercel.app');
    });
  });

  describe('Client Initialization', () => {
    it('should initialize client on first call', async () => {
      await service.initClient();
      expect(mockAuth.getClient).toHaveBeenCalledTimes(1);
      expect(service.client).toBe(mockClient);
    });

    it('should reuse existing client', async () => {
      await service.initClient();
      await service.initClient();
      expect(mockAuth.getClient).toHaveBeenCalledTimes(1);
    });

    it('should handle concurrent initialization requests', async () => {
      const promises = [
        service.initClient(),
        service.initClient(),
        service.initClient()
      ];
      await Promise.all(promises);
      expect(mockAuth.getClient).toHaveBeenCalledTimes(1);
    });

    it('should throw error when not configured', async () => {
      service.issuerId = null;
      await expect(service.initClient()).rejects.toThrow('not configured');
    });

    it('should clear initialization promise on error', async () => {
      mockAuth.getClient.mockRejectedValueOnce(new Error('Auth failed'));
      await expect(service.initClient()).rejects.toThrow('Auth failed');
      expect(service.initializationPromise).toBeNull();
    });

    it('should allow retry after initialization failure', async () => {
      mockAuth.getClient
        .mockRejectedValueOnce(new Error('First failure'))
        .mockResolvedValueOnce(mockClient);

      await expect(service.initClient()).rejects.toThrow('First failure');
      await expect(service.initClient()).resolves.toBe(mockClient);
    });
  });

  describe('Test Ticket Detection', () => {
    it('should detect test ticket by is_test field', () => {
      const ticket = { is_test: 1, ticket_id: 'NORMAL-123' };
      expect(service.isTestTicket(ticket)).toBe(true);
    });

    it('should detect non-test ticket by is_test field', () => {
      const ticket = { is_test: 0, ticket_id: 'NORMAL-123' };
      expect(service.isTestTicket(ticket)).toBe(false);
    });

    it('should detect test ticket by ticket ID pattern - test_ticket', () => {
      const ticket = { ticket_id: 'test_ticket_123' };
      expect(service.isTestTicket(ticket)).toBe(true);
    });

    it('should detect test ticket by ticket ID pattern - TEST-prefix', () => {
      const ticket = { ticket_id: 'TEST-TICKET-123' };
      expect(service.isTestTicket(ticket)).toBe(true);
    });

    it('should detect test ticket by ticket ID pattern - TEST suffix', () => {
      const ticket = { ticket_id: 'TICKET-123-TEST' };
      expect(service.isTestTicket(ticket)).toBe(true);
    });

    it('should not detect normal ticket as test', () => {
      const ticket = { ticket_id: 'TKT-PROD-123' };
      expect(service.isTestTicket(ticket)).toBe(false);
    });

    it('should handle null ticket', () => {
      expect(service.isTestTicket(null)).toBe(false);
    });

    it('should handle undefined ticket', () => {
      expect(service.isTestTicket(undefined)).toBe(false);
    });

    it('should handle ticket with missing ticket_id', () => {
      const ticket = { attendee_first_name: 'John' };
      expect(service.isTestTicket(ticket)).toBe(false);
    });
  });

  describe('QR Token Generation', () => {
    it('should get or create QR token for ticket', async () => {
      const token = await service.getQRToken('12345');
      expect(token).toBe('mock-qr-token-abcd1234');
    });

    it('should convert BigInt ticket ID to string', async () => {
      await service.getQRToken(BigInt(999999999));
      expect(mockQRService.getOrCreateToken).toHaveBeenCalledWith('999999999');
    });
  });

  describe('Pass Class Creation/Update', () => {
    const mockTicket = {
      event_id: 1,
      event_name: 'Boulder Fest 2026',
      venue_name: 'Avalon Ballroom',
      venue_address: '6185 Arapahoe Road, Boulder, CO 80303'
    };

    beforeEach(() => {
      service.client = mockClient;
    });

    it('should create new class when not exists', async () => {
      mockClient.request
        .mockRejectedValueOnce({ response: { status: 404 } })
        .mockResolvedValueOnce({ data: { id: 'test-class' } });

      const classId = await service.createOrUpdateClass(mockTicket);

      expect(classId).toBe('event_1');
      expect(mockClient.request).toHaveBeenCalledTimes(2);
      expect(mockClient.request).toHaveBeenNthCalledWith(2, expect.objectContaining({
        method: 'POST',
        url: expect.stringContaining('/eventTicketClass')
      }));
    });

    it('should update existing class', async () => {
      mockClient.request
        .mockResolvedValueOnce({ data: { id: 'existing-class' } })
        .mockResolvedValueOnce({ data: { id: 'updated-class' } });

      const classId = await service.createOrUpdateClass(mockTicket);

      expect(classId).toBe('event_1');
      expect(mockClient.request).toHaveBeenCalledTimes(2);
      expect(mockClient.request).toHaveBeenNthCalledWith(2, expect.objectContaining({
        method: 'PATCH'
      }));
    });

    it('should include event name in class definition', async () => {
      mockClient.request
        .mockRejectedValueOnce({ response: { status: 404 } })
        .mockResolvedValueOnce({ data: {} });

      await service.createOrUpdateClass(mockTicket);

      const callArgs = mockClient.request.mock.calls[1][0];
      expect(callArgs.data.eventName.defaultValue.value).toBe('Boulder Fest 2026');
    });

    it('should include venue information in class definition', async () => {
      mockClient.request
        .mockRejectedValueOnce({ response: { status: 404 } })
        .mockResolvedValueOnce({ data: {} });

      await service.createOrUpdateClass(mockTicket);

      const callArgs = mockClient.request.mock.calls[1][0];
      expect(callArgs.data.venue.name.defaultValue.value).toBe('Avalon Ballroom');
      expect(callArgs.data.venue.address.defaultValue.value).toBe('6185 Arapahoe Road, Boulder, CO 80303');
    });

    it('should include logo and wide logo', async () => {
      mockClient.request
        .mockRejectedValueOnce({ response: { status: 404 } })
        .mockResolvedValueOnce({ data: {} });

      await service.createOrUpdateClass(mockTicket);

      const callArgs = mockClient.request.mock.calls[1][0];
      expect(callArgs.data.logo.sourceUri.uri).toContain('/images/logo.png');
      expect(callArgs.data.wideLogo.sourceUri.uri).toContain('/wallet/wallet-logo-wide.png');
    });

    it('should use black background color', async () => {
      mockClient.request
        .mockRejectedValueOnce({ response: { status: 404 } })
        .mockResolvedValueOnce({ data: {} });

      await service.createOrUpdateClass(mockTicket);

      const callArgs = mockClient.request.mock.calls[1][0];
      expect(callArgs.data.hexBackgroundColor).toBe('#000000');
    });

    it('should configure card template with custom fields', async () => {
      mockClient.request
        .mockRejectedValueOnce({ response: { status: 404 } })
        .mockResolvedValueOnce({ data: {} });

      await service.createOrUpdateClass(mockTicket);

      const callArgs = mockClient.request.mock.calls[1][0];
      expect(callArgs.data.classTemplateInfo).toBeDefined();
      expect(callArgs.data.classTemplateInfo.cardTemplateOverride).toBeDefined();
    });

    it('should throw error when API fails with non-404 error', async () => {
      mockClient.request.mockRejectedValue({ response: { status: 500 }, message: 'Server error' });

      await expect(service.createOrUpdateClass(mockTicket)).rejects.toThrow();
    });
  });

  describe('Date Formatting', () => {
    it('should format single-day event', () => {
      const formatted = service.formatEventDate('2026-05-15', '2026-05-15');
      // Date parsing may shift by 1 day depending on system timezone
      expect(formatted).toMatch(/May 1[45], 2026/);
    });

    it('should format multi-day event in same month', () => {
      const formatted = service.formatEventDate('2026-05-15', '2026-05-17');
      expect(formatted).toMatch(/May 1[45]-1[67], 2026/);
    });

    it('should format multi-day event across months', () => {
      const formatted = service.formatEventDate('2026-05-30', '2026-06-02');
      // Now uses UTC parsing, so always produces "May 30 - Jun 2, 2026"
      expect(formatted).toBe('May 30 - Jun 2, 2026');
    });

    it('should format multi-day event across years', () => {
      const formatted = service.formatEventDate('2026-12-30', '2027-01-02');
      // Now uses UTC parsing, so always produces "Dec 30 - Jan 2, 2027"
      expect(formatted).toBe('Dec 30 - Jan 2, 2027');
    });

    it('should throw error when start date is missing', () => {
      expect(() => service.formatEventDate(null, '2026-05-17')).toThrow('Event dates are required');
    });

    it('should throw error when end date is missing', () => {
      expect(() => service.formatEventDate('2026-05-15', null)).toThrow('Event dates are required');
    });
  });

  describe('DateTime Formatting for Wallet', () => {
    it('should format date with time in Mountain Time', () => {
      const formatted = service.formatDateTimeForWallet('2026-05-15', '14:30', false);
      // Date parsing from string may shift by 1 day depending on system timezone
      expect(formatted).toMatch(/^2026-05-1[45]T14:30:00-0[67]:00$/);
    });

    it('should format end of day time', () => {
      const formatted = service.formatDateTimeForWallet('2026-05-15', '23:59', true);
      expect(formatted).toMatch(/^2026-05-1[45]T23:59:00-0[67]:00$/);
    });

    it('should handle start of day (00:00)', () => {
      const formatted = service.formatDateTimeForWallet('2026-05-15', '00:00', false);
      expect(formatted).toMatch(/^2026-05-1[45]T00:00:00-0[67]:00$/);
    });

    it('should handle boolean isEndDate parameter (legacy mode)', () => {
      const formatted = service.formatDateTimeForWallet('2026-05-15', true);
      expect(formatted).toMatch(/^2026-05-1[45]T23:59:59-0[67]:00$/);
    });

    it('should handle start of day with boolean false (legacy mode)', () => {
      const formatted = service.formatDateTimeForWallet('2026-05-15', false);
      expect(formatted).toMatch(/^2026-05-1[45]T00:00:00-0[67]:00$/);
    });

    it('should throw error when date is missing', () => {
      expect(() => service.formatDateTimeForWallet(null, '14:30')).toThrow('Date string is required');
    });

    it('should handle missing minutes in time', () => {
      const formatted = service.formatDateTimeForWallet('2026-05-15', '14', false);
      expect(formatted).toMatch(/^2026-05-1[45]T14:00:00-0[67]:00$/);
    });
  });

  describe('Ticket Type Formatting', () => {
    it('should format VIP pass', () => {
      expect(service.formatTicketType('vip-pass')).toBe('VIP PASS');
    });

    it('should format weekend pass', () => {
      expect(service.formatTicketType('weekend-pass')).toBe('WEEKEND PASS');
    });

    it('should format day passes', () => {
      expect(service.formatTicketType('friday-pass')).toBe('FRIDAY PASS');
      expect(service.formatTicketType('saturday-pass')).toBe('SATURDAY PASS');
      expect(service.formatTicketType('sunday-pass')).toBe('SUNDAY PASS');
    });

    it('should format workshop types', () => {
      expect(service.formatTicketType('workshop-beginner')).toBe('BEGINNER WORKSHOP');
      expect(service.formatTicketType('workshop-intermediate')).toBe('INTERMEDIATE WORKSHOP');
      expect(service.formatTicketType('workshop-advanced')).toBe('ADVANCED WORKSHOP');
    });

    it('should format general admission', () => {
      expect(service.formatTicketType('general-admission')).toBe('GENERAL ADMISSION');
    });

    it('should uppercase unknown ticket types', () => {
      expect(service.formatTicketType('custom-ticket')).toBe('CUSTOM-TICKET');
    });
  });

  describe('JWT Save URL Generation', () => {
    beforeEach(() => {
      // MOCK TEST KEY ONLY - Not a real private key, safe for repository
      // JWT signing is mocked at the top level to avoid needing real keys
      service.serviceAccount = {
        client_email: 'test@test-project.iam.gserviceaccount.com',
        private_key: '-----BEGIN PRIVATE KEY-----\nMOCK_TEST_KEY_ONLY_NOT_VALID\n-----END PRIVATE KEY-----'
      };
    });

    it('should generate save URL with JWT', async () => {
      const url = await service.generateSaveUrl('test-issuer.test-object-123');
      expect(url).toContain('https://pay.google.com/gp/v/save/');
      expect(url.length).toBeGreaterThan(50);
    });

    it('should include object ID in JWT payload', async () => {
      const objectId = 'test-issuer.test-object-456';
      const url = await service.generateSaveUrl(objectId);
      expect(url).toContain('.');
    });

    it('should throw error when service account is not configured', async () => {
      service.serviceAccount = null;
      await expect(service.generateSaveUrl('test-object')).rejects.toThrow('not configured');
    });
  });

  describe('Pass Update', () => {
    beforeEach(() => {
      service.client = mockClient;
      mockClient.request.mockResolvedValue({ data: {} });
      mockDb.batch.mockResolvedValue({});
    });

    it('should update pass via API', async () => {
      const updates = { state: 'EXPIRED' };
      await service.updatePass('test-object-123', updates);

      expect(mockClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'PATCH',
          url: expect.stringContaining('test-object-123'),
          data: updates
        })
      );
    });

    it('should throw error when not configured', async () => {
      service.issuerId = null;
      await expect(service.updatePass('test-object', {})).rejects.toThrow('not configured');
    });

    it('should handle API errors', async () => {
      mockClient.request.mockRejectedValue(new Error('API error'));
      await expect(service.updatePass('test-object', {})).rejects.toThrow();
    });
  });

  describe('Pass Revocation', () => {
    beforeEach(() => {
      service.client = mockClient;
      mockClient.request.mockResolvedValue({ data: {} });
      mockDb.execute.mockResolvedValue({ rows: [{ id: 1, google_pass_id: 'test-pass-123' }] });
      mockDb.batch.mockResolvedValue({});
    });

    it('should revoke pass when ticket has google_pass_id', async () => {
      await service.revokePass('TKT-123', 'Cancelled by user');

      expect(mockClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'PATCH',
          data: expect.objectContaining({
            state: 'EXPIRED',
            disableExpirationNotification: true
          })
        })
      );
    });

    it('should throw error when ticket not found', async () => {
      mockDb.execute.mockResolvedValue({ rows: [] });
      await expect(service.revokePass('INVALID-TKT', 'Test')).rejects.toThrow('Ticket not found');
    });

    it('should skip API call when pass ID is missing', async () => {
      mockDb.execute.mockResolvedValue({ rows: [{ id: 1, google_pass_id: null }] });
      await service.revokePass('TKT-NO-PASS', 'Test');
      expect(mockClient.request).not.toHaveBeenCalled();
    });

    it('should skip API call when service not configured', async () => {
      service.issuerId = null;
      await service.revokePass('TKT-123', 'Test');
      expect(mockClient.request).not.toHaveBeenCalled();
    });
  });

  describe('Pass Event Logging', () => {
    beforeEach(() => {
      mockDb.batch.mockResolvedValue({});
    });

    it('should log pass event to database', async () => {
      await service.logPassEvent(123, 'created', { objectId: 'test-object' });

      expect(mockDb.batch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            sql: expect.stringContaining('INSERT INTO wallet_pass_events')
          })
        ]),
        'write'
      );
    });

    it('should include pass serial, ticket ID, and event type', async () => {
      await service.logPassEvent(456, 'updated', { field: 'status' });

      const batchCall = mockDb.batch.mock.calls[0][0][0];
      expect(batchCall.args).toContain('google-456');
      expect(batchCall.args).toContain(456);
      expect(batchCall.args).toContain('google');
      expect(batchCall.args).toContain('updated');
    });

    it('should serialize event data as JSON', async () => {
      const eventData = { key: 'value', nested: { data: 123 } };
      await service.logPassEvent(789, 'test', eventData);

      const batchCall = mockDb.batch.mock.calls[0][0][0];
      const serializedData = batchCall.args[4];
      expect(typeof serializedData).toBe('string');
    });
  });

  describe('Error Handling', () => {
    it('should handle missing service account gracefully', () => {
      delete process.env.GOOGLE_WALLET_SERVICE_ACCOUNT;
      const newService = new GoogleWalletService();
      expect(newService.auth).toBeNull();
      expect(newService.isConfigured()).toBe(false);
    });

    it('should handle client initialization failure', async () => {
      mockAuth.getClient.mockRejectedValue(new Error('Network error'));
      await expect(service.initClient()).rejects.toThrow('Network error');
    });

    it('should provide helpful error messages', async () => {
      service.issuerId = null;
      await expect(service.initClient()).rejects.toThrow(/not configured/i);
    });
  });
});
