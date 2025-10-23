import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { glob } from 'glob';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Fix duplicate CSS bundle references in HTML files
 */
function fixDuplicates(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;

  // Pattern to match the CSS bundle section
  const bundlePattern = /(\s*<!-- Critical CSS \(render-blocking\) -->[\s\S]*?<\/noscript>\s*)/g;

  const matches = content.match(bundlePattern);
  if (!matches || matches.length <= 1) {
    return { fixed: false, reason: 'no duplicates' };
  }

  // Keep only the first occurrence, remove all others
  let count = 0;
  content = content.replace(bundlePattern, (match) => {
    count++;
    return count === 1 ? match : '';
  });

  // Remove duplicate Theme styles comments that might be left behind
  content = content.replace(/\s*<!-- Theme styles -->\s*/g, '');

  // Clean up multiple blank lines
  content = content.replace(/\n{3,}/g, '\n\n');

  if (content === originalContent) {
    return { fixed: false, reason: 'no changes needed' };
  }

  fs.writeFileSync(filePath, content);
  return { fixed: true, duplicatesRemoved: matches.length - 1 };
}

// Main execution
async function main() {
  console.log('🔧 Fixing CSS Bundle Duplicates');
  console.log('================================\n');

  // Find all HTML files
  const htmlFiles = await glob('pages/**/*.html', {
    cwd: path.join(__dirname, '..'),
    absolute: true
  });

  console.log(`Found ${htmlFiles.length} HTML files to check\n`);

  const results = {
    fixed: [],
    skipped: [],
    errors: []
  };

  for (const file of htmlFiles) {
    const relativePath = path.relative(path.join(__dirname, '..'), file);

    try {
      const result = fixDuplicates(file);

      if (result.fixed) {
        results.fixed.push({ path: relativePath, ...result });
        console.log(`✅ ${relativePath} - Removed ${result.duplicatesRemoved} duplicate(s)`);
      } else {
        results.skipped.push({ path: relativePath, reason: result.reason });
      }
    } catch (error) {
      results.errors.push({ path: relativePath, error: error.message });
      console.error(`❌ ${relativePath}: ${error.message}`);
    }
  }

  // Summary
  console.log('\n📊 Fix Summary');
  console.log('==============');
  console.log(`Fixed:   ${results.fixed.length} files`);
  console.log(`Skipped: ${results.skipped.length} files`);
  console.log(`Errors:  ${results.errors.length} files\n`);

  if (results.fixed.length > 0) {
    const totalDuplicates = results.fixed.reduce((sum, r) => sum + r.duplicatesRemoved, 0);
    console.log(`Total duplicates removed: ${totalDuplicates}\n`);
  }

  console.log('✅ Duplicate fix complete\n');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
