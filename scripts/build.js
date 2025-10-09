#!/usr/bin/env node

/**
 * Build Script - A Lo Cubano Boulder Fest
 *
 * Orchestrates the complete build process including:
 * - Documentation embedding
 * - Database migrations (Vercel only)
 * - Database bootstrapping
 * - Static ticket generation
 * - Gallery image syncing (Vercel only)
 * - Structure verification (local only)
 */

import { execSync } from 'child_process';

// Set default local database if not configured
if (!process.env.TURSO_DATABASE_URL && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:local.db';
}

const isVercel = process.env.VERCEL === '1';
const env = process.env.VERCEL_ENV || 'local';

console.log('');
console.log('🔨 Build Process');
console.log('================');
console.log('Environment:', env);
console.log('Platform:', isVercel ? 'Vercel' : 'Local');
console.log('');

try {
  // Step 1: Embed documentation
  console.log('📚 Embedding documentation...');
  const startTime = Date.now();
  execSync('node scripts/embed-docs.cjs', { stdio: 'inherit' });
  const embedTime = Date.now() - startTime;
  console.log(`📚 Documentation embedded (${embedTime}ms)`);
  console.log('');

  // Step 2: Run migrations (Vercel or local with database)
  if (isVercel) {
    console.log('🗄️  Running database migrations...');
    const migrateStart = Date.now();
    execSync('npm run migrate:vercel', { stdio: 'inherit' });
    const migrateTime = Date.now() - migrateStart;
    console.log(`✅ Migrations completed (${migrateTime}ms)`);
    console.log('');
  } else if (process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL) {
    // Run migrations locally if database is configured
    console.log('🗄️  Running database migrations...');
    const migrateStart = Date.now();
    execSync('npm run migrate:up', { stdio: 'inherit' });
    const migrateTime = Date.now() - migrateStart;
    console.log(`✅ Migrations completed (${migrateTime}ms)`);
    console.log('');
  }

  // Step 3: Bootstrap database
  console.log('📋 Bootstrapping database...');
  const bootstrapStart = Date.now();
  execSync('npm run bootstrap', { stdio: 'inherit' });
  const bootstrapTime = Date.now() - bootstrapStart;
  console.log(`✅ Database bootstrapped (${bootstrapTime}ms)`);
  console.log('');

  // Step 4: Generate static tickets
  console.log('🎫 Generating static tickets...');
  const ticketStart = Date.now();
  execSync('node scripts/generate-ticket-html.js', { stdio: 'inherit' });
  const ticketTime = Date.now() - ticketStart;
  console.log(`✅ Static tickets generated (${ticketTime}ms)`);

  // Step 5: Sync gallery (Vercel only)
  if (isVercel) {
    console.log('');
    console.log('🖼️  Syncing gallery images to Vercel Blob...');
    const syncStart = Date.now();
    try {
      execSync('npm run sync-gallery', { stdio: 'inherit' });
      const syncTime = Date.now() - syncStart;
      console.log(`✅ Gallery sync completed (${syncTime}ms)`);
    } catch (e) {
      console.log('⚠️  Gallery sync failed (non-blocking):', e.message);
      console.log('💡 Images will be synced via GitHub Actions workflow');
    }

    console.log('');
    console.log('🏗️  Vercel processing build outputs...');
    console.log('⏳ This may take 2-3 minutes for Vercel optimization');
    console.log('📦 Progress: Bundling serverless functions and static assets');
    console.log('🔧 Progress: Applying Vercel-specific optimizations');
    console.log('🚀 Progress: Preparing deployment package');
  } else {
    // Step 6: Verify structure (local only)
    console.log('');
    console.log('📋 Running structure verification...');
    execSync('npm run verify-structure', { stdio: 'inherit' });
  }

  console.log('');
  console.log('✅ Build script completed - Vercel will continue optimization');
  console.log('');
} catch (error) {
  console.error('');
  console.error('❌ Build failed:', error.message);
  console.error('');
  process.exit(1);
}
