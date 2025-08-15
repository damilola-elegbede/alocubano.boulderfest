/**
 * Mock Services for CI Environment
 *
 * Provides minimal implementations of services that may not be available in CI
 */

// Mock database client that doesn't require real database
export const mockDatabaseClient = {
  execute: async (query) => {
    console.log("[MOCK DB]", query);
    return { rows: [], meta: {} };
  },

  close: () => {
    console.log("[MOCK DB] Connection closed");
  },
};

// Mock Brevo service
export const mockBrevoService = {
  subscribe: async (email) => {
    console.log("[MOCK BREVO] Subscribe:", email);
    return { id: "mock-id", email, status: "subscribed" };
  },

  unsubscribe: async (email) => {
    console.log("[MOCK BREVO] Unsubscribe:", email);
    return { success: true };
  },
};

// Mock Stripe service
export const mockStripeService = {
  createCheckoutSession: async (params) => {
    console.log("[MOCK STRIPE] Create session:", params);
    return {
      id: "cs_mock_123",
      url: "https://checkout.stripe.com/mock",
      payment_status: "unpaid",
    };
  },
};

// Mock authentication service
export const mockAuthService = {
  verifyToken: async (token) => {
    console.log("[MOCK AUTH] Verify token:", token ? "provided" : "missing");
    return { valid: true, user: { id: "mock-user" } };
  },
};

// Simple health check that always returns healthy
export const mockHealthCheck = {
  status: "healthy",
  timestamp: new Date().toISOString(),
  environment: "ci-mock",
  services: {
    database: { status: "healthy", mock: true },
    brevo: { status: "healthy", mock: true },
    stripe: { status: "healthy", mock: true },
  },
};
