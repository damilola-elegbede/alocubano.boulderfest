#!/usr/bin/env node

/**
 * Vite Asset Injection Script
 *
 * Reads dist/.vite/manifest.json and injects hashed asset references into HTML files.
 *
 * Features:
 * - Creates .bak backup files before modification
 * - Replaces <!-- VITE_ASSETS_INJECTION_POINT --> placeholder
 * - Updates existing injections for re-runs
 * - Comprehensive error handling and rollback
 *
 * Usage:
 *   node scripts/inject-vite-assets.js
 *   node scripts/inject-vite-assets.js --target pages/core/about.html
 *   node scripts/inject-vite-assets.js --rollback pages/core/about.html
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MANIFEST_PATH = path.resolve(__dirname, '../dist/.vite/manifest.json');

// Default target files - add more as pages are migrated
const DEFAULT_TARGET_FILES = [
    path.resolve(__dirname, '../pages/core/about.html'),
    // Add more files here as they're migrated:
    // path.resolve(__dirname, '../pages/core/tickets.html'),
    // path.resolve(__dirname, '../pages/core/donations.html'),
];

// ANSI colors for console output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
};

function log(emoji, message, color = colors.reset) {
    console.log(`${color}${emoji} ${message}${colors.reset}`);
}

/**
 * Parse command line arguments
 */
function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        rollback: false,
        target: null,
        help: false,
    };

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--rollback':
            case '-r':
                options.rollback = true;
                if (args[i + 1] && !args[i + 1].startsWith('--')) {
                    options.target = path.resolve(args[i + 1]);
                    i++;
                }
                break;
            case '--target':
            case '-t':
                if (args[i + 1]) {
                    options.target = path.resolve(args[i + 1]);
                    i++;
                }
                break;
            case '--help':
            case '-h':
                options.help = true;
                break;
        }
    }

    return options;
}

/**
 * Display help information
 */
function showHelp() {
    console.log(`
${colors.bright}Vite Asset Injection Script${colors.reset}

${colors.cyan}USAGE:${colors.reset}
  node scripts/inject-vite-assets.js [OPTIONS]

${colors.cyan}OPTIONS:${colors.reset}
  -t, --target <file>    Inject assets into specific HTML file
  -r, --rollback [file]  Rollback changes from .bak file (optionally specify file)
  -h, --help             Show this help message

${colors.cyan}EXAMPLES:${colors.reset}
  # Inject into all default target files
  node scripts/inject-vite-assets.js

  # Inject into specific file
  node scripts/inject-vite-assets.js --target pages/core/about.html

  # Rollback specific file
  node scripts/inject-vite-assets.js --rollback pages/core/about.html

  # Rollback all files
  node scripts/inject-vite-assets.js --rollback
`);
}

/**
 * Rollback a file from its .bak backup
 */
function rollbackFile(filePath) {
    const bakPath = `${filePath}.bak`;

    if (!fs.existsSync(bakPath)) {
        log('⚠️', `No backup found for: ${filePath}`, colors.yellow);
        return false;
    }

    try {
        fs.copyFileSync(bakPath, filePath);
        log('✅', `Rolled back: ${path.basename(filePath)}`, colors.green);
        return true;
    } catch (error) {
        log('❌', `Failed to rollback ${path.basename(filePath)}: ${error.message}`, colors.red);
        return false;
    }
}

/**
 * Rollback all files in the target list
 */
function rollbackAll(targetFiles) {
    console.log('');
    log('🔄', 'Rolling back asset injections...', colors.cyan);
    console.log('');

    let successCount = 0;
    let failCount = 0;

    targetFiles.forEach(filePath => {
        if (rollbackFile(filePath)) {
            successCount++;
        } else {
            failCount++;
        }
    });

    console.log('');
    log('📊', `Rollback complete: ${successCount} succeeded, ${failCount} failed`, colors.bright);
    console.log('');

    return failCount === 0;
}

/**
 * Inject assets into HTML files
 */
