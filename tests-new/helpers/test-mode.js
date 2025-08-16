/**
 * Test Mode Detection Utilities
 * Helpers for determining test execution environment and mode
 */

/**
 * Check if running in CI environment
 */
export function isCI() {
  return process.env.CI === 'true';
}

/**
 * Check if using mock server mode
 */
export function isMockMode() {
  return isCI() && !process.env.VERCEL_TOKEN;
}

/**
 * Check if using real server mode
 */
export function isRealServerMode() {
  return !isCI() || Boolean(process.env.VERCEL_TOKEN);
}

/**
 * Skip test in CI if no real server available
 * Usage: skipInCI(it)('should test with real server', async () => {...})
 */
export function skipInCI(testFn) {
  if (isCI() && !process.env.VERCEL_TOKEN) {
    return testFn.skip;
  }
  return testFn;
}

/**
 * Only run test in CI environment
 * Usage: onlyInCI(it)('should test CI-specific behavior', async () => {...})
 */
export function onlyInCI(testFn) {
  if (!isCI()) {
    return testFn.skip;
  }
  return testFn;
}

/**
 * Describe block with mode indicator
 * Usage: describeWithMode('API Tests', () => {...})
 */
export function describeWithMode(name, fn) {
  const mode = isMockMode() ? '[MOCK]' : '[REAL]';
  describe(`${name} ${mode}`, fn);
}

/**
 * Get current test mode as string
 */
export function getTestMode() {
  if (isMockMode()) {
    return 'mock';
  } else if (isCI()) {
    return 'ci-real';
  } else {
    return 'local';
  }
}

/**
 * Log test mode information
 */
export function logTestMode() {
  const mode = getTestMode();
  const modeEmoji = {
    'mock': '🎭',
    'ci-real': '🔧',
    'local': '💻'
  };
  
  console.log(`${modeEmoji[mode]} Test Mode: ${mode.toUpperCase()}`);
  
  if (mode === 'mock') {
    console.log('   Using mock server responses');
    console.log('   To use real server, add VERCEL_TOKEN to GitHub secrets');
  } else if (mode === 'ci-real') {
    console.log('   Using real Vercel server in CI');
  } else {
    console.log('   Using local development server');
  }
}