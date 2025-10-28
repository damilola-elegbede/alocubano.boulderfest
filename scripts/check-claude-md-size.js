#!/usr/bin/env node

/**
 * Quality Gate: Check CLAUDE.md file size
 *
 * Ensures CLAUDE.md stays under 40k characters to maintain readability
 * and avoid overwhelming Claude Code's context window.
 */

import { readFileSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MAX_SIZE = 40000; // 40k characters
const CLAUDE_MD_PATH = join(__dirname, '..', 'CLAUDE.md');

try {
  const stats = statSync(CLAUDE_MD_PATH);
  const content = readFileSync(CLAUDE_MD_PATH, 'utf8');
  const size = content.length;

  console.log('\n📊 CLAUDE.md Size Check\n');
  console.log(`File size: ${size.toLocaleString()} characters`);
  console.log(`Limit:     ${MAX_SIZE.toLocaleString()} characters`);
  console.log(`Status:    ${size <= MAX_SIZE ? '✅ PASS' : '❌ FAIL'}`);

  if (size > MAX_SIZE) {
    const excess = size - MAX_SIZE;
    const percentage = ((size / MAX_SIZE - 1) * 100).toFixed(1);
    console.log(`\n⚠️  Exceeds limit by ${excess.toLocaleString()} characters (${percentage}% over)`);
    console.log('\nRecommendations:');
    console.log('  - Remove redundant sections');
    console.log('  - Condense verbose examples');
    console.log('  - Move detailed docs to separate files');
    console.log('  - Reference external docs instead of duplicating content');
    process.exit(1);
  }

  const remaining = MAX_SIZE - size;
  const percentage = ((remaining / MAX_SIZE) * 100).toFixed(1);
  console.log(`\n✅ ${remaining.toLocaleString()} characters remaining (${percentage}% headroom)\n`);
  process.exit(0);

} catch (error) {
  console.error('❌ Error checking CLAUDE.md:', error.message);
  process.exit(1);
}
