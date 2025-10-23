/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Ticket Validation Test Mode', () => {
  let mockQRTokenService;
  let mockDatabase;
  let originalProcessEnv;

  beforeEach(() => {
    originalProcessEnv = process.env;

    // Mock QR Token Service
    mockQRTokenService = {
      generateToken: vi.fn(),
      validateToken: vi.fn(),
      isTestToken: vi.fn()
    };

    // Mock Database
    mockDatabase = {
      execute: vi.fn(),
      close: vi.fn()
    };

    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalProcessEnv;
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('Test Ticket Generation', () => {
    it('should generate test tickets with TEST prefix', async () => {
      process.env = {
        ...originalProcessEnv,
        NODE_ENV: 'test',
        QR_SECRET_KEY: 'test-secret-key'
      };

      // Mock QR token generation for test tickets
      mockQRTokenService.generateToken.mockReturnValue('TEST-QR-TOKEN-12345');

      vi.doMock('../../../lib/qr-token-service.js', () => ({
        default: mockQRTokenService,
        QRTokenService: class {
          generateToken(payload) {
            return mockQRTokenService.generateToken(payload);
          }
          validateToken(token) {
            return mockQRTokenService.validateToken(token);
          }
          isTestToken(token) {
            return mockQRTokenService.isTestToken(token);
          }
        }
      }));

      vi.doMock('../../../lib/database.js', () => ({
        getDatabaseClient: () => mockDatabase
      }));

      // Mock successful ticket creation
      mockDatabase.execute.mockResolvedValue({
        rows: [],
        lastInsertRowid: 1
      });

      const { createTestTicket } = await import('../../../tests/helpers/ticket-test-helpers.js');

      const testTicket = await createTestTicket({
        ticketType: 'general',
        eventId: 1,
        attendeeEmail: 'test@example.com',
        priceInCents: 5000
      });

      expect(mockQRTokenService.generateToken).toHaveBeenCalledWith(
        expect.objectContaining({
          isTest: true
        })
      );

      expect(testTicket.ticketId).toMatch(/^TEST-/);
      expect(testTicket.qrToken).toBe('TEST-QR-TOKEN-12345');
      expect(testTicket.isTest).toBe(true);
    });

    it('should create test tickets in database with is_test flag', async () => {
      process.env = {
        ...originalProcessEnv,
        NODE_ENV: 'test'
      };

      mockDatabase.execute.mockResolvedValue({
        rows: [],
        lastInsertRowid: 1
      });

      vi.doMock('../../../lib/database.js', () => ({
        getDatabaseClient: () => mockDatabase
      }));

      const { createTestTicket } = await import('../../../tests/helpers/ticket-test-helpers.js');

      await createTestTicket({
        ticketType: 'vip',
        eventId: 1,
        attendeeEmail: 'vip@example.com',
        priceInCents: 10000
      });

      // Should create transaction record first
      expect(mockDatabase.execute).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO transactions"),
        expect.arrayContaining([
          expect.stringMatching(/^TEST-/), // transaction_id
          "tickets", // type
          "completed", // status
          10000, // amount_cents
          "USD", // currency
          "vip@example.com", // customer_email
          null, // customer_name
          expect.stringContaining("\"test\":true"), // order_data
          1 // is_test
        ])
      );

      expect(mockDatabase.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tickets'),
        expect.arrayContaining([
          expect.stringMatching(/^TEST-/), // ticket_id
          expect.any(Number), // transaction_id
          'vip', // ticket_type
          1, // event_id
          10000, // price_cents
          'vip@example.com', // attendee_email
          null, // attendee_first_name
          null, // attendee_last_name
          'valid', // status
          'pending', // registration_status
          1 // is_test
        ])
      );
    });
  });

  describe('Test Ticket Validation', () => {
    // NOTE: Test ticket validation integration tests have been moved to:
    // tests/integration/test-mode/ticket-validation-test-mode.test.js
    // These tests require actual QR token service and database interactions.

    it('should reject production QR codes in test-only mode', async () => {
      process.env = {
        ...originalProcessEnv,
        NODE_ENV: 'test',
        TEST_ONLY_MODE: 'true'
      };

      mockQRTokenService.validateToken.mockReturnValue({
        valid: true,
        payload: {
          ticketId: 'PROD-TICKET-12345',
          isTest: false,
          eventId: 1
        }
      });

      mockQRTokenService.isTestToken.mockReturnValue(false);

      vi.doMock('../../../lib/qr-token-service.js', () => ({
        default: mockQRTokenService,
        QRTokenService: class {
          generateToken(payload) {
            return mockQRTokenService.generateToken(payload);
          }
          validateToken(token) {
            return mockQRTokenService.validateToken(token);
          }
          isTestToken(token) {
            return mockQRTokenService.isTestToken(token);
          }
        }
      }));

      const { validateTestTicket } = await import('../../../tests/helpers/ticket-test-helpers.js');

      const validationResult = await validateTestTicket('PROD-QR-TOKEN-12345');

      expect(validationResult.valid).toBe(false);
      expect(validationResult.error).toContain('Production tickets not allowed in test mode');
    });

    it('should handle mixed test and production validation when not in test-only mode', async () => {
      process.env = {
        ...originalProcessEnv,
        NODE_ENV: 'development',
        TEST_ONLY_MODE: 'false'
      };

      // Test ticket validation
      mockQRTokenService.validateToken
        .mockReturnValueOnce({
          valid: true,
          payload: {
            ticketId: 'TEST-TICKET-12345',
            isTest: true,
            eventId: 1
          }
        })
        .mockReturnValueOnce({
          valid: true,
          payload: {
            ticketId: 'PROD-TICKET-67890',
            isTest: false,
            eventId: 1
          }
        });

      mockQRTokenService.isTestToken
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);

      mockDatabase.execute
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            ticket_id: 'TEST-TICKET-12345',
            status: 'valid',
            is_test: 1,
            attendee_email: 'test@example.com'
          }]
        })
        .mockResolvedValueOnce({
          rows: [{
            id: 2,
            ticket_id: 'PROD-TICKET-67890',
            status: 'valid',
            is_test: 0,
            attendee_email: 'prod@example.com'
          }]
        });

      vi.doMock('../../../lib/qr-token-service.js', () => ({
        default: mockQRTokenService,
        QRTokenService: class {
          generateToken(payload) {
            return mockQRTokenService.generateToken(payload);
          }
          validateToken(token) {
            return mockQRTokenService.validateToken(token);
          }
          isTestToken(token) {
            return mockQRTokenService.isTestToken(token);
          }
        }
      }));

      vi.doMock('../../../lib/database.js', () => ({
        getDatabaseClient: () => mockDatabase
      }));

      const { validateTicket } = await import('../../../tests/helpers/ticket-test-helpers.js');

      // Validate test ticket
      const testResult = await validateTicket('TEST-QR-TOKEN-12345');
      expect(testResult.valid).toBe(true);
      expect(testResult.ticket.isTest).toBe(true);

      // Validate production ticket
      const prodResult = await validateTicket('PROD-QR-TOKEN-67890');
      expect(prodResult.valid).toBe(true);
      expect(prodResult.ticket.isTest).toBe(false);
    });
  });

  describe('Test Ticket QR Code Generation', () => {
    // NOTE: QR code generation integration tests have been moved to:
    // tests/integration/test-mode/ticket-validation-test-mode.test.js
    // These tests require actual QR token service and database interactions.

    it('should include test metadata in QR token payload', async () => {
      process.env = {
        ...originalProcessEnv,
        QR_SECRET_KEY: 'test-secret-key-32-chars-minimum'
      };

      let capturedPayload;
      mockQRTokenService.generateToken.mockImplementation((payload) => {
        capturedPayload = payload;
        return 'mocked-token';
      });

      vi.doMock('../../../lib/qr-token-service.js', () => ({
        default: mockQRTokenService,
        QRTokenService: class {
          generateToken(payload) {
            return mockQRTokenService.generateToken(payload);
          }
          validateToken(token) {
            return mockQRTokenService.validateToken(token);
          }
          isTestToken(token) {
            return mockQRTokenService.isTestToken(token);
          }
        }
      }));

      const { generateTestQRCode } = await import('../../../tests/helpers/ticket-test-helpers.js');

      await generateTestQRCode({
        ticketId: 'TEST-TICKET-12345',
        eventId: 1,
        isTest: true,
        metadata: {
          testMode: true,
          generatedBy: 'test-suite',
          environment: 'test'
        }
      });

      expect(capturedPayload).toMatchObject({
        ticketId: 'TEST-TICKET-12345',
        eventId: "1", // String because it comes from database TEXT field
        isTest: true,
        metadata: {
          testMode: true,
          generatedBy: 'test-suite',
          environment: 'test'
        }
      });
    });
  });

  describe('Test Ticket Lifecycle', () => {
    it('should handle test ticket registration', async () => {
      process.env = {
        ...originalProcessEnv,
        NODE_ENV: 'test'
      };

      mockDatabase.execute
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            ticket_id: 'TEST-TICKET-12345',
            status: 'valid',
            is_test: 1,
            registration_status: 'pending'
          }]
        })
        .mockResolvedValueOnce({
          rows: [],
          rowsAffected: 1
        });

      vi.doMock('../../../lib/database.js', () => ({
        getDatabaseClient: () => mockDatabase
      }));

      const { registerTestTicket } = await import('../../../tests/helpers/ticket-test-helpers.js');

      const registrationResult = await registerTestTicket('TEST-TICKET-12345', {
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com'
      });

      expect(registrationResult.success).toBe(true);

      // Should verify test ticket first
      expect(mockDatabase.execute).toHaveBeenCalledWith(
        expect.stringContaining("SELECT id FROM tickets WHERE ticket_id = ? AND is_test = 1"),
        ['TEST-TICKET-12345']
      );

      // Should update ticket with registration information
      expect(mockDatabase.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE tickets'),
        expect.arrayContaining([
          'Test',
          'User',
          'test@example.com',
          'completed',
          'TEST-TICKET-12345'
        ])
      );
    });

    it('should handle test ticket check-in', async () => {
      process.env = {
        ...originalProcessEnv,
        NODE_ENV: 'test'
      };

      mockDatabase.execute
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            ticket_id: 'TEST-TICKET-12345',
            status: 'valid',
            is_test: 1,
            registration_status: 'completed'
          }]
        })
        .mockResolvedValueOnce({
          rows: [],
          rowsAffected: 1
        });

      vi.doMock('../../../lib/database.js', () => ({
        getDatabaseClient: () => mockDatabase
      }));

      const { checkInTestTicket } = await import('../../../tests/helpers/ticket-test-helpers.js');

      const checkInResult = await checkInTestTicket('TEST-TICKET-12345');

      expect(checkInResult.success).toBe(true);

      // Should verify test ticket and registration status first
      expect(mockDatabase.execute).toHaveBeenCalledWith(
        expect.stringContaining("SELECT id, registration_status FROM tickets"),
        ['TEST-TICKET-12345']
      );

      // Should update ticket to checked in status (status='used')
      // Note: registration_status stays 'completed' - check-in only updates status and checked_in_at
      expect(mockDatabase.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE tickets'),
        expect.arrayContaining([
          'used', // status changes to 'used' per CHECK constraint
          expect.any(String), // checked_in_at timestamp
          'TEST-TICKET-12345'
        ])
      );
    });

    // NOTE: Validation tracking integration tests have been moved to:
    // tests/integration/test-mode/ticket-validation-test-mode.test.js
    // These tests require actual database interactions.
  });

  describe('Test Data Isolation', () => {
    it('should only return test tickets in test mode queries', async () => {
      process.env = {
        ...originalProcessEnv,
        NODE_ENV: 'test',
        TEST_ONLY_MODE: 'true'
      };

      mockDatabase.execute.mockResolvedValue({
        rows: [
          {
            id: 1,
            ticket_id: 'TEST-TICKET-12345',
            is_test: 1,
            status: 'active'
          }
        ]
      });

      vi.doMock('../../../lib/database.js', () => ({
        getDatabaseClient: () => mockDatabase
      }));

      const { getTestTickets } = await import('../../../tests/helpers/ticket-test-helpers.js');

      const tickets = await getTestTickets();

      // Should query for test tickets only
      expect(mockDatabase.execute).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM tickets WHERE is_test = 1 ORDER BY created_at DESC')
      );

      expect(tickets).toHaveLength(1);
      expect(tickets[0].isTest).toBe(true);
    });

    it('should exclude test tickets from production queries', async () => {
      process.env = {
        ...originalProcessEnv,
        NODE_ENV: 'production'
      };

      mockDatabase.execute.mockResolvedValue({
        rows: [
          {
            id: 2,
            ticket_id: 'PROD-TICKET-67890',
            is_test: 0,
            status: 'active'
          }
        ]
      });

      vi.doMock('../../../lib/database.js', () => ({
        getDatabaseClient: () => mockDatabase
      }));

      const { getProductionTickets } = await import('../../../tests/helpers/ticket-test-helpers.js');

      const tickets = await getProductionTickets();

      // Should query for production tickets only
      expect(mockDatabase.execute).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM tickets WHERE is_test = 0 ORDER BY created_at DESC')
      );

      expect(tickets).toHaveLength(1);
      expect(tickets[0].isTest).toBe(false);
    });
  });
});