process.env.NODE_ENV = 'test';
const CI_PORT = process.env.CI_PORT || process.env.PORT || '3000';
if (!process.env.TEST_BASE_URL) {
  process.env.TEST_BASE_URL = `http://localhost:${CI_PORT}`;
}

if (!globalThis.fetch) {
  try {
    const { default: fetch } = await import('node-fetch');
    globalThis.fetch = fetch;
  } catch (error) {
    console.warn('⚠️ Could not import node-fetch for global fetch polyfill');
  }
}

console.log('🧪 Test setup complete - environment configured for API contract testing');