// Optional Vitest import pattern to prevent eager loading in re-exports
function _getVi(injectedVi) {
  return injectedVi ?? globalThis?.vi ?? undefined;
}

/**
 * Mock fetch with configurable responses
 */
export function mockFetch(responses = []) {
  let callIndex = 0;
  const vi = _getVi();
  if (!vi) {
    throw new Error("Vitest not available for mocking");
  }

  return vi.fn().mockImplementation(async (url, options) => {
    const response = responses[callIndex] || {
      ok: true,
      status: 200,
      data: {},
    };
    callIndex++;

    return {
      ok: response.ok !== false,
      status: response.status || 200,
      headers: new Headers(response.headers || {}),
      json: async () => response.data || {},
      text: async () => JSON.stringify(response.data || {}),
      blob: async () => new Blob([JSON.stringify(response.data || {})]),
    };
  });
}

/**
 * Mock Brevo email service
 */
export function mockBrevoService() {
  const vi = _getVi();
  if (!vi) {
    throw new Error("Vitest not available for mocking");
  }

  return {
    sendEmail: vi.fn().mockResolvedValue({
      messageId: `msg_${Date.now()}`,
    }),
    addContact: vi.fn().mockResolvedValue({
      id: `contact_${Date.now()}`,
    }),
    removeContact: vi.fn().mockResolvedValue({
      success: true,
    }),
    getContact: vi.fn().mockResolvedValue({
      email: "test@example.com",
      listIds: [1, 2],
    }),
    updateContact: vi.fn().mockResolvedValue({
      success: true,
    }),
  };
}

/**
 * Mock Stripe payment service
 */
export function mockStripeService() {
  const vi = _getVi();
  if (!vi) {
    throw new Error("Vitest not available for mocking");
  }

  return {
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue({
          id: `cs_test_${Date.now()}`,
          url: "https://checkout.stripe.com/test",
          payment_status: "unpaid",
        }),
        retrieve: vi.fn().mockResolvedValue({
          id: `cs_test_${Date.now()}`,
          payment_status: "paid",
          customer_email: "test@example.com",
        }),
      },
    },
    webhooks: {
      constructEvent: vi.fn().mockReturnValue({
        type: "checkout.session.completed",
        data: {
          object: {
            id: `cs_test_${Date.now()}`,
            payment_status: "paid",
          },
        },
      }),
    },
  };
}

// Removed duplicate mockDatabaseClient - using the comprehensive version below

/**
 * Helper to assert mock calls
 */
export function assertMockCalled(mock, expectedCalls) {
  expect(mock).toHaveBeenCalledTimes(expectedCalls.length);
  expectedCalls.forEach((expected, index) => {
    expect(mock).toHaveBeenNthCalledWith(index + 1, ...expected);
  });
}

/**
 * Reset all mocks with optional assertions
 */

/**
 * Creates a properly structured mock database service
 * Matches the production DatabaseService interface exactly
 */
export function createMockDatabaseService(client) {
  return {
    // Core initialization methods
    ensureInitialized: async () => client,
    getClient: async () => client,
    initializeClient: async () => client,
    
    // Connection management
    testConnection: async () => true,
    close: async () => {
      if (client && typeof client.close === 'function') {
        await client.close();
      }
    },
    
    // Query execution
    execute: async (sql, params) => {
      if (typeof sql === 'string') {
        return client.execute(sql, params);
      }
      return client.execute(sql);
    },
    
    // Batch operations
    batch: async (statements) => {
      if (client.batch) {
        return client.batch(statements);
      }
      // Fallback for simple implementations
      const results = [];
      for (const stmt of statements) {
        results.push(await client.execute(stmt));
      }
      return results;
    },
    
    // State properties
    initialized: true,
    client: client,
    initializationPromise: Promise.resolve(client),
    
    // Test helpers
    resetForTesting: async () => {
      if (client && typeof client.close === 'function') {
        await client.close();
      }
    },
    
    // Statistics
    getConnectionStats: () => ({
      activeConnections: 1,
      initialized: true,
      hasClient: true,
      hasInitPromise: true,
      timestamp: new Date().toISOString()
    }),
    
    // Health check
    healthCheck: async () => ({
      status: 'healthy',
      connectionStats: {
        activeConnections: 1,
        initialized: true,
        hasClient: true
      },
      timestamp: new Date().toISOString()
    })
  };
}

/**
 * Mock database client helper for tests that don't need a real database
 */
export function mockDatabaseClient(overrides = {}) {
  const defaults = {
    execute: vi.fn().mockResolvedValue({ 
      rows: [], 
      rowsAffected: 0,
      lastInsertRowid: 1
    }),
    batch: vi.fn().mockResolvedValue([]),
    close: vi.fn().mockResolvedValue(undefined),
    testConnection: vi.fn().mockResolvedValue(true)
  };
  
  const client = { ...defaults, ...overrides };
  
  // Add convenience methods
  client.mockReset = () => {
    Object.values(client).forEach(fn => {
      if (fn && typeof fn.mockReset === 'function') {
        fn.mockReset();
      }
    });
  };
  
  return client;
}

export function resetMocks(mocks = {}, assertions = {}) {
  Object.entries(assertions).forEach(([key, expected]) => {
    if (mocks[key] && expected) {
      expect(mocks[key]).toHaveBeenCalledTimes(expected);
    }
  });

  const vi = _getVi();
  if (vi) {
    vi.clearAllMocks();
  }
}
