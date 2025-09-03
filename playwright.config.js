/**
 * DEPRECATED: Default Playwright Configuration
 * 
 * This file serves as the default entry point for Playwright commands.
 * Originally used Vercel Dev configuration - now DEPRECATED.
 * 
 * MIGRATION: E2E tests now use Vercel Preview Deployments instead of local dev servers.
 * This eliminates the need for complex local server configurations.
 * 
 * @deprecated Local Vercel dev configurations are deprecated for E2E testing
 * @see New E2E testing approach using Vercel Preview Deployments
 */

// Log available configurations for developers
if (!process.env.CI) {
  console.log('\n⚠️  DEPRECATED: Playwright Configuration (Legacy Vercel Dev Config)');
  console.log('MIGRATION NOTICE:');
  console.log('  • E2E tests now use Vercel Preview Deployments');
  console.log('  • Local server configurations are DEPRECATED');
  console.log('  • playwright-e2e-vercel-main.config.js is DEPRECATED');
  console.log('\nLegacy configurations (DEPRECATED):');
  console.log('  • playwright-e2e-vercel-main.config.js (DEPRECATED: Vercel dev + Turso)');
  console.log('  • playwright-e2e-ci.config.js (DEPRECATED: Vercel dev optimized for CI)');
  console.log('  • playwright-e2e-vercel.config.js (DEPRECATED: Alternative Vercel config)');
  console.log('\nREPLACEMENT: Use Vercel Preview Deployments for E2E testing\n');
}

// Export the Vercel main configuration as primary
export { default } from './playwright-e2e-vercel-main.config.js';
