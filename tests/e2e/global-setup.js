/**
 * Vercel E2E global setup - minimal configuration
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

export default async function() {
  process.env.E2E_TEST_MODE = 'true';
  process.env.TEST_DATABASE_RESET_ALLOWED = 'true';
}