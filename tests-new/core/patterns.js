/**
 * Reusable test patterns for common testing scenarios
 * Simple wrappers to make common test patterns easier to write
 */

/**
 * Wrap test with common setup/teardown
 */
export function testPattern(name, testFn, { setup, teardown } = {}) {
  return test(name, async () => {
    if (setup) await setup();
    try {
      await testFn();
    } finally {
      if (teardown) await teardown();
    }
  });
}

/**
 * Pattern for async tests with error handling
 */
export function asyncTest(name, asyncFn, options = {}) {
  const { timeout = 5000, expectError = false } = options;
  return test(name, async () => {
    if (expectError) {
      await expect(asyncFn()).rejects.toThrow();
    } else {
      await expect(asyncFn()).resolves.not.toThrow();
    }
  }, timeout);
}

/**
 * Run test with multiple parameter sets
 */
export function parameterizedTest(name, testFn, parameters) {
  parameters.forEach((params, index) => {
    const testName = Array.isArray(params) 
      ? `${name} [${index}]: ${JSON.stringify(params)}`
      : `${name} [${index}]: ${JSON.stringify(params)}`;
    
    test(testName, () => {
      if (Array.isArray(params)) {
        return testFn(...params);
      } else {
        return testFn(params);
      }
    });
  });
}

/**
 * Retry flaky operations
 */
export function testWithRetry(name, testFn, maxRetries = 3) {
  return test(name, async () => {
    let lastError;
    for (let i = 0; i <= maxRetries; i++) {
      try {
        await testFn();
        return;
      } catch (error) {
        lastError = error;
        if (i < maxRetries) await new Promise(r => setTimeout(r, 100));
      }
    }
    throw lastError;
  });
}

/**
 * Test with custom timeout
 */
export function testTimeout(name, testFn, timeout) {
  return test(name, testFn, timeout);
}

/**
 * Pattern for API endpoint tests
 */
export function testAPI(name, endpoint, options = {}) {
  const { method = 'GET', body, headers, expectedStatus = 200 } = options;
  return test(name, async () => {
    const response = await fetch(endpoint, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body ? JSON.stringify(body) : undefined
    });
    expect(response.status).toBe(expectedStatus);
    return response;
  });
}