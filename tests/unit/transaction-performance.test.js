import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the database module
vi.mock('../../api/lib/database.js', () => ({
  getDatabase: vi.fn()
}));

describe('Transaction Service Performance Optimizations', () => {
  let mockDb;
  let TransactionService;

  beforeEach(async () => {
    vi.resetAllMocks();
    vi.resetModules();
    
    // Setup mock database
    mockDb = {
      execute: vi.fn()
    };
    
    // Mock the getDatabase function
    const { getDatabase } = await import('../../api/lib/database.js');
    vi.mocked(getDatabase).mockReturnValue(mockDb);
    
    // Import TransactionService after mocks are set up
    const module = await import('../../api/lib/transaction-service.js');
    TransactionService = module.TransactionService;
  });

  it('should use BEGIN IMMEDIATE for transaction locking', async () => {
    // Setup mocks for successful transaction
    mockDb.execute
      .mockResolvedValueOnce() // BEGIN IMMEDIATE
      .mockResolvedValueOnce({ insertId: 1 }) // INSERT transaction
      .mockResolvedValueOnce({ rows: [{ id: 1, uuid: 'test-uuid' }] }) // SELECT transaction
      .mockResolvedValueOnce() // COMMIT
      .mockResolvedValue(); // Any other calls
    
    const transactionService = new TransactionService();
    
    // Mock the getByUUID method to return a transaction
    vi.spyOn(transactionService, 'getByUUID').mockResolvedValue({
      id: 1,
      uuid: 'test-uuid',
      status: 'paid'
    });
    
    // Mock the createTransactionItems method
    vi.spyOn(transactionService, 'createTransactionItems').mockResolvedValue();
    
    // Mock a minimal Stripe session
    const mockSession = {
      id: 'cs_test_123',
      amount_total: 5000,
      currency: 'usd',
      customer_details: {
        email: 'test@example.com',
        name: 'Test User'
      },
      line_items: {
        data: [
          {
            description: 'Test Ticket',
            quantity: 1,
            amount_total: 5000,
            price: {
              unit_amount: 5000
            }
          }
        ]
      },
      metadata: {},
      mode: 'payment',
      payment_status: 'paid'
    };

    // Call createFromStripeSession
    await transactionService.createFromStripeSession(mockSession);

    // Verify BEGIN IMMEDIATE was called instead of just BEGIN
    expect(mockDb.execute).toHaveBeenCalledWith("BEGIN IMMEDIATE");
    expect(mockDb.execute).not.toHaveBeenCalledWith("BEGIN");
  });

  it('should rollback transaction on error with BEGIN IMMEDIATE', async () => {
    // Setup mocks - BEGIN IMMEDIATE succeeds, then INSERT fails
    mockDb.execute
      .mockResolvedValueOnce() // BEGIN IMMEDIATE
      .mockRejectedValueOnce(new Error('Insert failed')) // INSERT fails
      .mockResolvedValueOnce(); // ROLLBACK
    
    const transactionService = new TransactionService();
    
    const mockSession = {
      id: 'cs_test_123',
      amount_total: 5000,
      currency: 'usd',
      customer_details: {
        email: 'test@example.com',
        name: 'Test User'
      },
      line_items: { data: [] },
      metadata: {},
      mode: 'payment',
      payment_status: 'paid'
    };

    // Call should fail and rollback
    await expect(transactionService.createFromStripeSession(mockSession))
      .rejects.toThrow('Insert failed');

    // Verify transaction sequence: BEGIN IMMEDIATE -> failed operation -> ROLLBACK
    expect(mockDb.execute).toHaveBeenNthCalledWith(1, "BEGIN IMMEDIATE");
    expect(mockDb.execute).toHaveBeenCalledWith("ROLLBACK");
  });

  it('should handle concurrent transaction creation with write-lock', async () => {
    // This test verifies the structure supports concurrent transactions
    // BEGIN IMMEDIATE acquires write-lock immediately, preventing race conditions
    
    const transactionService = new TransactionService();
    
    // Mock successful transaction flow for both calls
    mockDb.execute
      .mockResolvedValue() // All database calls succeed
      .mockResolvedValue({ insertId: 1 })
      .mockResolvedValue({ rows: [{ id: 1, uuid: 'uuid1' }] })
      .mockResolvedValue()
      .mockResolvedValue()
      .mockResolvedValue({ insertId: 2 })
      .mockResolvedValue({ rows: [{ id: 2, uuid: 'uuid2' }] })
      .mockResolvedValue();
    
    // Mock methods
    vi.spyOn(transactionService, 'getByUUID')
      .mockResolvedValueOnce({ id: 1, uuid: 'uuid1', status: 'paid' })
      .mockResolvedValueOnce({ id: 2, uuid: 'uuid2', status: 'paid' });
    
    vi.spyOn(transactionService, 'createTransactionItems')
      .mockResolvedValue();
    
    const mockSession1 = {
      id: 'cs_1',
      amount_total: 1000,
      currency: 'usd',
      customer_details: { email: 'user1@example.com' },
      line_items: { data: [] },
      metadata: {},
      mode: 'payment',
      payment_status: 'paid'
    };
    
    const mockSession2 = {
      id: 'cs_2',
      amount_total: 2000,
      currency: 'usd',
      customer_details: { email: 'user2@example.com' },
      line_items: { data: [] },
      metadata: {},
      mode: 'payment',
      payment_status: 'paid'
    };

    // Start both transactions concurrently
    const promises = [
      transactionService.createFromStripeSession(mockSession1),
      transactionService.createFromStripeSession(mockSession2)
    ];

    // Both should complete successfully
    const results = await Promise.all(promises);
    
    expect(results).toHaveLength(2);
    expect(results[0]).toHaveProperty('id', 1);
    expect(results[1]).toHaveProperty('id', 2);
    
    // Both transactions should have started with BEGIN IMMEDIATE
    const beginCalls = mockDb.execute.mock.calls.filter(call => 
      call[0] === "BEGIN IMMEDIATE"
    );
    expect(beginCalls).toHaveLength(2);
  });
});