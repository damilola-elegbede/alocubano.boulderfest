/**
 * Unit Tests for Ticket Verification and Editing API Endpoints
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';

// Mock dependencies
vi.mock('../../../lib/database.js');
vi.mock('../../../lib/brevo-service.js');
vi.mock('../../../lib/volunteer-helpers.js', () => ({
  getClientIp: vi.fn(() => '127.0.0.1'),
  maskEmail: vi.fn((email) => email.replace(/(.{3})(.*)(@.*)/, '$1***$3')),
  escapeHtml: vi.fn((str) => str)
}));

const TEST_SECRET = 'test-secret-with-at-least-32-characters-for-security';
const TEST_EMAIL = 'test@example.com';

// Helper to create mock response object with all required methods
function createMockResponse() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
    end: vi.fn(),
    setHeader: vi.fn()
  };
}

describe('Ticket Verification API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.REGISTRATION_SECRET = TEST_SECRET;
  });

  describe('verify-email endpoint', () => {
    let handler;
    let mockClient;
    let mockBrevoService;
    let getDatabaseClient;
    let getBrevoService;

    beforeEach(async () => {
      // Setup mocks
      const databaseModule = await import('../../../lib/database.js');
      const brevoModule = await import('../../../lib/brevo-service.js');

      mockClient = {
        execute: vi.fn()
      };

      mockBrevoService = {
        sendTransactionalEmail: vi.fn().mockResolvedValue({})
      };

      getDatabaseClient = databaseModule.getDatabaseClient;
      getBrevoService = brevoModule.getBrevoService;

      getDatabaseClient.mockResolvedValue(mockClient);
      getBrevoService.mockReturnValue({
        ensureInitialized: vi.fn().mockResolvedValue(mockBrevoService)
      });

      // Import handler after mocks are set up
      handler = (await import('../../../api/tickets/verify-email.js')).default;
    });

    it('should send verification code for valid email with tickets', async () => {
      const req = {
        method: 'POST',
        body: { email: TEST_EMAIL },
        headers: {}
      };
      const res = createMockResponse();

      // Mock database: email has tickets
      mockClient.execute.mockResolvedValueOnce({
        rows: [{ count: 1 }]
      });

      // Mock database: insert verification code
      mockClient.execute.mockResolvedValueOnce({});

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Verification code sent to your email',
          expiresIn: 300 // 5 minutes
        })
      );

      // Verify database calls
      expect(mockClient.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          sql: expect.stringContaining('SELECT COUNT(*) as count'),
          args: [TEST_EMAIL, TEST_EMAIL]
        })
      );

      // Verify verification code was stored
      expect(mockClient.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          sql: expect.stringContaining('INSERT INTO email_verification_codes'),
          args: expect.arrayContaining([TEST_EMAIL])
        })
      );

      // Verify email was sent
      expect(mockBrevoService.sendTransactionalEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: [{ email: TEST_EMAIL }],
          subject: expect.stringContaining('Verification Code')
        })
      );
    });

    it('should handle rate limiting (3 requests per 15 min)', async () => {
      const req = {
        method: 'POST',
        body: { email: TEST_EMAIL },
        headers: {}
      };
      const res = createMockResponse();

      mockClient.execute.mockResolvedValue({ rows: [{ count: 1 }] });

      // Make 3 requests - should all succeed
      for (let i = 0; i < 3; i++) {
        await handler(req, res);
        expect(res.status).toHaveBeenCalledWith(200);
      }

      // 4th request should be rate limited
      res.status.mockClear();
      res.json.mockClear();

      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Too many verification requests'),
          retryAfter: expect.any(Number)
        })
      );
    });

    it('should return success even if no tickets found (security)', async () => {
      // Use a different email to avoid rate limiting from previous tests
      const differentEmail = 'different@example.com';
      const req = {
        method: 'POST',
        body: { email: differentEmail },
        headers: {}
      };
      const res = createMockResponse();

      // Mock database: no tickets found
      mockClient.execute.mockResolvedValueOnce({
        rows: [{ count: 0 }]
      });

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: expect.stringContaining('If tickets are associated')
        })
      );

      // Should NOT send email
      expect(mockBrevoService.sendTransactionalEmail).not.toHaveBeenCalled();
    });

    it('should validate email format', async () => {
      const invalidEmails = ['invalid', 'test@', '@example.com', 'test @example.com'];

      for (const invalidEmail of invalidEmails) {
        const req = {
          method: 'POST',
          body: { email: invalidEmail },
          headers: {}
        };
        const res = createMockResponse();

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Invalid email format'
          })
        );
      }
    });

    it('should store verification code in database', async () => {
      // Use a different email to avoid rate limiting
      const storageTestEmail = 'storage@example.com';
      const req = {
        method: 'POST',
        body: { email: storageTestEmail },
        headers: {}
      };
      const res = createMockResponse();

      mockClient.execute.mockResolvedValueOnce({ rows: [{ count: 1 }] });
      mockClient.execute.mockResolvedValueOnce({});

      await handler(req, res);

      // Verify code was inserted into database
      const insertCall = mockClient.execute.mock.calls.find(
        call => call[0].sql.includes('INSERT INTO email_verification_codes')
      );

      expect(insertCall).toBeDefined();
      expect(insertCall[0].args[0]).toBe(storageTestEmail.toLowerCase());
      expect(insertCall[0].args[1]).toMatch(/^\d{6}$/); // 6-digit code
      expect(insertCall[0].args[2]).toBeDefined(); // expires_at
      expect(insertCall[0].args[3]).toBeDefined(); // ip_address
    });

    it('should send email with 6-digit code', async () => {
      // Use a different email to avoid rate limiting
      const emailTestEmail = 'emailtest@example.com';
      const req = {
        method: 'POST',
        body: { email: emailTestEmail },
        headers: {}
      };
      const res = createMockResponse();

      mockClient.execute.mockResolvedValueOnce({ rows: [{ count: 1 }] });
      mockClient.execute.mockResolvedValueOnce({});

      await handler(req, res);

      expect(mockBrevoService.sendTransactionalEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: [{ email: emailTestEmail }],
          htmlContent: expect.stringContaining('Verification Code')
        })
      );

      // Verify the HTML contains a 6-digit code
      const emailCall = mockBrevoService.sendTransactionalEmail.mock.calls[0][0];
      const codeMatch = emailCall.htmlContent.match(/\d{6}/);
      expect(codeMatch).not.toBeNull();
    });
  });

  describe('verify-code endpoint', () => {
    let handler;
    let mockClient;
    let getDatabaseClient;

    beforeEach(async () => {
      const databaseModule = await import('../../../lib/database.js');

      mockClient = {
        execute: vi.fn()
      };

      getDatabaseClient = databaseModule.getDatabaseClient;
      getDatabaseClient.mockResolvedValue(mockClient);

      handler = (await import('../../../api/tickets/verify-code.js')).default;
    });

    it('should validate code and return JWT token', async () => {
      const req = {
        method: 'POST',
        body: { email: TEST_EMAIL, code: '123456' },
        headers: {}
      };
      const res = createMockResponse();

      const futureExpiry = new Date(Date.now() + 5 * 60 * 1000).toISOString();

      // Mock: valid code found
      mockClient.execute.mockResolvedValueOnce({
        rows: [{
          id: 1,
          email: TEST_EMAIL,
          code: '123456',
          expires_at: futureExpiry,
          attempts: 0,
          max_attempts: 3,
          status: 'pending'
        }]
      });

      // Mock: update code to verified
      mockClient.execute.mockResolvedValueOnce({});

      // Mock: invalidate other pending codes
      mockClient.execute.mockResolvedValueOnce({});

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          accessToken: expect.any(String),
          expiresIn: 3600
        })
      );

      // Verify JWT token
      const token = res.json.mock.calls[0][0].accessToken;
      const decoded = jwt.verify(token, TEST_SECRET);
      expect(decoded.email).toBe(TEST_EMAIL);
      expect(decoded.purpose).toBe('ticket_viewing');
    });

    it('should reject invalid code', async () => {
      const req = {
        method: 'POST',
        body: { email: TEST_EMAIL, code: '999999' },
        headers: {}
      };
      const res = createMockResponse();

      // Mock: no matching code found
      mockClient.execute.mockResolvedValueOnce({ rows: [] });

      // Mock: pending code exists (for attempt tracking)
      mockClient.execute.mockResolvedValueOnce({
        rows: [{
          id: 1,
          attempts: 0,
          max_attempts: 3
        }]
      });

      // Mock: update attempts
      mockClient.execute.mockResolvedValueOnce({});

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Invalid or expired')
        })
      );
    });

    it('should reject expired code', async () => {
      const req = {
        method: 'POST',
        body: { email: TEST_EMAIL, code: '123456' },
        headers: {}
      };
      const res = createMockResponse();

      const pastExpiry = new Date(Date.now() - 5 * 60 * 1000).toISOString();

      // Mock: expired code found
      mockClient.execute.mockResolvedValueOnce({
        rows: [{
          id: 1,
          email: TEST_EMAIL,
          code: '123456',
          expires_at: pastExpiry,
          attempts: 0,
          max_attempts: 3,
          status: 'pending'
        }]
      });

      // Mock: update code to expired
      mockClient.execute.mockResolvedValueOnce({});

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('expired')
        })
      );

      // Verify code was marked as expired
      expect(mockClient.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          sql: expect.stringContaining("status = 'expired'")
        })
      );
    });

    it('should enforce max attempts (3)', async () => {
      const req = {
        method: 'POST',
        body: { email: TEST_EMAIL, code: '123456' },
        headers: {}
      };
      const res = createMockResponse();

      const futureExpiry = new Date(Date.now() + 5 * 60 * 1000).toISOString();

      // Mock: code with max attempts already used
      mockClient.execute.mockResolvedValueOnce({
        rows: [{
          id: 1,
          email: TEST_EMAIL,
          code: '123456',
          expires_at: futureExpiry,
          attempts: 3,
          max_attempts: 3,
          status: 'pending'
        }]
      });

      // Mock: update code to failed
      mockClient.execute.mockResolvedValueOnce({});

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Too many verification attempts')
        })
      );

      // Verify code was marked as failed
      expect(mockClient.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          sql: expect.stringContaining("status = 'failed'")
        })
      );
    });

    it('should invalidate other pending codes after successful verification', async () => {
      const req = {
        method: 'POST',
        body: { email: TEST_EMAIL, code: '123456' },
        headers: {}
      };
      const res = createMockResponse();

      const futureExpiry = new Date(Date.now() + 5 * 60 * 1000).toISOString();

      mockClient.execute.mockResolvedValueOnce({
        rows: [{
          id: 1,
          email: TEST_EMAIL,
          code: '123456',
          expires_at: futureExpiry,
          attempts: 0,
          max_attempts: 3,
          status: 'pending'
        }]
      });

      mockClient.execute.mockResolvedValueOnce({}); // Mark as verified
      mockClient.execute.mockResolvedValueOnce({}); // Invalidate other codes

      await handler(req, res);

      // Verify other pending codes were invalidated
      const invalidateCall = mockClient.execute.mock.calls.find(
        call => call[0].sql.includes("status = 'expired'") && call[0].sql.includes('id != ?')
      );

      expect(invalidateCall).toBeDefined();
      expect(invalidateCall[0].args).toContain(TEST_EMAIL);
      expect(invalidateCall[0].args).toContain(1);
    });

    it('should handle rate limiting (10 attempts per 15 min)', async () => {
      const req = {
        method: 'POST',
        body: { email: TEST_EMAIL, code: '123456' },
        headers: { 'x-forwarded-for': '192.168.1.1' }
      };
      const res = createMockResponse();

      mockClient.execute.mockResolvedValue({ rows: [] });

      // Make 10 requests - should all succeed (with error, but not rate limited)
      for (let i = 0; i < 10; i++) {
        await handler(req, res);
        expect(res.status).toHaveBeenCalledWith(400); // Invalid code
      }

      // 11th request should be rate limited
      res.status.mockClear();
      res.json.mockClear();

      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Too many verification attempts'),
          retryAfter: expect.any(Number)
        })
      );
    });

    it('should create JWT token with correct claims', () => {
      const secret = TEST_SECRET;
      const email = TEST_EMAIL;

      process.env.REGISTRATION_SECRET = secret;

      const token = jwt.sign(
        {
          email: email.toLowerCase(),
          tokenId: 'test-token-id',
          purpose: 'ticket_viewing',
          createdAt: Date.now()
        },
        secret,
        {
          algorithm: 'HS256',
          expiresIn: '1h',
          issuer: 'alocubano-tickets'
        }
      );

      const decoded = jwt.verify(token, secret, {
        algorithms: ['HS256'],
        issuer: 'alocubano-tickets'
      });

      expect(decoded.email).toBe(email);
      expect(decoded.purpose).toBe('ticket_viewing');
      expect(decoded.iss).toBe('alocubano-tickets');
    });
  });

  describe('attendee editing endpoint', () => {
    let handler;
    let mockClient;
    let mockBrevoService;
    let getDatabaseClient;
    let getBrevoService;
    let validToken;

    beforeEach(async () => {
      const databaseModule = await import('../../../lib/database.js');
      const brevoModule = await import('../../../lib/brevo-service.js');

      mockClient = {
        execute: vi.fn()
      };

      mockBrevoService = {
        sendTransactionalEmail: vi.fn().mockResolvedValue({})
      };

      getDatabaseClient = databaseModule.getDatabaseClient;
      getBrevoService = brevoModule.getBrevoService;

      getDatabaseClient.mockResolvedValue(mockClient);
      getBrevoService.mockReturnValue({
        ensureInitialized: vi.fn().mockResolvedValue(mockBrevoService)
      });

      // Create a valid JWT token
      validToken = jwt.sign(
        {
          email: TEST_EMAIL,
          purpose: 'ticket_viewing',
          tokenId: 'test-token-id'
        },
        TEST_SECRET,
        {
          algorithm: 'HS256',
          expiresIn: '1h',
          issuer: 'alocubano-tickets'
        }
      );

      handler = (await import('../../../api/tickets/[ticketId]/attendee.js')).default;
    });

    it('should update attendee first name', async () => {
      const req = {
        method: 'PATCH',
        query: { ticketId: 'TEST-123' },
        headers: { authorization: `Bearer ${validToken}` },
        body: { firstName: 'NewFirst' }
      };
      const res = createMockResponse();

      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      // Mock: ticket found
      mockClient.execute.mockResolvedValueOnce({
        rows: [{
          id: 1,
          ticket_id: 'TEST-123',
          attendee_first_name: 'OldFirst',
          attendee_last_name: 'Last',
          attendee_email: TEST_EMAIL,
          scan_count: 0,
          event_date: futureDate,
          event_end_date: futureDate,
          ticket_type: 'Full Festival Pass'
        }]
      });

      // Mock: update ticket
      mockClient.execute.mockResolvedValueOnce({});

      // Mock: insert audit log
      mockClient.execute.mockResolvedValueOnce({});

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          ticket: expect.objectContaining({
            attendee_first_name: 'NewFirst'
          }),
          changes: expect.arrayContaining([
            expect.objectContaining({
              field: 'attendee_first_name',
              oldValue: 'OldFirst',
              newValue: 'NewFirst'
            })
          ])
        })
      );
    });

    it('should update attendee last name', async () => {
      const req = {
        method: 'PATCH',
        query: { ticketId: 'TEST-123' },
        headers: { authorization: `Bearer ${validToken}` },
        body: { lastName: 'NewLast' }
      };
      const res = createMockResponse();

      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      mockClient.execute.mockResolvedValueOnce({
        rows: [{
          id: 1,
          ticket_id: 'TEST-123',
          attendee_first_name: 'First',
          attendee_last_name: 'OldLast',
          attendee_email: TEST_EMAIL,
          scan_count: 0,
          event_date: futureDate,
          event_end_date: futureDate,
          ticket_type: 'Full Festival Pass'
        }]
      });

      mockClient.execute.mockResolvedValueOnce({});
      mockClient.execute.mockResolvedValueOnce({});

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          changes: expect.arrayContaining([
            expect.objectContaining({
              field: 'attendee_last_name',
              oldValue: 'OldLast',
              newValue: 'NewLast'
            })
          ])
        })
      );
    });

    it('should update attendee email', async () => {
      const newEmail = 'newemail@example.com';
      const req = {
        method: 'PATCH',
        query: { ticketId: 'TEST-123' },
        headers: { authorization: `Bearer ${validToken}` },
        body: { email: newEmail }
      };
      const res = createMockResponse();

      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      mockClient.execute.mockResolvedValueOnce({
        rows: [{
          id: 1,
          ticket_id: 'TEST-123',
          attendee_first_name: 'First',
          attendee_last_name: 'Last',
          attendee_email: TEST_EMAIL,
          scan_count: 0,
          event_date: futureDate,
          event_end_date: futureDate,
          ticket_type: 'Full Festival Pass'
        }]
      });

      mockClient.execute.mockResolvedValueOnce({});
      mockClient.execute.mockResolvedValueOnce({});

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          changes: expect.arrayContaining([
            expect.objectContaining({
              field: 'attendee_email',
              oldValue: TEST_EMAIL,
              newValue: newEmail.toLowerCase()
            })
          ])
        })
      );

      // Verify email notifications sent to both old and new email
      expect(mockBrevoService.sendTransactionalEmail).toHaveBeenCalledTimes(2);
    });

    it('should update multiple fields at once', async () => {
      const req = {
        method: 'PATCH',
        query: { ticketId: 'TEST-123' },
        headers: { authorization: `Bearer ${validToken}` },
        body: {
          firstName: 'NewFirst',
          lastName: 'NewLast',
          email: 'newemail@example.com'
        }
      };
      const res = createMockResponse();

      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      mockClient.execute.mockResolvedValueOnce({
        rows: [{
          id: 1,
          ticket_id: 'TEST-123',
          attendee_first_name: 'OldFirst',
          attendee_last_name: 'OldLast',
          attendee_email: TEST_EMAIL,
          scan_count: 0,
          event_date: futureDate,
          event_end_date: futureDate,
          ticket_type: 'Full Festival Pass'
        }]
      });

      mockClient.execute.mockResolvedValueOnce({});
      mockClient.execute.mockResolvedValueOnce({});
      mockClient.execute.mockResolvedValueOnce({});
      mockClient.execute.mockResolvedValueOnce({});

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          changes: expect.arrayContaining([
            expect.objectContaining({ field: 'attendee_first_name' }),
            expect.objectContaining({ field: 'attendee_last_name' }),
            expect.objectContaining({ field: 'attendee_email' })
          ])
        })
      );
    });

    it('should require authentication token', async () => {
      const req = {
        method: 'PATCH',
        query: { ticketId: 'TEST-123' },
        headers: {},
        body: { firstName: 'NewFirst' }
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Authentication required'
        })
      );
    });

    it('should verify user owns the ticket', async () => {
      const wrongToken = jwt.sign(
        {
          email: 'wrong@example.com',
          purpose: 'ticket_viewing',
          tokenId: 'test-token-id'
        },
        TEST_SECRET,
        {
          algorithm: 'HS256',
          expiresIn: '1h',
          issuer: 'alocubano-tickets'
        }
      );

      const req = {
        method: 'PATCH',
        query: { ticketId: 'TEST-123' },
        headers: { authorization: `Bearer ${wrongToken}` },
        body: { firstName: 'NewFirst' }
      };
      const res = createMockResponse();

      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      mockClient.execute.mockResolvedValueOnce({
        rows: [{
          id: 1,
          ticket_id: 'TEST-123',
          attendee_email: TEST_EMAIL,
          scan_count: 0,
          event_date: futureDate,
          event_end_date: futureDate
        }]
      });

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('permission')
        })
      );
    });

    it('should reject editing scanned tickets', async () => {
      const req = {
        method: 'PATCH',
        query: { ticketId: 'TEST-123' },
        headers: { authorization: `Bearer ${validToken}` },
        body: { firstName: 'NewFirst' }
      };
      const res = createMockResponse();

      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      mockClient.execute.mockResolvedValueOnce({
        rows: [{
          id: 1,
          ticket_id: 'TEST-123',
          attendee_email: TEST_EMAIL,
          scan_count: 1, // Already scanned
          event_date: futureDate,
          event_end_date: futureDate
        }]
      });

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('scanned')
        })
      );
    });

    it('should reject editing tickets after event ended', async () => {
      const req = {
        method: 'PATCH',
        query: { ticketId: 'TEST-123' },
        headers: { authorization: `Bearer ${validToken}` },
        body: { firstName: 'NewFirst' }
      };
      const res = createMockResponse();

      const pastDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      mockClient.execute.mockResolvedValueOnce({
        rows: [{
          id: 1,
          ticket_id: 'TEST-123',
          attendee_email: TEST_EMAIL,
          scan_count: 0,
          event_date: pastDate,
          event_end_date: pastDate
        }]
      });

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('event has ended')
        })
      );
    });

    it('should validate email format', async () => {
      const req = {
        method: 'PATCH',
        query: { ticketId: 'TEST-123' },
        headers: { authorization: `Bearer ${validToken}` },
        body: { email: 'invalid-email' }
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid email format'
        })
      );
    });

    it('should create audit log entries', async () => {
      const req = {
        method: 'PATCH',
        query: { ticketId: 'TEST-123' },
        headers: { authorization: `Bearer ${validToken}` },
        body: { firstName: 'NewFirst' }
      };
      const res = createMockResponse();

      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      mockClient.execute.mockResolvedValueOnce({
        rows: [{
          id: 1,
          ticket_id: 'TEST-123',
          attendee_first_name: 'OldFirst',
          attendee_last_name: 'Last',
          attendee_email: TEST_EMAIL,
          scan_count: 0,
          event_date: futureDate,
          event_end_date: futureDate,
          ticket_type: 'Full Festival Pass'
        }]
      });

      mockClient.execute.mockResolvedValueOnce({}); // Update ticket
      mockClient.execute.mockResolvedValueOnce({}); // Insert audit log

      await handler(req, res);

      // Verify audit log was created
      const auditLogCall = mockClient.execute.mock.calls.find(
        call => call[0].sql.includes('INSERT INTO ticket_edit_audit_log')
      );

      expect(auditLogCall).toBeDefined();
      expect(auditLogCall[0].args).toContain(1); // ticket_id
      expect(auditLogCall[0].args).toContain('TEST-123'); // ticket_external_id
      expect(auditLogCall[0].args).toContain('attendee_first_name'); // field_name
      expect(auditLogCall[0].args).toContain('OldFirst'); // old_value
      expect(auditLogCall[0].args).toContain('NewFirst'); // new_value
      expect(auditLogCall[0].args).toContain(TEST_EMAIL); // edited_by_email
    });

    it('should send notification emails on email change', async () => {
      const newEmail = 'newemail@example.com';
      const req = {
        method: 'PATCH',
        query: { ticketId: 'TEST-123' },
        headers: { authorization: `Bearer ${validToken}` },
        body: { email: newEmail }
      };
      const res = createMockResponse();

      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      mockClient.execute.mockResolvedValueOnce({
        rows: [{
          id: 1,
          ticket_id: 'TEST-123',
          attendee_first_name: 'First',
          attendee_last_name: 'Last',
          attendee_email: TEST_EMAIL,
          scan_count: 0,
          event_date: futureDate,
          event_end_date: futureDate,
          ticket_type: 'Full Festival Pass'
        }]
      });

      mockClient.execute.mockResolvedValueOnce({});
      mockClient.execute.mockResolvedValueOnce({});

      await handler(req, res);

      // Verify emails sent to both old and new addresses
      expect(mockBrevoService.sendTransactionalEmail).toHaveBeenCalledTimes(2);

      const calls = mockBrevoService.sendTransactionalEmail.mock.calls;
      const emails = calls.map(call => call[0].to[0].email);

      expect(emails).toContain(TEST_EMAIL);
      expect(emails).toContain(newEmail.toLowerCase());
    });

    it('should send notification email on name change', async () => {
      const req = {
        method: 'PATCH',
        query: { ticketId: 'TEST-123' },
        headers: { authorization: `Bearer ${validToken}` },
        body: { firstName: 'NewFirst' }
      };
      const res = createMockResponse();

      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      mockClient.execute.mockResolvedValueOnce({
        rows: [{
          id: 1,
          ticket_id: 'TEST-123',
          attendee_first_name: 'OldFirst',
          attendee_last_name: 'Last',
          attendee_email: TEST_EMAIL,
          scan_count: 0,
          event_date: futureDate,
          event_end_date: futureDate,
          ticket_type: 'Full Festival Pass'
        }]
      });

      mockClient.execute.mockResolvedValueOnce({});
      mockClient.execute.mockResolvedValueOnce({});

      await handler(req, res);

      // Verify email sent
      expect(mockBrevoService.sendTransactionalEmail).toHaveBeenCalledTimes(1);
      expect(mockBrevoService.sendTransactionalEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: [{ email: TEST_EMAIL }],
          subject: expect.stringContaining('Ticket Information Updated')
        })
      );
    });

    it('should handle no changes gracefully', async () => {
      const req = {
        method: 'PATCH',
        query: { ticketId: 'TEST-123' },
        headers: { authorization: `Bearer ${validToken}` },
        body: { firstName: 'SameName' }
      };
      const res = createMockResponse();

      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      mockClient.execute.mockResolvedValueOnce({
        rows: [{
          id: 1,
          ticket_id: 'TEST-123',
          attendee_first_name: 'SameName',
          attendee_last_name: 'Last',
          attendee_email: TEST_EMAIL,
          scan_count: 0,
          event_date: futureDate,
          event_end_date: futureDate,
          ticket_type: 'Full Festival Pass'
        }]
      });

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'No changes detected'
        })
      );

      // No update or audit log should be created
      expect(mockClient.execute).toHaveBeenCalledTimes(1); // Only the initial SELECT
      expect(mockBrevoService.sendTransactionalEmail).not.toHaveBeenCalled();
    });
  });

  describe('JWT Token Verification', () => {
    it('should verify valid token', () => {
      const secret = 'test-secret-with-at-least-32-characters-for-security';
      const email = 'test@example.com';

      process.env.REGISTRATION_SECRET = secret;

      const token = jwt.sign(
        {
          email,
          purpose: 'ticket_viewing'
        },
        secret,
        {
          algorithm: 'HS256',
          expiresIn: '1h',
          issuer: 'alocubano-tickets'
        }
      );

      const decoded = jwt.verify(token, secret, {
        algorithms: ['HS256'],
        issuer: 'alocubano-tickets'
      });

      expect(decoded.email).toBe(email);
    });

    it('should reject expired token', () => {
      const secret = 'test-secret-with-at-least-32-characters-for-security';

      process.env.REGISTRATION_SECRET = secret;

      const token = jwt.sign(
        {
          email: 'test@example.com',
          purpose: 'ticket_viewing'
        },
        secret,
        {
          algorithm: 'HS256',
          expiresIn: '-1s', // Already expired
          issuer: 'alocubano-tickets'
        }
      );

      expect(() => {
        jwt.verify(token, secret, {
          algorithms: ['HS256'],
          issuer: 'alocubano-tickets'
        });
      }).toThrow();
    });

    it('should reject token with wrong issuer', () => {
      const secret = 'test-secret-with-at-least-32-characters-for-security';

      process.env.REGISTRATION_SECRET = secret;

      const token = jwt.sign(
        {
          email: 'test@example.com',
          purpose: 'ticket_viewing'
        },
        secret,
        {
          algorithm: 'HS256',
          expiresIn: '1h',
          issuer: 'wrong-issuer'
        }
      );

      expect(() => {
        jwt.verify(token, secret, {
          algorithms: ['HS256'],
          issuer: 'alocubano-tickets'
        });
      }).toThrow();
    });

    it('should reject token with wrong secret', () => {
      const secret1 = 'test-secret-with-at-least-32-characters-for-security';
      const secret2 = 'different-secret-also-32-chars-minimum-length';

      const token = jwt.sign(
        {
          email: 'test@example.com',
          purpose: 'ticket_viewing'
        },
        secret1,
        {
          algorithm: 'HS256',
          expiresIn: '1h',
          issuer: 'alocubano-tickets'
        }
      );

      expect(() => {
        jwt.verify(token, secret2, {
          algorithms: ['HS256'],
          issuer: 'alocubano-tickets'
        });
      }).toThrow();
    });
  });

  describe('Email Template Tests', () => {
    it('should generate verification code email', async () => {
      const { generateVerificationCodeEmail } = await import('../../../lib/email-templates/verification-code.js');

      const html = generateVerificationCodeEmail({
        code: '123456',
        expiryMinutes: 5
      });

      expect(html).toContain('123456');
      expect(html.toLowerCase()).toContain('5 minutes');
      expect(html.toLowerCase()).toContain('verification code');
    });

    it('should generate attendee info changed email', async () => {
      const { generateAttendeeInfoChangedEmail } = await import('../../../lib/email-templates/attendee-info-changed.js');

      const html = generateAttendeeInfoChangedEmail({
        ticketId: 'TEST-123',
        ticketType: 'Full Festival Pass',
        eventDate: 'May 15, 2026',
        changes: [
          {
            field: 'attendee_first_name',
            oldValue: 'John',
            newValue: 'Jane'
          }
        ],
        changedAt: 'Jan 11, 2026, 4:00 PM MST',
        changedByEmail: 'test@example.com',
        isRecipient: true
      });

      // Check that key information is present in the email
      expect(html).toContain('TEST-123');
      expect(html).toContain('Full Festival Pass');
      expect(html).toContain('May 15, 2026');
      expect(html).toContain('John');
      expect(html).toContain('Jane');
      expect(html.toLowerCase()).toContain('first name');
    });
  });
});
