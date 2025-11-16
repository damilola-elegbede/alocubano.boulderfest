/**
 * Comprehensive Unit Tests for Create Pending Transaction API
 * Tests inline registration system, validation, idempotency, and error handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { v4 as uuidv4 } from 'uuid';

// Mock dependencies
vi.mock('../../../../lib/database.js');
vi.mock('uuid');

describe('Create Pending Transaction API - Unit Tests', () => {
  let handler;
  let mockClient;
  let getDatabaseClient;
  let mockUuidv4;

  // Test data constants
  const VALID_CART = [
    { ticketTypeId: 1, quantity: 2, price_cents: 12500 }
  ];

  const VALID_CUSTOMER = {
    email: 'customer@example.com',
    name: 'Jane Doe',
    phone: '+1234567890'
  };

  const VALID_REGISTRATIONS = [
    { ticketTypeId: 1, firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' },
    { ticketTypeId: 1, firstName: 'John', lastName: 'Smith', email: 'john@example.com' }
  ];

  const VALID_FINGERPRINT = 'abc123def456';

  const MOCK_TICKET_TYPE = {
    id: 1,
    ticket_type_name: 'Weekend Pass',
    price_cents: 12500,
    status: 'active',
    event_id: 1,
    event_name: 'A Lo Cubano Boulder Fest 2026',
    event_date: '2026-05-15',
    event_time: '19:00:00'
  };

  // Helper to create mock request
  function createMockRequest(overrides = {}) {
    return {
      method: 'POST',
      body: {
        cartItems: VALID_CART,
        customerInfo: VALID_CUSTOMER,
        registrations: VALID_REGISTRATIONS,
        cartFingerprint: VALID_FINGERPRINT,
        ...overrides
      },
      headers: {
        'x-forwarded-for': '192.168.1.1',
        'user-agent': 'Mozilla/5.0'
      }
    };
  }

  // Helper to create mock response
  function createMockResponse() {
    return {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
  }

  beforeEach(async () => {
    vi.clearAllMocks();

    // Setup database mock
    const databaseModule = await import('../../../../lib/database.js');
    mockClient = {
      execute: vi.fn()
    };
    getDatabaseClient = databaseModule.getDatabaseClient;
    getDatabaseClient.mockResolvedValue(mockClient);

    // Setup UUID mock
    const uuidModule = await import('uuid');
    mockUuidv4 = uuidModule.v4;
    let uuidCounter = 0;
    mockUuidv4.mockImplementation(() => `test-uuid-${++uuidCounter}`);

    // Import handler after mocks
    handler = (await import('../../../../api/checkout/create-pending-transaction.js')).default;
  });

  afterEach(() => {
    vi.resetModules();
  });

  // ============================================================================
  // A. REQUEST VALIDATION TESTS
  // ============================================================================

  describe('Request Validation', () => {
    it('should reject requests without customerInfo', async () => {
      const req = createMockRequest({ customerInfo: undefined });
      const res = createMockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Customer email is required'
        })
      );
    });

    it('should reject requests without customer email', async () => {
      const req = createMockRequest({
        customerInfo: { name: 'Jane Doe' }
      });
      const res = createMockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Customer email is required'
        })
      );
    });

    it('should reject empty cart', async () => {
      const req = createMockRequest({ cartItems: [] });
      const res = createMockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid cart data',
          details: ['Cart is empty']
        })
      );
    });

    it('should reject non-array cart', async () => {
      const req = createMockRequest({ cartItems: null });
      const res = createMockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid cart data'
        })
      );
    });

    it('should reject cart items missing ticketTypeId', async () => {
      const req = createMockRequest({
        cartItems: [{ quantity: 1, price_cents: 12500 }]
      });
      const res = createMockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid cart data',
          details: expect.arrayContaining([
            expect.stringContaining('Invalid ticket type ID')
          ])
        })
      );
    });

    it('should reject cart items with invalid quantity', async () => {
      const req = createMockRequest({
        cartItems: [{ ticketTypeId: 1, quantity: 0, price_cents: 12500 }],
        registrations: []
      });
      const res = createMockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid cart data',
          details: expect.arrayContaining([
            expect.stringContaining('Invalid quantity')
          ])
        })
      );
    });

    it('should reject cart items with invalid price', async () => {
      const req = createMockRequest({
        cartItems: [{ ticketTypeId: 1, quantity: 1, price_cents: -100 }],
        registrations: [VALID_REGISTRATIONS[0]]
      });
      const res = createMockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid cart data',
          details: expect.arrayContaining([
            expect.stringContaining('Invalid price')
          ])
        })
      );
    });

    it('should reject mismatched registration count', async () => {
      const req = createMockRequest({
        cartItems: [{ ticketTypeId: 1, quantity: 3, price_cents: 12500 }],
        registrations: VALID_REGISTRATIONS // Only 2 registrations
      });
      const res = createMockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Registration count mismatch',
          expected: 3,
          received: 2
        })
      );
    });

    it('should reject empty registrations array', async () => {
      const req = createMockRequest({
        cartItems: [{ ticketTypeId: 1, quantity: 1, price_cents: 12500 }],
        registrations: []
      });
      const res = createMockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid registration data',
          details: expect.arrayContaining([
            'At least one registration is required'
          ])
        })
      );
    });

    it('should reject non-POST requests', async () => {
      const req = createMockRequest();
      req.method = 'GET';
      const res = createMockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(405);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Method not allowed'
        })
      );
    });
  });

  // ============================================================================
  // B. REGISTRATION DATA VALIDATION TESTS
  // ============================================================================

  describe('Registration Data Validation', () => {
    it('should accept valid names with letters, spaces, hyphens, apostrophes', async () => {
      const req = createMockRequest({
        cartItems: [{ ticketTypeId: 1, quantity: 4, price_cents: 12500 }],
        registrations: [
          { ticketTypeId: 1, firstName: 'Mary-Jane', lastName: "O'Brien", email: 'mary@example.com' },
          { ticketTypeId: 1, firstName: 'Jean Pierre', lastName: 'De La Cruz', email: 'jean@example.com' },
          { ticketTypeId: 1, firstName: 'Ann-Marie', lastName: "D'Angelo", email: 'ann@example.com' },
          { ticketTypeId: 1, firstName: 'Maria', lastName: 'Garcia-Lopez', email: 'maria@example.com' }
        ]
      });
      const res = createMockResponse();

      // Mock database responses
      mockClient.execute
        .mockResolvedValueOnce({ rows: [] }) // No existing transaction
        .mockResolvedValueOnce({ rows: [{ count: 0 }] }) // Order number check
        .mockResolvedValueOnce({ lastInsertRowid: 123n }) // Transaction insert
        .mockResolvedValueOnce({ rows: [MOCK_TICKET_TYPE] }) // Ticket types
        .mockResolvedValue({}); // Ticket inserts

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true
        })
      );
    });

    it('should reject names with numbers', async () => {
      const req = createMockRequest({
        cartItems: [{ ticketTypeId: 1, quantity: 1, price_cents: 12500 }],
        registrations: [
          { ticketTypeId: 1, firstName: 'John123', lastName: 'Doe', email: 'john@example.com' }
        ]
      });
      const res = createMockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid registration data',
          details: expect.arrayContaining([
            expect.stringContaining('Invalid first name')
          ])
        })
      );
    });

    it('should reject names with special characters', async () => {
      const req = createMockRequest({
        cartItems: [{ ticketTypeId: 1, quantity: 1, price_cents: 12500 }],
        registrations: [
          { ticketTypeId: 1, firstName: 'John@Doe', lastName: 'Smith#', email: 'john@example.com' }
        ]
      });
      const res = createMockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid registration data',
          details: expect.arrayContaining([
            expect.stringContaining('Invalid first name')
          ])
        })
      );
    });

    it('should reject names over 50 characters', async () => {
      const req = createMockRequest({
        cartItems: [{ ticketTypeId: 1, quantity: 1, price_cents: 12500 }],
        registrations: [
          {
            ticketTypeId: 1,
            firstName: 'A'.repeat(51),
            lastName: 'Doe',
            email: 'john@example.com'
          }
        ]
      });
      const res = createMockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid registration data'
        })
      );
    });

    it('should reject empty names', async () => {
      const req = createMockRequest({
        cartItems: [{ ticketTypeId: 1, quantity: 1, price_cents: 12500 }],
        registrations: [
          { ticketTypeId: 1, firstName: '', lastName: 'Doe', email: 'john@example.com' }
        ]
      });
      const res = createMockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid registration data',
          details: expect.arrayContaining([
            expect.stringContaining('Invalid first name')
          ])
        })
      );
    });

    it('should validate email format - accept valid emails', async () => {
      const req = createMockRequest({
        cartItems: [{ ticketTypeId: 1, quantity: 3, price_cents: 12500 }],
        registrations: [
          { ticketTypeId: 1, firstName: 'User', lastName: 'One', email: 'user@example.com' },
          { ticketTypeId: 1, firstName: 'User', lastName: 'Two', email: 'user+tag@domain.co.uk' },
          { ticketTypeId: 1, firstName: 'User', lastName: 'Three', email: 'user.name@sub.domain.com' }
        ]
      });
      const res = createMockResponse();

      // Mock database responses
      mockClient.execute
        .mockResolvedValueOnce({ rows: [] }) // No existing transaction
        .mockResolvedValueOnce({ rows: [{ count: 0 }] }) // Order number check
        .mockResolvedValueOnce({ lastInsertRowid: 123n }) // Transaction insert
        .mockResolvedValueOnce({ rows: [MOCK_TICKET_TYPE] }) // Ticket types
        .mockResolvedValue({}); // Ticket inserts

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('should validate email format - reject invalid emails', async () => {
      const req = createMockRequest({
        cartItems: [{ ticketTypeId: 1, quantity: 1, price_cents: 12500 }],
        registrations: [
          { ticketTypeId: 1, firstName: 'John', lastName: 'Doe', email: 'notanemail' }
        ]
      });
      const res = createMockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid registration data',
          details: expect.arrayContaining([
            expect.stringContaining('Invalid email')
          ])
        })
      );
    });

    it('should reject email without domain', async () => {
      const req = createMockRequest({
        cartItems: [{ ticketTypeId: 1, quantity: 1, price_cents: 12500 }],
        registrations: [
          { ticketTypeId: 1, firstName: 'John', lastName: 'Doe', email: 'user@' }
        ]
      });
      const res = createMockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid registration data'
        })
      );
    });

    it('should require ticketTypeId for each registration', async () => {
      const req = createMockRequest({
        cartItems: [{ ticketTypeId: 1, quantity: 1, price_cents: 12500 }],
        registrations: [
          { firstName: 'John', lastName: 'Doe', email: 'john@example.com' }
        ]
      });
      const res = createMockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid registration data',
          details: expect.arrayContaining([
            expect.stringContaining('Invalid ticket type ID')
          ])
        })
      );
    });

    it('should validate ticketTypeId is a number', async () => {
      const req = createMockRequest({
        cartItems: [{ ticketTypeId: 1, quantity: 1, price_cents: 12500 }],
        registrations: [
          { ticketTypeId: 'not-a-number', firstName: 'John', lastName: 'Doe', email: 'john@example.com' }
        ]
      });
      const res = createMockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid registration data'
        })
      );
    });

    it('should return all validation errors, not just first', async () => {
      const req = createMockRequest({
        cartItems: [{ ticketTypeId: 1, quantity: 2, price_cents: 12500 }],
        registrations: [
          { ticketTypeId: 1, firstName: 'John123', lastName: 'Doe@', email: 'notanemail' },
          { ticketTypeId: 'bad', firstName: '', lastName: 'Smith#', email: 'user@' }
        ]
      });
      const res = createMockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      const response = res.json.mock.calls[0][0];
      expect(response.details.length).toBeGreaterThan(1);
    });
  });

  // ============================================================================
  // C. TRANSACTION CREATION TESTS
  // ============================================================================

  describe('Transaction Creation', () => {
    beforeEach(() => {
      // Setup successful database mocks
      mockClient.execute
        .mockResolvedValueOnce({ rows: [] }) // No existing transaction (idempotency check)
        .mockResolvedValueOnce({ rows: [{ count: 0 }] }) // Order number check
        .mockResolvedValueOnce({ lastInsertRowid: 123n }) // Transaction insert
        .mockResolvedValueOnce({ rows: [MOCK_TICKET_TYPE] }) // Ticket types
        .mockResolvedValue({}); // Ticket inserts
    });

    it('should create transaction with correct data structure', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          transaction: expect.objectContaining({
            id: 123,
            transaction_id: expect.stringMatching(/^test-uuid-/),
            order_number: expect.stringMatching(/^ALO-\d{4}-\d{4}$/),
            total_amount_cents: 25000,
            customer_email: 'customer@example.com',
            payment_status: 'pending'
          })
        })
      );
    });

    it('should set payment_status to pending', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      await handler(req, res);

      const transactionInsert = mockClient.execute.mock.calls.find(call =>
        call[0].sql?.includes('INSERT INTO transactions')
      );

      expect(transactionInsert[0].args).toContain('pending');
    });

    it('should calculate total_amount_cents correctly', async () => {
      const req = createMockRequest({
        cartItems: [
          { ticketTypeId: 1, quantity: 2, price_cents: 12500 },
          { ticketTypeId: 2, quantity: 1, price_cents: 7500 }
        ],
        registrations: [
          VALID_REGISTRATIONS[0],
          VALID_REGISTRATIONS[1],
          { ticketTypeId: 2, firstName: 'Bob', lastName: 'Wilson', email: 'bob@example.com' }
        ]
      });
      const res = createMockResponse();

      // Clear beforeEach mocks and set up custom mocks for multiple ticket types
      mockClient.execute.mockClear();
      mockClient.execute
        .mockResolvedValueOnce({ rows: [] }) // No existing transaction
        .mockResolvedValueOnce({ rows: [{ count: 0 }] }) // Order number check
        .mockResolvedValueOnce({ lastInsertRowid: 123n }) // Transaction insert
        .mockResolvedValueOnce({
          rows: [
            MOCK_TICKET_TYPE,
            { ...MOCK_TICKET_TYPE, id: 2, ticket_type_name: 'Day Pass', price_cents: 7500 }
          ]
        })
        .mockResolvedValue({});

      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          transaction: expect.objectContaining({
            total_amount_cents: 32500 // (12500 * 2) + (7500 * 1)
          })
        })
      );
    });

    it('should mark transactions under $1.00 as test mode', async () => {
      const req = createMockRequest({
        cartItems: [{ ticketTypeId: 1, quantity: 1, price_cents: 50 }],
        registrations: [VALID_REGISTRATIONS[0]]
      });
      const res = createMockResponse();

      await handler(req, res);

      const transactionInsert = mockClient.execute.mock.calls.find(call =>
        call[0].sql?.includes('INSERT INTO transactions')
      );

      // is_test should be 1 for amounts < 100 cents (index 9 in args)
      expect(transactionInsert[0].args[9]).toBe(1);
    });

    it('should not mark transactions $1.00+ as test mode', async () => {
      const req = createMockRequest({
        cartItems: [{ ticketTypeId: 1, quantity: 1, price_cents: 100 }],
        registrations: [VALID_REGISTRATIONS[0]]
      });
      const res = createMockResponse();

      await handler(req, res);

      const transactionInsert = mockClient.execute.mock.calls.find(call =>
        call[0].sql?.includes('INSERT INTO transactions')
      );

      // is_test should be 0 for amounts >= 100 cents (index 9 in args)
      expect(transactionInsert[0].args[9]).toBe(0);
    });

    it('should store metadata with cartFingerprint', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      await handler(req, res);

      const transactionInsert = mockClient.execute.mock.calls.find(call =>
        call[0].sql?.includes('INSERT INTO transactions')
      );

      const metadataArg = transactionInsert[0].args[8]; // metadata is at index 8
      const metadata = JSON.parse(metadataArg);

      expect(metadata).toHaveProperty('cartFingerprint', VALID_FINGERPRINT);
      expect(metadata).toHaveProperty('source', 'inline_registration');
      expect(metadata).toHaveProperty('createdAt');
    });

    it('should capture IP address from headers', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      await handler(req, res);

      const transactionInsert = mockClient.execute.mock.calls.find(call =>
        call[0].sql?.includes('INSERT INTO transactions')
      );

      expect(transactionInsert[0].args[10]).toBe('192.168.1.1'); // ip_address is at index 10
    });

    it('should capture user agent from headers', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      await handler(req, res);

      const transactionInsert = mockClient.execute.mock.calls.find(call =>
        call[0].sql?.includes('INSERT INTO transactions')
      );

      expect(transactionInsert[0].args[11]).toBe('Mozilla/5.0'); // user_agent is at index 11
    });

    it('should generate unique order numbers', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      // Mock order number not existing
      mockClient.execute
        .mockResolvedValueOnce({ rows: [] }) // No existing transaction (idempotency check)
        .mockResolvedValueOnce({ rows: [{ count: 0 }] }) // Order number check
        .mockResolvedValueOnce({ lastInsertRowid: 123n })
        .mockResolvedValueOnce({ rows: [MOCK_TICKET_TYPE] })
        .mockResolvedValue({});

      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          transaction: expect.objectContaining({
            order_number: expect.stringMatching(/^ALO-\d{4}-\d{4}$/)
          })
        })
      );
    });

    it('should use current year in order number', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      // Mock order number not existing
      mockClient.execute
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })
        .mockResolvedValueOnce({ lastInsertRowid: 123n })
        .mockResolvedValueOnce({ rows: [MOCK_TICKET_TYPE] })
        .mockResolvedValue({});

      await handler(req, res);

      const currentYear = new Date().getFullYear();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          transaction: expect.objectContaining({
            order_number: expect.stringMatching(new RegExp(`^ALO-${currentYear}-\\d{4}$`))
          })
        })
      );
    });
  });

  // ============================================================================
  // D. TICKET CREATION TESTS
  // ============================================================================

  describe('Ticket Creation', () => {
    beforeEach(() => {
      mockClient.execute
        .mockResolvedValueOnce({ rows: [] }) // No existing transaction
        .mockResolvedValueOnce({ rows: [{ count: 0 }] }) // Order number check
        .mockResolvedValueOnce({ lastInsertRowid: 123n }) // Transaction insert
        .mockResolvedValueOnce({ rows: [MOCK_TICKET_TYPE] }) // Ticket types
        .mockResolvedValue({}); // Ticket inserts
    });

    it('should create tickets with registration_status = pending_payment', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          tickets: expect.arrayContaining([
            expect.objectContaining({
              registration_status: 'pending_payment'
            })
          ])
        })
      );
    });

    it('should store attendee info in tickets', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      await handler(req, res);

      const ticketInserts = mockClient.execute.mock.calls.filter(call =>
        call[0].sql?.includes('INSERT INTO tickets')
      );

      expect(ticketInserts).toHaveLength(2);

      // First ticket
      expect(ticketInserts[0][0].args).toEqual(
        expect.arrayContaining([
          'Jane',
          'Doe',
          'jane@example.com'
        ])
      );

      // Second ticket
      expect(ticketInserts[1][0].args).toEqual(
        expect.arrayContaining([
          'John',
          'Smith',
          'john@example.com'
        ])
      );
    });

    it('should use correct ticket type from cart', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          tickets: expect.arrayContaining([
            expect.objectContaining({
              ticket_type: 'Weekend Pass'
            })
          ])
        })
      );
    });

    it('should use transaction INTEGER db ID, not transaction_id string', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      await handler(req, res);

      const ticketInserts = mockClient.execute.mock.calls.filter(call =>
        call[0].sql?.includes('INSERT INTO tickets')
      );

      // Transaction db ID (INTEGER from lastInsertRowid)
      expect(ticketInserts[0][0].args[1]).toBe(123);
      expect(typeof ticketInserts[0][0].args[1]).toBe('number');
    });

    it('should create one ticket per cart quantity', async () => {
      const req = createMockRequest({
        cartItems: [{ ticketTypeId: 1, quantity: 5, price_cents: 12500 }],
        registrations: Array.from({ length: 5 }, (_, i) => ({
          ticketTypeId: 1,
          firstName: `User${i + 1}`,
          lastName: 'Tester',
          email: `user${i + 1}@example.com`
        }))
      });
      const res = createMockResponse();

      await handler(req, res);

      const ticketInserts = mockClient.execute.mock.calls.filter(call =>
        call[0].sql?.includes('INSERT INTO tickets')
      );

      expect(ticketInserts).toHaveLength(5);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          tickets: expect.arrayContaining([
            expect.objectContaining({ ticket_id: expect.stringMatching(/^TKT-/) })
          ])
        })
      );
    });

    it('should fetch ticket type details from database', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      await handler(req, res);

      const ticketTypeFetch = mockClient.execute.mock.calls.find(call =>
        call[0].sql?.includes('SELECT') && call[0].sql?.includes('ticket_type')
      );

      expect(ticketTypeFetch).toBeDefined();
      expect(ticketTypeFetch[0].args).toContain(1);
    });

    it('should handle multiple ticket types in same cart', async () => {
      const req = createMockRequest({
        cartItems: [
          { ticketTypeId: 1, quantity: 1, price_cents: 12500 },
          { ticketTypeId: 2, quantity: 1, price_cents: 7500 }
        ],
        registrations: [
          { ticketTypeId: 1, firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' },
          { ticketTypeId: 2, firstName: 'John', lastName: 'Smith', email: 'john@example.com' }
        ]
      });
      const res = createMockResponse();

      // Mock both ticket types
      mockClient.execute
        .mockResolvedValueOnce({ rows: [] }) // No existing transaction
        .mockResolvedValueOnce({ rows: [{ count: 0 }] }) // Order number check
        .mockResolvedValueOnce({ lastInsertRowid: 123n }) // Transaction insert
        .mockResolvedValueOnce({
          rows: [
            MOCK_TICKET_TYPE,
            { ...MOCK_TICKET_TYPE, id: 2, ticket_type_name: 'Day Pass', price_cents: 7500 }
          ]
        })
        .mockResolvedValue({});

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          tickets: expect.arrayContaining([
            expect.objectContaining({ ticket_type: 'Weekend Pass' }),
            expect.objectContaining({ ticket_type: 'Day Pass' })
          ])
        })
      );
    });

    it('should include event details in ticket response', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          tickets: expect.arrayContaining([
            expect.objectContaining({
              event_name: 'A Lo Cubano Boulder Fest 2026'
            })
          ])
        })
      );
    });
  });

  // ============================================================================
  // E. IDEMPOTENCY TESTS
  // ============================================================================

  describe('Idempotency', () => {
    const EXISTING_TRANSACTION = {
      id: 999,
      transaction_id: 'existing-uuid',
      order_number: 'ALO-2026-9999',
      total_amount_cents: 25000,
      customer_email: 'customer@example.com',
      payment_status: 'pending',
      created_at: new Date().toISOString()
    };

    const EXISTING_TICKETS = [
      {
        ticket_id: 'TKT-existing-1',
        ticket_type: 'Weekend Pass',
        attendee_first_name: 'Jane',
        attendee_last_name: 'Doe',
        attendee_email: 'jane@example.com',
        registration_status: 'pending_payment'
      },
      {
        ticket_id: 'TKT-existing-2',
        ticket_type: 'Weekend Pass',
        attendee_first_name: 'John',
        attendee_last_name: 'Smith',
        attendee_email: 'john@example.com',
        registration_status: 'pending_payment'
      }
    ];

    it('should return existing transaction if cartFingerprint matches', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      // Mock existing transaction found
      mockClient.execute.mockResolvedValueOnce({
        rows: [{
          ...EXISTING_TRANSACTION,
          tickets_json: JSON.stringify(EXISTING_TICKETS)
        }]
      });

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          transaction: expect.objectContaining({
            id: 999,
            transaction_id: 'existing-uuid',
            order_number: 'ALO-2026-9999'
          }),
          existing: true
        })
      );
    });

    it('should not create duplicate transactions', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      mockClient.execute.mockResolvedValueOnce({
        rows: [{
          ...EXISTING_TRANSACTION,
          tickets_json: JSON.stringify(EXISTING_TICKETS)
        }]
      });

      await handler(req, res);

      // Should only have 1 database call (the idempotency check)
      expect(mockClient.execute).toHaveBeenCalledTimes(1);
    });

    it('should include existing flag in response', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      mockClient.execute.mockResolvedValueOnce({
        rows: [{
          ...EXISTING_TRANSACTION,
          tickets_json: JSON.stringify(EXISTING_TICKETS)
        }]
      });

      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          existing: true
        })
      );
    });

    it('should work within 1-hour window', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      mockClient.execute.mockResolvedValueOnce({
        rows: [{
          ...EXISTING_TRANSACTION,
          tickets_json: JSON.stringify(EXISTING_TICKETS)
        }]
      });

      await handler(req, res);

      const idempotencyCheck = mockClient.execute.mock.calls[0];
      expect(idempotencyCheck[0].sql).toContain("datetime('now', '-1 hour')");
    });

    it('should create new transaction if no cartFingerprint provided', async () => {
      const req = createMockRequest({ cartFingerprint: undefined });
      const res = createMockResponse();

      // When no cartFingerprint, findExistingTransaction returns early without DB call
      mockClient.execute
        .mockResolvedValueOnce({ rows: [{ count: 0 }] }) // Order number check (first call)
        .mockResolvedValueOnce({ lastInsertRowid: 123n }) // Transaction insert
        .mockResolvedValueOnce({ rows: [MOCK_TICKET_TYPE] }) // Ticket types
        .mockResolvedValue({}); // Ticket inserts

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.not.objectContaining({
          existing: true
        })
      );
    });

    it('should only match pending transactions', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      // Mock no matching pending transaction found
      mockClient.execute
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] }) // Order number check
        .mockResolvedValueOnce({ lastInsertRowid: 123n })
        .mockResolvedValueOnce({ rows: [MOCK_TICKET_TYPE] })
        .mockResolvedValue({});

      await handler(req, res);

      const idempotencyCheck = mockClient.execute.mock.calls[0];
      expect(idempotencyCheck[0].sql).toContain("payment_status = 'pending'");
    });
  });

  // ============================================================================
  // F. ERROR HANDLING TESTS
  // ============================================================================

  describe('Error Handling', () => {
    it('should return 400 for validation errors', async () => {
      const req = createMockRequest({ customerInfo: null });
      const res = createMockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 500 for database errors', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      mockClient.execute.mockRejectedValueOnce(new Error('Database connection failed'));

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Failed to create transaction',
          message: 'Database connection failed'
        })
      );
    });

    it('should provide descriptive error messages', async () => {
      const req = createMockRequest({
        cartItems: [{ ticketTypeId: 1, quantity: 2, price_cents: 12500 }],
        registrations: [VALID_REGISTRATIONS[0]] // Missing 1 registration
      });
      const res = createMockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Registration count mismatch',
          expected: 2,
          received: 1
        })
      );
    });

    it('should handle ticket type not found', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      mockClient.execute
        .mockResolvedValueOnce({ rows: [] }) // No existing transaction
        .mockResolvedValueOnce({ rows: [{ count: 0 }] }) // Order number check
        .mockResolvedValueOnce({ lastInsertRowid: 123n })
        .mockResolvedValueOnce({ rows: [] }); // Ticket type not found

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('not found or inactive')
        })
      );
    });

    it('should handle inactive ticket types', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      mockClient.execute
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] }) // Order number check
        .mockResolvedValueOnce({ lastInsertRowid: 123n })
        .mockResolvedValueOnce({
          rows: [] // Active ticket types query returns empty (filtered out inactive)
        });

      await handler(req, res);

      // Should not find active ticket type
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('should handle missing registration data error', async () => {
      const req = createMockRequest({
        cartItems: [{ ticketTypeId: 1, quantity: 3, price_cents: 12500 }],
        registrations: VALID_REGISTRATIONS // Only 2 registrations
      });
      const res = createMockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Registration count mismatch'
        })
      );
    });

    it('should handle database transaction rollback on error', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      mockClient.execute
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ lastInsertRowid: 123n })
        .mockResolvedValueOnce({ rows: [MOCK_TICKET_TYPE] })
        .mockRejectedValueOnce(new Error('Ticket insert failed'));

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
