/**
 * E2E global setup for Vercel Dev environment
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

export default async function() {
  console.log('🧪 Setting up E2E environment for Vercel Dev');
  
  // Set E2E test mode
  process.env.E2E_TEST_MODE = 'true';
  
  // Use Turso database if available, otherwise fall back to local SQLite
  if (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) {
    console.log('🗄️ Using Turso database for E2E tests');
  } else {
    console.log('⚠️  Turso not configured, falling back to local SQLite');
    process.env.DATABASE_URL = 'file:./data/e2e-test.db';
  }
  
  console.log('✅ E2E environment setup complete');
}