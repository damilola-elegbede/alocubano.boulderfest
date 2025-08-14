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
    throw new Error('Vitest not available for mocking');
  }
  
  return vi.fn().mockImplementation(async (url, options) => {
    const response = responses[callIndex] || { 
      ok: true, 
      status: 200,
      data: {} 
    };
    callIndex++;
    
    return {
      ok: response.ok !== false,
      status: response.status || 200,
      headers: new Headers(response.headers || {}),
      json: async () => response.data || {},
      text: async () => JSON.stringify(response.data || {}),
      blob: async () => new Blob([JSON.stringify(response.data || {})])
    };
  });
}

/**
 * Mock Brevo email service
 */
export function mockBrevoService() {
  const vi = _getVi();
  if (!vi) {
    throw new Error('Vitest not available for mocking');
  }
  
  return {
    sendEmail: vi.fn().mockResolvedValue({ 
      messageId: `msg_${Date.now()}` 
    }),
    addContact: vi.fn().mockResolvedValue({ 
      id: `contact_${Date.now()}` 
    }),
    removeContact: vi.fn().mockResolvedValue({ 
      success: true 
    }),
    getContact: vi.fn().mockResolvedValue({ 
      email: 'test@example.com',
      listIds: [1, 2] 
    }),
    updateContact: vi.fn().mockResolvedValue({ 
      success: true 
    })
  };
}

/**
 * Mock Stripe payment service
 */
export function mockStripeService() {
  const vi = _getVi();
  if (!vi) {
    throw new Error('Vitest not available for mocking');
  }
  
  return {
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue({
          id: `cs_test_${Date.now()}`,
          url: 'https://checkout.stripe.com/test',
          payment_status: 'unpaid'
        }),
        retrieve: vi.fn().mockResolvedValue({
          id: `cs_test_${Date.now()}`,
          payment_status: 'paid',
          customer_email: 'test@example.com'
        })
      }
    },
    webhooks: {
      constructEvent: vi.fn().mockReturnValue({
        type: 'checkout.session.completed',
        data: {
          object: {
            id: `cs_test_${Date.now()}`,
            payment_status: 'paid'
          }
        }
      })
    }
  };
}

/**
 * Mock database client
 */
export function mockDatabaseClient(responses = {}) {
  const vi = _getVi();
  if (!vi) {
    throw new Error('Vitest not available for mocking');
  }
  
  return {
    execute: vi.fn().mockImplementation(async (query) => {
      const key = query.trim().split(' ')[0].toUpperCase();
      return responses[key] || { rows: [], rowsAffected: 0 };
    }),
    close: vi.fn().mockResolvedValue(undefined),
    transaction: vi.fn().mockImplementation(async (fn) => {
      return fn({
        execute: vi.fn().mockResolvedValue({ rows: [], rowsAffected: 1 }),
        rollback: vi.fn()
      });
    })
  };
}

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