function injectAssets(targetFiles) {
    console.log('');
    log('🚀', 'Starting Vite asset injection...', colors.cyan);
    console.log('');

    // Step 1: Verify manifest exists
    if (!fs.existsSync(MANIFEST_PATH)) {
        log('❌', `Manifest not found: ${MANIFEST_PATH}`, colors.red);
        log('💡', 'Run `npm run build:vite` first to generate the manifest', colors.yellow);
        process.exit(1);
    }

    // Step 2: Parse manifest
    let manifest;
    try {
        const manifestContent = fs.readFileSync(MANIFEST_PATH, 'utf-8');
        manifest = JSON.parse(manifestContent);
    } catch (error) {
        log('❌', `Failed to parse manifest: ${error.message}`, colors.red);
        process.exit(1);
    }

    // Step 3: Find entry point assets
    const entryChunk = manifest['src/main.jsx'];
    if (!entryChunk) {
        log('❌', 'Entry point "src/main.jsx" not found in manifest', colors.red);
        log('💡', 'Check that vite.config.js has the correct input path', colors.yellow);
        process.exit(1);
    }

    const jsFile = entryChunk.file;
    const cssFile = entryChunk.css && entryChunk.css.length > 0 ? entryChunk.css[0] : null;

    log('📦', 'Found assets in manifest:', colors.green);
    log('  ', `JS:  /dist/${jsFile}`, colors.reset);
    if (cssFile) {
        log('  ', `CSS: /dist/${cssFile}`, colors.reset);
    } else {
        log('  ', 'CSS: (none)', colors.yellow);
    }
    console.log('');

    // Step 4: Process each target file
    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    targetFiles.forEach(filePath => {
        const fileName = path.basename(filePath);

        if (!fs.existsSync(filePath)) {
            log('⚠️', `File not found: ${fileName}`, colors.yellow);
            skipCount++;
            return;
        }

        try {
            log('💉', `Processing: ${fileName}`, colors.cyan);

            // Create .bak backup if it doesn't exist
            const bakPath = `${filePath}.bak`;
            if (!fs.existsSync(bakPath)) {
                fs.copyFileSync(filePath, bakPath);
                log('  ', `✓ Created backup: ${fileName}.bak`, colors.green);
            } else {
                log('  ', `✓ Backup exists: ${fileName}.bak`, colors.yellow);
            }

            // Read HTML content
            let content = fs.readFileSync(filePath, 'utf-8');

            // Construct injection tags
            const cssTag = cssFile ? `    <link rel="stylesheet" href="/dist/${cssFile}">` : '';
            const jsTag = `    <script type="module" src="/dist/${jsFile}"></script>`;
            const injection = `<!-- INJECTED VITE ASSETS -->
${cssTag}
${jsTag}
    <!-- END INJECTED VITE ASSETS -->`;

            // Check for placeholder or existing injection
            const placeholderRegex = /<!-- VITE_ASSETS_INJECTION_POINT -->/;
            const existingRegex = /<!-- INJECTED VITE ASSETS -->[\s\S]*?<!-- END INJECTED VITE ASSETS -->/;

            if (existingRegex.test(content)) {
                // Update existing injection (for re-runs)
                content = content.replace(existingRegex, injection);
                log('  ', '✓ Updated existing injection', colors.green);
            } else if (placeholderRegex.test(content)) {
                // Replace placeholder
                content = content.replace(placeholderRegex, injection);
                log('  ', '✓ Replaced placeholder', colors.green);
            } else {
                // No placeholder found
                log('  ', '⚠️ No placeholder or existing injection found - skipping', colors.yellow);
                log('  ', '💡 Add <!-- VITE_ASSETS_INJECTION_POINT --> to the HTML <head>', colors.yellow);
                skipCount++;
                return;
            }

            // Write updated content
            fs.writeFileSync(filePath, content, 'utf-8');
            log('  ', `✓ Successfully injected assets`, colors.green);
            successCount++;

        } catch (error) {
            log('  ', `✗ Error: ${error.message}`, colors.red);
            errorCount++;
        }

        console.log('');
    });

    // Step 5: Summary
    log('📊', 'Injection complete:', colors.bright);
    log('  ', `✅ Success: ${successCount}`, colors.green);
    if (skipCount > 0) {
        log('  ', `⚠️  Skipped: ${skipCount}`, colors.yellow);
    }
    if (errorCount > 0) {
        log('  ', `❌ Errors:  ${errorCount}`, colors.red);
    }
    console.log('');

    if (errorCount > 0) {
        log('💡', 'Tip: Use --rollback to restore from .bak files', colors.yellow);
        process.exit(1);
    }

    if (successCount === 0 && skipCount > 0) {
        log('⚠️', 'No files were processed successfully', colors.yellow);
        process.exit(1);
    }

    log('✅', 'Asset injection completed successfully!', colors.green);
    console.log('');
}

/**
 * Main execution
 */
function main() {
    const options = parseArgs();

    if (options.help) {
        showHelp();
        process.exit(0);
    }

    // Determine target files
    const targetFiles = options.target ? [options.target] : DEFAULT_TARGET_FILES;

    // Execute rollback or injection
    if (options.rollback) {
        const success = rollbackAll(targetFiles);
        process.exit(success ? 0 : 1);
    } else {
        injectAssets(targetFiles);
    }
}

// Run the script
main();
