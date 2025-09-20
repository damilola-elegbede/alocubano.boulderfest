#!/usr/bin/env node

/**
 * Dependency Management Script
 *
 * Comprehensive dependency management tool that:
 * - Implements dependency resolution and conflict detection
 * - Automates dependency updates safely
 * - Tracks deprecated packages
 * - Monitors security vulnerabilities
 * - Optimizes dependency tree
 * - Reduces dependency bloat
 * - Improves security posture
 * - Automates safe updates
 * - Generates actionable reports
 *
 * Usage:
 *   npm run manage-deps                    # Full analysis and optimization
 *   node scripts/manage-dependencies.js    # Same as above
 *   node scripts/manage-dependencies.js analyze    # Analysis only
 *   node scripts/manage-dependencies.js update     # Safe updates only
 *   node scripts/manage-dependencies.js security   # Security audit only
 *   node scripts/manage-dependencies.js report     # Generate report only
 */

import { spawn, exec } from 'child_process';
import { existsSync, readFileSync, writeFileSync, statSync } from 'fs';
import { mkdir } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

// Dependency Manager using Promise-based Singleton Pattern
class DependencyManager {
  constructor() {
    this.initialized = false;
    this.initializationPromise = null;
    this.state = {
      startTime: Date.now(),
      packageJson: null,
      packageLock: null,
      analysis: {
        dependencies: new Map(),
        devDependencies: new Map(),
        duplicates: new Map(),
        unused: [],
        outdated: new Map(),
        deprecated: [],
        vulnerabilities: [],
        heavyPackages: [],
        conflicts: []
      },
      reports: {
        security: null,
        optimization: null,
        update: null,
        summary: null
      },
      config: {
        safeUpdateTypes: ['patch', 'minor'],
        excludeFromUpdates: ['@playwright/test', 'playwright'], // Keep stable versions
        heavyPackageThreshold: 50 * 1024 * 1024, // 50MB
        maxVulnerabilitySeverity: 'moderate'
      }
    };
  }

