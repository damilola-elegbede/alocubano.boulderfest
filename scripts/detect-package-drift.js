#!/usr/bin/env node

/**
 * MVP Package Drift Detection
 *
 * Detects common package.json/package-lock.json synchronization issues:
 * 1. Missing package-lock.json
 * 2. Outdated package-lock.json (package.json modified after)
 * 3. LibSQL version mismatches (specific to our recent issue)
 * 4. npm ci would fail scenarios
 */

import { readFileSync, existsSync, statSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

const COLORS = {
  RED: '\x1b[31m',
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m',
  RESET: '\x1b[0m'
};

function log(color, symbol, message) {
  console.log(`${color}${symbol} ${message}${COLORS.RESET}`);
}

function checkDrift() {
  const projectRoot = process.cwd();
  const packagePath = join(projectRoot, 'package.json');
  const lockPath = join(projectRoot, 'package-lock.json');

  let hasErrors = false;
  let hasWarnings = false;

  console.log('\n📊 Package Drift Detection v1.0.0');
  console.log('================================\n');

  // Check 1: package-lock.json exists
  if (!existsSync(lockPath)) {
    log(COLORS.RED, '❌', 'package-lock.json is missing!');
    log(COLORS.YELLOW, '💡', 'Run: npm install');
    return process.exit(1);
  }

  // Check 2: Modification time comparison
  const packageStat = statSync(packagePath);
  const lockStat = statSync(lockPath);

  if (packageStat.mtime > lockStat.mtime) {
    log(COLORS.YELLOW, '⚠️', 'package.json was modified after package-lock.json');
    log(COLORS.BLUE, '📝', `package.json: ${packageStat.mtime.toISOString()}`);
    log(COLORS.BLUE, '📝', `package-lock.json: ${lockStat.mtime.toISOString()}`);
    hasWarnings = true;
  }

  // Check 3: Parse both files
  let packageJson, lockJson;
  try {
    packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
    lockJson = JSON.parse(readFileSync(lockPath, 'utf8'));
  } catch (error) {
    log(COLORS.RED, '❌', `Failed to parse JSON files: ${error.message}`);
    return process.exit(1);
  }

  // Check 4: LibSQL specific check (our recent issue)
  const libsqlDeps = Object.entries({
    ...packageJson.dependencies || {},
    ...packageJson.devDependencies || {},
    ...packageJson.optionalDependencies || {}
  }).filter(([name]) => name.includes('@libsql/'));

  if (libsqlDeps.length > 0) {
    log(COLORS.BLUE, '🔍', `Checking ${libsqlDeps.length} @libsql dependencies...`);

    for (const [name, specifiedVersion] of libsqlDeps) {
      const lockPackage = lockJson.packages?.[`node_modules/${name}`];

      if (!lockPackage) {
        log(COLORS.RED, '❌', `${name}@${specifiedVersion} not found in package-lock.json`);
        hasErrors = true;
        continue;
      }

      // Extract version from spec (handles ^, ~, exact versions)
      const cleanVersion = specifiedVersion.replace(/^[\^~]/, '');
      const lockVersion = lockPackage.version;

      // For @libsql, versions must match exactly (no ^ or ~)
      if (name.includes('@libsql/') && specifiedVersion.includes('^')) {
        log(COLORS.YELLOW, '⚠️', `${name} uses ^ prefix - consider exact version for native modules`);
        hasWarnings = true;
      }

      if (cleanVersion !== lockVersion && !specifiedVersion.includes('^') && !specifiedVersion.includes('~')) {
        log(COLORS.RED, '❌', `Version mismatch: ${name}`);
        log(COLORS.RED, '   ', `package.json: ${specifiedVersion}`);
        log(COLORS.RED, '   ', `package-lock.json: ${lockVersion}`);
        hasErrors = true;
      }
    }
  }

  // Check 5: Verify overrides/resolutions changed but lock file not updated (CRITICAL)
  if (packageJson.overrides || packageJson.resolutions) {
    log(COLORS.BLUE, '🔍', 'Checking overrides/resolutions...');

    // If package.json modified after lock AND has overrides, this is critical drift
    if (packageStat.mtime > lockStat.mtime) {
      log(COLORS.RED, '❌', 'Overrides/resolutions exist but lock file is stale');
      log(COLORS.YELLOW, '💡', 'Overrides require lock file regeneration - run: npm install');
      hasErrors = true;
    }
  }

  // Check 6: Verify all declared dependencies exist in lock file
  if (!hasErrors) {
    log(COLORS.BLUE, '🔍', 'Verifying all dependencies exist in lock file...');

    const allDeps = {
      ...packageJson.dependencies || {},
      ...packageJson.devDependencies || {},
      ...packageJson.optionalDependencies || {}
    };

    let missingFromLock = 0;
    const resolvedPackages = lockJson.packages || {};

    for (const [name, version] of Object.entries(allDeps)) {
      // Check if package exists in lock file (handles both flat and nested structures)
      const inLock = resolvedPackages[`node_modules/${name}`] ||
                     Object.keys(resolvedPackages).some(k =>
                       k.endsWith(`/node_modules/${name}`)
                     );

      if (!inLock) {
        if (missingFromLock === 0) {
          log(COLORS.RED, '❌', 'Dependencies missing from lock file:');
        }
        log(COLORS.RED, '   ', `${name}@${version}`);
        missingFromLock++;
        hasErrors = true;
      }
    }

    if (missingFromLock > 0) {
      log(COLORS.RED, '❌', `${missingFromLock} package(s) missing from lock file`);
      log(COLORS.YELLOW, '💡', 'Run: npm install to regenerate lock file');
    } else {
      log(COLORS.GREEN, '✅', 'All declared dependencies exist in lock file');
    }
  }

  // Summary
  console.log('\n================================');
  if (hasErrors) {
    log(COLORS.RED, '❌', 'Drift detected! Fix required before commit.');
    log(COLORS.YELLOW, '💡', 'Run: npm install');
    process.exit(1);
  } else if (hasWarnings) {
    log(COLORS.YELLOW, '⚠️', 'Warnings detected but commit can proceed.');
    log(COLORS.BLUE, '💡', 'Consider running: npm install to sync timestamps');
  } else {
    log(COLORS.GREEN, '✅', 'No drift detected - packages are synchronized!');
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  checkDrift();
}

export { checkDrift };