// Test constants - no imports, no side effects
export const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  CONFLICT: 409,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
};

// Test utility functions that don't require setup
export function generateTestEmail() {
  return `test.${Date.now()}.${Math.random().toString(36).slice(2)}@example.com`;
}

export function generateTestId(prefix = 'test') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}