import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { glob } from 'glob';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CSS files that should be replaced with bundles
const CRITICAL_CSS = ['base.css', 'typography.css', 'navigation.css', 'components.css'];
const DEFERRED_CSS = [
  'floating-cart.css',
  'floating-cart-dark.css',
  'header-cart.css',
  'mobile-overrides.css',
  'mobile-enhancements.css',
  'theme-toggle.css',
  'forms.css',
  'newsletter.css',
  'flip-cards.css',
  'virtual-gallery.css'
];
const ADMIN_CSS = ['admin-overrides.css', 'admin-auth-guard.css', 'admin.css', 'admin-dashboard.css'];

// Files to skip (templates, generated files, etc.)
const SKIP_FILES = [
  '.tmp/',
  'node_modules/',
  'public/generated/',
  'public/wallet/',
  'coverage/'
];

/**
 * Determine if a file should be skipped
 */
function shouldSkip(filePath) {
  return SKIP_FILES.some(skip => filePath.includes(skip));
}

/**
 * Determine if HTML file is an admin page
 */
function isAdminPage(content, filePath) {
  return filePath.includes('/admin/') ||
         filePath.includes('pages/admin.html') ||
         content.includes('admin-overrides.css') ||
         content.includes('Admin Portal') ||
         content.includes('Admin Login');
}

/**
 * Extract CSS link section from HTML
 */
function extractCSSSection(content) {
  const cssRegex = /(<link[^>]*rel=["']stylesheet["'][^>]*>[\s\n]*)+/g;
  const matches = content.match(cssRegex);
  return matches || [];
}

/**
 * Generate bundled CSS links
 */
function generateBundledCSS(isAdmin) {
  const lines = [];

  lines.push('    <!-- Critical CSS (render-blocking) -->');
  lines.push('    <link rel="stylesheet" href="/css/bundle-critical.css" />');
  lines.push('');

  if (isAdmin) {
    lines.push('    <!-- Admin CSS -->');
    lines.push('    <link rel="stylesheet" href="/css/bundle-admin.css" />');
    lines.push('');
  }

  lines.push('    <!-- Deferred CSS (lazy-loaded) -->');
  lines.push('    <link rel="stylesheet" href="/css/bundle-deferred.css" media="print" onload="this.media=\'all\'">');
  lines.push('    <noscript>');
  lines.push('      <link rel="stylesheet" href="/css/bundle-deferred.css">');
  lines.push('    </noscript>');

  return lines.join('\n');
}

/**
 * Check if file already uses bundled CSS
 */
function alreadyBundled(content) {
  return content.includes('bundle-critical.css') ||
         content.includes('bundle-deferred.css') ||
         content.includes('bundle-admin.css');
}

/**
 * Update HTML file with bundled CSS
 */
function updateHTMLFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Skip if already bundled
  if (alreadyBundled(content)) {
    return { updated: false, reason: 'already bundled' };
  }

  // Check if file has CSS links
  const hasCSS = content.includes('<link') && content.includes('stylesheet');
  if (!hasCSS) {
    return { updated: false, reason: 'no CSS links' };
  }

  // Determine if admin page
  const isAdmin = isAdminPage(content, filePath);

  // Find CSS link section
  const cssLinkPattern = /(\s*<link[^>]*rel=["']stylesheet["'][^>]*>[\s\n]*)+/g;

  // Count original CSS links
  const originalLinks = (content.match(/<link[^>]*rel=["']stylesheet["'][^>]*>/g) || []).length;

  // Replace CSS links with bundles
  let updated = false;
  let replacementCount = 0;
  content = content.replace(cssLinkPattern, (match) => {
    // Skip if this section already has bundles
    if (match.includes('bundle-')) {
      return match;
    }

    // Skip if it's just a single unrelated CSS file
    const hasRelevantCSS = CRITICAL_CSS.some(css => match.includes(css)) ||
                          DEFERRED_CSS.some(css => match.includes(css)) ||
                          (isAdmin && ADMIN_CSS.some(css => match.includes(css)));

    if (!hasRelevantCSS) {
      return match;
    }

    // Only replace once
    if (replacementCount > 0) {
      return ''; // Remove duplicate sections
    }

    replacementCount++;
    updated = true;
    return '\n' + generateBundledCSS(isAdmin) + '\n  ';
  });

  if (!updated) {
    return { updated: false, reason: 'no matching CSS' };
  }

  // Write updated file
  fs.writeFileSync(filePath, content);

  // Count new CSS links
  const newLinks = (content.match(/<link[^>]*rel=["']stylesheet["'][^>]*>/g) || []).length;

  return {
    updated: true,
    originalLinks,
    newLinks,
    reduction: originalLinks - newLinks,
    isAdmin
  };
}

// Main execution
async function main() {
  console.log('🔄 Updating HTML Files with CSS Bundles');
  console.log('========================================\n');

  // Find all HTML files
  const htmlFiles = await glob('**/*.html', {
    cwd: path.join(__dirname, '..'),
    absolute: true,
    ignore: ['node_modules/**', '.vercel/**', '.tmp/**', 'public/generated/**', 'public/wallet/**']
  });

  console.log(`Found ${htmlFiles.length} HTML files to process\n`);

  const results = {
    updated: [],
    skipped: [],
    errors: []
  };

  for (const file of htmlFiles) {
    const relativePath = path.relative(path.join(__dirname, '..'), file);

    try {
      const result = updateHTMLFile(file);

      if (result.updated) {
        results.updated.push({ path: relativePath, ...result });
        console.log(`✅ ${relativePath}`);
        console.log(`   Links: ${result.originalLinks} → ${result.newLinks} (${result.reduction > 0 ? '-' : ''}${Math.abs(result.reduction)} requests)`);
        console.log(`   Type: ${result.isAdmin ? 'Admin page' : 'Main site'}\n`);
      } else {
        results.skipped.push({ path: relativePath, reason: result.reason });
      }
    } catch (error) {
      results.errors.push({ path: relativePath, error: error.message });
      console.error(`❌ ${relativePath}: ${error.message}\n`);
    }
  }

  // Summary
  console.log('\n📊 Update Summary');
  console.log('=================');
  console.log(`Updated:  ${results.updated.length} files`);
  console.log(`Skipped:  ${results.skipped.length} files`);
  console.log(`Errors:   ${results.errors.length} files\n`);

  if (results.updated.length > 0) {
    const totalReduction = results.updated.reduce((sum, r) => sum + r.reduction, 0);
    const avgReduction = (totalReduction / results.updated.length).toFixed(1);
    console.log(`Total HTTP request reduction: ${totalReduction} requests`);
    console.log(`Average reduction per page: ${avgReduction} requests\n`);
  }

  if (results.errors.length > 0) {
    console.log('\n❌ Errors:');
    results.errors.forEach(({ path, error }) => {
      console.log(`   ${path}: ${error}`);
    });
  }

  console.log('\n✅ HTML update complete\n');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