  async ensureInitialized() {
    if (this.initialized && this.state.packageJson) {
      return this.state;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._performInitialization();

    try {
      const result = await this.initializationPromise;
      this.initialized = true;
      return result;
    } catch (error) {
      this.initializationPromise = null;
      throw error;
    }
  }

  async _performInitialization() {
    console.log('🚀 Initializing Dependency Manager...');

    await this._initializeDirectories();
    await this._loadPackageFiles();

    console.log('✅ Dependency Manager initialized');
    return this.state;
  }

  async _initializeDirectories() {
    const directories = [
      '.tmp/dependency-analysis',
      '.tmp/dependency-reports',
      '.tmp/dependency-backups'
    ];

    for (const dir of directories) {
      const fullPath = resolve(projectRoot, dir);
      try {
        await mkdir(fullPath, { recursive: true });
      } catch (error) {
        if (error.code !== 'EEXIST') {
          console.warn(`Warning: Could not create directory ${dir}`);
        }
      }
    }
  }

  async _loadPackageFiles() {
    const packageJsonPath = resolve(projectRoot, 'package.json');
    const packageLockPath = resolve(projectRoot, 'package-lock.json');

    if (!existsSync(packageJsonPath)) {
      throw new Error('package.json not found');
    }

    this.state.packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

    if (existsSync(packageLockPath)) {
      this.state.packageLock = JSON.parse(readFileSync(packageLockPath, 'utf8'));
    } else {
      console.warn('⚠️ package-lock.json not found - some analyses may be limited');
    }
  }

  async analyzeDependencies() {
    console.log('\n🔍 Analyzing dependency structure...');

    await this.ensureInitialized();
    const startTime = Date.now();

    try {
      await Promise.all([
        this._analyzeDependencyStructure(),
        this._findDuplicates(),
        this._checkUnusedDependencies(),
        this._checkOutdatedPackages(),
        this._checkDeprecatedPackages(),
        this._analyzeHeavyPackages(),
        this._detectConflicts()
      ]);

      const analysisTime = Date.now() - startTime;
      console.log(`✅ Dependency analysis completed in ${analysisTime}ms`);

      return this.state.analysis;

    } catch (error) {
      console.error('❌ Dependency analysis failed:', error.message);
      throw error;
    }
  }

  async _analyzeDependencyStructure() {
    console.log('  📊 Analyzing dependency structure...');

    const deps = this.state.packageJson.dependencies || {};
    const devDeps = this.state.packageJson.devDependencies || {};

    // Categorize dependencies
    Object.entries(deps).forEach(([name, version]) => {
      this.state.analysis.dependencies.set(name, {
        version,
        type: 'production',
        category: this._categorizeDependency(name),
        size: null // Will be populated if available
      });
    });

    Object.entries(devDeps).forEach(([name, version]) => {
      this.state.analysis.devDependencies.set(name, {
        version,
        type: 'development',
        category: this._categorizeDependency(name),
        size: null
      });
    });

    console.log(`    Production dependencies: ${this.state.analysis.dependencies.size}`);
    console.log(`    Development dependencies: ${this.state.analysis.devDependencies.size}`);
  }

  _categorizeDependency(name) {
    const categories = {
      'database': ['sqlite', 'sqlite3', '@libsql/client', 'ioredis', 'redis'],
      'testing': ['vitest', '@playwright/test', 'playwright', 'lighthouse', '@vitest/coverage-v8'],
      'security': ['bcryptjs', 'jsonwebtoken', 'helmet', 'speakeasy'],
      'api': ['stripe', '@stripe/stripe-js', 'googleapis', 'google-auth-library'],
      'utilities': ['uuid', 'qrcode', 'sharp', 'node-fetch'],
      'build': ['vercel', 'eslint', 'htmlhint', 'nodemon'],
      'email': ['@sentry/node'],
      'ui': ['html5-qrcode']
    };

    for (const [category, packages] of Object.entries(categories)) {
      if (packages.some(pkg => name.includes(pkg) || pkg.includes(name))) {
        return category;
      }
    }

    return 'other';
  }

  async _findDuplicates() {
    console.log('  🔍 Checking for duplicate packages...');

    if (!this.state.packageLock) {
      console.log('    ⚠️ Skipped - package-lock.json not available');
      return;
    }

    const packageVersions = new Map();

    // Recursively analyze package-lock structure
    const analyzePackages = (packages, path = '') => {
      if (!packages) return;

      Object.entries(packages).forEach(([name, info]) => {
        if (name === '' || name.startsWith('.')) return; // Skip root and relative paths

        const version = info.version;
        if (!version) return;

        if (!packageVersions.has(name)) {
          packageVersions.set(name, new Set());
        }
        packageVersions.get(name).add(version);

        // Recurse into dependencies
        if (info.dependencies) {
          analyzePackages(info.dependencies, `${path}/${name}`);
        }
      });
    };

    analyzePackages(this.state.packageLock.packages);

    // Find duplicates (packages with multiple versions)
    let duplicateCount = 0;
    packageVersions.forEach((versions, name) => {
      if (versions.size > 1) {
        this.state.analysis.duplicates.set(name, Array.from(versions));
        duplicateCount++;
      }
    });

    if (duplicateCount > 0) {
      console.log(`    ⚠️ Found ${duplicateCount} packages with multiple versions`);
    } else {
      console.log('    ✅ No duplicate packages found');
    }
  }

  async _checkUnusedDependencies() {
    console.log('  🔍 Checking for unused dependencies...');

    try {
      const { stdout } = await execAsync('npx depcheck --json', {
        cwd: projectRoot,
        timeout: 60000
      });

      const depcheckResult = JSON.parse(stdout);

      if (depcheckResult.dependencies && depcheckResult.dependencies.length > 0) {
        this.state.analysis.unused = depcheckResult.dependencies;
        console.log(`    ⚠️ Found ${depcheckResult.dependencies.length} unused dependencies`);
        depcheckResult.dependencies.forEach(dep => {
          console.log(`      - ${dep}`);
        });
      } else {
        console.log('    ✅ No unused dependencies found');
      }

    } catch (error) {
      console.log('    ⚠️ Skipped - depcheck not available or failed');
    }
  }

  async _checkOutdatedPackages() {
    console.log('  📅 Checking for outdated packages...');

    try {
      const { stdout } = await execAsync('npm outdated --json', {
        cwd: projectRoot,
        timeout: 60000
      });

      if (stdout.trim()) {
        const outdatedData = JSON.parse(stdout);

        Object.entries(outdatedData).forEach(([name, info]) => {
          this.state.analysis.outdated.set(name, {
            current: info.current,
            wanted: info.wanted,
            latest: info.latest,
            updateType: this._getUpdateType(info.current, info.latest)
          });
        });

        console.log(`    📦 Found ${this.state.analysis.outdated.size} outdated packages`);
      } else {
        console.log('    ✅ All packages are up to date');
      }

    } catch (error) {
      // npm outdated returns exit code 1 when outdated packages exist
      if (error.stdout && error.stdout.trim()) {
        try {
          const outdatedData = JSON.parse(error.stdout);
          Object.entries(outdatedData).forEach(([name, info]) => {
            this.state.analysis.outdated.set(name, {
              current: info.current,
              wanted: info.wanted,
              latest: info.latest,
              updateType: this._getUpdateType(info.current, info.latest)
            });
          });
          console.log(`    📦 Found ${this.state.analysis.outdated.size} outdated packages`);
        } catch (parseError) {
          console.log('    ⚠️ Could not parse outdated package information');
        }
      } else {
        console.log('    ⚠️ Could not check outdated packages');
      }
    }
  }

  _getUpdateType(current, latest) {
    if (!current || !latest) return 'unknown';

    const currentParts = current.replace(/[^0-9.]/g, '').split('.');
    const latestParts = latest.replace(/[^0-9.]/g, '').split('.');

    if (currentParts[0] !== latestParts[0]) return 'major';
    if (currentParts[1] !== latestParts[1]) return 'minor';
    return 'patch';
  }

  async _checkDeprecatedPackages() {
    console.log('  ⚠️ Checking for deprecated packages...');

    try {
      const { stdout } = await execAsync('npm ls --json', {
        cwd: projectRoot,
        timeout: 60000
      });

      const lsResult = JSON.parse(stdout);

      const findDeprecated = (dependencies, path = '') => {
        if (!dependencies) return;

        Object.entries(dependencies).forEach(([name, info]) => {
          if (info.deprecated) {
            this.state.analysis.deprecated.push({
              name,
              version: info.version,
              deprecationMessage: info.deprecated,
              path: path ? `${path} > ${name}` : name
            });
          }

          if (info.dependencies) {
            findDeprecated(info.dependencies, path ? `${path} > ${name}` : name);
          }
        });
      };

      findDeprecated(lsResult.dependencies);

      if (this.state.analysis.deprecated.length > 0) {
        console.log(`    ⚠️ Found ${this.state.analysis.deprecated.length} deprecated packages`);
      } else {
        console.log('    ✅ No deprecated packages found');
      }

    } catch (error) {
      console.log('    ⚠️ Could not check for deprecated packages');
    }
  }

  async _analyzeHeavyPackages() {
    console.log('  📦 Analyzing package sizes...');

    const knownHeavyPackages = [
      'playwright', '@playwright/test', 'lighthouse', 'sharp',
      'sqlite3', 'googleapis', '@babel/core', 'vercel',
      'puppeteer', 'chromium', 'firefox'
    ];

    const allDeps = new Map([
      ...this.state.analysis.dependencies,
      ...this.state.analysis.devDependencies
    ]);

    knownHeavyPackages.forEach(pkg => {
      if (allDeps.has(pkg)) {
        this.state.analysis.heavyPackages.push({
          name: pkg,
          category: allDeps.get(pkg).category,
          estimatedSize: this._estimatePackageSize(pkg)
        });
      }
    });

    if (this.state.analysis.heavyPackages.length > 0) {
      console.log(`    📦 Identified ${this.state.analysis.heavyPackages.length} heavy packages`);
    } else {
      console.log('    ✅ No heavy packages detected');
    }
  }

  _estimatePackageSize(packageName) {
    const sizeEstimates = {
      'playwright': '500MB+',
      '@playwright/test': '500MB+',
      'lighthouse': '100MB+',
      'sharp': '50MB+',
      'sqlite3': '20MB+',
      'googleapis': '30MB+',
      '@babel/core': '40MB+',
      'vercel': '100MB+',
      'puppeteer': '300MB+',
      'chromium': '200MB+',
      'firefox': '200MB+'
    };

    return sizeEstimates[packageName] || 'Unknown';
  }

  async _detectConflicts() {
    console.log('  ⚠️ Detecting potential conflicts...');

    const conflicts = [];

    // Check for multiple Redis clients
    const redisClients = ['ioredis', 'redis'];
    const installedRedisClients = redisClients.filter(client =>
      this.state.analysis.dependencies.has(client) ||
      this.state.analysis.devDependencies.has(client)
    );

    if (installedRedisClients.length > 1) {
      conflicts.push({
        type: 'multiple_implementations',
        packages: installedRedisClients,
        description: 'Multiple Redis client implementations detected',
        recommendation: 'Consider using only one Redis client (ioredis is recommended)'
      });
    }

    // Check for SQLite conflicts
    const sqlitePackages = ['sqlite', 'sqlite3'];
    const installedSqlitePackages = sqlitePackages.filter(pkg =>
      this.state.analysis.dependencies.has(pkg) ||
      this.state.analysis.devDependencies.has(pkg)
    );

    if (installedSqlitePackages.length > 1) {
      conflicts.push({
        type: 'multiple_implementations',
        packages: installedSqlitePackages,
        description: 'Multiple SQLite implementations detected',
        recommendation: 'Consider standardizing on sqlite3 for consistency'
      });
    }

    this.state.analysis.conflicts = conflicts;

    if (conflicts.length > 0) {
      console.log(`    ⚠️ Found ${conflicts.length} potential conflicts`);
    } else {
      console.log('    ✅ No conflicts detected');
    }
  }

  async optimizeDependencies() {
    console.log('\n🔧 Optimizing dependencies...');

    await this.ensureInitialized();
    const startTime = Date.now();

    try {
      await this._createBackup();
      await this._runDedupe();
      await this._cleanCache();
      await this._regenerateLockFile();

      const optimizationTime = Date.now() - startTime;
      console.log(`✅ Dependency optimization completed in ${optimizationTime}ms`);

    } catch (error) {
      console.error('❌ Dependency optimization failed:', error.message);
      await this._restoreBackup();
      throw error;
    }
  }

  async _createBackup() {
    console.log('  💾 Creating backup...');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = resolve(projectRoot, '.tmp/dependency-backups', timestamp);

    try {
      await mkdir(backupDir, { recursive: true });

      const filesToBackup = ['package.json', 'package-lock.json'];

      for (const file of filesToBackup) {
        const sourcePath = resolve(projectRoot, file);
        const backupPath = resolve(backupDir, file);

        if (existsSync(sourcePath)) {
          const content = readFileSync(sourcePath, 'utf8');
          writeFileSync(backupPath, content);
        }
      }

      this.state.backupDir = backupDir;
      console.log(`    ✅ Backup created: ${backupDir}`);

    } catch (error) {
      console.warn('    ⚠️ Could not create backup');
      throw error;
    }
  }

  async _restoreBackup() {
    if (!this.state.backupDir) return;

    console.log('  🔄 Restoring from backup...');

    try {
      const filesToRestore = ['package.json', 'package-lock.json'];

      for (const file of filesToRestore) {
        const backupPath = resolve(this.state.backupDir, file);
        const targetPath = resolve(projectRoot, file);

        if (existsSync(backupPath)) {
          const content = readFileSync(backupPath, 'utf8');
          writeFileSync(targetPath, content);
        }
      }

      console.log('    ✅ Backup restored successfully');

    } catch (error) {
      console.error('    ❌ Could not restore backup:', error.message);
    }
  }

  async _runDedupe() {
    console.log('  🔧 Running npm dedupe...');

    try {
      await execAsync('npm dedupe', {
        cwd: projectRoot,
        timeout: 120000
      });
      console.log('    ✅ Dependency tree optimized');

    } catch (error) {
      console.warn('    ⚠️ npm dedupe failed:', error.message);
    }
  }

  async _cleanCache() {
    console.log('  🧹 Cleaning npm cache...');

    try {
      await execAsync('npm cache clean --force', {
        cwd: projectRoot,
        timeout: 60000
      });

      await execAsync('npm cache verify', {
        cwd: projectRoot,
        timeout: 60000
      });

      console.log('    ✅ Cache cleaned and verified');

    } catch (error) {
      console.warn('    ⚠️ Cache cleaning failed:', error.message);
    }
  }

  async _regenerateLockFile() {
    console.log('  🔄 Regenerating lock file...');

    try {
      // Remove existing lock file
      const lockPath = resolve(projectRoot, 'package-lock.json');
      if (existsSync(lockPath)) {
        await execAsync('rm package-lock.json', { cwd: projectRoot });
      }

      // Regenerate with npm install
      await execAsync('npm install', {
        cwd: projectRoot,
        timeout: 300000
      });

      console.log('    ✅ Lock file regenerated');

    } catch (error) {
      console.warn('    ⚠️ Lock file regeneration failed:', error.message);
      throw error;
    }
  }

  async performSecurityAudit() {
    console.log('\n🔒 Performing security audit...');

    await this.ensureInitialized();
    const startTime = Date.now();

    try {
      const auditResults = await this._runSecurityAudit();
      const recommendations = await this._generateSecurityRecommendations(auditResults);

      this.state.reports.security = {
        timestamp: new Date().toISOString(),
        results: auditResults,
        recommendations,
        executionTime: Date.now() - startTime
      };

      console.log('✅ Security audit completed');
      return this.state.reports.security;

    } catch (error) {
      console.error('❌ Security audit failed:', error.message);
      throw error;
    }
  }

  async _runSecurityAudit() {
    console.log('  🔍 Running npm audit...');

    try {
      const { stdout } = await execAsync('npm audit --json', {
        cwd: projectRoot,
        timeout: 120000
      });

      const auditResult = JSON.parse(stdout);

      if (auditResult.vulnerabilities) {
        const vulnCount = Object.keys(auditResult.vulnerabilities).length;
        console.log(`    🔍 Found ${vulnCount} vulnerabilities`);

        // Categorize vulnerabilities by severity
        const severityCounts = {};
        Object.values(auditResult.vulnerabilities).forEach(vuln => {
          const severity = vuln.severity || 'unknown';
          severityCounts[severity] = (severityCounts[severity] || 0) + 1;
        });

        Object.entries(severityCounts).forEach(([severity, count]) => {
          console.log(`      ${severity}: ${count}`);
        });

        this.state.analysis.vulnerabilities = Object.entries(auditResult.vulnerabilities).map(([name, vuln]) => ({
          package: name,
          severity: vuln.severity,
          description: vuln.title,
          fixAvailable: vuln.fixAvailable,
          via: vuln.via
        }));
      }

      return auditResult;

    } catch (error) {
      // npm audit returns non-zero exit code when vulnerabilities exist
      if (error.stdout && error.stdout.trim()) {
        try {
          const auditResult = JSON.parse(error.stdout);
          console.log(`    🔍 Audit completed with issues`);
          return auditResult;
        } catch (parseError) {
          console.log('    ⚠️ Could not parse audit results');
          return { vulnerabilities: {} };
        }
      } else {
        console.log('    ⚠️ Security audit failed to run');
        return { vulnerabilities: {} };
      }
    }
  }

  async _generateSecurityRecommendations(auditResults) {
    const recommendations = [];

    if (auditResults.vulnerabilities) {
      const highSeverityVulns = Object.values(auditResults.vulnerabilities)
        .filter(vuln => vuln.severity === 'high' || vuln.severity === 'critical');

      if (highSeverityVulns.length > 0) {
        recommendations.push({
          priority: 'critical',
          action: 'immediate_update',
          description: `${highSeverityVulns.length} high/critical vulnerabilities require immediate attention`,
          command: 'npm audit fix'
        });
      }

      const fixableVulns = Object.values(auditResults.vulnerabilities)
        .filter(vuln => vuln.fixAvailable);

      if (fixableVulns.length > 0) {
        recommendations.push({
          priority: 'high',
          action: 'automated_fix',
          description: `${fixableVulns.length} vulnerabilities can be automatically fixed`,
          command: 'npm audit fix --force'
        });
      }
    }

    // Check for deprecated packages with known security issues
    if (this.state.analysis.deprecated.length > 0) {
      recommendations.push({
        priority: 'medium',
        action: 'replace_deprecated',
        description: 'Replace deprecated packages to avoid potential security issues',
        packages: this.state.analysis.deprecated.map(dep => dep.name)
      });
    }

    return recommendations;
  }

  async performSafeUpdates() {
    console.log('\n📈 Performing safe updates...');

    await this.ensureInitialized();
    const startTime = Date.now();

    try {
      await this._createBackup();
      const updatePlan = await this._createUpdatePlan();
      const updateResults = await this._executeUpdates(updatePlan);

      this.state.reports.update = {
        timestamp: new Date().toISOString(),
        updatePlan,
        results: updateResults,
        executionTime: Date.now() - startTime
      };

      console.log('✅ Safe updates completed');
      return this.state.reports.update;

    } catch (error) {
      console.error('❌ Safe updates failed:', error.message);
      await this._restoreBackup();
      throw error;
    }
  }

  async _createUpdatePlan() {
    console.log('  📋 Creating update plan...');

    const updatePlan = {
      patch: [],
      minor: [],
      skipped: [],
      security: []
    };

    // Analyze each outdated package
    this.state.analysis.outdated.forEach((info, packageName) => {
      const updateType = info.updateType;
      const isExcluded = this.state.config.excludeFromUpdates.includes(packageName);

      if (isExcluded) {
        updatePlan.skipped.push({
          package: packageName,
          reason: 'excluded_from_updates',
          current: info.current,
          latest: info.latest
        });
      } else if (this.state.config.safeUpdateTypes.includes(updateType)) {
        updatePlan[updateType].push({
          package: packageName,
          from: info.current,
          to: info.wanted,
          latest: info.latest
        });
      } else {
        updatePlan.skipped.push({
          package: packageName,
          reason: 'major_update_unsafe',
          current: info.current,
          latest: info.latest
        });
      }
    });

    // Add security updates (always safe)
    this.state.analysis.vulnerabilities.forEach(vuln => {
      if (vuln.fixAvailable) {
        updatePlan.security.push({
          package: vuln.package,
          severity: vuln.severity,
          fixAvailable: vuln.fixAvailable
        });
      }
    });

    const totalUpdates = updatePlan.patch.length + updatePlan.minor.length + updatePlan.security.length;
    console.log(`    📦 Planned ${totalUpdates} safe updates`);
    console.log(`      Patch: ${updatePlan.patch.length}`);
    console.log(`      Minor: ${updatePlan.minor.length}`);
    console.log(`      Security: ${updatePlan.security.length}`);
    console.log(`      Skipped: ${updatePlan.skipped.length}`);

    return updatePlan;
  }

  async _executeUpdates(updatePlan) {
    console.log('  🚀 Executing updates...');

    const results = {
      successful: [],
      failed: [],
      securityFixed: []
    };

    try {
      // Execute security fixes first
      if (updatePlan.security.length > 0) {
        console.log('    🔒 Applying security fixes...');
        await execAsync('npm audit fix', {
          cwd: projectRoot,
          timeout: 180000
        });
        results.securityFixed = updatePlan.security;
        console.log(`      ✅ Applied ${updatePlan.security.length} security fixes`);
      }

      // Execute patch updates
      for (const update of updatePlan.patch) {
        try {
          console.log(`    🔧 Updating ${update.package} to ${update.to}...`);
          await execAsync(`npm install ${update.package}@${update.to}`, {
            cwd: projectRoot,
            timeout: 120000
          });
          results.successful.push(update);
        } catch (error) {
          console.warn(`      ⚠️ Failed to update ${update.package}: ${error.message}`);
          results.failed.push({ ...update, error: error.message });
        }
      }

      // Execute minor updates
      for (const update of updatePlan.minor) {
        try {
          console.log(`    🔧 Updating ${update.package} to ${update.to}...`);
          await execAsync(`npm install ${update.package}@${update.to}`, {
            cwd: projectRoot,
            timeout: 120000
          });
          results.successful.push(update);
        } catch (error) {
          console.warn(`      ⚠️ Failed to update ${update.package}: ${error.message}`);
          results.failed.push({ ...update, error: error.message });
        }
      }

      console.log(`    ✅ Successfully updated ${results.successful.length} packages`);
      if (results.failed.length > 0) {
        console.log(`    ⚠️ Failed to update ${results.failed.length} packages`);
      }

    } catch (error) {
      console.error('    ❌ Update execution failed:', error.message);
      throw error;
    }

    return results;
  }

  async generateReport() {
    console.log('\n📊 Generating dependency report...');

    await this.ensureInitialized();

    if (!this.state.analysis.dependencies.size) {
      await this.analyzeDependencies();
    }

    const report = {
      timestamp: new Date().toISOString(),
      executionTime: Date.now() - this.state.startTime,
      summary: {
        totalDependencies: this.state.analysis.dependencies.size,
        totalDevDependencies: this.state.analysis.devDependencies.size,
        duplicates: this.state.analysis.duplicates.size,
        unused: this.state.analysis.unused.length,
        outdated: this.state.analysis.outdated.size,
        deprecated: this.state.analysis.deprecated.length,
        vulnerabilities: this.state.analysis.vulnerabilities.length,
        heavyPackages: this.state.analysis.heavyPackages.length,
        conflicts: this.state.analysis.conflicts.length
      },
      details: {
        dependencyBreakdown: this._createDependencyBreakdown(),
        security: this._createSecuritySummary(),
        optimization: this._createOptimizationSummary(),
        recommendations: this._createRecommendations()
      }
    };

    this.state.reports.summary = report;

    // Write report to file
    const reportPath = resolve(projectRoot, '.tmp/dependency-reports/dependency-report.json');
    writeFileSync(reportPath, JSON.stringify(report, null, 2));

    const readableReportPath = resolve(projectRoot, '.tmp/dependency-reports/dependency-report.txt');
    writeFileSync(readableReportPath, this._formatReadableReport(report));

    console.log(`✅ Report generated: ${reportPath}`);
    console.log(`✅ Readable report: ${readableReportPath}`);

    return report;
  }

  _createDependencyBreakdown() {
    const breakdown = {};

    const allDeps = new Map([...this.state.analysis.dependencies, ...this.state.analysis.devDependencies]);

    allDeps.forEach((info, name) => {
      const category = info.category;
      if (!breakdown[category]) {
        breakdown[category] = [];
      }
      breakdown[category].push({ name, ...info });
    });

    return breakdown;
  }

  _createSecuritySummary() {
    return {
      vulnerabilityCount: this.state.analysis.vulnerabilities.length,
      severityBreakdown: this.state.analysis.vulnerabilities.reduce((acc, vuln) => {
        acc[vuln.severity] = (acc[vuln.severity] || 0) + 1;
        return acc;
      }, {}),
      deprecatedPackages: this.state.analysis.deprecated.length,
      fixableVulnerabilities: this.state.analysis.vulnerabilities.filter(v => v.fixAvailable).length
    };
  }

  _createOptimizationSummary() {
    return {
      duplicatePackages: this.state.analysis.duplicates.size,
      unusedPackages: this.state.analysis.unused.length,
      heavyPackages: this.state.analysis.heavyPackages.length,
      outdatedPackages: this.state.analysis.outdated.size,
      potentialSavings: this._estimatePotentialSavings()
    };
  }

  _estimatePotentialSavings() {
    const savings = {
      removingUnused: this.state.analysis.unused.length * 5, // Assume 5MB average per unused package
      deduplication: this.state.analysis.duplicates.size * 2, // Assume 2MB average savings per duplicate
      cachingBenefits: 'Improved build times by 10-30%'
    };

    return savings;
  }

  _createRecommendations() {
    const recommendations = [];

    // Security recommendations
    if (this.state.analysis.vulnerabilities.length > 0) {
      recommendations.push({
        priority: 'critical',
        category: 'security',
        title: 'Address Security Vulnerabilities',
        description: `${this.state.analysis.vulnerabilities.length} vulnerabilities found`,
        action: 'Run npm audit fix or update vulnerable packages'
      });
    }

    // Unused dependencies
    if (this.state.analysis.unused.length > 0) {
      recommendations.push({
        priority: 'high',
        category: 'optimization',
        title: 'Remove Unused Dependencies',
        description: `${this.state.analysis.unused.length} unused packages detected`,
        action: `Remove packages: ${this.state.analysis.unused.slice(0, 5).join(', ')}${this.state.analysis.unused.length > 5 ? '...' : ''}`
      });
    }

    // Duplicates
    if (this.state.analysis.duplicates.size > 0) {
      recommendations.push({
        priority: 'medium',
        category: 'optimization',
        title: 'Deduplicate Dependencies',
        description: `${this.state.analysis.duplicates.size} packages have multiple versions`,
        action: 'Run npm dedupe to optimize dependency tree'
      });
    }

    // Outdated packages
    if (this.state.analysis.outdated.size > 0) {
      const safeUpdates = Array.from(this.state.analysis.outdated.values())
        .filter(info => ['patch', 'minor'].includes(info.updateType)).length;

      if (safeUpdates > 0) {
        recommendations.push({
          priority: 'medium',
          category: 'maintenance',
          title: 'Update Dependencies',
          description: `${safeUpdates} safe updates available`,
          action: 'Run safe updates to get latest patches and minor versions'
        });
      }
    }

    // Deprecated packages
    if (this.state.analysis.deprecated.length > 0) {
      recommendations.push({
        priority: 'medium',
        category: 'maintenance',
        title: 'Replace Deprecated Packages',
        description: `${this.state.analysis.deprecated.length} deprecated packages found`,
        action: 'Find and migrate to modern alternatives'
      });
    }

    // Heavy packages
    if (this.state.analysis.heavyPackages.length > 3) {
      recommendations.push({
        priority: 'low',
        category: 'performance',
        title: 'Optimize Heavy Dependencies',
        description: `${this.state.analysis.heavyPackages.length} heavy packages detected`,
        action: 'Consider lazy loading or alternatives for heavy packages'
      });
    }

    return recommendations;
  }

  _formatReadableReport(report) {
    return `
DEPENDENCY MANAGEMENT REPORT
Generated: ${report.timestamp}
Execution Time: ${report.executionTime}ms

SUMMARY
=======
Total Dependencies: ${report.summary.totalDependencies}
Development Dependencies: ${report.summary.totalDevDependencies}
Duplicate Packages: ${report.summary.duplicates}
Unused Dependencies: ${report.summary.unused}
Outdated Packages: ${report.summary.outdated}
Deprecated Packages: ${report.summary.deprecated}
Security Vulnerabilities: ${report.summary.vulnerabilities}
Heavy Packages: ${report.summary.heavyPackages}
Potential Conflicts: ${report.summary.conflicts}

RECOMMENDATIONS
===============
${report.details.recommendations.map((rec, i) =>
  `${i + 1}. [${rec.priority.toUpperCase()}] ${rec.title}
     ${rec.description}
     Action: ${rec.action}`
).join('\n\n')}

SECURITY SUMMARY
================
Vulnerabilities: ${report.details.security.vulnerabilityCount}
Fixable: ${report.details.security.fixableVulnerabilities}
Deprecated: ${report.details.security.deprecatedPackages}

OPTIMIZATION POTENTIAL
======================
Unused packages to remove: ${report.details.optimization.unusedPackages}
Duplicate versions to dedupe: ${report.details.optimization.duplicatePackages}
Heavy packages to optimize: ${report.details.optimization.heavyPackages}
Outdated packages to update: ${report.details.optimization.outdatedPackages}

Run 'npm run manage-deps help' for available commands.
`.trim();
  }
}

// CLI execution
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'full';

