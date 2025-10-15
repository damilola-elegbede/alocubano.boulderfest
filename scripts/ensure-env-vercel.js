#!/usr/bin/env node

/**
 * Ensure .env.vercel File Exists for Local Testing
 *
 * This script checks if .env.vercel exists and pulls it from Vercel if missing.
 * All environment variables are managed in Vercel Dashboard as the single source of truth.
 *
 * Usage: Run before any test command to ensure environment variables are available.
 */

import { existsSync } from 'fs';
import { execSync } from 'child_process';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ENV_VERCEL_PATH = resolve(__dirname, '..', '.env.vercel');

console.log('🔍 Checking for .env.vercel file...');

if (!existsSync(ENV_VERCEL_PATH)) {
  console.log('❌ .env.vercel not found');
  console.log('📥 Pulling environment variables from Vercel Dashboard...');
  console.log('');

  try {
    // Run vercel env pull to get environment variables from Vercel Dashboard
    execSync('vercel env pull .env.vercel', {
      stdio: 'inherit',
      cwd: resolve(__dirname, '..')
    });

    console.log('');
    console.log('✅ Successfully pulled .env.vercel from Vercel Dashboard');
  } catch (error) {
    console.error('');
    console.error('❌ Failed to pull environment variables from Vercel');
    console.error('');
    console.error('Please ensure:');
    console.error('  1. Vercel CLI is installed: npm install -g vercel');
    console.error('  2. You are logged in: vercel login');
    console.error('  3. Project is linked: vercel link');
    console.error('');
    console.error('Or manually create .env.vercel with required environment variables.');
    process.exit(1);
  }
} else {
  console.log('✅ .env.vercel found');
}

// Load .env.vercel into process.env for the current process
try {
  const dotenv = await import('dotenv');
  const result = dotenv.config({ path: ENV_VERCEL_PATH });

  if (result.error) {
    console.warn('⚠️ Warning: Could not load .env.vercel:', result.error.message);
  } else {
    console.log('✅ Environment variables loaded from .env.vercel');
    console.log('');
  }
} catch (error) {
  console.warn('⚠️ Warning: Could not load dotenv:', error.message);
  console.log('');
}
