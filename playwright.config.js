/**
 * Default Playwright Configuration
 * 
 * This file serves as the default entry point for Playwright commands.
 * Always uses the CI configuration for maximum compatibility.
 */

// Log available configurations for developers
if (!process.env.CI) {
  console.log('\n🎯 Playwright Configuration (Default: CI Config)');
  console.log('Available configurations:');
  console.log('  • playwright-e2e-ci.config.js (CI optimized with SQLite)');
  console.log('  • playwright-e2e-vercel.config.js (Vercel dev server + Turso)');
  console.log('  • playwright-e2e-vercel-main.config.js (Vercel production)');
  console.log('\nRecommended usage:');
  console.log('  npm run test:e2e:ci');
  console.log('  npm run test:e2e:ngrok\n');
}

// Always export the CI configuration for maximum compatibility
export { default } from './playwright-e2e-ci.config.js';
