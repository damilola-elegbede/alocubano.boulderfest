/**
 * CI E2E global setup - minimal configuration
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

export default async function() {
  process.env.E2E_TEST_MODE = 'true';
  process.env.DATABASE_URL = 'file:./data/e2e-test.db';
}