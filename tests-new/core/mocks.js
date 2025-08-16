/**
 * Core mocks for A Lo Cubano Boulder Fest testing
 * Simple, direct mocks for critical payment and email paths
 */

export function mockStripeWebhook() {
  return {
    id: 'evt_test_webhook',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_session123',
        payment_status: 'paid',
        customer_details: {
          email: 'dancer@example.com',
          name: 'Maria Rodriguez'
        },
        metadata: {
          eventType: 'full-pass',
          quantity: '2'
        },
        amount_total: 5000,
        currency: 'usd'
      }
    },
    created: Math.floor(Date.now() / 1000)
  };
}

export function mockBrevoEmail() {
  return {
    to: 'maria.rodriguez@example.com',
    templateId: 1,
    params: {
      name: 'Maria',
      eventName: 'A Lo Cubano Boulder Fest 2026',
      eventDate: 'May 15-17, 2026'
    },
    tags: ['festival', 'confirmation']
  };
}

export function mockRequest(overrides = {}) {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
    ...overrides
  };
}

export function mockResponse() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    end: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis()
  };
  return res;
}

export function mockStripeCheckoutSession() {
  return {
    id: 'cs_test_session123',
    url: 'https://checkout.stripe.com/pay/cs_test_session123',
    payment_status: 'unpaid',
    customer_details: null,
    metadata: {
      eventType: 'full-pass',
      quantity: '1'
    },
    amount_total: 14000,
    currency: 'usd',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    created: Math.floor(Date.now() / 1000)
  };
}

export function mockDatabaseClient() {
  return {
    execute: jest.fn().mockResolvedValue({
      rows: [],
      meta: { duration: 0.1 }
    }),
    close: jest.fn().mockResolvedValue(),
    batch: jest.fn().mockResolvedValue([])
  };
}

export function mockTicketData() {
  return {
    ticketId: 'TCK-1234567890',
    id: 'tick_festival2026_001',
    email: 'dancer@example.com',
    name: 'Maria Rodriguez',
    eventName: 'A Lo Cubano Boulder Fest 2026',
    eventType: 'full-pass',
    quantity: 1,
    qrCode: 'QR123FESTIVAL2026',
    purchaseDate: new Date().toISOString(),
    eventDate: '2026-05-15',
    venue: 'Avalon Ballroom, Boulder, CO',
    price: 140.00
  };
}

export function mockAdminAuth() {
  return {
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbiIsImlhdCI6MTUxNjIzOTAyMn0.tbDepxpstvGdW8TC3G8zg4B6rUYAOvfzdceoH48wgRQ',
    isValid: true,
    expiresAt: Date.now() + 3600000,
    role: 'admin'
  };
}

// Quick setup helpers for common test scenarios
export const mockSetup = {
  paymentFlow: () => ({
    stripe: mockStripeCheckoutSession(),
    webhook: mockStripeWebhook(),
    ticket: mockTicketData()
  }),
  
  emailFlow: () => ({
    email: mockBrevoEmail(),
    req: mockRequest({ body: JSON.stringify({ email: 'dancer@example.com' }) }),
    res: mockResponse()
  }),
  
  adminFlow: () => ({
    auth: mockAdminAuth(),
    req: mockRequest({ 
      headers: { authorization: 'Bearer jwt_admin_token_123' } 
    }),
    res: mockResponse()
  })
};