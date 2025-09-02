/**
 * Default Playwright Configuration
 * 
 * This file serves as the default entry point for Playwright commands.
 * Uses Vercel Dev configuration for maximum compatibility with serverless functions.
 */

// Log available configurations for developers
if (!process.env.CI) {
  console.log('\n🎯 Playwright Configuration (Default: Vercel Dev Config)');
  console.log('Available configurations:');
  console.log('  • playwright-e2e-vercel-main.config.js (Primary: Vercel dev + Turso)');
  console.log('  • playwright-e2e-ci.config.js (Vercel dev optimized for CI)');
  console.log('  • playwright-e2e-vercel.config.js (Alternative Vercel config)');
  console.log('\nRecommended usage:');
  console.log('  npm run test:e2e (uses primary Vercel config)');
  console.log('  npm run test:e2e:vercel (explicit Vercel config)\n');
}

// Export the Vercel main configuration as primary
export { default } from './playwright-e2e-vercel-main.config.js';
