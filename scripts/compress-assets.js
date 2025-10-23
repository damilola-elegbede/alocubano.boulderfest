#!/usr/bin/env node

/**
 * Asset Compression Script
 * Pre-compresses static assets (CSS bundles) to reduce deployment size
 * Creates .gz (gzip) and .br (brotli) versions for faster uploads to Vercel
 */

import { gzip, brotliCompress, constants } from 'zlib';
import { promisify } from 'util';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const gzipAsync = promisify(gzip);
const brotliAsync = promisify(brotliCompress);

/**
 * Compress static assets
 */
async function compressAssets() {
  const cssFiles = [
    'css/bundle-critical.css',
    'css/bundle-deferred.css',
    'css/bundle-admin.css'
  ];

  console.log('🗜️  Compressing static assets...');
  let compressed = 0;
  let skipped = 0;

  for (const file of cssFiles) {
    const filePath = path.join(rootDir, file);

    if (!existsSync(filePath)) {
      console.log(`  ⚠️  ${file} (not found, skipping)`);
      skipped++;
      continue;
    }

    try {
      const content = await fs.readFile(filePath);
      const originalSize = content.length;

      // Create gzip version
      const gzipped = await gzipAsync(content, { level: 9 });
      await fs.writeFile(`${filePath}.gz`, gzipped);

      // Create brotli version (better compression)
      const brotlied = await brotliAsync(content, {
        params: {
          [constants.BROTLI_PARAM_QUALITY]: 11 // Max quality
        }
      });
      await fs.writeFile(`${filePath}.br`, brotlied);

      const gzipSize = gzipped.length;
      const brotliSize = brotlied.length;
      const gzipSavings = ((1 - gzipSize / originalSize) * 100).toFixed(1);
      const brotliSavings = ((1 - brotliSize / originalSize) * 100).toFixed(1);

      console.log(`  ✅ ${file}`);
      console.log(`     Original: ${(originalSize / 1024).toFixed(2)} KB`);
      console.log(`     Gzip: ${(gzipSize / 1024).toFixed(2)} KB (${gzipSavings}% smaller)`);
      console.log(`     Brotli: ${(brotliSize / 1024).toFixed(2)} KB (${brotliSavings}% smaller)`);

      compressed++;
    } catch (error) {
      console.error(`  ❌ ${file} (error: ${error.message})`);
      skipped++;
    }
  }

  console.log('');
  console.log(`✅ Asset compression complete: ${compressed} compressed, ${skipped} skipped`);
}

// Run compression
compressAssets().catch((error) => {
  console.error('❌ Asset compression failed:', error);
  process.exit(1);
});
