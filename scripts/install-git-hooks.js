#!/usr/bin/env node

/**
 * Automatic Git Hooks Installation Script
 *
 * Installs pre-commit and pre-push hooks to .git/hooks/ directory.
 * Runs automatically after npm install via postinstall hook.
 *
 * Hooks enforce code quality standards:
 * - Pre-commit: Linting (ESLint, HTMLHint, Markdown), package drift detection, sensitive data check
 * - Pre-push: Quick lint verification, configuration validation, structure check
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Hook file paths
const HOOKS_DIR = path.join(__dirname, '..', '.git', 'hooks');
const PRE_COMMIT_SOURCE = path.join(__dirname, 'git-hooks', 'pre-commit');
const PRE_PUSH_SOURCE = path.join(__dirname, 'git-hooks', 'pre-push');
const PRE_COMMIT_DEST = path.join(HOOKS_DIR, 'pre-commit');
const PRE_PUSH_DEST = path.join(HOOKS_DIR, 'pre-push');

/**
 * Install a git hook by copying it to .git/hooks/ and making it executable
 */
function installHook(sourcePath, destPath, hookName) {
  try {
    // Check if source hook exists
    if (!fs.existsSync(sourcePath)) {
      console.warn(`⚠️  ${hookName} hook source not found at: ${sourcePath}`);
      return false;
    }

    // Copy hook file
    fs.copyFileSync(sourcePath, destPath);

    // Make executable (chmod +x)
    fs.chmodSync(destPath, '755');

    console.log(`✅ Installed ${hookName} hook`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to install ${hookName} hook:`, error.message);
    return false;
  }
}

/**
 * Main installation function
 */
function installGitHooks() {
  console.log('\n🔧 Installing Git Hooks...\n');

  // Check if .git directory exists (might not in CI or non-git environments)
  if (!fs.existsSync(HOOKS_DIR)) {
    console.log('⏭️  Skipping git hooks installation (not a git repository or .git/hooks/ missing)\n');
    return;
  }

  // Install pre-commit hook
  const preCommitInstalled = installHook(PRE_COMMIT_SOURCE, PRE_COMMIT_DEST, 'pre-commit');

  // Install pre-push hook
  const prePushInstalled = installHook(PRE_PUSH_SOURCE, PRE_PUSH_DEST, 'pre-push');

  if (preCommitInstalled && prePushInstalled) {
    console.log('\n✨ Git hooks installed successfully!');
    console.log('   Quality gates will run automatically on commit and push.\n');
  } else {
    console.log('\n⚠️  Some hooks failed to install. Code quality checks may not run automatically.\n');
  }
}

// Run installation
installGitHooks();
