/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDatabaseClient } from '../../../lib/database.js';
import { QRTokenService } from '../../../lib/qr-token-service.js';
import {
  createTestTicket,
  validateTestTicket,
  trackTestValidationAttempt,
  generateTestQRCode,
  cleanupTestTickets
} from '../../helpers/ticket-test-helpers.js';

describe('Ticket Validation Test Mode Integration', () => {
  let originalEnv;
  let qrService;

  beforeEach(async () => {
    // Save original environment
    originalEnv = { ...process.env };

    // Set test environment
    process.env.NODE_ENV = 'test';
    process.env.QR_SECRET_KEY = 'test-secret-key-32-chars-minimum-integration';
    process.env.INTEGRATION_TEST_MODE = 'true';

    // Initialize QR service
    qrService = new QRTokenService();

    // Clean up any existing test data
    await cleanupTestTickets();
  });

  afterEach(async () => {
    // Clean up test data
    await cleanupTestTickets();

    // Restore environment
    process.env = originalEnv;
  });

  describe('Test Ticket Validation', () => {
    it('should validate test tickets correctly', async () => {
      // Create a real test ticket with QR token
      const testTicket = await createTestTicket({
        ticketType: 'general',
        attendeeEmail: 'test@example.com',
        priceInCents: 5000
      });

      expect(testTicket.ticketId).toMatch(/^TEST-TICKET-/);
      expect(testTicket.qrToken).toBeTruthy();
      expect(testTicket.isTest).toBe(true);

      // Validate the QR token using the actual validation logic
      const validationResult = await validateTestTicket(testTicket.qrToken);

      expect(validationResult.valid).toBe(true);
      expect(validationResult.ticket).toBeDefined();
      expect(validationResult.ticket.ticketId).toBe(testTicket.ticketId);
      expect(validationResult.ticket.isTest).toBe(true);
      expect(validationResult.ticket.status).toBe('valid');

      // Verify the QR service recognizes it as a test token
      const isTest = qrService.isTestToken(testTicket.qrToken);
      expect(isTest).toBe(true);
    });

    it('should reject production QR codes in test-only mode', async () => {
      process.env.TEST_ONLY_MODE = 'true';

      // Create a mock production ticket in database
      const db = await getDatabaseClient();

      // First create a production event
      const eventResult = await db.execute({
        sql: 'SELECT id FROM events WHERE slug = ?',
        args: ['main-event']
      });

      let eventId;
      if (eventResult.rows.length === 0) {
        await db.execute({
          sql: `
            INSERT INTO events (
              slug, name, type, status, start_date, end_date,
              venue_name, venue_city, venue_state, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          `,
          args: [
            'main-event',
            'Main Event',
            'festival',
            'active',
            '2026-05-15',
            '2026-05-17',
            'Main Venue',
            'Boulder',
            'CO'
          ]
        });
        const newEventResult = await db.execute({
          sql: 'SELECT id FROM events WHERE slug = ?',
          args: ['main-event']
        });
        eventId = newEventResult.rows[0].id;
      } else {
        eventId = eventResult.rows[0].id;
      }

      // Create a production transaction
      const prodTransactionId = `PROD-TRANS-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      const transResult = await db.execute({
        sql: `
          INSERT INTO transactions (
            transaction_id, type, status, amount_cents, currency,
            customer_email, order_data, is_test
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          prodTransactionId,
          'tickets',
          'completed',
          10000,
          'USD',
          'prod@example.com',
          JSON.stringify({ test: false }),
          0 // is_test = 0 (production)
        ]
      });

      const dbTransactionId = transResult.lastInsertRowid;

      // Create a production ticket
      const prodTicketId = `PROD-TICKET-${Date.now()}`;
      await db.execute({
        sql: `
          INSERT INTO tickets (
            ticket_id, transaction_id, ticket_type, ticket_type_id, event_id, price_cents,
            attendee_email, status, registration_status, is_test
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          prodTicketId,
          dbTransactionId,
          'general',
          null,
          eventId,
          10000,
          'prod@example.com',
          'valid',
          'pending',
          0 // is_test = 0 (production)
        ]
      });

      // Generate a production QR token (without isTest flag)
      const prodQRToken = qrService.generateToken({
        tid: prodTicketId,
        ticketId: prodTicketId,
        eventId: eventId,
        isTest: false
      });

      // Attempt to validate production token in test-only mode
      const validationResult = await validateTestTicket(prodQRToken);

      expect(validationResult.valid).toBe(false);
      expect(validationResult.error).toContain('Production tickets not allowed in test mode');
    });
  });

  describe('Test Ticket QR Code Generation', () => {
    it('should generate QR codes with test indicators', async () => {
      // Create a test ticket
      const testTicket = await createTestTicket({
        ticketType: 'vip',
        attendeeEmail: 'vip@example.com',
        priceInCents: 10000
      });

      // Generate QR code using the helper
      const qrCode = await generateTestQRCode({
        ticketId: testTicket.ticketId,
        eventId: testTicket.eventId,
        isTest: true,
        metadata: {
          testMode: true,
          generatedBy: 'integration-test'
        }
      });

      expect(qrCode).toBeTruthy();

      // Validate the generated QR token
      const validation = qrService.validateToken(qrCode);
      expect(validation.valid).toBe(true);
      expect(validation.payload).toBeDefined();
      expect(validation.payload.isTest).toBe(true);
      expect(validation.payload.metadata).toBeDefined();
      expect(validation.payload.metadata.testMode).toBe(true);

      // Verify it's recognized as a test token
      const isTest = qrService.isTestToken(qrCode);
      expect(isTest).toBe(true);
    });

    it('should include test metadata in QR token payload', async () => {
      const customMetadata = {
        testMode: true,
        generatedBy: 'test-suite',
        environment: 'integration',
        customField: 'customValue'
      };

      // Create test ticket
      const testTicket = await createTestTicket({
        ticketType: 'workshop',
        attendeeEmail: 'workshop@example.com',
        priceInCents: 7500
      });

      // Generate QR code with custom metadata
      const qrCode = await generateTestQRCode({
        ticketId: testTicket.ticketId,
        eventId: testTicket.eventId,
        isTest: true,
        metadata: customMetadata
      });

      // Decode and verify payload
      const validation = qrService.validateToken(qrCode);
      expect(validation.valid).toBe(true);
      expect(validation.payload.metadata).toMatchObject(customMetadata);
      expect(validation.payload.isTest).toBe(true);
      expect(validation.payload.tid).toBe(testTicket.ticketId);
    });
  });

  describe('Test Ticket Validation Tracking', () => {
    it('should track test ticket validation attempts', async () => {
      // Create a test ticket
      const testTicket = await createTestTicket({
        ticketType: 'general',
        attendeeEmail: 'tracking@example.com',
        priceInCents: 5000
      });

      // Track a validation attempt
      const trackingResult = await trackTestValidationAttempt({
        ticketId: testTicket.ticketId,
        qrToken: testTicket.qrToken,
        validationResult: 'success',
        metadata: {
          testMode: true,
          environment: 'integration',
          validator: 'integration-test'
        }
      });

      expect(trackingResult.success).toBe(true);
      expect(trackingResult.ticketId).toBe(testTicket.ticketId);

      // Verify the validation was recorded in database
      const db = await getDatabaseClient();
      const validations = await db.execute({
        sql: 'SELECT * FROM qr_validations WHERE ticket_id = ?',
        args: [testTicket.ticketId]
      });

      expect(validations.rows.length).toBeGreaterThan(0);
      const validation = validations.rows[0];
      expect(validation.ticket_id).toBe(testTicket.ticketId);
      expect(validation.validation_result).toBe('success');

      // Parse and verify metadata
      const metadata = JSON.parse(validation.validation_metadata);
      expect(metadata.testMode).toBe(true);
      expect(metadata.environment).toBe('integration');
      expect(metadata.qrToken).toBe(testTicket.qrToken);
      expect(metadata.isTest).toBe(true);
    });

    it('should track multiple validation attempts for same ticket', async () => {
      // Create a test ticket
      const testTicket = await createTestTicket({
        ticketType: 'vip',
        attendeeEmail: 'multiple@example.com',
        priceInCents: 10000
      });

      // Track multiple validation attempts
      await trackTestValidationAttempt({
        ticketId: testTicket.ticketId,
        qrToken: testTicket.qrToken,
        validationResult: 'success',
        metadata: { attempt: 1 }
      });

      await trackTestValidationAttempt({
        ticketId: testTicket.ticketId,
        qrToken: testTicket.qrToken,
        validationResult: 'success',
        metadata: { attempt: 2 }
      });

      await trackTestValidationAttempt({
        ticketId: testTicket.ticketId,
        qrToken: testTicket.qrToken,
        validationResult: 'success',
        metadata: { attempt: 3 }
      });

      // Verify all attempts were tracked
      const db = await getDatabaseClient();
      const validations = await db.execute({
        sql: 'SELECT * FROM qr_validations WHERE ticket_id = ? ORDER BY created_at ASC',
        args: [testTicket.ticketId]
      });

      expect(validations.rows.length).toBe(3);

      // Verify each attempt has correct metadata
      validations.rows.forEach((validation, index) => {
        const metadata = JSON.parse(validation.validation_metadata);
        expect(metadata.attempt).toBe(index + 1);
      });
    });

    it('should track failed validation attempts', async () => {
      // Create a test ticket
      const testTicket = await createTestTicket({
        ticketType: 'general',
        attendeeEmail: 'failed@example.com',
        priceInCents: 5000
      });

      // Track a failed validation attempt (using 'invalid' which is in CHECK constraint)
      const trackingResult = await trackTestValidationAttempt({
        ticketId: testTicket.ticketId,
        qrToken: 'INVALID-TOKEN',
        validationResult: 'invalid',
        metadata: {
          testMode: true,
          reason: 'Invalid token format',
          errorType: 'TOKEN_INVALID'
        }
      });

      expect(trackingResult.success).toBe(true);

      // Verify the failed validation was recorded
      const db = await getDatabaseClient();
      const validations = await db.execute({
        sql: 'SELECT * FROM qr_validations WHERE ticket_id = ?',
        args: [testTicket.ticketId]
      });

      expect(validations.rows.length).toBe(1);
      const validation = validations.rows[0];
      expect(validation.validation_result).toBe('invalid');

      const metadata = JSON.parse(validation.validation_metadata);
      expect(metadata.reason).toBe('Invalid token format');
      expect(metadata.errorType).toBe('TOKEN_INVALID');
    });
  });

  describe('Test Token Security', () => {
    it('should not accept tokens signed with different secret', async () => {
      // Create a test ticket with correct secret
      const testTicket = await createTestTicket({
        ticketType: 'general',
        attendeeEmail: 'security@example.com',
        priceInCents: 5000
      });

      // Create a malicious token with different secret
      const maliciousService = new QRTokenService();
      // Override secret temporarily
      const originalSecret = maliciousService.secretKey;
      maliciousService.secretKey = 'wrong-secret-key-for-malicious-token';

      const maliciousToken = maliciousService.generateToken({
        tid: testTicket.ticketId,
        ticketId: testTicket.ticketId,
        isTest: true
      });

      // Restore original secret
      maliciousService.secretKey = originalSecret;

      // Try to validate with the correct service
      const validation = qrService.validateToken(maliciousToken);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('Invalid token');
    });

    it('should reject expired tokens', async () => {
      // Create a token that's already expired
      const expiredToken = qrService.generateToken({
        tid: 'TEST-TICKET-EXPIRED',
        ticketId: 'TEST-TICKET-EXPIRED',
        isTest: true,
        iat: Math.floor(Date.now() / 1000) - 1000,
        exp: Math.floor(Date.now() / 1000) - 500 // Expired 500 seconds ago
      });

      const validation = qrService.validateToken(expiredToken);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('expired');
    });
  });
});
