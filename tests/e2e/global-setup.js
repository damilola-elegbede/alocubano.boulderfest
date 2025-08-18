/**
 * Playwright Global Setup - Minimal E2E Configuration
 * Part of streamlined test infrastructure (419 lines total)
 */

export default async function globalSetup() {
  // Minimal global setup for E2E tests
  console.log('🎭 Starting Playwright E2E tests setup...');
  
  // Environment validation
  if (!process.env.PLAYWRIGHT_BASE_URL) {
    console.log('📌 Using default base URL: http://localhost:3000');
  }
  
  // Simple health check with timeout
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
  
  try {
    // Basic connectivity test
    const fetch = (await import('node-fetch')).default;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(`${baseUrl}/api/health/check`, {
      signal: controller.signal
    });
    
    clearTimeout(timeout);
    
    if (response.ok) {
      console.log('✅ Server health check passed');
    } else {
      console.log('⚠️ Server health check failed, continuing with tests');
    }
  } catch (error) {
    console.log('⚠️ Server not responding, tests may fail:', error.message);
  }
  
  console.log('🚀 E2E setup complete');
}