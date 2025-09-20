/**
 * E2E Test Database Configuration
 * Uses standard TURSO_DATABASE_URL and TURSO_AUTH_TOKEN
 */

export function getE2EDatabaseUrl() {
  // E2E tests use standard Turso environment variables
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!tursoUrl || !tursoUrl.startsWith('libsql://')) {
    throw new Error(
      '\n❌ E2E tests require a Turso database URL\n' +
      'Please set TURSO_DATABASE_URL=libsql://test-alocubano-[org].turso.io\n' +
      '\nE2E tests do NOT support SQLite - they must test against real Turso.'
    );
  }

  if (!authToken) {
    throw new Error(
      '\n❌ E2E tests require Turso authentication\n' +
      'Please set TURSO_AUTH_TOKEN=eyJ...\n'
    );
  }

  // Validate it's a test/staging database (safety check)
  const isTestDatabase =
    tursoUrl.includes('test-') ||
    tursoUrl.includes('staging-') ||
    tursoUrl.includes('e2e-') ||
    process.env.ALLOW_PROD_E2E === 'true'; // Escape hatch if needed

  if (!isTestDatabase) {
    throw new Error(
      '\n⚠️ E2E database URL might be production!\n' +
      `URL: ${tursoUrl}\n` +
      'E2E database URLs should contain "test-", "staging-", or "e2e-"\n' +
      'Set ALLOW_PROD_E2E=true to override (NOT recommended)'
    );
  }

  return {
    url: tursoUrl,
    authToken: authToken,
    environment: detectEnvironment(tursoUrl)
  };
}

function detectEnvironment(url) {
  if (url.includes('test-')) return 'test';
  if (url.includes('staging-')) return 'staging';
  if (url.includes('e2e-')) return 'e2e';
  if (url.includes('dev-')) return 'development';
  return 'unknown';
}

// Export for use in Playwright global setup
export async function setupE2EDatabase() {
  const config = getE2EDatabaseUrl();

  console.log(`
🔷 E2E Test Database Configuration
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Environment: ${config.environment}
  Database: ${config.url}
  Ready for E2E testing
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

  // Set environment variables for the API to use
  process.env.TURSO_DATABASE_URL = config.url;
  process.env.TURSO_AUTH_TOKEN = config.authToken;

  return config;
}