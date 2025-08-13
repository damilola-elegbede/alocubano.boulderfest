import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the database module
vi.mock("../../api/lib/database.js", () => ({
  getDatabase: vi.fn(),
}));

describe("Transaction Service Performance Optimizations", () => {
  let mockDb;
  let TransactionService;

  beforeEach(async () => {
    vi.resetAllMocks();
    vi.resetModules();

    // Setup mock database
    mockDb = {
      execute: vi.fn(),
    };

    // Mock the getDatabase function
    const { getDatabase } = await import("../../api/lib/database.js");
    vi.mocked(getDatabase).mockReturnValue(mockDb);

    // Import TransactionService after mocks are set up
    const module = await import("../../api/lib/transaction-service.js");
    TransactionService = module.TransactionService;
  });

  it.skip("should use BEGIN IMMEDIATE for transaction locking", async () => {
    // Setup mocks for successful transaction - exact sequence verification
    mockDb.execute
      .mockResolvedValueOnce() // BEGIN IMMEDIATE
      .mockResolvedValueOnce({ insertId: 1 }) // INSERT transaction
      .mockResolvedValueOnce({ rows: [{ id: 1, uuid: "test-uuid" }] }) // SELECT transaction
      .mockResolvedValueOnce(); // COMMIT

    const transactionService = new TransactionService();

    // Mock the getByUUID method to return a transaction
    vi.spyOn(transactionService, "getByUUID").mockResolvedValue({
      id: 1,
      uuid: "test-uuid",
      status: "paid",
    });

    // Mock the createTransactionItems method
    vi.spyOn(transactionService, "createTransactionItems").mockResolvedValue();

    // Mock a minimal Stripe session
    const mockSession = {
      id: "cs_test_123",
      amount_total: 5000,
      currency: "usd",
      customer_details: {
        email: "test@example.com",
        name: "Test User",
      },
      line_items: {
        data: [
          {
            description: "Test Ticket",
            quantity: 1,
            amount_total: 5000,
            price: {
              unit_amount: 5000,
            },
          },
        ],
      },
      metadata: {},
      mode: "payment",
      payment_status: "paid",
    };

    // Call createFromStripeSession
    await transactionService.createFromStripeSession(mockSession);

    // Verify exact transaction sequence: BEGIN IMMEDIATE → INSERT → COMMIT
    expect(mockDb.execute).toHaveBeenNthCalledWith(1, "BEGIN IMMEDIATE");
    expect(mockDb.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        sql: expect.stringContaining("INSERT INTO transactions"),
      }),
    );
    expect(mockDb.execute).toHaveBeenCalledWith("COMMIT");
    expect(mockDb.execute).not.toHaveBeenCalledWith("BEGIN");
    expect(mockDb.execute).not.toHaveBeenCalledWith("ROLLBACK");

    // Verify createTransactionItems was called with correct parameters
    expect(transactionService.createTransactionItems).toHaveBeenCalledWith(
      1, // transaction ID from insertId
      mockSession, // session object, not line items array
    );
  });

  it.skip("should rollback transaction on error with BEGIN IMMEDIATE", async () => {
    // Setup mocks - BEGIN IMMEDIATE succeeds, then INSERT fails
    mockDb.execute
      .mockResolvedValueOnce() // BEGIN IMMEDIATE
      .mockRejectedValueOnce(new Error("Insert failed")) // INSERT fails
      .mockResolvedValueOnce(); // ROLLBACK

    const transactionService = new TransactionService();

    const mockSession = {
      id: "cs_test_123",
      amount_total: 5000,
      currency: "usd",
      customer_details: {
        email: "test@example.com",
        name: "Test User",
      },
      line_items: { data: [] },
      metadata: {},
      mode: "payment",
      payment_status: "paid",
    };

    // Call should fail and rollback
    await expect(
      transactionService.createFromStripeSession(mockSession),
    ).rejects.toThrow("Insert failed");

    // Verify transaction sequence: BEGIN IMMEDIATE → failed operation → ROLLBACK
    expect(mockDb.execute).toHaveBeenNthCalledWith(1, "BEGIN IMMEDIATE");
    expect(mockDb.execute).toHaveBeenNthCalledWith(3, "ROLLBACK");
    expect(mockDb.execute).not.toHaveBeenCalledWith("COMMIT");
  });

  it("should handle concurrent transaction creation with write-lock", async () => {
    // This test verifies the structure supports concurrent transactions
    // BEGIN IMMEDIATE acquires write-lock immediately, preventing race conditions

    const transactionService = new TransactionService();

    // Mock successful transaction flow for both calls - remove unused mocks
    mockDb.execute
      .mockResolvedValueOnce() // BEGIN IMMEDIATE (transaction 1)
      .mockResolvedValueOnce({ insertId: 1 }) // INSERT (transaction 1)
      .mockResolvedValueOnce({ rows: [{ id: 1, uuid: "uuid1" }] }) // SELECT (transaction 1)
      .mockResolvedValueOnce() // COMMIT (transaction 1)
      .mockResolvedValueOnce() // BEGIN IMMEDIATE (transaction 2)
      .mockResolvedValueOnce({ insertId: 2 }) // INSERT (transaction 2)
      .mockResolvedValueOnce({ rows: [{ id: 2, uuid: "uuid2" }] }) // SELECT (transaction 2)
      .mockResolvedValueOnce(); // COMMIT (transaction 2)

    // Mock methods
    vi.spyOn(transactionService, "getByUUID")
      .mockResolvedValueOnce({ id: 1, uuid: "uuid1", status: "paid" })
      .mockResolvedValueOnce({ id: 2, uuid: "uuid2", status: "paid" });

    vi.spyOn(transactionService, "createTransactionItems").mockResolvedValue();

    const mockSession1 = {
      id: "cs_1",
      amount_total: 1000,
      currency: "usd",
      customer_details: { email: "user1@example.com" },
      line_items: { data: [] },
      metadata: {},
      mode: "payment",
      payment_status: "paid",
    };

    const mockSession2 = {
      id: "cs_2",
      amount_total: 2000,
      currency: "usd",
      customer_details: { email: "user2@example.com" },
      line_items: { data: [] },
      metadata: {},
      mode: "payment",
      payment_status: "paid",
    };

    // Start both transactions concurrently
    const promises = [
      transactionService.createFromStripeSession(mockSession1),
      transactionService.createFromStripeSession(mockSession2),
    ];

    // Both should complete successfully
    const results = await Promise.all(promises);

    expect(results).toHaveLength(2);
    expect(results[0]).toHaveProperty("id", 1);
    expect(results[1]).toHaveProperty("id", 2);

    // Both transactions should have started with BEGIN IMMEDIATE
    const beginCalls = mockDb.execute.mock.calls.filter(
      (call) => call[0] === "BEGIN IMMEDIATE",
    );
    expect(beginCalls).toHaveLength(2);
  });
});
