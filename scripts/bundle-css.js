import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CSS file groups - organized by loading priority
const CSS_FILES = {
  // Critical CSS (render-blocking): Base styles loaded first
  critical: [
    'css/base.css',
    'css/typography.css',
    'css/navigation.css',
    'css/components.css'
  ],

  // Deferred CSS (lazy-loaded): Non-critical enhancements
  deferred: [
    'css/floating-cart.css',
    'css/floating-cart-dark.css',
    'css/header-cart.css',
    'css/mobile-overrides.css',
    'css/mobile-enhancements.css',
    'css/theme-toggle.css',
    'css/forms.css',
    'css/newsletter.css',
    'css/flip-cards.css',
    'css/virtual-gallery.css'
  ],

  // Admin CSS (admin pages only)
  admin: [
    'css/admin-overrides.css',
    'css/admin-auth-guard.css',
    'css/admin.css',
    'css/admin-dashboard.css'
  ]
};

/**
 * Bundle CSS files into a single output file
 * @param {string[]} files - Array of CSS file paths to bundle
 * @param {string} outputPath - Output bundle file path
 */
function bundleCSS(files, outputPath) {
  console.log(`\nBundling CSS: ${outputPath}`);

  const bundled = files.map(file => {
    const fullPath = path.join(__dirname, '..', file);

    // Check if file exists
    if (!fs.existsSync(fullPath)) {
      console.warn(`  ⚠️  Warning: ${file} not found, skipping...`);
      return '';
    }

    console.log(`  ✓ ${file}`);
    const content = fs.readFileSync(fullPath, 'utf8');

    // Add file marker comment and content
    return `/* ========================================
 * ${file}
 * ======================================== */\n\n${content}`;
  }).filter(Boolean).join('\n\n');

  // Create output directory if it doesn't exist
  const outputFullPath = path.join(__dirname, '..', outputPath);
  const outputDir = path.dirname(outputFullPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write bundled CSS
  fs.writeFileSync(outputFullPath, bundled);

  const sizeKB = (bundled.length / 1024).toFixed(2);
  const fileCount = files.length;
  console.log(`  ✅ Created ${outputPath} (${sizeKB} KB from ${fileCount} files)\n`);

  return {
    path: outputPath,
    size: bundled.length,
    fileCount
  };
}

// Main execution
console.log('🎨 CSS Bundle Consolidation');
console.log('============================');

const results = {
  critical: bundleCSS(CSS_FILES.critical, 'css/bundle-critical.css'),
  deferred: bundleCSS(CSS_FILES.deferred, 'css/bundle-deferred.css'),
  admin: bundleCSS(CSS_FILES.admin, 'css/bundle-admin.css')
};

// Summary
console.log('\n📊 Bundle Summary');
console.log('=================');
const totalSize = Object.values(results).reduce((sum, r) => sum + r.size, 0);
const totalFiles = Object.values(results).reduce((sum, r) => sum + r.fileCount, 0);

Object.entries(results).forEach(([name, result]) => {
  const percentage = ((result.size / totalSize) * 100).toFixed(1);
  console.log(`${name.padEnd(12)}: ${(result.size / 1024).toFixed(2).padStart(8)} KB (${percentage}%) - ${result.fileCount} files`);
});

console.log(`${'Total'.padEnd(12)}: ${(totalSize / 1024).toFixed(2).padStart(8)} KB (100.0%) - ${totalFiles} files`);
console.log('\n✅ CSS bundling complete\n');

// Add .gitignore entry for bundles (they are generated files)
const gitignorePath = path.join(__dirname, '..', '.gitignore');
let gitignore = '';
if (fs.existsSync(gitignorePath)) {
  gitignore = fs.readFileSync(gitignorePath, 'utf8');
}

const bundlePatterns = [
  'css/bundle-critical.css',
  'css/bundle-deferred.css',
  'css/bundle-admin.css'
];

let updated = false;
bundlePatterns.forEach(pattern => {
  if (!gitignore.includes(pattern)) {
    gitignore += `\n# Generated CSS bundles\n${pattern}\n`;
    updated = true;
  }
});

if (updated) {
  fs.writeFileSync(gitignorePath, gitignore);
  console.log('✅ Updated .gitignore with bundle patterns\n');
}