  try {
    const manager = new DependencyManager();

    switch (command) {
      case 'full':
      case 'manage':
        console.log('🚀 Running full dependency management...\n');
        await manager.analyzeDependencies();
        await manager.performSecurityAudit();
        const report = await manager.generateReport();

        console.log('\n📋 SUMMARY:');
        console.log(`  Dependencies: ${report.summary.totalDependencies} prod + ${report.summary.totalDevDependencies} dev`);
        console.log(`  Issues: ${report.summary.vulnerabilities} vulnerabilities, ${report.summary.unused} unused, ${report.summary.outdated} outdated`);
        console.log(`  Optimization: ${report.summary.duplicates} duplicates, ${report.summary.heavyPackages} heavy packages`);

        if (report.details.recommendations.length > 0) {
          console.log('\n💡 TOP RECOMMENDATIONS:');
          report.details.recommendations.slice(0, 3).forEach((rec, i) => {
            console.log(`  ${i + 1}. [${rec.priority.toUpperCase()}] ${rec.title}`);
            console.log(`     ${rec.action}`);
          });
        }
        break;

      case 'analyze':
        await manager.analyzeDependencies();
        console.log('\n✅ Dependency analysis completed');
        break;

      case 'security':
        await manager.performSecurityAudit();
        console.log('\n✅ Security audit completed');
        break;

      case 'update':
        await manager.performSafeUpdates();
        console.log('\n✅ Safe updates completed');
        break;

      case 'optimize':
        await manager.optimizeDependencies();
        console.log('\n✅ Dependency optimization completed');
        break;

      case 'report':
        await manager.generateReport();
        console.log('\n✅ Report generated');
        break;

      case 'help':
      case '--help':
      case '-h':
        console.log(`
Dependency Management Script

Usage:
  npm run manage-deps [command]
  node scripts/manage-dependencies.js [command]

Commands:
  full        (default) Complete analysis, security audit, and reporting
  analyze     Analyze dependency structure only
  security    Perform security audit only
  update      Perform safe updates only
  optimize    Optimize dependency tree (dedupe, cache clean)
  report      Generate detailed report only
  help        Show this help message

Examples:
  npm run manage-deps                    # Full analysis and report
  node scripts/manage-dependencies.js security    # Security audit only
  node scripts/manage-dependencies.js update      # Safe updates only

Reports are saved to:
  .tmp/dependency-reports/dependency-report.json
  .tmp/dependency-reports/dependency-report.txt

This script helps:
  ✅ Reduce dependency bloat
  ✅ Improve security posture
  ✅ Automate safe updates
  ✅ Generate actionable reports
  ✅ Detect conflicts and duplicates
  ✅ Identify unused dependencies
  ✅ Monitor deprecated packages
        `);
        break;

      default:
        console.error(`❌ Unknown command: ${command}`);
        console.log('Use "help" for available commands');
        process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Dependency management failed:', error.message);
    if (error.stack && process.env.DEBUG) {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default DependencyManager;