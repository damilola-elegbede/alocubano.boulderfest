/**
 * Global Setup for Local E2E Testing
 * 
 * Simplified setup for local development and debugging
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '../..');

async function globalSetup() {
  console.log('🔧 Local E2E Global Setup');
  console.log('==========================');
  
  // Load test environment if not already loaded
  const testEnvPath = join(projectRoot, '.env.test');
  try {
    const dotenv = await import('dotenv');
    dotenv.config({ path: testEnvPath });
    console.log('✅ Test environment loaded from .env.test');
  } catch (error) {
    console.warn('⚠️ Could not load .env.test:', error.message);
  }
  
  // Validate basic environment
  const requiredVars = ['NODE_ENV', 'TEST_ADMIN_PASSWORD', 'ADMIN_SECRET'];
  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    console.log('❌ Missing required environment variables:', missing.join(', '));
    console.log('💡 Create .env.test file with required variables');
    throw new Error('Missing required environment variables for local E2E testing');
  }
  
  console.log('✅ Environment validation passed');
  console.log('✅ Local E2E setup completed');
  console.log('==========================');
}

export default globalSetup;